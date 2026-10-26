var BASE = "https://sezonlukdizi.cc";
var ADDON_NAME = "SezonlukDizi";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var ALT_LIMIT = 8;

function fetchText(url, headers, options) {
    var opt = { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" };
    if (options && options.method) opt.method = options.method;
    if (options && options.body) opt.body = options.body;
    return fetch(url, opt).then(function (r) { return r.text(); }).catch(function () { return ""; });
}

function fetchJson(url, headers, options) {
    return fetchText(url, headers, options).then(function (b) {
        try { return JSON.parse(b); } catch (e) { return null; }
    });
}

function normalize(value) {
    return String(value || "").toLowerCase()
        .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
        .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
        .replace(/[^a-z0-9]+/g, " ").trim();
}

function tmdbMeta(tmdbId, mediaType) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var type = isTv ? "tv" : "movie";
    return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR")
        .then(function (data) {
            if (!data || (!data.title && !data.name)) {
                return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY);
            }
            return data;
        })
        .then(function (data) {
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
    var body = "q=" + encodeURIComponent(title);
    return fetchJson(BASE + "/ajax/arama.asp", {
        "User-Agent": USER_AGENT,
        "Referer": BASE + "/",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    }, { method: "POST", body: body }).then(function (data) {
        var list = data && data.results && data.results.diziler && data.results.diziler.results;
        return Array.isArray(list) ? list : [];
    });
}

function scoreShow(item, want) {
    var name = normalize(String(item.title || "").replace(/\(\d{4}\)\s*$/, ""));
    var wantTokens = want.split(" ").filter(Boolean);
    if (!wantTokens.length) return 0;
    var nameTokens = name.split(" ").filter(Boolean);
    if (name === want) return 100;
    var matched = 0;
    for (var i = 0; i < wantTokens.length; i++) if (nameTokens.indexOf(wantTokens[i]) !== -1) matched++;
    var score = 100 * matched / Math.max(wantTokens.length, nameTokens.length);
    if (name.indexOf(want) !== -1) score += 15;
    return score;
}

function pickShow(list, meta) {
    var want = normalize(meta.title);
    var wantOriginal = normalize(meta.original);
    var best = null;
    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (!item || !item.url) continue;
        var s = Math.max(scoreShow(item, want), wantOriginal ? scoreShow(item, wantOriginal) : 0);
        if (meta.year) {
            if (String(item.title || "").indexOf(meta.year) !== -1) s += 40;
            else {
                var ym = /(19\d{2}|20\d{2})/.exec(String(item.title || ""));
                if (ym && Math.abs(parseInt(ym[1], 10) - parseInt(meta.year, 10)) > 1) s -= 40;
            }
        }
        if (!best || s > best.score) best = { score: s, item: item };
    }
    return best && best.score >= 60 ? best.item : null;
}

