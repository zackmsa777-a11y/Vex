/* eslint-disable */
// Vex — Download Provider Detection (adapted from Lightning)
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const BUZZHEAVIER_DOMAINS = ['buzzheavier.com', 'bzzhr.co', 'bzzhr.to', 'fuckingfast.net'];
const MEGADB_DOMAINS = ['megadb.net', 'megadb.xyz'];
const ROOTZ_DOMAINS = ['rootz.so'];
const HOSTER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function isTorrentUrl(url) {
  const l = String(url || '').toLowerCase();
  return l.startsWith('magnet:') || l.endsWith('.torrent');
}
function isBuzzheavierUrl(url) {
  return BUZZHEAVIER_DOMAINS.some(d => String(url || '').toLowerCase().includes(d));
}
function isRootzUrl(url) {
  return ROOTZ_DOMAINS.some(d => String(url || '').toLowerCase().includes(d));
}
function isMegadbUrl(url) {
  return MEGADB_DOMAINS.some(d => String(url || '').toLowerCase().includes(d));
}

function detectProvider(url) {
  if (isTorrentUrl(url)) return 'torrent';
  if (isRootzUrl(url)) return 'rootz';
  if (isBuzzheavierUrl(url)) return 'buzzheavier';
  if (isMegadbUrl(url)) return 'megadb';
  return 'gofile';
}

// ─── Resolve direct link per provider ───
async function resolveDirectLink(url, provider) {
  if (!provider || provider === 'auto') provider = detectProvider(url);

  switch (provider) {
    case 'buzzheavier': return resolveBuzzheavier(url);
    case 'gofile': return resolveGoFile(url);
    case 'rootz': return resolveRootz(url);
    case 'megadb': return resolveMegadb(url);
    case 'torrent': return { directLink: url, filename: '', isTorrent: true };
    default: return resolveGoFile(url);
  }
}

// Buzzheavier (from Lightning)
async function resolveBuzzheavier(url) {
  const baseUrl = url.split('#')[0].replace(/\/+$/, '');
  const headers = { 'User-Agent': HOSTER_UA, 'Accept': '*/*' };

  // Warm up session
  await requestRaw(baseUrl, { method: 'GET', headers });

  // HTMX download endpoint
  const dlUrl = `${baseUrl}/download`;
  const headRes = await requestRaw(dlUrl, {
    method: 'HEAD',
    headers: { ...headers, 'hx-request': 'true', 'hx-current-url': baseUrl, 'Referer': baseUrl },
  });

  const redirect = headRes.headers?.['hx-redirect'] || headRes.headers?.location;
  if (!redirect) throw new Error('Buzzheavier: no redirect found');

  const directLink = new URL(redirect, baseUrl).toString();
  return { directLink, filename: getFilenameFromUrl(directLink), requestHeaders: { 'User-Agent': HOSTER_UA, 'Referer': baseUrl } };
}

// GoFile
async function resolveGoFile(url) {
  const fileId = url.match(/(?:\/|id=)([\w-]+)(?:\?|$)/)?.[1] || url.split('/').pop();
  if (!fileId) throw new Error('GoFile: could not parse file ID');

  // Get content info
  const infoRes = await fetchJson(`https://api.gofile.io/getContent?contentCode=${fileId}`);
  if (!infoRes?.data?.contents) throw new Error('GoFile: content not found');

  const contents = Object.values(infoRes.data.contents);
  if (!contents.length) throw new Error('GoFile: empty content');

  const file = contents[0];
  return {
    directLink: file.link,
    filename: file.name,
    requestHeaders: {},
    passwordProtected: !!infoRes.data.password,
  };
}

// Rootz
async function resolveRootz(url) {
  // Rootz provides direct download links after following redirects
  const res = await requestWithRedirects(url, { method: 'HEAD', headers: { 'User-Agent': HOSTER_UA } });
  return { directLink: url, filename: getFilenameFromUrl(url), requestHeaders: { 'User-Agent': HOSTER_UA } };
}

