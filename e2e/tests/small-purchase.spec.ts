import { expect, test } from '@playwright/test';
import { api, apiToken, axeViolations, chooseOption, formPanel, localToday, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Mr = { id: string; requestNo: string; items: { id: string; coveredQty: string; toOrderQty: string }[] };
type Stock = { canIssue: boolean; lines: { here: string; toOrderQty: string; others: { projectName: string; balance: string; canSend: boolean }[] }[] };
type Entry = { id: string; entryNo: string; type: string };
type Enquiry = { id: string; vendors: { vendorName: string; state: string; link?: string | null }[] };

/**
 * Stock first (v5 item 95): a request for an item the road site holds 20 of and the water site 50. The store issues
 * the 20 here from the request page, transfers the 50 from the water site, and only the rest is left to order;
 * deleting the issue gives its quantity back to the request.
 */
test('a request is met from stock here and at another site before buying', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const store = await apiToken('store@demo.com');
  const admin = await apiToken('admin@demo.com');
  const projects = (await api<Page<{ id: string; code: string; name: string }>>(store, '/projects?pageSize=100')).items;
  const road = projects.find((p) => p.code === 'RD-2026-01')!;
  const water = projects.find((p) => p.code === 'WS-2026-03')!;
  const itemName = `Cover blocks 40 mm (e2e ${Date.now()})`;
  for (const [p, qty] of [[road, '20'], [water, '50']] as const)
    await api(admin, '/stock/adjustments', { method: 'POST', body: { projectId: p.id, date: localToday(), remarks: 'Opening stock (e2e)', reason: 'OPENING', lines: [{ itemName, unit: 'Nos', quantity: qty }] } });

  const mr = await api<Mr>(engineer, '/material-requests', { method: 'POST', body: { projectId: road.id, requiredDate: localToday(), items: [{ itemName, unit: 'Nos', quantity: '100' }], submit: true } });
  await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const stock = await api<Stock>(store, `/material-requests/${mr.id}/stock`);
  expect(stock.canIssue).toBe(true);
  expect(stock.lines[0]).toMatchObject({ here: '20', toOrderQty: '100' });
  expect(stock.lines[0].others).toEqual([expect.objectContaining({ projectName: water.name, balance: '50', canSend: true })]);

  // The store issues what this site holds from the request's page.
  await signIn(page, 'store@demo.com');
  await page.goto(`/material-requests/${mr.id}`);
  await expect(page.getByRole('cell', { name: /20 here/ })).toBeVisible();
  await page.getByRole('button', { name: '50 at 1 other site' }).click();
  await expect(page.locator('.ant-popover').getByText(`${water.name}: 50 Nos`)).toBeVisible();
  await page.getByRole('toolbar', { name: 'Record actions' }).getByRole('button', { name: 'Take from stock' }).click();
  const modal = formPanel(page, `Take from stock for ${mr.requestNo}`);
  await expect(modal.getByLabel(`Quantity of ${itemName}`)).toHaveValue('20');
  await modal.getByRole('button', { name: 'Issue from stock' }).click();
  await expect(page.locator('.ant-message').getByText(/ISS-\d{4}-\d{4} saved: issued to/)).toBeVisible();
  let after = await api<Mr>(engineer, `/material-requests/${mr.id}`);
  expect(after.items[0]).toMatchObject({ coveredQty: '20', toOrderQty: '80' });

  // The water site sends its 50; the rest is what purchasing orders.
  const transfer = await api<Entry>(store, `/material-requests/${mr.id}/cover`, { method: 'POST', body: { fromProjectId: water.id, date: localToday(), lines: [{ materialRequestItemId: mr.items[0].id, quantity: '50' }] } });
  expect(transfer.type).toBe('TRANSFER_OUT');
  after = await api<Mr>(engineer, `/material-requests/${mr.id}`);
  expect(after.items[0]).toMatchObject({ coveredQty: '70', toOrderQty: '30' });
  await expect(api(store, `/material-requests/${mr.id}/cover`, { method: 'POST', body: { fromProjectId: road.id, date: localToday(), lines: [{ materialRequestItemId: mr.items[0].id, quantity: '1' }] } })).rejects.toThrow(/out of stock/);
  await expect(
    api(store, '/purchase-orders', { method: 'POST', body: { projectId: road.id, vendorId: (await api<Page<{ id: string }>>(admin, '/vendors?pageSize=1')).items[0].id, materialRequestId: mr.id, lines: [{ materialRequestItemId: mr.items[0].id, quantity: '31', rate: '12' }] } }),
  ).rejects.toThrow();

  // Deleting the issue gives its 20 back to the request.
  const issue = (await api<Page<Entry>>(admin, `/stock/entries?materialRequestId=${mr.id}&allTypes=true`)).items.find((e) => e.type === 'ISSUE')!;
  await api(admin, `/stock/entries/${issue.id}`, { method: 'DELETE' });
  after = await api<Mr>(engineer, `/material-requests/${mr.id}`);
  expect(after.items[0]).toMatchObject({ coveredQty: '50', toOrderQty: '50' });
});

