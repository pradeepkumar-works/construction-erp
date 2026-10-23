/**
 * Cash forecast tests (AI item 122). First the rules on their own: a client's days to pay and their spread, each item's
 * early, likely and late date, the weeks with their low, likely and high balance, why a short week is short, what to
 * chase and hold, how far an old forecast was out, and the payment clause read from a contract page. Then, when
 * DATABASE_URL is set, the demo company: the forecast opens on the books' bank and cash and its weeks add up, the week's
 * snapshot is stored, a snapshot four weeks old is checked against the books, the watch list's cash gap agrees with
 * the forecast, billing readiness and the payment reminder (quoting the contract's clause 7.2) work on a late bill put in, and a replay of
 * the past twelve Mondays (over a year of the road client's bills put in for it, taken out after) sets what the rules
 * would have said against what was received and paid.
 *
 *   node dist/scripts/cash-forecast-test.js                 # rules only
 *   DATABASE_URL=… node dist/scripts/cash-forecast-test.js  # rules and demo data
 */
import assert from 'node:assert/strict';
import { CONTRACT_PAY_SPREAD_DAYS, FORECAST_WEEKS, MIN_PAY_SPREAD_DAYS, type CashFlowItemDto, type CashWeekDto, type RoleKey } from '@erp/shared';
import {
  addDays,
  around,
  chaseAndHold,
  clientBillDates,
  forecastError,
  forecastWeeks,
  mondayOf,
  monthlyDates,
  nextBillDate,
  payTiming,
  paymentClause,
  purchaseOrderDates,
  replayPayments,
  replayReceipts,
  statutoryDueDate,
  workOrderRunRate,
} from '../cash-forecast/cash-forecast-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const item = (over: Partial<CashFlowItemDto> & Pick<CashFlowItemDto, 'key' | 'kind' | 'direction' | 'amount' | 'likely'>): CashFlowItemDto => ({
  label: over.key,
  projectId: null,
  projectCode: null,
  early: over.likely,
  late: over.likely,
  uncertain: false,
  why: 'Why',
  msme: false,
  overdue: false,
  href: null,
  ...over,
});

// ---------------------------------------------------------------------------------------------------------------------
// When clients pay

test('payment days: the mean of paid bills, spread by their deviation, a week at least', () => {
  const t = payTiming(
    [
      { sentDate: '2026-01-01', paidDate: '2026-02-10' }, // 40
      { sentDate: '2026-02-01', paidDate: '2026-03-23' }, // 50
      { sentDate: '2026-03-01', paidDate: '2026-04-30' }, // 60
    ],
    30,
  );
  assert.deepEqual(t, { days: 50, spread: 10, own: true, bills: 3 });
  const steady = payTiming([{ sentDate: '2026-01-01', paidDate: '2026-02-10' }, { sentDate: '2026-02-01', paidDate: '2026-03-13' }], 30);
  assert.equal(steady.spread, MIN_PAY_SPREAD_DAYS);
});

test('payment days: with fewer than two paid bills, the contract’s days spread two weeks', () => {
  assert.deepEqual(payTiming([{ sentDate: '2026-01-01', paidDate: '2026-02-10' }], 45), { days: 45, spread: CONTRACT_PAY_SPREAD_DAYS, own: false, bills: 1 });
  assert.equal(payTiming([], null).days, 30);
});

test('a client bill: sent date plus the days, never before today; one past its days is today and overdue', () => {
  const t = { days: 41, spread: 7, own: true, bills: 4 };
  assert.deepEqual(clientBillDates('2026-10-01', t, '2026-10-23'), { early: '2026-11-04', likely: '2026-11-11', late: '2026-11-18', overdue: false });
  assert.deepEqual(clientBillDates('2026-09-01', t, '2026-10-23'), { early: '2026-10-23', likely: '2026-10-23', late: '2026-10-30', overdue: true });
  // Early would be before today: it is today.
  assert.equal(clientBillDates('2026-09-15', t, '2026-10-23').early, '2026-10-23');
});

test('the next RA bill: the same day of the month as the last, or the month’s end', () => {
  assert.equal(nextBillDate('2026-09-25', '2026-10-23'), '2026-10-25');
  assert.equal(nextBillDate('2026-09-05', '2026-10-23'), '2026-11-05');
  assert.equal(nextBillDate('2026-01-31', '2026-02-10'), '2026-02-28');
  assert.equal(nextBillDate('2026-11-30', '2026-12-31'), '2027-01-30');
  assert.equal(nextBillDate(null, '2026-10-23'), '2026-10-31');
});

