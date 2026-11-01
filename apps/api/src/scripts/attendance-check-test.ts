/**
 * Attendance cross-check tests. First the rules on their own: a bill line's trade, a bill's days, what the
 * records support, man-days above them, workers with no punch and head-count gaps. Then a backtest on labelled crew
 * cases, the way HR would check a month by hand: at least 6 flags in 10 must be real (the strategy's bar) and every padded
 * bill caught. Then, when DATABASE_URL is set, the demo company: Sri Jagannath's labour bill flagged at the helpers'
 * padding on the page, its bill checks and the watch list; Maa Tarini's bill clean; the three helpers with no punch named
 * to the project manager and HR and to no one else; a padded head count planted and found; roles. Planted rows go again.
 *
 *   node dist/scripts/attendance-check-test.js                 # rules only
 *   DATABASE_URL=… node dist/scripts/attendance-check-test.js  # rules and demo data
 */
import assert from 'node:assert/strict';
import { isManDayUnit, type AttendanceSourcesDto, type RoleKey } from '@erp/shared';
import { billExcess, billSpan, dprManpower, headGap, normName, supportedOf, tradeOf, unpunched } from '../attendance-check/attendance-check-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const src = (headCount: number | null, rollCall: number | null, punched: number | null = null): AttendanceSourcesDto => ({ headCount, rollCall, punched });

test('man-day units: Man-day, MD, Mandays and Man days; not Day, Cum or Hour', () => {
  for (const u of ['Man-day', 'man day', 'Mandays', 'MD', 'M.D.', 'Man-Days']) assert.ok(isManDayUnit(u), u);
  for (const u of ['Day', 'Cum', 'Hour', 'Nos', 'Month']) assert.ok(!isManDayUnit(u), u);
});

test('trade of a line: named as a word, plural or not; the longest name wins; none is null', () => {
  const trades = ['Mason', 'Helper', 'Bar Bender', 'Bender'];
  assert.equal(tradeOf('Helper (man-day)', trades), 'Helper');
  assert.equal(tradeOf('Masons for culvert headwalls', trades), 'Mason');
  assert.equal(tradeOf('Bar benders, slab', trades), 'Bar Bender');
  assert.equal(tradeOf('Unskilled labour', trades), null);
  assert.equal(tradeOf('Masonry work', trades), null);
});

test('contractor names: case, dots and Pvt Ltd do not matter', () => {
  assert.equal(normName('Sri Jagannath Constructions Pvt. Ltd.'), normName('sri jagannath constructions'));
});

test("a bill's days: after the bill before, else from the work order's start, else its date", () => {
  assert.deepEqual(billSpan('2026-10-10', '2026-10-01', '2026-09-28', '2026-10-20'), { from: '2026-10-11', to: '2026-10-20' });
  assert.deepEqual(billSpan(null, '2026-10-01', '2026-09-28', '2026-10-20'), { from: '2026-10-01', to: '2026-10-20' });
  assert.deepEqual(billSpan(null, null, '2026-09-28', '2026-10-20'), { from: '2026-09-28', to: '2026-10-20' });
});

test('supported: the higher of head count and roll call; punches never raise it; null when neither is kept', () => {
  assert.equal(supportedOf(src(87, 86, 83)), 87);
  assert.equal(supportedOf(src(null, 40, 40)), 40);
  assert.equal(supportedOf(src(null, null, 12)), null);
});

test('man-days above: flagged from 2 and 5% of what is supported; nothing kept flags the whole line', () => {
  assert.deepEqual(billExcess(96, src(87, 86, 83)), { supported: 87, excess: 9, flagged: true });
  assert.equal(billExcess(64, src(63, 63)).flagged, false); // 1 over is rounding
  assert.equal(billExcess(205, src(200, null)).flagged, false); // 5 of 200 is within 5%
  assert.equal(billExcess(211, src(200, null)).flagged, true);
  assert.deepEqual(billExcess(48, src(null, null)), { supported: null, excess: 48, flagged: true });
  assert.deepEqual(billExcess(40, src(48, null)), { supported: 48, excess: 0, flagged: false }); // billed less: fine
});

