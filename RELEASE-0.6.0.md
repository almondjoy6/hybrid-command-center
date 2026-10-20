# Hybrid Command Center 0.6.0

## Features

- **Timers:** stopwatch with start/pause/resume/reset, hundredths, a minute progress ring, and up to 100 laps with split and total times. Countdown supports custom hours/minutes/seconds, 5/10/15/25/30/60-minute presets, pause/resume/reset, and a completion ring/state.
- **Reminders:** monthly calendar, navigation and Today, date indicators, create/edit/delete with confirmation, completion/reopening, upcoming/overdue/completed/date/all filters, chronological order, and local persistence. Optional descriptions and email addresses remain local. Email delivery is **Not yet enabled**.
- **Overview:** optional Stopwatch, Countdown timer and Upcoming reminders widgets use the existing profile, ordering, dragging, width and visibility controls. Enable them in **Appearance → Customize Overview** for each desired profile. They start hidden to preserve existing visible layouts.
- Existing settings, notes, tasks, chats, shortcuts, themes and profile layouts retain their existing storage keys. Productivity state is a versioned property of `hcc-v1`, included in the existing JSON backup. Normal settings writes merge with current storage so they cannot replace newer timer/reminder state.

## Timing and notification behavior

While the Windows application is running, timing uses monotonic Windows uptime with interpolation between native samples; system-clock changes do not alter stopwatch/countdown elapsed time. Uptime includes sleep. Rendering updates at most about 30 times per second, with no high-frequency timer announcements to screen readers. Calendar/reminder rendering is separate from the animation clock. Reduced motion disables ring transitions/glow.

The stopwatch restarts **paused** at its last saved elapsed time and retains laps. Running values are checkpointed about once a second and on visibility/page-hide events. A running countdown restores from its saved remaining duration and the wall time spent closed; moving the system clock while the app is closed can affect that estimate. Backward wall-clock changes never extend it beyond its saved remaining duration. Native delivery receipts also restore a previously expired timer as complete.

One Rust queue checks countdown monotonic deadlines and reminder date/time instants every 250 ms, independently of WebView2 rendering. It continues while the app is minimized. Alerts due during computer suspension are handled after resume. Closing the app stops scheduling; overdue items are checked when it is reopened. No Windows service or scheduled task is installed.

Dates/times use the local timezone at creation/edit and save the resulting instant. Changing timezone later retains that instant. Nonexistent local spring-forward times are rejected. Ambiguous fall-back times select the first occurrence. To reschedule in a new timezone, edit the date/time.

Windows desktop toast notifications use `tauri-winrt-notification`, the WinRT backend also used by Tauri's notification plugin. Direct submission exposes Windows API errors. Desktop WinRT does not require a browser-style permission prompt. Windows notification settings and Focus Assist may suppress banners even after a successful API submission. Uninstalled target builds use the registered Windows PowerShell notification host, following Tauri's development-build convention; installed builds use the existing application identifier. Banner visibility and installed application branding require a manual installed-build check.

Notification claims/results are stored locally under the application data directory's `productivity-notifications-v1` folder; records contain delivery IDs and status, without reminder text or email. The native harness places this folder inside its disposable WebView2 profile. Claims are durable before dispatch, so restart cannot repeatedly send the same alert. A crash between claim and delivery can lose one alert; an explicit edit creates a new delivery identity. Failed submissions show a status; editing/resaving permits a fresh attempt. Delivery receipts are device-local and are not included in exported backups. The saved reminder notification status is included.

No reminder data is transmitted to external services. No email provider, OAuth, background service, updater trust change, push, deployment or publication is included. Optional custom notification sound was omitted.

## Review in the desktop app

Use a non-administrator terminal and an isolated WebView2 data folder, as described in `tests/native/README.md`. Do not reset or reuse a personal application session for testing.

1. Open **Timers**. Start, lap, pause/resume and reset the stopwatch. Start a short custom countdown, minimize the window, and verify its Windows banner and completed state on restore.
2. Create a reminder in **Reminders**, edit its description/time, mark it complete/reopen it, and exercise delete cancellation/confirmation. Check an overdue reminder after restart. Confirm that email is labeled not enabled.
3. In **Appearance**, enable the three new widgets. In Overview, drag/resize them, switch directly between profiles, then close/reopen the app and verify placement and visibility.
4. Check sleep/resume with a short countdown, installed-app notification identity, Focus Assist behavior, and mixed-DPI/multi-monitor movement. These require manual verification unless explicitly recorded in the QA results below.

## QA results — 2026-10-20

