import { expect, test } from '@playwright/test';
import { api, apiToken, formPanel, localToday, signIn } from './helpers';

type Employee = { id: string; employeeCode: string; userEmail: string | null; fullName: string; designation: string; private: { pan: string | null; ctcAnnual: string | null } | null };
type Paged<T> = { items: T[]; total: number };
type Event = { id: string; type: string; letterNo: string; fromDesignation: string | null; toDesignation: string | null };
type Dashboard = { active: number; bySite: { label: string; count: number }[]; missingDetails: { employeeCode: string; missing: string[] }[] };

/**
 * HR records: HR sees the full record with personal and statutory details, the project manager does not; a
 * promotion changes the record and gets its letter number, and taking it back puts the record back; the People home shows
 * the HR dashboard and the Staff page lists every service event.
 */
test('HR keeps the full staff record, its service events and letters', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  const pm = await apiToken('pm@demo.com');
  const staff = await api<Paged<Employee>>(hr, '/staff/employees?pageSize=100');
  const ajit = staff.items.find((e) => e.employeeCode === 'EMP-020')!;
  expect(ajit.private).not.toBeNull();
  const pmView = await api<Paged<Employee>>(pm, '/staff/employees?pageSize=100');
  // The project manager sees their own details only.
  expect(pmView.items.filter((e) => e.private !== null).map((e) => e.userEmail)).toEqual(['pm@demo.com']);
  await expect(api(pm, '/staff/hr-dashboard')).rejects.toThrow(/403/);

  const dash = await api<Dashboard>(hr, '/staff/hr-dashboard');
  expect(dash.active).toBeGreaterThan(10);
  expect(dash.bySite.reduce((n, r) => n + r.count, 0)).toBe(dash.active);
  expect(dash.missingDetails.find((m) => m.employeeCode === 'EMP-014')?.missing).toEqual(expect.arrayContaining(['PAN', 'UAN']));

  // A promotion changes the designation; taking it back restores it.
  const promoted = await api<Event>(hr, `/staff/employees/${ajit.id}/events`, { method: 'POST', body: { type: 'PROMOTED', effectiveDate: localToday(), toDesignation: 'Senior pump operator' } });
  expect(promoted.letterNo).toMatch(/^HR-\d{4}-\d{4}$/);
  expect(promoted.fromDesignation).toBe(ajit.designation);
  expect((await api<Employee>(hr, `/staff/employees/${ajit.id}`)).designation).toBe('Senior pump operator');
  await api(hr, `/staff/events/${promoted.id}`, { method: 'DELETE' });
  expect((await api<Employee>(hr, `/staff/employees/${ajit.id}`)).designation).toBe(ajit.designation);

  // The People home leads with the HR dashboard.
  await signIn(page, 'hr@demo.com');
  await page.goto('/modules/people');
  await expect(page.getByRole('heading', { level: 2, name: `Staff: ${dash.active} on the rolls` })).toBeVisible();
  await expect(page.getByText('Details payroll still needs')).toBeVisible();

  // Service records: every event with its letter; a row opens the person.
  await page.goto('/staff?tab=service');
  await expect(page.getByRole('tab', { name: 'Service records', selected: true })).toBeVisible();
  await page.getByRole('row', { name: /Gopal Mishra.*Transferred/ }).first().click();
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Gopal Mishra' });
  await expect(drawer.getByText('Statutory and bank')).toBeVisible();

  // Record a warning from the record's service tab, then take it back.
  await drawer.getByRole('tab', { name: 'Service and letters' }).click();
  await drawer.getByRole('button', { name: 'Record' }).click();
  const form = formPanel(page, 'Record for Gopal Mishra');
  await form.getByLabel('What happened').click();
  await page.locator('.ant-select-item-option').filter({ hasText: /^Warning$/ }).click();
  await form.getByLabel('What the warning is about').fill('Late to site three days running');
  await form.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByText(/Warning recorded: warning letter HR-\d{4}-\d{4}/)).toBeVisible();
  await drawer.getByRole('row').filter({ hasText: 'Warning' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel it' }).click();
  await expect(page.getByText('Warning letter cancelled')).toBeVisible();
});
