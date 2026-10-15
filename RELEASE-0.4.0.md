# Hybrid Command Center v0.4.0

## What's new
- Six live-switchable themes: Violet, Midnight, Emerald, Sunset, Light and Cyberpunk.
- Appearance page: density, animations, overview widget ordering and visibility.
- User-defined website launcher shortcuts (HTTPS).
- Saved Ollama conversations, new chat, and stop-displaying button. Note: Stop only stops UI streaming; it does not cancel inference in Ollama.
- Task priority and due dates, searchable saved notes, searchable/sorted Tailscale devices.
- Background Windows process launches now suppress terminal windows (nvidia-smi, tailscale, launcher).
- Retains existing `hcc-v1` localStorage data and app identifier; existing v0.3.0 installations can update.

## Safe release steps
1. In installed v0.3.0, use Settings > Export Backup before upgrading.
2. Replace source with this package in a clean working tree, review `git diff`, and run `npm install` and `npm run tauri build` with your existing Tauri signing credentials.
3. Test on Windows: terminal flashes, each theme, tasks, notes, AI streaming, Tailscale, launcher, and backup/restore.
4. Commit and push to `main`, then tag `v0.4.0` and push the tag to trigger GitHub Actions.
5. Confirm release contains NSIS `.exe`, `.exe.sig`, and `latest.json`. Use v0.3.0 Settings > Check for Updates.

Do not commit private signing keys, passwords, local backups, or PHI. The updater public key is unchanged.
