/**
 * Material reconciliation's tests. The arithmetic and statuses with no database; CI runs it after the build:
 *
 *   node dist/scripts/reconciliation-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PIPE_CUT_WASTAGE_PCT, RATE_LIBRARY, equipmentHourlyRate, pickLibraryItem, pipeMetres, pipeSizeOf, sameUnit, suggestRateLibrary } from '@erp/shared';
import {
  bookOf,
  builtUpRate,
  exceptionEvents,
  executedBySource,
  frontFlag,
  kitRows,
  movementsFrom,
  pipeRow,
  reconcile,
  reconciliationStatus,
  structureRows,
  wastageGroups,
  type NormInput,
} from '../reconciliation/reconciliation-rules';

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

// Estimate, wastage and the starter library

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

// Stock against the DPR

test("activity norms: an activity with norms of its own counts under itself, not under its BOQ item's norms", () => {
  const boqOf = new Map<string, string | null>([['conc-1', 'boq-rcc'], ['conc-2', 'boq-rcc'], ['hc', null], ['trench', null]]);
  const executed = executedBySource(
    [
      { activityId: 'conc-1', quantity: D(10) },
      { activityId: 'conc-2', quantity: D(5) },
      { activityId: 'hc', quantity: D(18) },
      { activityId: 'trench', quantity: D(96) },
    ],
    boqOf,
    new Set(['conc-2', 'hc']),
  );
  assert.equal(executed.get('boq-rcc')?.toString(), '10');
  assert.equal(executed.get('a:conc-2')?.toString(), '5');
  assert.equal(executed.get('a:hc')?.toString(), '18');
  assert.equal(executed.size, 3, 'work with no norm source is left out');
  const result = reconcile(
    [norm('n1', 'boq-rcc', 'cement', '8.2', 2), { id: 'n2', boqItemId: null, activityId: 'conc-2', itemId: 'cement', qtyPerUnit: D('7.6'), wastagePct: D(2) }, { id: 'n3', boqItemId: null, activityId: 'hc', itemId: 'saddle', qtyPerUnit: D(1), wastagePct: D(0) }],
    executed,
    new Map(),
  );
  const cement = result.find((r) => r.itemId === 'cement')!;
  assert.equal(cement.theoretical.toString(), '120', '10 × 8.2 + 5 × 7.6');
  assert.equal(cement.lines[1].activityId, 'conc-2');
  assert.equal(result.find((r) => r.itemId === 'saddle')!.theoretical.toString(), '18');
});

test('work front: used beyond issued, issued and never reported, or nothing to say', () => {
  assert.equal(frontFlag(D(100), D('100.5'), true), 'USED_NOT_ISSUED');
  assert.equal(frontFlag(D(100), D(0), true), 'NOT_REPORTED');
  assert.equal(frontFlag(D(100), D(92), true), null);
  assert.equal(frontFlag(D(0), D(0), true), null);
  assert.equal(frontFlag(D(100), D(0), false), null, 'a project that never reports material on its DPRs gets no flags');
});

test('book: opening before the period, received from receipts and transfers in, closing at its end', () => {
  const b = bookOf(
    [{ itemId: 'cement', quantity: D(200) }],
    [
      { itemId: 'cement', type: 'RECEIPT', quantity: D(500) },
      { itemId: 'cement', type: 'TRANSFER_IN', quantity: D(50) },
      { itemId: 'cement', type: 'ISSUE', quantity: D(-420) },
      { itemId: 'cement', type: 'RETURN_FROM_SITE', quantity: D(10) },
      { itemId: 'cement', type: 'ADJUSTMENT', quantity: D(-5) },
    ],
  ).get('cement')!;
  assert.equal(b.opening.toString(), '200');
  assert.equal(b.received.toString(), '550');
  assert.equal(b.closing.toString(), '335');
});

test('structure: per element and material, the need of the DPR lines against their use and the issues to it', () => {
  const rows = structureRows({
    norms: [
      { activityId: 'wall-conc', itemId: 'cement', qtyPerUnit: D(8), wastagePct: D(2) },
      { activityId: 'wall-steel', itemId: 'tmt', qtyPerUnit: D('1.02'), wastagePct: D(3) },
      { activityId: 'staging-conc', itemId: 'cement', qtyPerUnit: D(8), wastagePct: D(2) },
    ],
    activities: new Map([
      ['wall-conc', { elementId: 'tank-2', planned: D(120) }],
      ['wall-steel', { elementId: 'tank-2', planned: D(14) }],
      ['staging-conc', { elementId: 'tank-3', planned: D(60) }],
    ]),
    placed: new Map([['wall-conc', D(12)], ['wall-steel', D('1.9')]]),
    used: [
      { activityId: 'wall-conc', itemId: 'cement', quantity: D(102) },
      { activityId: 'wall-steel', itemId: 'tmt', quantity: D('1.94') },
      { activityId: 'wall-conc', itemId: 'plywood', quantity: D(4) },
    ],
    issued: [
      { elementId: 'tank-2', itemId: 'cement', quantity: D(110) },
      { elementId: 'tank-2', itemId: 'cement', quantity: D(-2) },
    ],
    // The front since reporting began: an issue the week before, and use before the period too
    front: {
      issued: [{ elementId: 'tank-2', itemId: 'cement', quantity: D(120) }],
      used: [
        { activityId: 'wall-conc', itemId: 'cement', quantity: D(102) },
        { activityId: 'wall-conc', itemId: 'cement', quantity: D(12) },
      ],
    },
  });
  const tank = rows.get('tank-2')!;
  assert.equal(tank.length, 2, 'a material with no norm there stays in Materials');
  const cement = tank.find((r) => r.itemId === 'cement')!;
  assert.equal(cement.design.toString(), '960');
  assert.equal(cement.needed.toString(), '96');
  assert.equal(cement.allowed.toString(), '97.92');
  assert.equal(cement.status, 'OVER');
  assert.equal(cement.variancePct, 6.3);
  assert.equal(cement.issued.toString(), '108');
  assert.equal(cement.atFront?.toString(), '6', '120 issued since the week before reporting began, 114 used since');
  assert.equal(cement.lines[0].achievedPerUnit?.toString(), '8.5', 'bags per m³ achieved against the mix of 8');
  assert.equal(tank.find((r) => r.itemId === 'tmt')!.status, 'WITHIN');
  const idle = rows.get('tank-3')![0];
  assert.equal(idle.status, 'NO_WORK');
  assert.equal(idle.design.toString(), '480');
  assert.equal(idle.atFront?.toString(), '0');
  const before = structureRows({ norms: [], activities: new Map(), placed: new Map(), used: [], issued: [], front: null });
  assert.equal(before.size, 0);
});

test('pipe: sizes read from the name, fittings are not pipe, weights turned into metres', () => {
  assert.deepEqual(pipeSizeOf({ name: 'HDPE PE100 110mm PN6' }), { diameterMm: 110, material: 'HDPE' });
  assert.deepEqual(pipeSizeOf({ name: 'DI K7 pipe DN 250' }), { diameterMm: 250, material: 'DI' });
  assert.deepEqual(pipeSizeOf({ name: 'MDPE service pipe 20mm' }), { diameterMm: 20, material: 'MDPE' });
  assert.equal(pipeSizeOf({ name: 'HDPE electrofusion coupler 110mm' }), null);
  assert.equal(pipeSizeOf({ name: 'Ball valve 50mm' }), null);
  assert.equal(pipeSizeOf({ name: 'OPC 53 Grade Cement' }), null);
  assert.deepEqual(pipeSizeOf({ name: 'MS pipe', pipeDiameterMm: 1200, pipeMaterial: 'MS' }), { diameterMm: 1200, material: 'MS' });
  assert.equal(pipeMetres(84, 'Rmt', null), 84);
  assert.equal(pipeMetres(2.95, 'MT', 295), 10);
  assert.equal(pipeMetres(590, 'kg', 295), 2);
  assert.equal(pipeMetres(3, 'MT', null), null, 'by weight with no weight per metre');
  assert.equal(pipeMetres(3, 'Nos', 10), null);
});

test('pipe: cut wastage, pipe at site not laid, balances and flags', () => {
  const zone = pipeRow('HDPE', { scope: 2400, laid: 444, tested: 0, used: 453.3, laidWithUse: 444, issued: 470 }, PIPE_CUT_WASTAGE_PCT.HDPE, false, true);
  assert.equal(zone.wastagePct, 2.1);
  assert.deepEqual(zone.flags, ['WASTAGE_ABOVE']);
  assert.equal(zone.atSite, 16.7, '470 issued − 444 laid − 9.3 cut');
  assert.equal(zone.balanceToLay, 1956);
  assert.equal(zone.balanceToBuy, null);
  const short = pipeRow('HDPE', { scope: 2400, laid: 500, tested: 0, used: 0, laidWithUse: 0, issued: 470 }, 1.5, false, true);
  assert.deepEqual(short.flags, ['LAID_ABOVE_ISSUED']);
  assert.equal(short.wastagePct, null);
  assert.deepEqual(pipeRow('HDPE', { scope: 2400, laid: 500, tested: 0, used: 0, laidWithUse: 0, issued: 0 }, 1.5, false, false).flags, [], 'a zone with no issue tied to it is not checked');
  const project = pipeRow('DI', { scope: 2000, laid: 0, tested: 0, used: 0, laidWithUse: 0, issued: 0, ordered: 1500, received: 1600 }, 1, true, true);
  assert.equal(project.balanceToBuy, 420, '2000 × 1.01 − 1600');
});

test('kits: connections done × the kit against what was issued, in whole kits short', () => {
  const rows = kitRows(D(412), [
    { itemId: 'saddle', perKit: D(1), wastagePct: D(0), issued: D(408), used: D(400) },
    { itemId: 'service', perKit: D(6), wastagePct: D(2), issued: D(2500), used: D(2480) },
    { itemId: 'elbow', perKit: D(2), wastagePct: D(0), issued: D(824), used: D(820) },
    { itemId: 'ferrule', perKit: D(1), wastagePct: D(0), issued: D(450), used: D(410) },
  ]);
  assert.equal(rows[0].status, 'SHORT');
  assert.equal(rows[0].kitsShort, 4);
  assert.equal(rows[1].status, 'OK', '2,472 needed, 2,521.44 allowed');
  assert.equal(rows[2].status, 'OK');
  assert.equal(rows[2].kitsShort, 0);
  assert.equal(rows[3].status, 'OVER');
  assert.equal(kitRows(D(3), [{ itemId: 'service', perKit: D(6), wastagePct: D(0), issued: D(13), used: D(13) }])[0].kitsShort, 1, 'part of a kit short is a kit short');
});

test('exceptions: use with nothing issued in the week before, an issue with no work in the three days after', () => {
  const events = exceptionEvents(
    [
      { date: '2026-10-20', elementId: 'tank-2', itemId: 'cement', quantity: D(92), dprId: 'd1' },
      { date: '2026-10-20', elementId: 'tank-2', itemId: 'cement', quantity: D(10), dprId: 'd1' },
      { date: '2026-10-20', elementId: 'road', itemId: 'bitumen', quantity: D('0.65'), dprId: 'd1' },
      { date: '2026-10-21', elementId: 'zone-2', itemId: 'hdpe', quantity: D(84), dprId: 'd2' },
    ],
    [
      { date: '2026-10-14', elementId: 'tank-2', itemId: 'cement', quantity: D(110), entryId: 'e1', entryNo: 'ISS-1' },
      { date: '2026-10-10', elementId: 'zone-2', itemId: 'hdpe', quantity: D(300), entryId: 'e2', entryNo: 'ISS-2' },
      { date: '2026-10-16', elementId: 'tank-3', itemId: 'cement', quantity: D(40), entryId: 'e3', entryNo: 'ISS-3' },
      { date: '2026-10-22', elementId: 'tank-4', itemId: 'cement', quantity: D(40), entryId: 'e4', entryNo: 'ISS-4' },
    ],
    [
      { date: '2026-10-14', elementId: 'tank-2' },
      { date: '2026-10-11', elementId: 'zone-2' },
    ],
    '2026-10-23',
  );
  const uses = events.filter((e) => e.kind === 'USE_WITHOUT_ISSUE');
  assert.deepEqual(uses.map((e) => e.itemId).sort(), ['bitumen', 'hdpe'], 'cement on tank 2 was issued six days before; HDPE eleven');
  const idle = events.filter((e) => e.kind === 'ISSUE_WITHOUT_WORK');
  assert.deepEqual(idle.map((e) => e.entryNo), ['ISS-3'], 'ISS-4 is too recent to judge');
  assert.equal(events[0].date, '2026-10-21', 'newest first');
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
