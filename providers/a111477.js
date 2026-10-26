var BASE = 'https://a.111477.xyz';
var JINA = 'https://r.jina.ai/';
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
        var linkMatch = line.match(/^\[(.+?)\]\((https?:\/\/[^)\s]+)\)/);
        if (linkMatch) {
            var linkedName = linkMatch[1].replace(/\/$/, '').trim();
            if (linkedName === '..' || !linkedName || /^←/.test(linkedName)) continue;
            var linkedUrl = linkMatch[2];
            var linkedPath = linkedUrl.indexOf(BASE) === 0 ? linkedUrl.slice(BASE.length) : linkedUrl.replace(/^https?:\/\/[^/]+/, '');
            if (linkedPath.indexOf(section) !== 0) continue;
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
    return fetchText(BASE + path, 25000).then(function (res) {
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

function toStream(entry, meta, season, episode) {
    var quality = qualityOf(entry.name);
    var size = entry.sizeText || formatSize(entry.size);
    var label = '111477 • ' + quality + (size ? ' • ' + size : '');
    var title = entry.name;
    if (meta.type === 'tv' && season && episode) {
        title += ' • S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');
    }
    return {
        name: label,
        title: title,
        description: title,
        url: BASE + entry.url,
        quality: quality,
        size: size,
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
        new RegExp('\\.0*' + e + '\\.', 'i'),
        new RegExp('\\[0*' + e + '\\]', 'i')
    ];
    for (var i = 0; i < patterns.length; i++) {
        if (patterns[i].test(base)) return true;
    }
    return false;
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
            return episodeMatches(entry.name, season, episode);
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
    return files.filter(function (entry) {
        if (seen[entry.url]) return false;
        seen[entry.url] = true;
        return true;
    }).map(function (entry) {
        return toStream(entry, meta, season, episode);
    }).sort(function (a, b) {
        return (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0);
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
        if (meta.year) paths.push('/tvs/' + encodeURIComponent(title + ' (' + meta.year + ')') + '/');
        meta.countries.forEach(function (code) {
            paths.push('/tvs/' + encodeURIComponent(title + ' (' + code + ')') + '/');
        });
        paths.push('/tvs/' + encodeURIComponent(title) + '/');
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
        return result.then(function (rows) {
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

module.exports = { getStreams: getStreams };
