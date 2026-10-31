/**
 * The morning brief and the weekly narrative's tests. First the rules on their own: which lines a brief
 * leads with, what is taken from the model and what is not (a figure the facts do not hold sends the rules' draft
 * instead). Then, when DATABASE_URL is set, the demo company with the test model: only people who asked get a brief,
 * a role's brief carries only what the role sees, a company with Ask Nirmaan off gets none, a brief turned off is not
 * sent, last week's narrative reaches the weekly report, a re-run writes nothing twice, and the cost is counted.
 *
 *   node dist/scripts/briefs-test.js                 # rules only
 *   DATABASE_URL=… node dist/scripts/briefs-test.js  # rules and demo data
 */
import assert from 'node:assert/strict';
import type { ProgressReportDto, RoleKey } from '@erp/shared';
import { collectNumbers, derivedNumbers, unverifiedFigures } from '../ai/grounding';
import { NOTHING_TODAY, addDays, asPicks, mondayOf, morningCandidates, morningDraft, narrativeDraft, narrativeFacts, narrativeFits, parsePicks, rupees, type MorningFacts } from '../briefs/brief-rules';

// Never the real model from a test.
process.env.AI_PROVIDER = 'fake';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const facts = (over: Partial<MorningFacts> = {}): MorningFacts => ({
  today: '2026-10-20',
  approvals: { count: 7, overTwoDays: 3, oldestDays: 5, oldest: { type: 'DPR', title: 'DPR 14 Oct', projectName: 'Jajpur' } },
  sentBack: null,
  warnings: { count: 4, top: [{ title: 'Jajpur cement runs out by 23 Oct', projectName: 'Jajpur' }] },
  payablesDue: { count: 2, amount: '1843210.00' },
  lateDeliveries: null,
  receivables: { count: 3, amount: '9120000.00', oldestDays: 64 },
  expiring: null,
  lowStock: { count: 2 },
  ...over,
});

test('the brief leads with old approvals, then the watch list, then money due, three lines at most', () => {
  const c = morningCandidates(facts());
  const draft = morningDraft(c);
  assert.equal(draft.length, 3);
  assert.equal(draft[0].text, '3 approvals over two days old, the oldest 5 days (Daily report, Jajpur)');
  assert.equal(draft[0].href, '/approvals');
  assert.equal(draft[1].text, 'Jajpur cement runs out by 23 Oct, and 3 more on the watch list');
  assert.equal(draft[2].text, '₹18.4 L due to vendors this week or overdue, 2 bills');
  assert.equal(c.length, 5, 'receivables and low stock wait their turn');
});

test('with nothing pressing the brief says so; approvals under two days are still counted', () => {
  assert.deepEqual(morningDraft(morningCandidates(facts({ approvals: null, warnings: null, payablesDue: null, receivables: null, lowStock: null }))), [NOTHING_TODAY]);
  const fresh = morningCandidates(facts({ approvals: { count: 2, overTwoDays: 0, oldestDays: 1, oldest: null } }));
  assert.equal(fresh[0].text, '2 approvals waiting for you');
});

test('rupees in lakh and crore, as the app writes them', () => {
  assert.equal(rupees('1843210.00'), '₹18.4 L');
  assert.equal(rupees(23500000), '₹2.4 Cr');
  assert.equal(rupees('45000'), '₹45,000');
});

test("the model's picks keep the candidate's link; a bad list sends the rules' draft", () => {
  const c = morningCandidates(facts());
  const picks = parsePicks('[{"line": "Payments of ₹18.4 L fall due this week", "from": 2}, {"line": "3 approvals have waited over two days", "from": 0}]', c);
  assert.deepEqual(picks?.map((p) => p.href), ['/payables', '/approvals']);
  assert.deepEqual(parsePicks(asPicks(c, morningDraft(c)), c), morningDraft(c), 'the draft in pick form reads back as itself');
  assert.equal(parsePicks('Here is your brief: three things.', c), null);
  assert.equal(parsePicks(JSON.stringify([0, 1, 2, 3].map((i) => ({ line: 'x', from: i }))), c), null, 'four lines');
  assert.equal(parsePicks('[{"line": "a", "from": 9}]', c), null, 'no such candidate');
  assert.equal(parsePicks('[{"line": "a", "from": 1}, {"line": "b", "from": 1}]', c), null, 'one candidate twice');
  assert.equal(parsePicks(`[{"line": "${'long '.repeat(40)}", "from": 1}]`, c), null, 'too long for a line');
});

test('a figure the facts do not hold is caught; the facts\' own figures pass', () => {
  const f = facts();
  const source = [...collectNumbers(f), ...derivedNumbers(f)];
  assert.deepEqual(unverifiedFigures('₹18.4 L due to vendors this week', source), []);
  assert.deepEqual(unverifiedFigures('₹91.2 L outstanding from clients', source), []);
  assert.deepEqual(unverifiedFigures('₹22.5 L due to vendors this week', source), ['₹22.5 L']);
  assert.deepEqual(unverifiedFigures('Cement for 12 more days', source), ['12']);
});

