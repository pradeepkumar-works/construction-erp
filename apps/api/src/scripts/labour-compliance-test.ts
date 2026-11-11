/**
 * Contract labour compliance (ARCHITECTURE "Contract labour compliance"): which papers and challans a contractor owes for
 * the men their head counts show, as of a day, and the checks on what is recorded. No database.
 *
 *   node dist/scripts/labour-compliance-test.js
 */
import assert from 'node:assert/strict';
import { LABOUR_LAW_FROM, challanDue, labourChallanProblem, labourHoldWords, labourPaperProblem, labourProblems, type LabourFacts, type LabourPaperFact } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const SITE = 'site-a';
const papers: LabourPaperFact[] = [
  { kind: 'CLRA_LICENCE', projectId: SITE, number: 'ALC/CLRA/0412', validFrom: '2026-04-01', validTo: '2027-03-31', workers: 60 },
  { kind: 'PF_CODE', projectId: null, number: 'ODBBS0012345000', validFrom: null, validTo: null, workers: null },
  { kind: 'ESI_CODE', projectId: null, number: '44000123450001001', validFrom: null, validTo: null, workers: null },
  { kind: 'BOCW_REGISTRATION', projectId: null, number: 'OBOCW/2025/118', validFrom: '2025-06-01', validTo: '2028-05-31', workers: null },
];
const allChallans = (months: string[]) => months.flatMap((m) => [{ kind: 'PF' as const, month: m }, { kind: 'ESI' as const, month: m }]);
const base: LabourFacts = {
  projectId: SITE,
  asOf: '2026-11-20',
  sitePeak: 42,
  months: [
    { month: '2026-08', peak: 30 },
    { month: '2026-09', peak: 42 },
    { month: '2026-10', peak: 38 },
    { month: '2026-11', peak: 35 },
  ],
  papers,
  challans: allChallans(['2026-08', '2026-09', '2026-10']),
};

test('a contractor with every paper and every due challan owes nothing', () => {
  assert.deepEqual(labourProblems(base), []);
});

test('no men on the head counts, nothing is asked', () => {
  assert.deepEqual(labourProblems({ ...base, sitePeak: 0, months: [], papers: [], challans: [] }), []);
});

test('a month’s challan is due on the 15th of the next month, and not before', () => {
  assert.equal(challanDue('2026-10'), '2026-11-15');
  assert.equal(challanDue('2026-12'), '2027-01-15');
  const before = labourProblems({ ...base, asOf: '2026-11-14', challans: allChallans(['2026-08', '2026-09']) });
  assert.deepEqual(before, [], 'October is not due until 15 November');
  const after = labourProblems({ ...base, challans: allChallans(['2026-08', '2026-09']) });
  assert.deepEqual(after.map((p) => p.text), ['PF challan not shown for Oct 2026', 'ESI challan not shown for Oct 2026']);
});

test('missing months are listed together, oldest first, and the key moves when they change', () => {
  const p = labourProblems({ ...base, challans: [{ kind: 'ESI', month: '2026-08' }, { kind: 'ESI', month: '2026-09' }, { kind: 'ESI', month: '2026-10' }, { kind: 'PF', month: '2026-09' }] });
  assert.equal(p.length, 1);
  assert.equal(p[0].text, 'PF challan not shown for Aug 2026 and Oct 2026');
  assert.equal(p[0].key, 'PF:months:2026-08,2026-10');
});

test('the labour licence is for the site, must be valid on the day and allow as many men as were there', () => {
  const otherSite = papers.map((p) => (p.kind === 'CLRA_LICENCE' ? { ...p, projectId: 'site-b' } : p));
  assert.deepEqual(labourProblems({ ...base, papers: otherSite }).map((p) => p.text), ['No labour licence (CLRA) for this site; they had 42 men']);
  const small = papers.map((p) => (p.kind === 'CLRA_LICENCE' ? { ...p, workers: 40 } : p));
  assert.deepEqual(labourProblems({ ...base, papers: small }).map((p) => p.text), ['Labour licence (CLRA) covers 40 workers for this site; they had 42']);
  const expired = papers.map((p) => (p.kind === 'CLRA_LICENCE' ? { ...p, validTo: '2026-10-31' } : p));
  assert.deepEqual(labourProblems({ ...base, papers: expired }).map((p) => p.text), ['Labour licence (CLRA) ALC/CLRA/0412 for this site ran out on 31 Oct 2026']);
});

