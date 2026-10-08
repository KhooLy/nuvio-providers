var cheerio;
try { cheerio = require("cheerio-without-node-native"); } catch (e) { cheerio = require("cheerio"); }

var BASE = "https://4khdhub.one";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var MAX_ITEMS = 15;
var CONCURRENCY = 6;
var PROBE_BYTES = 2048;

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
    if (m) return m[1] + "p";
    if (/\b4k\b/i.test(title)) return "2160p";
    return "auto";
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

function collectUrls(html) {
    var raw = String(html).match(/https?:\/\/[^"'\s<>\\]+/g) || [];
    var direct = [];
    var wrappers = [];
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
        var u = raw[i].replace(/&amp;/g, "&").replace(/[),.;]+$/, "");
        if (SKIP_HOST.test(u)) continue;
        if (/hubcloud\.ist\/(?:drive|admin|favicon|snvhost|tg\/)/i.test(u)) continue;
        if (WRAPPER.test(u)) {
            if (!seen[u]) { seen[u] = true; wrappers.push(u); }
            continue;
        }
        if (!DIRECT_HOST.test(u) && !MEDIA_EXT.test(u)) continue;
        if (/pixeldrain\.(?:com|dev)/i.test(u)) u = pixelApi(u);
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

function classify(status, ct, buf) {
    ct = String(ct || "").toLowerCase();
    var bytes = buf ? new Uint8Array(buf) : new Uint8Array(0);
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 2;
    if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 2;
    if (status === 404 || status === 410) return 0;
    var head = bytes.length ? new TextDecoder().decode(bytes.slice(0, 400)) : "";
    if (/notentitled|enable r2|not_found|not found|no longer|removed|deleted|invalid link/i.test(head)) return 0;
    if (status !== 200 && status !== 206) return 1;
    if (/video\/|octet-stream|matroska/i.test(ct)) return 2;
    return 1;
}

function readHead(r, limit) {
    if (!r.body || typeof r.body.getReader !== "function") {
        var len = parseInt(r.headers.get("content-length") || "0", 10);
        if (len > 0 && len <= limit * 2) {
            return r.arrayBuffer().catch(function() { return null; });
        }
        return Promise.resolve(null);
    }
    var reader = r.body.getReader();
    var chunks = [];
    var total = 0;
    function pump() {
        return reader.read().then(function(res) {
            if (res.done) return;
            var v = res.value;
            if (v && v.length) {
                var take = Math.min(v.length, limit - total);
                if (take > 0) { chunks.push(v.subarray(0, take)); total += take; }
            }
            if (total >= limit) return;
            return pump();
        });
    }
    return pump().then(function() {
        try { reader.cancel(); } catch (e) {}
        if (!chunks.length) return null;
        var out = new Uint8Array(total);
        var off = 0;
        for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
        return out.buffer;
    }).catch(function() { try { reader.cancel(); } catch (e) {} return null; });
}

function probeKind(url) {
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = { headers: { "User-Agent": USER_AGENT, "Range": "bytes=0-" + (PROBE_BYTES - 1) }, redirect: "follow" };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function(r) {
        var status = r.status;
        var ct = r.headers.get("content-type");
        var len = parseInt(r.headers.get("content-length") || "0", 10);
        if (status === 200 && len > 4 * 1024 * 1024) {
            if (ctrl) ctrl.abort();
            return classify(status, ct, null);
        }
        return readHead(r, PROBE_BYTES).then(function(buf) {
            if (ctrl) ctrl.abort();
            return classify(status, ct, buf);
        });
    }).catch(function() { return 1; });
}

function probeBest(urls) {
    var transient = null;
    var chain = Promise.resolve(null);
    urls.forEach(function(u) {
        chain = chain.then(function(found) {
            if (found) return found;
            return probeKind(u).then(function(kind) {
                if (kind === 2) return u;
                if (kind === 1 && !transient) transient = u;
                return null;
            });
        });
    });
    return chain.then(function(found) { return found || transient; });
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
        return probeKind(direct).then(function(kind) { return kind > 0 ? direct : null; });
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
                var urls = collectUrls(gx || "");
                return probeBest(urls.direct).then(function(found) {
                    if (found) return found;
                    var chain = Promise.resolve(null);
                    urls.wrappers.forEach(function(w) {
                        chain = chain.then(function(res) { return res ? res : resolveWrapper(w); });
                    });
                    return chain;
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
                    return resolveItem(it).then(function(url) {
                        if (!url) return null;
                        var quality = qualityLabel(it.title);
                        return {
                            name: "HDHub",
                            title: quality + " · " + cleanTitle(it.title),
                            url: url,
                            quality: quality,
                            type: "file",
                            headers: { "User-Agent": USER_AGENT }
                        };
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
