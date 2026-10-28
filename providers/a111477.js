var BASE = 'https://a.111477.xyz';
var JINA = 'https://r.jina.ai/';
var RESOLVER_BASE = 'http://127.0.0.1:8788';
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== 'undefined' && __TMDB_KEY__) ? __TMDB_KEY__ : '1865f43a0549ca50d341dd9ab8b29f49';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE + '/'
};

function fetchText(url, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer;
    return Promise.race([
        fetch(url, {
            headers: HEADERS,
            signal: controller ? controller.signal : undefined,
            redirect: 'follow'
        }).then(function (res) {
            return res.text().then(function (body) {
                return { ok: res.ok, status: res.status, body: body };
            });
        }),
        new Promise(function (_, reject) {
            timer = setTimeout(function () {
                if (controller) controller.abort();
                reject(new Error('timeout'));
            }, timeoutMs || 25000);
        })
    ]).then(function (result) {
        clearTimeout(timer);
        return result;
    }, function (err) {
        clearTimeout(timer);
        throw err;
    });
}

function fetchJson(url, timeoutMs) {
    return fetchText(url, timeoutMs).then(function (res) {
        if (!res.ok) return null;
        try { return JSON.parse(res.body); } catch (e) { return null; }
    }).catch(function () {
        return null;
    });
}

function getMeta(tmdbId, type) {
    var url = 'https://api.themoviedb.org/3/' + type + '/' + encodeURIComponent(String(tmdbId)) +
        '?api_key=' + TMDB_API_KEY + '&language=en-US';
    return fetchJson(url, 15000).then(function (data) {
        if (!data) return null;
        var date = type === 'tv' ? data.first_air_date : data.release_date;
        var title = type === 'tv' ? (data.name || data.original_name) : (data.title || data.original_title);
        var original = type === 'tv' ? (data.original_name || data.name) : (data.original_title || data.title);
        return {
            type: type,
            title: title || '',
            original: original || '',
            year: date ? String(date).slice(0, 4) : '',
            countries: (data.origin_country || []).map(function (code) { return String(code).toUpperCase(); }),
            language: data.original_language || ''
        };
    });
}

function decodeEntities(value) {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#x([0-9a-f]+);/gi, function (_, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        })
        .replace(/&#(\d+);/g, function (_, dec) {
            return String.fromCharCode(parseInt(dec, 10));
        });
}

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function unique(list) {
    var seen = {};
    return list.filter(function (value) {
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
    });
}

function formatSize(bytes) {
    var value = parseInt(bytes, 10);
    if (!value || value < 0) return '';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var index = Math.floor(Math.log(value) / Math.log(1024));
    if (index >= units.length) index = units.length - 1;
    return (value / Math.pow(1024, index)).toFixed(index > 2 ? 2 : 1) + ' ' + units[index];
}

function parseRows(html) {
    var out = [];
    var rowRegex = /<tr\b[^>]*data-entry="true"[^>]*>([\s\S]*?)<\/tr>/gi;
    var match;
    while ((match = rowRegex.exec(html)) !== null) {
        var openTag = match[0].slice(0, match[0].indexOf('>'));
        var nameMatch = openTag.match(/data-name="([^"]*)"/i);
        var urlMatch = openTag.match(/data-url="([^"]*)"/i);
        if (!nameMatch || !urlMatch) continue;
        var name = decodeEntities(nameMatch[1]).trim();
        var url = decodeEntities(urlMatch[1]).trim();
        if (!name || !url) continue;
        var sizeMatch = match[1].match(/<td[^>]*class="size"[^>]*data-sort="(-?\d+)"[^>]*>([\s\S]*?)<\/td>/i);
        var sizeText = '';
        var sizeBytes = 0;
        if (sizeMatch) {
            sizeBytes = parseInt(sizeMatch[1], 10) || 0;
            sizeText = sizeMatch[2].replace(/<[^>]+>/g, '').trim();
            if (!/[0-9]/.test(sizeText)) sizeText = '';
        }
        out.push({
            name: name,
            url: url,
            isDir: url.charAt(url.length - 1) === '/',
            size: sizeBytes,
            sizeText: sizeText
        });
    }
    return out;
}

