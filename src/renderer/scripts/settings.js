/* ─── Vex — Settings Tab ─── */

window.VexSettings = {
  async load() {
    await this.loadSteamPath();
    await this.loadLinuxTools();
    await this.loadConfig();
    this.renderSources();
  },

  async loadSteamPath() {
    try {
      const steamInfo = await window.vex?.steam.detect();
      const input = document.getElementById('steam-path');
      if (steamInfo) {
        input.value = steamInfo.path;
        await window.vex?.config.set('steamPath', steamInfo.path);
      } else {
        const saved = await window.vex?.config.get('steamPath', '');
        input.value = saved || 'Steam not detected';
      }
    } catch {}
  },

  async loadLinuxTools() {
    const statusEl = document.getElementById('linux-tools-status');
    statusEl.innerHTML = '<p style="color: var(--color-text-muted); font-size: 12px;">Checking...</p>';

    try {
      const status = await window.vex?.sls.check();
      statusEl.innerHTML = `
        <div class="tool-item">
          <span class="${status.slssteam ? 'check' : 'cross'}">${status.slssteam ? '✓' : '✗'}</span>
          <span>SLSteam.so ${status.slssteam ? 'installed' : 'not found'} (${status.slsPath})</span>
        </div>
        <div class="tool-item">
          <span class="${status.libraryInject ? 'check' : 'cross'}">${status.libraryInject ? '✓' : '✗'}</span>
          <span>library-inject.so ${status.libraryInject ? 'installed' : 'not found'} (${status.injectPath})</span>
        </div>
        <div class="tool-item">
          <span class="${status.dotnet ? 'check' : 'cross'}">${status.dotnet ? '✓' : '✗'}</span>
          <span>.NET 9 runtime ${status.dotnet ? 'installed' : 'not found'}</span>
        </div>
      `;
    } catch {
      statusEl.innerHTML = '<p style="color: var(--color-danger); font-size: 12px;">Could not check tools</p>';
    }
  },

  async loadConfig() {
    const igdbId = await window.vex?.config.get('igdbClientId', '');
    const igdbSecret = await window.vex?.config.get('igdbClientSecret', '');
    const igdbLinked = await window.vex?.config.get('igdbLinked', false);
    document.getElementById('igdb-client-id').value = igdbId || '';
    document.getElementById('igdb-client-secret').value = igdbSecret || '';
    const statusEl = document.getElementById('igdb-status');
    if (igdbLinked) {
      statusEl.textContent = 'Linked (Using personal credentials)';
      statusEl.style.color = 'var(--color-success)';
    } else {
      statusEl.textContent = 'Unlinked (Using default internal key)';
      statusEl.style.color = 'var(--color-text-muted)';
    }
  },

  renderSources() {
    const list = document.getElementById('sources-list');
    const sources = [
      { name: 'Fuente Nexus', url: 'https://nexus-links-server.vercel.app/api/get-url', active: true },
      { name: 'Buzzheavier Mirror', url: 'https://buzzheavier.com', active: true },
      { name: 'GoFile Mirror', url: 'https://gofile.io', active: false },
    ];
    list.innerHTML = '';
    sources.forEach(src => {
      const item = document.createElement('div');
      item.className = 'source-item';
      item.innerHTML = `
        <span class="source-name">${src.name}</span>
        <span class="source-url">${src.url}</span>
        <div class="source-toggle ${src.active ? 'active' : ''}"></div>
      `;
      item.querySelector('.source-toggle').addEventListener('click', (e) => {
        e.target.classList.toggle('active');
      });
      list.appendChild(item);
    });
  }
};

// ─── Steam Controls ───
document.getElementById('detect-steam-btn').addEventListener('click', async () => {
  showToast('Detecting Steam...');
  await window.VexSettings.loadSteamPath();
  showToast('Steam path updated', 'success');
});

document.getElementById('browse-steam-btn').addEventListener('click', async () => {
  const folder = await window.vex?.system.openFolder('');
  if (folder) {
    document.getElementById('steam-path').value = folder;
    await window.vex?.config.set('steamPath', folder);
  }
});

document.getElementById('start-steam-btn').addEventListener('click', async () => {
  showToast('Starting Steam...');
  const result = await window.vex?.steam.start(false);
  showToast(result?.message || 'Steam started', result?.success ? 'success' : 'error');
});

document.getElementById('restart-steam-btn').addEventListener('click', async () => {
  showToast('Restarting Steam with injection...');
  const result = await window.vex?.steam.restart(true);
  showToast(result?.message || 'Steam restarted', result?.success ? 'success' : 'error');
});

document.getElementById('stop-steam-btn').addEventListener('click', async () => {
  await window.vex?.steam.stop();
  showToast('Steam stopped', 'success');
});

// ─── Linux Setup ───
document.getElementById('setup-sls-btn').addEventListener('click', async () => {
  showToast('Setting up SLSsteam...');
  const result = await window.vex?.sls.setup();
  if (result?.success) {
    showToast('SLSsteam installed successfully', 'success');
  } else {
    showToast(`Failed: ${result?.error || 'Unknown error'}`, 'error');
  }
  await window.VexSettings.loadLinuxTools();
});

// ─── IGDB Settings ───
document.getElementById('igdb-save-btn').addEventListener('click', async () => {
  const clientId = document.getElementById('igdb-client-id').value;
  const clientSecret = document.getElementById('igdb-client-secret').value;
  await window.vex?.config.set('igdbClientId', clientId);
  await window.vex?.config.set('igdbClientSecret', clientSecret);
  showToast('IGDB credentials saved', 'success');
});

document.getElementById('igdb-link-btn').addEventListener('click', async () => {
  const clientId = document.getElementById('igdb-client-id').value;
  const clientSecret = document.getElementById('igdb-client-secret').value;
  if (!clientId || !clientSecret) {
    showToast('Please enter both Client ID and Secret', 'error');
    return;
  }
  await window.vex?.config.set('igdbClientId', clientId);
  await window.vex?.config.set('igdbClientSecret', clientSecret);
  await window.vex?.config.set('igdbLinked', true);
  const statusEl = document.getElementById('igdb-status');
  statusEl.textContent = 'Linked (Using personal credentials)';
  statusEl.style.color = 'var(--color-success)';
  showToast('IGDB credentials saved', 'success');
});

// ─── Nexus Web ───
document.getElementById('open-nexus-web-btn').addEventListener('click', () => {
  window.vex?.system.openExternal('https://nexus-links-server.vercel.app/');
});

// ─── Custom .so path ───
document.getElementById('browse-so-btn').addEventListener('click', async () => {
  const folder = await window.vex?.system.openFolder('');
  if (folder) document.getElementById('custom-so-path').value = folder;
});

// ─── Preferences ───
['pref-autostart', 'pref-autoupdate', 'pref-autorefresh'].forEach(id => {
  document.getElementById(id).addEventListener('change', async (e) => {
    await window.vex?.config.set(id, e.target.checked);
  });
});

// Load settings on init
window.VexSettings.load();
