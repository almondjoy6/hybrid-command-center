import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const appVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).version;

const savedData = {
  theme: 'emerald', density: 'comfortable', motion: false, city: 'Test City',
  tasks: [{id: 1, text: 'Keep this task', done: false, priority: 'high', due: '2026-10-20'}],
  notes: [{id: 'note-1', title: 'Keep this note', content: 'Saved notes must survive layout edits.'}],
  note: 'Unfinished draft', chats: [{id: 'chat-1', messages: []}],
  shortcuts: [{id: 'shortcut-1', name: 'Local docs', url: 'https://example.test'}],
  futureSetting: {keep: true},
};
const widget = (page, name) => page.locator(`[data-dashboard-widget="${name}"]`);
const profile = page => page.getByRole('combobox', {name: 'Dashboard layout profile'});
const order = page => page.locator('[data-dashboard-widget]').evaluateAll(nodes => nodes.map(n => n.dataset.dashboardWidget));
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('hcc-v1')));

test.beforeEach(async ({page}) => {
  await page.addInitScript(({data, appVersion}) => {
    // Each test has a fresh browser context; reloads must retain edits made by the test.
    if (!localStorage.getItem('hcc-v1')) localStorage.setItem('hcc-v1', JSON.stringify(data));
    let callbackId = 0;
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => ++callbackId,
      unregisterCallback: () => {},
      invoke: async cmd => {
        if (cmd === 'plugin:app|version') return appVersion;
        if (cmd === 'plugin:updater|check') return null;
        if (cmd === 'ollama_models') return {models: [{name: 'local-test-model'}]};
        if (cmd === 'tailscale_status') return {BackendState: 'Running', Peer: {}};
        if (cmd === 'gpu_stats') return {gpus: [{index: 0, name: 'Test GPU', util: 42, temp: 55, used: 2048, total: 8192}]};
        throw new Error(`Unexpected native command in frontend test: ${cmd}`);
      },
    };
  }, {data: savedData, appVersion});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:1421') return route.continue();
    if (url.hostname === 'geocoding-api.open-meteo.com') {
      return route.fulfill({json: {results: [{name: 'Test City', country: 'Test', latitude: 40, longitude: -111}]}});
    }
    if (url.hostname === 'api.open-meteo.com') {
      return route.fulfill({json: {
        current: {temperature_2m: 72, relative_humidity_2m: 35, weather_code: 0, wind_speed_10m: 4},
        daily: {time: ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'],
          temperature_2m_max: [72, 73, 74, 75, 76], temperature_2m_min: [50, 51, 52, 53, 54]},
      }});
    }
    return route.abort();
  });
  page.on('pageerror', error => { page.testErrors.push(error.message); });
  page.testErrors = [];
  await page.goto('/');
  await expect(profile(page)).toHaveValue('Default');
  await expect(widget(page, 'Weather')).toContainText('72°F');
});

test.afterEach(async ({page}, testInfo) => {
  const path = testInfo.outputPath('dashboard.png');
  await page.screenshot({path});
  await testInfo.attach('dashboard', {path, contentType: 'image/png'});
  expect(page.testErrors).toEqual([]);
});

async function drag(page, from, to) {
  const handle = widget(page, from).getByRole('button', {name: `⠿ Drag · ${from}`, exact: true});
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await widget(page, to).scrollIntoViewIfNeeded();
  const end = await widget(page, to).boundingBox();
  await page.mouse.move(end.x + end.width / 2, end.y + 20, {steps: 12});
  await page.mouse.up();
}

test('version labels use native metadata and update checks preserve saved data', async ({page}) => {
  await expect(page.locator('.sidebar-foot')).toContainText(`Desktop · v${appVersion}`);
  await page.getByRole('button', {name: 'Settings', exact: true}).click();
  await expect(page.getByText(`Version ${appVersion} · Daily checks · Manual installation`, {exact: true})).toBeVisible();
  await expect(page.getByText(`Hybrid Command Center v${appVersion}`, {exact: true})).toBeVisible();
  const before = await stored(page);
  await page.getByRole('button', {name: 'Check for Updates', exact: true}).click();
  await expect(page.locator('.settings-status')).toHaveText('You are up to date');
  expect(await stored(page)).toEqual(before);
});

