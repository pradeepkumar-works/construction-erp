import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

type Finding = { id: string; text: string; state: string; ncrId: string | null; ncrNo: string | null; closingNote: string | null };
type Audit = { id: string; auditNo: string; projectId: string; kind: string; open: number; findings: Finding[] };
type Ncr = { id: string; ncrNo: string; raisedByClient: boolean; severity: string };
type Report = { rows: { projectId: string; audits: number; findingsOpen: number }[]; totals: { audits: number } };

/**
 * QA/QC part 3 (item 137): QA/QC records a client's visit with two findings; a visit from outside must say who came;
 * one finding is closed with what was done and the other becomes an NCR raised by the client, after which the audit is
 * kept; a site engineer cannot record one; the month's report counts it; the pages open.
 */
test('audits and visits follow their findings to closure and the quality report counts them', async ({ page }) => {
  const qa = await apiToken('qaqc@demo.com');
  const demo = await api<{ items: Audit[] }>(qa, '/qa/audits?pageSize=50');
  const projectId = demo.items[0]?.projectId;
  expect(projectId).toBeTruthy();
  const today = localToday();

  await expect(api(qa, '/qa/audits', { method: 'POST', body: { projectId, kind: 'CLIENT', date: today, findings: [] } })).rejects.toThrow(/400/);

  const stamp = Date.now();
  const audit = await api<Audit>(qa, '/qa/audits', {
    method: 'POST',
    body: {
      projectId,
      kind: 'CLIENT',
      date: today,
      visitor: `E2E client engineer ${stamp}`,
      findings: [
        { text: `E2E shuttering joints not sealed ${stamp}`, severity: 'MINOR' },
        { text: `E2E slab thickness short at grid D ${stamp}`, severity: 'MAJOR' },
      ],
    },
  });
  expect(audit.auditNo).toMatch(/^AUD-\d{4}-\d{4}$/);
  expect(audit.open).toBe(2);
  const [first, second] = audit.findings;

  const closed = await api<Audit>(qa, `/qa/audits/${audit.id}/findings/${first.id}/close`, { method: 'POST', body: { note: 'Joints taped before the pour' } });
  expect(closed.findings.find((f) => f.id === first.id)).toMatchObject({ state: 'CLOSED', closingNote: 'Joints taped before the pour' });
  expect(closed.open).toBe(1);

  const raised = await api<Audit>(qa, `/qa/audits/${audit.id}/findings/${second.id}/ncr`, { method: 'POST', body: {} });
  const withNcr = raised.findings.find((f) => f.id === second.id)!;
  expect(withNcr.state).toBe('NCR');
  expect(withNcr.ncrNo).toBeTruthy();
  const ncr = await api<Ncr>(qa, `/quality/ncrs/${withNcr.ncrId}`);
  expect(ncr).toMatchObject({ raisedByClient: true, severity: 'MAJOR' });

  // An audit an NCR came from is kept.
  await expect(api(qa, `/qa/audits/${audit.id}`, { method: 'DELETE' })).rejects.toThrow(/400/);

  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, '/qa/audits', { method: 'POST', body: { projectId, kind: 'INTERNAL', date: today, findings: [] } })).rejects.toThrow(/403/);

  const report = await api<Report>(qa, `/qa/report?month=${today.slice(0, 7)}`);
  expect(report.rows.find((r) => r.projectId === projectId)?.audits).toBeGreaterThan(0);
  expect(report.totals.audits).toBeGreaterThan(0);

  await signIn(page, 'qaqc@demo.com');
  await page.goto('/qa-audits?open=1');
  await expect(page.getByRole('heading', { name: 'Audits and visits', level: 1 })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: audit.auditNo });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Client visit' }).click();
  await expect(page.getByRole('dialog').getByText(withNcr.ncrNo!)).toBeVisible();
  await page.goto('/qa-report');
  await expect(page.getByRole('heading', { name: 'Quality report', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By project' }).or(page.getByText('By project'))).toBeVisible();
});
