var TMDB_API_KEY = "6dc830f9624b43261325bed3bf7d0dfa";
var MEGAPLAY_BASE = "https://megaplay.buzz";
var KITSU_BASE = "https://kitsu.io/api/edge";
var JIKAN_BASE = "https://api.jikan.moe/v4";

var ANIZIP_BASE = "https://api.ani.zip";

var ANIKOTO_API = "https://anikotoapi.site";
var MIRURO_ORIGINS = [
  "https://www.miruro.ru",
  "https://www.miruro.to",
  "https://www.miruro.bz",
  "https://www.miruro.tv"
];
var PIPE_PATH = "/api/secure/pipe";

var PIPE_OBF_KEY = [0x71, 0x95, 0x10, 0x34, 0xf8, 0xfb, 0xcf, 0x53,
                    0xd8, 0x9d, 0xb5, 0x2c, 0xeb, 0x3d, 0xc2, 0x2c];

var COMMON_UA = "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0 Mobile Safari/537.36";
var PIPE_HEADERS = {
  "User-Agent": COMMON_UA,
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="137", "Not?A_Brand";v="24"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "Referer": "https://www.miruro.to/",
  "Origin": "https://www.miruro.to"
};

function settings() {
  return typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS
    ? globalThis.SCRAPER_SETTINGS
    : (typeof global !== "undefined" && global.SCRAPER_SETTINGS ? global.SCRAPER_SETTINGS : {});
}

var CACHE_TTL = 10 * 60 * 1000;
var _G = typeof globalThis !== "undefined" ? globalThis : typeof global !== "undefined" ? global : this;
var _muState = _G.__MIRURO_STATE__ || (_G.__MIRURO_STATE__ = { cache: {}, inflight: {} });

function cacheKey(tmdbId, mediaType, season, episode) {
  return (mediaType === "tv" || mediaType === "series" ? "tv" : "movie") + ":" + tmdbId + ":" + (season || 1) + ":" + (episode || 1);
}

function hasTimers() { return typeof setTimeout === "function"; }

var _mapLastReq = 0;
function mapGap() {
  return new Promise(function (resolve) {
    var now = Date.now();
    var wait = _mapLastReq + 450 - now;
    if (wait < 0) wait = 0;
    _mapLastReq = now + wait;
    if (!hasTimers() || !wait) resolve(null);
    else setTimeout(resolve, wait);
  });
}

var MAP_CACHE_TTL = 6 * 60 * 60 * 1000;
var _mapCache = _muState.mapCache || (_muState.mapCache = {});

function fetchText(url, headers, timeoutMs) {
  var opts = { method: "GET", redirect: "follow", headers: headers || {} };
  function fail(res) {
    return res.text().then(function () { throw new Error("HTTP " + res.status); });
  }
  if (!hasTimers()) return fetch(url, opts).then(function (res) {
    if (!res.ok) return fail(res);
    return res.text();
  });
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error("fetch timeout")); }, timeoutMs || 12000);
    fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) fail(res).then(function (e) { reject(e); }, function (e) { reject(e); });
      else res.text().then(function (t) { resolve(t); }, function (e) { reject(e); });
    }).catch(function (e) { clearTimeout(timer); reject(e); });
  });
}

function fetchJson(url, headers, timeoutMs) {
  return fetchText(url, headers, timeoutMs).then(function (t) {
    try { return JSON.parse(t); } catch (e) { return null; }
  });
}

function b64urlEncode(str) {

  var s = String(str);
  var bytes = [], i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      var c2 = s.charCodeAt(++i);
      var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var out = [], n, j;
  for (j = 0; j < bytes.length; j += 3) {
    n = (bytes[j] << 16) + ((bytes[j + 1] || 0) << 8) + (bytes[j + 2] || 0);
    out.push(chars.charAt((n >> 18) & 63), chars.charAt((n >> 12) & 63));
    out.push(j + 1 < bytes.length ? chars.charAt((n >> 6) & 63) : "");
    out.push(j + 2 < bytes.length ? chars.charAt(n & 63) : "");
  }

  return out.join("");
}

function b64urlDecodeBytes(str) {
  var norm = String(str).replace(/-/g, "+").replace(/_/g, "/");
  norm += "=";
  var table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var bytes = [], buf = 0, bits = 0, i, c;
  for (i = 0; i < norm.length; i++) {
    c = table.indexOf(norm.charAt(i));
    if (c === -1) continue;
    buf = (buf << 6) | c;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  return bytes;
}

function bytesToUtf8(bytes) {
  var out = "", i = 0;
  while (i < bytes.length) {
    var b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
    else if (b < 0xe0) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
    else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      var cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      i += 4;
    }
  }
  return out;
}

