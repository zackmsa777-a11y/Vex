/* ─── Vex — Home Tab ─── */

window.VexHome = {
  games: [],
  async load() {
    const grid = document.getElementById('home-grid');
    const empty = document.getElementById('home-empty');
    grid.innerHTML = '';

    try {
      // sls.getIds() returns [{ appId, name }] — apps SLSsteam has unlocked
      // via the AdditionalApps entry in ~/.config/SLSsteam/config.yaml
      const slsApps = await window.vex?.sls.getIds() || [];
      const libraryGames = await window.vex?.library.scan() || [];

      this.games = slsApps.map(({ appId, name }) => ({
        appId,
        title: name || libraryGames.find(g => g.appId === appId)?.name || `App ${appId}`,
      }));

      // Also add installed library games not already unlocked via SLSsteam
      for (const g of libraryGames) {
        if (!this.games.find(x => x.appId === g.appId)) {
          this.games.push({ appId: g.appId, title: g.name });
        }
      }

      if (!this.games.length) {
        empty.classList.remove('hidden');
        grid.style.display = 'none';
        return;
      }

      empty.classList.add('hidden');
      grid.style.display = '';
      this.games.forEach(game => {
        grid.appendChild(createGameCard(game, { showPlay: true }));
      });
    } catch (err) {
      empty.classList.remove('hidden');
      grid.style.display = 'none';
      showToast('Could not load games: ' + err.message, 'error');
    }
  }
};

// ─── Add Game by AppID ───
document.getElementById('appid-submit').addEventListener('click', async () => {
  const appId = document.getElementById('appid-input').value.trim();
  const name = document.getElementById('game-name-input').value.trim() || `App ${appId}`;
  if (!appId) { showToast('Please enter an AppID', 'error'); return; }

  showToast('Adding game to SLSsteam config...');
  try {
    const result = await window.vex.lua.write(appId, name, null);
    if (result.success) {
      showToast('Game added! Restart Steam to see it in your Steam library too.', 'success');
      closeModal('add-game-modal');
      document.getElementById('appid-input').value = '';
      document.getElementById('game-name-input').value = '';
      window.VexHome.load();
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
});

// ─── Add Game by Lua Script ───
document.getElementById('lua-submit').addEventListener('click', async () => {
  const appId = document.getElementById('lua-appid').value.trim();
  const name = document.getElementById('lua-name').value.trim() || `App ${appId}`;
  const content = document.getElementById('lua-content').value.trim();
  if (!appId) { showToast('Please enter an AppID', 'error'); return; }
  if (!content) { showToast('Please paste a Lua script or drop a .lua file', 'error'); return; }

  showToast('Adding game to SLSsteam config...');
  try {
    const result = await window.vex.lua.write(appId, name, content);
    if (result.success) {
      showToast('Game added! Restart Steam to see it in your Steam library too.', 'success');
      closeModal('add-game-modal');
      document.getElementById('lua-appid').value = '';
      document.getElementById('lua-name').value = '';
      document.getElementById('lua-content').value = '';
      window.VexHome.load();
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
});

// ─── Lua File Drop Zone ───
const dropZone = document.getElementById('lua-drop-zone');
const fileInput = document.getElementById('lua-file-input');

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) readFile(file);
});
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.lua')) readFile(file);
});

function readFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('lua-content').value = e.target.result;
    // Try to extract AppID from filename or content
    const nameMatch = file.name.match(/^(\d+)/);
    if (nameMatch) document.getElementById('lua-appid').value = nameMatch[1];
  };
  reader.readAsText(file);
}

// Load on startup
window.VexHome.load();
