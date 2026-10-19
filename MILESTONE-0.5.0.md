# v0.5.0 development milestone 1 — dashboard foundation

This records the original dashboard milestone. The v0.5.0 release scope is now the dashboard and visual redesign; see `RELEASE-0.5.0.md` for validation and publishing gates. Keep v0.4.0 installed until the signed update is published and verified.

Implemented:
- Named dashboard profiles (Default, Gaming, Development, Servers) and custom profiles.
- Edit mode with pointer-based dragging and half/full-width widget sizing.
- Layout persistence in existing `hcc-v1` localStorage, with migration from v0.4.0 widget order and hidden widgets.
- Standalone, tested layout model in `src/dashboard/layout.js`.
- Node test suite: `npm test`.

Deferred beyond v0.5.0: CPU history, configurable hardware alerts, Ollama cancellation, Ctrl+K palette, server health checks.

Build verification: run `npm ci`, `npm run test:all`, and `npm run tauri -- build` on Windows. The signed build requires the original updater key and its password.

Do not publish until the release validation gates in `RELEASE-0.5.0.md` are met.
