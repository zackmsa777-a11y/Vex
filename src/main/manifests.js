/* eslint-disable */
// Vex — Manifest Database Integration (v2 — Ryuu's Manifest API)
// Fetches depot manifests from Ryuu's Manifest API (generator.ryuu.lol)
// and places them in Steam's depotcache so SLSsteam-unlocked games can download.

const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { app } = require('electron');

// ─── API Sources ───
const RYUU_API = 'https://generator.ryuu.lol/api/download';
const RYUU_BASE = 'https://generator.ryuu.lol';
const DEPOTBOX_API = 'https://depotbox.org/api/tools/v1';
const DEPOTBOX_BASE = 'https://depotbox.org';

// ─── Fallback: ManifestHub2 (SSMGAlt fork on GitHub) ───
const MANIFEST_HUB_REPO = 'SSMGAlt/ManifestHub2';
const MANIFEST_HUB_API = 'https://api.manifesthub1.filegear-sg.me/manifest';
const MANIFEST_HUB_KEYSITE = 'https://manifesthub1.filegear-sg.me';

// ─── Local cache paths ───
function getCacheDir() {
  return path.join(app.getPath('userData'), 'manifest-cache');
}

// ─── HTTP helpers ───
function httpsGetBuffer(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('Too many redirects')); return; }
    const opts = new URL(url);
    const reqOpts = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: { ...headers },
    };
    https.get(reqOpts, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        res.resume();
        httpsGetBuffer(res.headers.location, headers, redirects + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function httpsGetText(url, headers = {}, redirects = 0) {
  return httpsGetBuffer(url, headers, redirects).then(b => b.toString('utf-8'));
}

// ─── Provider: Ryuu's Manifest API ───
// GET /api/download/{appid}?file_type=manifest → ZIP with .manifest files
// GET /api/download/{appid}?file_type=lua     → .lua script
// Auth: X-Auth-Key header (free key from generator.ryuu.lol)
async function ryuuDownloadManifests(appId, authKey) {
  if (!authKey) {
    return { success: false, error: 'No Ryuu auth key set. Register at generator.ryuu.lol to get a free key.' };
  }

  const headers = { 'X-Auth-Key': authKey };

  try {
    // Download manifests ZIP
    const zipBuffer = await httpsGetBuffer(`${RYUU_API}/${appId}?file_type=manifest`, headers);
    if (zipBuffer.length < 100) {
      return { success: false, error: 'Received empty or too-small response from Ryuu API' };
    }

    // Check if it's actually a ZIP (PK signature)
    if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b) {
      // Might be an error response in JSON/text
      const text = zipBuffer.toString('utf-8');
      return { success: false, error: `Ryuu API error: ${text.substring(0, 200)}` };
    }

    // Also try to get the .lua file
    let luaContent = null;
    try {
      const luaBuffer = await httpsGetBuffer(`${RYUU_API}/${appId}?file_type=lua`, headers);
      if (luaBuffer.length > 10 && luaBuffer[0] !== 0x50) {
        luaContent = luaBuffer.toString('utf-8');
      }
    } catch {}

    return { success: true, zipBuffer, luaContent };
  } catch (err) {
    return { success: false, error: `Ryuu API error: ${err.message}` };
  }
}

// ─── Provider: DepotBox (validation + manifest check) ───
async function depotboxValidateManifest(depotId, manifestId) {
  try {
    const body = JSON.stringify({
      manifests: [{ depot_id: Number(depotId), manifest_id: String(manifestId) }]
    });
    const response = await fetch(`${DEPOTBOX_API}/validate/manifests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json();
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Extract ZIP to directory ───
async function extractZip(zipBuffer, destDir) {
  // Use the bundled 7za to extract
  const sevenBin = require('7zip-bin');
  let sevenPath = sevenBin.path7za;
  if (sevenPath.includes('app.asar') && !sevenPath.includes('app.asar.unpacked')) {
    sevenPath = sevenPath.replace('app.asar', 'app.asar.unpacked');
  }
  if (!fs.existsSync(sevenPath)) {
    return { success: false, error: `7za binary not found at ${sevenPath}` };
  }
  try { fs.chmodSync(sevenPath, 0o755); } catch {}

  const tempZip = path.join(app.getPath('temp'), `vex-manifest-${Date.now()}.zip`);
  fs.writeFileSync(tempZip, zipBuffer);

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const { execSync } = require('child_process');
  execSync(`"${sevenPath}" x "${tempZip}" -o"${destDir}" -y`, { stdio: 'ignore' });

  try { fs.unlinkSync(tempZip); } catch {}

  // List extracted files
  const files = [];
  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  walkDir(destDir);

  return { success: true, files };
}

// ─── Get Steam depotcache path ───
function getDepotCachePath(steamPath) {
  const cachePath = path.join(steamPath, 'steamapps', 'depotcache');
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
  }
  return cachePath;
}

// ─── Main: fetch and apply manifests for a game ───
async function applyManifestsForApp(appId, gameName, steamPath, authKey) {
  const results = {
    success: false,
    appId,
    provider: 'ryuu',
    manifestsExtracted: 0,
    luaWritten: false,
    acfCreated: false,
    errors: [],
  };

  // 1. Download manifests from Ryuu's API
  const dlResult = await ryuuDownloadManifests(appId, authKey);
  if (!dlResult.success) {
    results.errors.push(dlResult.error);

    // Try fallback: ManifestHub2 (SSMGAlt fork)
    results.provider = 'manifesthub2';
    const mhResult = await tryManifestHub2(appId, steamPath, authKey);
    if (!mhResult.success) {
      results.errors.push(mhResult.error);
      return results;
    }
    results.manifestsExtracted = mhResult.manifestsExtracted || 0;
    results.acfCreated = mhResult.acfCreated || false;
    results.luaWritten = mhResult.luaWritten || false;
    results.success = results.manifestsExtracted > 0;
    return results;
  }

  // 2. Extract manifest ZIP to depotcache
  const depotCachePath = getDepotCachePath(steamPath);
  const extractResult = await extractZip(dlResult.zipBuffer, depotCachePath);
  if (!extractResult.success) {
    results.errors.push(`Extraction failed: ${extractResult.error}`);
    return results;
  }

  // Count .manifest files
  const manifestFiles = extractResult.files.filter(f => f.endsWith('.manifest'));
  results.manifestsExtracted = manifestFiles.length;
  results.manifestFiles = manifestFiles.map(f => path.basename(f));

  // 3. Write Lua file if provided
  if (dlResult.luaContent) {
    try {
      const luaDir = path.join(steamPath, 'config', 'stplug-in');
      if (!fs.existsSync(luaDir)) fs.mkdirSync(luaDir, { recursive: true });
      const luaPath = path.join(luaDir, `${appId}.lua`);
      fs.writeFileSync(luaPath, dlResult.luaContent, 'utf-8');
      results.luaWritten = true;
      results.luaPath = luaPath;
    } catch (err) {
      results.errors.push(`Failed to write Lua: ${err.message}`);
    }
  }

  // 4. Create minimal appmanifest ACF if it doesn't exist
  const acfPath = path.join(steamPath, 'steamapps', `appmanifest_${appId}.acf`);
  if (!fs.existsSync(acfPath)) {
    try {
      const acf = `"appinfo"\n{\n  "appid"\n  {\n    "appid"   "${appId}"\n  }\n  "name"   "${gameName || `App ${appId}`}"\n  "Universe"   "1"\n  "installdir"   "${(gameName || `App ${appId}`).replace(/[<>:"/\\\\|?*]/g, '')}"\n  "StateFlags"   "4"\n  "AutoUpdateBehavior"   "0"\n  "BytesToDownload"   "0"\n  "BytesDownloaded"   "0"\n  "SizeOnDisk"   "0"\n  "InstalledDepots"\n  {\n${manifestFiles.map(f => {
    const match = f.match(/(\d+)_(\d+)\.manifest$/);
    if (!match) return '';
    return `    "${match[1]}"\n    {\n      "manifest"   "${match[2]}"\n      "size"   "0"\n      "download"   "0"\n    }\n`;
  }).join('')}  }\n}\n`;
      fs.writeFileSync(acfPath, acf, 'utf-8');
      results.acfCreated = true;
      results.acfPath = acfPath;
    } catch (err) {
      results.errors.push(`Failed to create ACF: ${err.message}`);
    }
  } else {
    results.acfCreated = false;
    results.acfPath = acfPath;
  }

  results.success = results.manifestsExtracted > 0;
  return results;
}

// ─── Fallback: ManifestHub2 (SSMGAlt fork) ───
async function tryManifestHub2(appId, steamPath, apiKey) {
  // The SSMGAlt fork uses the same API endpoint — check if it's online
  try {
    const testBuffer = await httpsGetBuffer(`${MANIFEST_HUB_API}?apikey=test&depotid=0&manifestid=0`);
    return { success: false, error: 'ManifestHub2 API is also offline (same server as original)' };
  } catch {
    return { success: false, error: 'ManifestHub2 API is offline (same server as original ManifestHub)' };
  }
}

// ─── Check provider status ───
async function checkProviderStatus() {
  const status = {
    ryuu: { online: false, url: RYUU_BASE },
    depotbox: { online: false, url: DEPOTBOX_BASE },
    manifesthub: { online: false, url: MANIFEST_HUB_KEYSITE },
  };

  // Check Ryuu
  try {
    await httpsGetText(RYUU_BASE);
    status.ryuu.online = true;
  } catch {}

  // Check DepotBox
  try {
    await httpsGetText(DEPOTBOX_BASE);
    status.depotbox.online = true;
  } catch {}

  // Check ManifestHub
  try {
    await httpsGetBuffer(MANIFEST_HUB_API);
    status.manifesthub.online = true;
  } catch {}

  return status;
}

module.exports = {
  applyManifestsForApp,
  checkProviderStatus,
  ryuuDownloadManifests,
  depotboxValidateManifest,
  extractZip,
  getCacheDir,
  RYUU_BASE,
  DEPOTBOX_BASE,
  MANIFEST_HUB_KEYSITE,
};
