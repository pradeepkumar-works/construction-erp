import { expect, test, type Page } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken } from './helpers';

interface Paged<T> {
  items: T[];
}
type Bill = { id: string; billLabel: string; status: string };
type Note = { title: string; type: string; entityId: string | null };
type PortalInspection = { id: string; inspectionNo: string; witnessedByName: string | null; witnessNote: string | null };

const today = () => new Date().toISOString().slice(0, 10);

/** Guests land on the portal rather than the dashboard. */
async function signInGuest(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/portal$/);
}

/**
 * Client portal (v3 item 32): the client's engineer on the road project is told a bill was sent, certifies it with a cut
 * in the portal, and the QS hears of it; then they record attending an inspection the site requested. The rest of the
 * app stays closed to them.
 */
test('the client certifies a bill and attends an inspection in the portal', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const pm = await apiToken('pm@demo.com');
  const eng = await apiToken('engineer@demo.com');
  const client = await apiToken('client@demo.com');
  const road = (await api<Paged<{ id: string; code: string }>>(qs, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  for (const b of (await api<Paged<Bill>>(qs, `/ra-bills?projectId=${road.id}&pageSize=100`)).items) {
    if (b.status !== 'APPROVED') await api(qs, `/ra-bills/${b.id}`, { method: 'DELETE' });
  }

  // The QS bills a fresh WMM measurement of 175 cum; the PM approves and the bill is sent.
  const wmm = (await api<{ id: string; itemNo: string }[]>(qs, `/projects/${road.id}/boq`)).find((b) => b.itemNo === '3.02')!;
  const sheet = await api<{ id: string }>(qs, '/measurements', {
    method: 'POST',
    body: { projectId: road.id, boqItemId: wmm.id, date: today(), location: 'Ch 0+400 to 0+500 (portal e2e)', lines: [{ description: 'WMM base course', nos: '1', length: '100', breadth: '7', depth: '0.25' }] },
  });
  await api(pm, `/approvals/measurement/${sheet.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const bill = await api<Bill>(qs, '/ra-bills', { method: 'POST', body: { projectId: road.id, billDate: today(), submit: true } });
  await api(pm, `/approvals/bill/${bill.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  await api(qs, `/ra-bills/${bill.id}/send`, { method: 'POST', body: { date: today() } });

  // The client follows the notification straight to the bill.
  await signInGuest(page, 'client@demo.com');
  await expect(page.getByText('RD-2026-01')).toBeVisible();
  await page.goto('/notifications');
  await page.getByText(`${bill.billLabel} sent for your certificate`).first().click();
  await expect(page).toHaveURL(new RegExp(`/portal/${road.id}`));
  const drawer = page.locator('.ant-drawer').filter({ hasText: bill.billLabel });
  await expect(drawer.getByText('Wet Mix Macadam (WMM)').first()).toBeVisible();
  await drawer.getByRole('button', { name: 'Certify' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: `Certify ${bill.billLabel}` });
  await modal.getByLabel('Certificate no.').fill('EE/RD/PORTAL');
  await modal.getByLabel('Certified 3.02').fill('150');
  await modal.getByRole('button', { name: 'Certify' }).click();
  await expect(page.getByText(new RegExp(`${bill.billLabel} certified: work done`))).toBeVisible();

  const qsNotes = await api<{ items: Note[] }>(qs, '/notifications?limit=20');
  expect(qsNotes.items.some((n) => n.type === 'PORTAL' && n.title === `${bill.billLabel} certified by the client` && n.entityId === bill.id)).toBe(true);
  const certified = await api<{ certificateNo: string | null; items: { itemNo: string; thisQty: string; certifiedQty: string | null }[] }>(qs, `/ra-bills/${bill.id}`);
  expect(certified.certificateNo).toBe('EE/RD/PORTAL');
  const line = certified.items.find((i) => i.itemNo === '3.02' && Number(i.thisQty) > 0)!;
  expect(Number(line.certifiedQty)).toBe(150);

  // Site requests a GSB inspection; the client records attending it.
  const gsb = (await api<{ id: string; name: string }[]>(pm, `/projects/${road.id}/activities`)).find((a) => a.name === 'GSB laying')!;
  const at = `Portal e2e ${Date.now()}`;
  const ins = await api<{ id: string; inspectionNo: string }>(eng, '/inspections', { method: 'POST', body: { projectId: road.id, activityId: gsb.id, date: today(), location: at, items: ['Camber checked'] } });
  await page.goto(`/portal/${road.id}?tab=inspections&open=${ins.id}`);
  const insDrawer = page.locator('.ant-drawer').filter({ hasText: ins.inspectionNo });
  await expect(insDrawer.getByText(at)).toBeVisible();
  await insDrawer.getByLabel('Your remarks').fill('Camber fine, compaction test seen');
  await insDrawer.getByRole('button', { name: 'I attended this inspection' }).click();
  await expect(page.getByText(`Recorded that you attended ${ins.inspectionNo}`)).toBeVisible();
  const witnessed = (await api<PortalInspection[]>(client, `/portal/projects/${road.id}/inspections`)).find((x) => x.id === ins.id)!;
  expect(witnessed.witnessedByName).toBe('Er. Bijay Kumar Panda');
  expect(witnessed.witnessNote).toBe('Camber fine, compaction test seen');

  // Everything outside the portal stays closed.
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/portal$/);
  const denied = await fetch(`${API_URL}/projects`, { headers: { authorization: `Bearer ${client}` } });
  expect(denied.status).toBe(403);
  const direct = await fetch(`${API_URL}/ra-bills/${bill.id}`, { headers: { authorization: `Bearer ${client}` } });
  expect(direct.status).toBe(403);
});

test('a consultant only sees the project they are on', async () => {
  const pmc = await apiToken('pmc@demo.com');
  const projects = await api<{ code: string }[]>(pmc, '/portal/projects');
  expect(projects.map((p) => p.code)).toEqual(['BL-2026-02']);
});
