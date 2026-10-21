/**
 * PPE register's tests: replace-by dates and what a worker lacks, with no database. CI runs it after the build:
 *
 *   node dist/scripts/ppe-test.js
 */
import assert from 'node:assert/strict';
import { DEFAULT_PPE_REQUIRED, PPE_KINDS, PPE_LIFE_DAYS, ppeGaps, ppeReplaceBy } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const T = '2026-10-19';

test('replace-by: issue date plus the kind\'s life, across a year end and a leap day', () => {
  assert.equal(ppeReplaceBy('GLOVES', '2026-10-19'), '2026-11-18');
  assert.equal(ppeReplaceBy('SAFETY_SHOES', '2026-12-31'), '2027-12-31');
  assert.equal(ppeReplaceBy('DUST_MASK', '2028-02-27'), '2028-03-05');
  assert.equal(ppeReplaceBy('HELMET', '2028-02-29'), '2030-02-28');
});

test('every kind has a life of at least a week', () => {
  for (const k of PPE_KINDS) assert.ok(PPE_LIFE_DAYS[k] >= 7, k);
});

test('a worker with nothing lacks all of the required kit', () => {
  const g = ppeGaps(DEFAULT_PPE_REQUIRED, [], T);
  assert.deepEqual(g.missing, ['HELMET', 'SAFETY_SHOES', 'REFLECTIVE_JACKET']);
  assert.equal(g.holding.length, 0);
});

test('extra kit counts as held but never as missing', () => {
  const g = ppeGaps(['HELMET'], [{ id: 'a', kind: 'HELMET', issuedOn: '2026-10-01', replaceBy: '2028-09-30' }, { id: 'b', kind: 'GLOVES', issuedOn: '2026-10-01', replaceBy: '2026-10-31' }], T);
  assert.deepEqual(g.missing, []);
  assert.deepEqual(g.holding.map((h) => h.kind).sort(), ['GLOVES', 'HELMET']);
});

test('past its replace-by date an item is due but not missing', () => {
  const g = ppeGaps(['GLOVES'], [{ id: 'a', kind: 'GLOVES', issuedOn: '2026-09-01', replaceBy: '2026-10-01' }], T);
  assert.deepEqual(g.missing, []);
  assert.deepEqual(g.due, ['GLOVES']);
});

test('on its replace-by date an item is not yet due', () => {
  const g = ppeGaps(['GLOVES'], [{ id: 'a', kind: 'GLOVES', issuedOn: '2026-09-19', replaceBy: T }], T);
  assert.deepEqual(g.due, []);
});

test('two open issues of one kind: the newest counts', () => {
  const g = ppeGaps(['HELMET'], [{ id: 'old', kind: 'HELMET', issuedOn: '2024-01-01', replaceBy: '2025-12-31' }, { id: 'new', kind: 'HELMET', issuedOn: '2026-10-01', replaceBy: '2028-09-30' }], T);
  assert.equal(g.holding.length, 1);
  assert.equal(g.holding[0].issueId, 'new');
  assert.deepEqual(g.due, []);
});

test('a project that requires nothing has nobody missing anything', () => {
  assert.deepEqual(ppeGaps([], [], T).missing, []);
});

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
console.log(`\nPPE: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
