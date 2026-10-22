/**
 * Schedule links' tests (v6 item 114): loops refused, the critical path's forward and backward passes for each kind of
 * link and lag, the moves the links make, readiness for the look-ahead, and MS Project XML and P6 XER both ways, with no
 * database. CI runs it after the build:
 *
 *   node dist/scripts/schedule-links-test.js
 */
import assert from 'node:assert/strict';
import { criticalPath, findCycle, linkProblem, lookaheadWeeks, moves, readiness, type NetActivity, type NetLink } from '../planning/schedule-rules';
import { parseMsProjectXml, parseXer, toMsProjectXml, toXer } from '../planning/schedule-files';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

// A small road job: clearing 1-5 Jan, earthwork 6-20, GSB 15-25 (after earthwork starts + 5), culvert 3-12 on its own,
// WMM 26-31 after GSB.
const acts: NetActivity[] = [
  { id: 'clear', start: '2026-01-01', end: '2026-01-05' },
  { id: 'earth', start: '2026-01-06', end: '2026-01-20' },
  { id: 'gsb', start: '2026-01-15', end: '2026-01-25' },
  { id: 'culvert', start: '2026-01-03', end: '2026-01-12' },
  { id: 'wmm', start: '2026-01-26', end: '2026-01-31' },
];
const links: NetLink[] = [
  { pred: 'clear', succ: 'earth', type: 'FS', lag: 0 },
  { pred: 'earth', succ: 'gsb', type: 'SS', lag: 5 },
  { pred: 'gsb', succ: 'wmm', type: 'FS', lag: 0 },
];

test('a loop is found and a link that would make one is refused, as are self links and repeats', () => {
  assert.equal(findCycle(['a', 'b', 'c'], [{ pred: 'a', succ: 'b', type: 'FS', lag: 0 }, { pred: 'b', succ: 'c', type: 'FS', lag: 0 }]), null);
  assert.deepEqual(findCycle(['a', 'b', 'c'], [{ pred: 'a', succ: 'b', type: 'FS', lag: 0 }, { pred: 'b', succ: 'c', type: 'FS', lag: 0 }, { pred: 'c', succ: 'a', type: 'SS', lag: 0 }]), ['a', 'b', 'c']);
  const ids = acts.map((a) => a.id);
  assert.match(linkProblem(ids, links, { pred: 'wmm', succ: 'clear', type: 'FS', lag: 0 })!, /loop: clear → earth → gsb → wmm → clear/);
  assert.match(linkProblem(ids, links, { pred: 'gsb', succ: 'gsb', type: 'FS', lag: 0 })!, /itself/);
  assert.match(linkProblem(ids, links, { pred: 'earth', succ: 'gsb', type: 'FS', lag: 0 })!, /already follows/);
  assert.equal(linkProblem(ids, links, { pred: 'culvert', succ: 'wmm', type: 'FS', lag: 2 }), null);
});

test('the forward and backward passes give float, and the critical path runs through the zero-float chain', () => {
  const r = criticalPath(acts, links)!;
  assert.equal(r.finish, '2026-01-31');
  const f = (id: string) => r.results.get(id)!;
  // GSB is planned from 15 Jan though its start-to-start link allows 11 Jan, so it and WMM after it have no float, while
  // clearing and earthwork, which only have to let GSB start, can slip 4 days.
  assert.deepEqual([f('clear').float, f('earth').float, f('gsb').float, f('wmm').float], [4, 4, 0, 0]);
  assert.equal(f('gsb').es, '2026-01-15');
  assert.equal(f('earth').lf, '2026-01-24');
  assert.equal(f('culvert').float, 19);
  assert.equal(f('culvert').critical, false);
  assert.equal(f('wmm').critical, true);
});

test('each kind of link with a lag pushes the successor as it should', () => {
  const two: NetActivity[] = [
    { id: 'p', start: '2026-03-01', end: '2026-03-10' },
    { id: 's', start: '2026-03-01', end: '2026-03-04' },
  ];
  const es = (type: NetLink['type'], lag: number) => criticalPath(two, [{ pred: 'p', succ: 's', type, lag }])!.results.get('s')!.es;
  assert.equal(es('FS', 0), '2026-03-11');
  assert.equal(es('FS', 2), '2026-03-13');
  assert.equal(es('FS', -3), '2026-03-08');
  assert.equal(es('SS', 3), '2026-03-04');
  // Finish to finish: s (4 days) ends no earlier than 10 Mar, so starts 7 Mar.
  assert.equal(es('FF', 0), '2026-03-07');
  // Start to finish: s ends no earlier than p starts + 5 (6 Mar), so starts 3 Mar.
  assert.equal(es('SF', 5), '2026-03-03');
  assert.equal(criticalPath(two, [{ pred: 'p', succ: 's', type: 'FS', lag: 0 }, { pred: 's', succ: 'p', type: 'FS', lag: 0 }]), null);
});

