import {test, expect} from '@playwright/test';

test.use({timezoneId: 'America/Denver'});
const nav = (page, name) => page.getByRole('navigation').getByRole('button', {name, exact: true}).click();
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('hcc-v1')));
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('hcc-v1')) localStorage.setItem('hcc-v1', JSON.stringify({theme: 'cyber', note: 'Keep draft', tasks: [{id: 1, text: 'Keep task', done: false}], futureSetting: {keep: true}}));
    const receipts = {};
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {transformCallback: () => 1, unregisterCallback: () => {}, invoke: async (cmd, args) => {
      if (cmd === 'plugin:app|version') return '0.6.0';
      if (cmd === 'plugin:updater|check') return null;
      if (cmd === 'ollama_models') return {models: []};
      if (cmd === 'tailscale_status') return {BackendState: 'Running', Peer: {}};
      if (cmd === 'gpu_stats') return {gpus: []};
      if (cmd === 'productivity_sync') {
        for (const job of args.jobs) if (job.remaining === 0 || job.due <= Date.now()) receipts[job.id] = 'sent';
        return {mono: performance.now(), status: 'Mock notifications available', receipts};
      }
      throw Error('Unexpected command ' + cmd);
    }};
  });
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:1421' ? route.continue() : route.abort());
  await page.goto('/');
});
test.afterEach(async ({page}) => {
  const saved = await store(page);
  expect(saved.note).toBe('Keep draft'); expect(saved.tasks[0].text).toBe('Keep task'); expect(saved.futureSetting).toEqual({keep: true});
});

