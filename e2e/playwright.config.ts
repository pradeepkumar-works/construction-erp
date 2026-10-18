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
  projects: [
    // The flows: everything but the route walk.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /route-walk\.spec\.ts/ },
    // The route walk (item 89, `route-walk.spec.ts`): reads only, so it may run on several workers (`--workers=2`), after
    // one sign-in per role. CI runs it as its own jobs beside the flows. Its checks give the same answer every time, so a
    // retry would only hide a page that sometimes breaks and double the time of every finding; no trace either (each
    // finding names its page, check and element, and the screenshots are kept), and no failure screenshot (the walk takes
    // its own of every page, each in a context it opens and closes itself).
    { name: 'walk-setup', use: { ...devices['Desktop Chrome'] }, testMatch: /route-walk\.setup\.ts/ },
    { name: 'walk', use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off' }, retries: 0, testMatch: /route-walk\.spec\.ts/, dependencies: ['walk-setup'] },
  ],
});