function slugFromUrl(url) {
    var m = /\/(?:diziler|film)\/([^\/?#]+?)(?:\.html)?(?:[?#]|$)/.exec(String(url || ""));
    return m ? m[1] : null;
}

function findEpisodeId(html) {
    var m = /id="dilsec"[^>]*data-id="(\d+)"/.exec(html) || /\bbid="(\d+)"/.exec(html);
    return m ? m[1] : null;
}

function episodeHtml(slug, season, episode) {
    var s = parseInt(season, 10) || 1;
    var e = parseInt(episode, 10) || 1;
    var path = "/" + slug + "/" + s + "-sezon-" + e + "-bolum.html";
    return fetchText(BASE + path, { "User-Agent": USER_AGENT, "Referer": BASE + "/" })
        .then(function (html) {
            if (html && findEpisodeId(html)) return html;
            return fetchText(BASE + "/" + slug + "/dublaj/" + s + "-sezon-" + e + "-bolum.html",
                { "User-Agent": USER_AGENT, "Referer": BASE + "/" });
        });
}

function alternatives(bid, dil) {
    return fetchJson(BASE + "/ajax/dataAlternatif22.asp", {
        "User-Agent": USER_AGENT,
        "Referer": BASE + "/",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    }, { method: "POST", body: "bid=" + encodeURIComponent(bid) + "&dil=" + dil }).then(function (res) {
        if (!res || res.status !== "success" || !Array.isArray(res.data)) return [];
        return res.data;
    });
}

function embedSrc(id) {
    return fetchText(BASE + "/ajax/dataEmbed22.asp", {
        "User-Agent": USER_AGENT,
        "Referer": BASE + "/",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    }, { method: "POST", body: "id=" + encodeURIComponent(id) }).then(function (html) {
        var m = /<iframe[^>]*\bsrc="([^"]+)"/i.exec(html || "");
        if (!m) return null;
        var src = m[1];
        if (src.indexOf("/ajax/reCAPTCHA") !== -1 || src.indexOf("reCAPTCHA") !== -1) return null;
        if (src.indexOf("//") === 0) src = "https:" + src;
        if (!/^https?:/i.test(src)) src = BASE + src;
        return src;
    });
}

