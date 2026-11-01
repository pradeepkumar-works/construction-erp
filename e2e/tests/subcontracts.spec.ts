import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, signIn, formPanel } from './helpers';

interface Page<T> {
  items: T[];
}
type Wo = { id: string; woNo: string; status: string; value: string; tdsPct: string; lines: { id: string; boqItemId: string | null }[] };
type SubBill = {
  id: string;
  label: string;
  status: string;
  grossAmount: string;
  gstAmount: string;
  materialRecovery: string;
  totalDeductions: string;
  netPayable: string;
  deductions: { key: string; amount: string }[];
  lines: { boqItemId: string | null; thisQty: string; amount: string }[];
};

const n = (v: string) => Number(v);

/**
 * Subcontractor work orders: the project manager gives a BOQ item to a subcontractor on a work order,
 * management approves it, the engineer measures their work under it, the store issues material to them, and the
 * quantity surveyor prepares their bill from the work order: work as measured, less retention, TDS and the material.
 */
test('work order to a measured subcontractor bill', async ({ page, browser }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const md = await apiToken('md@demo.com');
  const qs = await apiToken('qs@demo.com');
  const store = await apiToken('store@demo.com');
  const projects = await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100');
  const road = projects.items.find((p) => p.code === 'RD-2026-01')!;
  const boq = await api<{ id: string; itemNo: string }[]>(qs, `/projects/${road.id}/boq`);
  const gsb = boq.find((b) => b.itemNo === '3.01')!;
  const today = new Date().toISOString().slice(0, 10);
  const stamp = String(Date.now());
  const title = `GSB, culvert approaches (e2e ${stamp})`;

  // The project manager issues the work order in the form.
  await signIn(page, 'pm@demo.com');
  await page.goto('/work-orders');
  await page.getByRole('button', { name: 'New work order' }).click();
  const modal = formPanel(page, 'New work order');
  await chooseOption(modal.getByLabel('Project'), 'RD-2026-01');
  await chooseOption(modal.getByLabel('Subcontractor'), 'Sri Jagannath');
  await expect(modal.getByText('PAN AKPPM3321H')).toBeVisible();
  await modal.getByLabel('Work', { exact: true }).fill(title);
  await chooseOption(modal.getByLabel('BOQ item of line 1'), '3.01');
  await modal.getByLabel('Quantity of line 1').fill('100');
  await modal.getByLabel('Rate of line 1').fill('1300');
  await expect(modal.getByText(/margin/)).toBeVisible();
  await modal.getByRole('button', { name: 'Save and submit' }).click();
  await expect(page.getByText(/WO-\d{4}-\d{4} submitted for approval/)).toBeVisible();

  const wo = (await api<Page<Wo>>(pm, `/work-orders?projectId=${road.id}&q=${stamp}`)).items[0];
  expect(wo.status).toBe('SUBMITTED');
  expect(wo.value).toBe('130000.00');
  // An individual's PAN (fourth letter P) takes TDS at 1% under section 194C.
  expect(wo.tdsPct).toBe('1');
  await api(md, `/approvals/work_order/${wo.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  // Their work, measured under the work order, and material issued to them.
  const sheet = await api<{ id: string; woNo: string }>(engineer, '/measurements', {
    method: 'POST',
    body: { projectId: road.id, boqItemId: gsb.id, workOrderId: wo.id, date: today, location: 'Culvert approach Km 11 (e2e)', lines: [{ description: 'GSB', nos: '1', length: '40', breadth: '7', depth: '0.2' }], submit: true },
  });
  expect(sheet.woNo).toBe(wo.woNo);
  await api(pm, `/approvals/measurement/${sheet.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const stock = await api<Page<{ itemId: string; balance: string }>>(store, `/stock/balances?projectId=${road.id}&inStock=true&pageSize=100`);
  const item = stock.items.find((s) => n(s.balance) >= 2)!;
  const issue = await api<{ issuedTo: string }>(store, '/stock/issues', { method: 'POST', body: { projectId: road.id, date: today, workOrderId: wo.id, lines: [{ itemId: item.itemId, quantity: '2' }] } });
  expect(issue.issuedTo).toBe('Sri Jagannath Constructions');

  // The quantity surveyor prepares their bill from the work order, in a session of their own.
  const qsContext = await browser.newContext();
  page = await qsContext.newPage();
  await signIn(page, 'qs@demo.com');
  await page.goto(`/work-orders?id=${wo.id}`);
  const drawer = page.locator('.ant-drawer').filter({ hasText: wo.woNo });
  await drawer.getByRole('button', { name: 'New subcontractor bill' }).click();
  const billModal = formPanel(page, `New bill on ${wo.woNo}`);
  await expect(billModal.getByText('BOQ items are billed as measured')).toBeVisible();
  await billModal.getByLabel('Their invoice no.').fill('SJC/E2E/1');
  await billModal.getByRole('button', { name: 'Save and submit' }).click();
  await expect(page.getByText(`${wo.woNo} bill 1 submitted for approval`, { exact: false })).toBeVisible();

  const bill = (await api<Page<SubBill>>(qs, `/subcontract-bills?workOrderId=${wo.id}`)).items[0];
  expect(bill.status).toBe('SUBMITTED');
  // 40 x 7 x 0.2 = 56 cum at 1,300 = 72,800
  expect(n(bill.lines[0].thisQty)).toBe(56);
  expect(bill.grossAmount).toBe('72800.00');
  const ded = Object.fromEntries(bill.deductions.map((d) => [d.key, n(d.amount)]));
  expect(ded.retention).toBe(3640);
  expect(ded.tds).toBe(728);
  expect(ded.material).toBeGreaterThan(0);
  expect(n(bill.netPayable)).toBeCloseTo(n(bill.grossAmount) + n(bill.gstAmount) - n(bill.totalDeductions), 2);

  // A second bill waits until this one is decided.
  await expect(api(qs, '/subcontract-bills', { method: 'POST', body: { workOrderId: wo.id, billDate: today } })).rejects.toThrow(/not approved yet/);
  await api(pm, `/approvals/subcontract_bill/${bill.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  await page.goto(`/subcontract-bills?id=${bill.id}`);
  const billDrawer = page.locator('.ant-drawer').filter({ hasText: bill.label });
  await expect(billDrawer.getByText('Net payable').first()).toBeVisible();
  await expect(billDrawer.getByText('Material issued to them')).toBeVisible();
  await expect(billDrawer.getByRole('button', { name: 'Print' })).toBeVisible();

  // The bill has a page of its own too.
  await page.goto(`/subcontract-bills/${bill.id}`);
  await expect(page.getByRole('heading', { name: new RegExp(`^${bill.label} · `) })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Stage' })).toContainText('Approved');
});
