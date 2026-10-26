var BASE = "https://www.dizibox.live";
var ADDON_NAME = "DiziBOX";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var MAX_CANDIDATES = 22;

function fetchText(url, headers, options) {
    var opt = { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" };
    if (options && options.method) opt.method = options.method;
    return fetch(url, opt).then(function (r) { return r.text(); }).catch(function () { return ""; });
}

function fetchStatus(url) {
    return fetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function (r) { return r.status; })
        .catch(function () { return 0; });
}

function fetchJson(url) {
    return fetchText(url).then(function (b) {
        try { return JSON.parse(b); } catch (e) { return null; }
    });
}

function slugify(value) {
    return String(value || "").toLowerCase()
        .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
        .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalize(value) {
    return String(value || "").toLowerCase()
        .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
        .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
        .replace(/[^a-z0-9]+/g, " ").trim();
}

function tmdbMeta(tmdbId, mediaType) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR&append_to_response=external_ids";
    return fetchJson(url).then(function (data) {
        if (!data || (!data.title && !data.name)) {
            return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids");
        }
        return data;
    }).then(function (data) {
        if (!data) return null;
        var ext = data.external_ids || {};
        return {
            isTv: isTv,
            imdbId: data.imdb_id || ext.imdb_id || "",
            title: data.title || data.name || data.original_title || data.original_name || "",
            original: data.original_title || data.original_name || "",
            year: String(data.release_date || data.first_air_date || "").split("-")[0]
        };
    });
}

function candidateSlugs(meta) {
    var bases = [];
    if (meta.title) bases.push(meta.title);
    if (meta.original && normalize(meta.original) !== normalize(meta.title)) bases.push(meta.original);
    var out = [];
    for (var i = 0; i < bases.length; i++) {
        var s = slugify(bases[i]);
        if (!s) continue;
        var y = meta.year;
        var variants = [s];
        if (y) variants.push(s + "-" + y);
        variants.push(s + "-izle");
        if (y) variants.push(s + "-" + y + "-izle");
        variants.push(s + "-izle-1");
        variants.push(s + "-hd");
        variants.push(s + "-izle-hd");
        if (y) variants.push(s + "-hd-" + y);
        for (var j = 0; j < variants.length; j++) if (out.indexOf(variants[j]) === -1) out.push(variants[j]);
    }
    return out.slice(0, MAX_CANDIDATES);
}

function pageHeading(html) {
    var m = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    if (!m) return "";
    return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isSoftMissing(heading, html) {
    var h = normalize(heading);
    if (!heading) return true;
    if (h.indexOf("sayfa bulunamadi") !== -1) return true;
    if (h.indexOf("bulunamadi") !== -1) return true;
    return /<title>\s*404/i.test(html);
}

function headingYear(heading) {
    var m = /\((\d{4})\)/.exec(heading);
    return m ? m[1] : "";
}

function pageYear(html) {
    var m = /\/yil\/(\d{4})\//.exec(html);
    return m ? m[1] : "";
}

function scoreHeading(heading, meta, html) {
    var clean = normalize(heading.replace(/\(\s*\d{4}\s*\)/g, ""));
    var targets = [normalize(meta.title), normalize(meta.original)];
    var cleanTokens = clean.split(" ").filter(Boolean);
    var best = 0;
    for (var i = 0; i < targets.length; i++) {
        var want = targets[i];
        if (!want) continue;
        if (clean === want) { best = Math.max(best, 100); continue; }
        if (clean.indexOf(want) !== -1 || want.indexOf(clean) !== -1) { best = Math.max(best, 80); continue; }
        var wantTokens = want.split(" ").filter(Boolean);
        var matched = 0;
        for (var t = 0; t < wantTokens.length; t++) if (cleanTokens.indexOf(wantTokens[t]) !== -1) matched++;
        if (wantTokens.length) best = Math.max(best, Math.round(70 * matched / Math.max(wantTokens.length, cleanTokens.length)));
    }
    var hy = headingYear(heading) || pageYear(html || "");
    if (hy && meta.year) best += (hy === meta.year) ? 5 : -60;
    return best;
}

function findSeries(meta) {
    var cands = candidateSlugs(meta);
    if (!cands.length) return Promise.resolve(null);
    return Promise.all(cands.map(function (c) {
        return fetchStatus(BASE + "/diziler/" + c + "/").then(function (st) { return { slug: c, status: st }; });
    })).then(function (probes) {
        var live = probes.filter(function (p) { return p.status === 200; }).map(function (p) { return p.slug; });
        console.log("[DBX][PROBE] " + cands.length + " candidates, " + live.length + " live");
        var idx = 0, best = null;
        function next() {
            if (idx >= live.length) return Promise.resolve(best && best.score >= 75 ? best : null);
            if (best && best.score >= 90) return Promise.resolve(best);
            var slug = live[idx++];
            var url = BASE + "/diziler/" + slug + "/";
            return fetchText(url, { "User-Agent": USER_AGENT, "Referer": BASE + "/" }).then(function (html) {
                var heading = pageHeading(html);
                if (isSoftMissing(heading, html)) return next();
                var score = scoreHeading(heading, meta, html);
                console.log("[DBX][MATCH] " + slug + " -> '" + heading + "' score=" + score);
                if (!best || score > best.score) best = { slug: slug, url: url, html: html, score: score, heading: heading };
                return next();
            });
        }
        return next();
    });
}

function findEpisode(html, season, episode) {
    var s = parseInt(season, 10) || 1;
    var e = parseInt(episode, 10) || 1;
    var re = /<a[^>]+href="([^"]+)"[^>]*>\s*(\d+)\.Sezon\s+(\d+)\.Bölüm\s*<\/a>/g;
    var m, exact = null;
    while ((m = re.exec(html)) !== null) {
        if (parseInt(m[2], 10) === s && parseInt(m[3], 10) === e) exact = m[1];
    }
    return exact;
}

