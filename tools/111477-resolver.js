const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8788', 10);
const COOKIE_FILE = process.env.CF_COOKIE_FILE || path.join(os.homedir(), '.cache', 'claude-tmp', '111477', 'cookie.json');
const CACHE_MS = 5 * 60 * 1000;
const GAP_MS = 1800;
const cache = new Map();
let lastRequestAt = 0;
let queue = Promise.resolve();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pFetch(target, headers) {
    const run = queue.then(async () => {
        const wait = GAP_MS - (Date.now() - lastRequestAt);
        if (wait > 0) await sleep(wait);
        lastRequestAt = Date.now();
        return fetch(target, { redirect: 'manual', headers });
    });
    queue = run.catch(() => {});
    return run;
}

function loadCookie() {
    if (process.env.CF_CLEARANCE) {
        return { ua: process.env.CF_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', cookie: 'cf_clearance=' + process.env.CF_CLEARANCE };
    }
    const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    const cookies = Array.isArray(data.cookies) ? data.cookies : [];
    if (!cookies.length && data.cookie) return { ua: data.ua, cookie: data.cookie };
    return {
        ua: data.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        cookie: cookies.map((c) => c.name + '=' + c.value).join('; ')
    };
}

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(payload)
    });
    res.end(payload);
}

async function resolve(url) {
    if (!/^https:\/\/a\.111477\.xyz\//i.test(url)) throw new Error('unsupported url');
    const cached = cache.get(url);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

    const creds = loadCookie();
    const target = 'https://p.111477.xyz/bulk?u=' + encodeURIComponent(url);
    const headers = {
        'User-Agent': creds.ua,
        'Cookie': creds.cookie,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://a.111477.xyz/'
    };
    let response = await pFetch(target, headers);
    if (response.status === 429) {
        await sleep(2500);
        response = await pFetch(target, headers);
    }
    const location = response.headers.get('location') || '';
    if (response.status >= 300 && response.status < 400 && location) {
        cache.set(url, { at: Date.now(), value: location });
        return location;
    }
    if (response.status === 403) throw new Error('cloudflare ' + response.status);
    throw new Error('p returned ' + response.status + (location ? ' -> ' + location : ''));
}

const server = http.createServer((req, res) => {
    const parsed = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        });
        res.end();
        return;
    }
    if (parsed.pathname === '/health') {
        let ok = false;
        try {
            const creds = loadCookie();
            ok = !!creds.cookie;
        } catch (e) {}
        sendJson(res, 200, { ok: true, cookie: ok, cached: cache.size });
        return;
    }
    if (parsed.pathname !== '/resolve') {
        sendJson(res, 404, { error: 'not found' });
        return;
    }
    const url = parsed.searchParams.get('u') || '';
    if (!url) {
        sendJson(res, 400, { error: 'missing u' });
        return;
    }
    const started = Date.now();
    resolve(url).then((location) => {
        console.log('[111477] ' + (Date.now() - started) + 'ms ' + url.slice(0, 90));
        sendJson(res, 200, { url: location });
    }).catch((error) => {
        console.log('[111477] error ' + (Date.now() - started) + 'ms ' + error.message);
        sendJson(res, 502, { error: error.message });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('111477 resolver listening on http://0.0.0.0:' + PORT);
    try {
        const creds = loadCookie();
        console.log('cookie loaded: ' + (creds.cookie ? 'yes' : 'no'));
    } catch (e) {
        console.log('cookie not loaded: ' + e.message);
    }
});
