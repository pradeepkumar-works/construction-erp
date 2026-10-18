import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, localToday, PASSWORD, signIn } from './helpers';

type Imprest = { id: string; cashInHand: string; topUpDue: string; openRequest: { id: string } | null; ledger?: { ref: string | null; balance: string }[] };

/** Site imprest (v4 item 45): a float, cash expenses spending it, a top-up asked for and paid, and closing it. */
test('accounts give a site a petty cash float and top it back up after its cash expenses', async ({ page }) => {
  // A company of its own: its owner (an admin) both runs the imprest and holds it.
  const stamp = Date.now();
  const email = `cash-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Imprest ${stamp}`, fullName: 'Chitra Cash', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const today = localToday();
  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'IMP-01', name: 'E2E imprest site', type: 'ROAD', startDate: today, endDate: `${Number(today.slice(0, 4)) + 1}${today.slice(4)}` } });

  await signIn(page, email);
  await page.goto('/imprest');
  await page.getByRole('button', { name: 'New imprest' }).click();
  const open = page.locator('.ant-modal').filter({ hasText: 'New imprest' });
  await chooseOption(open.getByLabel('Project'), 'IMP-01');
  await chooseOption(open.getByLabel('Held by'), 'Chitra');
  await open.getByLabel('Float', { exact: true }).fill('5000');
  await open.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Imprest opened for Chitra Cash')).toBeVisible();
  const drawer = page.locator('.imprest-drawer');
  await expect(drawer).toContainText('₹ 5,000.00');
  await page.keyboard.press('Escape');

  // A cash bill of ₹1,200 is submitted: it spends the float before it is approved.
  const [imp] = await api<Imprest[]>(owner, '/imprests');
  const x = await api<{ id: string; expenseNo: string }>(owner, '/expenses', {
    method: 'POST',
    body: { projectId: project.id, date: today, category: 'FOOD_WELFARE', description: 'Drinking water cans (e2e)', amount: '1200', paymentMode: 'CASH', submit: true },
  });
  await page.reload();
  const row = page.locator('.imprest-table tr').filter({ hasText: 'Chitra Cash' });
  await expect(row).toContainText('₹ 3,800.00');
  await expect(row).toContainText('₹ 1,200.00 awaiting approval');

  await row.click();
  await drawer.getByRole('button', { name: 'Ask for a top-up' }).click();
  const ask = page.locator('.ant-modal').filter({ hasText: 'Ask for a top-up' });
  await ask.getByLabel('What for').fill('Water and tea bills are in');
  await ask.getByRole('button', { name: 'Ask for top-up' }).click();
  await expect(page.locator('.ant-message').getByText('Top-up asked for')).toBeVisible();
  await drawer.getByRole('button', { name: 'Pay ₹ 1,200.00' }).click();
  const pay = page.locator('.ant-modal').filter({ hasText: 'Pay the top-up' });
  await pay.getByLabel('Reference').fill('UTR E2E');
  await pay.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(page.locator('.ant-message').getByText('Top-up paid')).toBeVisible();
  await expect(page.locator('.imprest-ledger')).toContainText(x.expenseNo);
  await expect(page.locator('.imprest-ledger')).toContainText('UTR E2E');

  const after = await api<Imprest>(owner, `/imprests/${imp.id}`);
  expect(after.cashInHand).toBe('5000.00');
  expect(after.topUpDue).toBe('0.00');
  expect(after.ledger?.at(-1)?.balance).toBe('5000.00');

  // Closing needs the cash back first.
  await expect(api(owner, `/imprests/${imp.id}`, { method: 'PATCH', body: { isActive: false } })).rejects.toThrow(/409/);
  await expect(api(owner, `/imprests/${imp.id}/returns`, { method: 'POST', body: { amount: '6000' } })).rejects.toThrow(/400/);
  await api(owner, `/imprests/${imp.id}/returns`, { method: 'POST', body: { amount: '5000', note: 'Site closed' } });
  await api(owner, `/imprests/${imp.id}`, { method: 'PATCH', body: { isActive: false } });
  expect(await api<Imprest[]>(owner, '/imprests')).toHaveLength(0);
});

test('only accounts open imprests, and holders see only their own', async () => {
  const engineer = await apiToken('engineer@demo.com');
  const mine = await api<{ holderName: string }[]>(engineer, '/imprests');
  expect(mine.every((i) => i.holderName === mine[0]?.holderName)).toBe(true);
  const road = (await api<{ items: { id: string; code: string }[] }>(engineer, '/projects')).items.find((p) => p.code === 'RD-2026-01')!;
  await expect(api(engineer, '/imprests', { method: 'POST', body: { projectId: road.id, holderId: road.id, floatAmount: '1000' } })).rejects.toThrow(/403/);
  expect(await api<unknown[]>(await apiToken('store@demo.com'), '/imprests')).toEqual([]);
});
