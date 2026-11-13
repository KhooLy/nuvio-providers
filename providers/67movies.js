var API_BASE = "https://api.vidqueen.st";
var PLAYER_BASE = "https://player.vidqueen.st";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";

var API_HEADERS = {
  "User-Agent": UA,
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Origin": PLAYER_BASE,
  "Referer": PLAYER_BASE + "/"
};

var STREAM_HEADERS = {
  "User-Agent": UA,
  "Referer": PLAYER_BASE + "/"
};

var SERVER_LABELS = {
  "s1": "Bloodstone",
  "s4": "Obsidian",
  "s2": "Garnet",
  "s3": "Ruby",
  "s5": "Jet",
  "s7": "Amethyst",
  "s6": "Nightshade"
};

var PRIMARY_SERVERS = ["", "s4", "s2"];
var SECONDARY_SERVERS = ["s1", "s3", "s5", "s7", "s6"];

var LANG_MAP = {
  "english": "en", "eng": "en", "turkish": "tr", "turkce": "tr",
  "spanish": "es", "castellano": "es", "latino": "es", "french": "fr", "francais": "fr",
  "german": "de", "deutsch": "de", "italian": "it", "italiano": "it",
  "portuguese": "pt", "brazilian": "pt", "russian": "ru", "arabic": "ar",
  "hindi": "hi", "japanese": "ja", "korean": "ko", "chinese": "zh",
  "simplified": "zh", "traditional": "zh", "polish": "pl", "dutch": "nl",
  "swedish": "sv", "danish": "da", "norwegian": "no", "finnish": "fi",
  "greek": "el", "hebrew": "he", "thai": "th", "vietnamese": "vi",
  "indonesian": "id", "malay": "ms", "czech": "cs", "slovak": "sk",
  "hungarian": "hu", "romanian": "ro", "bulgarian": "bg", "ukrainian": "uk",
  "croatian": "hr", "serbian": "sr", "slovenian": "sl", "albanian": "sq",
  "macedonian": "mk", "bosnian": "bs", "estonian": "et", "latvian": "lv",
  "lithuanian": "lt", "icelandic": "is", "filipino": "fil", "tagalog": "fil",
  "bengali": "bn", "tamil": "ta", "telugu": "te", "malayalam": "ml",
  "kannada": "kn", "punjabi": "pa", "marathi": "mr", "gujarati": "gu",
  "urdu": "ur", "persian": "fa", "farsi": "fa", "swahili": "sw",
  "afrikaans": "af", "georgian": "ka", "armenian": "hy", "azerbaijani": "az",
  "kazakh": "kk", "uzbek": "uz", "mongolian": "mn", "nepali": "ne",
  "sinhala": "si", "khmer": "km", "lao": "lo", "burmese": "my", "tibetan": "bo"
};

var LANG_PRIORITY = [
  "en", "tr", "es", "fr", "de", "it", "pt", "ru", "ar", "hi", "ja", "ko", "zh",
  "pl", "nl", "sv", "da", "no", "fi", "el", "he", "cs", "hu", "ro", "bg", "uk",
  "hr", "sr", "sk", "sl", "id", "vi", "th", "fa", "ur", "ta", "te", "ml", "bn", "fil"
];

function enabled() {
  try {
    var settings = globalThis.SCRAPER_SETTINGS || {};
    return settings["67movies"] !== false;
  } catch (e) {
    return true;
  }
}

function fetchJson(url, timeoutMs) {
  var headers = { headers: API_HEADERS };
  var controller = null;
  if (typeof AbortController !== "undefined") {
    controller = new AbortController();
    headers.signal = controller.signal;
  }
  var request = fetch(url, headers).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
  if (typeof setTimeout !== "function") return request;
  var timer = null;
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      if (controller) {
        try { controller.abort(); } catch (e) {}
      }
      reject(new Error("timeout " + url));
    }, timeoutMs || 12000);
  });
  return Promise.race([request, timeout]).then(function (value) {
    if (timer) clearTimeout(timer);
    return value;
  }, function (error) {
    if (timer) clearTimeout(timer);
    throw error;
  });
}

function apiUrl(type, id, season, episode, sourceKey) {
  var suffix = sourceKey ? "&sources=" + sourceKey : "";
  if (type === "tv") {
    return API_BASE + "/tv?id=" + encodeURIComponent(id) +
      "&season=" + season + "&episode=" + episode + "&mode=json" + suffix;
  }
  return API_BASE + "/movie?id=" + encodeURIComponent(id) + "&mode=json" + suffix;
}

function subtitleUrl(type, id, season, episode) {
  if (type === "tv") {
    return API_BASE + "/subtitles/tv/" + encodeURIComponent(id) + "/" + season + "/" + episode;
  }
  return API_BASE + "/subtitles/movie/" + encodeURIComponent(id);
}

