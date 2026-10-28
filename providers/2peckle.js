var _0xPFX = "aHR0cHM6Ly9wZW5ndS51aw==";
var _0xT1 = "N01oSGwxRmJp";
var _0xT2 = "akNRLUlNZDh";
var _0xT3 = "CZXZmYjZrSV";
var _0xT4 = "dJUU93ZDlIdl";
var _0xT5 = "MyT0hrUkVZTQ==";

function b64decode(str) {
    if (typeof atob === "function") {
        try { return atob(str); } catch(e) {}
    }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    str = String(str || "").replace(/=+$/, "");
    for (var bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

var ADDON_BASE = b64decode(_0xPFX);
var _0xTOKEN = b64decode(_0xT1 + _0xT2 + _0xT3 + _0xT4 + _0xT5);
var ADDON_CONFIG = "%7B%22auth_token%22%3A%22"
    + _0xTOKEN
    + "%22%2C%22source_2peckle%22%3A%22checked%22%2C%22res_2160%22%3A%22checked%22%2C%22res_1080%22%3A%22checked%22%2C%22res_720%22%3A%22unchecked%22%2C%22res_480%22%3A%22unchecked%22%2C%22res_360%22%3A%22unchecked%22%7D";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

function getTmdbKey() {
    try {
        if (typeof globalThis !== "undefined") {
            if (globalThis.TMDB_API_KEY) return globalThis.TMDB_API_KEY;
            if (globalThis.TMDB_KEY) return globalThis.TMDB_KEY;
        }
        if (typeof window !== "undefined") {
            if (window.TMDB_API_KEY) return window.TMDB_API_KEY;
            if (window.TMDB_KEY) return window.TMDB_KEY;
        }
        var s = null;
        if (typeof globalThis !== "undefined") s = globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS;
        if (!s && typeof window !== "undefined") s = window.SCRAPER_SETTINGS || window.SETTINGS;
        if (s && (s.tmdbKey || s.tmdb_key || s.apiKey || s.api_key)) {
            return s.tmdbKey || s.tmdb_key || s.apiKey || s.api_key;
        }
    } catch(e) {}
    var pool = [
        "ZjE1YWFmOWNmMDVmMTRlY2UzMDliNjhjYWQwMWNlMjU=",
        "NDM5YzQ3OGE3NzFmMzVjMDUwMjJmOWZlYWJjY2EwMWM="
    ];
    return b64decode(pool[Math.floor(Math.random() * pool.length)]);
}

function getInvertedSortTag(score, maxScore) {
    maxScore = maxScore || 999999;
    var val = Math.max(0, parseInt(score, 10) || 0);
    var inv = Math.max(0, maxScore - val);
    var bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    var chars = [];
    for (var i = 0; i < bin.length; i++) {
        chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
    }
    return chars.join("");
}

function onSettings() {
    return [
        {
            type: "select",
            key: "qualityMode",
            name: "quality_mode",
            label: "Quality Filter",
            options: [
                { label: "4K + 1080p", value: "both" },
                { label: "4K ONLY", value: "4k" },
                { label: "1080p ONLY", value: "1080p" }
            ],
            default: "both"
        },
        {
            type: "text",
            key: "tmdbKey",
            name: "tmdb_key",
            label: "Custom TMDB API Key (Optional)",
            default: ""
        }
    ];
}

function resolveSettings(customSettings) {
    var qualityMode = "both";
    try {
        var s = customSettings;
        if (!s && typeof globalThis !== "undefined") s = globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS || globalThis.settings;
        if (!s && typeof global !== "undefined") s = global.SCRAPER_SETTINGS || global.SETTINGS || global.settings;
        if (!s && typeof window !== "undefined") s = window.SCRAPER_SETTINGS || window.SETTINGS || window.settings;
        if (s) {
            var q = String(s.qualityMode || s.quality_mode || "both").toLowerCase();
            if (q === "4k" || q === "1080p") qualityMode = q;
        }
    } catch (e) {}
    return { qualityMode: qualityMode };
}

function getStreams(tmdbId, mediaType, season, episode) {
    var rawId = tmdbId;
    if (typeof tmdbId === "object" && tmdbId !== null) {
        rawId = tmdbId.tmdbId || tmdbId.id || tmdbId.imdbId || tmdbId.imdb_id || tmdbId;
    }
    var cleanId = String(rawId || "").replace(/^(?:tmdb|imdb):/i, "").trim();

    var type = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    var ep   = parseInt(episode, 10) || 1;
    var sea  = parseInt(season, 10)  || 1;
    console.log("[2peckle] " + type + " id=" + cleanId + (type === "tv" ? " S" + sea + "E" + ep : ""));

    if (cleanId.indexOf("tt") === 0) {
        return resolvePengu(cleanId, type, sea, ep);
    }

    var tmdbKey = getTmdbKey();
    var tmdbEndpoint = type === "tv" ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + tmdbEndpoint + "/" + cleanId +
              "?api_key=" + tmdbKey + "&append_to_response=external_ids";

    return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function(data) {
        var imdbId = (data.external_ids && data.external_ids.imdb_id) || "";
        var useId = imdbId || cleanId;
        console.log("[2peckle] resolved imdb=" + imdbId + " — using " + useId);
        return resolvePengu(useId, type, sea, ep);
    })
    .catch(function(e) {
        console.log("[2peckle] TMDB lookup failed (" + e.message + "), using raw id");
        return resolvePengu(cleanId, type, sea, ep);
    });
}

function resolvePengu(id, type, season, episode) {
    var settings = resolveSettings();

    var url = ADDON_BASE + "/" + ADDON_CONFIG + "/stream/" +
        (type === "tv" ? "series/" + id + ":" + season + ":" + episode : "movie/" + id) + ".json";

    console.log("[2peckle] addon: " + url);

    return fetch(url, {
        headers: {
            "User-Agent": UA,
            "Accept": "application/json"
        },
        redirect: "follow"
    })
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function(data) {
        var streams = (data && data.streams) || [];
        console.log("[2peckle] addon returned " + streams.length + " stream(s)");
        return finalizeStreams(streams, settings);
    })
    .catch(function(e) {
        console.log("[2peckle] error: " + e.message);
        return [];
    });
}

