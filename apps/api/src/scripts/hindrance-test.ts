/**
 * Hindrance register to notice tests (AI item 123). First the rules on their own: 100 labelled DPR remarks (9 in 10
 * must be read right: hindrance or not, and its cause), the day a hindrance began, short stops that are not
 * hindrances, the notice clause and the extension-of-time clause in the demo contracts, the notice clock's stages and
 * the notice letter. Then, when DATABASE_URL is set, the demo company: the seeded DPR remarks come up as suggestions
 * (one beside its open delay), recording, linking and dismissing them, a remark the rules cannot place going to the
 * model, the notice period found in each contract, the clock and the watch list's NOTICE_DUE (moving with the
 * contract's notice days and stopping when a letter is linked), Draft notice (nothing saved) and the register.
 *
 *   node dist/scripts/hindrance-test.js                 # rules only
 *   DATABASE_URL=… node dist/scripts/hindrance-test.js  # rules and demo data
 */
import assert from 'node:assert/strict';
import { DEFAULT_NOTICE_DAYS, type RoleKey } from '@erp/shared';
import { addDays, classifyRemark, eotClause, noticeClause, noticeClock, noticeLetter, startDateFrom, type NoticeFacts } from '../hindrance/hindrance-rules';
import { HINDRANCE_CASES } from '../hindrance/hindrance-cases';
import { DEMO_CONTRACTS } from '../documents/demo-contracts';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const page = (docNo: string, n: number) => DEMO_CONTRACTS.find((c) => c.docNo === docNo)!.pages[n - 1].join(' ');

// ---------------------------------------------------------------------------------------------------------------------
// Reading a remark

test('100 labelled DPR remarks: 9 in 10 read right (hindrance or not, and its cause)', () => {
  assert.equal(HINDRANCE_CASES.length, 100);
  let right = 0;
  let parties = 0;
  let hindrances = 0;
  const wrong: string[] = [];
  for (const c of HINDRANCE_CASES) {
    const r = classifyRemark(c.text, '2026-10-20');
    const said = r.verdict !== 'NONE';
    const ok = said === c.hindrance && (!c.hindrance || r.category === c.category);
    if (ok) right++;
    else wrong.push(`"${c.text}": ${r.verdict} ${r.category ?? ''}`);
    if (c.hindrance) {
      hindrances++;
      if (r.party === (c.party ?? null)) parties++;
    }
  }
  console.log(`     ${right} of 100 read right; party right on ${parties} of ${hindrances} hindrances`);
  for (const w of wrong) console.log(`     wrong: ${w}`);
  assert.ok(right >= 90, `${right} of 100`);
  assert.ok(parties / hindrances >= 0.9, `party ${parties} of ${hindrances}`);
});

test('a hindrance the rules cannot place is unsure, for the model; "Nil" and a few hours of ours are nothing', () => {
  assert.equal(classifyRemark('Work stopped at Ch 16+500 since yesterday', '2026-10-20').verdict, 'UNSURE');
  assert.equal(classifyRemark('Nil', '2026-10-20').verdict, 'NONE');
  assert.equal(classifyRemark('', '2026-10-20').verdict, 'NONE');
  assert.equal(classifyRemark('Diesel delivery delayed by 4 hours', '2026-10-20').verdict, 'NONE');
  assert.equal(classifyRemark('Rain for 2 hours in the afternoon', '2026-10-20').verdict, 'NONE');
  // Hours lost to the client or to villagers are still theirs to answer for.
  const r = classifyRemark('Villagers stopped the work for 3 hours, encroachment not cleared', '2026-10-20');
  assert.equal(r.verdict, 'HINDRANCE');
  assert.equal(r.party, 'THIRD_PARTY');
  assert.ok(r.matched.includes('villagers'));
});

