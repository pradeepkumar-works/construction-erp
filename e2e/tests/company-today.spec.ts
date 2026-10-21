import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, localToday } from './helpers';

interface Page<T> {
  items: T[];
}
type Today = {
  date: string;
  payments?: { today: string; countToday: number; rows: { reference: string | null; amount: string }[] };
  receipts?: unknown;
  receivables?: { outstanding: string; overdue: string; rows: { daysOverdue: number }[] };
  payables?: { outstanding: string; overdue: string; overdueCount: number; rows: { daysOverdue: number }[] };
  attendance?: { sites: number; sitesReported: number; rows: { projectId: string; reported: boolean }[] };
  fuel?: { items: { itemName: string }[] };
  purchase?: { ordersOpen: number; ordersLate: number };
  approvals?: { total: number; modules: { count: number }[] };
  waitingWithOthers?: { count: number };
};

/**
 * Management view on the phone (v5 item 96): `GET /dashboard/company-today` gives owners, directors, accounts and
 * project managers the company's day, each part only where the role sees its module and only for its projects; a
 * payment made today counts at once. Site roles are refused (their Home stays as it was).
 */
test('the company view shows each role its own parts of the day', async () => {
  const admin = await apiToken('admin@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const pm = await apiToken('pm@demo.com');
  const engineer = await apiToken('engineer@demo.com');

  const all = await api<Today>(admin, '/dashboard/company-today');
  expect(all.date).toBe(localToday());
  for (const k of ['payments', 'receipts', 'receivables', 'payables', 'attendance', 'fuel', 'purchase', 'approvals', 'waitingWithOthers'] as const) expect(all[k], k).toBeDefined();
  expect(all.approvals!.modules.reduce((n, m) => n + m.count, 0)).toBe(all.approvals!.total);
  expect(all.fuel!.items.map((i) => i.itemName)).toContain('Diesel');
  // The seed's road bill is overdue to the supplier; overdue rows come first.
  expect(Number(all.payables!.overdue)).toBeGreaterThan(0);
  expect(all.payables!.rows[0].daysOverdue).toBeGreaterThan(0);

  // Accounts does not see machinery, so no fuel; everything else is there.
  const acc = await api<Today>(accounts, '/dashboard/company-today');
  expect(acc.fuel).toBeUndefined();
  expect(acc.payables && acc.receivables && acc.attendance && acc.purchase).toBeTruthy();

  // A project manager sees only their sites.
  const mine = (await api<Page<{ id: string }>>(pm, '/projects?pageSize=100')).items.map((p) => p.id);
  const pmToday = await api<Today>(pm, '/dashboard/company-today');
  expect(pmToday.attendance!.rows.every((r) => mine.includes(r.projectId))).toBe(true);
  expect(pmToday.attendance!.sites).toBeLessThan(all.attendance!.sites);

  // Site roles are refused.
  const refused = await fetch(`${API_URL}/dashboard/company-today`, { headers: { authorization: `Bearer ${engineer}` } });
  expect(refused.status).toBe(403);

  // A payment made today shows at once.
  const bill = (await api<{ openBills: { billType: string; billId: string; outstanding: string }[] }>(accounts, '/payables')).openBills.find((b) => b.billType === 'VENDOR_BILL' && Number(b.outstanding) > 10)!;
  const before = (await api<Today>(accounts, '/dashboard/company-today')).payments!;
  const reference = `E2E-CT-${Date.now()}`;
  const paid = await api<{ id: string }>(accounts, '/vendor-payments', { method: 'POST', body: { vendorBillId: bill.billId, paymentDate: localToday(), amount: '7', mode: 'BANK', reference } });
  try {
    const after = (await api<Today>(accounts, '/dashboard/company-today')).payments!;
    expect(after.countToday).toBeGreaterThanOrEqual(before.countToday + 1);
    expect(Number(after.today) - Number(before.today)).toBeGreaterThanOrEqual(7);
    if (after.countToday <= 10) expect(after.rows.some((r) => r.amount === '7.00')).toBe(true);
  } finally {
    await api(accounts, `/vendor-payments/${paid.id}`, { method: 'DELETE' });
  }
});
