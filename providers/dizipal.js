var DEFAULT_BASE = "https://dizipal1590.com";
var SHORTCUT = "https://t.ly/dizipalgiris";
var APP_URL_TXT = "https://api.kromozpulse.com/url.txt";
var ADDON_NAME = "DiziPal";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var PASSPHRASE = "3hPn4uCjTVtfYWcjIcoJQ4cL1WWk1qxXI39egLYOmNv6IblA7eKJz68uU3eLzux1biZLCms0quEjTYniGv5z1JcKbNIsDQFSeIZOBZJz4is6pD7UyWDggWWzTLBQbHcQFpBQdClnuQaMNUHtLHTpzCvZy33p6I7wFBvL4fnXBYH84aUIyWGTRvM2G5cfoNf4705tO2kv";
var MAX_RESULTS = 10;
var MAX_CANDIDATES = 5;
var CANDIDATE_PARALLEL = 3;
var CANDIDATE_STAGGER = 250;

var MASK64 = (1n << 64n) - 1n;
var SHA512_K = [
    0x428a2f98d728ae22n,0x7137449123ef65cdn,0xb5c0fbcfec4d3b2fn,0xe9b5dba58189dbbcn,
    0x3956c25bf348b538n,0x59f111f1b605d019n,0x923f82a4af194f9bn,0xab1c5ed5da6d8118n,
    0xd807aa98a3030242n,0x12835b0145706fben,0x243185be4ee4b28cn,0x550c7dc3d5ffb4e2n,
    0x72be5d74f27b896fn,0x80deb1fe3b1696b1n,0x9bdc06a725c71235n,0xc19bf174cf692694n,
    0xe49b69c19ef14ad2n,0xefbe4786384f25e3n,0x0fc19dc68b8cd5b5n,0x240ca1cc77ac9c65n,
    0x2de92c6f592b0275n,0x4a7484aa6ea6e483n,0x5cb0a9dcbd41fbd4n,0x76f988da831153b5n,
    0x983e5152ee66dfabn,0xa831c66d2db43210n,0xb00327c898fb213fn,0xbf597fc7beef0ee4n,
    0xc6e00bf33da88fc2n,0xd5a79147930aa725n,0x06ca6351e003826fn,0x142929670a0e6e70n,
    0x27b70a8546d22ffcn,0x2e1b21385c26c926n,0x4d2c6dfc5ac42aedn,0x53380d139d95b3dfn,
    0x650a73548baf63den,0x766a0abb3c77b2a8n,0x81c2c92e47edaee6n,0x92722c851482353bn,
    0xa2bfe8a14cf10364n,0xa81a664bbc423001n,0xc24b8b70d0f89791n,0xc76c51a30654be30n,
    0xd192e819d6ef5218n,0xd69906245565a910n,0xf40e35855771202an,0x106aa07032bbd1b8n,
    0x19a4c116b8d2d0c8n,0x1e376c085141ab53n,0x2748774cdf8eeb99n,0x34b0bcb5e19b48a8n,
    0x391c0cb3c5c95a63n,0x4ed8aa4ae3418acbn,0x5b9cca4f7763e373n,0x682e6ff3d6b2b8a3n,
    0x748f82ee5defb2fcn,0x78a5636f43172f60n,0x84c87814a1f0ab72n,0x8cc702081a6439ecn,
    0x90befffa23631e28n,0xa4506cebde82bde9n,0xbef9a3f7b2c67915n,0xc67178f2e372532bn,
    0xca273eceea26619cn,0xd186b8c721c0c207n,0xeada7dd6cde0eb1en,0xf57d4f7fee6ed178n,
    0x06f067aa72176fban,0x0a637dc5a2c898a6n,0x113f9804bef90daen,0x1b710b35131c471bn,
    0x28db77f523047d84n,0x32caab7b40c72493n,0x3c9ebe0a15c9bebcn,0x431d67c49c100d4cn,
    0x4cc5d4becb3e42b6n,0x597f299cfc657e2an,0x5fcb6fab3ad6faecn,0x6c44198c4a475817n
];

