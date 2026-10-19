# Hybrid Command Center — Codex project instructions

## Project scope
- Active project: `C:\Projects\hybrid-command-center`.
- Identify the actual application entry points and package manager from project files before running commands. Do not assume all historical versions are active.
- Treat backup folders, archived releases, generated output, and nested copies as read-only unless the user explicitly requests changes to them.
- Work in the active project only. Preserve user settings, local storage, chat histories, layout profiles, and hardware configurations.

## Workflow for each change
1. Inspect `git status`, the active entry points, and relevant files before editing. Never overwrite or discard existing uncommitted work.
2. Use Graphify to understand relevant dependencies and follow Ponytail's coding guidance when available, as detailed below.
3. Create a non-destructive Git checkpoint before significant changes. This workflow authorizes task-scoped checkpoints; never stage or commit unrelated user work without explicit approval.
4. Reproduce the issue where feasible, state a short plan for nontrivial changes, and implement the requested feature or root-cause fix with the smallest focused change. Do not modify unrelated application functionality or add unjustified dependencies.
5. Add or update regression tests for changed behavior. Preserve existing user settings and application data throughout implementation and testing.
6. Run appropriate unit, browser, and native tests, plus relevant production builds. Changes affecting dashboard interactions must always include testing in the actual native Tauri WebView2 application.
7. Investigate failures using logs, screenshots, and application state, including selected profiles, widget IDs, relevant localStorage, and pointer/geometry data when applicable. Capture evidence before changing test expectations; use isolated fixtures and mask sensitive content.
8. Fix the underlying cause and rerun relevant tests until they pass or a concrete blocker is reached. Follow the debugging boundaries below; do not increase timeouts without evidence that timing is the problem.
9. Never weaken assertions, skip or disable tests, hide errors, or change screenshot baselines merely to obtain a pass.
10. After successful validation, create a Git commit containing only the task's changes. Do not commit an unvalidated fix as successful; preserve diagnostics and report blockers or uncertainty when validation cannot be completed.
11. Report changed files, tests run and their results, remaining limitations, and how to verify the change in the actual desktop app. Distinguish verified browser behavior from verified or unverified native behavior.

## Ponytail: code quality
- Apply Ponytail guidance when available, but prioritize this repository's existing conventions and correct behavior.
- Prefer straightforward, readable code, limited abstractions, and narrowly scoped fixes.
- Do not assume the Ponytail plugin or its hooks are active; verify availability before relying on them.
- Review third-party hooks before enabling them. Do not silently approve execution outside the project.

## Graphify: dependency awareness
- Use Graphify to understand dependencies relevant to development tasks; consult the existing report/graph in `graphify-out` when available and current.
- If Graphify or its graph is unavailable, inspect the relevant source dependencies directly and report that limitation. Do not silently install tooling or enable remote services.
- Use Graphify to trace affected modules and dependencies, not as proof that a reported connection is a bug.
- Regenerate the graph only when it is stale and regeneration would help. Avoid repeated installs or network downloads.
- Exclude historical backups, generated files, and unrelated nested projects when practical.
- Do not use Graphify's hosted service, trials, paid APIs, or remote uploads without explicit approval.

## Playwright and browser testing
- Use the existing local Playwright configuration and `tests/e2e` suite; inspect `package.json` before invoking scripts.
- For frontend changes, run the appropriate unit tests, Playwright tests, and production build. Existing scripts may include `npm run test:e2e` and `npm run test:e2e:report`; confirm before using.
- Cover dashboard rendering, widget dragging/resizing, profile switching, persistence, overflow/scrollbars, and responsive behavior.
- Exercise both 1920x1080 and 2560x1440 viewports for relevant layout changes.
- Use isolated test fixtures and storage. Never reset or overwrite actual user data.
- Maintain stable screenshot baselines in version control when visual regression tests are configured. Review differences before accepting baseline updates; never blindly regenerate snapshots to make a test pass.
- A screenshot captured without a committed baseline is diagnostic evidence, not a passing visual regression test.

## Tauri and Windows-specific validation
- Chromium frontend tests do not establish correctness of the native Tauri/WebView application.
- Always include native WebView2 testing for changes affecting dashboard interactions, including dragging, resizing, profile switching, and layout persistence. Use the existing isolated native harness and inspect `package.json` for current commands.
- Run native tests from a non-administrator Windows terminal. Preserve the elevation guard, process-identity checks, and disposable storage; never attach to, navigate, close, or reset a personal application session as a test fixture.
- For changes involving window sizing, DPI, multi-monitor behavior, native APIs, hardware telemetry, file paths, or OS integration, identify and run appropriate native checks where tooling permits.
- Do not claim native desktop behavior was tested unless the actual packaged or development Tauri application was exercised.
- If native UI automation is unavailable, explicitly state the limitation and provide a concise manual verification checklist.

## Autonomous debugging boundaries
- Autonomously inspect code, make scoped edits, run local tests, and retry on failures within granted permissions.
- Do not loop indefinitely: after three unsuccessful fix-and-test attempts on the same issue, summarize evidence and ask for guidance.
- Request approval before destructive commands, deleting files or data, modifying system settings, installing system-wide software, accessing files outside the project, or making network changes.
- Do not skip or disable tests, weaken assertions, hide errors, or alter screenshot baselines merely to obtain a green result.

## Cost, security, and privacy
- Use only local tools and included ChatGPT-authenticated Codex usage. Never purchase credits, configure paid APIs or API keys, enable hosted services/testing, or add subscriptions without explicit approval.
- Prefer local test tooling. Seek approval for new dependencies and external network access.
- Never expose secrets, tokens, credentials, or sensitive company information in logs, screenshots, reports, commits, or prompts.
- Keep approval prompts enabled for elevated and potentially risky actions.

## Completion criteria
- Relevant automated tests and build succeed, or blockers are clearly documented.
- Existing behavior and user data remain intact.
- Any visual changes have been checked at relevant viewport sizes.
- The final response distinguishes verified browser behavior from unverified native Tauri behavior and identifies any follow-up actions.
