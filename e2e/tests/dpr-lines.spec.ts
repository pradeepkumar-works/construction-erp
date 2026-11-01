import { expect, test } from '@playwright/test';
import type { DailyReportDto, DprWorkOptionsDto, ProgressEntryDto } from '../../packages/shared/src';
import { API_URL, api, apiToken, formPanel, signIn } from './helpers';

/**
 * The structured DPR: a day's report carries work lines against the work breakdown, each a progress entry
 * that moves with the report. Its figures cumulate over what was approved before, a line is never edited or reviewed on
 * its own, a decision on the report reaches every line, and the report's page shows the work grouped by component.
 * The report is rejected at the end, so the demo project's progress stays as it was.
 */

type Project = { id: string; code: string };

/** A day of 2024 no other test writes a DPR for. */
const oldDay = () => `2024-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;

test('a DPR with work lines: figures, one decision for all, and the Work done section', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const town = (await api<{ items: Project[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'WS-2026-04')!;
  const options = await api<DprWorkOptionsDto>(engineer, `/dpr/work-options?projectId=${town.id}`);
  // Pipe work on a zone with its network loaded names a pipe (pipe-network.spec.ts); these lines are other work.
  const plain = options.activities.filter((a) => !a.pipeStage || !options.segments.some((s) => s.zoneId === a.zoneId));
  expect(plain.length).toBeGreaterThan(1);
  const [first, second] = plain;
  const item = options.items[0];

  let dpr: DailyReportDto | undefined;
  for (let tries = 0; !dpr && tries < 5; tries++) {
    const res = await fetch(`${API_URL}/dpr`, {
      method: 'POST',
      headers: { authorization: `Bearer ${engineer}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: town.id,
        date: oldDay(),
        weather: 'SUNNY',
        manpower: [{ category: 'Mason', count: 6 }, { category: 'Helper', count: 14 }],
        lines: [
          { activityId: first.id, quantity: '2.5', location: 'Checked by e2e', labour: [{ category: 'Mason', count: 4 }], materials: [{ itemId: item.id, quantity: '10' }] },
          { activityId: second.id, quantity: '1' },
          { activityId: first.id, quantity: '0.5' },
        ],
      }),
    });
    if (res.status === 409) continue;
    expect(res.ok, await res.clone().text()).toBe(true);
    dpr = (await res.json()) as DailyReportDto;
  }
  expect(dpr).toBeDefined();
  const id = dpr!.id;
  const lines = dpr!.lines!;
  expect(dpr!.lineCount).toBe(3);
  expect(dpr!.workExecuted).toContain('Checked by e2e');
  // The second line on the same activity adds to the first.
  expect(Number(lines[2].previous)).toBeCloseTo(Number(lines[0].previous) + 2.5, 3);
  expect(Number(lines[2].cumulative)).toBeCloseTo(Number(lines[0].cumulative) + 0.5, 3);
  expect(lines[0].materials.map((m) => m.itemId)).toEqual([item.id]);

  // A line is part of the report: not edited or reviewed alone, and not in the queue by itself.
  const edit = await fetch(`${API_URL}/progress/${lines[0].id}`, { method: 'PATCH', headers: { authorization: `Bearer ${engineer}`, 'content-type': 'application/json' }, body: JSON.stringify({ quantity: '9' }) });
  expect(edit.status).toBe(400);
  const review = await fetch(`${API_URL}/approvals/PROGRESS/${lines[0].id}/review`, { method: 'POST', headers: { authorization: `Bearer ${pm}`, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVE' }) });
  expect(review.status).toBe(400);

  // Sending the report back sends every line back with it.
  await api(pm, `/approvals/DPR/${id}/review`, { method: 'POST', body: { decision: 'REQUEST_CHANGES', note: 'Check the lift' } });
  for (const l of lines) expect((await api<ProgressEntryDto>(pm, `/progress/${l.id}`)).status).toBe('CHANGES_REQUESTED');

  // The report's page shows the work done, by component, and its edit opens with the lines.
  await signIn(page, 'engineer@demo.com');
  await page.goto(`/dpr/${id}`);
  await expect(page.getByText('Work done', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Checked by e2e').first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit and resubmit' }).click();
  const form = formPanel(page, /^Edit and resubmit · DPR /);
  await expect(form.getByLabel('Where work line 1 was done')).toHaveValue('Checked by e2e');
  await expect(form.getByLabel('Quantity done today on work line 3')).toHaveValue('0.5');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toBeHidden();

  // Sent again, the lines go with it; rejecting it rejects them, and the activities' progress is left as it was.
  await api(engineer, `/dpr/${id}/submit`, { method: 'POST' });
  for (const l of lines) expect((await api<ProgressEntryDto>(pm, `/progress/${l.id}`)).status).toBe('SUBMITTED');
  await api(pm, `/approvals/DPR/${id}/review`, { method: 'POST', body: { decision: 'REJECT', note: 'Test report' } });
  for (const l of lines) expect((await api<ProgressEntryDto>(pm, `/progress/${l.id}`)).status).toBe('REJECTED');
});
