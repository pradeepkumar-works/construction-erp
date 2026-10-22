/**
 * Tender bidding's tests (v6 item 110): an item priced from its rate analysis, the rate quoted on a percentage or an
 * item-rate tender, the bid's totals against the SOR, the bids ranked, the moves a tender may make, what stops a bid
 * going in and the checks on an SOR row, with no database. CI runs it after the build:
 *
 *   node dist/scripts/tenders-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { daysToSubmit, fyStart, moveProblem, pctOver, priceItem, quotedRateOf, rankBids, sorRowProblem, submitProblem, tenderTotals, withPct, type ItemInput, type Terms } from '../tenders/tender-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const s = (v: Prisma.Decimal | null) => (v ? v.toFixed(2) : null);

const pctTerms: Terms = { bidType: 'PERCENTAGE', pct: D('-4.5'), overheadPct: D(10), profitPct: D(8) };
const itemTerms: Terms = { bidType: 'ITEM_RATE', pct: null, overheadPct: D(10), profitPct: D(8) };
// One cum of PCC: 3.4 bags of cement at ₹380 (2% wastage), 0.47 cum sand at ₹1,800, 2 helper-days at ₹600, 0.4 mixer hours at ₹450.
const pcc: ItemInput = {
  qty: D(120),
  sorRate: D(6200),
  ownRate: null,
  lines: [
    { kind: 'MATERIAL', qtyPerUnit: D('3.4'), wastagePct: D(2), rate: D(380) },
    { kind: 'MATERIAL', qtyPerUnit: D('0.47'), wastagePct: D(0), rate: D(1800) },
    { kind: 'LABOUR', qtyPerUnit: D(2), wastagePct: D(0), rate: D(600) },
    { kind: 'EQUIPMENT', qtyPerUnit: D('0.4'), wastagePct: D(0), rate: D(450) },
  ],
};

test('an item is priced from its analysis: wastage on materials, overheads and profit on the cost', () => {
  const p = priceItem(pcc, itemTerms);
  // 3.468 bags × 380 = 1,317.84; 0.47 × 1,800 = 846.
  assert.equal(s(p.material), '2163.84');
  assert.equal(s(p.labour), '1200.00');
  assert.equal(s(p.equipment), '180.00');
  assert.equal(s(p.cost), '3543.84');
  assert.equal(s(p.overheads), '354.38');
  assert.equal(s(p.profit), '283.51');
  assert.equal(s(p.builtUpRate), '4181.73');
  assert.deepEqual(p.lineAmounts.map(s), ['1317.84', '846.00', '1200.00', '180.00']);
  assert.equal(p.unpriced, 0);
  assert.equal(s(p.sorAmount), '744000.00');
});

test('a percentage tender quotes the SOR rate with its percentage; an item-rate tender its own or built-up rate', () => {
  assert.equal(s(withPct(D(6200), D('-4.5'))), '5921.00');
  assert.equal(s(withPct(D('99.99'), D('12.25'))), '112.24');
  assert.equal(s(priceItem(pcc, pctTerms).quotedRate), '5921.00');
  assert.equal(s(priceItem(pcc, pctTerms).quotedAmount), '710520.00');
  assert.equal(quotedRateOf(pctTerms, null, null, D(100)), null, 'no SOR rate, nothing to put the percentage on');
  assert.equal(quotedRateOf({ ...pctTerms, pct: null }, D(100), null, null), null, 'no percentage yet');
  assert.equal(s(quotedRateOf({ ...pctTerms, pct: D(0) }, D(100), null, null)), '100.00', 'at par');
  assert.equal(s(priceItem(pcc, itemTerms).quotedRate), '4181.73');
  assert.equal(s(priceItem({ ...pcc, ownRate: D(4500) }, itemTerms).quotedRate), '4500.00', 'a rate of its own wins');
  assert.equal(priceItem({ ...pcc, lines: [] }, itemTerms).quotedRate, null);
});

test('a line without a rate is counted unpriced and leaves out of the cost', () => {
  const p = priceItem({ ...pcc, lines: [...pcc.lines, { kind: 'LABOUR', qtyPerUnit: D(1), wastagePct: D(0), rate: null }] }, itemTerms);
  assert.equal(p.unpriced, 1);
  assert.equal(s(p.cost), '3543.84');
  assert.equal(p.lineAmounts[4], null);
});

const steel: ItemInput = { qty: D(18), sorRate: D(78500), ownRate: null, lines: [{ kind: 'MATERIAL', qtyPerUnit: D('1.02'), wastagePct: D(3), rate: D(62000) }] };

test('the bid adds up against the SOR: cost, built-up and quoted, each as a percentage, and the margin', () => {
  const items = [pcc, steel].map((i) => ({ qty: i.qty, priced: priceItem(i, pctTerms) }));
  const t = tenderTotals(items, pctTerms, D(2_000_000));
  assert.equal(t.itemCount, 2);
  assert.equal(t.analysedCount, 2);
  // 744,000 + 18 × 78,500 = 1,413,000.
  assert.equal(s(t.sorAmount), '2157000.00', 'the BOQ at SOR rates, not the estimate');
  assert.equal(s(t.quotedAmount), '2059935.00');
  assert.equal(t.quotedPct, '-4.50');
  // Steel: 1.0506 MT × 62,000 = 65,137.20 a tonne.
  assert.equal(s(t.costAmount), '1597730.40');
  assert.equal(t.costPct, '-25.93');
  assert.equal(s(t.margin!), s(t.quotedAmount!.minus(t.costAmount).minus(t.overheads)));
  assert.equal(s(t.builtUpAmount), s(t.costAmount.plus(t.overheads).plus(t.profit)));
});

test('a quote needs every item priced; a percentage tender with no BOQ quotes on the estimate', () => {
  const half = tenderTotals([{ qty: pcc.qty, priced: priceItem(pcc, pctTerms) }, { qty: D(5), priced: priceItem({ qty: D(5), sorRate: null, ownRate: null, lines: [] }, pctTerms) }], pctTerms, null);
  assert.equal(half.quotedAmount, null);
  assert.equal(half.margin, null, 'not every item analysed');
  assert.equal(half.costPct, null);
  const bare = tenderTotals([], pctTerms, D(10_000_000));
  assert.equal(s(bare.sorAmount), '10000000.00');
  assert.equal(s(bare.quotedAmount), '9550000.00');
  assert.equal(bare.quotedPct, '-4.50');
  assert.equal(tenderTotals([], itemTerms, D(10_000_000)).quotedAmount, null);
});

test('percentages against a base', () => {
  assert.equal(pctOver(D(104), D(100)), '4.00');
  assert.equal(pctOver(D('95.555'), D(100)), '-4.45');
  assert.equal(pctOver(D(1), D(0)), null);
  assert.equal(pctOver(null, D(100)), null);
});

test('bids rank lowest first, equal bids share a place, ours among them', () => {
  const r = rankBids({ name: 'Us', amount: D(980) }, [
    { id: 'a', name: 'Kalinga', amount: D(1010) },
    { id: 'b', name: 'Mahanadi', amount: D(960) },
    { id: 'c', name: 'Utkal', amount: D(980) },
  ]);
  assert.deepEqual(
    r.map((b) => [b.name, b.rank, b.us]),
    [
      ['Mahanadi', 1, false],
      ['Us', 2, true],
      ['Utkal', 2, false],
      ['Kalinga', 4, false],
    ],
  );
  assert.equal(rankBids({ name: 'Us', amount: null }, [{ id: 'a', name: 'A', amount: D(5) }]).length, 1, 'no quote, not ranked');
});

test('a tender moves forward to its result, or back one step; a project holds it', () => {
  assert.equal(moveProblem('PREPARING', 'SUBMITTED', false), null);
  assert.equal(moveProblem('SUBMITTED', 'WON', false), null);
  assert.equal(moveProblem('WON', 'SUBMITTED', false), null, 'a result recorded by mistake');
  assert.equal(moveProblem('DROPPED', 'PREPARING', false), null);
  assert.match(moveProblem('PREPARING', 'WON', false)!, /as submitted before its result/);
  assert.match(moveProblem('LOST', 'DROPPED', false)!, /cannot move/);
  assert.match(moveProblem('WON', 'SUBMITTED', true)!, /already a project/);
});

test('a bid goes in with its percentage, or a rate on every item', () => {
  const q = (n: string, r: number | null) => ({ itemNo: n, quotedRate: r === null ? null : D(r) });
  assert.equal(submitProblem('PERCENTAGE', [q('1', 10)], D(-2), D(10)), null);
  assert.match(submitProblem('PERCENTAGE', [q('1', 10)], null, D(10))!, /percentage above or below/);
  assert.match(submitProblem('PERCENTAGE', [q('1', 10), q('2', null)], D(1), null)!, /item 2 an SOR rate/);
  assert.match(submitProblem('ITEM_RATE', [q('1', null), q('2', null), q('3', null), q('4', null)], null, null)!, /Price items 1, 2, 3…/);
  assert.match(submitProblem('ITEM_RATE', [], null, null)!, /Add the bid BOQ/);
});

test('an SOR row needs a code, description, unit and a rate of zero or more', () => {
  const ok = { code: '4.1', description: 'PCC 1:4:8', unit: 'cum', rate: '6200' };
  assert.equal(sorRowProblem(ok), null);
  assert.equal(sorRowProblem({ ...ok, rate: '0' }), null);
  assert.match(sorRowProblem({ ...ok, code: ' ' })!, /code/);
  assert.match(sorRowProblem({ ...ok, unit: '' })!, /unit/);
  assert.match(sorRowProblem({ ...ok, rate: 'Rs 10' })!, /not a number/);
  assert.match(sorRowProblem({ ...ok, rate: '' })!, /not a number/);
  assert.match(sorRowProblem({ ...ok, rate: '-1' })!, /below zero/);
});

test('days to submit and the financial year', () => {
  assert.equal(daysToSubmit('2026-10-30', '2026-10-22'), 8);
  assert.equal(daysToSubmit('2026-10-20', '2026-10-22'), -2);
  assert.equal(fyStart('2026-10-22'), '2026-04-01');
  assert.equal(fyStart('2027-03-31'), '2026-04-01');
  assert.equal(fyStart('2027-04-01'), '2027-04-01');
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
