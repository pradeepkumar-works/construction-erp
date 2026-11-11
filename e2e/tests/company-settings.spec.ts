import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, localToday, signIn } from './helpers';

/** The financial year of a date as 26-27, as the number series writes it. */
const fy = (d: string) => {
  const y = Number(d.slice(0, 4));
  const start = Number(d.slice(5, 7)) >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
};

// A company of its own, so the demo company's numbers stay as the other tests expect them.
test('an admin sets the letterhead, a logo and numbering by financial year, and the next indent takes it', async ({ page }) => {
  const stamp = Date.now();
  const email = `settings-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Settings ${stamp}`, fullName: 'Asha Admin', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'SET-01', name: 'E2E settings road', type: 'ROAD' } });
  const indent = () => api<{ requestNo: string }>(owner, '/material-requests', { method: 'POST', body: { projectId: project.id, requiredDate: localToday(), items: [{ itemName: 'OPC 53 Grade Cement', unit: 'Bags', quantity: '10' }] } });
  expect((await indent()).requestNo).toBe(`MR-${localToday().slice(0, 4)}-0001`);

  await signIn(page, email);
  await page.goto('/company-settings');
  await expect(page.getByRole('heading', { name: 'Company settings', level: 1 })).toBeVisible();

  // The letterhead's details, shown in the preview.
  await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Letterhead details' }) }).getByRole('button', { name: 'Edit' }).click();
  const details = page.getByRole('dialog', { name: 'Letterhead details' });
  await details.getByLabel('Legal name').fill('E2E Settings Constructions Pvt Ltd');
  await details.getByLabel('Registered address').fill('Plot 12, Saheed Nagar, Bhubaneswar 751007');
  await details.getByLabel('GSTIN').fill('21aabcs1234f1z5');
  await details.getByRole('button', { name: 'Save' }).click();
  await expect(details).toBeHidden();
  const preview = page.getByRole('img', { name: 'Letterhead preview' });
  await expect(preview).toContainText('E2E Settings Constructions Pvt Ltd');
  await expect(preview).toContainText('GSTIN 21AABCS1234F1Z5');

  // A logo goes on the letterhead the papers print.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await expect(preview.locator('img')).toBeVisible();
  const letterhead = await api<{ logo: string | null; legalName: string | null }>(owner, '/company-data/letterhead');
  expect(letterhead.logo).toMatch(/^data:image\/(png|webp);base64,/);
  expect(letterhead.legalName).toBe('E2E Settings Constructions Pvt Ltd');

  // Numbering: everything by financial year, then the indents' own pattern.
  await page.getByRole('tab', { name: 'Numbering' }).click();
  await expect(page).toHaveURL(/tab=numbering/);
  await page.getByRole('button', { name: 'Number by financial year' }).click();
  await page.getByRole('button', { name: 'Use the financial year' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Indents' });
  await expect(row).toContainText(`MR/${fy(localToday())}/0001`);
  await row.getByRole('button', { name: 'Edit the pattern of indents' }).click();
  const dialog = page.getByRole('dialog', { name: 'Indents' });
  await dialog.getByLabel('Pattern').fill('IND/BBSR/{FY}/{NNNN}');
  await expect(dialog).toContainText(`IND/BBSR/${fy(localToday())}/0001`);
  await expect(dialog).toContainText('Each financial year');
  await dialog.getByLabel('Pattern').fill('IND {NNNN}');
  await expect(dialog).toContainText('no spaces');
  await dialog.getByLabel('Pattern').fill('IND/BBSR/{FY}/{NNNN}');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('Your pattern');

  // The next indents take the new series, from 1, one after the other.
  expect((await indent()).requestNo).toBe(`IND/BBSR/${fy(localToday())}/0001`);
  expect((await indent()).requestNo).toBe(`IND/BBSR/${fy(localToday())}/0002`);

  // Two kinds cannot share a pattern.
  const clash = await fetch(`${API_URL}/company-settings/numbering`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${owner}`, 'content-type': 'application/json' },
    body: JSON.stringify({ series: { MR: 'X/{NNNN}', PO: 'X/{NNNN}' } }),
  });
  expect(clash.status).toBe(400);
  expect(await clash.text()).toContain('have the same pattern');

  // Every other setting is one tab away.
  await page.getByRole('tab', { name: 'Other settings' }).click();
  await expect(page.getByRole('list', { name: 'People and access' }).getByRole('link', { name: /Approval rules/ })).toBeVisible();
});

test('only an admin opens company settings', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const res = await fetch(`${API_URL}/company-settings`, { headers: { authorization: `Bearer ${engineer}` } });
  expect(res.status).toBe(403);
  await signIn(page, 'engineer@demo.com');
  await page.goto('/company-settings');
  await expect(page.getByText('Only an admin can change the company settings')).toBeVisible();
});
