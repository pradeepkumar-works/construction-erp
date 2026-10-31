import { expect, test, type Page } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, formPanel, localToday, signIn } from './helpers';

type Register = { watch: { first: boolean; state: string; nextDue: string | null }; metOn: string | null; submissions: { id: string; label: string; status: string; inForce: boolean; activityCount: number }[] };
type Eot = { id: string; label: string; status: string; state: string; daysClaimed: number; recommendedDays: number | null; grantedDays: number | null; decisionDue: string };
type EotRegister = { originalCompletion: string | null; revisedCompletion: string | null; granted: number; pending: number; applications: Eot[] };
type Risk = { id: string; riskNo: string; eotClaimed: boolean; eotGrantedDays: number | null };
type Note = { title: string; type: string; entityId: string | null };

const call = async (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

/** A `YYYY-MM-DD` day `n` days from `from`. */
const shift = (from: string, n: number) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function signInGuest(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/portal/);
}

/**
 * Programme and EOT, in a company of its own: the first programme is overdue 15 days after the agreement until
 * Rev 0 goes; the client's engineer returns it with comments in the portal and approves Rev 1, which comes into force and
 * sets the next update a month on. An extension of time for two delays is requested on the project's tab, forwarded by
 * the engineer with fewer days than claimed, and decided: the days granted go to the delays oldest first and move the
 * revised completion, and the delay register can no longer change them by hand.
 */
