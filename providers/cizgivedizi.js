var BASE = "https://cizgivedizi.net";
var VIDEO_ORIGIN = "https://video.cizgivedizi.net";
var ADDON_NAME = "CizgiVeDizi";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";

var indexCache = null;
var indexCacheAt = 0;
var INDEX_TTL = 30 * 60 * 1000;

function fetchText(url, headers) {
    return fetch(url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function (r) { return r.text(); })
        .catch(function () { return ""; });
}

function fetchJson(url, headers) {
    return fetch(url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function (r) { return r.text().then(function (b) { try { return JSON.parse(b); } catch (e) { return null; } }); })
        .catch(function () { return null; });
}

function normalize(value) {
    return String(value || "").toLowerCase()
        .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
        .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
        .replace(/[^a-z0-9]+/g, " ").trim();
}

function splitCookies(res) {
    var out = [];
    try {
        if (typeof res.headers.getSetCookie === "function") out = res.headers.getSetCookie();
        else {
            var raw = res.headers.get("set-cookie");
            if (raw) out = raw.split(/,\s*(?=[^;,=]+=)/);
        }
    } catch (e) { out = []; }
    return out.filter(Boolean).map(function (c) { return c.split(";")[0]; });
}

function tmdbMeta(tmdbId, mediaType) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var type = isTv ? "tv" : "movie";
    return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR")
        .then(function (data) {
            if (!data || (!data.title && !data.name)) {
                return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY);
            }
            return data;
        })
        .then(function (data) {
            if (!data) return null;
            return {
                isTv: isTv,
                title: data.title || data.name || "",
                original: data.original_title || data.original_name || "",
                year: String(data.release_date || data.first_air_date || "").split("-")[0]
            };
        });
}

function loadIndex() {
    if (indexCache && (Date.now() - indexCacheAt) < INDEX_TTL) return Promise.resolve(indexCache);
    return fetchText(BASE + "/").then(function (html) {
        var m = /const ITEM_META\s*=\s*(\{[\s\S]*?\});/.exec(html);
        if (!m) return indexCache || [];
        var meta;
        try { meta = JSON.parse(m[1]); } catch (e) { return indexCache || []; }
        var list = [];
        for (var id in meta) {
            var v = meta[id];
            if (!v || !v.href) continue;
            list.push({ id: id, name: v.name || "", href: v.href });
        }
        indexCache = list;
        indexCacheAt = Date.now();
        return list;
    });
}

function scoreItem(item, want) {
    var name = normalize(item.name);
    var slug = normalize(item.href.replace(/-/g, " "));
    var wantTokens = want.split(" ").filter(Boolean);
    if (!wantTokens.length) return 0;
    var nameTokens = name.split(" ").filter(Boolean);
    var slugTokens = slug.split(" ").filter(Boolean);
    if (name === want) return 120;
    var hitName = 0, hitSlug = 0;
    for (var i = 0; i < wantTokens.length; i++) {
        if (nameTokens.indexOf(wantTokens[i]) !== -1) hitName++;
        if (slugTokens.indexOf(wantTokens[i]) !== -1) hitSlug++;
    }
    var score = 100 * hitName / Math.max(wantTokens.length, nameTokens.length);
    score += 40 * hitSlug / Math.max(wantTokens.length, slugTokens.length);
    if (name.indexOf(want) !== -1) score += 20;
    return score;
}

function pickItem(list, meta) {
    var wantTv = normalize(meta.title);
    var wantOriginal = normalize(meta.original);
    var best = null;
    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var isFilm = item.href.indexOf("/film/") === 0;
        if (isFilm === meta.isTv) continue;
        var s = Math.max(scoreItem(item, wantTv), wantOriginal ? scoreItem(item, wantOriginal) : 0);
        if (!best || s > best.score) best = { score: s, item: item };
    }
    return best && best.score >= 25 ? best.item : null;
}