var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64u(bytes) {
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
    return out.replace(/\+/g, "-").replace(/\//g, "_");
}

function unb64u(str) {
    var map = {};
    for (var i = 0; i < B64_CHARS.length; i++) map[B64_CHARS[i]] = i;
    var clean = String(str || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
    var out = [];
    for (var j = 0; j < clean.length; j += 4) {
        var c0 = map[clean[j]];
        var c1 = j + 1 < clean.length ? map[clean[j + 1]] : null;
        var c2 = j + 2 < clean.length ? map[clean[j + 2]] : null;
        var c3 = j + 3 < clean.length ? map[clean[j + 3]] : null;
        out.push((c0 << 2) | (c1 === null ? 0 : c1 >> 4));
        if (c2 !== null) out.push(((c1 & 15) << 4) | (c2 >> 2));
        if (c3 !== null) out.push(((c2 & 3) << 6) | c3);
    }
    return new Uint8Array(out);
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

var SHA_K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];

function sha256(bytes) {
    var l = bytes.length;
    var bitLen = l * 8;
    var withOne = l + 1;
    var total = withOne + ((56 - withOne % 64) + 64) % 64 + 8;
    var msg = new Uint8Array(total);
    msg.set(bytes);
    msg[l] = 0x80;
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    msg[total-8]=(hi>>>24)&255; msg[total-7]=(hi>>>16)&255; msg[total-6]=(hi>>>8)&255; msg[total-5]=hi&255;
    msg[total-4]=(lo>>>24)&255; msg[total-3]=(lo>>>16)&255; msg[total-2]=(lo>>>8)&255; msg[total-1]=lo&255;
    var h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    var w = new Int32Array(64);
    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < total; off += 64) {
        for (var i = 0; i < 16; i++) {
            w[i] = (msg[off+i*4]<<24) | (msg[off+i*4+1]<<16) | (msg[off+i*4+2]<<8) | msg[off+i*4+3];
        }
        for (var j = 16; j < 64; j++) {
            var s0 = rr(w[j-15],7) ^ rr(w[j-15],18) ^ (w[j-15]>>>3);
            var s1 = rr(w[j-2],17) ^ rr(w[j-2],19) ^ (w[j-2]>>>10);
            w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
        }
        var a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
        for (var m = 0; m < 64; m++) {
            var S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
            var ch = (e & f) ^ (~e & g);
            var t1 = (h + S1 + ch + SHA_K[m] + w[m]) | 0;
            var S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
            var maj = (a & b) ^ (a & c) ^ (b & c);
            var t2 = (S0 + maj) | 0;
            h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
        }
        h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0;
        h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
    }
    var out = new Uint8Array(32);
    var vals = [h0,h1,h2,h3,h4,h5,h6,h7];
    for (var n = 0; n < 8; n++) {
        var v = vals[n];
        out[n*4]=(v>>>24)&255; out[n*4+1]=(v>>>16)&255; out[n*4+2]=(v>>>8)&255; out[n*4+3]=v&255;
    }
    return out;
}

var P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
var P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
var P256_A = P256_P - 3n;
var P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
var P256_GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
var P256_GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

function pmod(x, m) { return ((x % m) + m) % m; }

function pmodinv(a, m) {
    var oldR = pmod(a, m), r = m, oldS = 1n, s = 0n;
    while (r !== 0n) {
        var q = oldR / r;
        var tr = r; r = oldR - q * r; oldR = tr;
        var ts = s; s = oldS - q * s; oldS = ts;
    }
    return pmod(oldS, m);
}

function ptAdd(p1, p2) {
    if (!p1) return p2;
    if (!p2) return p1;
    var x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    if (x1 === x2 && pmod(y1 + y2, P256_P) === 0n) return null;
    var l;
    if (x1 === x2 && y1 === y2) l = pmod((3n * x1 * x1 + P256_A) * pmodinv(2n * y1, P256_P), P256_P);
    else l = pmod((y2 - y1) * pmodinv(x2 - x1, P256_P), P256_P);
    var x3 = pmod(l * l - x1 - x2, P256_P);
    var y3 = pmod(l * (x1 - x3) - y1, P256_P);
    return [x3, y3];
}

function ptMul(k, pt) {
    var r = null, q = pt;
    while (k > 0n) {
        if (k & 1n) r = ptAdd(r, q);
        q = ptAdd(q, q);
        k >>= 1n;
    }
    return r;
}

function randBytes(n) {
    var b = new Uint8Array(n);
    var c = (typeof crypto !== "undefined" && crypto) ? crypto : null;
    if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
    else for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
}

function randScalar() {
    var b = randBytes(32), v = 0n;
    for (var i = 0; i < 32; i++) v = (v << 8n) | BigInt(b[i]);
    return pmod(v, P256_N - 1n) + 1n;
}

function bigToBytes(v, len) {
    var out = new Uint8Array(len);
    for (var i = len - 1; i >= 0; i--) { out[i] = Number(v & 255n); v >>= 8n; }
    return out;
}

function bytesToBig(b) {
    var v = 0n;
    for (var i = 0; i < b.length; i++) v = (v << 8n) | BigInt(b[i]);
    return v;
}

function ecdsaKeypair() {
    var d = randScalar();
    var Q = ptMul(d, [P256_GX, P256_GY]);
    return { d: d, x: pmod(Q[0], P256_P), y: pmod(Q[1], P256_P) };
}

function ecdsaSign(key, msgBytes) {
    var z = pmod(bytesToBig(sha256(msgBytes)), P256_N);
    for (;;) {
        var k = randScalar();
        var R = ptMul(k, [P256_GX, P256_GY]);
        if (!R) continue;
        var r = pmod(R[0], P256_N);
        if (r === 0n) continue;
        var s = pmod(pmodinv(k, P256_N) * (z + r * key.d), P256_N);
        if (s === 0n) continue;
        var out = new Uint8Array(64);
        out.set(bigToBytes(r, 32), 0);
        out.set(bigToBytes(s, 32), 32);
        return out;
    }
}

function pubJwk(key) {
    return { kty: "EC", crv: "P-256", x: b64u(bigToBytes(key.x, 32)), y: b64u(bigToBytes(key.y, 32)) };
}

var AES_SBOX = new Uint8Array(256);
(function () {
    var p = 1, q = 1;
    do {
        p = (p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0)) & 0xff;
        q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
        if (q & 0x80) q ^= 0x09;
        AES_SBOX[p] = (q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4)) ^ 0x63) & 0xff;
    } while (p !== 1);
    AES_SBOX[0] = 0x63;
})();

