var BASE = "https://anikoto.cz";
var MEGAPLAY_BASE = "https://megaplay.buzz";
var ADDON_NAME = "Anikoto";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";

var HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
};

var MEGAPLAY_HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": MEGAPLAY_BASE + "/",
    "Origin": MEGAPLAY_BASE
};

var ENC_KEY = "i?LMTAx0Q6,:}50U";
var ENC_IV = "W0;27ToaUpl_P%'c";

function fetchText(url, headers) {
    return fetch(url, { headers: headers || HEADERS, redirect: "follow" })
        .then(function (r) {
            return r.text().then(function (body) {
                if (!r.ok) {
                    console.log("[AN][HTTP] " + r.status + " " + url);
                    return null;
                }
                return body;
            });
        })
        .catch(function (e) {
            console.log("[AN][FETCH] " + (e.message || e) + " url=" + url);
            return null;
        });
}

function fetchJson(url, headers) {
    return fetchText(url, headers).then(function (body) {
        if (!body) return null;
        try { return JSON.parse(body); } catch (e) { return null; }
    });
}

function ajaxHeaders(referer) {
    return {
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": referer
    };
}

var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64UrlDecode(str) {
    var map = {};
    for (var i = 0; i < B64_CHARS.length; i++) map[B64_CHARS[i]] = i;
    var clean = String(str).replace(/[^A-Za-z0-9\-_]/g, "");
    var bytes = [];
    for (var j = 0; j < clean.length; j += 4) {
        var c0 = map[clean[j]];
        var c1 = j + 1 < clean.length ? map[clean[j + 1]] : null;
        var c2 = j + 2 < clean.length ? map[clean[j + 2]] : null;
        var c3 = j + 3 < clean.length ? map[clean[j + 3]] : null;
        bytes.push((c0 << 2) | (c1 === null ? 0 : c1 >> 4));
        if (c2 !== null) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
        if (c3 !== null) bytes.push(((c2 & 3) << 6) | c3);
    }
    return new Uint8Array(bytes);
}

function utf8Encode(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
        else if (c < 0xd800 || c >= 0xe000) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
        else {
            i++;
            var cp = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        }
    }
    return new Uint8Array(bytes);
}

function utf8Decode(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length;) {
        var c = bytes[i++];
        if (c < 0x80) out += String.fromCharCode(c);
        else if (c < 0xe0) out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
        else if (c < 0xf0) out += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
        else {
            var cp = ((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
    }
    return out;
}

function padBytes(str, len) {
    var src = utf8Encode(str);
    var out = new Uint8Array(len);
    out.set(src.subarray(0, Math.min(len, src.length)));
    return out;
}

var AES_SBOX = new Uint8Array(256);
(function () {
    var p = 1, q = 1;
    do {
        p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
        q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255;
        if (q & 0x80) q ^= 0x09;
        var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
        AES_SBOX[p] = (x ^ 0x63) & 255;
    } while (p !== 1);
    AES_SBOX[0] = 0x63;
})();

var AES_INV_SBOX = new Uint8Array(256);
for (var inv = 0; inv < 256; inv++) AES_INV_SBOX[AES_SBOX[inv]] = inv;

function aesExpandKey(key) {
    var Nk = key.length / 4;
    var Nr = Nk + 6;
    var words = 4 * (Nr + 1);
    var w = new Uint8Array(words * 4);
    w.set(key);
    var rcon = 1;
    for (var i = Nk; i < words; i++) {
        var t0 = w[(i - 1) * 4];
        var t1 = w[(i - 1) * 4 + 1];
        var t2 = w[(i - 1) * 4 + 2];
        var t3 = w[(i - 1) * 4 + 3];
        if (i % Nk === 0) {
            var tmp = t0;
            t0 = AES_SBOX[t1] ^ rcon;
            t1 = AES_SBOX[t2];
            t2 = AES_SBOX[t3];
            t3 = AES_SBOX[tmp];
            rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x1b : 0)) & 255;
        } else if (Nk > 6 && i % Nk === 4) {
            t0 = AES_SBOX[t0]; t1 = AES_SBOX[t1]; t2 = AES_SBOX[t2]; t3 = AES_SBOX[t3];
        }
        w[i * 4]     = w[(i - Nk) * 4]     ^ t0;
        w[i * 4 + 1] = w[(i - Nk) * 4 + 1] ^ t1;
        w[i * 4 + 2] = w[(i - Nk) * 4 + 2] ^ t2;
        w[i * 4 + 3] = w[(i - Nk) * 4 + 3] ^ t3;
    }
    return { w: w, Nr: Nr };
}

function gmul(a, b) {
    var p = 0;
    a &= 255;
    for (var i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 255;
        if (hi) a ^= 0x1b;
        b >>= 1;
    }
    return p;
}

