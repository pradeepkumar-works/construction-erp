import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Standard = { code: string; number: string; edition: string; changed: boolean; checkedOn: string | null; active: boolean };
type Count = { passed: number; failed: number; waiting: number; passRate: number | null };
type Compliance = Count & { totals: Count; byDiscipline: (Count & { discipline: string })[]; byStandard: (Count & { code: string })[] };

/**
 * Indian Standards: QA/QC filters the library to electrical, opens IS 732, and Record test on its clause opens the test
 * form with insulation resistance chosen; marking an edition checked keeps a copy that goes back as shipped; a standard
 * of the company's own is refused a number that is not its code; compliance counts the pump house's failed insulation
 * test under electrical.
 */
test('the IS library shows a clause’s test, checks an edition and counts compliance by discipline', async ({ page }) => {
  const qa = await apiToken('qaqc@demo.com');

  const checked = await api<Standard>(qa, '/is-standards/IS_732/checked', { method: 'POST' });
  expect(checked).toMatchObject({ edition: 'CURRENT', changed: true });
  await api(qa, '/is-standards/IS_732', { method: 'DELETE' });
  const back = await api<Standard>(qa, '/is-standards/IS_732');
  expect(back).toMatchObject({ edition: 'NEVER', changed: false, checkedOn: null });

  await expect(api(qa, '/is-standards/IS_1', { method: 'PUT', body: { number: 'IS 14858', year: 2000, title: 'x', discipline: 'CIVIL', subject: 'x', clauses: [] } })).rejects.toThrow(/400/);

  const compliance = await api<Compliance>(qa, '/is-standards/compliance');
  const electrical = compliance.byDiscipline.find((d) => d.discipline === 'ELECTRICAL')!;
  expect(electrical.failed).toBeGreaterThan(0);
  expect(compliance.byStandard.find((s) => s.code === 'IS_732')!.failed).toBeGreaterThan(0);

  await signIn(page, 'qaqc@demo.com');
  await page.goto('/is-standards');
  await expect(page.getByRole('heading', { level: 1, name: 'IS standards' })).toBeVisible();
  await page.locator('.ant-segmented-item').filter({ hasText: /^Electrical$/ }).click();
  await expect(page).toHaveURL(/discipline=ELECTRICAL/);
  await expect(page.getByRole('link', { name: 'IS 456:2000' })).toHaveCount(0);
  await page.getByRole('link', { name: 'IS 732:2019' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'IS 732:2019' })).toBeVisible();
  await expect(page.getByText('Insulation resistance (IS 732)')).toBeVisible();
  await page.getByRole('button', { name: 'Record test' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByText('For IS 732:2019: Insulation resistance')).toBeVisible();
  await expect(form.getByText('Insulation resistance (IS 732)')).toBeVisible();
  await form.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/is-compliance');
  await expect(page.getByRole('heading', { level: 1, name: 'IS compliance' })).toBeVisible();
  const row = page.getByRole('table', { name: 'Discipline' }).getByRole('row').filter({ has: page.getByRole('link', { name: 'Electrical', exact: true }) });
  await expect(row.getByRole('cell').nth(2)).toHaveText(String(electrical.failed));
});
