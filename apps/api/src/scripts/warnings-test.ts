/**
 * Early warnings' tests (AI item 73). First each forecast on its own, firing and not, with no database. Then, when
 * DATABASE_URL is set, the demo company: who sees which kinds and only on their own projects, dismissing with a reason
 * (and the warning coming back on the list once restored), and a backtest that replays the last 60 days and prints
 * the day each warning would first have fired. CI runs it after the seed:
 *
 *   node dist/scripts/warnings-test.js                 # forecasts only
 *   DATABASE_URL=… node dist/scripts/warnings-test.js  # forecasts, demo data and backtest
 */
import assert from 'node:assert/strict';
import type { RoleKey } from '@erp/shared';
import { WARNING_KINDS, watchListKinds } from '@erp/shared';
import { activityForecast, addDays, cashGap, cashWeeks, daysToPay, dprGap, leadDays, machineTrend, fuelNormCheck, fuelStep, materialOveruse, overuseStep, scheduleWarns, stockRunout, vendorTrend } from '../warnings/warning-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const T = '2026-10-17';

// ---------------------------------------------------------------------------------------------------------------------
// Schedule

test('schedule: on pace finishes on time and does not warn', () => {
  // 2 a day from 1 to 16 Oct is 92 done; the 4 weeks to today hold 27 days' work, 1.93 a day, so 8 left is 5 days.
  const entries = Array.from({ length: 46 }, (_, i) => ({ date: addDays('2026-09-01', i), qty: 2 }));
  const f = activityForecast({ plannedQty: 100, plannedStart: '2026-09-01', plannedEnd: '2026-10-22', baselineEnd: null, entries }, T)!;
  assert.equal(f.forecastFinish, '2026-10-22');
  assert.equal(f.slipDays, 0);
  assert.equal(scheduleWarns(f), false);
});
test('schedule: a slowed rate puts the finish past the baseline and warns', () => {
  // 60 done by 19 Sep, then 0.5 a day for the last 4 weeks: 46 left takes 92 days.
  const entries = [{ date: '2026-09-10', qty: 60 }, ...Array.from({ length: 28 }, (_, i) => ({ date: addDays('2026-09-20', i), qty: 0.5 }))];
  const f = activityForecast({ plannedQty: 120, plannedStart: '2026-09-01', plannedEnd: '2026-11-30', baselineEnd: '2026-10-31', entries }, T)!;
  assert.equal(f.target, '2026-10-31', 'the baseline, not the re-planned finish');
  assert.equal(f.rate, 0.5);
  assert.equal(f.forecastFinish, addDays(T, 92));
  assert.ok(scheduleWarns(f));
});
test('schedule: a few days past the baseline is inside the grace', () => {
  const entries = Array.from({ length: 28 }, (_, i) => ({ date: addDays(T, -27 + i), qty: 1 }));
  const f = activityForecast({ plannedQty: 33, plannedStart: '2026-09-20', plannedEnd: addDays(T, 1), baselineEnd: null, entries }, T)!;
  assert.equal(f.slipDays, 4);
  assert.equal(scheduleWarns(f), false);
});
test('schedule: started with nothing done for two weeks is stalled', () => {
  const f = activityForecast({ plannedQty: 10, plannedStart: addDays(T, -20), plannedEnd: addDays(T, 40), baselineEnd: null, entries: [] }, T)!;
  assert.ok(f.stalled && scheduleWarns(f));
  const fresh = activityForecast({ plannedQty: 10, plannedStart: addDays(T, -5), plannedEnd: addDays(T, 40), baselineEnd: null, entries: [] }, T)!;
  assert.equal(scheduleWarns(fresh), false);
});
test('schedule: not started, done, or later entries do not count', () => {
  assert.equal(activityForecast({ plannedQty: 10, plannedStart: addDays(T, 3), plannedEnd: addDays(T, 9), baselineEnd: null, entries: [] }, T), null);
  assert.equal(activityForecast({ plannedQty: 10, plannedStart: '2026-09-01', plannedEnd: '2026-09-09', baselineEnd: null, entries: [{ date: '2026-09-05', qty: 10 }] }, T), null);
  const f = activityForecast({ plannedQty: 10, plannedStart: '2026-09-01', plannedEnd: '2026-11-09', baselineEnd: null, entries: [{ date: addDays(T, 2), qty: 10 }] }, T)!;
  assert.equal(f.donePct, 0, 'an entry after the day asked about is not yet done');
});

// ---------------------------------------------------------------------------------------------------------------------
// Cash

