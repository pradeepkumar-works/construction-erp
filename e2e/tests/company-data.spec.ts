import { readFileSync } from 'fs';
import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, apiToken, signIn } from './helpers';

/** The file names in a zip, read from its central directory. */
function zipNames(buf: Buffer): string[] {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    names.push(buf.subarray(at + 46, at + 46 + len).toString('utf8'));
    at += 46 + len + extra;
  }
  return names;
}

/** Data export and privacy: the demo admin downloads everything as one zip; nobody else can. */
test('an admin downloads all company data as a zip', async ({ page }) => {
  await signIn(page, 'admin@demo.com');
  await page.goto('/company-data');
  await expect(page.getByText('The demo company cannot be deleted.')).toBeVisible();
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Download everything (.zip)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Demo-Infra-Projects-Pvt-Ltd-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const names = zipNames(readFileSync((await file.path())!));
  expect(names).toContain('README.txt');
  expect(names).toContain('excel/Project.xlsx');
  expect(names).toContain('excel/RaBill.xlsx');
  expect(names).not.toContain('excel/PasswordToken.xlsx');
  expect(names.some((n) => n.startsWith('files/'))).toBe(true);

  const pm = await apiToken('pm@demo.com');
  const denied = await fetch(`${API_URL}/company-data/export`, { headers: { authorization: `Bearer ${pm}` } });
  expect(denied.status).toBe(403);
});

/** A new company's admin asks for it to be deleted, sees the warning on every page, and cancels. */
test('an admin schedules the company for deletion and cancels it', async ({ page }) => {
  const stamp = Date.now();
  const company = `E2E Delete Me ${stamp}`;
  const email = `delete-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: company, fullName: 'Dev Admin', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);

  await signIn(page, email);
  await page.goto('/company-data');
  await page.getByRole('button', { name: 'Delete this company' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: `Delete ${company}?` });
  await expect(modal.getByRole('button', { name: 'Delete company' })).toBeDisabled();
  await modal.getByLabel('Company name').fill(company.toLowerCase());
  await modal.getByRole('button', { name: 'Delete company' }).click();
  await expect(page.getByText(`${company} and all its data will be deleted on`)).toBeVisible();

  await page.goto('/projects');
  await expect(page.getByText(/This company and all its data will be deleted on/)).toBeVisible();
  await page.getByRole('link', { name: 'Review or cancel' }).click();
  await expect(page).toHaveURL(/\/company-data/);
  await page.getByRole('button', { name: 'Cancel deletion' }).click();
  await expect(page.getByText('Deletion cancelled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete this company' })).toBeVisible();
  await expect(page.getByText(/This company and all its data will be deleted on/)).toHaveCount(0);
});

test('the privacy page is open to everyone', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deleting it' })).toBeVisible();
});
