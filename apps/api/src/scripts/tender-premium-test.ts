/**
 * Tender premium on item-rate bills (ARCHITECTURE "RA bills", Tender premium): a percentage-rate tender won 4.25% above
 * the schedule of rates bills every BOQ item as tendered at rate × 1.0425, an extra item from a variation at its agreed
 * rate, and a lump-sum contract keeps billing only its unit-rate items at the factor. Also what the contract form
 * refuses and how the premium reads. No database.
 *
 *   node dist/scripts/tender-premium-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { factorOfPremium, premiumOfFactor, takesTenderFactor, tenderPremiumProblem, tenderPremiumWords } from '@erp/shared';
import { billRate, itemRateFactor } from '../ra-bills/ra-bill-pricing';
import type { BillStagePlan } from '../stage-billing/stage-plan';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const D = (v: string | number) => new Prisma.Decimal(v);

const pcc = { id: 'pcc', rate: D('5840.50'), originalQty: D('120') };
const extra = { id: 'extra', rate: D('910'), originalQty: D('0') };
const itemRate = { contractModel: 'ITEM_RATE' as const, tenderFactor: D('1.0425') };

test('a premium becomes a factor and back', () => {
  assert.equal(factorOfPremium(4.25), '1.0425');
  assert.equal(factorOfPremium(-3.5), '0.965');
  assert.equal(factorOfPremium(0), null, 'no premium is billed at the BOQ rates');
  assert.equal(factorOfPremium(null), null);
  assert.equal(premiumOfFactor('1.0425'), 4.25);
  assert.equal(premiumOfFactor('0.965000'), -3.5);
  assert.equal(premiumOfFactor('1'), null);
  assert.equal(premiumOfFactor(null), null);
});

test('the contract form refuses a premium out of range', () => {
  assert.equal(tenderPremiumProblem(null), null);
  assert.equal(tenderPremiumProblem(12.5), null);
  assert.equal(tenderPremiumProblem(-25), null);
  assert.match(tenderPremiumProblem(-75) ?? '', /between -60% and 100%/);
  assert.match(tenderPremiumProblem(150) ?? '', /between/);
  assert.match(tenderPremiumProblem(Number.NaN) ?? '', /as a %/);
});

test('the premium reads above or below the schedule of rates', () => {
  assert.equal(tenderPremiumWords(4.25), '4.25% above the schedule of rates');
  assert.equal(tenderPremiumWords(-3.5), '3.5% below the schedule of rates');
});

test('an item-rate bill prices each tendered item at rate × the factor, to the paisa', () => {
  assert.equal(billRate(pcc, null, itemRate).toFixed(2), '6088.72', '5840.50 × 1.0425 = 6088.72125');
  assert.equal(billRate(pcc, null, { contractModel: 'ITEM_RATE', tenderFactor: D('0.965') }).toFixed(2), '5636.08');
});

test('an extra item from a variation is billed at the rate the client agreed', () => {
  assert.equal(billRate(extra, null, itemRate).toFixed(2), '910.00');
  assert.equal(takesTenderFactor('ITEM_RATE', { originalQty: 0, unitRate: false }), false);
});

test('without a premium the BOQ rate stands', () => {
  assert.equal(billRate(pcc, null, { contractModel: 'ITEM_RATE', tenderFactor: null }).toFixed(2), '5840.50');
  assert.equal(billRate(pcc, null, { contractModel: 'ITEM_RATE', tenderFactor: D(1) }).toFixed(2), '5840.50');
  assert.equal(billRate(pcc, null, null).toFixed(2), '5840.50');
});

test('a lump-sum contract bills only its unit-rate items at the factor, as before', () => {
  const plan = { unitRateBoqItemIds: new Set(['pcc']), tenderFactor: D('1.0425') } as BillStagePlan;
  assert.equal(billRate(pcc, plan, null).toFixed(2), '6088.72');
  assert.equal(billRate({ ...extra, originalQty: D('5') }, plan, null).toFixed(2), '910.00', 'a lump-sum item is paid by its stages');
  assert.equal(takesTenderFactor('LUMP_SUM', { originalQty: 120, unitRate: false }), false);
  // A lump-sum project with no break-up yet: nothing takes the factor.
  assert.equal(billRate(pcc, null, { contractModel: 'LUMP_SUM', tenderFactor: D('1.0425') }).toFixed(2), '5840.50');
});

test('the bill keeps the factor only for an item-rate contract priced with one', () => {
  assert.equal(itemRateFactor(null, itemRate)?.toString(), '1.0425');
  assert.equal(itemRateFactor(null, { contractModel: 'ITEM_RATE', tenderFactor: null }), null);
  assert.equal(itemRateFactor(null, { contractModel: 'LUMP_SUM', tenderFactor: D('1.0425') }), null);
  assert.equal(itemRateFactor({ unitRateBoqItemIds: new Set(), tenderFactor: D('1.0425') } as unknown as BillStagePlan, itemRate), null);
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
