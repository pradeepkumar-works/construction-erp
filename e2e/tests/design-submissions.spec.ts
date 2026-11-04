import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

type Comment = { id: string; commentNo: number; state: string; reply: string | null };
type Round = { revision: number; code: string | null; letterId: string | null };
type Submission = {
  id: string;
  submissionNo: string;
  status: string;
  revision: number;
  openComments: number;
  rounds: Round[];
  comments: Comment[];
};
type Doc = { id: string; projectId: string; revisions: { id: string; revision: string; status: string; current: boolean }[] };
type Letter = { id: string; direction: string; status: string; subject: string };

/**
 * Design and drawings part 2: the document controller sends a new drawing for approval with a covering letter;
 * the reviewer's code C comes back with two comments; the resubmission waits for our replies, and then for a new revision
 * of the drawing; code A closes the comments and approves the revision in the register. A site engineer cannot send one;
 * the pages open.
 */
test('a drawing goes for approval, comes back with comments and is approved on the second round', async ({ page }) => {
  const docs = await apiToken('docs@demo.com');
  const demo = await api<{ items: { projectId: string; submissionNo: string }[] }>(docs, '/design/submissions?pageSize=100');
  const projectId = demo.items[0]?.projectId;
  expect(projectId).toBeTruthy();

  const stamp = Date.now();
  const today = localToday();
  const doc = await api<Doc>(docs, '/documents', {
    method: 'POST',
    body: { projectId, docNo: `E2E-DSN-${stamp}`, title: `E2E staircase reinforcement ${stamp}`, discipline: 'STRUCTURAL', revision: { revision: 'R0', issuedOn: today, status: 'FOR_APPROVAL' } },
  });

  const created = await api<Submission>(docs, '/design/submissions', {
    method: 'POST',
    body: { projectId, title: `E2E staircase ${stamp}`, kind: 'DRAWINGS', purpose: 'APPROVAL', toParty: 'The Structural Consultant', source: 'CONSULTANT', documentIds: [doc.id] },
  });
  expect(created).toMatchObject({ status: 'DRAFT' });

  const sent = await api<Submission>(docs, `/design/submissions/${created.id}/submit`, { method: 'POST', body: { submittedOn: today, letter: true } });
  expect(sent).toMatchObject({ status: 'UNDER_REVIEW', revision: 0 });
  const letter = await api<Letter>(docs, `/letters/${sent.rounds[0].letterId}`);
  expect(letter).toMatchObject({ direction: 'OUT', status: 'DRAFT' });
  expect(letter.subject).toContain(`E2E staircase ${stamp}`);

  // Code C comes with its comments.
  await expect(api(docs, `/design/submissions/${created.id}/code`, { method: 'POST', body: { code: 'C', reviewedOn: today, comments: [] } })).rejects.toThrow(/400/);
  const coded = await api<Submission>(docs, `/design/submissions/${created.id}/code`, {
    method: 'POST',
    body: { code: 'C', reviewedOn: today, reviewerName: 'Structural Consultant', comments: [{ text: 'Show the landing beam reinforcement.', documentId: doc.id }, { text: 'Give the lap length at the waist slab.' }] },
  });
  expect(coded).toMatchObject({ status: 'REVISE_RESUBMIT', openComments: 2 });

  // Not again until the comments are answered, and not with the same revision.
  await expect(api(docs, `/design/submissions/${created.id}/submit`, { method: 'POST', body: { submittedOn: today } })).rejects.toThrow(/400/);
  for (const c of coded.comments) {
    await api(docs, `/design/submissions/${created.id}/comments/${c.id}/reply`, { method: 'POST', body: { reply: `Revised in R1 (${c.commentNo}).` } });
  }
  await expect(api(docs, `/design/submissions/${created.id}/submit`, { method: 'POST', body: { submittedOn: today } })).rejects.toThrow(/400/);
  await api(docs, `/documents/${doc.id}/revisions`, { method: 'POST', body: { revision: 'R1', issuedOn: today, status: 'FOR_APPROVAL' } });
  const again = await api<Submission>(docs, `/design/submissions/${created.id}/submit`, { method: 'POST', body: { submittedOn: today, note: 'Both comments answered.' } });
  expect(again).toMatchObject({ status: 'UNDER_REVIEW', revision: 1 });

  const approved = await api<Submission>(docs, `/design/submissions/${created.id}/code`, { method: 'POST', body: { code: 'A', reviewedOn: today, comments: [] } });
  expect(approved).toMatchObject({ status: 'APPROVED', openComments: 0 });
  expect(approved.comments.every((c) => c.state === 'CLOSED')).toBe(true);
  const register = await api<Doc>(docs, `/documents/${doc.id}`);
  expect(register.revisions.find((r) => r.current)).toMatchObject({ revision: 'R1', status: 'APPROVED' });

  // A drawing sent in a submission stays in the register.
  await expect(api(docs, `/documents/${doc.id}`, { method: 'DELETE' })).rejects.toThrow(/400/);

  const engineer = await apiToken('engineer2@demo.com');
  await expect(api(engineer, '/design/submissions', { method: 'POST', body: { projectId, title: 'E2E not allowed', toParty: 'Anyone', documentIds: [doc.id] } })).rejects.toThrow(/403/);

  await signIn(page, 'docs@demo.com');
  await page.goto('/design-submissions');
  await expect(page.getByRole('heading', { name: 'Submittals', level: 1 })).toBeVisible();
  await page.goto(`/design-submissions/${created.id}`);
  await expect(page.getByRole('heading', { name: `E2E staircase ${stamp}`, level: 1 })).toBeVisible();
  await expect(page.getByText('Give the lap length at the waist slab.')).toBeVisible();
});