test('the day it began: dates, days ago, yesterday and weekdays, never after the report', () => {
  const on = '2026-10-20'; // a Tuesday
  assert.equal(startDateFrom('No work since 12 Oct', on), '2026-10-12');
  assert.equal(startDateFrom('held up from 12/10', on), '2026-10-12');
  assert.equal(startDateFrom('Rain since 3 days', on), '2026-10-17');
  assert.equal(startDateFrom('stopped for the last 2 days', on), '2026-10-19');
  assert.equal(startDateFrom('3 din se kaam band', on), '2026-10-17');
  assert.equal(startDateFrom('kal se kaam ruka', on), '2026-10-19');
  assert.equal(startDateFrom('stopped since Monday', on), '2026-10-19');
  assert.equal(startDateFrom('since 25 Dec', '2026-01-05'), '2025-12-25');
  assert.equal(startDateFrom('Encroachment at Ch 12+300', on), on);
  assert.equal(classifyRemark('Continuous rain since 3 days, site waterlogged', on).startOffset, 3);
});

// ---------------------------------------------------------------------------------------------------------------------
// The contract

test('notice clause: the road contract asks for notice in 14 days (9.1), the building one for an application (5.1)', () => {
  assert.deepEqual(
    (({ no, days }) => ({ no, days }))(noticeClause(page('RD-AGR-01', 3))!),
    { no: '9.1', days: 14 },
  );
  assert.ok(noticeClause(page('RD-AGR-01', 3))!.text.startsWith('9.1 The Contractor shall give the Authority Engineer written notice'));
  assert.deepEqual(
    (({ no, days }) => ({ no, days }))(noticeClause(page('HB-AGR-01', 2))!),
    { no: '5.1', days: 14 },
  );
  // A claim made after the hindrance ends is not a notice period.
  assert.equal(noticeClause('10.1 The claim for extension of time shall be made within 28 days of the end of the hindrance.'), null);
  assert.equal(noticeClause(page('RD-AGR-01', 1)), null);
});

test('extension-of-time clause: the one about claiming it', () => {
  assert.equal(eotClause(page('RD-AGR-01', 3)), '10.1');
  assert.equal(eotClause(page('HB-AGR-01', 2)), '5.1');
});

// ---------------------------------------------------------------------------------------------------------------------
// The clock

test('notice clock: due on the start plus the notice days, at 7, 3 and 0 days left', () => {
  assert.deepEqual(noticeClock('2026-10-11', 14, '2026-10-17'), { due: '2026-10-25', daysLeft: 8, stage: null });
  assert.equal(noticeClock('2026-10-11', 14, '2026-10-18').stage, 7);
  assert.equal(noticeClock('2026-10-11', 14, '2026-10-21').stage, 7);
  assert.equal(noticeClock('2026-10-11', 14, '2026-10-22').stage, 3);
  assert.deepEqual(noticeClock('2026-10-11', 14, '2026-10-23'), { due: '2026-10-25', daysLeft: 2, stage: 3 });
  assert.equal(noticeClock('2026-10-11', 14, '2026-10-25').stage, 0);
  assert.deepEqual(noticeClock('2026-10-11', 14, '2026-10-30'), { due: '2026-10-25', daysLeft: -5, stage: 0 });
});

// ---------------------------------------------------------------------------------------------------------------------
// The letter

const facts = (over: Partial<NoticeFacts> = {}): NoticeFacts => ({
  projectName: 'District Hospital Block B (G+3)',
  agreementNo: 'HB/2026/07',
  title: 'GF slab reinforcement drawings revised by the architect',
  description: null,
  categoryLabel: 'Drawings and design',
  activityName: 'Ground floor slab',
  delayStart: '2026-10-11',
  delayEnd: null,
  today: '2026-10-23',
  remarks: [{ date: '2026-10-21', text: 'First-floor column drawings revised by the architect, waiting for the GFC' }],
  photos: 2,
  clause: { no: '5.1', docNo: 'HB-AGR-01', days: 14 },
  noticeDays: 14,
  eotClause: '5.1',
  party: 'CLIENT',
  ...over,
});

test('notice letter: the clause, the dates, the DPR entries, the days lost and the right to an extension', () => {
  const { subject, lines } = noticeLetter(facts());
  const text = lines.join('\n');
  assert.equal(subject, 'Notice of hindrance: GF slab reinforcement drawings revised by the architect');
  assert.match(text, /Under Clause 5\.1 of the agreement HB\/2026\/07, we give you notice that the work of Ground floor slab at District Hospital Block B \(G\+3\) has been held up since 11 October 2026 \(drawings and design\)\./);
  assert.match(text, /- 21 October 2026: First-floor column drawings revised/);
  assert.match(text, /The hindrance continues; so far 13 days have been lost\. Photographs taken at site \(2\) are enclosed\./);
  assert.match(text, /We reserve our right to an extension of time under Clause 5\.1 for the delay\./);
  assert.doesNotMatch(text, /after the 14 days/);
});

