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
    var best = null;
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
        if (!best || score > best.score) best = { score: score, href: href };
    }
    return best ? BASE + best.href : null;
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
            var pageUrl = findPage(html, title, year, isTv);
            if (!pageUrl) return [];
            console.log("[HDH][PAGE] " + pageUrl);
            return fetchText(pageUrl).then(function(pageHtml) {
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
