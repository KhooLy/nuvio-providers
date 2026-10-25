const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PROVIDERS_DIR = path.join(__dirname, 'providers');

function sendFile(res, filePath, type) {
    if (!fs.existsSync(filePath)) return false;
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
    return true;
}

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    console.log(`[Server] ${req.method} ${pathname}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/manifest.json')) {
        if (sendFile(res, path.join(__dirname, 'manifest.json'), 'application/json')) return;
    }

    if (req.method === 'GET' && /^\/providers\/[A-Za-z0-9_.-]+\.js$/.test(pathname)) {
        const filePath = path.join(__dirname, pathname);
        if (filePath.startsWith(PROVIDERS_DIR + path.sep) && sendFile(res, filePath, 'application/javascript')) return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== NUVIO LOCAL DEV SERVER ===`);
    console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    for (const scraper of manifest.scrapers) {
        console.log(`${scraper.name}: http://localhost:${PORT}/${scraper.filename}`);
    }
    console.log(`==============================\n`);
});