var SBOX = [
0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16];
var INV_SBOX = new Array(256);
for (var sbi = 0; sbi < 256; sbi++) INV_SBOX[SBOX[sbi]] = sbi;
var RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,0x6c,0xd8,0xab,0x4d,0x9a];

function rotr(x, n) { return ((x >> BigInt(n)) | (x << BigInt(64 - n))) & MASK64; }

function utf8ToBytes(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
        c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else {
            i++;
            c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
    }
    return new Uint8Array(out);
}

function bytesToUtf8(bytes) {
    var out = "", i;
    for (i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    try {
        if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
        return decodeURIComponent(escape(out));
    } catch (e) { return out; }
}

function sha512(bytes) {
    var H = [0x6a09e667f3bcc908n,0xbb67ae8584caa73bn,0x3c6ef372fe94f82bn,0xa54ff53a5f1d36f1n,
             0x510e527fade682d1n,0x9b05688c2b3e6c1fn,0x1f83d9abfb41bd6bn,0x5be0cd19137e2179n];
    var l = bytes.length;
    var bitLen = BigInt(l) * 8n;
    var withOne = l + 1;
    var total = withOne + ((112 - withOne % 128) + 128) % 128 + 16;
    var msg = new Uint8Array(total);
    msg.set(bytes);
    msg[l] = 0x80;
    for (var b = 0; b < 8; b++) msg[total - 1 - b] = Number((bitLen >> BigInt(8 * b)) & 0xffn);
    var w = new Array(80);
    for (var off = 0; off < total; off += 128) {
        for (var i = 0; i < 16; i++) {
            var v = 0n;
            for (var j = 0; j < 8; j++) v = (v << 8n) | BigInt(msg[off + i * 8 + j]);
            w[i] = v;
        }
        for (var t = 16; t < 80; t++) {
            var s0 = rotr(w[t-15],1) ^ rotr(w[t-15],8) ^ (w[t-15] >> 7n);
            var s1 = rotr(w[t-2],19) ^ rotr(w[t-2],61) ^ (w[t-2] >> 6n);
            w[t] = (w[t-16] + s0 + w[t-7] + s1) & MASK64;
        }
        var a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
        for (var t2 = 0; t2 < 80; t2++) {
            var S1 = rotr(e,14) ^ rotr(e,18) ^ rotr(e,41);
            var ch = (e & f) ^ ((~e & MASK64) & g);
            var temp1 = (h + S1 + ch + SHA512_K[t2] + w[t2]) & MASK64;
            var S0 = rotr(a,28) ^ rotr(a,34) ^ rotr(a,39);
            var maj = (a & bb) ^ (a & c) ^ (bb & c);
            var temp2 = (S0 + maj) & MASK64;
            h=g; g=f; f=e; e=(d + temp1) & MASK64; d=c; c=bb; bb=a; a=(temp1 + temp2) & MASK64;
        }
        H[0]=(H[0]+a)&MASK64; H[1]=(H[1]+bb)&MASK64; H[2]=(H[2]+c)&MASK64; H[3]=(H[3]+d)&MASK64;
        H[4]=(H[4]+e)&MASK64; H[5]=(H[5]+f)&MASK64; H[6]=(H[6]+g)&MASK64; H[7]=(H[7]+h)&MASK64;
    }
    var out = new Uint8Array(64);
    for (var k = 0; k < 8; k++) for (var m = 0; m < 8; m++) out[k*8+m] = Number((H[k] >> BigInt(56 - 8*m)) & 0xffn);
    return out;
}

function hmacSha512(keyBytes, msgBytes) {
    var key = keyBytes;
    if (key.length > 128) key = sha512(key);
    var block = new Uint8Array(128);
    block.set(key);
    var ipad = new Uint8Array(128 + msgBytes.length);
    var opad = new Uint8Array(128 + 64);
    for (var i = 0; i < 128; i++) { ipad[i] = block[i] ^ 0x36; opad[i] = block[i] ^ 0x5c; }
    ipad.set(msgBytes, 128);
    var inner = sha512(ipad);
    opad.set(inner, 128);
    return sha512(opad);
}

function pbkdf2Sha512(passBytes, saltBytes, iterations, dkLen) {
    var hLen = 64;
    var blocks = Math.ceil(dkLen / hLen);
    var dk = new Uint8Array(blocks * hLen);
    for (var b = 1; b <= blocks; b++) {
        var salt = new Uint8Array(saltBytes.length + 4);
        salt.set(saltBytes);
        salt[saltBytes.length] = (b >>> 24) & 255;
        salt[saltBytes.length+1] = (b >>> 16) & 255;
        salt[saltBytes.length+2] = (b >>> 8) & 255;
        salt[saltBytes.length+3] = b & 255;
        var u = hmacSha512(passBytes, salt);
        var t = u.slice();
        for (var c = 1; c < iterations; c++) {
            u = hmacSha512(passBytes, u);
            for (var x = 0; x < hLen; x++) t[x] ^= u[x];
        }
        dk.set(t, (b - 1) * hLen);
    }
    return dk.slice(0, dkLen);
}

function mul(a, b) {
    var p = 0;
    for (var i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
    }
    return p & 0xff;
}

function expandKey(key) {
    var Nk = 8, Nr = 14;
    var w = new Array(4 * (Nr + 1));
    for (var i = 0; i < Nk; i++) w[i] = [key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]];
    for (var i2 = Nk; i2 < 4 * (Nr + 1); i2++) {
        var temp = w[i2-1].slice();
        if (i2 % Nk === 0) {
            temp.push(temp.shift());
            temp = temp.map(function (x) { return SBOX[x]; });
            temp[0] ^= RCON[(i2 / Nk) - 1];
        } else if (i2 % Nk === 4) {
            temp = temp.map(function (x) { return SBOX[x]; });
        }
        var prev = w[i2 - Nk];
        w[i2] = [prev[0]^temp[0], prev[1]^temp[1], prev[2]^temp[2], prev[3]^temp[3]];
    }
    return w;
}

