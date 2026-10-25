var DEFAULT_BASE = "https://new1.vegamovies.lease";
var DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
};

function fetchText(url, headers) {
    return fetch(url, { headers: headers || HEADERS, redirect: "follow" })
        .then(function (r) {
            return r.text().then(function (body) {
                if (!r.ok) {
                    console.log("[VegaMovies] HTTP " + r.status + " " + url);
                    return "";
                }
                return body;
            });
        })
        .catch(function (e) {
            console.log("[VegaMovies] Fetch failed " + (e.message || e) + " " + url);
            return "";
        });
}

function fetchJson(url) {
    return fetchText(url).then(function (body) {
        if (!body) return null;
        try { return JSON.parse(body); } catch (e) { return null; }
    });
}

function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getBase() {
    return fetchJson(DOMAINS_URL).then(function (data) {
        return (data && data.vegamovies) ? data.vegamovies.replace(/\/+$/, "") : DEFAULT_BASE;
    }).catch(function () {
        return DEFAULT_BASE;
    });
}

function getMeta(tmdbId, mediaType) {
    var type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
    return fetchJson(url).then(function (data) {
        if (!data) return null;
        var title = type === "tv" ? data.name : data.title;
        var original = type === "tv" ? data.original_name : data.original_title;
        var date = type === "tv" ? data.first_air_date : data.release_date;
        return {
            type: type,
            title: title || original,
            original: original || title,
            year: date ? String(date).slice(0, 4) : ""
        };
    });
}

function scoreHit(hit, meta, season) {
    var doc = hit.document || {};
    var title = normalize(doc.post_title);
    var target = normalize(meta.title);
    var original = normalize(meta.original);
    var score = 0;
    if (title.indexOf(target) !== -1) score += 50;
    if (original !== target && title.indexOf(original) !== -1) score += 30;
    if (meta.year && title.indexOf(meta.year) !== -1) score += 20;
    if (meta.type === "tv") {
        if (season && new RegExp("season\\s*0?" + season + "\\b", "i").test(doc.post_title || "")) score += 40;
        if (/complete|season/i.test(doc.post_title || "")) score += 10;
    }
    return score;
}

function search(base, meta, season) {
    var query = meta.title;
    if (meta.type === "tv" && season) query += " season " + season;
    var url = base + "/search.php?q=" + encodeURIComponent(query) + "&page=1&per_page=15";
    return fetchJson(url).then(function (data) {
        var hits = (data && data.hits) || [];
        if (!hits.length && query !== meta.title) {
            return fetchJson(base + "/search.php?q=" + encodeURIComponent(meta.title) + "&page=1&per_page=15")
                .then(function (alt) { return (alt && alt.hits) || []; });
        }
        return hits;
    });
}

function qualityOf(text) {
    var m = String(text || "").match(/(2160|1080|720|480|360)p/i);
    return m ? m[1] + "p" : "HD";
}

function sizeOf(text) {
    var m = String(text || "").match(/\[([^\]]*(?:MB|GB)[^\]]*)\]/i);
    return m ? m[1] : "";
}

function parseDownloads(html) {
    var out = [];
    var seen = {};
    var rx = /<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>\s*<p[^>]*>\s*<a[^>]+href="([^"]*nexdrive[^"]*)"[^>]*>/gi;
    var m;
    while ((m = rx.exec(html)) !== null) {
        var label = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        var downloadAt = label.toLowerCase().lastIndexOf("download");
        if (downloadAt > 0) label = label.slice(downloadAt);
        var url = m[2];
        var key = url + "|" + label;
        if (seen[key]) continue;
        seen[key] = true;
        out.push({ url: url, label: label, quality: qualityOf(label), size: sizeOf(label) });
    }
    return out;
}

function resolveNex(url) {
    return fetchText(url).then(function (html) {
        if (!html) return null;
        var fast = html.match(/https:\/\/fastdl\.[^"'\s<]+\/embed\?download=[^"'\s<]+/i);
        if (fast) {
            return fetchText(fast[0]).then(function (page) {
                var direct = page.match(/https:\/\/fastdl\.[^"'\s<]+\/dl\.php\?link=(https:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<]+)/i);
                if (direct) return direct[1].replace(/&amp;/g, "&");
                var google = page.match(/https:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<]+/i);
                if (google) return google[0].replace(/&amp;/g, "&");
                return null;
            });
        }
        var gdtot = html.match(/https:\/\/[^"'\s<]*gdtot[^"'\s<]*\/file\/[^"'\s<]+/i);
        if (gdtot) return gdtot[0];
        var drive = html.match(/https:\/\/drive\.google\.com\/[^"'\s<]+/i);
        return drive ? drive[0].replace(/&amp;/g, "&") : null;
    });
}

function buildStreams(downloads, meta, season, episode) {
    var tasks = downloads.slice(0, 6).map(function (item) {
        return resolveNex(item.url).then(function (direct) {
            if (!direct) return null;
            var label = item.quality;
            if (meta.type === "tv" && season) label += " S" + String(season).padStart(2, "0") + " pack";
            return {
                name: "VegaMovies " + item.quality,
                title: (meta.title || "") + " " + (meta.year || "") + " [" + item.quality + "]" + (item.size ? " " + item.size : "") + (meta.type === "tv" && season ? " Season " + season : ""),
                url: direct,
                quality: item.quality,
                size: item.size,
                headers: {
                    "User-Agent": USER_AGENT,
                    "Referer": "https://fastdl.beer/"
                },
                provider: "vegamovies"
            };
        });
    });
    return Promise.all(tasks).then(function (rows) {
        var seen = {};
        return rows.filter(function (row) {
            if (!row || seen[row.url]) return false;
            seen[row.url] = true;
            return true;
        });
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    return Promise.all([getBase(), getMeta(tmdbId, mediaType)]).then(function (values) {
        var base = values[0];
        var meta = values[1];
        if (!meta) return [];
        return search(base, meta, season).then(function (hits) {
            if (!hits.length) return [];
            var best = hits.slice().sort(function (a, b) {
                return scoreHit(b, meta, season) - scoreHit(a, meta, season);
            })[0];
            var doc = best && best.document;
            if (!doc || !doc.permalink) return [];
            return fetchText(base + doc.permalink).then(function (html) {
                var downloads = parseDownloads(html);
                if (!downloads.length) return [];
                return buildStreams(downloads, meta, season, episode);
            });
        });
    }).catch(function (e) {
        console.log("[VegaMovies] " + (e.message || e));
        return [];
    });
}

module.exports = { getStreams: getStreams };