function aesXtime(x) { return ((x << 1) ^ ((x & 0x80) ? 0x1b : 0)) & 0xff; }

function aesMul(a, b) {
    var r = 0;
    for (var i = 0; i < 8; i++) {
        if (b & 1) r ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
    }
    return r & 0xff;
}

function aesExpand(key) {
    var Nk = key.length / 4, Nr = Nk + 6;
    var w = new Uint8Array((Nr + 1) * 16);
    w.set(key);
    var rcon = 1;
    for (var i = Nk; i < (Nr + 1) * 4; i++) {
        var t = [w[(i-1)*4], w[(i-1)*4+1], w[(i-1)*4+2], w[(i-1)*4+3]];
        if (i % Nk === 0) {
            t = [AES_SBOX[t[1]] ^ rcon, AES_SBOX[t[2]], AES_SBOX[t[3]], AES_SBOX[t[0]]];
            rcon = aesXtime(rcon);
        } else if (Nk > 6 && i % Nk === 4) {
            t = [AES_SBOX[t[0]], AES_SBOX[t[1]], AES_SBOX[t[2]], AES_SBOX[t[3]]];
        }
        for (var j = 0; j < 4; j++) w[i*4+j] = w[(i-Nk)*4+j] ^ t[j];
    }
    return { w: w, Nr: Nr };
}

function aesEncryptBlock(exp, block) {
    var w = exp.w, Nr = exp.Nr;
    var s = block.slice();
    for (var i = 0; i < 16; i++) s[i] ^= w[i];
    for (var round = 1; round <= Nr; round++) {
        for (var k = 0; k < 16; k++) s[k] = AES_SBOX[s[k]];
        var t = s.slice();
        s[0]=t[0]; s[1]=t[5]; s[2]=t[10]; s[3]=t[15];
        s[4]=t[4]; s[5]=t[9]; s[6]=t[14]; s[7]=t[3];
        s[8]=t[8]; s[9]=t[13]; s[10]=t[2]; s[11]=t[7];
        s[12]=t[12]; s[13]=t[1]; s[14]=t[6]; s[15]=t[11];
        if (round !== Nr) {
            for (var c = 0; c < 4; c++) {
                var a0 = s[c*4], a1 = s[c*4+1], a2 = s[c*4+2], a3 = s[c*4+3];
                s[c*4]   = aesMul(a0,2) ^ aesMul(a1,3) ^ a2 ^ a3;
                s[c*4+1] = a0 ^ aesMul(a1,2) ^ aesMul(a2,3) ^ a3;
                s[c*4+2] = a0 ^ a1 ^ aesMul(a2,2) ^ aesMul(a3,3);
                s[c*4+3] = aesMul(a0,3) ^ a1 ^ a2 ^ aesMul(a3,2);
            }
        }
        var base = round * 16;
        for (var b = 0; b < 16; b++) s[b] ^= w[base+b];
    }
    return s;
}

function ghash(H, data) {
    var Y = new Uint8Array(16);
    for (var off = 0; off < data.length; off += 16) {
        var blk = new Uint8Array(16);
        blk.set(data.subarray(off, off + 16));
        for (var i = 0; i < 16; i++) Y[i] ^= blk[i];
        var Z = new Uint8Array(16), V = H.slice();
        for (var bit = 0; bit < 128; bit++) {
            if ((Y[bit >> 3] >> (7 - (bit & 7))) & 1) { for (var j = 0; j < 16; j++) Z[j] ^= V[j]; }
            var lsb = V[15] & 1;
            for (var k = 15; k > 0; k--) V[k] = ((V[k] >> 1) | ((V[k-1] & 1) << 7)) & 0xff;
            V[0] = (V[0] >> 1) & 0xff;
            if (lsb) V[0] ^= 0xe1;
        }
        Y.set(Z);
    }
    return Y;
}

