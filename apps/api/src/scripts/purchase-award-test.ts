/**
 * Tests for awarding the lowest rate per item. The split is pure, so it needs no
 * database:
 *
 *   node dist/scripts/purchase-award-test.js
 */
import assert from 'node:assert/strict';
import { awardLowestPerItem, finaliseProblem, isSplitWorthwhile, orderStage, rankQuotations, whatsAppShareUrl, type ComparativeStatementDto, type QuoteToRank, type QuotationDto } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

/** A quotation as the comparative statement carries it; only what the split reads is filled in. */
const quote = (id: string, vendorName: string, freight = '0'): QuotationDto =>
  ({
    id,
    materialRequestId: 'mr1',
    requestNo: 'MR-1',
    projectId: 'p1',
    vendorId: `v-${id}`,
    vendorName,
    quoteRef: null,
    quoteDate: '2026-10-01',
    validUntil: null,
    deliveryDays: 7,
    paymentTerms: null,
    freight,
    remarks: null,
    lines: [],
    subtotal: '0',
    gstAmount: '0',
    total: '0',
    missingLines: 0,
    fromSupplier: false,
    createdByName: 'Buyer',
    createdAt: '2026-10-01T00:00:00.000Z',
  }) as QuotationDto;

type Line = ComparativeStatementDto['lines'][number];
const line = (id: string, itemName: string, quantity: string, rates: Line['rates']): Line => ({
  materialRequestItemId: id,
  itemName,
  specification: null,
  unit: 'MT',
  quantity,
  orderedQty: '0',
  rates,
  lowestQuotationId: null,
});

const statement = (quotations: QuotationDto[], lines: Line[]): ComparativeStatementDto => ({
  materialRequestId: 'mr1',
  requestNo: 'MR-1',
  projectId: 'p1',
  projectName: 'Site',
  quotations,
  lines,
  lowestQuotationId: null,
  vendorRecords: [],
});

const cs = statement(
  [quote('q1', 'Steel traders'), quote('q2', 'Cement house')],
  [
    line('i1', 'TMT 12 mm', '10', { q1: { rate: '55000', gstRate: '18', amount: '550000' }, q2: { rate: '56000', gstRate: '18', amount: '560000' } }),
    line('i2', 'Cement OPC 53', '100', { q1: { rate: '420', gstRate: '28', amount: '42000' }, q2: { rate: '400', gstRate: '28', amount: '40000' } }),
  ],
);

test('each item goes to its own lowest vendor, one order each', () => {
  const plan = awardLowestPerItem(cs, { i1: '10', i2: '100' });
  assert.equal(plan.orders.length, 2);
  assert.deepEqual(
    plan.orders.map((o) => [o.vendorName, o.lines.map((l) => l.itemName)]),
    [
      ['Steel traders', ['TMT 12 mm']],
      ['Cement house', ['Cement OPC 53']],
    ],
  );
  assert.equal(isSplitWorthwhile(plan), true);
});

test('the lowest is the landed rate, so a lower GST can win on a higher rate', () => {
  const taxed = statement(
    [quote('q1', 'A'), quote('q2', 'B')],
    [line('i1', 'Pipe', '100', { q1: { rate: '100', gstRate: '18', amount: '10000' }, q2: { rate: '110', gstRate: '5', amount: '11000' } })],
  );
  const plan = awardLowestPerItem(taxed, { i1: '100' });
  assert.deepEqual([plan.orders.length, plan.orders[0].vendorName], [1, 'B']);
});

test('an order is its lines with GST and the vendor’s freight once', () => {
  const freighted = statement(
    [quote('q1', 'Steel traders', '2500')],
    [line('i1', 'TMT 12 mm', '10', { q1: { rate: '55000', gstRate: '18', amount: '550000' } })],
  );
  const plan = awardLowestPerItem(freighted, { i1: '10' });
  const o = plan.orders[0];
  assert.deepEqual([o.subtotal, o.gstAmount, o.freight, o.total], [550000, 99000, 2500, 651500]);
  assert.equal(plan.total, 651500);
});

test('only what is still to order is awarded, and the rest is named', () => {
  const plan = awardLowestPerItem(cs, { i1: '4', i2: '0' });
  assert.equal(plan.orders.length, 1);
  assert.equal(plan.orders[0].lines[0].quantity, 4);
  assert.deepEqual(plan.leftOut, [{ materialRequestItemId: 'i2', itemName: 'Cement OPC 53', reason: 'ordered' }]);
});

