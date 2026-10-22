import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, localToday, signIn } from './helpers';

type Action = { id: string; text: string; ownerUserId: string | null; ownerName: string; status: string; dueOn: string | null; doneOn: string | null; link: { kind: string; label: string } | null; canUpdate: boolean };
type Meeting = { id: string; meetingNo: string; status: string; projectId: string; attendees: { name: string; present: boolean }[]; points: { kind: string }[]; actions: Action[]; canEdit: boolean; canRevise: boolean };
type Project = { id: string; code: string };

const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** YYYY-MM-DD as the date pickers take it: DD MMM YYYY. */
const typed = (d: string) => `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const inDays = (n: number) => {
  const d = new Date(`${localToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function road(token: string) {
  const projects = await api<{ items: Project[] } | Project[]>(token, '/projects?pageSize=100');
  return (Array.isArray(projects) ? projects : projects.items).find((p) => p.code === 'RD-2026-01')!;
}

/**
 * Meetings (v6 item 112): the project manager records a progress review with someone from the subcontractor, a decision
 * and an action for the team leader about an RFI, issues the minutes, and the action reaches the team leader's My work;
 * marking it done from the page closes it.
 */
test('a meeting is recorded, its minutes issued, and its action reaches its owner and is closed', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const tl = await apiToken('tl@demo.com');
  const title = `E2E progress review ${Date.now()}`;

  await signIn(page, 'pm@demo.com');
  await page.goto('/meetings');
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible();
  await page.getByRole('button', { name: 'Record meeting' }).first().click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'Record meeting' });
  await chooseOption(form.getByLabel('Project'), 'RD-2026-01');
  await form.getByLabel('Meeting', { exact: true }).fill(title);
  await form.getByRole('button', { name: 'Add attendee' }).click();
  await form.getByLabel('Name of attendee 2').fill('P. K. Sahoo');
  await form.getByLabel('Side of attendee 2').fill('Sri Jagannath Constructions');
  await form.getByLabel('Point 1', { exact: true }).fill('Embankment at Ch 14+100 waits for the HT line.');
  // Noted is chosen; the next one down is Decided.
  await form.getByLabel('Kind of point 1').click();
  await form.getByLabel('Kind of point 1').press('ArrowDown');
  await form.getByLabel('Kind of point 1').press('Enter');
  await form.getByRole('button', { name: 'Add action' }).click();
  await form.getByLabel('Action 1', { exact: true }).fill('Mark the 60 m stretch at Ch 14+100 with barricades');
  await chooseOption(form.getByLabel('Owner of action 1'), 'Manoj Das');
  await form.getByLabel('Due date of action 1').fill(typed(inDays(3)));
  await form.getByLabel('Due date of action 1').press('Tab');
  await chooseOption(form.getByLabel('What action 1 is about'), 'RFI-2026-0003');
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Meeting MOM-\d{4}-\d{4} saved as a draft/)).toBeVisible();
  await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;

  try {
    const draft = await api<Meeting>(pm, `/meetings/${id}`);
    expect(draft.status).toBe('DRAFT');
    expect(draft.attendees.map((a) => a.name)).toEqual(['Suresh Nair', 'P. K. Sahoo']);
    expect(draft.points.map((p) => p.kind)).toEqual(['DECISION']);
    expect(draft.actions[0]).toMatchObject({ ownerName: 'Manoj Das', dueOn: inDays(3), link: { kind: 'RFI' } });

    await page.getByRole('button', { name: /Issue minutes/ }).first().click();
    await page.locator('.ant-modal-confirm').getByRole('button', { name: 'Issue minutes' }).click();
    await expect(page.getByText(/^Minutes issued, .*1 told of their actions/)).toBeVisible();
    await expect(page.getByText('Minutes issued', { exact: true })).toBeVisible();

    // The team leader sees it among their actions and in My work.
    const mine = await api<{ items: Action[] }>(tl, '/meetings/actions?mine=true');
    const action = mine.items.find((a) => a.text.startsWith('Mark the 60 m stretch'))!;
    expect(action.canUpdate).toBe(true);
    const work = await api<{ meetingActions?: { items: { href: string }[] } }>(tl, '/dashboard/my-work');
    expect(work.meetingActions?.items.some((i) => i.href === `/meetings/${id}`)).toBe(true);

    await page.getByRole('button', { name: /^Done: Mark the 60 m stretch/ }).click();
    const done = page.locator('.ant-modal').filter({ hasText: 'Mark done' });
    await done.getByLabel('How').fill('Barricades and two flagmen in place');
    await done.getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByText('Action done')).toBeVisible();
    const after = await api<Meeting>(pm, `/meetings/${id}`);
    expect(after.actions[0]).toMatchObject({ status: 'DONE', doneOn: localToday() });
  } finally {
    await call(pm, 'POST', `/meetings/${id}/revise`);
    await call(pm, 'DELETE', `/meetings/${id}`);
  }
});

