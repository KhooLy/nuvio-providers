/**
 * Hianime.ms Nuvio Provider
 *
 * Anime streaming provider for Nuvio. Works by:
 *  1. Resolving AniList ID from TMDB/IMDB/AniList ID
 *  2. Querying new.vidnest.fun API for encrypted SUB and DUB streams
 *  3. Decrypting the custom Base64 payload (scrambled alphabet key)
 *  4. Returning HLS stream with CDN headers + subtitles
 */

var ANILIST_API  = "https://graphql.anilist.co";
var VIDNEST_BASE = "https://new.vidnest.fun/hianime/anime";
var DECRYPT_KEY  = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";

var CDN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
    "Referer":    "https://megaplay.buzz/",
    "Origin":     "https://megaplay.buzz"
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fetchJson(url, options) {
    return fetch(url, options || {})
        .then(function(r) {
            return r.text().then(function(body) {
                if (!r.ok) {
                    console.log("[HI][HTTP] " + r.status + " " + url);
                    return null;
                }
                try { return JSON.parse(body); } catch(e) { return null; }
            });
        })
        .catch(function(e) {
            console.log("[HI][FETCH] error: " + (e.message || e) + " url=" + url);
            return null;
        });
}

// ─── VidNest Decryption ────────────────────────────────────────────────────────

function decryptVidnest(encryptedData) {
    var keyMap = {};
    for (var idx = 0; idx < DECRYPT_KEY.length; idx++) {
        keyMap[DECRYPT_KEY[idx]] = idx;
    }

    var bytesOut = [];
    for (var i = 0; i < encryptedData.length; i += 4) {
        var chunk = encryptedData.slice(i, i + 4);
        while (chunk.length < 4) chunk += "=";

        var d = [];
        for (var ci = 0; ci < 4; ci++) {
            var v = keyMap[chunk[ci]];
            d.push(v !== undefined ? v : 64);
        }

        bytesOut.push((d[0] << 2) | (d[1] >> 4));
        if (d[2] !== 64) bytesOut.push(((d[1] & 0x0F) << 4) | (d[2] >> 2));
        if (d[3] !== 64) bytesOut.push(((d[2] & 0x03) << 6) | d[3]);
    }

    var str = "";
    for (var bi = 0; bi < bytesOut.length; bi++) {
        str += String.fromCharCode(bytesOut[bi]);
    }

    try { return JSON.parse(str); } catch(e) {
        console.log("[HI][DECRYPT] JSON.parse failed: " + e.message);
        return null;
    }
}

// ─── AniList Lookup ────────────────────────────────────────────────────────────

function resolveAnilistId(tmdbId, mediaType) {
    var idStr = String(tmdbId || "").trim();
    console.log("[HI][ANILIST] resolving id=" + idStr + " type=" + mediaType);

    var TMDB_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "";
    
    // If no TMDB Key or tmdbId is purely numeric, try querying AniList directly or using title lookup
    var isImdb = /^tt\d+$/i.test(idStr);
    
    if (!TMDB_KEY && !isImdb && /^\d+$/.test(idStr)) {
        // Fallback: treat numeric id directly as AniList ID
        console.log("[HI][ANILIST] using numeric id directly as AniList ID: " + idStr);
        return Promise.resolve({ anilistId: idStr, title: "Anime" });
    }

    var tmdbFetchUrl;
    if (isImdb) {
        tmdbFetchUrl = "https://api.themoviedb.org/3/find/" + encodeURIComponent(idStr) +
                       "?api_key=" + TMDB_KEY + "&external_source=imdb_id";
    } else {
        var ttype = (mediaType === "tv" || mediaType === "series" || mediaType === "anime") ? "tv" : "movie";
        tmdbFetchUrl = "https://api.themoviedb.org/3/" + ttype + "/" + idStr +
                       "?api_key=" + TMDB_KEY;
    }

    return fetchJson(tmdbFetchUrl)
        .then(function(tmdb) {
            var title, year;
            if (tmdb) {
                if (isImdb) {
                    var arr = tmdb.tv_results || tmdb.movie_results || [];
                    if (arr.length > 0) {
                        title = arr[0].name || arr[0].title || "";
                        year  = (arr[0].first_air_date || arr[0].release_date || "").split("-")[0];
                    }
                } else {
                    title = tmdb.name || tmdb.title || tmdb.original_name || tmdb.original_title || "";
                    year  = (tmdb.first_air_date || tmdb.release_date || "").split("-")[0];
                }
            }

            if (!title) {
                // Fallback: if TMDB failed or no key, assume idStr might be AniList ID directly
                console.log("[HI][ANILIST] TMDB lookup empty, fallback to idStr directly: " + idStr);
                return { anilistId: idStr, title: "Anime" };
            }

            console.log("[HI][ANILIST] TMDB title=" + title + " year=" + year);

            // Search AniList by title, sorted by popularity descending to get main TV series
            var gql = {
                query: "query($search:String){Page(page:1,perPage:5){media(search:$search,type:ANIME,sort:[POPULARITY_DESC]){id format title{english romaji}startDate{year}}}}",
                variables: { search: title }
            };

            return fetch(ANILIST_API, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(gql)
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var mediaList = data && data.data && data.data.Page && data.data.Page.media;
                if (!mediaList || !mediaList.length) {
                    console.log("[HI][ANILIST] no result for: " + title);
                    return { anilistId: idStr, title: title };
                }

                // Pick the best match
                var best = mediaList[0];
                if (year) {
                    for (var mi = 0; mi < mediaList.length; mi++) {
                        var item = mediaList[mi];
                        if (item.startDate && item.startDate.year && String(item.startDate.year) === String(year)) {
                            best = item;
                            break;
                        }
                    }
                }

                var foundTitle = (best.title && (best.title.english || best.title.romaji)) || title;
                console.log("[HI][ANILIST] matched AniList id=" + best.id + " title=" + foundTitle);
                return { anilistId: best.id, title: foundTitle };
            })
            .catch(function(e) {
                console.log("[HI][ANILIST] GraphQL error: " + (e.message || e));
                return { anilistId: idStr, title: title };
            });
        });
}