function findSeasonPage(html, season) {
    var s = parseInt(season, 10) || 1;
    var re = /href=['"]([^'"]*\/dizi\/[^'"]+?\/(\d+)-sezon-[^'"]*)['"][^>]*>\s*(\d+)\.\s*Sezon/g;
    var m;
    while ((m = re.exec(html)) !== null) {
        if (parseInt(m[2], 10) === s) return m[1];
    }
    return null;
}

function episodeUrl(series, season, episode) {
    var found = findEpisode(series.html, season, episode);
    if (found) return Promise.resolve(found);
    var seasonPage = findSeasonPage(series.html, season);
    if (!seasonPage) return Promise.resolve(null);
    return fetchText(seasonPage, { "User-Agent": USER_AGENT, "Referer": series.url }).then(function (html) {
        return findEpisode(html, season, episode);
    });
}

function playerFrames(html) {
    var re = /<iframe[^>]*\bsrc="([^"]+)"/g;
    var m, out = [];
    while ((m = re.exec(html)) !== null) {
        var src = m[1];
        if (src.indexOf("/player/") === -1) continue;
        if (src.indexOf("//") === 0) src = "https:" + src;
        out.push(src);
    }
    return out;
}

function molystreamEmbed(kingUrl, episodeUrl) {
    return fetchText(kingUrl, { "User-Agent": USER_AGENT, "Referer": episodeUrl }).then(function (html) {
        var m = /<iframe[^>]*\bsrc="(https?:\/\/[^"]*molystream[^"]*)"/.exec(html);
        return m ? m[1] : null;
    });
}

function sheilaStream(embedUrl) {
    var m = /^(https?:\/\/[^\/]+)\/embed\/([^\/?#]+)/.exec(embedUrl);
    if (!m) return Promise.resolve(null);
    var origin = m[1];
    var id = m[2];
    var sheila = origin + "/embed/sheila/" + id;
    return fetchText(sheila, { "User-Agent": USER_AGENT, "Referer": embedUrl }).then(function (body) {
        if (body.indexOf("#EXTM3U") !== 0) return null;
        var quality = "auto";
        var qm = /RESOLUTION=\d+x(\d+)/.exec(body);
        if (qm) quality = qm[1] + "p";
        console.log("[DBX][STREAM] " + sheila + " quality=" + quality);
        return [{
            name: ADDON_NAME,
            title: "Orijinal",
            quality: quality,
            language: "tr",
            type: "hls",
            url: sheila,
            headers: { "User-Agent": USER_AGENT, "Referer": embedUrl, "Origin": origin }
        }];
    });
}

function resolveStreams(epUrl, seriesUrl) {
    return fetchText(epUrl, { "User-Agent": USER_AGENT, "Referer": seriesUrl }).then(function (html) {
        if (!html) return [];
        var frames = playerFrames(html);
        console.log("[DBX][PLAYER] " + frames.length + " frame(s) on " + epUrl);
        var idx = 0;
        function next() {
            if (idx >= frames.length) return Promise.resolve([]);
            var kingUrl = frames[idx++];
            return molystreamEmbed(kingUrl, epUrl).then(function (embed) {
                console.log("[DBX][EMBED] " + (embed || "none"));
                if (!embed) return next();
                return sheilaStream(embed).then(function (streams) {
                    if (streams && streams.length) return streams;
                    return next();
                });
            }).catch(function () { return next(); });
        }
        return next();
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    console.log("[DBX][START] tmdbId=" + tmdbId + " type=" + mediaType + " s=" + season + " e=" + episode);
    return tmdbMeta(tmdbId, mediaType).then(function (meta) {
        if (!meta || !meta.title) { console.log("[DBX][TMDB] no meta for id=" + tmdbId); return null; }
        if (!meta.isTv) { console.log("[DBX][SKIP] movies not supported"); return null; }
        console.log("[DBX][TMDB] TR=" + meta.title + " EN=" + meta.original + " year=" + meta.year);
        return findSeries(meta).then(function (series) {
            if (!series) { console.log("[DBX][SERIES] not found"); return null; }
            return episodeUrl(series, season, episode).then(function (ep) {
                console.log("[DBX][EPISODE] s=" + season + " e=" + episode + " -> " + (ep || "none"));
                if (!ep) return null;
                return resolveStreams(ep, series.url);
            });
        });
    }).then(function (streams) {
        var out = streams || [];
        console.log("[DBX][RETURN] streams=" + out.length);
        return out;
    }).catch(function (err) {
        console.error("[DiziBOX][ERROR] " + (err && err.message ? err.message : err));
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
        var nuvioProviderName = "DiziBOX";
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