async function checkOverflow(page) {
  const issues = await page.evaluate(() => {
    const issues = [];
    for (const selector of ['html', 'body', '#root', '.shell', '.main', '.dashboard-grid', '.dashboard-widget', '.widget-edit-bar', '.dashboard-widget > .panel']) {
      for (const el of document.querySelectorAll(selector)) {
        if (el.scrollWidth > el.clientWidth + 1) issues.push(`${selector}: horizontal ${el.scrollWidth} > ${el.clientWidth}`);
      }
    }
    for (const selector of ['html', 'body', '#root', '.shell']) {
      const el = document.querySelector(selector);
      if (el.scrollHeight > el.clientHeight + 1) issues.push(`${selector}: outer vertical overflow`);
    }
    for (const el of document.querySelectorAll('.dashboard-widget')) {
      const panel = el.querySelector('.panel').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      if (panel.bottom > box.bottom + 1) issues.push(`${el.dataset.dashboardWidget}: panel extends beyond widget`);
    }
    return issues;
  });
  expect(issues).toEqual([]);
}

test('dragging reorders widgets and width controls resize their geometry', async ({page}) => {
  await page.getByRole('button', {name: 'Edit layout', exact: true}).click();
  await drag(page, 'Quick launch', 'Local AI · Ollama');
  await expect.poll(() => order(page)).toEqual(['Local AI · Ollama', 'Quick launch', 'Weather', 'Tasks', 'Tailscale', 'GPU monitoring', 'Recent notes']);
  const quick = widget(page, 'Quick launch');
  const full = await quick.boundingBox();
  await quick.getByRole('button', {name: 'Half width', exact: true}).click();
  await expect(quick).not.toHaveClass(/dashboard-widget-wide/);
  const half = await quick.boundingBox();
  expect(half.width).toBeCloseTo((full.width - 20) / 2, 0);
  await quick.getByRole('button', {name: 'Full width', exact: true}).click();
  await expect(quick).toHaveClass(/dashboard-widget-wide/);
  expect((await quick.boundingBox()).width).toBeCloseTo(full.width, 0);
  await page.getByRole('button', {name: 'Done editing', exact: true}).click();
  await expect(page.locator('.widget-edit-bar')).toHaveCount(0);
});

test('profile switching keeps independent arrangements and active selection', async ({page}) => {
  const defaults = await order(page);
  for (const [name, first, hidden] of [
    ['Gaming', 'GPU monitoring', ['Tasks', 'Recent notes']],
    ['Development', 'Local AI · Ollama', ['Weather']],
    ['Servers', 'Tailscale', ['Weather', 'Recent notes']],
  ]) {
    await profile(page).selectOption(name);
    expect((await order(page))[0]).toBe(first);
    for (const id of hidden) await expect(widget(page, id)).toHaveCount(0);
  }
  await page.reload();
  await expect(profile(page)).toHaveValue('Servers');
  await profile(page).selectOption('Default');
  expect(await order(page)).toEqual(defaults);
});

test('dashboard fills the viewport and grows with available screen width', async ({page}) => {
  const bounds = await page.evaluate(() => {
    const rect = selector => {
      const {x, y, width, height, right} = document.querySelector(selector).getBoundingClientRect();
      return {x, y, width, height, right};
    };
    return {shell: rect('.shell'), main: rect('.main'), sidebar: rect('.sidebar'), grid: rect('.dashboard-grid'),
      viewport: {width: innerWidth, height: innerHeight}, padding: parseFloat(getComputedStyle(document.querySelector('.main')).paddingRight)};
  });
  expect(bounds.shell).toMatchObject({x: 0, y: 0, width: bounds.viewport.width, height: bounds.viewport.height});
  expect(bounds.main.x).toBe(bounds.sidebar.right);
  expect(bounds.main.right).toBe(bounds.viewport.width);
  expect(bounds.main.height).toBe(bounds.viewport.height);
  expect(bounds.grid.right).toBeGreaterThan(bounds.viewport.width - bounds.padding - 25);
});