// MegaDB
async function resolveMegadb(url) {
  // MegaDB resolves with a simple GET
  const res = await requestWithRedirects(url, { method: 'HEAD', headers: { 'User-Agent': HOSTER_UA } });
  const disposition = res.headers?.['content-disposition'] || '';
  const filename = disposition.match(/filename="?([^";\n]+)"?/)?.[1] || getFilenameFromUrl(url);
  return { directLink: url, filename, requestHeaders: { 'User-Agent': HOSTER_UA } };
}

// ─── HTTP helpers ───
function requestRaw(url, { method = 'GET', headers = {}, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'http:' ? http : https;
    const req = transport.request({
      hostname: parsed.hostname, port: parsed.port, path: `${parsed.pathname}${parsed.search}`,
      method, headers, family: 4,
    }, (res) => {
      res.resume();
      resolve({ status: res.statusCode || 0, headers: res.headers || {} });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function requestWithRedirects(url, opts, redirects = 5) {
  const res = await requestRaw(url, opts);
  const loc = res.headers?.location;
  if (loc && [301, 302, 303, 307, 308].includes(res.status) && redirects > 0) {
    return requestWithRedirects(new URL(loc, url).toString(), opts, redirects - 1);
  }
  return res;
}

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

function getFilenameFromUrl(url) {
  try { return path.basename(new URL(url).pathname) || 'download'; } catch { return 'download'; }
}

// ─── Download Manager ───
let currentDownload = null;
let cancelled = false;
let paused = false;

async function startDownload(url, title, savePath, provider, onProgress) {
  cancelled = false;
  paused = false;

  const resolved = await resolveDirectLink(url, provider);
  const filePath = path.join(savePath, resolved.filename || `${title}.bin`);

  if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

  if (resolved.isTorrent) {
    // WebTorrent would go here — for now return a placeholder
    return { success: false, error: 'Torrent downloads require WebTorrent (not yet implemented)' };
  }

  return new Promise((resolve) => {
    const parsed = new URL(resolved.directLink);
    const transport = parsed.protocol === 'http:' ? http : https;
    const headers = { ...resolved.requestHeaders };
    if (currentDownload?.total) headers.Range = `bytes=${currentDownload.received}-`;

    const req = transport.request({
      hostname: parsed.hostname, port: parsed.port, path: `${parsed.pathname}${parsed.search}`,
      method: 'GET', headers, family: 4,
    }, (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }

      const total = parseInt(res.headers['content-length'] || '0');
      const file = fs.createWriteStream(filePath);
      let received = 0;
      let startTime = Date.now();
      let lastTick = startTime;
      let lastBytes = 0;

      res.on('data', (chunk) => {
        if (cancelled) { res.destroy(); file.close(); fs.unlinkSync(filePath); return; }
        if (paused) { res.pause(); return; }

        received += chunk.length;
        file.write(chunk);

        const now = Date.now();
        if (now - lastTick >= 500) {
          const speed = (received - lastBytes) / ((now - lastTick) / 1000);
          const percent = total ? Math.round((received / total) * 100) : 0;
          const eta = speed > 0 ? Math.ceil((total - received) / speed) : 0;

          onProgress({
            title, filename: resolved.filename,
            received, total, percent,
            speed: formatSpeed(speed), eta: eta > 0 ? `${eta}s` : '—',
            path: filePath,
          });

          lastTick = now;
          lastBytes = received;
        }
      });

      res.on('end', () => {
        file.close();
        if (cancelled) return;
        onProgress({ title, filename: resolved.filename, received, total, percent: 100, speed: '—', eta: 'Done', path: filePath, done: true });
        resolve({ success: true, path: filePath, filename: resolved.filename });
      });

      res.on('error', (err) => {
        file.close();
        resolve({ success: false, error: err.message });
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.end();
  });
}

function formatSpeed(bps) {
  const mb = bps / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB/s`;
  return `${(mb / 1024).toFixed(2)} GB/s`;
}

function pauseDownload() { paused = true; return { success: true }; }
function resumeDownload() { paused = false; return { success: true }; }
function cancelDownload() { cancelled = true; return { success: true }; }

module.exports = {
  detectProvider, resolveDirectLink, startDownload,
  pauseDownload, resumeDownload, cancelDownload,
};
