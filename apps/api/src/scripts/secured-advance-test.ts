/**
 * Secured advance and amounts withheld on client RA bills (ARCHITECTURE "RA bills", Secured advance and withheld amounts):
 * the advance on the material at site and the previous one recovered, to the paisa; what stops material, a hold, a
 * release or a close; and what a bill owes, so a receipt of the net payable with the bill's deductions settles it. No
 * database. The voucher it posts is in `books-test.ts`.
 *
 *   node dist/scripts/secured-advance-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { holdBalance, holdCloseProblem, holdProblem, holdReleaseProblem, securedAdvanceOf, securedAdvanceProblem } from '@erp/shared';
import { billOwed } from '../receivables/bill-settlement';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const D = (v: string | number) => new Prisma.Decimal(v);

const cement = { description: 'Cement OPC 53 grade', unit: 'Bag', qtyAtSite: '1200', rate: '410' };
const steel = { description: 'TMT bars Fe 500D', unit: 'MT', qtyAtSite: '18.5', rate: '58200' };

test('the advance is the % of the material value, less the previous bill recovered', () => {
  const sa = securedAdvanceOf({ pct: '75', lines: [cement, steel], previous: '246000' });
  assert.deepEqual(
    sa.lines.map((l) => [l.value, l.advance]),
    [
      [492000, 369000],
      [1076700, 807525],
    ],
  );
  assert.equal(sa.securedAdvance, 1176525);
  assert.equal(sa.recovered, 246000);
  assert.equal(sa.net, 930525);
});

test('once the material is used the bill recovers more than it pays', () => {
  const sa = securedAdvanceOf({ pct: '75', lines: [], previous: '1176525' });
  assert.equal(sa.securedAdvance, 0);
  assert.equal(sa.net, -1176525);
});

test('values and advances round half up to the paisa, as the decimal columns do', () => {
  const tiny = securedAdvanceOf({ pct: '75', lines: [{ ...cement, qtyAtSite: '0.5', rate: '0.01' }], previous: 0 });
  assert.equal(tiny.lines[0].value, 0.01, '0.5 × 0.01 = 0.005 → 0.01');
  assert.equal(tiny.lines[0].advance, 0.01, '0.01 × 75% = 0.0075 → 0.01');
  const odd = securedAdvanceOf({ pct: '75', lines: [{ ...cement, qtyAtSite: '1.005', rate: '1' }], previous: 0 });
  assert.equal(odd.lines[0].value, 1.01, 'float 1.005 is 1.00499…; the bill makes it 1.01');
  assert.equal(D('1.005').mul(1).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber(), odd.lines[0].value);
  const third = securedAdvanceOf({ pct: '33.33', lines: [{ ...cement, qtyAtSite: '3', rate: '1' }], previous: 0 });
  assert.equal(third.lines[0].advance, 1);
});

test('a contract with no % pays nothing on the material', () => {
  assert.equal(securedAdvanceOf({ pct: null, lines: [cement], previous: 0 }).securedAdvance, 0);
});

test('what stops material at site from being saved', () => {
  const ok = { pct: '75', lines: [cement], isFinal: false, om: false };
  assert.equal(securedAdvanceProblem(ok), null);
  assert.equal(securedAdvanceProblem({ ...ok, lines: [], isFinal: true, om: true }), null, 'taking it off is always allowed');
  assert.match(securedAdvanceProblem({ ...ok, om: true })!, /O&M bill takes no secured advance/);
  assert.match(securedAdvanceProblem({ ...ok, isFinal: true })!, /final bill carries no secured advance/);
  assert.match(securedAdvanceProblem({ ...ok, pct: null })!, /set its % on the contract terms/);
  assert.match(securedAdvanceProblem({ ...ok, pct: '0' })!, /set its % on the contract terms/);
  assert.equal(securedAdvanceProblem({ ...ok, lines: [cement, { ...steel, description: ' ' }] }), 'Line 2: name the material');
  assert.equal(securedAdvanceProblem({ ...ok, lines: [{ ...cement, unit: '' }] }), 'Line 1: give the unit');
  assert.equal(securedAdvanceProblem({ ...ok, lines: [{ ...cement, qtyAtSite: '0' }] }), 'Line 1: enter the quantity at site, more than 0');
  assert.equal(securedAdvanceProblem({ ...ok, lines: [{ ...cement, rate: '-1' }] }), 'Line 1: enter the rate it was bought at, more than 0');
});

test('a hold still withholds its amount less what was released and lost', () => {
  assert.equal(holdBalance({ amount: '185000', released: '148000', lost: '0' }), 37000);
  assert.equal(holdBalance({ amount: '185000', released: '148000', lost: '37000' }), 0);
  assert.equal(holdBalance({ amount: 0.3, released: 0.1, lost: 0.2 }), 0, 'no float dust');
});

test('a hold names the item, the reason and an amount', () => {
  const ok = { description: 'Extra lead on earthwork, item 2.04', reason: 'Lead beyond 5 km not accepted by the EE', amount: '185000' };
  assert.equal(holdProblem(ok), null);
  assert.match(holdProblem({ ...ok, description: ' ' })!, /Say what is withheld/);
  assert.match(holdProblem({ ...ok, reason: '' })!, /reason/);
  assert.match(holdProblem({ ...ok, amount: '0' })!, /more than 0/);
});

test('a release comes on a later bill, from an open hold, up to what it still withholds', () => {
  const hold = { billNo: 3, closed: false, balance: 185000 };
  assert.equal(holdReleaseProblem(hold, { billNo: 4, amount: '148000' }), null);
  assert.equal(holdReleaseProblem(hold, { billNo: 5, amount: '185000' }), null, 'all of it');
  assert.equal(holdReleaseProblem({ ...hold, balance: 0.3 }, { billNo: 4, amount: 0.1 + 0.2 }), null, 'to the paisa, not the float');
  assert.match(holdReleaseProblem(hold, { billNo: 3, amount: '1' })!, /bill after the one that withheld it/);
  assert.match(holdReleaseProblem(hold, { billNo: 2, amount: '1' })!, /bill after/);
  assert.match(holdReleaseProblem(hold, { billNo: 4, amount: '0' })!, /more than 0/);
  assert.match(holdReleaseProblem(hold, { billNo: 4, amount: '185000.01' })!, /^Only ₹\s?1,85,000\.00 is still withheld on this hold$/);
  assert.match(holdReleaseProblem({ ...hold, closed: true }, { billNo: 4, amount: '1' })!, /closed/);
});

test('a hold closes once its bill is certified and no open bill releases from it', () => {
  const ok = { closed: false, balance: 37000, billCertified: true, releasedOnOpenBill: false };
  assert.equal(holdCloseProblem(ok), null);
  assert.match(holdCloseProblem({ ...ok, closed: true })!, /already closed/);
  assert.match(holdCloseProblem({ ...ok, billCertified: false })!, /certified/);
  assert.match(holdCloseProblem({ ...ok, releasedOnOpenBill: true })!, /approve or change that bill/);
  assert.match(holdCloseProblem({ ...ok, balance: 0 })!, /Nothing is left/);
});

test('a receipt of the net payable with the bill’s deductions settles what the bill owes', () => {
  const b = {
    grossAmount: D('1000000'),
    pvAmount: D('20000'),
    gstAmount: D('183600'),
    securedAdvance: D('369000'),
    securedAdvanceRecovered: D('246000'),
    withheld: D('185000'),
    withheldReleased: D('148000'),
  };
  const contractDeductions = D('51000').add(D('20400')).add(D('10200')); // retention, TDS, cess on work + PV
  const totalDeductions = contractDeductions.add(b.securedAdvanceRecovered).add(b.withheld);
  const net = b.grossAmount.add(b.pvAmount).add(b.gstAmount).add(b.securedAdvance).add(b.withheldReleased).sub(totalDeductions);
  assert.equal(billOwed(b).toFixed(2), '1289600.00');
  assert.ok(net.add(contractDeductions).eq(billOwed(b)), 'received + the deductions on the receipt = owed');
  const plain = { ...b, securedAdvance: D(0), securedAdvanceRecovered: D(0), withheld: D(0), withheldReleased: D(0) };
  assert.equal(billOwed(plain).toFixed(2), '1203600.00', 'a bill with neither owes its invoice');
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
