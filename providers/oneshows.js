var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36";
var SITE = "https://www.1shows.org";
var EMBED_API = "https://api.viduki.net/embed_providers?site=1shows";
var SUBS_API = "https://rezesubs.com";
var ENC_API = "https://enc-dec.app/api";
var VIDROCK_API = "https://vidrock.net/api";
var VIDROCK_KEY = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
var VIDY_API = "https://api.wecollege.net";
var VIDY_SITE = "https://www.vidy.st";
var VIDFAST_BASE = "https://vidfast.pro";
var VIDLINK_BASE = "https://vidlink.pro";
var VIDY_SERVERS = ["miami", "boise", "atlanta", "phoenix", "delhi", "dallas", "austin", "seattle", "paris", "munich", "orlando", "reno", "oakland", "vegas", "cancun", "tampa"];
var REQUEST_TIMEOUT = 20000;

var PROVIDER_HEADERS = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Origin": SITE,
  "Referer": SITE + "/"
};

var SUBS_HEADERS = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Origin": "https://www.viduki.net",
  "Referer": "https://www.viduki.net/"
};

var VIDY_HEADERS = {
  "User-Agent": MOBILE_UA,
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": VIDY_SITE + "/",
  "Origin": VIDY_SITE
};

var DEFAULT_PROVIDERS = [
  { id: "MAIN_2", label: "Main 2", movie: "https://vidy.st/movie/{id}", tv: "https://vidy.st/tv/{id}/{s}/{e}" },
  { id: "MAIN_3", label: "Main 3", movie: "https://vidfast.pro/movie/{id}", tv: "https://vidfast.pro/tv/{id}/{s}/{e}" },
  { id: "MAIN_4", label: "Main 4", movie: "https://vidlink.pro/movie/{id}", tv: "https://vidlink.pro/tv/{id}/{s}/{e}" },
  { id: "MAIN_5", label: "Main 5", movie: "https://vidrock.to/movie/{id}", tv: "https://vidrock.to/tv/{id}/{s}/{e}" }
];

function enabled() {
  try {
    var settings = globalThis.SCRAPER_SETTINGS || {};
    return settings.oneshows !== false;
  } catch (e) {
    return true;
  }
}

function fetchText(url, options, timeoutMs) {
  var opts = Object.assign({}, options || {});
  var controller = null;
  if (typeof AbortController !== "undefined" && !opts.signal) {
    controller = new AbortController();
    opts.signal = controller.signal;
  }
  var request = fetch(url, opts).then(function (res) {
    return res.text().then(function (body) {
      if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
      return body;
    });
  });
  if (typeof setTimeout !== "function") return request;
  var timer = null;
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      if (controller) {
        try { controller.abort(); } catch (e) {}
      }
      reject(new Error("timeout " + url));
    }, timeoutMs || REQUEST_TIMEOUT);
  });
  return Promise.race([request, timeout]).then(function (value) {
    if (timer) clearTimeout(timer);
    return value;
  }, function (error) {
    if (timer) clearTimeout(timer);
    throw error;
  });
}

function fetchJson(url, options, timeoutMs) {
  return fetchText(url, options, timeoutMs).then(function (body) {
    return JSON.parse(body);
  });
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value));
}

