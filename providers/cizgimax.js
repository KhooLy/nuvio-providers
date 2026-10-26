var BASE = "https://cizgimax.online";
var TAU = "https://tau-video.xyz/api/video/";
var ADDON_NAME = "CizgiMax";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var TMDB_API_KEY = (typeof __TMDB_KEY__ !== "undefined" && __TMDB_KEY__) ? __TMDB_KEY__ : "1865f43a0549ca50d341dd9ab8b29f49";
var MAX_SERVERS = 12;

function b64decode(s) {
    try {
        if (typeof atob !== "undefined") return atob(s);
        return Buffer.from(String(s || ""), "base64").toString("binary");
    } catch (e) { return ""; }
}

function fetchText(url, headers) {
    return fetch(url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function (r) { return r.text(); })
        .catch(function () { return ""; });
}

function fetchJson(url, headers) {
    return fetch(url, { headers: headers || { "User-Agent": USER_AGENT }, redirect: "follow" })
        .then(function (r) { return r.text().then(function (b) { try { return JSON.parse(b); } catch (e) { return null; } }); })
        .catch(function () { return null; });
}

function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tmdbMeta(tmdbId, mediaType) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var type = isTv ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR";
    return fetchJson(url).then(function (data) {
        if (!data || (!data.title && !data.name)) {
            return fetchJson("https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY);
        }
        return data;
    }).then(function (data) {
        if (!data) return null;
        return {
            isTv: isTv,
            title: data.title || data.name || data.original_title || data.original_name || "",
            original: data.original_title || data.original_name || "",
            year: String(data.release_date || data.first_air_date || "").split("-")[0]
        };
    });
}

function searchSite(title) {
    var url = BASE + "/ara/?q=" + encodeURIComponent(title);
    return fetchText(url).then(function (html) {
        var out = [];
        var seen = {};
        var re = /href="(\/(?:diziler|film)\/[^"]+?-izle\/)"/g;
        var m;
        while ((m = re.exec(html)) !== null) {
            if (seen[m[1]]) continue;
            seen[m[1]] = true;
            out.push(m[1]);
        }
        return out;
    });
}

function scoreHref(href, want) {
    var slug = normalize(href.replace(/^\/(diziler|film)\//, "").replace(/\/?$/, "").replace(/-izle$/, ""));
    var slugTokens = slug.split(" ").filter(Boolean);
    var wantTokens = want.split(" ").filter(Boolean);
    if (!wantTokens.length) return 0;
    if (slug === want) return 100;
    var matched = 0;
    for (var i = 0; i < wantTokens.length; i++) if (slugTokens.indexOf(wantTokens[i]) !== -1) matched++;
    var denom = Math.max(wantTokens.length, slugTokens.length);
    var score = 100 * matched / denom;
    if (slug.indexOf(want) !== -1) score += 15;
    return score;
}

function pickResult(list, meta) {
    var want = normalize(meta.title);
    var wantOriginal = normalize(meta.original);
    var best = null;
    for (var i = 0; i < list.length; i++) {
        var href = list[i];
        var isFilm = href.indexOf("/film/") === 0;
        if (isFilm === meta.isTv) continue;
        var s = Math.max(scoreHref(href, want), wantOriginal ? scoreHref(href, wantOriginal) : 0);
        if (meta.year) {
            if (href.indexOf(meta.year) !== -1) s += 40;
            else {
                var ym = /-(19\d{2}|20\d{2})-/.exec(href);
                if (ym && Math.abs(parseInt(ym[1], 10) - parseInt(meta.year, 10)) > 1) s -= 40;
            }
        }
        if (!best || s > best.score) best = { score: s, href: href };
    }
    if (!best || best.score < 60) return null;
    return BASE + best.href;
}

function findEpisode(seriesHtml, season, episode) {
    var s = parseInt(season, 10) || 0;
    var e = parseInt(episode, 10) || 0;
    var links = [];
    var re = /href="(\/[^"]*?-(\d+)-sezon-(\d+)-bolum-izle\/)"/g;
    var m;
    while ((m = re.exec(seriesHtml)) !== null) {
        links.push({ href: m[1], season: parseInt(m[2], 10), episode: parseInt(m[3], 10) });
    }
    for (var i = 0; i < links.length; i++) {
        if (links[i].season === s && links[i].episode === e) return BASE + links[i].href;
    }
    return null;
}

