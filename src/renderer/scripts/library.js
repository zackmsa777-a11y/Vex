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

        const actions = card.querySelector('.game-actions');

        // For unlocked-but-not-installed games, add Install button
        if (!isInstalled) {
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

        // Add visible Remove button for all games
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-danger';
        removeBtn.textContent = '🗑 Remove';
        removeBtn.style.marginLeft = '8px';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Remove "${game.name}" from Vex?\n\nThis will:\n• Delete the Lua script\n• Remove from SLSsteam config\n• Delete the appmanifest ACF file\n• Delete cached depot manifests\n\nThe game files on disk will NOT be deleted.`)) {
            this.removeGame(game.appId, game.name);
          }
        });
        actions.appendChild(removeBtn);

        grid.appendChild(card);
      });
    } catch (err) {
      empty.classList.remove('hidden');
      grid.style.display = 'none';
    }
  },

  async removeGame(appId, name) {
    showToast(`Removing ${name}...`);
    try {
      const result = await window.vex?.library.remove(appId);
      if (result?.success) {
        const parts = [];
        if (result.removed?.lua) parts.push('Lua');
        if (result.removed?.sls) parts.push('SLS config');
        if (result.removed?.acf) parts.push('ACF manifest');
        if (result.removed?.depotcache) parts.push('depot manifests');
        showToast(`Removed ${name} (${parts.join(', ') || 'cleaned up'})`, 'success');
        this.load();
      } else {
        showToast(`Failed to remove: ${result?.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast(`Failed to remove: ${err.message}`, 'error');
    }
  }
};

document.getElementById('library-rescan').addEventListener('click', () => {
  showToast('Scanning library...');
  window.VexLibrary.load();
});