function aesGcmDecrypt(key, iv, dataWithTag) {
    var exp = aesExpand(key);
    var H = aesEncryptBlock(exp, new Uint8Array(16));
    var tag = dataWithTag.subarray(dataWithTag.length - 16);
    var ct = dataWithTag.subarray(0, dataWithTag.length - 16);
    var J0 = new Uint8Array(16);
    J0.set(iv);
    J0[15] = 1;
    var out = new Uint8Array(ct.length);
    var counter = J0.slice();
    for (var off = 0; off < ct.length; off += 16) {
        for (var b = 15; b >= 0; b--) { if (++counter[b] & 0xff) break; }
        var ks = aesEncryptBlock(exp, counter);
        var n = Math.min(16, ct.length - off);
        for (var i = 0; i < n; i++) out[off+i] = ct[off+i] ^ ks[i];
    }
    var lenBlock = new Uint8Array(16);
    var ctBits = ct.length * 8;
    var hi = Math.floor(ctBits / 0x100000000), lo = ctBits >>> 0;
    lenBlock[8]=(hi>>>24)&255; lenBlock[9]=(hi>>>16)&255; lenBlock[10]=(hi>>>8)&255; lenBlock[11]=hi&255;
    lenBlock[12]=(lo>>>24)&255; lenBlock[13]=(lo>>>16)&255; lenBlock[14]=(lo>>>8)&255; lenBlock[15]=lo&255;
    var padded = ct.length + ((16 - (ct.length % 16)) % 16);
    var gd = new Uint8Array(padded + 16);
    gd.set(ct, 0);
    gd.set(lenBlock, padded);
    var S = ghash(H, gd);
    var ek = aesEncryptBlock(exp, J0);
    for (var m = 0; m < 16; m++) {
        if ((S[m] ^ ek[m]) !== tag[m]) throw new Error("gcm tag mismatch");
    }
    return out;
}

var POW_BE = 512, POW_LT = 511, POW_DR = 2, POW_LR = 2654435761, POW_HR = 2246822519;

function powRot(t, e) { return ((t << e) | (t >>> (32 - e))) >>> 0; }

function powYe(t) {
    t[0]=(t[0]+t[1])>>>0; t[3]=powRot(t[3]^t[0],16);
    t[2]=(t[2]+t[3])>>>0; t[1]=powRot(t[1]^t[2],12);
    t[0]=(t[0]+t[1])>>>0; t[3]=powRot(t[3]^t[0],8);
    t[2]=(t[2]+t[3])>>>0; t[1]=powRot(t[1]^t[2],7);
}

function powHash(msg) {
    var e = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762]);
    for (var i = 0; i < msg.length; i++) { e[0]=(e[0]+msg[i])>>>0; e[0]=powRot(e[0],7); powYe(e); }
    for (var a = 0; a < 8; a++) powYe(e);
    var r = new Uint32Array(POW_BE);
    for (var b = 0; b < POW_BE; b++) { powYe(e); r[b] = (e[0] ^ e[2]) >>> 0; }
    for (var d = 0; d < POW_DR; d++) {
        for (var s = 0; s < POW_BE; s++) {
            var ai = r[s] & POW_LT;
            var c = (r[s] + r[ai]) >>> 0;
            c = powRot(c, 13);
            c = (c ^ (Math.imul(r[(s+1) & POW_LT], POW_LR) >>> 0)) >>> 0;
            r[s] = c;
            e[0] = (e[0] ^ c) >>> 0;
            powYe(e);
        }
    }
    var out = new Uint32Array(8), o = POW_BE / 8;
    for (var x = 0; x < 8; x++) {
        powYe(e);
        var sv = e[0];
        var base = x * o;
        for (var y = 0; y < o; y++) {
            var dd = r[base + y];
            sv = (sv + dd) >>> 0;
            sv = powRot(sv, 5);
            sv = (sv ^ (Math.imul(dd, POW_HR) >>> 0)) >>> 0;
        }
        out[x] = (sv ^ e[2]) >>> 0;
    }
    return out;
}