function base64Bytes(value) {
  var text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  var pad = text.length % 4;
  if (pad === 2) text += "==";
  else if (pad === 3) text += "=";
  else if (pad === 1) throw new Error("invalid base64");
  var raw = atob(text);
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function hexBytes(value) {
  var text = String(value || "");
  var out = new Uint8Array(text.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(text.substr(i * 2, 2), 16);
  return out;
}

function qualityOf(value) {
  var text = String(value || "");
  if (/2160p|4k|uhd/i.test(text)) return "4K";
  if (/1080p|fhd/i.test(text)) return "1080p";
  if (/720p/i.test(text)) return "720p";
  if (/480p/i.test(text)) return "480p";
  if (/360p/i.test(text)) return "360p";
  return "";
}

function languageOf(value) {
  var text = String(value || "").toLowerCase();
  if (/hindi/.test(text)) return "hi";
  if (/tamil/.test(text)) return "ta";
  if (/telugu/.test(text)) return "te";
  if (/malayalam/.test(text)) return "ml";
  if (/kannada/.test(text)) return "kn";
  if (/english/.test(text)) return "en";
  if (/japanese/.test(text)) return "ja";
  if (/korean/.test(text)) return "ko";
  if (/chinese|mandarin/.test(text)) return "zh";
  if (/spanish/.test(text)) return "es";
  if (/french/.test(text)) return "fr";
  if (/german/.test(text)) return "de";
  if (/arabic/.test(text)) return "ar";
  if (/turkish/.test(text)) return "tr";
  return "";
}

function providerHost(provider) {
  var raw = String((provider && (provider.movie || provider.tv)) || "");
  var match = raw.match(/^https?:\/\/([^/]+)/i);
  return match ? match[1].toLowerCase().replace(/^www\./, "") : "";
}

function resolverId(host) {
  if (host === "vidy.st") return "vidy";
  if (host === "vidfast.pro" || host === "vidfast.vc") return "vidfast";
  if (host === "vidlink.pro") return "vidlink";
  if (host === "vidrock.to") return "vidrock";
  return "";
}

function loadProviders() {
  return fetchJson(EMBED_API, { headers: PROVIDER_HEADERS }, 12000).then(function (data) {
    var list = data && data.providers;
    return Array.isArray(list) && list.length ? list : DEFAULT_PROVIDERS;
  }).catch(function () {
    return DEFAULT_PROVIDERS;
  });
}

function subtitleRank(name) {
  var value = String(name || "").toLowerCase();
  var order = ["english", "turkish", "arabic", "french", "spanish", "german", "italian", "portuguese", "hindi", "tamil", "telugu", "russian", "japanese", "korean", "chinese"];
  var index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function fetchSubtitles(tmdbId, type, season, episode) {
  var url = type === "tv"
    ? SUBS_API + "/data/subs/tv/" + encodeURIComponent(tmdbId) + "/" + season + "/" + episode
    : SUBS_API + "/data/subs/movie/" + encodeURIComponent(tmdbId);
  return fetchJson(url, { headers: SUBS_HEADERS }, 12000).then(function (data) {
    var list = (data && data.subtitles) || [];
    var out = [];
    var seen = {};
    var perLanguage = {};
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || !item.url) continue;
      var lang = String(item.lang || "und").toLowerCase();
      if ((perLanguage[lang] || 0) >= 2) continue;
      var full = /^https?:\/\//i.test(item.url) ? item.url : SUBS_API + item.url;
      if (seen[full]) continue;
      perLanguage[lang] = (perLanguage[lang] || 0) + 1;
      seen[full] = true;
      out.push({
        url: full,
        language: lang,
        name: lang.charAt(0).toUpperCase() + lang.slice(1),
        headers: SUBS_HEADERS
      });
    }
    out.sort(function (a, b) {
      return subtitleRank(a.language) - subtitleRank(b.language);
    });
    return out.slice(0, 14);
  }).catch(function () {
    return [];
  });
}

function attachSubtitles(rows, subtitles) {
  if (!subtitles.length) return rows;
  return rows.map(function (row) {
    var merged = [];
    var seen = {};
    (row.subtitles || []).concat(subtitles).forEach(function (sub) {
      if (!sub || !sub.url || seen[sub.url]) return;
      seen[sub.url] = true;
      merged.push(sub);
    });
    var copy = Object.assign({}, row);
    copy.subtitles = merged.slice(0, 16);
    return copy;
  });
}

function probeQuality(url) {
  if (!/\.m3u8(\?|$)/i.test(url)) return Promise.resolve(qualityOf(url));
  return fetchText(url, { headers: { "User-Agent": UA } }, 6000).then(function (body) {
    var best = 0;
    var match;
    var regex = /RESOLUTION=\d+x(\d+)/gi;
    while ((match = regex.exec(body)) !== null) {
      var height = parseInt(match[1], 10);
      if (height > best) best = height;
    }
    if (!best) return "";
    if (best >= 2160) return "4K";
    if (best >= 1080) return "1080p";
    if (best >= 720) return "720p";
    if (best >= 480) return "480p";
    return "360p";
  }).catch(function () {
    return "";
  });
}

function vidrockDecrypt(value) {
  var raw = base64Bytes(value);
  if (raw.length < 28) return Promise.reject(new Error("ciphertext too short"));
  var iv = raw.subarray(0, 12);
  var payload = raw.subarray(12);
  return crypto.subtle.importKey("raw", hexBytes(VIDROCK_KEY), { name: "AES-GCM" }, false, ["decrypt"]).then(function (key) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, payload);
  }).then(function (buffer) {
    return new TextDecoder().decode(buffer);
  });
}