function parseJina(text, section) {
    var body = String(text || '');
    if (/Target URL returned error|The requested path was not found|Just a moment/i.test(body)) return [];
    var out = [];
    var lines = body.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        if (/^(Title|URL Source|Markdown Content):/i.test(line)) continue;
        if (/parent directory|back to index/i.test(line)) continue;
        var linkMatch = line.match(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/);
        if (linkMatch) {
            var linkedName = linkMatch[1].replace(/\/$/, '').trim();
            if (linkedName === '..' || !linkedName || /^←/.test(linkedName)) continue;
            var linkedUrl = linkMatch[2];
            var linkedPath = linkedUrl.indexOf(BASE) === 0 ? linkedUrl.slice(BASE.length) : linkedUrl.replace(/^https?:\/\/[^/]+/, '');
            if (canonicalPath(linkedPath).indexOf(canonicalPath(section)) !== 0) continue;
            var isDir = /\/$/.test(linkMatch[1]) || /\/$/.test(linkedUrl);
            var sizeMatch = line.slice(linkMatch[0].length).match(/([\d.]+)\s*(B|KB|MB|GB|TB)\b/i);
            out.push({
                name: linkedName,
                url: linkedPath,
                isDir: isDir,
                size: 0,
                sizeText: sizeMatch ? sizeMatch[1] + ' ' + sizeMatch[2].toUpperCase() : ''
            });
            continue;
        }
        var dirMatch = line.match(/^(.*?)\/\s+Directory/i);
        if (dirMatch) {
            var dirName = dirMatch[1].trim();
            if (!dirName || dirName === '..' || /^←/.test(dirName)) continue;
            out.push({
                name: dirName,
                url: section + encodeURIComponent(dirName) + '/',
                isDir: true,
                size: 0,
                sizeText: ''
            });
        }
    }
    return out;
}

function yearOf(name) {
    var paren = String(name || '').match(/\(((?:19|20)\d{2})\)\s*$/);
    if (paren) return paren[1];
    var all = String(name || '').match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/g);
    if (!all || !all.length) return '';
    var last = all[all.length - 1].replace(/[^0-9]/g, '');
    return last;
}

function scoreMovie(entry, meta) {
    var name = entry.name.replace(/\/$/, '');
    var entryYear = yearOf(name);
    var stripped = name.replace(/\s*\((?:19|20)\d{2}\)\s*$/, '');
    var entryTitle = normalize(stripped);
    var best = 0;
    [meta.title, meta.original].forEach(function (candidate) {
        var wanted = normalize(candidate);
        if (!wanted) return;
        if (entryTitle === wanted) best = Math.max(best, 100);
        else if (entryTitle.indexOf(wanted + ' ') === 0) best = Math.max(best, 70);
    });
    if (!best) return 0;
    if (meta.year && entryYear && entryYear !== meta.year) return 0;
    if (meta.year && entryYear === meta.year) best += 20;
    return best;
}

function scoreTv(entry, meta) {
    var name = entry.name.replace(/\/$/, '');
    var normalized = normalize(name);
    var best = 0;
    [meta.title, meta.original].forEach(function (candidate) {
        var wanted = normalize(candidate);
        if (!wanted) return;
        if (normalized === wanted) {
            best = Math.max(best, 100);
            return;
        }
        if (normalized.indexOf(wanted + ' ') !== 0) return;
        var rest = normalized.slice(wanted.length).trim();
        if (!rest) {
            best = Math.max(best, 100);
        } else if (/^(19|20)\d{2}\b/.test(rest)) {
            best = Math.max(best, 90);
        } else if (/^s\d{1,2}\b/.test(rest)) {
            best = Math.max(best, 85);
        } else if (/^season\b/.test(rest)) {
            best = Math.max(best, 85);
        } else if (/^(complete|series|collection|batch|repack|remastered)\b/.test(rest)) {
            best = Math.max(best, 70);
        } else if (/^[a-z]{2,3}$/.test(rest)) {
            best = Math.max(best, 60);
        } else if (/^\d{1,3}\s+\d{1,3}\b/.test(rest)) {
            best = Math.max(best, 65);
        }
    });
    if (!best) return 0;
    var entryYear = yearOf(name);
    if (entryYear && meta.year) {
        if (entryYear === meta.year) best += 15;
        else if (Math.abs(parseInt(entryYear, 10) - parseInt(meta.year, 10)) > 1) best -= 40;
    }
    var suffix = name.match(/\(([A-Za-z]{2,3})\)\s*$/);
    if (suffix) {
        var code = suffix[1].toUpperCase();
        if (meta.countries.indexOf(code) !== -1) best += 20;
        else best -= 20;
    }
    return best;
}