test('cash: days to pay are the client’s own median once two bills are paid', () => {
  assert.equal(daysToPay([{ sentDate: '2026-06-01', paidDate: '2026-07-16' }]), null);
  assert.equal(daysToPay([{ sentDate: '2026-06-01', paidDate: '2026-07-16' }, { sentDate: '2026-07-01', paidDate: '2026-08-30' }, { sentDate: '2026-08-01', paidDate: '2026-09-20' }]), 50);
});
test('cash: the first week where bills due pass what comes in is the gap; overdue counts in week one', () => {
  const weeks = cashWeeks(
    [{ date: '2026-11-04', amount: 500_000 }],
    [
      { date: '2026-10-10', amount: 200_000 },
      { date: '2026-10-29', amount: 400_000 },
    ],
    T,
  );
  assert.equal(weeks.length, 8);
  assert.equal(weeks[0].start, '2026-10-12');
  assert.equal(weeks[0].out, 200_000, 'overdue in the first week');
  const gap = cashGap(weeks)!;
  assert.equal(gap.start, '2026-10-12');
  assert.equal(gap.cumulative, -200_000);
  assert.equal(weeks[3].cumulative, -100_000);
});
test('cash: receipts ahead of bills is no gap', () => {
  assert.equal(cashGap(cashWeeks([{ date: T, amount: 100 }], [{ date: addDays(T, 10), amount: 100 }], T)), null);
});

// ---------------------------------------------------------------------------------------------------------------------
// Vendors

const dl = (daysAgo: number, late: boolean, qty = 10, rejectedQty = 0) => ({ date: addDays(T, -daysAgo), late, qty, rejectedQty });
test('vendor: late on most recent deliveries, on time before, warns', () => {
  const t = vendorTrend([dl(5, true), dl(20, true), dl(40, false), dl(70, false), dl(90, false)], T)!;
  assert.ok(t.lateWorse);
  assert.equal(t.recent.late, 2);
  assert.equal(t.before.deliveries, 2);
});
test('vendor: always late is not trending worse; one delivery is too few', () => {
  assert.equal(vendorTrend([dl(5, true), dl(20, true), dl(70, true), dl(90, true)], T)!.lateWorse, false);
  assert.equal(vendorTrend([dl(5, true)], T), null);
});
test('vendor: rejections rising to a tenth warn', () => {
  const t = vendorTrend([dl(5, false, 100, 15), dl(20, false, 100, 5), dl(80, false, 100, 0)], T)!;
  assert.ok(t.rejectWorse && !t.lateWorse);
});

// ---------------------------------------------------------------------------------------------------------------------
// Stock

const issues = (perDay: number, days: number) => Array.from({ length: days }, (_, i) => ({ date: addDays(T, -i), qty: perDay }));
test('stock: lead time is the median from order to receipt, or a week', () => {
  assert.deepEqual(leadDays([]), { days: 7, fromHistory: false });
  assert.deepEqual(leadDays([{ poDate: '2026-09-01', received: '2026-09-05' }, { poDate: '2026-09-10', received: '2026-09-20' }, { poDate: '2026-10-01', received: '2026-10-07' }]), { days: 6, fromHistory: true });
});
test('stock: runs out before an order could arrive', () => {
  const f = stockRunout({ balance: 40, issues: issues(10, 30), leadDays: 7, onOrder: 0 }, T)!;
  assert.equal(f.perDay, 10);
  assert.equal(f.daysLeft, 4);
  assert.equal(f.runsOut, addDays(T, 4));
});
test('stock: lasts longer than the lead time, or already on order, does not warn', () => {
  assert.equal(stockRunout({ balance: 400, issues: issues(10, 30), leadDays: 7, onOrder: 0 }, T), null);
  assert.equal(stockRunout({ balance: 40, issues: issues(10, 30), leadDays: 7, onOrder: 100 }, T), null);
  assert.equal(stockRunout({ balance: 40, issues: [], leadDays: 7, onOrder: 0 }, T), null);
});
test('stock: issues over only three days are spread over a week', () => {
  const f = stockRunout({ balance: 20, issues: issues(7, 3), leadDays: 7, onOrder: 0 }, T)!;
  assert.equal(f.perDay, 3);
});

// ---------------------------------------------------------------------------------------------------------------------
// Machines

const md = (daysAgo: number, worked: number, idle: number, breakdown: number) => ({ date: addDays(T, -daysAgo), worked, idle, breakdown });
test('machine: more breakdown hours than the month before warns', () => {
  const t = machineTrend([md(3, 4, 0, 6), md(10, 4, 0, 5), md(40, 8, 0, 2)], T)!;
  assert.ok(t.breakdownWorse);
  assert.equal(t.recent.breakdown, 11);
});
test('machine: idle a third of its hours and up from before warns; steady idle does not', () => {
  assert.ok(machineTrend([md(3, 4, 4, 0), md(40, 8, 0, 0)], T)!.idleWorse);
  assert.equal(machineTrend([md(3, 4, 4, 0), md(40, 4, 4, 0)], T)!.idleWorse, false);
  assert.equal(machineTrend([md(40, 4, 4, 0)], T), null, 'no logs this month');
});

