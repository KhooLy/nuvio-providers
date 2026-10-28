var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
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
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(

  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
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
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var import_cheerio_without_node_native2 = __toESM(require("cheerio-without-node-native"));

var MAIN_URL = "https://new4.moviesdrive.christmas";
var DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "max-age=0",
  "Connection": "keep-alive"
};

var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));
var cachedMainUrl = "";
function getMainUrl() {
  return __async(this, null, function* () {
    if (cachedMainUrl)
      return cachedMainUrl;
    try {
      const response = yield fetch(DOMAINS_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
      const data = yield response.json();
      cachedMainUrl = data.moviesdrive || MAIN_URL;
      return cachedMainUrl;
    } catch (e) {
      return MAIN_URL;
    }
  });
}
function getIndexQuality(str) {
  if (!str)
    return 1080;
  const match = str.match(/(\d{3,4})[pP]/);
  if (match)
    return parseInt(match[1]);
  if (str.toUpperCase().includes("4K") || str.toUpperCase().includes("2160P") || str.toUpperCase().includes("UHD"))
    return 2160;
  return 1080;
}
function extractMdrive(url) {
  return __async(this, null, function* () {
    if (!url)
      return [];
    const regex = /hubcloud|gdflix|gdlink/i;
    if (!url.includes("search-recover.php") && regex.test(url) && (url.includes("/drive/") || url.includes("/file/"))) {
      return [url];
    }
    try {
      const res = yield fetch(url, { headers: __spreadProps(__spreadValues({}, HEADERS), { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }) });
      const html = yield res.text();
      if (url.includes("search-recover.php")) {
        const qMatch = html.match(/const\s+Q_INITIAL\s*=\s*["']([^"']+)["']/);
        const tokenMatch = html.match(/const\s+FROM_AC_TOKEN\s*=\s*["']([^"']+)["']/);
        if (qMatch && tokenMatch) {
          const apiBase = url.split("/drive/")[0];
          const searchParams = new URLSearchParams({
            api: "search",
            q: qMatch[1],
            page: "1",
            from_ac: tokenMatch[1]
          });
          const apiRes = yield fetch(`${apiBase}/drive/search-recover.php?${searchParams.toString()}`, {
            headers: __spreadProps(__spreadValues({}, HEADERS), { "Accept": "application/json", Referer: url, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" })
          });
          const data = yield apiRes.json();
          if (data.hits) {
            return data.hits.map((h) => h.url).filter(Boolean);
          }
        }
      }
      const $ = import_cheerio_without_node_native.default.load(html);
      return $("a[href]").map((i, el) => $(el).attr("href")).get().filter((href) => regex.test(href));
    } catch (e) {
      return [];
    }
  });
}
function hubCloudExtractor(url, referer) {
  return __async(this, null, function* () {
    try {
      let currentUrl = url;
      const pageResponse = yield fetch(currentUrl, {
        headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: referer })
      });
      let pageData = yield pageResponse.text();
      let finalUrl = currentUrl;
      if (!currentUrl.includes("hubcloud.php")) {
        let nextHref = "";
        const $first = import_cheerio_without_node_native.default.load(pageData);
        const phpLink = $first('a[href*="hubcloud.php"]').attr("href");
        if (phpLink) {
          nextHref = phpLink;
        } else {
          const downloadBtn = $first("#download");
          if (downloadBtn.length) {
            nextHref = downloadBtn.attr("href");
          } else {
            const scriptUrlMatch = pageData.match(/var url = ["']([^"']*)["']/);
            if (scriptUrlMatch)
              nextHref = scriptUrlMatch[1];
          }
        }
        if (nextHref) {
          if (!nextHref.startsWith("http")) {
            const urlObj = new URL(currentUrl);
            nextHref = `${urlObj.protocol}//${urlObj.hostname}/${nextHref.replace(/^\//, "")}`;
          }
          finalUrl = nextHref;
          const secondResponse = yield fetch(finalUrl, {
            headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: currentUrl })
          });
          pageData = yield secondResponse.text();
        }
      }
      const $ = import_cheerio_without_node_native.default.load(pageData);
      const size = $("i#size").text().trim();
      const header = $("div.card-header").text().trim();
      const quality = getIndexQuality(header);
      const pxlMatch = pageData.match(/var\s+pxl\s*=\s*["']([^"']+)["']/);
      const links = [];
      const elements = $("a[href]").get();
      const blocked = ["tinyurl", "telegram", "hubcloud.cx/tg", "hubcloud.foo/tg"];
      for (const el of elements) {
        let link = $(el).attr("href");
        const text = $(el).text().toLowerCase().trim();
        if (!link || blocked.some((b) => link.includes(b)))
          continue;
        if (link.includes("negn6f") && pxlMatch) {
          link = pxlMatch[1];
        }
        if (text.includes("fslv2")) {
          links.push({ name: "HubCloud - FSLv2", quality, url: link, size });
        } else if (text.includes("fsl server") || text.includes("fsl") && !text.includes("v2")) {
          links.push({ name: "HubCloud - FSL Server", quality, url: link, size });
        } else if (text.includes("download file") || text.includes("instant download") || text.includes("instant") || text.includes("10gbps")) {
          let streamUrl = link;
          if (streamUrl.includes("link=")) {
            streamUrl = streamUrl.split("link=")[1];
          } else {
            try {
              const res = yield fetch(link, {
                headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: finalUrl }),
                redirect: "follow"
              });
              if (res.url && res.url.startsWith("http")) {
                streamUrl = res.url;
                if (streamUrl.includes("link=")) {
                  streamUrl = streamUrl.split("link=")[1];
                }
              }
            } catch (e) {
            }
          }
          if (streamUrl && streamUrl.startsWith("http")) {
            links.push({ name: "HubCloud - Instant", quality, url: streamUrl, size });
          }
        } else if (text.includes("pixeldra") || text.includes("pixelserver") || text.includes("pixeldrain") || link.includes("pixeldrain")) {
          let pUrl = link;
          if (pUrl.includes("/u/")) {
            const fileId = pUrl.split("/u/")[1].split("?")[0].replace("/", "");
            pUrl = `https://pixeldrain.dev/api/file/${fileId}?download`;
          }
          links.push({ name: "HubCloud - Pixeldrain", quality, url: pUrl, size });
        } else if (text.includes("buzzserver") || text.includes("buzz server") || text.includes("buzz") || text.includes("fuckingfast")) {
          try {
            const dlRes = yield fetch(link, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
              }
            });
            const dlHtml = yield dlRes.text();
            const copyMatch = dlHtml.match(/copyDownloadLink\(['"]([^'"]+)['"]\)/);
            const dlPath = copyMatch ? copyMatch[1].replace(/\\\//g, "/") : null;
            const base = new URL(link).origin;
            const dlUrl = dlPath ? dlPath.startsWith("http") ? dlPath : `${base}${dlPath}` : link.endsWith("/download") ? link : `${link}/download`;
            const resp = yield fetch(dlUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": link,
                "HX-Request": "true"
              },
              redirect: "manual"
            });
            const dlink = resp.headers.get("hx-redirect") || resp.headers.get("location");
            if (dlink) {
              links.push({ name: "HubCloud - BuzzServer", quality, url: dlink, size });
            }
          } catch (e) {
          }
        } else if (text.includes("s3 server")) {
          links.push({ name: "HubCloud - S3", quality, url: link, size });
        } else if (text.includes("mega server")) {
          links.push({ name: "HubCloud - Mega", quality, url: link, size });
        } else if (link.includes("r2.dev")) {
          links.push({ name: "Direct R2", quality, url: link, size });
        } else if (link.includes("workers.dev")) {
          links.push({ name: "ZipDisk Server", quality, url: link, size });
        }
      }
      return links;
    } catch (e) {
      return [];
    }
  });
}
function loadExtractor(url, referer) {
  return __async(this, null, function* () {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.includes("hubcloud"))
        return yield hubCloudExtractor(url, referer);
      if (hostname.includes("gdflix") || hostname.includes("gdlink"))
        return [{ name: "GDFlix", quality: 1080, url }];
      return [];
    } catch (e) {
      return [];
    }
  });
}

