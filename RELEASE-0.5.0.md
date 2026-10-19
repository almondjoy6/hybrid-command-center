# Hybrid Command Center v0.5.0 release preparation

This release contains the dashboard profiles, layout interactions, visual redesign and hardware graph refinements already implemented. CPU history, configurable alerts, Ollama cancellation, a command palette and server health checks are deferred. Nothing has been pushed, tagged or published during this preparation.

## Verified update baseline

On 2026-10-19, the installed executable at `%LOCALAPPDATA%\Hybrid Command Center\hybrid-command-center.exe` reported product/file version 0.4.0. Passive byte comparisons found both the configured personal-repository endpoint and the unchanged public key embedded in that executable. Its SHA-256 was `68cb07476a11dd40e136c1dc959cd674335a9cea66eea8481376a7c7202766ed`.

The endpoint `https://github.com/almondjoy6/hybrid-command-center/releases/latest/download/latest.json` returned HTTP 200 and valid JSON advertising 0.4.0, a publication timestamp and signed Windows x64/NSIS download entries. The installer returned HTTP 200 with an application/octet-stream body. Offline Ed25519 verification of both its Minisign artifact signature and trusted-comment signature passed against the installed public key; the signed comment binds version 0.4.0. The personal repository's v0.4.0 release workflow previously succeeded.

The original encrypted key file and its matching companion public key exist at `%USERPROFILE%\.tauri\hcc-updater.key` and `.key.pub`. No private contents were displayed or committed. An empty-password challenge failed; no signing password is present in this process. File availability and the companion public key are verified, but decrypting the private key and signing a new artifact remain unverified.

## Data and installation identity

The application identifier `com.local.hybridcommandcenter`, product name, updater public key, endpoint, NSIS target and passive installation mode are unchanged. The `hcc-v1` storage key, settings, profiles and widget identities are unchanged. Tests use disposable storage; the user's installed application has not been opened, upgraded or reset.

For the real upgrade, use Settings > Export Backup in the installed v0.4.0 application first and keep the backup private. Install in place through the updater; do not uninstall or delete WebView2 storage. Verify tasks, notes, themes, profiles, widget visibility, order and sizes afterward. An actual installer upgrade and data preservation across that upgrade still require verification after a signed release is available.

## Signing and publication gates

- Recover the existing key password securely. Do not generate a new key or paste the password into chat or shell history.
- In the personal repository's Actions settings, confirm the existing `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets are available. Their current values were not accessed or changed. Historical workflow success does not prove today's secrets are unchanged.
- Complete a local signed NSIS build using that password. The automated local production compile uses `--no-bundle`; it does not establish that a newly signed installer works.
- The workflow requires the personal repository identity, synchronized versions and a matching tag, fails early on absent signing secrets, uses `npm ci`, and invokes `tauri-action` with updater JSON upload enabled. Tauri's `createUpdaterArtifacts: true` generates the NSIS installer and detached signature; the action generates `latest.json`. The workflow itself has not been dispatched during this preparation.
- Updater signing is separate from Windows Authenticode; SmartScreen can still warn.

## Local signed build (run only when the password is available)

Run in a normal, non-administrator PowerShell terminal in this project. The password is read without echo and passed through the child process environment, never a command-line argument. These variables are cleared afterward.

```powershell
$securePassword = Read-Host 'Existing updater key password' -AsSecureString
$credential = [System.Management.Automation.PSCredential]::new('updater', $securePassword)
try {
    $env:TAURI_SIGNING_PRIVATE_KEY = Join-Path $env:USERPROFILE '.tauri\hcc-updater.key'
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $credential.GetNetworkCredential().Password
    npm run tauri -- build -- --offline
    if ($LASTEXITCODE -ne 0) { throw 'Signed production build failed; do not publish.' }
    Get-ChildItem 'src-tauri\target\release\bundle\nsis' -File
} finally {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    $credential = $null
    $securePassword = $null
}
```

Expect `Hybrid Command Center_0.5.0_x64-setup.exe` and its `.sig`. Do not install this over personal data as an automated test fixture.

## Publish commands — not executed

The local checkout and the personal repository's `main` have unrelated histories. Publish the reviewed release commit on a new branch and tag without replacing `main`, force pushing or changing remote configuration. The atomic push below publishes the tag and starts the release workflow, which creates a public release automatically. Run only after resolving the signing gates above.

```powershell
Set-Location 'C:\Projects\hybrid-command-center'
$repoUrl = 'https://github.com/almondjoy6/hybrid-command-center.git'
if (git status --porcelain --untracked-files=no) { throw 'Tracked changes remain; review and commit them first.' }
node --test tests/release.test.js
if ($LASTEXITCODE -ne 0) { throw 'Release metadata validation failed.' }
$existing = git ls-remote $repoUrl refs/heads/codex/release-v0.5.0 refs/tags/v0.5.0
if ($LASTEXITCODE -ne 0) { throw 'Could not check personal repository refs.' }
if ($existing) { throw 'Release branch or tag already exists; inspect it before publishing.' }
git show-ref --verify --quiet refs/tags/v0.5.0
if ($LASTEXITCODE -eq 0) { throw 'Local v0.5.0 tag already exists; inspect it first.' }
$releaseCommit = git rev-parse HEAD
git tag -a v0.5.0 $releaseCommit -m 'Hybrid Command Center v0.5.0'
if ($LASTEXITCODE -ne 0) { throw 'Could not create release tag.' }
git push --atomic $repoUrl "${releaseCommit}:refs/heads/codex/release-v0.5.0" 'refs/tags/v0.5.0'
if ($LASTEXITCODE -ne 0) { throw 'Push failed; inspect refs before retrying. Do not force push.' }
```

Review the personal repository's Actions run and release assets. Then fetch the public endpoint again and confirm version 0.5.0, the Windows x64 URL and signature. In the backed-up installed v0.4.0 app, Check for Updates should detect 0.5.0; the separate Install button downloads, verifies and starts installation. Check the runtime version and retained data after restart.

## Validation evidence

- `npm run test:all`: passed. This includes 19 Node unit/release checks, 60 Playwright cases across 1920x1080, 2560x1440, 3440x1440 and 150% scaling, Rust test compilation/execution (zero defined Rust cases), the native debug build and two actual isolated WebView2 tests.
- Native tests verified window dimensions, all three runtime version labels, dragging, resizing, independent profiles and persisted layouts; disposable process/storage cleanup passed. Diagnostics: `native-test-results/run-AlIE8U`.
- `npm run tauri -- build --no-bundle -- --offline`: passed; the optimized Windows executable reports product/file version 0.5.0. Frontend production compilation passed too. This deliberately excludes NSIS packaging/signing, which remains blocked by the unavailable password.
- Release workflow YAML parsed successfully with the already installed local parser. Personal-repository restriction, tag trigger, signing environment and updater JSON settings passed static assertions.
- Existing public v0.4.0 installer signature verification and trusted-comment verification passed. No new v0.5.0 artifact has been signed or installed.
- The first browser run exposed a strict-locator ambiguity in the new test between the status and toast. Evidence was inspected and the locator scoped to `.settings-status`; the complete rerun passed without weakening existing assertions.

Local logs and diagnostic screenshots are ignored under `native-test-results/release-0.5.0`, `native-test-results/run-*` and `test-results`. Graphify's existing root updater/configuration graph was consulted and current source checked directly; the graph predates the visual refinements. REA tools were unavailable, so installed-binary comparisons used ordinary local file inspection, not REA analysis.