// ---------------------------------------------------------------------------------------------------------------------
// DPRs

test('dpr: three days running without a DPR warns, counted back from yesterday', () => {
  const sent = new Set([addDays(T, -4), addDays(T, -8)]);
  assert.deepEqual(dprGap(sent, T, null), { from: addDays(T, -3), days: 3 });
  assert.equal(dprGap(new Set([addDays(T, -2)]), T, null), null);
  assert.equal(dprGap(new Set(), T, addDays(T, -2)), null, 'a project two days old');
});

// ---------------------------------------------------------------------------------------------------------------------
// Material used over the norm

test('material: within the allowance, or over it by less than 3%, does not warn', () => {
  assert.equal(materialOveruse({ allowed: 1000, consumed: 980 }), null);
  assert.equal(materialOveruse({ allowed: 1000, consumed: 1020 }), null, '2% over');
  assert.equal(materialOveruse({ allowed: 0, consumed: 50 }), null, 'no work yet is the reconciliation\'s to show');
});
test('material: 3% or more over the allowance warns, and the key moves on in steps of 5%', () => {
  const f = materialOveruse({ allowed: 1000, consumed: 1120 })!;
  assert.equal(f.excess, 120);
  assert.equal(Math.round(f.overPct), 12);
  assert.equal(overuseStep(f.overPct), 10);
  assert.equal(overuseStep(materialOveruse({ allowed: 1000, consumed: 1030 })!.overPct), 0);
  assert.equal(overuseStep(16.2), 15);
});

// ---------------------------------------------------------------------------------------------------------------------
// Fuel use off the norm

const fuelDays = (n: number, hours: number, litres: number, km: number | null = null) =>
  Array.from({ length: n }, (_, i) => ({ date: addDays('2026-10-20', -i), hoursWorked: hours, km, litres }));

test('fuel: within the tolerance, or fewer than five logs with fuel, does not warn', () => {
  assert.equal(fuelNormCheck(fuelDays(10, 8, 40), 4.5, 'LITRES_PER_HOUR', 15, '2026-10-20'), null, '5 L/h against 4.5 is 11% over');
  assert.equal(fuelNormCheck(fuelDays(4, 8, 80), 4.5, 'LITRES_PER_HOUR', 15, '2026-10-20'), null, 'four logs are too few');
  assert.equal(fuelNormCheck(fuelDays(10, 0, 30), 4.5, 'LITRES_PER_HOUR', 15, '2026-10-20'), null, 'no hours worked, nothing to average');
});
test('fuel: litres an hour over the norm warns as thirsty, over the latest ten logs only', () => {
  const logs = [...fuelDays(10, 8, 48), ...fuelDays(20, 8, 30).map((l) => ({ ...l, date: addDays(l.date, -30) }))];
  const f = fuelNormCheck(logs, 4.5, 'LITRES_PER_HOUR', 15, '2026-10-20')!;
  assert.equal(f.logs, 10);
  assert.equal(f.average, 6);
  assert.equal(Math.round(f.deviationPct), 33);
  assert.equal(f.thirsty, true);
  assert.equal(f.from, '2026-10-11');
  assert.equal(fuelStep(f.deviationPct), 30);
});
test('fuel: a vehicle short of its km a litre is thirsty; far over it warns the other way', () => {
  const short = fuelNormCheck(fuelDays(6, 6, 50, 100), 3, 'KM_PER_LITRE', 15, '2026-10-20')!;
  assert.equal(short.average, 2);
  assert.equal(short.thirsty, true);
  const far = fuelNormCheck(fuelDays(6, 6, 20, 100), 3, 'KM_PER_LITRE', 15, '2026-10-20')!;
  assert.equal(far.thirsty, false);
  assert.equal(fuelNormCheck(fuelDays(6, 6, 20, null), 3, 'KM_PER_LITRE', 15, '2026-10-20'), null, 'no odometer readings');
});

// ---------------------------------------------------------------------------------------------------------------------
// Roles

