/**
 * Project setup tests: the checklist ticks itself from the records, each role sees
 * the steps it can do, a new project starts with its client's terms or the standard ones, and a BOQ far from the
 * contract value is flagged.
 *
 *   node dist/scripts/project-setup-test.js
 */
import assert from 'node:assert/strict';
import { BOQ_GAP_PCT, boqContractGap, setupApplies, setupShown, setupSteps, STANDARD_TERMS, termsFor, type ProjectSetupFacts } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const empty: ProjectSetupFacts = {
  type: 'WATER_SUPPLY',
  contractModel: 'ITEM_RATE',
  team: 0,
  startDate: null,
  endDate: null,
  contractValue: null,
  boqItems: 0,
  boqTotal: 0,
  boqItemsWithoutActivity: 0,
  activities: 0,
  activitiesUndated: 0,
  baselineAt: null,
  agreementNo: null,
  budgetSet: false,
  sectorSet: false,
  norms: 0,
};
const ready: ProjectSetupFacts = {
  ...empty,
  team: 4,
  startDate: '2026-11-01',
  endDate: '2028-04-30',
  contractValue: 246_000_000,
  boqItems: 120,
  boqTotal: 240_000_000,
  activities: 40,
  baselineAt: '2026-11-03T10:00:00Z',
  agreementNo: '07/EE/2026-27',
  budgetSet: true,
  sectorSet: true,
  norms: 12,
};
const doneKeys = (f: ProjectSetupFacts, role = 'PROJECT_MANAGER' as const) => setupSteps(f, role).filter((s) => s.done).map((s) => s.key);

test('a new project has every step to do, in order', () => {
  const steps = setupSteps(empty, 'ADMIN');
  assert.deepEqual(steps.map((s) => s.key), ['team', 'dates', 'boq', 'activities', 'boqLinks', 'schedule', 'baseline', 'contract', 'budget', 'sector', 'norms']);
  assert.ok(steps.every((s) => !s.done));
  assert.equal(steps.find((s) => s.key === 'sector')!.tab, 'sector');
});

test('a project with its records in place has every step ticked', () => {
  assert.equal(doneKeys(ready).length, setupSteps(ready, 'PROJECT_MANAGER').length);
});

test('BOQ items with no activity and undated activities keep their steps open, with the count left', () => {
  const f = { ...ready, boqItemsWithoutActivity: 9, activitiesUndated: 3 };
  const steps = setupSteps(f, 'PROJECT_MANAGER');
  assert.deepEqual(steps.filter((s) => !s.done).map((s) => [s.key, s.count]), [['boqLinks', 9], ['schedule', 3]]);
});

test('each role sees the steps it can do', () => {
  const qs = setupSteps(empty, 'QUANTITY_SURVEYOR').map((s) => s.key);
  assert.ok(qs.includes('contract') && !qs.includes('budget'));
  const se = setupSteps(empty, 'SITE_ENGINEER').map((s) => s.key);
  assert.ok(!se.includes('contract') && !se.includes('budget') && !se.includes('baseline'));
});

test('stores and plants have no setup checklist; a sector step only where the type has one', () => {
  assert.ok(!setupApplies('STORE') && !setupApplies('PLANT') && setupApplies('ROAD'));
  assert.ok(setupSteps({ ...empty, type: 'BUILDING' }, 'ADMIN').some((s) => s.key === 'sector'));
});

test('the checklist shows on a new open project until a tenth of the work is done, it is hidden, or all is ticked', () => {
  const base = { type: 'ROAD' as const, status: 'ACTIVE', physicalProgressPct: 2, hidden: false, done: 4, total: 11 };
  assert.ok(setupShown(base));
  assert.ok(setupShown({ ...base, status: 'PLANNED' }));
  assert.ok(!setupShown({ ...base, physicalProgressPct: 10 }));
  assert.ok(!setupShown({ ...base, hidden: true }));
  assert.ok(!setupShown({ ...base, done: 11 }));
  assert.ok(!setupShown({ ...base, status: 'COMPLETED' }));
  assert.ok(!setupShown({ ...base, type: 'STORE' }));
});

test('a BOQ far from the contract value is flagged, and holds the BOQ step open', () => {
  // The October test: ₹12.96 Cr of BOQ on a ₹24.60 Cr contract.
  const gap = boqContractGap({ boqTotal: 129_600_000, contractValue: 246_000_000, contractModel: 'ITEM_RATE' });
  assert.deepEqual(gap, { boqTotal: 129_600_000, contractValue: 246_000_000, gapPct: -47 });
  assert.ok(!doneKeys({ ...ready, boqTotal: 129_600_000 }).includes('boq'));
});

test('a usual tender premium, a lump sum contract or a missing figure is not flagged', () => {
  assert.equal(boqContractGap({ boqTotal: 100, contractValue: 100 + BOQ_GAP_PCT, contractModel: 'ITEM_RATE' }), null);
  assert.equal(boqContractGap({ boqTotal: 100, contractValue: 87, contractModel: 'ITEM_RATE' }), null);
  assert.equal(boqContractGap({ boqTotal: 50, contractValue: 100, contractModel: 'LUMP_SUM' }), null);
  assert.equal(boqContractGap({ boqTotal: 0, contractValue: 100, contractModel: 'ITEM_RATE' }), null);
  assert.equal(boqContractGap({ boqTotal: 50, contractValue: null, contractModel: 'ITEM_RATE' }), null);
  assert.equal(boqContractGap({ boqTotal: 130, contractValue: 100, contractModel: 'ITEM_RATE' })!.gapPct, 30);
});

test('a new project starts with the standard deductions, or its client\'s own', () => {
  const std = termsFor(null);
  assert.deepEqual([std.retentionPct, std.tdsPct, std.gstTdsPct, std.labourCessPct], ['5', '2', '2', '1']);
  assert.equal(STANDARD_TERMS.securityDepositPct, '0');
  const t = termsFor({ retentionPct: '10', gstTdsPct: '0', defectLiabilityMonths: 60, clientPaymentDays: null });
  assert.deepEqual([t.retentionPct, t.tdsPct, t.gstTdsPct, t.defectLiabilityMonths, t.clientPaymentDays], ['10', '2', '0', 60, null]);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${tests.length - failed} of ${tests.length} passed`);
if (failed) process.exit(1);