function findEpisodeRow(html, season, episode) {
    var s = parseInt(season, 10) || 1;
    var e = parseInt(episode, 10) || 1;
    var rows = [];
    var re = /<tbody class="cvd-episode-entry"[^>]*data-href="([^"]+)"[^>]*data-original-order="(\d+)"[^>]*>([\s\S]*?)<\/tbody>/g;
    var m;
    while ((m = re.exec(html)) !== null) {
        var href = m[1];
        var order = parseInt(m[2], 10);
        var body = m[3];
        var seasonM = /cvd-season-no">(\d+)</.exec(body);
        var overallM = /cvd-overall-no">(\d+)</.exec(body);
        var key = /\/dizi\/[^/]+\/[^/]+\/([^/"]+)\//.exec(href);
        rows.push({
            href: href,
            order: order,
            season: seasonM ? parseInt(seasonM[1], 10) : 1,
            overall: overallM ? parseInt(overallM[1], 10) : null,
            key: key ? key[1] : null
        });
    }
    if (!rows.length) return null;
    var inSeason = rows.filter(function (r) { return r.season === s; });
    var pool = inSeason.length ? inSeason : rows;
    pool.sort(function (a, b) { return a.order - b.order; });
    return pool[e - 1] || null;
}

function fetchSources(showId, overall) {
    var url = BASE + "/diziyeni/video_sources.php?s=" + encodeURIComponent(showId) + "&b=" + encodeURIComponent(overall) + "&_=" + Date.now();
    return fetchJson(url, { "User-Agent": USER_AGENT, "Referer": BASE + "/", "X-Requested-With": "XMLHttpRequest" })
        .then(function (data) {
            if (!data || !Array.isArray(data.sources)) return [];
            return data.sources.filter(function (s) { return s && s.embed; });
        });
}

function bridgeKeyFrom(embed) {
    var m = /[?&]k=([^&]+)/.exec(embed);
    return m ? decodeURIComponent(m[1]) : null;
}

function streamHeaders(cookies) {
    return {
        "User-Agent": USER_AGENT,
        "Referer": BASE + "/",
        "Cookie": cookies,
        "Accept": "*/*",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-dest": "video"
    };
}

function resolveSource(source, epPage) {
    var label = source.kanal || source.ad || "Kaynak";
    var key = bridgeKeyFrom(source.embed);
    if (!key) return Promise.resolve([]);
    var authUrl = VIDEO_ORIGIN + "/yetki.php?k=" + encodeURIComponent(key);
    var gate = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Accept-Language": "tr-TR",
        "Origin": BASE,
        "Referer": BASE + "/",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty"
    };
    return fetch(authUrl, { headers: gate, redirect: "follow" })
        .then(function (r) {
            if (!r.ok) return [];
            var opaque = r.headers.get("X-CVD-Video-URL") || "";
            if (!/^\/[A-Za-z0-9_-]{20,}$/.test(opaque)) return [];
            var cookies = splitCookies(r).join("; ");
            return [{
                name: ADDON_NAME,
                title: label,
                url: VIDEO_ORIGIN + opaque,
                quality: "auto",
                language: label,
                type: "file",
                headers: streamHeaders(cookies)
            }];
        })
        .catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
    return tmdbMeta(tmdbId, mediaType).then(function (meta) {
        if (!meta || !meta.title) return [];
        return loadIndex().then(function (index) {
            var item = pickItem(index, meta);
            if (!item) { console.log("[CVD] no match for " + meta.title); return []; }
            return fetchText(BASE + item.href).then(function (html) {
                var row = findEpisodeRow(html, season, episode);
                if (!row || row.key == null) { console.log("[CVD] episode not found"); return []; }
                return fetchSources(item.id, row.key).then(function (sources) {
                    if (!sources.length) return [];
                    return Promise.all(sources.map(function (s) { return resolveSource(s, BASE + row.href); })).then(function (lists) {
                        var out = [];
                        for (var i = 0; i < lists.length; i++) if (lists[i]) out = out.concat(lists[i]);
                        return out;
                    });
                });
            });
        });
    }).catch(function (err) {
        console.error("[CVD][ERROR] " + (err.message || err));
        return [];
    });
}

module.exports = { getStreams: getStreams };