test('no punch: enrolled, present, on a day others of the crew punched, from 2 in a crew', () => {
  const w = (present: boolean, enrolled: boolean, punched: boolean) => ({ present, enrolled, punched });
  assert.equal(unpunched(true, [w(true, true, false), w(true, true, false), w(true, true, true)]).flagged, true);
  assert.equal(unpunched(true, [w(true, true, false), w(true, true, true)]).flagged, false); // one forgotten punch
  assert.equal(unpunched(false, [w(true, true, false), w(true, true, false)]).flagged, false); // device silent
  assert.equal(unpunched(true, [w(true, false, false), w(true, false, false)]).flagged, false); // not enrolled
  assert.equal(unpunched(true, [w(false, true, false), w(false, true, false), w(true, true, true)]).flagged, false); // absent
  assert.equal(unpunched(true, [w(true, true, false), w(true, true, false), w(true, true, false)]).flagged, false); // crew not using the device yet
});

test('head-count gap: from 3 heads and 10% of the lower figure', () => {
  assert.equal(headGap(14, 11).flagged, true);
  assert.equal(headGap(13, 11).flagged, false);
  assert.equal(headGap(60, 55).flagged, false); // 5 of 55 is under 10%
  assert.equal(headGap(62, 55).flagged, true);
});

test("a DPR's manpower: the sum of its rows, null when it lists none", () => {
  assert.equal(dprManpower([{ category: 'Mason', count: 10 }, { category: 'Helper', count: 22 }]), 32);
  assert.equal(dprManpower([]), null);
  assert.equal(dprManpower(null), null);
});

/**
 * Crews as HR found them on checking a month by hand: what was billed, what the site recorded, and whether the bill was
 * really padded. Some honest bills flag (a head count missed on a busy day, a roll call not kept), and some padding
 * hides under a padded head count, which no rule over the records can see.
 */
const CASES: { name: string; billed: number; s: AttendanceSourcesDto; padded: boolean }[] = [
  { name: 'helpers billed 9 over the head count', billed: 96, s: src(87, 86, 83), padded: true },
  { name: 'masons exact', billed: 63, s: src(63, 63, 63), padded: false },
  { name: 'helpers on head count only, exact', billed: 48, s: src(48, null), padded: false },
  { name: 'carpenters a half day over', billed: 30.5, s: src(30, 30, 29), padded: false },
  { name: 'helpers 2 over on 120 (rounding up half days)', billed: 122, s: src(120, 121), padded: false },
  { name: 'bar benders billed for a Sunday not worked', billed: 42, s: src(36, 36, 35), padded: true },
  { name: 'helpers billed with no head count kept', billed: 60, s: src(null, null), padded: true },
  { name: 'masons: proxy names on the roll call and the head count', billed: 70, s: src(70, 70, 58), padded: true },
  { name: 'helpers billed for a crew sent home in the rain', billed: 88, s: src(72, 70, 69), padded: true },
  { name: 'operators exact, no device', billed: 26, s: src(26, null), padded: false },
  { name: 'helpers billed 3 under', billed: 45, s: src(48, null), padded: false },
  { name: 'masons 4 over on 210 (within 5%)', billed: 214, s: src(210, 208, 200), padded: false },
  { name: 'helpers billed 15 over on 300', billed: 315, s: src(300, null), padded: true },
  { name: 'head count missed a crew on a busy day (sheet fixed later)', billed: 52, s: src(46, null), padded: false },
  { name: 'fitters exact', billed: 18, s: src(18, 18, 18), padded: false },
  { name: 'electricians billed a week after they left', billed: 34, s: src(20, 20, 20), padded: true },
  { name: 'helpers with the roll call above the head count', billed: 75, s: src(70, 75, 74), padded: false },
  { name: 'masons billed double on a day shared with another site', billed: 66, s: src(58, 58, 57), padded: true },
  { name: 'helpers, 1 over', billed: 41, s: src(40, null), padded: false },
  { name: 'shuttering crew billed overtime as man-days', billed: 58, s: src(50, 50, 49), padded: true },
  { name: 'helpers, roll call not kept for two days (honest)', billed: 64, s: src(null, 54, 54), padded: false },
  { name: 'masons exact on head count', billed: 90, s: src(90, null), padded: false },
  { name: 'helpers padded on the bill and the sheet alike', billed: 80, s: src(80, null), padded: true },
  { name: 'carpenters 2 over on 24 (one man, one day, twice)', billed: 26, s: src(24, 24, 24), padded: true },
];

