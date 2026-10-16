var path = require("path");
var fs = require("fs");
var os = require("os");
var execFile = require("child_process").execFile;

var provider = require(path.join(__dirname, "..", "providers", "vidlove.js"));

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var REFERER = "https://player.vidlove.cc/";
var W = parseInt(process.env.W || "24", 10);
var RETRY_MS = parseInt(process.env.RETRY_MS || "45000", 10);
var MAX_TRIES = parseInt(process.env.MAX_TRIES || "10", 10);
var FINAL = 5;
var LADDER = [120, 60, 30, 15, 10, 5];

var args = process.argv.slice(2);
if (args.length < 5) {
    console.log("usage: node sprite.js <tmdbId> <movie|tv> <season> <episode> <outdir> [finalInterval]");
    process.exit(1);
}
var tmdbId = args[0], mediaType = args[1], season = args[2], episode = args[3], outdir = args[4];
if (args[5]) { FINAL = parseInt(args[5], 10); LADDER = LADDER.filter(t => t >= FINAL).concat(FINAL); }

function sh(cmd, a) {
    return new Promise(function (res) {
        execFile(cmd, a, { timeout: 180000, maxBuffer: 1 << 20 }, function () { res(); });
    });
}

function pool(tasks, w) {
    var i = 0;
    function worker() { return i < tasks.length ? tasks[i++]().then(worker, worker) : Promise.resolve(); }
    return Promise.all(Array.from({ length: Math.min(w, tasks.length) }, worker));
}

function getStreamRetried(n) {
    if (n > MAX_TRIES) return Promise.reject(new Error("no stream after " + MAX_TRIES + " tries"));
    return provider.getStreams(tmdbId, mediaType, season, episode).then(function (s) {
        if (s.length) return s[0].url;
        console.log("[retry] window closed, " + (RETRY_MS / 1000) + "s...");
        return new Promise(r => setTimeout(r, RETRY_MS)).then(() => getStreamRetried(n + 1));
    });
}

function lowestVariant(masterUrl) {
    return fetch(masterUrl, { headers: { "User-Agent": UA, "Referer": REFERER } })
        .then(r => r.text())
        .then(function (m) {
            if (m.indexOf("#EXT-X-STREAM-INF") === -1) return { url: masterUrl, playlist: m };
            var lines = m.split("\n"), best = null, bw = Infinity;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
                var b = parseInt((/BANDWIDTH=(\d+)/.exec(lines[i]) || [0, 0])[1], 10);
                for (var j = i + 1; j < lines.length; j++) {
                    var u = lines[j].trim();
                    if (u && u[0] !== "#") {
                        if (b < bw) {
                            bw = b;
                            best = u.indexOf("http") === 0 ? u
                                : u[0] === "/" ? masterUrl.match(/^(https?:\/\/[^\/]+)/)[1] + u
                                : masterUrl.substring(0, masterUrl.lastIndexOf("/")) + "/" + u;
                        }
                        break;
                    }
                }
            }
            var lowUrl = best || masterUrl;
            return fetch(lowUrl, { headers: { "User-Agent": UA, "Referer": REFERER } })
                .then(r => r.text())
                .then(pl => ({ url: lowUrl, playlist: pl }));
        });
}

function tile(frames, name) {
    var seq = path.join(outdir, "seq_" + name);
    fs.mkdirSync(seq, { recursive: true });
    frames.forEach(function (f, i) {
        fs.copyFileSync(f.file, path.join(seq, "f_" + String(i + 1).padStart(5, "0") + ".jpg"));
    });
    return sh("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "2",
        "-i", path.join(seq, "f_%05d.jpg"), "-vf", "tile=10x10", "-q:v", "5",
        path.join(outdir, name + "_%02d.jpg")]).then(function () {
        fs.rmSync(seq, { recursive: true, force: true });
    });
}

function vtt(meta, dur, name) {
    function ts(t) {
        var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
        return [h, m, s].map(x => String(Math.floor(x)).padStart(2, "0")).join(":")
            + "." + String(Math.round((s % 1) * 1000)).padStart(3, "0");
    }
    var L = ["WEBVTT", ""];
    meta.forEach(function (f, i) {
        var st = f.t, en = Math.min((i + 1 < meta.length ? meta[i + 1].t : dur), st + FINAL);
        var c = i % 100, sheet = Math.floor(i / 100) + 1;
        L.push(ts(st) + " --> " + ts(en));
        L.push(name + "_" + String(sheet).padStart(2, "0") + ".jpg#xywh=" + ((c % 10) * 160) + "," + (Math.floor(c / 10) * 90) + ",160,90");
        L.push("");
    });
    fs.writeFileSync(path.join(outdir, name + ".vtt"), L.join("\n"));
}