function inflateGzip(bytes) {
  var pos = 0;
  function u8() { return bytes[pos++]; }
  function u16() { var v = bytes[pos] | (bytes[pos + 1] << 8); pos += 2; return v; }
  function u32() { var v = (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0; pos += 4; return v; }

  if (u8() !== 0x1f || u8() !== 0x8b) throw new Error("not gzip");
  var cm = u8();
  if (cm !== 8) throw new Error("bad method " + cm);
  var flg = u8();
  pos += 6;
  if (flg & 4) { var xlen = u16(); pos += xlen; }
  if (flg & 8) { while (u8() !== 0) {} }
  if (flg & 16) { while (u8() !== 0) {} }
  if (flg & 2) { pos += 2; }

  var out = [];
  var bitbuf = 0, bitcnt = 0;
  function bits(n) {
    while (bitcnt < n) { bitbuf |= bytes[pos++] << bitcnt; bitcnt += 8; }
    var v = bitbuf & ((1 << n) - 1);
    bitbuf >>= n; bitcnt -= n;
    return v;
  }
  function buildTree(lengths) {
    var counts = [], i;
    for (i = 0; i <= 15; i++) counts[i] = 0;
    for (i = 0; i < lengths.length; i++) counts[lengths[i]]++;

    var offs = [];
    offs[1] = 0;
    for (i = 1; i <= 14; i++) offs[i + 1] = offs[i] + counts[i];
    var symbols = [];
    for (i = 0; i < lengths.length; i++) {
      if (lengths[i]) symbols[offs[lengths[i]]++] = i;
    }
    return { counts: counts, symbols: symbols };
  }
  function decodeSym(tree) {
    var code = 0, first = 0, index = 0, len;
    for (len = 1; len <= 15; len++) {
      code |= bits(1);
      var count = tree.counts[len];
      if (code - first < count) return tree.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error("bad code");
  }
  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  function fixedTrees() {
    var lengths = [], i;
    for (i = 0; i < 144; i++) lengths[i] = 8;
    for (i = 144; i < 256; i++) lengths[i] = 9;
    for (i = 256; i < 280; i++) lengths[i] = 7;
    for (i = 280; i < 288; i++) lengths[i] = 8;
    var lit = buildTree(lengths);
    var distLengths = [];
    for (i = 0; i < 30; i++) distLengths[i] = 5;
    return { lit: lit, dist: buildTree(distLengths) };
  }
  var FIXED = null;
  for (;;) {
    var bfinal = bits(1), btype = bits(2), lit, dist;
    if (btype === 0) {
      bitbuf = 0; bitcnt = 0;
      var len = u16(), nlen = u16();
      for (var k = 0; k < len; k++) out.push(bytes[pos++]);
    } else if (btype === 1) {
      if (!FIXED) FIXED = fixedTrees();
      lit = FIXED.lit; dist = FIXED.dist;
      inflateBlock(lit, dist);
    } else if (btype === 2) {
      var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      var order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
      var cl = [];
      for (var ci = 0; ci < hclen; ci++) cl[order[ci]] = bits(3);
      for (var cj = 0; cj < 19; cj++) if (cl[cj] === undefined) cl[cj] = 0;
      var clTree = buildTree(cl);
      var lens = [];
      while (lens.length < hlit + hdist) {
        var sym = decodeSym(clTree);
        if (sym < 16) lens.push(sym);
        else if (sym === 16) {
          var prev = lens[lens.length - 1], rep = 3 + bits(2);
          while (rep--) lens.push(prev);
        } else if (sym === 17) { var z = 3 + bits(3); while (z--) lens.push(0); }
        else { var z8 = 11 + bits(7); while (z8--) lens.push(0); }
      }
      lit = buildTree(lens.slice(0, hlit));
      dist = buildTree(lens.slice(hlit));
      inflateBlock(lit, dist);
    } else {
      throw new Error("bad block type");
    }
    if (bfinal) break;
  }
  function inflateBlock(lit, dist) {
    for (;;) {
      var sym = decodeSym(lit);
      if (sym < 256) out.push(sym);
      else if (sym === 256) return;
      else {
        var li = sym - 257;
        var length = LEN_BASE[li] + (LEN_EXTRA[li] ? bits(LEN_EXTRA[li]) : 0);
        var di = decodeSym(dist);
        var d = DIST_BASE[di] + (DIST_EXTRA[di] ? bits(DIST_EXTRA[di]) : 0);
        var start = out.length - d;
        for (var q = 0; q < length; q++) out.push(out[start + q]);
      }
    }
  }
  return out;
}

function pipeDecode(encodedStr, obfHeader) {
  if (!obfHeader) return JSON.parse(encodedStr);
  var bytes = b64urlDecodeBytes(encodedStr);
  if (String(obfHeader) === "2") {
    for (var i = 0; i < bytes.length; i++) bytes[i] = bytes[i] ^ PIPE_OBF_KEY[i % PIPE_OBF_KEY.length];
  }
  var out = inflateGzip(bytes);
  return JSON.parse(bytesToUtf8(out));
}

function pipeRequest(path, query) {

  try {
    return pipeRequestInner(path, query);
  } catch (e) {
    console.log("[Miruro] pipe setup failed: " + (e && e.message ? e.message : e));
    return Promise.reject(e);
  }
}

var _pipeState = _muState.pipe || (_muState.pipe = { downUntil: 0 });
var PIPE_BREAK_MS = 15 * 60 * 1000;

function pipeRequestInner(path, query) {
  var payload = { path: path, method: "GET", query: query, body: null };
  var enc = b64urlEncode(JSON.stringify(payload));
  var idx = 0;
  function attempt() {

    if (Date.now() < _pipeState.downUntil) {
      return Promise.reject(new Error("pipe: circuit open (benched after 403)"));
    }
    if (idx >= MIRURO_ORIGINS.length) return Promise.reject(new Error("pipe: all mirrors failed"));
    var origin = MIRURO_ORIGINS[idx++];

    return fetchText(origin + PIPE_PATH + "?e=" + enc, PIPE_HEADERS, 6000).then(function (body) {

      return pipeDecode(body, "2");
    }).catch(function (err) {
      var msg = String((err && err.message) || err);
      console.log("[Miruro] pipe " + origin + " failed: " + msg);
      if (/HTTP 403/.test(msg)) {
        _pipeState.downUntil = Date.now() + PIPE_BREAK_MS;
        console.log("[Miruro] pipe benched for 15min (403 block)");
        return Promise.reject(new Error("pipe: benched (403)"));
      }
      return attempt();
    });
  }
  return attempt();
}

function pipeTranslateId(encodedId) {
  try {
    var decoded = bytesToUtf8(b64urlDecodeBytes(encodedId));
    if (decoded.indexOf(":") !== -1) return decoded;
    return encodedId;
  } catch (e) { return encodedId; }
}

function normalizeEpisodes(provData) {
  var eps = provData && provData.episodes;
  if (!eps) return {};
  if (Array.isArray(eps)) return { sub: eps, dub: [] };
  return {
    sub: Array.isArray(eps.sub) ? eps.sub : [],
    dub: Array.isArray(eps.dub) ? eps.dub : []
  };
}

function pipeLanes(anilistId, epNumber, makeRow, sink) {
  return pipeRequest("episodes", { anilistId: anilistId }).then(function (data) {
    var providers = (data && data.providers) || {};
    var names = Object.keys(providers);
    if (!names.length) return [];
    var plan = [];
    names.forEach(function (pn) {
      var cats = normalizeEpisodes(providers[pn]);
      ["sub", "dub"].forEach(function (cat) {
        var list = cats[cat] || [];
        for (var i = 0; i < list.length; i++) {
          var ep = list[i];
          if (ep && ep.id && Number(ep.number) === Number(epNumber)) {
            plan.push({ provider: pn, category: cat, ep: ep });
            break;
          }
        }
      });
    });
    if (!plan.length) return [];
    console.log("[Miruro] pipe: " + plan.length + " provider match(es) for ep " + epNumber);
    var out = [];
    var chain = Promise.resolve();
    plan.slice(0, 6).forEach(function (p) {
      chain = chain.then(function () {
        var realId = pipeTranslateId(p.ep.id);
        return pipeRequest("sources", {
          episodeId: b64urlEncode(realId),
          provider: p.provider,
          category: p.category,
          anilistId: anilistId
        }).then(function (src) {
          var streams = (src && src.streams) || [];
          streams.forEach(function (st) {
            if (!st || !st.url || !/^https?:\/\//i.test(String(st.url))) return;
            out.push(makeRow(String(st.url), st.quality || st.label || "", p.provider, p.category));
          });

          var subs = (src && (src.subtitles || src.captions)) || [];
          var picked = subs.filter(function (sb) {
            var l = String((sb && (sb.label || sb.language || sb.lang)) || "");
            return /^https?:/i.test(String(sb && sb.url || sb && sb.file || "")) &&
              /(english|filipino|tagalog)/i.test(l);
          }).slice(0, 8).map(function (sb) {
            var l = String(sb.label || sb.language || sb.lang || "");
            var isTl = /filipino|tagalog/i.test(l);
            return {
              url: String(sb.url || sb.file),
              language: isTl ? "tl" : "en",
              name: isTl ? "Tagalog / Filipino" : l
            };
          });
          if (picked.length) out.forEach(function (r) { if (!r.subtitles) r.subtitles = picked; });
          if (sink && out.length) out.forEach(sink);
        }).catch(function () {});
      });
    });
    return chain.then(function () { return out; });
  }).catch(function () { return []; });
}

var _mpLastReq = 0;
function mpGap() {
  return new Promise(function (resolve) {
    var now = Date.now();
    var wait = _mpLastReq + 600 - now;
    if (wait < 0) wait = 0;
    _mpLastReq = now + wait;
    if (!hasTimers() || !wait) resolve(null);
    else setTimeout(resolve, wait);
  });
}

var MP_FILE_CACHE_TTL = 30 * 60 * 1000;
var _mpFileCache = _muState.mpFiles || (_muState.mpFiles = {});

function mpFileId(malId, anilistId, epNumber, lang) {
  var cacheKey = (malId || "a" + anilistId) + ":" + epNumber + ":" + lang;
  var hit = _mpFileCache[cacheKey];
  if (hit && Date.now() - hit.ts < MP_FILE_CACHE_TTL) {
    return Promise.resolve(hit.id);
  }
  var routes = [];
  if (malId) routes.push("mal/" + encodeURIComponent(malId));
  if (anilistId) routes.push("ani/" + encodeURIComponent(anilistId));
  var idx = 0;
  function attempt() {
    if (idx >= routes.length) return Promise.resolve(null);
    var path = routes[idx++] + "/" + encodeURIComponent(epNumber) + "/" + lang;
    return mpGap().then(function () {
      return fetchText(MEGAPLAY_BASE + "/stream/" + path, {
        "User-Agent": COMMON_UA,
        "Accept": "text/html,*/*",
        "Referer": MEGAPLAY_BASE + "/"
      }, 6000);
    }).then(function (html) {

      if (!html || html.indexOf("Error Code:") !== -1) return attempt();
      var m = html.match(/id="megaplay-player"[^>]*data-id="(\d+)"/) ||
              html.match(/data-id="(\d+)"/) ||
              html.match(/<title>File (\d+) - MegaPlay/);
      if (!m) return attempt();
      _mpFileCache[cacheKey] = { ts: Date.now(), id: m[1] };
      return m[1];
    }).catch(function () { return attempt(); });
  }
  return attempt();
}

function mpCjs() {
  try { if (typeof require === "function") { var c = require("crypto-js"); if (c && c.AES && c.HmacSHA256 && c.lib && c.lib.CipherParams) return c; } } catch (e) {}
  try { if (typeof CryptoJS !== "undefined" && CryptoJS.AES && CryptoJS.lib && CryptoJS.lib.CipherParams) return CryptoJS; } catch (e2) {}
  try { if (typeof __nvRequire === "function") { var c2 = __nvRequire("crypto-js"); if (c2 && c2.AES && c2.HmacSHA256 && c2.lib && c2.lib.CipherParams) return c2; } } catch (e3) {}
  return null;
}
var _mpAES = null, _mpHMAC = null, _mpIV = null;
function mpKeys() {
  var C = mpCjs();
  if (!C) return false;
  if (!_mpAES) {
    try {
      _mpAES = C.enc.Hex.parse("693f4c4d5441783051362c3a7d35305500000000000000000000000000000000");
      _mpIV = C.enc.Utf8.parse("W0;27ToaUpl_P%'c");
      _mpHMAC = C.enc.Utf8.parse("MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s");
    } catch (e) { return false; }
  }
  return true;
}
function mpDecryptFile(enc) {
  try {
    var C = mpCjs();
    if (!C || !mpKeys()) return null;
    var ct = C.enc.Base64.parse(String(enc).replace(/-/g, "+").replace(/_/g, "/"));
    var params = C.lib.CipherParams.create({ ciphertext: ct });
    var pt = C.AES.decrypt(params, _mpAES, { iv: _mpIV, mode: C.mode.CBC, padding: C.pad.Pkcs7 });
    var txt = pt.toString(C.enc.Utf8);
    if (!txt) return null;
    var j = JSON.parse(txt);
    return j && j.file ? String(j.file) : null;
  } catch (e) { return null; }
}
function mpTokenForPath(path) {
  var C = mpCjs();
  if (!C || !mpKeys()) return "";
  try {
    var msg = Math.floor(Date.now() / 1000) + "|" + path;
    var b64url = function (wa) {
      return wa.toString(C.enc.Base64).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    return b64url(C.enc.Utf8.parse(msg)) + "." + b64url(C.HmacSHA256(msg, _mpHMAC));
  } catch (e) { return ""; }
}

function mpTokenizeMaster(fileUrl) {
  var f = String(fileUrl || "");
  if (/\/$/.test(f)) f += "master.m3u8";
  var m = f.match(/^https?:\/\/[^/]+\/(?:anime|movie|series|tv)\/(.+?)(?:\/master\.m3u8)?$/);
  var path = m ? m[1] : "";
  if (!path) return { plain: f, tokenized: f, path: "" };
  var tok = mpTokenForPath(path);
  return { plain: f, tokenized: tok ? (f + "?token=" + tok) : f, path: path };
}

var MP_SRC_CACHE_TTL = 10 * 60 * 1000;
var _mpSrcCache = _muState.mpSources || (_muState.mpSources = {});

function mpSources(fileId, sHint) {
  var cacheKey = fileId + ":" + (sHint || "def");
  var hit = _mpSrcCache[cacheKey];
  if (hit && Date.now() - hit.ts < MP_SRC_CACHE_TTL) {
    var d0 = hit.data;
    if (d0 && d0.path) {
      try {
        var tk0 = mpTokenForPath(d0.path);
        if (tk0) d0.file = d0.plain + "?token=" + tk0;
      } catch (e0) {}
    }
    return Promise.resolve(d0);
  }
  return mpGap().then(function () {
    var url = MEGAPLAY_BASE + "/stream/getSourcesNew?id=" + encodeURIComponent(fileId);
    if (sHint) url += "&s=" + encodeURIComponent(sHint);
    return fetchJson(url, {
      "User-Agent": COMMON_UA,
      "Accept": "application/json",
      "Referer": MEGAPLAY_BASE + "/",
      "X-Requested-With": "XMLHttpRequest"
    }, 6000);
  }).then(function (data) {
    if (!data) return null;
    var file = null;
    if (data.sources && data.sources.file && /^https?:\/\//i.test(String(data.sources.file))) {
      file = String(data.sources.file);
    } else if (data.enc) {
      file = mpDecryptFile(String(data.enc));
    }
    if (!file) return null;
    var built = mpTokenizeMaster(file);
    var out = {
      file: built.tokenized,
      plain: built.plain,
      path: built.path,
      tracks: Array.isArray(data.tracks) ? data.tracks : []
    };
    _mpSrcCache[cacheKey] = { ts: Date.now(), data: out };
    return out;
  }).catch(function () { return null; });
}

var MP_S_HINTS = [null, "tcdn", "bcdn"];
var MP_HOST_SWAPS = [];

function subsFromTracks(tracks) {
  return (tracks || []).filter(function (t) {
    return t && t.file && /^https?:/i.test(String(t.file)) &&
      /(english|filipino|tagalog)/i.test(String(t.label || t.language || ""));
  }).slice(0, 6).map(function (t) {
    var l = String(t.label || t.language || "English");
    var isTl = /filipino|tagalog/i.test(l);
    return {
      url: String(t.file),
      language: isTl ? "tl" : "en",
      name: isTl ? "Tagalog / Filipino" : l
    };
  });
}

function attachSubs(subs, rows) {
  if (subs && subs.length) rows.forEach(function (r) { if (!r.subtitles) r.subtitles = subs; });
  return rows;
}

function rowsFromMaster(masterUrl, res, subs, label, lang, makeRow) {
  var added = [];
  if (res && res.variants && res.variants.length) {
    res.variants.forEach(function (v) { added.push(makeRow(v.url, "", label, lang, v.height)); });
  } else {
    added.push(makeRow(masterUrl, "", label, lang, 0));
  }
  return attachSubs(subs, added);
}

var MASTER_MEMO_TTL = 3 * 60 * 1000;
var _masterMemo = _muState.masterMemo || (_muState.masterMemo = {});
function masterProbe(url, referer) {
  var key = String(url);
  var hit = _masterMemo[key];
  if (hit && Date.now() - hit.ts < MASTER_MEMO_TTL) {
    return Promise.resolve(hit.res);
  }
  return hlsVariants(url, referer).then(function (res) {
    _masterMemo[key] = { ts: Date.now(), res: res };
    return res;
  });
}

function megaPlayRowsFromSources(src, label, lang, makeRow) {
  var subs = subsFromTracks(src.tracks);
  var master = String(src.file);
  var cached = _masterMemo[master];
  if (cached && Date.now() - cached.ts < MASTER_MEMO_TTL) {
    var r0 = cached.res;
    return Promise.resolve({
      rows: rowsFromMaster(master, r0, subs, label, lang, makeRow),
      live: !!(r0 && r0.ok)
    });
  }
  return hlsVariants(src.file, MEGAPLAY_BASE + "/").then(function (res) {
    _masterMemo[master] = { ts: Date.now(), res: res };
    return {
      rows: rowsFromMaster(src.file, res, subs, label, lang, makeRow),
      live: !!(res && res.ok)
    };
  });
}

function megaPlayRowsSmart(fileId, label, lang, makeRow) {
  var idx = 0;

  var unlive = null;
  function attemptHint() {
    if (idx >= MP_S_HINTS.length) return Promise.resolve(null);
    var hint = MP_S_HINTS[idx++];
    return mpSources(fileId, hint).then(function (src) {
      if (!src) return attemptHint();
      return megaPlayRowsFromSources(src, label, lang, makeRow).then(function (out) {
        if (out.live) return out.rows;
        if (out.rows.length && !unlive) unlive = out.rows;
        console.log("[Miruro] master unreachable via " + (hint || "default CDN") +
          " -> rotating CDN hint");
        return attemptHint();
      });
    }).catch(function () { return attemptHint(); });
  }
  return attemptHint().then(function (rows) {
    if (rows && rows.length) return rows;

    return mpSources(fileId, null).then(function (src) {
      if (!src) return unlive || [];
      var m = String(src.file).match(/^(https:\/\/)[^/]+(\/.+)$/);
      if (!m) return unlive || [];
      var subs = subsFromTracks(src.tracks);
      var swaps = MP_HOST_SWAPS.slice();
      function trySwap() {
        if (!swaps.length) return unlive || [];
        var alt = m[1] + swaps.shift() + m[2];
        return masterProbe(alt, MEGAPLAY_BASE + "/").then(function (res) {
          if (!res || !res.ok) return trySwap();
          console.log("[Miruro] master OK via host swap -> " + alt.split("/")[2]);
          return rowsFromMaster(alt, res, subs, label, lang, makeRow);
        });
      }
      return trySwap();
    }).catch(function () { return unlive || []; });
  });
}

function megaplayLanes(animeIds, epNumber, makeRow, sink) {
  if (!animeIds || (!animeIds.malId && !animeIds.anilistId)) return Promise.resolve([]);
  var langs = ["sub", "dub"];
  var rows = [];

  return Promise.all(langs.map(function (lang) {
    return mpFileId(animeIds.malId, animeIds.anilistId, epNumber, lang)
      .then(function (fileId) {
          if (!fileId) return;
          var label = "MegaPlay " + (lang === "dub" ? "Dub" : "Sub");
          return megaPlayRowsSmart(fileId, label, lang, makeRow).then(function (added) {
            if (sink && added.length) added.forEach(sink);
            added.forEach(function (r) { rows.push(r); });
          });
        }).catch(function () {});
  })).then(function () { return rows; });
}

function mpFileIdFromEmbedId(embedId, lang) {
  var cacheKey = "e" + embedId + ":" + lang;
  var hit = _mpFileCache[cacheKey];
  if (hit && Date.now() - hit.ts < MP_FILE_CACHE_TTL) {
    return Promise.resolve(hit.id);
  }
  return mpGap().then(function () {
    return fetchText(MEGAPLAY_BASE + "/stream/s-2/" + encodeURIComponent(embedId) + "/" + lang, {
      "User-Agent": COMMON_UA,
      "Accept": "text/html,*/*",
      "Referer": MEGAPLAY_BASE + "/"
    }, 6000);
  }).then(function (html) {
    if (!html || html.indexOf("Error Code:") !== -1) return null;
    var m = html.match(/id="megaplay-player"[^>]*data-id="(\d+)"/) ||
            html.match(/data-id="(\d+)"/) ||
            html.match(/<title>File (\d+) - MegaPlay/);
    if (!m) return null;
    _mpFileCache[cacheKey] = { ts: Date.now(), id: m[1] };
    return m[1];
  }).catch(function () { return null; });
}

function anikotoSeries(anikotoId) {
  return fetchJson(ANIKOTO_API + "/series/" + encodeURIComponent(anikotoId), {
    "User-Agent": COMMON_UA, "Accept": "application/json"
  }, 9000).then(function (d) {
    return d && d.data ? d.data : null;
  }).catch(function () { return null; });
}

var AZ_MAL_TTL = 24 * 60 * 60 * 1000;
var _azMalCache = _muState.azMal || (_muState.azMal = {});
function anizipFromMal(malId) {
  var key = String(malId);
  var hit = _azMalCache[key];
  if (hit && Date.now() - hit.ts < (hit.ttl || AZ_MAL_TTL)) {
    return Promise.resolve(hit.al);
  }
  return mapGap().then(function () {
    return fetchJson(ANIZIP_BASE + "/mappings?mal_id=" + encodeURIComponent(key), {
      "User-Agent": COMMON_UA, "Accept": "application/json"
    }, 8000);
  }).then(function (data) {
    var al = data && data.mappings && data.mappings.anilist_id != null
      ? parseInt(data.mappings.anilist_id, 10) : null;
    var out = (al && isFinite(al) && al > 0) ? al : null;
    _azMalCache[key] = { ts: Date.now(), al: out, ttl: out ? AZ_MAL_TTL : 60 * 60 * 1000 };
    return out;
  }).catch(function () {
    _azMalCache[key] = { ts: Date.now(), al: null, ttl: 60 * 60 * 1000 };
    return null;
  });
}

function anikotoS2Lanes(ep, makeRow) {
  var subId = ep.episode_embed_id ? String(ep.episode_embed_id) : "";
  if (!subId && ep.embed_url && ep.embed_url.sub) {
    var sm = String(ep.embed_url.sub).match(/\/s-2\/(\d+)\/sub/);
    if (sm) subId = sm[1];
  }
  var dubId = "";
  if (ep.embed_url && ep.embed_url.dub) {
    var dm = String(ep.embed_url.dub).match(/\/s-2\/(\d+)\/dub/);
    if (dm) dubId = dm[1];
  }
  var langs = [];
  if (subId) langs.push({ lang: "sub", embed: subId });
  if (dubId) langs.push({ lang: "dub", embed: dubId });
  if (!langs.length) return Promise.resolve([]);
  return Promise.all(langs.map(function (l) {
    return mpFileIdFromEmbedId(l.embed, l.lang).then(function (fileId) {
      if (!fileId) return;
      var label = "MegaPlay " + (l.lang === "dub" ? "Dub" : "Sub");
      return megaPlayRowsSmart(fileId, label, l.lang, makeRow);
    }).catch(function () { return null; });
  })).then(function (parts) {
    var rows = [];
    parts.forEach(function (p) { if (p) rows = rows.concat(p); });
    return rows;
  });
}

function anikotoAllLanes(anikotoId, epNumber, makeRow, sink) {
  return anikotoSeries(anikotoId).then(function (data) {
    if (!data) return { rows: [] };
    var anime = data.anime || {};
    var malId = parseInt(anime.mal_id, 10);
    var aniId = parseInt(anime.ani_id, 10);
    var animeIds = {
      malId: isFinite(malId) && malId > 0 ? malId : null,
      anilistId: isFinite(aniId) && aniId > 0 ? aniId : null
    };
    function push(rows) {
      if (sink && rows && rows.length) rows.forEach(sink);
      return rows;
    }
    var eps = Array.isArray(data.episodes) ? data.episodes : [];
    var ep = null;
    for (var i = 0; i < eps.length; i++) {
      if (parseInt(eps[i] && eps[i].number, 10) === parseInt(epNumber, 10)) { ep = eps[i]; break; }
    }
    var s2 = ep ? anikotoS2Lanes(ep, makeRow).then(push) : Promise.resolve([]);
    var mp = (animeIds.malId || animeIds.anilistId)
      ? megaplayLanes(animeIds, epNumber, makeRow, sink).then(push)
      : Promise.resolve([]);
    var pp = animeIds.anilistId
      ? pipeLanes(animeIds.anilistId, epNumber, makeRow, sink).then(push)
      : Promise.resolve([]);
    return Promise.all([s2, mp, pp]).then(function (parts) {
      return { rows: parts[0].concat(parts[1]).concat(parts[2]) };
    });
  });
}

function kitsuById(kitsuId) {
  var url = KITSU_BASE + "/anime/" + encodeURIComponent(kitsuId) + "?include=mappings";
  return mapGap().then(function () {
    return fetchJson(url, { "User-Agent": COMMON_UA, "Accept": "application/vnd.api+json" }, 10000);
  }).then(function (data) {
    if (!data || !data.data) return null;
    var mapIds = {};
    (data.included || []).forEach(function (inc) {
      if (inc && inc.type === "mappings" && inc.attributes) {
        var site = String(inc.attributes.externalSite || "");
        if (site === "myanimelist/anime") mapIds.mal = inc.attributes.externalId;
        else if (site === "anilist/anime") mapIds.ali = inc.attributes.externalId;
      }
    });
    if (!mapIds.mal && !mapIds.ali) return null;
    return { malId: mapIds.mal || null, anilistId: mapIds.ali || null, via: "kitsu-id" };
  }).catch(function () { return null; });
}

function hlsVariants(masterUrl, referer) {
  return fetchText(masterUrl, { "User-Agent": COMMON_UA, "Referer": referer }, 5000)
    .then(function (master) {
      if (!master || master.indexOf("#EXTM3U") === -1) return { ok: true, variants: [] };
      var lines = master.split(/\r?\n/), out = [];
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
        var resM = lines[i].match(/RESOLUTION=(\d+)x(\d+)/i);
        var url = "";
        for (var j = i + 1; j < lines.length; j++) {
          var t = lines[j].trim();
          if (t && t.charAt(0) !== "#") { url = t; break; }
        }
        if (!url) continue;
        if (!/^https?:\/\//i.test(url)) {
          url = masterUrl.replace(/[^/]*$/, url);
        }
        var h = resM ? parseInt(resM[2], 10) : 0;
        out.push({ url: url, height: h });
      }
      out.sort(function (a, b) { return b.height - a.height; });
      return { ok: true, variants: out.slice(0, 4) };
    }).catch(function () { return { ok: false, variants: [] }; });
}

function tmdbInfo(tmdbId, mediaType) {
  var endpoint = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
  var url = "https://api.themoviedb.org/3/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return fetchJson(url, null, 7000).then(function (data) {
    if (!data) throw new Error("tmdb unreachable");
    var title = mediaType === "tv" || mediaType === "series" ? (data.name || data.original_name) : (data.title || data.original_title);
    var original = mediaType === "tv" || mediaType === "series" ? (data.original_name || data.name) : (data.original_title || data.title);
    var date = mediaType === "tv" || mediaType === "series" ? data.first_air_date : data.release_date;
    if (!title) throw new Error("tmdb: no title");
    return {
      title: title,
      original: original || title,
      year: date ? parseInt(String(date).split("-")[0], 10) : null,
      isAnimation: (data.genres || []).some(function (genre) { return genre.id === 16; }),
      originalLanguage: data.original_language || ""
    };
  });
}

function tmdbSeasonYear(tmdbId, season) {
  return fetchJson("https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "?api_key=" + TMDB_API_KEY, null, 9000)
    .then(function (d) {
      var a = d && d.air_date ? String(d.air_date).split("-")[0] : null;
      return a ? parseInt(a, 10) : null;
    }).catch(function () { return null; });
}

function anilistSearchPost(title, year) {
  var query = 'query ($search: String, $year: Int) {' +
    ' Media(search: $search, seasonYear: $year, type: ANIME,' +
    ' format_in: [TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL]) {' +
    ' id idMal title { romaji english native } seasonYear } }';
  var body = JSON.stringify({ query: query, variables: { search: title, year: year } });
  if (!hasTimers()) {
    return fetch("https://graphql.anilist.co", {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body
    }).then(function (res) { return res.json(); });
  }
  return new Promise(function (resolve, reject) {

    var timer = setTimeout(function () { reject(new Error("anilist timeout")); }, 5000);
    fetch("https://graphql.anilist.co", {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body
    }).then(function (res) {
      clearTimeout(timer);
      res.json().then(resolve, reject);
    }, function (e) { clearTimeout(timer); reject(e); });
  });
}

var ANILIST_COOLDOWN_MS = 15 * 60 * 1000;
var _anilistDown = _muState.anilistDown || (_muState.anilistDown = { until: 0 });
function anilistAvailable() { return Date.now() >= _anilistDown.until; }
function markAnilistDown() {
  _anilistDown.until = Date.now() + ANILIST_COOLDOWN_MS;
  console.log("[Miruro] AniList benched for 15 min");
}

function anilistFromPost(data) {
  if (data && data.data && data.data.Media && data.data.Media.id) {
    return {
      anilistId: data.data.Media.id,
      malId: data.data.Media.idMal || null,
      via: "anilist"
    };
  }
  return null;
}

function asciiFold(s) {
  var t = String(s || "");

  if (typeof t.normalize === "function") {
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
  }
  return t;
}

function normTitleForMatch(s) {
  return asciiFold(s).toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d']/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function collapseRomaji(s) {
  return String(s || "").replace(/([aeou])\1+/g, "$1").replace(/ou/g, "o");
}

function yearClose(a, b) {
  return a && b && Math.abs(parseInt(a, 10) - parseInt(b, 10)) <= 1;
}

function kitsuSearch(query, year) {
  var url = KITSU_BASE + "/anime?filter[text]=" + encodeURIComponent(query) +
    "&page[limit]=5&include=mappings";
  return mapGap().then(function () {
    return fetchJson(url, { "User-Agent": COMMON_UA, "Accept": "application/vnd.api+json" }, 10000);
  }).then(function (data) {
      if (!data || !Array.isArray(data.data) || !data.data.length) return null;
      var mapIds = {};
      (data.included || []).forEach(function (inc) {
        if (inc && inc.type === "mappings" && inc.attributes) {
          var site = String(inc.attributes.externalSite || "");
          if (site === "myanimelist/anime") mapIds[inc.id] = { mal: inc.attributes.externalId };
          else if (site === "anilist/anime") mapIds[inc.id] = { ali: inc.attributes.externalId };
        }
      });
      var want = normTitleForMatch(query.replace(/\s+(season|2nd|3rd|4th|5th)\b.*$/i, " "));
      var wantR = collapseRomaji(want);
      var best = null;
      for (var i = 0; i < data.data.length && !best; i++) {
        var a = data.data[i];
        var attrs = a.attributes || {};
        var start = attrs.startDate ? parseInt(String(attrs.startDate).split("-")[0], 10) : null;
        var yearOk = year ? (start ? yearClose(start, year) : true) : true;
        var titles = [attrs.canonicalTitle, attrs.titles && attrs.titles.en,
          attrs.titles && attrs.titles.en_jp, attrs.titles && attrs.titles.ja_jp];
        var titleOk = titles.some(function (t) {
          var nt = normTitleForMatch(t);
          if (!nt) return false;
          if (nt.indexOf(want) !== -1 || want.indexOf(nt) !== -1) return true;
          var cn = collapseRomaji(nt);
          return wantR.length > 3 && cn === wantR;
        });
        if (!titleOk || !yearOk) continue;
        var malId = null, aliId = null;
        var rels = a.relationships && a.relationships.mappings && a.relationships.mappings.data;
        if (Array.isArray(rels)) {
          rels.forEach(function (rr) {
            if (mapIds[rr.id]) {
              if (mapIds[rr.id].mal) malId = mapIds[rr.id].mal;
              if (mapIds[rr.id].ali) aliId = mapIds[rr.id].ali;
            }
          });
        }
        if (malId || aliId) best = { anilistId: aliId, malId: malId, via: "kitsu" };
      }
      return best;
    }).catch(function () { return null; });
}

function jikanSearch(query, year) {
  var url = JIKAN_BASE + "/anime?q=" + encodeURIComponent(query) + "&limit=5&sfw=true";
  return mapGap().then(function () {
    return fetchJson(url, { "User-Agent": COMMON_UA, "Accept": "application/json" }, 10000);
  }).then(function (data) {
      if (!data || !Array.isArray(data.data) || !data.data.length) return null;
      var want = normTitleForMatch(query.replace(/\s+(season|2nd|3rd|4th|5th)\b.*$/i, " "));
      var wantR = collapseRomaji(want);
      for (var i = 0; i < data.data.length; i++) {
        var a = data.data[i];
        var yr = a.year || (a.aired && a.aired.from ? parseInt(String(a.aired.from).split("-")[0], 10) : null);
        var yearOk = year ? (yr ? yearClose(yr, year) : true) : true;
        var titles = [a.title, a.title_english, a.title_japanese];
        var titleOk = titles.some(function (t) {
          var nt = normTitleForMatch(t);
          if (!nt) return false;
          if (nt.indexOf(want) !== -1 || want.indexOf(nt) !== -1) return true;
          var cn = collapseRomaji(nt);
          return wantR.length > 3 && cn === wantR;
        });
        if (titleOk && yearOk && a.mal_id) return { anilistId: null, malId: a.mal_id, via: "jikan" };
      }
      return null;
    }).catch(function () { return null; });
}

function aniZipFromTmdb(tmdbId) {
  var url = ANIZIP_BASE + "/mappings?themoviedb_id=" + encodeURIComponent(tmdbId);
  return mapGap().then(function () {
    return fetchJson(url, { "User-Agent": COMMON_UA, "Accept": "application/json" }, 8000);
  }).then(function (data) {
    if (!data || !data.mappings) return null;
    var m = data.mappings;
    var mal = m.mal_id == null ? null : parseInt(m.mal_id, 10);
    var ali = m.anilist_id == null ? null : parseInt(m.anilist_id, 10);
    if (!mal && !ali) return null;
    console.log("[Miruro] ani.zip tmdb " + tmdbId + " -> mal " + mal + " / anilist " + ali);
    return { malId: mal, anilistId: ali, via: "anizip" };
  }).catch(function () { return null; });
}

var ORDINALS = { 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th" };

function withDeadline(promise, ms) {
  if (!hasTimers()) return promise;
  return Promise.race([promise, new Promise(function (resolve) {
    var t = setTimeout(function () { resolve(null); }, ms);
    if (typeof t === "object" && typeof t.unref === "function") t.unref();
  })]);
}

function mapTMDBToAnime(tmdbId, isTv, info, season) {
  season = parseInt(season || 1, 10);
  var mapKey = (isTv ? "tv" : "mv") + ":" + tmdbId + ":" + season;
  var hit = _mapCache[mapKey];
  if (hit && Date.now() - hit.ts < MAP_CACHE_TTL) {
    return Promise.resolve(hit.res);
  }
  var uncapped = mapTMDBToAnimeUncached(tmdbId, isTv, info, season);

  uncapped.then(function (res) {
    if (res) _mapCache[mapKey] = { ts: Date.now(), res: res };
  }).catch(function () {});

  return withDeadline(uncapped, 8000).catch(function () { return null; });
}

function mapTMDBToAnimeUncached(tmdbId, isTv, info, season) {
  season = parseInt(season || 1, 10);
  var base = info.original || info.title;

  var anizipJob = aniZipFromTmdb(tmdbId);
  if (!isTv || season <= 1) {
    return new Promise(function (resolve) {
      var settled = false, clusterStarted = false;
      function finish(r) { if (!settled) { settled = true; resolve(r); } }
      function startCluster() {
        if (clusterStarted || settled) return;
        clusterStarted = true;
        console.log("[Miruro] ani.zip miss -> title-search fallback (kitsu/jikan/anilist)");
        var jobs = [];
        if (anilistAvailable()) {
          jobs.push(
            anilistSearchPost(info.title, info.year).then(anilistFromPost)
              .catch(function (e) { markAnilistDown(); return null; })
          );
        }
        jobs.push(
          kitsuSearch(info.title, info.year).then(function (k) {
            return k || jikanSearch(info.title, info.year);
          })
        );
        Promise.all(jobs).then(function (rs) {
          for (var i = 0; i < rs.length; i++) {
            if (rs[i]) { finish({ anilistId: rs[i].anilistId, malId: rs[i].malId, via: rs[i].via, matched: "base" }); return; }
          }
          finish(null);
        }).catch(function () { finish(null); });
      }
      anizipJob.then(function (r) {
        if (r) finish({ anilistId: r.anilistId, malId: r.malId, via: r.via, matched: "base" });
        else startCluster();
      }).catch(function () { startCluster(); });
      if (hasTimers()) {
        var t = setTimeout(startCluster, 2000);
        if (typeof t === "object" && typeof t.unref === "function") t.unref();
      } else {
        startCluster();
      }
    });
  }

  return tmdbSeasonYear(tmdbId, season).then(function (sYear) {
    var ord = ORDINALS[season] || season;
    var cands = [];
    if (sYear) {
      cands.push({ q: base + " season " + season, y: sYear });
      cands.push({ q: base + " " + ord + " season", y: sYear });
    }
    if (info.year && info.year !== sYear) {
      cands.push({ q: base + " season " + season, y: info.year });
    }
    var chain = Promise.resolve(null);
    cands.forEach(function (c) {
      chain = chain.then(function (r) {
        if (r) return r;
        return jikanSearch(c.q, c.y).then(function (j) { return j || kitsuSearch(c.q, c.y); });
      });
    });
    return chain.then(function (r) {
      if (r) return { anilistId: r.anilistId, malId: r.malId, via: r.via, matched: "season" };

      return anizipJob.then(function (az) {
        if (az) return { anilistId: az.anilistId, malId: az.malId, via: az.via, matched: "base" };
        var baseJob = anilistAvailable()
          ? anilistSearchPost(info.title, info.year).then(anilistFromPost)
              .catch(function () { markAnilistDown(); return null; })
          : Promise.resolve(null);
        return baseJob.then(function (r2) {
          if (r2) return { anilistId: r2.anilistId, malId: r2.malId, via: r2.via, matched: "base" };
          return kitsuSearch(info.title, info.year).then(function (k) {
            return k ? { anilistId: k.anilistId, malId: k.malId, via: k.via, matched: "base" } : null;
          });
        });
      });
    });
  });
}

function absoluteEpisode(tmdbId, season, episode) {
  season = parseInt(season || 1, 10);
  episode = parseInt(episode || 1, 10);
  if (season <= 1) return Promise.resolve(episode);
  var seasons = [];
  for (var s = 1; s < season; s++) seasons.push(s);
  var jobs = seasons.map(function (s) {
    return fetchJson("https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + s + "?api_key=" + TMDB_API_KEY, null, 9000)
      .then(function (d) { return (d && d.episodes && d.episodes.length) || 0; })
      .catch(function () { return 0; });
  });
  return Promise.all(jobs).then(function (counts) {
    var total = 0;
    counts.forEach(function (c) { total += c; });
    console.log("[Miruro] absolute episode: " + (total + episode) + " (+" + total + " prior)");
    return total + episode;
  }).catch(function () { return episode; });
}

function parseCatalogAnimeId(raw) {
  var s = String(raw == null ? "" : raw).trim();
  if (!s) return null;
  if (s.indexOf("%") >= 0) {
    try { var dec = decodeURIComponent(s); if (dec) s = dec; } catch (e) {}
  }
  s = String(s).trim();
  var h = s.indexOf("#"); if (h >= 0) s = s.slice(0, h);
  var q = s.indexOf("?"); if (q >= 0) s = s.slice(0, q);
  s = s.replace(/\.json([^.].*)?$/i, "").replace(/\.json$/i, "").trim();
  if (!s) return null;
  var tokens = s.split(/[:\\/]/);
  var PREFIX = { mal: 1, anilist: 1, kitsu: 1, anikoto: 1 };
  for (var i = tokens.length - 2; i >= 0; i--) {
    var t = String(tokens[i] || "").toLowerCase().trim();
    if (!PREFIX[t]) continue;
    var idTok = String(tokens[i + 1] || "").trim();
    if (!/^\d+$/.test(idTok)) continue;
    var out = { prefix: t, id: idTok, season: 0, episode: 0 };
    var n1 = parseInt(String(tokens[i + 2] == null ? "" : tokens[i + 2]).trim(), 10);
    var n2 = parseInt(String(tokens[i + 3] == null ? "" : tokens[i + 3]).trim(), 10);
    if (isFinite(n1) && n1 > 0 && isFinite(n2) && n2 > 0) { out.season = n1; out.episode = n2; }
    else if (isFinite(n1) && n1 > 0) { out.episode = n1; }
    return out;
  }
  return null;
}

function _nvNormalize_miruro(rawId, fallbackSeason, fallbackEpisode) {
  var s = String(rawId == null ? '' : rawId).trim();
  if (!s) return null;
  if (s.indexOf('%') >= 0) { try { var dec = decodeURIComponent(s); if (dec) s = String(dec).trim(); } catch(e){} }
  var m = s.match(/^(?:tmdb:|movie:|series:)?(tt\d+|\d{2,12})(?::(\d+)(?::(\d+))?)?/i);
  if (m) {
    var id = m[1];
    var s1 = parseInt(m[2],10) || 0;
    var e1 = parseInt(m[3],10) || 0;
    if (m[2] && !m[3] && s.indexOf(':') !== -1 && s.split(':').length === 2) { e1 = s1; s1 = 0; }
    return { id: id, season: s1, episode: e1, isTT: /^tt/i.test(id), raw: s };
  }
  return null;
}

function getStreams(tmdbId, mediaType, season, episode) {
  var _normM = _nvNormalize_miruro(String(tmdbId||""), season, episode); if (_normM && !_normM.isTT) {
    if (!String(tmdbId).match(/^mal:|^anilist:|^kitsu:|^anikoto:/i)) {
      tmdbId = _normM.id; if (!season && _normM.season) season=_normM.season; if (!episode && _normM.episode) episode=_normM.episode;
    }
  }
  try { tmdbId = String(tmdbId == null ? "" : tmdbId); } catch (e) { tmdbId = ""; }
  if (!tmdbId) return Promise.resolve([]);

  var mtSlot = String(mediaType == null ? "" : mediaType).toLowerCase();
  if (mtSlot !== "movie" && mtSlot !== "tv" && mtSlot !== "series" &&
      mtSlot !== "show" && mtSlot !== "tv_show" && mtSlot !== "tvshow") {

    if (mediaType !== undefined && mediaType !== null && mtSlot !== "") {
      episode = season;
      season = mediaType;
      mediaType = undefined;
    }
  }
  var argSeason = season, argEpisode = episode;

  var isTv = mediaType === "tv" || mediaType === "series" || mediaType === "show";
  season = parseInt(season || 1, 10) || 1;
  episode = parseInt(episode || 1, 10) || 1;
  var key = cacheKey(tmdbId, mediaType, season, episode);
  var hit = _muState.cache[key];
  if (hit && Date.now() - hit.ts < (hit.ttl || CACHE_TTL)) return Promise.resolve(hit.streams);
  if (_muState.inflight[key]) return _muState.inflight[key];

  console.log("[Miruro] start " + mediaType + " " + tmdbId +
    (isTv ? " S" + season + "E" + episode : ""));

  function makeRow(url, qualityLabel, sourceName, category, height) {
    var q = "";
    var s = String(qualityLabel || "").toLowerCase();
    if (/2160|4k/.test(s)) q = "4K";
    else if (/1440/.test(s)) q = "1440p";
    else if (/1080/.test(s)) q = "1080p";
    else if (/720/.test(s)) q = "720p";
    else if (height) {
      if (height >= 2100) q = "4K";
      else if (height >= 1300) q = "1440p";
      else if (height >= 1000) q = "1080p";
      else if (height >= 640) q = "720p";
    }
    var lane = category === "dub" ? "Dub" : (category === "sub" ? "Sub" : "");
    var name = "Miruro | " + sourceName + (lane ? " | " + lane : "") + (q ? " | " + q : "");
    return {
      name: name,
      title: name,
      url: url,
      quality: q,
      headers: { Referer: MEGAPLAY_BASE + "/" },
      _megaplay: sourceName.indexOf("MegaPlay") === 0
    };
  }

  var collected = [];
  function sinkRow(r) { collected.push(r); }
  function tap(p) {
    return Promise.resolve(p).then(function (rows) {
      (rows || []).forEach(function (r) { collected.push(r); });
      return rows;
    }).catch(function () { return []; });
  }

  var pm = parseCatalogAnimeId(tmdbId);
  var lanes;
  if (pm) {
    var prefix = pm.prefix;
    var catId = pm.id;
    if (!(parseInt(argEpisode, 10) > 0) && pm.episode > 0) episode = pm.episode;
    if (!(parseInt(argSeason, 10) > 0) && pm.season > 0) season = pm.season;
    console.log("[Miruro] start catalog id " + prefix + ":" + catId +
      (isTv ? " S" + season + "E" + episode : "") + " -> direct MegaPlay lane");
    var catEp = episode;
    var catLanes;
    if (prefix === "mal") {

      var mpNow = tap(megaplayLanes({ malId: catId, anilistId: null }, catEp, makeRow, sinkRow));
      var enrich = anizipFromMal(catId).then(function (al) {
        if (!al) return [];
        console.log("[Miruro] mal:" + catId + " enriched with anilist " + al + " (ani.zip) -> ani route + pipe");
        var mp2 = tap(megaplayLanes({ malId: catId, anilistId: al }, catEp, makeRow, sinkRow));
        var pp = tap(pipeLanes(al, catEp, makeRow, sinkRow));
        return Promise.all([mp2, pp]).then(function (parts) {
          return parts[0].concat(parts[1]);
        });
      }).catch(function () { return []; });
      catLanes = [mpNow, enrich];
    } else if (prefix === "anilist") {
      catLanes = [
        megaplayLanes({ malId: null, anilistId: catId }, catEp, makeRow, sinkRow),
        pipeLanes(catId, catEp, makeRow, sinkRow)
      ];
    } else if (prefix === "kitsu") {
      catLanes = [kitsuById(catId).then(function (ids) {
        if (!ids) return [];
        console.log("[Miruro] kitsu " + catId + " -> mal " + ids.malId + " / anilist " + ids.anilistId);
        var mp = tap(megaplayLanes(ids, catEp, makeRow, sinkRow));
        var pp = ids.anilistId ? tap(pipeLanes(ids.anilistId, catEp, makeRow, sinkRow)) : Promise.resolve([]);
        return Promise.all([mp, pp]).then(function (parts) { return parts[0].concat(parts[1]); });
      })];
    } else {
      catLanes = [anikotoAllLanes(catId, catEp, makeRow, sinkRow).then(function (out) {
        return out && out.rows ? out.rows : [];
      })];
    }
    lanes = catLanes.map(tap);
  } else {
    lanes = [tap(tmdbInfo(tmdbId, isTv ? "tv" : "movie").then(function (info) {
    if (!info.isAnimation) {
      console.log("[Miruro] skip non-anime " + info.title);
      return [];
    }

    return mapTMDBToAnime(tmdbId, isTv, info, isTv ? season : 1).then(function (animeIds) {
      if (animeIds) {
        console.log("[Miruro] mapped via " + animeIds.via + " (" + animeIds.matched + "): " +
          "anilist " + animeIds.anilistId + " / mal " + animeIds.malId);
      } else {
        console.log("[Miruro] no mapping from any source");
      }
      var epP;
      if (!isTv) {
        epP = Promise.resolve(1);
      } else if (animeIds && animeIds.matched === "season") {

        epP = Promise.resolve(episode);
      } else {

        epP = absoluteEpisode(tmdbId, season, episode);
      }
      return epP.then(function (epNumber) {

        var a = tap(megaplayLanes(animeIds, epNumber, makeRow, sinkRow));
        var b = animeIds && animeIds.anilistId
          ? tap(pipeLanes(animeIds.anilistId, epNumber, makeRow, sinkRow))
          : Promise.resolve([]);
        return Promise.all([a, b]).then(function (parts) {
          return parts[0].concat(parts[1]);
        });
      });
    });
    }))];
  }

  var run = Promise.all(lanes).then(function (parts) {
    return parts.reduce(function (acc, p) { return acc.concat(p || []); }, []);
  });
  if (hasTimers()) {
    run = Promise.race([
      run,
      new Promise(function (resolve) {
        var t = setTimeout(function () { resolve("__mp_deadline__"); }, 10500);
        if (typeof t === "object" && t && typeof t.unref === "function") t.unref();
      })
    ]);
  }
  run = run.then(function (out) {
    var rows = out === "__mp_deadline__" ? collected : out;
    if (out === "__mp_deadline__") {
      console.log("[Miruro] deadline hit -> flushing " + collected.length + " collected row(s)");
    }
    var seen = {}, outRows = [];
    rows.forEach(function (r) {
      var nu = String(r.url).replace(/[#?].*$/, "");
      if (seen[nu]) return;
      seen[nu] = 1;
      outRows.push(r);
    });
    console.log("[Miruro] returning " + outRows.length + " stream(s)");
    return outRows;
  }).catch(function (error) {
    console.log("[Miruro] failed: " + (error && error.message ? error.message : error));
    return [];
  }).then(function (streams) {
    delete _muState.inflight[key];

    _muState.cache[key] = { ts: Date.now(), streams: streams, ttl: streams.length ? CACHE_TTL : 60000 };
    return streams;
  });
  _muState.inflight[key] = run;
  return run;
}

module.exports = {
  getStreams: getStreams,
  parseCatalogAnimeId: parseCatalogAnimeId
};

(function () {
  var PROVIDER = "miruro";
  var G = typeof globalThis !== "undefined" ? globalThis : typeof global !== "undefined" ? global : this;
  function settings() {
    try { return (G && G.SCRAPER_SETTINGS) || {}; } catch (e) { return {}; }
  }
  function hasTimers() { return typeof setTimeout === "function" && typeof clearTimeout === "function"; }

  function normQ(q) {
    var s = String(q == null ? "" : q).toLowerCase();
    if (!s) return "";
    if (/8k/.test(s)) return "4K";
    if (/2160|4k|uhd/.test(s)) return "4K";
    if (/1440/.test(s)) return "1440p";
    if (/1080|fhd/.test(s)) return "1080p";
    if (/720/.test(s)) return "720p";
    if (/480|360|240|\bsd\b/.test(s)) return "CAM";
    if (/cam|telesync|telecine|\bts\b|\btc\b|screener|dvdscr/.test(s)) return "CAM";
    return "";
  }
  function qFromText(text) {
    var s = String(text || "");
    var m = s.match(/(\d{3,4})\s*p/i);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n >= 2100) return "4K";
      if (n >= 1300) return "1440p";
      if (n >= 1000) return "1080p";
      if (n >= 640) return "720p";
      return "CAM";
    }
    if (/\b8k\b/i.test(s) || /2160|4k|uhd/i.test(s)) return "4K";
    if (/1440p/i.test(s)) return "1440p";
    if (/cam|telesync|telecine|\bts\b|\btc\b|screener|dvdscr/i.test(s)) return "CAM";
    if (/480p|360p|240p|\bsd\b|\bdvdrip\b/i.test(s)) return "CAM";
    if (/\bhd\b/i.test(s)) return "720p";
    return "";
  }
  var qualCache = G.__NV_QUAL_CACHE__ || (G.__NV_QUAL_CACHE__ = {});

  function probeM3u8(url, headers) {
    var now = Date.now();
    var c = qualCache[url];
    if (c && now - c.t < (c.q && c.q !== "ERR" ? 15 * 60 * 1000 : 3 * 60 * 1000)) {
      return Promise.resolve(c.q);
    }
    var opts = { headers: Object.assign({}, headers || {}) };
    var p = fetch(url, opts).then(function (r) {
      if (!r.ok) return Promise.reject(new Error("HTTP " + r.status));
      return r.text();
    }).then(function (t) {
      var q = "";
      if (t && t.indexOf("#EXTM3U") !== -1) {
        var best = 0, re = /RESOLUTION=(\d+)x(\d+)/gi, m;
        while ((m = re.exec(t)) !== null) {
          var h = parseInt(m[2], 10);
          if (h > best) best = h;
        }
        if (best >= 2100) q = "4K";
        else if (best >= 1300) q = "1440p";
        else if (best >= 1000) q = "1080p";
        else if (best >= 640) q = "720p";
        else if (best > 0) q = "CAM";
      }
      qualCache[url] = { t: now, q: q };
      return q;
    }).catch(function () { qualCache[url] = { t: now, q: "ERR" }; return "ERR"; });
    if (hasTimers()) {
      p = Promise.race([p, new Promise(function (res) {

        var timer = setTimeout(function () { res("ERR"); }, 3500);
        if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
      })]);
    }
    return p;
  }

  var BLOCK_RE = new RegExp(
    "\\b(hindi|hin|tamil|telugu|malayalam|mallu|kannada|bengali|bangla|punjabi|marathi|bhojpuri|gujarati|" +
    "odia|assamese|nepali|urdu|sinhala|arabic|ara|farsi|persian|turkish|turkce|espanol|spanish|latino|" +
    "castellano|french|vostfr|german|deutsch|russian|korean|kor|japanese|jpn|chinese|mandarin|cantonese|" +
    "thai|vietnamese|indonesian|bahasa|portuguese|brasileiro|italian|polish|ukrainian|hebrew|" +
    "hungarian|romanian|dutch|flemish|greek|czech|swedish|danish|norwegian|finnish|org)\\b", "i");
  var ALLOW_RE = /\b(english|eng|tagalog|filipino)\b/i;
  var SUB_RE = /\b[a-z0-9]{0,12}subs?\b/gi;

  function langAllowed(titleText) {
    var t = String(titleText || "").replace(SUB_RE, " ");
    if (BLOCK_RE.test(t)) return ALLOW_RE.test(t);
    return true;
  }

  function normUrl(u) {
    var s = String(u || "");
    if (/^magnet:/i.test(s)) {
      var m = s.match(/btih:([a-z0-9]+)/i);
      return "m:" + (m ? m[1].toLowerCase() : s.slice(0, 80));
    }
    return s.replace(/[#?].*$/, "").replace(/\/+$/, "");
  }
  var SEEN = G.__NV_SEEN_URLS__ || (G.__NV_SEEN_URLS__ = {});

  function claim(nu, now, owner) {
    if (!nu) return true;
    var e = SEEN[nu];
    if (e && e.exp > now && e.owner !== owner) return false;
    SEEN[nu] = { exp: now + 120000, owner: owner };
    return true;
  }

  function rank(q) {
    if (q === "4K") return 4;
    if (q === "1440p") return 3.5;
    if (q === "1080p") return 3;
    if (q === "720p") return 2;
    return 0;
  }
  function postProcess(list) {
    var now = Date.now();
    var kept = [];
    var probes = [];
    var rows = [];
    (list || []).forEach(function (s, i) {
      if (!s || !s.url) return;
      if (!langAllowed(s.title)) return;
      var text = (s.name || "") + " " + (s.title || "");
      var isMagnet = /^magnet:/i.test(String(s.url));
      var q = normQ(s.quality) || normQ(String(s.title || "").split("\n")[0]) || qFromText(text);
      var isHlsLike = /m3u8/i.test(String(s.url)) ||
        (!/\.(mp4|mkv|avi|mov|webm|ts|flv|m4v|mp3|aac)(\?|$)/i.test(String(s.url.split("?")[0])) && /^https?:/i.test(String(s.url)));
      if (!q && !isMagnet && isHlsLike) {
        rows.push({ s: s, i: i });
        probes.push(probeM3u8(String(s.url), s.headers));
      } else {
        rows.push({ s: s, i: i });
        probes.push(Promise.resolve(q));
      }
    });
    return Promise.all(probes).then(function (qs) {
      var ranked = [];
      rows.forEach(function (row, k) {
        var q = qs[k];
        if (q === "ERR") {

          row.s.quality = row.s.quality || "";
          ranked.push({ s: row.s, i: row.i, q: row.s.quality || "ERR" });
          return;
        }
        if (!q) return;
        if (q === "CAM") return;
        row.s.quality = q;
        ranked.push({ s: row.s, i: row.i, q: q });
      });

      ranked.sort(function (a, b) {
        var r = rank(b.q) - rank(a.q);
        if (r !== 0) return r;
        return a.i - b.i;
      });
      var seenLocal = {}, out = [];
      ranked.forEach(function (row) {
        var s = row.s;
        var nu = normUrl(s.url);
        if (seenLocal[nu]) return;
        if (!claim(nu, now, PROVIDER)) return;
        seenLocal[nu] = 1;
        out.push(s);
      });
      return out.slice(0, 40);
    }).catch(function () { return (list || []).slice(0, 40); });
  }

  var __orig = null;
  try { __orig = module.exports && module.exports.getStreams; } catch (e) { __orig = null; }
  if (typeof __orig === "function") {
    module.exports.getStreams = function () {
      var args = Array.prototype.slice.call(arguments), self = this;
      function finish(v) {
        if (settings().postFilter === false) return v;
        try { return postProcess(Array.isArray(v) ? v : []); }
        catch (e) { return Array.isArray(v) ? v : []; }
      }
      try {
        var r = __orig.apply(self, args);
        if (r && typeof r.then === "function") {
          return r.then(function (v) { return finish(v); }, function () { return []; });
        }
        return finish(r);
      } catch (e) { return Promise.resolve([]); }
    };
  }
})();

(function () {
  var G = typeof globalThis !== "undefined" ? globalThis : this;
  if (G.__nvMultisubs) return;

  var TMDB_KEY = (typeof TMDB_API_KEY === "string" && TMDB_API_KEY) || "6dc830f9624b43261325bed3bf7d0dfa";
var TMDB_BEARER = (typeof TMDB_API_TOKEN === 'string' && TMDB_API_TOKEN) || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2ZGM4MzBmOTYyNGI0MzI2MTMyNWJlZDNiZjdkMGRmYSIsIm5iZiI6MTU2ODQyODg5OS4xNzI5OTk5LCJzdWIiOiI1ZDdjNTM2MzA2OWYwZTE0NzAzNGRkYzYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.Id1Fy3FCudZeyc0JTcL8qnqmg-krLcWej6RVhi1L9Nc';
  var TTL_MS = 6 * 60 * 60 * 1000;
  var DEADLINE_MS = 8000;
  var MAX_ROWS = 60;

  var SUB_BASES = [
    "https://opensubtitles-v3.strem.io/subtitles/",
    "https://subsense.nepiraw.com/ff7i52ow-0s83DzmLn3E8f1aUP3w6yD1037RLjBa38rkIG_GeGACkFa-zF5ZyWsu21mZmI3U0L_fYJBobEApnB4yIgiMGJHtMiVxWx2Yt2sNGpgkZVjKjOpuReGEN_OVHL7KioxttNKNnYBi_0XnnYK1BDac740kdUjqWzyG6cl0DFyBn5xvIN28Z1vAZMxgaQh1p47lTTM6lgUhGKd5JPp-JEB-nW5BYwyVqGSC43OetSmjMwObgGIrLQyjD4ah6CnnMVYgFPFP42u3mtY1tvX4KSH7WCuChXGe1fkRWoMXPgsvVHvvSbPi-UThYEWXXBgeOkEB9KJ9GUyX3mJb96FAOq9pDsCuohd0vgUtYRc1bqNdxdKOASQ9ZgRs/subtitles/",
    "https://subsource.strem.top/c2tfNWM2ZTllMDRiZjc4Y2QxMDg5NjgxYjI5MjIwYTM0OGFmMTYwY2IzMmNiNzUzM2FhOTExNzJmMWRiMGFjN2Q0NS9lbmdsaXNoLHRhZ2Fsb2cvaGlJbmNsdWRlL3R5cGU6MC8/subtitles/",
    "https://subdl.strem.top/bkVST1BZWVFLdlA3NjkzWFc1emNvVUlRRWlGUGNjbWovRU4sVEwvaGlJbmNsdWRlLw/subtitles/"
  ];

  var CODE_MAP = {
    eng: "en", tgl: "tl", fil: "fil", ko: "ko", kor: "ko", jpn: "ja",
    ind: "id", may: "ms", zho: "zh", zhe: "zh", zht: "zh-TW", tha: "th",
    hin: "hi", ben: "bn", tam: "ta", tel: "te", spa: "es", por: "pt",
    pob: "pt-BR", fre: "fr", ger: "de", ita: "it", rus: "ru", ara: "ar",
    tur: "tr", vie: "vi", pol: "pl", nld: "nl", ukr: "uk", pes: "fa",
    per: "fa", swe: "sv", nor: "no", dan: "da", fin: "fi", ell: "el",
    heb: "he", hun: "hu", ces: "cs", cze: "cs", ron: "ro", rum: "ro",
    hrv: "hr", srp: "sr", bul: "bg", slo: "sk", slv: "sl", bos: "bs",
    mac: "mk", mkd: "mk", est: "et", lav: "lv", lit: "lt"
  };
  var NAME_MAP = {
    en: "English", tl: "Tagalog", fil: "Filipino", ko: "Korean", ja: "Japanese",
    id: "Indonesian", ms: "Malay", zh: "Chinese", "zh-TW": "Chinese (Traditional)",
    th: "Thai", hi: "Hindi", bn: "Bengali", ta: "Tamil", te: "Telugu",
    es: "Spanish", pt: "Portuguese", "pt-BR": "Portuguese (BR)", fr: "French",
    de: "German", it: "Italian", ru: "Russian", ar: "Arabic", tr: "Turkish",
    vi: "Vietnamese", pl: "Polish", nl: "Dutch", uk: "Ukrainian", fa: "Persian",
    sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish", el: "Greek",
    he: "Hebrew", hu: "Hungarian", cs: "Czech", sk: "Slovak", ro: "Romanian",
    hr: "Croatian", sr: "Serbian", bg: "Bulgarian", sl: "Slovenian",
    bs: "Bosnian", mk: "Macedonian", et: "Estonian", lv: "Latvian", lt: "Lithuanian"
  };

  var _cache = {};
  var _imdbCache = {};
  var _inflight = {};

  function _hasTimers() {
    return typeof setTimeout === "function" && typeof Promise !== "undefined" && Promise.race;
  }
  function _withDeadline(p) {
    if (!_hasTimers()) return p;
    return Promise.race([p, new Promise(function (res) {
      var t = setTimeout(function () { res(null); }, DEADLINE_MS);
      if (t && typeof t.unref === "function") t.unref();
    })]);
  }
  function _normType(mediaType) {
    var t = String(mediaType || "").toLowerCase();
    return (t === "series" || t === "show" || t === "tvshow" || t === "tv") ? "series" : "movie";
  }
  function _fetchJson(url) {
    return _withDeadline(
      (typeof fetch === "function" ? fetch(url) : Promise.reject(new Error("no fetch")))
        .then(function (res) {
          if (!res || !res.ok) return null;
          return res.json().catch(function () { return null; });
        })
        .catch(function () { return null; })
    );
  }
  function _resolveImdb(tmdbId, mediaType) {
    var key = _normType(mediaType) + ":" + String(tmdbId);
    var now = Date.now();
    if (_imdbCache[key] && now - _imdbCache[key].t < TTL_MS) {
      return Promise.resolve(_imdbCache[key].imdb);
    }
    if (_inflight["imdb:" + key]) return _inflight["imdb:" + key];
    var kind = _normType(mediaType) === "series" ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + kind + "/" + encodeURIComponent(String(tmdbId)) +
      "/external_ids?api_key=" + TMDB_KEY;
    _inflight["imdb:" + key] = _fetchJson(url).then(function (data) {
      var imdb = data && data.imdb_id && /^tt\d+$/.test(String(data.imdb_id)) ? String(data.imdb_id) : null;
      _imdbCache[key] = { t: now, imdb: imdb };
      delete _inflight["imdb:" + key];
      return imdb;
    });
    return _inflight["imdb:" + key];
  }
  function _sourceRows(base, imdbId, isSeries, season, episode) {
    var path = isSeries
      ? "series/" + encodeURIComponent(imdbId) + ":" + (parseInt(season, 10) || 1) + ":" + (parseInt(episode, 10) || 1) + ".json"
      : "movie/" + encodeURIComponent(imdbId) + ".json";
    return _fetchJson(base + path).then(function (data) {
      return (data && Array.isArray(data.subtitles)) ? data.subtitles : [];
    }).catch(function () { return []; });
  }
  function _normRow(t, sourceIdx) {
    if (!t || !t.url || typeof t.url !== "string") return null;
    var rawLang = String(t.lang || t.language || "").toLowerCase();
    var code = CODE_MAP[rawLang] || rawLang;
    if (!code) return null;
    var label = String(t.label || t.fileName || t.name || "");
    var hi = /-hi\b|\bhi\]|sdh|hearing[- ]impaired|\[hi\]/i.test(label) || /sdh/i.test(String(t.id || ""));
    var prio = code === "en" ? 0 : (code === "tl" || code === "fil") ? 1 : 2;
    return {
      url: String(t.url),
      lang: code,
      language: code,
      name: (NAME_MAP[code] || code) + (hi ? " (HI)" : "") + (sourceIdx > 0 ? " •" + sourceIdx : ""),
      _prio: prio,
      _hi: hi ? 0 : 1
    };
  }
  function _mergedRows(imdbId, mediaType, season, episode) {
    var isSeries = _normType(mediaType) === "series";
    var key = _normType(mediaType) + ":" + imdbId + ":" + (parseInt(season, 10) || 0) + ":" + (parseInt(episode, 10) || 0);
    var now = Date.now();
    if (_cache[key] && now - _cache[key].t < TTL_MS) return Promise.resolve(_cache[key].rows);
    if (_inflight[key]) return _inflight[key];
    var jobs = [];
    for (var i = 0; i < SUB_BASES.length; i++) {
      jobs.push(_sourceRows(SUB_BASES[i], imdbId, isSeries, season, episode));
    }
    _inflight[key] = Promise.all(jobs).then(function (lists) {
      var seen = {};
      var rows = [];
      for (var si = 0; si < lists.length; si++) {
        var list = lists[si] || [];
        for (var j = 0; j < list.length && rows.length < MAX_ROWS * 2; j++) {
          var row = _normRow(list[j], si);
          if (!row) continue;
          var dk = row.lang + "|" + row.url;
          if (seen[dk]) continue;
          seen[dk] = 1;
          rows.push(row);
        }
      }
      rows.sort(function (a, b) {
        if (a._prio !== b._prio) return a._prio - b._prio;
        if (a._hi !== b._hi) return a._hi - b._hi;
        return 0;
      });
      if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS);
      for (var k = 0; k < rows.length; k++) { delete rows[k]._prio; delete rows[k]._hi; }
      _cache[key] = { t: now, rows: rows };
      delete _inflight[key];
      return rows;
    }).catch(function () { delete _inflight[key]; return []; });
    return _inflight[key];
  }

  G.__nvMultisubs = {
    get: function (tmdbId, mediaType, season, episode) {
      try {
        return _resolveImdb(tmdbId, mediaType).then(function (imdb) {
          if (!imdb) return [];
          return _mergedRows(imdb, mediaType, season, episode);
        }).catch(function () { return []; });
      } catch (e) { return Promise.resolve([]); }
    }
  };
})();

(function () {
  var G = typeof globalThis !== "undefined" ? globalThis : this;
  var lane = G.__nvMultisubs;
  var orig = null;
  try { orig = module.exports && module.exports.getStreams; } catch (e) { orig = null; }
  if (!lane || typeof orig !== "function") return;
  module.exports.getStreams = function (videoId, mediaType, season, episode) {
    var rowsP;
    try {
      rowsP = Promise.resolve(orig.apply(this, arguments));
    } catch (e) {
      rowsP = Promise.resolve([]);
    }
    var subsP = lane.get(videoId, mediaType, season, episode).catch(function () { return []; });
    return Promise.all([rowsP.catch(function () { return []; }), subsP]).then(function (arr) {
      var rows = Array.isArray(arr[0]) ? arr[0] : [];
      var subs = Array.isArray(arr[1]) ? arr[1] : [];
      if (!rows.length || !subs.length) return rows;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r && (!r.subtitles || !r.subtitles.length)) r.subtitles = subs;
      }
      return rows;
    });
  };
})();

(function () {
  var G = typeof globalThis !== "undefined" ? globalThis : this;

  if (G.__nvStreamValidator) return;
  G.__nvStreamValidator = true;
  function isValidStreamUrl(u) {
    if (!u || typeof u !== "string") return false;
    var s = u.trim();
    if (s.length < 12) return false;
    if (/^magnet:/i.test(s)) {
      return /xt=urn:btih:[a-fA-F0-9]{40}/i.test(s) && !/\[object Object\]/i.test(s);
    }
    if (!/^https?:\/\//i.test(s)) return false;
    if (/^(data|blob|javascript):/i.test(s)) return false;
    if (/\[object Object\]|undefined|null|example\.com|placeholder|test-videos/i.test(s)) return false;
    if (s.indexOf(" ") >= 0) return false;
    if (!/^https?:\/\/[^\/]+\.[^\/]+/.test(s)) return false;

    if (/\/404\/|\/not-found|\/error\.html/i.test(s)) return false;
    return true;
  }
  function cleanHeaders(h) {
    if (!h || typeof h !== "object" || Array.isArray(h)) return undefined;
    var out = {};
    for (var k in h) {
      if (!Object.prototype.hasOwnProperty.call(h, k)) continue;
      var v = h[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
      else if (typeof v === "string" && !v.trim()) continue;
    }
    return Object.keys(out).length ? out : undefined;
  }
  function normalizeQuality(q) {
    var s = String(q || "").trim();
    if (!s || /^unknown$/i.test(s)) return "Auto";
    if (/^(auto|default)$/i.test(s)) return "Auto";
    return s;
  }
  function validateStreams(streams) {
    if (!Array.isArray(streams)) return streams;
    var seen = {};
    var out = [];
    for (var i = 0; i < streams.length; i++) {
      var r = streams[i];
      if (!r || !r.url || typeof r.url !== "string") continue;
      if (!isValidStreamUrl(r.url)) continue;
      var key = String(r.url).trim();
      if (seen[key]) continue;
      seen[key] = 1;

      if (r.headers === "" || r.headers === null) delete r.headers;
      else if (r.headers && typeof r.headers === "object") {
        var ch = cleanHeaders(r.headers);
        if (ch) r.headers = ch; else delete r.headers;
      }
      r.quality = normalizeQuality(r.quality);
      if (!r.name) r.name = r.title || "Stream";
      if (!r.title) r.title = r.name;
      out.push(r);
    }
    return out;
  }
  try {
    var orig = module.exports && module.exports.getStreams;
    if (typeof orig !== "function") return;
    module.exports.getStreams = function () {
      var args = arguments;
      try {
        var p = orig.apply(this, args);
        return Promise.resolve(p).then(function (rows) {
          return validateStreams(rows);
        }, function () { return []; });
      } catch (e) {
        return Promise.resolve([]);
      }
    };
  } catch (e) {}
})();

(function () {
    function nuvioDecode(value) {
        try {
            return decodeURIComponent(value);
        } catch (e) {
            return value;
        }
    }

    function nuvioUrlParts(url) {
        var path = String(url || '').split('?')[0].split('#')[0];
        var segments = path.split('/').filter(Boolean).map(nuvioDecode);
        var parts = [];
        var tail = segments.slice(-3);
        for (var i = 0; i < tail.length; i++) {
            if (/(?:2160|1080|720|480|360)p|bluray|web[-. ]?dl|webrip|hdtv|remux|x264|x265|hevc|avc|aac|dts|ddp|hdr|atmos/i.test(tail[i])) {
                parts.push(tail[i]);
            }
        }
        var last = tail.length ? tail[tail.length - 1] : '';
        if (/\.(?:mkv|mp4|m4v|avi|mov|webm|ts|m2ts|m3u8|mpd|iso)$/i.test(last)) {
            parts.push(last);
        }
        return parts;
    }

    function nuvioText(stream) {
        var parts = [];
        if (stream.title) parts.push(String(stream.title));
        if (stream.description) parts.push(String(stream.description));
        if (stream.name) parts.push(String(stream.name));
        if (stream.filename) parts.push(String(stream.filename));
        if (stream.file) parts.push(String(stream.file));
        if (stream.url) parts = parts.concat(nuvioUrlParts(stream.url));
        return parts.join(' ');
    }

    function nuvioQuality(text) {
        var value = String(text || '').toLowerCase();
        if (/2160p|4k|uhd/.test(value)) return '4K';
        if (/1080p|fhd/.test(value)) return '1080p';
        if (/720p/.test(value)) return '720p';
        if (/480p/.test(value)) return '480p';
        if (/360p/.test(value)) return '360p';
        return 'HD';
    }

    function nuvioHasQuality(name) {
        return /\b(?:4k|2160p?|1080p?|720p?|480p?|360p?|hd|sd)\b/i.test(String(name || ''));
    }

    function nuvioHasSize(name) {
        return /(?:\d+(?:\.\d+)?\s*(?:TB|GB|MB|KB))/i.test(String(name || ''));
    }

    function nuvioSpecificQuality(text) {
        var match = String(text || '').match(/\b(?:4k|2160p?|1080p?|720p?|480p?|360p?)\b/i);
        return match ? nuvioQuality(match[0]) : '';
    }

    function nuvioLanguages(text) {
        var defs = [
            ['English', /\benglish\b/i, /\b(?:ENG|EN)\b/],
            ['Hindi', /\bhindi\b/i, /\bHIN\b/],
            ['Korean', /\bkorean\b/i, /\bKOR\b/],
            ['Japanese', /\bjapanese\b/i, /\b(?:JAP|JPN)\b/],
            ['Chinese', /\b(?:chinese|mandarin)\b/i, /\b(?:CHI|CHS|CHT)\b/],
            ['Spanish', /\b(?:spanish|castellano|latino)\b/i, /\b(?:SPA|LAT)\b/],
            ['French', /\bfrench\b/i, /\b(?:FRE|FRA)\b/],
            ['German', /\bgerman\b/i, /\b(?:GER|DEU)\b/],
            ['Italian', /\bitalian\b/i, /\bITA\b/],
            ['Portuguese', /\bportuguese\b/i, /\bPOR\b/],
            ['Russian', /\brussian\b/i, /\bRUS\b/],
            ['Arabic', /\barabic\b/i, /\bARA\b/],
            ['Turkish', /\bturkish\b/i, /\b(?:TUR|TR)\b/],
            ['Thai', /\bthai\b/i, /\bTHA\b/],
            ['Tamil', /\btamil\b/i, /\bTAM\b/],
            ['Telugu', /\btelugu\b/i, /\bTEL\b/],
            ['Malayalam', /\bmalayalam\b/i, /\bMAL\b/],
            ['Kannada', /\bkannada\b/i, /\bKAN\b/],
            ['Bengali', /\bbengali\b/i, /\bBEN\b/],
            ['Punjabi', /\bpunjabi\b/i, /\bPUN\b/],
            ['Vietnamese', /\bvietnamese\b/i, /\bVIE\b/],
            ['Indonesian', /\bindonesian\b/i, /\bIND\b/],
            ['Filipino', /\b(?:filipino|tagalog)\b/i, /\bFIL\b/],
            ['Dutch', /\bdutch\b/i, /\b(?:DUT|NLD)\b/],
            ['Polish', /\bpolish\b/i, /\b(?:POL|PL)\b/],
            ['Swedish', /\bswedish\b/i, /\bSWE\b/],
            ['Norwegian', /\bnorwegian\b/i, /\bNOR\b/],
            ['Danish', /\bdanish\b/i, /\bDAN\b/],
            ['Finnish', /\bfinnish\b/i, /\bFIN\b/],
            ['Greek', /\bgreek\b/i, /\b(?:GRE|ELL)\b/],
            ['Hebrew', /\bhebrew\b/i, /\bHEB\b/],
            ['Ukrainian', /\bukrainian\b/i, /\bUKR\b/],
            ['Czech', /\bczech\b/i, /\b(?:CZE|CES)\b/],
            ['Hungarian', /\bhungarian\b/i, /\bHUN\b/],
            ['Romanian', /\bromanian\b/i, /\b(?:RUM|RON)\b/],
            ['Malay', /\bmalay\b/i, /\b(?:MAY|MSA)\b/],
            ['Persian', /\bpersian\b/i, /\b(?:PER|FAS)\b/]
        ];
        var out = [];
        for (var i = 0; i < defs.length; i++) {
            if ((defs[i][1].test(text) || defs[i][2].test(text)) && out.indexOf(defs[i][0]) === -1) {
                out.push(defs[i][0]);
            }
        }
        return out;
    }

    var NUVIO_FLAGS = {
        English: '🇬🇧', Hindi: '🇮🇳', Korean: '🇰🇷', Japanese: '🇯🇵', Chinese: '🇨🇳',
        Spanish: '🇪🇸', French: '🇫🇷', German: '🇩🇪', Italian: '🇮🇹', Portuguese: '🇵🇹',
        Russian: '🇷🇺', Arabic: '🇸🇦', Turkish: '🇹🇷', Thai: '🇹🇭', Tamil: '🇮🇳',
        Telugu: '🇮🇳', Malayalam: '🇮🇳', Kannada: '🇮🇳', Bengali: '🇧🇩', Punjabi: '🇮🇳',
        Vietnamese: '🇻🇳', Indonesian: '🇮🇩', Filipino: '🇵🇭', Dutch: '🇳🇱', Polish: '🇵🇱',
        Swedish: '🇸🇪', Norwegian: '🇳🇴', Danish: '🇩🇰', Finnish: '🇫🇮', Greek: '🇬🇷',
        Hebrew: '🇮🇱', Ukrainian: '🇺🇦', Czech: '🇨🇿', Hungarian: '🇭🇺', Romanian: '🇷🇴',
        Malay: '🇲🇾', Persian: '🇮🇷'
    };

    function nuvioFlag(name) {
        return NUVIO_FLAGS[name] || '';
    }

    function nuvioLanguageFromCode(code) {
        var names = {
            en: 'English', eng: 'English', ko: 'Korean', kor: 'Korean', ja: 'Japanese', jpn: 'Japanese',
            zh: 'Chinese', chi: 'Chinese', hi: 'Hindi', hin: 'Hindi', es: 'Spanish', spa: 'Spanish',
            fr: 'French', fre: 'French', fra: 'French', de: 'German', ger: 'German', deu: 'German',
            it: 'Italian', ita: 'Italian', pt: 'Portuguese', por: 'Portuguese', ru: 'Russian', rus: 'Russian',
            ar: 'Arabic', ara: 'Arabic', tr: 'Turkish', tur: 'Turkish', th: 'Thai', tha: 'Thai',
            ta: 'Tamil', tam: 'Tamil', te: 'Telugu', tel: 'Telugu', ml: 'Malayalam', mal: 'Malayalam',
            kn: 'Kannada', kan: 'Kannada', id: 'Indonesian', ind: 'Indonesian', tl: 'Filipino', fil: 'Filipino',
            vi: 'Vietnamese', vie: 'Vietnamese', nl: 'Dutch', dut: 'Dutch', nld: 'Dutch',
            pl: 'Polish', pol: 'Polish', sv: 'Swedish', swe: 'Swedish', da: 'Danish', dan: 'Danish',
            no: 'Norwegian', nor: 'Norwegian', fi: 'Finnish', fin: 'Finnish', el: 'Greek', gre: 'Greek',
            ell: 'Greek', he: 'Hebrew', heb: 'Hebrew', uk: 'Ukrainian', ukr: 'Ukrainian',
            cs: 'Czech', cze: 'Czech', ces: 'Czech', hu: 'Hungarian', hun: 'Hungarian',
            ro: 'Romanian', rum: 'Romanian', ron: 'Romanian', ms: 'Malay', may: 'Malay', msa: 'Malay',
            fa: 'Persian', per: 'Persian', fas: 'Persian'
        };
        return names[String(code || '').toLowerCase()] || '';
    }

    function nuvioLanguage(text, langs) {
        var dual = /\bdual[-. ]?audio\b/i.test(text) || /\bDUAL\b/.test(text) || (/\bdual\b/i.test(text) && langs.length >= 2);
        var multi = /\bmulti[-. ]?audio\b/i.test(text) || /\bMULTI\b/.test(text) || (/\bmulti\b/i.test(text) && langs.length >= 2);
        var prefix = dual ? 'Dual Audio' : (multi ? 'Multi-Audio' : '');
        if (langs.length > 3) return prefix || 'Multi-Audio';
        var list = langs.slice(0, 3).map(function (name) {
            var flag = nuvioFlag(name);
            return (flag ? flag + ' ' : '') + name;
        }).join(' + ');
        if (prefix && list) return prefix + ' (' + list + ')';
        if (prefix) return prefix;
        return list;
    }

    function nuvioSize(stream, text) {
        var match = String(stream.size || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
        if (!match) match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
        return match ? match[1] + ' ' + match[2].toUpperCase() : '';
    }

    function nuvioParse(text) {
        var info = {
            quality: nuvioQuality(text),
            source: '',
            codec: '',
            bitDepth: '',
            hdr: '',
            audio: '',
            subs: '',
            container: '',
            language: '',
            languages: []
        };

        if (/\bremux\b/i.test(text)) info.source = /\b(?:bluray|blu-ray|bdrip|brrip|bdremux)\b/i.test(text) ? 'BluRay REMUX' : 'REMUX';
        else if (/\b(?:bluray|blu-ray|bdrip|brrip|bdremux)\b/i.test(text)) info.source = 'BluRay';
        else if (/\bweb[-. ]?dl\b/i.test(text)) info.source = 'WEB-DL';
        else if (/\bweb[-. ]?rip\b/i.test(text)) info.source = 'WEBRip';
        else if (/\bhdtv\b/i.test(text)) info.source = 'HDTV';
        else if (/\b(?:dvdrip|dvdscr)\b/i.test(text)) info.source = 'DVDRip';
        else if (/\b(?:hdcam|camrip|cam-?rip|telesync|telecine)\b/i.test(text)) info.source = 'CAM';

        if (/\bav1\b/i.test(text)) info.codec = 'AV1';
        else if (/\b(?:hevc|x265|h\.?265)\b/i.test(text)) info.codec = 'HEVC';
        else if (/\b(?:x264|h\.?264|avc)\b/i.test(text)) info.codec = 'H.264';
        else if (/\bvp9\b/i.test(text)) info.codec = 'VP9';
        else if (/\b(?:xvid|divx)\b/i.test(text)) info.codec = 'XviD';
        else if (/\bmpeg-?2\b/i.test(text)) info.codec = 'MPEG-2';

        if (/\b10[ .-]?bit\b/i.test(text)) info.bitDepth = '10-bit';
        else if (/\b8[ .-]?bit\b/i.test(text)) info.bitDepth = '8-bit';

        if (/\b(?:dolby[ ._-]?vision|dovi)\b/i.test(text) || /[._-]dv[._-]/i.test(text)) info.hdr = 'DV';
        else if (/\bhdr10\+\b/i.test(text)) info.hdr = 'HDR10+';
        else if (/\bhdr10\b/i.test(text)) info.hdr = 'HDR10';
        else if (/\bhdr\b/i.test(text)) info.hdr = 'HDR';
        else if (/\bhlg\b/i.test(text)) info.hdr = 'HLG';

        var channels = '';
        if (/\b7[ .]1\b/i.test(text)) channels = '7.1';
        else if (/\b5[ .]1\b/i.test(text)) channels = '5.1';
        else if (/\b2[ .]0\b/i.test(text)) channels = '2.0';
        var atmos = /\batmos\b/i.test(text);
        if (/\btruehd\b/i.test(text)) info.audio = 'TrueHD' + (channels ? ' ' + channels : '');
        else if (/\bdts[-. ]?hd(?:\s*ma)?\b/i.test(text)) info.audio = 'DTS-HD MA' + (channels ? ' ' + channels : '');
        else if (/\bdts[-. ]?x\b/i.test(text)) info.audio = 'DTS:X' + (channels ? ' ' + channels : '');
        else if (/\bdts\b/i.test(text)) info.audio = 'DTS' + (channels ? ' ' + channels : '');
        else if (/\b(?:ddp|dd\+|eac3)\b/i.test(text)) info.audio = 'DDP' + (channels ? ' ' + channels : '');
        else if (/\b(?:dd|ac3|dolby[ .]?digital)\b/i.test(text)) info.audio = 'DD' + (channels ? ' ' + channels : '');
        else if (/\baac\b/i.test(text)) info.audio = 'AAC' + (channels ? ' ' + channels : '');
        else if (/\bopus\b/i.test(text)) info.audio = 'Opus' + (channels ? ' ' + channels : '');
        else if (/\bflac\b/i.test(text)) info.audio = 'FLAC' + (channels ? ' ' + channels : '');
        else if (/\bmp3\b/i.test(text)) info.audio = 'MP3';
        if (atmos && info.audio && info.audio.indexOf('Atmos') === -1) info.audio += ' Atmos';
        else if (atmos && !info.audio) info.audio = 'Atmos';

        if (/\b(?:multi[- ]?sub|softsub|hardsub|subbed)\b/i.test(text)) info.subs = 'Multi-Sub';
        else if (/\bsubs?\b/i.test(text)) info.subs = 'Sub';
        if (/\b(?:dubbed|dub)\b/i.test(text)) info.subs = info.subs ? info.subs + ' + Dub' : 'Dub';

        var ext = String(text || '').match(/\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|m3u8|mpd|iso)$/i);
        if (ext) {
            var container = ext[1].toUpperCase();
            if (container === 'M3U8') container = 'HLS';
            else if (container === 'MPD') container = 'DASH';
            info.container = container;
        }

        info.languages = nuvioLanguages(text);
        info.language = nuvioLanguage(text, info.languages);
        return info;
    }

    function nuvioEscape(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function nuvioName(stream, provider, quality, size) {
        var name = String(stream.name || stream.title || '').trim();
        if (!name) name = provider;
        var invisible = name.match(/^[\u200b-\u200f\ufeff]+/);
        var prefix = invisible ? invisible[0] : '';
        if (invisible) name = name.slice(prefix.length);
        var hasProvider = new RegExp('(^|[^a-z0-9])' + nuvioEscape(provider) + '([^a-z0-9]|$)', 'i').test(name);
        if (!hasProvider && name.length < 40) name = provider + ' • ' + name;
        if (quality && quality !== 'HD') {
            var existingQuality = nuvioSpecificQuality(name);
            if (!existingQuality) {
                if (/\b(?:HD|SD)\b/i.test(name)) name = name.replace(/\b(?:HD|SD)\b/i, quality);
                if (!nuvioSpecificQuality(name)) name += ' • ' + quality;
            } else if (existingQuality !== quality) {
                name = name.replace(/\b(?:4k|2160p?|1080p?|720p?|480p?|360p?)\b/i, quality);
            }
        }
        if (size && !nuvioHasSize(name)) name += ' • ' + size;
        return prefix + name;
    }

    function nuvioDetails(info, size) {
        var line1 = [];
        if (info.source) line1.push('🎥 ' + info.source);
        if (info.codec) line1.push('🎞️ ' + info.codec);
        if (info.bitDepth) line1.push('📺 ' + info.bitDepth);
        if (info.hdr) line1.push('🌈 ' + info.hdr);
        if (info.subs) line1.push('💬 ' + info.subs);
        var line2 = [];
        if (info.audio) line2.push('🔊 ' + info.audio);
        if (size) line2.push('📦 ' + size);
        if (info.container) line2.push('💻 ' + info.container);
        var line3 = [];
        if (info.languages && info.languages.length) line3.push('🗣️ ' + info.language);
        return [line1.join(' • '), line2.join(' • '), line3.join(' • ')].filter(Boolean).join('\n');
    }

    function nuvioEnrich(stream, provider) {
        if (!stream || typeof stream !== 'object' || stream._nuvioFormatted) return stream;
        var text = nuvioText(stream);
        var info = nuvioParse(text);
        var size = nuvioSize(stream, text);
        var quality = info.quality;
        if (quality === 'HD' && stream.quality) quality = nuvioQuality(stream.quality);
        var language = info.language || (typeof stream.language === 'string' ? stream.language.trim() : '');
        var name = nuvioName(stream, provider, quality, size);
        var rich = String(stream.description || stream.title || '').trim();
        var richLike = rich.indexOf('\n') !== -1 && rich.indexOf('🎥') !== -1 && rich.indexOf('🎞️') !== -1 && (rich.indexOf('📦') !== -1 || rich.indexOf('🔊') !== -1);
        var details = richLike ? rich : nuvioDetails(info, size);
        if (!details && !richLike) {
            var fallback = [];
            var typeText = String(stream.type || '') + ' ' + String(stream.url || '');
            var container = info.container;
            if (!container) {
                if (/hls|m3u8/i.test(typeText)) container = 'HLS';
                else if (/dash|mpd/i.test(typeText)) container = 'DASH';
            }
            if (container) fallback.push('💻 ' + container);
            var streamLang = typeof stream.language === 'string' ? stream.language.trim() : '';
            var langLabel = info.language || nuvioLanguageFromCode(streamLang) || streamLang;
            if (langLabel && !(info.languages && info.languages.length)) {
                var flag = nuvioFlag(langLabel);
                fallback.push('🗣️ ' + (flag ? flag + ' ' : '') + langLabel);
            }
            details = fallback.join('\n');
        }
        var copy = {};
        for (var key in stream) {
            if (Object.prototype.hasOwnProperty.call(stream, key)) copy[key] = stream[key];
        }
        copy.name = name;
        if (richLike) {
            copy.quality = '';
        } else if (quality && quality !== 'HD') {
            copy.quality = quality;
        } else if (!copy.quality) {
            copy.quality = quality;
        }
        if (details) copy.size = details;
        else if (size) copy.size = size;
        var hasLangLine = details && details.indexOf('🗣️') !== -1;
        if (richLike || hasLangLine) {
            copy.language = '';
        } else if (language) {
            copy.language = language;
        }
        copy._nuvioFormatted = true;
        return copy;
    }

    function nuvioRank(stream) {
        var text = String(stream.quality || '') + ' ' + String(stream.name || '');
        if (/8k|4320/.test(text)) return 4320;
        var quality = nuvioQuality(text);
        if (quality === '4K') return 2160;
        if (quality === '1080p') return 1080;
        if (quality === '720p') return 720;
        if (quality === '480p') return 480;
        if (quality === '360p') return 360;
        return 0;
    }

    function nuvioMB(stream) {
        var match = String(stream.size || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i) || String(stream.name || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
        if (!match) return 0;
        var value = parseFloat(match[1]);
        var unit = match[2].toUpperCase();
        if (unit === 'TB') return value * 1024 * 1024;
        if (unit === 'GB') return value * 1024;
        if (unit === 'MB') return value;
        return value / 1024;
    }

    function nuvioEnrichStreams(rows, provider) {
        if (!Array.isArray(rows)) return rows;
        var indexed = rows.map(function (row, index) {
            return { stream: nuvioEnrich(row, provider), index: index };
        });
        indexed.sort(function (a, b) {
            var ra = nuvioRank(a.stream);
            var rb = nuvioRank(b.stream);
            if (ra !== rb) return rb - ra;
            var sa = nuvioMB(a.stream);
            var sb = nuvioMB(b.stream);
            if (sa !== sb) return sb - sa;
            return a.index - b.index;
        });
        return indexed.map(function (item) {
            return item.stream;
        });
    }

    try {
        var nuvioProviderName = "Miruro";
        var nuvioExports = (typeof module !== 'undefined' && module.exports) ? module.exports : null;
        if (nuvioExports && typeof nuvioExports.getStreams === 'function') {
            var nuvioBase = nuvioExports;
            var nuvioWrapped = Object.create(nuvioBase);
            Object.defineProperty(nuvioWrapped, 'getStreams', {
                value: function (tmdbId, mediaType, season, episode) {
                    return Promise.resolve(nuvioBase.getStreams.call(nuvioBase, tmdbId, mediaType, season, episode)).then(function (rows) {
                        return nuvioEnrichStreams(rows, nuvioProviderName);
                    });
                },
                enumerable: true,
                configurable: true,
                writable: true
            });
            module.exports = nuvioWrapped;
        } else if (typeof globalThis !== 'undefined' && typeof globalThis.getStreams === 'function') {
            var nuvioGlobalBase = globalThis.getStreams;
            globalThis.getStreams = function (tmdbId, mediaType, season, episode) {
                return Promise.resolve(nuvioGlobalBase.call(globalThis, tmdbId, mediaType, season, episode)).then(function (rows) {
                    return nuvioEnrichStreams(rows, nuvioProviderName);
                });
            };
        }
    } catch (e) {}
})();