test('backtest on labelled crews: at least 6 flags in 10 real, and the padding a record can show is all caught', () => {
  const flagged = CASES.filter((c) => billExcess(c.billed, c.s).flagged);
  const real = flagged.filter((c) => c.padded);
  const visible = CASES.filter((c) => c.padded && supportedOf(c.s) !== c.billed);
  const caught = visible.filter((c) => billExcess(c.billed, c.s).flagged);
  console.log(`     backtest: ${flagged.length} of ${CASES.length} crews flagged, ${real.length} really padded (${Math.round((real.length / flagged.length) * 100)}%); ${caught.length} of ${visible.length} paddings the records show caught`);
  assert.ok(real.length / flagged.length >= 0.6, `only ${real.length} of ${flagged.length} flags are real`);
  assert.equal(caught.length, visible.length, `missed: ${visible.filter((c) => !caught.includes(c)).map((c) => c.name).join('; ')}`);
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
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { AttendanceCheckService } = await import('../attendance-check/attendance-check.service');
  const { BillChecksService } = await import('../checks/bill-checks.service');
  const { WarningsService } = await import('../warnings/warnings.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const { todayIn } = await import('../notifications/time');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const attendance = app.get(AttendanceCheckService);
  const billChecks = app.get(BillChecksService);
  const warnings = app.get(WarningsService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  const restore: { id: string; count: number; sheetId: string; total: number }[] = [];

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
        const pm = as('pm@demo.com');
        const hr = as('hr@demo.com');
        const md = as('md@demo.com');
        const accounts = as('accounts@demo.com');
        const engineer = as('engineer@demo.com');
        const today = todayIn();
        const road = await prisma.project.findFirstOrThrow({ where: { organizationId: org.id, code: 'RD-2026-01' } });
        const sjcBill = await prisma.subcontractBill.findFirstOrThrow({ where: { organizationId: org.id, invoiceNo: 'SJC/LAB/26/014' } });
        const mtlsBill = await prisma.subcontractBill.findFirstOrThrow({ where: { organizationId: org.id, invoiceNo: 'MTLS/26/0088' } });
        const month = sjcBill.measuredUpTo.toISOString().slice(0, 7);

        // 1. The page: Sri Jagannath's helpers flagged at the padding, masons and Maa Tarini clean.
        const page = await attendance.get(pm, month, road.id);
        const sjc = page.bills.find((b) => b.billId === sjcBill.id);
        const helper = sjc?.lines.find((l) => l.trade === 'Helper');
        const mason = sjc?.lines.find((l) => l.trade === 'Mason');
        check('page: the labour bill read as Mason and Helper lines', !!helper && !!mason, JSON.stringify(sjc?.lines.map((l) => l.trade)));
        check('page: helpers billed 9 above the head count and flagged', !!helper && helper.flagged && helper.excess === 9 && helper.supported === helper.sources.headCount, JSON.stringify(helper));
        check('page: the 9 helper man-days at the bill rate', !!helper && helper.excessInr === 9 * 550, String(helper?.excessInr));
        check('page: punches below the roll call where three helpers did not punch', !!helper && helper.sources.punched === (helper.sources.rollCall ?? 0) - 3, JSON.stringify(helper?.sources));
        check('page: masons match every record', !!mason && !mason.flagged && mason.billed === mason.sources.headCount && mason.sources.rollCall === mason.sources.punched, JSON.stringify(mason));
        const mtls = page.bills.find((b) => b.billId === mtlsBill.id);
        check("page: Maa Tarini's helpers match the head count; no roll call kept", !!mtls && !mtls.lines[0].flagged && mtls.lines[0].sources.rollCall === null && mtls.lines[0].billed === mtls.lines[0].sources.headCount, JSON.stringify(mtls?.lines));
        const billFlag = page.flags.find((f) => f.kind === 'BILL_ABOVE' && f.billId === sjcBill.id);
        check('page: a flag for the bill with its working', !!billFlag && billFlag.valueInr === 4950 && billFlag.working.length >= 4 && billFlag.workers === null);
        check("page: one flag for the bill, none for Maa Tarini's", page.flags.filter((f) => f.kind === 'BILL_ABOVE').every((f) => f.billId !== mtlsBill.id));

        // 2. The three helpers who did not punch: named to the PM and HR only.
        const miss = page.flags.find((f) => f.kind === 'NO_PUNCH' && f.projectId === road.id && !!sjc && f.from >= sjc.from && f.to <= sjc.to);
        check('no punch: three helpers on one day', !!miss && miss.workers?.length === 3, JSON.stringify(miss?.workers));
        const hrPage = await attendance.get(hr, month, road.id);
        check('no punch: HR sees their names too', hrPage.namesShown && !!hrPage.flags.find((f) => f.kind === 'NO_PUNCH')?.workers?.length);
        const mdPage = await attendance.get(md, month, road.id);
        check('no punch: management sees the count, not the names', !mdPage.namesShown && mdPage.flags.filter((f) => f.kind === 'NO_PUNCH').every((f) => f.workers === null) && mdPage.flags.some((f) => f.kind === 'NO_PUNCH'));
        check('no punch: no head-count or DPR flags on the seeded days', !page.flags.some((f) => f.kind === 'HEADCOUNT_ABOVE' || f.kind === 'DPR_GAP'), page.flags.map((f) => f.title).join('; '));

        // 3. The days: one row a day, and the day without three punches shows it.
        const missDay = page.days.find((d) => d.date === miss?.from);
        check('days: every day of the month so far', page.days.length === Number((month === today.slice(0, 7) ? today : page.to).slice(8)), String(page.days.length));
        const sjcCrew = missDay?.crews.find((c) => /Jagannath/.test(c.contractor));
        check('days: the crew three punches short that day', !!sjcCrew && sjcCrew.punched === (sjcCrew.rollCall ?? 0) - 3, JSON.stringify(sjcCrew));

        // 4. The bill's own checks (counts only) and the watch list.
        const own = await billChecks.checksOf(accounts as never, 'subcontract-bill', sjcBill.id);
        const dayCheck = own.filter((c) => c.key.startsWith('mandays'));
        check("bill checks: the helpers' line flagged, nobody named", dayCheck.length === 1 && !dayCheck[0].ok && /supports/.test(dayCheck[0].title) && !/Sahu|Kisan|Gouda/.test(`${dayCheck[0].title} ${dayCheck[0].detail}`), JSON.stringify(dayCheck));
        const mtlsChecks = await billChecks.checksOf(accounts as never, 'subcontract-bill', mtlsBill.id);
        check("bill checks: Maa Tarini's bill passes the man-day check", mtlsChecks.some((c) => c.key === 'mandays' && c.ok) && !mtlsChecks.some((c) => !c.ok), JSON.stringify(mtlsChecks.filter((c) => !c.ok)));
        const watch = await warnings.compute(md, today, ['MANDAYS_ABOVE']);
        check('watch list: the bill waiting for approval, with its rupees', watch.some((w) => w.kind === 'MANDAYS_ABOVE' && w.links.some((l) => l.href === `/subcontract-bills/${sjcBill.id}`) && w.impact?.inr === 4950), JSON.stringify(watch.map((w) => w.title)));
        check('watch list: only the flagged bill', !watch.some((w) => w.links.some((l) => l.href === `/subcontract-bills/${mtlsBill.id}`)));

        // 5. A padded head count, planted: six more masons on a day than the roll call names.
        const sheet = await prisma.attendanceSheet.findFirstOrThrow({ where: { projectId: road.id, date: { lte: sjcBill.measuredUpTo } }, orderBy: { date: 'desc' }, include: { lines: true } });
        const masons = sheet.lines.find((l) => /Jagannath/.test(l.contractor) && l.category === 'Mason')!;
        restore.push({ id: masons.id, count: masons.count, sheetId: sheet.id, total: sheet.totalWorkers });
        await prisma.attendanceLine.update({ where: { id: masons.id }, data: { count: masons.count + 6 } });
        await prisma.attendanceSheet.update({ where: { id: sheet.id }, data: { totalWorkers: sheet.totalWorkers + 6 } });
        const planted = await attendance.get(pm, month, road.id);
        const date = sheet.date.toISOString().slice(0, 10);
        check('planted: the head count six above the roll call', planted.flags.some((f) => f.kind === 'HEADCOUNT_ABOVE' && f.from === date && /Jagannath/.test(f.contractor) && f.quantity === '6 workers'), planted.flags.map((f) => f.title).join('; '));
        const dpr = await prisma.dailyReport.findFirst({ where: { projectId: road.id, date: sheet.date, status: { not: 'DRAFT' } } });
        if (dpr) check('planted: and six above the DPR', planted.flags.some((f) => f.kind === 'DPR_GAP' && f.from === date));
        check('planted: the bill now supported up to the padded sheet', (planted.bills.find((b) => b.billId === sjcBill.id)?.lines.find((l) => l.trade === 'Mason')?.supported ?? 0) === (mason?.supported ?? 0) + 6);

        // 6. Roles.
        let refused = false;
        try {
          await attendance.get(engineer, month);
        } catch {
          refused = true;
        }
        check('roles: a site engineer is refused the page', refused);
        console.log(`\nDemo company: ${page.bills.length} man-day bills, ${page.flags.length} flags on the road site in ${month}`);
      })()
        .finally(async () => {
          for (const r of restore) {
            await prisma.attendanceLine.update({ where: { id: r.id }, data: { count: r.count } });
            await prisma.attendanceSheet.update({ where: { id: r.sheetId }, data: { totalWorkers: r.total } });
          }
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
