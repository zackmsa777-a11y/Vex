/* ─── Vex — Downloads Tab ─── */

window.VexDownloads = {
  activeDownloads: [],
  history: [
    { title: 'Hogwarts Legacy', appId: '990080', size: '85 GB', completedAt: '2 hours ago', provider: 'gofile' },
    { title: 'Sekiro', appId: '814380', size: '28 GB', completedAt: 'Yesterday', provider: 'buzzheavier' },
    { title: 'Forza Horizon 5', appId: '1551360', size: '110 GB', completedAt: '3 days ago', provider: 'gofile' },
  ],
  progressUnsub: null,

  async load() {
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
    list.innerHTML = '';

    // Demo active downloads
    const demoActive = [
      { title: 'Elden Ring', appId: '1245620', progress: 67, speed: '12.5 MB/s', eta: '4 min', provider: 'gofile', paused: false },
      { title: 'Cyberpunk 2077', appId: '1091500', progress: 23, speed: '8.2 MB/s', eta: '18 min', provider: 'buzzheavier', paused: true },
    ];

    const allActive = [...demoActive, ...this.activeDownloads];
    if (!allActive.length) {
      list.innerHTML = '<p style="color: var(--color-text-muted); padding: 20px;">No active downloads. Browse the Store to find games.</p>';
      return;
    }

    allActive.forEach(dl => {
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
            <span>${dl.speed}</span>
            <span>ETA: ${dl.eta}</span>
            <span class="provider-badge" style="border: 1px solid var(--color-border); padding: 2px 8px; border-radius: 10px;">${dl.provider}</span>
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
        showToast('Download cancelled');
        this.renderActive();
      });

      list.appendChild(card);
    });
  },

  renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    this.history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'download-card';
      card.innerHTML = `
        <img class="download-thumb" src="https://cdn.cloudflare.steamstatic.com/steam/apps/${item.appId}/header.jpg"
          onerror="this.style.background='var(--bg-accent)';this.src='';this.alt='${item.title[0]}'">
        <div class="download-info">
          <div class="download-title">${item.title}</div>
          <div class="download-meta">
            <span>${item.size}</span>
            <span>${item.completedAt}</span>
            <span style="color: var(--color-success);">✓ Completed</span>
            <span class="provider-badge" style="border: 1px solid var(--color-border); padding: 2px 8px; border-radius: 10px;">${item.provider}</span>
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
        <span>${progress.speed}</span>
        <span>ETA: ${progress.eta}</span>
      `;
    }
    if (progress.done) {
      showToast(`${progress.title} downloaded successfully`, 'success');
      this.history.unshift({
        title: progress.title,
        appId: progress.appId,
        size: '—',
        completedAt: 'Just now',
        provider: 'gofile',
      });
      this.renderActive();
      this.renderHistory();
    }
  },

  async startDownload(game) {
    // For Steam downloads, use steam://install
    if (!game.url) {
      const appId = game.appId || game.steam_app_id;
      showToast(`Downloading ${game.title} via Steam...`);
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
