import { expect, test } from '@playwright/test';
import { api, apiToken, openProjectTab, projectTabs, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Bill = { id: string; billLabel: string; status: string };

/**
 * RA bills (v3 item 18): the quantity surveyor prepares the next bill of the road project from a measurement approved
 * today, it is approved, sent and certified with a cut, and the bill shows what was claimed.
 */
test('prepare, approve, send and certify an RA bill', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const pm = await apiToken('pm@demo.com');
  const projects = await api<Page<{ id: string; code: string }>>(qs, '/projects?pageSize=100');
  const road = projects.items.find((p) => p.code === 'RD-2026-01')!;
  // A bill left open by an earlier run would block the next one.
  for (const b of (await api<Page<Bill>>(qs, `/ra-bills?projectId=${road.id}&pageSize=100`)).items) {
    if (b.status !== 'APPROVED') await api(qs, `/ra-bills/${b.id}`, { method: 'DELETE' });
  }
  const boq = await api<{ id: string; itemNo: string }[]>(qs, `/projects/${road.id}/boq`);
  const wmm = boq.find((b) => b.itemNo === '3.02')!;
  const today = new Date().toISOString().slice(0, 10);
  const sheet = await api<{ id: string }>(qs, '/measurements', {
    method: 'POST',
    body: { projectId: road.id, boqItemId: wmm.id, date: today, location: 'Ch 0+250 to 0+350 (e2e)', lines: [{ description: 'WMM base course', nos: '1', length: '100', breadth: '7', depth: '0.25' }] },
  });
  await api(pm, `/approvals/measurement/${sheet.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  await signIn(page, 'qs@demo.com');
  await page.goto('/bills');
  await page.getByRole('button', { name: 'New RA bill' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'New RA bill' });
  await modal.getByLabel('Project').click();
  await modal.getByLabel('Project').fill('RD-2026-01');
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-active').filter({ visible: true }).last().waitFor();
  await modal.getByLabel('Project').press('Enter');
  await modal.getByLabel('Other deduction', { exact: true }).fill('1500');
  await modal.getByLabel('What it is for').fill('Water charges');
  await modal.getByRole('button', { name: 'Save as draft' }).click();

  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Abstract of cost' });
  await expect(drawer.getByText('Wet Mix Macadam (WMM)')).toBeVisible();
  await expect(drawer.getByText('Water charges')).toBeVisible();
  const title = (await drawer.locator('.ant-drawer-title').innerText()).trim();
  const label = title.match(/RA bill \d+/)![0];
  await drawer.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(`${label} submitted for approval`)).toBeVisible();

  const bill = (await api<Page<Bill>>(qs, `/ra-bills?projectId=${road.id}&sortBy=billNo&sortOrder=desc`)).items[0];
  expect(bill.billLabel).toBe(label);
  await api(pm, `/approvals/bill/${bill.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  await page.goto(`/bills?id=${bill.id}`);
  const approved = page.locator('.ant-drawer').filter({ hasText: 'Abstract of cost' });
  await approved.getByRole('button', { name: 'Record sent to client' }).click();
  await page.locator('.ant-modal').filter({ hasText: 'Record sent to client' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`${label} recorded as sent`)).toBeVisible();

  await approved.getByRole('button', { name: 'Record certificate' }).click();
  const cert = page.locator('.ant-modal').filter({ hasText: 'Record certificate' });
  await cert.getByLabel('Certificate no.').fill('EE/RD/E2E');
  await cert.getByLabel('Certified quantity of 3.02').fill('150');
  await cert.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(new RegExp(`${label} certified for`))).toBeVisible();
  await expect(approved.getByText(/The client certified/)).toBeVisible();
  await expect(approved.getByText('EE/RD/E2E', { exact: false })).toBeVisible();
});

test('a site engineer has no RA bills', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await page.goto('/projects');
  await page.getByText('RD-2026-01').first().click();
  await openProjectTab(page, 'Money');
  await expect(projectTabs(page, 'Money').getByText('Expenses', { exact: true })).toBeVisible();
  await expect(projectTabs(page, 'Money').getByText('RA bills', { exact: true })).toHaveCount(0);
});