function classifyQuality(s) {
    var text = [
        s.name || "",
        (s.behaviorHints && s.behaviorHints.bingeGroup) || "",
        (s.behaviorHints && s.behaviorHints.filename) || "",
        s.description || ""
    ].join(" ").toLowerCase();

    if (/4k|2160|uhd/.test(text)) return "4K";
    if (/1080|fhd/.test(text)) return "1080p";
    return "";
}

function stripEmoji(text) {
    return String(text || "")
        .replace(/[\p{Extended_Pictographic}\uFE0F\u20E3]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

function formatBytes(bytes) {
    var n = parseInt(bytes, 10);
    if (!n || n <= 0) return "";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
    return n + " B";
}

function parseServerInfo(description) {
    var d = String(description || "");
    var info = {};

    var mSrc = d.match(/🎥\s*([^🎞\n]+?)\s*(?:🎞️|\n|$)/);
    if (mSrc) info.source = mSrc[1].trim();
    var mCodec = d.match(/🎞️\s*([^\n]+)/);
    if (mCodec) info.codec = mCodec[1].trim();

    var mAudio = d.match(/(?:🔊|🎧)\s*([^\n]+)/);
    if (mAudio) info.audio = mAudio[1].trim();

    var mSize = d.match(/📦\s*([\d.]+\s*(?:GB|MB|TB))/i);
    if (mSize) info.size = mSize[1].toUpperCase().replace(/\s+/g, " ");

    var mRate = d.match(/📊\s*([\d.]+\s*Mbps)/i);
    if (mRate) info.bitrate = mRate[1];

    return info;
}

function finalizeStreams(streams, settings) {
    var seen = {};
    var filtered = [];

    for (var i = 0; i < streams.length; i++) {
        var s = streams[i] || {};

        var url = s.url || "";
        if (!/^https?:\/\//i.test(url)) continue;
        if (/donate|support the project/i.test((s.name || "") + " " + (s.description || ""))) continue;

        var bh = s.behaviorHints || {};
        var fullText = (s.name || "") + "\n" + (s.description || "") + "\n" +
            (bh.bingeGroup || "") + "\n" + (bh.filename || "") + "\n" + url;

        if (!/2peckle/i.test(fullText)) continue;

        var q = classifyQuality(s);
        if (!q) continue;
        if (settings.qualityMode === "4k" && q !== "4K") continue;
        if (settings.qualityMode === "1080p" && q !== "1080p") continue;

        if (seen[url]) continue;
        seen[url] = true;

        filtered.push({ stream: s, url: url, quality: q });
    }

    filtered.sort(function(a, b) {
        if (a.quality !== b.quality) return a.quality === "4K" ? -1 : 1;
        var sa = (a.stream.behaviorHints && a.stream.behaviorHints.videoSize) || 0;
        var sb = (b.stream.behaviorHints && b.stream.behaviorHints.videoSize) || 0;
        return sb - sa;
    });

    console.log("[2peckle] final streams (STRICT " + settings.qualityMode + "): " + filtered.length);

    return filtered.map(function(entry, idx) {
        return makeStream(entry, idx);
    });
}

function makeStream(entry, rank) {
    var s = entry.stream;
    var q = entry.quality;
    var qUp = q.toUpperCase();

    var label = stripEmoji(s.name);
    if (!label) label = qUp;
    if (q === "1080p" && !/1080/i.test(label)) label = "1080p " + label;

    var serverInfo = parseServerInfo(s.description);
    var size = formatBytes(s.behaviorHints && s.behaviorHints.videoSize) || serverInfo.size || "";

    var host = pickHost(entry.url);
    var typeTag = /\.m3u8(\?|$)/i.test(entry.url) ? "HLS" : (/\.mkv(\?|$)/i.test(entry.url) ? "MKV" : "MP4");

    var mainTitle = ["2Peckle", label].filter(Boolean).join(" • ");
    if (size) mainTitle += " • " + size;

    var line1 = [serverInfo.source, serverInfo.codec, serverInfo.audio].filter(Boolean).join(" • ");
    var line2 = [serverInfo.bitrate].filter(Boolean).join(" • ");
    var line3 = [typeTag, host].filter(Boolean).join(" • ");
    var streamTitle = [line1, line2, line3].filter(Boolean).join("\n");
    if (!streamTitle) streamTitle = "2Peckle";

    var score = q === "4K" ? 2 : 1;
    var sortTag = getInvertedSortTag(score, 10);

    return {
        name: sortTag + mainTitle,
        title: mainTitle,
        size: streamTitle,
        url: entry.url,
        quality: qUp,
        headers: {
            "User-Agent": UA,
            "Referer": ADDON_BASE + "/",
            "Accept": "*/*"
        },
        _host: host
    };
}

function pickHost(url) {
    try {
        if (typeof URL === "function") {
            return new URL(url).hostname.replace(/^www\./, "");
        }
        var m = String(url).match(/^https?:\/\/([^\/]+)/i);
        return m ? m[1].replace(/^www\./, "") : "CDN";
    } catch (e) {
        return "CDN";
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams, onSettings: onSettings };
} else if (typeof globalThis !== "undefined") {
    globalThis.getStreams = getStreams;
    globalThis.onSettings = onSettings;
} else if (typeof window !== "undefined") {
    window.getStreams = getStreams;
    window.onSettings = onSettings;
}

(function nuvioLivenessBootstrap() {
    var CONCURRENCY = 6;
    var PROBE_TIMEOUT = 3000;
    var BUDGET = 6000;
    var DEAD_STATUS = { 404: 1, 410: 1, 451: 1 };
    var MEDIA_URL = /\.(?:m3u8|mpd|mp4|mkv|m4v|webm|ts|m2ts|avi|mov)(?:$|[?#])/i;

    function isHttp(url) {
        return /^https?:\/\//i.test(String(url || ""));
    }

    function isLocal(url) {
        return /^https?:\/\/(?:localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(String(url || ""));
    }

    function streamHeaders(stream) {
        var out = {};
        var source = stream && (stream.headers ||
            (stream.behaviorHints && stream.behaviorHints.proxyHeaders && stream.behaviorHints.proxyHeaders.request) ||
            (stream.proxyHeaders && stream.proxyHeaders.request));
        if (source && typeof source === "object" && !Array.isArray(source)) {
            for (var key in source) {
                if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
                var value = source[key];
                if (typeof value === "string" && value.trim()) out[key] = value;
            }
        }
        if (!out["User-Agent"] && !out["user-agent"]) {
            out["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        }
        return out;
    }

    function request(url, headers, method) {
        if (typeof fetch !== "function") return Promise.resolve(0);
        var copy = {};
        for (var name in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, name)) copy[name] = headers[name];
        }
        if (method === "GET") copy.Range = "bytes=0-1";
        var opts = { method: method, headers: copy, redirect: "follow" };
        var controller = null;
        var timer = null;
        try {
            if (typeof AbortController === "function") {
                controller = new AbortController();
                opts.signal = controller.signal;
            }
        } catch (e) {}
        if (controller && typeof setTimeout === "function") {
            timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, PROBE_TIMEOUT);
        }
        return fetch(url, opts).then(function (res) {
            if (timer) clearTimeout(timer);
            if (method === "GET" && res && res.body && typeof res.body.cancel === "function") {
                try {
                    var cancelled = res.body.cancel();
                    if (cancelled && typeof cancelled.catch === "function") cancelled.catch(function () {});
                } catch (e) {}
            }
            return res ? Number(res.status) || 0 : 0;
        }).catch(function () {
            if (timer) clearTimeout(timer);
            return 0;
        });
    }

    function verdict(status, url) {
        if (!status) return "unknown";
        if (status >= 200 && status < 400) return "live";
        if (DEAD_STATUS[status]) return "dead";
        if ((status === 401 || status === 403) && MEDIA_URL.test(String(url || ""))) return "dead";
        return "unknown";
    }

    function probe(stream) {
        var url = String(stream && stream.url || "");
        if (!isHttp(url) || isLocal(url)) return Promise.resolve("unknown");
        var headers = streamHeaders(stream);
        return request(url, headers, "HEAD").then(function (headStatus) {
            if (verdict(headStatus, url) === "live") return "live";
            return request(url, headers, "GET").then(function (getStatus) {
                if (verdict(getStatus, url) === "live") return "live";
                if (verdict(headStatus, url) === "dead" || verdict(getStatus, url) === "dead") return "dead";
                if (!headStatus && !getStatus) return "unknown";
                return "unknown";
            });
        });
    }

    function filterRows(rows) {
        if (!Array.isArray(rows) || !rows.length) return Promise.resolve(rows);
        var verdicts = new Array(rows.length);
        var cache = {};
        var next = 0;
        var active = 0;
        var done = 0;
        var finished = false;
        var timer = null;

        return new Promise(function (resolve) {
            function finish() {
                if (finished) return;
                finished = true;
                if (timer) clearTimeout(timer);
                var out = [];
                for (var i = 0; i < rows.length; i++) {
                    if (verdicts[i] !== "dead") out.push(rows[i]);
                }
                resolve(out);
            }
            if (typeof setTimeout === "function") timer = setTimeout(finish, BUDGET);
            function launch() {
                while (active < CONCURRENCY && next < rows.length) {
                    (function (index) {
                        var row = rows[index];
                        var key = String(row && row.url || "");
                        if (!cache[key]) {
                            try { cache[key] = probe(row); } catch (e) { cache[key] = Promise.resolve("unknown"); }
                        }
                        active++;
                        cache[key].then(function (value) {
                            verdicts[index] = value;
                        }, function () {
                            verdicts[index] = "unknown";
                        }).then(function () {
                            active--;
                            done++;
                            if (done >= rows.length) finish();
                            else launch();
                        });
                    })(next++);
                }
            }
            launch();
        });
    }

    function wrap(fn) {
        if (typeof fn !== "function" || fn.__nuvioLivenessWrapped) return fn;
        function wrapped() {
            var self = this;
            var args = arguments;
            var result;
            try { result = fn.apply(self, args); } catch (e) { return Promise.resolve([]); }
            return Promise.resolve(result).then(function (rows) {
                return filterRows(rows);
            }, function () { return []; });
        }
        wrapped.__nuvioLivenessWrapped = true;
        return wrapped;
    }

    if (typeof module !== "undefined" && module.exports && typeof module.exports.getStreams === "function") {
        module.exports.getStreams = wrap(module.exports.getStreams);
    }
    if (typeof globalThis !== "undefined" && typeof globalThis.getStreams === "function") {
        globalThis.getStreams = wrap(globalThis.getStreams);
    }
    if (typeof window !== "undefined" && typeof window.getStreams === "function") {
        window.getStreams = wrap(window.getStreams);
    }
})();