// ---------------------------------------------------------------------------------------------------------------------
// When we pay

test('a purchase order: paid its days after delivery, two weeks after the order without a date', () => {
  assert.equal(purchaseOrderDates('2026-10-01', '2026-10-20', 45, '2026-10-23').likely, '2026-12-04');
  assert.equal(purchaseOrderDates('2026-10-01', null, null, '2026-10-23').likely, '2026-11-14');
  assert.equal(purchaseOrderDates('2026-01-01', null, 30, '2026-10-23').overdue, true);
});

test('a work order at its pace: a third of 90 days’ bills a month, three months at most, never past its value', () => {
  const r = workOrderRunRate(250000, 300000, 30, '2026-10-23');
  assert.deepEqual(r.map((x) => x.amount), [100000, 100000, 50000]);
  assert.deepEqual(r.map((x) => x.dates.likely), ['2026-12-07', '2027-01-06', '2027-02-05']);
  assert.deepEqual(workOrderRunRate(250000, 0, 30, '2026-10-23'), []);
});

test('salaries each month on their day, statutory dues on the 20th', () => {
  assert.deepEqual(monthlyDates(7, '2026-10-23', '2027-01-17'), ['2026-11-07', '2026-12-07', '2027-01-07']);
  assert.deepEqual(monthlyDates(31, '2026-10-23', '2026-12-01'), ['2026-10-31', '2026-11-30']);
  assert.equal(statutoryDueDate('2026-10-12'), '2026-10-20');
  assert.equal(statutoryDueDate('2026-10-23'), '2026-11-20');
  assert.equal(statutoryDueDate('2026-12-23'), '2027-01-20');
});

test('around: a date gone is today, late by the spread', () => {
  assert.deepEqual(around('2026-10-10', 0, 7, '2026-10-23'), { early: '2026-10-23', likely: '2026-10-23', late: '2026-10-30', overdue: true });
});

// ---------------------------------------------------------------------------------------------------------------------
// The weeks

const TODAY = '2026-10-23'; // a Friday
const ITEMS: CashFlowItemDto[] = [
  item({ key: 'ra7', kind: 'CLIENT_BILL', direction: 'IN', amount: 9_500_000, early: '2026-11-04', likely: '2026-11-11', late: '2026-11-25', label: 'RA-7 Tower B', why: 'Sent 23 days ago; this client averages 41 days (6 paid bills)' }),
  item({ key: 'mb', kind: 'UNBILLED_WORK', direction: 'IN', amount: 2_000_000, early: '2026-11-20', likely: '2026-11-27', late: '2026-12-04', uncertain: true }),
  item({ key: 'msme', kind: 'VENDOR_BILL', direction: 'OUT', amount: 6_000_000, likely: '2026-11-02', late: '2026-11-09', msme: true }),
  item({ key: 'cement', kind: 'VENDOR_BILL', direction: 'OUT', amount: 3_000_000, likely: '2026-11-03', late: '2026-11-10', label: 'VB-12 Utkal Cement' }),
  item({ key: 'salary', kind: 'SALARY', direction: 'OUT', amount: 2_500_000, early: '2026-11-05', likely: '2026-11-07', late: '2026-11-10' }),
  item({ key: 'old', kind: 'VENDOR_BILL', direction: 'OUT', amount: 500_000, likely: TODAY, late: '2026-10-30', overdue: true }),
];

test('weeks: thirteen from Monday, each case in its own date, overdue in the first week', () => {
  const w = forecastWeeks(10_000_000, ITEMS, TODAY);
  assert.equal(w.length, FORECAST_WEEKS);
  assert.equal(w[0].start, '2026-10-19');
  assert.equal(w[12].end, '2027-01-17');
  assert.equal(w[0].out.likely, 500_000);
  // The week of 2 Nov: ₹1.15 Cr out against nothing in: likely 1,00,00,000 − 5,00,000 − 1,15,00,000 = −20,00,000.
  assert.equal(w[2].out.likely, 11_500_000);
  assert.equal(w[2].closing.likely, -2_000_000);
  assert.equal(w[2].short, true);
  // RA-7 comes in the week of 9 Nov (likely), 2 Nov (early) or 23 Nov (late).
  assert.equal(w[3].in.likely, 9_500_000);
  assert.equal(w[2].in.high, 9_500_000);
  assert.equal(w[5].in.low, 9_500_000);
  // Measured work is left out of the low case.
  assert.equal(w.reduce((s, x) => s + x.in.low, 0), 9_500_000);
  for (const x of w) assert.ok(x.closing.low <= x.closing.likely && x.closing.likely <= x.closing.high, `${x.start} out of order`);
});