function aesDecryptBlock(expanded, block) {
    var w = expanded.w;
    var Nr = expanded.Nr;
    var st = new Uint8Array(16);
    var base = Nr * 16;
    for (var i = 0; i < 16; i++) st[i] = block[i] ^ w[base + i];

    for (var round = Nr - 1; round >= 0; round--) {
        var t = new Uint8Array(16);
        t[0] = st[0];   t[1] = st[13]; t[2] = st[10];  t[3] = st[7];
        t[4] = st[4];   t[5] = st[1];  t[6] = st[14];  t[7] = st[11];
        t[8] = st[8];   t[9] = st[5];  t[10] = st[2];  t[11] = st[15];
        t[12] = st[12]; t[13] = st[9]; t[14] = st[6];  t[15] = st[3];

        for (var s = 0; s < 16; s++) t[s] = AES_INV_SBOX[t[s]];

        base = round * 16;
        for (var k = 0; k < 16; k++) t[k] ^= w[base + k];

        if (round !== 0) {
            for (var c = 0; c < 4; c++) {
                var a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3];
                t[c * 4]     = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
                t[c * 4 + 1] = gmul(a0, 9)  ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
                t[c * 4 + 2] = gmul(a0, 13) ^ gmul(a1, 9)  ^ gmul(a2, 14) ^ gmul(a3, 11);
                t[c * 4 + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9)  ^ gmul(a3, 14);
            }
        }
        st = t;
    }
    return st;
}

function aesCbcDecrypt(key, iv, data) {
    var expanded = aesExpandKey(key);
    var out = new Uint8Array(data.length);
    var prev = iv;
    for (var off = 0; off < data.length; off += 16) {
        var blk = data.subarray(off, off + 16);
        var dec = aesDecryptBlock(expanded, blk);
        for (var i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
        prev = blk;
    }
    return out;
}

function decryptPayload(enc) {
    var key = padBytes(ENC_KEY, 32);
    var iv  = padBytes(ENC_IV, 16);
    var raw = aesCbcDecrypt(key, iv, b64UrlDecode(enc));
    var pad = raw[raw.length - 1];
    var end = (pad >= 1 && pad <= 16) ? raw.length - pad : raw.length;
    return JSON.parse(utf8Decode(raw.subarray(0, end)));
}

function deaccent(value) {
    return String(value || "").normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[ıİ]/g, "i").replace(/[ß]/g, "ss");
}

function normalizeTitle(value) {
    return deaccent(value).toLowerCase()
        .replace(/[^a-z0-9]+/g, " ").trim();
}