function vidrockGet(tmdbId, type, season, episode) {
  var url = type === "tv"
    ? VIDROCK_API + "/tv/" + encodeURIComponent(tmdbId) + "/" + season + "/" + episode
    : VIDROCK_API + "/movie/" + encodeURIComponent(tmdbId);
  var headers = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://vidrock.to",
    "Referer": "https://vidrock.to/"
  };
  return fetchJson(url, { headers: headers }, 20000).then(function (data) {
    var jobs = [];
    Object.keys(data || {}).forEach(function (server) {
      var item = data[server];
      if (!item || !item.url || typeof item !== "object") return;
      jobs.push(vidrockDecrypt(item.url).then(function (streamUrl) {
        if (!/^https?:\/\//i.test(streamUrl)) return null;
        return probeQuality(streamUrl).then(function (quality) {
          return {
            name: "VidRock " + server,
            title: "VidRock " + server + " · " + (item.language || "Original audio"),
            url: streamUrl,
            quality: quality || "Auto",
            language: languageOf(item.language) || undefined,
            headers: {},
            type: item.type === "hls" || /\.m3u8(\?|$)/i.test(streamUrl) ? "hls" : undefined
          };
        });
      }).catch(function () {
        return null;
      }));
    });
    return Promise.all(jobs).then(function (rows) {
      return rows.filter(Boolean);
    });
  }).catch(function () {
    return [];
  });
}

function vidfastPageUrl(tmdbId, type, season, episode) {
  if (type === "tv") return VIDFAST_BASE + "/tv/" + encodeURIComponent(tmdbId) + "/" + season + "/" + episode + "/";
  return VIDFAST_BASE + "/movie/" + encodeURIComponent(tmdbId) + "/";
}

function vidfastHeaders(extra) {
  return Object.assign({
    "User-Agent": UA,
    "Accept": "*/*",
    "Referer": "https://vidfast.vc/",
    "X-Requested-With": "XMLHttpRequest"
  }, extra || {});
}

function vidfastDecrypt(text) {
  return fetchJson(ENC_API + "/dec-vidfast", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ text: text })
  }, 20000).then(function (data) {
    return data && data.result;
  });
}

function vidfastResolveServer(item, streamBase, headers) {
  return fetchText(streamBase + "/" + item.data, { method: "POST", headers: headers }, 20000).then(function (encrypted) {
    if (!encrypted) return null;
    return vidfastDecrypt(encrypted).then(function (data) {
      if (!data || !data.url) return null;
      var quality = qualityOf(String(item.name || "") + " " + String(item.description || "")) || "Auto";
      var subtitles = (data.tracks || []).filter(function (track) {
        return track && track.file;
      }).map(function (track) {
        return {
          url: track.file,
          language: track.language || track.label || "en",
          name: track.label || "Subtitle"
        };
      });
      return {
        name: "VidFast " + (item.name || "Server"),
        title: (data.title || "") + " [" + quality + "] " + (item.description || ""),
        url: data.url,
        quality: quality,
        headers: { "User-Agent": UA, "Referer": "https://vidfast.vc/" },
        subtitles: subtitles
      };
    });
  });
}