function leadingZeroBits(h) {
    var e = 0;
    for (var i = 0; i < h.length; i++) {
        if (h[i] === 0) { e += 32; continue; }
        return e + Math.clz32(h[i]);
    }
    return e;
}

function solvePow(nonce, difficulty) {
    var prefix = nonce + ":";
    var limit = 1 << 24;
    for (var s = 0; s < limit; s++) {
        var text = prefix + s;
        var bytes = new Uint8Array(text.length);
        for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 255;
        if (leadingZeroBits(powHash(bytes)) >= difficulty) return String(s);
    }
    return null;
}

function byseApi(origin, path, body, method, token) {
    var headers = {
        "User-Agent": USER_AGENT,
        "Referer": origin + "/",
        "Origin": origin,
        "X-Embed-Origin": BASE,
        "X-Embed-Referer": BASE + "/",
        "X-Embed-Parent": origin,
        "Content-Type": "application/json"
    };
    if (token) headers["X-Captcha-Token"] = token;
    return fetch(origin + path, {
        method: method || "POST",
        headers: headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: "follow"
    }).then(function (r) {
        return r.text().then(function (t) {
            var j = null;
            try { j = JSON.parse(t); } catch (e) {}
            return { status: r.status, body: j };
        });
    }).catch(function () { return { status: 0, body: null }; });
}

