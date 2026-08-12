/* ─── Vex — Store Tab (Nexus / IGDB) ─── */

window.VexStore = {
  allGames: [],
  filteredGames: [],
  currentPage: 0,
  perPage: 6,
  currentGenre: 'all',
  heroIndex: 0,
  heroTimer: null,

  // IGDB proxy: fetchNexusApi({ type: 'igdb', endpoint: 'games' })
  async fetchNexusGames(query) {
    try {
      const results = await window.vex?.nexus.search(query || '');
      if (results && results.length) return results;
    } catch {}
    return null;
  },

  getDemoGames() {
    return [
      { appId: '1245620', title: 'Elden Ring', description: 'An epic dark fantasy adventure in a vast open world.', genres: ['RPG', 'Action'], popularity: 95 },
      { appId: '1091500', title: 'Cyberpunk 2077', description: 'An open-world, action-adventure story set in Night City.', genres: ['RPG', 'Shooter'], popularity: 90 },
      { appId: '990080', title: 'Hogwarts Legacy', description: 'Experience the wizarding world in an open-world adventure.', genres: ['RPG', 'Adventure'], popularity: 88 },
      { appId: '1174180', title: 'Red Dead Redemption 2', description: 'An epic tale of life in America at the dawn of the modern age.', genres: ['Action', 'Adventure'], popularity: 92 },
      { appId: '1086940', title: "Baldur's Gate 3", description: 'Gather your party and return to the Forgotten Realms.', genres: ['RPG', 'Strategy'], popularity: 94 },
      { appId: '1551360', title: 'Forza Horizon 5', description: 'Explore the vibrant open-world landscapes of Mexico.', genres: ['Racing', 'Sports'], popularity: 85 },
      { appId: '569740', title: 'Dying Light 2', description: 'A survival horror game set in a post-apocalyptic open world.', genres: ['Action', 'Shooter'], popularity: 78 },
      { appId: '582010', title: 'Monster Hunter World', description: 'Take on the role of a hunter in a living, breathing ecosystem.', genres: ['Action', 'RPG'], popularity: 82 },
      { appId: '814380', title: 'Sekiro: Shadows Die Twice', description: 'A dark fantasy action-adventure set in a reimagined late 1500s Sengoku Japan.', genres: ['Action', 'Adventure'], popularity: 86 },
      { appId: '271590', title: 'GTA V', description: 'A criminal epic spanning a vast satirical reimagining of Southern California.', genres: ['Action', 'Adventure'], popularity: 91 },
      { appId: '620', title: 'Portal 2', description: 'A first-person puzzle game that challenges you to think with portals.', genres: ['Indie', 'Strategy'], popularity: 84 },
      { appId: '413150', title: 'Stardew Valley', description: 'Build the farm of your dreams in a peaceful rural setting.', genres: ['Indie', 'RPG'], popularity: 80 },
      { appId: '1145360', title: 'Hades', description: 'A god-defying rogue-like dungeon crawler.', genres: ['Indie', 'Action'], popularity: 83 },
      { appId: '105600', title: 'Terraria', description: 'A 2D sandbox adventure game with endless possibilities.', genres: ['Indie', 'Adventure'], popularity: 76 },
      { appId: '504230', title: 'Celeste', description: 'A narrative-driven single-player adventure about climbing a mountain.', genres: ['Indie', 'Adventure'], popularity: 72 },
    ];
  },

  async load() {
    this.allGames = this.getDemoGames();
    this.renderHero();
    this.renderTrending();
    this.applyFilters();
  },

  renderHero() {
    const heroEl = document.getElementById('store-hero');
    const featured = this.allGames.slice(0, 5);

    heroEl.innerHTML = '';
    featured.forEach((game, i) => {
      const slide = document.createElement('div');
      slide.className = `hero-slide ${i === 0 ? 'active' : ''}`;
      slide.style.backgroundImage = `url(${steamCoverUrl(game.appId)})`;
      slide.innerHTML = `
        <h2>${game.title}</h2>
        <p>${game.description}</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="view">View Details</button>
          <button class="btn btn-ghost" data-action="add">+ Add to Library</button>
        </div>
      `;
      heroEl.appendChild(slide);

      slide.querySelector('[data-action="view"]').addEventListener('click', () => this.showGameDetail(game));
      slide.querySelector('[data-action="add"]').addEventListener('click', () => addGameToHome(game));
    });

    // Dots
    const dots = document.createElement('div');
    dots.className = 'hero-dots';
    featured.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = `hero-dot ${i === 0 ? 'active' : ''}`;
      dot.addEventListener('click', () => this.setHeroSlide(i));
      dots.appendChild(dot);
    });
    heroEl.appendChild(dots);

    // Auto-rotate
    if (this.heroTimer) clearInterval(this.heroTimer);
    this.heroTimer = setInterval(() => {
      this.heroIndex = (this.heroIndex + 1) % featured.length;
      this.setHeroSlide(this.heroIndex);
    }, 5000);
  },

  setHeroSlide(index) {
    this.heroIndex = index;
    document.querySelectorAll('.hero-slide').forEach((s, i) => {
      s.classList.toggle('active', i === index);
    });
    document.querySelectorAll('.hero-dot').forEach((d, i) => {
      d.classList.toggle('active', i === index);
    });
  },

  renderTrending() {
    const grid = document.getElementById('trending-grid');
    grid.innerHTML = '';
    const trending = [...this.allGames].sort((a, b) => b.popularity - a.popularity).slice(0, 6);
    trending.forEach(game => {
      grid.appendChild(createGameCard(game, { showAdd: true }));
    });
  },

  applyFilters() {
    const genre = this.currentGenre;
    this.filteredGames = genre === 'all'
      ? [...this.allGames]
      : this.allGames.filter(g => g.genres?.includes(genre));
    this.renderNewReleases();
  },

  renderNewReleases() {
    const grid = document.getElementById('new-releases-grid');
    grid.innerHTML = '';
    const start = this.currentPage * this.perPage;
    const end = start + this.perPage;
    const pageGames = this.filteredGames.slice(start, end);

    if (!pageGames.length) {
      grid.innerHTML = '<p style="color: var(--color-text-muted); padding: 20px;">No games found.</p>';
      return;
    }

    pageGames.forEach(game => {
      grid.appendChild(createGameCard(game, { showAdd: true }));
    });

    this.renderPagination();
  },

  renderPagination() {
    const pagination = document.getElementById('store-pagination');
    const totalPages = Math.ceil(this.filteredGames.length / this.perPage);
    pagination.innerHTML = '';

    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.textContent = '←';
    prev.disabled = this.currentPage === 0;
    prev.addEventListener('click', () => { this.currentPage--; this.renderNewReleases(); });
    pagination.appendChild(prev);

    for (let i = 0; i < totalPages; i++) {
      const btn = document.createElement('button');
      btn.textContent = i + 1;
      btn.className = i === this.currentPage ? 'active' : '';
      btn.addEventListener('click', () => { this.currentPage = i; this.renderNewReleases(); });
      pagination.appendChild(btn);
    }

    const next = document.createElement('button');
    next.textContent = '→';
    next.disabled = this.currentPage >= totalPages - 1;
    next.addEventListener('click', () => { this.currentPage++; this.renderNewReleases(); });
    pagination.appendChild(next);
  },

  showGameDetail(game) {
    // Simple alert for now — can expand to a modal
    const win = window.open('', '_blank', 'width=800,height=600');
    win.document.write(`
      <html><head><title>${game.title}</title>
      <style>body{background:#0f111a;color:#eee;font-family:sans-serif;padding:40px;}
      img{width:100%;border-radius:10px;margin-bottom:20px;}
      h1{font-size:24px;margin-bottom:10px;}
      p{color:#8892b0;line-height:1.6;}</style></head>
      <body>
      <img src="${steamCoverUrl(game.appId)}" onerror="this.style.display='none'">
      <h1>${game.title}</h1>
      <p>AppID: ${game.appId}</p>
      <p>Genres: ${game.genres?.join(', ') || 'Unknown'}</p>
      <p>${game.description || ''}</p>
      </body></html>
    `);
  }
};

