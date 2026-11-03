import { expect, test } from '@playwright/test';
import type { ActivityDto, DelaySuggestionDto, GanttDto, LookaheadDto } from '../../packages/shared/src';
import { api, apiToken } from './helpers';

/**
 * An activity with sub-activities reads their rolled-up progress on every screen that shows progress. Devgarh (the
 * seeded project with sub-activities) has summaries whose subs are all done: the Gantt must agree with the Activities
 * tab, and neither the look-ahead's overdue list nor the delay suggestions may hold a summary.
 */
test('summary activities read their sub-activities in the Gantt, look-ahead and delay suggestions', async () => {
  const pm = await apiToken('pm@demo.com');
  const projects = await api<{ items: { id: string; code: string }[] }>(pm, '/projects?pageSize=100');
  const devgarh = projects.items.find((p) => p.code === 'WS-2026-04');
  expect(devgarh, 'the seeded Devgarh project').toBeTruthy();
  const id = devgarh!.id;

  const activities = await api<ActivityDto[]>(pm, `/projects/${id}/activities`);
  const summaries = new Set(activities.filter((a) => a.isSummary).map((a) => a.id));
  expect(summaries.size, 'Devgarh has activities with sub-activities').toBeGreaterThan(0);
  expect(activities.some((a) => a.isSummary && Number(a.progressPct) >= 100), 'one summary is finished through its subs').toBe(true);

  const gantt = await api<GanttDto>(pm, `/projects/${id}/gantt`);
  const tab = new Map(activities.map((a) => [a.id, Number(a.progressPct)]));
  const disagree = gantt.activities.filter((r) => Math.abs(r.progressPct - (tab.get(r.id) ?? 0)) > 0.6).map((r) => r.name);
  expect(disagree, 'Gantt rows that disagree with the Activities tab').toEqual([]);
  for (const r of gantt.activities) expect(r.isSummary, r.name).toBe(summaries.has(r.id));
  const finished = gantt.activities.find((r) => r.isSummary && r.progressPct >= 100);
  expect(finished?.state, 'a summary whose subs are done is done').toBe('DONE');
  expect(finished?.actualEnd, 'and takes its finish from its last sub').toBeTruthy();

  const lookahead = await api<LookaheadDto>(pm, `/projects/${id}/lookahead`);
  const inLookahead = [...lookahead.overdue, ...lookahead.weeks.flatMap((w) => w.activities)].filter((a) => summaries.has(a.id)).map((a) => a.name);
  expect(inLookahead, 'summaries in the look-ahead').toEqual([]);

  const suggestions = await api<DelaySuggestionDto[]>(pm, `/risks/suggestions?projectId=${id}`);
  expect(suggestions.filter((s) => summaries.has(s.activityId)).map((s) => s.activityName), 'summaries suggested as delays').toEqual([]);
});
