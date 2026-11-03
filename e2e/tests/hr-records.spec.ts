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
  // Pick Warning again until its field shows: a click that lands while the list is still opening is lost.
  await expect(async () => {
    await form.getByLabel('What happened').click();
    await page.locator('.ant-select-item-option').filter({ hasText: /^Warning$/ }).click({ timeout: 3000 });
    await expect(form.getByLabel('What the warning is about')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await form.getByLabel('What the warning is about').fill('Late to site three days running');
  await form.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByText(/Warning recorded: warning letter HR-\d{4}-\d{4}/)).toBeVisible();
  await drawer.getByRole('row').filter({ hasText: 'Warning' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel it' }).click();
  await expect(page.getByText('Warning letter cancelled')).toBeVisible();
});

test("HR rewrites the confirmation letter in the company's words, and puts the standard words back", async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  type Employee = { id: string; employeeCode: string };
  type Event = { id: string; type: string };
  type Letter = { template: string; experienceTemplate: string | null };
  const ramesh = (await api<{ items: Employee[] }>(hr, '/staff/employees?pageSize=100')).items.find((e) => e.employeeCode === 'EMP-008')!;
  const confirmed = (await api<{ items: Event[] }>(hr, `/staff/events?employeeId=${ramesh.id}&pageSize=20`)).items.find((e) => e.type === 'CONFIRMED')!;
  const standard = (await api<Letter>(hr, `/staff/events/${confirmed.id}/letter`)).template;

  await signIn(page, 'hr@demo.com');
  await page.goto('/staff/letter-templates');
  await expect(page.getByRole('heading', { level: 1, name: 'Letter templates' })).toBeVisible();
  await page.locator('.ant-segmented-item').filter({ hasText: /^Confirmation letter$/ }).click();
  const words = page.getByLabel('Words of the letter');
  await expect(words).toHaveValue(standard);

  // A field that does not exist is refused before saving; a good one shows in the preview.
  await words.fill(`${standard}\n\nYour grade is {grade}.`);
  await expect(page.getByText('There is no field {grade}. Pick one from the list of fields.').first()).toBeVisible();
  await words.fill(`${standard}\n\nWelcome to the permanent team, `);
  await page.getByRole('button', { name: 'Insert their full name' }).click();
  await expect(words).toHaveValue(`${standard}\n\nWelcome to the permanent team, {name}`);
  await expect(page.getByText('Welcome to the permanent team, Asha Rao')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Confirmation letter saved. Letters print with these words from now on.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Confirmation letter (yours)' })).toBeChecked();
  expect((await api<Letter>(hr, `/staff/events/${confirmed.id}/letter`)).template).toContain('Welcome to the permanent team, {name}');

  // Back to the standard words.
  await page.getByRole('button', { name: 'Use the standard words' }).click();
  await page.getByRole('button', { name: 'Use the standard words' }).last().click();
  await expect(page.getByText('Confirmation letter prints the standard words again.')).toBeVisible();
  expect((await api<Letter>(hr, `/staff/events/${confirmed.id}/letter`)).template).toBe(standard);
});

test('The HR dashboard accounts for everyone on the rolls by site, today and in last month’s cost', async () => {
  const hr = await apiToken('hr@demo.com');
  type Site = { projectId: string | null; label: string; onRoll: number; present: number; onLeave: number; absent: number; notMarked: number; cost: string | null };
  const dash = await api<{ active: number; sites: Site[]; costMonth: string | null }>(hr, '/staff/hr-dashboard');
  expect(dash.sites.reduce((t, s) => t + s.onRoll, 0)).toBe(dash.active);
  for (const s of dash.sites) expect(s.present + s.onLeave + s.absent + s.notMarked).toBe(s.onRoll);
  expect(dash.sites[dash.sites.length - 1].projectId).toBeNull();
  expect(dash.costMonth).toMatch(/^\d{4}-\d{2}$/);
  expect(dash.sites.some((s) => s.projectId && Number(s.cost) > 0)).toBe(true);
});
