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
