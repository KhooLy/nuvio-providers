'use strict';
var BASE = 'https://cinefreak.net';
function request(url, json) {
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer;
  return Promise.race([
    fetch(url, { headers: { Accept: json ? 'application/json' : 'text/html' }, signal: controller ? controller.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return json ? r.json() : r.text(); }),
    new Promise(function (_, reject) { timer = setTimeout(function () { if (controller) controller.abort(); reject(new Error('Request timed out')); }, 12000); })
  ]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
}
function normalize(s) {
  return String(s || '').toLowerCase().replace(/&amp;|&#0*38;/g, ' and ').replace(/&/g, ' and ').replace(/[^a-z0-9\u0080-\uffff]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function metadata(id, type, settings) {
  if (id && typeof id === 'object' && (id.title || id.name)) return Promise.resolve(id);
  if (!/^\d+$/.test(String(id))) return Promise.reject(new Error('Expected a numeric TMDB ID'));
  function publicMetadata() {
    return request('https://www.themoviedb.org/' + type + '/' + id + '?language=en-US', false).then(function (html) {
      var m = html.match(/<title>\s*([\s\S]*?)\s*\((\d{4})\)\s*(?:&#8212;|&mdash;|—|-)\s*The Movie Database \(TMDB\)\s*<\/title>/i);
      if (!m) throw new Error('TMDB public metadata unavailable; configure your own TMDB API key');
      var title = m[1].replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); }).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      return { title: title, year: m[2] };
    });
  }
  if (!settings.tmdbApiKey) return publicMetadata();
  return request('https://api.themoviedb.org/3/' + type + '/' + id + '?api_key=' + encodeURIComponent(settings.tmdbApiKey), true).then(function (d) {
    return { title: d.title || d.name, originalTitle: d.original_title || d.original_name, year: (d.release_date || d.first_air_date || '').slice(0, 4) };
  }).catch(publicMetadata);
}
function search(title) {
  function siteSearch() {
    return request(BASE + '/search-api.php?q=' + encodeURIComponent(title) + '&pg=1', true).then(function (d) { return d.results || []; });
  }
  return request('https://search.yagaverse.net/api/search?q=' + encodeURIComponent(title) + '&pg=1', true).then(function (d) {
    if (!Array.isArray(d.hits)) throw new Error('Unexpected search response');
    var hits = d.hits.map(function (h) { return { t: h.document.title, l: h.document.slug }; });
    return hits.length ? hits : siteSearch();
  }).catch(siteSearch);
}
function matches(post, meta, type) {
  var title = String(post.t || '');
  var prefix = title.split(/\((?:19|20)\d{2}\)|\(Season\s|\bSeason\s\d|\bS\d{1,2}\b/i)[0];
  var names = [meta.title || meta.name, meta.originalTitle].filter(Boolean).map(normalize);
  if (names.indexOf(normalize(prefix)) < 0) return false;
  var year = title.match(/\((\d{4})\)/);
  return type !== 'movie' || !meta.year || !year || String(meta.year) === year[1];
}
function constant(html, name) {
  var m = html.match(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*;'));
  return m ? JSON.parse(m[1]) : null;
}
function dataset(html) {
  var m = html.match(/(?:const|let|var)\s+dataset\s*=\s*(\{[^\n\r]*\})\s*;/);
  if (!m) throw new Error('Cinefreak player data not found');
  return JSON.parse(m[1]);
}
function selectSources(data, type, season, episode) {
  if (type === 'movie') return data.type === 'movie' ? data.sources || {} : {};
  if (data.type !== 'series') return {};
  var sources = {};
  (data.seasons || []).forEach(function (s) {
    var n = String(s.season_name || s.season_title || '').match(/\d+/);
    if (!n || Number(n[0]) !== Number(season)) return;
    (s.episodes || []).forEach(function (ep) {
      if (ep.k === 'p' || !/^\d+$/.test(String(ep.ep_num)) || Number(ep.ep_num) !== Number(episode)) return;
      Object.keys(ep.sources || {}).forEach(function (q) { sources[q] = ep.sources[q]; });
    });
  });
  return sources;
}
function parseCinecloudFallback(html, type, season, episode) {
  var rows = [];
  var seen = {};
  var wanted = type === 'tv' ? 'es' + String(Number(season)).padStart(2, '0') + 'e' + String(Number(episode)).padStart(2, '0') : '';
  var parts = type === 'tv' ? html.split('class="cft-it"') : html.split('class="download-links-div"');
  if (!parts.length) parts = [html];
  parts.forEach(function (part) {
    var keyMatch = part.match(/^[^>]*data-k="([^"]+)"/);
    if (type === 'tv' && (!keyMatch || keyMatch[1].toLowerCase() !== wanted)) return;
    var quality = part.match(/\b(2160|1080|720|480|360)p\b/i);
    var qualityLabel = quality ? quality[1] + 'p' : 'HD';
    var hrefRe = /href="(https:\/\/[^"]*cinecloud\.[^"]*\/f\/[^"]+)"/g;
    var m;
    while ((m = hrefRe.exec(part)) !== null) {
      var url = m[1];
      if (seen[url]) continue;
      seen[url] = true;
      rows.push({
        name: 'Cinefreak',
        title: 'Cinefreak • ' + qualityLabel + (type === 'tv' ? ' • S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0') : ''),
        quality: qualityLabel,
        url: url,
        type: 'embed'
      });
    }
  });
  return rows;
}