test('a short week says why: the late client bill, the MSME bills, the largest payments', () => {
  const w = forecastWeeks(10_000_000, ITEMS, TODAY);
  const r = w[2].reasons;
  assert.ok(r[0].startsWith('RA-7 Tower B (₹95.0 L) may not come in time: sent 23 days ago; this client averages 41 days'), r[0]);
  assert.ok(r.includes('₹60.0 L of MSME bills due (1 bill), paid within 45 days by law'), r.join(' | '));
  assert.ok(r.some((x) => x.startsWith('Vendor bill: VB-12 Utkal Cement, ₹30.0 L')), r.join(' | '));
});

test('chase what comes after the squeeze, hold what can wait: never MSME or salaries', () => {
  const w = forecastWeeks(10_000_000, ITEMS, TODAY);
  const { chase, hold, squeeze } = chaseAndHold(ITEMS, w);
  assert.equal(squeeze?.start, '2026-11-02');
  assert.deepEqual(chase.map((i) => i.key), ['ra7']);
  assert.deepEqual(hold.map((i) => i.key), ['cement', 'old']);
  // With money enough there is nothing to hold, and only overdue client bills to chase.
  const flush = forecastWeeks(100_000_000, ITEMS, TODAY);
  assert.deepEqual(chaseAndHold(ITEMS, flush).hold, []);
  assert.deepEqual(chaseAndHold(ITEMS, flush).chase, []);
});

test('forecast error: the old forecast’s week against the books', () => {
  const weeks = forecastWeeks(10_000_000, ITEMS, '2026-09-25');
  const end = weeks[3].end;
  const e = forecastError('2026-09-25', weeks, end, weeks[3].closing.likely + 100_000)!;
  assert.equal(e.error, 100_000);
  assert.equal(e.withinRange, e.actual >= weeks[3].closing.low && e.actual <= weeks[3].closing.high);
  assert.equal(forecastError('2026-09-25', weeks, '2030-01-06', 0), null);
});

test('the payment clause on a contract page, with its days', () => {
  const page =
    'Clause 7. Running account bills and payment 7.1 The Contractor shall submit a running account bill every month. 7.2 The Department shall pay a running account bill within 30 days of its submission, less the security deposit. Running payments are advances against the final bill. 7.3 Retention money of 5% shall be deducted. Page 3 of 5';
  const c = paymentClause(page)!;
  assert.equal(c.no, '7.2');
  assert.equal(c.days, 30);
  assert.equal(c.text, '7.2 The Department shall pay a running account bill within 30 days of its submission, less the security deposit. Running payments are advances against the final bill.');
  assert.equal(paymentClause('1.1 The works are a road. 1.2 The site is at Cuttack.'), null);
});