function aesDecryptBlock(block, w) {
    var Nr = 14;
    var state = [[],[],[],[]];
    for (var i = 0; i < 16; i++) state[i % 4][Math.floor(i / 4)] = block[i];
    for (var c0 = 0; c0 < 4; c0++) for (var r0 = 0; r0 < 4; r0++) state[r0][c0] ^= w[Nr*4 + c0][r0];
    for (var round = Nr - 1; round >= 1; round--) {
        for (var r1 = 1; r1 < 4; r1++) {
            var row = state[r1];
            state[r1] = row.map(function (_, c) { return row[(c - r1 + 4) % 4]; });
        }
        for (var r2 = 0; r2 < 4; r2++) for (var c2 = 0; c2 < 4; c2++) state[r2][c2] = INV_SBOX[state[r2][c2]];
        for (var c3 = 0; c3 < 4; c3++) for (var r3 = 0; r3 < 4; r3++) state[r3][c3] ^= w[round*4 + c3][r3];
        for (var c4 = 0; c4 < 4; c4++) {
            var a = [state[0][c4], state[1][c4], state[2][c4], state[3][c4]];
            state[0][c4] = mul(a[0],14)^mul(a[1],11)^mul(a[2],13)^mul(a[3],9);
            state[1][c4] = mul(a[0],9)^mul(a[1],14)^mul(a[2],11)^mul(a[3],13);
            state[2][c4] = mul(a[0],13)^mul(a[1],9)^mul(a[2],14)^mul(a[3],11);
            state[3][c4] = mul(a[0],11)^mul(a[1],13)^mul(a[2],9)^mul(a[3],14);
        }
    }
    for (var r4 = 1; r4 < 4; r4++) {
        var row2 = state[r4];
        state[r4] = row2.map(function (_, c) { return row2[(c - r4 + 4) % 4]; });
    }
    for (var r5 = 0; r5 < 4; r5++) for (var c5 = 0; c5 < 4; c5++) state[r5][c5] = INV_SBOX[state[r5][c5]];
    for (var c6 = 0; c6 < 4; c6++) for (var r6 = 0; r6 < 4; r6++) state[r6][c6] ^= w[c6][r6];
    var out = new Uint8Array(16);
    for (var j = 0; j < 16; j++) out[j] = state[j % 4][Math.floor(j / 4)];
    return out;
}

