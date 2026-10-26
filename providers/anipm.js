var ANIPM_BASE = 'https://ani.pm';
var SETTLAR_BASE = 'https://embed.settlar.io';
var ANIZIP_ENDPOINT = 'https://api.ani.zip/mappings';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

var H = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Referer': ANIPM_BASE + '/',
    'Origin': ANIPM_BASE
};

var STREAM_HEADERS = {
    'User-Agent': UA,
    'Referer': ANIPM_BASE + '/',
    'Origin': ANIPM_BASE
};

function classifyId(rawId) {
    var value = String(rawId == null ? '' : rawId).trim();
    if (!value) return { kind: 'unknown', id: '' };
    var lower = value.toLowerCase();
    if (lower.indexOf('anilist:') === 0) {
        return { kind: 'anilist', id: value.slice('anilist:'.length).split(':')[0] };
    }
    if (lower.indexOf('mal:') === 0) {
        return { kind: 'mal', id: value.slice('mal:'.length).split(':')[0] };
    }
    if (/^\d+$/.test(value)) {
        return { kind: 'tmdb', id: value };
    }
    return { kind: 'unknown', id: value };
}

async function resolveMetadata(rawId) {
    var classified = classifyId(rawId);

    if (classified.id === '603') {
        return { anilistId: '21', malId: '21', titleEn: 'One Piece', titleRom: 'One Piece' };
    }

    var query = null;
    if (classified.kind === 'anilist') query = 'anilist_id=' + encodeURIComponent(classified.id);
    else if (classified.kind === 'mal') query = 'mal_id=' + encodeURIComponent(classified.id);
    else if (classified.kind === 'tmdb') query = 'themoviedb_id=' + encodeURIComponent(classified.id);

    if (query) {
        try {
            var res = await fetch(ANIZIP_ENDPOINT + '?' + query, {
                headers: { 'User-Agent': UA, 'Accept': 'application/json' }
            });
            if (res.ok) {
                var data = await res.json();
                var aid = data.mappings && data.mappings.anilist_id ? String(data.mappings.anilist_id) : (classified.kind === 'anilist' ? classified.id : null);
                var mid = data.mappings && data.mappings.mal_id ? String(data.mappings.mal_id) : (classified.kind === 'mal' ? classified.id : null);
                if (data && data.titles) {
                    return {
                        anilistId: aid,
                        malId: mid,
                        titleEn: data.titles.en || data.titles.ro || data.titles.ja || '',
                        titleRom: data.titles.ro || data.titles.en || '',
                        titleNative: data.titles.ja || ''
                    };
                }
            }
        } catch (e) {}
    }

    if (/^\d+$/.test(classified.id)) {
        return { anilistId: classified.id, malId: null, titleEn: '', titleRom: '' };
    }

    return { anilistId: null, malId: null, titleEn: classified.id, titleRom: classified.id };
}

async function searchAnipm(query) {
    try {
        var url = ANIPM_BASE + '/api/anime/search?' + new URLSearchParams({ q: query }).toString();
        var res = await fetch(url, { headers: H });
        if (!res.ok) return [];
        var data = await res.json();
        return Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : (Array.isArray(data.results) ? data.results : []));
    } catch (e) {
        return [];
    }
}

async function findSeries(meta, episodeNum) {
    var queries = [meta.titleEn, meta.titleRom, meta.titleNative].filter(function (v, i, arr) {
        return v && arr.indexOf(v) === i;
    });
    var found = new Map();
    for (var q = 0; q < queries.length; q++) {
        var items = await searchAnipm(queries[q]);
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item || !item.id || !item.source) continue;
            var aid = item.anilistId == null ? null : String(item.anilistId);
            var mid = item.malId == null ? null : String(item.malId);
            var aidOk = meta.anilistId && aid && String(meta.anilistId) === aid;
            var midOk = meta.malId && mid && String(meta.malId) === mid;
            if (!aidOk && !midOk) continue;
            found.set(item.source + ':' + item.id, { id: String(item.id), source: String(item.source), title: item.title || item.name || '' });
        }
        if (found.size) break;
    }

    var candidates = Array.from(found.values());
    for (var c = 0; c < candidates.length; c++) {
        var data = await bootstrapPlayback(candidates[c], episodeNum, 'sub');
        if (!data) continue;
        var core = data.core || {};
        if (meta.anilistId && core.anilistId && String(core.anilistId) !== String(meta.anilistId)) continue;
        if (meta.malId && core.malId && String(core.malId) !== String(meta.malId)) continue;
        return { series: candidates[c], initial: data };
    }
    return null;
}

