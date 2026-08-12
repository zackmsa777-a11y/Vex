/* ─── Vex — Downloads Tab ─── */

window.VexDownloads = {
  activeDownloads: [],
  history: [],
  progressUnsub: null,

  async load() {
    this.activeDownloads = [];
    this.renderActive();
    this.renderHistory();
    this.setupProgressListener();
  },

  setupProgressListener() {
    if (this.progressUnsub) this.progressUnsub();
    this.progressUnsub = window.vex?.downloads.onProgress((progress) => {
      this.updateProgress(progress);
    });
  },

  renderActive() {
    const list = document.getElementById('active-downloads-list');
    if (!list) return;
    list.innerHTML = '';

    if (!this.activeDownloads.length) {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 12px;">No active downloads</p>
          <p style="color: var(--color-text-muted); font-size: 12px;">Downloads started from the Store or Add Game will appear here.</p>
        </div>
      `;
      return;
    }

    this.activeDownloads.forEach(dl => {
      const card = document.createElement('div');
      card.className = 'download-card';
      card.dataset.appId = dl.appId;

      card.innerHTML = `
        <img class="download-thumb" src="https://cdn.cloudflare.steamstatic.com/steam/apps/${dl.appId}/header.jpg"
          onerror="this.style.background='var(--bg-accent)';this.src='';this.alt='${dl.title[0]}'">
        <div class="download-info">
          <div class="download-title">${dl.title}</div>
          <div class="download-bar"><div class="download-bar-fill" style="width: ${dl.progress}%"></div></div>
          <div class="download-meta">
            <span>${dl.progress}%</span>
            <span>${dl.speed || '—'}</span>
            <span>ETA: ${dl.eta || '—'}</span>
            <span class="provider-badge" style="border: 1px solid var(--color-border); padding: 2px 8px; border-radius: 10px;">${dl.provider || 'steam'}</span>
          </div>
        </div>
        <div class="download-actions">
          <button class="btn btn-ghost" data-action="pause">${dl.paused ? '▶' : '⏸'}</button>
          <button class="btn btn-danger" data-action="cancel">✕</button>
        </div>
      `;

      card.querySelector('[data-action="pause"]').addEventListener('click', async () => {
        if (dl.paused) {
          await window.vex?.downloads.resume();
          dl.paused = false;
          showToast('Download resumed');
        } else {
          await window.vex?.downloads.pause();
          dl.paused = true;
          showToast('Download paused');
        }
        this.renderActive();
      });

      card.querySelector('[data-action="cancel"]').addEventListener('click', async () => {
        await window.vex?.downloads.cancel();
        this.activeDownloads = this.activeDownloads.filter(d => d.appId !== dl.appId);
        showToast('Download cancelled');
        this.renderActive();
      });

      list.appendChild(card);
    });
  },

  renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';

    if (!this.history.length) {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <p style="color: var(--color-text-muted); font-size: 14px;">No completed downloads yet</p>
        </div>
      `;
      return;
    }

    this.history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'download-card';
      card.innerHTML = `
        <img class="download-thumb" src="https://cdn.cloudflare.steamstatic.com/steam/apps/${item.appId}/header.jpg"
          onerror="this.style.background='var(--bg-accent)';this.src='';this.alt='${item.title[0]}'">
        <div class="download-info">
          <div class="download-title">${item.title}</div>
          <div class="download-meta">
            <span>${item.size || '—'}</span>
            <span>${item.completedAt}</span>
            <span style="color: var(--color-success);">✓ Completed</span>
            <span class="provider-badge" style="border: 1px solid var(--color-border); padding: 2px 8px; border-radius: 10px;">${item.provider || 'steam'}</span>
          </div>
        </div>
        <div class="download-actions">
          <button class="btn btn-ghost" data-action="open">📁 Open</button>
        </div>
      `;
      card.querySelector('[data-action="open"]').addEventListener('click', () => {
        window.vex?.system.openPath(`~/Downloads/Vex`);
      });
      list.appendChild(card);
    });
  },

  updateProgress(progress) {
    const card = document.querySelector(`.download-card[data-app-id="${progress.appId}"]`);
    if (!card) return;
    const fill = card.querySelector('.download-bar-fill');
    if (fill) fill.style.width = `${progress.percent}%`;
    const meta = card.querySelector('.download-meta');
    if (meta) {
      meta.innerHTML = `
        <span>${progress.percent}%</span>
        <span>${progress.speed || '—'}</span>
        <span>ETA: ${progress.eta || '—'}</span>
      `;
    }
    if (progress.done) {
      showToast(`${progress.title} downloaded successfully`, 'success');
      this.history.unshift({
        title: progress.title,
        appId: progress.appId,
        size: '—',
        completedAt: 'Just now',
        provider: progress.provider || 'steam',
      });
      this.activeDownloads = this.activeDownloads.filter(d => d.appId !== progress.appId);
      this.renderActive();
      this.renderHistory();
    }
  },

  async startDownload(game) {
    // For Steam downloads, use steam://install
    if (!game.url) {
      const appId = game.appId || game.steam_app_id;
      showToast(`Downloading ${game.title} via Steam...`);
      // Track it in active downloads
      this.activeDownloads.push({
        title: game.title,
        appId: appId,
        progress: 0,
        speed: 'Connecting...',
        eta: '—',
        provider: 'steam',
        paused: false,
      });
      this.renderActive();
      await window.vex?.steam.installGame(appId);
      return;
    }

    // For provider downloads
    showToast(`Starting download: ${game.title}`);
    const savePath = await window.vex?.config.get('downloadPath', `~/Downloads/Vex`);
    const result = await window.vex?.downloads.start({
      url: game.url,
      title: game.title,
      savePath,
      provider: game.provider || 'auto',
    });

    if (result?.success) {
      showToast(`${game.title} downloaded`, 'success');
      this.history.unshift({
        title: game.title,
        appId: game.appId,
        size: '—',
        completedAt: 'Just now',
        provider: game.provider || 'gofile',
      });
      this.renderHistory();
    } else {
      showToast(`Download failed: ${result?.error || 'Unknown error'}`, 'error');
    }
  }
};

// Load on init
window.VexDownloads.load();
