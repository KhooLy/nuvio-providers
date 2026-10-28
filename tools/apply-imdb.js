const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const providersDir = path.join(root, 'providers');
const template = fs.readFileSync(path.join(__dirname, 'imdb.template.js'), 'utf8').trim();

const skip = new Set([
    '2peckle.js',
    'anikoto.js',
    'arctic.js',
    'hdfilmizle.js',
    'hdhub4u.js',
    'hianime.js',
    'reanime.js',
    'sololatino.js',
    'vidy.js'
]);

for (const file of fs.readdirSync(providersDir).sort()) {
    if (!file.endsWith('.js') || skip.has(file)) continue;
    const filePath = path.join(providersDir, file);
    let code = fs.readFileSync(filePath, 'utf8');
    const marker = code.indexOf('(function nuvioImdbBootstrap()');
    if (marker !== -1) code = code.slice(0, marker).replace(/\s+$/, '');
    fs.writeFileSync(filePath, code.replace(/\s+$/, '') + '\n\n' + template + '\n');
    console.log('imdb ' + file);
}

require('./apply-liveness');