test('profiles and editing have no horizontal overflow or competing outer scrollbars', async ({page}, testInfo) => {
  for (const name of ['Default', 'Gaming', 'Development', 'Servers']) {
    await profile(page).selectOption(name);
    await checkOverflow(page);
    await page.getByRole('button', {name: 'Edit layout', exact: true}).click();
    await checkOverflow(page);
    if (name === 'Default') {
      const path = testInfo.outputPath('editing.png');
      await page.screenshot({path});
      await testInfo.attach('layout editor', {path, contentType: 'image/png'});
    }
    await page.getByRole('button', {name: 'Done editing', exact: true}).click();
  }
  await profile(page).selectOption('Default');
  await widget(page, 'Recent notes').scrollIntoViewIfNeeded();
  await expect(widget(page, 'Recent notes').getByRole('heading')).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('widget positions and sizes restore after reload without altering user data', async ({page}) => {
  await page.getByRole('button', {name: 'Edit layout', exact: true}).click();
  await drag(page, 'Quick launch', 'Weather');
  await widget(page, 'Quick launch').getByRole('button', {name: 'Half width', exact: true}).click();
  const changedOrder = await order(page);
  const changed = await stored(page);
  expect(changed.dashboardProfiles.Default[2]).toMatchObject({id: 'Quick launch', w: 1});
  await profile(page).selectOption('Gaming');
  await profile(page).selectOption('Default');
  expect(await order(page)).toEqual(changedOrder);
  await page.reload();
  expect(await order(page)).toEqual(changedOrder);
  await expect(widget(page, 'Quick launch')).not.toHaveClass(/dashboard-widget-wide/);
  expect((await stored(page)).dashboardProfiles).toEqual(changed.dashboardProfiles);
  const restored = await stored(page);
  for (const [key, value] of Object.entries(savedData)) expect(restored[key]).toEqual(value);
});

test('responsive grid uses two columns on desktop and one below its breakpoint', async ({page}) => {
  const desktop = page.viewportSize();
  const widths = await Promise.all(['Local AI · Ollama', 'Weather', 'Quick launch'].map(async name => (await widget(page, name).boundingBox()).width));
  expect(widths[0]).toBeCloseTo(widths[1], 0);
  expect(widths[2]).toBeCloseTo(widths[0] * 2 + 20, 0);
  await page.setViewportSize({width: 860, height: 1080});
  const narrow = await Promise.all(['Local AI · Ollama', 'Weather', 'Quick launch'].map(async name => (await widget(page, name).boundingBox()).width));
  expect(narrow[0]).toBeCloseTo(narrow[1], 0);
  expect(narrow[0]).toBeCloseTo(narrow[2], 0);
  await checkOverflow(page);
  await page.setViewportSize(desktop);
  await checkOverflow(page);
});

test('design foundations keep primary text readable and keyboard focus visible in every theme', async ({page}) => {
  await page.getByRole('button', {name: 'Settings', exact: true}).click();
  for (const theme of ['violet', 'midnight', 'emerald', 'sunset', 'light', 'cyber']) {
    const result = await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      const button = document.querySelector('.primary');
      const style = getComputedStyle(button);
      const luminance = color => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => {
          c /= 255;
          return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
        });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const fg = luminance(style.color), bg = luminance(style.backgroundColor);
      return {contrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05),
        scheme: getComputedStyle(document.documentElement).colorScheme};
    }, theme);
    expect(result.contrast, theme).toBeGreaterThanOrEqual(4.5);
    expect(result.scheme).toBe(theme === 'light' ? 'light' : 'dark');
  }
  const city = page.getByRole('textbox', {name: 'Weather city'});
  await city.focus();
  expect(await city.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
  await page.emulateMedia({reducedMotion: 'reduce'});
  expect(await page.locator('.primary').first().evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  for (const [key, value] of Object.entries(savedData)) expect((await stored(page))[key]).toEqual(value);
});

