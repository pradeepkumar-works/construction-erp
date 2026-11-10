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
  openingAsOfNeeded,
  runPeriodLabel,
  runCharge,
  runPeriodProblem,
  runStepProblem,
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

test('a run covers one financial year at most, never overlaps another and never runs past today', () => {
  const today = '2026-11-10';
  assert.equal(runPeriodLabel('2026-10-01', '2026-10-31'), 'October 2026');
  assert.equal(runPeriodLabel('2026-04-01', '2027-03-31'), '2026-27');
  assert.equal(runPeriodProblem('2026-10-01', '2026-10-31', [{ from: '2026-09-01', to: '2026-09-30' }], today), null);
  assert.match(runPeriodProblem('2026-10-01', '2026-10-31', [{ from: '2026-04-01', to: '2027-03-31' }], today)!, /2026-27 already covers/);
  assert.match(runPeriodProblem('2027-03-01', '2027-04-30', [], today)!, /one financial year/);
  assert.match(runPeriodProblem('2026-10-31', '2026-10-01', [], today)!, /on or after the start/);
  assert.match(runPeriodProblem('2026-08-01', '2026-08-31', [{ from: '2026-09-01', to: '2026-09-30' }], today)!, /September 2026 is already prepared, and runs go in order/);
  assert.match(runPeriodProblem('2026-11-01', '2026-11-30', [], today)!, /November 2026 runs past today/, 'this month, before it ends');
  assert.match(runPeriodProblem('2026-04-01', '2027-03-31', [], today)!, /2026-27 runs past today/, 'the year, before it ends');
  assert.equal(runPeriodProblem('2026-11-01', '2026-11-10', [], today), null, 'a period ending today');
});

test('runs come out latest first and go into the books in order', () => {
  const sep = { from: '2026-09-01', to: '2026-09-30' };
  const oct = { from: '2026-10-01', to: '2026-10-31' };
  assert.match(runStepProblem('undo', sep, [{ ...oct, status: 'DRAFT' }])!, /October 2026 comes after this run/);
  assert.match(runStepProblem('delete', sep, [{ ...oct, status: 'POSTED' }])!, /latest first/);
  assert.equal(runStepProblem('refresh', oct, [{ ...sep, status: 'POSTED' }]), null);
  assert.match(runStepProblem('post', oct, [{ ...sep, status: 'DRAFT' }])!, /Post depreciation for September 2026 first/);
  assert.equal(runStepProblem('post', oct, [{ ...sep, status: 'POSTED' }]), null);
});

test('a run catches up the days the runs before it missed: an asset entered after April to September was posted', () => {
  // Nothing charged before October: April to October in one line, from the day it was put to use.
  const late = runCharge(laptop, '2026-10-01', '2026-10-31', 0, null)!;
  assert.deepEqual(late, { amount: bookDepreciation(laptop, '2026-04-01', '2026-10-31'), from: '2026-04-01', to: '2026-10-31' });
  assert.equal(late.amount, 11139.73);
  // Charged up to September: October alone, the same as the schedule's month.
  const upToSep = bookDepreciation(laptop, '2026-04-01', '2026-09-30');
  assert.deepEqual(runCharge(laptop, '2026-10-01', '2026-10-31', upToSep, '2026-09-30'), { amount: 1613.7, from: '2026-10-01', to: '2026-10-31' });
  // Charged up to August only: September and October, from 1 September.
  assert.equal(runCharge(laptop, '2026-10-01', '2026-10-31', bookDepreciation(laptop, '2026-04-01', '2026-08-31'), '2026-08-31')!.from, '2026-09-01');
  // Fully charged: no line.
  assert.equal(runCharge(laptop, '2029-04-01', '2029-04-30', 57000, '2029-03-31'), null);
  // Sold on 15 October: the line stops there.
  assert.equal(runCharge({ ...laptop, disposedOn: '2026-10-15' }, '2026-10-01', '2026-10-31', upToSep, '2026-09-30')!.to, '2026-10-15');
});

