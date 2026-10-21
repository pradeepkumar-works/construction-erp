/**
 * Material reconciliation's tests. The arithmetic and statuses with no database; CI runs it after the build:
 *
 *   node dist/scripts/reconciliation-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { RATE_LIBRARY, equipmentHourlyRate, pickLibraryItem, sameUnit, suggestRateLibrary } from '@erp/shared';
import { builtUpRate, movementsFrom, reconcile, reconciliationStatus, wastageGroups, type NormInput } from '../reconciliation/reconciliation-rules';

const D = (v: number | string) => new Prisma.Decimal(v);
const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const norm = (id: string, boqItemId: string, itemId: string, qtyPerUnit: number | string, wastagePct = 0): NormInput => ({
  id,
  boqItemId,
  itemId,
  qtyPerUnit: D(qtyPerUnit),
  wastagePct: D(wastagePct),
});

test('status: nothing done and nothing used is no work', () => {
  assert.equal(reconciliationStatus(D(0), D(0), D(0)), 'NO_WORK');
});
test('status: material used with no approved work is over', () => {
  assert.equal(reconciliationStatus(D(0), D(0), D(5)), 'OVER');
});
test('status: up to the allowance is within, beyond it over', () => {
  assert.equal(reconciliationStatus(D(100), D(103), D(103)), 'WITHIN');
  assert.equal(reconciliationStatus(D(100), D(103), D('103.001')), 'OVER');
});
test('status: up to 5% under theoretical is within, more is below', () => {
  assert.equal(reconciliationStatus(D(100), D(103), D(95)), 'WITHIN');
  assert.equal(reconciliationStatus(D(100), D(103), D('94.9')), 'UNDER');
});

test('movements: issues are negative rows, returns from site positive, others ignored', () => {
  const m = movementsFrom([
    { itemId: 'cement', type: 'ISSUE', quantity: D(-500) },
    { itemId: 'cement', type: 'ISSUE', quantity: D(-300) },
    { itemId: 'cement', type: 'RETURN_FROM_SITE', quantity: D(20) },
    { itemId: 'cement', type: 'RECEIPT', quantity: D(1000) },
    { itemId: 'cement', type: 'TRANSFER_OUT', quantity: D(-100) },
  ]).get('cement')!;
  assert.equal(m.issued.toString(), '800');
  assert.equal(m.returned.toString(), '20');
});

test('reconcile: cement over two concrete items, with weighted wastage', () => {
  // 100 cum M25 at 8.2 bags (2%) + 50 cum PCC at 4 bags (5%): theoretical 820 + 200 = 1020, allowance 16.4 + 10.
  const [r] = reconcile(
    [norm('n1', 'm25', 'cement', '8.2', 2), norm('n2', 'pcc', 'cement', 4, 5)],
    new Map([['m25', D(100)], ['pcc', D(50)]]),
    new Map([['cement', { issued: D(1080), returned: D(10) }]]),
  );
  assert.equal(r.theoretical.toString(), '1020');
  assert.equal(r.allowed.toString(), '1046.4');
  assert.equal(r.consumed.toString(), '1070');
  assert.equal(r.status, 'OVER');
  assert.equal(r.excess.toString(), '23.6');
  assert.equal(r.variance.toString(), '50');
  assert.equal(r.variancePct, 4.9);
  assert.equal(r.lines.length, 2);
});

test('reconcile: one BOQ item feeds several items, each reconciled on its own', () => {
  const out = reconcile(
    [norm('n1', 'm25', 'cement', '8.2', 2), norm('n2', 'm25', 'steel', '0.09', 3)],
    new Map([['m25', D(200)]]),
    new Map([['cement', { issued: D(1650), returned: D(0) }], ['steel', { issued: D(15), returned: D(0) }]]),
  );
  const cement = out.find((r) => r.itemId === 'cement')!;
  const steel = out.find((r) => r.itemId === 'steel')!;
  assert.equal(cement.theoretical.toString(), '1640');
  assert.equal(cement.status, 'WITHIN');
  assert.equal(steel.theoretical.toString(), '18');
  assert.equal(steel.status, 'UNDER');
  assert.equal(steel.excess.toString(), '0');
});

test('reconcile: a normed item never issued shows all of its theoretical as variance', () => {
  const [r] = reconcile([norm('n1', 'brick', 'bricks', 500)], new Map([['brick', D(10)]]), new Map());
  assert.equal(r.consumed.toString(), '0');
  assert.equal(r.variance.toString(), '-5000');
  assert.equal(r.status, 'UNDER');
});

test('reconcile: a BOQ item without progress gives no theoretical and no work', () => {
  const [r] = reconcile([norm('n1', 'ff-slab', 'cement', 8)], new Map(), new Map());
  assert.equal(r.theoretical.toString(), '0');
  assert.equal(r.status, 'NO_WORK');
  assert.equal(r.variancePct, null);
});

// ---------------------------------------------------------------------------------------------------------------------
// Estimate, wastage and the starter library (v5 item 92)

test('estimate: materials with wastage, labour and machines priced, overheads and profit on the cost', () => {
  // M25: 8.2 bags at 400 with 2% wastage, 2.5 helper-days at 550, 0.8 machine hours at 450; 5% overheads, 10% profit.
  const r = builtUpRate(
    [
      { kind: 'MATERIAL', qtyPerUnit: D('8.2'), wastagePct: D(2), rate: D(400) },
      { kind: 'LABOUR', qtyPerUnit: D('2.5'), wastagePct: null, rate: D(550) },
      { kind: 'EQUIPMENT', qtyPerUnit: D('0.8'), wastagePct: null, rate: D(450) },
    ],
    D(5),
    D(10),
    D(7850),
  );
  assert.equal(r.lines[0].quantity.toString(), '8.364');
  assert.equal(r.material.toString(), '3345.6');
  assert.equal(r.labour.toString(), '1375');
  assert.equal(r.equipment.toString(), '360');
  assert.equal(r.cost.toString(), '5080.6');
  assert.equal(r.overheads.toString(), '254.03');
  assert.equal(r.profit.toString(), '508.06');
  assert.equal(r.builtUpRate.toString(), '5842.69');
  assert.equal(r.margin.toString(), '2007.31');
  assert.equal(r.marginPct, 25.6);
  assert.equal(r.unpriced, 0);
});
test('estimate: a line without a rate counts as nothing and is reported', () => {
  const r = builtUpRate([{ kind: 'LABOUR', qtyPerUnit: D(1), wastagePct: null, rate: null }], D(5), D(10), D(100));
  assert.equal(r.cost.toString(), '0');
  assert.equal(r.unpriced, 1);
  assert.equal(r.lines[0].amount, null);
});
test('estimate: day and month hire rates become hourly at 8 hours a day and 30 days a month', () => {
  assert.equal(equipmentHourlyRate(450, 'HOUR'), 450);
  assert.equal(equipmentHourlyRate(14000, 'DAY'), 1750);
  assert.equal(equipmentHourlyRate(480000, 'MONTH'), 2000);
});

test('wastage: by reason and item, losses and gains apart, opening stock left out', () => {
  const g = wastageGroups([
    { reason: 'WASTAGE', itemId: 'cement', entryId: 'a', quantity: D(-10) },
    { reason: 'WASTAGE', itemId: 'cement', entryId: 'b', quantity: D(-5) },
    { reason: 'COUNT_DIFFERENCE', itemId: 'cement', entryId: 'c', quantity: D(3) },
    { reason: 'OPENING', itemId: 'cement', entryId: 'd', quantity: D(500) },
    { reason: null, itemId: 'steel', entryId: 'e', quantity: D('-0.2') },
  ]);
  const w = g.find((x) => x.reason === 'WASTAGE')!;
  assert.equal(w.lost.toString(), '15');
  assert.equal(w.entries, 2);
  assert.equal(g.find((x) => x.reason === 'COUNT_DIFFERENCE')!.gained.toString(), '3');
  assert.equal(g.some((x) => x.reason === 'OPENING'), false);
  assert.equal(g.find((x) => x.reason === null)!.lost.toString(), '0.2');
});

test('library: units are compared by meaning', () => {
  assert.ok(sameUnit('Bags', 'bag'));
  assert.ok(sameUnit('Rmt', 'm'));
  assert.ok(sameUnit('Cum', 'm3'));
  assert.ok(sameUnit('MT', 'tonne'));
  assert.ok(!sameUnit('MT', 'kg'));
});
test('library: a BOQ description suggests its entry', () => {
  assert.equal(suggestRateLibrary('RCC M25 in slab and beams - Ground floor', 'Cum')?.key, 'RCC_M25');
  assert.equal(suggestRateLibrary('PCC 1:4:8 below foundation', 'Cum')?.key, 'PCC_148');
  assert.equal(suggestRateLibrary('Brick masonry in CM 1:6, 230mm thick', 'Cum')?.key, 'BRICK_16');
  assert.equal(suggestRateLibrary('Granular Sub Base (GSB) Grading-II', 'Cum')?.key, 'GSB');
  assert.equal(suggestRateLibrary('Supply and laying HDPE PE100 distribution 110mm', 'Rmt')?.key, 'PIPE');
  assert.equal(suggestRateLibrary('Excavation in all types of soil', 'Cum'), null);
});
test('library: a material picks the store item with the right unit and the most words in common', () => {
  const pipe = RATE_LIBRARY.find((e) => e.key === 'PIPE')!.materials[0];
  const items = [
    { name: 'HDPE PE100 110mm PN6', unit: 'Rmt' },
    { name: 'DI K9 pipe 400mm', unit: 'Rmt' },
    { name: 'DI K9 pipe 300mm', unit: 'Rmt' },
  ];
  assert.equal(pickLibraryItem(pipe, items, 'Supply and laying DI K9 pipe 400mm raw water main').item?.name, 'DI K9 pipe 400mm');
  const cement = RATE_LIBRARY.find((e) => e.key === 'RCC_M25')!.materials[0];
  const inTonnes = pickLibraryItem(cement, [{ name: 'OPC 53 Grade Cement', unit: 'MT' }], 'RCC M25');
  assert.equal(inTonnes.item, null);
  assert.equal(inTonnes.wrongUnit?.unit, 'MT');
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
console.log(`\nReconciliation: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