// ─── Genre chips ───
document.querySelectorAll('.genre-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    window.VexStore.currentGenre = chip.dataset.genre;
    window.VexStore.currentPage = 0;
    window.VexStore.applyFilters();
  });
});

// ─── Search ───
document.getElementById('store-search-btn').addEventListener('click', async () => {
  const query = document.getElementById('store-search').value.trim();
  if (!query) return;
  showToast('Searching IGDB...');
  const results = await window.VexStore.fetchNexusGames(query);
  if (results && results.length) {
    // Map IGDB results to game cards
    window.VexStore.allGames = results.map(g => ({
      appId: String(g.app_id || g.id || ''),
      title: g.name || g.title || 'Unknown',
      description: g.summary || g.description || '',
      genres: g.genres || [],
      popularity: g.popularity || 50,
    }));
  } else {
    // Fall back to filtering demo data
    window.VexStore.allGames = window.VexStore.getDemoGames().filter(g =>
      g.title.toLowerCase().includes(query.toLowerCase())
    );
    if (!window.VexStore.allGames.length) {
      showToast('No results found', 'error');
      return;
    }
  }
  window.VexStore.currentPage = 0;
  window.VexStore.renderHero();
  window.VexStore.renderTrending();
  window.VexStore.applyFilters();
  showToast(`Found ${window.VexStore.allGames.length} games`, 'success');
});

document.getElementById('store-search').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('store-search-btn').click();
});

// Load store on init
window.VexStore.load();