test('the programme goes to the engineer and an extension of time reaches the delay register', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const today = localToday();
  const email = (who: string) => `${who}-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Programme ${stamp}`, fullName: 'Owner Admin', email: email('owner'), password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email('owner'));
  const ids: Record<string, string> = {};
  for (const [who, fullName, roleKey] of [
    ['pm', 'Priya Planner', 'PROJECT_MANAGER'],
    ['ee', 'Ravi Engineer', 'CLIENT_ENGINEER'],
  ] as const)
    ids[who] = (await api<{ id: string }>(owner, '/users', { method: 'POST', body: { email: email(who), fullName, roleKey, password: PASSWORD } })).id;
  const [pm, ee] = await Promise.all([apiToken(email('pm')), apiToken(email('ee'))]);

  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'PRG-01', name: 'E2E programme road', type: 'ROAD' } });
  const end = shift(today, 300);
  await api(owner, `/projects/${project.id}/contract`, { method: 'PUT', body: { agreementDate: shift(today, -60), startDate: shift(today, -55), endDate: end, contractValue: '80000000' } });
  await api(owner, `/projects/${project.id}/members`, { method: 'POST', body: { userIds: [ids.pm, ids.ee] } });

  // No revision yet, 15 days after the agreement long past: overdue. With no plan there is nothing to send.
  const empty = await api<Register>(pm, `/projects/${project.id}/programme`);
  expect(empty.watch).toMatchObject({ first: true, state: 'OVERDUE', nextDue: shift(today, -45) });
  expect((await call(pm, 'POST', `/projects/${project.id}/programme`, {})).status).toBe(400);
  for (const [name, from, to] of [
    ['Earthwork embankment', -50, 120],
    ['GSB and WMM', 0, 260],
  ] as const)
    await api(owner, `/projects/${project.id}/activities`, { method: 'POST', body: { name, unit: 'Cum', plannedQty: '1000', plannedStart: shift(today, from), plannedEnd: shift(today, to) } });

  // The PM sends Rev 0 from the project's tab.
  await signIn(page, email('pm'));
  await page.goto(`/projects/${project.id}?tab=programme`);
  await expect(page.getByText('Overdue', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'New revision' }).click();
  const send = formPanel(page, 'Send Rev 0 to the Engineer');
  await expect(send.getByText('2 activities, finishing')).toBeVisible();
  await send.getByLabel('Letter reference').fill(`PRG/${stamp}/0`);
  await send.getByRole('button', { name: 'Send Rev 0' }).click();
  await expect(page.getByText('Rev 0 sent. The Engineer is asked to approve it in their portal.')).toBeVisible();
  const eeNotes = await api<{ items: Note[] }>(ee, '/notifications?limit=20');
  expect(eeNotes.items.some((n) => n.type === 'PORTAL' && n.title.startsWith('Rev 0 of the programme'))).toBe(true);

  // The engineer returns it with comments in the portal.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await signInGuest(guest, email('ee'));
  await guest.goto(`/portal/${project.id}?tab=programme`);
  await guest.getByRole('button', { name: 'Rev 0', exact: true }).click();
  const drawer = guest.locator('.ant-drawer').filter({ hasText: 'Your answer' });
  await drawer.getByText('Return with comments').click();
  await drawer.getByRole('textbox', { name: 'Comments' }).fill('Show the monsoon allowance for GSB');
  await drawer.getByRole('button', { name: 'Return Rev 0' }).click();
  await expect(guest.getByText('Rev 0 returned with comments')).toBeVisible();
  const pmNotes = await api<{ items: Note[] }>(pm, '/notifications?limit=20');
  expect(pmNotes.items.some((n) => n.title === 'Rev 0 of the programme returned by Ravi Engineer: send a new revision')).toBe(true);

  // A returned first programme is no programme: still overdue. Rev 1 goes and is approved, and comes into force.
  expect((await api<Register>(pm, `/projects/${project.id}/programme`)).watch.state).toBe('OVERDUE');
  const rev1 = await api<{ id: string; label: string }>(pm, `/projects/${project.id}/programme`, { method: 'POST', body: { note: 'Monsoon allowance added' } });
  expect(rev1.label).toBe('Rev 1');
  expect((await call(pm, 'POST', `/projects/${project.id}/programme`, {})).status).toBe(400);
  await api(ee, `/portal/programme/${rev1.id}/decide`, { method: 'POST', body: { decision: 'APPROVED' } });
  const register = await api<Register>(pm, `/projects/${project.id}/programme`);
  expect(register.submissions.map((s) => [s.label, s.status, s.inForce])).toEqual([
    ['Rev 1', 'APPROVED', true],
    ['Rev 0', 'RETURNED', false],
  ]);
  expect(register.watch).toMatchObject({ first: false, state: 'UPCOMING', nextDue: shift(today, 30) });
  expect(register.metOn).toBe(today);

  // Two delays in the register, 10 and 5 days lost.
  const delays: Risk[] = [];
  for (const [title, start, lost] of [
    ['Land not handed over at Km 4', -40, 10],
    ['Utility shifting at Km 9', -20, 5],
  ] as const)
    delays.push(
      await api<Risk>(owner, '/risks', {
        method: 'POST',
        body: { projectId: project.id, kind: 'DELAY', category: 'LAND', title: `${title} ${stamp}`, impact: 4, delayStart: shift(today, start), delayEnd: shift(today, start + lost), daysLost: lost, responsibleParty: 'CLIENT' },
      }),
    );

  // The PM requests an extension for both on the tab: the days claimed follow the delays chosen.
  await page.reload();
  await page.getByRole('button', { name: 'Request an extension' }).click();
  const request = formPanel(page, 'Request an extension of time');
  for (const d of delays) await request.getByText(d.riskNo).click();
  await expect(request.getByLabel('Days claimed')).toHaveValue('15');
  await request.getByLabel('Grounds').fill('Land and utilities not handed over as the contract requires');
  await request.getByRole('button', { name: 'Record the application' }).click();
  await expect(page.getByText(`EOT 1 recorded. The decision is due by`)).toBeVisible();
  const [eot] = (await api<EotRegister>(pm, `/projects/${project.id}/eot`)).applications;
  expect(eot).toMatchObject({ label: 'EOT 1', status: 'SENT', daysClaimed: 15, decisionDue: shift(today, 30) });

  // The engineer forwards it recommending 12; the PM records the authority's decision of those 12 days.
  await api(ee, `/portal/eot/${eot.id}/forward`, { method: 'POST', body: { recommendedDays: 12, note: 'Utility delay overlaps the land delay by 3 days' } });
  await page.reload();
  await page.getByRole('button', { name: 'EOT 1', exact: true }).click();
  const decide = page.locator('.ant-drawer').filter({ hasText: 'Record the decision' });
  await expect(decide.getByLabel('Days granted')).toHaveValue('12');
  await decide.getByLabel('Decision letter').fill(`SE/${stamp}`);
  await decide.getByRole('button', { name: 'Record the decision' }).click();
  await expect(page.getByText('12 days granted on EOT 1: the completion date moves')).toBeVisible();

  // The days go to the delays, oldest first up to its days lost, and move the completion.
  const after = await Promise.all(delays.map((d) => api<Risk>(pm, `/risks/${d.id}`)));
  expect(after.map((d) => d.eotGrantedDays)).toEqual([10, 2]);
  const eotAfter = await api<EotRegister>(pm, `/projects/${project.id}/eot`);
  expect(eotAfter).toMatchObject({ originalCompletion: end, revisedCompletion: shift(end, 12), granted: 12, pending: 0 });
  expect(eotAfter.applications[0]).toMatchObject({ status: 'DECIDED', state: 'PART_GRANTED', grantedDays: 12 });
  const byHand = await call(owner, 'PATCH', `/risks/${delays[0].id}`, { eotGrantedDays: 20 });
  expect(byHand.status).toBe(400);
  expect((await byHand.json()).message).toContain("EOT 1 sets this delay's extension");
  await guestContext.close();
});
