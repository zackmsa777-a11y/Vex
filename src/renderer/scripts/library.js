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
        const card = createGameCard({
          appId: game.appId,
          title: game.name,
        }, { showPlay: true });

        // Add install size and last played info
        const info = card.querySelector('.game-info');
        if (info) {
          info.innerHTML += `<div class="game-meta">Size: ${game.sizeFormatted || 'Unknown'}</div>`;
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
