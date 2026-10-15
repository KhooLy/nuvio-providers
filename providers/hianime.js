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
var VIDNEST_SECRET = "F9k2mR8vL4qP7wY1zN0fG3bS6tH5jC8d_x4R7vN2mP9qL1";

var CDN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
    "Referer":    "https://megaplay.buzz/",
    "Origin":     "https://megaplay.buzz"
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fetchJson(url, options) {
    url = signVidnest(url);
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

var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64UrlEncode(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
        var b0 = bytes[i];
        var b1 = i + 1 < bytes.length ? bytes[i + 1] : null;
        var b2 = i + 2 < bytes.length ? bytes[i + 2] : null;
        out += B64_CHARS[b0 >> 2];
        out += B64_CHARS[((b0 & 3) << 4) | (b1 === null ? 0 : b1 >> 4)];
        if (b1 !== null) out += B64_CHARS[((b1 & 15) << 2) | (b2 === null ? 0 : b2 >> 6)];
        if (b2 !== null) out += B64_CHARS[b2 & 63];
    }
    return out;
}

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

function randomNonce() {
    var bytes = new Uint8Array(16);
    var c = (typeof crypto !== "undefined" && crypto) ? crypto : null;
    if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    return b64UrlEncode(bytes);
}

function signVidnest(url) {
    var u = String(url || "");
    if (u.indexOf(VIDNEST_BASE) !== 0) return url;
    return u + (u.indexOf("?") === -1 ? "?" : "&") + "_n=" + randomNonce();
}

var AES_SBOX = new Uint8Array(256);
(function () {
    var p = 1;
    var q = 1;
    do {
        p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
        q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255;
        if (q & 0x80) q ^= 0x09;
        var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
        AES_SBOX[p] = (x ^ 0x63) & 255;
    } while (p !== 1);
    AES_SBOX[0] = 0x63;
})();

function aesX2(x) { return (x << 1) ^ (x & 0x80 ? 0x1b : 0); }

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
            rcon = aesX2(rcon);
        } else if (Nk > 6 && i % Nk === 4) {
            t0 = AES_SBOX[t0]; t1 = AES_SBOX[t1]; t2 = AES_SBOX[t2]; t3 = AES_SBOX[t3];
        }
        w[i * 4] = w[(i - Nk) * 4] ^ t0;
        w[i * 4 + 1] = w[(i - Nk) * 4 + 1] ^ t1;
        w[i * 4 + 2] = w[(i - Nk) * 4 + 2] ^ t2;
        w[i * 4 + 3] = w[(i - Nk) * 4 + 3] ^ t3;
    }
    return { w: w, Nr: Nr };
}

function aesEncryptBlock(expanded, block) {
    var w = expanded.w;
    var Nr = expanded.Nr;
    var st = new Uint8Array(16);
    for (var i = 0; i < 16; i++) st[i] = block[i] ^ w[i];
    for (var round = 1; round <= Nr; round++) {
        var t = new Uint8Array(16);
        for (var s = 0; s < 16; s++) t[s] = AES_SBOX[st[s]];
        var r = new Uint8Array(16);
        r[0] = t[0]; r[1] = t[5]; r[2] = t[10]; r[3] = t[15];
        r[4] = t[4]; r[5] = t[9]; r[6] = t[14]; r[7] = t[3];
        r[8] = t[8]; r[9] = t[13]; r[10] = t[2]; r[11] = t[7];
        r[12] = t[12]; r[13] = t[1]; r[14] = t[6]; r[15] = t[11];
        if (round !== Nr) {
            for (var c = 0; c < 4; c++) {
                var a0 = r[c * 4], a1 = r[c * 4 + 1], a2 = r[c * 4 + 2], a3 = r[c * 4 + 3];
                r[c * 4] = aesX2(a0) ^ (aesX2(a1) ^ a1) ^ a2 ^ a3;
                r[c * 4 + 1] = a0 ^ aesX2(a1) ^ (aesX2(a2) ^ a2) ^ a3;
                r[c * 4 + 2] = a0 ^ a1 ^ aesX2(a2) ^ (aesX2(a3) ^ a3);
                r[c * 4 + 3] = (aesX2(a0) ^ a0) ^ a1 ^ a2 ^ aesX2(a3);
            }
        }
        var base = round * 16;
        for (var k = 0; k < 16; k++) st[k] = r[k] ^ w[base + k];
    }
    return st;
}