test('each law from its own head count: under 20 no licence or PF, under 10 workmen’s compensation instead of ESI and no BOCW', () => {
  const twelve: LabourFacts = { ...base, sitePeak: 12, months: [{ month: '2026-10', peak: 12 }], papers: [], challans: [] };
  assert.deepEqual(labourProblems(twelve).map((p) => p.kind), ['ESI_CODE', 'BOCW_REGISTRATION', 'ESI']);
  const six: LabourFacts = { ...twelve, sitePeak: 6, months: [{ month: '2026-10', peak: 6 }] };
  assert.deepEqual(labourProblems(six).map((p) => p.text), ['No workmen’s compensation policy; they had 6 men']);
  const covered = labourProblems({ ...six, papers: [{ kind: 'WC_POLICY', projectId: null, number: 'WC/77', validFrom: '2026-01-01', validTo: '2026-12-31', workers: 10 }] });
  assert.deepEqual(covered, []);
  assert.equal(LABOUR_LAW_FROM.CLRA, 20);
});

test('PF and ESI follow the most men on our sites together, though the bill’s site had fewer', () => {
  const p = labourProblems({ ...base, sitePeak: 8, months: [{ month: '2026-10', peak: 25 }], papers: papers.filter((x) => x.kind !== 'PF_CODE'), challans: allChallans(['2026-10']) });
  assert.deepEqual(p.map((x) => x.text), ['No PF code; they had 25 men']);
});

test('papers and challans are checked as entered', () => {
  const ok = { kind: 'CLRA_LICENCE' as const, projectId: SITE, number: 'X/1', validFrom: '2026-04-01', validTo: '2027-03-31', workers: 50 };
  assert.equal(labourPaperProblem(ok), null);
  assert.equal(labourPaperProblem({ ...ok, projectId: null }), 'Choose the site the licence is for');
  assert.equal(labourPaperProblem({ ...ok, validTo: null }), 'Enter the date it is valid to');
  assert.equal(labourPaperProblem({ ...ok, workers: null }), 'Enter how many workers it covers');
  assert.equal(labourPaperProblem({ ...ok, validTo: '2026-03-01' }), 'Valid to is before valid from');
  assert.equal(labourPaperProblem({ kind: 'PF_CODE', projectId: SITE, number: 'P', validFrom: null, validTo: null, workers: null }), 'A PF code holds for every site; leave the site empty');
  const c = { month: '2026-10', paidOn: '2026-11-12', amount: 18500, reference: 'TRRN 1052610012345' };
  assert.equal(labourChallanProblem(c, '2026-11-20'), null);
  assert.equal(labourChallanProblem({ ...c, month: '2026-12' }, '2026-11-20'), 'The wage month cannot be after this month');
  assert.equal(labourChallanProblem({ ...c, amount: 0 }, '2026-11-20'), 'Enter the amount paid');
  assert.equal(labourChallanProblem({ ...c, paidOn: '2026-11-25' }, '2026-11-20'), 'The paid date cannot be after today');
});

test('a held payment reads as its first problem and how many more', () => {
  const p = labourProblems({ ...base, papers: [], challans: [] });
  assert.ok(p.length > 2);
  assert.equal(labourHoldWords(p), `${p[0].text}, and ${p.length - 1} more`);
  assert.equal(labourHoldWords([]), '');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${tests.length - failed} of ${tests.length} passed`);
if (failed) process.exit(1);
