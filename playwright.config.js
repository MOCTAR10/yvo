// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.TEST_PORT) || 4173;
const DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://yvo:yvo@localhost:5442/yvo_test';
// Le vrai mot de passe vient uniquement de l'environnement (secret GitHub) ; repli local fictif.
if (!process.env.YVO_PASSWORD) process.env.YVO_PASSWORD = 'test-yvo-2026';

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
    // Playwright démarre webServer AVANT globalSetup : la remise à zéro de la base se fait donc ici.
    command: 'node tests/reset-db.js && node server/server.js',
    url: 'http://localhost:' + PORT + '/api/health',
    reuseExistingServer: false,
    env: { PORT: String(PORT), DATABASE_URL: DATABASE_URL, YVO_PASSWORD: process.env.YVO_PASSWORD, NODE_ENV: 'test' },
    timeout: 30000
  }
});
