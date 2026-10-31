import { expect, test } from '@playwright/test';
import { api, apiToken, formPanel, openProjectTab, signIn } from './helpers';

/** A small PNG, enough for the browser to open as a photo; the stand-in model (AI_PROVIDER=fake) "reads" it. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFElEQVR4nGP4TyJgGNUwqmH4agAAr639H708R/EAAAAASUVORK5CYII=', 'base64');

type Project = { id: string; name: string; workOrderNo: string | null; startDate: string | null; endDate: string | null; contractValue: string | null; clientId: string | null; location: string | null };
type Contract = { agreementNo: string | null; agreementDate: string | null };
type Boq = { itemNo: string; section: string | null; unit: string; rate: string; originalQty: string }[];

/**
 * Reading the work order and the BOQ (finding 10 of the October review): a work order or LoA fills New project, a
 * value read with low confidence is marked to check, a client not in the master can be added from the read name; and
 * a BOQ PDF or scan comes into the BOQ import as rows to check and untick before importing. The model is the scripted
 * stand-in, which reads a road work order and four of its BOQ items off any page.
 */
test('a work order fills New project, and a BOQ scan imports its rows after a check', async ({ page }) => {
  const code = `WO-${Date.now().toString(36).toUpperCase()}`;
  await signIn(page, 'pm@demo.com');
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const form = formPanel(page, 'New project');
  const chooser = page.waitForEvent('filechooser');
  await form.getByRole('button', { name: 'Fill from work order' }).click();
  await (await chooser).setFiles({ name: 'work-order.png', mimeType: 'image/png', buffer: PNG });

  await expect(form.getByText('Filled from work-order.png')).toBeVisible();
  await expect(form.getByLabel('Project name')).toHaveValue('Widening and strengthening of the district road from Km 12 to Km 18');
  await expect(form.getByLabel('Work order no.')).toHaveValue('WO/RD/2026-27/118');
  await expect(form.getByLabel('Agreement no.')).toHaveValue('14/EE/2026-27');
  await expect(form.getByLabel('Location', { exact: true })).toHaveValue('Bhadrak');
  // The agreement date was hard to read; 18 months from the start give the end date.
  await expect(form.getByText(/Check this: hard to read/)).toBeVisible();
  await expect(form.getByRole('textbox', { name: 'Start and completion dates' })).toHaveValue('15 Nov 2026');
  await expect(form.getByRole('textbox', { name: 'End date', exact: true })).toHaveValue('14 May 2028');
  // The issuing office is not a client yet: add it from the read name, and it is picked.
  await form.getByRole('button', { name: 'Add client' }).click();
  const client = formPanel(page, 'New client');
  await expect(client.getByLabel('Client name')).toHaveValue('Roads Division, Public Works Department');
  await client.getByLabel('Client name').fill(`Roads Division, Public Works Department ${code}`);
  await client.getByRole('button', { name: 'Save client' }).click();
  await expect(form.getByText('is not in the client master')).toHaveCount(0);

  await form.getByLabel('Project code').fill(code);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);

  const pm = await apiToken('pm@demo.com');
  const made = (await api<{ items: Project[] }>(pm, `/projects?q=${code}`)).items[0];
  const project = await api<Project>(pm, `/projects/${made.id}`);
  expect([project.workOrderNo, project.startDate, project.endDate, Number(project.contractValue), project.location]).toEqual(['WO/RD/2026-27/118', '2026-11-15', '2028-05-14', 84650000, 'Bhadrak']);
  expect(project.clientId).not.toBeNull();
  const contract = await api<Contract>(pm, `/projects/${made.id}/contract`);
  expect([contract.agreementNo, contract.agreementDate]).toEqual(['14/EE/2026-27', '2026-11-05']);

  // The BOQ from a scan: four rows read, the one whose figures do not add up marked, one left out.
  await page.goto(`/projects/${made.id}?tab=boq`);
  await page.getByRole('button', { name: 'Import BOQ' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import BOQ from Excel' });
  const boqChooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Read a BOQ PDF or scan' }).click();
  await (await boqChooser).setFiles({ name: 'boq.png', mimeType: 'image/png', buffer: PNG });
  const read = page.getByRole('dialog', { name: 'Import BOQ read from a PDF or scan' });
  await expect(read.getByText('4 items read from 1 page, 1 to check (amber)')).toBeVisible();
  await expect(read.getByTestId('boq-read-check')).toContainText('quantity × rate is not the amount');
  await read.getByRole('checkbox', { name: 'Import item 2.01' }).uncheck();
  await read.getByRole('button', { name: 'Import 3 items' }).click();
  await expect(read).toBeHidden();

  const boq = await api<Boq>(pm, `/projects/${made.id}/boq`);
  expect(boq.map((b) => [b.itemNo, b.section, b.unit, Number(b.rate), Number(b.originalQty)])).toEqual([
    ['1.01', 'EARTHWORK', 'Sqm', 18.5, 42000],
    ['1.02', 'EARTHWORK', 'Cum', 245, 18500],
    ['2.02', 'GRANULAR SUB-BASE AND BASE', 'Cum', 2650, 4800],
  ]);
});

test('roles that do not set up projects or keep the BOQ cannot have a work order or BOQ read', async () => {
  const engineer = await apiToken('engineer@demo.com');
  for (const kind of ['workOrder', 'boq']) {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('pages', new Blob([PNG], { type: 'image/png' }), 'page-1.png');
    const res = await fetch(`${process.env.E2E_API_URL ?? 'http://localhost:4000/api'}/ai/read`, { method: 'POST', headers: { authorization: `Bearer ${engineer}` }, body: fd });
    expect(res.status).toBe(403);
  }
});
