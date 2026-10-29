import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

type Copy = { id: string; copyNo: number; holder: string; revision: string; state: string; currentRevision: string | null; disposal: string | null };
type Copies = { items: Copy[]; total: number; counts: { inForce: number; toRecall: number } };
type Impact = { revision: string | null; previous: string | null; items: { key: string; tone: string; text: string }[]; copies: Copy[] };
type Doc = { id: string };
type Dashboard = { totals: { copiesToRecall: number }; projects: { projectId: string; copiesToRecall: number }[] };

/**
 * Design and drawings part 3 (item 138): the document controller issues numbered copies of a drawing good for
 * construction; a revision for approval cannot be issued; a new revision puts the old copies to recall and the revision
 * impact says so; the holder gets the new revision under the same number, the old print is taken back; the dashboard
 * counts the copies out; a site engineer cannot issue copies; the pages open.
 */
test('controlled copies are issued, recalled by a new revision and taken back', async ({ page }) => {
  const docs = await apiToken('docs@demo.com');
  const demo = await api<{ items: { projectId: string }[] }>(docs, '/design/copies?pageSize=5');
  const projectId = demo.items[0]?.projectId;
  expect(projectId).toBeTruthy();
  const today = localToday();
  const stamp = Date.now();

  const doc = await api<Doc>(docs, '/documents', {
    method: 'POST',
    body: { projectId, docNo: `E2E-CC-${stamp}`, title: `E2E lift pit reinforcement ${stamp}`, discipline: 'STRUCTURAL', revision: { revision: 'R0', issuedOn: today, status: 'FOR_CONSTRUCTION' } },
  });
  const issued = await api<Copy[]>(docs, '/design/copies', { method: 'POST', body: { documentId: doc.id, holders: ['Site office', 'Steel fixing gang'], issuedOn: today } });
  expect(issued.map((c) => [c.copyNo, c.holder, c.state])).toEqual([
    [1, 'Site office', 'IN_FORCE'],
    [2, 'Steel fixing gang', 'IN_FORCE'],
  ]);
  // The same holder twice is refused.
  await expect(api(docs, '/design/copies', { method: 'POST', body: { documentId: doc.id, holders: ['site office'], issuedOn: today } })).rejects.toThrow(/400/);

  // R1 for approval: copies of R0 are now to recall, and R1 cannot be issued as a controlled copy.
  await api(docs, `/documents/${doc.id}/revisions`, { method: 'POST', body: { revision: 'R1', issuedOn: today, status: 'FOR_APPROVAL' } });
  await expect(api(docs, '/design/copies', { method: 'POST', body: { documentId: doc.id, holders: ['Quality lab'], issuedOn: today } })).rejects.toThrow(/400/);
  // R2 good for construction.
  await api(docs, `/documents/${doc.id}/revisions`, { method: 'POST', body: { revision: 'R2', issuedOn: today, status: 'FOR_CONSTRUCTION' } });
  const impact = await api<Impact>(docs, `/design/revision-impact/${doc.id}`);
  expect(impact).toMatchObject({ revision: 'R2', previous: 'R1' });
  expect(impact.items[0]).toMatchObject({ key: 'copies', tone: 'danger' });
  expect(impact.items[0].text).toContain('CC-01 Site office');
  expect(impact.copies.every((c) => c.state === 'TO_RECALL' && c.currentRevision === 'R2')).toBe(true);

  const office = impact.copies.find((c) => c.holder === 'Site office')!;
  const given = await api<Copy[]>(docs, `/design/copies/${office.id}/reissue`, { method: 'POST', body: { issuedOn: today } });
  expect(given).toHaveLength(1);
  expect(given[0]).toMatchObject({ copyNo: 1, holder: 'Site office', revision: 'R2', state: 'IN_FORCE' });
  const back = await api<Copy>(docs, `/design/copies/${office.id}/take-back`, { method: 'POST', body: { disposedOn: today, disposal: 'DESTROYED', note: 'Stamped superseded' } });
  expect(back).toMatchObject({ state: 'CLOSED', disposal: 'DESTROYED' });
  await expect(api(docs, `/design/copies/${office.id}/take-back`, { method: 'POST', body: { disposedOn: today, disposal: 'RETURNED' } })).rejects.toThrow(/400/);

  const list = await api<Copies>(docs, `/design/copies?documentId=${doc.id}`);
  expect(list.items.map((c) => `${c.copyNo}:${c.revision}:${c.state}`).sort()).toEqual(['1:R0:CLOSED', '1:R2:IN_FORCE', '2:R0:TO_RECALL']);
  // A revision with copies stays on record.
  await expect(api(docs, `/documents/${doc.id}`, { method: 'DELETE' })).rejects.toThrow(/400/);

  const dash = await api<Dashboard>(docs, `/design/dashboard?projectId=${projectId}`);
  expect(dash.projects[0].copiesToRecall).toBeGreaterThanOrEqual(1);

  const engineer = await apiToken('engineer2@demo.com');
  await expect(api(engineer, '/design/copies', { method: 'POST', body: { documentId: doc.id, holders: ['Anyone'], issuedOn: today } })).rejects.toThrow(/40[34]/);

  await signIn(page, 'docs@demo.com');
  await page.goto(`/controlled-copies?documentId=${doc.id}`);
  await expect(page.getByRole('heading', { name: 'Controlled copies', level: 1 })).toBeVisible();
  await expect(page.getByText('Steel fixing gang').first()).toBeVisible();
  await page.goto('/design-dashboard');
  await expect(page.getByRole('heading', { name: 'Design dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What new revisions change' })).toBeVisible();
  await page.goto(`/documents?id=${doc.id}`);
  await expect(page.getByText('What R2 changes')).toBeVisible();
});
