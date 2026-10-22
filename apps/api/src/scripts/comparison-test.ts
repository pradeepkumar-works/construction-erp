/**
 * Subcontract enquiries' tests (v6 item 111): a quote's totals, the comparative statement (lowest rate per item, the
 * spread, complete quotes ranked with ties sharing a rank, the margin on the client's rates) and what stops an award
 * or a change to the items, with no database. CI runs it after the build:
 *
 *   node dist/scripts/comparison-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { awardProblem, compare, itemsProblem, quoteTotals, type CmpItem, type CmpQuote } from '../subcontracts/comparison-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const s = (v: Prisma.Decimal | null) => (v ? v.toFixed(2) : null);
const day = new Date('2026-11-02');

// Brickwork 850 cum (client pays ₹6,400), plaster 4,200 sqm (client ₹310), and scaffolding as the enquiry's own item.
const items: CmpItem[] = [
  { id: 'brick', quantity: D(850), clientRate: D(6400) },
  { id: 'plaster', quantity: D(4200), clientRate: D(310) },
  { id: 'scaffold', quantity: D(1), clientRate: null },
];
const quote = (id: string, rates: Record<string, number>, gst = 18, received: Date | null = day): CmpQuote => ({
  id,
  receivedOn: received,
  gstRate: D(gst),
  rates: new Map(Object.entries(rates).map(([k, v]) => [k, D(v)])),
});

test('a quote totals its priced items, then GST on the total', () => {
  const t = quoteTotals(items, quote('a', { brick: 4850.5, plaster: 198, scaffold: 45000 }));
  // 850 × 4,850.50 = 41,22,925; 4,200 × 198 = 8,31,600; + 45,000.
  assert.equal(s(t.total), '4999525.00');
  assert.equal(s(t.gst), '899914.50');
  assert.equal(s(t.totalWithGst), '5899439.50');
  assert.equal(t.priced, 3);
  assert.equal(t.complete, true);
  const part = quoteTotals(items, quote('b', { brick: 4700 }));
  assert.equal(part.priced, 1);
  assert.equal(part.complete, false);
  assert.equal(s(part.total), '3995000.00');
});

test('each item shows its lowest rate, whose it is, and how far apart the rates are', () => {
  const c = compare(items, [quote('a', { brick: 4850, plaster: 198, scaffold: 45000 }), quote('b', { brick: 4700, plaster: 210, scaffold: 45000 }), quote('c', { brick: 5100 })]);
  const brick = c.items.find((i) => i.itemId === 'brick')!;
  assert.equal(s(brick.lowestRate), '4700.00');
  assert.deepEqual(brick.lowestQuoteIds, ['b']);
  // 5,100 is 8.51% above 4,700.
  assert.equal(s(brick.spreadPct), '8.51');
  const scaffold = c.items.find((i) => i.itemId === 'scaffold')!;
  assert.deepEqual(scaffold.lowestQuoteIds, ['a', 'b']);
  assert.equal(s(scaffold.spreadPct), '0.00');
});

test('only complete quotes received are ranked; ties share a rank', () => {
  const c = compare(items, [
    quote('a', { brick: 4800, plaster: 200, scaffold: 40000 }),
    quote('b', { brick: 4800, plaster: 200, scaffold: 40000 }, 0),
    quote('c', { brick: 4000 }),
    quote('d', { brick: 4900, plaster: 205, scaffold: 40000 }),
    quote('e', {}, 18, null),
  ]);
  const rank = (id: string) => c.quotes.find((q) => q.quoteId === id)!.rank;
  assert.equal(rank('a'), 1);
  assert.equal(rank('b'), 1);
  assert.equal(rank('d'), 3);
  assert.equal(rank('c'), null);
  assert.equal(rank('e'), null);
  assert.deepEqual(c.lowestIds.sort(), ['a', 'b']);
  // GST does not decide the order: b charges none but ties with a.
  assert.equal(c.quotes.find((q) => q.quoteId === 'b')!.gst.toFixed(2), '0.00');
});

test("the margin is on the client's value of the BOQ items the quote priced", () => {
  const c = compare(items, [quote('a', { brick: 4800, plaster: 248, scaffold: 40000 }), quote('p', { plaster: 310 })]);
  // Client: 850 × 6,400 + 4,200 × 310 = 54,40,000 + 13,02,000 = 67,42,000.
  assert.equal(s(c.clientValue), '6742000.00');
  // Quote a on the BOQ items: 40,80,000 + 10,41,600 = 51,21,600; 24.03% under the client.
  assert.equal(s(c.quotes[0].marginPct), '24.03');
  // A partial quote is measured on its own items: plaster at the client's rate leaves nothing.
  assert.equal(s(c.quotes[1].marginPct), '0.00');
  assert.equal(compare([{ id: 'own', quantity: D(1), clientRate: null }], []).clientValue, null);
});

test('an award needs a complete received quote, and a reason when it is not the lowest', () => {
  const l1 = { received: true, complete: true, rank: 1 };
  assert.equal(awardProblem('OPEN', false, l1, null), null);
  assert.match(awardProblem('OPEN', false, { ...l1, rank: 2 }, '')!, /not the lowest/);
  assert.equal(awardProblem('OPEN', false, { ...l1, rank: 2 }, 'L1 has no labour on site this month'), null);
  assert.match(awardProblem('OPEN', false, { ...l1, complete: false, rank: null }, 'x')!, /every item/);
  assert.match(awardProblem('OPEN', false, { received: false, complete: false, rank: null }, 'x')!, /not in yet/);
  assert.match(awardProblem('CANCELLED', false, l1, null)!, /cancelled/);
  assert.match(awardProblem('AWARDED', true, l1, null)!, /already awarded/);
  // Its work order was deleted: it can be awarded again.
  assert.equal(awardProblem('AWARDED', false, l1, null), null);
  assert.match(awardProblem('OPEN', false, null, null)!, /Choose/);
});

test('the items change only while open and before any rates are in', () => {
  assert.equal(itemsProblem('OPEN', 0), null);
  assert.match(itemsProblem('OPEN', 1)!, /new enquiry/);
  assert.match(itemsProblem('AWARDED', 0)!, /open enquiry/);
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