test('an asset needs a name, a class, a cost above its residual and a sane life', () => {
  const ok = { name: 'Laptop', assetClass: 'COMPUTERS', method: 'SLM' as const, cost: 60000, residual: 3000, lifeYears: 3, putToUseOn: '2026-04-01', fundedBy: 'BANK' as const, vendorId: null, opening: null, booksFrom: null };
  const inBooks = { ...ok, fundedBy: 'IN_BOOKS' as const };
  assert.equal(assetProblem(ok), null);
  assert.match(assetProblem({ ...ok, assetClass: 'BOATS' })!, /class/);
  assert.match(assetProblem({ ...ok, residual: 60000 })!, /residual/);
  assert.match(assetProblem({ ...ok, lifeYears: 0 })!, /useful life/);
  assert.match(assetProblem({ ...ok, fundedBy: 'VENDOR' })!, /vendor/);
  assert.match(assetProblem({ ...inBooks, opening: { asOf: '2026-03-31', amount: 0 } })!, /on or after the day it was put to use/);
  assert.match(assetProblem({ ...inBooks, opening: { asOf: '2026-09-30', amount: 58000 } })!, /cost less the residual/);
});

test('written down value needs a residual above zero, which its rate brings the cost down to', () => {
  const wdv = { name: 'Tipper', assetClass: 'VEHICLES', method: 'WDV' as const, cost: 1_800_000, residual: 0, lifeYears: 8, putToUseOn: '2026-04-01', fundedBy: 'BANK' as const, vendorId: null, opening: null, booksFrom: null };
  assert.match(assetProblem(wdv)!, /residual value above zero for written down value/);
  assert.equal(assetProblem({ ...wdv, residual: 90000 }), null);
  assert.equal(assetProblem({ ...wdv, method: 'SLM' }), null, 'straight line may run down to nothing');
});

test('depreciation before Nirmaan goes only on an asset already in the books', () => {
  const crusher = { name: 'Crusher', assetClass: 'CONCRETING', method: 'SLM' as const, cost: 500000, residual: 25000, lifeYears: 12, putToUseOn: '2026-05-01', vendorId: null, opening: { asOf: '2026-09-30', amount: 15000 }, booksFrom: null };
  assert.match(assetProblem({ ...crusher, fundedBy: 'BANK' })!, /only on an asset already in the books/);
  assert.match(assetProblem({ ...crusher, fundedBy: 'CASH' })!, /Choose Already in the books/);
  assert.equal(assetProblem({ ...crusher, fundedBy: 'IN_BOOKS' }), null);
});

test('an asset put to use before the books begin needs its depreciation up to the day before', () => {
  // Books from 1 April 2026, an excavator in use since April 2020: entered with no opening, October's run would charge
  // six and a half years of catch-up that the opening balances already hold.
  const excavatorIn2020 = { name: 'Excavator', assetClass: 'EARTH_MOVING', method: 'SLM' as const, cost: 4_200_000, residual: 210_000, lifeYears: 9, putToUseOn: '2020-04-01', fundedBy: 'IN_BOOKS' as const, vendorId: null, booksFrom: '2026-04-01' };
  assert.equal(openingAsOfNeeded(excavatorIn2020, '2026-04-01'), '2026-03-31');
  assert.equal(openingAsOfNeeded({ ...excavatorIn2020, putToUseOn: '2026-04-01' }, '2026-04-01'), null, 'put to use the day the books begin');
  assert.equal(openingAsOfNeeded(excavatorIn2020, null), null, 'no books start set');
  assert.equal(openingAsOfNeeded({ ...excavatorIn2020, fundedBy: 'BANK' }, '2026-04-01'), null, 'a purchase before the books is refused as such');
  assert.match(assetProblem({ ...excavatorIn2020, opening: null })!, /Enter the depreciation charged up to 31 Mar 2026, the day before the books begin/);
  assert.match(assetProblem({ ...excavatorIn2020, opening: { asOf: '2025-03-31', amount: 2_000_000 } })!, /up to 31 Mar 2026/, 'an opening to another day');
  const opening = { asOf: '2026-03-31', amount: accumulatedTo({ ...excavatorIn2020, opening: null, disposedOn: null }, '2026-03-31') };
  assert.equal(assetProblem({ ...excavatorIn2020, opening }), null);
  const asset: DepreciableAsset = { ...excavatorIn2020, opening, disposedOn: null };
  assert.deepEqual(runCharge(asset, '2026-10-01', '2026-10-31', bookDepreciation(asset, '2026-04-01', '2026-09-30'), '2026-09-30'), { amount: bookDepreciation(asset, '2026-10-01', '2026-10-31'), from: '2026-10-01', to: '2026-10-31' }, 'with it, October charges October alone');
  const none: DepreciableAsset = { ...excavatorIn2020, opening: null, disposedOn: null };
  assert.deepEqual(runCharge(none, '2026-10-01', '2026-10-31', 0, null), { amount: 2_919_926.92, from: '2020-04-01', to: '2026-10-31' }, 'without it, October charges the years before the books');
  assert.equal(opening.amount, 2_659_999.98);
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