/**
 * Last orders and emailed enquiries (v5 item 95): the comparative shows an item's last approved order; procurement
 * sends an enquiry, the supplier opens the link signed out and quotes, and the quote lands on the comparative marked
 * from the supplier. The link then only says it was received.
 */
test('a supplier quotes through the enquiry link and it lands on the comparative', async ({ page, browser }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const procurement = await apiToken('procurement@demo.com');
  const projects = (await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100')).items;
  const road = projects.find((p) => p.code === 'RD-2026-01')!;
  // An item that was ordered before, so its last rate shows.
  const orders = (await api<Page<{ status: string; lines: { itemName: string; unit: string; rate: string }[] }>>(procurement, '/purchase-orders?pageSize=50')).items.filter((o) => o.status === 'APPROVED');
  const known = orders[0].lines[0];
  const last = await api<Record<string, { rate: string }[]>>(procurement, `/purchase-orders/last-rates?item=${encodeURIComponent(`${known.itemName}|${known.unit}`)}`);
  const lastFor = last[`${known.itemName.toLowerCase()}|${known.unit.toLowerCase()}`];
  expect(lastFor.length).toBeGreaterThan(0);
  expect(lastFor.length).toBeLessThanOrEqual(5);

  const name = `Curing compound (e2e ${Date.now()})`;
  const mr = await api<Mr>(engineer, '/material-requests', {
    method: 'POST',
    body: { projectId: road.id, requiredDate: localToday(), items: [{ itemName: name, unit: 'Ltr', quantity: '200' }, { itemName: known.itemName, unit: known.unit, quantity: '10' }], submit: true },
  });
  await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  await signIn(page, 'procurement@demo.com');
  await page.goto(`/material-requests/${mr.id}`);
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  const modal = formPanel(page, `Send enquiry for ${mr.requestNo}`);
  await chooseOption(modal.getByLabel('Suppliers', { exact: true }), 'Sahoo');
  await page.keyboard.press('Escape');
  await modal.getByRole('button', { name: 'Send enquiry' }).click();
  const sent = page.locator('.ant-modal').filter({ hasText: 'Enquiry sent' });
  const linkBox = sent.getByLabel(/Quote link for /);
  await expect(linkBox).toBeVisible();
  const link = await linkBox.inputValue();
  expect(link).toMatch(/\/quote\/[A-Za-z0-9_-]{40,}$/);
  await sent.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('cell', { name: /^(Not emailed|Emailed)/ })).toBeVisible();

  // The supplier, signed out, quotes one of the two items.
  const supplier = await browser.newContext();
  const sp = await supplier.newPage();
  await sp.goto(new URL(link).pathname);
  await expect(sp.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(sp.getByText(mr.requestNo)).toBeVisible();
  expect(await axeViolations(sp)).toEqual([]);
  await sp.getByLabel('Rate per Ltr, before GST').fill('142.5');
  await sp.getByLabel('Delivery in (days)').fill('4');
  await sp.getByRole('button', { name: 'Send quote' }).click();
  await expect(sp.getByText('Your quote was received')).toBeVisible();
  await sp.reload();
  await expect(sp.getByText('Your quote was received')).toBeVisible();
  await supplier.close();

  // It is on the comparative, from the supplier, and the enquiry shows Quoted.
  const enquiries = await api<Enquiry[]>(procurement, `/material-requests/${mr.id}/enquiries`);
  expect(enquiries[0].vendors[0].state).toBe('QUOTED');
  const comparative = await api<{ quotations: { vendorName: string; fromSupplier: boolean; deliveryDays: number; lines: { rate: string }[] }[] }>(procurement, `/material-requests/${mr.id}/comparative`);
  expect(comparative.quotations).toEqual([expect.objectContaining({ fromSupplier: true, deliveryDays: 4, lines: [expect.objectContaining({ rate: '142.50' })] })]);
  await page.reload();
  await expect(page.getByText('From supplier').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Last order ₹/ }).first()).toBeVisible();
});
