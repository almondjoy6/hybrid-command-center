import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, readFile, writeFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium, expect} from '@playwright/test';
import {allocateCdpPort, waitForCdp} from './cdp.js';
import {checkNativeHost} from './host.js';
import {DEFAULT_WIDGETS} from '../../src/dashboard/layout.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);
const config = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const executable = path.join(root, 'src-tauri/target/debug/hybrid-command-center.exe');
let app, appExit, reportDir, profileDir, browser, windowInfo, launchError, cdpPort, launchedAt, browserArguments, host;
let output = '';

async function windowCommand(action = 'Inspect') {
  const args = ['-NoProfile', '-NonInteractive', '-File',
    path.join(root, 'tests/native/window.ps1'), '-AppProcessId', String(app.pid), '-Action', action,
    '-Executable', executable, '-LaunchedAt', launchedAt, '-ProfileDir', profileDir, '-CdpPort', String(cdpPort)];
  if (windowInfo) args.push('-ExpectedStartTime', windowInfo.startedAt);
  const {stdout} = await run('powershell.exe', args,
  {windowsHide: true, timeout: 45000});
  return action === 'Close' ? null : JSON.parse(stdout);
}

async function diagnostics(name, error) {
  const data = {pid: app?.pid, cdpPort, profileDir, host, browserArguments, error: error?.message, output};
  try { data.windows = await windowCommand('Diagnostics'); }
  catch (failure) { data.diagnosticsError = failure.message; }
  await writeFile(path.join(reportDir, name), JSON.stringify(data, null, 2));
  return data.windows;
}

before(async () => {
  // Reject elevation before spawning anything that could access a WebView2 profile.
  host = await checkNativeHost();
  await access(executable).catch(() => { throw new Error('Run npm run build:native:test first.'); });
  await mkdir(path.join(root, 'native-test-results'), {recursive: true});
  reportDir = await mkdtemp(path.join(root, 'native-test-results/run-'));
  profileDir = path.join(reportDir, 'WebView2');
  cdpPort = await allocateCdpPort();
  browserArguments = `--remote-debugging-port=${cdpPort} --remote-debugging-address=127.0.0.1 --proxy-server=http://127.0.0.1:9`;
  launchedAt = new Date().toISOString();
  app = spawn(executable, [], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profileDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: browserArguments,
      // Block the automatic Rust updater's outbound request in this test process only.
      HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', NO_PROXY: 'localhost,127.0.0.1',
    },
  });
  for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { output = (output + chunk.toString()).slice(-65536); });
  appExit = new Promise(resolve => {
    app.once('error', error => { launchError = error; resolve(); });
    app.once('exit', (code, signal) => resolve({code, signal}));
  });
  try {
    await new Promise((resolve, reject) => { app.once('spawn', resolve); app.once('error', reject); });
    windowInfo = await windowCommand();
  } catch (error) {
    await diagnostics('startup-failure.json', error);
    throw error;
  }
}, {timeout: 60000});

after(async () => {
  try {
    // The PowerShell helper also checks executable path and creation time against PID reuse.
    if (app?.pid && !launchError) {
      assert.ok(app.exitCode === null && app.signalCode === null, 'Test application exited before cleanup.');
      await windowCommand('Close');
      const exit = await appExit;
      assert.equal(exit.code, 0, 'Application must exit cleanly after WM_CLOSE.');
      const deadline = performance.now() + 10000;
      let remaining;
      do {
        remaining = await diagnostics('cleanup.json');
        assert.ok(remaining, 'Could not verify WebView2 cleanup; inspect cleanup.json.');
        if (!remaining.processes.length && !remaining.listeners.length) break;
        await delay(200);
      } while (performance.now() < deadline);
      assert.equal(remaining.processes.length, 0, 'Test WebView2 processes remain; inspect cleanup.json.');
      assert.equal(remaining.listeners.length, 0, 'Test CDP port remains occupied; inspect cleanup.json.');
    }
  } catch (error) {
    await diagnostics('cleanup-failure.json', error);
    throw error;
  } finally {
    if (browser) await browser.close();
    // A failed WM_CLOSE must fail the suite, not leave Node hanging on the child's pipes.
    app?.stdout?.destroy();
    app?.stderr?.destroy();
    app?.unref();
    if (reportDir) console.log(`Native diagnostics and isolated storage: ${reportDir}`);
  }
}, {timeout: 60000});

test('main window appears with configured logical client dimensions', async () => {
  assert.equal(windowInfo.title, config.app.windows[0].title);
  assert.equal(windowInfo.visible, true);
  for (const [measured, configured] of [['clientWidth', 'width'], ['clientHeight', 'height']]) {
    assert.ok(Math.abs(windowInfo[measured] - config.app.windows[0][configured]) <= 2,
      `${measured}=${windowInfo[measured]}, expected ${config.app.windows[0][configured]} logical pixels at DPI ${windowInfo.dpi}. Ensure the desktop can fit the configured window.`);
  }
  await writeFile(path.join(reportDir, 'window.json'), JSON.stringify(windowInfo, null, 2));
});

