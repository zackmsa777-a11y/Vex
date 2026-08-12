/* eslint-disable */
// Vex — Main Process
// Linux-first Steam game setup companion using SLSsteam injection

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec, execSync } = require('child_process');
const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');

let mainWindow = null;

// ─── Linux sandbox fix (same as Lightning) ───
if (process.platform === 'linux') {
  process.env.ELECTRON_DISABLE_SANDBOX = '1';
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
}

// ─── Steam Path Detection (from SFF) ───
function validateSteamPath(p) {
  if (!p) return false;
  try { return fs.existsSync(path.join(p, 'steamapps')); } catch { return false; }
}

function getLinuxSteamCandidates() {
  const home = os.homedir();
  return [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
    path.join(home, 'snap', 'steam', 'common', '.steam', 'steam'),
  ];
}

function detectSteamPath() {
  // Check saved config first
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.steamPath && validateSteamPath(config.steamPath)) {
        return { path: config.steamPath, type: 'saved' };
      }
    } catch {}
  }
  // Probe Linux candidates
  for (const candidate of getLinuxSteamCandidates()) {
    try {
      const real = fs.realpathSync(candidate);
      if (validateSteamPath(real)) {
        return { path: real, type: candidate.includes('.var/app') ? 'flatpak' : 'native' };
      }
    } catch {}
  }
  return null;
}

function saveConfig(key, value) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  let config = {};
  try {
    if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {}
  config[key] = value;
  try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2)); } catch {}
}

function getConfig(key, fallback) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    if (!fs.existsSync(configPath)) return fallback;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config[key] ?? fallback;
  } catch { return fallback; }
}

// ─── Steam Process Management ───
function isSteamRunning() {
  try {
    const output = execSync('pgrep -x steam 2>/dev/null || pgrep -f "steam.sh" 2>/dev/null', { encoding: 'utf-8' });
    return output.trim().length > 0;
  } catch { return false; }
}

function killSteam() {
  try { execSync('pkill -x steam 2>/dev/null; pkill -f "steam.sh" 2>/dev/null', { stdio: 'ignore' }); } catch {}
}

// ─── SLSsteam install location ───
// IMPORTANT: SLSsteam does NOT live inside the Steam directory and does NOT use
// LD_PRELOAD. Per the official installer (AceSLS/SLSsteam setup.sh) it installs to
// ~/.local/share/SLSsteam/ (or the Flatpak-scoped equivalent) and is loaded via
// LD_AUDIT, in the order "library-inject.so:SLSsteam.so". This is what lets the
// loader attach to the real (64-bit) Steam client process without erroring out on
// the 32-bit bootstrap script — each process independently validates the audit
// libraries against its own ELF class instead of aborting the whole preload chain.
function getSLSDir() {
  const steamInfo = detectSteamPath();
  const home = os.homedir();
  if (steamInfo && steamInfo.type === 'flatpak') {
    return path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'SLSsteam');
  }
  return path.join(home, '.local', 'share', 'SLSsteam');
}

function isFlatpakSteam() {
  const steamInfo = detectSteamPath();
  return !!(steamInfo && steamInfo.type === 'flatpak');
}