test('stopwatch supports keyboard start, laps, pause, navigation, resume and restart', async ({page}) => {
  await nav(page, 'Timers');
  const watch = page.getByRole('region', {name: 'Stopwatch', exact: true});
  await watch.getByRole('button', {name: 'Start', exact: true}).focus(); await page.keyboard.press('Enter');
  await expect(watch.getByLabel('Elapsed time')).not.toHaveText('00:00:00.00');
  await watch.getByRole('button', {name: 'Lap', exact: true}).click();
  await expect(watch.getByRole('list', {name: 'Recorded laps'}).getByRole('listitem')).toHaveCount(1);
  await watch.getByRole('button', {name: 'Pause', exact: true}).click();
  const paused = await watch.getByLabel('Elapsed time').textContent();
  await nav(page, 'Reminders'); await nav(page, 'Timers');
  await expect(watch.getByLabel('Elapsed time')).toHaveText(paused);
  await watch.getByRole('button', {name: 'Resume', exact: true}).click();
  await expect(watch.getByLabel('Elapsed time')).not.toHaveText(paused);
  await page.reload(); await nav(page, 'Timers');
  await expect(watch.getByText('Paused', {exact: true})).toBeVisible();
  await watch.getByRole('button', {name: 'Reset', exact: true}).click();
  await expect(watch.getByLabel('Elapsed time')).toHaveText('00:00:00.00');
});
test('countdown presets, custom duration, pause, resume, completion and reset', async ({page}) => {
  await nav(page, 'Timers');
  const timer = page.getByRole('region', {name: 'Countdown timer', exact: true});
  for (const minutes of [5, 10, 15, 25, 30, 60]) {
    await timer.getByRole('button', {name: `${minutes} min`, exact: true}).click();
    await expect(timer.getByLabel('Time remaining')).toHaveText(minutes === 60 ? '01:00:00' : `00:${String(minutes).padStart(2, '0')}:00`);
  }
  await timer.getByLabel('Hours', {exact: true}).fill('0'); await timer.getByLabel('Minutes', {exact: true}).fill('0'); await timer.getByLabel('Seconds', {exact: true}).fill('2');
  await timer.getByRole('button', {name: 'Set timer', exact: true}).click();
  await timer.getByRole('button', {name: 'Start', exact: true}).click();
  await timer.getByRole('button', {name: 'Pause', exact: true}).click();
  await expect(timer.getByText('Paused', {exact: true})).toBeVisible();
  await timer.getByRole('button', {name: 'Resume', exact: true}).click();
  await expect(timer.getByRole('status')).toHaveText('Time is up');
  await expect.poll(async () => (await store(page)).productivity.timer.notification).toBe('sent');
  await timer.getByRole('button', {name: 'Reset', exact: true}).click(); await expect(timer.getByLabel('Time remaining')).toHaveText('00:00:02');
});
test('calendar navigation, reminder CRUD, completion, notification and persistence', async ({page}) => {
  await nav(page, 'Reminders');
  const heading = await page.locator('.calendar-panel h3').first().textContent();
  await page.getByRole('button', {name: 'Next month', exact: true}).click(); await expect(page.locator('.calendar-panel h3').first()).not.toHaveText(heading);
  await page.getByRole('button', {name: 'Previous month', exact: true}).click(); await expect(page.locator('.calendar-panel h3').first()).toHaveText(heading);
  await page.getByRole('button', {name: 'Today', exact: true}).click();
  await page.getByLabel('Name', {exact: true}).fill('Test reminder');
  await page.getByLabel('Description (optional)', {exact: true}).fill('Local description');
  await page.getByLabel('Date', {exact: true}).fill('2026-01-15'); await page.getByLabel('Time', {exact: true}).fill('09:00');
  await page.getByLabel('Destination email (optional)', {exact: true}).fill('test@example.test');
  await page.getByRole('button', {name: 'Create reminder', exact: true}).click();
  const item = page.locator('.reminder-item'); await expect(item).toHaveCount(1); await expect(item).toContainText('Overdue');
  await expect(item).toContainText('Notification submitted to Windows');
  await item.getByRole('button', {name: 'Edit', exact: true}).click(); await page.getByLabel('Name', {exact: true}).fill('Edited reminder');
  const id = (await store(page)).productivity.reminders[0].id;
  await page.getByRole('button', {name: 'Save changes', exact: true}).click(); expect((await store(page)).productivity.reminders[0].id).toBe(id);
  await item.getByRole('button', {name: 'Mark complete', exact: true}).click();
  await page.getByLabel('Reminder filter').selectOption('completed'); await expect(item).toContainText('Edited reminder');
  await page.reload(); await nav(page, 'Reminders'); await page.getByLabel('Reminder filter').selectOption('completed'); await expect(item).toContainText('Edited reminder');
  page.once('dialog', dialog => dialog.dismiss()); await item.getByRole('button', {name: 'Delete', exact: true}).click(); await expect(item).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept()); await item.getByRole('button', {name: 'Delete', exact: true}).click(); await expect(item).toHaveCount(0);
});
test('productivity widgets remain optional, persist visibility and run across profile switches', async ({page}) => {
  for (const id of ['Stopwatch', 'Countdown timer', 'Upcoming reminders']) await expect(page.locator(`[data-dashboard-widget="${id}"]`)).toHaveCount(0);
  await nav(page, 'Appearance');
  for (const id of ['Stopwatch', 'Countdown timer', 'Upcoming reminders']) await page.getByRole('checkbox', {name: id, exact: true}).check();
  await nav(page, 'Overview');
  const watch = page.locator('[data-dashboard-widget="Stopwatch"]');
  await watch.getByRole('button', {name: 'Start', exact: true}).click();
  await page.getByLabel('Dashboard layout profile').selectOption('Gaming');
  await page.getByLabel('Dashboard layout profile').selectOption('Development');
  await page.getByLabel('Dashboard layout profile').selectOption('Default');
  await expect(watch.getByRole('button', {name: 'Pause', exact: true})).toBeVisible();
  await page.reload(); for (const id of ['Stopwatch', 'Countdown timer', 'Upcoming reminders']) await expect(page.locator(`[data-dashboard-widget="${id}"]`)).toBeVisible();
});
test('new pages fit smaller windows and respect reduced motion with visible keyboard focus', async ({page}, testInfo) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const size of [{width: 1024, height: 700}, {width: 680, height: 800}, {width: 375, height: 812}]) {
    await page.setViewportSize(size);
    for (const name of ['Timers', 'Reminders']) {
      await nav(page, name);
      expect(await page.evaluate(() => document.querySelector('.main').scrollWidth <= document.querySelector('.main').clientWidth + 1)).toBe(true);
      if (name === 'Timers') await expect(page.locator('.dial-progress').first()).toHaveCSS('transition-duration', '0s');
    }
  }
  await page.setViewportSize({width: 1024, height: 700}); await nav(page, 'Timers');
  const start = page.getByRole('region', {name: 'Stopwatch', exact: true}).getByRole('button', {name: 'Start', exact: true}); await start.focus(); await expect(start).toBeFocused();
  await page.screenshot({path: testInfo.outputPath('timers-responsive.png'), fullPage: true});
});
