const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const ROUTES = {
    '/':                       { file: 'manifest.json',           type: 'application/json' },
    '/manifest.json':          { file: 'manifest.json',           type: 'application/json' },
    '/providers/hdfilmizle.js':{ file: 'providers/hdfilmizle.js', type: 'application/javascript' },
    '/providers/hianime.js':   { file: 'providers/hianime.js',    type: 'application/javascript' },
    '/providers/vidlove.js':   { file: 'providers/vidlove.js',    type: 'application/javascript' },
    '/providers/hdhub.js':     { file: 'providers/hdhub.js',      type: 'application/javascript' },
};

const server = http.createServer((req, res) => {
    console.log(`[Server] ${req.method} ${req.url}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const route = ROUTES[req.url];
    if (route) {
        const filePath = path.join(__dirname, route.file);
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': route.type });
            fs.createReadStream(filePath).pipe(res);
            return;
        }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== NUVIO LOCAL DEV SERVER ===`);
    console.log(`Manifest:  http://localhost:${PORT}/manifest.json`);
    console.log(`HDFilmizle:http://localhost:${PORT}/providers/hdfilmizle.js`);
    console.log(`Hianime:   http://localhost:${PORT}/providers/hianime.js`);
    console.log(`Vidlove:   http://localhost:${PORT}/providers/vidlove.js`);
    console.log(`HDHub:     http://localhost:${PORT}/providers/hdhub.js`);
    console.log(`==============================\n`);
});
