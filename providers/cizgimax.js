var BASE = "https://cizgimax.online";
var TAU = "https://tau-video.xyz/api/video/";
var ADDON_NAME = "CizgiMax";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var MAX_SERVERS = 12;

function b64decode(s) {
    try {
        if (typeof atob !== "undefined") return atob(s);
        return Buffer.from(String(s || ""), "base64").toString("binary");
    } catch (e) { return ""; }
}

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
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tmdbMeta(tmdbId, mediaType) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR";
    return fetchJson(url).then(function (data) {
        if (!data || (!data.title && !data.name)) {
            return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY);
        }
        return data;
    }).then(function (data) {
        if (!data) return null;
        return {
            isTv: isTv,
            title: data.title || data.name || data.original_title || data.original_name || "",
            original: data.original_title || data.original_name || "",
            year: String(data.release_date || data.first_air_date || "").split("-")[0]
        };
    });
}

function searchSite(title) {
    var url = BASE + "/ara/?q=" + encodeURIComponent(title);
    return fetchText(url).then(function (html) {
        var out = [];
        var seen = {};
        var re = /href="(\/(?:diziler|film)\/[^"]+?-izle\/)"/g;
        var m;
        while ((m = re.exec(html)) !== null) {
            if (seen[m[1]]) continue;
            seen[m[1]] = true;
            out.push(m[1]);
        }
        return out;
    });
}

function scoreHref(href, want) {
    var slug = normalize(href.replace(/^\/(diziler|film)\//, "").replace(/\/?$/, "").replace(/-izle$/, ""));
    var slugTokens = slug.split(" ").filter(Boolean);
    var wantTokens = want.split(" ").filter(Boolean);
    if (!wantTokens.length) return 0;
    if (slug === want) return 100;
    var matched = 0;
    for (var i = 0; i < wantTokens.length; i++) if (slugTokens.indexOf(wantTokens[i]) !== -1) matched++;
    var denom = Math.max(wantTokens.length, slugTokens.length);
    var score = 100 * matched / denom;
    if (slug.indexOf(want) !== -1) score += 15;
    return score;
}

function pickResult(list, meta) {
    var want = normalize(meta.title);
    var wantOriginal = normalize(meta.original);
    var best = null;
    for (var i = 0; i < list.length; i++) {
        var href = list[i];
        var isFilm = href.indexOf("/film/") === 0;
        if (isFilm === meta.isTv) continue;
        var s = Math.max(scoreHref(href, want), wantOriginal ? scoreHref(href, wantOriginal) : 0);
        if (meta.year) {
            if (href.indexOf(meta.year) !== -1) s += 40;
            else {
                var ym = /-(19\d{2}|20\d{2})-/.exec(href);
                if (ym && Math.abs(parseInt(ym[1], 10) - parseInt(meta.year, 10)) > 1) s -= 40;
            }
        }
        if (!best || s > best.score) best = { score: s, href: href };
    }
    if (!best || best.score < 60) return null;
    return BASE + best.href;
}

function findEpisode(seriesHtml, season, episode) {
    var s = parseInt(season, 10) || 0;
    var e = parseInt(episode, 10) || 0;
    var links = [];
    var re = /href="(\/[^"]*?-(\d+)-sezon-(\d+)-bolum-izle\/)"/g;
    var m;
    while ((m = re.exec(seriesHtml)) !== null) {
        links.push({ href: m[1], season: parseInt(m[2], 10), episode: parseInt(m[3], 10) });
    }
    for (var i = 0; i < links.length; i++) {
        if (links[i].season === s && links[i].episode === e) return BASE + links[i].href;
    }
    return null;
}

