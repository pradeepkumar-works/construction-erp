/**
 * Fixed assets: Companies Act depreciation by days (straight line and written down value), the residual floor,
 * depreciation before Nirmaan, Income Tax block depreciation with the 180-day half rate and a sale, disposal gain and
 * loss, run periods, and the vouchers each posts, against golden numbers. CI runs it after the build:
 *
 *   node dist/scripts/fixed-assets-test.js
 */
import assert from 'node:assert/strict';
import {
  TALLY_FIXED_LEDGERS,
  accumulatedTo,
  assetProblem,
  bookDepreciation,
  disposalResult,
  itBlockDepreciation,
  itBlockSchedule,
  runPeriodLabel,
  runPeriodProblem,
  type DepreciableAsset,
} from '@erp/shared';
import { additionLines, depreciationLines, disposalLines } from '../fixed-assets/asset-vouchers';
import { balanced } from '../tally/vouchers';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const laptop: DepreciableAsset = { cost: 60000, residual: 3000, lifeYears: 3, method: 'SLM', putToUseOn: '2026-04-01', opening: null, disposedOn: null };
const excavator: DepreciableAsset = { cost: 1_000_000, residual: 50_000, lifeYears: 9, method: 'WDV', putToUseOn: '2026-04-01', opening: null, disposedOn: null };
const months = (fy: number) => Array.from({ length: 12 }, (_, i) => {
  const y = i < 9 ? fy : fy + 1;
  const m = ((i + 3) % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return [`${y}-${mm}-01`, `${y}-${mm}-${last}`] as const;
});

test('straight line charges (cost less residual) over the life, by the days of the year', () => {
  assert.equal(bookDepreciation(laptop, '2026-10-01', '2026-10-31'), 1613.7);
  assert.equal(accumulatedTo(laptop, '2027-03-31'), 19000);
  const sum = months(2026).reduce((s, [f, t]) => s + Math.round(bookDepreciation(laptop, f, t) * 100), 0);
  assert.equal(sum, 1_900_000, 'twelve monthly runs add up to the year');
  assert.equal(bookDepreciation({ ...laptop, putToUseOn: '2026-10-01' }, '2026-04-01', '2027-03-31'), 9473.97, 'nothing before it is put to use');
});

test('written down value charges the year’s opening value at 1 − (residual ÷ cost)^(1 ÷ life)', () => {
  assert.equal(accumulatedTo(excavator, '2027-03-31'), 283128.84);
  assert.equal(bookDepreciation(excavator, '2027-04-01', '2028-03-31'), 202966.9);
  assert.equal(bookDepreciation({ ...excavator, putToUseOn: '2026-07-15' }, '2026-04-01', '2027-03-31'), 201680.81);
  assert.ok(Math.abs(accumulatedTo(excavator, '2035-03-31') - 950000) <= 1, 'nine years bring it to the residual');
  const sum = months(2027).reduce((s, [f, t]) => s + Math.round(bookDepreciation(excavator, f, t) * 100), 0);
  assert.equal(sum, 20_296_690, 'monthly runs in the second year add up to its charge');
});

test('never below the residual value', () => {
  assert.equal(accumulatedTo(laptop, '2029-03-31'), 57000);
  assert.equal(accumulatedTo(laptop, '2040-03-31'), 57000);
  assert.equal(bookDepreciation(laptop, '2029-04-01', '2030-03-31'), 0);
  assert.equal(accumulatedTo({ ...excavator, method: 'WDV' }, '2060-03-31'), 950000);
});

test('depreciation before Nirmaan stands, and the schedule carries on after it', () => {
  const crusher: DepreciableAsset = { cost: 500000, residual: 25000, lifeYears: 12, method: 'SLM', putToUseOn: '2020-04-01', opening: { asOf: '2026-03-31', amount: 237500 }, disposedOn: null };
  assert.equal(accumulatedTo(crusher, '2026-03-31'), 237500);
  assert.equal(bookDepreciation(crusher, '2026-04-01', '2026-04-30'), 3253.42);
  assert.equal(bookDepreciation(crusher, '2026-04-01', '2027-03-31'), 39583.33);
  assert.equal(bookDepreciation(crusher, '2025-04-01', '2026-03-31'), 0, 'nothing charged again before the opening point');
});

test('a disposed asset is charged up to the day it goes', () => {
  const sold = { ...laptop, disposedOn: '2026-10-15' };
  assert.equal(bookDepreciation(sold, '2026-10-01', '2026-10-31'), 780.82);
  assert.equal(bookDepreciation(sold, '2026-11-01', '2026-11-30'), 0);
});

test('a sale or scrapping gains or loses against the book value', () => {
  assert.deepEqual(disposalResult({ cost: 60000, accumulated: 19000, proceeds: 30000 }), { bookValue: 41000, gain: 0, loss: 11000 });
  assert.deepEqual(disposalResult({ cost: 60000, accumulated: 19000, proceeds: 45000 }), { bookValue: 41000, gain: 4000, loss: 0 });
  assert.deepEqual(disposalResult({ cost: 60000, accumulated: 57000, proceeds: 0 }), { bookValue: 3000, gain: 0, loss: 3000 });
});

test('Income Tax: the block at its rate, half on additions used under 180 days, less sales', () => {
  const y = itBlockDepreciation(0.15, 1_000_000, [{ cost: 200000, putToUseOn: '2026-06-01' }, { cost: 100000, putToUseOn: '2026-12-01' }], 50000, '2026-27');
  assert.equal(y.halfRateAdditions, 100000);
  assert.equal(y.depreciation, 180000);
  assert.equal(y.closingWdv, 1_070_000);
  assert.equal(itBlockDepreciation(0.4, 0, [{ cost: 100000, putToUseOn: '2026-10-03' }], 0, '2026-27').depreciation, 40000, '180 days is a full year');
  assert.equal(itBlockDepreciation(0.4, 0, [{ cost: 100000, putToUseOn: '2026-10-04' }], 0, '2026-27').depreciation, 20000, '179 days is half');
});

test('Income Tax: a sale above the block is a short-term gain, and comes off the full-rate part first', () => {
  assert.deepEqual(itBlockDepreciation(0.15, 100000, [], 150000, '2026-27'), { openingWdv: 100000, additions: 0, halfRateAdditions: 0, disposals: 150000, depreciation: 0, closingWdv: 0, shortTermGain: 50000 });
  const y = itBlockDepreciation(0.15, 0, [{ cost: 100000, putToUseOn: '2027-01-01' }], 30000, '2026-27');
  assert.equal(y.depreciation, 5250);
  assert.equal(y.closingWdv, 64750);
});

test('Income Tax: the block rolls forward from the first year of the register', () => {
  const rows = itBlockSchedule(
    [
      { itBlock: 'PLANT', cost: 1_000_000, putToUseOn: '2025-04-01', disposedOn: null, proceeds: 0 },
      { itBlock: 'PLANT', cost: 400000, putToUseOn: '2026-12-01', disposedOn: null, proceeds: 0 },
      { itBlock: 'COMPUTERS', cost: 60000, putToUseOn: '2023-04-01', disposedOn: '2024-06-01', proceeds: 10000 },
    ],
    '2026-27',
  );
  assert.equal(rows.length, 1, 'a block emptied in an earlier year is left out');
  const ceased = itBlockSchedule([{ itBlock: 'COMPUTERS', cost: 60000, putToUseOn: '2023-04-01', disposedOn: '2024-06-01', proceeds: 10000 }], '2024-25');
  assert.equal(ceased[0].depreciation, 0, 'no depreciation the year the last asset goes');
  assert.equal(ceased[0].shortTermGain, -26000, 'the value left over is a short-term capital loss');
  assert.deepEqual(rows[0], { block: 'PLANT', rate: 0.15, openingWdv: 850000, additions: 400000, halfRateAdditions: 400000, disposals: 0, depreciation: 157500, closingWdv: 1_092_500, shortTermGain: 0 });
});

test('a run covers one financial year at most and never overlaps another', () => {
  assert.equal(runPeriodLabel('2026-10-01', '2026-10-31'), 'October 2026');
  assert.equal(runPeriodLabel('2026-04-01', '2027-03-31'), '2026-27');
  assert.equal(runPeriodProblem('2026-10-01', '2026-10-31', [{ from: '2026-09-01', to: '2026-09-30' }]), null);
  assert.match(runPeriodProblem('2026-10-01', '2026-10-31', [{ from: '2026-04-01', to: '2027-03-31' }])!, /2026-27 already covers/);
  assert.match(runPeriodProblem('2027-03-01', '2027-04-30', [])!, /one financial year/);
  assert.match(runPeriodProblem('2026-10-31', '2026-10-01', [])!, /on or after the start/);
});

test('an asset needs a name, a class, a cost above its residual and a sane life', () => {
  const ok = { name: 'Laptop', assetClass: 'COMPUTERS', cost: 60000, residual: 3000, lifeYears: 3, putToUseOn: '2026-04-01', fundedBy: 'BANK' as const, vendorId: null, opening: null };
  assert.equal(assetProblem(ok), null);
  assert.match(assetProblem({ ...ok, assetClass: 'BOATS' })!, /class/);
  assert.match(assetProblem({ ...ok, residual: 60000 })!, /residual/);
  assert.match(assetProblem({ ...ok, lifeYears: 0 })!, /useful life/);
  assert.match(assetProblem({ ...ok, fundedBy: 'VENDOR' })!, /vendor/);
  assert.match(assetProblem({ ...ok, opening: { asOf: '2026-03-31', amount: 0 } })!, /on or after the day it was put to use/);
  assert.match(assetProblem({ ...ok, opening: { asOf: '2026-09-30', amount: 58000 } })!, /cost less the residual/);
});

const name = (key: string, fallback?: string) => fallback ?? key;
const sides = (lines: { ledgerKey: string; amount: { toFixed: (n: number) => string } }[]) => lines.map((l) => `${l.ledgerKey} ${l.amount.toFixed(2)}`);
const fixed = new Set(TALLY_FIXED_LEDGERS.map((l) => l.key));

test('an addition books the cost to its class from what paid for it, and nothing when it is in the books already', () => {
  assert.deepEqual(sides(additionLines(name, { assetClass: 'COMPUTERS', cost: 60000, fundedBy: 'BANK', vendorId: null, vendorName: null })!), ['COMPUTERS 60000.00', 'BANK -60000.00']);
  assert.deepEqual(sides(additionLines(name, { assetClass: 'VEHICLES', cost: 2_400_000, fundedBy: 'MACHINE_LOAN', vendorId: null, vendorName: null })!), ['VEHICLES 2400000.00', 'MACHINERY -2400000.00']);
  assert.deepEqual(sides(additionLines(name, { assetClass: 'FURNITURE', cost: 5000, fundedBy: 'VENDOR', vendorId: 'v1', vendorName: 'Godrej' })!), ['FURNITURE 5000.00', 'VENDOR:v1 -5000.00']);
  assert.equal(additionLines(name, { assetClass: 'EARTH_MOVING', cost: 3_800_000, fundedBy: 'MACHINE_LOAN', vendorId: null, vendorName: null }), null, 'the loan already booked it to Plant and Machinery');
  assert.equal(additionLines(name, { assetClass: 'COMPUTERS', cost: 60000, fundedBy: 'IN_BOOKS', vendorId: null, vendorName: null }), null);
});

test('a run debits depreciation and credits accumulated depreciation; a disposal clears both and books the loss or gain', () => {
  const run = depreciationLines(name, 1613.7);
  assert.ok(balanced(run));
  assert.deepEqual(sides(run), ['DEPRECIATION 1613.70', 'ACCUMULATED_DEPRECIATION -1613.70']);
  const loss = disposalLines(name, { assetClass: 'COMPUTERS', cost: 60000, accumulated: 19000, proceeds: 30000, mode: 'BANK' });
  assert.ok(balanced(loss));
  assert.deepEqual(sides(loss), ['BANK 30000.00', 'ACCUMULATED_DEPRECIATION 19000.00', 'ASSET_SALE_LOSS 11000.00', 'COMPUTERS -60000.00']);
  const gain = disposalLines(name, { assetClass: 'COMPUTERS', cost: 60000, accumulated: 19000, proceeds: 45000, mode: 'CASH' });
  assert.ok(balanced(gain));
  assert.deepEqual(sides(gain), ['CASH 45000.00', 'ACCUMULATED_DEPRECIATION 19000.00', 'COMPUTERS -60000.00', 'ASSET_SALE_PROFIT -4000.00']);
  for (const k of ['DEPRECIATION', 'ACCUMULATED_DEPRECIATION', 'ASSET_SALE_LOSS', 'ASSET_SALE_PROFIT', 'BUILDINGS', 'MACHINERY', 'VEHICLES', 'FURNITURE', 'OFFICE_EQUIPMENT', 'COMPUTERS'])
    assert.ok(fixed.has(k), `${k} is a ledger the chart of accounts knows`);
});

let failed = 0;
for (const [n, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${n}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${n}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed} of ${cases.length} passed`);
if (failed) process.exit(1);