const report = (over: Partial<ProgressReportDto> = {}): ProgressReportDto =>
  ({
    narrative: null,
    project: { id: 'p', code: 'WS-2026-03', name: 'Jajpur Rural Piped Water Supply Scheme' },
    from: '2026-10-12',
    to: '2026-10-18',
    physical: { atStartPct: 31.8, atEndPct: 41.8 },
    timeElapsedPct: 26.6,
    activities: [
      { name: 'Distribution network', unit: 'Rmt', periodQty: '12300.000', pct: 61.5, delayed: false },
      { name: 'Raw water main laying', unit: 'Rmt', periodQty: '0.000', pct: 10, delayed: true },
    ],
    manpower: [{ category: 'Mason', manDays: 60, avgPerDay: 12 }, { category: 'Helper', manDays: 150, avgPerDay: 28.4 }],
    attendanceDays: 5,
    dpr: { days: 7, approved: 6, rainyDays: 1 },
    issues: [],
    safety: [],
    delays: [{ title: 'Railway crossing permission pending', daysInPeriod: 6 }],
    nextPeriod: [{ name: 'Raw water main laying', unit: 'Rmt', balanceQty: '4200.000' }],
    ...over,
  }) as unknown as ProgressReportDto;

test('the narrative covers progress against time, work done, people, rain, hold-ups and next week, without money', () => {
  const f = narrativeFacts(report());
  const text = narrativeDraft(f);
  assert.match(text, /^In the week of 12 Oct to 18 Oct, overall progress on Jajpur Rural Piped Water Supply Scheme moved from 31\.8% to 41\.8%, with 26\.6% of the contract time gone\./);
  assert.match(text, /Work done: Distribution network 12,300 Rmt\./);
  assert.match(text, /About 40 workers a day were on site over 5 days of attendance\./);
  assert.match(text, /Rain affected 1 day\./);
  assert.match(text, /held up by Railway crossing permission pending \(6 days\)\./);
  assert.match(text, /Raw water main laying is behind plan\./);
  assert.match(text, /Next week: Raw water main laying\.$/);
  assert.ok(narrativeFits(text));
  assert.deepEqual(unverifiedFigures(text, [...collectNumbers(f), ...derivedNumbers(f)]), [], 'the rules\' own figures are all in the facts');
  assert.match(narrativeDraft(narrativeFacts(report({ activities: [] }))), /No progress was recorded this week\./);
});

test('a narrative with money, two paragraphs or too many words is not used', () => {
  assert.equal(narrativeFits('Work worth ₹12.4 L was done this week on the distribution network and the tank.'), false);
  assert.equal(narrativeFits('Good progress on the distribution network this week.\n\nNext week the tank.'), false);
  assert.equal(narrativeFits('Progress. '.repeat(200)), false);
  assert.equal(narrativeFits('Progress moved from 31.8% to 41.8% this week, mostly on the distribution network.'), true);
});

