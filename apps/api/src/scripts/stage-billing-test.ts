/**
 * Stage billing's tests (item 129). The break-up, the evidence, the bill's stage lines, slippage and the advance window,
 * with no database; CI runs it after the build:
 *
 *   node dist/scripts/stage-billing-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { DEFAULT_SLIPPAGE_TIERS, STAGE_TEMPLATES, WORK_ELEMENT_TYPES } from '@erp/shared';
import {
  breakupProblems,
  certifiedAmount,
  componentShares,
  matchStageActivities,
  monthsBetween,
  plannedFraction,
  shareSupply,
  sharesFromWeights,
  slippage,
  stageEvidence,
  stageLine,
  stageValue,
  targetAt,
  tierFor,
  windowRecovery,
  type ComponentInput,
} from '../stage-billing/stage-billing-rules';

const D = (v: number | string) => new Prisma.Decimal(v);
const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const comp = (id: string, code: string, sharePct: number | null, parentId: string | null = null, basis: 'STAGES' | 'UNIT_RATE' = 'STAGES'): ComponentInput => ({
  id,
  parentId,
  code,
  name: `Component ${code}`,
  sharePct: sharePct === null ? null : D(sharePct),
  basis,
});
const ok = <T>(r: T | { problem: string }): T => {
  if (r && typeof r === 'object' && 'problem' in r) throw new Error(r.problem);
  return r as T;
};

test('templates: every kind of component has stages that make 100%', () => {
  for (const t of WORK_ELEMENT_TYPES) {
    const total = STAGE_TEMPLATES[t].reduce((s, x) => s + x.pct, 0);
    assert.equal(total, 100, `${t} makes ${total}%`);
  }
});

test('shares: a part shares its parent, unit-rate takes none', () => {
  const comps = [comp('tanks', '8', 20), comp('t1', '8.1', 45, 'tanks'), comp('t2', '8.2', 55, 'tanks'), comp('mains', '6', 80), comp('roads', '10', null, null, 'UNIT_RATE')];
  const shares = componentShares(D(100_000_000), comps);
  assert.equal(shares.get('t1')!.sharePct, 9);
  assert.equal(shares.get('t1')!.value.toFixed(2), '9000000.00');
  assert.equal(shares.get('t2')!.value.toFixed(2), '11000000.00');
  assert.equal(shares.has('roads'), false);
  assert.deepEqual(breakupProblems(comps, [{ componentId: 't1', pct: D(100) }, { componentId: 't2', pct: D(100) }, { componentId: 'mains', pct: D(100) }]), []);
});

test('problems: shares and stages that do not add up are named', () => {
  const comps = [comp('a', '1', 60), comp('b', '2', 30), comp('r', '3', null, null, 'UNIT_RATE')];
  const problems = breakupProblems(comps, [{ componentId: 'a', pct: D(95) }, { componentId: 'r', pct: D(10) }]);
  assert.ok(problems.some((p) => p.includes('make 90%')), 'top-level shares');
  assert.ok(problems.some((p) => p.includes('stages of 1 Component 1 make 95%')), 'stages of a');
  assert.ok(problems.some((p) => p.includes('2 Component 2 has no stages')), 'b');
  assert.ok(problems.some((p) => p.includes('paid by unit rates')), 'unit-rate with a stage');
});

test('weights to shares: scaled to 100, the last takes the rounding', () => {
  const s = sharesFromWeights([45, 30, 25]);
  assert.deepEqual(s, [45, 30, 25]);
  const t = sharesFromWeights([1, 1, 1]);
  assert.equal(Math.round(t.reduce((a, b) => a + b, 0) * 10000) / 10000, 100);
  assert.deepEqual(sharesFromWeights([null, null]), [50, 50]);
});

test('matching: a stage reads the top-level activities whose names start with its own', () => {
  const ids = matchStageActivities(STAGE_TEMPLATES.OHT.find((s) => s.name === 'Staging')!, [
    { id: 's1', name: 'Staging lift 1', parentActivityId: null },
    { id: 's1c', name: 'Staging lift 1: concrete', parentActivityId: 's1' },
    { id: 'rb', name: 'Bottom ring beam', parentActivityId: null },
    { id: 'cw', name: 'Container wall', parentActivityId: null },
  ]);
  assert.deepEqual(ids, ['s1', 'rb']);
});

test('evidence: an event pays once its date has come, supply and testing pro rata', () => {
  assert.equal(stageEvidence({ trigger: 'EVENT', achievedOn: '2026-03-02', evidence: 'EE letter 114', upTo: '2026-04-30' }).pct, 100);
  assert.equal(stageEvidence({ trigger: 'EVENT', achievedOn: '2026-05-02', evidence: null, upTo: '2026-04-30' }).pct, 0);
  assert.equal(stageEvidence({ trigger: 'EVENT', achievedOn: null, evidence: null, upTo: '2026-04-30' }).text, 'Not recorded yet');
  const supply = stageEvidence({ trigger: 'SUPPLY', received: 3700, scope: 4200, unit: 'm' });
  assert.equal(supply.pct, 88.095);
  assert.equal(supply.text, '3,700 of 4,200 m received');
  assert.equal(stageEvidence({ trigger: 'SUPPLY', received: 5000, scope: 4200, unit: 'm' }).pct, 100, 'never more than the scope');
  assert.equal(stageEvidence({ trigger: 'SUPPLY', received: 10, scope: null, unit: 'm' }).pct, 0);
  assert.equal(stageEvidence({ trigger: 'TEST', tested: 2500, scope: 10000, unit: 'm' }).pct, 25);
});

test('supply: an item two stages name is shared by their scope', () => {
  const got = shareSupply(
    [
      { id: 'zone1', itemIds: ['hdpe110'], scope: 9000 },
      { id: 'zone2', itemIds: ['hdpe110'], scope: 3000 },
      { id: 'none', itemIds: [], scope: 100 },
    ],
    new Map([['hdpe110', 6000]]),
  );
  assert.equal(got.get('zone1'), 4500);
  assert.equal(got.get('zone2'), 1500);
  assert.equal(got.get('none'), null);
});

test('a stage on a bill: the evidence less what was billed, amounts adding up to the stage', () => {
  const value = stageValue(D(12_345_678.9), D(20));
  assert.equal(value.toFixed(2), '2469135.78');
  const b1 = ok(stageLine(value, 0, 33.333));
  const b2 = ok(stageLine(value, b1.uptoPct, 71.4));
  const b3 = ok(stageLine(value, b2.uptoPct, 100));
  assert.equal(b1.thisPct, 33.333);
  assert.equal(b2.thisPct, 38.067);
  assert.equal(b1.amount.add(b2.amount).add(b3.amount).toFixed(2), value.toFixed(2), 'no paisa lost to rounding');
  assert.equal(ok(stageLine(value, 50, 40)).thisPct, 0, 'evidence behind the billing claims nothing');
});

test('a claim by hand: lower is fine, higher needs a note, never past 100', () => {
  const value = D(1_000_000);
  assert.equal(ok(stageLine(value, 20, 60, { pct: 25, note: null })).thisPct, 25);
  assert.match((stageLine(value, 20, 60, { pct: 50, note: '' }) as { problem: string }).problem, /Say why you claim more than the 40%/);
  assert.equal(ok(stageLine(value, 20, 60, { pct: 50, note: 'Lift 5 cast, cubes awaited' })).amount.toFixed(2), '500000.00');
  assert.match((stageLine(value, 90, 100, { pct: 15, note: 'x' }) as { problem: string }).problem, /Only 10% of this stage is left/);
});

test('certificate: a stage passed at less than claimed pays for what was passed', () => {
  assert.equal(certifiedAmount(D(2_000_000), 40, 10).toFixed(2), '200000.00');
});

test('slippage: the tier for how far behind, on the work not done; ahead withholds nothing', () => {
  assert.equal(tierFor(0, DEFAULT_SLIPPAGE_TIERS), 2.5);
  assert.equal(tierFor(25, DEFAULT_SLIPPAGE_TIERS), 5);
  assert.equal(tierFor(80, DEFAULT_SLIPPAGE_TIERS), 10);
  const { lines, total } = slippage(
    [
      { componentId: 'wtp', code: '4', name: 'Treatment plant', value: D(40_000_000), targetPct: 60, actualPct: 42 },
      { componentId: 'oht', code: '8', name: 'Tanks', value: D(30_000_000), targetPct: 50, actualPct: 55 },
      { componentId: 'em', code: '5', name: 'Pumps', value: D(10_000_000), targetPct: null, actualPct: 0 },
    ],
    DEFAULT_SLIPPAGE_TIERS,
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].behindPct, 30);
  assert.equal(lines[0].tierPct, 5);
  assert.equal(total.toFixed(2), '360000.00', '5% of 18% of 4 crore');
});

test('grid: a month\'s target is due at its end', () => {
  const targets = [
    { month: '2026-08-01', pct: 40 },
    { month: '2026-09-01', pct: 55 },
  ];
  assert.equal(targetAt(targets, '2026-09-29'), 40);
  assert.equal(targetAt(targets, '2026-09-30'), 55);
  assert.equal(targetAt(targets, '2026-07-31'), null);
  assert.deepEqual(monthsBetween('2025-11-15', '2026-02-03'), ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  assert.equal(plannedFraction('2026-01-01', '2026-01-11', '2026-01-06'), 0.5);
  assert.equal(plannedFraction(null, '2026-01-11', '2026-01-06'), 0);
});

test('advance window: nothing before 10% executed, all of it by 80%', () => {
  const base = { advance: D(1_000_000), contractValue: D(100_000_000), fromPct: D(10), toPct: D(80) };
  assert.equal(windowRecovery({ ...base, executedUpto: D(8_000_000), recoveredBefore: D(0) }).toFixed(2), '0.00');
  assert.equal(windowRecovery({ ...base, executedUpto: D(45_000_000), recoveredBefore: D(0) }).toFixed(2), '500000.00');
  assert.equal(windowRecovery({ ...base, executedUpto: D(45_000_000), recoveredBefore: D(300_000) }).toFixed(2), '200000.00', 'less what was recovered');
  assert.equal(windowRecovery({ ...base, executedUpto: D(95_000_000), recoveredBefore: D(900_000) }).toFixed(2), '100000.00', 'never more than is out');
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
  }
}
console.log(`\nStage billing: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