function vidfastGet(tmdbId, type, season, episode) {
  return fetchText(vidfastPageUrl(tmdbId, type, season, episode), {
    headers: { "User-Agent": UA, "Referer": VIDFAST_BASE + "/" }
  }, 20000).then(function (page) {
    var match = page.match(/\\"(?:en|token)\\"\s*:\s*\\?"([^"\\]+)/);
    if (!match) return [];
    return fetchJson(ENC_API + "/enc-vidfast?text=" + encodeURIComponent(match[1]) + "&stage=1", {}, 20000).then(function (first) {
      var stage = first && first.result;
      if (!stage || !stage.stage1) return [];
      var headers = vidfastHeaders({ "X-CSRF-Token": stage.token });
      return fetchText(stage.stage1, { method: "POST", headers: headers }, 20000).then(function (text) {
        return fetchJson(ENC_API + "/enc-vidfast?text=" + encodeURIComponent(text) + "&stage=2", {}, 20000).then(function (second) {
          var state = second && second.result;
          if (!state || !state.servers || !state.stream) return [];
          headers["X-CSRF-Token"] = state.token || "";
          return fetchText(state.servers, { method: "POST", headers: headers }, 20000).then(function (serversEnc) {
            return vidfastDecrypt(serversEnc).then(function (servers) {
              if (!Array.isArray(servers)) return [];
              return Promise.all(servers.map(function (server) {
                return vidfastResolveServer(server, state.stream, headers).catch(function () {
                  return null;
                });
              })).then(function (rows) {
                var seen = {};
                return rows.filter(function (row) {
                  if (!row || !row.url || seen[row.url]) return false;
                  seen[row.url] = true;
                  return true;
                });
              });
            });
          });
        });
      });
    });
  }).catch(function () {
    return [];
  });
}

function vidlinkGet(tmdbId, type, season, episode) {
  var headers = {
    "User-Agent": MOBILE_UA,
    "Connection": "keep-alive",
    "Referer": VIDLINK_BASE + "/",
    "Origin": VIDLINK_BASE
  };
  return fetchJson(ENC_API + "/enc-vidlink?text=" + encodeURIComponent(String(tmdbId)), {}, 15000).then(function (data) {
    var enc = data && data.result;
    if (!enc) return [];
    var url = type === "tv"
      ? VIDLINK_BASE + "/api/b/tv/" + enc + "/" + season + "/" + episode
      : VIDLINK_BASE + "/api/b/movie/" + enc;
    return fetchJson(url, { headers: headers }, 20000).then(function (json) {
      var stream = (json && json.stream) || json;
      if (!stream) return [];
      var out = [];
      var qualities = stream.qualities || {};
      Object.keys(qualities).forEach(function (key) {
        var item = qualities[key] || {};
        if (!item.url) return;
        var quality = /^\d+$/.test(key) ? (String(key) === "2160" ? "4K" : String(key) + "p") : (qualityOf(key) || qualityOf(item.url) || "Auto");
        out.push({
          name: "VidLink " + quality,
          title: "VidLink " + quality,
          url: item.url,
          quality: quality,
          headers: item.headers || {},
          type: /\.m3u8(\?|$)/i.test(item.url) ? "hls" : undefined
        });
      });
      var subtitles = (stream.captions || []).filter(function (caption) {
        return caption && caption.url;
      }).map(function (caption) {
        return {
          url: caption.url,
          language: caption.language || "en",
          name: (caption.language || "Subtitle") + " [VidLink]"
        };
      });
      if (subtitles.length) {
        out = out.map(function (row) {
          var copy = Object.assign({}, row);
          copy.subtitles = subtitles.slice(0, 12);
          return copy;
        });
      }
      return out;
    });
  }).catch(function () {
    return [];
  });
}

var VIDY_K = 2654435769;
var VIDY_A0 = 2779096485;