function resolvePage(html, type, season, episode) {
  var sources = {};
  try { sources = selectSources(dataset(html), type, season, episode); } catch (e) { sources = {}; }
  var qualities = Object.keys(sources).filter(function (q) { return /^(480|720|1080)p$/.test(q); });
  if (!qualities.length) return Promise.resolve(parseCinecloudFallback(html, type, season, episode));
  var api = constant(html, 'STREAM_API_BASE');
  var key = constant(html, 'STREAM_API_KEY');
  if (!api || !/^https:\/\//i.test(api) || !key) throw new Error('Player API configuration missing');
  var query = qualities.map(function (q) { return 'r' + q + '=' + encodeURIComponent(sources[q]); });
  query.push('key=' + encodeURIComponent(key), 'id=' + encodeURIComponent(sources['720p'] || sources[qualities[0]]));
  return request(api + '?' + query.join('&'), true).then(function (d) {
    var rows = d.resolutions || [];
    if (!rows.length && d.videoUrl) rows = [{ url: d.videoUrl, quality: 'Unknown' }];
    return rows.filter(function (r) { return /^https?:\/\//i.test(r.url || ''); }).map(function (r) {
      return { name: 'Cinefreak', title: 'Cinefreak • ' + (r.quality || 'Unknown') + (type === 'tv' ? ' • S' + season + 'E' + episode : ''), quality: r.quality || 'Unknown', url: r.url };
    });
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType !== 'movie' && mediaType !== 'tv') return Promise.resolve([]);
  if (mediaType === 'tv' && (!(Number(season) >= 0) || !(Number(episode) > 0) || season == null)) return Promise.resolve([]);
  var settings = typeof globalThis !== 'undefined' && globalThis.SCRAPER_SETTINGS || {};
  return metadata(tmdbId, mediaType, settings).then(function (meta) {
    return search(meta.title || meta.name).then(function (posts) {
      var candidates = posts.filter(function (p) { return matches(p, meta, mediaType); }).slice(0, 6);
      var result = [], seen = {};
      function batch(offset) {
        if (offset >= candidates.length) return Promise.resolve(result);
        return Promise.all(candidates.slice(offset, offset + 3).map(function (p) {
          var slug = String(p.l || '').replace(/^https:\/\/cinefreak\.net\//, '').replace(/^\/+|\/+$/g, '');
          if (!/^[a-zA-Z0-9_%.-]+$/.test(slug) || slug === '..') return [];
          return request(BASE + '/' + slug + '/', false).then(function (html) { return resolvePage(html, mediaType, season, episode); }).catch(function (e) { console.log('[Cinefreak] ' + e.message); return []; });
        })).then(function (groups) {
          groups.forEach(function (rows) { rows.forEach(function (r) { if (!seen[r.url]) { seen[r.url] = true; result.push(r); } }); });
          return batch(offset + 3);
        });
      }
      return batch(0);
    });
  }).catch(function (e) { console.log('[Cinefreak] ' + e.message); return []; });
}
function onSettings() {
  return Promise.resolve([{ type: 'header', label: 'Cinefreak' }, { type: 'text', key: 'tmdbApiKey', label: 'TMDB API key (optional)', placeholder: 'Your TMDB API key', description: 'Optional API lookup. Without a key, public TMDB title pages are used.' }]);
}
module.exports = { getStreams: getStreams, onSettings: onSettings };
if (typeof globalThis !== 'undefined') { globalThis.getStreams = getStreams; globalThis.onSettings = onSettings; }

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
            ['Polish', /\bpolish\b/i, /\bPOL\b/],
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

        var ext = String(text || '').match(/\.([a-z0-9]{2,4})$/i);
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
        var richLike = rich.indexOf('\n') !== -1 && (rich.indexOf('🎬') !== -1 || rich.indexOf('🎥') !== -1 || rich.indexOf('📦') !== -1 || rich.indexOf('🔊') !== -1 || rich.indexOf('🎞️') !== -1);
        var details = richLike ? rich : nuvioDetails(info, size);
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
        if (richLike || (info.languages && info.languages.length)) {
            copy.language = '';
        } else if (language) {
            copy.language = language;
        }
        copy._nuvioFormatted = true;
        return copy;
    }

    function nuvioEnrichStreams(rows, provider) {
        if (!Array.isArray(rows)) return rows;
        return rows.map(function (row) {
            return nuvioEnrich(row, provider);
        });
    }

    try {
        var nuvioProviderName = "Cinefreak";
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
