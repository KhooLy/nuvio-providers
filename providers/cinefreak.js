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