/** The rules through the API: what issuing needs, issued minutes fixed, who records, edits and closes what. */
test('issuing needs owners and dates, issued minutes are fixed, and only the right people change things', async () => {
  const [pm, engineer, qs, tl, accounts, client] = await Promise.all(['pm@demo.com', 'engineer@demo.com', 'qs@demo.com', 'tl@demo.com', 'accounts@demo.com', 'client@demo.com'].map((e) => apiToken(e)));
  const project = await road(pm);
  const users = (await api<{ items: { id: string; email: string }[] }>(pm, '/users?pageSize=100')).items;
  const tlId = users.find((u) => u.email === 'tl@demo.com')!.id;
  const base = { projectId: project.id, title: `E2E rules ${Date.now()}`, heldOn: localToday(), attendees: [{ name: 'Visitor', present: true }] };

  expect((await call(accounts, 'POST', '/meetings', base)).status).toBe(403);
  expect((await call(client, 'GET', '/meetings')).status).toBe(403);

  const made = await api<Meeting>(pm, '/meetings', { method: 'POST', body: { ...base, actions: [{ text: 'Send the levels' }] } });
  try {
    const noOwner = await call(pm, 'POST', `/meetings/${made.id}/issue`);
    expect(noOwner.status).toBe(400);
    expect((await noOwner.json()).message).toBe('Action 1: name who does it.');
    await api(pm, `/meetings/${made.id}`, { method: 'PATCH', body: { actions: [{ id: made.actions[0].id, text: 'Send the levels', ownerUserId: tlId }] } });
    expect(((await (await call(pm, 'POST', `/meetings/${made.id}/issue`)).json()) as { message: string }).message).toBe('Action 1: give the date it is due.');
    await api(pm, `/meetings/${made.id}`, { method: 'PATCH', body: { actions: [{ id: made.actions[0].id, text: 'Send the levels', ownerUserId: tlId, dueOn: inDays(2) }] } });

    // Someone else's draft is not the engineer's to change.
    expect((await call(engineer, 'PATCH', `/meetings/${made.id}`, { title: 'Mine now' })).status).toBe(403);
    expect((await call(pm, 'POST', `/meetings/${made.id}/issue`)).status).toBe(201);
    expect((await call(pm, 'PATCH', `/meetings/${made.id}`, { title: 'Changed' })).status).toBe(409);
    expect((await call(pm, 'DELETE', `/meetings/${made.id}`)).status).toBe(409);
    expect((await call(engineer, 'POST', `/meetings/${made.id}/revise`)).status).toBe(403);

    const actionId = made.actions[0].id;
    // Only its owner, whoever recorded the meeting and managers close it; not ahead of today; dropping needs a reason.
    expect((await call(qs, 'PATCH', `/meetings/actions/${actionId}`, { status: 'DONE' })).status).toBe(403);
    expect((await call(tl, 'PATCH', `/meetings/actions/${actionId}`, { status: 'DONE', doneOn: inDays(1) })).status).toBe(400);
    expect((await call(tl, 'PATCH', `/meetings/actions/${actionId}`, { status: 'DROPPED' })).status).toBe(400);
    const closed = await api<Action>(tl, `/meetings/actions/${actionId}`, { method: 'PATCH', body: { status: 'DONE' } });
    expect(closed).toMatchObject({ status: 'DONE', doneOn: localToday() });
    const reopened = await api<Action>(pm, `/meetings/actions/${actionId}`, { method: 'PATCH', body: { status: 'OPEN', dueOn: inDays(5) } });
    expect(reopened).toMatchObject({ status: 'OPEN', doneOn: null, dueOn: inDays(5) });

    const revised = await api<Meeting>(pm, `/meetings/${made.id}/revise`, { method: 'POST' });
    expect(revised).toMatchObject({ status: 'DRAFT', canEdit: true });
  } finally {
    await call(pm, 'POST', `/meetings/${made.id}/revise`);
    await call(pm, 'DELETE', `/meetings/${made.id}`);
  }
});
