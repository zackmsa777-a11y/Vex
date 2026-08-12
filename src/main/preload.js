/* eslint-disable */
// Vex — Preload (contextBridge exposing safe API to renderer)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vex', {
  // Steam
  steam: {
    detect: () => ipcRenderer.invoke('steam:detect'),
    isRunning: () => ipcRenderer.invoke('steam:isRunning'),
    start: (inject) => ipcRenderer.invoke('steam:start', inject),
    stop: () => ipcRenderer.invoke('steam:stop'),
    restart: (inject) => ipcRenderer.invoke('steam:restart', inject),
    launchGame: (appId) => ipcRenderer.invoke('steam:launchGame', appId),
    installGame: (appId) => ipcRenderer.invoke('steam:installGame', appId),
  },
  // Lua
  lua: {
    write: (appId, name, content) => ipcRenderer.invoke('lua:write', appId, name, content),
    read: (appId) => ipcRenderer.invoke('lua:read', appId),
    delete: (appId) => ipcRenderer.invoke('lua:delete', appId),
  },
  // SLSsteam
  sls: {
    check: () => ipcRenderer.invoke('sls:check'),
    setup: () => ipcRenderer.invoke('sls:setup'),
    getIds: () => ipcRenderer.invoke('sls:getIds'),
  },
  // Library
  library: {
    scan: () => ipcRenderer.invoke('library:scan'),
  },
  // Nexus/IGDB
  nexus: {
    search: (query) => ipcRenderer.invoke('nexus:search', query),
  },
  // Manifest Database
  manifests: {
    apply: (appId, gameName) => ipcRenderer.invoke('manifests:apply', appId, gameName),
    importZip: (zipPath, appId, gameName) => ipcRenderer.invoke('manifests:importZip', zipPath, appId, gameName),
    importZipDialog: (appId, gameName) => ipcRenderer.invoke('manifests:importZipDialog', appId, gameName),
    setKey: (key) => ipcRenderer.invoke('manifests:setKey', key),
    getKey: () => ipcRenderer.invoke('manifests:getKey'),
    status: () => ipcRenderer.invoke('manifests:status'),
  },
  // Downloads
  downloads: {
    start: (opts) => ipcRenderer.invoke('downloads:start', opts),
    pause: () => ipcRenderer.invoke('downloads:pause'),
    resume: () => ipcRenderer.invoke('downloads:resume'),
    cancel: () => ipcRenderer.invoke('downloads:cancel'),
    onProgress: (cb) => {
      const handler = (_e, progress) => cb(progress);
      ipcRenderer.on('downloads:progress', handler);
      return () => ipcRenderer.removeListener('downloads:progress', handler);
    },
  },
  // Config
  config: {
    get: (key, fallback) => ipcRenderer.invoke('config:get', key, fallback),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
  },
  // System
  system: {
    platform: () => ipcRenderer.invoke('app:getPlatform'),
    openFolder: (defaultPath) => ipcRenderer.invoke('dialog:openFolder', defaultPath),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
});
