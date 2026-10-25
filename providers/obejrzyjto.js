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