test('actual WebView2 supports widget dragging, resizing and profile persistence', async t => {
  try {
    const startup = await diagnostics('cdp-startup.json');
    assert.ok(startup, 'Could not inspect WebView2 startup; see cdp-startup.json.');
    const child = startup.processes.find(process => process.parentPid === app.pid && process.usesTestProfile);
    if (child) assert.equal(child.debugArgument, `--remote-debugging-port=${cdpPort}`,
      'WebView2 started without the requested debugging argument; see cdp-startup.json.');
    const version = await waitForCdp(cdpPort, () => app.exitCode === null && app.signalCode === null);
    const snapshot = await diagnostics('cdp-ready.json');
    const webview = snapshot?.processes.find(process => process.descendant && process.usesTestProfile &&
      process.debugArgument === `--remote-debugging-port=${cdpPort}` && process.addressArgument === '--remote-debugging-address=127.0.0.1');
    assert.ok(webview, 'Debugging arguments/profile were not observed in this application\'s WebView2 process.');
    assert.ok(snapshot.listeners.some(listener => listener.pid === webview.pid && listener.address === '127.0.0.1'),
      'CDP listener is not owned by the launched WebView2; possible port conflict.');
    browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl, {timeout: 10000});
  } catch (error) {
    await diagnostics('cdp-failure.json', error);
    throw new Error(`${error.message} Diagnostics: ${path.join(reportDir, 'cdp-failure.json')}`, {cause: error});
  }
  const context = browser.contexts()[0];
  let page;
  await expect.poll(() => {
    assert.ok(app.exitCode === null && app.signalCode === null, 'Application exited before its WebView2 page appeared.');
    page = context.pages().find(candidate => candidate.url().startsWith('http://tauri.localhost') || candidate.url().startsWith('tauri://localhost'));
    return Boolean(page);
  }, {timeout: 15000, message: 'Waiting for the actual Tauri WebView2 page'}).toBe(true);
  // Additional safety for browser requests; native IPC remains real.
  await context.route(/^https?:\/\//, route => {
    const host = new URL(route.request().url()).hostname;
    return host === 'tauri.localhost' ? route.continue() : route.abort();
  });
  const profile = page.getByRole('combobox', {name: 'Dashboard layout profile'});
  await page.getByRole('navigation').getByRole('button', {name: 'Appearance', exact: true}).click();
  const cyber = page.getByRole('button', {name: /^Cyberpunk /});
  await cyber.click();
  await expect(cyber).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation').getByRole('button', {name: 'Overview', exact: true}).click();
  await page.evaluate(() => {
    window.__nativePointerEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) {
      window.addEventListener(type, event => {
        window.__nativePointerEvents.push({type, x: event.clientX, y: event.clientY,
          targetWidget: event.target.closest?.('[data-dashboard-widget]')?.dataset.dashboardWidget,
          hitWidget: document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-dashboard-widget]')?.dataset.dashboardWidget});
      }, true);
    }
  });
  const capture = async (name, interaction) => {
    const state = await page.evaluate(() => ({
      selectedProfile: document.querySelector('[aria-label="Dashboard layout profile"]')?.value,
      profileOptions: [...document.querySelectorAll('[aria-label="Dashboard layout profile"] option')].map(option => option.value),
      widgets: [...document.querySelectorAll('[data-dashboard-widget]')].map(node => ({
        id: node.dataset.dashboardWidget, title: node.querySelector('h3')?.textContent,
        classes: node.className, bounds: node.getBoundingClientRect().toJSON(),
      })),
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      editing: Boolean(document.querySelector('.widget-edit-bar')),
      scrollTop: document.querySelector('.main')?.scrollTop,
      viewport: {width: innerWidth, height: innerHeight, devicePixelRatio},
      pointerEvents: window.__nativePointerEvents,
    }));
    await writeFile(path.join(reportDir, `${name}.json`), JSON.stringify({...state, interaction}, null, 2));
    // Capture layout evidence while masking hardware, network and widget body content.
    await page.screenshot({path: path.join(reportDir, `${name}.png`),
      mask: [page.locator('.panel > :not(.panel-head), .panel-head > :not(h3)')]});
    return state;
  };
  t.after(() => capture('dashboard-final'));
  await expect(profile).toHaveValue('Default');
  await page.getByRole('button', {name: 'Settings', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Application Updates', exact: true})).toBeVisible();
  await expect(page.locator('.sidebar-foot')).toContainText(`Desktop · v${config.version}`);
  await expect(page.locator('.settings').filter({has: page.getByRole('heading', {name: 'Application Updates', exact: true})})).toContainText(`Version ${config.version} ·`);
  await expect(page.locator('.settings').filter({has: page.getByRole('heading', {name: 'About', exact: true})})).toContainText(`Hybrid Command Center v${config.version}`);
  const settingsInput = await page.getByRole('textbox', {name: 'Weather city'}).boundingBox();
  const saveCity = await page.getByRole('button', {name: 'Save city', exact: true}).boundingBox();
  assert.ok(Math.abs(settingsInput.y + settingsInput.height - saveCity.y - saveCity.height) < 1,
    'Weather city and its save action must share an aligned bottom edge.');
  await waitForCdp(cdpPort, () => app.exitCode === null && app.signalCode === null, 3000);
  await page.getByRole('button', {name: 'Overview', exact: true}).click();
  await expect(profile).toHaveValue('Default');
  const widget = name => page.locator(`[data-dashboard-widget="${name}"]`);
  const order = () => page.locator('[data-dashboard-widget]').evaluateAll(nodes => nodes.map(node => node.dataset.dashboardWidget));
  const defaults = await order();
  await capture('default-before-edit', {defaults});
  assert.deepEqual(defaults, DEFAULT_WIDGETS, 'Fresh Default profile must render all seven intended widgets before editing.');
  await page.getByRole('button', {name: 'Edit layout', exact: true}).click();
  const editing = await windowCommand();
  await writeFile(path.join(reportDir, 'uia-editing.json'), JSON.stringify(editing, null, 2));
  await page.locator('.main').evaluate(node => { node.scrollTop = node.scrollHeight; });
  const handle = widget('Quick launch').getByRole('button', {name: '⠿ Drag · Quick launch', exact: true});
  await capture('offscreen-before-drag');
  await handle.scrollIntoViewIfNeeded();
  await capture('before-drag', {defaults, expected: [defaults[1], defaults[0], ...defaults.slice(2)]});
  const start = await handle.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  try {
    await widget('Local AI · Ollama').scrollIntoViewIfNeeded();
    const target = await widget('Local AI · Ollama').boundingBox();
    await writeFile(path.join(reportDir, 'drag-coordinates.json'), JSON.stringify({start, target}, null, 2));
    await page.mouse.move(target.x + target.width / 2, target.y + 20, {steps: 12});
  }
  finally { await page.mouse.up(); }
  await capture('after-drag');
  await expect.poll(order).toEqual([defaults[1], defaults[0], ...defaults.slice(2)]);
  const quick = widget('Quick launch');
  const full = await quick.boundingBox();
  await quick.getByRole('button', {name: 'Half width', exact: true}).click();
  await expect(quick).not.toHaveClass(/dashboard-widget-wide/);
  const half = await quick.boundingBox();
  assert.ok(Math.abs(half.width - (full.width - 20) / 2) < 2);
  await quick.getByRole('button', {name: 'Full width', exact: true}).click();
  await expect(quick).toHaveClass(/dashboard-widget-wide/);
  assert.ok(Math.abs((await quick.boundingBox()).width - full.width) < 2);
  const changedOrder = await order();
  await capture('before-gaming', {changedOrder});
  await profile.selectOption('Gaming');
  await expect.poll(order).toEqual(['GPU monitoring', 'Quick launch', 'Local AI · Ollama', 'Tailscale', 'Weather']);
  await page.reload();
  await expect(profile).toHaveValue('Gaming');
  await profile.selectOption('Default');
  await expect.poll(order).toEqual(changedOrder);
  await capture('after-default-restored');
  const savedDefault = await page.evaluate(() => JSON.parse(localStorage.getItem('hcc-v1')).dashboardProfiles.Default);
  page.once('dialog', dialog => dialog.accept('Custom'));
  await page.getByRole('button', {name: 'New profile', exact: true}).click();
  await expect(profile).toHaveValue('Custom');
  await expect.poll(order).toEqual(changedOrder);
  await page.getByRole('button', {name: 'Edit layout', exact: true}).click();
  await quick.getByRole('button', {name: 'Half width', exact: true}).click();
  await quick.getByTitle('Move widget down', {exact: true}).click();
  const customOrder = [changedOrder[0], changedOrder[2], changedOrder[1], ...changedOrder.slice(3)];
  await expect.poll(order).toEqual(customOrder);
  const savedCustom = await page.evaluate(() => JSON.parse(localStorage.getItem('hcc-v1')).dashboardProfiles.Custom);
  for (let cycle = 1; cycle <= 3; cycle++) {
    for (const [step, name] of ['Default', 'Custom', 'Default', 'Custom'].entries()) {
      await capture(`switch-${cycle}-${step + 1}-${name}-before`);
      await profile.selectOption(name);
      await expect(profile).toHaveValue(name);
      await expect.poll(order).toEqual(name === 'Default' ? changedOrder : customOrder);
      if (name === 'Default') await expect(quick).toHaveClass(/dashboard-widget-wide/);
      else await expect(quick).not.toHaveClass(/dashboard-widget-wide/);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hcc-v1')));
      assert.equal(saved.activeDashboardProfile, name);
      assert.deepEqual(saved.dashboardProfiles.Default, savedDefault);
      assert.deepEqual(saved.dashboardProfiles.Custom, savedCustom);
      await capture(`switch-${cycle}-${step + 1}-${name}-after`);
    }
  }
  await page.reload();
  await expect(profile).toHaveValue('Custom');
  await expect.poll(order).toEqual(customOrder);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hcc-v1')).theme), 'cyber');
  await capture('custom-after-reload');
}, {timeout: 120000});
