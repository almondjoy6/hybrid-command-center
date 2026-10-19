# Hybrid Command Center updater

The installed baseline is v0.4.0. Future updates use only the public personal repository `almondjoy6/hybrid-command-center`. See [RELEASE-0.5.0.md](RELEASE-0.5.0.md) for the current release gates and exact publishing commands.

- Endpoint: https://github.com/almondjoy6/hybrid-command-center/releases/latest/download/latest.json
- Preserve `com.local.hybridcommandcenter`, product name, existing updater public key and NSIS installation identity.
- Reuse the original encrypted `$env:USERPROFILE\.tauri\hcc-updater.key`; its companion public key matches the installed baseline. Do not generate a replacement key.
- The personal repository's Actions secrets must contain `TAURI_SIGNING_PRIVATE_KEY` (original private key contents) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never paste either into chat, commands, logs or Git.
- `bundle.createUpdaterArtifacts: true` and NSIS packaging produce the installer and detached updater signature. The release action uploads these and generates `latest.json`. The workflow is restricted to the personal repository.
- Check for Updates detects availability. The separate Install action downloads, verifies and installs after confirmation. Successful automatic checks are limited to daily checks; installation remains manual.
- Keep package.json, package-lock.json, Cargo.toml, the application's Cargo.lock entry and tauri.conf.json synchronized. Version labels read native application metadata, with package metadata used for browser previews.
- Export Backup before an actual upgrade. Do not uninstall, clear WebView2 storage, or restore a backup unless recovery is necessary: restore replaces current data. Normal in-place installation should retain the existing data directory.

Updater signatures do not provide Windows Authenticode signing; SmartScreen may still warn. Backups are plaintext JSON and must be kept private.
