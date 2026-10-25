var BASE = "https://premiumsmart.eu";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function headers(extra) {
    return Object.assign({
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Referer": BASE + "/",
        "X-Requested-With": "XMLHttpRequest"
    }, extra || {});
}

function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) {
        return r.text().then(function (body) {
            if (!r.ok) {
                console.log("[PremiumSmart] HTTP " + r.status + " " + url);
                return null;
            }
            try { return JSON.parse(body); } catch (e) { return null; }
        });
    }).catch(function (e) {
        console.log("[PremiumSmart] " + (e.message || e));
        return null;
    });
}

function fetchText(url, opts) {
    return fetch(url, opts).then(function (r) {
        return r.text().then(function (body) {
            return r.ok ? body : "";
        });
    }).catch(function (e) {
        console.log("[PremiumSmart] " + (e.message || e));
        return "";
    });
}

function meta(tmdbId, mediaType) {
    var type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
    return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=pl-PL").then(function (data) {
        return {
            type: type,
            title: data ? (data.title || data.name || "") : "",
            original: data ? (data.original_title || data.original_name || "") : ""
        };
    });
}

function apiSearch(query) {
    if (!query) return Promise.resolve([]);
    return fetchJson(BASE + "/api/v1/search/" + encodeURIComponent(query) + "?loader=searchAutocomplete", { headers: headers() }).then(function (data) {
        return (data && data.results) || [];
    });
}

function findTitle(info, tmdbId) {
    var queries = [info.title, info.original].filter(function (q, i, all) { return q && all.indexOf(q) === i; });

    function tryNext(index) {
        if (index >= queries.length) return Promise.resolve(null);
        return apiSearch(queries[index]).then(function (rows) {
            var exact = rows.filter(function (row) { return String(row.tmdb_id) === String(tmdbId); });
            if (exact.length) return exact[0];
            if (rows.length) return rows[0];
            return tryNext(index + 1);
        });
    }

    return tryNext(0);
}

function videoUrls(data) {
    var rows = [];
    if (!data) return rows;
    if (data.video) rows.push(data.video);
    if (Array.isArray(data.alternative_videos)) rows = rows.concat(data.alternative_videos);
    return rows;
}

function qualityOf(video) {
    var text = String(video.quality || "") + " " + String(video.name || "") + " " + String(video.language_type || "");
    if (/4k|2160/i.test(text)) return "4K";
    if (/1080/i.test(text)) return "1080p";
    if (/720/i.test(text)) return "720p";
    if (/480/i.test(text)) return "480p";
    return "Auto";
}

function subtitlesOf(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (sub) { return sub && sub.file_path; }).map(function (sub) {
        var lang = String(sub.language || sub.label || "en").toLowerCase();
        return {
            url: sub.file_path,
            language: lang,
            name: sub.label || sub.language || "Subtitle"
        };
    });
}

function resolveVidara(video) {
    var m = String(video.src || "").match(/vidaraa\.cc\/([A-Za-z0-9]+)/);
    if (!m) return null;
    var code = m[1];
    var referer = "https://vidaraa.cc/" + code;
    return fetchJson("https://vidaraa.cc/api/stream", {
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Origin": "https://vidaraa.cc",
            "Referer": referer
        },
        body: JSON.stringify({ filecode: code, device: "desktop", codecs: { h264: true, hevc: true, av1: false } })
    }).then(function (data) {
        if (!data || !data.streaming_url) return null;
        return {
            name: "PremiumSmart " + (video.name || "Vidara"),
            title: video.name + " [" + qualityOf(video) + "] " + (video.language_type || "") + "\n" + (data.title || ""),
            url: data.streaming_url,
            quality: qualityOf(video),
            headers: { "User-Agent": USER_AGENT, "Referer": referer },
            subtitles: subtitlesOf(data.subtitles)
        };
    });
}

function embedStream(video) {
    var src = String(video.src || "");
    if (!src) return null;
    if (/\.(m3u8|mp4)(\?|$)/i.test(src)) {
        return {
            name: "PremiumSmart " + (video.name || "Direct"),
            title: video.name + " [" + qualityOf(video) + "] " + (video.language_type || ""),
            url: src,
            quality: qualityOf(video),
            headers: { "User-Agent": USER_AGENT, "Referer": BASE + "/" }
        };
    }
    return {
        name: "PremiumSmart " + (video.name || "Embed"),
        title: video.name + " [" + qualityOf(video) + "] " + (video.language_type || "") + "\n" + BASE,
        url: src,
        quality: qualityOf(video),
        isEmbed: true
    };
}

function resolveVideo(video) {
    if (!video || !video.src) return Promise.resolve(null);
    if (/vidaraa\.cc/i.test(video.src)) {
        return resolveVidara(video).then(function (stream) {
            return stream || embedStream(video);
        });
    }
    return Promise.resolve(embedStream(video));
}

function movieVideos(titleId) {
    return fetchJson(BASE + "/api/v1/titles/" + titleId + "?loader=titlePage", { headers: headers() }).then(function (data) {
        var videos = (data && data.title && data.title.videos) || [];
        return videos.filter(function (video) { return video && video.category === "full" && video.src; });
    });
}

function episodeVideos(titleId, season, episode) {
    return fetchJson(BASE + "/api/v1/titles/" + titleId + "/seasons/" + (season || 1) + "?loader=seasonPage", { headers: headers() }).then(function (data) {
        var episodes = (data && data.episodes && data.episodes.data) || [];
        var row = episodes.filter(function (item) { return Number(item.episode_number) === Number(episode || 1); })[0];
        if (!row || !row.primary_video || !row.primary_video.id) return [];
        return fetchJson(BASE + "/api/v1/watch/" + row.primary_video.id + "?loader=watchPage", { headers: headers() }).then(function (watch) {
            var rows = videoUrls(watch);
            if (!rows.length) rows = [row.primary_video];
            return rows.filter(function (video) { return video && video.src; });
        });
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    return meta(tmdbId, mediaType).then(function (info) {
        return findTitle(info, tmdbId).then(function (title) {
            if (!title || !title.id) return [];
            var list = info.type === "tv" ? episodeVideos(title.id, season, episode) : movieVideos(title.id);
            return list.then(function (videos) {
                return Promise.all(videos.map(function (video) {
                    return resolveVideo(video).catch(function () { return null; });
                })).then(function (rows) {
                    var seen = {};
                    return rows.filter(function (row) {
                        if (!row || !row.url || seen[row.url]) return false;
                        seen[row.url] = true;
                        return true;
                    });
                });
            });
        });
    }).catch(function (e) {
        console.log("[PremiumSmart] " + (e.message || e));
        return [];
    });
}

module.exports = { getStreams: getStreams };
