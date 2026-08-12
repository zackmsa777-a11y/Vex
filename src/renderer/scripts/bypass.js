/* ─── Vex — Bypass Tab ─── */
/* Adapted from Lightning's bypass page with Vex's dark blue/pink theme */

window.VexBypass = {
  dataCache: null,
  rawJSONText: '',
  currentPlatform: 'ubisoft',
  APP_KEY_MAP: {
    ubisoft: 'UBISOFT',
    ea: 'EA',
    rockstar: 'ROCKSTAR',
    denuvo: 'DENUVO',
    playstation: 'PlayStation',
    other: 'OTHERS',
  },
  DATA_URL: 'https://raw.githubusercontent.com/LightnigFast/Project-Lightning/main/bypass.json',

  async loadData() {
    if (this.dataCache) return this.dataCache;
    try {
      const res = await fetch(this.DATA_URL + '?v=' + Date.now());
      this.rawJSONText = await res.text();
      this.dataCache = JSON.parse(this.rawJSONText);
      return this.dataCache;
    } catch (err) {
      showToast('Could not load bypass data', 'error');
      return null;
    }
  },

  async load() {
    await this.showGames(this.currentPlatform);
  },

  async showGames(platformKey) {
    this.currentPlatform = platformKey;
    const grid = document.getElementById('bypass-games');
    const detail = document.getElementById('bypass-detail');
    detail.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.innerHTML = '<p style="color: var(--color-text-muted); padding: 20px;">Loading...</p>';

    // Update active platform button
    document.querySelectorAll('.bypass-platform').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.platform === platformKey);
    });

    const data = await this.loadData();
    if (!data) { grid.innerHTML = '<p style="color: var(--color-danger);">Failed to load data</p>'; return; }

    const appKey = this.APP_KEY_MAP[platformKey];
    const company = data[appKey];
    if (!company) { grid.innerHTML = '<p style="color: var(--color-text-muted);">No entries for this platform</p>'; return; }

    // Preserve original JSON order
    const entries = Object.entries(company).sort((a, b) => {
      return this.rawJSONText.indexOf(`"${a[0]}"`) - this.rawJSONText.indexOf(`"${b[0]}"`);
    });

    grid.innerHTML = '';
    grid.style.display = 'grid';

    for (const [appid, game] of entries) {
      const isUnavailable = game.disponible === false;
      const card = document.createElement('div');
      card.className = `bypass-game-card${isUnavailable ? ' unavailable' : ''}`;
      card.dataset.appid = appid;

      const coverUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
      const headerUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

      card.innerHTML = `
        <div class="bypass-card-cover">
          <img src="${coverUrl}" alt="${game.name}" loading="lazy"
            onerror="this.style.display='none';this.parentElement.classList.add('no-cover')">
          ${isUnavailable ? '<div class="bypass-unavailable-badge">Unavailable</div>' : ''}
        </div>
        <div class="bypass-card-info">
          <span class="bypass-card-name">${game.name}</span>
          <span class="bypass-card-appid">AppID: ${appid}</span>
        </div>
      `;

      if (!isUnavailable) {
        card.addEventListener('click', () => this.showDetail(appid, game, headerUrl));
      }

      grid.appendChild(card);
    }
  },

  showDetail(appid, game, headerUrl) {
    const grid = document.getElementById('bypass-games');
    const detail = document.getElementById('bypass-detail');

    grid.classList.add('hidden');
    detail.classList.remove('hidden');

    const fixName = game.fix_name || game.nombre_fix || `${game.name} — bypass`;
    const comentarios = game.comentarios || game.dev_note || 'Enjoy the game ♥';
    const errores = game.errores || game.known_issues || [];
    const programas = game.programas_necesarios || game.required_software || [];
    const launchExe = game.launch_exe !== false;
    const launchSteam = game.launch_steam === true;

    // Build error list
    let errorsHtml = '';
    if (Array.isArray(errores)) {
      errores.forEach((err, i) => {
        errorsHtml += `<li class="error-item"><span class="error-num">${String(i + 1).padStart(2, '0')}</span><p class="error-text">${err}</p></li>`;
      });
    }
    if (!errorsHtml) errorsHtml = '<li class="error-item"><span class="error-num">—</span><p class="error-text">No known issues</p></li>';

    // Build required software
    let progHtml = '';
    if (Array.isArray(programas) && programas.length) {
      programas.forEach(p => { progHtml += `<li class="program-item">${p}</li>`; });
    } else {
      progHtml = '<li class="program-item">None required</li>';
    }

    detail.innerHTML = `
      <button class="btn btn-ghost bypass-back-btn" id="bypass-back">← Back</button>
      <div class="bypass-hero">
        <img class="bypass-hero-img" src="${headerUrl}" alt="${game.name}"
          onerror="this.style.display='none'">
        <div class="bypass-hero-overlay"></div>
        <div class="bypass-hero-content">
          <span class="bypass-fix-tag">${fixName}</span>
          <h2 class="bypass-game-title">${game.name}</h2>
        </div>
        <span class="bypass-appid-stamp">APP ${appid}</span>
      </div>
      <div class="bypass-detail-body">
        <div class="bypass-detail-actions">
          <div class="bypass-launch-badges">
            ${launchExe ? '<span class="badge badge-exe">▶ EXE launch</span>' : ''}
            ${launchSteam ? '<span class="badge badge-steam">🎮 Steam launch</span>' : ''}
          </div>
          <button class="btn btn-primary bypass-apply-btn" id="bypass-apply">
            Apply Fix
          </button>
        </div>
        <div class="bypass-detail-cols">
          <div class="bypass-col-main">
            <p class="section-label">Dev note</p>
            <blockquote class="dev-note">${comentarios}</blockquote>
            <div class="errors-section">
              <p class="section-label">Known issues</p>
              <ul class="error-list">${errorsHtml}</ul>
            </div>
          </div>
          <div class="bypass-col-side">
            <div>
              <p class="section-label">Required software</p>
              <ul class="program-list">${progHtml}</ul>
            </div>
            <div>
              <p class="section-label">Info</p>
              <div class="meta-row"><span class="meta-key">App ID</span><span class="meta-val">${appid}</span></div>
              <div class="meta-row"><span class="meta-key">Launch via EXE</span><span class="meta-val ${launchExe ? 'ok' : 'no'}">${launchExe ? 'Yes' : 'No'}</span></div>
              <div class="meta-row"><span class="meta-key">Launch via Steam</span><span class="meta-val ${launchSteam ? 'ok' : 'no'}">${launchSteam ? 'Yes' : 'No'}</span></div>
              <div class="meta-row"><span class="meta-key">Fix name</span><span class="meta-val">${fixName}</span></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('bypass-back').addEventListener('click', () => {
      detail.classList.add('hidden');
      grid.classList.remove('hidden');
    });

    document.getElementById('bypass-apply').addEventListener('click', async () => {
      showToast('Applying bypass for ' + game.name + '...');
      // Write Lua config for this game
      try {
        const result = await window.vex?.lua.write(appid, game.name, game.lua || null);
        if (result?.success) {
          showToast('Bypass applied! Lua written to Steam config.', 'success');
        } else {
          showToast('Failed: ' + (result?.error || 'Unknown'), 'error');
        }
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    });
  }
};

// Platform selector
document.querySelectorAll('.bypass-platform').forEach(btn => {
  btn.addEventListener('click', () => {
    window.VexBypass.showGames(btn.dataset.platform);
  });
});
