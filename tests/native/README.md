# Windows desktop tests

Run from `C:\Projects\hybrid-command-center` in an unlocked, interactive Windows session using a **non-administrator terminal**:

```powershell
npm run build:native:test
npm run test:native:smoke
npm run test:native
npm run test:native:coexist
npm run test:native:coexist -- --all
npm run test:browser
npm run test:all
```

`build:native:test` builds the active root application with embedded frontend assets using `tauri build --debug --no-bundle -- --offline`. It does not create or install an installer. Rust, MSVC/Windows SDK, WebView2, Node, and the existing npm dependencies must already be available. The offline build fails if Cargo dependencies are not cached; it does not install them. `src-tauri/Cargo.lock` pins the cached dependency resolution used for these checks.

Both native launchers check the inherited Windows administrator token before creating a profile or launching an application. Elevated or unverified launch contexts fail with an instruction to use a non-administrator terminal. Do not run these tests with “Run as administrator”; this harness depends on process-local WebView2 environment overrides that elevated WebView2 hosts ignore.

The application entry points are `index.html` → `src/main.jsx` and `src-tauri/src/main.rs` → `hybrid_command_center_lib::run()` in `src-tauri/src/lib.rs`. `npm run tauri -- dev` starts Vite on port 1420 and launches the development app. `npm run tauri -- build` builds the normal release/NSIS installer (updater signing may require the existing release setup). The browser suite independently uses port 1421. Backup and nested application copies are not involved.

## What runs

`test:native:smoke` launches `src-tauri/target/debug/hybrid-command-center.exe`, waits for its own PID's main window, verifies the title and visibility, and compares client dimensions with `tauri.conf.json` (1440×900 logical pixels, allowing two pixels for rounding). Win32 measurements use per-monitor DPI awareness and `GetDpiForWindow`; window chrome is excluded. The desktop must fit that client area plus the title bar and borders. A smaller work area can clamp the initial window and produce a useful failure.

The cleanup hook checks the executable path and process creation time before sending `WM_CLOSE` through `CloseMainWindow`, waits for exit, and checks exit code zero. It then polls for the test WebView2 descendants and CDP listener to disappear. It never force-kills a process or closes another running app. If graceful closing or verification fails, the suite fails and records the test PID for manual inspection/closing; it releases its Node handles so a cleanup failure cannot hang the runner.

`test:native` additionally connects the installed Playwright library to the **actual WebView2**, not a Chromium replacement, using a temporary loopback CDP port. It opens Settings, verifies the CDP endpoint still responds, returns to Overview, and checks pointer dragging, half/full-width geometry, Gaming profile selection, selection persistence after reload, and preservation of the Default profile's reordered widgets. It then creates a disposable Custom profile, gives it a different width/order, and checks three Default → Custom → Default → Custom cycles plus a reload, asserting both saved layouts remain independent. This exercises real Tauri IPC; telemetry availability is not asserted. Each invocation launches a fresh instance and profile. No application source changes or extra dependencies are needed.

`test:native:coexist` launches an additional normal-mode instance without remote debugging, using disposable storage under `native-test-results/companion-*`. It copies the standalone debug executable into that fixture folder so rebuilding the active project cannot overwrite or lock the running companion. It verifies profile isolation, then runs the native suite three times with the companion on Overview and three times after opening Settings through UI Automation. With `--all`, it instead runs **five complete `npm run test:all` invocations**: two on Overview and three on Settings. It asserts that the companion remains alive throughout each run and closes only its own companion PID, validating creation time and cleanup. It never navigates or closes an existing personal session. Results, per-invocation stdout/stderr logs, companion identity and cleanup are saved alongside its disposable profile; a failed iteration stops the command with a nonzero exit code.

The tests set `WEBVIEW2_USER_DATA_FOLDER` only in the launched process to a fresh `native-test-results/run-*/WebView2` folder. Browser proxy flags and process-local HTTP proxy variables block external weather/updater requests; local IPC and read-only local hardware/Tailscale/Ollama probes still run. No real user profile, settings, notes, chats or layout files are opened or reset. No registry, firewall, machine environment or system setting is changed. CDP is enabled only for the lifetime of the test instance; run on a trusted local desktop.

