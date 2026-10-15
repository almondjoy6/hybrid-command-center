# Hybrid Command Center: updater bootstrap

This is the **source** for the first updater-enabled version, 0.3.0. It has NOT been Windows-built or tested. The repository URL and public verification key are already configured. The private key and signing password must remain only in GitHub Actions secrets and your secure local backup. The current development version is 0.2.1; it cannot update itself. Install 0.3.0 once with the NSIS installer. Later signed versions update in-app.

## 1. Create GitHub repo

Create a PUBLIC repository named `hybrid-command-center` under your personal GitHub account (not your employer's organization). Do not commit private keys, secrets, or personal backup JSON files. In GitHub Settings > Actions > General, allow GitHub Actions and give workflows read/write permissions if needed for releases. A token scoped to the workflow's `contents: write` permission is provided automatically.

## 2. Generate a signing key locally (PowerShell)

From the extracted project root, run `npm install` and then:

```powershell
New-Item -ItemType Directory -Force "$HOME\.tauri" | Out-Null
npm run tauri signer generate -- -w "$HOME\.tauri\hcc-updater.key"
```

Choose a strong password and retain it in a password manager. This creates a PRIVATE `.key` and a PUBLIC `.key.pub` in your user profile. Back up the private key securely, OFF GitHub, and never paste it into chat. Losing it prevents existing installations from trusting new updates. The public key is safe to use in source.

## 3. Set repo URL and public key

The following settings are already configured in `src-tauri/tauri.conf.json`:

- `plugins.updater.pubkey` contains your public verification key.
- The endpoint points to `stetsonalmond/hybrid-command-center` on GitHub Releases.
- Keep `bundle.createUpdaterArtifacts: true` and `bundle.targets: ["nsis"]`.

## 4. Configure GitHub Actions secrets

In your repository > Settings > Secrets and variables > Actions, create:

- `TAURI_SIGNING_PRIVATE_KEY`: **the entire contents** of `hcc-updater.key`, not the public key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the signing-key password you chose.

These must never be committed or pasted into chat. The workflow is `.github/workflows/release.yml`. Do not upload backup files or local `.env` files to the public repository.

## 5. Publish baseline 0.3.0

Before publishing, back up your current notes and tasks. Local storage for the DEV window can be separate from the INSTALLED window. To migrate, launch the updated source in `npm run tauri dev`, go to Settings > Export Backup, then install the published 0.3.0 NSIS installer and use Settings > Restore Backup.

Push the project files to your public repo, then tag the commit with `v0.3.0` and push the tag. The workflow validates that the tag matches `src-tauri/tauri.conf.json` version. It builds on Windows, signs NSIS updater artifacts, publishes a GitHub Release and generates `latest.json`.

Commands after configuring git remote:

```powershell
git add .
git commit -m "Add signed updater and backup support"
git push -u origin main
git tag v0.3.0
git push origin v0.3.0
```

Check GitHub > Actions for a green release build and Releases for an NSIS installer, `.sig`, and `latest.json`. Download and run the NSIS installer **once**. Future versions must increment all THREE versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` (plus displayed UI version until version labels are automated), then push a new matching tag.

## 6. Verify an actual update

Create a tiny release v0.3.1 with all version fields incremented, push tag `v0.3.1`, confirm the public `latest.json` reports `0.3.1` and includes the Windows NSIS URL and signature. In installed 0.3.0, open Settings > Check for Updates, confirm release notes, install and restart. Verify that notes/tasks survive.

## Security / limitations

- Signing updater artifacts is **not** the same as Windows Authenticode code signing. SmartScreen may warn on an unsigned executable.
- Only manually approved updates are installed. Automatic checks happen on startup if due and hourly while the app stays open; checks are limited to once per 24 hours after successful checks.
- Exported backups are **plaintext JSON**. Do not put credentials, tokens, or PHI in notes/backups.
- Backups are user-initiated, not scheduled automatic snapshots. Restore REPLACES current local dashboard data after confirmation.
- This build is a bootstrap source project, not a verified signed Windows installer. Do not tag/publish until the first Windows build and manual QA succeed.