function aes256cbcDecrypt(key, iv, data) {
    var w = expandKey(key);
    var out = new Uint8Array(data.length);
    var prev = iv;
    for (var off = 0; off < data.length; off += 16) {
        var dec = aesDecryptBlock(data.subarray(off, off + 16), w);
        for (var i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
        prev = data.subarray(off, off + 16);
    }
    var pad = out[out.length - 1];
    if (pad < 1 || pad > 16) return out;
    return out.subarray(0, out.length - pad);
}

function b64ToBytes(s) {
    if (typeof atob !== "undefined") {
        var bin = atob(String(s).replace(/\s+/g, ""));
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    return new Uint8Array(Buffer.from(String(s).replace(/\s+/g, ""), "base64"));
}

function hexToBytes(s) {
    var out = new Uint8Array(s.length >> 1);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
}

function decryptPayload(pass, payload) {
    var key = pbkdf2Sha512(utf8ToBytes(pass), hexToBytes(payload.salt), 999, 32);
    var plain = aes256cbcDecrypt(key, hexToBytes(payload.iv), b64ToBytes(payload.ciphertext));
    return bytesToUtf8(plain);
}

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

function probe(base) {
    return fetch(base + "/arama-yap", { headers: { "User-Agent": USER_AGENT }, redirect: "follow" }).then(function (r) {
        return r.text().then(function (html) {
            if (!html || html.indexOf("/arama-yap") === -1) return null;
            var m = /^(https?:\/\/[^\/]+)/.exec(r.url || "");
            return m ? m[1] : base;
        });
    }).catch(function () { return null; });
}

function shortcutRedirect() {
    return fetch(SHORTCUT, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function (r) { return r.url || ""; })
        .catch(function () { return ""; });
}

function appDomainResolve() {
    return fetchText(APP_URL_TXT, { "User-Agent": "okhttp/4.9.2", "Accept": "text/plain,text/html,*/*" }).then(function (txt) {
        var m = /https?:\/\/([a-z0-9.-]+)/i.exec(String(txt || "").trim());
        return m ? "https://" + m[1] : null;
    }).catch(function () { return null; });
}

function shortcutResolve() {
    return shortcutRedirect().then(function (finalUrl) {
        var cleaned = finalUrl.replace(/\+/g, " ");
        var m = /dizipal[^0-9]{0,4}(\d{2,6})/i.exec(cleaned);
        var guesses = [];
        if (m) guesses.push("dizipal" + m[1]);
        m = /dizipal(\d{2,6})/i.exec(finalUrl);
        if (m && guesses.indexOf("dizipal" + m[1]) === -1) guesses.push("dizipal" + m[1]);
        var hosts = [];
        for (var i = 0; i < guesses.length; i++) {
            hosts.push("https://" + guesses[i] + ".com");
            hosts.push("https://" + guesses[i] + ".site");
        }
        hosts.push(DEFAULT_BASE);
        var idx = 0;
        function next() {
            if (idx >= hosts.length) return null;
            var host = hosts[idx++];
            return probe(host).then(function (ok) { return ok || next(); });
        }
        return next();
    }).catch(function () { return null; });
}

function resolveBase() {
    if (typeof __DIZIPAL_BASE__ !== "undefined" && __DIZIPAL_BASE__) {
        return probe(__DIZIPAL_BASE__).then(function (b) { return b || __DIZIPAL_BASE__; });
    }
    return appDomainResolve().then(function (host) {
        if (!host) return null;
        return probe(host).then(function (ok) { return ok || null; });
    }).then(function (base) {
        return base || shortcutResolve();
    }).then(function (base) {
        return base || DEFAULT_BASE;
    }).catch(function () { return DEFAULT_BASE; });
}

var baseCache = null;

function resolvedBase() {
    if (baseCache) return Promise.resolve(baseCache);
    return resolveBase().then(function (base) {
        baseCache = base;
        console.log("[DP][INIT] BASE_URL=" + base);
        return base;
    });
}

function tmdbMeta(tmdbId, mediaType) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR&append_to_response=external_ids";
    return fetchJson(url).then(function (data) {
        if (!data || (!data.title && !data.name)) {
            return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids");
        }
        return data;
    }).then(function (data) {
        if (!data) return null;
        var ext = data.external_ids || {};
        return {
            isTv: isTv,
            imdbId: data.imdb_id || ext.imdb_id || "",
            title: data.title || data.name || data.original_title || data.original_name || "",
            original: data.original_title || data.original_name || "",
            year: String(data.release_date || data.first_air_date || "").split("-")[0]
        };
    });
}

function searchAction(base, action, term) {
    var body = JSON.stringify({ action: action, params: [term] });
    return fetchJson(base + "/api/mj", {
        "User-Agent": USER_AGENT,
        "Origin": base,
        "Referer": base + "/arama-yap",
        "Content-Type": "application/json"
    }, { method: "POST", body: body }).then(function (res) {
        return res && res.ok && Array.isArray(res.result) ? res.result : [];
    });
}

function searchSite(base, term) {
    if (String(term || "").trim().length < 3) return Promise.resolve([]);
    return searchAction(base, "searchContent", term).then(function (list) {
        return list.length ? list : searchAction(base, "searchContentFullText", term);
    }).then(function (list) {
        console.log("[DP][SEARCH] term=" + term + " results=" + list.length);
        return list;
    });
}

function scoreResult(item, meta) {
    var name = normalize(item.object_name || "");
    var alt = normalize(item.object_alternative_name || item.object_name_alternative || "");
    var want = normalize(meta.title);
    var wantOriginal = normalize(meta.original);
    var wantTokens = want.split(" ").filter(Boolean);
    var nameTokens = name.split(" ").filter(Boolean);
    var score = 0;
    if (want && name === want) score = 100;
    else {
        var matched = 0;
        for (var i = 0; i < wantTokens.length; i++) if (nameTokens.indexOf(wantTokens[i]) !== -1) matched++;
        score = wantTokens.length ? 100 * matched / Math.max(wantTokens.length, nameTokens.length) : 0;
        if (want && name.indexOf(want) !== -1) score += 15;
    }
    if (wantOriginal && (alt === wantOriginal || alt.indexOf(wantOriginal) !== -1)) score = Math.max(score, 90);
    if (meta.year && String(item.object_release_year) === meta.year) score += 6;
    return score;
}

function rankCandidates(list, meta) {
    var wantType = meta.isTv ? "Series" : "Movies";
    var ranked = [];
    for (var i = 0; i < list.length && i < MAX_RESULTS; i++) {
        var item = list[i];
        if (!item || !item.used_slug) continue;
        if (item.used_type && item.used_type !== wantType) continue;
        var isFilm = item.used_slug.indexOf("movies/") === 0 || item.used_slug.indexOf("movie/") === 0;
        if (isFilm === meta.isTv) continue;
        var imdbMatch = meta.imdbId && item.object_related_imdb_id === meta.imdbId;
        var names = [item.object_name, item.object_alternative_name, item.object_name_alternative];
        var titleMatch = false;
        for (var n = 0; n < names.length; n++) {
            var name = normalize(names[n]);
            if (name && (name === normalize(meta.title) || name === normalize(meta.original))) titleMatch = true;
        }
        if (!imdbMatch && !titleMatch) continue;
        if (!imdbMatch && meta.year && item.object_release_year && Math.abs(parseInt(item.object_release_year, 10) - parseInt(meta.year, 10)) > 1) continue;
        var score = scoreResult(item, meta);
        if (imdbMatch) score += 200;
        ranked.push({ score: score, item: item });
    }
    ranked.sort(function (a, b) { return b.score - a.score; });
    return ranked.map(function (x) { return x.item; });
}

function findEpisodeUrl(html, season, episode) {
    var s = parseInt(season, 10) || 1;
    var e = parseInt(episode, 10) || 1;
    var re = /href="([^"]*\/bolum\/[^"]+)"/g;
    var m, exact = null;
    while ((m = re.exec(html)) !== null) {
        var href = m[1];
        var mm = /-(\d+)x(\d+)(?:-c\d+)?\/?$/.exec(href);
        if (!mm) continue;
        if (parseInt(mm[1], 10) === s && parseInt(mm[2], 10) === e) exact = href;
    }
    return exact;
}

function extractPayload(html) {
    var text = String(html || "").replace(/\\"/g, '"');
    var enc = /"enc":\{"ciphertext":"([^"]+)","iv":"([^"]+)","salt":"([^"]+)"\}/.exec(text);
    if (!enc) return null;
    var km = /"enc":\{[^}]*\},"k":"([^"]+)"/.exec(text);
    return { ciphertext: enc[1], iv: enc[2], salt: enc[3], k: km ? km[1] : "" };
}

