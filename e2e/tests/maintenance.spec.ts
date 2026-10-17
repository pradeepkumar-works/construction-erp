import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, localToday, signIn } from './helpers';

interface Page<T> {
  items: T[];
  total: number;
}
type Equipment = { id: string; code: string; lastServiceDate: string | null; lastServiceMeter: string | null };
type Job = { id: string; jobNo: string; status: string; kind: string; labourCost: string; sparesValue: string; totalCost: string; spares: { entryId: string; itemName: string; quantity: string }[] };
type Doc = { id: string; equipmentCode: string; type: string; state: string; validTo: string };
type Summary = { documentsDue: Doc[]; service: { equipmentCode: string; state: string }[] };
type Note = { type: string; title: string; entityType: string | null; entityId: string | null };

const machine = async (token: string, code: string) => (await api<Page<Equipment>>(token, `/equipment?q=${code}&includeInactive=true`)).items.find((e) => e.code === code)!;
const today = localToday;

/**
 * Maintenance (v4 item 42): a site engineer reports a breakdown; the store manager hears of it, issues spares from the
 * project store against the job card and closes it with the labour cost. Older phone builds do not get the new type.
 */
test('a breakdown is reported at site, spares issued and the job card closed', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const store = await apiToken('store@demo.com');
  const pm = await apiToken('pm@demo.com');
  const what = `E2E boom cylinder leak ${Date.now()}`;

  await signIn(page, 'engineer@demo.com');
  await page.goto('/machinery?tab=maintenance');
  await page.getByRole('button', { name: /Report breakdown/ }).click();
  const form = page.locator('.ant-modal').filter({ hasText: 'Report a breakdown' });
  await chooseOption(form.getByLabel('Machine'), 'EXC-01');
  await form.getByLabel('What broke down').fill(what);
  await form.getByRole('button', { name: 'Report' }).click();
  await expect(page.getByText(/MNT-\d{4}-\d{4} reported/)).toBeVisible();

  const job = (await api<Page<Job>>(store, `/maintenance/jobs?q=${encodeURIComponent(what)}`)).items[0];
  expect(job.kind).toBe('BREAKDOWN');
  const notes = await api<{ items: Note[] }>(store, '/notifications?allTypes=true&limit=20');
  expect(notes.items.some((n) => n.type === 'MACHINERY' && n.entityType === 'MAINTENANCE_JOB' && n.entityId === job.id)).toBe(true);
  const legacy = await api<{ items: Note[] }>(store, '/notifications?limit=50');
  expect(legacy.items.every((n) => n.type !== 'MACHINERY')).toBe(true);
  await expect(api(engineer, `/maintenance/jobs/${job.id}/close`, { method: 'POST', body: { closedDate: today(), workDone: 'x' } })).rejects.toThrow(/403/);

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, 'store@demo.com');
  await page.goto(`/machinery?tab=maintenance&id=${job.id}`);
  const drawer = page.locator('.job-drawer');
  await expect(drawer.getByText(what)).toBeVisible();
  await drawer.getByRole('button', { name: 'Issue spares' }).click();
  const spares = page.locator('.ant-modal').filter({ hasText: `Issue spares for ${job.jobNo}` });
  await chooseOption(spares.getByLabel('Spare'), 'Hydraulic oil');
  await spares.getByLabel('Quantity').fill('2');
  await spares.getByRole('button', { name: 'Issue' }).click();
  await expect(page.getByText(`Spares issued against ${job.jobNo}`)).toBeVisible();
  await expect(drawer.locator('.spares-table').getByText('Hydraulic oil 68')).toBeVisible();

  await drawer.getByRole('button', { name: 'Close job' }).click();
  const close = page.locator('.ant-modal').filter({ hasText: `Close ${job.jobNo}` });
  await close.getByLabel('Work done').fill('Cylinder seal kit replaced, oil topped up.');
  await close.getByLabel('Labour', { exact: true }).fill('900');
  await close.getByRole('button', { name: 'Close job' }).click();
  await expect(page.getByText(`${job.jobNo} closed`)).toBeVisible();

  const closed = await api<Job>(store, `/maintenance/jobs/${job.id}`);
  expect(closed.status).toBe('CLOSED');
  expect(closed.spares).toHaveLength(1);
  expect(Number(closed.totalCost)).toBeCloseTo(900 + Number(closed.sparesValue), 2);

  // Clean up: the spares issue goes first, then the job card.
  await api(pm, `/stock/entries/${closed.spares[0].entryId}`, { method: 'DELETE' });
  await api(store, `/maintenance/jobs/${job.id}`, { method: 'DELETE' });
});

