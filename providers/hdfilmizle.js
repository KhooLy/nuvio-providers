var cheerio = require("cheerio-without-node-native");

var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var BASE_URL = "https://www.hdfilmizle.vip";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

// Domain cache — sadece bir kez çözümlenir
var domainResolved = false;
function ensureBaseUrl() {
    if (domainResolved) return Promise.resolve();
    return fetch("https://www.hdfilmizle.vip", { method: "GET", redirect: "follow" })
        .then(function(resp) {
            var m = (resp.url || "").match(/^(https?:\/\/[^\/]+)/);
            if (m) BASE_URL = m[1];
            domainResolved = true;
            console.log("[HD][INIT] BASE_URL=" + BASE_URL);
        })
        .catch(function() { domainResolved = true; });
}

function fetchTmdbJson(url) {
    return fetch(url, { headers: { "Accept": "application/json", "User-Agent": USER_AGENT } })
        .then(function(r) {
            return r.text().then(function(body) {
                if (!r.ok) return null;
                try { return JSON.parse(body); } catch(e) { return null; }
            });
        })
        .catch(function() { return null; });
}

function selectFindResult(data, mediaType) {
    if (!data) return null;
    var isTv = (mediaType === "tv" || mediaType === "series");
    var preferred = isTv ? data.tv_results : data.movie_results;
    var fallback  = isTv ? data.movie_results : data.tv_results;
    if (Array.isArray(preferred) && preferred.length > 0) return preferred[0];
    if (Array.isArray(fallback)  && fallback.length  > 0) return fallback[0];
    return null;
}

function getTmdbMetadata(tmdbId, mediaType) {
    var rawId = String(tmdbId || "").trim();
    var type  = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    if (!rawId) { console.log("[HD][TMDB] empty id"); return Promise.resolve(null); }

    // IMDb ID (tt...) → use /find endpoint
    if (/^tt\d+$/i.test(rawId)) {
        console.log("[HD][TMDB] IMDb ID detected: " + rawId);
        var findTr = "https://api.themoviedb.org/3/find/" + encodeURIComponent(rawId) +
                     "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id&language=tr-TR";
        return fetchTmdbJson(findTr)
            .then(function(data) {
                var r = selectFindResult(data, mediaType);
                if (r && (r.title || r.name)) {
                    console.log("[HD][TMDB] IMDb→TMDB id=" + r.id + " title=" + (r.title || r.name));
                    return r;
                }
                var findEn = "https://api.themoviedb.org/3/find/" + encodeURIComponent(rawId) +
                             "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id";
                return fetchTmdbJson(findEn).then(function(d2) { return selectFindResult(d2, mediaType); });
            })
            .catch(function() { return null; });
    }

    // Numeric TMDB ID → normal details
    if (!/^\d+$/.test(rawId)) {
        console.log("[HD][TMDB] unsupported id format: " + rawId);
        return Promise.resolve(null);
    }
    var detailTr = "https://api.themoviedb.org/3/" + type + "/" + rawId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR";
    return fetchTmdbJson(detailTr)
        .then(function(data) {
            if (data && (data.title || data.name)) return data;
            var detailEn = "https://api.themoviedb.org/3/" + type + "/" + rawId + "?api_key=" + TMDB_API_KEY;
            return fetchTmdbJson(detailEn);
        })
        .catch(function() { return null; });
}

function titleContains(a, b) {
    return typeof a === "string" && typeof b === "string" &&
           a.length > 0 && b.length > 0 &&
           (a.indexOf(b) !== -1 || b.indexOf(a) !== -1);
}

function normalizeTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\u00e7\u011f\u0131\u00f6\u015f\u00fc]+/g, " ")
        .trim();
}

