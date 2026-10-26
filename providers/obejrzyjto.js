const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
};

function fetchMediaDetails(tmdbId, mediaType) {
  const typeEndpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${typeEndpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=pl-PL`;

  return fetch(url)
    .then(function(res) {
      if (!res.ok) throw new Error('Nie udało się pobrać metadanych TMDB');
      return res.json();
    })
    .then(function(data) {
      const title = data.title || data.name || data.original_title || data.original_name;
      const releaseDate = data.release_date || data.first_air_date || '';
      return {
        title: title,
        originalTitle: data.original_title || data.original_name || title,
        year: releaseDate ? releaseDate.split('-')[0] : ''
      };
    })
    .catch(function(err) {
      console.error('[Aggregator] Błąd TMDB:', err.message);
      return null;
    });
}

function cleanString(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
}

const OBEJRZYJ_URL = 'https://obejrzyj.to';

function extractSearchMatchesObejrzyj(html, targetTitle) {
  if (!html) return null;
  const targetClean = cleanString(targetTitle);
  const matches = [];
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const pageUrl = match[1];
    const innerContent = match[2] || '';
    if (pageUrl && !pageUrl.startsWith('#') && !pageUrl.startsWith('javascript:')) {
      const fullUrl = pageUrl.startsWith('http') ? pageUrl : (OBEJRZYJ_URL + (pageUrl.startsWith('/') ? '' : '/') + pageUrl);
      matches.push({ url: fullUrl, cleanText: cleanString(innerContent) });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    if (matches[i].cleanText.includes(targetClean)) return matches[i].url;
  }
  return matches.length > 0 ? matches[0].url : null;
}

function searchObejrzyjTo(queryTitle, mediaType, season, episode) {
  const searchUrl = `${OBEJRZYJ_URL}/szukaj?q=${encodeURIComponent(queryTitle)}`;
  return fetch(searchUrl, { headers: Object.assign({}, HEADERS, { 'Referer': OBEJRZYJ_URL }) })
    .then(res => res.text())
    .then(html => {
      const pageUrl = extractSearchMatchesObejrzyj(html, queryTitle);
      if (!pageUrl) return null;
      if (mediaType === 'tv' && season && episode) return `${pageUrl}/sezon-${season}/odcinek-${episode}`;
      return pageUrl;
    });
}

function runObejrzyjTo(meta, type, s, e) {
  return searchObejrzyjTo(meta.title, type, s, e)
    .then(pageUrl => (!pageUrl && meta.originalTitle !== meta.title) ? searchObejrzyjTo(meta.originalTitle, type, s, e) : pageUrl)
    .then(pageUrl => {
      if (!pageUrl) return [];
      return fetch(pageUrl, { headers: HEADERS }).then(r => r.text()).then(html => {
        const embeds = [];
        const regexes = [
          /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi,
          /data-(?:link|url|embed|player|src)=["']([^"']+)["']/gi
        ];
        regexes.forEach(rx => {
          let m; while ((m = rx.exec(html)) !== null) {
            let u = m[1]; if (u.startsWith('//')) u = 'https:' + u;
            if (u.startsWith('http') && embeds.indexOf(u) === -1) embeds.push(u);
          }
        });
        return embeds.map(url => ({
          name: 'Obejrzyj.to', title: `PL | Serwer alternatywny\n${meta.title}`,
          url: url, quality: 'HD', isEmbed: true
        }));
      });
    }).catch(err => {
      console.log('[Aggregator] Obejrzyj.to nie powiodło się:', err.message);
      return [];
    });
}

function searchVider(meta, type, s, e) {
  let query = meta.title;
  if (type === 'tv') {
    query += ` s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`;
  }
  const url = `https://vider.info/szukaj/video?q=${encodeURIComponent(query)}`;

  return fetch(url, { headers: HEADERS })
    .then(res => res.text())
    .then(html => {
      const streams = [];
      const regex = /href=["']?(?:https?:\/\/vider\.info)?(\/vid\/[^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = regex.exec(html)) !== null) {
        const id = match[1].replace('/vid/', '');
        let titleMatch = match[2].replace(/<[^>]+>/g, '').trim();

        const titleAttr = match[0].match(/title=["']([^"']+)["']/);
        if (!titleMatch && titleAttr) titleMatch = titleAttr[1];

        if (id) {
          streams.push({
            name: 'Vider.info',
            title: `PL | ${titleMatch ? titleMatch.substring(0, 35) : 'Vider Stream'}\n${meta.title}`,
            url: `https://vider.info/embed/video/${id}`,
            quality: 'SD/HD',
            isEmbed: true
          });
        }
      }

      const unique = []; const seen = new Set();
      streams.forEach(stream => {
        if (!seen.has(stream.url)) { seen.add(stream.url); unique.push(stream); }
      });
      return unique.slice(0, 5);
    }).catch(err => {
      console.log('[Aggregator] Vider nie powiódł się:', err.message);
      return [];
    });
}

function searchCDA(meta, type, s, e) {
  let query = meta.title;
  if (type === 'tv') {
    query += ` s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`;
  }
  const url = `https://www.cda.pl/video/show/${encodeURIComponent(query)}/p1`;

  return fetch(url, { headers: HEADERS })
    .then(res => res.text())
    .then(html => {
      const streams = [];

      const regex = /href=["']?(?:https?:\/\/www\.cda\.pl)?(\/video\/[a-zA-Z0-9]+)["']?[^>]*>/gi;
      let match;

      while ((match = regex.exec(html)) !== null) {
        const id = match[1].replace('/video/', '');
        const titleAttr = match[0].match(/title=["']([^"']+)["']/);
        const titleMatch = titleAttr ? titleAttr[1] : `Wideo ID: ${id}`;

        if (id && id.length > 4 && !match[0].includes('premium')) {
          streams.push({
            name: 'CDA.pl',
            title: `PL | ${titleMatch.substring(0, 35)}\n${meta.title}`,
            url: `https://www.cda.pl/video/${id}/vfilm`,
            quality: 'SD/HD',
            isEmbed: true
          });
        }
      }

      const unique = []; const seen = new Set();
      streams.forEach(stream => {
        if (!seen.has(stream.url)) { seen.add(stream.url); unique.push(stream); }
      });
      return unique.slice(0, 5);
    }).catch(err => {
      console.log('[Aggregator] CDA nie powiodło się:', err.message);
      return [];
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  let id = tmdbId, type = mediaType || 'movie', s = season, e = episode;

  if (typeof tmdbId === 'object' && tmdbId !== null) {
    id = tmdbId.tmdbId || tmdbId.id;
    type = tmdbId.mediaType || tmdbId.type || 'movie';
    s = tmdbId.season || season;
    e = tmdbId.episode || episode;
  }

  console.log(`[Aggregator] Pobieranie: typ=${type}, id=${id}, S=${s}, E=${e}`);

  return fetchMediaDetails(id, type)
    .then(function(meta) {
      if (!meta) {
        console.error('[Aggregator] Brak metadanych TMDB.');
        return [];
      }

      console.log(`[Aggregator] Rozpoznano film/serial: ${meta.title} (${meta.year})`);

      const tasks = [
        runObejrzyjTo(meta, type, s, e),
        searchVider(meta, type, s, e),
        searchCDA(meta, type, s, e)
      ];

      if (meta.title !== meta.originalTitle) {
        const metaOrig = Object.assign({}, meta, { title: meta.originalTitle });
        tasks.push(searchVider(metaOrig, type, s, e));
      }

      return Promise.all(tasks)
        .then(function(results) {
          let allStreams = [];
          for (let i = 0; i < results.length; i++) {
            if (Array.isArray(results[i])) {
              allStreams = allStreams.concat(results[i]);
            }
          }
          console.log(`[Aggregator] Zakończono. Znaleziono linków: ${allStreams.length}`);
          return allStreams;
        });
    })
    .catch(function(error) {
      console.error('[Aggregator] Krytyczny błąd głównej pętli:', error);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
}

if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
}

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

    function nuvioLanguage(text, langs) {
        var dual = /\bdual[-. ]?audio\b/i.test(text) || /\bDUAL\b/.test(text) || (/\bdual\b/i.test(text) && langs.length >= 2);
        var multi = /\bmulti[-. ]?audio\b/i.test(text) || /\bMULTI\b/.test(text) || (/\bmulti\b/i.test(text) && langs.length >= 2);
        var prefix = dual ? 'Dual Audio' : (multi ? 'Multi-Audio' : '');
        if (langs.length > 3) return prefix || 'Multi-Audio';
        var list = langs.slice(0, 3).join(' + ');
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
            language: ''
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

        info.language = nuvioLanguage(text, nuvioLanguages(text));
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

    function nuvioDetails(info, size, name) {
        var specs = [];
        if (info.source) specs.push(info.source);
        if (info.codec) specs.push(info.codec + (info.bitDepth ? ' ' + info.bitDepth : ''));
        if (info.hdr) specs.push(info.hdr);
        if (info.subs) specs.push(info.subs);
        if (info.audio) specs.push(info.audio);
        var line1 = specs.join(' • ');
        var line2parts = [];
        if (size && !nuvioHasSize(name)) line2parts.push(size);
        if (info.container) line2parts.push(info.container);
        var line2 = line2parts.join(' • ');
        return [line1, line2].filter(Boolean).join('\n');
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
        var details = nuvioDetails(info, size, name);
        var copy = {};
        for (var key in stream) {
            if (Object.prototype.hasOwnProperty.call(stream, key)) copy[key] = stream[key];
        }
        copy.name = name;
        if (quality && quality !== 'HD') copy.quality = quality;
        else if (!copy.quality) copy.quality = quality;
        if (details) copy.size = details;
        else if (size) copy.size = size;
        if (language) copy.language = language;
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
        var nuvioProviderName = "Obejrzyj";
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
