import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, localToday, PASSWORD, signIn } from './helpers';

type Doc = { id: string; reference: string; status: string; state: string | null; daysLeft: number | null; renewedFromId: string | null; history?: { reference: string; status: string }[] };
type Register = { items: Doc[]; totals: { active: number; expiring: number; expired: number; guaranteesOut: string; marginBlocked: string; emdOut: string } };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** YYYY-MM-DD as the date pickers take it: DD MMM YYYY. */
const typed = (d: string) => `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** Guarantees, insurance and licences register: add a guarantee, see it expiring, renew it, close it. */
test('accounts add a bank guarantee, see it expiring and renew it', async ({ page }) => {
  // A company of its own, so the register starts empty.
  const stamp = Date.now();
  const email = `bg-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Guarantees ${stamp}`, fullName: 'Gita Guarantee', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const today = localToday();
  await api(owner, '/projects', { method: 'POST', body: { code: 'BG-01', name: 'E2E guarantee site', type: 'ROAD', startDate: today, endDate: shift(today, 365) } });

  await signIn(page, email);
  await page.goto('/compliance');
  await page.getByRole('button', { name: 'New guarantee or licence' }).click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'New guarantee or licence' });
  await form.getByLabel('Number').fill('BG/E2E/1');
  await form.getByLabel('Bank').fill('State Bank of India');
  await chooseOption(form.getByLabel('Project'), 'BG-01');
  await form.getByLabel('In favour of').fill('Executive Engineer, NH Division');
  await form.getByLabel('Guarantee amount').fill('500000');
  await form.getByLabel('Margin money').fill('125000');
  await form.getByLabel('Valid to').fill(typed(shift(today, 10)));
  await form.getByLabel('Valid to').press('Enter');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.ant-message').getByText('Bank guarantee BG/E2E/1 added')).toBeVisible();

  const drawer = page.locator('.compliance-drawer');
  await expect(drawer).toContainText('10 days left');
  await page.keyboard.press('Escape');
  await expect(page.locator('.compliance-summary')).toContainText('₹ 5,00,000');
  await expect(page.locator('.compliance-table tr').filter({ hasText: 'BG/E2E/1' })).toContainText('E2E guarantee site');

  // Renew it for a year: the old one is kept as an earlier period.
  await page.locator('.compliance-table tr').filter({ hasText: 'BG/E2E/1' }).click();
  await drawer.getByRole('button', { name: 'Renew' }).click();
  const renew = page.locator('.ant-modal').filter({ hasText: 'Renew' });
  await renew.getByLabel('New number').fill('BG/E2E/2');
  await renew.getByRole('button', { name: 'Renew guarantee', exact: true }).click();
  await expect(page.locator('.ant-message').getByText(/^Renewed to /)).toBeVisible();
  await expect(drawer.locator('.compliance-history')).toContainText('BG/E2E/1');

  const reg = await api<Register>(owner, '/compliance-docs');
  expect(reg.items.map((d) => d.reference)).toEqual(['BG/E2E/2']);
  expect(reg.items[0].state).toBe('VALID');
  expect(reg.totals).toMatchObject({ active: 1, expiring: 0, guaranteesOut: '500000.00', marginBlocked: '125000.00' });
  const renewed = await api<Doc>(owner, `/compliance-docs/${reg.items[0].id}`);
  expect(renewed.history?.map((h) => `${h.reference}/${h.status}`)).toEqual(['BG/E2E/1/RENEWED']);

  // A licence cannot be invoked; a guarantee returned by the client is released.
  const licence = await api<Doc>(owner, '/compliance-docs', { method: 'POST', body: { kind: 'LICENCE', reference: 'CLRA/E2E', expiresOn: shift(today, -2) } });
  expect(licence.state).toBe('EXPIRED');
  await expect(api(owner, `/compliance-docs/${licence.id}/invoke`, { method: 'POST', body: {} })).rejects.toThrow(/400/);
  await api(owner, `/compliance-docs/${renewed.id}/release`, { method: 'POST', body: { note: 'Returned after completion' } });
  await expect(api(owner, `/compliance-docs/${renewed.renewedFromId}`, { method: 'DELETE' })).rejects.toThrow(/409/);
  const after = await api<Register>(owner, '/compliance-docs');
  expect(after.items.map((d) => d.reference)).toEqual(['CLRA/E2E']);
  expect(after.totals).toMatchObject({ active: 1, expired: 1, guaranteesOut: '0.00' });
});

test('project managers see their projects\' entries; site staff are kept out', async () => {
  const pm = await apiToken('pm@demo.com');
  const seen = await api<Register>(pm, '/compliance-docs?status=ALL');
  expect(seen.items.every((d) => d.reference)).toBe(true);
  await expect(api(pm, '/compliance-docs', { method: 'POST', body: { kind: 'EMD', reference: 'x' } })).rejects.toThrow(/403/);
  await expect(api(await apiToken('engineer@demo.com'), '/compliance-docs')).rejects.toThrow(/403/);
});
