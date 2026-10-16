const http = require('http');

const USER = process.env.IG_USER || 'yukimichicats';
const PORT = Number(process.env.PORT || 8787);
const TTL_MS = Number(process.env.TTL_MS || 10 * 60 * 1000);
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

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

function parsePosts(html) {
    const posts = new Map();
    const addNode = (node) => {
        const groups = [];
        if (node.image_versions2) groups.push(node.image_versions2);
        if (Array.isArray(node.carousel_media)) {
            for (const m of node.carousel_media) if (m.image_versions2) groups.push(m.image_versions2);
        }
        for (const g of groups) {
            const cands = g.candidates || [];
            if (!cands.length) continue;
            const best = cands.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
            const key = best.url.split('?')[0];
            if (!posts.has(key)) {
                posts.set(key, {
                    id: String(node.pk || key),
                    url: best.url,
                    width: best.width,
                    height: best.height,
                    type: node.product_type || (node.media_type === 2 ? 'video' : node.media_type === 8 ? 'carousel' : 'photo'),
                });
            }
        }
    };

    let from = 0;
    while (true) {
        const key = html.indexOf('"polaris_timeline_connection"', from);
        if (key < 0) break;
        from = key + 1;
        const edgesAt = html.indexOf('"edges":', key);
        if (edgesAt < 0) continue;
        const arrAt = html.indexOf('[', edgesAt);
        if (arrAt < 0) continue;
        const json = sliceBalanced(html, arrAt, '[', ']');
        if (!json) continue;
        let edges;
        try { edges = JSON.parse(json); } catch { continue; }
        for (const edge of edges) if (edge && edge.node) addNode(edge.node);
    }
    return [...posts.values()];
}

async function fetchPosts(user) {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(user)}/`, {
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) throw new Error(`instagram ${res.status}`);
    const posts = parsePosts(await res.text());
    if (!posts.length) throw new Error('no posts in page');
    return posts;
}

const cache = new Map();
function stateFor(user) {
    let s = cache.get(user);
    if (!s) { s = { posts: [], at: 0, inflight: null }; cache.set(user, s); }
    return s;
}

async function getPosts(user) {
    const s = stateFor(user);
    if (s.posts.length && Date.now() - s.at < TTL_MS) return s.posts;
    if (!s.inflight) {
        s.inflight = fetchPosts(user).then(
            (p) => { s.posts = p; s.at = Date.now(); s.inflight = null; return p; },
            (e) => { s.inflight = null; throw e; },
        );
    }
    try { return await s.inflight; }
    catch (e) { if (s.posts.length) return s.posts; throw e; }
}

const pick = (posts) => posts[Math.floor(Math.random() * posts.length)];

const server = http.createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    const user = url.searchParams.get('user') || USER;

    try {
        if (url.pathname === '/random') {
            const p = pick(await getPosts(user));
            res.writeHead(302, { location: p.url, 'cache-control': 'no-store' });
            return res.end();
        }
        if (url.pathname === '/random.jpg') {
            const p = pick(await getPosts(user));
            const r = await fetch(p.url);
            if (!r.ok) { res.writeHead(502, { 'content-type': 'text/plain' }); return res.end(`upstream ${r.status}`); }
            const buf = Buffer.from(await r.arrayBuffer());
            res.writeHead(200, { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'no-store' });
            return res.end(buf);
        }
        if (url.pathname === '/' || url.pathname === '/list') {
            const posts = await getPosts(user);
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(JSON.stringify({ username: user, count: posts.length, cachedAt: stateFor(user).at, posts }, null, 2));
        }
        if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }

        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('GET / | /list | /random | /random.jpg  (optional ?user=)');
    } catch (err) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(`error: ${err.message}`);
    }
});

server.listen(PORT, () => {
    console.log(`insta-random on :${PORT} — user=${USER}`);
    console.log(`  GET /random     302 -> signed CDN image`);
    console.log(`  GET /random.jpg streamed bytes`);
    console.log(`  GET /list       JSON of posts`);
});