// ─── Stream Data Fetcher ───────────────────────────────────────────────────────

function fetchStreamData(anilistId, episodeNum, version) {
    var apiUrl = VIDNEST_BASE + "/" + anilistId + "/" + episodeNum + "/" + version;
    console.log("[HI][STREAM] fetching: " + apiUrl);

    return fetchJson(apiUrl, {
        headers: {
            "User-Agent": CDN_HEADERS["User-Agent"],
            "Accept": "application/json"
        }
    })
    .then(function(data) {
        if (!data) return null;
        if (!data.encrypted || !data.data) {
            console.log("[HI][STREAM] invalid format");
            return null;
        }

        var decrypted = decryptVidnest(data.data);
        if (!decrypted) return null;

        console.log("[HI][STREAM] decrypted " + version.toUpperCase() + " stream ok!");
        return decrypted;
    });
}

// ─── Main getStreams ───────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
    var epNum = episode || 1;
    console.log("[HI][START] tmdbId=" + tmdbId + " type=" + mediaType + " s=" + season + " e=" + epNum);

    return resolveAnilistId(tmdbId, mediaType)
        .then(function(resolved) {
            if (!resolved || !resolved.anilistId) {
                console.log("[HI][RESOLVE] failed to get AniList ID");
                return [];
            }

            var anilistId = resolved.anilistId;
            var showTitle = resolved.title;

            return Promise.all([
                fetchStreamData(anilistId, epNum, "sub"),
                fetchStreamData(anilistId, epNum, "dub")
            ])
            .then(function(results) {
                var streams = [];
                var versions = ["sub", "dub"];

                for (var vi = 0; vi < versions.length; vi++) {
                    var ver = versions[vi];
                    var decrypted = results[vi];
                    if (!decrypted) continue;

                    var sources = decrypted.sources || [];
                    if (!sources.length) continue;

                    var m3u8Url = sources[0].file || sources[0].url;
                    if (!m3u8Url) continue;

                    var subs = [];
                    var tracks = decrypted.tracks || [];
                    for (var ti = 0; ti < tracks.length; ti++) {
                        var t = tracks[ti];
                        if (t.file && t.kind === "captions") {
                            subs.push({
                                url:      t.file,
                                language: langCodeFromLabel(t.label),
                                name:     t.label || "Subtitle"
                            });
                        }
                    }

                    var stream = {
                        name:    "Hianime",
                        title:   "1080p · " + ver.toUpperCase() + (showTitle ? " · " + showTitle : ""),
                        url:     m3u8Url,
                        quality: "1080p",
                        type:    "hls",
                        headers: CDN_HEADERS
                    };

                    if (subs.length > 0)             stream.subtitles = subs;
                    if (decrypted.intro)              stream.intro     = decrypted.intro;
                    if (decrypted.outro)              stream.outro     = decrypted.outro;

                    streams.push(stream);
                }

                return streams;
            });
        })
        .catch(function(err) {
            console.error("[HI][ERROR] " + (err.message || err));
            return [];
        });
}

// ─── Utility ───────────────────────────────────────────────────────────────────

function langCodeFromLabel(label) {
    if (!label) return "en";
    var l = label.toLowerCase();
    if (l.indexOf("english") !== -1)    return "en";
    if (l.indexOf("arabic") !== -1)     return "ar";
    if (l.indexOf("french") !== -1)     return "fr";
    if (l.indexOf("german") !== -1)     return "de";
    if (l.indexOf("italian") !== -1)    return "it";
    if (l.indexOf("portuguese") !== -1) return "pt";
    if (l.indexOf("russian") !== -1)    return "ru";
    if (l.indexOf("spanish") !== -1)    return "es";
    if (l.indexOf("japanese") !== -1)   return "ja";
    if (l.indexOf("turkish") !== -1)    return "tr";
    return "en";
}

module.exports = { getStreams: getStreams };