function searchList(section, meta, type, limit, seen) {
    return fetchText(JINA + BASE + section, 20000).then(function (res) {
        if (!res.ok) return [];
        var entries = parseJina(res.body, section);
        var scored = entries.map(function (entry) {
            return { entry: entry, score: type === 'movie' ? scoreMovie(entry, meta) : scoreTv(entry, meta) };
        }).filter(function (row) {
            if (!row.entry.isDir || seen[canonicalPath(row.entry.url)]) return false;
            return row.score >= 70;
        });
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, limit || 1).map(function (row) { return row.entry; });
    }).catch(function () {
        return [];
    });
}

function getEntries(path) {
    function viaJina() {
        return fetchText(JINA + BASE + path, 25000).then(function (res) {
            if (!res.ok) return [];
            return parseJina(res.body, path);
        }).catch(function () {
            return [];
        });
    }
    return fetchText(BASE + path, 4000).then(function (res) {
        if (res.ok) {
            var entries = parseRows(res.body);
            if (entries.length) return entries;
            if (/empty directory|not found/i.test(res.body)) return [];
            return viaJina();
        }
        if (res.status === 404) return [];
        return viaJina();
    }).catch(function () {
        return viaJina();
    });
}

function videoEntries(entries) {
    return entries.filter(function (entry) {
        if (entry.isDir) return false;
        if (/\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|wmv|flv)$/i.test(entry.name)) return true;
        return false;
    });
}

function qualityOf(name) {
    var text = String(name || '').toLowerCase();
    if (/2160p|4k|uhd/.test(text)) return '4K';
    if (/1080p|fhd/.test(text)) return '1080p';
    if (/720p/.test(text)) return '720p';
    if (/480p/.test(text)) return '480p';
    if (/360p/.test(text)) return '360p';
    return 'HD';
}

function qualityRank(quality) {
    if (quality === '8K') return 4320;
    if (quality === '4K') return 2160;
    var value = parseInt(String(quality), 10);
    return isNaN(value) ? 0 : value;
}

function sizeBytesOf(entry) {
    if (entry.size > 0) return entry.size;
    var match = String(entry.sizeText || '').match(/([\d.]+)\s*(TB|GB|MB|KB)/i);
    if (!match) return 0;
    var value = parseFloat(match[1]);
    var unit = match[2].toUpperCase();
    if (unit === 'TB') return value * 1024 * 1024 * 1024 * 1024;
    if (unit === 'GB') return value * 1024 * 1024 * 1024;
    if (unit === 'MB') return value * 1024 * 1024;
    return value * 1024;
}

