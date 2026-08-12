/* eslint-disable */
// Vex — Manifest Database Integration
// Fetches and applies Steam depot manifests from ManifestHub
// so SLSsteam-unlocked games can actually download content.

const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { app } = require('electron');

const MANIFEST_HUB_REPO = 'dvahana2424-web/sojogamesdatabase1';
const MANIFEST_HUB_API = 'https://api.manifesthub1.filegear-sg.me/manifest';
const MANIFEST_HUB_KEYSITE = 'https://manifesthub1.filegear-sg.me';

// ─── Local cache paths ───
function getCacheDir() {
  return path.join(app.getPath('userData'), 'manifest-cache');
}

function getTokensPath() {
  return path.join(getCacheDir(), 'appaccesstokens.json');
}

function getDepotKeysPath() {
  return path.join(getCacheDir(), 'depotkeys.json');
}

// ─── HTTP helpers ───
function httpsGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('Too many redirects')); return; }
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        httpsGet(res.headers.location, redirects + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function httpsDownloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('Too many redirects')); return; }
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        httpsDownloadFile(res.headers.location, dest, redirects + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Database sync (fetch appaccesstokens.json + depotkeys.json) ───
async function syncManifestDatabase() {
  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const results = { tokens: false, depotKeys: false, error: null };

  try {
    const tokensRaw = await httpsGet(`https://raw.githubusercontent.com/${MANIFEST_HUB_REPO}/main/appaccesstokens.json`);
    fs.writeFileSync(getTokensPath(), tokensRaw);
    results.tokens = true;
    results.tokenCount = Object.keys(JSON.parse(tokensRaw)).length;
  } catch (err) {
    results.error = `Failed to fetch appaccesstokens.json: ${err.message}`;
  }

  try {
    const keysRaw = await httpsGet(`https://raw.githubusercontent.com/${MANIFEST_HUB_REPO}/main/depotkeys.json`);
    fs.writeFileSync(getDepotKeysPath(), keysRaw);
    results.depotKeys = true;
    results.keyCount = Object.keys(JSON.parse(keysRaw)).length;
  } catch (err) {
    if (!results.error) results.error = `Failed to fetch depotkeys.json: ${err.message}`;
  }

  return results;
}

// ─── Look up access token for an AppID ───
function getAccessToken(appId) {
  const tokensPath = getTokensPath();
  if (!fs.existsSync(tokensPath)) return null;
  try {
    const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
    return tokens[String(appId)] || null;
  } catch { return null; }
}

// ─── Look up depot key for a depot ID ───
function getDepotKey(depotId) {
  const keysPath = getDepotKeysPath();
  if (!fs.existsSync(keysPath)) return null;
  try {
    const keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
    return keys[String(depotId)] || null;
  } catch { return null; }
}

// ─── Get depot IDs and manifest IDs for an AppID ───
// Uses the Steam store API to get depot info, falls back to PICS API
async function getAppDepots(appId) {
  // Method 1: Steam store API (public, no auth needed)
  try {
    const raw = await httpsGet(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=en`);
    const data = JSON.parse(raw);
    const appData = data[String(appId)];
    if (appData && appData.success && appData.data && appData.data.depots) {
      const depots = [];
      const depotMap = appData.data.depots;
      for (const [depotId, info] of Object.entries(depotMap)) {
        // Skip branch/group/metadata entries that aren't real depots
        if (depotId === 'branches' || depotId === 'baselanguages' || typeof info !== 'object') continue;
        if (!info.manifests && !info.manifest) continue;

        // Handle both formats: { manifests: { "0": { gid: "...", size: ... } } } and { manifest: { gid: "..." } }
        let manifestId = null;
        let size = null;
        if (info.manifests) {
          const firstKey = Object.keys(info.manifests)[0];
          if (firstKey) {
            manifestId = info.manifests[firstKey].gid || info.manifests[firstKey];
            size = info.manifests[firstKey].size;
          }
        } else if (info.manifest) {
          manifestId = info.manifest.gid || info.manifest;
          size = info.manifest.size;
        }

        if (manifestId) {
          depots.push({
            depotId: String(depotId),
            manifestId: String(manifestId),
            size,
          });
        }
      }
      if (depots.length > 0) return depots;
    }
  } catch (err) {
    // Fall through to method 2
  }

  // Method 2: Steam PICS API (anonymous access via content server)
  // Get the latest manifest IDs by querying the Steam CDN
  try {
    const raw = await httpsGet(`https://api.steampowered.com/ISteamApps/GetAppList/v2/`);
    // This only gives app names, not depot info. We need a different approach.
    // For now, return empty - the user will need to provide depot/manifest IDs manually
  } catch {}

  return [];
}

// ─── Fetch a manifest file from ManifestHub API ───
async function fetchManifestFromHub(depotId, manifestId, apiKey) {
  if (!apiKey) {
    return { success: false, error: 'No ManifestHub API key provided. Get a free key at ' + MANIFEST_HUB_KEYSITE };
  }

  const url = `${MANIFEST_HUB_API}?apikey=${encodeURIComponent(apiKey)}&depotid=${encodeURIComponent(depotId)}&manifestid=${encodeURIComponent(manifestId)}`;

  try {
    const data = await httpsGet(url);
    // The API returns the manifest as binary data
    return { success: true, data: Buffer.from(data, 'binary') };
  } catch (err) {
    return { success: false, error: `ManifestHub API error: ${err.message}` };
  }
}

// ─── Get Steam depotcache path ───
function getDepotCachePath(steamPath) {
  const cachePath = path.join(steamPath, 'steamapps', 'depotcache');
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
  }
  return cachePath;
}

// ─── Create a minimal appmanifest_<AppID>.acf ───
function createAppManifest(steamPath, appId, gameName, depots) {
  const manifestPath = path.join(steamPath, 'steamapps', `appmanifest_${appId}.acf`);

  // Check if manifest already exists — don't overwrite if it does
  if (fs.existsSync(manifestPath)) {
    return { success: true, path: manifestPath, existed: true };
  }

  const installedDepots = {};
  for (const depot of depots) {
    installedDepots[depot.depotId] = {
      manifest: depot.manifestId,
      size: depot.size || 0,
      download: 0,
    };
  }

  // Build the ACF file (Steam's KeyValue format)
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
  "TargetBuildID"   ""
  "AutoUpdateBehavior"   "0"
  "ScheduledAutoUpdate"   ""
  "AllowOtherDownloadsWhileRunning"   "0"
  "SlowdownEnabled"   "0"
  "BytesToDownload"   "0"
  "BytesDownloaded"   "0"
  "BytesToStage"   "0"
  "BytesStaged"   "0"
  "BuildID"   ""
  "LastUpdate"   ""
  "SizeOnDisk"   "0"
  "InstalledDepots"
  {
${Object.entries(installedDepots).map(([depotId, info]) =>
`    "${depotId}"
    {
      "manifest"   "${info.manifest}"
      "size"   "${info.size}"
      "download"   "${info.download}"
    }`).join('\n')}
  }
}
`;

  fs.writeFileSync(manifestPath, acf, 'utf-8');
  return { success: true, path: manifestPath, existed: false };
}

// ─── Main: fetch and apply manifests for a game ───
async function applyManifestsForApp(appId, gameName, steamPath, apiKey) {
  const results = {
    success: false,
    appId,
    depotsFound: 0,
    manifestsFetched: 0,
    manifestsCached: 0,
    appManifestCreated: false,
    depotKeyAvailable: 0,
    errors: [],
  };

  // 1. Ensure database is synced
  if (!fs.existsSync(getTokensPath()) || !fs.existsSync(getDepotKeysPath())) {
    const syncResult = await syncManifestDatabase();
    if (!syncResult.tokens && !syncResult.depotKeys) {
      results.errors.push('Failed to sync manifest database');
      return results;
    }
  }

  // 2. Get depot IDs and manifest IDs for the app
  const depots = await getAppDepots(appId);
  if (depots.length === 0) {
    results.errors.push('Could not find depot info for this AppID (Steam store API returned no depots)');
    return results;
  }
  results.depotsFound = depots.length;

  // 3. For each depot, fetch manifest from ManifestHub and cache it
  const depotCachePath = getDepotCachePath(steamPath);

  for (const depot of depots) {
    // Check if we have the depot key
    const depotKey = getDepotKey(depot.depotId);
    if (depotKey) {
      results.depotKeyAvailable++;
    }

    // Fetch manifest from ManifestHub
    const manifestResult = await fetchManifestFromHub(depot.depotId, depot.manifestId, apiKey);
    if (manifestResult.success) {
      results.manifestsFetched++;

      // Save to depotcache
      const manifestFileName = `${depot.depotId}_${depot.manifestId}.manifest`;
      const manifestFilePath = path.join(depotCachePath, manifestFileName);
      try {
        fs.writeFileSync(manifestFilePath, manifestResult.data);
        results.manifestsCached++;
      } catch (err) {
        results.errors.push(`Failed to write manifest ${manifestFileName}: ${err.message}`);
      }
    } else {
      results.errors.push(`Depot ${depot.depotId}: ${manifestResult.error}`);
    }
  }

  // 4. Create appmanifest ACF file
  const acfResult = createAppManifest(steamPath, appId, gameName, depots);
  results.appManifestCreated = !acfResult.existed;
  results.acfPath = acfResult.path;

  // 5. Also save depot keys to a Lua config so SLSsteam can use them
  if (results.depotKeyAvailable > 0) {
    try {
      const luaPath = path.join(steamPath, 'config', 'stplug-in', `${appId}.lua`);
      const luaDir = path.dirname(luaPath);
      if (!fs.existsSync(luaDir)) fs.mkdirSync(luaDir, { recursive: true });

      let luaContent = `-- Vex auto-generated depot keys for AppID ${appId}\n`;
      for (const depot of depots) {
        const key = getDepotKey(depot.depotId);
        if (key) {
          luaContent += `-- Depot ${depot.depotId} key\n`;
          luaContent += `set_depot_key("${depot.depotId}", "${key}")\n`;
        }
      }
      fs.writeFileSync(luaPath, luaContent, 'utf-8');
      results.luaKeysWritten = true;
    } catch (err) {
      results.errors.push(`Failed to write Lua depot keys: ${err.message}`);
    }
  }

  results.success = results.manifestsCached > 0 || results.appManifestCreated;
  return results;
}

// ─── Get database stats ───
function getDatabaseStats() {
  const stats = {
    tokensCached: false,
    keysCached: false,
    tokenCount: 0,
    keyCount: 0,
    lastSync: null,
  };

  const tokensPath = getTokensPath();
  const keysPath = getDepotKeysPath();

  if (fs.existsSync(tokensPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
      stats.tokensCached = true;
      stats.tokenCount = Object.keys(tokens).length;
    } catch {}
  }

  if (fs.existsSync(keysPath)) {
    try {
      const keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
      stats.keysCached = true;
      stats.keyCount = Object.keys(keys).length;
    } catch {}
  }

  return stats;
}

// ─── Check if an AppID exists in the database ───
function isAppInDatabase(appId) {
  const tokensPath = getTokensPath();
  if (!fs.existsSync(tokensPath)) return false;
  try {
    const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
    return String(appId) in tokens;
  } catch { return false; }
}

module.exports = {
  syncManifestDatabase,
  getAccessToken,
  getDepotKey,
  getAppDepots,
  applyManifestsForApp,
  getDatabaseStats,
  isAppInDatabase,
  getCacheDir,
  MANIFEST_HUB_KEYSITE,
};