var workdir = fs.mkdtempSync(path.join(os.tmpdir(), "sprite-"));
var segDir = path.join(workdir, "seg"), frmDir = path.join(workdir, "frm"), frmDirK = path.join(workdir, "frmk");
fs.mkdirSync(segDir); fs.mkdirSync(frmDir); fs.mkdirSync(frmDirK);

var t0 = Date.now();
function elapsed() { return ((Date.now() - t0) / 1000).toFixed(1); }

getStreamRetried(1).then(lowestVariant).then(function (r) {
    var lines = r.playlist.split("\n");
    var durs = [], acc = 0, starts = [];
    lines.forEach(function (l) {
        var m = /^#EXTINF:([\d.]+)/.exec(l);
        if (m) { durs.push(parseFloat(m[1])); starts.push(acc); acc += parseFloat(m[1]); }
        else if (l.indexOf("http") === 0 || (l[0] !== "#" && l.trim())) { durs.urls = durs.urls || []; durs.urls.push(l.trim()); }
    });
    var DUR = acc;
    var urls = durs.urls || [];

    var tier1 = LADDER.filter(t => t <= DUR / 100)[0] || FINAL;
    var tiers = LADDER.filter(t => t <= tier1 && t >= FINAL);
    if (tiers[tiers.length - 1] !== FINAL) tiers.push(FINAL);

    var pts = [];
    for (var p = 0; p < DUR; p += FINAL) pts.push(p);
    var bySeg = {};
    pts.forEach(function (p) {
        var idx = 0;
        for (var k = starts.length - 1; k >= 0; k--) { if (starts[k] <= p) { idx = k; break; } }
        (bySeg[idx] = bySeg[idx] || []).push(p);
    });

    var tierOf = {};
    Object.keys(bySeg).forEach(function (k) {
        var idx = +k, lst = bySeg[idx], lvl = tiers.length;
        for (var ti = 0; ti < tiers.length; ti++) {
            if (lst.some(p => p % tiers[ti] === 0)) { lvl = ti + 1; break; }
        }
        tierOf[idx] = lvl;
    });

    console.log("video=" + (DUR / 60).toFixed(1) + "dk segment=" + urls.length +
        " kare=" + pts.length + " tierlar=" + tiers.join("-") +
        " (ilk hedef ~" + Math.round(DUR / tier1) + " kare)");

    var doneCount = 0, lock = Promise.resolve();
    var tierTotal = {}, tierDone = {};
    Object.keys(bySeg).forEach(function (k) {
        tierTotal[tierOf[k]] = (tierTotal[tierOf[k]] || 0) + 1;
    });
    var published = {};
    var pubChain = Promise.resolve();
    var publish = function (fn) { pubChain = pubChain.then(fn, fn); };

    function job(idx) {
        var seg = path.join(segDir, "s_" + String(idx + 1).padStart(5, "0") + ".bin");
        var dl = function (n) {
            return sh("curl", ["-s", "-H", "Referer: " + REFERER, "-o", seg, urls[idx], "--max-time", "120"]).then(function () {
                var sz = fs.existsSync(seg) ? fs.statSync(seg).size : 0;
                if (sz < 10240 && n < 3) return new Promise(r => setTimeout(r, 1500)).then(() => dl(n + 1));
            });
        };
        return dl(0).then(function () {
            var lst = bySeg[idx].sort(function (a, b) { return a - b; });
            var lastLocal = lst[lst.length - 1] - starts[idx];
            var sel = lst.map(p => "eq(n," + Math.round((p - starts[idx]) * 23.976024) + ")").join("+");
            return sh("ffmpeg", ["-y", "-loglevel", "error", "-t", (lastLocal + 0.15).toFixed(3),
                "-i", seg, "-vf", "select='" + sel + "',scale=160:90", "-fps_mode", "passthrough",
                "-q:v", "5", path.join(frmDir, "g_" + String(idx).padStart(5, "0") + "_%d.jpg")]);
        }).then(function () {
            doneCount++;
            var tr = tierOf[idx];
            tierDone[tr] = (tierDone[tr] || 0) + 1;
            var grid = tiers[tr - 1];
            if (tierDone[tr] === tierTotal[tr] && !published[tr] && grid !== FINAL) {
                published[tr] = true;
                publish(function () {
                    var frames = [];
                    Object.keys(bySeg).forEach(function (k) {
                        var idx2 = +k;
                        if (tierOf[idx2] > tr) return;
                        var got = fs.readdirSync(frmDir).filter(f => f.indexOf("g_" + String(idx2).padStart(5, "0") + "_") === 0)
                            .sort((a, b) => parseInt(a.match(/_(\d+)\.jpg/)[1]) - parseInt(b.match(/_(\d+)\.jpg/)[1]));
                        bySeg[idx2].forEach(function (pt, kk) {
                            if (pt % grid === 0 && got[kk]) frames.push({ t: pt, file: path.join(frmDir, got[kk]) });
                        });
                    });
                    frames.sort((a, b) => a.t - b.t);
                    var label = grid >= 60 ? (grid / 60) + "dk" : grid + "s";
                    return tile(frames, "coarse_t" + tr).then(function () {
                        console.log("[MILESTONE] " + label + " sheet hazir @ " + elapsed() + " sn (" + frames.length + " kare)");
                    });
                });
            }
        });
    }

    function keyJob(idx) {
        var part = path.join(segDir, "k_" + String(idx + 1).padStart(5, "0") + ".bin");
        return sh("curl", ["-s", "-r", "0-131071", "-H", "Referer: " + REFERER, "-o", part, urls[idx], "--max-time", "60"]).then(function () {
            return sh("ffmpeg", ["-y", "-loglevel", "error", "-i", part,
                "-vf", "select='eq(pict_type,I)',scale=160:90", "-frames:v", "1",
                "-fps_mode", "passthrough", "-q:v", "5", path.join(frmDirK, "k_" + String(idx).padStart(5, "0") + ".jpg")]);
        });
    }

    var tasks = Object.keys(bySeg).map(k => +k)
        .sort((a, b) => (tierOf[a] - tierOf[b]) || (a - b))
        .map(idx => () => job(idx));

    if (process.env.LITE === "1" || process.env.CLIENT === "1") {
        var strides = process.env.CLIENT === "1" ? (process.env.PHASES || "6,3,1").split(",").map(Number) : [1];
        var doneIdx = {};
        var chain = Promise.resolve();
        strides.forEach(function (stride, si) {
            chain = chain.then(function () {
                var ids = [];
                for (var i = si === strides.length - 1 ? 0 : stride - 1; i < urls.length; i += stride) {
                    if (!doneIdx[i]) ids.push(i);
                }
                if (si < strides.length - 1) ids.forEach(function (i) { doneIdx[i] = true; });
                var frames = [];
                return pool(ids.map(idx => () => keyJob(idx).then(function () {
                    var f = path.join(frmDirK, "k_" + String(idx).padStart(5, "0") + ".jpg");
                    if (fs.existsSync(f)) frames.push({ t: starts[idx], file: f });
                })), W).then(function () {
                    frames.sort((a, b) => a.t - b.t);
                    if (si < strides.length - 1) {
                        return tile(frames, "coarse_s" + stride).then(function () {
                            console.log("[MILESTONE] ~" + Math.round(DUR / frames.length) + "s grid sheet hazir @ " + elapsed() + " sn (" + frames.length + " kare)");
                        });
                    }
                });
            });
        });
        chain.then(function () {
            var frames = [];
            fs.readdirSync(frmDirK).forEach(function (f) {
                var idx2 = parseInt(f.slice(2), 10);
                if (!isNaN(idx2)) frames.push({ t: starts[idx2], file: path.join(frmDirK, f) });
            });
            frames.sort((a, b) => a.t - b.t);
            return tile(frames, "sprite").then(function () {
                vtt(frames, DUR, "preview");
                var files = fs.readdirSync(outdir).filter(f => f.indexOf("sprite_") === 0 && f.endsWith(".jpg"));
                var bytes = files.reduce((s, f) => s + fs.statSync(path.join(outdir, f)).size, 0);
                console.log("[DONE] " + frames.length + " keyframe, " + files.length + " sheet, " +
                    (bytes / 1048576).toFixed(2) + " MB + preview.vtt | TOPLAM " + elapsed() + " sn");
                fs.rmSync(workdir, { recursive: true, force: true });
            });
        });
        return;
    }

    pool(tasks, W).then(function () {
        return pubChain;
    }).then(function () {
        var frames = [];
        Object.keys(bySeg).forEach(function (k) {
            var idx2 = +k;
            var got = fs.readdirSync(frmDir).filter(f => f.indexOf("g_" + String(idx2).padStart(5, "0") + "_") === 0)
                .sort((a, b) => parseInt(a.match(/_(\d+)\.jpg/)[1]) - parseInt(b.match(/_(\d+)\.jpg/)[1]));
            bySeg[idx2].forEach(function (pt, kk) { if (got[kk]) frames.push({ t: pt, file: path.join(frmDir, got[kk]) }); });
        });
        frames.sort((a, b) => a.t - b.t);
        return tile(frames, "sprite").then(function () {
            vtt(frames, DUR, "preview");
            var files = fs.readdirSync(outdir).filter(f => f.indexOf("sprite_") === 0 && f.endsWith(".jpg"));
            var bytes = files.reduce((s, f) => s + fs.statSync(path.join(outdir, f)).size, 0);
            console.log("[DONE] " + frames.length + "/" + pts.length + " kare, " + files.length + " sheet, " +
                (bytes / 1048576).toFixed(2) + " MB + preview.vtt | TOPLAM " + elapsed() + " sn");
            fs.rmSync(workdir, { recursive: true, force: true });
        });
    });
}).catch(function (e) {
    console.error("HATA: " + (e.message || e));
    process.exit(2);
});