/**
 * Review stages: a submittal goes to the proof checker, then the PIU. The proof checker's A moves it on to the PIU with
 * a new reply-by day; the PIU's C is the round's code, with a comment that shows on Review comments under the PIU. The
 * stages cannot change while it is with a reviewer. Drawings by component and Review comments open.
 */
test('a submittal passes its review stages in turn, and a stage’s comment shows on Review comments', async ({ page }) => {
  const docs = await apiToken('docs@demo.com');
  const demo = await api<{ items: { projectId: string }[] }>(docs, '/design/submissions?pageSize=100');
  const projectId = demo.items[0]?.projectId;
  expect(projectId).toBeTruthy();
  const stamp = Date.now();
  const today = localToday();
  const doc = await api<Doc>(docs, '/documents', {
    method: 'POST',
    body: { projectId, docNo: `E2E-STG-${stamp}`, title: `E2E pump house roof ${stamp}`, discipline: 'STRUCTURAL', revision: { revision: 'R0', issuedOn: today, status: 'FOR_APPROVAL' } },
  });
  await expect(
    api(docs, '/design/submissions', { method: 'POST', body: { projectId, title: 'E2E twice', toParty: 'PIU', documentIds: [doc.id], stages: ['piu', 'piu'] } }),
  ).rejects.toThrow(/400/);
  const created = await api<Submission & { stages: string[] }>(docs, '/design/submissions', {
    method: 'POST',
    body: { projectId, title: `E2E pump house ${stamp}`, kind: 'DRAWINGS', purpose: 'APPROVAL', toParty: 'The Executive Engineer, PIU', source: 'CLIENT', documentIds: [doc.id], stages: ['proof-checker', 'piu'] },
  });
  expect(created.stages).toEqual(['Proof checker', 'PIU']);

  type Staged = Submission & { waitingAt: string | null; stages: string[] };
  const sent = await api<Staged>(docs, `/design/submissions/${created.id}/submit`, { method: 'POST', body: { submittedOn: today } });
  expect(sent).toMatchObject({ status: 'UNDER_REVIEW', waitingAt: 'Proof checker' });
  await expect(api(docs, `/design/submissions/${created.id}`, { method: 'PATCH', body: { stages: ['piu'] } })).rejects.toThrow(/400/);

  const cleared = await api<Staged>(docs, `/design/submissions/${created.id}/code`, { method: 'POST', body: { code: 'A', reviewedOn: today, reviewerName: 'Proof checker', comments: [] } });
  expect(cleared).toMatchObject({ status: 'UNDER_REVIEW', waitingAt: 'PIU' });
  const waiting = await api<{ items: { id: string }[] }>(docs, `/design/submissions?at=piu&projectId=${projectId}&pageSize=200`);
  expect(waiting.items.some((s) => s.id === created.id)).toBe(true);

  const text = `E2E show the parapet drainage spouts ${stamp}.`;
  const back = await api<Staged>(docs, `/design/submissions/${created.id}/code`, { method: 'POST', body: { code: 'C', reviewedOn: today, reviewerName: 'Executive Engineer', comments: [{ text, documentId: doc.id }] } });
  expect(back).toMatchObject({ status: 'REVISE_RESUBMIT', waitingAt: null, openComments: 1 });

  const comments = await api<{ items: { text: string; stage: string | null; state: string; submissionId: string }[] }>(docs, `/design/submissions/comments?projectId=${projectId}&stage=piu&q=${encodeURIComponent(stamp.toString())}`);
  expect(comments.items).toEqual([expect.objectContaining({ text, stage: 'PIU', state: 'OPEN', submissionId: created.id })]);

  await signIn(page, 'docs@demo.com');
  await page.goto(`/design-comments?projectId=${projectId}`);
  await expect(page.getByRole('heading', { name: 'Review comments', level: 1 })).toBeVisible();
  await page.getByLabel('Search review comments').fill(String(stamp));
  await expect(page.getByText(text)).toBeVisible();
  await page.goto(`/drawings-by-component?projectId=${projectId}`);
  await expect(page.getByRole('heading', { name: 'Drawings by component', level: 1 })).toBeVisible();
});
