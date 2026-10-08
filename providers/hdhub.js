/**
 * HDHub Nuvio Provider
 *
 * Resolves direct file links from the 4khdhub download site for a TMDB id.
 * Chain: title search -> download item -> redirect host -> hub -> direct file.
 * Direct files are served from rotating worker/CDN hosts, so every candidate
 * is probed and only playable ones are returned. Season archives are skipped.
 */

var BASE = "https://4khdhub.one";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

var NAV = [
    "HDhub4u.ms", "hubcloud.cx", "snvhost.com", "one.one.one.one", "tinyurl.com",
    "t.me", "googletagmanager", "googletag", "jsdelivr", "unpkg", "fontawesome",
    "cloudflareinsights", "a-ads", "adplox", "google", "gstatic", "histats", "w3.org"
];

function get(url, headers) {
    return fetch(url, { headers: headers || { "User-Agent": USER_AGENT } })
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
        if (!best || score > best.score) best = { score: score, href: href };
    }
    return best ? BASE + best.href : null;
}

function decodeGreenmotors(html) {
    var m = /["']o["']\s*,\s*["']([^"']+)["']/.exec(html);
    if (!m) m = /o'',\s*''(.+?)''/.exec(html);
    if (!m) return null;
    var data = atob(m[1]);
    data = atob(data);
    data = data.replace(/[a-zA-Z]/g, function(c) {
        var base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
    data = atob(data);
    var json = JSON.parse(data);
    return atob(json.o);
}

function candidatesFrom(html) {
    var out = [];
    var seen = {};
    var re = /href="(https?:\/\/[^"]+)"/g;
    var m;
    while ((m = re.exec(html)) !== null) {
        var u = m[1];
        if (NAV.some(function(n) { return u.indexOf(n) !== -1; })) continue;
        if (u.indexOf("cloudflarestorage") === -1 &&
            u.indexOf(".workers.dev/") === -1 &&
            u.indexOf("pixeldrain.") === -1) continue;
        var pm = u.match(/pixeldrain\.(?:com|dev)\/(?:u|file)\/([A-Za-z0-9]+)/);
        var v = pm ? ("https://pixeldrain.com/api/file/" + pm[1]) : u;
        if (!seen[v]) { seen[v] = true; out.push(v); }
    }
    return out;
}

function resolveItem(greenmotorsUrl) {
    return get(greenmotorsUrl).then(function(html) {
        var hub = decodeGreenmotors(html);
        if (!hub) return [];
        return get(hub, { "User-Agent": USER_AGENT, "Referer": greenmotorsUrl }).then(function(hubHtml) {
            var gm = /href="(https?:\/\/[^"]*hubcloud\.php\?[^"]+)"/.exec(hubHtml);
            if (!gm) return [];
            var gx = gm[1].replace(/&amp;/g, "&");
            return get(gx, { "User-Agent": USER_AGENT, "Referer": hub }).then(function(gxHtml) {
                return candidatesFrom(gxHtml);
            });
        });
    }).catch(function() { return []; });
}

function probe(url) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Range": "bytes=0-1023" } })
        .then(function(r) {
            return { url: url, ok: r.ok, type: r.headers.get("content-type") || "" };
        })
        .catch(function() { return { url: url, ok: false, type: "" }; });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    return tmdbTitle(tmdbId, mediaType).then(function(meta) {
        if (!meta) return [];
        var title = meta.title || meta.name || meta.original_title || meta.original_name;
        if (!title) return [];
        return get(BASE + "/?s=" + encodeURIComponent(title)).then(function(html) {
            var pageUrl = findPage(html, title, null, isTv);
            if (!pageUrl) return [];
            console.log("[HDH][PAGE] " + pageUrl);
            return get(pageUrl).then(function(pageHtml) {
                var re = /href="(https:\/\/greenmotors\.club\/\?id=[^"]+)"/g;
                var links = [];
                var seen = {};
                var m;
                while ((m = re.exec(pageHtml)) !== null) {
                    if (!seen[m[1]]) { seen[m[1]] = true; links.push(m[1]); }
                }
                console.log("[HDH][ITEMS] " + links.length);
                return Promise.all(links.slice(0, 16).map(function(link, index) {
                    return resolveItem(link).then(function(list) {
                        if (list.length) console.log("[HDH][ITEM" + index + "] " + list.length);
                        return list;
                    });
                })).then(function(lists) {
                    var all = [];
                    var uniq = {};
                    lists.forEach(function(list) {
                        list.forEach(function(u) { if (!uniq[u]) { uniq[u] = true; all.push(u); } });
                    });
                    console.log("[HDH][CANDIDATES] " + all.length);
                    if (!all.length) return [];
                    return Promise.all(all.slice(0, 40).map(probe)).then(function(results) {
                        var streams = [];
                        results.forEach(function(r) {
                            if (r.ok && r.type.indexOf("text/html") === -1) {
                                streams.push({
                                    name: "HDHub",
                                    title: "Direct",
                                    url: r.url,
                                    quality: "auto",
                                    type: "file",
                                    headers: { "User-Agent": USER_AGENT }
                                });
                            }
                        });
                        return streams;
                    });
                });
            });
        });
    }).catch(function(err) {
        console.error("[HDH][ERROR] " + (err.message || err));
        return [];
    });
}

module.exports = { getStreams: getStreams };
