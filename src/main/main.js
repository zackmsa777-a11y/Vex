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

function startSteam(withInjection = false) {
  const steamInfo = detectSteamPath();
  if (!steamInfo) return { success: false, error: 'Steam path not found' };

  const steamPath = steamInfo.path;
  const slsPath = path.join(steamPath, 'SLSteam.so');
  const injectPath = path.join(steamPath, 'library-inject.so');

  if (withInjection && fs.existsSync(slsPath) && fs.existsSync(injectPath)) {
    const env = {
      ...process.env,
      LD_PRELOAD: `${slsPath}:${injectPath}`,
    };
    spawn('steam', [], { env, detached: true, stdio: 'ignore' }).unref();
    return { success: true, injected: true, message: 'Steam started with SLSsteam injection' };
  } else {
    spawn('steam', [], { detached: true, stdio: 'ignore' }).unref();
    if (withInjection) {
      return { success: true, injected: false, message: 'Steam started (SLSsteam libraries not found — started without injection)' };
    }
    return { success: true, injected: false, message: 'Steam started' };
  }
}

function launchGame(appId) {
  if (!isSteamRunning()) {
    const result = startSteam(false);
    if (!result.success) return { success: false, error: 'Could not start Steam' };
  }
  // Fire steam://run/<appid>
  shell.openExternal(`steam://run/${appId}`);
  return { success: true, message: `Launching ${appId}` };
}

// ─── SLSsteam Setup (from SFF Linux Setup) ───
function checkLinuxTools() {
  const steamInfo = detectSteamPath();
  const steamPath = steamInfo ? steamInfo.path : path.join(os.homedir(), '.local', 'share', 'Steam');
  const slsPath = path.join(steamPath, 'SLSteam.so');
  const injectPath = path.join(steamPath, 'library-inject.so');

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

  const steamPath = steamInfo.path;
  const slsDest = path.join(steamPath, 'SLSteam.so');
  const injectDest = path.join(steamPath, 'library-inject.so');

  // Download SLSsteam from GitHub releases
  const SLS_URL = 'https://github.com/dotDMZ/SLSteam/releases/latest/download/SLSteam.so';
  const INJECT_URL = 'https://github.com/dotDMZ/SLSteam/releases/latest/download/library-inject.so';

  const https = require('https');

  function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          downloadFile(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
        file.on('error', reject);
      }).on('error', reject);
    });
  }

  try {
    await downloadFile(SLS_URL, slsDest);
    await downloadFile(INJECT_URL, injectDest);
    return { success: true, message: 'SLSsteam installed successfully' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Lua Script Writing (from SFF saved_lua pattern) ───
function writeLuaConfig(appId, gameName, luaContent) {
  const steamInfo = detectSteamPath();
  if (!steamInfo) return { success: false, error: 'Steam path not found' };

  const steamPath = steamInfo.path;
  // SFF uses config/stplug-in/ for Lua scripts
  const luaDir = path.join(steamPath, 'config', 'stplug-in');
  if (!fs.existsSync(luaDir)) {
    fs.mkdirSync(luaDir, { recursive: true });
  }

  const luaPath = path.join(luaDir, `${appId}.lua`);

  let content = luaContent;
  if (!content) {
    // Auto-generate template
    content = `-- Vex auto-generated config for AppID ${appId}\n-- Game: ${gameName}\nreturn {\n  appid = ${appId},\n  name = "${gameName}",\n  launch = true\n}\n`;
  }

  try {
    fs.writeFileSync(luaPath, content, 'utf-8');
    return { success: true, path: luaPath, message: `Lua written to ${luaPath}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
  if (!steamInfo) return false;
  const luaPath = path.join(steamInfo.path, 'config', 'stplug-in', `${appId}.lua`);
  try { if (fs.existsSync(luaPath)) { fs.unlinkSync(luaPath); return true; } } catch {}
  return false;
}

// ─── SLSsteam Config (YAML) ───
// SFF uses a config.yaml with AdditionalApps list
function getSLSConfigPath() {
  const steamInfo = detectSteamPath();
  if (!steamInfo) return null;
  // SLSsteam config is at ~/.local/share/Steam/config.yaml or similar
  const home = os.homedir();
  const candidates = [
    path.join(home, '.config', 'SLSsteam', 'config.yaml'),
    path.join(home, '.local', 'share', 'SLSsteam', 'config.yaml'),
    path.join(steamInfo.path, 'config.yaml'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getSLSAppIds() {
  const configPath = getSLSConfigPath();
  if (!configPath) return [];
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    // Parse YAML AdditionalApps
    const match = content.match(/AdditionalApps:\s*\n((?:\s+-\s+.*\n)*)/);
    if (!match) return [];
    const ids = [];
    const lines = match[1].split('\n');
    for (const line of lines) {
      const idMatch = line.match(/-\s+(\d+)/);
      if (idMatch) ids.push(idMatch[1]);
    }
    return ids;
  } catch { return []; }
}

// ─── Library Scanning ───
function scanLibrary() {
  const steamInfo = detectSteamPath();
  if (!steamInfo) return [];
  const steamPath = steamInfo.path;
  const appsDir = path.join(steamPath, 'steamapps');
  if (!fs.existsSync(appsDir)) return [];

  const games = [];
  // Read appmanifest_*.acf files
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
        });
      }
    }
  } catch {}
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

  // Nexus
  ipcMain.handle('nexus:search', async (_e, query) => fetchNexusGames(query));

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