test('Overview prioritizes widgets and keeps all launch actions available', async ({page}) => {
  const quick = widget(page, 'Quick launch');
  const box = await quick.boundingBox();
  expect(box.y).toBeLessThan(240);
  expect(box.height).toBeLessThan(220);
  await expect(quick.locator('.app-btn')).toHaveCount(7);
  await expect(quick.getByRole('button', {name: 'Local docs', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Edit layout', exact: true})).toHaveAttribute('aria-pressed', 'false');
  expect(await order(page)).toEqual(['Quick launch', 'Local AI · Ollama', 'Weather', 'Tasks', 'Tailscale', 'GPU monitoring', 'Recent notes']);
  await checkOverflow(page);
});

test('hardware history has a fixed scale, keyboard inspection, pause and stale feedback', async ({page}) => {
  await page.clock.install();
  await page.getByRole('button', {name: 'Hardware', exact: true}).click();
  await page.clock.runFor(6000);
  const panel = page.locator('.gpu-panel');
  await expect(panel.getByText('100%', {exact: true})).toBeVisible();
  await expect(panel.getByText('−70s', {exact: true})).toBeVisible();
  await expect(panel.locator('.chart-line')).toHaveAttribute('d', /L/);
  const inspect = panel.getByRole('slider', {name: 'Inspect history for GPU 0'});
  await inspect.focus();
  await inspect.press('ArrowLeft');
  await expect(inspect).toHaveAttribute('aria-valuetext', /42% utilization/);
  await panel.getByRole('button', {name: 'Pause graph for GPU 0'}).click();
  const paused = await panel.locator('.chart-line').getAttribute('d');
  await page.clock.runFor(6000);
  await expect(panel.locator('.chart-line')).toHaveAttribute('d', paused);
  await expect(panel.getByText('Paused', {exact: true})).toBeVisible();
  await panel.getByRole('button', {name: 'Resume graph for GPU 0'}).click();
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (cmd, ...args) => cmd === 'gpu_stats'
      ? Promise.reject(new Error('Synthetic telemetry failure')) : invoke(cmd, ...args);
  });
  await page.getByRole('button', {name: 'Refresh', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('Telemetry unavailable');
  await expect(panel.locator('.telemetry-status')).toHaveText('Stale');
  await expect(panel).toContainText('Last successful reading');
  await expect(panel.getByRole('meter', {name: 'GPU 0 VRAM usage'})).toHaveAttribute('aria-valuetext', '2048 of 8192 MiB');
  await checkOverflow(page);
});

test('navigation and preferences retain all destinations, themes and saved data', async ({page}, testInfo) => {
  const navigation = page.getByRole('navigation', {name: 'Main navigation'});
  await expect(navigation.getByRole('button')).toHaveCount(9);
  await navigation.getByRole('button', {name: 'Settings', exact: true}).click();
  await expect(navigation.getByRole('button', {name: 'Settings', exact: true})).toHaveAttribute('aria-current', 'page');
  for (const name of ['Preferences', 'Application Updates', 'Backup & Restore', 'About']) {
    await expect(page.getByRole('heading', {name, exact: true})).toBeVisible();
  }
  for (const name of ['Export Backup', 'Restore Backup', 'Check for Updates', 'Save city']) {
    await expect(page.getByRole('button', {name, exact: true})).toBeVisible();
  }
  const settings = testInfo.outputPath('settings.png');
  await page.screenshot({path: settings});
  await testInfo.attach('Settings', {path: settings, contentType: 'image/png'});
  await page.getByRole('button', {name: 'Customize', exact: true}).click();
  for (const theme of ['Violet', 'Midnight', 'Emerald', 'Sunset', 'Light', 'Cyberpunk']) {
    const tile = page.getByRole('button', {name: new RegExp('^'+theme+' ')});
    await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    await checkOverflow(page);
    await page.screenshot({path: testInfo.outputPath('theme-'+theme+'.png')});
  }
  const density = page.getByRole('combobox', {name: 'Interface density'});
  for (const value of ['compact', 'spacious', 'comfortable']) {
    await density.selectOption(value);
    expect((await stored(page)).density).toBe(value);
  }
  const motion = page.getByRole('switch', {name: 'Enable subtle animations'});
  await expect(motion).not.toBeChecked();
  await motion.check();
  expect((await stored(page)).motion).toBe(true);
  await motion.uncheck();
  await page.getByRole('button', {name: /^Emerald /}).click();
  await navigation.getByRole('button', {name: 'Overview', exact: true}).click();
  for (const [key, value] of Object.entries(savedData)) expect((await stored(page))[key]).toEqual(value);
  await checkOverflow(page);
});

test('wide screens bound launch contents and keep every page free of horizontal overflow', async ({page}) => {
  const original = page.viewportSize();
  const navigation = page.getByRole('navigation', {name: 'Main navigation'});
  for (const size of [{width: 3440, height: 1440}, {width: 1024, height: 700}]) {
    await page.setViewportSize(size);
    for (const name of ['Overview', 'Launcher', 'AI Center', 'Weather', 'Tasks & Notes', 'Servers', 'Hardware', 'Appearance', 'Settings']) {
      await navigation.getByRole('button', {name, exact: true}).click();
      await checkOverflow(page);
      const overflow = await page.locator('.panel, .overview-toolbar, .settings-page, .workspace-grid').evaluateAll(nodes =>
        nodes.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className));
      expect(overflow, name+' at '+size.width).toEqual([]);
      if (name === 'Overview') {
        const widths = await page.locator('.app-btn').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().width));
        for (const width of widths) expect(width).toBeLessThanOrEqual(241);
      }
    }
  }
  await page.setViewportSize(original);
  await navigation.getByRole('button', {name: 'Overview', exact: true}).click();
});