test('roles: each kind goes to the role that can act on it', () => {
  assert.deepEqual(watchListKinds('MANAGEMENT'), ['SCHEDULE', 'CASH', 'VENDOR', 'STOCK', 'MACHINE', 'DPR', 'MATERIAL_OVERUSE', 'FUEL_NORM']);
  assert.deepEqual(watchListKinds('QUANTITY_SURVEYOR'), ['MATERIAL_OVERUSE']);
  assert.deepEqual(watchListKinds('STORE_MANAGER'), ['STOCK', 'MACHINE', 'FUEL_NORM']);
  assert.deepEqual(watchListKinds('ACCOUNTS_MANAGER'), ['CASH']);
  assert.deepEqual(watchListKinds('PROCUREMENT_MANAGER'), ['VENDOR']);
  assert.deepEqual(watchListKinds('SITE_ENGINEER'), []);
});

// ---------------------------------------------------------------------------------------------------------------------

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
console.log(`\nForecasts: ${cases.length - failed} of ${cases.length} tests pass`);

async function demo(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { WarningsService } = await import('../warnings/warnings.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const { todayIn } = await import('../notifications/time');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const warnings = app.get(WarningsService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
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
        const today = todayIn();
        const md = await warnings.list(as('md@demo.com'));
        console.log(`\nDemo company on ${today}: ${md.open.length} open warnings for the MD`);
        for (const w of md.open) console.log(`  [${w.kind}] ${w.title}\n      ${w.detail}`);
        check('the MD gets every kind', md.kinds.length === WARNING_KINDS.length, md.kinds.join(','));

        // Access: each role only its kinds, a project manager only their projects.
        for (const email of ['pm@demo.com', 'store@demo.com', 'accounts@demo.com', 'procurement@demo.com']) {
          const u = as(email);
          const list = await warnings.list(u);
          const kinds = watchListKinds(u.roleKey);
          check(`${email} sees only its kinds`, list.open.every((w) => kinds.includes(w.kind)), list.open.map((w) => w.kind).join(','));
          const mine = new Set((await prisma.project.findMany({ where: { organizationId: org.id, OR: [{ projectManagerId: u.id }, { members: { some: { userId: u.id } } }] }, select: { id: true } })).map((p) => p.id));
          if (u.roleKey === 'PROJECT_MANAGER') check(`${email} sees only their projects`, list.open.every((w) => !w.projectId || mine.has(w.projectId)), list.open.map((w) => w.projectName).join(','));
        }
        let engineerRefused = false;
        await warnings.list(as('engineer@demo.com')).catch(() => (engineerRefused = true));
        check('a site engineer has no watch list', engineerRefused);

        // Dismissing takes a reason, hides the warning for everyone, and restoring brings it back.
        const first = md.open[0];
        if (first) {
          let refused = false;
          await warnings.dismiss(as('md@demo.com'), first.key, 'ok').catch(() => (refused = true));
          check('a dismissal needs a reason of three letters or more', refused);
          const after = await warnings.dismiss(as('md@demo.com'), first.key, 'Known; second crew starts Monday');
          check('a dismissed warning leaves the open list', !after.open.some((w) => w.key === first.key) && after.dismissed.some((w) => w.key === first.key && w.dismissed?.reason.startsWith('Known')));
          const admin = await warnings.list(as('admin@demo.com'));
          check('a dismissal holds for the whole company', admin.dismissed.some((w) => w.key === first.key));
          const back = await warnings.restore(as('md@demo.com'), first.key);
          check('restoring brings it back', back.open.some((w) => w.key === first.key));
        }
        let unknown = false;
        await warnings.dismiss(as('md@demo.com'), 'stock:nothing', 'not a warning').catch(() => (unknown = true));
        check('only a warning on the list can be dismissed', unknown);

        // Backtest: the day each warning would first have fired over the last 60 days (cash is as of today only).
        const first60 = new Map<string, { day: string; title: string }>();
        for (let i = 59; i >= 0; i--) {
          const day = addDays(today, -i);
          for (const w of await warnings.compute(as('md@demo.com'), day, ['SCHEDULE', 'VENDOR', 'STOCK', 'MACHINE', 'DPR'])) {
            const k = w.key.split(':').slice(0, 2).join(':');
            if (!first60.has(k)) first60.set(k, { day, title: w.title });
          }
        }
        console.log(`\nBacktest, last 60 days (MD): ${first60.size} warnings would have fired`);
        for (const [, v] of [...first60.entries()].sort((a, b) => a[1].day.localeCompare(b[1].day))) console.log(`  ${v.day}  ${v.title}`);
      })().then(resolve, reject);
    }),
  );
  await app.close();
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(`Demo data: ${problems.length} problems`);
  return problems.length;
}

(async () => {
  const demoProblems = process.env.DATABASE_URL ? await demo() : 0;
  process.exit(failed || demoProblems ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