test('an item nobody quoted is left out, not guessed', () => {
  const partial = statement(
    [quote('q1', 'A')],
    [line('i1', 'TMT 12 mm', '10', { q1: { rate: '55000', gstRate: '18', amount: '550000' } }), line('i2', 'Binding wire', '20', { q1: null })],
  );
  const plan = awardLowestPerItem(partial, { i1: '10', i2: '20' });
  assert.deepEqual(plan.leftOut, [{ materialRequestItemId: 'i2', itemName: 'Binding wire', reason: 'not quoted' }]);
  assert.equal(plan.orders[0].lines.length, 1);
});

test('the saving is against the cheapest vendor who can supply the lot', () => {
  const plan = awardLowestPerItem(cs, { i1: '10', i2: '100' });
  // Steel traders for both: 550000 × 1.18 + 42000 × 1.28 = 702760. The split: 649000 + 51200 = 700200.
  assert.deepEqual([plan.singleVendor?.vendorName, plan.singleVendor?.total], ['Steel traders', 702760]);
  assert.equal(plan.saving, 2560);
});

test('freight twice over can make the split dearer, and it says so', () => {
  const freighted = statement(
    [quote('q1', 'A', '0'), quote('q2', 'B', '9000')],
    [
      line('i1', 'TMT 12 mm', '1', { q1: { rate: '55000', gstRate: '0', amount: '55000' }, q2: { rate: '56000', gstRate: '0', amount: '56000' } }),
      line('i2', 'Cement', '1', { q1: { rate: '420', gstRate: '0', amount: '420' }, q2: { rate: '400', gstRate: '0', amount: '400' } }),
    ],
  );
  const plan = awardLowestPerItem(freighted, { i1: '1', i2: '1' });
  assert.equal(plan.total, 64400); // 55000 + (400 + 9000)
  assert.deepEqual([plan.singleVendor?.vendorName, plan.singleVendor?.total], ['A', 55420]);
  assert.equal(plan.saving, -8980);
});

test('nothing to order is no plan at all', () => {
  const plan = awardLowestPerItem(cs, {});
  assert.deepEqual([plan.orders.length, plan.total, plan.singleVendor, plan.saving], [0, 0, null, null]);
  assert.equal(isSplitWorthwhile(plan), false);
});

test('one winner is no split to offer', () => {
  const one = statement([quote('q1', 'A'), quote('q2', 'B')], [line('i1', 'TMT 12 mm', '10', { q1: { rate: '55000', gstRate: '18', amount: '550000' }, q2: { rate: '56000', gstRate: '18', amount: '560000' } })]);
  assert.equal(isSplitWorthwhile(awardLowestPerItem(one, { i1: '10' })), false);
});

test('the enquiry link goes to WhatsApp, to that supplier’s number when we have one', () => {
  const link = 'https://site.example/quote/abc';
  assert.equal(whatsAppShareUrl(link, '98765 43210'), `https://wa.me/919876543210?text=${encodeURIComponent(link)}`);
  // No number, or one we cannot dial: WhatsApp asks who to send it to.
  assert.equal(whatsAppShareUrl(link, null), `https://wa.me/?text=${encodeURIComponent(link)}`);
  assert.equal(whatsAppShareUrl(link, '12345'), `https://wa.me/?text=${encodeURIComponent(link)}`);
});

const priced = (id: string, vendorName: string, lines: [string, string, string][], freight = '0'): QuoteToRank => ({
  id,
  vendorId: `v-${id}`,
  vendorName,
  freight,
  lines: lines.map(([materialRequestItemId, rate, gstRate]) => ({ materialRequestItemId, rate, gstRate })),
});
const a = priced('qa', 'A', [['i1', '100', '18'], ['i2', '50', '18']]);
const b = priced('qb', 'B', [['i1', '90', '18'], ['i2', '55', '18']], '200');
const c = priced('qc', 'C', [['i1', '80', '18']]);