function getStreams(tmdbId, mediaType, seasonNum = 1, episodeNum = 1) {
  return __async(this, null, function* () {
    var _a;
    console.log(`[MoviesDrive] Querying streams for TMDB: ${tmdbId}, Type: ${mediaType}`);
    const tmdbApiKey = "1865f43a0549ca50d341dd9ab8b29f49";
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${tmdbApiKey}&append_to_response=external_ids`;
    const tmdbRes = yield fetch(tmdbUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    const tmdbData = yield tmdbRes.json();
    const imdbId = (_a = tmdbData.external_ids) == null ? void 0 : _a.imdb_id;
    const cleanTitle = tmdbData.title || tmdbData.name || "";
    const mainUrl = yield getMainUrl();
    let match = null;
    const findMatch = (hits) => {
      if (!hits || !hits.length)
        return null;
      if (mediaType === "tv") {
        const sSlug = String(seasonNum).padStart(2, "0");
        const seasonPatterns = [
          new RegExp(`\\bseason\\s*0?${seasonNum}\\b`, "i"),
          new RegExp(`\\bs0?${seasonNum}\\b`, "i"),
          new RegExp(`\\bseason\\s*${sSlug}\\b`, "i")
        ];
        return hits.find((doc) => {
          const postTitle = (doc.post_title || "").toLowerCase();
          const permalink2 = (doc.permalink || "").toLowerCase();
          const normDocTitle = postTitle.replace(/[^a-z0-9]/g, "");
          const normTitle = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
          const titleMatches = normDocTitle.includes(normTitle) || postTitle.includes(cleanTitle.toLowerCase()) || permalink2.includes(cleanTitle.toLowerCase().replace(/ /g, "-"));
          const seasonMatches = seasonPatterns.some((pat) => pat.test(postTitle) || pat.test(permalink2));
          return titleMatches && seasonMatches;
        });
      } else {
        return hits.find((d) => imdbId && d.imdb_id === imdbId) || hits.find((doc) => {
          const postTitle = (doc.post_title || "").toLowerCase();
          const permalink2 = (doc.permalink || "").toLowerCase();
          const normDocTitle = postTitle.replace(/[^a-z0-9]/g, "");
          const normTitle = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normDocTitle.includes(normTitle) || postTitle.includes(cleanTitle.toLowerCase()) || permalink2.includes(cleanTitle.toLowerCase().replace(/ /g, "-"));
        }) || hits[0];
      }
    };
    if (imdbId) {
      try {
        const searchUrl = `${mainUrl}/search.php?q=${imdbId}&page=1`;
        const searchRes = yield fetch(searchUrl, { headers: HEADERS });
        if (searchRes.ok) {
          const searchData = yield searchRes.json();
          match = findMatch((searchData.hits || []).map((h) => h.document));
        }
      } catch (e) {
      }
    }
    if (!match && cleanTitle) {
      try {
        const searchUrl = `${mainUrl}/search.php?q=${encodeURIComponent(cleanTitle)}&page=1`;
        const searchRes = yield fetch(searchUrl, { headers: HEADERS });
        if (searchRes.ok) {
          const searchData = yield searchRes.json();
          match = findMatch((searchData.hits || []).map((h) => h.document));
        }
      } catch (e) {
      }
    }
    if (!match) {
      console.log("[MoviesDrive] No matching post found");
      return [];
    }
    const permalink = match.permalink;
    const href = permalink.startsWith("http") ? permalink : `${mainUrl}${permalink}`;
    try {
      const pageRes = yield fetch(href, { headers: HEADERS });
      const pageHtml = yield pageRes.text();
      const $ = import_cheerio_without_node_native2.default.load(pageHtml);
      const allStreams = [];
      if (mediaType === "movie") {
        const links = [];
        $("h5 a").each((_, a) => {
          const h = $(a).attr("href");
          if (h)
            links.push(h);
        });
        for (const link of [...new Set(links)]) {
          const extracted = yield extractMdrive(link);
          for (const server of extracted) {
            const streams = yield loadExtractor(server, href);
            allStreams.push(...streams.map((s) => __spreadProps(__spreadValues({}, s), {
              title: `${cleanTitle} - ${s.name} [${s.quality}p]`,
              provider: "moviesdrive"
            })));
          }
        }
      } else {
        const sSlug = String(seasonNum).padStart(2, "0");
        const stag = `Season ${seasonNum}|S${sSlug}`;
        const sepRegex = new RegExp(`\\b(?:ep|episode|e)\\s*0?${episodeNum}\\b|s0?${seasonNum}\\s*e0?${episodeNum}\\b`, "i");
        const stopRegex = /^\s*(EP\d+|Episode\s*\d+|S\d+E\d+)/i;
        const entries = $("h5").filter((i, el) => new RegExp(stag, "i").test($(el).text()));
        for (const entry of entries.get()) {
          const nextHref = $(entry).next().find("a").attr("href") || $(entry).find("a").attr("href");
          if (!nextHref)
            continue;
          const epPageRes = yield fetch(nextHref, { headers: HEADERS });
          const epPageHtml = yield epPageRes.text();
          const $ep = import_cheerio_without_node_native2.default.load(epPageHtml);
          const epEntries = $ep("h5").filter((i, el) => sepRegex.test($ep(el).text()));
          for (const epEntry of epEntries.get()) {
            const epLinks = [];
            let sibling = $ep(epEntry).next();
            while (sibling.length && !stopRegex.test(sibling.text().trim())) {
              sibling.find("a[href]").each((_, a) => {
                const h = $ep(a).attr("href");
                if (h)
                  epLinks.push(h);
              });
              sibling = sibling.next();
            }
            if (epLinks.length === 0) {
              const l1 = $ep(epEntry).next().find("a").attr("href");
              const l2 = $ep(epEntry).next().next().find("a").attr("href");
              [l1, l2].forEach((l) => l && epLinks.push(l));
            }
            for (const epLink of [...new Set(epLinks)]) {
              const extracted = yield extractMdrive(epLink);
              for (const server of extracted) {
                const streams = yield loadExtractor(server, nextHref);
                allStreams.push(...streams.map((s) => __spreadProps(__spreadValues({}, s), {
                  title: `${cleanTitle} S${seasonNum}E${episodeNum} - ${s.name} [${s.quality}p]`,
                  provider: "moviesdrive"
                })));
              }
            }
          }
        }
      }
      return allStreams;
    } catch (e) {
      console.error("[MoviesDrive] Error:", e.message);
      return [];
    }
  });
}
module.exports = { getStreams };

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
        var nuvioProviderName = "MoviesDrive";
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
