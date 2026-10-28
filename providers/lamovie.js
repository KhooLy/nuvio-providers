var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve5, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve5(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var lamovie_exports = {};
__export(lamovie_exports, {
  getStreams: () => getStreams
});
module.exports = __toCommonJS(lamovie_exports);
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
var TIER_MAPS = {
  vimeos: { h: "720p", n: "480p" },
  goodstream: { x: "1080p", h: "720p", n: "480p", l: "360p" },
  vidhide: { n: "720p", l: "480p" },
  streamwish: { x: "1080p", h: "1080p", n: "720p", l: "480p" },
  voe: { n: "720p", l: "360p" }
};
var TIER_PRIORITY = ["x", "o", "h", "n", "l"];
function getCdnTierMap(url) {
  if (url.includes("vimeos"))
    return TIER_MAPS.vimeos;
  if (url.includes("goodstream"))
    return TIER_MAPS.goodstream;
  if (url.includes("cloudwindow-route"))
    return TIER_MAPS.voe;
  if (url.includes("minochinos") || url.includes("vidhide") || url.includes("dintezuvio") || url.includes("dramiyos"))
    return TIER_MAPS.vidhide;
  if (url.includes("premilkyway") || url.includes("hlswish") || url.includes("vibuxer") || url.includes("streamwish"))
    return TIER_MAPS.streamwish;
  return null;
}
function smartQuality(_0) {
  return __async(this, arguments, function* (url, headers = {}) {
    const inferred = inferQuality(url);
    if (inferred !== "Unknown")
      return inferred;
    return yield detectQuality(url, headers);
  });
}
function inferQuality(url) {
  if (!url)
    return "Unknown";
  const tierMap = getCdnTierMap(url);
  if (tierMap) {
    const tierMatch = url.match(/_,([a-z,]+),\.urlset/);
    if (tierMatch) {
      const tiers = tierMatch[1].split(",").filter(Boolean);
      for (const t of TIER_PRIORITY) {
        if (tiers.includes(t) && tierMap[t])
          return tierMap[t];
      }
    }
  }
  const numMatch = url.match(/[_\-\/](\d{3,4})p/);
  if (numMatch)
    return numMatch[1] + "p";
  return "Unknown";
}
function normalizeResolution(width, height) {
  if (width >= 3840 || height >= 2160)
    return "4K";
  if (width >= 1920 || height >= 1080)
    return "1080p";
  if (width >= 1280 || height >= 720)
    return "720p";
  if (width >= 854 || height >= 480)
    return "480p";
  return "360p";
}
function detectQuality(_0) {
  return __async(this, arguments, function* (m3u8Url, headers = {}) {
    try {
      const res = yield fetch(m3u8Url, {
        headers: __spreadValues({ "User-Agent": UA }, headers),
        redirect: "follow"
      });
      const data = yield res.text();
      if (!data.includes("#EXT-X-STREAM-INF")) {
        const match = m3u8Url.match(/[_-](\d{3,4})p/);
        return match ? `${match[1]}p` : "Unknown";
      }
      let bestWidth = 0;
      let bestHeight = 0;
      for (const line of data.split("\n")) {
        const m = line.match(/RESOLUTION=(\d+)x(\d+)/);
        if (m) {
          const h = parseInt(m[2]);
          if (h > bestHeight) {
            bestHeight = h;
            bestWidth = parseInt(m[1]);
          }
        }
      }
      return bestHeight > 0 ? normalizeResolution(bestWidth, bestHeight) : "Unknown";
    } catch (e) {
      return "Unknown";
    }
  });
}
var UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
function resolve(embedUrl) {
  return __async(this, null, function* () {
    try {
      console.log(`[GoodStream] Resolviendo: ${embedUrl}`);
      const response = yield fetch(embedUrl, {
        headers: {
          "User-Agent": UA2,
          "Referer": "https://goodstream.one",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        redirect: "follow"
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
      const html = yield response.text();
      const match = html.match(/file:\s*"([^"]+)"/);
      if (!match) {
        console.log('[GoodStream] No se encontr\xF3 patr\xF3n file:"..."');
        return null;
      }
      const videoUrl = match[1];
      const refererHeaders = { "Referer": embedUrl, "Origin": "https://goodstream.one", "User-Agent": UA2 };
      const quality = inferQuality(videoUrl);
      console.log(`[GoodStream] URL encontrada (${quality}): ${videoUrl.substring(0, 80)}...`);
      return { url: videoUrl, quality, headers: refererHeaders };
    } catch (err) {
      console.log(`[GoodStream] Error: ${err.message}`);
      return null;
    }
  });
}
var UA3 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
function b64toString(str) {
  try {
    if (typeof atob !== "undefined")
      return atob(str);
    return Buffer.from(str, "base64").toString("utf8");
  } catch (e) {
    return null;
  }
}
function voeDecode(ct, luts) {
  try {
    const rawLuts = luts.replace(/^\[|\]$/g, "").split("','").map((s) => s.replace(/^'+|'+$/g, ""));
    const escapedLuts = rawLuts.map((i) => i.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    let txt = "";
    for (let ch of ct) {
      let x = ch.charCodeAt(0);
      if (x > 64 && x < 91)
        x = (x - 52) % 26 + 65;
      else if (x > 96 && x < 123)
        x = (x - 84) % 26 + 97;
      txt += String.fromCharCode(x);
    }
    for (const pat of escapedLuts)
      txt = txt.replace(new RegExp(pat, "g"), "_");
    txt = txt.split("_").join("");
    const decoded1 = b64toString(txt);
    if (!decoded1)
      return null;
    let step4 = "";
    for (let i = 0; i < decoded1.length; i++) {
      step4 += String.fromCharCode((decoded1.charCodeAt(i) - 3 + 256) % 256);
    }
    const revBase64 = step4.split("").reverse().join("");
    const finalStr = b64toString(revBase64);
    if (!finalStr)
      return null;
    return JSON.parse(finalStr);
  } catch (e) {
    console.log("[VOE] voeDecode error:", e.message);
    return null;
  }
}
function fetchUrl(_0) {
  return __async(this, arguments, function* (url, headers = {}) {
    const resp = yield fetch(url, {
      method: "GET",
      headers: __spreadValues({
        "User-Agent": UA3,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }, headers),
      redirect: "follow"
    });
    return resp;
  });
}
function resolve2(embedUrl) {
  return __async(this, null, function* () {
    try {
      console.log(`[VOE] Resolviendo: ${embedUrl}`);
      let pageResp = yield fetchUrl(embedUrl, { Referer: embedUrl });
      if (!pageResp.ok)
        throw new Error(`HTTP ${pageResp.status}`);
      let data = yield pageResp.text();
      if (/permanentToken/i.test(data)) {
        const m2 = data.match(/window\.location\.href\s*=\s*'([^']+)'/i);
        if (m2) {
          console.log(`[VOE] Permanent token redirect -> ${m2[1]}`);
          const r2 = yield fetchUrl(m2[1], { Referer: embedUrl });
          if (r2.ok) {
            data = yield r2.text();
          }
        }
      }
      const rMain = data.match(
        /json">\s*\[\s*['"]([^'"]+)['"]\s*\]\s*<\/script>\s*<script[^>]*src=['"]([^'"]+)['"]/i
      );
      if (rMain) {
        const encodedArray = rMain[1];
        const loaderUrl = rMain[2].startsWith("http") ? rMain[2] : new URL(rMain[2], embedUrl).href;
        console.log(`[VOE] Found encoded array + loader: ${loaderUrl}`);
        const jsResp = yield fetchUrl(loaderUrl, { Referer: embedUrl });
        const jsData = jsResp.ok ? yield jsResp.text() : "";
        const replMatch = jsData.match(/(\[(?:'[^']{1,10}'[\s,]*){4,12}\])/i) || jsData.match(/(\[(?:"[^"]{1,10}"[,\s]*){4,12}\])/i);
        if (replMatch) {
          const decoded = voeDecode(encodedArray, replMatch[1]);
          if (decoded && (decoded.source || decoded.direct_access_url)) {
            const url = decoded.source || decoded.direct_access_url;
            const quality = inferQuality(url);
            console.log(`[VOE] URL encontrada: ${url.substring(0, 80)}...`);
            return { url, quality, headers: { Referer: embedUrl } };
          }
        }
      }
      const re1 = /(?:mp4|hls)'\s*:\s*'([^']+)'/gi;
      const re2 = /(?:mp4|hls)"\s*:\s*"([^"]+)"/gi;
      const matches = [];
      let m;
      while ((m = re1.exec(data)) !== null)
        matches.push(m);
      while ((m = re2.exec(data)) !== null)
        matches.push(m);
      for (const match of matches) {
        const candidate = match[1];
        if (!candidate)
          continue;
        let url = candidate;
        if (url.startsWith("aHR0")) {
          try {
            url = atob(url);
          } catch (e) {
          }
        }
        console.log(`[VOE] URL encontrada (fallback): ${url.substring(0, 80)}...`);
        return { url, quality: inferQuality(url), headers: { Referer: embedUrl } };
      }
      console.log("[VOE] No se encontr\xF3 URL");
      return null;
    } catch (err) {
      console.log(`[VOE] Error: ${err.message}`);
      return null;
    }
  });
}
var UA4 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
function unpackEval(payload, radix, symtab) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const unbase = (str) => {
    let result = 0;
    for (let i = 0; i < str.length; i++) {
      const pos = chars.indexOf(str[i]);
      if (pos === -1)
        return NaN;
      result = result * radix + pos;
    }
    return result;
  };
  return payload.replace(/\b([0-9a-zA-Z]+)\b/g, (match) => {
    const idx = unbase(match);
    if (isNaN(idx) || idx >= symtab.length)
      return match;
    return symtab[idx] && symtab[idx] !== "" ? symtab[idx] : match;
  });
}
function extractHlsUrl(unpacked, embedHost) {
  const objMatch = unpacked.match(/\{[^{}]*"hls[234]"\s*:\s*"([^"]+)"[^{}]*\}/);
  if (objMatch) {
    try {
      const normalized = objMatch[0].replace(/(\w+)\s*:/g, '"$1":');
      const obj = JSON.parse(normalized);
      const url = obj.hls4 || obj.hls3 || obj.hls2;
      if (url)
        return url.startsWith("/") ? embedHost + url : url;
    } catch (e) {
      const urlMatch = objMatch[0].match(/"hls[234]"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
      if (urlMatch) {
        const url = urlMatch[1];
        return url.startsWith("/") ? embedHost + url : url;
      }
    }
  }
  const m3u8Match = unpacked.match(/["']([^"']{30,}\.m3u8[^"']*)['"]/i);
  if (m3u8Match) {
    const url = m3u8Match[1];
    return url.startsWith("/") ? embedHost + url : url;
  }
  return null;
}
var DOMAIN_MAP = {
  "hglink.to": "vibuxer.com"
};
function resolve3(embedUrl) {
  return __async(this, null, function* () {
    var _a;
    try {
      let fetchUrl2 = embedUrl;
      for (const [from, to] of Object.entries(DOMAIN_MAP)) {
        if (fetchUrl2.includes(from)) {
          fetchUrl2 = fetchUrl2.replace(from, to);
          break;
        }
      }
      const embedHost = ((_a = fetchUrl2.match(/^(https?:\/\/[^/]+)/)) == null ? void 0 : _a[1]) || "https://hlswish.com";
      console.log(`[HLSWish] Resolviendo: ${embedUrl}`);
      if (fetchUrl2 !== embedUrl)
        console.log(`[HLSWish] \u2192 Mapped to: ${fetchUrl2}`);
      const resp = yield fetch(fetchUrl2, {
        headers: {
          "User-Agent": UA4,
          "Referer": "https://embed69.org/",
          "Origin": "https://embed69.org",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-MX,es;q=0.9"
        },
        redirect: "follow"
      });
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`);
      const data = yield resp.text();
      const fileMatch = data.match(/file\s*:\s*["']([^"']+)["']/i);
      if (fileMatch) {
        let url = fileMatch[1];
        if (url.startsWith("/"))
          url = embedHost + url;
        if (url.includes("vibuxer.com/stream/")) {
          console.log(`[HLSWish] Siguiendo redirect: ${url.substring(0, 80)}...`);
          try {
            const redirectResp = yield fetch(url, {
              headers: { "User-Agent": UA4, "Referer": embedHost + "/" },
              redirect: "follow"
            });
            const finalUrl = redirectResp.url;
            if (finalUrl && finalUrl.includes(".m3u8")) {
              url = finalUrl;
            }
          } catch (e) {
          }
        }
        console.log(`[HLSWish] URL encontrada: ${url.substring(0, 80)}...`);
        return { url, quality: smartQuality(url), headers: { "User-Agent": UA4, "Referer": embedHost + "/" } };
      }
      const packMatch = data.match(
        /eval\(function\(p,a,c,k,e,[a-z]\)\{[^}]+\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/
      );
      if (packMatch) {
        const unpacked = unpackEval(packMatch[1], parseInt(packMatch[2]), packMatch[4].split("|"));
        const url = extractHlsUrl(unpacked, embedHost);
        if (url) {
          console.log(`[HLSWish] URL encontrada: ${url.substring(0, 80)}...`);
          return { url, quality: smartQuality(url), headers: { "User-Agent": UA4, "Referer": embedHost + "/" } };
        }
      }
      const rawM3u8 = data.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
      if (rawM3u8) {
        console.log(`[HLSWish] URL encontrada: ${rawM3u8[0].substring(0, 80)}...`);
        return { url: rawM3u8[0], quality: smartQuality(rawM3u8[0]), headers: { "User-Agent": UA4, "Referer": embedHost + "/" } };
      }
      console.log("[HLSWish] No se encontr\xF3 URL");
      return null;
    } catch (err) {
      console.log(`[HLSWish] Error: ${err.message}`);
      return null;
    }
  });
}
var UA5 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
function resolve4(embedUrl) {
  return __async(this, null, function* () {
    try {
      console.log(`[Vimeos] Resolviendo: ${embedUrl}`);
      const resp = yield fetch(embedUrl, {
        headers: {
          "User-Agent": UA5,
          "Referer": "https://vimeos.net/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        redirect: "follow"
      });
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`);
      const data = yield resp.text();
      const packMatch = data.match(
        /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/
      );
      if (packMatch) {
        const payload = packMatch[1];
        const radix = parseInt(packMatch[2]);
        const symtab = packMatch[4].split("|");
        const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const unbase = (str) => {
          let result = 0;
          for (let i = 0; i < str.length; i++) {
            result = result * radix + chars.indexOf(str[i]);
          }
          return result;
        };
        const unpacked = payload.replace(/\b(\w+)\b/g, (match) => {
          const idx = unbase(match);
          return symtab[idx] && symtab[idx] !== "" ? symtab[idx] : match;
        });
        const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i);
        if (m3u8Match) {
          const url = m3u8Match[1];
          const refererHeaders = { "User-Agent": UA5, "Referer": "https://vimeos.net/" };
          const quality = inferQuality(url);
          console.log(`[Vimeos] URL encontrada: ${url.substring(0, 80)}...`);
          return { url, quality, headers: refererHeaders };
        }
      }
      console.log("[Vimeos] No se encontr\xF3 URL");
      return null;
    } catch (err) {
      console.log(`[Vimeos] Error: ${err.message}`);
      return null;
    }
  });
}
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var UA6 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
var HEADERS = { "User-Agent": UA6, "Accept": "application/json" };
var BASE_URL = "https://lamovie.org";
var ANIME_COUNTRIES = ["JP", "CN", "KR"];
var GENRE_ANIMATION = 16;
var RESOLVERS = {
  "goodstream.one": resolve,
  "hlswish.com": resolve3,
  "streamwish.com": resolve3,
  "streamwish.to": resolve3,
  "strwish.com": resolve3,
  "voe.sx": resolve2,

  "vimeos.net": resolve4
};
var IGNORED_HOSTS = [];
function httpGet(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const res = yield fetch(url, {
      headers: __spreadValues({ "User-Agent": UA6 }, options.headers),
      redirect: "follow"
    });
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    return contentType.includes("json") ? res.json() : res.text();
  });
}
var getServerName = (url) => {
  if (url.includes("goodstream"))
    return "GoodStream";
  if (url.includes("hlswish") || url.includes("streamwish"))
    return "StreamWish";
  if (url.includes("voe.sx"))
    return "VOE";
  if (url.includes("filemoon"))
    return "Filemoon";
  if (url.includes("vimeos.net"))
    return "Vimeos";
  return "Online";
};
var getResolver = (url) => {
  try {
    if (IGNORED_HOSTS.some((h) => url.includes(h)))
      return null;
    for (const [pattern, resolver] of Object.entries(RESOLVERS)) {
      if (url.includes(pattern))
        return resolver;
    }
  } catch (e) {
  }
  return null;
};
function buildSlug(title, year) {
  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return year ? `${slug}-${year}` : slug;
}
function getCategories(mediaType, genres, originCountries) {
  if (mediaType === "movie")
    return ["peliculas"];
  const isAnimation = (genres || []).includes(GENRE_ANIMATION);
  if (!isAnimation)
    return ["series"];
  const isAnimeCountry = (originCountries || []).some((c) => ANIME_COUNTRIES.includes(c));
  if (isAnimeCountry)
    return ["animes"];
  return ["animes", "series"];
}
function getTmdbData(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var _a;
    const langs = [
      { lang: "es-MX", name: "Latino" },
      { lang: "en-US", name: "Ingl\xE9s" }
    ];
    const [esMx, enUs] = yield Promise.all(
      langs.map(
        ({ lang }) => httpGet(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=${lang}`, { headers: HEADERS }).catch(() => null)
      )
    );
    const data = esMx && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(esMx.title || esMx.name) ? esMx : enUs;
    if (!data)
      return null;
    const title = mediaType === "movie" ? data.title : data.name;
    const originalTitle = mediaType === "movie" ? data.original_title : data.original_name;
    const name = data === esMx ? "Latino" : "Ingl\xE9s";
    console.log(`[LaMovie] TMDB (${name}): "${title}"${title !== originalTitle ? ` | Original: "${originalTitle}"` : ""}`);
    return {
      title,
      originalTitle,
      year: (data.release_date || data.first_air_date || "").substring(0, 4),
      genres: (data.genres || []).map((g) => g.id),
      originCountries: data.origin_country || ((_a = data.production_countries) == null ? void 0 : _a.map((c) => c.iso_3166_1)) || []
    };
  });
}
var HTML_HEADERS = {
  "User-Agent": UA6,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-MX,es;q=0.9",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1"
};
function extractIdFromHtml(html) {
  const match = html.match(/rel=['"]shortlink['"]\s+href=['"][^'"]*\?p=(\d+)['"]/);
  return match ? match[1] : null;
}
function getIdBySlug(category, slug) {
  return __async(this, null, function* () {
    const url = `${BASE_URL}/${category}/${slug}/`;
    try {
      const html = yield httpGet(url, {
        headers: HTML_HEADERS,
        validateStatus: (s) => s === 200
      });
      const id = extractIdFromHtml(html);
      if (id) {
        console.log(`[LaMovie] \u2713 Slug directo: /${category}/${slug} \u2192 id:${id}`);
        return { id };
      }
      return null;
    } catch (e) {
      return null;
    }
  });
}
function findBySlug(tmdbInfo, mediaType) {
  return __async(this, null, function* () {
    const { title, originalTitle, year, genres, originCountries } = tmdbInfo;
    const categories = getCategories(mediaType, genres, originCountries);
    const slugs = [];
    if (title)
      slugs.push(buildSlug(title, year));
    if (originalTitle && originalTitle !== title)
      slugs.push(buildSlug(originalTitle, year));
    const allCombinations = slugs.flatMap(
      (slug) => categories.map((cat) => getIdBySlug(cat, slug))
    );
    try {
      return yield Promise.any(allCombinations);
    } catch (e) {
      return null;
    }
  });
}
function getEpisodeId(seriesId, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    var _a;
    const url = `${BASE_URL}/wp-api/v1/single/episodes/list?_id=${seriesId}&season=${seasonNum}&page=1&postsPerPage=50`;
    try {
      const data = yield httpGet(url, { headers: HEADERS });
      if (!((_a = data == null ? void 0 : data.data) == null ? void 0 : _a.posts))
        return null;
      const ep = data.data.posts.find((e) => e.season_number == seasonNum && e.episode_number == episodeNum);
      return (ep == null ? void 0 : ep._id) || null;
    } catch (e) {
      console.log(`[LaMovie] Error episodios: ${e.message}`);
      return null;
    }
  });
}
function processEmbed(embed) {
  return __async(this, null, function* () {
    try {
      const resolver = getResolver(embed.url);
      if (!resolver) {
        console.log(`[LaMovie] Sin resolver para: ${embed.url}`);
        return null;
      }
      const result = yield resolver(embed.url);
      if (!result || !result.url)
        return null;
      const serverName = getServerName(embed.url);
      const streamQuality = result.quality || "Unknown";
      return {
        name: "LaMovie",
        title: `${streamQuality} \xB7 ${serverName}`,
        url: result.url,
        quality: streamQuality,
        headers: result.headers || {}
      };
    } catch (e) {
      console.log(`[LaMovie] Error procesando embed: ${e.message}`);
      return null;
    }
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var _a;
    if (!tmdbId || !mediaType)
      return [];
    const startTime = Date.now();
    console.log(`[LaMovie] Buscando: TMDB ${tmdbId} (${mediaType})${season ? ` S${season}E${episode}` : ""}`);
    try {
      const tmdbInfo = yield getTmdbData(tmdbId, mediaType);
      if (!tmdbInfo)
        return [];
      const found = yield findBySlug(tmdbInfo, mediaType);
      if (!found) {
        console.log("[LaMovie] No encontrado por slug");
        return [];
      }
      let targetId = found.id;
      if (mediaType === "tv" && season && episode) {
        const epId = yield getEpisodeId(targetId, season, episode);
        if (!epId) {
          console.log(`[LaMovie] Episodio S${season}E${episode} no encontrado`);
          return [];
        }
        targetId = epId;
      }
      const data = yield httpGet(
        `${BASE_URL}/wp-api/v1/player?postId=${targetId}&demo=0`,
        { headers: HEADERS }
      );
      if (!((_a = data == null ? void 0 : data.data) == null ? void 0 : _a.embeds)) {
        console.log("[LaMovie] No hay embeds disponibles");
        return [];
      }
      const results = yield Promise.allSettled(
        data.data.embeds.map((embed) => processEmbed(embed))
      );
      const streams = results.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
      const elapsed = ((Date.now() - startTime) / 1e3).toFixed(2);
      console.log(`[LaMovie] \u2713 ${streams.length} streams en ${elapsed}s`);
      return streams;
    } catch (e) {
      console.log(`[LaMovie] Error: ${e.message}`);
      return [];
    }
  });
}

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
        var nuvioProviderName = "LaMovie";
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