function vidyImul(a, b) { return Math.imul(a, b) >>> 0; }
function vidyRotl(x, r) {
  var shift = r & 31;
  return shift === 0 ? x >>> 0 : (((x << shift) | (x >>> (32 - shift))) >>> 0);
}
function vidyMix(value) {
  var x = value >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = vidyImul(x, 2246822507);
  x = (x ^ (x >>> 13)) >>> 0;
  x = vidyImul(x, 3266489909);
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}
function vidyFnv1a(value) {
  var hash = 2166136261;
  var bytes = utf8Bytes(value);
  for (var i = 0; i < bytes.length; i++) hash = vidyImul((hash ^ bytes[i]) >>> 0, 16777619);
  return vidyMix(hash);
}
function vidyKeystream(seed, tmdbId, length) {
  var state = vidyMix((vidyFnv1a(seed) ^ vidyMix((tmdbId >>> 0) ^ VIDY_K)) >>> 0) >>> 0;
  var slots = new Array(61).fill(0);
  var defined = new Array(61).fill(false);
  var cursor = state;
  for (var round = 0; round < 8; round++) {
    var index = cursor % 61;
    var rotated = vidyRotl((cursor + VIDY_K) >>> 0, 7 + (7 & round));
    slots[index] = (rotated ^ vidyMix(rotated)) >>> 0;
    defined[index] = true;
    cursor = vidyMix((rotated + index) >>> 0) >>> 0;
  }
  var accumulator = vidyMix(VIDY_A0 ^ cursor) >>> 0;
  var stream = new Uint8Array(length);
  var n = accumulator;
  var counter = 0;
  var i = 0;
  while (i < length) {
    var slot = n % 61;
    var inner = (slots[slot] ^ vidyImul(VIDY_K, counter + 1)) >>> 0;
    var mask = defined[slot] ? -1 : 0;
    var mixed = ((n ^ inner) | (n & inner & mask)) >>> 0;
    var x = (vidyRotl((mixed + n) >>> 0, 31 & slot) ^ vidyRotl(n, 31 & ((slot * 7) & 31))) >>> 0;
    n = vidyMix((x + VIDY_K) >>> 0) >>> 0;
    slots[slot] = n;
    defined[slot] = true;
    stream[i++] = n & 0xFF;
    if (i < length) stream[i++] = (n >>> 8) & 0xFF;
    if (i < length) stream[i++] = (n >>> 16) & 0xFF;
    if (i < length) stream[i++] = (n >>> 24) & 0xFF;
    counter++;
  }
  return stream;
}
function vidyDecrypt(payload, seed, tmdbId) {
  var cipher = base64Bytes(payload);
  var stream = vidyKeystream(seed, tmdbId >>> 0, cipher.length);
  for (var i = 0; i < cipher.length; i++) cipher[i] ^= stream[i];
  if (String.fromCharCode(cipher[0], cipher[1], cipher[2], cipher[3]) !== "mvm1") throw new Error("decrypt failed");
  return new TextDecoder().decode(cipher.subarray(4));
}

function vidyQuality(source) {
  var quality = String((source && source.quality) || "");
  var match = quality.match(/(\d{3,4})/);
  if (match) return match[1] + "p";
  if (/4k|2160/i.test(quality)) return "2160p";
  return "Auto";
}

function vidySubtitles(items) {
  var out = [];
  var seen = {};
  if (!Array.isArray(items)) return out;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item) continue;
    var url = item.url || item.file || item.src;
    if (!url || seen[url]) continue;
    seen[url] = true;
    out.push({
      url: url,
      language: item.srclang || item.lang || item.language || "und",
      name: item.label || item.language || item.lang || "Subtitle",
      headers: VIDY_HEADERS
    });
  }
  return out;
}

