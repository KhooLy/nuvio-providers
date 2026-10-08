/**
 * Vidlove Nuvio Provider
 *
 * Resolves playable HLS streams for a TMDB id. Works by calling the internal
 * API for the requested content and returning the master playlist (audio is
 * muxed into the variants) plus subtitles. The exact stream provider is an
 * implementation detail and may change.
 */

var ENDPOINT = "https://api.vidlove.cc";

var HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Referer":    "https://player.vidlove.cc/",
    "Origin":     "https://player.vidlove.cc"
};

var COMBOS = [
    ["vidapi", ""],
    ["moviebox2", "1"],
    ["vidapi", "1"],
    ["moviebox2", ""]
];

function fetchJson(url) {
    return fetch(url, { headers: HEADERS })
        .then(function(r) {
            return r.text().then(function(body) {
                if (!r.ok) {
                    console.log("[VID][HTTP] " + r.status + " " + url);
                    return null;
                }
                try { return JSON.parse(body); } catch (e) { return null; }
            });
        })
        .catch(function(e) {
            console.log("[VID][FETCH] " + (e.message || e));
            return null;
        });
}

function variants(manifest) {
    var lines = String(manifest || "").split("\n");
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
        var bw = /BANDWIDTH=(\d+)/.exec(lines[i]);
        var res = /RESOLUTION=\d+x(\d+)/.exec(lines[i]);
        var uri = null;
        for (var j = i + 1; j < lines.length; j++) {
            var next = lines[j].trim();
            if (next && next[0] !== "#") { uri = next; break; }
        }
        if (uri) {
            out.push({
                uri: uri,
                bandwidth: bw ? parseInt(bw[1], 10) : 0,
                height: res ? parseInt(res[1], 10) : 0
            });
        }
    }
    return out;
}

function toSubtitles(tracks) {
    if (!Array.isArray(tracks)) return [];
    return tracks
        .filter(function(t) { return t && t.file; })
        .map(function(t) {
            return {
                url: t.file,
                language: t.lang || t.srclang || "en",
                name: t.label || "Subtitle"
            };
        });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var base = isTv
        ? ENDPOINT + "/tv?id=" + tmdbId + "&season=" + season + "&episode=" + episode + "&mode=json"
        : ENDPOINT + "/movie?id=" + tmdbId + "&mode=json";

    function attempt(i) {
        if (i >= COMBOS.length) return Promise.resolve([]);
        var src = COMBOS[i][0];
        var hevc = COMBOS[i][1];
        var url = base + "&sources=" + src + (hevc ? "&hevc=" + hevc : "");
        return fetchJson(url).then(function(payload) {
            var source = payload && payload.source;
            var subs = toSubtitles(payload && payload.subtitles);

            if (source && source.url) {
                console.log("[VID][OK] source=" + src + " master=" + source.url);
                return [{
                    name: "Vidlove",
                    title: "Auto",
                    url: source.url,
                    quality: "auto",
                    type: "hls",
                    headers: HEADERS,
                    subtitles: subs
                }];
            }

            var list = source && source.manifest ? variants(source.manifest) : [];
            if (list.length) {
                var best = list.reduce(function(a, b) { return b.bandwidth > a.bandwidth ? b : a; });
                console.log("[VID][OK] source=" + src + " variant=" + best.height + "p");
                return [{
                    name: "Vidlove",
                    title: best.height ? best.height + "p" : "Auto",
                    url: best.uri,
                    quality: best.height ? best.height + "p" : "auto",
                    type: "hls",
                    headers: HEADERS,
                    subtitles: subs
                }];
            }

            return attempt(i + 1);
        });
    }

    return attempt(0).catch(function(err) {
        console.error("[VID][ERROR] " + (err.message || err));
        return [];
    });
}

module.exports = { getStreams: getStreams };
