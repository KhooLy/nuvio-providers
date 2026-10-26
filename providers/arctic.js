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
    if (/^tt\d+$/i.test(value)) return Promise.resolve({ imdb: value, titles: [] });
    if (!/^\d+$/.test(value)) return Promise.reject(new Error('unsupported id'));
    var type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
    return fetchJson('https://api.themoviedb.org/3/' + type + '/' + value + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids', 15000)
        .then(function (data) {
            var imdb = data && data.external_ids && data.external_ids.imdb_id;
            if (!imdb) throw new Error('no imdb id');
            var titles = [data.title || data.name, data.original_title || data.original_name].filter(function (title) {
                return !!title;
            });
            return { imdb: imdb, titles: titles };
        });
}

function normalizeTitle(value) {
    return String(value || '').toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function matchesTitle(stream, titles) {
    if (!titles || !titles.length) return true;
    var text = String(stream.description || stream.title || '');
    var line = text.split('\n')[0] || text;
    if (line.indexOf('🎬') === -1) return true;
    var normalized = normalizeTitle(line);
    return titles.some(function (title) {
        var wanted = normalizeTitle(title);
        return wanted && normalized.indexOf(wanted) !== -1;
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

    return resolveImdb(tmdbId, type).then(function (info) {
        var path = type === 'tv'
            ? 'series/' + info.imdb + ':' + seasonNum + ':' + episodeNum
            : 'movie/' + info.imdb;
        var url = ADDON_BASE + '/' + addonConfig() + '/stream/' + path + '.json';
        return fetchJson(url, 25000).then(function (data) {
            return { data: data, titles: info.titles };
        });
    }).then(function (result) {
        var streams = (result.data && result.data.streams) || [];
        var out = [];
        var seen = {};
        streams.forEach(function (stream) {
            if (!stream || !/^https?:\/\//i.test(String(stream.url || ''))) return;
            if (/support the project|donate/i.test(String(stream.name || '') + ' ' + String(stream.description || ''))) return;
            if (!matchesTitle(stream, result.titles)) return;
            if (seen[stream.url]) return;
            seen[stream.url] = true;
            out.push(toStream(stream, type, seasonNum, episodeNum));
        });
        out.sort(function (a, b) {
            var qa = a.quality === '4K' ? 2160 : (parseInt(a.quality, 10) || 0);
            var qb = b.quality === '4K' ? 2160 : (parseInt(b.quality, 10) || 0);
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
        var nuvioProviderName = "Arctic";
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
