# Hybrid Command Center v0.1.0

A local-first Windows desktop dashboard built with Tauri 2, React, and Vite. Violet theme, balanced layout, standard resizable window.

## Included

- Overview with quick launcher, Ollama status, weather, tasks, notes, and Tailscale status.
- App launcher: Steam, Discord, VS Code, File Explorer, Windows Terminal, browser.
- Ollama local model discovery and chat (non-streaming; 180-second request timeout).
- Current weather by city via Open-Meteo (internet connection required).
- Clock using Windows system time.
- Local tasks and notes, persisted in the app webview's localStorage.
- Tailscale peer status via the locally installed Tailscale CLI.

## Windows prerequisites

1. Install Node.js LTS: https://nodejs.org/en/download
2. Install Rust using rustup: https://rustup.rs/
3. Install Microsoft C++ Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/ . Select **Desktop development with C++**, including Windows SDK.
4. Ensure Microsoft Edge WebView2 runtime is installed: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
5. Optional: Ollama https://ollama.com/download/windows ; run `ollama pull qwen2.5:7b` (or use a model you already have).
6. Optional: Tailscale https://tailscale.com/download/windows ; sign in and connect.

## Local dashboard browser tests

Run these commands from this folder (`C:\Projects\hybrid-command-center`), which contains the latest viewport fix. The nested project and `Backup/` copies are older snapshots.

```powershell
npm install
npx playwright install chromium
npm test
npm run test:e2e
npm run test:e2e:report
```

The Playwright suite starts this frontend on `http://127.0.0.1:1421` and runs Chromium at 1920×1080 and 2560×1440. It checks pointer dragging, half/full-width controls, profile switching, viewport coverage, overflow, responsive columns, and layout persistence without changing other saved data. Each test gets fresh browser storage, attaches a screenshot to the HTML report, and retains a trace on failure. Weather and native Tauri responses are local test fixtures; no external API calls or paid services are used.

Vertical scrolling inside the main content panel is intentional. Tests reject horizontal overflow, outer-page scrolling, and panels extending outside their widgets. Native WebView resizing, actual hardware, Ollama, and Tauri backup/restore dialogs require separate desktop checks.

To watch interactions, run `npm run test:e2e -- --headed`; to run one screen size, add `--project=1920x1080`.

Native Windows checks are available with `npm run build:native:test`, then `npm run test:native:smoke` or `npm run test:native`. Run `npm run test:all` for unit, browser, Rust, standalone build and native checks. See [Windows desktop testing](tests/native/README.md) for isolated storage, UI Automation/FlaUI findings, verified WebView2 automation, and remaining release/DPI checks.

## Development startup

Open PowerShell in this extracted project folder:

```powershell
npm install
npm run tauri dev
```

The first build downloads Rust dependencies and can take several minutes. The Tauri window opens automatically.

## Build a Windows installer

```powershell
npm run tauri build
```

Look for the `.exe` installer under `src-tauri\target\release\bundle\nsis\`.

## Troubleshooting

- `npm` not recognized: restart PowerShell after installing Node.js.
- `cargo` not recognized: restart PowerShell after installing Rust.
- C++ linker error: install the Visual Studio C++ workload and Windows SDK.
- Ollama unavailable: open Ollama or run `ollama serve` in a terminal. Test `http://127.0.0.1:11434/api/tags`.
- Tailscale CLI not found: add `C:\Program Files\Tailscale` to the Windows PATH, then restart the app. Run `tailscale status --json` in PowerShell to confirm.
- Steam/Discord/VS Code launcher doesn't open: install the app and ensure its Windows URL protocol is registered. Windows Terminal requires `wt.exe` on PATH.
- Weather unavailable: verify internet access and try a more specific city name.
- Notes/tasks are not synchronized or backed up. Clearing the app's webview data can erase them.

## Privacy / security

- Ollama requests go to `127.0.0.1:11434` only. The chat is held in app memory until cleared/closed; it is not saved to localStorage.
- Weather city is sent to Open-Meteo; no precise location is requested.
- Tailscale status is read locally; no Tailscale API token required.
- Notes/tasks are stored in unencrypted localStorage: **do not put credentials, PHI, or sensitive work information in them**.
- Launcher uses fixed targets; no arbitrary shell command entry.
- Tauri CSP is disabled in this starter version to allow the weather integration without additional configuration. Harden CSP before distributing beyond personal use.

## Future improvements

Encrypted SQLite persistence, customizable launchers, streaming Ollama chat, hardware monitoring, system tray, Azure read-only integration, and granular widget layout editing.


## Version 0.2 upgrade

- Added Hardware page with live NVIDIA GPU usage, temperatures, power, VRAM and rolling utilization charts (requires `nvidia-smi` on PATH).
- Ollama chat now uses a Tauri channel and streamed NDJSON responses. You see tokens as they arrive and an elapsed-time indicator. A request can still take time to load a model.
- Vite excludes `src-tauri` build files from its watcher to prevent Windows EBUSY errors.

### Updating an existing installation

Stop `npm run tauri dev` with Ctrl+C, **back up your existing folder**, extract this ZIP into a separate folder, then run `npm install` and `npm run tauri dev` from the extracted `hybrid-command-center` directory. Do not overwrite the running project until you have tested the new version.

Note: Stop-generation is not included yet; streaming and timing are functional, but cancellation requires a separate backend mechanism.
