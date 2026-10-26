var ENDPOINT = "https://api.vidlove.cc";

var HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Referer":    "https://player.vidlove.cc/",
    "Origin":     "https://player.vidlove.cc"
};

var SOURCES = [
    { key: "moviebox2", label: "MovieBox 2" },
    { key: "moviebox",  label: "MovieBox" },
    { key: "dcloud",    label: "DCloud" },
    { key: "tcloud",    label: "TCloud" },
    { key: "vidapi",    label: "VidAPI" }
];

function buildUrl(base, src) {
    var url = base + "&sources=" + src.key;
    if (src.key === "moviebox" || src.key === "moviebox2") url += "&vh=1&hevc=1";
    if (src.key === "dcloud") url += "&sw=1";
    return url;
}

function fetchJson(url) {
    return fetch(url, { headers: HEADERS })
        .then(function(r) {
            return r.text().then(function(body) {
                if (!r.ok) {
                    console.log("[VID][HTTP] " + r.status + " " + url);
                    return null;
                }
                try { return JSON.parse(body); } catch (e) { return null; }
            });
        })
        .catch(function(e) {
            console.log("[VID][FETCH] " + (e.message || e));
            return null;
        });
}

function variants(manifest) {
    var lines = String(manifest || "").split("\n");
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
        var bw = /BANDWIDTH=(\d+)/.exec(lines[i]);
        var res = /RESOLUTION=(\d+)x(\d+)/.exec(lines[i]);
        var codecs = /CODECS="([^"]+)"/.exec(lines[i]);
        var uri = null;
        for (var j = i + 1; j < lines.length; j++) {
            var next = lines[j].trim();
            if (next && next[0] !== "#") { uri = next; break; }
        }
        if (uri) {
            out.push({
                uri: uri,
                bandwidth: bw ? parseInt(bw[1], 10) : 0,
                width: res ? parseInt(res[1], 10) : 0,
                height: res ? parseInt(res[2], 10) : 0,
                codecs: codecs ? codecs[1] : ""
            });
        }
    }
    return out;
}

function labelFor(v) {
    if (v.width >= 3800) return "4K";
    if (v.width >= 1900) return "1080p";
    if (v.width >= 1260) return "720p";
    if (v.width >= 840) return "480p";
    if (v.width >= 620) return "360p";
    return v.height ? v.height + "p" : null;
}

function audioFromCodecs(codecs) {
    var c = String(codecs || "").toLowerCase();
    if (c.indexOf("ec-3") !== -1 || c.indexOf("ac-3") !== -1) return "DD";
    if (c.indexOf("mp4a") !== -1) return "AAC";
    if (c.indexOf("opus") !== -1) return "Opus";
    return null;
}

function describe(src, list) {
    var sorted = list.slice().sort(function(a, b) { return a.width - b.width; });
    var labels = [];
    for (var i = 0; i < sorted.length; i++) {
        var l = labelFor(sorted[i]);
        if (l && labels.indexOf(l) === -1) labels.push(l);
    }
    var best = null;
    for (var j = 0; j < list.length; j++) {
        if (!best || list[j].bandwidth > best.bandwidth) best = list[j];
    }
    var quality = best ? (labelFor(best) || "auto") : "auto";
    var audio = null;
    for (var k = 0; k < list.length; k++) {
        audio = audioFromCodecs(list[k].codecs);
        if (audio) break;
    }
    var parts = [src.label];
    if (labels.length) parts.push(labels.join(" / "));
    if (audio) parts.push(audio);
    return { quality: quality, bestUri: best ? best.uri : null, detail: parts.join(" · ") };
}

function toSubtitles(tracks) {
    if (!Array.isArray(tracks)) return [];
    return tracks
        .filter(function(t) { return t && t.file; })
        .map(function(t) {
            return {
                url: t.file,
                language: t.lang || t.srclang || "en",
                name: t.label || "Subtitle"
            };
        });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var base = isTv
        ? ENDPOINT + "/tv?id=" + tmdbId + "&season=" + season + "&episode=" + episode + "&mode=json"
        : ENDPOINT + "/movie?id=" + tmdbId + "&mode=json";
    var subsEndpoint = isTv
        ? ENDPOINT + "/subtitles/tv/" + tmdbId + "/" + season + "/" + episode
        : ENDPOINT + "/subtitles/movie/" + tmdbId;

    var tasks = SOURCES.map(function(src) {
        return fetchJson(buildUrl(base, src)).then(function(payload) {
            var source = payload && payload.source;
            if (!source) return null;

            var list = source.manifest ? variants(source.manifest) : [];
            var info = describe(src, list);
            var playUrl = source.url || info.bestUri;
            if (!playUrl) return null;

            console.log("[VID][OK] source=" + src.key + " quality=" + info.quality + " detail=" + info.detail);
            return {
                name: "Vidlove",
                title: info.detail,
                url: playUrl,
                quality: info.quality,
                language: info.detail,
                type: "hls",
                headers: HEADERS,
                subtitles: toSubtitles(payload && payload.subtitles)
            };
        });
    });

    tasks.push(fetchJson(subsEndpoint).then(function(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(function(s) { return s && s.file; }).map(function(s) {
            return { url: s.file, language: s.lang || s.srclang || "en", name: s.label || "Subtitle" };
        });
    }));

    return Promise.all(tasks).then(function(results) {
        var streams = [];
        var allSubs = [];
        var seenSub = {};

        for (var i = 0; i < results.length; i++) {
            var item = results[i];
            if (!item) continue;
            if (Array.isArray(item)) {
                for (var a = 0; a < item.length; a++) {
                    if (!seenSub[item[a].url]) { seenSub[item[a].url] = true; allSubs.push(item[a]); }
                }
            } else {
                streams.push(item);
            }
        }

        streams.sort(function(a, b) {
            var order = {};
            for (var s = 0; s < SOURCES.length; s++) order[SOURCES[s].label] = s;
            return (order[a.title.split(" · ")[0]] || 99) - (order[b.title.split(" · ")[0]] || 99);
        });

        for (var v = 0; v < streams.length; v++) {
            var merged = allSubs.slice();
            var own = streams[v].subtitles || [];
            for (var w = 0; w < own.length; w++) {
                if (!seenSub[own[w].url]) { seenSub[own[w].url] = true; merged.push(own[w]); }
            }
            streams[v].subtitles = merged;
        }

        console.log("[VID][RETURN] streams=" + streams.length + " subs=" + allSubs.length);
        return streams;
    }).catch(function(err) {
        console.error("[VID][ERROR] " + (err.message || err));
        return [];
    });
}

module.exports = { getStreams: getStreams };

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
        var nuvioProviderName = "Vidlove";
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