test('L1, L2 rank by what is still to order at each rate, with GST and freight; a quote leaving an item out is not ranked', () => {
  const ranked = rankQuotations([a, b, c], { i1: '10', i2: '20' });
  // A: 1000 + 1000 = 2000 + 18% = 2360. B: 900 + 1100 = 2000 + 18% + 200 freight = 2560. C misses i2.
  assert.deepEqual(ranked.map((r) => [r.vendorName, r.rank, r.total, r.missing]), [['A', 1, 2360, 0], ['B', 2, 2560, 0], ['C', null, 944, 1]]);
});

test('once an item is ordered the ranking is over what is left, so the cheaper vendor for it becomes L1', () => {
  const ranked = rankQuotations([a, b, c], { i1: '10', i2: '0' });
  assert.deepEqual(ranked.map((r) => [r.vendorName, r.rank]), [['C', 1], ['A', 2], ['B', 3]]);
});

test('a tie goes to the quotation taken first', () => {
  const twin = priced('qd', 'D', [['i1', '100', '18'], ['i2', '50', '18']]);
  assert.deepEqual(rankQuotations([a, twin], { i1: '10', i2: '20' }).map((r) => r.rank), [1, 2]);
});

test('the stage: no quotes, waiting while an enquiry is open, L1 to finalise, finalised', () => {
  const toOrder = { i1: '10', i2: '20' };
  const today = '2026-10-27';
  assert.equal(orderStage({ toOrder, quotations: [], enquiries: [], final: null }, today), 'TO_ENQUIRE');
  const open = { closesOn: '2026-10-30', invited: 3, replied: 1 };
  assert.equal(orderStage({ toOrder, quotations: [a], enquiries: [open], final: null }, today), 'AWAITING_QUOTES');
  // Everyone replied, or the closing day passed: nothing more to wait for.
  assert.equal(orderStage({ toOrder, quotations: [a], enquiries: [{ ...open, replied: 3 }], final: null }, today), 'TO_FINALISE');
  assert.equal(orderStage({ toOrder, quotations: [a], enquiries: [{ ...open, closesOn: '2026-10-26' }], final: null }, today), 'TO_FINALISE');
  // Finalised comes first, even with an enquiry still open.
  assert.equal(orderStage({ toOrder, quotations: [a], enquiries: [open], final: { quotationId: 'qa', split: false } }, today), 'READY');
  assert.equal(orderStage({ toOrder, quotations: [a, b], enquiries: [], final: { quotationId: null, split: true } }, today), 'READY');
});

test('a finalised quote that prices nothing left (its order raised) sends the rest back to quotations', () => {
  const today = '2026-10-27';
  // C was finalised for i1 and ordered; i2 is left and only A and B quote it.
  assert.equal(orderStage({ toOrder: { i1: '0', i2: '20' }, quotations: [a, b, c], enquiries: [], final: { quotationId: 'qc', split: false } }, today), 'TO_FINALISE');
  // Its quotation deleted: the choice is gone with it.
  assert.equal(orderStage({ toOrder: { i1: '10', i2: '20' }, quotations: [a], enquiries: [], final: { quotationId: null, split: false } }, today), 'TO_FINALISE');
  // Quotes only for what is already ordered: the rest still needs quotations.
  assert.equal(orderStage({ toOrder: { i1: '0', i2: '20' }, quotations: [c], enquiries: [], final: null }, today), 'TO_ENQUIRE');
});

test('finalising L1 needs no reason; anything else does', () => {
  const ranked = rankQuotations([a, b, c], { i1: '10', i2: '20' });
  assert.equal(finaliseProblem(ranked, { quotationId: 'qa' }, null), null);
  assert.match(finaliseProblem(ranked, { quotationId: 'qb' }, null)!, /B is L2, not the lowest/);
  assert.match(finaliseProblem(ranked, { quotationId: 'qb' }, 'ok')!, /at least 5/);
  assert.equal(finaliseProblem(ranked, { quotationId: 'qb' }, 'Delivers in 2 days, A takes 3 weeks'), null);
  assert.match(finaliseProblem(ranked, { quotationId: 'qc' }, null)!, /does not quote one item/);
  assert.match(finaliseProblem(ranked, { quotationId: 'nope' }, 'whatever reason')!, /Choose one of the quotations/);
  assert.equal(finaliseProblem(ranked, { split: true }, null), null);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`Awarding the lowest per item and finalising L1: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
