var cheerio;
try { cheerio = require("cheerio-without-node-native"); } catch (e) { cheerio = require("cheerio"); }

var BASE = "https://4khdhub.one";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var ADDON_NAME = "HDHub";
var MAX_ITEMS = 15;
var CONCURRENCY = 6;

var DIRECT_HOST = /(cloudflarestorage|pixeldrain\.(?:com|dev)|workers\.dev)/i;
var MEDIA_EXT = /\.(mkv|mp4|avi|zip|rar|m3u8)(?:[?"'#]|$)/i;
var WRAPPER = /hubcloud\.ist\//i;
var SKIP_HOST = /(google|gstatic|jsdelivr|fontawesome|unpkg|jquery|popper|bootstrap|w3\.org|telegram|t\.me|twitter|facebook|tinyurl|one\.one\.one\.one|snvhost|winexch|adsboosters|bonuscaf|cloudflare\.com)/i;

function b64decode(s) {
    try {
        if (typeof atob !== "undefined") return atob(s);
        return Buffer.from(String(s || ""), "base64").toString("binary");
    } catch (e) { return ""; }
}

function fetchText(url, headers) {
    return fetch(url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function(r) { return r.text(); })
        .catch(function() { return ""; });
}

function tmdbTitle(tmdbId, mediaType) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId +
        "?api_key=" + TMDB_API_KEY + "&language=en-US";
    return fetch(url, { headers: { "Accept": "application/json" } })
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
}

function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findPage(html, title, year, isTv) {
    var want = normalize(title);
    var re = /href="(\/[^"]+-(movie|series)-\d+\/)"/g;
    var seen = {};
    var out = [];
    var m;
    while ((m = re.exec(html)) !== null) {
        var href = m[1];
        if ((m[2] === "series") !== isTv) continue;
        if (seen[href]) continue;
        seen[href] = true;
        var slug = normalize(href.replace(/[-/]/g, " "));
        var score = 0;
        if (slug.indexOf(want) !== -1 || want.indexOf(slug) !== -1) score += 60;
        var tokens = want.split(" ");
        var hit = 0;
        for (var i = 0; i < tokens.length; i++) if (tokens[i] && slug.indexOf(tokens[i]) !== -1) hit++;
        score += 30 * hit / Math.max(1, tokens.length);
        if (year && href.indexOf(String(year)) !== -1) score += 5;
        if (score >= 60) out.push({ score: score, href: href });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 5).map(function (x) { return BASE + x.href; });
}

function publishedYear(html) {
    var m = /"datePublished":"(\d{4})"/.exec(html);
    return m ? m[1] : "";
}

function qualityLabel(title) {
    var m = /(2160|1440|1080|720|480|360)p/i.exec(title);
    if (m) return m[1] === "2160" ? "4K" : m[1] + "p";
    if (/\b4k\b/i.test(title)) return "4K";
    return "auto";
}

function parseSize(text) {
    text = String(text || "");
    var m = /Download[^\[\n]{0,40}\[([\d.]+)\s*([KMGT]?B)\]/i.exec(text);
    if (!m) m = /\[\s*([\d.]+)\s*(TB|GB|MB)\s*\]/i.exec(text);
    if (!m) m = /([\d.]+)\s*(TB|GB|MB)\b/i.exec(text);
    if (!m) return null;
    var unit = m[2].toUpperCase();
    var mult = unit === "TB" ? 1099511627776 : (unit === "GB" ? 1073741824 : 1048576);
    return Math.round(parseFloat(m[1]) * mult);
}

function qualityRank(title) {
    var m = /(2160|1440|1080|720|480|360)p/i.exec(title);
    if (m) return parseInt(m[1], 10);
    if (/\b4k\b/i.test(title)) return 2160;
    return 0;
}

function cleanTitle(title) {
    return String(title || "")
        .replace(/\s*\([^)]*4k\s*hd\s*hub[^)]*\)\s*\.?(mkv|mp4)?/ig, " ")
        .replace(/\.(mkv|mp4|avi)$/i, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
}

function humanSize(bytes) {
    if (!bytes) return null;
    var gb = bytes / 1073741824;
    if (gb >= 1) return gb.toFixed(2) + " GB";
    return (bytes / 1048576).toFixed(1) + " MB";
}

