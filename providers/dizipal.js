var DEFAULT_BASE = "https://dizipal1590.com";
var SHORTCUT = "https://t.ly/dizipalgiris";
var ADDON_NAME = "DiziPal";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var PASSPHRASE = "3hPn4uCjTVtfYWcjIcoJQ4cL1WWk1qxXI39egLYOmNv6IblA7eKJz68uU3eLzux1biZLCms0quEjTYniGv5z1JcKbNIsDQFSeIZOBZJz4is6pD7UyWDggWWzTLBQbHcQFpBQdClnuQaMNUHtLHTpzCvZy33p6I7wFBvL4fnXBYH84aUIyWGTRvM2G5cfoNf4705tO2kv";
var MAX_RESULTS = 10;

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
    return fetchText(base + "/arama-yap", { "User-Agent": USER_AGENT }).then(function (html) {
        return html && html.indexOf("cKey") !== -1 ? base : null;
    });
}

function shortcutRedirect() {
    return fetch(SHORTCUT, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function (r) { return r.url || ""; })
        .catch(function () { return ""; });
}

function resolveBase() {
    if (typeof __DIZIPAL_BASE__ !== "undefined" && __DIZIPAL_BASE__) {
        return probe(__DIZIPAL_BASE__).then(function (b) { return b || __DIZIPAL_BASE__; });
    }
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
    }).then(function (base) {
        return base || DEFAULT_BASE;
    }).catch(function () { return DEFAULT_BASE; });
}

var baseCache = null;

function resolvedBase() {
    if (baseCache) return Promise.resolve(baseCache);
    return resolveBase().then(function (base) {
        baseCache = base;
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

function searchSite(base, term) {
    return fetchText(base + "/arama-yap", { "User-Agent": USER_AGENT }).then(function (page) {
        var km = /name="cKey" value="([^"]+)"/.exec(page);
        if (!km) return [];
        var vm = /name="cValue"\s*value="([^"]*)"/.exec(page);
        var body = "cKey=" + encodeURIComponent(km[1]) +
            "&cValue=" + encodeURIComponent(vm ? vm[1] : "") +
            "&type=hepsi&searchterm=" + encodeURIComponent(term);
        return fetchJson(base + "/bg/searchcontent", {
            "User-Agent": USER_AGENT,
            "Referer": base + "/arama-yap",
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
        }, { method: "POST", body: body }).then(function (res) {
            var list = res && res.data && res.data.result;
            return Array.isArray(list) ? list : [];
        });
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
        var score = scoreResult(item, meta);
        if (meta.imdbId && item.object_related_imdb_id && item.object_related_imdb_id === meta.imdbId) score += 200;
        ranked.push({ score: score, item: item });
    }
    ranked.sort(function (a, b) { return b.score - a.score; });
    return ranked.map(function (x) { return x.item; });
}

function findEpisodeUrl(html, season, episode) {
    var s = parseInt(season, 10) || 1;
    var e = parseInt(episode, 10) || 1;
    var re = /href="([^"]*\/bolum\/[^"]+)"/g;
    var m, exact = null, loose = null;
    while ((m = re.exec(html)) !== null) {
        var href = m[1];
        var mm = /-(\d+)x(\d+)(?:-c\d+)?\/?$/.exec(href);
        if (!mm) continue;
        if (parseInt(mm[1], 10) === s && parseInt(mm[2], 10) === e) exact = href;
        else if (!loose && parseInt(mm[2], 10) === e) loose = href;
    }
    return exact || loose;
}

function extractPayload(html) {
    var m = /data-rm-k="true">([\s\S]*?)<\/div>/.exec(html);
    if (!m) return null;
    var text = m[1]
        .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#039;/g, "'");
    try { return JSON.parse(text); } catch (e) { return null; }
}

function dynamicPassphrases(html) {
    var m = /<script[^>]*src="([^"]*app-dizipals[^"]*)"/.exec(html);
    if (!m) return Promise.resolve([]);
    var src = m[1];
    if (src.indexOf("//") === 0) src = "https:" + src;
    return fetchText(src, { "User-Agent": USER_AGENT }).then(function (js) {
        var out = [];
        var re = /'([A-Za-z0-9+\/=]{80,})'|"([A-Za-z0-9+\/=]{80,})"/g, mm;
        while ((mm = re.exec(js)) !== null) {
            var cand = mm[1] || mm[2];
            if (out.indexOf(cand) === -1) out.push(cand);
        }
        return out.slice(0, 40);
    });
}

function resolveIframeTarget(html) {
    var payload = extractPayload(html);
    if (!payload) return Promise.resolve(null);
    var tryPass = function (pass) {
        var out = "";
        try { out = decryptPayload(pass, payload); } catch (e) { out = ""; }
        return (/^https?:\/\//.test(out) || out.indexOf("//") === 0) ? out : null;
    };
    var direct = tryPass(PASSPHRASE);
    if (direct) return Promise.resolve(direct);
    return dynamicPassphrases(html).then(function (cands) {
        for (var i = 0; i < cands.length; i++) {
            var got = tryPass(cands[i]);
            if (got) return got;
        }
        return null;
    });
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
            return out;
        });
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
        return episodePage(base, meta, pageHtml);
    }).then(function (mediaHtml) {
        if (!mediaHtml) return [];
        return resolveIframeTarget(mediaHtml).then(function (iframeUrl) {
            if (!iframeUrl) return [];
            return resolveIframe(iframeUrl, base);
        });
    });
}

function tryCandidates(base, meta, items, index) {
    if (index >= items.length) return Promise.resolve([]);
    return tryCandidate(base, meta, items[index]).then(function (streams) {
        if (streams && streams.length) return streams;
        return tryCandidates(base, meta, items, index + 1);
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    return resolvedBase().then(function (base) {
        return tmdbMeta(tmdbId, mediaType).then(function (meta) {
            if (!meta || !meta.title) return [];
            meta.season = season;
            meta.episode = episode;
            return searchSite(base, meta.title).then(function (results) {
                if ((!results || !results.length) && meta.original) {
                    return searchSite(base, meta.original).then(function (r2) { return r2 || []; });
                }
                return results || [];
            }).then(function (results) {
                var items = rankCandidates(results, meta);
                if (!items.length) return [];
                return tryCandidates(base, meta, items.slice(0, 5), 0);
            });
        });
    }).catch(function (err) {
        console.error("[DiziPal][ERROR] " + (err && err.message ? err.message : err));
        return [];
    });
}

module.exports = { getStreams: getStreams };