var SHA_K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];

function sha256(bytes) {
    var l = bytes.length;
    var bitLen = l * 8;
    var withOne = l + 1;
    var total = withOne + ((56 - withOne % 64) + 64) % 64 + 8;
    var msg = new Uint8Array(total);
    msg.set(bytes);
    msg[l] = 0x80;
    var hi = Math.floor(bitLen / 0x100000000);
    var lo = bitLen >>> 0;
    msg[total - 8] = (hi >>> 24) & 255; msg[total - 7] = (hi >>> 16) & 255;
    msg[total - 6] = (hi >>> 8) & 255;  msg[total - 5] = hi & 255;
    msg[total - 4] = (lo >>> 24) & 255; msg[total - 3] = (lo >>> 16) & 255;
    msg[total - 2] = (lo >>> 8) & 255;  msg[total - 1] = lo & 255;
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    var w = new Int32Array(64);
    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < total; off += 64) {
        for (var i = 0; i < 16; i++) {
            w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
        }
        for (var j = 16; j < 64; j++) {
            var s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
            var s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (var m = 0; m < 64; m++) {
            var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
            var ch = (e & f) ^ (~e & g);
            var t1 = (h + S1 + ch + SHA_K[m] + w[m]) | 0;
            var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
            var maj = (a & b) ^ (a & c) ^ (b & c);
            var t2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0;
            d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    var out = new Uint8Array(32);
    var vals = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (var n2 = 0; n2 < 8; n2++) {
        var v = vals[n2];
        out[n2 * 4] = (v >>> 24) & 255; out[n2 * 4 + 1] = (v >>> 16) & 255;
        out[n2 * 4 + 2] = (v >>> 8) & 255;  out[n2 * 4 + 3] = v & 255;
    }
    return out;
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

function aesGcmDecrypt(key, iv, ciphertext) {
    var expanded = aesExpandKey(key);
    var counter = new Uint8Array(16);
    counter.set(iv, 0);
    counter[15] = 2;
    var out = new Uint8Array(ciphertext.length);
    for (var off = 0; off < ciphertext.length; off += 16) {
        var ks = aesEncryptBlock(expanded, counter);
        var n = Math.min(16, ciphertext.length - off);
        for (var i = 0; i < n; i++) out[off + i] = ciphertext[off + i] ^ ks[i];
        for (var b = 15; b >= 0; b--) { if (++counter[b] & 255) break; }
    }
    return out;
}

function decryptVidnestV2(payload) {
    var raw = b64UrlDecode(payload.d);
    var iv = raw.slice(0, 12);
    var body = raw.slice(12, raw.length - 16);
    var key = sha256(utf8Encode(payload.n + "|" + VIDNEST_SECRET));
    return JSON.parse(utf8Decode(aesGcmDecrypt(key, iv, body)));
}

// ─── AniList Lookup ────────────────────────────────────────────────────────────

function resolveAnilistId(tmdbId, mediaType) {
    var idStr = String(tmdbId || "").trim();
    console.log("[HI][ANILIST] resolving id=" + idStr + " type=" + mediaType);

    var TMDB_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
    
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
        if (data.v !== 2 || !data.d || !data.n) {
            console.log("[HI][STREAM] invalid format");
            return null;
        }

        var decrypted;
        try { decrypted = decryptVidnestV2(data); }
        catch(e) { console.log("[HI][DECRYPT] " + (e.message || e)); return null; }
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
