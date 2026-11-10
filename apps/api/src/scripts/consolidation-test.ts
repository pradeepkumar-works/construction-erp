/**
 * Consolidated accounts' tests (item 192, ARCHITECTURE "Consolidated accounts"): sums by statement line, sales and
 * balances between sisters that match and that do not, a company with no links, a link to a company outside the group,
 * and how far a company's figures run against its lock. Golden figures, no database. CI runs it:
 *
 *   node dist/scripts/consolidation-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { consolidationNote, type ConsolidatedRowDto, type StatementLine } from '@erp/shared';
import { companyPeriod, consolidate, eliminations, type CompanyFigures, type SisterFigure } from '../group/consolidation-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const D = (v: number) => new Prisma.Decimal(v);
const company = (id: string, lines: Partial<Record<StatementLine, number>>, sisters: [string, SisterFigure['kind'], StatementLine, number][] = []): CompanyFigures => ({
  id,
  name: id.toUpperCase(),
  lines: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, D(v)])),
  sisters: sisters.map(([sisterId, kind, line, amount]) => ({ sisterId, kind, line, amount: D(amount) })),
});
const row = (rows: ConsolidatedRowDto[], key: string) => {
  const r = rows.find((x) => x.key === key);
  assert.ok(r, `row ${key}`);
  return r;
};
const bs = (c: ReturnType<typeof consolidate>, key: string) => {
  const r = [...c.balanceSheet.sections.flatMap((s) => [...s.rows, s.total]), c.balanceSheet.totalAssets, c.balanceSheet.totalLiabilities].find((x) => x.key === key);
  assert.ok(r, `row ${key}`);
  return r;
};

// The holding has its own income and no sisters named; the projects company and the lab trade with each other.
const holding = company('h', { OTHER_INCOME: 100, EMPLOYEE: 40, INVESTMENTS: 500, SHARE_CAPITAL: 440, RESERVES: 60 });
const projectsMatched = company('p', { REVENUE: 1000, CONSTRUCTION: 600, OTHER_EXPENSES: 200, CASH: 1000, TRADE_PAYABLES: 236, SHARE_CAPITAL: 564, RESERVES: 200 }, [
  ['l', 'TURNOVER', 'OTHER_EXPENSES', 200],
  ['l', 'BALANCE', 'TRADE_PAYABLES', 236],
]);
const labMatched = company('l', { REVENUE: 200, EMPLOYEE: 120, TRADE_RECEIVABLES: 236, CASH: 64, SHARE_CAPITAL: 220, RESERVES: 80 }, [
  ['p', 'TURNOVER', 'REVENUE', 200],
  ['p', 'BALANCE', 'TRADE_RECEIVABLES', 236],
]);
const both = [
  { companyId: 'p', sisterId: 'l' },
  { companyId: 'l', sisterId: 'p' },
];

test('a company with no links passes through: the group is the sum by line', () => {
  const c = consolidate([holding, company('p', { REVENUE: 1000, CONSTRUCTION: 600, CASH: 400, SHARE_CAPITAL: 400 })], []);
  assert.deepEqual(row(c.profitLoss, 'REVENUE'), { key: 'REVENUE', line: 'REVENUE', label: 'Revenue from operations', companies: { h: '0.00', p: '1000.00' }, eliminated: '0.00', group: '1000.00', total: false });
  assert.equal(row(c.profitLoss, 'TOTAL_INCOME').group, '1100.00');
  assert.equal(row(c.profitLoss, 'TOTAL_EXPENSES').group, '640.00');
  assert.equal(row(c.profitLoss, 'PROFIT').group, '460.00');
  assert.deepEqual(row(c.profitLoss, 'PROFIT').companies, { h: '60.00', p: '400.00' });
  assert.equal(bs(c, 'TOTAL_ASSETS').group, '900.00');
  assert.equal(bs(c, 'TOTAL_LIABILITIES').group, '900.00');
  assert.equal(c.pairs.length, 0);
});

test('a sale and a balance that match come out of both sides in full', () => {
  const c = consolidate([holding, projectsMatched, labMatched], both);
  assert.deepEqual(row(c.profitLoss, 'REVENUE'), { key: 'REVENUE', line: 'REVENUE', label: 'Revenue from operations', companies: { h: '0.00', p: '1000.00', l: '200.00' }, eliminated: '-200.00', group: '1000.00', total: false });
  assert.equal(row(c.profitLoss, 'OTHER_EXPENSES').eliminated, '-200.00');
  assert.equal(row(c.profitLoss, 'OTHER_EXPENSES').group, '0.00');
  // Profit is the companies' less nothing: a sale between sisters earns the group nothing and costs it nothing.
  assert.deepEqual(row(c.profitLoss, 'PROFIT').companies, { h: '60.00', p: '200.00', l: '80.00' });
  assert.equal(row(c.profitLoss, 'PROFIT').eliminated, '0.00');
  assert.equal(row(c.profitLoss, 'PROFIT').group, '340.00');
  assert.equal(bs(c, 'TRADE_RECEIVABLES').group, '0.00');
  assert.equal(bs(c, 'TRADE_PAYABLES').group, '0.00');
  assert.equal(bs(c, 'TOTAL_ASSETS').group, '1564.00');
  assert.equal(bs(c, 'TOTAL_LIABILITIES').group, '1564.00');
  assert.deepEqual(
    c.pairs.map((p) => [p.kind, p.a.name, p.a.amount, p.b.name, p.b.amount, p.eliminated, p.difference]),
    [
      ['BALANCE', 'L', '236.00', 'P', '236.00', '236.00', '0.00'],
      ['SALES', 'L', '200.00', 'P', '200.00', '200.00', '0.00'],
    ],
  );
});

test('a sale and a balance that do not match: the part both hold comes out, the rest shows as the difference', () => {
  // The lab billed 200 (236 with GST); the projects company has entered 150 of it (177 with GST) so far.
  const projects = company('p', { REVENUE: 1000, CONSTRUCTION: 600, OTHER_EXPENSES: 150, CASH: 1000, TRADE_PAYABLES: 177, SHARE_CAPITAL: 573, RESERVES: 250 }, [
    ['l', 'TURNOVER', 'OTHER_EXPENSES', 150],
    ['l', 'BALANCE', 'TRADE_PAYABLES', 177],
  ]);
  const c = consolidate([holding, projects, labMatched], both);
  assert.equal(row(c.profitLoss, 'REVENUE').eliminated, '-150.00');
  assert.equal(row(c.profitLoss, 'REVENUE').group, '1050.00');
  assert.equal(row(c.profitLoss, 'OTHER_EXPENSES').group, '0.00');
  assert.equal(row(c.profitLoss, 'PROFIT').group, '390.00');
  assert.equal(bs(c, 'TRADE_RECEIVABLES').group, '59.00');
  assert.equal(bs(c, 'TRADE_PAYABLES').group, '0.00');
  assert.equal(bs(c, 'TOTAL_ASSETS').group, bs(c, 'TOTAL_LIABILITIES').group);
  assert.equal(bs(c, 'TOTAL_ASSETS').group, '1623.00');
  const sales = c.pairs.find((p) => p.kind === 'SALES')!;
  assert.deepEqual([sales.a.name, sales.a.amount, sales.b.name, sales.b.amount, sales.eliminated, sales.difference], ['L', '200.00', 'P', '150.00', '150.00', '50.00']);
  const balance = c.pairs.find((p) => p.kind === 'BALANCE')!;
  assert.deepEqual([balance.a.name, balance.a.amount, balance.b.amount, balance.eliminated, balance.difference], ['L', '236.00', '177.00', '177.00', '59.00']);
});

test('a sister named on one side only: nothing comes out and the whole figure is the difference', () => {
  const projects = company('p', { REVENUE: 1000, OTHER_EXPENSES: 200, CASH: 964, TRADE_PAYABLES: 236, SHARE_CAPITAL: 0, RESERVES: 728 });
  const c = consolidate([projects, labMatched], [{ companyId: 'l', sisterId: 'p' }]);
  assert.equal(row(c.profitLoss, 'REVENUE').eliminated, '0.00');
  assert.equal(bs(c, 'TRADE_PAYABLES').group, '236.00');
  const balance = c.pairs.find((p) => p.kind === 'BALANCE')!;
  assert.deepEqual([balance.a.name, balance.a.named, balance.b.named, balance.a.amount, balance.b.amount, balance.difference], ['L', true, false, '236.00', '0.00', '236.00']);
});

test('a link to a company outside the consolidation counts for nothing', () => {
  const lab = company('l', { REVENUE: 200, TRADE_RECEIVABLES: 236, SHARE_CAPITAL: 36 }, [['x', 'TURNOVER', 'REVENUE', 200], ['x', 'BALANCE', 'TRADE_RECEIVABLES', 236]]);
  const { removals, pairs } = eliminations([holding, lab], [{ companyId: 'l', sisterId: 'x' }]);
  assert.equal(removals.length, 0);
  assert.equal(pairs.length, 0);
});

test('balances both ways between two sisters come off each side', () => {
  // P owes L 100 for tests; L owes P 30 for diesel P sold it. Each side's books agree.
  const p = company('p', { TRADE_PAYABLES: 100, TRADE_RECEIVABLES: 30, CASH: 70 }, [['l', 'BALANCE', 'TRADE_PAYABLES', 100], ['l', 'BALANCE', 'TRADE_RECEIVABLES', 30]]);
  const l = company('l', { TRADE_RECEIVABLES: 100, TRADE_PAYABLES: 30, SHARE_CAPITAL: 70 }, [['p', 'BALANCE', 'TRADE_RECEIVABLES', 100], ['p', 'BALANCE', 'TRADE_PAYABLES', 30]]);
  const c = consolidate([p, l], [{ companyId: 'p', sisterId: 'l' }, { companyId: 'l', sisterId: 'p' }]);
  assert.equal(bs(c, 'TRADE_RECEIVABLES').group, '0.00');
  assert.equal(bs(c, 'TRADE_PAYABLES').group, '0.00');
  assert.equal(bs(c, 'TOTAL_ASSETS').group, '70.00');
  const balance = c.pairs[0];
  assert.deepEqual([balance.a.name, balance.a.amount, balance.b.amount, balance.eliminated, balance.difference], ['L', '70.00', '70.00', '130.00', '0.00']);
});

test("each company's figures stop at its own lock only on the lock basis", () => {
  const period = { from: '2026-04-01', to: '2026-11-10' };
  assert.deepEqual(companyPeriod('BOOKS', period, '2026-09-30'), period);
  assert.deepEqual(companyPeriod('LOCK', period, '2026-09-30'), { from: '2026-04-01', to: '2026-09-30' });
  assert.deepEqual(companyPeriod('LOCK', period, null), period);
  assert.deepEqual(companyPeriod('LOCK', period, '2026-12-31'), period);
  // Locked only up to last year's close: no profit and loss of this period is final, the balance sheet is as on the lock.
  assert.deepEqual(companyPeriod('LOCK', period, '2026-03-31'), { from: '2026-04-01', to: '2026-03-31' });
});

test("a company's column says how far its books are locked and which year is closed", () => {
  const day = (d: string) => d.split('-').reverse().join('/');
  assert.equal(consolidationNote({ to: '2026-11-10', lockedUpTo: null, closedYear: null }, 'BOOKS', '2026-11-10', day), 'Books not locked');
  assert.equal(consolidationNote({ to: '2026-11-10', lockedUpTo: '2026-11-30', closedYear: '2025-26' }, 'BOOKS', '2026-11-10', day), 'Locked up to 30/11/2026. 2025-26 closed');
  assert.equal(consolidationNote({ to: '2026-11-10', lockedUpTo: '2026-09-30', closedYear: null }, 'BOOKS', '2026-11-10', day), 'Locked up to 30/09/2026, later entries can change');
  assert.equal(consolidationNote({ to: '2026-09-30', lockedUpTo: '2026-09-30', closedYear: null }, 'LOCK', '2026-11-10', day), 'Stops at its lock, 30/09/2026');
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
