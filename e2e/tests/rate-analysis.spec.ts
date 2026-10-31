import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, formPanel, localToday, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Project = { id: string; code: string };
type EstimateLine = { kind: 'MATERIAL' | 'LABOUR' | 'EQUIPMENT'; id: string; name: string };
type EstimateItem = { boqItemId: string; itemNo: string; description: string; lines: EstimateLine[]; builtUpRate: string | null };
type Estimate = { items: EstimateItem[] };
type SubconItem = { itemId: string; itemName: string; toRecoverQty: string; rate: string | null };
type Subcon = { workOrderId: string; woNo: string; title: string; vendorName: string; items: SubconItem[]; recoveries: { id: string; itemName: string; amount: string; billId: string | null }[] };
type SubconReport = { workOrders: Subcon[] };
type Wastage = { rows: { reason: string | null; itemName: string; lostQty: string }[] };
type Balance = { itemId: string; itemName: string; balance: string };

const building = async (token: string) => (await api<Page<Project>>(token, '/projects?pageSize=100')).items.find((p) => p.code === 'BL-2026-02')!;

/**
 * Rate analysis: the QS fills a BOQ item's rate analysis from the starter library in its drawer, and the
 * project manager sees the item's built-up rate in the Estimate view.
 */
test('fill a BOQ item from the rate library and see its built-up rate', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const pm = await apiToken('pm2@demo.com');
  const project = await building(qs);
  const estimate = () => api<Estimate>(pm, `/reconciliation/projects/${project.id}/estimate`);
  const plaster = (await estimate()).items.find((i) => /plaster/i.test(i.description))!;
  // Start clean, whatever an earlier run left.
  for (const l of plaster.lines)
    await api(qs, l.kind === 'MATERIAL' ? `/reconciliation/projects/${project.id}/norms/${l.id}` : `/reconciliation/projects/${project.id}/resources/${l.id}`, { method: 'DELETE' });

  await signIn(page, 'qs@demo.com');
  await page.goto(`/projects/${project.id}?tab=boq`);
  await page.getByRole('button', { name: `Rate analysis of BOQ item ${plaster.itemNo}` }).click();
  const drawer = page.locator('.ant-drawer-content-wrapper').filter({ hasText: `Rate analysis · ${plaster.itemNo}` });
  await expect(drawer.getByText('No labour or machine hours yet')).toBeVisible();
  await drawer.getByRole('button', { name: /Fill from/ }).click();
  await page.getByRole('menuitem', { name: /^Suggested: / }).click();
  // Lines the library cannot match to a store item (no sand in this company's items) are listed in a notice.
  await expect(drawer.getByRole('cell', { name: /^Mason/ }).first()).toBeVisible();
  const notice = page.locator('.ant-modal-confirm').filter({ hasText: /from the library: \d+ added/ });
  if (await notice.isVisible()) await notice.getByRole('button', { name: 'OK' }).click();

  // The QS sees quantities only; the project manager sees the price it builds up to.
  await expect(drawer.getByText('Built-up rate')).toHaveCount(0);
  const priced = (await estimate()).items.find((i) => i.boqItemId === plaster.boqItemId)!;
  expect(priced.lines.length).toBeGreaterThan(1);
  expect(Number(priced.builtUpRate)).toBeGreaterThan(0);

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, 'pm2@demo.com');
  await page.goto(`/projects/${project.id}?tab=reconciliation&sub=estimate`);
  await expect(page.getByRole('button', { name: `Rate analysis of BOQ item ${plaster.itemNo}` })).toBeVisible();
  await page.getByRole('button', { name: `Rate analysis of BOQ item ${plaster.itemNo}` }).click();
  await expect(page.locator('.ant-drawer-content-wrapper').getByText(`Built-up rate per`)).toBeVisible();

  const engineer = await apiToken('engineer2@demo.com');
  await expect(api(engineer, `/reconciliation/projects/${project.id}/resources`, { method: 'PUT', body: { boqItemId: plaster.boqItemId, kind: 'LABOUR', name: 'Mason', qtyPerUnit: '1' } })).rejects.toThrow(/403/);
});

/**
 * A subcontractor's material: bricks issued to the brickwork order beyond what its measured work allows
 * are raised for recovery, and the next bill takes them off as their own deduction.
 */
