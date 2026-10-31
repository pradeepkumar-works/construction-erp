import { expect, test, type Page } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, localToday, signIn } from './helpers';

type Sheet = { id: string; mbNo: string };
type Bill = { id: string; billLabel: string; stage: string };
type BillChecks = { level: string | null; toCheck: string[]; problem: string | null };
type Inspection = { id: string; inspectionNo: string; hidden: { signedByName: string | null; countersignedByName: string | null; cleared: boolean } | null };
type Order = { id: string; label: string; status: string; state: string; reply: string | null };
type Note = { title: string; type: string; entityId: string | null };

const call = async (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

async function signInGuest(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/portal/);
}

/**
 * Consultant checks in the portal (item 172), in a company of its own: the consultant's deputy team leader may not
 * certify a bill until they have checked a tenth of its measurements by value, and a check that finds less tells the QS;
 * hidden work holds its progress until its inspection is signed off before cover-up and countersigned from above; and
 * the site order book runs from the engineer's order to the site's compliance and the engineer accepting it.
 */
test("consultants check their share, countersign hidden work and run the site order book", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const email = (who: string) => `${who}-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Checks ${stamp}`, fullName: 'Owner Admin', email: email('owner'), password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email('owner'));
  const people = [
    ['pm', 'Project Manager', 'PROJECT_MANAGER'],
    ['eng', 'Site Engineer', 'SITE_ENGINEER'],
    ['ae', 'Asha Assistant', 'CONSULTANT'],
    ['dtl', 'Dev Deputy', 'CONSULTANT'],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [who, fullName, roleKey] of people) ids[who] = (await api<{ id: string }>(owner, '/users', { method: 'POST', body: { email: email(who), fullName, roleKey, password: PASSWORD } })).id;
  const [pm, eng, ae, dtl] = await Promise.all(['pm', 'eng', 'ae', 'dtl'].map((w) => apiToken(email(w))));

  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'CHK-01', name: 'E2E checked building', type: 'BUILDING' } });
  await api(owner, `/projects/${project.id}/contract`, { method: 'PUT', body: { startDate: '2026-04-01', endDate: '2027-09-30', contractValue: '50000000' } });
  await api(owner, `/projects/${project.id}/members`, { method: 'POST', body: { userIds: [ids.pm, ids.eng, ids.ae, ids.dtl] } });
  // Levels are for the client's side only; the consultant's two engineers get theirs on the team.
  expect((await call(owner, 'PATCH', `/projects/${project.id}/members/${ids.eng}`, { checkLevel: 'RESIDENT_ENGINEER' })).status).toBe(400);
  await api(owner, `/projects/${project.id}/members/${ids.ae}`, { method: 'PATCH', body: { checkLevel: 'ASSISTANT_ENGINEER' } });
  await api(owner, `/projects/${project.id}/members/${ids.dtl}`, { method: 'PATCH', body: { checkLevel: 'DEPUTY_TEAM_LEADER' } });

  // Three sheets on one item, worth 60, 30 and 10 cum at the same rate; the PM approves, a bill takes them and is sent.
  const item = await api<{ id: string }>(owner, `/projects/${project.id}/boq`, { method: 'POST', body: { itemNo: '3.01', description: 'RCC M25 in footings (e2e)', unit: 'Cum', rate: '7850', originalQty: '500' } });
  const sheets: Sheet[] = [];
  for (const [qty, at] of [['60', 'Footings F1 to F6'], ['30', 'Footings F7 to F9'], ['10', 'Footing F10']] as const) {
    const s = await api<Sheet>(owner, '/measurements', { method: 'POST', body: { projectId: project.id, boqItemId: item.id, date: localToday(), location: at, lines: [{ description: 'RCC in footings', nos: '1', length: qty }] } });
    await api(pm, `/approvals/measurement/${s.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
    sheets.push(s);
  }
  const bill = await api<Bill>(owner, '/ra-bills', { method: 'POST', body: { projectId: project.id, billDate: localToday(), submit: true } });
  await api(pm, `/approvals/bill/${bill.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  await api(owner, `/ra-bills/${bill.id}/send`, { method: 'POST', body: { date: localToday() } });

  // The deputy team leader has checked nothing: the certificate is refused, and the largest sheet is the one to check.
  const before = await api<BillChecks>(dtl, `/portal/bills/${bill.id}/checks`);
  expect(before.level).toBe('DEPUTY_TEAM_LEADER');
  expect(before.toCheck).toEqual([sheets[0].id]);
  const refused = await call(dtl, 'POST', `/portal/bills/${bill.id}/certify`, { date: localToday() });
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toContain('a deputy team leader checks at least 10% of them by value');

  // In the portal they check the large sheet and find 58 cum, not 60: the QS side hears of it.
  await signInGuest(page, email('dtl'));
  await page.goto(`/portal/${project.id}?tab=measurements`);
  await expect(page.getByText('You check as deputy team leader: at least 10% of the measurements by value')).toBeVisible();
  await page.getByRole('button', { name: sheets[0].mbNo }).click();
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Record your check' });
  await drawer.getByLabel('Quantity you found').fill('58');
  await drawer.getByLabel('Note').fill('F4 is 1.5 m deep, not 1.8 m');
  await drawer.getByRole('button', { name: 'Record my check' }).click();
  await expect(page.getByText(`Check of ${sheets[0].mbNo} recorded: less than recorded. The QS is told.`)).toBeVisible();
  const pmNotes = await api<{ items: Note[] }>(pm, '/notifications?limit=20');
  expect(pmNotes.items.some((n) => n.title === `${sheets[0].mbNo}: the deputy team leader's check differs` && n.entityId === sheets[0].id)).toBe(true);
  const staffView = await api<{ checkedByName: string; outcome: string }[]>(owner, `/measurements/${sheets[0].id}/checks`);
  expect(staffView).toEqual([expect.objectContaining({ checkedByName: 'Dev Deputy', outcome: 'LESS' })]);

  // Now the share is met and the certificate goes through.
  expect((await api<BillChecks>(dtl, `/portal/bills/${bill.id}/checks`)).problem).toBeNull();
  const certified = await api<Bill>(dtl, `/portal/bills/${bill.id}/certify`, { method: 'POST', body: { date: localToday() } });
  expect(certified.stage).toBe('CERTIFIED');

  // Hidden work: footing reinforcement's progress waits for its inspection, signed off and countersigned from above.
  const rebar = await api<{ id: string }>(owner, `/projects/${project.id}/activities`, { method: 'POST', body: { name: 'Footing reinforcement', unit: 'MT', plannedQty: '40', hiddenWork: true } });
  const at = `Footing F3 ${stamp}`;
  // The company records progress in the DPR: the day's report carries the work line, and approving it approves the line.
  const dpr = await api<{ id: string }>(eng, '/dpr', { method: 'POST', body: { projectId: project.id, date: localToday(), lines: [{ activityId: rebar.id, quantity: '2.4', location: at }] } });
  const approve = () => call(pm, 'POST', `/approvals/dpr/${dpr.id}/review`, { decision: 'APPROVE' });
  const first = await approve();
  expect(first.status).toBe(400);
  expect((await first.json()).message).toContain('is hidden work: its progress is approved after a passed inspection');
  const ins = await api<Inspection>(eng, '/inspections', { method: 'POST', body: { projectId: project.id, activityId: rebar.id, date: localToday(), location: at, items: ['Bars and cover as drawing'] } });
  await api(owner, `/inspections/${ins.id}/inspect`, { method: 'POST', body: { decision: 'APPROVE', results: [{ result: 'PASS' }] } });
  expect((await (await approve()).json()).message).toContain('signed off before cover-up and countersigned');

  const signed = await api<Inspection>(ae, `/portal/inspections/${ins.id}/hidden-sign`, { method: 'POST', body: { qty: '2.4', note: 'Measured before the pour' } });
  expect(signed.hidden).toMatchObject({ signedByName: 'Asha Assistant', countersignedByName: null, cleared: false });
  const self = await call(ae, 'POST', `/portal/inspections/${ins.id}/hidden-countersign`, {});
  expect((await self.json()).message).toContain('Someone other than the person who signed it off');
  const done = await api<Inspection>(dtl, `/portal/inspections/${ins.id}/hidden-countersign`, { method: 'POST', body: { note: 'Seen at site' } });
  expect(done.hidden).toMatchObject({ countersignedByName: 'Dev Deputy', cleared: true });
  expect((await approve()).ok).toBe(true);

  // The site order book: the deputy team leader writes an order, the site replies on the project's tab, the order closes.
  const order = await api<Order>(dtl, `/portal/projects/${project.id}/site-orders`, { method: 'POST', body: { instruction: 'Cure the footings for 7 days and keep a curing log', location: 'Footings F1 to F10' } });
  expect(order).toMatchObject({ label: 'Order 1', status: 'OPEN', state: 'OPEN' });
  const engNotes = await api<{ items: Note[] }>(eng, '/notifications?limit=20');
  expect(engNotes.items.some((n) => n.type === 'HANDOFF' && n.title === 'Order 1 from Dev Deputy: reply with the compliance')).toBe(true);
  expect((await call(owner, 'POST', `/portal/site-orders/${order.id}/close`, {})).status).toBe(403);

  const site = await (await browser.newContext()).newPage();
  await signIn(site, email('eng'));
  await site.goto(`/projects/${project.id}?tab=site-orders&order=${order.id}`);
  const orderDrawer = site.locator('.ant-drawer').filter({ hasText: 'Cure the footings for 7 days' });
  await orderDrawer.getByLabel('Your compliance reply').fill('Hessian kept wet from today; curing log at the site office');
  await orderDrawer.getByRole('button', { name: 'Send reply' }).click();
  await expect(site.getByText('Reply to Order 1 sent')).toBeVisible();
  await site.context().close();

  const back = await api<Order>(dtl, `/portal/site-orders/${order.id}/reopen`, { method: 'POST', body: { note: 'Log for F10 missing' } });
  expect(back).toMatchObject({ status: 'OPEN', reply: 'Hessian kept wet from today; curing log at the site office' });
  await api(eng, `/site-orders/${order.id}/reply`, { method: 'POST', body: { reply: 'F10 added to the log' } });
  const closed = await api<Order>(dtl, `/portal/site-orders/${order.id}/close`, { method: 'POST', body: { note: 'Seen' } });
  expect(closed).toMatchObject({ status: 'CLOSED', state: 'CLOSED' });
  expect((await call(eng, 'POST', `/site-orders/${order.id}/reply`, { reply: 'again' })).status).toBe(409);
});
