const crypto = require('crypto');

const BASE = 'https://ironsdk.net/api/sdk/';
const HMK = 'x7kkk0qmqz63kj68tla5i7u26192v7zqnnddhjgm';
const AES_KEY = Buffer.from('a4osa8x1yl4w3vrk', 'utf8');
const UA = 'speedrestapi';
const XRW = 'X509';
const REFERER = 'https://speedrestapi.com/';
const FORM_CT = 'application/x-www-form-urlencoded; charset=UTF-8';
const CF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0';
const CF_REFERER = 'https://github.com/';
const CF_CT = 'text/plain; charset=utf-8';
const CF_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9';
const CF_ACCEPT_LANG = 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7,la;q=0.6,de;q=0.5,zh-CN;q=0.4,zh-TW;q=0.3,zh;q=0.2,ru;q=0.1';
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const MIN_GAP_MS = 2000;

let timeOffset = 0;
let lastRequestAt = 0;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randAlnum(n) {
    let out = '';
    for (let i = 0; i < n; i++) out += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    return out;
}

function sha256Hex(s) {
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function sign(method, path, ts, nc, body) {
    const msg = method.toUpperCase() + '\n' + path + '\n' + ts + '\n' + nc + '\n' + sha256Hex(body);
    return crypto.createHmac('sha256', HMK).update(msg, 'utf8').digest('hex');
}

function decryptOnce(input) {
    const parts = String(input).trim().split(':');
    if (parts.length < 2) return null;
    const iv = Buffer.from(parts[1], 'base64');
    const data = Buffer.from(parts[0], 'base64');
    const d = crypto.createDecipheriv('aes-128-cbc', AES_KEY, iv);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

function decryptTwice(input) {
    let out = input;
    for (let i = 0; i < 3; i++) {
        const next = decryptOnce(out);
        if (next == null) return out;
        out = next;
        if (/^[\[{]/.test(out.trim())) return out;
    }
    return out;
}

async function pace() {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await sleep(wait + Math.floor(Math.random() * 400));
}

async function request(url, options) {
    const method = options.method || 'GET';
    const body = options.body || '';
    const signed = !!options.signed;
    await pace();
    lastRequestAt = Date.now();
    const ts = Math.floor(Date.now() / 1000) + timeOffset;
    const nc = crypto.randomBytes(16).toString('hex');
    const path = new URL(url).pathname;
    const headers = signed ? {
        'User-Agent': UA,
        'X-Requested-With': XRW,
        'Referer': REFERER,
        'Content-Type': FORM_CT,
        'X-Ts': String(ts),
        'X-Nc': nc,
        'X-Sg': sign(method, path, ts, nc, body)
    } : {
        'User-Agent': CF_UA,
        'Referer': CF_REFERER,
        'Content-Type': CF_CT,
        'Accept': CF_ACCEPT,
        'Accept-Language': CF_ACCEPT_LANG
    };
    const res = await fetch(url, { method, headers, body: method === 'GET' ? undefined : body, redirect: 'follow' });
    const st = res.headers.get('x-st');
    if (st) {
        const parsed = parseInt(st, 10);
        if (Number.isFinite(parsed)) timeOffset = parsed - Math.floor(Date.now() / 1000);
    }
    const text = await res.text();
    return { status: res.status, text, retryable: signed && res.status === 403 };
}

async function requestWithRetry(url, options) {
    let out = await request(url, options);
    if (out.retryable) {
        await sleep(1500);
        out = await request(url, options);
    }
    return out;
}

function parseMaybeJson(text) {
    const dec = decryptTwice(text);
    try { return { json: JSON.parse(dec), text: dec }; } catch (e) { return { json: null, text: dec }; }
}

async function main() {
    const handshakeBody = '1=' + randAlnum(16) + '&0=' + randAlnum(16);
    const first = await requestWithRetry(BASE, { method: 'POST', body: handshakeBody, signed: true });
    console.log('handshake', first.status);
    const firstParsed = parseMaybeJson(first.text);
    if (!firstParsed.json) {
        console.log('handshake raw', first.text.slice(0, 300));
        return;
    }
    console.log('handshake json', JSON.stringify(firstParsed.json, null, 2));

    const nextUrl = firstParsed.json.DC1;
    if (!nextUrl) return;
    const fullBody = '1=' + randAlnum(16) + '&0=' + randAlnum(16);
    const full = await requestWithRetry(nextUrl, { method: 'POST', body: fullBody, signed: true });
    console.log('config', full.status);
    const fullParsed = parseMaybeJson(full.text);
    if (!fullParsed.json) {
        console.log('config raw', full.text.slice(0, 300));
        return;
    }
    console.log('config json', JSON.stringify(fullParsed.json, null, 2));

    if (fullParsed.json.DC9) {
        const r = await request(fullParsed.json.DC9, { method: 'GET', signed: false });
        console.log('DC9', r.status, JSON.stringify(parseMaybeJson(r.text), null, 2));
    }
    if (fullParsed.json.DC10) {
        const r = await request(fullParsed.json.DC10, { method: 'GET', signed: false });
        console.log('DC10', r.status, JSON.stringify(parseMaybeJson(r.text), null, 2));
    }
}

main().catch((e) => {
    console.error('error', e && e.message ? e.message : e);
    process.exit(1);
});