function extractServerBlob(html) {
    var m = /JSON\.parse\(atob\(\\?["']([A-Za-z0-9+/=]{40,})\\?["']\)\)/.exec(html);
    if (!m) return null;
    try { return JSON.parse(b64decode(m[1])); } catch (e) { return null; }
}

function normalizeServers(blob) {
    var out = [];
    if (!blob) return out;
    if (Array.isArray(blob)) {
        for (var i = 0; i < blob.length; i++) out.push(blob[i]);
    } else {
        var groups = ["sub", "dub", "any"];
        for (var g = 0; g < groups.length; g++) {
            var arr = blob[groups[g]];
            if (!Array.isArray(arr)) continue;
            for (var j = 0; j < arr.length; j++) {
                var item = {};
                for (var k in arr[j]) item[k] = arr[j][k];
                if (!item.lang) item.lang = groups[g];
                out.push(item);
            }
        }
    }
    return out;
}

function qualityFromLabel(label) {
    var m = /(2160|1440|1080|720|480|360)p/i.exec(String(label || ""));
    return m ? m[1] + "p" : "auto";
}

function toStream(title, url, type, headers, size) {
    var stream = {
        name: ADDON_NAME,
        title: title,
        url: url,
        quality: qualityFromLabel(title),
        language: title,
        type: type,
        headers: headers
    };
    if (size) stream.behaviorHints = { videoSize: size };
    return stream;
}

function resolveNp(epUrl, resolveUrl) {
    var url = /^https?:/i.test(resolveUrl) ? resolveUrl : BASE + resolveUrl;
    return fetchJson(url, { "User-Agent": USER_AGENT, "Referer": epUrl }).then(function (res) {
        if (!res || !res.id) return [];
        return fetchJson(TAU + encodeURIComponent(res.id)).then(function (data) {
            if (!data || !Array.isArray(data.urls)) return [];
            return data.urls.map(function (u) {
                return toStream(u.label || "auto", u.url, /\.m3u8/i.test(u.url) ? "hls" : "file", { "User-Agent": USER_AGENT, "Referer": BASE + "/" }, u.size);
            });
        });
    });
}

function sibnetExtract(url) {
    return fetchText(url, { "User-Agent": USER_AGENT, "Referer": "https://video.sibnet.ru/" }).then(function (html) {
        if (!html) return [];
        var m = /player\.src\(\[\{src:\s*["']([^"']+)["']/i.exec(html) ||
                /["']?src["']?:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i.exec(html) ||
                /(https?:\/\/[^"'\s]+\.mp4)/i.exec(html) ||
                /(https?:\/\/video\.sibnet\.ru\/\/?v\/[^"'\s]+)/i.exec(html);
        if (!m) return [];
        var media = m[1];
        if (media.indexOf("//") === 0) media = "https:" + media;
        return [toStream("Sibnet", media, "file", { "User-Agent": USER_AGENT, "Referer": "https://video.sibnet.ru/" })];
    });
}

function resolveIframe(epUrl, src) {
    var url = /^https?:/i.test(src) ? src : BASE + src;
    return fetchText(url, { "User-Agent": USER_AGENT, "Referer": epUrl }).then(function (html) {
        var finalUrl = url;
        var mp4 = /(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/i.exec(html);
        if (/sibnet\.ru/i.test(finalUrl) || /sibnet\.ru/i.test(html)) {
            return sibnetExtract(finalUrl);
        }
        if (mp4) return [toStream("Direct", mp4[1], /\.m3u8/i.test(mp4[1]) ? "hls" : "file", { "User-Agent": USER_AGENT, "Referer": BASE + "/" })];
        return [];
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var epUrl = null;
    return tmdbMeta(tmdbId, mediaType).then(function (meta) {
        if (!meta || !meta.title) return [];
        return searchSite(meta.title).then(function (results) {
            if ((!results || !results.length) && meta.original) {
                return searchSite(meta.original).then(function (r2) { return r2 || []; });
            }
            return results || [];
        }).then(function (results) {
            var page = pickResult(results, meta);
            if (!page) return [];
            return fetchText(page).then(function (html) {
                if (meta.isTv) {
                    epUrl = findEpisode(html, season, episode);
                    if (!epUrl) { console.log("[CZM] episode not found"); return ""; }
                    return fetchText(epUrl);
                }
                epUrl = page;
                return html;
            }).then(function (epHtml) {
                if (!epHtml) return [];
                var blob = extractServerBlob(epHtml);
                var servers = normalizeServers(blob).slice(0, MAX_SERVERS);
                if (!servers.length) return [];
                var tasks = servers.map(function (s) {
                    if (s.resolveUrl) return resolveNp(epUrl, s.resolveUrl);
                    if (s.src) return resolveIframe(epUrl, s.src);
                    return Promise.resolve([]);
                });
                return Promise.all(tasks).then(function (lists) {
                    var streams = [];
                    for (var i = 0; i < lists.length; i++) {
                        if (lists[i]) streams = streams.concat(lists[i]);
                    }
                    var seen = {};
                    return streams.filter(function (st) {
                        if (seen[st.url]) return false;
                        seen[st.url] = true;
                        return true;
                    });
                });
            });
        });
    }).catch(function (err) {
        console.error("[CZM][ERROR] " + (err.message || err));
        return [];
    });
}

module.exports = { getStreams: getStreams };
