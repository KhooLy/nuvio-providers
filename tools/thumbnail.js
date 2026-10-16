var path = require("path");
var fs = require("fs");
var execFile = require("child_process").execFile;

var provider = require(path.join(__dirname, "..", "providers", "vidlove.js"));

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
var RETRY_MS = parseInt(process.env.RETRY_MS || "45000", 10);

var args = process.argv.slice(2);
if (args.length < 5) {
    console.log("usage: node thumbnail.js <tmdbId> <movie|tv> <season> <episode> <out.jpg> [seekSec] [maxTries]");
    process.exit(1);
}

var tmdbId = args[0];
var mediaType = args[1];
var season = args[2];
var episode = args[3];
var out = args[4];
var seek = args[5] || "300";
var maxTries = parseInt(args[6] || "10", 10);

function lowestVariantUrl(masterUrl) {
    var headers = { "User-Agent": UA, "Referer": "https://player.vidlove.cc/" };
    return fetch(masterUrl, { headers: headers })
        .then(function(r) { return r.text(); })
        .then(function(m) {
            if (m.indexOf("#EXT-X-STREAM-INF") === -1) return masterUrl;
            var lines = m.split("\n");
            var best = null, bestBw = Infinity;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
                var bwM = /BANDWIDTH=(\d+)/.exec(lines[i]);
                var bw = bwM ? parseInt(bwM[1], 10) : 0;
                for (var j = i + 1; j < lines.length; j++) {
                    var uri = lines[j].trim();
                    if (uri && uri[0] !== "#") {
                        if (bw < bestBw) {
                            bestBw = bw;
                            best = uri.indexOf("http") === 0 ? uri
                                : uri[0] === "/" ? masterUrl.match(/^(https?:\/\/[^\/]+)/)[1] + uri
                                : masterUrl.substring(0, masterUrl.lastIndexOf("/")) + "/" + uri;
                        }
                        break;
                    }
                }
            }
            return best || masterUrl;
        })
        .catch(function() { return masterUrl; });
}

function runFfmpeg(streamUrl) {
    return new Promise(function(resolve) {
        execFile("ffmpeg", [
            "-y", "-hide_banner", "-loglevel", "error",
            "-user_agent", UA,
            "-headers", "Referer: https://player.vidlove.cc/\r\n",
            "-allowed_segment_extensions", "ALL",
            "-extension_picky", "0",
            "-ss", String(seek),
            "-i", streamUrl,
            "-frames:v", "1", "-q:v", "3",
            out
        ], { timeout: 120000 }, function(err) {
            resolve(!err && fs.existsSync(out) && fs.statSync(out).size > 0);
        });
    });
}

function attempt(n) {
    if (n > maxTries) {
        console.error("no stream after " + maxTries + " tries, giving up");
        process.exit(2);
    }
    console.log("[" + n + "/" + maxTries + "] fetching streams...");
    return provider.getStreams(tmdbId, mediaType, season, episode).then(function(streams) {
        if (!streams.length) {
            console.log("window closed, retrying in " + (RETRY_MS / 1000) + "s");
            return new Promise(function(r) { setTimeout(r, RETRY_MS); }).then(function() { return attempt(n + 1); });
        }
        var chain = Promise.resolve(false);
        streams.forEach(function(s) {
            chain = chain.then(function(done) {
                if (done) return true;
                return lowestVariantUrl(s.url).then(function(lowUrl) {
                    console.log("trying " + s.title + " -> " + lowUrl.slice(0, 70));
                    return runFfmpeg(lowUrl).then(function(ok) {
                        if (ok) console.log("saved " + out);
                        return ok;
                    });
                });
            });
        });
        return chain.then(function(done) {
            if (done) return;
            console.log("ffmpeg failed on all streams, retrying in " + (RETRY_MS / 1000) + "s");
            return new Promise(function(r) { setTimeout(r, RETRY_MS); }).then(function() { return attempt(n + 1); });
        });
    });
}

attempt(1).catch(function(e) {
    console.error(e.message || e);
    process.exit(3);
});
