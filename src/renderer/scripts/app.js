/* ─── Vex — Main App Controller ─── */

// ─── Toast System ───
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Navigation ───
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    navItems.forEach(n => n.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Trigger tab-specific load
    if (tab === 'home') window.VexHome?.load();
    if (tab === 'library') window.VexLibrary?.load();
    if (tab === 'downloads') window.VexDownloads?.load();
    if (tab === "settings") window.VexSettings?.load();
    if (tab === "bypass") window.VexBypass?.load();
    if (tab === "onlinefix") window.VexOnlineFix?.load();
  });
});

// ─── Window Controls ───
document.getElementById('close-btn').addEventListener('click', () => window.vex?.window.close());
document.getElementById('min-btn').addEventListener('click', () => window.vex?.window.minimize());
document.getElementById('max-btn').addEventListener('click', () => window.vex?.window.maximize());

// ─── Steam Status Check ───
async function updateSteamStatus() {
  try {
    const running = await window.vex?.steam.isRunning();
    const statusEl = document.getElementById('steam-status');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');
    if (running) {
      dot.classList.add('online');
      dot.classList.remove('offline');
      text.textContent = 'Steam: Running';
    } else {
      dot.classList.remove('online');
      dot.classList.add('offline');
      text.textContent = 'Steam: Offline';
    }
  } catch {}
}

// ─── Modal Helpers ───
function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ─── Generic Yes/No Confirm Modal ───
// Replaces window.confirm() — Electron's support for native alert/confirm/prompt
// dialogs varies by version/platform and has already bitten us once (prompt()
// throws outright). Use a real in-app modal for anything that needs a Promise<boolean>.
function showTextModal(text) {
  document.getElementById('view-lua-content').textContent = text;
  openModal('view-lua-modal');
  const closeBtn = document.getElementById('view-lua-close');
  const onClose = () => { closeModal('view-lua-modal'); closeBtn.removeEventListener('click', onClose); };
  closeBtn.addEventListener('click', onClose);
}

function confirmYesNo(message, title) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-yesno-modal');
    document.getElementById('confirm-yesno-title').textContent = title || 'Confirm';
    document.getElementById('confirm-yesno-message').textContent = message || '';
    const okBtn = document.getElementById('confirm-yesno-ok');
    const cancelBtn = document.getElementById('confirm-yesno-cancel');
    const closeBtn = document.getElementById('confirm-yesno-close');

    const cleanup = () => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      closeModal('confirm-yesno-modal');
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);

    openModal('confirm-yesno-modal');
  });
}

// ─── Confirm AppID Modal ───
// Electron does NOT implement window.prompt() (it throws "not supported"),
// so we use a real HTML modal instead. Returns a Promise that resolves to
// { appId, gameName } or null if cancelled.
function confirmAppIdModal(hint, defaultAppId, defaultName) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-appid-modal');
    const hintEl = document.getElementById('confirm-appid-hint');
    const appIdInput = document.getElementById('confirm-appid-input');
    const nameInput = document.getElementById('confirm-appid-name');
    const okBtn = document.getElementById('confirm-appid-ok');
    const cancelBtn = document.getElementById('confirm-appid-cancel');
    const closeBtn = document.getElementById('confirm-appid-close');

    hintEl.textContent = hint || '';
    appIdInput.value = defaultAppId || '';
    nameInput.value = defaultName || '';

    const cleanup = () => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      closeModal('confirm-appid-modal');
    };
    const onOk = () => {
      const appId = appIdInput.value.trim();
      const gameName = nameInput.value.trim();
      cleanup();
      resolve(appId ? { appId, gameName: gameName || null } : { appId: null, gameName: gameName || null });
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);

    openModal('confirm-appid-modal');
    appIdInput.focus();
  });
}

// Add Game Modal tabs
document.querySelectorAll('.modal-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`modal-${target}`)?.classList.add('active');
  });
});

document.getElementById('add-game-close').addEventListener('click', () => closeModal('add-game-modal'));
document.getElementById('add-game-btn').addEventListener('click', () => openModal('add-game-modal'));

// ─── Game Cover Helper ───
function steamCoverUrl(appId) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}
function steamLibraryUrl(appId) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