function searchContent(title) {
    title = String(title || "").trim();
    if (!title) {
        console.log("[HD][SEARCH] empty title — cancelled");
        return Promise.resolve([]);
    }
    var encoded = "query=" + encodeURIComponent(title);
    return fetch(BASE_URL + "/search/", {
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": BASE_URL + "/"
        },
        body: encoded
    })
    .then(function(response) {
        console.log("[HD][SEARCH] status=" + response.status + " title=" + title);
        return response.text().then(function(text) {
            console.log("[HD][SEARCH] body=" + text.substring(0, 200));
            try {
                var parsed = JSON.parse(text);
                if (Array.isArray(parsed)) return parsed;
                if (parsed && Array.isArray(parsed.results)) return parsed.results;
                if (parsed && Array.isArray(parsed.data)) return parsed.data;
                return [];
            } catch(e) {
                console.log("[HD][SEARCH] not JSON: " + e.message);
                return [];
            }
        });
    })
    .catch(function(e) {
        console.log("[HD][SEARCH] failed: " + e.message);
        return [];
    });
}

// Vidrame decoder: XOR cipher with integer array + key
function decodeSources(d, k) {
    try {
        var o = "";
        for (var i = 0; i < d.length; i++) {
            o += String.fromCharCode(d[i] ^ k.charCodeAt(i % k.length) ^ ((i * 17 + 13) & 255));
        }
        return o;
    } catch(e) { return null; }
}

