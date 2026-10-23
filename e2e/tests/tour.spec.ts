import { expect, test } from '@playwright/test';
import { signIn, homeHeading } from './helpers';

/**
 * The product tour (v4 item 51): it starts by itself the first time someone signs in on a browser, steps over the
 * shell, and comes back from Help. Test browsers report navigator.webdriver, which keeps the tour off
 * every other test; this one hides it.
 */
test('the tour starts on first sign-in and can be taken again from Help', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await signIn(page, 'pm@demo.com');
  const tour = page.locator('.product-tour');
  await expect(tour.getByText(/^Welcome to Nirmaan, /)).toBeVisible();
  await tour.getByRole('button', { name: 'Next' }).click();
  for (const title of ['Your pages', 'Waiting for you', 'Work on one project', 'Jump anywhere', 'Ask Nirmaan', 'Start something new', 'Notifications', 'Help']) {
    await expect(tour.locator('.ant-tour-title')).toHaveText(title);
    await tour.getByRole('button', { name: 'Next' }).click();
  }
  await expect(tour.getByText('Your account')).toBeVisible();
  await tour.getByRole('button', { name: 'Finish' }).click();
  await expect(tour.getByText('Your account')).toBeHidden();

  // Seen: not again on the next visit.
  await page.reload();
  await expect(homeHeading(page)).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(tour.getByText(/^Welcome to Nirmaan, /)).toBeHidden();

  // Again from Help; closing it part-way is fine.
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  await expect(tour.getByText(/^Welcome to Nirmaan, /)).toBeVisible();
  await tour.getByRole('button', { name: 'Close' }).click();
  await expect(tour.getByText(/^Welcome to Nirmaan, /)).toBeHidden();
});

test('a site engineer, who approves nothing, gets the tour without the approvals step', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  // Test browsers do not get it by themselves; Help still opens it.
  await page.waitForTimeout(1200);
  await expect(page.locator('.product-tour').getByText(/^Welcome to Nirmaan, /)).toBeHidden();
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  const tour = page.locator('.product-tour');
  await expect(tour.getByText(/^Welcome to Nirmaan, /)).toBeVisible();
  const titles: string[] = [];
  for (;;) {
    titles.push((await tour.locator('.ant-tour-title').innerText()).trim());
    const next = tour.getByRole('button', { name: 'Next' });
    if (!(await next.isVisible())) break;
    await next.click();
  }
  expect(titles).not.toContain('Waiting for you');
  expect(titles).toContain('Your account');
});