function detectLanguages(text) {
    var defs = [
        ['English', /\b(?:english|eng)\b/i],
        ['Hindi', /\b(?:hindi|hin)\b/i],
        ['Korean', /\b(?:korean|kor)\b/i],
        ['Japanese', /\b(?:japanese|jap|jpn)\b/i],
        ['Chinese', /\b(?:chinese|mandarin|chi|chs|cht)\b/i],
        ['Spanish', /\b(?:spanish|spa|castellano|latino|lat)\b/i],
        ['French', /\b(?:french|fre|fra)\b/i],
        ['German', /\b(?:german|ger|deu)\b/i],
        ['Italian', /\b(?:italian|ita)\b/i],
        ['Portuguese', /\b(?:portuguese|por)\b/i],
        ['Russian', /\b(?:russian|rus)\b/i],
        ['Arabic', /\b(?:arabic|ara)\b/i],
        ['Turkish', /\b(?:turkish|tur)\b/i],
        ['Thai', /\b(?:thai|tha)\b/i],
        ['Tamil', /\b(?:tamil|tam)\b/i],
        ['Telugu', /\b(?:telugu|tel)\b/i],
        ['Malayalam', /\b(?:malayalam|mal)\b/i],
        ['Kannada', /\b(?:kannada|kan)\b/i],
        ['Bengali', /\b(?:bengali|ben)\b/i],
        ['Punjabi', /\b(?:punjabi|pun)\b/i],
        ['Vietnamese', /\b(?:vietnamese|vie)\b/i],
        ['Indonesian', /\b(?:indonesian|ind)\b/i],
        ['Filipino', /\b(?:filipino|tagalog|fil)\b/i],
        ['Dutch', /\b(?:dutch|dut|nld)\b/i],
        ['Polish', /\b(?:polish|pol|pl)\b/i],
        ['Swedish', /\b(?:swedish|swe)\b/i],
        ['Norwegian', /\b(?:norwegian|nor)\b/i],
        ['Danish', /\b(?:danish|dan)\b/i],
        ['Finnish', /\b(?:finnish|fin)\b/i],
        ['Greek', /\b(?:greek|gre|ell)\b/i],
        ['Hebrew', /\b(?:hebrew|heb)\b/i],
        ['Ukrainian', /\b(?:ukrainian|ukr)\b/i],
        ['Czech', /\b(?:czech|cze|ces)\b/i],
        ['Hungarian', /\b(?:hungarian|hun)\b/i],
        ['Romanian', /\b(?:romanian|rum|ron)\b/i],
        ['Malay', /\b(?:malay|may|msa)\b/i],
        ['Persian', /\b(?:persian|per|fas)\b/i]
    ];
    var out = [];
    for (var i = 0; i < defs.length; i++) {
        if (defs[i][1].test(text) && out.indexOf(defs[i][0]) === -1) out.push(defs[i][0]);
    }
    return out;
}

function formatLanguages(text, langs) {
    var dual = /\bdual[-. ]?audio\b/i.test(text) || (/\bdual\b/i.test(text) && langs.length >= 2);
    var multi = /\bmulti[-. ]?audio\b/i.test(text) || (/\bmulti\b/i.test(text) && langs.length >= 2);
    var prefix = dual ? 'Dual Audio' : (multi ? 'Multi-Audio' : '');
    if (langs.length > 3) return prefix || 'Multi-Audio';
    var list = langs.slice(0, 3).join(' + ');
    if (prefix && list) return prefix + ' (' + list + ')';
    if (prefix) return prefix;
    return list;
}

function languageFromCode(code) {
    var names = {
        en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', hi: 'Hindi',
        es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
        ru: 'Russian', ar: 'Arabic', tr: 'Turkish', th: 'Thai', ta: 'Tamil',
        te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', id: 'Indonesian', tl: 'Filipino',
        vi: 'Vietnamese', nl: 'Dutch', pl: 'Polish', sv: 'Swedish', da: 'Danish',
        no: 'Norwegian', fi: 'Finnish', el: 'Greek', he: 'Hebrew', uk: 'Ukrainian',
        cs: 'Czech', hu: 'Hungarian', ro: 'Romanian', ms: 'Malay', fa: 'Persian'
    };
    return names[String(code || '').toLowerCase()] || '';
}

function parseRelease(name) {
    var text = String(name || '');
    var info = {
        quality: qualityOf(text),
        source: '',
        codec: '',
        bitDepth: '',
        hdr: '',
        audio: '',
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
    else if (/\b(?:hdcam|camrip|cam|telesync|telecine)\b/i.test(text)) info.source = 'CAM';

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

    var ext = text.match(/\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|m3u8|mpd|iso)$/i);
    if (ext) info.container = ext[1].toUpperCase();

    info.languages = detectLanguages(text);
    info.language = formatLanguages(text, info.languages);
    return info;
}