Ignored diagnostic folders retain isolated WebView2 data, `window.json`, `uia-editing.json`, `cdp-startup.json`, `cdp-ready.json`, and `cleanup.json`. Failures add `startup-failure.json`, `cdp-failure.json`, or `cleanup-failure.json`. Reports include the checked host elevation, requested port/arguments, only the test process tree/profile matches, observed debugging arguments, listener ownership, and the last 64 KiB of the test app's output. They do not dump environment variables or unrelated process command lines. UIA reports record known dashboard controls, excluding notes, chat text, device names and telemetry.

Dashboard JSON/PNG pairs capture the selected profile, profile options, widget IDs/titles/classes/bounds, all **isolated test** localStorage, edit/scroll/viewport state and pointer capture/hit targets. They are saved before/after dragging and each profile switch, plus `dashboard-final` even when an assertion fails. Screenshots mask widget body content and non-title header controls to avoid capturing local hardware/network information. `drag-coordinates.json` records measured drag points. These are diagnostic screenshots, not visual baselines. Retained profiles and copied companion executables consume disk space; remove only test-created folders when no test instance is running.

Native artifacts are separate from Playwright's `test-results` output directory, so a browser run cannot erase native diagnostics or an active native profile. `test:all` runs the suites sequentially.

## CDP readiness and intermittent discovery fix

The original harness passed `--remote-debugging-port=0`, then read only `EBWebView/DevToolsActivePort` for roughly 20 seconds. The retained failed run had a populated `EBWebView` directory but no port file; a reproduction passed and did contain the file. The original run discarded process output and never inspected endpoint readiness or listener ownership. The confirmed failure mechanism is dependence on that runtime-generated file. The retained evidence cannot establish why WebView2 omitted it in that run; no port conflict or stale Hybrid Command Center process was observed during this investigation.

The harness now asks Windows for an unused loopback port, closes that temporary reservation, and passes the explicit port in `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` with `--remote-debugging-address=127.0.0.1`. It does not depend on `DevToolsActivePort` or use a fixed launch delay. Before modifying web content, it:

1. Records startup process diagnostics, failing early if an already-created isolated WebView2 browser lacks its requested debugging flag. Polls `http://127.0.0.1:<port>/json/version` for up to 45 seconds with a one-second maximum per request, retrying connection failures and incomplete responses. Requests go directly to loopback without an inherited HTTP proxy. Application exit fails readiness immediately.
2. Validates the response's browser WebSocket URL, host and port, then uses Windows process ancestry and the isolated profile path to verify that the observed WebView2 command line contains the requested debugging arguments and owns the loopback listener.
3. Connects Playwright to that WebSocket with a ten-second timeout and polls for the actual Tauri page for up to 15 seconds. Connection or interaction failures remain test failures; no retry restarts the app and no test is silently skipped.

There is a small unavoidable interval between releasing the port reservation and WebView2 binding it. If another process takes the port, ownership verification fails before Playwright attaches; the harness never kills that process or interacts with its browser. A CDP timeout reports the endpoint, deadline, last readiness error, and diagnostic path. Under a runtime or policy that disables CDP, this fails visibly; use the free Tauri/Edge WebDriver route described below rather than changing machine policies or claiming success.

`npm test` includes five local regression tests covering startup errors/partial responses, stalled endpoints, mismatched endpoints, early application exit, and allocation around an occupied listener.

## Administrator-terminal failure and Settings investigation

