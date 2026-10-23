import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, openNewMenu, signIn } from './helpers';

type Switches = { tier: string | null; modules: { key: string; label: string; inPlan: boolean; on: boolean }[] };

const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

/** A company of its own, so switching its modules off never touches the demo company the other tests use. */
async function newCompany(name: string) {
  const stamp = Date.now();
  const email = `modules-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `${name} ${stamp}`, fullName: 'Meera Admin', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const signed = (await res.json()) as { accessToken: string; user: { organizationId: string } };
  return { email, token: signed.accessToken, orgId: signed.user.organizationId };
}

/**
 * Module switches (v6 item 117). The admin turns Meetings off from Admin > Modules: it leaves the sidebar and the New
 * menu, its page says it is off and its routes are refused; turned on again, it is all back.
 */
test('an admin turns a module off and on, and it leaves and comes back everywhere', async ({ page }) => {
  const co = await newCompany('E2E Modules');
  await signIn(page, co.email);
  await page.goto('/company-modules');
  await expect(page.getByRole('heading', { level: 1, name: 'Modules' })).toBeVisible();
  const meetings = page.getByRole('switch', { name: 'Meetings' });
  await expect(meetings).toBeChecked();
  const sidebarLink = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
  await expect(sidebarLink('Meetings')).toBeVisible();

  await meetings.click();
  await expect(page.getByText('Meetings is off; its records are kept')).toBeVisible();
  await expect(meetings).not.toBeChecked();
  // Gone from the sidebar and the New menu…
  await expect(sidebarLink('Meetings')).toHaveCount(0);
  await expect(sidebarLink('Daily reports')).toBeVisible();
  await openNewMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Purchase order' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Meeting', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // …its page says so, and the API refuses it.
  await page.goto('/meetings');
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings is turned off' })).toBeVisible();
  await expect(page).toHaveTitle(/^Meetings · /);
  const refused = await call(co.token, 'GET', '/meetings');
  expect(refused.status).toBe(403);
  expect((await refused.json()).message).toBe('Meetings is turned off for your company. An admin can turn it on under Admin, Modules.');
  expect((await api<{ modulesOff?: string[] }>(co.token, '/auth/me')).modulesOff).toEqual(['meetings']);

  // On again from the page's own link: the page and the API are back.
  await page.getByRole('link', { name: 'Open Modules' }).click();
  await page.getByRole('switch', { name: 'Meetings' }).click();
  await expect(page.getByText('Meetings is on')).toBeVisible();
  await page.goto('/meetings');
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible();
  expect((await call(co.token, 'GET', '/meetings')).status).toBe(200);
  expect((await api<{ modulesOff?: string[] }>(co.token, '/auth/me')).modulesOff).toBeUndefined();
});

test('the plan decides which modules a company may have; only admins switch them', async () => {
  const co = await newCompany('E2E Plan');
  // Nirmaan staff (admin@demo.com in the e2e run) put the company on the Essentials plan.
  const staff = await apiToken('admin@demo.com');
  const detail = await api<{ moduleTier: string | null; modulesOff: string[] }>(staff, `/platform/companies/${co.orgId}/plan`, { method: 'POST', body: { tier: 'ESSENTIALS' } });
  expect(detail.moduleTier).toBe('ESSENTIALS');
  expect(detail.modulesOff).toEqual(['tenders', 'subcontract_enquiries', 'books', 'payroll', 'biometric', 'rmc', 'machine_loans']);

  // Outside the plan: shown as such, refused, and cannot be turned on.
  const switches = await api<Switches>(co.token, '/module-switches');
  expect(switches.tier).toBe('ESSENTIALS');
  expect(switches.modules.find((m) => m.key === 'payroll')).toMatchObject({ inPlan: false, on: false });
  expect(switches.modules.find((m) => m.key === 'safety')).toMatchObject({ inPlan: true, on: true });
  const turnOn = await call(co.token, 'PUT', '/module-switches/payroll', { on: true });
  expect(turnOn.status).toBe(400);
  expect((await turnOn.json()).message).toBe('Payroll is not in your Essentials plan. Ask us to move you to a plan that has it.');
  const loans = await call(co.token, 'GET', '/machine-loans');
  expect(loans.status).toBe(403);
  expect((await loans.json()).message).toContain('Machine loans is turned off for your company');

  // Back to every module: the loans open again.
  await api(staff, `/platform/companies/${co.orgId}/plan`, { method: 'POST', body: { tier: null } });
  expect((await call(co.token, 'GET', '/machine-loans')).status).toBe(200);

  // Someone who is not an admin can neither read nor change the switches (the demo company is left as it is).
  const pm = await apiToken('pm@demo.com');
  expect((await call(pm, 'GET', '/module-switches')).status).toBe(403);
  expect((await call(pm, 'PUT', '/module-switches/meetings', { on: false })).status).toBe(403);
});
