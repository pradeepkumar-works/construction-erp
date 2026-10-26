import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, signIn } from './helpers';

/**
 * The three typing fixes of finding 17 of the October review: the project code suggested from the company's series,
 * the PAN read out of a GSTIN, and a new user put on their projects as they are created.
 */
test('a new project, vendor and user are offered what the company already knows', async ({ page }) => {
  const stamp = Date.now();
  const email = `small-${stamp}@e2e.test`;
  const year = new Date().getFullYear();
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Small ${stamp}`, fullName: 'Asha Rathore', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);

  // The company's series so far: one road and one building project.
  const road = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: `RD-${year}-01`, name: 'E2E road package', type: 'ROAD' } });
  await api(owner, '/projects', { method: 'POST', body: { code: `BL-${year}-02`, name: 'E2E building package', type: 'BUILDING' } });

  await signIn(page, email);

  // New project: the next code in the series, with the prefix of the kind of work chosen.
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const projectForm = page.getByRole('dialog', { name: 'New project' });
  await expect(projectForm.getByLabel('Project code')).toHaveValue(`RD-${year}-03`);
  await projectForm.getByLabel('Type', { exact: true }).click();
  await page.getByTitle('Water Supply').click();
  await expect(projectForm.getByLabel('Project code')).toHaveValue(`WS-${year}-03`);
  // A code typed by hand stands, whatever the type says next.
  await projectForm.getByLabel('Project code').fill('OWN-7');
  await projectForm.getByLabel('Type', { exact: true }).click();
  await page.getByTitle('Sewerage').click();
  await expect(projectForm.getByLabel('Project code')).toHaveValue('OWN-7');
  await projectForm.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.ant-modal-confirm').getByRole('button', { name: /^(Close|Discard changes)$/ }).click();
  await expect(projectForm).toBeHidden();

  // New vendor: the PAN is inside the GSTIN, and fills the empty box.
  await page.goto('/vendors');
  await page.getByRole('button', { name: 'New vendor' }).first().click();
  const vendorForm = page.getByRole('dialog', { name: 'New vendor' });
  await vendorForm.getByLabel('Vendor name').fill('Sahoo Traders');
  await vendorForm.getByLabel('GSTIN').fill('21ABCPT1234F1Z9');
  await expect(vendorForm.getByLabel('PAN')).toHaveValue('ABCPT1234F');
  await vendorForm.getByRole('button', { name: 'Add vendor' }).click();
  await expect(vendorForm).toBeHidden();

  // New user: the projects they join are part of making them.
  await page.goto('/users');
  await page.getByRole('button', { name: 'New user' }).first().click();
  const userForm = page.getByRole('dialog', { name: 'New user' });
  await userForm.getByLabel('Full name').fill('Ravi Sahu');
  await userForm.getByLabel('Email').fill(`ravi-${stamp}@e2e.test`);
  await userForm.getByLabel('Projects').click();
  await page.getByTitle(`RD-${year}-01 - E2E road package`).click();
  await page.keyboard.press('Escape');
  await userForm.getByRole('button', { name: 'Invite user' }).click();
  await expect(userForm).toBeHidden();

  const team = await api<{ members: { fullName: string }[] }>(owner, `/projects/${road.id}`);
  expect(team.members.map((m) => m.fullName)).toContain('Ravi Sahu');
});
