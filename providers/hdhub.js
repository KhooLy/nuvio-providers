/**
 * HDHub Nuvio Provider
 *
 * Resolves direct MKV links from the 4khdhub download site for a TMDB id.
 * Chain: title search -> download item -> redirect host -> hub -> direct file.
 * Only direct file links are returned (season archives are skipped).
 */

var BASE = "https://4khdhub.one";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

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
        if (year && href.indexOf(String(year)) !== -1) score += 5;
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

function resolveDownload(greenmotorsUrl) {
    return get(greenmotorsUrl).then(function(html) {
        var hub = decodeGreenmotors(html);
        if (!hub) return null;
        return get(hub, { "User-Agent": USER_AGENT, "Referer": greenmotorsUrl }).then(function(hubHtml) {
            var gm = /href="(https?:\/\/[^"]*hubcloud\.php\?[^"]+)"/.exec(hubHtml);
            if (!gm) return null;
            var gamerxyt = gm[1].replace(/&amp;/g, "&");
            return get(gamerxyt, { "User-Agent": USER_AGENT, "Referer": hub }).then(function(gx) {
                var r2 = /href="(https:\/\/[^"]*cloudflarestorage[^"]+)"/.exec(gx);
                if (r2) {
                    var name = /filename%3D%22([^%]+)/.exec(r2[1]);
                    return { url: r2[1], name: name ? decodeURIComponent(name[1]) : null };
                }
                return null;
            });
        });
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    return tmdbTitle(tmdbId, mediaType).then(function(meta) {
        if (!meta) return [];
        var title = meta.title || meta.name || meta.original_title || meta.original_name;
        var year = (meta.release_date || meta.first_air_date || "").split("-")[0];
        if (!title) return [];
        var searchUrl = BASE + "/?s=" + encodeURIComponent(title);
        return get(searchUrl).then(function(html) {
            var pageUrl = findPage(html, title, year, isTv);
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
                var picks = links.slice(0, 4);
                return Promise.all(picks.map(resolveDownload)).then(function(results) {
                    var streams = [];
                    for (var i = 0; i < results.length; i++) {
                        var r = results[i];
                        if (!r || !r.url) continue;
                        streams.push({
                            name: "HDHub",
                            title: r.name || "Direct",
                            url: r.url,
                            quality: "auto",
                            type: "file",
                            headers: { "User-Agent": USER_AGENT }
                        });
                    }
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
