import { expect, test } from '@playwright/test';
import type { BillingBreakupDto, RaBillDto } from '../../packages/shared/src';
import { api, apiToken, signIn } from './helpers';

/**
 * Stage billing on the town water scheme, a lump-sum contract: the seed makes its standard break-up, a
 * milestone grid the treatment plant has fallen behind, and RA bills 1 to 4 priced from the evidence at their dates
 * (bill 3 with a stage the client cut). The QS prepares bill 5, claims a stage by hand and goes back to the evidence;
 * the bill is deleted again, so nothing is left behind.
 */

type Project = { id: string; code: string };

test('a lump-sum bill takes its stages from the evidence and withholds for slippage', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const town = (await api<{ items: Project[] }>(qs, '/projects?pageSize=100')).items.find((p) => p.code === 'WS-2026-04')!;
  const base = `/projects/${town.id}/billing-breakup`;

  // The break-up adds up, the engineer cannot see it and the QS cannot change the terms.
  const breakup = await api<BillingBreakupDto>(qs, base);
  expect(breakup.stageBilling).toBe(true);
  expect(breakup.problems).toEqual([]);
  expect(breakup.components.find((c) => c.code === '11')!.basis).toBe('UNIT_RATE');
  expect(breakup.components.find((c) => c.code === '8.2')!.stages.map((s) => s.name)).toContain('Staging');
  expect(breakup.grid.find((r) => r.code === '4')!.targets.some((t) => t !== null)).toBe(true);
  expect(breakup.canEdit && !breakup.canEditTerms).toBe(true);
  await expect(api(engineer, base)).rejects.toThrow(/403/);
  await expect(api(qs, `${base}/terms`, { method: 'PUT', body: { tenderFactor: '1.1' } })).rejects.toThrow(/403/);

  // The seeded bills: the client cut a stage on bill 3, and bill 4 withholds for the treatment plant.
  const bills = (await api<{ items: RaBillDto[] }>(qs, `/ra-bills?projectId=${town.id}&pageSize=10`)).items;
  const bill = async (n: number) => api<RaBillDto>(qs, `/ra-bills/${bills.find((b) => b.billNo === n)!.id}`);
  const third = await bill(3);
  expect(third.stageLines.some((l) => l.certifiedPct !== null && Number(l.certifiedPct) < Number(l.thisPct))).toBe(true);
  const fourth = await bill(4);
  expect(fourth.slippageLines.map((l) => l.code)).toContain('4');
  expect(fourth.deductions.some((d) => d.key === 'slippage')).toBe(true);
  expect(fourth.items.every((i) => i.rate !== null)).toBe(true);

  // Bill 5: the stages that moved since bill 4, a claim by hand, and back to the evidence.
  const today = new Date().toISOString().slice(0, 10);
  const fifth = await api<RaBillDto>(qs, '/ra-bills', { method: 'POST', body: { projectId: town.id, billDate: today } });
  try {
    expect(fifth.billNo).toBe(5);
    const moving = fifth.stageLines.filter((l) => Number(l.thisPct) > 0);
    expect(moving.length).toBeGreaterThan(3);
    expect(moving.some((l) => l.trigger === 'SUPPLY')).toBe(true);
    const line = moving.find((l) => Number(l.prevPct) + Number(l.suggestedPct) < 95)!;
    const more = String(Math.round((Number(line.suggestedPct) + 2) * 1000) / 1000);
    await expect(api(qs, `/ra-bills/${fifth.id}/stages/${line.stageId}`, { method: 'PUT', body: { pct: more } })).rejects.toThrow(/400/);
    const claimed = await api<RaBillDto>(qs, `/ra-bills/${fifth.id}/stages/${line.stageId}`, { method: 'PUT', body: { pct: more, note: 'Cast on site, cubes awaited' } });
    const after = claimed.stageLines.find((l) => l.stageId === line.stageId)!;
    expect(after.claimedByHand).toBe(true);
    expect(Number(after.thisPct)).toBeCloseTo(Number(more), 3);
    expect(Number(claimed.grossAmount)).toBeGreaterThan(Number(fifth.grossAmount));
    const back = await api<RaBillDto>(qs, `/ra-bills/${fifth.id}/stages/${line.stageId}`, { method: 'PUT', body: {} });
    expect(back.stageLines.find((l) => l.stageId === line.stageId)!.claimedByHand).toBe(false);
    expect(back.grossAmount).toBe(fifth.grossAmount);

    // On screen: the break-up on the Contract tab, and the bill's stages and slippage.
    await signIn(page, 'qs@demo.com');
    await page.goto(`/projects/${town.id}?tab=contract`);
    await expect(page.getByRole('heading', { name: 'Payment schedule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Milestone targets' })).toBeVisible();
    await page.goto(`/bills/${fifth.id}`);
    await expect(page.getByText('Payment stages (').first()).toBeVisible();
    await expect(page.getByText(/This bill withholds|releases/).first()).toBeVisible();
    await expect(page.getByText(/differs from the BOQ rate/)).toHaveCount(0);
    await page.getByRole('button', { name: `Claim ${line.componentCode} ${line.stageName} by hand` }).click();
    await expect(page.getByLabel('This bill (% of the stage)')).toBeVisible();
  } finally {
    await api(qs, `/ra-bills/${fifth.id}`, { method: 'DELETE' });
  }
});
