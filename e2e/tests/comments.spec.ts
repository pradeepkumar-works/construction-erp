import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, signIn } from './helpers';

type Comment = { id: string; parentId: string | null; authorName: string; body: string; mentions: { id: string; name: string }[]; removed: boolean; mine: boolean };
type Thread = Comment & { replies: Comment[]; resolvedAt: string | null; resolvedByName: string | null };
type Threads = { threads: Thread[]; open: number; resolved: number; canComment: boolean };
type Notice = { type: string; title: string; body: string; entityType: string | null; entityId: string | null };

const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

/** The first purchase order of a project, by the project's code. */
const orderOf = async (token: string, code: string) => {
  const project = (await api<{ items: { id: string; code: string }[] }>(token, '/projects')).items.find((p) => p.code === code)!;
  const orders = await api<{ items: { id: string; poNo: string; projectId: string }[] }>(token, `/purchase-orders?projectId=${project.id}&pageSize=100`);
  return orders.items.find((o) => o.projectId === project.id)!;
};
const roadOrder = (token: string) => orderOf(token, 'RD-2026-01');
const people = async (token: string) => new Map((await api<{ items: { id: string; fullName: string; email: string }[] }>(token, '/users?pageSize=100')).items.map((u) => [u.email, u]));

/**
 * Comments and mentions on the road's purchase order: the project manager mentions the managing director
 * from the order's page, who is told and replies; the project manager hears of the reply and resolves the thread there.
 */
test('a mention on a record’s page reaches the person, their reply comes back, and the thread is resolved', async ({ page }) => {
  const stamp = Date.now();
  const pm = await apiToken('pm@demo.com');
  const md = await apiToken('md@demo.com');
  const po = await roadOrder(pm);

  await signIn(page, 'pm@demo.com');
  await page.goto(`/purchase-orders/${po.id}`);
  const comments = page.locator('#record-comments');
  await expect(comments).toBeVisible();
  const box = comments.getByRole('textbox', { name: 'New comment' });
  await box.click();
  await box.pressSequentially('@Rajesh');
  await expect(page.locator('.ant-mentions-dropdown').getByText('Rajesh Patnaik · Management')).toBeVisible();
  await box.press('Enter');
  await box.pressSequentially(`can we release this order this week? ${stamp}`);
  await comments.getByRole('button', { name: 'Comment', exact: true }).click();
  const thread = comments.locator('.comment-thread', { hasText: String(stamp) });
  await expect(thread).toBeVisible();
  await expect(thread.getByText('@Rajesh Patnaik')).toBeVisible();

  // The managing director is told, and replies.
  const mine = await api<{ items: Notice[] }>(md, '/notifications?limit=20&typesVersion=5');
  const notice = mine.items.find((n) => n.type === 'COMMENT' && n.body.includes(String(stamp)))!;
  expect(notice.title).toBe(`Suresh Nair mentioned you on Purchase order ${notice.title.split('Purchase order ')[1]}`);
  expect([notice.entityType, notice.entityId]).toEqual(['PURCHASE_ORDER', po.id]);
  const listed = await api<Threads>(md, `/comments?kind=PURCHASE_ORDER&entityId=${po.id}`);
  const root = listed.threads.find((t) => t.body.includes(String(stamp)))!;
  await api(md, '/comments', { method: 'POST', body: { kind: 'PURCHASE_ORDER', entityId: po.id, parentId: root.id, body: `Yes, release it. ${stamp}` } });
  const back = await api<{ items: Notice[] }>(pm, '/notifications?limit=20&typesVersion=5');
  expect(back.items.some((n) => n.type === 'COMMENT' && n.title.startsWith('Rajesh Patnaik replied on Purchase order') && n.body.includes(String(stamp)))).toBe(true);

  // The reply shows, and the thread is resolved from the page.
  await page.reload();
  await expect(thread.getByText(`Yes, release it. ${stamp}`)).toBeVisible();
  await thread.getByRole('button', { name: 'Resolve' }).click();
  await expect(comments.locator('.comment-thread', { hasText: String(stamp) })).toHaveCount(0);
  await comments.getByRole('button', { name: /Show resolved/ }).click();
  await expect(comments.locator('.comment-thread', { hasText: String(stamp) }).getByText('Resolved by Suresh Nair')).toBeVisible();
});

test('only people who can open the record read, write or are mentioned, and only authors change their words', async () => {
  const stamp = Date.now();
  const pm = await apiToken('pm@demo.com');
  const admin = await apiToken('admin@demo.com');
  const po = await roadOrder(pm);
  const users = await people(admin);
  const target = { kind: 'PURCHASE_ORDER', entityId: po.id };

  // HR sees every project but not purchase orders, so cannot be mentioned on one.
  const hr = users.get('hr@demo.com')!;
  const refused = await call(pm, 'POST', '/comments', { ...target, body: `@${hr.fullName} see this ${stamp}`, mentions: [hr.id] });
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toBe(`${hr.fullName} cannot open this purchase order, so cannot be mentioned on it`);
  expect((await call(pm, 'POST', '/comments', { ...target, body: '   ' })).status).toBe(400);

  // The client's engineer (a guest) reads none, and nor does someone off the project.
  expect((await call(await apiToken('client@demo.com'), 'GET', `/comments?kind=PURCHASE_ORDER&entityId=${po.id}`)).status).toBe(403);
  const md = await apiToken('md@demo.com');
  const hospital = await orderOf(md, 'BL-2026-02');
  expect([403, 404]).toContain((await call(pm, 'GET', `/comments?kind=PURCHASE_ORDER&entityId=${hospital.id}`)).status);
  // The seeded thread on the hospital's order is there for those who see it, resolved.
  const seeded = await api<Threads>(md, `/comments?kind=PURCHASE_ORDER&entityId=${hospital.id}`);
  expect(seeded.resolved).toBeGreaterThan(0);

  // Only the author edits; an admin may remove; a reply to a resolved thread opens it again.
  const made = await api<Threads>(pm, '/comments', { method: 'POST', body: { ...target, body: `Check the freight ${stamp}` } });
  const mine = made.threads.find((t) => t.body.includes(String(stamp)))!;
  expect((await call(admin, 'PATCH', `/comments/${mine.id}`, { body: 'Changed by someone else' })).status).toBe(403);
  const edited = await api<Threads>(pm, `/comments/${mine.id}`, { method: 'PATCH', body: { body: `Check the freight and unloading ${stamp}` } });
  expect(edited.threads.find((t) => t.id === mine.id)!.body).toBe(`Check the freight and unloading ${stamp}`);
  await api(pm, `/comments/${mine.id}/resolve`, { method: 'POST' });
  expect((await call(pm, 'POST', `/comments/${mine.id}/resolve`)).status).toBe(400);
  const reopened = await api<Threads>(admin, '/comments', { method: 'POST', body: { ...target, parentId: mine.id, body: `Freight is in the rate ${stamp}` } });
  expect(reopened.threads.find((t) => t.id === mine.id)!.resolvedAt).toBeNull();
  const removed = await api<Threads>(admin, `/comments/${mine.id}`, { method: 'DELETE' });
  const kept = removed.threads.find((t) => t.id === mine.id)!;
  expect([kept.removed, kept.body, kept.replies.length]).toEqual([true, '', 1]);
});
