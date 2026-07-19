const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
    // Log the incoming request
    console.log(`[Server Log] ${req.method} request to: ${req.url}`);

    // Enable CORS so Nuvio app can query this local server
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let filePath = '';
    let contentType = 'text/plain';

    if (req.url === '/' || req.url === '/manifest.json') {
        filePath = path.join(__dirname, 'manifest.json');
        contentType = 'application/json';
    } else if (req.url === '/providers/hdfilmizle.js') {
        filePath = path.join(__dirname, 'providers', 'hdfilmizle.js');
        contentType = 'application/javascript';
    }

    if (filePath && fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== NUVIO LOCAL DEV SERVER RUNNING ===`);
    console.log(`Serving manifest at: http://localhost:${PORT}/manifest.json`);
    console.log(`Serving provider at: http://localhost:${PORT}/providers/hdfilmizle.js`);
    console.log(`======================================\n`);
});