// Vidmoxy decoder: EE.dd = Base64 → ROT13 → Reverse
function rot13(s) {
    return String(s).replace(/[a-zA-Z]/g, function(c) {
        var base = (c <= 'Z') ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
}
function decodeEEdd(s) {
    try {
        s = String(s).replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4 !== 0) s += '=';
        var b64 = (typeof atob !== 'undefined') ? atob(s) : Buffer.from(s, 'base64').toString('binary');
        return rot13(b64).split('').reverse().join('');
    } catch(e) { return null; }
}

function extractOrigin(url) {
    var m = String(url || "").match(/^(https?:\/\/[^\/]+)/);
    return m ? m[1] : "";
}

function getStreams(tmdbId, mediaType, season, episode) {
    console.log("[HD][START] tmdbId=" + tmdbId + " type=" + mediaType + " s=" + season + " e=" + episode);

    return ensureBaseUrl()
        .then(function() {
            return getTmdbMetadata(tmdbId, mediaType);
        })
        .then(function(metadata) {
            if (!metadata) { console.log("[HD][TMDB] no metadata"); return null; }

            var trTitle = metadata.title || metadata.name || "";
            var enTitle = metadata.original_title || metadata.original_name || trTitle;
            var year = (metadata.release_date || metadata.first_air_date || "").split("-")[0];
            console.log("[HD][TMDB] id=" + (metadata.id||"") + " TR=" + trTitle + " EN=" + enTitle + " year=" + year);

            if (!trTitle && !enTitle) { console.log("[HD][TMDB] no usable title"); return null; }

            return searchContent(trTitle)
                .then(function(results) {
                    if (results && results.length > 0) {
                        return { results: results, trTitle: trTitle, enTitle: enTitle, year: year };
                    }
                    if (enTitle && enTitle !== trTitle) {
                        return searchContent(enTitle).then(function(r2) {
                            return { results: r2 || [], trTitle: trTitle, enTitle: enTitle, year: year };
                        });
                    }
                    return { results: [], trTitle: trTitle, enTitle: enTitle, year: year };
                });
        })
        .then(function(ctx) {
            if (!ctx) return [];
            var results = ctx.results;
            var trTitle = ctx.trTitle;
            var enTitle = ctx.enTitle;
            var year = ctx.year;

            if (!results || results.length === 0) {
                console.log("[HD][MATCH] no search results");
                return [];
            }

            var targetType = (mediaType === "tv" || mediaType === "series") ? "dizi" : "film";
            var trNorm = normalizeTitle(trTitle);
            var enNorm = normalizeTitle(enTitle);
            var bestMatch = null;

            for (var i = 0; i < results.length; i++) {
                var item = results[i];
                if (item.type !== targetType) continue;
                var nameNorm = normalizeTitle(item.name);
                var matchesTitle = titleContains(nameNorm, trNorm) || titleContains(nameNorm, enNorm);
                var matchesYear = true;
                if (year && item.year) matchesYear = Math.abs(parseInt(item.year) - parseInt(year)) <= 1;
                if (matchesTitle && matchesYear) { bestMatch = item; break; }
            }

            if (!bestMatch) { console.log("[HD][MATCH] no title/year match"); return []; }
            console.log("[HD][MATCH] slug=" + bestMatch.slug);

            if (targetType === "dizi") {
                var seriesUrl = BASE_URL + "/dizi/" + bestMatch.slug + "/";
                console.log("[HD][SERIES] url=" + seriesUrl);
                return fetch(seriesUrl, { headers: { "User-Agent": USER_AGENT } })
                    .then(function(r) { return r.text(); })
                    .then(function(seriesHtml) {
                        console.log("[HD][SERIES] html length=" + seriesHtml.length);
                        var $ = cheerio.load(seriesHtml);
                        var tabPanes = $(".tab-pane");
                        console.log("[HD][SERIES] tab-panes=" + tabPanes.length);

                        var episodeUrl = null;

                        // FIX: Nuvio Cheerio'da return false döngüyü durdurmaz!
                        // Guard değişkeni ile erken çıkış yapıyoruz
                        tabPanes.eq(season - 1).find("a").each(function(idx, elem) {
                            if (episodeUrl) return; // guard
                            var href = $(elem).attr("href") || "";
                            console.log("[HD][EPISODE] candidate: " + href);
                            if (href.indexOf("/bolum-" + episode + "/") !== -1 ||
                                href.indexOf("/bolum-" + episode) !== -1) {
                                episodeUrl = href;
                            }
                        });

                        if (!episodeUrl) { console.log("[HD][EPISODE] not found"); return null; }
                        console.log("[HD][EPISODE] url=" + episodeUrl);
                        if (episodeUrl.indexOf("http") === 0) return episodeUrl;
                        return BASE_URL + (episodeUrl.indexOf("/") === 0 ? "" : "/") + episodeUrl;
                    });
            } else {
                return BASE_URL + "/" + bestMatch.slug + "/";
            }
        })
        .then(function(pageUrl) {
            if (!pageUrl) return [];
            if (Array.isArray(pageUrl)) return pageUrl;
            console.log("[HD][WATCH] url=" + pageUrl);
            return fetch(pageUrl, { headers: { "User-Agent": USER_AGENT } })
                .then(function(r) { return r.text(); })
                .then(function(html) {
                    console.log("[HD][WATCH] html length=" + html.length + " truncated=" + (html.indexOf("...[truncated]") !== -1));
                    var embedUrl = null;

                    // Method 1: parts array
                    var partsMatch = html.match(/let\s+parts\s*=\s*(\[[\s\S]*?\]);/);
                    if (partsMatch) {
                        try {
                            var parts = JSON.parse(partsMatch[1]);
                            if (parts && parts.length > 0 && parts[0].data) {
                                var sm = parts[0].data.match(/src=\\?"([\s\S]*?)\\?"/);
                                if (sm) embedUrl = sm[1].replace(/\\\//g, "/");
                            }
                        } catch(e) {}
                    }

                    // Method 2: iframe.vpx
                    if (!embedUrl) {
                        var $ = cheerio.load(html);
                        var iframe = $("iframe.vpx");
                        if (iframe.length) embedUrl = iframe.attr("data-src") || iframe.attr("src");
                    }

                    // Method 3: any player iframe — FIX: guard instead of return false
                    if (!embedUrl) {
                        var $2 = cheerio.load(html);
                        $2("iframe").each(function(idx, elem) {
                            if (embedUrl) return; // guard
                            var src = $2(elem).attr("src") || $2(elem).attr("data-src") || "";
                            if (src.indexOf("vidrame") !== -1 || src.indexOf("vidmoxy") !== -1 || src.indexOf("/vr/") !== -1) {
                                embedUrl = src;
                            }
                        });
                    }

                    if (!embedUrl) { console.log("[HD][EMBED] not found"); return null; }
                    if (embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;
                    console.log("[HD][EMBED] url=" + embedUrl);
                    return embedUrl;
                });
        })
        .then(function(embedUrl) {
            if (!embedUrl) return [];
            if (Array.isArray(embedUrl)) return embedUrl;
            console.log("[HD][DECODE] fetching embed: " + embedUrl);

            var embedOrigin = extractOrigin(embedUrl);
            var fetchHeaders = {
                "User-Agent": USER_AGENT,
                "Referer": embedUrl,
                "Origin": embedOrigin
            };

            return fetch(embedUrl, { headers: fetchHeaders })
                .then(function(r) { return r.text(); })
                .then(function(embedHtml) {
                    console.log("[HD][DECODE] embed length=" + embedHtml.length);
                    // Method 1: Vidrame XOR cipher
                    var decRegex = /\(\s*function\s*\(d\s*,\s*k\s*\)\s*\{\s*var\s+o\s*=\s*['"]\s*['"]\s*,[\s\S]*?\}\s*\)\s*\(\s*(\[[0-9,\s\-]+\])\s*,\s*['"](\w+)['"]\s*\)/g;
                    var directUrl = null;
                    var m;
                    while ((m = decRegex.exec(embedHtml)) !== null) {
                        try {
                            var decoded = decodeSources(JSON.parse(m[1]), m[2]);
                            if (decoded && decoded.indexOf("http") === 0) { directUrl = decoded; break; }
                        } catch(e) {}
                    }

                    // Method 2: Vidmoxy EE.dd (Base64 + ROT13 + Reverse)
                    if (!directUrl) {
                        var eeMatches = embedHtml.match(/EE\.dd\(["']([A-Za-z0-9+/=_-]+)["']\)/g);
                        if (eeMatches) {
                            for (var ei = 0; ei < eeMatches.length; ei++) {
                                var eeInner = eeMatches[ei].match(/EE\.dd\(["']([A-Za-z0-9+/=_-]+)["']\)/);
                                if (eeInner) {
                                    var eeDecoded = decodeEEdd(eeInner[1]);
                                    if (eeDecoded && eeDecoded.indexOf("http") === 0) {
                                        directUrl = eeDecoded;
                                        console.log("[HD][DECODE] EE.dd decoded: " + directUrl);
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (!directUrl) { console.log("[HD][DECODE] failed — no pattern matched"); return []; }
                    console.log("[HD][DIRECT] url=" + directUrl);

                    // Subtitles
                    var subs = [];
                    var trackM = embedHtml.match(/configs\.tracks\s*=\s*(\[[\s\S]*?\]);/);
                    if (trackM) {
                        try {
                            var tracks = JSON.parse(trackM[1]);
                            for (var ti = 0; ti < tracks.length; ti++) {
                                var t = tracks[ti];
                                var fileUrl = t.file || null;
                                if (!fileUrl && t.fx && t.fx.d && t.fx.k) fileUrl = decodeSources(t.fx.d, t.fx.k);
                                if (fileUrl && fileUrl.indexOf("http") === 0) {
                                    subs.push({
                                        url: fileUrl,
                                        language: t.srclang || t.language || "en",
                                        name: t.label || "Altyazi"
                                    });
                                }
                            }
                        } catch(e) {}
                    }

                    var streamHeaders = { "Referer": embedUrl, "Origin": embedOrigin, "User-Agent": USER_AGENT };

                    var stream = {
                        name: "HDFilmizle",
                        title: "1080p",
                        url: directUrl,
                        quality: "1080p",
                        type: "hls",
                        headers: streamHeaders
                    };
                    if (subs.length > 0) stream.subtitles = subs;

                    console.log("[HD][RETURN] success, url=" + directUrl);
                    return [stream];
                });
        })
        .catch(function(err) {
            console.error("[HD][ERROR] " + (err.message || err));
            return [];
        });
}

module.exports = { getStreams: getStreams };