var FLAGS = {
    English: '🇬🇧', Hindi: '🇮🇳', Korean: '🇰🇷', Japanese: '🇯🇵', Chinese: '🇨🇳',
    Spanish: '🇪🇸', French: '🇫🇷', German: '🇩🇪', Italian: '🇮🇹', Portuguese: '🇵🇹',
    Russian: '🇷🇺', Arabic: '🇸🇦', Turkish: '🇹🇷', Thai: '🇹🇭', Tamil: '🇮🇳',
    Telugu: '🇮🇳', Malayalam: '🇮🇳', Kannada: '🇮🇳', Bengali: '🇧🇩', Punjabi: '🇮🇳',
    Vietnamese: '🇻🇳', Indonesian: '🇮🇩', Filipino: '🇵🇭', Dutch: '🇳🇱', Polish: '🇵🇱',
    Swedish: '🇸🇪', Norwegian: '🇳🇴', Danish: '🇩🇰', Finnish: '🇫🇮', Greek: '🇬🇷',
    Hebrew: '🇮🇱', Ukrainian: '🇺🇦', Czech: '🇨🇿', Hungarian: '🇭🇺', Romanian: '🇷🇴',
    Malay: '🇲🇾', Persian: '🇮🇷'
};

function decorateLanguages(label) {
    var names = Object.keys(FLAGS).sort(function (a, b) { return b.length - a.length; });
    var regex = new RegExp('\\b(' + names.join('|') + ')\\b', 'g');
    return String(label || '').replace(regex, function (name) {
        return FLAGS[name] ? FLAGS[name] + ' ' + name : name;
    });
}

function toStream(entry, meta, season, episode) {
    var info = parseRelease(entry.name);
    var size = entry.sizeText || formatSize(entry.size);
    var languageLine = decorateLanguages(info.language || languageFromCode(meta.language));
    var top = ['111477', info.quality, info.source, size].filter(Boolean);
    var line1 = [];
    if (info.source) line1.push('🎥 ' + info.source);
    if (info.codec) line1.push('🎞️ ' + info.codec);
    if (info.bitDepth) line1.push('📺 ' + info.bitDepth);
    if (info.hdr) line1.push('🌈 ' + info.hdr);
    var line2 = [];
    if (info.audio) line2.push('🔊 ' + info.audio);
    if (size) line2.push('📦 ' + size);
    if (info.container) line2.push('💻 ' + info.container);
    var line3 = languageLine ? ['🗣️ ' + languageLine] : [];
    var titleLine = '🎬 ' + (meta.title || '') + (meta.year ? ' (' + meta.year + ')' : '') +
        (meta.type === 'tv' && season && episode ? ' • S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0') : '');
    var details = [titleLine, line1.join(' • '), line2.join(' • '), line3.join(' • ')]
        .filter(Boolean)
        .join('\n');
    var title = entry.name;
    if (meta.type === 'tv' && season && episode) {
        title += ' • S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');
    }
    return {
        name: top.join(' • '),
        title: title,
        description: title,
        url: BASE + entry.url,
        quality: info.quality,
        size: details || size,
        type: 'file',
        headers: {
            'User-Agent': UA,
            'Referer': BASE + '/',
            'Accept': '*/*'
        },
        provider: '111477'
    };
}

function seasonMatches(name, season) {
    var text = normalize(name);
    if (season === 0) return /\b(specials?|season 0|s0)\b/.test(text);
    var pattern = new RegExp('(?:^|\\s)(?:season|s)\\s*0*' + season + '(?:\\s|$)');
    return pattern.test(text);
}

function episodeMatches(name, season, episode) {
    var s = String(season);
    var e = String(episode);
    var base = String(name || '').replace(/\.[a-z0-9]+$/i, '');
    var patterns = [
        new RegExp('(?:^|[^0-9])S0*' + s + 'E0*' + e + '(?:[^0-9]|$)', 'i'),
        new RegExp('(?:^|[^0-9])' + s + 'x0*' + e + '(?:[^0-9]|$)', 'i'),
        new RegExp('(?:^|[^0-9])S0*' + s + '[\\s._-]*E(?:P(?:ISODE)?)?[\\s._-]*0*' + e + '(?:[^0-9]|$)', 'i'),
        new RegExp('(?:^|[^0-9])E(?:P(?:ISODE)?)?[\\s._-]*0*' + e + '(?:[^0-9]|$)', 'i'),
        new RegExp('(?:^|\\s)-\\s*0*' + e + '(?=[\\s._\\[]|$)', 'i'),
        new RegExp('(?:^|[^0-9])\\.0*' + e + '\\.', 'i'),
        new RegExp('\\[0*' + e + '\\]', 'i')
    ];
    for (var i = 0; i < patterns.length; i++) {
        if (patterns[i].test(base)) return true;
    }
    return false;
}