- JavaScript unit/regression suite: **31 passed, 0 failed**.
- Offline Rust scheduler suite: **2 passed, 0 failed**.
- Full browser suite: **80 passed, 0 failed**, across 1920×1080, 2560×1440, 3440×1440 and Windows 150% scaling. Includes stopwatch/laps/keyboard controls, countdown presets/custom duration/pause/resume/expiration, calendar/reminder CRUD, reload persistence, profile switching, existing data preservation, reduced motion and smaller-window overflow.
- Vite production build: **passed**. Debug native executable build with offline Cargo dependencies: **passed**.
- Actual native WebView2: **5 passed, 0 failed**, including startup/dimensions, stable native window identity through minimize/restore, dashboard dragging/resizing/profile persistence, minimized countdown and reminder notification submission, and two full process restarts. Completed countdown/delivery state, running countdown elapsed time, paused stopwatch values, pending reminders, theme and layout data survived. Native optional widgets rendered after restart. Each shutdown used the unchanged 10-second deadline, exited with code zero, and left no owned WebView2 processes or CDP listener.
- Final passing native fixture: `native-test-results/run-pcYrRG/` (the expanded suite also passed in `run-c2KHsv`). `minimized-window-discovery.json` directly records .NET selecting `Tao Thread Event Target` at HWND 5771382 while the real minimized `Tauri Window` remains at HWND 1839124. `minimize-restore-identity.json` records the stable Tauri HWND and normal client dimensions. `running-restoration.json` records only the fixture's synthetic state. `completed-restart-cleanup.json`, `running-restart-cleanup.json` and `cleanup.json` record process/listener cleanup. Earlier failed diagnostics are retained; no timeout, assertion or elevation/identity guard was weakened.

**Ready for manual review:** automated validation passes and the shutdown/restart blocker is resolved. The starting commit has a non-destructive local tag, `checkpoint/v0.6.0-start-20261020`; the validated feature and harness changes are committed locally. Nothing was pushed or published. Installed-build banner appearance and the manual checks below remain release-review items.

## Shutdown investigation and fix

The lingering process was real, but the test harness caused it. `Process.MainWindowHandle` is a heuristic, not a stable application-window identity. After minimization it could select the same process's zero-size internal Tao event window. The harness restored and closed that window rather than the actual dashboard, disrupting the event loop's own message handling. Native tracing reached `WindowDestroyed` and `ExitRequested` without `Exit`; PID/executable/creation-time checks showed that this was not a stale process handle. Idle and notification-only instances closed normally. Minimization reproduced the problem even in normal mode with no CDP debugger and without starting timers or delivering notifications.

The decisive failed probe (`native-test-results/probe-9NOhEG/probe.json`) recorded an initial 1440×900 window at HWND 2822340 and a supposed restored window at HWND 10096636 with no title and a 0×0 client area, both on the same thread. The corrected normal-mode probe (`probe-KUigv7/probe.json`) retained HWND 2560084 and 1440×900 dimensions through restore, then exited normally in about 0.6 seconds.

The shared helper now enumerates windows and selects exactly one owned by the verified PID with class `Tauri Window`. It refuses ambiguous targets, sends minimize/restore system commands and WM_CLOSE to that HWND, and retains executable/creation-time guards, disposable storage, the elevation guard and existing deadlines. Regression assertions check the class, unchanged HWND and real dimensions across minimize/restore; restart tests verify exit code zero and disappearance of both children and the debugger listener before reopening. No production shutdown workaround, forced process exit, task cancellation, new dependency or timeout increase was needed. Temporary tracing was removed. The v0.5.0 application's default Tauri close/run behavior remains intact.

A successful Windows API submission proves submission, not visible banner delivery. Installed-build notification identity, physical sleep/resume, mixed-DPI/multi-monitor behavior, and backup file dialogs were not verified. Browser screenshots are diagnostic images; this repository has no committed screenshot baseline for these pages. The Graphify report was inspected and its root dependency links traced; its stale locations and backup/nested-project entries were checked against the active source instead of regenerating or uploading the graph.

## Changed files

- `src/productivity/Provider.jsx`, `Timers.jsx`, `Reminders.jsx`, `productivity.css`: shared state, independent animation clock, pages and compact widgets.
- `src/dashboard/productivity.js`, `productivity.test.js`: pure timing, validation, reminder, persistence and notification-job logic and tests.
- `src/dashboard/layout.js`, `layout.test.js`: optional widget migration and preservation checks.
- `src/main.jsx`: navigation, widget integration, provider and storage merge.
- `src-tauri/src/productivity.rs`, `src-tauri/src/lib.rs`: native clock, queue, durable claims, WinRT delivery and command registration.
- `tests/e2e/productivity.spec.js`, `tests/e2e/dashboard.spec.js`: new scenarios and exact eleven-destination navigation expectation.
- `tests/native/desktop.test.js`, `tests/native/window.ps1`, `tests/native/README.md`: isolated minimization/restart regressions, PID/class-based window selection and diagnostics.
- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`: coordinated version 0.6.0 and the WinRT dependency.
- `RELEASE-0.6.0.md`: release behavior, manual checks, results and shutdown root cause.

The pre-existing untracked `.agents/` folder is untouched and is not part of this change.
