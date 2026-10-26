var API = 'https://api.wecollege.net';
var SITE = 'https://www.vidy.st';
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== 'undefined' && __TMDB_KEY__) ? __TMDB_KEY__ : '1865f43a0549ca50d341dd9ab8b29f49';
var UA = 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0 Mobile Safari/537.36';
var SERVERS = ['miami', 'boise', 'atlanta', 'phoenix', 'delhi', 'dallas', 'austin', 'seattle', 'paris', 'munich', 'orlando', 'reno', 'oakland', 'vegas', 'cancun', 'tampa'];
var SERVER_BUDGET_MS = 9000;

var HEADERS = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': SITE + '/',
    'Origin': SITE
};

var K = 2654435769;
var A0 = 2779096485;

function imul(a, b) { return Math.imul(a, b) >>> 0; }
function rotl(x, r) {
    var s = r & 31;
    return s === 0 ? x >>> 0 : (((x << s) | (x >>> (32 - s))) >>> 0);
}
function mix(e) {
    var x = e >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    x = imul(x, 2246822507);
    x = (x ^ (x >>> 13)) >>> 0;
    x = imul(x, 3266489909);
    x = (x ^ (x >>> 16)) >>> 0;
    return x >>> 0;
}
function fnv1a(str) {
    var t = 2166136261;
    var b = Buffer.from(str, 'utf8');
    for (var i = 0; i < b.length; i++) t = imul((t ^ b[i]) >>> 0, 16777619);
    return mix(t);
}
function keystream(seed, tmdbId, len) {
    var s0 = mix((fnv1a(seed) ^ mix((tmdbId >>> 0) ^ K)) >>> 0) >>> 0;
    var S = new Array(61).fill(0);
    var def = new Array(61).fill(false);
    var s = s0;
    for (var e = 0; e < 8; e++) {
        var t = s % 61;
        var sr = rotl((s + K) >>> 0, 7 + (7 & e));
        S[t] = (sr ^ mix(sr)) >>> 0;
        def[t] = true;
        s = mix((sr + t) >>> 0) >>> 0;
    }
    var acc = mix(A0 ^ s) >>> 0;
    var ks = Buffer.alloc(len);
    var n = acc, counter = 0, i = 0;
    while (i < len) {
        var d = n % 61;
        var inner = (S[d] ^ imul(K, counter + 1)) >>> 0;
        var rbit = def[d] ? -1 : 0;
        var l = (((n ^ inner) | (n & inner & rbit)) >>> 0);
        var x = (rotl((l + n) >>> 0, 31 & d) ^ rotl(n, 31 & ((d * 7) & 31))) >>> 0;
        n = mix((x + K) >>> 0) >>> 0;
        S[d] = n;
        def[d] = true;
        ks[i++] = n & 0xFF;
        if (i < len) ks[i++] = (n >>> 8) & 0xFF;
        if (i < len) ks[i++] = (n >>> 16) & 0xFF;
        if (i < len) ks[i++] = (n >>> 24) & 0xFF;
        counter++;
    }
    return ks;
}
function vidyDecrypt(b64ct, seed, tmdbId) {
    var ct = Buffer.from(b64ct, 'base64url');
    var ks = keystream(seed, tmdbId >>> 0, ct.length);
    for (var i = 0; i < ct.length; i++) ct[i] ^= ks[i];
    if (ct.slice(0, 4).toString('latin1') !== 'mvm1') throw new Error('decrypt failed');
    return ct.slice(4).toString('utf8');
}

function fetchJson(url, timeoutMs, headers) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer;
    return Promise.race([
        fetch(url, { headers: headers || HEADERS, signal: controller ? controller.signal : undefined })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            }),
        new Promise(function (_, reject) {
            timer = setTimeout(function () {
                if (controller) controller.abort();
                reject(new Error('timeout'));
            }, timeoutMs || SERVER_BUDGET_MS);
        })
    ]).then(function (text) {
        clearTimeout(timer);
        return text;
    }, function (e) {
        clearTimeout(timer);
        throw e;
    });
}

function resolveTmdb(id, mediaType) {
    var value = String(id || '').trim();
    var type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
    if (/^\d+$/.test(value)) return Promise.resolve({ id: value, type: type });
    if (!/^tt\d+$/i.test(value)) return Promise.reject(new Error('unsupported id'));
    return fetchJson('https://api.themoviedb.org/3/find/' + encodeURIComponent(value) +
        '?api_key=' + TMDB_API_KEY + '&external_source=imdb_id', 12000)
        .then(function (text) {
            var data = JSON.parse(text);
            var rows = type === 'tv' ? data.tv_results : data.movie_results;
            if (!rows || !rows.length) throw new Error('no tmdb match');
            return { id: String(rows[0].id), type: type };
        });
}

