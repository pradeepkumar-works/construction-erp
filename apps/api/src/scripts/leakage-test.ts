/**
 * Leakage checks' tests. First the rules on their own: the company median and a site's material against
 * its allowance and the other sites, a rate against what other sites paid, fuel issued on a day with no log, and a
 * hired machine paid for idle time. Then, when DATABASE_URL is set, a replay on the demo company: leaks of each kind are
 * put into a month four months back (cement over the norm, an order above another site's rate, diesel into a machine
 * with no log, a machine on monthly hire standing idle, one on hourly hire short of its minimum) and every one must be
 * found with its rupees, the purchase order's record must carry its rate check, the roles must see only their
 * sections, and this month's flags must agree with the watch list. Everything put in is taken out again.
 *
 *   node dist/scripts/leakage-test.js                 # rules only
 *   DATABASE_URL=… node dist/scripts/leakage-test.js  # rules and demo data
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { FUEL_NO_LOG_MIN_LITRES, IDLE_MIN_DAYS, leakageSections, rateAboveOthers, type RateQuote, type RoleKey } from '@erp/shared';
import { companyMedians, fuelWithoutLog, idleHire, materialLeak, median, monthSpan } from '../leakage/leakage-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const near = (a: number | null | undefined, b: number, eps = 0.01) => assert.ok(a !== null && a !== undefined && Math.abs(a - b) < eps, `${a} is not ${b}`);

// Material

test('median: middle value, mean of the middle two, null for none', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('company median of an item is over the sites with an allowance', () => {
  const m = companyMedians([
    { projectId: 'a', itemId: 'cement', allowed: 100, consumed: 100 },
    { projectId: 'b', itemId: 'cement', allowed: 100, consumed: 90 },
    { projectId: 'c', itemId: 'cement', allowed: 0, consumed: 50 },
    { projectId: 'a', itemId: 'steel', allowed: 10, consumed: 12 },
  ]);
  near(m.get('cement')!.median, 0.95);
  assert.equal(m.get('cement')!.sites, 2);
  assert.equal(m.get('steel')!.sites, 1);
});

test('material over its allowance is a leak, measured from the allowance', () => {
  const l = materialLeak({ projectId: 'a', itemId: 'x', allowed: 1000, consumed: 1150 }, undefined)!;
  near(l.overPct, 15);
  near(l.excess, 150);
  assert.equal(l.against, 'ALLOWANCE');
  // Two per cent over is within the slack
  assert.equal(materialLeak({ projectId: 'a', itemId: 'x', allowed: 1000, consumed: 1020 }, undefined), null);
});

test('a site within its allowance but well above the other sites is a leak, measured from the median', () => {
  const l = materialLeak({ projectId: 'a', itemId: 'x', allowed: 1000, consumed: 980 }, { median: 0.8, sites: 3 })!;
  assert.equal(l.overPct, null);
  near(l.abovePts, 18);
  near(l.excess, 180);
  assert.equal(l.against, 'MEDIAN');
  // One site is no company to compare with, and 5 points above is not enough
  assert.equal(materialLeak({ projectId: 'a', itemId: 'x', allowed: 1000, consumed: 980 }, { median: 0.8, sites: 1 }), null);
  assert.equal(materialLeak({ projectId: 'a', itemId: 'x', allowed: 1000, consumed: 850 }, { median: 0.8, sites: 3 }), null);
  assert.equal(materialLeak({ projectId: 'a', itemId: 'x', allowed: 0, consumed: 50 }, { median: 0.8, sites: 3 }), null);
});

// Rates

const quote = (over: Partial<RateQuote>): RateQuote => ({ purchaseOrderId: 'po', poNo: 'PO-1', poDate: '2026-10-10', projectId: 'other', projectName: 'Other site', vendorName: 'V', rate: 100, ...over });

test('a rate above the lowest another site paid in the 30 days before is flagged', () => {
  const hit = rateAboveOthers({ rate: 110, projectId: 'mine', poDate: '2026-10-20' }, [quote({ rate: 104, purchaseOrderId: 'a' }), quote({ rate: 100, purchaseOrderId: 'b' })])!;
  assert.equal(hit.best.purchaseOrderId, 'b');
  near(hit.abovePct, 10);
});

test('own site, later orders, orders over 30 days old and small differences are not flagged', () => {
  assert.equal(rateAboveOthers({ rate: 110, projectId: 'mine', poDate: '2026-10-20' }, [quote({ projectId: 'mine' })]), null);
  assert.equal(rateAboveOthers({ rate: 110, projectId: 'mine', poDate: '2026-10-20' }, [quote({ poDate: '2026-10-21' })]), null);
  assert.equal(rateAboveOthers({ rate: 110, projectId: 'mine', poDate: '2026-10-20' }, [quote({ poDate: '2026-09-19' })]), null);
  assert.ok(rateAboveOthers({ rate: 110, projectId: 'mine', poDate: '2026-10-20' }, [quote({ poDate: '2026-09-20' })]));
  assert.equal(rateAboveOthers({ rate: 102, projectId: 'mine', poDate: '2026-10-20' }, [quote({})]), null);
  assert.ok(rateAboveOthers({ rate: 102.5, projectId: 'mine', poDate: '2026-10-20' }, [quote({})]));
});

// Fuel

test('fuel issued on a day with no log is flagged from the minimum, a day summed over its slips', () => {
  const issues = [
    { equipmentId: 'm1', date: '2026-10-05', litres: 15, entryId: 'e1', entryNo: 'ISS-1' },
    { equipmentId: 'm1', date: '2026-10-05', litres: 10, entryId: 'e2', entryNo: 'ISS-2' },
    { equipmentId: 'm1', date: '2026-10-06', litres: 80, entryId: 'e3', entryNo: 'ISS-3' },
    { equipmentId: 'm2', date: '2026-10-05', litres: FUEL_NO_LOG_MIN_LITRES - 1, entryId: 'e4', entryNo: 'ISS-4' },
  ];
  const out = fuelWithoutLog(issues, new Set(['m1|2026-10-06']));
  assert.deepEqual(out.map((d) => [d.equipmentId, d.date, d.litres, d.entries.length]), [['m1', '2026-10-05', 25, 2]]);
});

// Idle hire

const days = (from: number, to: number, worked: (d: number) => number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ date: `2026-06-${String(from + i).padStart(2, '0')}`, worked: worked(from + i) }));

test('hourly hire short of its minimum for the days gone is paid for the hours short', () => {
  // 200 hours a month, 10 of June's 30 days gone: 66.7 hours due, 20 worked
  const h = idleHire({ rateUnit: 'HOUR', rate: 1000, minHours: 200 }, days(1, 10, () => 2), '2026-06', '2026-06-10')!;
  near(h.minSoFar, 66.67);
  near(h.shortHours, 46.67);
  near(h.paidIdle, 46666.67, 1);
  assert.equal(h.idleDays, 0);
  // Above the minimum, or with no minimum, nothing is paid for idle time
  assert.equal(idleHire({ rateUnit: 'HOUR', rate: 1000, minHours: 200 }, days(1, 10, () => 8), '2026-06', '2026-06-10'), null);
  assert.equal(idleHire({ rateUnit: 'HOUR', rate: 1000, minHours: null }, days(1, 10, () => 0), '2026-06', '2026-06-10'), null);
});

test('monthly hire idle from IDLE_MIN_DAYS days, counted between its first and last log, each a day of the month\'s rate', () => {
  const h = idleHire({ rateUnit: 'MONTH', rate: 300000, minHours: null }, [...days(5, 6, () => 8), { date: '2026-06-12', worked: 0 }], '2026-06', '2026-06-12')!;
  // 5 to 12 June is 8 days; worked on 2 of them. Days after the last log are not counted.
  assert.equal(h.days, 8);
  assert.equal(h.idleDays, 6);
  near(h.paidIdle, 60000);
  assert.equal(idleHire({ rateUnit: 'MONTH', rate: 300000, minHours: null }, [...days(5, 6, () => 8), { date: '2026-06-12', worked: 0 }], '2026-06', '2026-06-30')!.idleDays, 6);
  assert.equal(idleHire({ rateUnit: 'MONTH', rate: 300000, minHours: null }, days(1, IDLE_MIN_DAYS, (d) => (d === 1 ? 8 : 0)), '2026-06', `2026-06-0${IDLE_MIN_DAYS}`), null);
  // Daily hire bills only the days worked
  assert.equal(idleHire({ rateUnit: 'DAY', rate: 14000, minHours: null }, days(1, 10, () => 0), '2026-06', '2026-06-10'), null);
});

test('a month runs to its last day, or to today while it runs', () => {
  assert.deepEqual(monthSpan('2026-02', '2026-10-23'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthSpan('2026-10', '2026-10-23'), { from: '2026-10-01', to: '2026-10-23' });
});

// Roles

test('roles: each section goes to those who can act on it', () => {
  assert.deepEqual(leakageSections('MANAGEMENT'), ['material', 'rates', 'fuel', 'idle']);
  assert.deepEqual(leakageSections('STORE_MANAGER'), ['material', 'fuel', 'idle']);
  assert.deepEqual(leakageSections('QUANTITY_SURVEYOR'), ['material']);
  assert.deepEqual(leakageSections('PROCUREMENT_MANAGER'), ['rates']);
  assert.deepEqual(leakageSections('ACCOUNTS_MANAGER'), ['material', 'rates', 'fuel', 'idle']);
  assert.deepEqual(leakageSections('SITE_ENGINEER'), []);
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
  const { LeakageService } = await import('../leakage/leakage.service');
  const { WarningsService } = await import('../warnings/warnings.service');
  const { PurchaseOrdersService } = await import('../purchasing/purchase-orders.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const { todayIn } = await import('../notifications/time');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const leakage = app.get(LeakageService);
  const warnings = app.get(WarningsService);
  const orders = app.get(PurchaseOrdersService);
  const D = (v: number) => new Prisma.Decimal(v);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  const tag = randomUUID().slice(0, 8).toUpperCase();
  const made = { entries: [] as string[], progress: [] as string[], orders: [] as string[], logs: [] as string[], machines: [] as string[] };

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
        const md = as('md@demo.com');
        const store = as('store@demo.com');
        const projects = await prisma.project.findMany({ where: { organizationId: org.id, code: { in: ['BL-2026-02', 'WS-2026-03'] } }, select: { id: true, code: true } });
        const bl = projects.find((p) => p.code === 'BL-2026-02')!;
        const ws = projects.find((p) => p.code === 'WS-2026-03')!;
        const vendor = await prisma.vendor.findFirstOrThrow({ where: { organizationId: org.id, kinds: { has: 'SUPPLIER' } } });

        // The month the leaks go into: four months back, all of it.
        const today = todayIn();
        const back = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
        back.setUTCMonth(back.getUTCMonth() - 4);
        const month = back.toISOString().slice(0, 7);
        const { from, to } = monthSpan(month, today);
        const on = (d: number) => new Date(`${month}-${String(d).padStart(2, '0')}T00:00:00Z`);
        let n = 0;
        const entryNo = () => `LEAK-${tag}-${++n}`;

        // 1. Cement over the norm at the building site: 20 m³ of slab allows 8.2 bags a m³ with its wastage; 300 issued.
        const norm = await prisma.materialNorm.findFirstOrThrow({ where: { projectId: bl.id, item: { name: 'OPC 53 Grade Cement' } }, include: { item: true } });
        const activity = await prisma.activity.findFirstOrThrow({ where: { projectId: bl.id, boqItemId: norm.boqItemId } });
        const before = await leakage.compute(md, from, to, ['material']);
        made.progress.push(
          (await prisma.progressEntry.create({ data: { organizationId: org.id, projectId: bl.id, activityId: activity.id, date: on(8), quantity: D(20), status: 'APPROVED', submittedById: md.id } })).id,
        );
        made.entries.push(
          (
            await prisma.stockEntry.create({
              data: {
                organizationId: org.id, projectId: bl.id, type: 'ISSUE', entryNo: entryNo(), date: on(9), createdById: store.id,
                lines: { create: [{ organizationId: org.id, projectId: bl.id, itemId: norm.itemId, type: 'ISSUE', date: on(9), quantity: D(-300) }] },
              },
            })
          ).id,
        );

        // 2. The water supply site orders an item at ₹120 the building site bought at ₹100 a week before.
        const item = `Leak test pipe ${tag}`;
        const po = async (projectId: string, date: number, rate: number, status: 'APPROVED' | 'SUBMITTED') => {
          const amount = D(rate * 50);
          const o = await prisma.purchaseOrder.create({
            data: {
              organizationId: org.id, projectId, vendorId: vendor.id, poNo: `LEAK-${tag}-${++n}`, poDate: on(date), status, submittedById: md.id, submittedAt: on(date),
              subtotal: amount, gstAmount: D(0), total: amount,
              lines: { create: [{ itemName: item, unit: 'Nos', quantity: D(50), rate: D(rate), gstRate: D(0), amount, gstAmount: D(0) }] },
            },
          });
          made.orders.push(o.id);
          return o;
        };
        const cheap = await po(bl.id, 3, 100, 'APPROVED');
        const dear = await po(ws.id, 10, 120, 'SUBMITTED');

        // 3. 50 litres of diesel into the backhoe on a day it has no log.
        const backhoe = await prisma.equipment.findFirstOrThrow({ where: { organizationId: org.id, projectId: ws.id, code: { endsWith: 'JCB-01' } } });
        const diesel = await prisma.item.findFirstOrThrow({ where: { organizationId: org.id, isFuel: true } });
        check('the backhoe has no log on the 12th to begin with', !(await prisma.machineryLog.count({ where: { equipmentId: backhoe.id, date: on(12) } })));
        made.entries.push(
          (
            await prisma.stockEntry.create({
              data: {
                organizationId: org.id, projectId: ws.id, type: 'ISSUE', entryNo: entryNo(), date: on(12), createdById: store.id, equipmentId: backhoe.id,
                lines: { create: [{ organizationId: org.id, projectId: ws.id, itemId: diesel.id, type: 'ISSUE', date: on(12), quantity: D(-50) }] },
              },
            })
          ).id,
        );

        // 4. A crane hired by the month (₹3,00,000) worked on the 1st and stood the next 9 days; logs stop on the 10th.
        // 5. A loader hired by the hour (₹1,000, 200 hours a month) works 2 hours a day all month.
        const machine = async (code: string, rateUnit: 'HOUR' | 'MONTH', rate: number, minHours: number | null) => {
          const m = await prisma.equipment.create({ data: { organizationId: org.id, projectId: ws.id, code: `${code}-${tag}`, name: `Leak test ${code}`, category: 'Test', ownership: 'HIRED', rate: D(rate), rateUnit, hireMinHours: minHours ? D(minHours) : null } });
          made.machines.push(m.id);
          return m;
        };
        const crane = await machine('CRN', 'MONTH', 300000, null);
        const loader = await machine('LDR', 'HOUR', 1000, 200);
        const lastDay = Number(to.slice(8, 10));
        const log = async (equipmentId: string, d: number, worked: number) =>
          made.logs.push((await prisma.machineryLog.create({ data: { organizationId: org.id, projectId: ws.id, equipmentId, date: on(d), hoursWorked: D(worked), idleHours: D(8 - worked), status: 'APPROVED', submittedById: md.id } })).id);
        for (let d = 1; d <= 10; d++) await log(crane.id, d, d === 1 ? 8 : 0);
        for (let d = 1; d <= lastDay; d++) await log(loader.id, d, 2);

        const { flags } = await leakage.compute(md, from, to, ['material', 'rates', 'fuel', 'idle']);
        const find = (pred: (f: (typeof flags)[number]) => boolean) => flags.find(pred);

        const cement = find((f) => f.section === 'material' && f.key === `material:${bl.id}:${norm.itemId}`);
        const allowed = 20 * Number(norm.qtyPerUnit) * (1 + Number(norm.wastagePct) / 100);
        const hadBefore = before.flags.find((f) => f.key === `material:${bl.id}:${norm.itemId}`);
        check('cement over the norm is found', !!cement, flags.map((f) => f.key).join(', '));
        if (cement && !hadBefore) {
          check('cement: quantity at risk is used less allowed', cement.quantity.startsWith((Math.round((300 - allowed) * 10) / 10).toLocaleString('en-IN')), `${cement.quantity} vs ${300 - allowed}`);
          check('cement: rupees at the item rate', Math.abs((cement.valueInr ?? 0) - (300 - allowed) * Number(norm.item.rate)) < 1, `${cement.valueInr}`);
          check('cement: working shows the norm', cement.working.some((w) => w.includes('20 Cum done')), cement.working.join(' | '));
        }

        const rate = find((f) => f.section === 'rates' && f.links[0]?.href === `/purchase-orders/${dear.id}`);
        check('the dearer order is found', !!rate);
        check('the dearer order: ₹20 × 50 at risk', rate?.valueInr === 1000, `${rate?.valueInr}`);
        check('the dearer order: names the cheaper one', !!rate?.links.some((l) => l.href === `/purchase-orders/${cheap.id}`));
        check('the cheaper order is not flagged', !find((f) => f.section === 'rates' && f.links[0]?.href === `/purchase-orders/${cheap.id}`));
        const record = await orders.get(md, dear.id);
        check('the order record carries its rate check', record.lines[0].rateCheck?.bestRate === '100.00' && record.lines[0].rateCheck?.extra === '1000.00', JSON.stringify(record.lines[0].rateCheck));
        const cheapRecord = await orders.get(md, cheap.id);
        check('the cheaper order record has none', cheapRecord.lines[0].rateCheck === null);
        const benchmark = await orders.rateCheck(md, { item: [`${item}|Nos`], projectId: ws.id, poDate: `${month}-10` });
        check('the form gets the cheaper order to check against', Object.values(benchmark)[0]?.[0]?.purchaseOrderId === cheap.id, JSON.stringify(benchmark));

        const fuel = find((f) => f.key === `fuel-no-log:${backhoe.id}:${month}-12`);
        check('diesel with no log is found', !!fuel);
        check('diesel with no log: 50 litres', fuel?.quantity === '50 litres', fuel?.quantity);
        check('diesel with no log: priced at the fuel rate', !diesel.rate || Math.abs((fuel?.valueInr ?? 0) - 50 * Number(diesel.rate)) < 1, `${fuel?.valueInr}`);

        const craneFlag = find((f) => f.key === `idle:${crane.id}|${ws.id}`);
        const monthDays = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
        check('the idle crane is found', !!craneFlag);
        check('the idle crane: 9 idle days', craneFlag?.quantity === '9 idle days', craneFlag?.quantity);
        check('the idle crane: 9 days of the month\'s rate', Math.abs((craneFlag?.valueInr ?? 0) - (9 * 300000) / monthDays) < 1, `${craneFlag?.valueInr}`);

        const loaderFlag = find((f) => f.key === `idle:${loader.id}|${ws.id}`);
        check('the loader short of its minimum is found', !!loaderFlag);
        check('the loader: 200 − 2 a day short, at ₹1,000', Math.abs((loaderFlag?.valueInr ?? 0) - (200 - 2 * lastDay) * 1000) < 1, `${loaderFlag?.valueInr}`);

        // Roles: the store sees no rates and no rupees for hire; the QS only material; a site engineer nothing.
        const storeView = await leakage.compute(store, from, to, leakageSections(store.roleKey));
        check('the store sees no rates', !storeView.flags.some((f) => f.section === 'rates'));
        check('the store sees the crane, without rupees', storeView.flags.some((f) => f.key === `idle:${crane.id}|${ws.id}` && f.valueInr === null));
        check('the store sees the diesel with its rupees', storeView.flags.some((f) => f.key === `fuel-no-log:${backhoe.id}:${month}-12` && (f.valueInr !== null || !diesel.rate)));
        const engineer = as('engineer@demo.com');
        let refused = false;
        await leakage.get(engineer).catch(() => (refused = true));
        check('a site engineer is refused', refused);

        // This month's flags agree with the watch list.
        const now = await leakage.get(md);
        const watch = await warnings.compute(md, today, ['RATE_ABOVE', 'FUEL_NO_LOG', 'IDLE_HIRE']);
        const kindOf = (s: string, key: string) => (s === 'rates' ? 'RATE_ABOVE' : s === 'idle' ? 'IDLE_HIRE' : key.startsWith('fuel-no-log:') ? 'FUEL_NO_LOG' : null);
        const expected = now.flags.filter((f) => kindOf(f.section, f.key)).map((f) => f.title).sort();
        check('this month: the watch list has each rate, no-log and idle flag', JSON.stringify(watch.map((w) => w.title).sort()) === JSON.stringify(expected), `${watch.length} warnings, ${expected.length} flags`);
        check('this month: the watch list warnings are Checked', watch.every((w) => w.confidence === 'CHECKED'));

        console.log(`\nDemo company, ${month} with the leaks put in: ${flags.length} flags`);
        for (const f of flags) console.log(`  [${f.section}] ${f.title}${f.valueInr !== null ? ` (₹${Math.round(f.valueInr).toLocaleString('en-IN')})` : ''}`);
        console.log(`This month for the MD: ${now.flags.length} flags, ₹${Math.round(now.totalInr ?? 0).toLocaleString('en-IN')} at risk`);
      })()
        .finally(async () => {
          await prisma.machineryLog.deleteMany({ where: { id: { in: made.logs } } });
          await prisma.equipment.deleteMany({ where: { id: { in: made.machines } } });
          await prisma.purchaseOrder.deleteMany({ where: { id: { in: made.orders } } });
          await prisma.stockEntry.deleteMany({ where: { id: { in: made.entries } } });
          await prisma.progressEntry.deleteMany({ where: { id: { in: made.progress } } });
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