test('widget visibility stays independent between profiles and survives reload', async ({page}) => {
  await profile(page).selectOption('Gaming');
  await page.getByRole('navigation').getByRole('button', {name: 'Appearance', exact: true}).click();
  await page.getByRole('checkbox', {name: 'Weather', exact: true}).uncheck();
  await page.getByRole('navigation').getByRole('button', {name: 'Overview', exact: true}).click();
  await expect(widget(page, 'Weather')).toHaveCount(0);
  await page.reload();
  await expect(profile(page)).toHaveValue('Gaming');
  await expect(widget(page, 'Weather')).toHaveCount(0);
  await profile(page).selectOption('Default');
  await expect(widget(page, 'Weather')).toBeVisible();
  const data = await stored(page);
  expect(data.dashboardProfiles.Gaming.find(item => item.id === 'Weather').hidden).toBe(true);
  expect(data.dashboardProfiles.Default.find(item => item.id === 'Weather').hidden).toBe(false);
  for (const [key, value] of Object.entries(savedData)) expect(data[key]).toEqual(value);
});

test('refined cards follow content height without stretching adjacent services', async ({page}) => {
  await page.getByRole('navigation').getByRole('button', {name: 'Appearance', exact: true}).click();
  await page.getByRole('button', {name: /^Cyberpunk /}).click();
  await page.getByRole('navigation').getByRole('button', {name: 'Overview', exact: true}).click();
  const ai = widget(page, 'Local AI · Ollama');
  const server = widget(page, 'Tailscale');
  expect((await ai.boundingBox()).height).toBeLessThan(200);
  const compactServer = (await server.boundingBox()).height;
  expect(compactServer).toBeLessThan(180);
  const tasks = Array.from({length: 5}, (_, id) => ({id, done: false,
    text: 'Synthetic detailed task. '.repeat(8)}));
  await page.evaluate(tasks => {
    const data = JSON.parse(localStorage.getItem('hcc-v1'));
    localStorage.setItem('hcc-v1', JSON.stringify({...data, tasks}));
  }, tasks);
  await page.reload();
  expect((await widget(page, 'Tasks').boundingBox()).height).toBeGreaterThan(200);
  expect((await server.boundingBox()).height).toBeCloseTo(compactServer, 0);
  const longModel = 'local-model-'+ 'x'.repeat(180);
  await page.evaluate(name => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (cmd, ...args) => cmd === 'ollama_models'
      ? Promise.resolve({models: [{name}]}) : invoke(cmd, ...args);
  }, longModel);
  await ai.getByRole('button', {name: 'Refresh AI models'}).click();
  await expect(ai).toContainText(longModel);
  await expect(ai.getByRole('button', {name: 'Open AI chat →', exact: true})).toBeVisible();
  for (const [key, value] of Object.entries(savedData)) {
    if (!['tasks', 'theme'].includes(key)) expect((await stored(page))[key]).toEqual(value);
  }
  expect((await stored(page)).theme).toBe('cyber');
  await checkOverflow(page);
});

test('refined Settings align actions and hardware metrics remain prominent', async ({page}) => {
  await page.getByRole('navigation').getByRole('button', {name: 'Settings', exact: true}).click();
  const preferences = page.locator('.settings').filter({has: page.getByRole('heading', {name: 'Preferences', exact: true})});
  const updates = page.locator('.settings').filter({has: page.getByRole('heading', {name: 'Application Updates', exact: true})});
  expect((await preferences.boundingBox()).height).toBeLessThan(280);
  expect((await updates.boundingBox()).height).toBeLessThan(280);
  const input = await page.getByRole('textbox', {name: 'Weather city'}).boundingBox();
  const save = await page.getByRole('button', {name: 'Save city', exact: true}).boundingBox();
  expect(input.y + input.height).toBeCloseTo(save.y + save.height, 0);
  await page.getByRole('navigation').getByRole('button', {name: 'Hardware', exact: true}).click();
  const metrics = page.locator('.gpu-metrics strong');
  await expect(metrics).toHaveCount(3);
  for (const metric of await metrics.all()) {
    expect(await metric.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(40);
  }
  await expect(page.getByRole('slider', {name: 'Inspect history for GPU 0'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Pause graph for GPU 0'})).toBeVisible();
  await checkOverflow(page);
});
