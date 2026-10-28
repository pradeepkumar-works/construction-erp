import { expect, test, type Page } from '@playwright/test';
import { API_URL, PASSWORD, api, chooseOption, homeHeading, menuSettled, signIn } from './helpers';

/** A company of its own, so making a group never touches the demo group the other tests use. */
async function newCompany(stamp: number) {
  const email = `group-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Builders ${stamp}`, fullName: 'Ravi Admin', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const signed = (await res.json()) as { accessToken: string };
  return { email, token: signed.accessToken, name: `E2E Builders ${stamp}` };
}

const switcher = (page: Page) => page.locator('[data-tour="company"]');

/**
 * Group companies (phase 1). A company admin makes a group, adds a quality lab to it and gives a colleague a place there;
 * the colleague signs in once, sees both companies in the header and moves to the lab, which starts with the modules its
 * kind leaves out turned off.
 */
test('an admin makes a group with a lab, and a colleague moves between the two on one sign-in', async ({ page }) => {
  const stamp = Date.now();
  const co = await newCompany(stamp);
  const lab = `E2E Labs ${stamp}`;
  const colleague = `site-${stamp}@e2e.test`;
  await api(co.token, '/users', { method: 'POST', body: { email: colleague, fullName: 'Sunil Site', roleKey: 'SITE_ENGINEER', password: PASSWORD } });

  await signIn(page, co.email);
  await page.goto('/group');
  await expect(page.getByRole('heading', { level: 1, name: 'Group companies' })).toBeVisible();
  // One company, no group yet: the header has no company switcher.
  await expect(switcher(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Make a group' }).click();
  const make = page.getByRole('dialog', { name: 'Make a group' });
  await make.getByLabel('Group name').fill(`E2E Group ${stamp}`);
  await make.getByRole('button', { name: 'Make group' }).click();
  await expect(page.getByRole('tab', { name: /Companies/ })).toBeVisible();

  await page.getByRole('button', { name: 'New company' }).click();
  const form = page.getByRole('dialog', { name: 'New company' });
  await form.getByLabel('Name', { exact: true }).fill(lab);
  await chooseOption(form.getByLabel('Kind'), 'Quality lab');
  await form.getByLabel('PAN').fill('aabcq5678f');
  await form.getByRole('button', { name: 'Add company' }).click();
  await expect(page.getByText(`${lab} added.`)).toBeVisible();
  await expect(page.getByRole('cell', { name: lab, exact: true })).toBeVisible();
  await expect(page.getByText('AABCQ5678F')).toBeVisible();

  // Sunil gets a place in the lab, on the sign-in he already has.
  await page.getByRole('tab', { name: /People/ }).click();
  await page.getByRole('button', { name: 'Give Sunil Site a place' }).click();
  const give = page.getByRole('dialog', { name: 'Give Sunil Site a place' });
  await chooseOption(give.getByLabel('Role there'), 'Site Engineer');
  await give.getByRole('button', { name: 'Give place' }).click();
  await expect(page.getByText(`Sunil Site can now work in ${lab}`)).toBeVisible();

  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());
  await signIn(page, colleague);
  await expect(switcher(page)).toContainText(co.name);
  await switcher(page).click();
  await menuSettled(page);
  // The switch loads Home afresh in the lab.
  await Promise.all([page.waitForEvent('load'), page.getByRole('menuitem', { name: new RegExp(lab) }).click()]);
  await expect(homeHeading(page)).toBeVisible();
  await expect(switcher(page)).toContainText(lab);
  // A lab starts without tenders; the construction company has them.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tenders', exact: true })).toHaveCount(0);

  // Signing in again lands in the company used last.
  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());
  await signIn(page, colleague);
  await expect(switcher(page)).toContainText(lab);
});

/** The demo group: the QA/QC engineer works in the construction company and the lab, so the header offers both. */
test('the demo QA/QC engineer has both demo companies in the switcher', async ({ page }) => {
  await signIn(page, 'qaqc@demo.com');
  await switcher(page).click();
  await menuSettled(page);
  await expect(page.getByRole('menuitem', { name: /Demo Infra Projects/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Demo Quality Labs/ })).toBeVisible();
  // Not an admin of the group: no Group companies link, and the page says so.
  await expect(page.getByRole('menuitem', { name: 'Group companies' })).toHaveCount(0);
});