function resolveIframeTarget(html) {
    var payload = extractPayload(html);
    if (!payload) return Promise.resolve(null);
    var passes = [payload.k, PASSPHRASE].filter(function (p, i, arr) { return p && arr.indexOf(p) === i; });
    for (var i = 0; i < passes.length; i++) {
        var out = "";
        try { out = decryptPayload(passes[i], payload); } catch (e) { out = ""; }
        if (/^https?:\/\//.test(out) || out.indexOf("//") === 0) return Promise.resolve(out);
    }
    return Promise.resolve(null);
}

function toAbsolute(url) {
    if (url.indexOf("//") === 0) return "https:" + url;
    return url;
}

function streamHeaders(referer) {
    return { "User-Agent": USER_AGENT, "Referer": referer };
}

function resolveIframe(iframeUrl, base) {
    var url = toAbsolute(iframeUrl);
    var origin = (function () {
        var m = /^(https?:\/\/[^\/]+)/.exec(url);
        return m ? m[1] : base;
    })();
    return fetchText(url, streamHeaders(base + "/")).then(function (html) {
        if (!html) return [];
        var tm = /openPlayer\(\s*'([^']+)'/.exec(html);
        if (!tm) return [];
        var token = tm[1];
        var api = origin + "/source2.php?v=" + encodeURIComponent(token);
        return fetchJson(api, streamHeaders(url)).then(function (res) {
            if (!res || !Array.isArray(res.playlist)) return [];
            var out = [];
            var seen = {};
            for (var i = 0; i < res.playlist.length; i++) {
                var item = res.playlist[i];
                var sources = item && item.sources;
                if (!Array.isArray(sources)) continue;
                for (var j = 0; j < sources.length; j++) {
                    var s = sources[j];
                    if (!s || !s.file || seen[s.file]) continue;
                    seen[s.file] = true;
                    out.push({
                        name: ADDON_NAME,
                        title: s.title || "Orijinal",
                        quality: "auto",
                        language: "tr",
                        type: "hls",
                        url: toAbsolute(s.file),
                        headers: streamHeaders(origin + "/")
                    });
                }
            }
            console.log("[DP][PLAYLIST] sources=" + out.length);
            return out;
        });
    });
}