function cleanLabel(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[\s._-]*\d+\s*$/, "")
    .replace(/\b(hi|cc|sdh|forced|full)\b/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function languageOf(label) {
  var cleaned = cleanLabel(label);
  if (!cleaned) return "und";
  if (LANG_MAP[cleaned]) return LANG_MAP[cleaned];
  var tokens = cleaned.split(" ");
  for (var i = 0; i < tokens.length; i++) {
    if (LANG_MAP[tokens[i]]) return LANG_MAP[tokens[i]];
  }
  return cleaned;
}

function languageRank(code) {
  var index = LANG_PRIORITY.indexOf(code);
  return index === -1 ? 100 : index;
}

function directSubtitleUrl(raw) {
  var value = String(raw || "");
  var match = value.match(/[?&]url=([^&]+)/);
  if (match && /\/subtitle\?/.test(value)) {
    try { value = decodeURIComponent(match[1]); } catch (e) {}
  }
  value = value.replace(/ /g, "%20");
  return /^https?:\/\//i.test(value) ? value : "";
}

function buildSubtitles(list) {
  if (!Array.isArray(list) || !list.length) return [];
  var byLang = {};
  list.forEach(function (item) {
    if (!item) return;
    var url = directSubtitleUrl(item.file || item.url);
    if (!url) return;
    var label = item.label || item.language || item.name || "Subtitle";
    var code = languageOf(label);
    var exact = !/[\s._-]*\d+\s*$/.test(String(label)) && !/\b(hi|cc|sdh|forced)\b/i.test(String(label));
    var existing = byLang[code];
    if (!existing || (exact && !existing.exact)) {
      byLang[code] = { url: url, language: code, name: label, exact: exact };
    }
  });
  var rows = Object.keys(byLang).map(function (key) { return byLang[key]; });
  rows.sort(function (a, b) {
    var diff = languageRank(a.language) - languageRank(b.language);
    if (diff !== 0) return diff;
    return String(a.name).localeCompare(String(b.name));
  });
  return rows.slice(0, 15).map(function (row) {
    return { url: row.url, language: row.language, name: row.name };
  });
}

function normalizeQuality(value) {
  var text = String(value || "").toLowerCase();
  if (/2160|4k|uhd/.test(text)) return "4K";
  if (/1080/.test(text)) return "1080p";
  if (/720/.test(text)) return "720p";
  if (/480/.test(text)) return "480p";
  if (/360/.test(text)) return "360p";
  return "";
}

function heightQuality(height) {
  var value = parseInt(height, 10) || 0;
  if (value >= 2000) return "4K";
  if (value >= 1080) return "1080p";
  if (value >= 720) return "720p";
  if (value >= 480) return "480p";
  if (value >= 360) return "360p";
  return value > 0 ? "HD" : "";
}

function sourceType(source, quality) {
  if (quality && quality.type === "hls") return "hls";
  if (quality && quality.type === "mp4") return "mp4";
  if (source && source.manifest) return "hls";
  if (source && /^(s1|s3|s4)$/i.test(String(source.source || ""))) return "hls";
  if (source && /tcloud|hls/i.test(String(source.label || ""))) return "hls";
  return "mp4";
}

function buildRows(entry, subtitles) {
  var source = entry && entry.json && entry.json.source;
  if (!source || typeof source.url !== "string" || !/^https?:\/\//i.test(source.url)) return [];
  var label = source.label || SERVER_LABELS[entry.key] || "Server";
  var qualities = Array.isArray(source.qualities) ? source.qualities.filter(function (quality) {
    return quality && typeof quality.url === "string" && /^https?:\/\//i.test(quality.url);
  }) : [];
  var rows = [];
  if (qualities.length > 1) {
    qualities.forEach(function (quality) {
      var resolved = normalizeQuality(quality.quality) || heightQuality(source.h);
      var type = sourceType(source, quality);
      rows.push(makeRow(label, resolved, quality.codec, type, quality.url, subtitles));
    });
    return rows;
  }
  var single = qualities.length === 1 ? qualities[0] : null;
  var url = single ? single.url : source.url;
  var resolved = normalizeQuality(single && single.quality) || heightQuality(source.h);
  var type = sourceType(source, single);
  rows.push(makeRow(label, resolved, single && single.codec, type, url, subtitles));
  return rows;
}

function makeRow(label, quality, codec, type, url, subtitles) {
  var kind = type === "hls" ? "HLS" : "MP4";
  var parts = ["67Movies", label, quality, kind];
  if (codec) parts.push(String(codec).toUpperCase());
  var row = {
    name: "67Movies " + label,
    title: parts.filter(Boolean).join(" • "),
    url: url,
    quality: quality || "HD",
    type: type,
    headers: STREAM_HEADERS
  };
  if (subtitles && subtitles.length) row.subtitles = subtitles;
  return row;
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!enabled()) return Promise.resolve([]);
  var id = String(tmdbId || "").trim();
  if (!/^\d+$/.test(id)) return Promise.resolve([]);
  var type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
  var sea = parseInt(season, 10) || 1;
  var ep = parseInt(episode, 10) || 1;

  function fetchEntries(keys) {
    return Promise.all(keys.map(function (key) {
      return fetchJson(apiUrl(type, id, sea, ep, key), 12000).then(function (json) {
        return json && json.source ? { key: key, json: json } : null;
      }).catch(function () {
        return null;
      });
    })).then(function (entries) {
      return entries.filter(Boolean);
    });
  }

  var subsJob = fetchJson(subtitleUrl(type, id, sea, ep), 10000).catch(function () {
    return null;
  });

  return fetchEntries(PRIMARY_SERVERS).then(function (primary) {
    return primary.length ? primary : fetchEntries(SECONDARY_SERVERS);
  }).then(function (hits) {
    return subsJob.then(function (subs) {
      var embedded = null;
      hits.forEach(function (entry) {
        if (!embedded && Array.isArray(entry.json.subtitles) && entry.json.subtitles.length) {
          embedded = entry.json.subtitles;
        }
      });
      var subtitles = buildSubtitles(Array.isArray(subs) ? subs : embedded);
      var rows = [];
      var seen = {};
      hits.forEach(function (entry) {
        buildRows(entry, subtitles).forEach(function (row) {
          if (seen[row.url]) return;
          seen[row.url] = true;
          rows.push(row);
        });
      });
      return rows;
    });
  }).catch(function (error) {
    console.log("[67Movies] " + (error && error.message ? error.message : error));
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
        var nuvioProviderName = "67Movies";
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