test('replay: the receipts the rule expected against what came, from what was known that day', () => {
  const bills = [
    { client: 'a', sentDate: '2026-01-01', paidDate: '2026-02-10', amount: 100, contractDays: 30 },
    { client: 'a', sentDate: '2026-02-01', paidDate: '2026-03-13', amount: 100, contractDays: 30 },
    { client: 'a', sentDate: '2026-03-01', paidDate: '2026-04-12', amount: 100, contractDays: 30 },
    { client: 'b', sentDate: '2026-03-10', paidDate: null, amount: 50, contractDays: 30 },
  ];
  // On 16 Mar client a has two paid bills (40 days each): its March bill is likely 10 Apr, inside four weeks.
  const r = replayReceipts(bills, '2026-03-16');
  assert.equal(r.open, 2);
  assert.equal(r.forecast.likely, 150);
  assert.equal(r.actual, 100);
  const p = replayPayments([{ billDate: '2026-03-01', dueDate: '2026-03-31', paidDate: '2026-04-05', amount: 10 }, { billDate: '2026-03-01', dueDate: '2026-05-31', paidDate: null, amount: 7 }], '2026-03-16');
  assert.deepEqual(p, { forecast: 10, actual: 10, open: 2 });
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\nRules: ${tests.length - failed} of ${tests.length} tests pass`);

async function demo(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { Prisma } = await import('@prisma/client');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { CashForecastService } = await import('../cash-forecast/cash-forecast.service');
  const { WarningsService } = await import('../warnings/warnings.service');
  const { BooksService } = await import('../books/books.service');
  const { ReceivablesService } = await import('../receivables/receivables.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const { todayIn } = await import('../notifications/time');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const cash = app.get(CashForecastService);
  const warnings = app.get(WarningsService);
  const books = app.get(BooksService);
  const receivables = app.get(ReceivablesService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  let planted: string | null = null;
  const plantedBills: string[] = [];

  await new Promise<void>((resolve, reject) =>
    tenantMiddleware(null, null, () => {
      setTenant(org.id);
      (async () => {
        const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
        const as = (email: string) => {
          const u = users.find((x) => x.email === email);
          if (!u) throw new Error(`No ${email} in the demo company`);
          return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
        };
        const accounts = as('accounts@demo.com');
        const today = todayIn();

        // 1. The forecast opens on the books and its weeks add up.
        const f = await cash.forecast(accounts);
        const fig = (await books.figures(accounts))!;
        check('opening: the bank ledgers', near(f.opening.bank, Number(fig.bank)), `${f.opening.bank} vs ${fig.bank}`);
        check('opening: cash in hand', near(f.opening.cash, Number(fig.cash)), `${f.opening.cash} vs ${fig.cash}`);
        check('thirteen weeks from this Monday', f.weeks.length === FORECAST_WEEKS && f.weeks[0].start === mondayOf(today));
        let running = f.opening.total;
        let adds = true;
        for (const w of f.weeks) {
          running += w.in.likely - w.out.likely;
          if (!near(running, w.closing.likely)) adds = false;
        }
        check('each week’s balance is the last plus in less out', adds);
        check('low ≤ likely ≤ high every week', f.weeks.every((w) => w.closing.low <= w.closing.likely + 0.5 && w.closing.likely <= w.closing.high + 0.5));
        check('every item has its why and a date in order', f.items.every((i) => i.why && i.early <= i.likely && i.likely <= i.late));
        const open = (await receivables.summary(accounts)).openBills.map((b) => `bill:${b.billId}`).sort();
        const expected = f.items.filter((i) => i.kind === 'CLIENT_BILL').map((i) => i.key).sort();
        check('every open client bill is expected in', JSON.stringify(open) === JSON.stringify(expected), `${open.length} open, ${expected.length} in the forecast`);
        check('salaries are in the forecast', f.items.some((i) => i.kind === 'SALARY'));
        check('the machine loan EMIs are in the forecast', f.items.some((i) => i.kind === 'LOAN_EMI'));
        check('measured work not billed is in, and left out of the low case', f.items.some((i) => i.kind === 'UNBILLED_WORK' && i.uncertain));
        check('the week’s snapshot is stored', (await prisma.cashForecastSnapshot.count({ where: { organizationId: org.id, weekStart: new Date(`${mondayOf(today)}T00:00:00Z`) } })) === 1);

        // 2. A snapshot four weeks old is checked against the books' balance last Sunday.
        const madeOn = addDays(mondayOf(today), -28);
        const lastSunday = addDays(mondayOf(today), -1);
        const existing = await prisma.cashForecastSnapshot.findFirst({ where: { organizationId: org.id, weekStart: new Date(`${madeOn}T00:00:00Z`) } });
        if (!existing) {
          const weeks: CashWeekDto[] = forecastWeeks(5_000_000, [], madeOn);
          planted = (await prisma.cashForecastSnapshot.create({ data: { organizationId: org.id, weekStart: new Date(`${madeOn}T00:00:00Z`), asOf: new Date(`${madeOn}T00:00:00Z`), opening: new Prisma.Decimal(5_000_000), weeks: weeks as unknown as object } })).id;
        }
        const g = await cash.forecast(accounts);
        const then = (await books.accounts(accounts, { to: lastSunday })).filter((a) => a.group === 'BANK_ACCOUNTS' || a.group === 'CASH_IN_HAND').reduce((s, a) => s + Number(a.balance), 0);
        check('last month’s forecast is checked on the week just ended', g.error?.weekEnd === lastSunday, JSON.stringify(g.error));
        if (g.error) check('its error is the books’ balance less the forecast', near(g.error.actual, then) && near(g.error.error, then - g.error.forecast.likely), JSON.stringify(g.error));

        // 3. The watch list's cash gap is the forecast's first short week.
        const watch = await warnings.list(accounts);
        const gap = watch.open.concat(watch.dismissed).find((w) => w.kind === 'CASH');
        const short = g.weeks.find((w) => w.short);
        check('the watch list’s cash gap agrees with the forecast', !!gap === !!short, `warning ${gap?.title ?? 'none'}, short week ${short?.start ?? 'none'}`);
        if (gap && short) check('the gap’s key carries its week', gap.key.startsWith(`cash:${short.start}`));

        // 4. Roles: accounts and management see the forecast; a project manager sees billing readiness, not the forecast.
        const pm2 = as('pm2@demo.com');
        let refused = false;
        await cash.forecast(pm2).catch(() => (refused = true));
        check('a project manager cannot see the cash forecast', refused);
        // A bill sent 40 days ago and not paid, past the 30 days of the building site's contract (taken out after).
        const building = await prisma.project.findFirstOrThrow({ where: { organizationId: org.id, code: 'BL-2026-02' }, select: { id: true } });
        const z = new Prisma.Decimal(0);
        const sentOn = new Date(`${addDays(today, -40)}T00:00:00Z`);
        const waiting = await prisma.raBill.create({
          data: {
            organizationId: org.id, projectId: building.id, billNo: 950, billDate: sentOn, measuredUpTo: sentOn,
            grossPrevious: z, grossAmount: new Prisma.Decimal(500_000), grossUpto: new Prisma.Decimal(500_000), gstRate: z, gstAmount: z, retentionPct: z, securityDepositPct: z, advanceRecoveryPct: z, tdsPct: z, gstTdsPct: z, labourCessPct: z,
            retentionAmount: z, securityDepositAmount: z, advanceRecoveryAmount: z, tdsAmount: z, gstTdsAmount: z, labourCessAmount: z, totalDeductions: z, netPayable: new Prisma.Decimal(500_000),
            stage: 'SENT', sentDate: sentOn, status: 'APPROVED', submittedById: accounts.id,
          },
        });
        plantedBills.push(waiting.id);
        const ready = await cash.readiness(pm2);
        const bl = ready.rows.find((r) => r.projectCode === 'BL-2026-02');
        const late = bl?.unpaid.find((b) => b.billId === waiting.id);
        check('billing readiness: a bill sent 40 days ago is unpaid and late', !!late && late.late && late.daysOutstanding === 40 && late.expectedDays === 30, JSON.stringify(late));
        check('billing readiness: only projects the PM may see', ready.rows.every((r) => r.projectCode === 'BL-2026-02' || r.projectCode === 'WS-2026-03'), ready.rows.map((r) => r.projectCode).join(', '));

        // 5. The reminder quotes the contract's payment clause and saves nothing.
        if (late) {
          const letters = await prisma.letter.count({ where: { organizationId: org.id } });
          const d = await cash.reminder(pm2, late.billId);
          const summary = String(d.values.summary);
          check('reminder: an OUT letter to the client', d.kind === 'letter' && d.values.direction === 'OUT' && d.values.party === 'Dept. of Health & Family Welfare', JSON.stringify(d.values));
          check('reminder: quotes clause 7.2 of the agreement', summary.includes('Clause 7.2 of the agreement (HB-AGR-01)') && summary.includes('within 30 days of its submission'), summary);
          check('reminder: says how long the bill has waited, past the contract’s days', summary.includes('40 days after submission, beyond the 30 days the contract allows'), summary);
          check('reminder: nothing is saved', (await prisma.letter.count({ where: { organizationId: org.id } })) === letters);
        }

        // 6. Replay: the past twelve Mondays, what the rules would have said against what came in and went out. The demo
        // has weeks, not months, of bills, so a year of the road client's bills is put in first: one a month, paid in
        // 38 to 52 days.
        const road = await prisma.project.findFirstOrThrow({ where: { organizationId: org.id, code: 'RD-2026-01' }, select: { id: true } });
        const lags = [44, 38, 52, 41, 47, 39, 50, 43, 46, 40, 49, 42];
        for (const [i, lag] of lags.entries()) {
          const sent = addDays(today, -30 * (lags.length - i) - 20);
          const paid = addDays(sent, lag);
          const z = new Prisma.Decimal(0);
          const amount = new Prisma.Decimal(1_000_000 + i * 50_000);
          const b = await prisma.raBill.create({
            data: {
              organizationId: org.id, projectId: road.id, billNo: 900 + i, billDate: new Date(`${sent}T00:00:00Z`), measuredUpTo: new Date(`${sent}T00:00:00Z`),
              grossPrevious: z, grossAmount: amount, grossUpto: amount, gstRate: z, gstAmount: z, retentionPct: z, securityDepositPct: z, advanceRecoveryPct: z, tdsPct: z, gstTdsPct: z, labourCessPct: z,
              retentionAmount: z, securityDepositAmount: z, advanceRecoveryAmount: z, tdsAmount: z, gstTdsAmount: z, labourCessAmount: z, totalDeductions: z, netPayable: amount,
              stage: paid < today ? 'PAID' : 'SENT', sentDate: new Date(`${sent}T00:00:00Z`), paidDate: paid < today ? new Date(`${paid}T00:00:00Z`) : null,
              status: 'APPROVED', submittedById: accounts.id,
            },
          });
          plantedBills.push(b.id);
        }
        const raBills = await prisma.raBill.findMany({
          where: { organizationId: org.id, status: 'APPROVED', sentDate: { not: null } },
          select: { sentDate: true, paidDate: true, netPayable: true, project: { select: { id: true, clientId: true, clientName: true, clientPaymentDays: true } } },
        });
        const past = raBills.map((b) => ({
          client: b.project.clientId ?? b.project.clientName ?? b.project.id,
          sentDate: b.sentDate!.toISOString().slice(0, 10),
          paidDate: b.paidDate ? b.paidDate.toISOString().slice(0, 10) : null,
          amount: Number(b.netPayable),
          contractDays: b.project.clientPaymentDays,
        }));
        const payables = [
          ...(await prisma.vendorBill.findMany({ where: { organizationId: org.id, status: 'APPROVED' }, select: { invoiceDate: true, dueDate: true, paidDate: true, total: true } })).map((b) => ({ billDate: b.invoiceDate, dueDate: b.dueDate, paidDate: b.paidDate, amount: Number(b.total) })),
          ...(await prisma.subcontractBill.findMany({ where: { organizationId: org.id, status: 'APPROVED' }, select: { billDate: true, dueDate: true, paidDate: true, netPayable: true } })).map((b) => ({ billDate: b.billDate, dueDate: b.dueDate, paidDate: b.paidDate, amount: Number(b.netPayable) })),
        ].map((b) => ({ billDate: b.billDate.toISOString().slice(0, 10), dueDate: b.dueDate.toISOString().slice(0, 10), paidDate: b.paidDate ? b.paidDate.toISOString().slice(0, 10) : null, amount: b.amount }));
        const L = (v: number) => `₹${(v / 1e5).toFixed(1)} L`;
        let inRange = 0;
        let weeksWithMoney = 0;
        let ordered = true;
        console.log('\nReplay, the four weeks from each Monday: receipts expected (low / likely / high) and received; payments due and paid');
        for (let k = 12; k >= 1; k--) {
          const monday = addDays(mondayOf(today), -7 * k);
          if (addDays(monday, 27) >= today) continue;
          const r = replayReceipts(past, monday);
          const p = replayPayments(payables, monday);
          if (!(r.forecast.low <= r.forecast.likely && r.forecast.likely <= r.forecast.high)) ordered = false;
          if (r.open) {
            weeksWithMoney++;
            if (r.actual >= r.forecast.low - 0.5 && r.actual <= r.forecast.high + 0.5) inRange++;
          }
          console.log(`  ${monday}: in ${L(r.forecast.low)} / ${L(r.forecast.likely)} / ${L(r.forecast.high)}, received ${L(r.actual)} (${r.open} open); out due ${L(p.forecast)}, paid ${L(p.actual)} (${p.open} open)`);
        }
        check('replay: low ≤ likely ≤ high on every Monday', ordered);
        check('replay: receipts inside the range on most Mondays with open bills', weeksWithMoney >= 6 && inRange / weeksWithMoney >= 0.6, `${inRange} of ${weeksWithMoney}`);
        console.log(`  Receipts inside the range on ${inRange} of ${weeksWithMoney} Mondays with open bills`);
        console.log(`\nDemo company today: bank ${L(g.opening.bank)}, cash ${L(g.opening.cash)}, lowest likely ${L(g.lowest.closing.likely)} in the week of ${g.lowest.week}${short ? `, first short week ${short.start}` : ', no short week'}`);
      })()
        .finally(async () => {
          if (planted) await prisma.cashForecastSnapshot.delete({ where: { id: planted } });
          await prisma.raBill.deleteMany({ where: { id: { in: plantedBills } } });
        })
        .then(resolve, reject);
    }),
  );
  await app.close();
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(`Demo data: ${checks - problems.length} of ${checks} checks pass`);
  return problems.length;
}

(async () => {
  const demoProblems = process.env.DATABASE_URL ? await demo() : 0;
  process.exit(failed || demoProblems ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