function createGameCard(game, options = {}) {
  const card = document.createElement('div');
  card.className = 'game-card';

  const cover = document.createElement('img');
  cover.className = 'game-cover';
  cover.src = steamCoverUrl(game.appId || game.steam_app_id);
  cover.onerror = function() {
    const fallback = document.createElement('div');
    fallback.className = 'game-cover-fallback';
    fallback.textContent = (game.title || game.name || '?')[0];
    fallback.style.background = `linear-gradient(135deg, ${game.gradient || '#0f3460'}, ${game.gradient2 || '#16213e'})`;
    this.replaceWith(fallback);
  };

  const info = document.createElement('div');
  info.className = 'game-info';
  info.innerHTML = `
    <div class="game-title">${game.title || game.name || 'Unknown'}</div>
    <div class="game-meta">AppID: ${game.appId || game.steam_app_id || '—'}</div>
  `;

  const actions = document.createElement('div');
  actions.className = 'game-actions';

  if (options.showPlay) {
    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn-primary';
    playBtn.textContent = '▶ Play';
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      launchGame(game);
    });
    actions.appendChild(playBtn);
  }

  if (options.showDownload) {
    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn btn-primary';
    dlBtn.textContent = '↓ Download';
    dlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.VexDownloads?.startDownload(game);
    });
    actions.appendChild(dlBtn);
  }

  if (options.showAdd) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addGameToHome(game);
    });
    actions.appendChild(addBtn);
  }

  // 3-dot menu
  const menuBtn = document.createElement('button');
  menuBtn.className = 'game-menu-btn';
  menuBtn.textContent = '⋮';
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showGameMenu(game, menuBtn);
  });
  actions.appendChild(menuBtn);

  card.appendChild(cover);
  card.appendChild(info);
  card.appendChild(actions);
  return card;
}

async function launchGame(game) {
  const appId = game.appId || game.steam_app_id;
  if (!appId) { showToast('No AppID for this game', 'error'); return; }
  showToast(`Launching ${game.title || game.name}...`);
  try {
    const result = await window.vex.steam.launchGame(appId);
    if (!result.success) showToast(`Could not connect to Steam: ${result.error || 'Unknown error'}`, 'error');
  } catch (err) {
    showToast('Could not connect to Steam', 'error');
  }
}

async function addGameToHome(game) {
  const appId = game.appId || game.steam_app_id;
  showToast('Writing Lua to Steam config...');
  try {
    const result = await window.vex.lua.write(appId, game.title || game.name, game.luaContent);
    if (result.success) {
      showToast('Game added!', 'success');
      window.VexHome?.load();
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

function showGameMenu(game, anchor) {
  // Simple context menu
  const existing = document.querySelector('.context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = `
    position: fixed;
    background: var(--bg-card);
    border-radius: var(--radius-sm);
    padding: 4px;
    box-shadow: var(--shadow);
    z-index: 300;
    min-width: 160px;
    border: 1px solid var(--color-border);
  `;

  const appId = game.appId || game.steam_app_id;
  const items = [
    { label: '▶ Play', action: () => launchGame(game) },
    { label: '📁 Open Steam config folder', action: () => window.vex?.system.openPath(`${game.steamPath || ''}/config/stplug-in`) },
    { label: '📄 View Lua', action: async () => {
      try {
        const lua = await window.vex?.lua.read(appId);
        if (lua) showTextModal(lua);
        else showToast('No Lua config found for this game', 'error');
      } catch (err) {
        showToast(`Could not read Lua: ${err.message}`, 'error');
      }
    }},
    { label: '🗑 Remove game', action: async () => {
      await window.vex?.lua.delete(appId);
      showToast('Game removed', 'success');
      window.VexHome?.load();
    }},
  ];

  items.forEach(item => {
    const btn = document.createElement('div');
    btn.textContent = item.label;
    btn.style.cssText = 'padding: 8px 12px; cursor: pointer; font-size: 13px; border-radius: 4px;';
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.06)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
    btn.addEventListener('click', () => { item.action(); menu.remove(); });
    menu.appendChild(btn);
  });

  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${rect.right - 160}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 100);
}

// ─── Global error safety net ───
// If any button handler throws or a promise rejects without being caught,
// show it as a toast instead of silently doing nothing — this was the root
// cause of several "I clicked it and nothing happened" reports.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  if (typeof showToast === 'function') {
    showToast(`Something went wrong: ${event.reason?.message || event.reason}`, 'error');
  }
});
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  if (typeof showToast === 'function') {
    showToast(`Something went wrong: ${event.error?.message || event.message}`, 'error');
  }
});

// ─── Init ───
updateSteamStatus();
setInterval(updateSteamStatus, 10000);
