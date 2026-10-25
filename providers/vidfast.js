var API = "https://enc-dec.app/api";
var BASE = "https://vidfast.vc";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function headers(extra) {
    return Object.assign({
        "User-Agent": USER_AGENT,
        "Referer": BASE + "/",
        "X-Requested-With": "XMLHttpRequest"
    }, extra || {});
}

function fetchText(url, opts) {
    return fetch(url, opts).then(function (r) {
        return r.text().then(function (body) {
            if (!r.ok) {
                console.log("[VidFast] HTTP " + r.status + " " + url);
                return "";
            }
            return body;
        });
    }).catch(function (e) {
        console.log("[VidFast] " + (e.message || e));
        return "";
    });
}

function fetchJson(url, opts) {
    return fetchText(url, opts).then(function (body) {
        if (!body) return null;
        try { return JSON.parse(body); } catch (e) { return null; }
    });
}

function meta(tmdbId, mediaType) {
    var type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
    return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY).then(function (data) {
        return {
            type: type,
            title: data ? (data.title || data.name || "") : ""
        };
    });
}

function pageUrl(tmdbId, type, season, episode) {
    if (type === "tv") return BASE + "/tv/" + tmdbId + "/" + (season || 1) + "/" + (episode || 1) + "/";
    return BASE + "/movie/" + tmdbId + "/";
}

function qualityOf(name, description) {
    var text = String(name || "") + " " + String(description || "");
    if (/4k|2160/i.test(text)) return "4K";
    if (/1080/i.test(text)) return "1080p";
    if (/720/i.test(text)) return "720p";
    if (/480/i.test(text)) return "480p";
    return "Auto";
}

function decrypt(text) {
    return fetchJson(API + "/dec-vidfast", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ text: text })
    });
}

function resolveServer(item, streamBase, h) {
    return fetchText(streamBase + "/" + item.data, { method: "POST", headers: h })
        .then(function (enc) {
            if (!enc) return null;
            return decrypt(enc).then(function (res) {
                var data = res && res.result;
                if (!data || !data.url) return null;
                var quality = qualityOf(item.name, item.description);
                var subs = (data.tracks || []).filter(function (t) { return t && t.file; }).map(function (t) {
                    return { url: t.file, language: t.language || t.label || "en", name: t.label || "Subtitle" };
                });
                return {
                    name: "VidFast " + (item.name || "Server"),
                    title: (data.title || "") + " [" + quality + "] " + (item.description || ""),
                    url: data.url,
                    quality: quality,
                    headers: { "User-Agent": USER_AGENT, "Referer": BASE + "/" },
                    subtitles: subs
                };
            });
        });
}

function getStreams(tmdbId, mediaType, season, episode) {
    return meta(tmdbId, mediaType).then(function (info) {
        return fetchText(pageUrl(tmdbId, info.type, season, episode), { headers: { "User-Agent": USER_AGENT, "Referer": BASE + "/" } }).then(function (page) {
            var m = page.match(/\\"(?:en|token)\\":\\"(.*?)\\"/);
            if (!m) return [];
            return fetchJson(API + "/enc-vidfast?text=" + encodeURIComponent(m[1]) + "&stage=1").then(function (first) {
                var part = first && first.result;
                if (!part || !part.stage1) return [];
                var h = headers({ "X-CSRF-Token": part.token });
                return fetchText(part.stage1, { method: "POST", headers: h }).then(function (text) {
                    return fetchJson(API + "/enc-vidfast?text=" + encodeURIComponent(text) + "&stage=2").then(function (second) {
                        var stage = second && second.result;
                        if (!stage || !stage.servers || !stage.stream) return [];
                        h["X-CSRF-Token"] = stage.token || "";
                        return fetchText(stage.servers, { method: "POST", headers: h }).then(function (serversEnc) {
                            return decrypt(serversEnc).then(function (res) {
                                var servers = (res && res.result) || [];
                                if (!Array.isArray(servers)) return [];
                                return Promise.all(servers.map(function (server) {
                                    return resolveServer(server, stage.stream, h).catch(function () { return null; });
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
                    });
                });
            });
        });
    }).catch(function (e) {
        console.log("[VidFast] " + (e.message || e));
        return [];
    });
}

module.exports = { getStreams: getStreams };
