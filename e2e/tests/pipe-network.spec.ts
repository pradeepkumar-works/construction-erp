import { expect, test } from '@playwright/test';
import type { DailyReportDto, DprWorkOptionsDto, PipeNetworkDto, PipeNetworkImportResultDto } from '../../packages/shared/src';
import { API_URL, api, apiToken, signIn } from './helpers';

/**
 * The pipe network (item 126): zone 2 of the town scheme carries its network, junction to junction. A DPR line of pipe
 * work names its pipe, can't take a stage past the pipe's length and shows in the tab once sent; an import is checked
 * and previewed before anything is saved; the tab draws the zone with its pipe sheet and list. Nothing is saved for
 * good: the import is a preview and the DPR is rejected at the end.
 */

type Project = { id: string; code: string };

const oldDay = () => `2023-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;

async function postDpr(token: string, body: Record<string, unknown>): Promise<Response> {
  for (let tries = 0; tries < 5; tries++) {
    const res = await fetch(`${API_URL}/dpr`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, date: oldDay() }) });
    if (res.status !== 409) return res;
  }
  throw new Error('No free day for the DPR');
}

test('pipe work names its pipe, is held to its length, and the network imports only after a preview', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const town = (await api<{ items: Project[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'WS-2026-04')!;
  const net = await api<PipeNetworkDto>(engineer, `/projects/${town.id}/pipe-network`);
  const zone = net.zones.find((z) => z.pipes > 0)!;
  expect(zone.label).toContain('Zone 2');
  expect(zone.table.total.scopeM).toBeGreaterThan(5000);
  expect(net.canEdit).toBe(false);

  const options = await api<DprWorkOptionsDto>(engineer, `/dpr/work-options?projectId=${town.id}`);
  const laying = options.activities.find((a) => a.zoneId === zone.id && a.pipeStage === 'LAY_JOINT')!;
  const fresh = net.segments.find((s) => s.zoneId === zone.id && s.scope === 'PROPOSED' && !s.status.started && !Object.keys(s.waiting).length)!;
  const full = net.segments.find((s) => s.zoneId === zone.id && s.status.done.LAY_JOINT >= Number(s.lengthM))!;
  const len = Number(fresh.lengthM);

  // A pipe-work line names its pipe, and a pipe takes no more than its length.
  const noPipe = await postDpr(engineer, { projectId: town.id, weather: 'SUNNY', lines: [{ activityId: laying.id, quantity: '10' }] });
  expect(noPipe.status).toBe(400);
  expect(await noPipe.text()).toContain('choose the pipe segment');
  const over = await postDpr(engineer, { projectId: town.id, weather: 'SUNNY', lines: [{ activityId: laying.id, quantity: '1', pipeSegmentId: full.id }] });
  expect(over.status).toBe(400);
  expect(await over.text()).toContain(`${full.code} is ${Number(full.lengthM)} m long`);
  const split = await postDpr(engineer, {
    projectId: town.id,
    weather: 'SUNNY',
    lines: [
      { activityId: laying.id, quantity: String(len - 5), pipeSegmentId: fresh.id },
      { activityId: laying.id, quantity: '6', pipeSegmentId: fresh.id },
    ],
  });
  expect(split.status).toBe(400);
  expect(await split.text()).toContain('Line 2:');

  const res = await postDpr(engineer, { projectId: town.id, weather: 'SUNNY', lines: [{ activityId: laying.id, quantity: String(len), pipeSegmentId: fresh.id, location: 'Checked by e2e' }] });
  expect(res.ok, await res.clone().text()).toBe(true);
  const dpr = (await res.json()) as DailyReportDto;
  expect(dpr.lines![0].segmentLabel).toBe(`${fresh.code}, ${fresh.fromCode} to ${fresh.toCode}`);
  expect(dpr.workExecuted).toContain(`${fresh.code}, ${fresh.fromCode} to ${fresh.toCode}, Checked by e2e`);

  // Sent, it waits on the pipe; the pipe is now full for that stage.
  const after = await api<PipeNetworkDto>(pm, `/projects/${town.id}/pipe-network`);
  expect(after.segments.find((s) => s.id === fresh.id)!.waiting.LAY_JOINT).toBe(len);
  const again = await postDpr(engineer, { projectId: town.id, weather: 'SUNNY', lines: [{ activityId: laying.id, quantity: '1', pipeSegmentId: fresh.id }] });
  expect(again.status).toBe(400);

  // An import is previewed first: a pipe cut below its work and a pipe to nowhere stop it, and nothing changes.
  const pipes = after.segments.filter((s) => s.zoneId === zone.id);
  const nodes = after.nodes.filter((n) => n.zoneId === zone.id).map((n) => ({ code: n.code, kind: n.kind, groundLevel: null, x: n.x, y: n.y, chainage: null }));
  const asFile = pipes.map((s) => ({ code: s.code, from: s.fromCode, to: s.toCode, lengthM: Number(s.lengthM), diameterMm: s.diameterMm, material: s.material, pipeClass: s.pipeClass, scope: s.scope, surface: s.surface, crossing: s.crossing }));
  const preview = await api<PipeNetworkImportResultDto>(pm, `/projects/${town.id}/pipe-network/import`, {
    method: 'POST',
    body: { zoneId: zone.id, dryRun: true, nodes, pipes: [...asFile.map((p) => (p.code === full.code ? { ...p, lengthM: 1 } : p)), { ...asFile[0], code: 'P-900', to: 'J-900' }] },
  });
  expect(preview.saved).toBe(false);
  expect(preview.plan.pipes.added).toBe(1);
  expect(preview.plan.shortened).toEqual([full.code]);
  expect(preview.problems).toContain('Pipe P-900 ends at J-900, which is not in the file');
  const refused = await fetch(`${API_URL}/projects/${town.id}/pipe-network/import`, { method: 'POST', headers: { authorization: `Bearer ${engineer}`, 'content-type': 'application/json' }, body: JSON.stringify({ zoneId: zone.id, nodes, pipes: asFile }) });
  expect(refused.status).toBe(403);

  // The tab draws the zone, its pipe sheet and its pipes.
  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${town.id}?tab=pipes`);
  await expect(page.getByRole('img', { name: /^Map of .*Zone 2/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By diameter' }).or(page.getByText('By diameter', { exact: true })).first()).toBeVisible();
  await page.getByLabel('Find a pipe or junction').fill(fresh.code);
  await expect(page.getByRole('button', { name: `${fresh.code}, ${fresh.fromCode} to ${fresh.toCode}` })).toBeVisible();
  await expect(page.getByText(`Waiting for approval: ${len} m laid and jointed`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import network' })).toBeVisible();

  // Rejected, the pipe is free again.
  await api(pm, `/approvals/DPR/${dpr.id}/review`, { method: 'POST', body: { decision: 'REJECT', note: 'Test report' } });
  const end = await api<PipeNetworkDto>(pm, `/projects/${town.id}/pipe-network`);
  expect(end.segments.find((s) => s.id === fresh.id)!.waiting.LAY_JOINT ?? 0).toBe(0);
});