test('weeks run Monday to Sunday', () => {
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(mondayOf('2026-10-19'), '2026-10-19');
  assert.equal(addDays('2026-10-12', 6), '2026-10-18');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`Brief rules: ${tests.length - failed} of ${tests.length} tests pass`);

async function demo(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { BriefsService } = await import('../briefs/briefs.service');
  const { NotificationJobsService } = await import('../notifications/notification-jobs.service');
  const { ReportsService } = await import('../reports/reports.service');
  const { AiService } = await import('../ai/ai.service');
  const { todayIn } = await import('../notifications/time');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const briefs = app.get(BriefsService);
  const jobs = app.get(NotificationJobsService);
  const reports = app.get(ReportsService);
  const ai = app.get(AiService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
  const as = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`No ${email} in the demo company`);
    return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
  };
  const emails = ['md@demo.com', 'pm@demo.com', 'engineer@demo.com', 'accounts@demo.com'];
  const before = new Map(users.map((u) => [u.id, u.morningBrief]));
  // A day of its own, so the run neither meets nor leaves briefs for today.
  const day = addDays(todayIn(), 400);
  const cleanup = () => prisma.aiBrief.deleteMany({ where: { organizationId: org.id, date: { gte: new Date(`${day}T00:00:00Z`) } } });
  await cleanup();
  try {
    await prisma.user.updateMany({ where: { organizationId: org.id }, data: { morningBrief: false } });
    await prisma.user.updateMany({ where: { id: { in: ['md@demo.com', 'engineer@demo.com', 'accounts@demo.com'].map((e) => as(e).id) } }, data: { morningBrief: true } });

    const run = await briefs.writeMornings(day);
    const rows = await prisma.aiBrief.findMany({ where: { organizationId: org.id, kind: 'MORNING', date: new Date(`${day}T00:00:00Z`) } });
    const of = (email: string) => rows.find((r) => r.userId === as(email).id);
    console.log(`\nMorning briefs for ${day}: ${JSON.stringify(run)}`);
    for (const e of emails) {
      const r = of(e);
      console.log(`  ${e}: ${r ? (r.lines as { text: string }[]).map((l) => l.text).join(' | ') : '(none)'}`);
    }
    check('those who asked get a brief', !!of('md@demo.com') && !!of('engineer@demo.com') && !!of('accounts@demo.com'));
    check('those who did not ask get none', !of('pm@demo.com'));
    check('the test model writes each brief', rows.every((r) => r.byAssistant));
    check("a site engineer's brief leaves out vendor and client money", !/\/payables|\/receivables/.test(JSON.stringify(of('engineer@demo.com')?.lines ?? '')));
    for (const e of ['md@demo.com', 'engineer@demo.com', 'accounts@demo.com']) {
      const mf = await briefs.morningFacts(as(e), day);
      // What the model is given: the facts and the rules' own lines.
      const f = { facts: mf, candidates: morningCandidates(mf).map((c) => c.text) };
      const text = ((of(e)?.lines ?? []) as { text: string }[]).map((l) => l.text).join(' ');
      const bad = unverifiedFigures(text, [...collectNumbers(f), ...derivedNumbers(f)]);
      check(`every figure in ${e}'s brief is in their records`, bad.length === 0, bad.join(', '));
    }
    const again = await briefs.writeMornings(day);
    check('a re-run writes nothing twice', again.written === 0, JSON.stringify(again));

    // Ask Nirmaan off for the company: nothing is written, whoever asked.
    await prisma.organization.update({ where: { id: org.id }, data: { aiEnabled: false } });
    try {
      check('a company with Ask Nirmaan off gets no brief', (await briefs.writeMorning(as('md@demo.com'), addDays(day, 1))) === null);
      check('nor is it offered', !(await briefs.today(as('md@demo.com'))).available);
    } finally {
      await prisma.organization.update({ where: { id: org.id }, data: { aiEnabled: true } });
    }

    // Sending: a brief turned off after it was written is not sent.
    await prisma.user.update({ where: { id: as('accounts@demo.com').id }, data: { morningBrief: false } });
    const sent = await jobs.morningBrief(day);
    const notes = await prisma.notification.findMany({ where: { organizationId: org.id, dedupeKey: `MORNING_BRIEF:${day}` } });
    console.log(`Sent: ${JSON.stringify(sent)}`);
    check('the briefs go to those who still want them', notes.some((n) => n.userId === as('md@demo.com').id) && notes.some((n) => n.userId === as('engineer@demo.com').id));
    check('a brief turned off is not sent', !notes.some((n) => n.userId === as('accounts@demo.com').id));
    check('sending twice sends nothing twice', (await jobs.morningBrief(day)).created === 0);
    await prisma.notification.deleteMany({ where: { organizationId: org.id, dedupeKey: `MORNING_BRIEF:${day}` } });

    // The weekly narrative: last week's, on the report of that week.
    const lastMonday = addDays(mondayOf(todayIn()), -7);
    const admin = as('admin@demo.com');
    const projects = await prisma.project.findMany({ where: { organizationId: org.id, status: 'ACTIVE' }, select: { id: true, name: true } });
    let narratives = 0;
    for (const p of projects) {
      await prisma.aiBrief.deleteMany({ where: { organizationId: org.id, key: `WEEK:${p.id}:${lastMonday}` } });
      const row = await briefs.writeNarrative(admin, p.id, lastMonday);
      if (!row) continue;
      narratives++;
      const r = await reports.progress(admin, { projectId: p.id, from: lastMonday, to: addDays(lastMonday, 6) });
      const f = narrativeFacts(r);
      console.log(`\n${p.name}, week of ${lastMonday}:\n  ${r.narrative?.text}`);
      check(`${p.name}: the weekly report carries the narrative`, !!r.narrative?.text);
      const bad = unverifiedFigures(r.narrative?.text ?? '', [...collectNumbers(f), ...derivedNumbers(f)]);
      check(`${p.name}: every figure in the narrative is in the report`, bad.length === 0, bad.join(', '));
      const month = await reports.progress(admin, { projectId: p.id, from: lastMonday, to: addDays(lastMonday, 13) });
      check(`${p.name}: a report that is not that week has none`, month.narrative === null);
    }
    check('narratives are written for the active projects', narratives === projects.length, `${narratives} of ${projects.length}`);
    for (const p of projects) await prisma.aiBrief.deleteMany({ where: { organizationId: org.id, key: `WEEK:${p.id}:${lastMonday}` } });

    // The cost shows in Admin > Ask Nirmaan.
    const settings = await ai.settings(admin);
    const line = settings.byFeature.find((f) => f.feature === 'BRIEFS');
    check('briefs are counted in the month', (line?.count ?? 0) >= 3, JSON.stringify(line));
    check('the month adds up', Math.abs(settings.byFeature.reduce((s, f) => s + f.spentInr, 0) - settings.spentThisMonthInr) < 0.02);
  } finally {
    await cleanup();
    for (const [id, on] of before) await prisma.user.update({ where: { id }, data: { morningBrief: on } });
  }
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