The saved `run-UQ9qVY/cdp-failure.json` showed host PID 44412, child WebView2 browser PID 19420, the correct isolated profile, **no remote-debugging or address argument**, and **no listener on port 60145** after 45 seconds. `cleanup.json` confirmed those test processes exited. The user confirmed that this failed run came from an administrator terminal. [Microsoft documents that elevated WebView2 hosts ignore environment debugging overrides](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags), including `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. This explains why changing port-file discovery and waiting longer did not solve this failure: no debugger was configured in that browser process. The failed and passing profiles both recorded runtime version `155.0.4283.45`.

Opening Settings calls React's `setPage`; it does not create a WebView, change browser arguments or persist the selected page. Before changing the launch behavior, the existing harness passed once alone and six times beside a disposable normal-mode companion (three on Overview, three on Settings). No personal application window was running when investigation began; other applications' WebView2 processes were left alone. The failure was not reproduced by Settings or coexistence in this standard-user context.

The final fix rejects elevated launches before spawning an app. It retains the supported standard-user environment configuration and the same 45-second readiness bound; it does not bypass WebView2 security, change registry policy, elevate/de-elevate another session, or change application code. A separate host-command-line probe also worked without environment debugging flags, but that workaround was not retained once the administrator context was confirmed. Two regression tests ensure elevated/unknown contexts are refused and verified standard-user contexts are allowed. Each actual native run independently checks elevation before launch and verifies the isolated WebView2 process and listener before web interactions.

To verify manually, open ordinary PowerShell (without “Administrator” in the title), run `npm run test:native`, then `npm run test:native:coexist`. An administrator terminal should now fail immediately with the non-administrator instruction and launch no test window. There is no need to close or change a personal application session.

## Dashboard-state / drag assertion investigation

The reported assertion was the drag check at the former line 164, before the test switches to Gaming. Its intended profile is **Default**. The full expected order is Local AI · Ollama, Quick launch, Weather, Tasks, Tailscale, GPU monitoring, Recent notes: seven widgets. A matcher diff highlights changed lines; two highlighted names are not a two-widget profile specification. The harness now explicitly checks the complete intended initial Default layout before editing, while retaining the original drag expectation.

Initial exact-command runs passed. Copies of the two retained failed test profiles were reopened in separate disposable folders; both loaded Default, all seven widgets, and empty localStorage. The original folders were left untouched. That recovery cannot reconstruct the original in-memory DOM, but found no persisted Custom layout or hidden Quick launch widget in those copies.

A controlled regression reproduced the assertion failure after scrolling the isolated dashboard to the bottom. In `run-chw4Qo`, the source handle's Y coordinate was **−689** and the target widget's Y coordinate was **−302**. The pointer-down/up events had no widget hit target. The selected profile remained Default, all seven widget IDs remained present in their original order, and localStorage remained empty. Before/after JSON and masked PNGs were preserved in that run. This establishes a native drag-harness defect: `boundingBox()` can return offscreen coordinates, and the old native helper did not scroll either endpoint into view. The existing browser helper already did so.

The native drag now scrolls the source handle into view before measuring it, then scrolls and remeasures the target after pointer-down, releasing the pointer in `finally`. Every native run deliberately starts this interaction from the bottom of the dashboard to cover that regression. Expected widget values and timeouts were not relaxed, and application source was not changed. The earlier failures lacked geometry/state captures, so the exact cause of their original scroll position is still unproven; this is not a claim that every future intermittent failure has been eliminated.

The first complete-suite coexistence attempt exposed a separate infrastructure problem: Vite's watcher entered the running companion's WebView2 profile and crashed with `EBUSY` on `Default/Network/Cookies`. Browser tests then failed with connection-reset/refused errors. `vite.config.js` now excludes only the generated `native-test-results` tree, alongside its existing exclusions. The browser tests and complete-suite matrix exercise this fix while a profile is live. This changes development/test watching, not dashboard functionality or personal storage.

Post-fix validation: five consecutive complete-suite invocations passed with a normal-mode companion alive (two on Overview, three on Settings), followed by another passing complete suite without the companion (`run-higzvQ`). Each invocation ran 13 unit/regression tests, all 12 browser tests at both desktop sizes, offline Rust checks (zero Rust tests defined), the production frontend/standalone native builds, and both native tests with the offscreen-drag regression and repeated Custom/Default checks. `native-test-results/companion-p1SybL` retains the five full logs, passing results and an empty cleanup process/listener report. No assertions, screenshot baselines or timeout limits were weakened.

## UI Automation / FlaUI findings

Observed on 2026-10-15 using Windows PowerShell's built-in `System.Windows.Automation` (UIA2):

| Target | Exposed patterns | Implication |
| --- | --- | --- |
| Main window | Window, Transform | Native window discovery, sizing inspection and close are available. |
| Dashboard layout profile | Value, ExpandCollapse, ScrollItem | The selector is visible to UIA; changing it through these patterns was not tested. |
| Edit layout / Done editing | Invoke, ScrollItem | Semantically discoverable button. |
| Half width / Full width | Invoke, ScrollItem | Semantically discoverable; repeated names need widget context. |
| Widget drag handles | Invoke, ScrollItem | No UIA Drag or Transform pattern for widget movement. |

The observed content controls have empty AutomationId values. Names, control types and hierarchy are needed for selectors. The initial UIA tree can be empty while WebView2 is loading; the editing report is taken after the real profile selector is ready. The native smoke intentionally tests window readiness, independently of web-content readiness.

[FlaUI](https://github.com/FlaUI/FlaUI) is a free, open-source .NET wrapper supporting UIA2 and UIA3; FlaUInspect can inspect either backend. This machine has .NET runtimes but **no .NET SDK**, and this project has no FlaUI packages. No FlaUI binaries, SDK or NuGet dependencies were installed. These results establish UIA2 accessibility, not FlaUI/UIA3 runtime compatibility or reliability.

Invoking a drag button does not drive the app's `onPointerDown`/pointer-capture/`onPointerUp` implementation. FlaUI mouse input could drive it, but that would require foreground focus, scrolling, DPI-aware coordinates and outcome checks; semantic UIA support alone does not establish reliable dragging. Width buttons and profiles are more promising FlaUI targets, but direct UIA interaction remains unverified. Do not label these findings as a failed FlaUI evaluation or as proven FlaUI support.

The practical verified alternative is the existing Playwright dependency connected to WebView2, as described in [Playwright's WebView2 documentation](https://playwright.dev/docs/webview2). It provides DOM selectors, scrolling and pointer input while the real Tauri app runs. Keep ordinary Chromium Playwright tests for fast frontend regression coverage. If CDP is unavailable in a future distribution, [Tauri's free Windows WebDriver route](https://tauri.app/develop/tests/webdriver/manual-setup/) uses `tauri-driver` with a matching Microsoft Edge Driver; that route was not installed or tested here.

## Validation and remaining checks

Initial validation: 6 dashboard unit tests, 12 Chromium tests across 1920×1080 and 2560×1440, production frontend build, offline Rust compilation/doc-test checks (zero Rust tests defined), and the standalone Tauri build passed. Native smoke passed; the two-test native suite passed three consecutive runs. Native dimensions were 1440×900 logical pixels at 96 DPI, and each test process exited cleanly.

After the intermittent-discovery fix: all 11 unit/regression tests passed, the full two-test native suite passed five consecutive invocations, and the standalone smoke command passed. Each native run verified debugging arguments and listener ownership in the actual WebView2 process and reported no remaining test processes or CDP listener after closing. The browser suite and production build were rerun afterward. No assertions or application behavior were weakened.

After identifying the administrator-terminal cause: all 13 unit/regression tests passed, including both elevation-guard tests. The final guarded native suite passed once alone and six consecutive times alongside the normal-mode companion (three on Overview and three on Settings). Every run also opened Settings in its own WebView2 and verified CDP remained available. The companion stayed alive throughout, then closed with no remaining test WebView2 processes. All 12 browser tests and the production build passed afterward. The administrator failure was diagnosed from the preserved failed-run evidence, the user's confirmed launch context and Microsoft's documented behavior; no elevated application was deliberately relaunched against a personal profile.

Native validation covers the standalone debug executable at the current monitor/DPI, with no screenshot baseline. It does not validate an installed release, mixed DPI/multi-monitor movement, native window resizing under load, backup/restore dialogs, updater installation, or hardware correctness. Browser screenshots remain diagnostic evidence rather than visual regression baselines.

For a release check, launch the packaged app with a separate WebView2 data folder, confirm 1440×900 initial logical client sizing, move it between monitors with different scaling, resize/maximize/restore, drag a widget, toggle its width, switch profiles and reload. Check that only the test profile persists those edits, then close that instance. Test real-user data only with explicit authorization and a backup.

The unchanged starting commit is tagged `checkpoint/native-testing-baseline-20261015` (`bd26bd1`). The setup is committed separately so its diff can be reviewed without changing application functionality.
