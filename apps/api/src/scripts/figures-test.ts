/**
 * Tests for the headline figures (ARCHITECTURE "Headline figures"): one name per figure in the registry, and the one
 * presenter that words, colours, orders and lays out every strip on the web, in print and in Excel. All pure:
 *
 *   node dist/scripts/figures-test.js
 */
import assert from 'node:assert/strict';
import {
  FIGURE_LABELS,
  MAX_FIGURES,
  figure,
  formatCount,
  formatINR,
  formatINRCompact,
  formatPct,
  presentFigures,
  unbilledAttention,
  type FigureInput,
  type FiguresView,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const today = '2026-11-15';
const nb = ' ';
const present = (fs: FigureInput[], scope?: { projectId?: string }) => presentFigures(fs, { today, scope });
const cells = (v: FiguresView) => (v.lead ? [v.lead, ...v.rest] : [...v.rest]);
const only = (f: FigureInput) => cells(present([f]))[0];

test('no two figures share a name', () => {
  const labels = Object.values(FIGURE_LABELS);
  const twice = labels.filter((l, i) => labels.indexOf(l) !== i);
  assert.deepEqual(twice, []);
});

test('the formatters moved to the shared package read as before', () => {
  assert.equal(formatINR(186500000), `₹${nb}18,65,00,000`);
  assert.equal(formatINR('1234.5', true), `₹${nb}1,234.50`);
  assert.equal(formatINRCompact(12500000), `₹${nb}1.25${nb}Cr`);
  assert.equal(formatINRCompact(1250000), `₹${nb}12.50${nb}L`);
  assert.equal(formatINRCompact(85000), `₹${nb}85,000`);
  assert.equal(formatPct(2.04), '2%');
  assert.equal(formatPct(-0.04), '0%');
  assert.equal(formatPct(31.5), '32%');
  assert.equal(formatCount(123456), '1,23,456');
});

test("a strip's values share one unit, chosen from the largest, while a note keeps its own", () => {
  const v = present([figure('contractValue', '94200000'), figure('orderBook', '9900000'), figure('weOwe', 14200000, { versus: { part: figure('weOweDueSoon', 320000) } })]);
  assert.equal(v.unit, 'crore');
  assert.deepEqual(
    v.rest.map((c) => c.value.text),
    [`₹${nb}9.42${nb}Cr`, `₹${nb}0.99${nb}Cr`, `₹${nb}1.42${nb}Cr`],
  );
  assert.equal(v.rest[2].note?.text, `₹${nb}3.20${nb}L due in 7 days`);
});

test('an amount too small for the strip unit reads in its own', () => {
  const v = present([figure('contractValue', 94200000), figure('orderBook', 40000)]);
  assert.equal(v.rest[1].value.text, `₹${nb}40,000`);
});

test('the lead is the figure that needs action, wherever the caller put it', () => {
  const v = present([
    figure('contractValue', 1711000000),
    figure('orderBook', 900000000),
    figure('workNotBilled', 129900000, { attention: { level: 'act', because: 'Work on 2 projects not billed for 90 days or more' } }),
  ]);
  assert.equal(v.lead?.id, 'workNotBilled');
  assert.equal(v.lead?.state, 'act');
  assert.equal(v.lead?.note?.text, 'Work on 2 projects not billed for 90 days or more');
  assert.deepEqual(
    v.rest.map((c) => c.id),
    ['contractValue', 'orderBook'],
  );
});

test('act leads over watch, and money over a count', () => {
  const v = present([figure('delayedActivities', 30), figure('weOwe', 20, { versus: { part: figure('weOweOverdue', 10) } }), figure('billsNotSent', 900000)]);
  assert.equal(v.lead?.id, 'weOwe');
  const w = present([figure('approvalsWaiting', 30, { versus: { part: figure('approvalsOld', 4) } }), figure('billsNotSent', 20)]);
  assert.equal(w.lead?.id, 'billsNotSent');
});

test('on a calm day there is no lead, and the figures keep their order', () => {
  const v = present([figure('contractValue', 1711000000), figure('orderBook', 900000000), figure('marginToDate', 50000000)]);
  assert.equal(v.lead, null);
  assert.deepEqual(
    v.rest.map((c) => [c.id, c.state]),
    [
      ['contractValue', 'calm'],
      ['orderBook', 'calm'],
      ['marginToDate', 'calm'],
    ],
  );
});

test("a part's flag lifts the figure it belongs to, and a part at zero says it is clear", () => {
  const owed = only(figure('clientsOwe', 141600000, { when: 'today', versus: { part: figure('clientsOweOver90', 21000000) } }));
  assert.equal(owed.state, 'act');
  assert.equal(owed.noteState, 'act');
  assert.equal(owed.note?.text, `₹${nb}2.10${nb}Cr over 90 days`);
  const calm = only(figure('clientsOwe', 141600000, { versus: { part: figure('clientsOweOver90', 0) } }));
  assert.equal(calm.state, 'calm');
  assert.equal(calm.note?.text, 'Nothing over 90 days');
  assert.equal(only(figure('clientsOwe', 141600000, { count: 3, versus: { part: figure('clientsOweOver90', 0) } })).note?.text, '3 open bills · nothing over 90 days');
});

test('flag figures at zero fold into one quiet line', () => {
  const v = present([figure('weOwe', 14200000), figure('weOweOverdue', 0), figure('msmeAtRisk', '0.00')]);
  assert.deepEqual(
    v.rest.map((c) => c.id),
    ['weOwe'],
  );
  assert.equal(v.clear?.text, 'Nothing overdue, no MSME bill at risk');
  const none = present([figure('weOweOverdue', 0)]);
  assert.equal(none.lead, null);
  assert.equal(none.rest.length, 0);
  assert.equal(none.clear?.text, 'Nothing overdue');
});

test('a zero is quiet and says what it stands against', () => {
  const billed = only(figure('billed', 0, { when: { month: '2026-11' }, versus: { was: 40700000, when: { month: '2026-10' } } }));
  assert.equal(billed.state, 'quiet');
  assert.equal(billed.value.text, `₹${nb}0`);
  assert.equal(billed.note?.text, `₹${nb}4.07${nb}Cr in Oct`);
});

test('no value shows a dash with its reason, and nothing to put in a cell', () => {
  const v = only(figure('deliveredOnTime', { none: 'No delivery date to judge by' }));
  assert.equal(v.value.text, '–');
  assert.equal(v.machine, null);
  assert.equal(v.note?.text, 'No delivery date to judge by');
  assert.equal(v.state, 'quiet');
});

test('screen readers hear the words in full', () => {
  const v = only(figure('workDone', 52000000, { when: { month: '2026-10' }, versus: { was: 40000000, when: { month: '2026-09' } } }));
  assert.equal(v.label.text, 'Work done in Oct');
  assert.equal(v.label.spoken, 'Work done in October');
  assert.equal(v.value.spoken, `₹${nb}5.20 crore`);
  assert.equal(v.note?.text, `up ₹${nb}1.20${nb}Cr on Sep`);
  assert.equal(v.note?.spoken, `up ₹${nb}1.20 crore on September`);
  const short = only(figure('bankAndCash', -500000));
  assert.equal(short.value.text, `−₹${nb}5.00${nb}L`);
  assert.equal(short.value.spoken, `minus ₹${nb}5.00 lakh`);
  const owed = only(figure('clientsOwe', 141600000, { when: 'today' }));
  assert.equal(owed.label.spoken, 'Clients owe today');
  const pct = only(figure('physicalProgress', 31, { versus: { plan: 45 } }));
  assert.equal(pct.value.spoken, '31 percent');
});

test('a fault in the records marks the figure in words and leaves its own state alone', () => {
  const marked = only(figure('workDone', 38700000, { when: 'toDate', versus: { of: figure('boqValue', 94200000) }, caveat: 'BOQ 47% below the contract value' }));
  assert.equal(marked.caveat?.text, 'BOQ 47% below the contract value');
  assert.equal(marked.state, 'calm');
  assert.equal(marked.note?.text, `of ₹${nb}9.42${nb}Cr BOQ value`);
  assert.equal(only(figure('workDone', 38700000)).caveat, null);
});

test('a month of another year carries its year', () => {
  const v = only(figure('billed', 100, { when: { month: '2025-12' } }));
  assert.equal(v.label.text, 'Billed in Dec 2025');
});

test('a fall the wrong way is worth a look; a month under way is judged by its pace', () => {
  const cost = only(figure('cost', 1200000, { when: { month: '2026-10' }, versus: { trend: [100, 100, 100, 100, 1000000, 1200000], months: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'] } }));
  assert.equal(cost.note?.text, 'up 20% on Sep');
  assert.equal(cost.noteState, 'watch');
  assert.equal(cost.state, 'watch');
  const early = presentFigures([figure('workDone', 100000, { when: { month: '2026-11' }, versus: { trend: [0, 0, 0, 0, 1000000, 100000], months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'] } })], { today: '2026-11-03' });
  assert.equal(early.rest[0].note?.text, 'down 90% on Oct so far');
  assert.equal(early.rest[0].state, 'calm');
});

test('a change on last month reads up or down, and bad news only when it goes the wrong way', () => {
  const fell = only(figure('moneyReceived', 30000000, { when: { month: '2026-10' }, versus: { was: 40000000, when: { month: '2026-09' } } }));
  assert.equal(fell.note?.text, `down ₹${nb}1.00${nb}Cr on Sep`);
  assert.equal(fell.state, 'watch');
  const cheaper = only(figure('cost', 30000000, { when: { month: '2026-10' }, versus: { was: 40000000, when: { month: '2026-09', sameDays: true } } }));
  assert.equal(cheaper.note?.text, `down ₹${nb}1.00${nb}Cr on the same days of Sep`);
  assert.equal(cheaper.state, 'calm');
});

test('progress stands against the plan in points', () => {
  const near = only(figure('physicalProgress', 31, { versus: { plan: 40 } }));
  assert.equal(near.note?.text, '40% planned by now, 9 points behind');
  assert.equal(near.state, 'calm');
  const behind = only(figure('physicalProgress', 31, { versus: { plan: 45 } }));
  assert.equal(behind.note?.text, '45% planned by now, 14 points behind');
  assert.equal(behind.state, 'watch');
});

test('a whole names what it counts, and a count names its things', () => {
  assert.equal(only(figure('activeProjects', 12, { versus: { of: figure('projects', 14) } })).note?.text, 'of 14 projects');
  assert.equal(only(figure('orderBook', 900000000, { versus: { of: figure('contractValue', 1711000000) } })).note?.text, `of ₹${nb}171.10${nb}Cr contract value`);
  assert.equal(only(figure('weOwe', 1000000, { count: 4 })).note?.text, '4 open bills');
  assert.equal(only(figure('weOwe', 1000000, { count: 1, versus: { part: figure('weOweDueSoon', 320000) } })).note?.text, `1 open bill · ₹${nb}3.20${nb}L due in 7 days`);
});

test('a loss reads as a loss, with the amount above zero', () => {
  const v = only(figure('marginToDate', -26773));
  assert.equal(v.label.text, 'Loss to date');
  assert.equal(v.value.text, `₹${nb}26,773`);
  assert.equal(v.machine, '26773.00');
  assert.equal(v.state, 'act');
});

test("a figure opens its list, with the strip's filters", () => {
  assert.equal(cells(present([figure('clientsOwe', 1)], { projectId: 'p1' }))[0].href, '/receivables?projectId=p1');
  assert.equal(only(figure('clientsOwe', 1)).href, '/receivables');
  assert.equal(only(figure('oldestWait', 3)).href, '/approvals');
  assert.equal(cells(present([figure('drawingsLate', 2)], { projectId: 'p1' }))[0].href, '/drawing-schedule?state=LATE&projectId=p1');
});

test("a module screen's ratio is a count of its whole, and a counted part reads in its own words", () => {
  const behind = only(figure('projectsBehindPlan', 3, { versus: { of: 12 } }));
  assert.equal(behind.note?.text, 'of 12 projects');
  assert.equal(behind.state, 'watch');
  const letters = only(figure('lettersMarkedToYou', 3, { versus: { part: figure('lettersPastActionDate', 1) } }));
  assert.equal(letters.note?.text, '1 past the action date');
  assert.equal(letters.state, 'act');
  assert.equal(only(figure('cubicMetresSent', '42.5', { when: 'today', count: 6, versus: { part: figure('trucksInTransit', 2) } })).note?.text, '6 trucks · 2 in transit');
  assert.equal(only(figure('challansNotBilled', 3, { versus: { part: figure('cubicMetresNotBilled', '18.25') } })).note?.text, '18.25 m³ delivered');
  const reports = only(figure('dailyReports', 9, { when: 'today', versus: { of: figure('activeProjects', 12) }, attention: 'watch' }));
  assert.equal(`${reports.label.text}: ${reports.note?.text}`, 'Daily reports today: of 12 active projects');
  assert.equal(reports.state, 'watch');
  assert.deepEqual(present([figure('openNcrs', 0), figure('guaranteesExpiring', 0)]).clear?.text, 'No NCR open, nothing expiring in 30 days');
});

test('every row is full at every width, for one to six figures, with a lead or without', () => {
  const plain: FigureInput[] = [figure('contractValue', 9), figure('orderBook', 8), figure('workDone', 7), figure('billed', 6), figure('cost', 5), figure('moneyReceived', 4)];
  for (let n = 1; n <= MAX_FIGURES; n++)
    for (const lead of [false, true]) {
      const fs = lead ? [...plain.slice(0, n - 1), figure('weOweOverdue', 3)] : plain.slice(0, n);
      const v = present(fs);
      assert.equal(!!v.lead, lead, `${n} figures: lead`);
      const all = cells(v);
      assert.equal(all.length, n);
      for (const width of ['phone', 'medium', 'wide'] as const) {
        const columns = v.columns[width];
        let used = 0;
        for (const c of all) {
          const span = c.span[width];
          assert.ok(span >= 1 && span <= columns, `${n} figures at ${width}: a span of ${span} in ${columns} columns`);
          used += span;
          assert.ok(used <= columns, `${n} figures${lead ? ' with a lead' : ''} at ${width}: a cell runs past the row`);
          if (used === columns) used = 0;
        }
        assert.equal(used, 0, `${n} figures${lead ? ' with a lead' : ''} at ${width}: the last row is ragged`);
      }
      if (v.lead) assert.equal(v.lead.span.phone, 2, 'the lead takes a full row on a phone');
    }
});

test('more figures than a strip holds is a design error', () => {
  const seven = [figure('contractValue', 1), figure('orderBook', 1), figure('workDone', 1), figure('billed', 1), figure('cost', 1), figure('moneyReceived', 1), figure('clientsOwe', 1)];
  assert.throws(() => present(seven), /at most 6/);
  assert.doesNotThrow(() => present([...seven.slice(0, 6), false, null, undefined]));
});

test('work not billed for long needs action on the dashboard and in the MIS alike', () => {
  const r = (level: 'act' | 'watch', key: 'billing' | 'cost' = 'billing') => ({ key, level });
  assert.deepEqual(unbilledAttention([r('act'), r('watch'), r('act'), r('act', 'cost')]), { level: 'act', because: 'Work on 2 projects not billed for 90 days or more' });
  assert.deepEqual(unbilledAttention([r('watch')]), { level: 'watch', because: 'Work on 1 project not billed for 45 days or more' });
  assert.equal(unbilledAttention([r('act', 'cost')]), undefined);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`Headline figures: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