test('the links move an activity planned too early, keep its length, and leave done work where it ran', () => {
  const early: NetActivity[] = [...acts.slice(0, 2), { id: 'gsb', start: '2026-01-08', end: '2026-01-18' }, acts[3], { id: 'wmm', start: '2026-01-15', end: '2026-01-20' }];
  const r = criticalPath(early, links)!;
  assert.deepEqual(moves(early, r.results), [
    { id: 'gsb', start: '2026-01-11', end: '2026-01-21' },
    { id: 'wmm', start: '2026-01-22', end: '2026-01-27' },
  ]);
  const done = early.map((a) => (a.id === 'gsb' ? { ...a, done: true } : a));
  const d = criticalPath(done, links)!;
  assert.equal(d.results.get('gsb')!.es, '2026-01-08');
  assert.equal(d.results.get('gsb')!.critical, false);
  assert.equal(d.results.get('wmm')!.es, '2026-01-19');
  // Started late: it runs its length from the day it began, its successors follow, and it is not itself moved.
  const late = early.map((a) => (a.id === 'gsb' ? { ...a, startedOn: '2026-01-14' } : a));
  const l = criticalPath(late, links)!;
  assert.deepEqual([l.results.get('gsb')!.es, l.results.get('gsb')!.ef, l.results.get('wmm')!.es], ['2026-01-14', '2026-01-24', '2026-01-25']);
  assert.deepEqual(moves(late, l.results).map((m) => m.id), ['wmm']);
  // A successor that started before its link allowed does not leave its predecessor with negative float.
  const ahead = acts.map((a) => (a.id === 'gsb' ? { ...a, startedOn: '2026-01-09' } : a));
  const h = criticalPath(ahead, links)!;
  assert.ok(h.results.get('earth')!.float >= 0);
  assert.ok(h.results.get('clear')!.float >= 0);
});

test('an activity is ready when its finish links are done and start links started, else it waits on them', () => {
  assert.deepEqual(readiness({ progressPct: 20 }, [{ name: 'Earthwork', type: 'FS', progressPct: 10 }]), { readiness: 'IN_PROGRESS', waitingOn: [] });
  assert.deepEqual(readiness({ progressPct: 0 }, [{ name: 'Earthwork', type: 'SS', progressPct: 10 }]), { readiness: 'READY', waitingOn: [] });
  assert.deepEqual(readiness({ progressPct: 0 }, [{ name: 'Earthwork', type: 'FS', progressPct: 90 }, { name: 'Culvert', type: 'SS', progressPct: 0 }]), { readiness: 'WAITING', waitingOn: ['Earthwork', 'Culvert'] });
  // Its predecessors are where the links need them, but the lag holds it till 1 Nov.
  assert.deepEqual(readiness({ progressPct: 0, earliest: '2026-11-01' }, [{ name: 'Slab GF', type: 'SS', progressPct: 70 }], '2026-10-22'), { readiness: 'WAITING', waitingOn: ['Slab GF'] });
  assert.deepEqual(readiness({ progressPct: 0, earliest: '2026-10-20' }, [{ name: 'Slab GF', type: 'SS', progressPct: 70 }], '2026-10-22'), { readiness: 'READY', waitingOn: [] });
  assert.deepEqual(lookaheadWeeks('2026-10-22'), [
    { from: '2026-10-19', to: '2026-10-25' },
    { from: '2026-10-26', to: '2026-11-01' },
    { from: '2026-11-02', to: '2026-11-08' },
  ]);
});

test('MS Project XML and P6 XER go out and come back with the same activities and links', () => {
  const file = acts.map((a) => ({ key: a.id, name: `${a.id} & co <1>`, start: a.start!, end: a.end! }));
  const fl = links.map((l) => ({ predKey: l.pred, succKey: l.succ, type: l.type, lagDays: l.lag }));
  const xml = toMsProjectXml({ code: 'RD-2026-01', name: 'Road', start: '2026-01-01' }, file, fl);
  const back = parseMsProjectXml(xml);
  assert.deepEqual(back.activities.map((a) => [a.name, a.start, a.end]), file.map((a) => [a.name, a.start, a.end]));
  assert.deepEqual(back.links.map((l) => [l.type, l.lagDays]), [['FS', 0], ['SS', 5], ['FS', 0]]);
  const xer = toXer({ code: 'RD-2026-01', name: 'Road' }, file, fl, '2026-10-22');
  const x = parseXer(xer);
  assert.deepEqual(x.activities.map((a) => [a.name, a.start, a.end]), file.map((a) => [a.name, a.start, a.end]));
  assert.deepEqual(x.links.map((l) => [l.type, l.lagDays]), [['FS', 0], ['SS', 5], ['FS', 0]]);
  assert.throws(() => parseXer('<Project/>'), /not a Primavera XER/);
  assert.throws(() => parseMsProjectXml('ERMHDR'), /not an MS Project XML/);
});

test('summary rows and milestones are left out of an import, with the links to them', () => {
  const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Tasks>
    <Task><UID>0</UID><Name>Project</Name><Summary>1</Summary></Task>
    <Task><UID>1</UID><Name>Phase 1</Name><Summary>1</Summary><Start>2026-01-01T08:00:00</Start><Finish>2026-01-31T17:00:00</Finish></Task>
    <Task><UID>2</UID><Name>Piling</Name><Summary>0</Summary><Milestone>0</Milestone><Start>2026-01-02T08:00:00</Start><Finish>2026-01-09T17:00:00</Finish></Task>
    <Task><UID>3</UID><Name>Pile caps</Name><Start>2026-01-12T08:00:00</Start><Finish>2026-01-20T17:00:00</Finish>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>9600</LinkLag></PredecessorLink>
      <PredecessorLink><PredecessorUID>4</PredecessorUID><Type>1</Type></PredecessorLink></Task>
    <Task><UID>4</UID><Name>Drawings issued</Name><Milestone>1</Milestone><Start>2026-01-01T08:00:00</Start><Finish>2026-01-01T08:00:00</Finish></Task>
  </Tasks></Project>`;
  const f = parseMsProjectXml(xml);
  assert.deepEqual(f.activities.map((a) => a.name), ['Piling', 'Pile caps']);
  assert.deepEqual(f.links, [{ predKey: '2', succKey: '3', type: 'FS', lagDays: 2 }]);
  assert.deepEqual(f.skipped, ['Summary row “Phase 1”', 'Milestone “Drawings issued” (add it under Milestones)', '1 link to rows not read']);
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
