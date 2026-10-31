import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, formPanel, localToday, signIn } from './helpers';

type Plant = { id: string; code: string };
type Design = { id: string; code: string; status: string; grade: string };
type Order = { id: string; orderNo: string; status: string; delivered: string; onTheWay: string; unbilled: string; canDispatch: boolean };
type Batch = { id: string; batchNo: string; status: string; stockEntryNo: string | null; lines: { designQty: string; actualQty: string }[] };
type Invoice = { id: string; invoiceNo: string; quantity: string; taxable: string; cgst: string; sgst: string; total: string; due: string };
type Page<T> = { items: T[]; total: number };

/**
 * RMC (v6 item 104): a quote is accepted, the plant sends a truck from the day (its materials leave the store), the site
 * receives it, accounts bill the challan with GST, and a role without RMC is refused.
 */
test('a quote becomes an order, a truck goes from the day, and its challan is billed with GST', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const store = await apiToken('store@demo.com');
  const today = localToday();

  const [plant] = await api<Plant[]>(pm, '/rmc/plants');
  expect(plant?.code).toBe('RMC-01');
  const m25 = (await api<Design[]>(pm, `/rmc/mix-designs?plantId=${plant.id}`)).find((d) => d.code === 'M25-OPC-01' && d.status === 'APPROVED')!;
  const clients = await api<Page<{ id: string; name: string }>>(pm, '/clients?q=Kalinga%20Homes');
  const quote = await api<Order>(pm, '/rmc/orders', { method: 'POST', body: { plantId: plant.id, date: today, clientId: clients.items[0].id, site: `E2E pour ${Date.now()}`, mixDesignId: m25.id, quantity: 6, rate: 6000, pumpRate: 300, pourDate: today } });
  expect(quote).toMatchObject({ status: 'QUOTED', canDispatch: false });

  // Sales mark the quote accepted.
  await signIn(page, 'pm@demo.com');
  await page.goto('/rmc?tab=orders');
  await expect(page.getByRole('heading', { level: 1, name: 'RMC plant' })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Which orders' }).getByText('Quotes', { exact: true }).click();
  await page.getByRole('row', { name: new RegExp(quote.orderNo) }).click();
  await page.getByRole('button', { name: 'Customer accepted' }).click();
  await expect(page.getByText(`${quote.orderNo} is now an order`)).toBeVisible();

  // The plant sends a truck from the day.
  await page.goto('/rmc?tab=day');
  await page.getByRole('row', { name: new RegExp(quote.orderNo) }).getByRole('button', { name: 'New challan' }).click();
  const send = formPanel(page, `New challan · ${quote.orderNo}`);
  await send.getByLabel('Truck', { exact: true }).fill('od02e2e9999');
  await send.getByRole('button', { name: 'Save challan' }).click();
  await expect(page.getByText(/^DC-\d{4}-\d{4} on its way: 6 m³ to Kalinga Homes LLP$/)).toBeVisible();

  const [truck] = (await api<Page<Batch>>(store, `/rmc/batches?orderId=${quote.id}`)).items;
  expect(truck.status).toBe('DISPATCHED');
  expect(truck.stockEntryNo).toMatch(/^ISS-/);
  expect(truck.lines.every((l) => l.actualQty === l.designQty)).toBe(true);
  // No more than the order and its allowance goes.
  const over = await fetch(`${API_URL}/rmc/batches`, { method: 'POST', headers: { authorization: `Bearer ${store}`, 'content-type': 'application/json' }, body: JSON.stringify({ orderId: quote.id, quantity: 6 }) });
  expect(over.status).toBe(400);
  await api(store, `/rmc/batches/${truck.id}/deliver`, { method: 'POST', body: { receivedBy: 'E2E site engineer' } });

  // Accounts bill the challan.
  await page.context().clearCookies();
  await signIn(page, 'accounts@demo.com');
  await page.goto('/rmc?tab=bills');
  await page.getByRole('button', { name: 'Bill challans' }).click();
  const bill = formPanel(page, 'Bill delivered challans');
  await chooseOption(bill.getByRole('combobox', { name: 'Order' }), quote.orderNo);
  await expect(bill.getByText(truck.batchNo)).toBeVisible();
  await bill.getByRole('button', { name: 'Make the bill' }).click();
  await expect(page.getByText(/^RINV-\d{4}-\d{4} made for ₹/)).toBeVisible();

  const [made] = (await api<Page<Invoice>>(accounts, `/rmc/invoices?q=${quote.orderNo}`)).items;
  expect(made).toMatchObject({ quantity: '6', taxable: '37800.00', cgst: '3402.00', sgst: '3402.00', total: '44604.00', due: '44604.00' });
  const pmBills = await fetch(`${API_URL}/rmc/invoices`, { method: 'POST', headers: { authorization: `Bearer ${pm}`, 'content-type': 'application/json' }, body: JSON.stringify({ orderId: quote.id, date: today }) });
  expect(pmBills.status).toBe(403);
  const qs = await apiToken('qs@demo.com');
  expect((await fetch(`${API_URL}/rmc/day`, { headers: { authorization: `Bearer ${qs}` } })).status).toBe(403);

  // Leave the plant's books as they were: the bill cancelled and the order completed.
  await api(accounts, `/rmc/invoices/${made.id}/cancel`, { method: 'POST', body: { note: 'Test bill' } });
  await api(pm, `/rmc/orders/${quote.id}/close`, { method: 'POST' });
});