test('recover bricks a subcontractor used over the norm on their next bill', async ({ page }) => {
  const pm = await apiToken('pm2@demo.com');
  const project = await building(pm);
  const report = () => api<SubconReport>(pm, `/reconciliation/projects/${project.id}/subcontractors`);
  const wo = (await report()).workOrders.find((w) => w.title === 'Brick masonry, ground floor')!;
  for (const r of wo.recoveries.filter((r) => !r.billId)) await api(pm, `/reconciliation/projects/${project.id}/recoveries/${r.id}`, { method: 'DELETE' });
  const bricks = (await report()).workOrders.find((w) => w.workOrderId === wo.workOrderId)!.items.find((i) => /bricks/i.test(i.itemName))!;
  expect(Number(bricks.toRecoverQty)).toBeGreaterThan(100);

  await signIn(page, 'pm2@demo.com');
  await page.goto(`/projects/${project.id}?tab=reconciliation&sub=subcontractors`);
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(wo.woNo) }) });
  await section.getByRole('row').filter({ hasText: bricks.itemName }).getByRole('button', { name: 'Recover on next bill' }).click();
  const form = formPanel(page, `Recover ${bricks.itemName} from ${wo.vendorName}`);
  await form.getByLabel('Quantity').fill('100');
  await form.getByRole('button', { name: 'Save recovery' }).click();
  await expect(page.getByText(new RegExp(`will come off ${wo.vendorName}'s next bill|added to`))).toBeVisible();
  await expect(section.getByText('Raised for recovery')).toBeVisible();

  const raised = (await report()).workOrders.find((w) => w.workOrderId === wo.workOrderId)!.recoveries.find((r) => !r.billId)!;
  expect(Number(raised.amount)).toBeCloseTo(100 * Number(bricks.rate), 2);

  // The next bill carries it as "Material used over the norm"; deleting the draft frees it again.
  const bill = await api<{ id: string; excessRecovery: string; deductions: { key: string; amount: string }[] }>(pm, '/subcontract-bills', { method: 'POST', body: { workOrderId: wo.workOrderId, billDate: localToday() } });
  expect(Number(bill.excessRecovery)).toBeCloseTo(Number(raised.amount), 2);
  await api(pm, `/subcontract-bills/${bill.id}`, { method: 'DELETE' });
  await api(pm, `/reconciliation/projects/${project.id}/recoveries/${raised.id}`, { method: 'DELETE' });
});

/** Wastage: a stock adjustment asks for its reason, and the Wastage view totals it by reason and item. */
test('a stock adjustment for damage shows in the wastage report', async ({ page }) => {
  const pm = await apiToken('pm2@demo.com');
  const project = await building(pm);
  const cement = (await api<Page<Balance>>(pm, `/stock/balances?projectId=${project.id}&pageSize=200`)).items.find((b) => /cement/i.test(b.itemName) && Number(b.balance) > 5)!;
  const damaged = async () =>
    (await api<Wastage>(pm, `/reconciliation/projects/${project.id}/wastage`)).rows.filter((r) => r.reason === 'DAMAGE' && r.itemName === cement.itemName).reduce((s, r) => s + Number(r.lostQty), 0);
  const before = await damaged();

  await signIn(page, 'pm2@demo.com');
  await page.goto(`/projects/${project.id}?tab=stock`);
  await page.getByRole('button', { name: 'Adjust stock' }).click();
  const form = formPanel(page, 'Adjust stock');
  await chooseOption(form.getByLabel('Reason'), 'Damaged');
  await form.getByLabel('Details').fill('Two bags set hard after the rain got into the store');
  await chooseOption(form.getByLabel('Item of line 1'), cement.itemName);
  await form.getByLabel('Quantity of line 1').fill('-2');
  await form.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(page.getByText(/ADJ-.+ saved/)).toBeVisible();
  expect(await damaged()).toBeCloseTo(before + 2, 3);

  await page.goto(`/projects/${project.id}?tab=reconciliation&sub=wastage`);
  await page.getByText('All time', { exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Damaged' }).filter({ hasText: cement.itemName })).toBeVisible();

  // Put the stock back as it was.
  await api(pm, '/stock/adjustments', { method: 'POST', body: { projectId: project.id, date: localToday(), reason: 'OTHER', remarks: 'E2E: put back', lines: [{ itemId: cement.itemId, quantity: '2' }] } });
});