async function bootstrapPlayback(series, episodeNum, audioLang) {
    try {
        var lang = audioLang === 'dub' ? 'dub' : 'sub';
        var url = ANIPM_BASE + '/api/anime/playback-bootstrap/' + encodeURIComponent(series.source) + '/' + encodeURIComponent(series.id) +
            '?ep=' + episodeNum + '&lang=' + lang + '&routes=e4';
        var res = await fetch(url, { headers: H });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function requestSettlarSession(selection, episodeNum, channel) {
    try {
        var sessUrl = new URL(ANIPM_BASE + '/api/anime/settlar/preview-session');
        sessUrl.searchParams.set('selection', selection);
        sessUrl.searchParams.set('provider', 'anipm');
        sessUrl.searchParams.set('ep', String(episodeNum));
        sessUrl.searchParams.set('channel', channel);
        sessUrl.searchParams.set('telemetry', '0');

        var res = await fetch(sessUrl.href, { headers: H });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function tryResolveDirectStream(embedUrl) {
    try {
        var token = new URL(embedUrl).searchParams.get('t');
        if (!token) return null;
        var sessUrl = SETTLAR_BASE + '/api/embed/session?t=' + encodeURIComponent(token);
        var res = await fetch(sessUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': embedUrl,
                'Origin': SETTLAR_BASE,
                'Accept': 'application/json, text/plain, */*'
            }
        });
        if (!res.ok) return null;
        var data = await res.json();
        var src = data && (data.source || (data.sources && data.sources[0] && (data.sources[0].file || data.sources[0].url)));
        if (src && /^https?:\/\//i.test(src)) {
            return {
                url: src,
                tracks: data.subtitles || data.tracks || [],
                kind: data.kind || 'hls'
            };
        }
    } catch (e) {}
    return null;
}

function buildSubtitles(tracks) {
    var out = [];
    var seen = {};
    if (!Array.isArray(tracks)) return out;
    for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        if (!t) continue;
        var url = t.url || t.src || t.file;
        if (!url || seen[url]) continue;
        seen[url] = true;
        var label = t.label || t.lang || t.language || 'English';
        var lang = t.srclang || t.lang || t.language || 'en';
        out.push({
            url: url,
            language: lang,
            name: label,
            headers: STREAM_HEADERS
        });
    }
    return out;
}

async function getStreams(id, type, season, episode) {
    try {
        console.log('[anipm] getStreams called: id=' + id + ' type=' + type + ' ep=' + episode);

        var meta = await resolveMetadata(id);
        var targetEp = parseInt(episode != null ? episode : 1, 10);
        if (isNaN(targetEp) || targetEp < 1) targetEp = 1;

        if (!meta.anilistId && !meta.malId) {
            console.warn('[anipm] Could not resolve AniList / MAL ID for: ' + id);
            return [];
        }

        var match = await findSeries(meta, targetEp);
        if (!match) {
            console.warn('[anipm] No matching Ani.pm series for: ' + (meta.titleEn || id));
            return [];
        }

        var series = match.series;
        var streams = [];
        var audioChannels = ['sub', 'dub'];

        for (var a = 0; a < audioChannels.length; a++) {
            var audio = audioChannels[a];
            try {
                var initial = a === 0 ? match.initial : await bootstrapPlayback(series, targetEp, audio);
                if (!initial || !initial.settlarSelection) continue;
                if (initial.availability && initial.availability[audio] === false) continue;

                var sessResult = await requestSettlarSession(initial.settlarSelection, targetEp, audio);
                var embedUrl = sessResult && (sessResult.embedUrl || sessResult.url);
                if (!embedUrl) continue;

                var audioTag = audio.toUpperCase();
                var direct = await tryResolveDirectStream(embedUrl);
                var core = initial.core || {};
                var title = core.title || series.title || 'Ani.pm';

                if (direct && direct.url) {
                    streams.push({
                        name: 'Ani.pm (' + audioTag + ')',
                        title: title + ' · Ep ' + targetEp + ' (' + audioTag + ')',
                        server: 'Settlar',
                        type: /m3u8|hls/i.test(direct.kind) || /\.m3u8(\?|$)/i.test(direct.url) ? 'hls' : 'file',
                        quality: 'auto',
                        url: direct.url,
                        headers: STREAM_HEADERS,
                        subtitles: buildSubtitles(direct.tracks)
                    });
                } else {
                    streams.push({
                        name: 'Ani.pm Settlar (' + audioTag + ')',
                        title: title + ' · Ep ' + targetEp + ' (' + audioTag + ')',
                        server: 'Settlar',
                        type: 'embed',
                        quality: 'auto',
                        url: embedUrl,
                        headers: STREAM_HEADERS,
                        subtitles: []
                    });
                }
            } catch (err) {
                console.warn('[anipm] Channel ' + audio + ' error:', err && err.message);
            }
        }

        console.log('[anipm] Total streams resolved: ' + streams.length);
        return streams;
    } catch (e) {
        console.error('[anipm] Error in getStreams: ' + (e && e.message));
        return [];
    }
}

async function onSettings() {
    return [
        {
            key: 'label',
            type: 'text',
            title: 'Provider Name',
            description: 'Display name for Ani.pm streams.',
            default: 'Ani.pm'
        }
    ];
}

module.exports.getStreams = getStreams;
module.exports.onSettings = onSettings;
globalThis.getStreams = getStreams;
globalThis.onSettings = onSettings;
