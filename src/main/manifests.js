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
// Steam requires .manifest files to sit directly in steamapps/depotcache/ —
// NOT in a subfolder. Many manifest ZIPs (Ryuu, DepotBox, etc.) nest files
// inside a folder named after the game/appid, so after extracting we flatten
// any .manifest files found in subdirectories up to destDir's root.
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

  // Extract into a fresh temp subfolder first, so we can safely flatten
  // without touching any files already sitting in destDir from other games.
  const extractTemp = path.join(app.getPath('temp'), `vex-extract-${Date.now()}`);
  fs.mkdirSync(extractTemp, { recursive: true });

  const { execSync } = require('child_process');
  try {
    execSync(`"${sevenPath}" x "${tempZip}" -o"${extractTemp}" -y`, { stdio: 'pipe' });
  } catch (err) {
    try { fs.unlinkSync(tempZip); } catch {}
    try { fs.rmSync(extractTemp, { recursive: true, force: true }); } catch {}
    return { success: false, error: `7za extraction failed: ${err.message}` };
  }

  try { fs.unlinkSync(tempZip); } catch {}

  // List everything that came out of the ZIP, no matter how deeply nested
  const extractedFiles = [];
  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        extractedFiles.push(fullPath);
      }
    }
  }
  walkDir(extractTemp);

  // Flatten: move every file up into destDir's root, regardless of nesting.
  // This guarantees .manifest files end up exactly where Steam looks for them.
  const files = [];
  for (const src of extractedFiles) {
    let target = path.join(destDir, path.basename(src));
    // Avoid clobbering an existing file with the same name
    if (fs.existsSync(target)) {
      const ext = path.extname(target);
      const base = path.basename(target, ext);
      target = path.join(destDir, `${base}_${Date.now()}${ext}`);
    }
    try {
      fs.renameSync(src, target);
      files.push(target);
    } catch (err) {
      // Cross-device rename can fail — fall back to copy
      try {
        fs.copyFileSync(src, target);
        files.push(target);
      } catch {}
    }
  }

  try { fs.rmSync(extractTemp, { recursive: true, force: true }); } catch {}

  if (files.length === 0) {
    return { success: false, error: 'ZIP extracted but contained no files (empty or unsupported archive format)' };
  }

  return { success: true, files };
}

// ─── Guess an AppID and game name from a ZIP's filename ───
// Manifest ZIPs are usually named like "1245620.zip", "Elden Ring 1245620.zip",
// or "1245620_manifests.zip" — pull out the longest digit run as the AppID.
function guessAppIdFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const digitRuns = base.match(/\d{2,8}/g) || [];
  // Prefer the longest run — AppIDs are usually 3-7 digits, dates/versions are noise
  const appId = digitRuns.sort((a, b) => b.length - a.length)[0] || null;
  let name = base;
  if (appId) {
    name = base.replace(appId, '').replace(/[_\-.]+/g, ' ').trim();
  }
  return { appId, name: name || null };
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

// ─── Import a manually-downloaded manifest ZIP ───
// The ZIP should contain .manifest files (and optionally .lua files)
// extracted from sites like Ryuu, DepotBox, etc.
async function importManifestZip(zipBuffer, appId, gameName, steamPath) {
  const results = {
    success: false,
    appId: appId || null,
    manifestsExtracted: 0,
    luaWritten: false,
    acfCreated: false,
    errors: [],
  };

  // Validate ZIP signature
  if (!zipBuffer || zipBuffer.length < 100) {
    results.errors.push('ZIP file is empty or too small');
    return results;
  }
  if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b) {
    results.errors.push('Not a valid ZIP file (missing PK signature)');
    return results;
  }

  // Extract to depotcache
  const depotCachePath = getDepotCachePath(steamPath);
  const extractResult = await extractZip(zipBuffer, depotCachePath);
  if (!extractResult.success) {
    results.errors.push(`Extraction failed: ${extractResult.error}`);
    return results;
  }

  // Find .manifest files that were extracted
  const manifestFiles = extractResult.files.filter(f => f.endsWith('.manifest'));
  results.manifestsExtracted = manifestFiles.length;
  results.manifestFiles = manifestFiles.map(f => path.basename(f));

  // Find .lua files and move them to stplug-in
  const luaFiles = extractResult.files.filter(f => f.endsWith('.lua'));
  if (luaFiles.length > 0) {
    try {
      const luaDir = path.join(steamPath, 'config', 'stplug-in');
      if (!fs.existsSync(luaDir)) fs.mkdirSync(luaDir, { recursive: true });

      for (const luaFile of luaFiles) {
        const luaName = path.basename(luaFile);
        let destPath;

        // If appId is provided, use {appId}.lua naming convention
        if (appId) {
          destPath = path.join(luaDir, `${appId}.lua`);
        } else {
          // Use the original filename from the ZIP
          destPath = path.join(luaDir, luaName);
        }

        // Copy the .lua file to stplug-in
        fs.copyFileSync(luaFile, destPath);
        results.luaWritten = true;
        results.luaPath = destPath;
      }
    } catch (err) {
      results.errors.push(`Failed to copy Lua file: ${err.message}`);
    }
  }

  // Create appmanifest ACF if we have an appId and manifest files
  if (appId && manifestFiles.length > 0) {
    const acfPath = path.join(steamPath, 'steamapps', `appmanifest_${appId}.acf`);
    if (!fs.existsSync(acfPath)) {
      try {
        // Parse depot/manifest IDs from filenames: {depotId}_{manifestId}.manifest
        const depotEntries = [];
        for (const mf of manifestFiles) {
          const match = path.basename(mf).match(/(\d+)_(\d+)\.manifest$/);
          if (match) {
            depotEntries.push({ depotId: match[1], manifestId: match[2] });
          }
        }

        if (depotEntries.length > 0) {
          const acf = `"appinfo"
{
  "appid"
  {
    "appid"   "${appId}"
  }
  "name"   "${gameName || `App ${appId}`}"
  "Universe"   "1"
  "installdir"   "${(gameName || `App ${appId}`).replace(/[<>:"/\\|?*]/g, '')}"
  "StateFlags"   "4"
  "AutoUpdateBehavior"   "0"
  "BytesToDownload"   "0"
  "BytesDownloaded"   "0"
  "SizeOnDisk"   "0"
  "InstalledDepots"
  {
${depotEntries.map(d => `    "${d.depotId}"
    {
      "manifest"   "${d.manifestId}"
      "size"   "0"
      "download"   "0"
    }`).join('\n')}
  }
}
`;
          fs.writeFileSync(acfPath, acf, 'utf-8');
          results.acfCreated = true;
          results.acfPath = acfPath;
        }
      } catch (err) {
        results.errors.push(`Failed to create ACF: ${err.message}`);
      }
    } else {
      results.acfCreated = false;
      results.acfPath = acfPath;
    }
  }

  results.success = results.manifestsExtracted > 0 || results.luaWritten;
  return results;
}

module.exports = {
  applyManifestsForApp,
  importManifestZip,
  guessAppIdFromFilename,
  checkProviderStatus,
  ryuuDownloadManifests,
  depotboxValidateManifest,
  extractZip,
  getCacheDir,
  RYUU_BASE,
  DEPOTBOX_BASE,
  MANIFEST_HUB_KEYSITE,
};
