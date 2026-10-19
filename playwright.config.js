import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', {open: 'never'}]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:1421',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {name: '1920x1080', use: {viewport: {width: 1920, height: 1080}}},
    {name: '2560x1440', use: {viewport: {width: 2560, height: 1440}}},
    {name: '3440x1440', use: {viewport: {width: 3440, height: 1440}}},
    {name: 'Windows-150pct', use: {viewport: {width: 1440, height: 900}, deviceScaleFactor: 1.5}},
  ],
  webServer: {
    command: 'npm run dev -- --port 1421',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: false,
  },
});
