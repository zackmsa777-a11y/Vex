# Vex

A Linux-first Steam game setup companion using SLSsteam injection.

## Overview

Vex is an Electron-based desktop application that simplifies the SteaMidra (SFF) workflow for Linux users. It provides a clean 5-tab interface for managing Steam games via Lua scripts and SLSsteam injection.

## Architecture

- **Electron + Node.js** main process
- **SLSsteam injection** (LD_PRELOAD of SLSteam.so + library-inject.so)
- **5-tab layout**: Home, Store (Nexus/IGDB), Library, Downloads, Settings

## Features

- Steam path auto-detection (native, Flatpak, Snap)
- SLSsteam + library-inject.so setup
- Lua script writing to `config/stplug-in/<appid>.lua`
- Game launch via `steam://run/<appid>`
- IGDB-powered game discovery (Nexus)
- Multi-provider download support (GoFile, Buzzheavier, MegaDB, Rootz, WebTorrent)
- Library scanning from Steam appmanifest files
- AppImage packaging for Linux

## Building

```bash
npm install
npm run build    # Creates AppImage in dist/
```

## Running in Dev

```bash
npm install
npm start -- --dev
```

## License

GPL-3.0