var LANG_NAMES = ["Hindi", "English", "Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Turkish", "Türkçe", "Korean", "Japanese", "Spanish", "French", "German", "Italian", "Portuguese", "Arabic"];

function languagesOf(title) {
    var found = [];
    for (var i = 0; i < LANG_NAMES.length; i++) {
        if (new RegExp("\\b" + LANG_NAMES[i] + "\\b", "i").test(title)) found.push(LANG_NAMES[i]);
    }
    return found.length ? found.join(", ") : null;
}

function rankPrefix(quality) {
    if (quality === "4K") return "1. ";
    if (quality === "1440p") return "2. ";
    if (quality === "1080p") return "3. ";
    if (quality === "720p") return "4. ";
    if (quality === "480p") return "5. ";
    return "9. ";
}

function parseItems(html) {
    var $ = cheerio.load(html);
    var items = [];
    $(".download-item, .episode-download-item").each(function(i, el) {
        var node = $(el);
        var title = node.find(".file-title, .episode-file-title").first().text();
        if (!title) title = node.text();
        title = String(title).replace(/\s+/g, " ").trim();
        var hub = null;
        node.find("a").each(function(j, a) {
            if (hub) return;
            var href = $(a).attr("href") || "";
            if (href.indexOf("greenmotors") === -1) return;
            var text = $(a).text().replace(/\s+/g, " ").trim();
            if (/hubcloud/i.test(text)) hub = href;
        });
        if (!hub) {
            node.find("a").each(function(j, a) {
                if (hub) return;
                var href = $(a).attr("href") || "";
                var text = $(a).text().replace(/\s+/g, " ").trim();
                if (href.indexOf("greenmotors") !== -1 && !/hubdrive/i.test(text)) hub = href;
            });
        }
        if (hub) items.push({ title: title, url: hub });
    });
    return items;
}

function pickEpisodes(items, isTv, season, episode) {
    var s = parseInt(season, 10);
    var e = parseInt(episode, 10);
    if (!isTv || !s || !e) return items;
    var re = new RegExp("s0*" + s + "[\\s._-]*e0*" + e + "(?![0-9])", "i");
    return items.filter(function(it) { return re.test(it.title); });
}

function decodeGreenmotors(html) {
    var m = /["']o["']\s*,\s*["']([^"']+)["']/.exec(html);
    if (!m) m = /o'',\s*''(.+?)''/.exec(html);
    if (!m) return null;
    var data = b64decode(m[1]);
    data = b64decode(data);
    data = data.replace(/[a-zA-Z]/g, function(c) {
        var base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
    data = b64decode(data);
    try { return b64decode(JSON.parse(data).o); } catch (e) { return null; }
}

function pixelApi(url) {
    var m = /pixeldrain\.(?:com|dev)\/(?:u|file)\/([A-Za-z0-9]+)/i.exec(url);
    return m ? "https://pixeldrain.com/api/file/" + m[1] : url;
}

function gatherUrls(html) {
    var text = String(html);
    var hrefs = [];
    var seenHref = {};
    var re = /href\s*=\s*"([^"]+)"/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
        var h = m[1].replace(/&amp;/g, "&");
        if (!seenHref[h]) { seenHref[h] = true; hrefs.push(h); }
    }
    var out = hrefs.slice();
    var bare = text.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
    for (var i = 0; i < bare.length; i++) {
        var b = bare[i].replace(/&amp;/g, "&");
        var prefix = false;
        for (var j = 0; j < hrefs.length; j++) {
            if (hrefs[j].indexOf(b) === 0) { prefix = true; break; }
        }
        if (!prefix) out.push(b);
    }
    return out;
}

function collectUrls(html) {
    var raw = gatherUrls(html);
    var direct = [];
    var wrappers = [];
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
        var u = raw[i].replace(/[),.;]+$/, "");
        if (SKIP_HOST.test(u)) continue;
        if (/hubcloud\.ist\/(?:drive|admin|favicon|snvhost|tg\/)/i.test(u)) continue;
        if (WRAPPER.test(u)) {
            if (!seen[u]) { seen[u] = true; wrappers.push(u); }
            continue;
        }
        if (!DIRECT_HOST.test(u) && !MEDIA_EXT.test(u)) continue;
        if (/pixeldrain\.(?:com|dev)/i.test(u)) u = pixelApi(u);
        if (u.indexOf(" ") !== -1) u = u.replace(/ /g, "%20");
        if (!seen[u]) { seen[u] = true; direct.push(u); }
    }
    direct.sort(function(a, b) { return priority(b) - priority(a); });
    return { direct: direct, wrappers: wrappers };
}