function yearMatchesFile(name, year) {
    if (!year) return true;
    var years = String(name || '').match(/\((?:19|20)\d{2}\)/g);
    if (!years || !years.length) return true;
    var wanted = parseInt(year, 10);
    return years.some(function (value) {
        var parsed = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
        return Math.abs(parsed - wanted) <= 1;
    });
}

function isJunkDir(name) {
    return /\b(extras?|featurettes?|samples?|trailers?|subtitles?|subs?|proof|screens?)\b/i.test(name);
}

function canonicalPath(path) {
    try {
        return decodeURIComponent(path);
    } catch (e) {
        return path;
    }
}

function isInside(url, root) {
    var child = canonicalPath(url);
    var parent = canonicalPath(root);
    return child !== parent && child.indexOf(parent) === 0;
}

function collectFiles(path, depth, meta, season, episode, seen, root) {
    var key = canonicalPath(path);
    if (seen[key] || depth > 2) return Promise.resolve([]);
    var base = root || path;
    return getEntries(path).then(function (entries) {
        if (!entries.length) return [];
        seen[key] = true;

        if (meta.type === 'movie') {
            var direct = videoEntries(entries);
            if (direct.length) return direct;
            var dirs = entries.filter(function (entry) {
                return entry.isDir && isInside(entry.url, base) && !isJunkDir(entry.name);
            }).slice(0, 3);
            return Promise.all(dirs.map(function (dir) {
                return collectFiles(dir.url, depth + 1, meta, season, episode, seen, base);
            })).then(function (groups) {
                return groups.reduce(function (all, rows) { return all.concat(rows); }, []);
            });
        }

        var seasonDirs = entries.filter(function (entry) {
            return entry.isDir && isInside(entry.url, base) && seasonMatches(entry.name, season);
        }).slice(0, 2);
        var files = videoEntries(entries);
        var matching = files.filter(function (entry) {
            return episodeMatches(entry.name, season, episode) && yearMatchesFile(entry.name, meta.year);
        });
        if (matching.length) return matching;
        if (seasonDirs.length) {
            return Promise.all(seasonDirs.map(function (dir) {
                return collectFiles(dir.url, depth + 1, meta, season, episode, seen, base);
            })).then(function (groups) {
                return groups.reduce(function (all, rows) { return all.concat(rows); }, []);
            });
        }
        if (depth === 0) {
            var otherDirs = entries.filter(function (entry) {
                return entry.isDir && isInside(entry.url, base) && !isJunkDir(entry.name);
            }).slice(0, 3);
            if (otherDirs.length) {
                return Promise.all(otherDirs.map(function (dir) {
                    return collectFiles(dir.url, depth + 1, meta, season, episode, seen, base);
                })).then(function (groups) {
                    return groups.reduce(function (all, rows) { return all.concat(rows); }, []);
                });
            }
        }
        if (files.length === 1 && String(episode) === '1') return files;
        return [];
    }).catch(function () {
        return [];
    });
}

function streamsFromFiles(files, meta, season, episode) {
    var seen = {};
    var rows = files.filter(function (entry) {
        if (seen[entry.url]) return false;
        seen[entry.url] = true;
        return true;
    }).map(function (entry) {
        return {
            stream: toStream(entry, meta, season, episode),
            rank: qualityRank(qualityOf(entry.name)),
            bytes: sizeBytesOf(entry)
        };
    });
    rows.sort(function (a, b) {
        if (b.rank !== a.rank) return b.rank - a.rank;
        return b.bytes - a.bytes;
    });
    return rows.map(function (row) {
        return row.stream;
    });
}

function directMoviePaths(meta) {
    var years = meta.year ? [meta.year, String(parseInt(meta.year, 10) - 1), String(parseInt(meta.year, 10) + 1)] : [''];
    var paths = [];
    [meta.title, meta.original].forEach(function (title) {
        if (!title) return;
        years.forEach(function (year) {
            paths.push('/movies/' + encodeURIComponent(year ? title + ' (' + year + ')' : title) + '/');
        });
    });
    return unique(paths);
}

