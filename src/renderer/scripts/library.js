/* ─── Vex — Library Tab ─── */

window.VexLibrary = {
  games: [],

  async load() {
    const grid = document.getElementById('library-grid');
    const empty = document.getElementById('library-empty');
    grid.innerHTML = '';

    try {
      this.games = await window.vex?.library.scan() || [];
      if (!this.games.length) {
        empty.classList.remove('hidden');
        grid.style.display = 'none';
        return;
      }

      empty.classList.add('hidden');
      grid.style.display = '';

      this.games.forEach(game => {
        const isInstalled = game.installed !== false;

        const card = createGameCard({
          appId: game.appId,
          title: game.name,
        }, { showPlay: isInstalled });

        // Add install size / status info
        const info = card.querySelector('.game-info');
        if (info) {
          if (isInstalled) {
            info.innerHTML += `<div class="game-meta">Size: ${game.sizeFormatted || 'Unknown'}</div>`;
          } else {
            info.innerHTML += `<div class="game-meta" style="color: var(--color-warning);">Unlocked — not installed</div>`;
          }
        }

        // For unlocked-but-not-installed games, swap the missing Play button
        // for an "Install via Steam" action that opens the store page
        if (!isInstalled) {
          const actions = card.querySelector('.game-actions');
          const installBtn = document.createElement('button');
          installBtn.className = 'btn btn-primary';
          installBtn.textContent = '↓ Install via Steam';
          installBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.vex?.system.openExternal(`steam://store/${game.appId}`);
            showToast('Opening Steam store page — install from there, it\'ll show as owned', 'info');
          });
          actions.insertBefore(installBtn, actions.firstChild);
        }

        grid.appendChild(card);
      });
    } catch (err) {
      empty.classList.remove('hidden');
      grid.style.display = 'none';
    }
  }
};

document.getElementById('library-rescan').addEventListener('click', () => {
  showToast('Scanning library...');
  window.VexLibrary.load();
});
