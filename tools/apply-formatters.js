const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const providersDir = path.join(root, 'providers');
const manifest = require(path.join(root, 'manifest.json'));
const template = fs.readFileSync(path.join(__dirname, 'formatter.template.js'), 'utf8');

const names = {};
for (const scraper of manifest.scrapers) {
    names[path.basename(scraper.filename)] = scraper.name;
}

const skip = new Set([
    '2peckle.js',
    'a111477.js',
    'reanime.js'
]);

for (const file of fs.readdirSync(providersDir).sort()) {
    if (!file.endsWith('.js') || skip.has(file)) continue;
    const filePath = path.join(providersDir, file);
    let code = fs.readFileSync(filePath, 'utf8');
    const marker = code.indexOf('function nuvioDecode');
    if (marker !== -1) {
        const start = code.lastIndexOf('(function () {', marker);
        if (start !== -1) code = code.slice(0, start).replace(/\s+$/, '');
    }
    const name = names[file] || file.replace(/\.js$/, '');
    const block = template.replace('__PROVIDER_NAME__', JSON.stringify(name));
    fs.writeFileSync(filePath, code.replace(/\s+$/, '') + '\n\n' + block);
    console.log('formatted ' + file);
}

require('./apply-imdb');