function directTvPaths(meta) {
    var paths = [];
    [meta.title, meta.original].forEach(function (title) {
        if (!title) return;
        paths.push('/tvs/' + encodeURIComponent(title) + '/');
        if (meta.year) paths.push('/tvs/' + encodeURIComponent(title + ' (' + meta.year + ')') + '/');
        meta.countries.forEach(function (code) {
            paths.push('/tvs/' + encodeURIComponent(title + ' (' + code + ')') + '/');
        });
    });
    return unique(paths);
}

function movieStreams(meta, seen) {
    var paths = directMoviePaths(meta);
    function next(index) {
        if (index >= paths.length) {
            return searchList('/movies/', meta, 'movie', 1, seen).then(function (entries) {
                if (!entries.length) return [];
                return collectFiles(entries[0].url, 0, meta, null, null, seen).then(function (files) {
                    return streamsFromFiles(files, meta, null, null);
                });
            });
        }
        return collectFiles(paths[index], 0, meta, null, null, seen).then(function (files) {
            if (files.length) return streamsFromFiles(files, meta, null, null);
            return next(index + 1);
        });
    }
    return next(0);
}

function isAsianDrama(meta) {
    var countries = ['KR', 'CN', 'TW', 'HK', 'JP', 'TH', 'PH', 'ID', 'SG', 'MY', 'VN'];
    var languages = ['ko', 'zh', 'ja', 'th', 'tl', 'id', 'vi'];
    if (meta.countries.some(function (code) { return countries.indexOf(code) !== -1; })) return true;
    return languages.indexOf(String(meta.language || '').toLowerCase()) !== -1;
}

function tvStreams(meta, season, episode, seen) {
    var sections = isAsianDrama(meta) ? ['/kdrama/', '/asiadrama/', '/tvs/'] : ['/tvs/'];
    var paths = directTvPaths(meta);
    function direct(index) {
        if (index >= paths.length) return search(0);
        return collectFiles(paths[index], 0, meta, season, episode, seen).then(function (files) {
            if (files.length) return streamsFromFiles(files, meta, season, episode);
            return direct(index + 1);
        });
    }
    function search(index) {
        if (index >= sections.length) return Promise.resolve([]);
        var limit = 2;
        return searchList(sections[index], meta, 'tv', limit, seen).then(function (entries) {
            if (!entries.length) return search(index + 1);
            function process(nextIndex, results) {
                if (nextIndex >= entries.length) {
                    return results.length ? results : search(index + 1);
                }
                return collectFiles(entries[nextIndex].url, 0, meta, season, episode, seen).then(function (files) {
                    var rows = streamsFromFiles(files, meta, season, episode);
                    return process(nextIndex + 1, results.concat(rows));
                });
            }
            return process(0, []);
        });
    }
    return direct(0);
}

function getResolverBase() {
    var base = RESOLVER_BASE;
    try {
        var s = typeof globalThis !== 'undefined' ? (globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS || globalThis.settings) : null;
        if (s && (s.resolverBase || s.resolver_base || s.resolverUrl)) {
            base = String(s.resolverBase || s.resolver_base || s.resolverUrl).trim();
        }
    } catch (e) {}
    return base ? base.replace(/\/+$/, '') : '';
}

function resolverHealth(base) {
    return fetchText(base + '/health', 2500).then(function (res) {
        if (!res.ok) return false;
        try { return !!JSON.parse(res.body).ok; } catch (e) { return false; }
    }).catch(function () {
        return false;
    });
}

function resolvePlaybackUrl(base, url) {
    return fetchText(base + '/resolve?u=' + encodeURIComponent(url), 5000).then(function (res) {
        if (!res.ok) return url;
        try {
            var data = JSON.parse(res.body);
            return data && /^https?:\/\//i.test(String(data.url || '')) ? String(data.url) : url;
        } catch (e) {
            return url;
        }
    }).catch(function () {
        return url;
    });
}