function priority(url) {
    if (/cloudflarestorage/i.test(url)) return 5;
    if (/pixeldrain/i.test(url)) return 4;
    if (/workers\.dev/i.test(url) && MEDIA_EXT.test(url)) return 3;
    if (/workers\.dev/i.test(url)) return 2;
    if (MEDIA_EXT.test(url)) return 1;
    return 0;
}

function headRange(url, range) {
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = { headers: { "User-Agent": USER_AGENT, "Range": range }, redirect: "follow" };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function(r) {
        var cr = r.headers.get("content-range") || "";
        try {
            if (r.body && r.body.getReader) r.body.getReader().cancel();
            else if (r.body && r.body.cancel) r.body.cancel();
        } catch (e) {}
        if (ctrl) ctrl.abort();
        var m = /\/(\d+)\s*$/.exec(cr);
        return { status: r.status, total: m ? parseInt(m[1], 10) : null };
    }).catch(function() { return null; });
}

function probeKind(url) {
    return headRange(url, "bytes=0-1").then(function(h) {
        if (!h || (h.status !== 200 && h.status !== 206)) return 0;
        if (h.status === 200 || !h.total || h.total < 4096) return 1;
        var at = Math.floor(h.total / 2);
        return headRange(url, "bytes=" + at + "-" + (at + 1)).then(function(m) {
            return (m && m.status === 206) ? 2 : 1;
        });
    });
}

function probeBest(urls) {
    var best = null;
    var fallback = null;
    var chain = Promise.resolve();
    urls.forEach(function(u) {
        chain = chain.then(function() {
            if (best) return;
            return probeKind(u).then(function(kind) {
                if (kind === 2 && !best) best = { url: u, seekable: true };
                else if (kind === 1 && !fallback) fallback = { url: u, seekable: false };
            });
        });
    });
    return chain.then(function() { return best || fallback; });
}

