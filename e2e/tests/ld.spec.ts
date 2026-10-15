import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Project = { id: string; code: string };
type Contract = { endDate: string | null; ldRatePct: string; ldPeriod: string; ldCapPct: string; extensionDays: number; revisedContractValue: string | null; ld: Ld | null };
type Ld = { revisedEndDate: string; daysLate: number; ldToDate: string; ldCap: string; capReached: boolean; contractValue: string };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Liquidated damages (v4 item 50): the contract's LD rate, period and cap, and what late completion costs, on the
 * project's Contract tab and across projects on Delays & Risks.
 */
test('LD terms on the contract give the exposure for a late project', async ({ page }) => {
  const pm = await apiToken('pm2@demo.com');
  const building = (await api<Page<Project>>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'BL-2026-02')!;
  const before = await api<Contract>(pm, `/projects/${building.id}/contract`);
  const restore = { endDate: before.endDate, ldRatePct: before.ldRatePct, ldPeriod: before.ldPeriod, ldCapPct: before.ldCapPct };
  try {
    await signIn(page, 'pm2@demo.com');
    await page.goto(`/projects/${building.id}?tab=contract`);
    await page.getByRole('button', { name: 'Edit contract' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'Contract: BL-2026-02' });
    await modal.getByLabel('LD rate (% of contract value)').fill('0.1');
    // A click while the dropdown is still opening can be lost, so pick again until the field shows the choice.
    const period = modal.locator('.ant-form-item').filter({ has: page.getByText('For each', { exact: true }) });
    await expect(async () => {
      await modal.getByLabel('For each').click();
      await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByText('day', { exact: true }).click();
      await expect(period.getByTitle('day', { exact: true })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await modal.getByLabel('LD cap (% of contract value)').fill('5');
    await modal.getByRole('button', { name: 'Save contract' }).click();
    await expect(page.getByText('Contract terms saved')).toBeVisible();
    await expect(page.locator('.ld-exposure')).toContainText('0.1% per day, capped at 5%');

    // Ten days past the completion date after extensions: 0.1% a day for 10 days is 1% of the contract value.
    const end = addDays(localToday(), -10 - before.extensionDays);
    const c = await api<Contract>(pm, `/projects/${building.id}/contract`, { method: 'PUT', body: { endDate: end } });
    expect(c.ld!.daysLate).toBe(10);
    expect(Number(c.ld!.ldToDate)).toBeCloseTo(Number(c.ld!.contractValue) / 100, 1);
    expect(Number(c.ld!.ldCap)).toBeCloseTo(Number(c.ld!.contractValue) * 0.05, 1);

    await page.goto('/risks?tab=ld');
    const row = page.locator('.ld-exposure-table .ant-table-row').filter({ hasText: 'BL-2026-02' });
    await expect(row).toContainText('10');

    // Not for roles that cannot see contract terms.
    const engineer = await apiToken('engineer@demo.com');
    await expect(api(engineer, '/ld-exposure')).rejects.toThrow(/403/);
  } finally {
    await api(pm, `/projects/${building.id}/contract`, { method: 'PUT', body: restore });
  }
});