function titleMatches(candidate, want) {
    var a = normalizeTitle(candidate), b = normalizeTitle(want);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

function decodeEntities(value) {
    return String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&#0*39;|&#x27;/gi, "'")
        .replace(/&quot;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
    return decodeEntities(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function ordinal(n) {
    var s = ["th", "st", "nd", "rd"];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function tmdbMeta(tmdbId, mediaType) {
    var isTv = (mediaType === "tv" || mediaType === "series" || mediaType === "anime");
    var type = isTv ? "tv" : "movie";
    var id = String(tmdbId || "").trim();
    if (!id) return Promise.resolve(null);

    var url;
    if (/^tt\d+$/i.test(id)) {
        url = "https://api.themoviedb.org/3/find/" + encodeURIComponent(id) +
              "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id";
        return fetchJson(url).then(function (res) {
            var list = res && (isTv ? res.tv_results : res.movie_results);
            if (!list || !list.length) return null;
            return fetchJson("https://api.themoviedb.org/3/" + type + "/" + list[0].id + "?api_key=" + TMDB_API_KEY);
        }).then(formatTmdb);
    }

    url = "https://api.themoviedb.org/3/" + type + "/" + id + "?api_key=" + TMDB_API_KEY;
    return fetchJson(url).then(formatTmdb);
}

function formatTmdb(data) {
    if (!data || (!data.title && !data.name)) return null;
    var seasons = [];
    if (data.seasons) {
        for (var i = 0; i < data.seasons.length; i++) {
            var s = data.seasons[i];
            seasons.push({ number: s.season_number, episodes: s.episode_count || 0 });
        }
    }
    return {
        title: data.title || data.name || "",
        original: data.original_title || data.original_name || "",
        year: String(data.release_date || data.first_air_date || "").split("-")[0],
        seasons: seasons
    };
}

function seasonOffset(meta, season) {
    var offset = 0;
    if (!meta || !meta.seasons || season <= 1) return offset;
    for (var i = 0; i < meta.seasons.length; i++) {
        var s = meta.seasons[i];
        if (s.number > 0 && s.number < season) offset += s.episodes;
    }
    return offset;
}

function parseSearch(html) {
    var items = [];
    if (!html) return items;
    var blocks = String(html).split('<div class="item');
    for (var i = 1; i < blocks.length; i++) {
        var block = blocks[i];
        var idMatch = /data-tip="(\d+)"/.exec(block);
        var slugMatch = /\/watch\/([^"\/]+)\/ep-1/.exec(block);
        var titleMatch = /class="name d-title"[^>]*>([\s\S]*?)<\/a>/.exec(block);
        if (!idMatch || !slugMatch || !titleMatch) continue;
        var jpMatch = /data-jp="([^"]*)"/.exec(block);
        items.push({
            id: idMatch[1],
            slug: slugMatch[1],
            title: stripTags(titleMatch[1]),
            jp: decodeEntities(jpMatch ? jpMatch[1] : "")
        });
    }
    return items;
}

function searchAnikoto(queries) {
    var seen = {};
    var list = [];
    return Promise.all(queries.map(function (query) {
        if (!query) return Promise.resolve([]);
        var url = BASE + "/filter?keyword=" + encodeURIComponent(query);
        return fetchText(url, HEADERS).then(parseSearch);
    })).then(function (results) {
        for (var i = 0; i < results.length; i++) {
            for (var j = 0; j < results[i].length; j++) {
                var item = results[i][j];
                if (seen[item.id]) continue;
                seen[item.id] = true;
                list.push(item);
            }
        }
        return list;
    });
}

function pickShow(items, meta, season) {
    var wanted = [meta.title, meta.original];
    var matched = items.filter(function (item) {
        for (var i = 0; i < wanted.length; i++) {
            if (titleMatches(item.title, wanted[i]) || titleMatches(item.jp, wanted[i])) return true;
        }
        return false;
    });
    if (!matched.length) return null;

    if (season > 1) {
        var seasonRe = new RegExp("season\\s*" + season + "\\b|\\b" + season + "(st|nd|rd|th)\\s*season\\b");
        var seasonMatches = matched.filter(function (item) {
            return seasonRe.test(normalizeTitle(item.title)) || seasonRe.test(normalizeTitle(item.jp));
        });
        if (seasonMatches.length) matched = seasonMatches;
    } else {
        var plain = matched.filter(function (item) {
            return !hasSeasonMarker(item.title) && !hasSeasonMarker(item.jp);
        });
        if (plain.length) matched = plain;
    }

    return matched[0];
}

function hasSeasonMarker(title) {
    var normalized = normalizeTitle(title);
    return /season\s*\d+|\b\d+(st|nd|rd|th)?\s*season\b/.test(normalized);
}

function findEpisode(html, episode, absoluteEpisode, preferAbsolute) {
    if (!html) return null;
    var re = /<a\b[^>]*data-num="\d+"[^>]*>/g;
    var match;
    var exact = null;
    var absolute = null;
    while ((match = re.exec(html))) {
        var tag = match[0];
        var numMatch = /data-num="(\d+)"/.exec(tag);
        if (!numMatch) continue;
        var num = parseInt(numMatch[1], 10);
        if (num === episode) exact = tag;
        if (absoluteEpisode && num === absoluteEpisode) absolute = tag;
    }
    return preferAbsolute ? (absolute || exact) : (exact || absolute);
}

function dataAttr(tag, name) {
    var match = new RegExp("data-" + name + '="([^"]*)"').exec(tag);
    return match ? decodeEntities(match[1]) : "";
}

function parseServerGroups(html) {
    var groups = [];
    if (!html) return groups;
    var typeRe = /<div class="type" data-type="(sub|dub)">([\s\S]*?)<\/div>/g;
    var typeMatch;
    while ((typeMatch = typeRe.exec(html))) {
        var servers = [];
        var liRe = /<li\b[^>]*data-sv-id="([^"]+)"[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g;
        var liMatch;
        while ((liMatch = liRe.exec(typeMatch[2]))) {
            servers.push({
                id: liMatch[1],
                link: liMatch[2],
                name: stripTags(liMatch[3])
            });
        }
        if (servers.length) groups.push({ type: typeMatch[1], servers: servers });
    }
    return groups;
}

function resolveServer(link, referer) {
    var url = BASE + "/ajax/server?get=" + encodeURIComponent(link);
    return fetchJson(url, ajaxHeaders(referer)).then(function (data) {
        if (!data || data.status !== 200 || !data.result || !data.result.url) return null;
        return data.result;
    });
}

function resolveMegaplay(embedUrl, type) {
    var sMatch = /[?&]s=([^&]+)/.exec(embedUrl);
    var s = sMatch ? decodeURIComponent(sMatch[1]) : "";

    return fetchText(embedUrl, MEGAPLAY_HEADERS).then(function (html) {
        var idMatch = /data-id="(\d+)"/.exec(html || "");
        if (!idMatch) return null;

        var api = MEGAPLAY_BASE + "/stream/getSourcesNew?id=" + idMatch[1] + "&type=" + type;
        if (s) api += "&s=" + encodeURIComponent(s);

        return fetchJson(api, ajaxHeaders(MEGAPLAY_BASE + "/")).then(function (data) {
            if (!data) return null;

            var payload = data.sources || null;
            if (!payload && data.enc) {
                try { payload = decryptPayload(data.enc); }
                catch (e) { console.log("[AN][DECRYPT] " + (e.message || e)); return null; }
            }
            if (!payload) return null;

            var file = payload.file || (payload.sources && payload.sources[0] && payload.sources[0].file);
            if (!file) return null;

            return { file: file, tracks: data.tracks || [], intro: data.intro, outro: data.outro };
        });
    });
}

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

function buildStream(servers, referer, type, showTitle) {
    var index = 0;

    function next() {
        if (index >= servers.length) return Promise.resolve(null);
        var server = servers[index++];
        return resolveServer(server.link, referer).then(function (resolved) {
            if (!resolved) return next();
            return resolveMegaplay(resolved.url, type).then(function (data) {
                if (!data) return next();

                var subs = [];
                for (var i = 0; i < data.tracks.length; i++) {
                    var t = data.tracks[i];
                    if (t.file && t.kind === "captions") {
                        subs.push({
                            url: t.file,
                            language: langCodeFromLabel(t.label),
                            name: t.label || "Subtitle"
                        });
                    }
                }

                var stream = {
                    name: ADDON_NAME,
                    title: "1080p · " + type.toUpperCase() + (showTitle ? " · " + showTitle : ""),
                    url: data.file,
                    quality: "1080p",
                    type: "hls",
                    headers: MEGAPLAY_HEADERS
                };

                if (subs.length > 0) stream.subtitles = subs;
                if (data.intro && data.intro.end > data.intro.start) stream.intro = data.intro;
                if (data.outro && data.outro.end > data.outro.start) stream.outro = data.outro;

                console.log("[AN][STREAM] " + type.toUpperCase() + " ok via " + server.name + ": " + data.file);
                return stream;
            });
        });
    }

    return next();
}

function getStreams(tmdbId, mediaType, season, episode) {
    var seasonNum = parseInt(season, 10) || 1;
    var epNum = parseInt(episode, 10) || 1;
    console.log("[AN][START] tmdbId=" + tmdbId + " type=" + mediaType + " s=" + seasonNum + " e=" + epNum);

    return tmdbMeta(tmdbId, mediaType).then(function (meta) {
        if (!meta) {
            console.log("[AN][TMDB] no metadata");
            return [];
        }

        var queries = [meta.title, meta.original];
        if (seasonNum > 1) {
            queries.push(meta.title + " Season " + seasonNum);
            queries.push(meta.title + " " + ordinal(seasonNum) + " Season");
        }

        return searchAnikoto(queries).then(function (items) {
            var show = pickShow(items, meta, seasonNum);
            if (!show) {
                console.log("[AN][SEARCH] no match for " + meta.title);
                return [];
            }
            console.log("[AN][SEARCH] matched " + show.title + " id=" + show.id + " slug=" + show.slug);

            var referer = BASE + "/watch/" + show.slug;
            var episodeUrl = BASE + "/ajax/episode/list/" + show.id;

            return fetchJson(episodeUrl, ajaxHeaders(referer)).then(function (data) {
                var html = data && data.status === 200 ? data.result : null;
                var absolute = epNum + seasonOffset(meta, seasonNum);
                var preferAbsolute = seasonNum > 1 && !hasSeasonMarker(show.title);
                var anchor = findEpisode(html, epNum, absolute, preferAbsolute);
                if (!anchor) {
                    console.log("[AN][EPISODE] episode " + epNum + " not found");
                    return [];
                }
                console.log("[AN][EPISODE] using data-num=" + dataAttr(anchor, "num") + " for episode " + epNum);

                var ids = dataAttr(anchor, "ids");
                if (!ids) {
                    console.log("[AN][EPISODE] no server ids");
                    return [];
                }

                var serverUrl = BASE + "/ajax/server/list?servers=" + encodeURIComponent(ids);
                return fetchJson(serverUrl, ajaxHeaders(referer)).then(function (serverData) {
                    var groups = parseServerGroups(serverData && serverData.result);
                    if (!groups.length) {
                        console.log("[AN][SERVERS] no servers");
                        return [];
                    }

                    return Promise.all(groups.map(function (group) {
                        return buildStream(group.servers, referer, group.type, show.title);
                    })).then(function (streams) {
                        return streams.filter(Boolean);
                    });
                });
            });
        });
    }).catch(function (err) {
        console.error("[AN][ERROR] " + (err.message || err));
        return [];
    });
}

module.exports = { getStreams: getStreams };

(function () {
    function nuvioDecode(value) {
        try {
            return decodeURIComponent(value);
        } catch (e) {
            return value;
        }
    }

    function nuvioUrlParts(url) {
        var path = String(url || '').split('?')[0].split('#')[0];
        var segments = path.split('/').filter(Boolean).map(nuvioDecode);
        var parts = [];
        var tail = segments.slice(-3);
        for (var i = 0; i < tail.length; i++) {
            if (/(?:2160|1080|720|480|360)p|bluray|web[-. ]?dl|webrip|hdtv|remux|x264|x265|hevc|avc|aac|dts|ddp|hdr|atmos/i.test(tail[i])) {
                parts.push(tail[i]);
            }
        }
        var last = tail.length ? tail[tail.length - 1] : '';
        if (/\.(?:mkv|mp4|m4v|avi|mov|webm|ts|m2ts|m3u8|mpd|iso)$/i.test(last)) {
            parts.push(last);
        }
        return parts;
    }

    function nuvioText(stream) {
        var parts = [];
        if (stream.title) parts.push(String(stream.title));
        if (stream.description) parts.push(String(stream.description));
        if (stream.name) parts.push(String(stream.name));
        if (stream.filename) parts.push(String(stream.filename));
        if (stream.file) parts.push(String(stream.file));
        if (stream.url) parts = parts.concat(nuvioUrlParts(stream.url));
        return parts.join(' ');
    }

    function nuvioQuality(text) {
        var value = String(text || '').toLowerCase();
        if (/2160p|4k|uhd/.test(value)) return '4K';
        if (/1080p|fhd/.test(value)) return '1080p';
        if (/720p/.test(value)) return '720p';
        if (/480p/.test(value)) return '480p';
        if (/360p/.test(value)) return '360p';
        return 'HD';
    }

    function nuvioHasQuality(name) {
        return /\b(?:4k|2160p?|1080p?|720p?|480p?|360p?|hd|sd)\b/i.test(String(name || ''));
    }

    function nuvioHasSize(name) {
        return /(?:\d+(?:\.\d+)?\s*(?:TB|GB|MB|KB))/i.test(String(name || ''));
    }

    function nuvioSpecificQuality(text) {
        var match = String(text || '').match(/\b(?:4k|2160p?|1080p?|720p?|480p?|360p?)\b/i);
        return match ? nuvioQuality(match[0]) : '';
    }

    function nuvioLanguages(text) {
        var defs = [
            ['English', /\benglish\b/i, /\b(?:ENG|EN)\b/],
            ['Hindi', /\bhindi\b/i, /\bHIN\b/],
            ['Korean', /\bkorean\b/i, /\bKOR\b/],
            ['Japanese', /\bjapanese\b/i, /\b(?:JAP|JPN)\b/],
            ['Chinese', /\b(?:chinese|mandarin)\b/i, /\b(?:CHI|CHS|CHT)\b/],
            ['Spanish', /\b(?:spanish|castellano|latino)\b/i, /\b(?:SPA|LAT)\b/],
            ['French', /\bfrench\b/i, /\b(?:FRE|FRA)\b/],
            ['German', /\bgerman\b/i, /\b(?:GER|DEU)\b/],
            ['Italian', /\bitalian\b/i, /\bITA\b/],
            ['Portuguese', /\bportuguese\b/i, /\bPOR\b/],
            ['Russian', /\brussian\b/i, /\bRUS\b/],
            ['Arabic', /\barabic\b/i, /\bARA\b/],
            ['Turkish', /\bturkish\b/i, /\b(?:TUR|TR)\b/],
            ['Thai', /\bthai\b/i, /\bTHA\b/],
            ['Tamil', /\btamil\b/i, /\bTAM\b/],
            ['Telugu', /\btelugu\b/i, /\bTEL\b/],
            ['Malayalam', /\bmalayalam\b/i, /\bMAL\b/],
            ['Kannada', /\bkannada\b/i, /\bKAN\b/],
            ['Bengali', /\bbengali\b/i, /\bBEN\b/],
            ['Punjabi', /\bpunjabi\b/i, /\bPUN\b/],
            ['Vietnamese', /\bvietnamese\b/i, /\bVIE\b/],
            ['Indonesian', /\bindonesian\b/i, /\bIND\b/],
            ['Filipino', /\b(?:filipino|tagalog)\b/i, /\bFIL\b/],
            ['Dutch', /\bdutch\b/i, /\b(?:DUT|NLD)\b/],
            ['Polish', /\bpolish\b/i, /\b(?:POL|PL)\b/],
            ['Swedish', /\bswedish\b/i, /\bSWE\b/],
            ['Norwegian', /\bnorwegian\b/i, /\bNOR\b/],
            ['Danish', /\bdanish\b/i, /\bDAN\b/],
            ['Finnish', /\bfinnish\b/i, /\bFIN\b/],
            ['Greek', /\bgreek\b/i, /\b(?:GRE|ELL)\b/],
            ['Hebrew', /\bhebrew\b/i, /\bHEB\b/],
            ['Ukrainian', /\bukrainian\b/i, /\bUKR\b/],
            ['Czech', /\bczech\b/i, /\b(?:CZE|CES)\b/],
            ['Hungarian', /\bhungarian\b/i, /\bHUN\b/],
            ['Romanian', /\bromanian\b/i, /\b(?:RUM|RON)\b/],
            ['Malay', /\bmalay\b/i, /\b(?:MAY|MSA)\b/],
            ['Persian', /\bpersian\b/i, /\b(?:PER|FAS)\b/]
        ];
        var out = [];
        for (var i = 0; i < defs.length; i++) {
            if ((defs[i][1].test(text) || defs[i][2].test(text)) && out.indexOf(defs[i][0]) === -1) {
                out.push(defs[i][0]);
            }
        }
        return out;
    }

    var NUVIO_FLAGS = {
        English: '🇬🇧', Hindi: '🇮🇳', Korean: '🇰🇷', Japanese: '🇯🇵', Chinese: '🇨🇳',
        Spanish: '🇪🇸', French: '🇫🇷', German: '🇩🇪', Italian: '🇮🇹', Portuguese: '🇵🇹',
        Russian: '🇷🇺', Arabic: '🇸🇦', Turkish: '🇹🇷', Thai: '🇹🇭', Tamil: '🇮🇳',
        Telugu: '🇮🇳', Malayalam: '🇮🇳', Kannada: '🇮🇳', Bengali: '🇧🇩', Punjabi: '🇮🇳',
        Vietnamese: '🇻🇳', Indonesian: '🇮🇩', Filipino: '🇵🇭', Dutch: '🇳🇱', Polish: '🇵🇱',
        Swedish: '🇸🇪', Norwegian: '🇳🇴', Danish: '🇩🇰', Finnish: '🇫🇮', Greek: '🇬🇷',
        Hebrew: '🇮🇱', Ukrainian: '🇺🇦', Czech: '🇨🇿', Hungarian: '🇭🇺', Romanian: '🇷🇴',
        Malay: '🇲🇾', Persian: '🇮🇷'
    };

    function nuvioFlag(name) {
        return NUVIO_FLAGS[name] || '';
    }

    function nuvioLanguageFromCode(code) {
        var names = {
            en: 'English', eng: 'English', ko: 'Korean', kor: 'Korean', ja: 'Japanese', jpn: 'Japanese',
            zh: 'Chinese', chi: 'Chinese', hi: 'Hindi', hin: 'Hindi', es: 'Spanish', spa: 'Spanish',
            fr: 'French', fre: 'French', fra: 'French', de: 'German', ger: 'German', deu: 'German',
            it: 'Italian', ita: 'Italian', pt: 'Portuguese', por: 'Portuguese', ru: 'Russian', rus: 'Russian',
            ar: 'Arabic', ara: 'Arabic', tr: 'Turkish', tur: 'Turkish', th: 'Thai', tha: 'Thai',
            ta: 'Tamil', tam: 'Tamil', te: 'Telugu', tel: 'Telugu', ml: 'Malayalam', mal: 'Malayalam',
            kn: 'Kannada', kan: 'Kannada', id: 'Indonesian', ind: 'Indonesian', tl: 'Filipino', fil: 'Filipino',
            vi: 'Vietnamese', vie: 'Vietnamese', nl: 'Dutch', dut: 'Dutch', nld: 'Dutch',
            pl: 'Polish', pol: 'Polish', sv: 'Swedish', swe: 'Swedish', da: 'Danish', dan: 'Danish',
            no: 'Norwegian', nor: 'Norwegian', fi: 'Finnish', fin: 'Finnish', el: 'Greek', gre: 'Greek',
            ell: 'Greek', he: 'Hebrew', heb: 'Hebrew', uk: 'Ukrainian', ukr: 'Ukrainian',
            cs: 'Czech', cze: 'Czech', ces: 'Czech', hu: 'Hungarian', hun: 'Hungarian',
            ro: 'Romanian', rum: 'Romanian', ron: 'Romanian', ms: 'Malay', may: 'Malay', msa: 'Malay',
            fa: 'Persian', per: 'Persian', fas: 'Persian'
        };
        return names[String(code || '').toLowerCase()] || '';
    }

    function nuvioLanguage(text, langs) {
        var dual = /\bdual[-. ]?audio\b/i.test(text) || /\bDUAL\b/.test(text) || (/\bdual\b/i.test(text) && langs.length >= 2);
        var multi = /\bmulti[-. ]?audio\b/i.test(text) || /\bMULTI\b/.test(text) || (/\bmulti\b/i.test(text) && langs.length >= 2);
        var prefix = dual ? 'Dual Audio' : (multi ? 'Multi-Audio' : '');
        if (langs.length > 3) return prefix || 'Multi-Audio';
        var list = langs.slice(0, 3).map(function (name) {
            var flag = nuvioFlag(name);
            return (flag ? flag + ' ' : '') + name;
        }).join(' + ');
        if (prefix && list) return prefix + ' (' + list + ')';
        if (prefix) return prefix;
        return list;
    }

    function nuvioSize(stream, text) {
        var match = String(stream.size || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
        if (!match) match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
        return match ? match[1] + ' ' + match[2].toUpperCase() : '';
    }

    function nuvioParse(text) {
        var info = {
            quality: nuvioQuality(text),
            source: '',
            codec: '',
            bitDepth: '',
            hdr: '',
            audio: '',
            subs: '',
            container: '',
            language: '',
            languages: []
        };

        if (/\bremux\b/i.test(text)) info.source = /\b(?:bluray|blu-ray|bdrip|brrip|bdremux)\b/i.test(text) ? 'BluRay REMUX' : 'REMUX';
        else if (/\b(?:bluray|blu-ray|bdrip|brrip|bdremux)\b/i.test(text)) info.source = 'BluRay';
        else if (/\bweb[-. ]?dl\b/i.test(text)) info.source = 'WEB-DL';
        else if (/\bweb[-. ]?rip\b/i.test(text)) info.source = 'WEBRip';
        else if (/\bhdtv\b/i.test(text)) info.source = 'HDTV';
        else if (/\b(?:dvdrip|dvdscr)\b/i.test(text)) info.source = 'DVDRip';
        else if (/\b(?:hdcam|camrip|cam-?rip|telesync|telecine)\b/i.test(text)) info.source = 'CAM';

        if (/\bav1\b/i.test(text)) info.codec = 'AV1';
        else if (/\b(?:hevc|x265|h\.?265)\b/i.test(text)) info.codec = 'HEVC';
        else if (/\b(?:x264|h\.?264|avc)\b/i.test(text)) info.codec = 'H.264';
        else if (/\bvp9\b/i.test(text)) info.codec = 'VP9';
        else if (/\b(?:xvid|divx)\b/i.test(text)) info.codec = 'XviD';
        else if (/\bmpeg-?2\b/i.test(text)) info.codec = 'MPEG-2';

        if (/\b10[ .-]?bit\b/i.test(text)) info.bitDepth = '10-bit';
        else if (/\b8[ .-]?bit\b/i.test(text)) info.bitDepth = '8-bit';

        if (/\b(?:dolby[ ._-]?vision|dovi)\b/i.test(text) || /[._-]dv[._-]/i.test(text)) info.hdr = 'DV';
        else if (/\bhdr10\+\b/i.test(text)) info.hdr = 'HDR10+';
        else if (/\bhdr10\b/i.test(text)) info.hdr = 'HDR10';
        else if (/\bhdr\b/i.test(text)) info.hdr = 'HDR';
        else if (/\bhlg\b/i.test(text)) info.hdr = 'HLG';

        var channels = '';
        if (/\b7[ .]1\b/i.test(text)) channels = '7.1';
        else if (/\b5[ .]1\b/i.test(text)) channels = '5.1';
        else if (/\b2[ .]0\b/i.test(text)) channels = '2.0';
        var atmos = /\batmos\b/i.test(text);
        if (/\btruehd\b/i.test(text)) info.audio = 'TrueHD' + (channels ? ' ' + channels : '');
        else if (/\bdts[-. ]?hd(?:\s*ma)?\b/i.test(text)) info.audio = 'DTS-HD MA' + (channels ? ' ' + channels : '');
        else if (/\bdts[-. ]?x\b/i.test(text)) info.audio = 'DTS:X' + (channels ? ' ' + channels : '');
        else if (/\bdts\b/i.test(text)) info.audio = 'DTS' + (channels ? ' ' + channels : '');
        else if (/\b(?:ddp|dd\+|eac3)\b/i.test(text)) info.audio = 'DDP' + (channels ? ' ' + channels : '');
        else if (/\b(?:dd|ac3|dolby[ .]?digital)\b/i.test(text)) info.audio = 'DD' + (channels ? ' ' + channels : '');
        else if (/\baac\b/i.test(text)) info.audio = 'AAC' + (channels ? ' ' + channels : '');
        else if (/\bopus\b/i.test(text)) info.audio = 'Opus' + (channels ? ' ' + channels : '');
        else if (/\bflac\b/i.test(text)) info.audio = 'FLAC' + (channels ? ' ' + channels : '');
        else if (/\bmp3\b/i.test(text)) info.audio = 'MP3';
        if (atmos && info.audio && info.audio.indexOf('Atmos') === -1) info.audio += ' Atmos';
        else if (atmos && !info.audio) info.audio = 'Atmos';

        if (/\b(?:multi[- ]?sub|softsub|hardsub|subbed)\b/i.test(text)) info.subs = 'Multi-Sub';
        else if (/\bsubs?\b/i.test(text)) info.subs = 'Sub';
        if (/\b(?:dubbed|dub)\b/i.test(text)) info.subs = info.subs ? info.subs + ' + Dub' : 'Dub';

        var ext = String(text || '').match(/\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|m3u8|mpd|iso)$/i);
        if (ext) {
            var container = ext[1].toUpperCase();
            if (container === 'M3U8') container = 'HLS';
            else if (container === 'MPD') container = 'DASH';
            info.container = container;
        }

        info.languages = nuvioLanguages(text);
        info.language = nuvioLanguage(text, info.languages);
        return info;
    }

    function nuvioEscape(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function nuvioName(stream, provider, quality, size) {
        var name = String(stream.name || stream.title || '').trim();
        if (!name) name = provider;
        var invisible = name.match(/^[\u200b-\u200f\ufeff]+/);
        var prefix = invisible ? invisible[0] : '';
        if (invisible) name = name.slice(prefix.length);
        var hasProvider = new RegExp('(^|[^a-z0-9])' + nuvioEscape(provider) + '([^a-z0-9]|$)', 'i').test(name);
        if (!hasProvider && name.length < 40) name = provider + ' • ' + name;
        if (quality && quality !== 'HD') {
            var existingQuality = nuvioSpecificQuality(name);
            if (!existingQuality) {
                if (/\b(?:HD|SD)\b/i.test(name)) name = name.replace(/\b(?:HD|SD)\b/i, quality);
                if (!nuvioSpecificQuality(name)) name += ' • ' + quality;
            } else if (existingQuality !== quality) {
                name = name.replace(/\b(?:4k|2160p?|1080p?|720p?|480p?|360p?)\b/i, quality);
            }
        }
        if (size && !nuvioHasSize(name)) name += ' • ' + size;
        return prefix + name;
    }

    function nuvioDetails(info, size) {
        var line1 = [];
        if (info.source) line1.push('🎥 ' + info.source);
        if (info.codec) line1.push('🎞️ ' + info.codec);
        if (info.bitDepth) line1.push('📺 ' + info.bitDepth);
        if (info.hdr) line1.push('🌈 ' + info.hdr);
        if (info.subs) line1.push('💬 ' + info.subs);
        var line2 = [];
        if (info.audio) line2.push('🔊 ' + info.audio);
        if (size) line2.push('📦 ' + size);
        if (info.container) line2.push('💻 ' + info.container);
        var line3 = [];
        if (info.languages && info.languages.length) line3.push('🗣️ ' + info.language);
        return [line1.join(' • '), line2.join(' • '), line3.join(' • ')].filter(Boolean).join('\n');
    }

    function nuvioEnrich(stream, provider) {
        if (!stream || typeof stream !== 'object' || stream._nuvioFormatted) return stream;
        var text = nuvioText(stream);
        var info = nuvioParse(text);
        var size = nuvioSize(stream, text);
        var quality = info.quality;
        if (quality === 'HD' && stream.quality) quality = nuvioQuality(stream.quality);
        var language = info.language || (typeof stream.language === 'string' ? stream.language.trim() : '');
        var name = nuvioName(stream, provider, quality, size);
        var rich = String(stream.description || stream.title || '').trim();
        var richLike = rich.indexOf('\n') !== -1 && rich.indexOf('🎥') !== -1 && rich.indexOf('🎞️') !== -1 && (rich.indexOf('📦') !== -1 || rich.indexOf('🔊') !== -1);
        var details = richLike ? rich : nuvioDetails(info, size);
        if (!details && !richLike) {
            var fallback = [];
            var typeText = String(stream.type || '') + ' ' + String(stream.url || '');
            var container = info.container;
            if (!container) {
                if (/hls|m3u8/i.test(typeText)) container = 'HLS';
                else if (/dash|mpd/i.test(typeText)) container = 'DASH';
            }
            if (container) fallback.push('💻 ' + container);
            var streamLang = typeof stream.language === 'string' ? stream.language.trim() : '';
            var langLabel = info.language || nuvioLanguageFromCode(streamLang) || streamLang;
            if (langLabel && !(info.languages && info.languages.length)) {
                var flag = nuvioFlag(langLabel);
                fallback.push('🗣️ ' + (flag ? flag + ' ' : '') + langLabel);
            }
            details = fallback.join('\n');
        }
        var copy = {};
        for (var key in stream) {
            if (Object.prototype.hasOwnProperty.call(stream, key)) copy[key] = stream[key];
        }
        copy.name = name;
        if (richLike) {
            copy.quality = '';
        } else if (quality && quality !== 'HD') {
            copy.quality = quality;
        } else if (!copy.quality) {
            copy.quality = quality;
        }
        if (details) copy.size = details;
        else if (size) copy.size = size;
        var hasLangLine = details && details.indexOf('🗣️') !== -1;
        if (richLike || hasLangLine) {
            copy.language = '';
        } else if (language) {
            copy.language = language;
        }
        copy._nuvioFormatted = true;
        return copy;
    }

    function nuvioRank(stream) {
        var text = String(stream.quality || '') + ' ' + String(stream.name || '');
        if (/8k|4320/.test(text)) return 4320;
        var quality = nuvioQuality(text);
        if (quality === '4K') return 2160;
        if (quality === '1080p') return 1080;
        if (quality === '720p') return 720;
        if (quality === '480p') return 480;
        if (quality === '360p') return 360;
        return 0;
    }

    function nuvioMB(stream) {
        var match = String(stream.size || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i) || String(stream.name || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
        if (!match) return 0;
        var value = parseFloat(match[1]);
        var unit = match[2].toUpperCase();
        if (unit === 'TB') return value * 1024 * 1024;
        if (unit === 'GB') return value * 1024;
        if (unit === 'MB') return value;
        return value / 1024;
    }

    function nuvioEnrichStreams(rows, provider) {
        if (!Array.isArray(rows)) return rows;
        var indexed = rows.map(function (row, index) {
            return { stream: nuvioEnrich(row, provider), index: index };
        });
        indexed.sort(function (a, b) {
            var ra = nuvioRank(a.stream);
            var rb = nuvioRank(b.stream);
            if (ra !== rb) return rb - ra;
            var sa = nuvioMB(a.stream);
            var sb = nuvioMB(b.stream);
            if (sa !== sb) return sb - sa;
            return a.index - b.index;
        });
        return indexed.map(function (item) {
            return item.stream;
        });
    }

    try {
        var nuvioProviderName = "Anikoto";
        var nuvioExports = (typeof module !== 'undefined' && module.exports) ? module.exports : null;
        if (nuvioExports && typeof nuvioExports.getStreams === 'function') {
            var nuvioBase = nuvioExports;
            var nuvioWrapped = Object.create(nuvioBase);
            Object.defineProperty(nuvioWrapped, 'getStreams', {
                value: function (tmdbId, mediaType, season, episode) {
                    return Promise.resolve(nuvioBase.getStreams.call(nuvioBase, tmdbId, mediaType, season, episode)).then(function (rows) {
                        return nuvioEnrichStreams(rows, nuvioProviderName);
                    });
                },
                enumerable: true,
                configurable: true,
                writable: true
            });
            module.exports = nuvioWrapped;
        } else if (typeof globalThis !== 'undefined' && typeof globalThis.getStreams === 'function') {
            var nuvioGlobalBase = globalThis.getStreams;
            globalThis.getStreams = function (tmdbId, mediaType, season, episode) {
                return Promise.resolve(nuvioGlobalBase.call(globalThis, tmdbId, mediaType, season, episode)).then(function (rows) {
                    return nuvioEnrichStreams(rows, nuvioProviderName);
                });
            };
        }
    } catch (e) {}
})();

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