function resolveRows(rows) {
    var base = getResolverBase();
    if (!base || !rows.length) return Promise.resolve(rows);
    return resolverHealth(base).then(function (ok) {
        if (!ok) return rows;
        var out = [];
        var failures = 0;
        var max = Math.min(rows.length, 4);
        function next(index) {
            if (index >= max) return Promise.resolve(out.concat(rows.slice(max)));
            return resolvePlaybackUrl(base, rows[index].url).then(function (resolved) {
                if (resolved === rows[index].url) {
                    failures++;
                    out.push(rows[index]);
                    if (failures >= 2) return out.concat(rows.slice(index + 1));
                } else {
                    failures = 0;
                    var copy = {};
                    for (var key in rows[index]) {
                        if (Object.prototype.hasOwnProperty.call(rows[index], key)) copy[key] = rows[index][key];
                    }
                    copy.url = resolved;
                    out.push(copy);
                }
                return next(index + 1);
            });
        }
        return next(0);
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
    var seasonNumber = parseInt(season, 10) || 1;
    var episodeNumber = parseInt(episode, 10) || 1;
    return getMeta(tmdbId, type).then(function (meta) {
        if (!meta || !meta.title) return [];
        var seen = {};
        var result = type === 'movie'
            ? movieStreams(meta, seen)
            : tvStreams(meta, seasonNumber, episodeNumber, seen);
        return result.then(resolveRows).then(function (rows) {
            var urls = {};
            return rows.filter(function (row) {
                if (!row || !row.url || urls[row.url]) return false;
                urls[row.url] = true;
                return true;
            });
        });
    }).catch(function (err) {
        console.log('[111477] ' + (err && err.message ? err.message : err));
        return [];
    });
}

function onSettings() {
    return [
        { type: 'header', label: '111477' },
        {
            type: 'text',
            key: 'resolverBase',
            label: 'Resolver URL',
            default: RESOLVER_BASE,
            description: 'Local proxy that converts Cloudflare-protected links. Default http://127.0.0.1:8788 with adb reverse.'
        }
    ];
}

module.exports = { getStreams: getStreams, onSettings: onSettings };

(function nuvioImdbBootstrap() {
    var keys = [];
    try { if (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) keys.push(TMDB_API_KEY); } catch (e) {}
    try { if (typeof TMDB_KEY !== "undefined" && TMDB_KEY) keys.push(TMDB_KEY); } catch (e) {}
    try { if (typeof tmdbApiKey !== "undefined" && tmdbApiKey) keys.push(tmdbApiKey); } catch (e) {}
    ["1865f43a0549ca50d341dd9ab8b29f49", "439c478a771f35c05022f9feabcca01c", "6dc830f9624b43261325bed3bf7d0dfa", "5f39fd16e987a9e3fce30d55cf09b438"].forEach(function (key) {
        if (keys.indexOf(key) === -1) keys.push(key);
    });

    function tmdbJson(url) {
        return fetch(url).then(function (res) {
            return res && res.ok && res.json ? res.json() : null;
        }).catch(function () { return null; });
    }

    function tmdbFind(imdb, type) {
        var index = 0;
        function attempt() {
            if (index >= keys.length) return Promise.resolve(null);
            var url = "https://api.themoviedb.org/3/find/" + encodeURIComponent(imdb) +
                "?api_key=" + encodeURIComponent(keys[index++]) + "&external_source=imdb_id";
            return tmdbJson(url).then(function (data) {
                if (!data) return attempt();
                var rows = type === "tv" ? data.tv_results : data.movie_results;
                return rows && rows[0] && rows[0].id ? String(rows[0].id) : null;
            });
        }
        return attempt();
    }

    function wrap(fn) {
        if (typeof fn !== "function" || fn.__nuvioImdbWrapped) return fn;
        function wrapped(id, mediaType, season, episode) {
            var value = String(id == null ? "" : id).trim();
            if (!/^tt\d+$/i.test(value) || typeof fetch !== "function") return fn.apply(this, arguments);
            var type = /^(tv|series|show|anime|tvshow|tv_show)$/i.test(String(mediaType || "")) ? "tv" : "movie";
            var self = this;
            return tmdbFind(value, type).then(function (tmdbId) {
                return tmdbId ? fn.call(self, tmdbId, mediaType, season, episode) : [];
            });
        }
        wrapped.__nuvioImdbWrapped = true;
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
