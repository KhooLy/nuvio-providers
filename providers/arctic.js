var ADDON_BASE = 'https://pengu.uk';
var DEFAULT_TOKEN = '7MhHl1FbijCQ-IMd8Bevfb6kIWIQOwd9HvS2OHkREYM';
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== 'undefined' && __TMDB_KEY__) ? __TMDB_KEY__ : '1865f43a0549ca50d341dd9ab8b29f49';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function getToken() {
    try {
        var s = typeof globalThis !== 'undefined' ? (globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS || globalThis.settings) : null;
        var token = s && (s.penguToken || s.pengu_token || s.authToken || s.auth_token);
        if (token) return String(token).trim();
    } catch (e) {}
    try {
        if (typeof process !== 'undefined' && process.env && process.env.PENGU_TOKEN) return String(process.env.PENGU_TOKEN).trim();
    } catch (e) {}
    return DEFAULT_TOKEN;
}

function addonConfig() {
    return encodeURIComponent(JSON.stringify({
        auth_token: getToken(),
        source_arctic: 'checked',
        source_experimental: 'checked',
        res_2160: 'checked',
        res_1080: 'checked',
        res_720: 'checked',
        res_480: 'checked',
        res_360: 'checked'
    }));
}

function fetchJson(url, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer;
    return Promise.race([
        fetch(url, {
            headers: { 'User-Agent': UA, 'Accept': 'application/json' },
            signal: controller ? controller.signal : undefined
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }),
        new Promise(function (_, reject) {
            timer = setTimeout(function () {
                if (controller) controller.abort();
                reject(new Error('timeout'));
            }, timeoutMs || 20000);
        })
    ]).then(function (data) {
        clearTimeout(timer);
        return data;
    }, function (err) {
        clearTimeout(timer);
        throw err;
    });
}

function resolveImdb(tmdbId, mediaType) {
    var value = String(tmdbId || '').trim();
    if (/^tt\d+$/i.test(value)) return Promise.resolve(value);
    if (!/^\d+$/.test(value)) return Promise.reject(new Error('unsupported id'));
    var type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
    return fetchJson('https://api.themoviedb.org/3/' + type + '/' + value + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids', 15000)
        .then(function (data) {
            var imdb = data && data.external_ids && data.external_ids.imdb_id;
            if (!imdb) throw new Error('no imdb id');
            return imdb;
        });
}

function parseSize(stream) {
    var hints = stream.behaviorHints || {};
    var bytes = parseInt(hints.videoSize, 10) || 0;
    if (bytes > 0) {
        if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
        return (bytes / 1e6).toFixed(1) + ' MB';
    }
    var text = (stream.description || '') + ' ' + (stream.title || '');
    var m = text.match(/([\d.]+)\s*(GB|MB|TB)/i);
    if (!m) return '';
    var unit = m[2].toUpperCase();
    var value = parseFloat(m[1]);
    if (unit === 'TB') return (value * 1000).toFixed(2) + ' GB';
    return m[1] + ' ' + unit;
}

function qualityOf(stream) {
    var hints = stream.behaviorHints || {};
    var text = [stream.name, stream.description, stream.title, hints.bingeGroup, hints.filename].join(' ').toLowerCase();
    if (/2160|4k|uhd/.test(text)) return '4K';
    if (/1080|fhd/.test(text)) return '1080p';
    if (/720/.test(text)) return '720p';
    if (/480/.test(text)) return '480p';
    if (/360/.test(text)) return '360p';
    return 'auto';
}

function toStream(stream, type, season, episode) {
    var quality = qualityOf(stream);
    var size = parseSize(stream);
    var label = 'Arctic • ' + quality + (size ? ' • ' + size : '');
    var title = String(stream.description || stream.title || label)
        .replace(/[\u200b-\u200f\ufeff]/g, '')
        .trim();
    if (type === 'tv' && season && episode && !/S\d{1,2}E\d{1,2}/i.test(title)) {
        title += ' • S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');
    }
    return {
        name: label,
        title: title,
        description: title,
        url: stream.url,
        quality: quality,
        size: size,
        type: /\.m3u8(\?|$)/i.test(stream.url) ? 'hls' : 'file',
        headers: { 'User-Agent': UA, 'Referer': ADDON_BASE + '/', 'Accept': '*/*' }
    };
}

function getStreams(tmdbId, mediaType, season, episode) {
    if (!getToken()) {
        console.log('[Arctic] PenguPlay auth token is not configured');
        return Promise.resolve([]);
    }
    var type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
    var seasonNum = parseInt(season, 10) || 1;
    var episodeNum = parseInt(episode, 10) || 1;

    return resolveImdb(tmdbId, type).then(function (imdbId) {
        var path = type === 'tv'
            ? 'series/' + imdbId + ':' + seasonNum + ':' + episodeNum
            : 'movie/' + imdbId;
        var url = ADDON_BASE + '/' + addonConfig() + '/stream/' + path + '.json';
        return fetchJson(url, 25000);
    }).then(function (data) {
        var streams = (data && data.streams) || [];
        var out = [];
        var seen = {};
        streams.forEach(function (stream) {
            if (!stream || !/^https?:\/\//i.test(String(stream.url || ''))) return;
            if (/support the project|donate/i.test(String(stream.name || '') + ' ' + String(stream.description || ''))) return;
            if (seen[stream.url]) return;
            seen[stream.url] = true;
            out.push(toStream(stream, type, seasonNum, episodeNum));
        });
        out.sort(function (a, b) {
            var qa = parseInt(a.quality, 10) || 0;
            var qb = parseInt(b.quality, 10) || 0;
            return qb - qa;
        });
        return out;
    }).catch(function (err) {
        console.log('[Arctic] ' + (err && err.message ? err.message : err));
        return [];
    });
}

function onSettings() {
    return [
        {
            type: 'text',
            key: 'penguToken',
            name: 'pengu_token',
            label: 'PenguPlay auth token',
            default: DEFAULT_TOKEN
        }
    ];
}

module.exports = { getStreams: getStreams, onSettings: onSettings };