function followRedirects(url, depth) {
    if (depth <= 0) return Promise.resolve(null);
    return fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "manual" })
        .then(function(r) {
            var loc = r.headers.get("location");
            if (loc) {
                var next = loc.indexOf("//") === 0 ? "https:" + loc : loc;
                return followRedirects(next, depth - 1);
            }
            return r.text().then(function(text) {
                var l = /[?&]link=(https?:\/\/[^"'&\s]+)/.exec(url);
                if (l) return decodeURIComponent(l[1]);
                var m = /https?:\/\/[^"'\s<>]+\.(?:mkv|mp4)(?=["'\s<>]|$)/i.exec(text);
                return m ? m[0] : null;
            });
        })
        .catch(function() { return null; });
}

function resolveWrapper(url) {
    return followRedirects(url, 6).then(function(direct) {
        if (!direct) return null;
        return probeKind(direct).then(function(kind) {
            return kind > 0 ? { url: direct, seekable: kind === 2 } : null;
        });
    });
}

function pixeldrainSize(apiUrl) {
    var m = /pixeldrain\.com\/api\/file\/([A-Za-z0-9]+)/i.exec(apiUrl);
    if (!m) return Promise.resolve(null);
    return fetch("https://pixeldrain.com/api/file/" + m[1] + "/info", { headers: { "User-Agent": USER_AGENT } })
        .then(function(r) { return r.json(); })
        .then(function(j) { return (j && j.size) ? j.size : null; })
        .catch(function() { return null; });
}

function withSize(found, size) {
    if (size) return Promise.resolve({ url: found.url, seekable: found.seekable, size: size });
    return pixeldrainSize(found.url).then(function(extra) {
        return { url: found.url, seekable: found.seekable, size: extra };
    });
}

function resolveItem(item) {
    return fetchText(item.url).then(function(html) {
        if (!html) return null;
        var hub = decodeGreenmotors(html);
        if (!hub || /hubdrive\.pics/i.test(hub)) return null;
        return fetchText(hub, { "User-Agent": USER_AGENT, "Referer": item.url }).then(function(hubHtml) {
            var gm = /href="(https?:\/\/[^"]*hubcloud\.php\?[^"]+)"/.exec(hubHtml || "");
            if (!gm) return null;
            var gamerxyt = gm[1].replace(/&amp;/g, "&");
            return fetchText(gamerxyt, { "User-Agent": USER_AGENT, "Referer": hub }).then(function(gx) {
                var size = parseSize(gx || "");
                var urls = collectUrls(gx || "");
                return probeBest(urls.direct).then(function(found) {
                    if (found) return withSize(found, size);
                    var chain = Promise.resolve(null);
                    urls.wrappers.forEach(function(w) {
                        chain = chain.then(function(res) { return res ? res : resolveWrapper(w); });
                    });
                    return chain.then(function(res) { return res ? withSize(res, size) : null; });
                });
            });
        });
    });
}

function mapLimit(arr, limit, fn) {
    var out = new Array(arr.length);
    var i = 0;
    function next() {
        if (i >= arr.length) return Promise.resolve();
        var idx = i++;
        return fn(arr[idx], idx).then(function(v) { out[idx] = v; return next(); });
    }
    var workers = [];
    for (var k = 0; k < Math.min(limit, arr.length); k++) workers.push(next());
    return Promise.all(workers).then(function() { return out; });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    return tmdbTitle(tmdbId, mediaType).then(function(meta) {
        if (!meta) return [];
        var title = meta.title || meta.name || meta.original_title || meta.original_name;
        var year = (meta.release_date || meta.first_air_date || "").split("-")[0];
        if (!title) return [];
        return fetchText(BASE + "/?s=" + encodeURIComponent(title)).then(function(html) {
            var pages = findPage(html, title, year, isTv);
            if (!pages.length) return [];
            var idx = 0;
            function tryPage() {
                if (idx >= pages.length) return Promise.resolve("");
                var pageUrl = pages[idx++];
                console.log("[HDH][PAGE] " + pageUrl);
                return fetchText(pageUrl).then(function(pageHtml) {
                    var py = publishedYear(pageHtml);
                    if (year && py && Math.abs(parseInt(py, 10) - parseInt(year, 10)) > 1) {
                        console.log("[HDH][SKIP] year " + py + " != " + year);
                        return tryPage();
                    }
                    return pageHtml;
                });
            }
            return tryPage().then(function(pageHtml) {
                if (!pageHtml) return [];
                var items = parseItems(pageHtml);
                console.log("[HDH][ITEMS] " + items.length);
                items = pickEpisodes(items, isTv, season, episode);
                var seen = {};
                items = items.filter(function(it) {
                    if (seen[it.url]) return false;
                    seen[it.url] = true;
                    return true;
                });
                items.sort(function(a, b) { return qualityRank(b.title) - qualityRank(a.title); });
                items = items.slice(0, MAX_ITEMS);
                console.log("[HDH][PICK] " + items.length + (isTv ? (" S" + season + "E" + episode) : ""));
                if (items.length === 0) return [];
                return mapLimit(items, CONCURRENCY, function(it) {
                    return resolveItem(it).then(function(res) {
                        if (!res) return null;
                        var quality = qualityLabel(it.title);
                        var label = cleanTitle(it.title);
                        var langs = languagesOf(it.title);
                        var subtitle = label + (langs ? " · " + langs : "") + (res.seekable ? "" : " - Non Seekable");
                        var stream = {
                            name: ADDON_NAME,
                            title: label,
                            url: res.url,
                            quality: rankPrefix(quality) + quality,
                            language: subtitle,
                            type: "file",
                            headers: { "User-Agent": USER_AGENT }
                        };
                        var size = humanSize(res.size);
                        if (size) {
                            stream.size = size;
                            stream.behaviorHints = { videoSize: res.size, filename: label };
                        }
                        return stream;
                    });
                }).then(function(list) {
                    var streams = list.filter(function(s) { return s; });
                    console.log("[HDH][RETURN] streams=" + streams.length);
                    return streams;
                });
            });
        });
    }).catch(function(err) {
        console.error("[HDH][ERROR] " + (err.message || err));
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
        var nuvioProviderName = "HDHub";
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