function extractServerBlob(html) {
    var m = /JSON\.parse\(atob\(\\?["']([A-Za-z0-9+/=]{40,})\\?["']\)\)/.exec(html);
    if (!m) return null;
    try { return JSON.parse(b64decode(m[1])); } catch (e) { return null; }
}

function normalizeServers(blob) {
    var out = [];
    if (!blob) return out;
    if (Array.isArray(blob)) {
        for (var i = 0; i < blob.length; i++) out.push(blob[i]);
    } else {
        var groups = ["sub", "dub", "any"];
        for (var g = 0; g < groups.length; g++) {
            var arr = blob[groups[g]];
            if (!Array.isArray(arr)) continue;
            for (var j = 0; j < arr.length; j++) {
                var item = {};
                for (var k in arr[j]) item[k] = arr[j][k];
                if (!item.lang) item.lang = groups[g];
                out.push(item);
            }
        }
    }
    return out;
}

function qualityFromLabel(label) {
    var m = /(2160|1440|1080|720|480|360)p/i.exec(String(label || ""));
    return m ? m[1] + "p" : "auto";
}

function toStream(title, url, type, headers, size) {
    var stream = {
        name: ADDON_NAME,
        title: title,
        url: url,
        quality: qualityFromLabel(title),
        language: title,
        type: type,
        headers: headers
    };
    if (size) stream.behaviorHints = { videoSize: size };
    return stream;
}

function resolveNp(epUrl, resolveUrl) {
    var url = /^https?:/i.test(resolveUrl) ? resolveUrl : BASE + resolveUrl;
    return fetchJson(url, { "User-Agent": USER_AGENT, "Referer": epUrl }).then(function (res) {
        if (!res || !res.id) return [];
        return fetchJson(TAU + encodeURIComponent(res.id)).then(function (data) {
            if (!data || !Array.isArray(data.urls)) return [];
            return data.urls.map(function (u) {
                return toStream(u.label || "auto", u.url, /\.m3u8/i.test(u.url) ? "hls" : "file", { "User-Agent": USER_AGENT, "Referer": BASE + "/" }, u.size);
            });
        });
    });
}

function sibnetExtract(url) {
    return fetchText(url, { "User-Agent": USER_AGENT, "Referer": "https://video.sibnet.ru/" }).then(function (html) {
        if (!html) return [];
        var m = /player\.src\(\[\{src:\s*["']([^"']+)["']/i.exec(html) ||
                /["']?src["']?:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i.exec(html) ||
                /(https?:\/\/[^"'\s]+\.mp4)/i.exec(html) ||
                /(https?:\/\/video\.sibnet\.ru\/\/?v\/[^"'\s]+)/i.exec(html);
        if (!m) return [];
        var media = m[1];
        if (media.indexOf("//") === 0) media = "https:" + media;
        return [toStream("Sibnet", media, "file", { "User-Agent": USER_AGENT, "Referer": "https://video.sibnet.ru/" })];
    });
}

function resolveIframe(epUrl, src) {
    var url = /^https?:/i.test(src) ? src : BASE + src;
    return fetchText(url, { "User-Agent": USER_AGENT, "Referer": epUrl }).then(function (html) {
        var finalUrl = url;
        var mp4 = /(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/i.exec(html);
        if (/sibnet\.ru/i.test(finalUrl) || /sibnet\.ru/i.test(html)) {
            return sibnetExtract(finalUrl);
        }
        if (mp4) return [toStream("Direct", mp4[1], /\.m3u8/i.test(mp4[1]) ? "hls" : "file", { "User-Agent": USER_AGENT, "Referer": BASE + "/" })];
        return [];
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    var epUrl = null;
    return tmdbMeta(tmdbId, mediaType).then(function (meta) {
        if (!meta || !meta.title) return [];
        return searchSite(meta.title).then(function (results) {
            if ((!results || !results.length) && meta.original) {
                return searchSite(meta.original).then(function (r2) { return r2 || []; });
            }
            return results || [];
        }).then(function (results) {
            var page = pickResult(results, meta);
            if (!page) return [];
            return fetchText(page).then(function (html) {
                if (meta.isTv) {
                    epUrl = findEpisode(html, season, episode);
                    if (!epUrl) { console.log("[CZM] episode not found"); return ""; }
                    return fetchText(epUrl);
                }
                epUrl = page;
                return html;
            }).then(function (epHtml) {
                if (!epHtml) return [];
                var blob = extractServerBlob(epHtml);
                var servers = normalizeServers(blob).slice(0, MAX_SERVERS);
                if (!servers.length) return [];
                var tasks = servers.map(function (s) {
                    if (s.resolveUrl) return resolveNp(epUrl, s.resolveUrl);
                    if (s.src) return resolveIframe(epUrl, s.src);
                    return Promise.resolve([]);
                });
                return Promise.all(tasks).then(function (lists) {
                    var streams = [];
                    for (var i = 0; i < lists.length; i++) {
                        if (lists[i]) streams = streams.concat(lists[i]);
                    }
                    var seen = {};
                    return streams.filter(function (st) {
                        if (seen[st.url]) return false;
                        seen[st.url] = true;
                        return true;
                    });
                });
            });
        });
    }).catch(function (err) {
        console.error("[CZM][ERROR] " + (err.message || err));
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
        var nuvioProviderName = "CizgiMax";
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
