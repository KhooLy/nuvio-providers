const http = require('http');
const fs = require('fs');
const path = require('path');

const USER = process.env.IG_USER || 'yukimichicats';
const PORT = Number(process.env.PORT || 8787);
const CODES_FILE = process.env.IG_CODES || path.join(__dirname, `${USER}.codes.json`);
const TTL_MS = Number(process.env.TTL_MS || 3 * 60 * 60 * 1000);
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function pkToCode(pk) {
    let n = BigInt(pk);
    let s = '';
    if (n === 0n) return 'A';
    while (n > 0n) { s = ALPHABET[Number(n % 64n)] + s; n /= 64n; }
    return s;
}

function sliceBalanced(s, start, open, close) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === open) depth++;
        else if (c === close && --depth === 0) return s.slice(start, i + 1);
    }
    return null;
}

function pksFrom(html, key) {
    const out = [];
    let from = 0;
    while (true) {
        const k = html.indexOf(`"${key}"`, from);
        if (k < 0) break;
        from = k + 1;
        const edgesAt = html.indexOf('"edges":', k);
        if (edgesAt < 0) continue;
        const arrAt = html.indexOf('[', edgesAt);
        if (arrAt < 0) continue;
        const json = sliceBalanced(html, arrAt, '[', ']');
        if (!json) continue;
        let edges;
        try { edges = JSON.parse(json); } catch { continue; }
        for (const edge of edges) if (edge && edge.node && edge.node.pk) out.push(String(edge.node.pk));
    }
    return out;
}

async function fetchHtml(url) {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.text();
}

async function seedCodes() {
    const html = await fetchHtml(`https://www.instagram.com/${encodeURIComponent(USER)}/`);
    const pks = [
        ...pksFrom(html, 'polaris_timeline_connection'),
        ...pksFrom(html, 'polaris_ordered_timeline_connection'),
    ];
    const codes = [...new Set(pks.map(pkToCode))];
    if (!codes.length) throw new Error('no codes found in profile page');
    saveCodes(codes);
    return codes;
}

let codes = [];
function saveCodes(list) {
    codes = [...new Set(list)];
    fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2));
}

function loadCodes() {
    try {
        const arr = JSON.parse(fs.readFileSync(CODES_FILE, 'utf8'));
        if (Array.isArray(arr) && arr.length) return arr;
    } catch {}
    return null;
}

const urlCache = new Map();

async function resolveImage(code) {
    const hit = urlCache.get(code);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.url;
    const html = await fetchHtml(`https://www.instagram.com/p/${code}/`);
    const marker = html.match(/"image_versions2":\{"candidates":\[/);
    if (marker) {
        const arrAt = html.indexOf('[', marker.index + marker[0].length - 1);
        const json = sliceBalanced(html, arrAt, '[', ']');
        if (json) {
            try {
                const cands = JSON.parse(json).filter((c) => c && c.url);
                if (cands.length) {
                    const withDims = cands.filter((c) => c.width && c.height);
                    const best = withDims.length
                        ? withDims.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))
                        : cands[0];
                    urlCache.set(code, { url: best.url, at: Date.now() });
                    return best.url;
                }
            } catch {}
        }
    }
    const og = html.match(/og:image" content="([^"]+)"/);
    if (og) {
        const url = og[1].replace(/&amp;/g, '&');
        urlCache.set(code, { url, at: Date.now() });
        return url;
    }
    throw new Error(`no image for ${code}`);
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

const server = http.createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');

    try {
        if (url.pathname === '/' || url.pathname === '/list') {
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(JSON.stringify({ username: USER, count: codes.length, codes }, null, 2));
        }
        if (url.pathname === '/codes') {
            if (req.method === 'POST') {
                const chunks = [];
                for await (const c of req) chunks.push(c);
                const body = Buffer.concat(chunks).toString('utf8').trim();
                let incoming = [];
                try { incoming = JSON.parse(body); } catch {}
                if (!Array.isArray(incoming)) incoming = body.split(/\s+/).map((s) => s.split('/p/')[1]?.split('/')[0] || s).filter(Boolean);
                incoming = incoming.filter((c) => typeof c === 'string' && /^[A-Za-z0-9_-]{11}$/.test(c));
                saveCodes([...codes, ...incoming]);
                res.writeHead(200, { 'content-type': 'application/json' });
                return res.end(JSON.stringify({ count: codes.length, added: incoming.length }));
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(JSON.stringify(codes));
        }
        if (url.pathname === '/random' || url.pathname === '/random.jpg') {
            const target = await resolveImage(pick(codes));
            if (url.pathname === '/random') {
                res.writeHead(302, { location: target, 'cache-control': 'no-store' });
                return res.end();
            }
            const r = await fetch(target);
            if (!r.ok) { res.writeHead(502, { 'content-type': 'text/plain' }); return res.end(`upstream ${r.status}`); }
            const buf = Buffer.from(await r.arrayBuffer());
            res.writeHead(200, { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'no-store' });
            return res.end(buf);
        }
        if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }

        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('GET /list | /codes | POST /codes | /random -> 302 | /random.jpg');
    } catch (err) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(`error: ${err.message}`);
    }
});

(async () => {
    codes = loadCodes();
    if (!codes) {
        try { codes = await seedCodes(); }
        catch (err) { console.error(`seed failed: ${err.message}`); codes = []; }
    }
    server.listen(PORT, () => {
        console.log(`insta-random on :${PORT} — ${USER}, ${codes.length} codes`);
        console.log(`  GET /random   -> 302 full-res image`);
        console.log(`  GET /list     -> codes   |   POST /codes to add`);
    });
})();
