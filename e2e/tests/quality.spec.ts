import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, signIn } from './helpers';

type Test = { id: string; testNo: string; result: string; readings: { id: string; label: string; value: string | null }[] };
type Ncr = { id: string; ncrNo: string; status: string; qualityTestId: string | null; cause: string | null };

/**
 * Tests and NCRs (v3 item 27): site records concrete cubes and enters the 7 and 28-day results, the 28-day one fails,
 * QA/QC raises an NCR from the test, site records the cause and corrective action, and QA/QC closes it.
 */
test.describe.serial('a failed cube test through its NCR', () => {
  const title = `E2E cubes ${Date.now()}`;
  let testId = '';
  let ncrId = '';

  test('the site engineer records cubes and enters both results', async ({ page }) => {
    await signIn(page, 'engineer@demo.com');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Quality', exact: true }).click();
    await page.getByRole('tab', { name: /Tests/ }).click();
    await page.getByRole('button', { name: 'Record test' }).click();
    const form = page.locator('.ant-drawer-open').filter({ hasText: 'Record test' });
    await chooseOption(form.getByLabel('Project'), 'RD-2026-01');
    await expect(form.getByText(/Readings: 7 days on .*, 28 days on/)).toBeVisible();
    await form.getByLabel('What was sampled').fill(title);
    await form.getByLabel('Lowest that passes').fill('25');
    await form.getByRole('button', { name: 'Record test' }).click();
    await expect(page.getByText(/TST-\d{4}-\d{4} recorded/)).toBeVisible();

    await page.getByPlaceholder('Search no., sample, location').fill(title);
    await page.locator('tr').filter({ hasText: title }).getByText(title).click();
    const drawer = page.locator('.ant-drawer-open');
    await drawer.getByLabel('7 days result').fill('18.2');
    await drawer.getByRole('row', { name: /7 days/ }).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('7 days result saved')).toBeVisible();
    await drawer.getByLabel('28 days result').fill('22.5');
    await drawer.getByRole('row', { name: /28 days/ }).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/TST-\d{4}-\d{4} failed/)).toBeVisible();

    const eng = await apiToken('engineer@demo.com');
    const found = (await api<{ items: Test[] }>(eng, `/quality/tests?q=${encodeURIComponent(title)}`)).items;
    expect(found).toHaveLength(1);
    testId = found[0].id;
    expect(found[0].result).toBe('FAIL');
    expect(found[0].readings.map((r) => [r.label, r.value])).toEqual([
      ['7 days', '18.2'],
      ['28 days', '22.5'],
    ]);
  });

  test('QA/QC raises an NCR from the failed test', async ({ page }) => {
    await signIn(page, 'qaqc@demo.com');
    await page.goto(`/inspections?tab=tests&id=${testId}`);
    const drawer = page.locator('.ant-drawer-open');
    await drawer.getByRole('button', { name: 'New NCR' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'From TST-' });
    await expect(modal.getByLabel('Non-conformance')).toHaveValue(new RegExp(title));
    await modal.getByText('Major', { exact: true }).click();
    await modal.getByRole('button', { name: 'Save NCR' }).click();
    await expect(page.getByText(/NCR-\d{4}-\d{4} raised/)).toBeVisible();
    const qa = await apiToken('qaqc@demo.com');
    const ncrs = (await api<{ items: Ncr[] }>(qa, `/quality/ncrs?qualityTestId=${testId}`)).items;
    expect(ncrs).toHaveLength(1);
    expect(ncrs[0].status).toBe('OPEN');
    ncrId = ncrs[0].id;
  });

  test('site records the corrective action and QA/QC closes the NCR', async ({ page }) => {
    await signIn(page, 'engineer@demo.com');
    await page.goto(`/inspections?tab=ncrs&id=${ncrId}`);
    const drawer = page.locator('.ant-drawer-open');
    await drawer.getByLabel('Cause', { exact: true }).fill('Extra water added at the pump');
    await drawer.getByLabel('Corrective action').fill('Cores taken: 26.4 N/mm², accepted by the designer');
    await drawer.getByRole('button', { name: 'Record action' }).click();
    await expect(page.getByText(/Action recorded on NCR-/)).toBeVisible();
    await expect(drawer.getByText('Action taken', { exact: true }).first()).toBeVisible();

    const qa = await apiToken('qaqc@demo.com');
    // Closing needs QA/QC; site cannot.
    const res = await fetch(`${API_URL}/quality/ncrs/${ncrId}/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await apiToken('engineer@demo.com')}` },
      body: '{}',
    });
    expect(res.status).toBe(403);
    const closed = await api<Ncr>(qa, `/quality/ncrs/${ncrId}/close`, { method: 'POST', body: { note: 'Core results seen' } });
    expect(closed.status).toBe('CLOSED');
  });
});