function resolveByse(origin, code) {
    return byseApi(origin, "/api/videos/" + encodeURIComponent(code) + "/embed/details", null, "GET").then(function (det) {
        if (det.status !== 200 || !det.body || !det.body.code) return null;
        return byseApi(origin, "/api/videos/access/challenge", {}).then(function (ch) {
            if (!ch.body || !ch.body.nonce) return null;
            var key = ecdsaKeypair();
            var sig = ecdsaSign(key, utf8Encode(ch.body.nonce));
            return byseApi(origin, "/api/videos/access/attest", {
                viewer_id: "",
                device_id: "",
                challenge_id: ch.body.challenge_id,
                nonce: ch.body.nonce,
                signature: b64u(sig),
                public_key: pubJwk(key),
                client: { user_agent: USER_AGENT },
                storage: {},
                attributes: { entropy: "medium" }
            });
        }).then(function (at) {
            if (!at.body || !at.body.token) return null;
            var fingerprint = {
                token: at.body.token,
                viewer_id: at.body.viewer_id,
                device_id: at.body.device_id,
                confidence: at.body.confidence
            };
            return byseApi(origin, "/api/videos/" + encodeURIComponent(code) + "/embed/captcha", {}).then(function (cap) {
                if (!cap.body || !cap.body.pow_nonce) return null;
                var solution = solvePow(cap.body.pow_nonce, cap.body.pow_difficulty);
                if (solution === null) return null;
                return byseApi(origin, "/api/videos/" + encodeURIComponent(code) + "/embed/captcha/verify", {
                    pow_token: cap.body.pow_token,
                    solution: solution
                }).then(function (vv) {
                    if (!vv.body || vv.body.status !== "ok" || !vv.body.token) return null;
                    return byseApi(origin, "/api/videos/" + encodeURIComponent(code) + "/embed/playback",
                        { fingerprint: fingerprint }, "POST", vv.body.token);
                });
            });
        });
    }).then(function (pb) {
        if (!pb || pb.status !== 200 || !pb.body || !pb.body.playback) return [];
        var pl = pb.body.playback;
        if (!Array.isArray(pl.key_parts) || !pl.key_parts.length) return [];
        var versionMap = {};
        for (var n = 1; n <= 20; n++) versionMap[String(n)] = [n, 31 - n];
        var idx = versionMap[String(pl.version)] || [];
        var chosen = idx.length ? idx.map(function (i) { return pl.key_parts[i - 1]; }) : pl.key_parts;
        var keyBytes = [];
        for (var i = 0; i < chosen.length; i++) {
            if (typeof chosen[i] !== "string" || !chosen[i]) continue;
            var part = unb64u(chosen[i]);
            for (var j = 0; j < part.length; j++) keyBytes.push(part[j]);
        }
        var dec;
        try {
            dec = JSON.parse(utf8Decode(aesGcmDecrypt(new Uint8Array(keyBytes), unb64u(pl.iv), unb64u(pl.payload))));
        } catch (e) {
            return [];
        }
        var sources = (dec && Array.isArray(dec.sources)) ? dec.sources : [];
        return sources.filter(function (s) { return s && s.url; }).map(function (s) {
            var stream = {
                name: ADDON_NAME,
                title: (s.label || "auto") + " \u00b7 Dublaj",
                url: s.url,
                quality: s.height ? (s.height + "p") : (s.label || "auto"),
                language: "tr",
                type: /\.m3u8/i.test(s.url) ? "hls" : "file",
                headers: { "User-Agent": USER_AGENT, "Referer": origin + "/", "Origin": origin }
            };
            if (s.size_bytes) stream.behaviorHints = { videoSize: s.size_bytes };
            return stream;
        });
    }).catch(function () { return [];
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    return tmdbMeta(tmdbId, mediaType).then(function (meta) {
        if (!meta || !meta.title) return [];
        return searchSite(meta.title).then(function (results) {
            if ((!results || !results.length) && meta.original) {
                return searchSite(meta.original).then(function (r2) { return r2 || []; });
            }
            return results || [];
        }).then(function (results) {
            var show = pickShow(results, meta);
            if (!show) { console.log("[SZD] show not found: " + meta.title); return []; }
            var slug = slugFromUrl(show.url);
            if (!slug) return [];
            return episodeHtml(slug, season, episode).then(function (html) {
                var bid = html ? findEpisodeId(html) : null;
                if (!bid) { console.log("[SZD] episode not found " + season + "x" + episode); return []; }
                return alternatives(bid, 0).then(function (list) {
                    if (!list.length) return alternatives(bid, 1).then(function (l2) { return { list: l2, dil: 1 }; });
                    return { list: list, dil: 0 };
                }).then(function (alt) {
                    var list = (alt.list || []).slice(0, ALT_LIMIT);
                    if (!list.length) { console.log("[SZD] no alternatives"); return []; }
                    var tasks = list.map(function (a) {
                        return embedSrc(a.id).then(function (src) {
                            if (!src || src.indexOf(BASE) !== -1) return [];
                            var host = /^(https?:\/\/[^\/]+)\//i.exec(src);
                            if (!host) return [];
                            var origin = host[1];
                            var segs = src.slice(origin.length).replace(/[?#].*$/, "").split("/").filter(Boolean);
                            var code = segs[segs.length - 1];
                            if (!code) return [];
                            return resolveByse(origin, code).then(function (streams) {
                                for (var i = 0; i < streams.length; i++) {
                                    if (alt.dil === 1) streams[i].title = streams[i].title.replace("Dublaj", "Altyaz\u0131");
                                }
                                return streams;
                            });
                        });
                    });
                    return Promise.all(tasks).then(function (lists) {
                        var out = [];
                        var seen = {};
                        for (var i = 0; i < lists.length; i++) {
                            for (var j = 0; j < lists[i].length; j++) {
                                var st = lists[i][j];
                                if (seen[st.url]) continue;
                                seen[st.url] = true;
                                out.push(st);
                            }
                        }
                        console.log("[SZD] " + out.length + " streams for " + meta.title + " " + season + "x" + episode);
                        return out;
                    });
                });
            });
        });
    }).catch(function (err) {
        console.error("[SZD][ERROR] " + (err.message || err));
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
        var nuvioProviderName = "SezonlukDizi";
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
