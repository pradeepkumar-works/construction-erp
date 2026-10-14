import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests of the main web flows against a running web app and API with the demo seed loaded.
 * E2E_WEB_URL and E2E_API_URL point at them (defaults: local dev ports). The tests change demo data (they add
 * and approve entries), so run them against a local or CI database, not production.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
