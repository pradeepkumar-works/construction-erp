import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

type Need = { id: string; projectId: string; docNo: string | null; title: string; state: string; overdue: boolean; daysLate: number; reminders: number; riskNo: string | null; lastLetterId: string | null };
type Schedule = { items: Need[]; total: number; counts: { total: number; overdue: number } };
type Letter = { id: string; direction: string; status: string; subject: string; body: string };

const daysAgo = (n: number) => {
  const d = new Date(`${localToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Design and drawings part 1: the document controller adds a drawing the client's consultant owes, now late;
 * the reminder drafts an outward letter that names it; the document controller cannot raise a delay, the project manager
 * records it in the risk register, after which the line is kept; the next number follows the project's scheme; a site
 * engineer cannot add to the schedule; the pages open.
 */
test('a late drawing is chased by letter and recorded as a delay', async ({ page }) => {
  const docs = await apiToken('docs@demo.com');
  const demo = await api<Schedule>(docs, '/design/schedule?pageSize=100');
  const projectId = demo.items.find((n) => n.docNo === 'STR-210')?.projectId;
  expect(projectId).toBeTruthy();

  const stamp = Date.now();
  const party = `E2E structural consultant ${stamp}`;
  const need = await api<Need>(docs, '/design/schedule', {
    method: 'POST',
    body: { projectId, docNo: `E2E-STR-${stamp}`, title: `E2E roof slab reinforcement ${stamp}`, discipline: 'STRUCTURAL', source: 'CLIENT', fromParty: party, neededBy: daysAgo(3) },
  });
  expect(need).toMatchObject({ state: 'AWAITED', overdue: true, daysLate: 3 });

  const late = await api<Schedule>(docs, `/design/schedule?projectId=${projectId}&state=LATE&pageSize=100`);
  expect(late.items.map((n) => n.id)).toContain(need.id);

  const reminder = await api<{ letterId: string; drawings: number }>(docs, `/design/schedule/${need.id}/remind`, { method: 'POST' });
  expect(reminder.drawings).toBe(1);
  const letter = await api<Letter>(docs, `/letters/${reminder.letterId}`);
  expect(letter).toMatchObject({ direction: 'OUT', status: 'DRAFT' });
  expect(letter.body).toContain(need.title);

  await expect(api(docs, `/design/schedule/${need.id}/delay`, { method: 'POST' })).rejects.toThrow(/403/);
  const pm = await apiToken('pm2@demo.com');
  const delayed = await api<Need>(pm, `/design/schedule/${need.id}/delay`, { method: 'POST' });
  expect(delayed.riskNo).toBeTruthy();
  expect(delayed.reminders).toBe(1);

  // A line that was chased or recorded as a delay is kept.
  await expect(api(docs, `/design/schedule/${need.id}`, { method: 'DELETE' })).rejects.toThrow(/400/);

  const next = await api<{ docNo: string }>(docs, `/design/next-no?projectId=${projectId}&discipline=STRUCTURAL`);
  expect(next.docNo).toMatch(/-STR-\d{3}$/);

  const engineer = await apiToken('engineer2@demo.com');
  await expect(api(engineer, '/design/schedule', { method: 'POST', body: { projectId, title: 'E2E not allowed', neededBy: localToday() } })).rejects.toThrow(/403/);

  await signIn(page, 'docs@demo.com');
  await page.goto(`/drawing-schedule?id=${need.id}`);
  await expect(page.getByRole('heading', { name: 'Drawing schedule', level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog').getByText(delayed.riskNo!)).toBeVisible();
  await page.goto('/drawing-schedule?tab=as-built');
  await expect(page.getByText('needs an as-built revision before handover')).toBeVisible();
});
