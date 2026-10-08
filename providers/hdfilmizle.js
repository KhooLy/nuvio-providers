var cheerio;
try { cheerio = require("cheerio-without-node-native"); } catch(e) { cheerio = require("cheerio"); }

var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var BASE_URL = "https://www.hdfilmizle.live";
var DOMAIN_CANDIDATES = [
    "https://www.hdfilmizle.live",
    "https://www.hdfilmizle.vip",
    "https://www.hdfilmizle.so"
];
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

var domainResolved = false;

function originOf(url) {
    var m = String(url || "").match(/^(https?:\/\/[^\/]+)/);
    return m ? m[1] : "";
}

function ensureBaseUrl() {
    if (domainResolved) return Promise.resolve();
    domainResolved = true;
    // The site redirects old domains to the current one; read the Location
    // header because the fetch bridge does not expose the final URL.
    return fetch("https://www.hdfilmizle.vip", { method: "GET", redirect: "manual" })
        .then(function(resp) {
            var loc = (resp && resp.headers && resp.headers.get) ? resp.headers.get("location") : "";
            var found = originOf(loc);
            if (found) BASE_URL = found;
            console.log("[HD][INIT] BASE_URL=" + BASE_URL);
        })
        .catch(function() { console.log("[HD][INIT] BASE_URL=" + BASE_URL); });
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
    var bases = [BASE_URL].concat(DOMAIN_CANDIDATES.filter(function(b) { return b !== BASE_URL; }));

    function attempt(index) {
        if (index >= bases.length) return Promise.resolve([]);
        var base = bases[index];
        return fetch(base + "/search/", {
            method: "POST",
            headers: {
                "User-Agent": USER_AGENT,
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": base + "/"
            },
            body: encoded
        })
        .then(function(response) {
            console.log("[HD][SEARCH] status=" + response.status + " base=" + base + " title=" + title);
            return response.text().then(function(text) {
                var parsed = null;
                try { parsed = JSON.parse(text); } catch(e) { parsed = null; }
                var results = null;
                if (Array.isArray(parsed)) results = parsed;
                else if (parsed && Array.isArray(parsed.results)) results = parsed.results;
                else if (parsed && Array.isArray(parsed.data)) results = parsed.data;
                if (response.ok && results) {
                    BASE_URL = base;
                    return results;
                }
                return attempt(index + 1);
            });
        })
        .catch(function(e) {
            console.log("[HD][SEARCH] failed: " + e.message);
            return attempt(index + 1);
        });
    }

    return attempt(0);
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

function absolutize(uri, baseDir) {
    if (!uri) return "";
    if (uri.indexOf("http") === 0) return uri;
    if (uri.indexOf("/") === 0) return extractOrigin(baseDir) + uri;
    return baseDir + "/" + uri;
}

function qualityLabel(width, height) {
    if (width >= 1900) return "1080p";
    if (width >= 1260) return "720p";
    if (width >= 840) return "480p";
    if (width >= 620) return "360p";
    if (height > 0) return height + "p";
    return null;
}

var LANG_LABELS = { tr: "Türkçe", en: "İngilizce", dual: "Çift Dil" };

function resolveEmbeds(html) {
    var embeds = [];
    var partsMatch = html.match(/let\s+parts\s*=\s*(\[[\s\S]*?\]);/);
    if (partsMatch) {
        try {
            var parts = JSON.parse(partsMatch[1]);
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                var srcMatch = String(part.data || "").match(/src=\\?"([\s\S]*?)\\?"/);
                if (!srcMatch) continue;
                var src = srcMatch[1].replace(/\\\//g, "/");
                if (src.indexOf("//") === 0) src = "https:" + src;
                if (src.indexOf("http") !== 0) continue;
                embeds.push({ url: src, name: part.name || ("Kaynak " + (i + 1)), lang: part.lang || null });
            }
        } catch(e) {}
    }
    if (embeds.length > 0) return embeds;

    var $ = cheerio.load(html);
    var fallback = null;
    var vpx = $("iframe.vpx");
    if (vpx.length) fallback = vpx.attr("data-src") || vpx.attr("src");
    if (!fallback) {
        $("iframe").each(function(idx, elem) {
            if (fallback) return;
            var src = $(elem).attr("src") || $(elem).attr("data-src") || "";
            if (src.indexOf("vidrame") !== -1 || src.indexOf("vidmoxy") !== -1 || src.indexOf("/vr/") !== -1) {
                fallback = src;
            }
        });
    }
    if (fallback) {
        if (fallback.indexOf("//") === 0) fallback = "https:" + fallback;
        embeds.push({ url: fallback, name: "HDFilmizle", lang: null });
    }
    return embeds;
}

function extractDirectUrl(embedHtml) {
    var decRegex = /\(\s*function\s*\(d\s*,\s*k\s*\)\s*\{\s*var\s+o\s*=\s*['"]\s*['"]\s*,[\s\S]*?\}\s*\)\s*\(\s*(\[[0-9,\s\-]+\])\s*,\s*['"](\w+)['"]\s*\)/g;
    var m;
    while ((m = decRegex.exec(embedHtml)) !== null) {
        try {
            var decoded = decodeSources(JSON.parse(m[1]), m[2]);
            if (decoded && decoded.indexOf("http") === 0) return decoded;
        } catch(e) {}
    }
    var eeMatches = embedHtml.match(/EE\.dd\(["']([A-Za-z0-9+/=_-]+)["']\)/g);
    if (eeMatches) {
        for (var ei = 0; ei < eeMatches.length; ei++) {
            var inner = eeMatches[ei].match(/EE\.dd\(["']([A-Za-z0-9+/=_-]+)["']\)/);
            if (!inner) continue;
            var eeDecoded = decodeEEdd(inner[1]);
            if (eeDecoded && eeDecoded.indexOf("http") === 0) return eeDecoded;
        }
    }
    return null;
}

function extractSubtitles(embedHtml) {
    var subs = [];
    var trackM = embedHtml.match(/configs\.tracks\s*=\s*(\[[\s\S]*?\]);/);
    if (!trackM) return subs;
    try {
        var tracks = JSON.parse(trackM[1]);
        for (var ti = 0; ti < tracks.length; ti++) {
            var t = tracks[ti];
            var fileUrl = t.file || null;
            if (!fileUrl && t.fx && t.fx.d && t.fx.k) fileUrl = decodeSources(t.fx.d, t.fx.k);
            if (fileUrl && fileUrl.indexOf("http") === 0) {
                subs.push({ url: fileUrl, language: t.srclang || t.language || "en", name: t.label || "Altyazi" });
            }
        }
    } catch(e) {}
    return subs;
}

function describePlaylist(url, headers) {
    var empty = { quality: null, resolution: null, audioTracks: [] };
    return fetch(url, { headers: headers })
        .then(function(r) { return r.ok ? r.text() : ""; })
        .then(function(text) {
            if (!text || text.indexOf("#EXT-X-STREAM-INF") === -1) return empty;
            var baseDir = url.substring(0, url.lastIndexOf("/"));
            var lines = text.split("\n");
            var audioTracks = [];
            var bestWidth = 0;
            var bestHeight = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.indexOf("#EXT-X-STREAM-INF") === 0) {
                    var resM = line.match(/RESOLUTION=(\d+)x(\d+)/);
                    if (resM) {
                        var w = parseInt(resM[1], 10);
                        var h = parseInt(resM[2], 10);
                        if (w > bestWidth) { bestWidth = w; bestHeight = h; }
                    }
                } else if (line.indexOf("#EXT-X-MEDIA:TYPE=AUDIO") === 0) {
                    var uriM = line.match(/URI="([^"]+)"/);
                    if (!uriM) continue;
                    var nameM = line.match(/NAME="([^"]+)"/);
                    var langM = line.match(/LANGUAGE="([^"]+)"/);
                    audioTracks.push({
                        url: absolutize(uriM[1], baseDir),
                        language: langM ? langM[1] : "",
                        name: nameM ? nameM[1] : (langM ? langM[1] : "Ses"),
                        headers: headers
                    });
                }
            }
            return {
                quality: qualityLabel(bestWidth, bestHeight),
                resolution: bestWidth > 0 ? (bestWidth + "x" + bestHeight) : null,
                audioTracks: audioTracks
            };
        })
        .catch(function() { return empty; });
}

function buildStreamsForEmbed(embed) {
    var embedOrigin = extractOrigin(embed.url);
    var fetchHeaders = { "User-Agent": USER_AGENT, "Referer": embed.url, "Origin": embedOrigin };
    console.log("[HD][DECODE] part=" + embed.name + " lang=" + embed.lang + " embed=" + embed.url);

    return fetch(embed.url, { headers: fetchHeaders })
        .then(function(r) { return r.text(); })
        .then(function(embedHtml) {
            var directUrl = extractDirectUrl(embedHtml);
            if (!directUrl) { console.log("[HD][DECODE] no pattern matched for part=" + embed.name); return []; }
            console.log("[HD][DIRECT] " + embed.name + " -> " + directUrl);

            var subs = extractSubtitles(embedHtml);
            var streamHeaders = { "Referer": embed.url, "Origin": embedOrigin, "User-Agent": USER_AGENT };

            return describePlaylist(directUrl, streamHeaders).then(function(info) {
                var langLabel = embed.lang ? (LANG_LABELS[embed.lang] || embed.lang) : null;
                var titleParts = [];
                if (info.quality) titleParts.push(info.quality);
                if (info.resolution) titleParts.push(info.resolution);
                if (langLabel) titleParts.push(langLabel);
                if (info.audioTracks.length > 0) {
                    titleParts.push(info.audioTracks.map(function(a) { return a.name; }).join(" / "));
                }

                var sourceLabel = langLabel || embed.name;
                var stream = {
                    name: "HDFilmizle" + (sourceLabel ? " · " + sourceLabel : ""),
                    title: titleParts.join(" · ") || "HDFilmizle",
                    url: directUrl,
                    quality: info.quality || "unknown",
                    type: "hls",
                    headers: streamHeaders
                };
                if (embed.lang) stream.language = embed.lang;
                if (subs.length > 0) stream.subtitles = subs;
                if (info.audioTracks.length > 0) stream.audioTracks = info.audioTracks;
                return [stream];
            });
        })
        .catch(function(e) {
            console.log("[HD][DECODE] part failed " + embed.name + ": " + (e.message || e));
            return [];
        });
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
                    console.log("[HD][WATCH] html length=" + html.length);
                    var embeds = resolveEmbeds(html);
                    console.log("[HD][EMBED] parts=" + embeds.length + " -> " + embeds.map(function(e) { return e.name + "/" + e.lang; }).join(", "));
                    if (embeds.length === 0) return [];

                    var chain = Promise.resolve([]);
                    embeds.forEach(function(embed) {
                        chain = chain.then(function(acc) {
                            return buildStreamsForEmbed(embed).then(function(list) { return acc.concat(list); });
                        });
                    });
                    return chain;
                });
        })
        .then(function(streams) {
            var list = streams || [];
            console.log("[HD][RETURN] streams=" + list.length +
                " audioTrackTotal=" + list.reduce(function(n, s) { return n + ((s.audioTracks || []).length); }, 0));
            return list;
        })
        .catch(function(err) {
            console.error("[HD][ERROR] " + (err.message || err));
            return [];
        });
}

module.exports = { getStreams: getStreams };