function getSeed(tmdbId) {
    return fetchJson(API + '/seed?mediaId=' + encodeURIComponent(tmdbId), 8000).then(function (text) {
        var data = JSON.parse(text);
        if (!data || !data.seed) throw new Error('no seed');
        return data.seed;
    });
}

function languageName(value) {
    var v = String(value || '').toLowerCase();
    if (/hindi/.test(v)) return 'hi';
    if (/tamil/.test(v)) return 'ta';
    if (/telugu/.test(v)) return 'te';
    if (/malayalam/.test(v)) return 'ml';
    if (/kannada/.test(v)) return 'kn';
    if (/english/.test(v)) return 'en';
    if (/japanese/.test(v)) return 'ja';
    if (/korean/.test(v)) return 'ko';
    if (/chinese|mandarin/.test(v)) return 'zh';
    if (/spanish/.test(v)) return 'es';
    if (/french/.test(v)) return 'fr';
    if (/german/.test(v)) return 'de';
    if (/arabic/.test(v)) return 'ar';
    if (/indonesian/.test(v)) return 'id';
    if (/tagalog|filipino/.test(v)) return 'tl';
    return '';
}

function qualityOf(source) {
    var q = String(source && source.quality || '');
    var m = q.match(/(\d{3,4})/);
    if (m) return m[1] + 'p';
    if (/4k|2160/i.test(q)) return '2160p';
    return 'auto';
}

function subtitleRows(items) {
    var out = [];
    var seen = {};
    if (!Array.isArray(items)) return out;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item) continue;
        var url = item.url || item.file || item.src;
        if (!url || seen[url]) continue;
        seen[url] = true;
        var label = item.label || item.language || item.lang || 'Subtitle';
        out.push({
            url: url,
            language: item.srclang || item.lang || item.language || 'und',
            name: label,
            headers: HEADERS
        });
    }
    return out;
}

function fetchServer(server, tmdbId, type, season, episode, seed) {
    var query = [
        'mediaType=' + encodeURIComponent(type),
        'tmdbId=' + encodeURIComponent(tmdbId),
        'enc=2',
        'seed=' + encodeURIComponent(seed),
        'title='
    ];
    if (type === 'tv') {
        query.push('seasonId=' + encodeURIComponent(String(season || 1)));
        query.push('episodeId=' + encodeURIComponent(String(episode || 1)));
    }
    return fetchJson(API + '/' + server + '/sources?' + query.join('&'), SERVER_BUDGET_MS)
        .then(function (text) {
            return JSON.parse(vidyDecrypt(text, seed, Number(tmdbId)));
        })
        .then(function (data) {
            var rows = [];
            var subs = subtitleRows(data && data.subtitles);
            var sources = (data && data.sources) || [];
            for (var i = 0; i < sources.length; i++) {
                var src = sources[i];
                if (!src || !/^https?:\/\//i.test(String(src.url || ''))) continue;
                var quality = qualityOf(src);
                var language = languageName(src.quality);
                rows.push({
                    name: 'Vidy • ' + server + ' • ' + (language ? src.quality : quality),
                    title: 'Vidy ' + (language ? src.quality + ' audio' : quality) + ' · ' + server,
                    url: src.url,
                    quality: quality,
                    language: language || undefined,
                    type: /\.m3u8(\?|$)/i.test(src.url) ? 'hls' : 'file',
                    headers: HEADERS,
                    subtitles: subs
                });
            }
            return rows;
        })
        .catch(function () {
            return [];
        });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
    var ep = parseInt(episode, 10) || 1;
    var sea = parseInt(season, 10) || 1;

    return resolveTmdb(tmdbId, type).then(function (info) {
        return getSeed(info.id).then(function (seed) {
            var jobs = SERVERS.map(function (server) {
                return fetchServer(server, info.id, info.type, sea, ep, seed);
            });
            return Promise.all(jobs).then(function (groups) {
                var out = [];
                var seen = {};
                groups.forEach(function (rows) {
                    rows.forEach(function (row) {
                        if (seen[row.url]) return;
                        seen[row.url] = true;
                        out.push(row);
                    });
                });
                return out;
            });
        });
    }).catch(function (e) {
        console.log('[Vidy] ' + (e && e.message ? e.message : e));
        return [];
    });
}

module.exports = { getStreams: getStreams };
