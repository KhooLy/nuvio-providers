const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const providersDir = path.join(root, 'providers');
const template = fs.readFileSync(path.join(__dirname, 'liveness.template.js'), 'utf8').trim();

for (const file of fs.readdirSync(providersDir).sort()) {
    if (!file.endsWith('.js')) continue;
    const filePath = path.join(providersDir, file);
    let code = fs.readFileSync(filePath, 'utf8');
    const marker = code.indexOf('(function nuvioLivenessBootstrap()');
    if (marker !== -1) code = code.slice(0, marker).replace(/\s+$/, '');
    fs.writeFileSync(filePath, code.replace(/\s+$/, '') + '\n\n' + template + '\n');
    console.log('liveness ' + file);
}