function startSteam(withInjection = false) {
  const steamInfo = detectSteamPath();
  if (!steamInfo) return { success: false, error: 'Steam path not found' };

  const slsDir = getSLSDir();
  const slsPath = path.join(slsDir, 'SLSsteam.so');
  const injectPath = path.join(slsDir, 'library-inject.so');
  const hasInjection = fs.existsSync(slsPath) && fs.existsSync(injectPath);

  if (withInjection && hasInjection) {
    // Order matters: library-inject.so must come first, then SLSsteam.so
    const auditValue = `${injectPath}:${slsPath}`;

    if (isFlatpakSteam()) {
      spawn('flatpak', ['run', `--env=LD_AUDIT=${auditValue}`, 'com.valvesoftware.Steam'], {
        detached: true, stdio: 'ignore',
      }).unref();
    } else {
      const env = { ...process.env, LD_AUDIT: auditValue };
      spawn('steam', [], { env, detached: true, stdio: 'ignore' }).unref();
    }
    return { success: true, injected: true, message: 'Steam started with SLSsteam injection (LD_AUDIT)' };
  } else {
    if (isFlatpakSteam()) {
      spawn('flatpak', ['run', 'com.valvesoftware.Steam'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('steam', [], { detached: true, stdio: 'ignore' }).unref();
    }
    if (withInjection) {
      return { success: true, injected: false, message: 'Steam started (SLSsteam libraries not found — run "Set up Linux tools" first)' };
    }
    return { success: true, injected: false, message: 'Steam started' };
  }
}

function launchGame(appId) {
  if (!isSteamRunning()) {
    const result = startSteam(true);
    if (!result.success) return { success: false, error: 'Could not start Steam' };
  }
  // Fire steam://run/<appid>
  shell.openExternal(`steam://run/${appId}`);
  return { success: true, message: `Launching ${appId}` };
}

// ─── SLSsteam Setup (installs to ~/.local/share/SLSsteam via the official 7z release) ───
function checkLinuxTools() {
  const slsDir = getSLSDir();
  const slsPath = path.join(slsDir, 'SLSsteam.so');
  const injectPath = path.join(slsDir, 'library-inject.so');

  let dotnet = false;
  try {
    const output = execSync('dotnet --list-runtimes 2>/dev/null', { encoding: 'utf-8' });
    dotnet = output.includes('9.');
  } catch {}

  return {
    slssteam: fs.existsSync(slsPath),
    libraryInject: fs.existsSync(injectPath),
    dotnet,
    slsPath,
    injectPath,
  };
}

async function setupSLSsteam() {
  const steamInfo = detectSteamPath();
  if (!steamInfo) return { success: false, error: 'Steam path not found' };

  const https = require('https');
  const slsDir = getSLSDir();
  if (!fs.existsSync(slsDir)) fs.mkdirSync(slsDir, { recursive: true });

  // The official releases only ship a packed archive (SLSsteam-Any.7z) containing
  // bin/SLSsteam.so, bin/library-inject.so, and res/config.yaml — there is no raw
  // per-file download. Fetch the archive, extract with the bundled 7za binary.
  const RELEASE_URL = 'https://github.com/AceSLS/SLSsteam/releases/latest/download/SLSsteam-Any.7z';
  const archivePath = path.join(app.getPath('temp'), 'SLSsteam-Any.7z');

  function downloadFile(url, dest, redirects = 0) {
    return new Promise((resolve, reject) => {
      if (redirects > 5) { reject(new Error('Too many redirects')); return; }
      const file = fs.createWriteStream(dest);
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close();
          downloadFile(response.headers.location, dest, redirects + 1).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
        file.on('error', reject);
      }).on('error', reject);
    });
  }

  try {
    await downloadFile(RELEASE_URL, archivePath);

    // Extract using the 7za binary bundled via the 7zip-bin package.
    // IMPORTANT: 7za is a real binary, not JS — it can't be executed from
    // inside app.asar (asar is a virtual archive, not a real filesystem).
    // asarUnpack in package.json copies it to app.asar.unpacked/ at build
    // time; this path-swap is a defensive fallback in case Electron's
    // automatic asar-unpack redirection doesn't kick in for execSync.
    const sevenBin = require('7zip-bin');
    let sevenPath = sevenBin.path7za;
    if (sevenPath.includes('app.asar') && !sevenPath.includes('app.asar.unpacked')) {
      sevenPath = sevenPath.replace('app.asar', 'app.asar.unpacked');
    }
    if (!fs.existsSync(sevenPath)) {
      return { success: false, error: `7za binary not found at ${sevenPath} — packaging issue, please report this` };
    }
    try { fs.chmodSync(sevenPath, 0o755); } catch {}

    const extractDir = path.join(app.getPath('temp'), 'sls-extract');
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });

    execSync(`"${sevenPath}" x "${archivePath}" -o"${extractDir}" -y`, { stdio: 'ignore' });

    const soSrc = path.join(extractDir, 'bin', 'SLSsteam.so');
    const injectSrc = path.join(extractDir, 'bin', 'library-inject.so');
    const configTemplateSrc = path.join(extractDir, 'res', 'config.yaml');

    if (!fs.existsSync(soSrc) || !fs.existsSync(injectSrc)) {
      return { success: false, error: 'Archive did not contain expected bin/SLSsteam.so and bin/library-inject.so' };
    }

    fs.copyFileSync(soSrc, path.join(slsDir, 'SLSsteam.so'));
    fs.copyFileSync(injectSrc, path.join(slsDir, 'library-inject.so'));

    // Seed the official default config.yaml if the user doesn't have one yet
    ensureSLSConfig(configTemplateSrc);

    // Cleanup temp files
    try { fs.unlinkSync(archivePath); } catch {}
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}

    // For Flatpak Steam, also set the LD_AUDIT override so it applies automatically
    if (isFlatpakSteam()) {
      try {
        const auditValue = `${path.join(slsDir, 'library-inject.so')}:${path.join(slsDir, 'SLSsteam.so')}`;
        execSync(`flatpak override --user --env=LD_AUDIT="${auditValue}" com.valvesoftware.Steam`, { stdio: 'ignore' });
      } catch {}
    }

    return { success: true, message: `SLSsteam installed to ${slsDir}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Lua Script Writing (optional, for custom stplug-in style scripts) ───
// NOTE: this is a supplementary/manual mechanism. The thing that actually makes
// SLSsteam treat an AppID as owned is the AdditionalApps entry in config.yaml
// (see addSLSApp below) — writeLuaConfig always keeps that in sync too, so every
// "Add Game" / "Apply Fix" flow in the UI works whether or not it passes Lua content.
function removeLegacyZeroByteManifest(steamPath, appId) {
  const manifestPath = path.join(steamPath, 'steamapps', `appmanifest_${appId}.acf`);
  try {
    if (!fs.existsSync(manifestPath)) return false;
    const manifest = fs.readFileSync(manifestPath, 'utf-8');
    const isLegacyVexPlaceholder = /"StateFlags"\s+"4"/.test(manifest)
      && /"SizeOnDisk"\s+"0"/.test(manifest)
      && /"buildid"\s+"0"/.test(manifest);
    if (!isLegacyVexPlaceholder) return false;
    fs.unlinkSync(manifestPath);
    return true;
  } catch {
    return false;
  }
}

function writeLuaConfig(appId, gameName, luaContent) {
  const steamInfo = detectSteamPath();
  if (!steamInfo) return { success: false, error: 'Steam path not found' };

  const steamPath = steamInfo.path;
  const luaDir = path.join(steamPath, 'config', 'stplug-in');
  if (!fs.existsSync(luaDir)) {
    fs.mkdirSync(luaDir, { recursive: true });
  }

  const luaPath = path.join(luaDir, `${appId}.lua`);

  let content = luaContent;
  if (!content) {
    content = `-- Vex auto-generated config for AppID ${appId}\n-- Game: ${gameName}\nreturn {\n  appid = ${appId},\n  name = "${gameName}",\n  launch = true\n}\n`;
  }

  try {
    fs.writeFileSync(luaPath, content, 'utf-8');
  } catch (err) {
    return { success: false, error: err.message };
  }

  // This is the part that actually registers the game with SLSsteam
  const slsResult = addSLSApp(appId, gameName);

  if (!slsResult.success) {
    return { success: false, error: slsResult.error || 'Failed to update SLSsteam config' };
  }

  // Remove only the broken placeholder written by Vex <=1.1.1. Steam will
  // recreate a real manifest with depot/size data through steam://install.
  removeLegacyZeroByteManifest(steamPath, appId);

  return {
    success: true,
    path: luaPath,
    message: `Lua written to ${luaPath}; Steam config updated`,
  };
}

function readLuaConfig(appId) {
  const steamInfo = detectSteamPath();
  if (!steamInfo) return null;
  const luaPath = path.join(steamInfo.path, 'config', 'stplug-in', `${appId}.lua`);
  if (!fs.existsSync(luaPath)) return null;
  try { return fs.readFileSync(luaPath, 'utf-8'); } catch { return null; }
}

function deleteLuaConfig(appId) {
  const steamInfo = detectSteamPath();
  let luaDeleted = false;
  if (steamInfo) {
    const luaPath = path.join(steamInfo.path, 'config', 'stplug-in', `${appId}.lua`);
    try { if (fs.existsSync(luaPath)) { fs.unlinkSync(luaPath); luaDeleted = true; } } catch {}
  }
  removeSLSApp(appId);
  return luaDeleted;
}

// ─── SLSsteam Config (YAML) ───
// Official, single correct location per AceSLS/SLSsteam docs: ~/.config/SLSsteam/config.yaml
function getSLSConfigPath() {
  const home = os.homedir();
  return path.join(home, '.config', 'SLSsteam', 'config.yaml');
}

const DEFAULT_SLS_CONFIG = `#Example AppIds Config for those not familiar with YAML:
#AppIds:
#  - 440
#  - 730
#Take care of not messing up your spaces! Otherwise it won't work
#Disables Family Share license locking for self and others
DisableFamilyShareLock: yes
#Switches to whitelist instead of the default blacklist
UseWhitelist: no
#List of AppIds to ex-/include.
AppIds:
#Additional AppIds to inject (games Vex has unlocked that you don't own)
AdditionalApps:
#Extra Data for Dlcs belonging to a specific AppId
DlcData:
#Override game titles for entries in AdditionalApps
GameTitles:
#Disable cloud saves for unlocked games
DisableCloud: yes
#Disable updates for AppIds on AdditionalApps
DisableUpdates: yes
#Notifications
Notifications: yes
LogLevel: 2
`;

function ensureSLSConfig(templatePath) {
  const configPath = getSLSConfigPath();
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  if (!fs.existsSync(configPath)) {
    let template = DEFAULT_SLS_CONFIG;
    if (templatePath && fs.existsSync(templatePath)) {
      try { template = fs.readFileSync(templatePath, 'utf-8'); } catch {}
    }
    fs.writeFileSync(configPath, template, 'utf-8');
  }
  return configPath;
}

function getSLSAppIds() {
  const configPath = getSLSConfigPath();
  if (!fs.existsSync(configPath)) return [];
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const ids = parseYamlListBlock(content, 'AdditionalApps');
    const titles = parseYamlMapBlock(content, 'GameTitles');
    return ids.map(id => ({ appId: id, name: titles[id] || null }));
  } catch { return []; }
}

// ─── Minimal YAML block helpers (regex-based, comment-preserving) ───
// We deliberately avoid a full YAML parser/reformatter so we don't clobber the
// user's comments or unrelated settings in config.yaml — we only touch the
// AdditionalApps list and GameTitles map blocks.
function parseYamlListBlock(content, key) {
  const re = new RegExp(`^${key}:\\s*\\n((?:[ \\t]+.*\\n?)*)`, 'm');
  const match = content.match(re);
  if (!match) return [];
  const ids = [];
  for (const line of match[1].split('\n')) {
    const idMatch = line.match(/-\s+"?(\d+)"?/);
    if (idMatch) ids.push(idMatch[1]);
  }
  return ids;
}

function parseYamlMapBlock(content, key) {
  const re = new RegExp(`^${key}:\\s*\\n((?:[ \\t]+.*\\n?)*)`, 'm');
  const match = content.match(re);
  const map = {};
  if (!match) return map;
  for (const line of match[1].split('\n')) {
    const entryMatch = line.match(/"?(\d+)"?\s*:\s*"?([^"\n]*)"?/);
    if (entryMatch) map[entryMatch[1]] = entryMatch[2].trim();
  }
  return map;
}

function addSLSApp(appId, gameName) {
  try {
    const configPath = ensureSLSConfig();
    let content = fs.readFileSync(configPath, 'utf-8');

    // Add to AdditionalApps list if not already present
    const existingIds = parseYamlListBlock(content, 'AdditionalApps');
    if (!existingIds.includes(String(appId))) {
      content = insertIntoYamlList(content, 'AdditionalApps', `  - ${appId}`);
    }

    // Add/update GameTitles entry if a name was provided
    if (gameName) {
      content = upsertYamlMapEntry(content, 'GameTitles', appId, gameName);
    }

    fs.writeFileSync(configPath, content, 'utf-8');
    return { success: true, path: configPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function removeSLSApp(appId) {
  try {
    const configPath = getSLSConfigPath();
    if (!fs.existsSync(configPath)) return { success: true };
    let content = fs.readFileSync(configPath, 'utf-8');
    content = removeFromYamlList(content, 'AdditionalApps', appId);
    content = removeYamlMapEntry(content, 'GameTitles', appId);
    fs.writeFileSync(configPath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function insertIntoYamlList(content, key, newLine) {
  const re = new RegExp(`^(${key}:\\s*\\n)`, 'm');
  if (!re.test(content)) {
    // Key doesn't exist at all — append a fresh block at the end
    return content.replace(/\n?$/, `\n${key}:\n${newLine}\n`);
  }
  return content.replace(re, `$1${newLine}\n`);
}

function removeFromYamlList(content, key, appId) {
  const re = new RegExp(`^(\\s*-\\s+"?${appId}"?\\s*)\\n`, 'm');
  return content.replace(re, '');
}

function upsertYamlMapEntry(content, key, appId, value) {
  const escapedValue = String(value).replace(/"/g, '\\"');
  const entryRe = new RegExp(`^(\\s+)"?${appId}"?\\s*:.*$`, 'm');
  if (entryRe.test(content)) {
    return content.replace(entryRe, `$1${appId}: "${escapedValue}"`);
  }
  const keyRe = new RegExp(`^(${key}:\\s*\\n)`, 'm');
  if (!keyRe.test(content)) {
    return content.replace(/\n?$/, `\n${key}:\n  ${appId}: "${escapedValue}"\n`);
  }
  return content.replace(keyRe, `$1  ${appId}: "${escapedValue}"\n`);
}

function removeYamlMapEntry(content, key, appId) {
  const re = new RegExp(`^\\s+"?${appId}"?\\s*:.*\\n`, 'm');
  return content.replace(re, '');
}

// ─── Library Scanning ───
// Merges two sources so the Library tab matches what the real Steam client
// shows: games actually downloaded (appmanifest_*.acf on disk) AND games
// SLSsteam has unlocked as "owned" via AdditionalApps but that haven't been
// installed/downloaded yet. Those show with installed: false and an
// "Unlocked — not installed" state instead of a Play button.
function scanLibrary() {
  const steamInfo = detectSteamPath();
  const games = [];
  const seenIds = new Set();

  if (steamInfo) {
    const appsDir = path.join(steamInfo.path, 'steamapps');
    if (fs.existsSync(appsDir)) {
      try {
        const files = fs.readdirSync(appsDir);
        for (const file of files) {
          if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
            const appId = file.replace('appmanifest_', '').replace('.acf', '');
            const content = fs.readFileSync(path.join(appsDir, file), 'utf-8');
            const nameMatch = content.match(/"name"\s+"([^"]+)"/);
            const sizeMatch = content.match(/"SizeOnDisk"\s+"(\d+)"/);
            games.push({
              appId,
              name: nameMatch ? nameMatch[1] : `App ${appId}`,
              sizeBytes: sizeMatch ? parseInt(sizeMatch[1]) : 0,
              sizeFormatted: sizeMatch ? formatBytes(parseInt(sizeMatch[1])) : 'Unknown',
              path: path.join(appsDir, 'common', nameMatch ? nameMatch[1].replace(/[<>:"/\\|?*]/g, '') : appId),
              installed: true,
            });
            seenIds.add(appId);
          }
        }
      } catch {}
    }
  }

  // Merge in SLSsteam-unlocked apps that aren't installed yet
  const slsApps = getSLSAppIds();
  for (const { appId, name } of slsApps) {
    if (!seenIds.has(appId)) {
      games.push({
        appId,
        name: name || `App ${appId}`,
        sizeBytes: 0,
        sizeFormatted: 'Not installed',
        path: null,
        installed: false,
      });
      seenIds.add(appId);
    }
  }

  return games;
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

// ─── Download System ───
const downloadProviders = require('./downloads/providers');
const manifestDB = require('./manifests');
let activeDownloads = new Map();

// ─── Nexus/IGDB API ───
async function fetchNexusGames(query) {
  const https = require('https');
  const NEXUS_API = 'https://nexus-images.pages.dev/api';
  const url = `${NEXUS_API}?type=igdb&endpoint=games&query=${encodeURIComponent(query || '')}`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

// ─── IPC Handlers ───
function registerIPC() {
  // Steam
  ipcMain.handle('steam:detect', async () => detectSteamPath());
  ipcMain.handle('steam:isRunning', async () => isSteamRunning());
  ipcMain.handle('steam:start', async (_e, inject) => startSteam(inject));
  ipcMain.handle('steam:stop', async () => { killSteam(); return { success: true }; });
  ipcMain.handle('steam:restart', async (_e, inject) => {
    killSteam();
    await new Promise(r => setTimeout(r, 2000));
    return startSteam(inject);
  });
  ipcMain.handle('steam:launchGame', async (_e, appId) => launchGame(appId));
  ipcMain.handle('steam:installGame', async (_e, appId) => {
    shell.openExternal(`steam://install/${appId}`);
    return { success: true };
  });

  // Lua
  ipcMain.handle('lua:write', async (_e, appId, name, content) => writeLuaConfig(appId, name, content));
  ipcMain.handle('lua:read', async (_e, appId) => readLuaConfig(appId));
  ipcMain.handle('lua:delete', async (_e, appId) => deleteLuaConfig(appId));

  // SLSsteam
  ipcMain.handle('sls:check', async () => checkLinuxTools());
  ipcMain.handle('sls:setup', async () => setupSLSsteam());
  ipcMain.handle('sls:getIds', async () => getSLSAppIds());

  // Library
  ipcMain.handle('library:scan', async () => scanLibrary());
  ipcMain.handle('library:remove', async (_e, appId) => {
    const steamInfo = detectSteamPath();
    const removed = { lua: false, sls: false, acf: false, depotcache: false };

    // 1. Delete Lua file
    if (steamInfo) {
      const luaPath = path.join(steamInfo.path, 'config', 'stplug-in', `${appId}.lua`);
      try { if (fs.existsSync(luaPath)) { fs.unlinkSync(luaPath); removed.lua = true; } } catch {}
    }

    // 2. Remove from SLSsteam config
    const slsResult = removeSLSApp(appId);
    removed.sls = slsResult.success;

    // 3. Delete appmanifest ACF file
    if (steamInfo) {
      const acfPath = path.join(steamInfo.path, 'steamapps', `appmanifest_${appId}.acf`);
      try { if (fs.existsSync(acfPath)) { fs.unlinkSync(acfPath); removed.acf = true; } } catch {}
    }

    // 4. Delete depot manifest files for this app
    if (steamInfo) {
      const depotCachePath = path.join(steamInfo.path, 'steamapps', 'depotcache');
      try {
        if (fs.existsSync(depotCachePath)) {
          const files = fs.readdirSync(depotCachePath);
          for (const f of files) {
            // Manifest files are named {depotId}_{manifestId}.manifest
            // We need to find which depots belong to this app
            // Check the ACF for depot IDs (but it's already deleted)
            // Alternative: match by reading the manifest and checking appId
            // For simplicity, also check for files named with appId prefix
            if (f.startsWith(`${appId}_`) || f.includes(`_${appId}.manifest`)) {
              fs.unlinkSync(path.join(depotCachePath, f));
              removed.depotcache = true;
            }
          }
        }
      } catch {}
    }

    return { success: true, removed };
  });

  // Nexus
  ipcMain.handle('nexus:search', async (_e, query) => fetchNexusGames(query));

  // Manifest Database
  ipcMain.handle('manifests:apply', async (_e, appId, gameName) => {
    const steamInfo = detectSteamPath();
    if (!steamInfo) return { success: false, error: 'Steam path not found' };
    const authKey = getConfig('ryuuAuthKey', '');
    if (!authKey) {
      return { success: false, error: `No auth key set. Register at ${manifestDB.RYUU_BASE} to get a free key (50 downloads/day).` };
    }
    try {
      return await manifestDB.applyManifestsForApp(appId, gameName, steamInfo.path, authKey);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('manifests:setKey', async (_e, key) => {
    saveConfig('ryuuAuthKey', key);
    return { success: true };
  });
  ipcMain.handle('manifests:getKey', async () => getConfig('ryuuAuthKey', ''));
  ipcMain.handle('manifests:status', async () => {
    try {
      return await manifestDB.checkProviderStatus();
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('manifests:importZip', async (_e, zipPath, appId, gameName) => {
    const steamInfo = detectSteamPath();
    if (!steamInfo) return { success: false, error: 'Steam path not found' };
    try {
      const fs = require('fs');
      if (!fs.existsSync(zipPath)) return { success: false, error: 'ZIP file not found' };
      const zipBuffer = fs.readFileSync(zipPath);
      return await manifestDB.importManifestZip(zipBuffer, appId, gameName, steamInfo.path);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('manifests:importZipDialog', async (_e, appId, gameName) => {
    const steamInfo = detectSteamPath();
    if (!steamInfo) return { success: false, error: 'Steam path not found' };
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select manifest ZIP file',
        properties: ['openFile'],
        filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePaths.length) {
        return { success: false, cancelled: true };
      }
      const zipPath = result.filePaths[0];
      const zipBuffer = fs.readFileSync(zipPath);
      return await manifestDB.importManifestZip(zipBuffer, appId, gameName, steamInfo.path);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Downloads
  ipcMain.handle('downloads:start', async (_e, opts) => {
    const { url, title, savePath, provider } = opts;
    const result = await downloadProviders.startDownload(url, title, savePath, provider || 'auto', (progress) => {
      mainWindow?.webContents?.send('downloads:progress', progress);
    });
    return result;
  });
  ipcMain.handle('downloads:pause', async () => downloadProviders.pauseDownload());
  ipcMain.handle('downloads:resume', async () => downloadProviders.resumeDownload());
  ipcMain.handle('downloads:cancel', async () => downloadProviders.cancelDownload());

  // Bypass covers
  ipcMain.handle('bypass:getCover', async (_e, appId) => {
    const coverUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
    // Check if cover exists via HEAD
    try {
      const res = await new Promise((resolve) => {
        https.head(coverUrl, (res) => resolve({ ok: res.statusCode === 200 }));
      });
      if (res.ok) return { ok: true, url: coverUrl };
    } catch {}
    return { ok: false, url: coverUrl };
  });

  // OnlineFix
  ipcMain.handle('onlinefix:download', async (_e, opts) => {
    const { uris, destinationDir, gameTitle } = opts;
    if (!uris || !uris.length) return { ok: false, message: 'No download URIs' };

    for (const uri of uris) {
      try {
        const result = await downloadProviders.startDownload(uri, gameTitle, destinationDir, 'auto', (progress) => {
          mainWindow?.webContents?.send('downloads:progress', { ...progress, title: gameTitle });
        });
        if (result?.success) {
          // Try extraction
          const extract = require('extract-zip');
          if (result.path.endsWith('.zip')) {
            try { await extract(result.path, { dir: destinationDir }); } catch {}
          }
          return { ok: true, path: result.path };
        }
      } catch (err) {
        // Try next URI
      }
    }
    return { ok: false, message: 'All download URIs failed' };
  });

  // Config
  ipcMain.handle('config:get', async (_e, key, fallback) => getConfig(key, fallback));
  ipcMain.handle('config:set', async (_e, key, value) => { saveConfig(key, value); return true; });

  // System
  ipcMain.handle('app:getPlatform', async () => process.platform);
  ipcMain.handle('dialog:openFolder', async (_e, defaultPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      defaultPath,
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('shell:openPath', async (_e, p) => { shell.openPath(p); return true; });
  ipcMain.handle('shell:openExternal', async (_e, url) => { shell.openExternal(url); return true; });

  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
}

// ─── Window Creation ───
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f111a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
  });

  const devMode = process.argv.includes('--dev');
  if (devMode) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App Lifecycle ───
app.whenReady().then(() => {
  registerIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