test('closing a service job card restarts the machine’s schedule', async ({ page }) => {
  const store = await apiToken('store@demo.com');
  const pm = await apiToken('pm@demo.com');
  const before = await machine(pm, 'MIX-01');

  await signIn(page, 'store@demo.com');
  await page.goto('/machinery?tab=maintenance');
  await page.locator('.job-table').waitFor();
  await page.getByRole('button', { name: /Raise service/ }).last().click();
  const form = page.locator('.ant-modal').filter({ hasText: 'Raise a service job card' });
  await chooseOption(form.getByLabel('Machine'), 'MIX-01');
  await form.getByLabel('Work to do').fill('E2E 500-hour service');
  await form.getByRole('button', { name: 'Raise job card' }).click();
  await expect(page.getByText(/MNT-\d{4}-\d{4} raised/)).toBeVisible();

  const job = (await api<Page<Job>>(store, '/maintenance/jobs?q=E2E%20500-hour&status=OPEN')).items[0];
  expect(job.kind).toBe('SERVICE');
  const summary = await api<Summary>(store, '/maintenance/summary');
  expect(summary.service.find((s) => s.equipmentCode === 'MIX-01')).toBeTruthy();
  await api(store, `/maintenance/jobs/${job.id}/close`, { method: 'POST', body: { closedDate: today(), workDone: 'Oil, filters, greasing', meterReading: '2100' } });
  const after = await machine(pm, 'MIX-01');
  expect(after.lastServiceDate).toBe(today());
  expect(Number(after.lastServiceMeter)).toBe(2100);

  // Put the demo machine back as it was.
  await api(pm, `/equipment/${before.id}`, { method: 'PATCH', body: { lastServiceDate: before.lastServiceDate, lastServiceMeter: before.lastServiceMeter } });
  await api(store, `/maintenance/jobs/${job.id}`, { method: 'DELETE' });
});

test('a lapsed vehicle paper is renewed and drops off the due list', async ({ page }) => {
  const store = await apiToken('store@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const tipper = await machine(store, 'TIP-07');
  const lapsed = (await api<Page<Doc>>(store, `/equipment-documents?equipmentId=${tipper.id}&type=PUC`)).items[0];
  expect(lapsed.state).toBe('EXPIRED');
  const number = `PUC-E2E-${Date.now()}`;

  await signIn(page, 'store@demo.com');
  await page.goto('/machinery?tab=papers');
  const row = page.locator('.papers-table tr').filter({ hasText: 'TIP-07' }).filter({ hasText: 'PUC (pollution)' });
  await row.getByRole('button', { name: 'Renew' }).click();
  const form = page.locator('.ant-modal').filter({ hasText: 'Add a paper' });
  await form.getByLabel('Number').fill(number);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('PUC (pollution) of TIP-07 saved')).toBeVisible();
  await expect(page.locator('.papers-table tr').filter({ hasText: number }).getByText('Valid')).toBeVisible();

  const latest = (await api<Page<Doc>>(store, `/equipment-documents?equipmentId=${tipper.id}&type=PUC`)).items;
  expect(latest).toHaveLength(1);
  expect(latest[0].state).toBe('VALID');
  const summary = await api<Summary>(store, '/maintenance/summary');
  expect(summary.documentsDue.some((d) => d.equipmentCode === 'TIP-07' && d.type === 'PUC')).toBe(false);
  await expect(api(accounts, '/equipment-documents', { method: 'POST', body: { equipmentId: tipper.id, type: 'PUC', validTo: '2030-01-01' } })).rejects.toThrow(/403/);

  await api(store, `/equipment-documents/${latest[0].id}`, { method: 'DELETE' });
});
