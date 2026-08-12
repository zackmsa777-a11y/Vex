/* ─── Vex — OnlineFix Tab ─── */
/* Adapted from Lightning's online-fix page with Vex's dark blue/pink theme */

window.VexOnlineFix = {
  allGames: [],
  filteredGames: [],
  currentPage: 1,
  perPage: 28,
  currentSearch: '',
  currentSort: 'recent',
  JSON_URL: 'https://nexus-links-alpha.vercel.app/onlinefix-fixes.json',

  async load() {
    await this.fetchGames();
    this.renderGrid();
  },

  async fetchGames() {
    try {
      const res = await fetch(this.JSON_URL);
      const data = await res.json();
      this.allGames = data.downloads || [];
      this.filteredGames = [...this.allGames];
    } catch (err) {
      // Fallback demo data
      this.allGames = [
        { title: 'Elden Ring', appid: '1245620', uris: [], 'header-image': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg' },
        { title: 'Cyberpunk 2077', appid: '1091500', uris: [], 'header-image': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg' },
        { title: 'Hogwarts Legacy', appid: '990080', uris: [], 'header-image': 'https://cdn.cloudflare.steamstatic.com/steam/apps/990080/header.jpg' },
        { title: 'Red Dead Redemption 2', appid: '1174180', uris: [], 'header-image': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg' },
        { title: "Baldur's Gate 3", appid: '1086940', uris: [], 'header-image': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/header.jpg' },
        { title: 'Sekiro', appid: '814380', uris: [], 'header-image': 'https://cdn.cloudflare.steamstatic.com/steam/apps/814380/header.jpg' },
        { title: 'Monster Hunter World', appid: '582010', uris: [], 'header-image': 'https://cdn.cloudflare.steamstatic.com/steam/apps/582010/header.jpg' },
        { title: 'GTA V', appid: '271590', uris: [], 'header-image': 'https://cdn.cloudflare.steamstatic.com/steam/apps/271590/header.jpg' },
      ];
      this.filteredGames = [...this.allGames];
    }
  },

  applyFilters() {
    let games = this.allGames.filter(g =>
      g.title.toLowerCase().includes(this.currentSearch.toLowerCase())
    );

    if (this.currentSort === 'az') {
      games.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    }

    this.filteredGames = games;
    this.currentPage = 1;
  },

  renderGrid() {
    const grid = document.getElementById('onlinefix-grid');
    const countEl = document.getElementById('onlinefix-count');
    grid.innerHTML = '';

    const start = (this.currentPage - 1) * this.perPage;
    const end = start + this.perPage;
    const pageGames = this.filteredGames.slice(start, end);

    if (!pageGames.length) {
      grid.innerHTML = '<p style="color: var(--color-text-muted); padding: 40px; text-align: center;">No online fixes found.</p>';
      countEl.textContent = '0 games';
      return;
    }

    pageGames.forEach((game, index) => {
      const imageUrl = game['header-image'] || `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
      const card = document.createElement('article');
      card.className = 'onlinefix-card';
      card.style.setProperty('--d', index);
      card.innerHTML = `
        <div class="onlinefix-card-img" style="background-image: url('${imageUrl}')">
          <div class="onlinefix-card-overlay"></div>
          <div class="onlinefix-card-content">
            <div class="onlinefix-card-info">
              <h3 class="onlinefix-card-title">${game.title}</h3>
              <span class="onlinefix-card-sub">ONLINE FIX</span>
            </div>
            <button class="btn btn-primary onlinefix-card-action">Apply</button>
          </div>
        </div>
      `;

      const btn = card.querySelector('.onlinefix-card-action');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.applyFix(game, btn);
      });

      grid.appendChild(card);
    });

    countEl.textContent = `${this.filteredGames.length} games`;
    this.renderPagination();
  },

  renderPagination() {
    const pagEl = document.getElementById('onlinefix-pagination');
    const totalPages = Math.ceil(this.filteredGames.length / this.perPage);
    pagEl.innerHTML = '';
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.textContent = '←';
    prev.disabled = this.currentPage === 1;
    prev.addEventListener('click', () => { this.currentPage--; this.renderGrid(); });
    pagEl.appendChild(prev);

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.className = i === this.currentPage ? 'active' : '';
      btn.addEventListener('click', () => { this.currentPage = i; this.renderGrid(); });
      pagEl.appendChild(btn);
    }

    const next = document.createElement('button');
    next.textContent = '→';
    next.disabled = this.currentPage >= totalPages;
    next.addEventListener('click', () => { this.currentPage++; this.renderGrid(); });
    pagEl.appendChild(next);
  },

  async applyFix(game, btn) {
    const originalText = btn.textContent;
    showToast('Applying online fix for ' + game.title + '...');

    // Select destination folder
    const destDir = await window.vex?.system.openFolder('');
    if (!destDir) return;

    // Validate it's a Steam apps/common path
    const normalized = destDir.toLowerCase().replace(/\\/g, '/');
    if (!normalized.includes('steamapps/common')) {
      showToast('Please select a steamapps/common folder', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Downloading...';

    try {
      // Try to download via the first URI
      if (game.uris && game.uris.length > 0) {
        const savePath = destDir;
        const result = await window.vex?.downloads.start({
          url: game.uris[0],
          title: game.title,
          savePath,
          provider: 'auto',
        });

        if (result?.success) {
          btn.textContent = 'Done!';
          showToast('Online fix applied successfully', 'success');
        } else {
          throw new Error(result?.error || 'Download failed');
        }
      } else {
        // No URIs — write Lua config
        const result = await window.vex?.lua.write(game.appid || '', game.title, null);
        if (result?.success) {
          btn.textContent = 'Done!';
          showToast('Online fix applied (Lua config written)', 'success');
        } else {
          throw new Error(result?.error || 'Failed to write Lua');
        }
      }

      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = originalText;
      }, 5000);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = originalText;
      showToast('Failed: ' + err.message, 'error');
    }
  }
};

// Search
document.getElementById('onlinefix-search').addEventListener('input', (e) => {
  window.VexOnlineFix.currentSearch = e.target.value;
  window.VexOnlineFix.applyFilters();
  window.VexOnlineFix.renderGrid();
});

// Sort buttons
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.VexOnlineFix.currentSort = btn.dataset.sort;
    window.VexOnlineFix.applyFilters();
    window.VexOnlineFix.renderGrid();
  });
});