function seasonPage(base, pageHtml, season) {
    var s = parseInt(season, 10) || 1;
    if (s === 1) return Promise.resolve(pageHtml);
    var re = /\/sezon\/[^"\\]+/g, m, path = null;
    while ((m = re.exec(pageHtml)) !== null) {
        var mm = /sezon-(\d+)(?:-c\d+)?(?:[?"#]|$)/.exec(m[0]);
        if (mm && parseInt(mm[1], 10) === s) { path = m[0]; break; }
    }
    if (!path) return Promise.resolve(pageHtml);
    var url = /^https?:/i.test(path) ? path : base + path;
    return fetchText(url, { "User-Agent": USER_AGENT, "Referer": base + "/" }).then(function (html) {
        return html || pageHtml;
    });
}

function episodePage(base, meta, pageHtml) {
    var epPath = findEpisodeUrl(pageHtml, meta.season, meta.episode);
    if (!epPath) return Promise.resolve("");
    var epUrl = /^https?:/i.test(epPath) ? epPath : base + epPath;
    return fetchText(epUrl, { "User-Agent": USER_AGENT, "Referer": base + "/" });
}

function tryCandidate(base, meta, item) {
    var pageUrl = base + "/" + item.used_slug;
    return fetchText(pageUrl, { "User-Agent": USER_AGENT, "Referer": base + "/" }).then(function (pageHtml) {
        if (!pageHtml) return [];
        if (!meta.isTv) return pageHtml;
        return seasonPage(base, pageHtml, meta.season).then(function (seasonHtml) {
            return episodePage(base, meta, seasonHtml).then(function (h) {
                console.log("[DP][EPISODE] url=" + pageUrl + " s=" + meta.season + " e=" + meta.episode + " found=" + (h ? "yes" : "no"));
                return h;
            });
        });
    }).then(function (mediaHtml) {
        if (!mediaHtml) return [];
        return resolveIframeTarget(mediaHtml).then(function (iframeUrl) {
            console.log("[DP][IFRAME] " + (iframeUrl || "none") + " from=" + pageUrl);
            if (!iframeUrl) return [];
            return resolveIframe(iframeUrl, base);
        });
    });
}

function tryCandidates(base, meta, items) {
    var queue = items.slice(0, MAX_CANDIDATES);
    return new Promise(function (resolve) {
        if (!queue.length) return resolve([]);
        var next = 0, inflight = 0, settled = false, timer = null;

        function settle(streams) {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolve(streams);
        }

        function done() {
            inflight--;
            if (next >= queue.length && inflight === 0) settle([]);
            else schedule();
        }

        function onResult(streams) {
            if (streams && streams.length) settle(streams);
            else done();
        }

        function tick() {
            timer = null;
            if (settled) return;
            if (next < queue.length && inflight < CANDIDATE_PARALLEL) {
                var item = queue[next++];
                inflight++;
                tryCandidate(base, meta, item).then(onResult).catch(done);
            }
            if (next < queue.length && inflight < CANDIDATE_PARALLEL) schedule();
        }

        function schedule() {
            if (settled || timer) return;
            timer = setTimeout(tick, CANDIDATE_STAGGER);
        }

        tick();
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    console.log("[DP][START] tmdbId=" + tmdbId + " type=" + mediaType + " s=" + season + " e=" + episode);
    return Promise.all([resolvedBase(), tmdbMeta(tmdbId, mediaType)]).then(function (r) {
        var base = r[0], meta = r[1];
        if (!meta || !meta.title) { console.log("[DP][TMDB] no meta for id=" + tmdbId); return []; }
        meta.season = season;
        meta.episode = episode;
        console.log("[DP][TMDB] id=" + tmdbId + " TR=" + meta.title + " EN=" + meta.original + " year=" + meta.year);
        var searches = [searchSite(base, meta.title)];
        if (meta.original && normalize(meta.original) !== normalize(meta.title)) searches.push(searchSite(base, meta.original));
        return Promise.all(searches).then(function (groups) {
            var results = [], seen = {};
            for (var g = 0; g < groups.length; g++) {
                for (var i = 0; i < groups[g].length; i++) {
                    var item = groups[g][i];
                    if (!item || !item.used_slug || seen[item.used_slug]) continue;
                    seen[item.used_slug] = true;
                    results.push(item);
                }
            }
            return results;
        }).then(function (results) {
            var items = rankCandidates(results, meta);
            console.log("[DP][MATCH] candidates=" + items.length);
            if (!items.length) return [];
            return tryCandidates(base, meta, items);
        });
    }).then(function (streams) {
        console.log("[DP][RETURN] streams=" + (streams ? streams.length : 0));
        return streams;
    }).catch(function (err) {
        console.error("[DiziPal][ERROR] " + (err && err.message ? err.message : err));
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
        var nuvioProviderName = "DiziPal";
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