test('notice letter: a late notice says so; the contractor’s own delay claims nothing', () => {
  assert.match(noticeLetter(facts({ today: '2026-10-30' })).lines.join('\n'), /sent after the 14 days the agreement allows/);
  const own = noticeLetter(facts({ party: 'CONTRACTOR', clause: null, eotClause: null })).lines.join('\n');
  assert.doesNotMatch(own, /extension of time/);
  assert.match(own, /^Under the agreement HB\/2026\/07, we give you notice/);
  const ended = noticeLetter(facts({ delayEnd: '2026-10-20' })).lines.join('\n');
  assert.match(ended, /held up from 11 October 2026 to 20 October 2026/);
  assert.match(ended, /The hindrance lasted 10 days\./);
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
  const { HindranceService } = await import('../hindrance/hindrance.service');
  const { WarningsService } = await import('../warnings/warnings.service');
  const { AiService } = await import('../ai/ai.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const { todayIn } = await import('../notifications/time');
  const { parseDate, dateOnly } = await import('../common/serialize');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const hindrances = app.get(HindranceService);
  const warnings = app.get(WarningsService);
  const ai = app.get(AiService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  const madeRisks: string[] = [];
  const madeLetters: string[] = [];
  const restore: { dprId: string; issues: string | null }[] = [];
  const projectsTouched: { id: string; noticeDays: number | null }[] = [];

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
        const pm2 = as('pm2@demo.com');
        const engineer = as('engineer@demo.com');
        const today = todayIn();
        const road = await prisma.project.findFirstOrThrow({ where: { organizationId: org.id, code: 'RD-2026-01' } });
        const building = await prisma.project.findFirstOrThrow({ where: { organizationId: org.id, code: 'BL-2026-02' } });
        projectsTouched.push({ id: building.id, noticeDays: building.noticeDays });
        // Start from the remarks as the seed left them: earlier runs' decisions are forgotten.
        await prisma.hindranceCheck.deleteMany({ where: { organizationId: org.id } });

        // 1. The seeded remarks come up; the short diesel delay does not.
        const list = await hindrances.suggestions(pm, road.id);
        const encroach = list.find((s) => /Villagers again stopped/.test(s.remark));
        const htLine = list.find((s) => /HT line at Ch 14\+100/.test(s.remark));
        check('suggestions: the villagers remark, as land held up by a third party', encroach?.category === 'LAND' && encroach.party === 'THIRD_PARTY', JSON.stringify(encroach));
        check('suggestions: beside the open encroachment delay', encroach?.openDelay?.riskNo === 'RISK-2026-0004', JSON.stringify(encroach?.openDelay));
        check('suggestions: the HT line remark, as a utility not shifted, begun 2 days before its report', htLine?.category === 'UTILITY' && htLine.delayStart === addDays(htLine.reportDate, -2) && htLine.openDelay === null, JSON.stringify(htLine));
        check('suggestions: not the diesel delayed by 4 hours', !list.some((s) => /Diesel/.test(s.remark)));
        check('suggestions: each remark is read once and kept', (await prisma.hindranceCheck.count({ where: { organizationId: org.id, projectId: road.id } })) >= 3);
        let refused = false;
        await hindrances.suggestions(engineer, road.id).catch(() => (refused = true));
        check('suggestions: a site engineer is refused (the PM records them)', refused);

        // 2. Record one as a new delay, one into its open delay, and dismiss another.
        if (htLine) {
          const risk = await hindrances.record(pm, htLine.id, {});
          madeRisks.push(risk.id);
          check('record: a new delay with the suggestion’s cause, party and start', risk.kind === 'DELAY' && risk.category === 'UTILITY' && risk.responsibleParty === 'THIRD_PARTY' && risk.delayStart === htLine.delayStart, JSON.stringify({ c: risk.category, p: risk.responsibleParty, s: risk.delayStart }));
          check('record: its details quote the DPR', risk.description?.startsWith(`From the DPR of ${htLine.reportDate}: HT line`) === true);
          let twice = false;
          await hindrances.record(pm, htLine.id, {}).catch(() => (twice = true));
          check('record: not twice', twice);
        }
        if (encroach) {
          const risk = await hindrances.record(pm, encroach.id, { riskId: encroach.openDelay!.id });
          check('record into: the open delay, no new one', risk.riskNo === 'RISK-2026-0004');
        }
        const after = await hindrances.suggestions(pm, road.id);
        check('recorded remarks leave the suggestions', !after.some((s) => s.id === htLine?.id || s.id === encroach?.id));
        const drawings = (await hindrances.suggestions(pm2, building.id)).find((s) => /column drawings revised/.test(s.remark));
        check('suggestions: the building’s drawings remark, as design held up by the client', drawings?.category === 'DESIGN' && drawings.party === 'CLIENT' && drawings.openDelay?.riskNo === 'RISK-2026-0001', JSON.stringify(drawings));
        if (drawings) {
          await hindrances.dismiss(pm2, drawings.id);
          check('dismiss: gone from the suggestions', !(await hindrances.suggestions(pm2, building.id)).some((s) => s.id === drawings.id));
        }

        // 3. A remark the rules cannot place goes to the model when Ask Nirmaan is on for the PM.
        const dpr = await prisma.dailyReport.findFirstOrThrow({ where: { projectId: road.id, status: 'APPROVED', date: { lt: parseDate(addDays(today, -3)) } }, orderBy: { date: 'desc' } });
        restore.push({ dprId: dpr.id, issues: dpr.issues });
        await prisma.dailyReport.update({ where: { id: dpr.id }, data: { issues: 'Work stopped at Ch 16+500 since yesterday, reason to be confirmed' } });
        const aiOn = (await ai.status(pm)).enabled === true;
        const unsure = (await hindrances.forReport(pm, dpr.id))!;
        check('unsure remark: suggested from its DPR’s own page', !!unsure && unsure.dprId === dpr.id);
        check(aiOn ? 'unsure remark: read by the model' : 'unsure remark: kept by the rules with no cause', unsure?.source === (aiOn ? 'MODEL' : 'RULES') && unsure.category === 'OTHER', JSON.stringify(unsure));
        check('unsure remark: begun the day before its report', unsure?.delayStart === addDays(dateOnly(dpr.date)!, -1));

        // 4. The notice period from each contract, with its clause and page.
        const roadNotice = await hindrances.noticePeriod(pm, road.id);
        check('notice period: the road contract’s clause 9.1, page 3, 14 days', roadNotice.found?.clause === '9.1' && roadNotice.found.page === 3 && roadNotice.found.days === 14 && roadNotice.found.docNo === 'RD-AGR-01', JSON.stringify(roadNotice.found));
        const buildingNotice = await hindrances.noticePeriod(pm2, building.id);
        check('notice period: the building contract’s clause 5.1, 14 days', buildingNotice.found?.clause === '5.1' && buildingNotice.found.days === 14, JSON.stringify(buildingNotice.found));
        check('notice period: none set, 14 assumed', buildingNotice.days === null && buildingNotice.effectiveDays === DEFAULT_NOTICE_DAYS);

        // 5. The clock and the watch list for the building's drawings delay (the client's, no letter).
        const design = await prisma.risk.findFirstOrThrow({ where: { organizationId: org.id, riskNo: 'RISK-2026-0001' } });
        const start = dateOnly(design.delayStart)!;
        const clock = await hindrances.notice(pm2, design.id);
        check('clock: running, due on the start plus 14 days', clock.running && clock.due === addDays(start, 14) && clock.noticeSent === null, JSON.stringify(clock));
        const expected = noticeClock(start, 14, today);
        const watch = async () => (await warnings.compute(pm2, today, ['NOTICE_DUE'])).find((w) => w.key.startsWith(`notice:${design.id}:`));
        const w1 = await watch();
        check('watch list: NOTICE_DUE at the clock’s stage', expected.stage === null ? !w1 : w1?.key === `notice:${design.id}:${expected.stage}`, `${w1?.key} vs stage ${expected.stage}`);
        await prisma.project.update({ where: { id: building.id }, data: { noticeDays: 7 } });
        const w2 = await watch();
        check('watch list: a shorter notice period on the contract moves it on', w2?.key === `notice:${design.id}:${noticeClock(start, 7, today).stage}` && w2.key !== w1?.key, `${w2?.key}`);
        const pending = await prisma.risk.findFirst({ where: { organizationId: org.id, riskNo: 'RISK-2026-0008' } });
        if (pending) check('watch list: the water site’s permission delay is overdue for notice', (await warnings.compute(pm, today, ['NOTICE_DUE'])).some((w) => w.key === `notice:${pending.id}:0`));
        check('watch list: not for the contractor’s own delays', !(await warnings.compute(pm, today, ['NOTICE_DUE'])).some((w) => w.title.includes('RISK-2026-0005')));

        // 6. Draft notice: from the delay, its DPR entries and the clause; nothing saved.
        const letters = await prisma.letter.count({ where: { organizationId: org.id } });
        const draft = await hindrances.draftNotice(pm2, design.id);
        const summary = String(draft.values.body);
        check('draft notice: an outgoing letter linked to the delay', draft.kind === 'letter' && draft.values.direction === 'OUT' && draft.values.riskId === design.id && draft.values.party === 'Dept. of Health & Family Welfare');
        check('draft notice: under clause 5.1, held up from the day the delay began', summary.includes('Under Clause 5.1 of the agreement') && summary.includes(`has been held up ${design.delayEnd ? 'from' : 'since'} `), summary.slice(0, 300));
        check('draft notice: its banner says where it came from', draft.note === 'Drafted from RISK-2026-0001, its DPR entries and clause 5.1 of HB-AGR-01, page 2', draft.note);
        check('draft notice: nothing saved', (await prisma.letter.count({ where: { organizationId: org.id } })) === letters);
        refused = false;
        await hindrances.draftNotice(as('accounts@demo.com'), design.id).catch(() => (refused = true));
        check('draft notice: accounts cannot write it', refused);

        // 7. A letter sent and linked stops the clock and the warning.
        const letter = await prisma.letter.create({
          data: { organizationId: org.id, projectId: building.id, direction: 'OUT', letterNo: `HT-${Date.now()}`, letterDate: parseDate(today), party: 'Dept. of Health & Family Welfare', subject: 'Notice of hindrance (test)', riskId: design.id, createdById: pm2.id },
        });
        madeLetters.push(letter.id);
        const stopped = await hindrances.notice(pm2, design.id);
        check('letter linked: the clock stops and names it', !stopped.running && stopped.noticeSent?.letterId === letter.id);
        check('letter linked: off the watch list', !(await watch()));

        // 8. The register for an extension-of-time claim.
        const reg = await hindrances.register(pm, road.id);
        const row = reg.rows.find((r) => r.riskNo === 'RISK-2026-0004');
        check('register: the encroachment with its letters and the DPR remark recorded into it', !!row && row.letters.length >= 3 && row.remarks.some((r) => /Villagers again stopped/.test(r.remark)), JSON.stringify(row?.remarks));
        check('register: excusable days counted', reg.excusableDays > 0 && reg.rows.every((r) => r.daysLost >= 0));
        console.log(`\nDemo company: ${list.length} hindrances suggested on the road site, model ${aiOn ? 'on' : 'off'}, register of ${reg.rows.length} delays (${reg.excusableDays} excusable days)`);
      })()
        .finally(async () => {
          await prisma.letter.deleteMany({ where: { id: { in: madeLetters } } });
          await prisma.hindranceCheck.deleteMany({ where: { organizationId: org.id } });
          await prisma.risk.deleteMany({ where: { id: { in: madeRisks } } });
          for (const r of restore) await prisma.dailyReport.update({ where: { id: r.dprId }, data: { issues: r.issues } });
          for (const p of projectsTouched) await prisma.project.update({ where: { id: p.id }, data: { noticeDays: p.noticeDays } });
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
