# Vex — Full Installation & Build Tutorial

## Prerequisites

### 1. Install Git

#### Fedora / RHEL
```bash
sudo dnf install git -y
```

#### Ubuntu / Debian
```bash
sudo apt update && sudo apt install git -y
```

#### Arch Linux
```bash
sudo pacman -S git
```

#### Verify installation
```bash
git --version
```

### 2. Install Node.js (v20+)

#### Fedora
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install nodejs -y
```

#### Ubuntu / Debian
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y
```

#### Verify
```bash
node --version
npm --version
```

### 3. Configure Git (first time only)
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## Getting the Code

### Option A: Clone from GitHub (recommended)
```bash
git clone https://github.com/zackmsa777-a11y/Vex.git
cd Vex
```

### Option B: Fork & Clone (if you want to contribute)
1. Go to https://github.com/zackmsa777-a11y/Vex
2. Click **Fork** in the top right
3. Clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/Vex.git
cd Vex
git remote add upstream https://github.com/zackmsa777-a11y/Vex.git
```

---

## Running Vex

### Development mode
```bash
npm install
npm start -- --dev
```

This launches Vex with DevTools enabled.

### Production build (AppImage)
```bash
npm install
npm run build
```

The AppImage will be created at `dist/Vex-1.0.0.AppImage`.

---

## Running the AppImage

```bash
# Make it executable
chmod +x dist/Vex-1.0.0.AppImage

# Run it
./dist/Vex-1.0.0.AppImage
```

### Optional: Install system-wide
```bash
# Move to a directory in your PATH
sudo mv dist/Vex-1.0.0.AppImage /usr/local/bin/vex
# Now just run:
vex
```

### Optional: Create desktop shortcut
```bash
cat > ~/.local/share/applications/vex.desktop << 'EOF'
[Desktop Entry]
Name=Vex
Comment=Linux-first Steam game setup companion
Exec=/usr/local/bin/vex
Icon=vex
Type=Application
Categories=Game;Utility;
Terminal=false
StartupWMClass=Vex
EOF
```

---

## GitHub Actions (Automatic Builds)

The repo includes a GitHub Actions workflow at `.github/workflows/build.yml`.

### How it works:
- Every push to `main` triggers a build
- The AppImage is uploaded as an artifact (downloadable from the Actions tab)
- Tagged releases (`git tag v1.0.1 && git push origin v1.0.1`) create a GitHub Release with the AppImage attached

### To trigger a build manually:
1. Go to the repo on GitHub
2. Click **Actions** tab
3. Select **Build AppImage**
4. Click **Run workflow**

### To download built AppImages:
1. Go to **Actions** tab
2. Click on the latest successful run
3. Download the **Vex-AppImage** artifact

---

## Project Structure

```
Vex/
├── package.json              # Dependencies & build config
├── electron-builder.yml     # AppImage packaging config
├── .github/workflows/
│   └── build.yml             # CI: auto AppImage on push
├── .gitignore
├── README.md
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.js           # Window, Steam, SLSsteam, Lua, IPC
│   │   ├── preload.js        # Context bridge API
│   │   └── downloads/
│   │       └── providers.js  # GoFile, Buzzheavier, MegaDB, Rootz, WebTorrent
│   └── renderer/             # UI (browser process)
│       ├── index.html        # 7-tab layout
│       ├── assets/
│       │   └── icon.png      # App icon (512x512)
│       ├── styles/
│       │   └── main.css      # Vex dark blue/pink theme
│       └── scripts/
│           ├── app.js        # Navigation, toasts, game cards
│           ├── home.js       # Game grid + add game
│           ├── store.js      # IGDB/Nexus discovery
│           ├── library.js    # Steam appmanifest scanner
│           ├── downloads.js  # Active downloads + history
│           ├── bypass.js     # Platform selector + game detail
│           ├── onlinefix.js  # Searchable fix grid
│           └── settings.js   # Steam, SLSsteam, IGDB, sources
```

---

## Troubleshooting

### "error while loading shared libraries: libnss3.so"
```bash
# Fedora
sudo dnf install nss nspr atk at-spi2-atk cups-libs libdrm libXcomposite libXdamage libXrandr mesa-libgbm pango alsa-lib

# Ubuntu
sudo apt install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libasound2
```

### Steam not detected
Vex checks these paths:
- `~/.local/share/Steam`
- `~/.steam/steam`
- `~/.var/app/com.valvesoftware.Steam/data/Steam` (Flatpak)
- `~/snap/steam/common/.steam/steam` (Snap)

If Steam is installed elsewhere, set it manually in **Settings → Steam Path → Browse**.

### SLSsteam injection not working
1. Go to **Settings → Linux Setup**
2. Click **"Set up Linux tools (SLSsteam + .NET 9)"**
3. This downloads `SLSteam.so` and `library-inject.so` to your Steam directory
4. Use **"Restart Steam (with injection)"** to apply

### Build fails with icon error
Make sure `src/renderer/assets/icon.png` is at least 256×256 pixels.

---

## License

GPL-3.0 — see repository for full license text.