function vidyServer(server, tmdbId, type, season, episode, seed) {
  var query = [
    "mediaType=" + encodeURIComponent(type),
    "tmdbId=" + encodeURIComponent(tmdbId),
    "enc=2",
    "seed=" + encodeURIComponent(seed),
    "title="
  ];
  if (type === "tv") {
    query.push("seasonId=" + encodeURIComponent(String(season)));
    query.push("episodeId=" + encodeURIComponent(String(episode)));
  }
  return fetchText(VIDY_API + "/" + server + "/sources?" + query.join("&"), { headers: VIDY_HEADERS }, 9000).then(function (text) {
    var data = JSON.parse(vidyDecrypt(text, seed, Number(tmdbId)));
    var subtitles = vidySubtitles(data && data.subtitles);
    var sources = (data && data.sources) || [];
    var rows = [];
    for (var i = 0; i < sources.length; i++) {
      var source = sources[i];
      if (!source || !/^https?:\/\//i.test(String(source.url || ""))) continue;
      var quality = vidyQuality(source);
      var language = languageOf(source.quality);
      rows.push({
        name: "Vidy " + server + " " + (language ? source.quality : quality),
        title: "Vidy " + (language ? source.quality + " audio" : quality) + " · " + server,
        url: source.url,
        quality: quality,
        language: language || undefined,
        headers: VIDY_HEADERS,
        type: /\.m3u8(\?|$)/i.test(source.url) ? "hls" : undefined,
        subtitles: subtitles
      });
    }
    return rows;
  }).catch(function () {
    return [];
  });
}

function vidyGet(tmdbId, type, season, episode) {
  return fetchJson(VIDY_API + "/seed?mediaId=" + encodeURIComponent(tmdbId), { headers: VIDY_HEADERS }, 8000).then(function (data) {
    if (!data || !data.seed) throw new Error("no vidy seed");
    return Promise.all(VIDY_SERVERS.map(function (server) {
      return vidyServer(server, tmdbId, type, season, episode, data.seed);
    })).then(function (groups) {
      var out = [];
      var seen = {};
      groups.forEach(function (rows) {
        rows.forEach(function (row) {
          if (!row.url || seen[row.url]) return;
          seen[row.url] = true;
          out.push(row);
        });
      });
      return out;
    });
  }).catch(function () {
    return [];
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!enabled()) return Promise.resolve([]);
  var id = String(tmdbId || "").trim();
  if (!id) return Promise.resolve([]);
  var type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
  var sea = parseInt(season, 10) || 1;
  var ep = parseInt(episode, 10) || 1;

  return Promise.all([
    loadProviders(),
    fetchSubtitles(id, type, sea, ep)
  ]).then(function (results) {
    var providers = results[0];
    var subtitles = results[1];
    var used = {};
    var jobs = [];

    providers.forEach(function (provider) {
      var host = providerHost(provider);
      var resolver = resolverId(host);
      if (!resolver || used[resolver]) return;
      used[resolver] = true;
      var label = provider && provider.label ? String(provider.label) : resolver;
      var job = null;
      if (resolver === "vidy") job = vidyGet(id, type, sea, ep);
      else if (resolver === "vidfast") job = vidfastGet(id, type, sea, ep);
      else if (resolver === "vidlink") job = vidlinkGet(id, type, sea, ep);
      else if (resolver === "vidrock") job = vidrockGet(id, type, sea, ep);
      if (!job) return;
      jobs.push(job.catch(function () {
        return [];
      }).then(function (rows) {
        return (rows || []).map(function (row) {
          var copy = Object.assign({}, row);
          copy.name = label + " · " + (row.name || "");
          return copy;
        });
      }));
    });

    return Promise.all(jobs).then(function (groups) {
      var out = [];
      var seen = {};
      groups.forEach(function (rows) {
        rows.forEach(function (row) {
          if (!row || !row.url || seen[row.url]) return;
          seen[row.url] = true;
          out.push(row);
        });
      });
      return attachSubtitles(out, subtitles);
    });
  }).catch(function (error) {
    console.log("[1Shows] " + (error && error.message ? error.message : error));
    return [];
  });
}

module.exports = { getStreams: getStreams };

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
        var nuvioProviderName = "1Shows";
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

(function nuvioImdbBootstrap() {
    var keys = [];
    try { if (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) keys.push(TMDB_API_KEY); } catch (e) {}
    try { if (typeof TMDB_KEY !== "undefined" && TMDB_KEY) keys.push(TMDB_KEY); } catch (e) {}
    try { if (typeof tmdbApiKey !== "undefined" && tmdbApiKey) keys.push(tmdbApiKey); } catch (e) {}
    ["1865f43a0549ca50d341dd9ab8b29f49", "439c478a771f35c05022f9feabcca01c", "6dc830f9624b43261325bed3bf7d0dfa", "5f39fd16e987a9e3fce30d55cf09b438"].forEach(function (key) {
        if (keys.indexOf(key) === -1) keys.push(key);
    });

    function tmdbJson(url) {
        return fetch(url).then(function (res) {
            return res && res.ok && res.json ? res.json() : null;
        }).catch(function () { return null; });
    }

    function tmdbFind(imdb, type) {
        var index = 0;
        function attempt() {
            if (index >= keys.length) return Promise.resolve(null);
            var url = "https://api.themoviedb.org/3/find/" + encodeURIComponent(imdb) +
                "?api_key=" + encodeURIComponent(keys[index++]) + "&external_source=imdb_id";
            return tmdbJson(url).then(function (data) {
                if (!data) return attempt();
                var rows = type === "tv" ? data.tv_results : data.movie_results;
                return rows && rows[0] && rows[0].id ? String(rows[0].id) : null;
            });
        }
        return attempt();
    }

    function wrap(fn) {
        if (typeof fn !== "function" || fn.__nuvioImdbWrapped) return fn;
        function wrapped(id, mediaType, season, episode) {
            var value = String(id == null ? "" : id).trim();
            if (!/^tt\d+$/i.test(value) || typeof fetch !== "function") return fn.apply(this, arguments);
            var type = /^(tv|series|show|anime|tvshow|tv_show)$/i.test(String(mediaType || "")) ? "tv" : "movie";
            var self = this;
            return tmdbFind(value, type).then(function (tmdbId) {
                return tmdbId ? fn.call(self, tmdbId, mediaType, season, episode) : [];
            });
        }
        wrapped.__nuvioImdbWrapped = true;
        return wrapped;
    }

    if (typeof module !== "undefined" && module.exports && typeof module.exports.getStreams === "function") {
        module.exports.getStreams = wrap(module.exports.getStreams);
    }
    if (typeof globalThis !== "undefined" && typeof globalThis.getStreams === "function") {
        globalThis.getStreams = wrap(globalThis.getStreams);
    }
    if (typeof window !== "undefined" && typeof window.getStreams === "function") {
        window.getStreams = wrap(window.getStreams);
    }
})();

(function nuvioLivenessBootstrap() {
    var CONCURRENCY = 6;
    var PROBE_TIMEOUT = 3000;
    var BUDGET = 6000;
    var DEAD_STATUS = { 404: 1, 410: 1, 451: 1 };
    var MEDIA_URL = /\.(?:m3u8|mpd|mp4|mkv|m4v|webm|ts|m2ts|avi|mov)(?:$|[?#])/i;

    function isHttp(url) {
        return /^https?:\/\//i.test(String(url || ""));
    }

    function isLocal(url) {
        return /^https?:\/\/(?:localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(String(url || ""));
    }

    function streamHeaders(stream) {
        var out = {};
        var source = stream && (stream.headers ||
            (stream.behaviorHints && stream.behaviorHints.proxyHeaders && stream.behaviorHints.proxyHeaders.request) ||
            (stream.proxyHeaders && stream.proxyHeaders.request));
        if (source && typeof source === "object" && !Array.isArray(source)) {
            for (var key in source) {
                if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
                var value = source[key];
                if (typeof value === "string" && value.trim()) out[key] = value;
            }
        }
        if (!out["User-Agent"] && !out["user-agent"]) {
            out["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        }
        return out;
    }

    function request(url, headers, method) {
        if (typeof fetch !== "function") return Promise.resolve(0);
        var copy = {};
        for (var name in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, name)) copy[name] = headers[name];
        }
        if (method === "GET") copy.Range = "bytes=0-1";
        var opts = { method: method, headers: copy, redirect: "follow" };
        var controller = null;
        var timer = null;
        try {
            if (typeof AbortController === "function") {
                controller = new AbortController();
                opts.signal = controller.signal;
            }
        } catch (e) {}
        if (controller && typeof setTimeout === "function") {
            timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, PROBE_TIMEOUT);
        }
        return fetch(url, opts).then(function (res) {
            if (timer) clearTimeout(timer);
            if (method === "GET" && res && res.body && typeof res.body.cancel === "function") {
                try {
                    var cancelled = res.body.cancel();
                    if (cancelled && typeof cancelled.catch === "function") cancelled.catch(function () {});
                } catch (e) {}
            }
            return res ? Number(res.status) || 0 : 0;
        }).catch(function () {
            if (timer) clearTimeout(timer);
            return 0;
        });
    }

    function verdict(status, url) {
        if (!status) return "unknown";
        if (status >= 200 && status < 400) return "live";
        if (DEAD_STATUS[status]) return "dead";
        if ((status === 401 || status === 403) && MEDIA_URL.test(String(url || ""))) return "dead";
        return "unknown";
    }

    function probe(stream) {
        var url = String(stream && stream.url || "");
        if (!isHttp(url) || isLocal(url)) return Promise.resolve("unknown");
        var headers = streamHeaders(stream);
        return request(url, headers, "HEAD").then(function (headStatus) {
            if (verdict(headStatus, url) === "live") return "live";
            return request(url, headers, "GET").then(function (getStatus) {
                if (verdict(getStatus, url) === "live") return "live";
                if (verdict(headStatus, url) === "dead" || verdict(getStatus, url) === "dead") return "dead";
                if (!headStatus && !getStatus) return "unknown";
                return "unknown";
            });
        });
    }

    function filterRows(rows) {
        if (!Array.isArray(rows) || !rows.length) return Promise.resolve(rows);
        var verdicts = new Array(rows.length);
        var cache = {};
        var next = 0;
        var active = 0;
        var done = 0;
        var finished = false;
        var timer = null;

        return new Promise(function (resolve) {
            function finish() {
                if (finished) return;
                finished = true;
                if (timer) clearTimeout(timer);
                var out = [];
                for (var i = 0; i < rows.length; i++) {
                    if (verdicts[i] !== "dead") out.push(rows[i]);
                }
                resolve(out);
            }
            if (typeof setTimeout === "function") timer = setTimeout(finish, BUDGET);
            function launch() {
                while (active < CONCURRENCY && next < rows.length) {
                    (function (index) {
                        var row = rows[index];
                        var key = String(row && row.url || "");
                        if (!cache[key]) {
                            try { cache[key] = probe(row); } catch (e) { cache[key] = Promise.resolve("unknown"); }
                        }
                        active++;
                        cache[key].then(function (value) {
                            verdicts[index] = value;
                        }, function () {
                            verdicts[index] = "unknown";
                        }).then(function () {
                            active--;
                            done++;
                            if (done >= rows.length) finish();
                            else launch();
                        });
                    })(next++);
                }
            }
            launch();
        });
    }

    function wrap(fn) {
        if (typeof fn !== "function" || fn.__nuvioLivenessWrapped) return fn;
        function wrapped() {
            var self = this;
            var args = arguments;
            var result;
            try { result = fn.apply(self, args); } catch (e) { return Promise.resolve([]); }
            return Promise.resolve(result).then(function (rows) {
                return filterRows(rows);
            }, function () { return []; });
        }
        wrapped.__nuvioLivenessWrapped = true;
        return wrapped;
    }

    if (typeof module !== "undefined" && module.exports && typeof module.exports.getStreams === "function") {
        module.exports.getStreams = wrap(module.exports.getStreams);
    }
    if (typeof globalThis !== "undefined" && typeof globalThis.getStreams === "function") {
        globalThis.getStreams = wrap(globalThis.getStreams);
    }
    if (typeof window !== "undefined" && typeof window.getStreams === "function") {
        window.getStreams = wrap(window.getStreams);
    }
})();
