/**
 * Tests for the views that fit the data (ARCHITECTURE "Views that fit the data"): a board's stages with their count and
 * rupees, and the grid of sites by days where a day with nothing filed is an empty cell. Pure, so it needs no database:
 *
 *   node dist/scripts/list-views-test.js
 */
import assert from 'node:assert/strict';
import { boardColumns, dayColumns, dayGrid } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const STAGES = [
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'WON', label: 'Won' },
];

test('a board has every stage, empty ones too, with the count and rupees of each', () => {
  const rows = [
    { id: 'a', status: 'PREPARING', value: '25000000.00' },
    { id: 'b', status: 'PREPARING', value: 1500000 },
    { id: 'c', status: 'WON', value: '9000000' },
  ];
  const cols = boardColumns(rows, STAGES, (r) => r.status, (r) => r.value);
  assert.deepEqual(cols.map((c) => [c.key, c.count, c.amount]), [
    ['PREPARING', 2, '26500000.00'],
    ['SUBMITTED', 0, '0.00'],
    ['WON', 1, '9000000.00'],
  ]);
  assert.deepEqual(cols[0].rows.map((r) => r.id), ['a', 'b'], 'rows keep the order they came in');
});

test('a row whose stage is not on the board is left off, and a board with no amounts says null', () => {
  const cols = boardColumns([{ status: 'CANCELLED' }, { status: 'SUBMITTED' }], STAGES, (r) => r.status);
  assert.deepEqual(cols.map((c) => c.count), [0, 1, 0]);
  assert.equal(cols[1].amount, null);
});

test('day columns end on the last day, oldest first, across a month end', () => {
  assert.deepEqual(dayColumns('2026-11-02', 4), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
});

test('every site gets a row and every day a cell; the site that missed the most days leads', () => {
  const days = dayColumns('2026-11-02', 3);
  const places = [
    { id: 'jajpur', name: 'Jajpur' },
    { id: 'coral', name: 'Coral Point' },
    { id: 'puri', name: 'Puri highway' },
  ];
  const reports = [
    { projectId: 'jajpur', date: '2026-10-31' },
    { projectId: 'jajpur', date: '2026-11-01' },
    { projectId: 'jajpur', date: '2026-11-02' },
    { projectId: 'puri', date: '2026-11-02T00:00:00.000Z' },
    { projectId: 'puri', date: '2026-10-01' },
    { projectId: 'elsewhere', date: '2026-11-02' },
  ];
  const grid = dayGrid(reports, { places, placeKey: (p) => p.id, days, placeOf: (r) => r.projectId, dayOf: (r) => r.date });
  assert.deepEqual(grid.map((r) => [r.place.id, r.missing]), [
    ['coral', 3],
    ['puri', 2],
    ['jajpur', 0],
  ]);
  assert.equal(grid[1].cells['2026-11-02'].length, 1, 'a timestamp is read by its day');
  assert.deepEqual(Object.keys(grid[0].cells), days);
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
console.log(`List views: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
