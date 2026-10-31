// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
const os = require('node:os');

const PORT = Number(process.env.TEST_PORT) || 4173;
const DATA_DIR = path.join(os.tmpdir(), 'yvo-test-data-' + PORT + '-' + Date.now());

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:' + PORT,
    locale: 'fr-FR',
    timezoneId: 'Africa/Libreville',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }
  ],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning server/server.js',
    url: 'http://localhost:' + PORT + '/api/health',
    reuseExistingServer: false,
    env: { PORT: String(PORT), DATA_DIR: DATA_DIR, REGISTRATION: 'open' },
    timeout: 30000
  }
});
