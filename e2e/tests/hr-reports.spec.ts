import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Report = { title: string; figures: { id: string; value: unknown }[]; sections: { key: string; title: string; rows: Record<string, unknown>[]; total?: Record<string, unknown> }[] };

test('HR reads the HR and payroll reports from its menu, and a site manager cannot', async ({ page, browser }) => {
  const hr = await apiToken('hr@demo.com');
  // Head count balances: the start, plus who joined, less who left, is the end.
  const head = await api<Report>(hr, '/management/reports/headcount');
  const total = head.sections.find((s) => s.key === 'places')!.total!;
  expect(Number(total.atStart) + Number(total.joined) - Number(total.left)).toBe(Number(total.atEnd));
  // Staff cost is gross pay plus the company's PF and ESI.
  const cost = await api<Report>(hr, '/management/reports/staff-cost');
  const fig = (r: Report, id: string) => Number(r.figures.find((f) => f.id === id)!.value);
  expect(fig(cost, 'staffCost')).toBeGreaterThan(fig(cost, 'grossPay'));
  await expect(api(await apiToken('pm@demo.com'), '/management/reports/pf-esi')).rejects.toThrow(/403/);

  await signIn(page, 'hr@demo.com');
  await page.goto('/management/reports/pf-esi?month=2026-09');
  await expect(page.getByRole('heading', { level: 1, name: 'PF and ESI' })).toBeVisible();
  await expect(page.getByText('Provident fund', { exact: true })).toBeVisible();
  await expect(page.getByText(/To deposit by 15 Oct 2026/).first()).toBeVisible();
  await page.goto('/management/reports/leave-register');
  await expect(page.getByRole('heading', { level: 1, name: 'Leave register' })).toBeVisible();
  await expect(page.getByText(/^Balances for \d{4}$/)).toBeVisible();
  await page.goto('/management/reports/headcount');
  await expect(page.getByText('By department', { exact: true })).toBeVisible();

  const pmPage = await (await browser.newContext()).newPage();
  await signIn(pmPage, 'pm@demo.com');
  await pmPage.goto('/management/reports/staff-cost');
  await expect(pmPage.getByText('HR and payroll reports are for HR, accounts and management')).toBeVisible();
});
