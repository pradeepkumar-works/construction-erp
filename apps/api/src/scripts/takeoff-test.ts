/**
 * Measuring on drawings' tests: the scale from two points, lengths along a line, areas inside an outline,
 * counts, what a measure needs, and the measurement book line each becomes, with no database. CI runs it after the build:
 *
 *   node dist/scripts/takeoff-test.js
 */
import assert from 'node:assert/strict';
import { dxfScalePoints, pageDistance, polygonArea, polylineLength, rectangleSides, scaleFrom, scaleProblem, takeoffLine, takeoffBoqQty, takeoffProblem, takeoffTotal, takeoffValue, type MarkupPoint } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const near = (a: number | null, b: number, eps = 1e-6) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} is not ${b}`);

// An A1 sheet in landscape is 841 × 594 mm: about 1.4158 wide for each 1 high.
const A1 = 841 / 594;

test('distances on the sheet count its width in page heights', () => {
  near(pageDistance([0, 0], [1, 0], A1), A1);
  near(pageDistance([0, 0], [0, 1], A1), 1);
  near(pageDistance([0.2, 0.3], [0.5, 0.7], 2), Math.hypot(0.6, 0.4));
});

test('a scale is metres per page height from two points a known distance apart', () => {
  // 10 m between points 0.25 of the width apart on an A1 sheet.
  const s = scaleFrom([[0.25, 0.5], [0.5, 0.5]], 10, A1)!;
  near(s, 10 / (0.25 * A1));
  assert.equal(scaleFrom([[0.3, 0.3], [0.3, 0.3]], 10, A1), null);
  // Then a line along the same distance is 10 m, and twice as far is 20 m.
  near(takeoffValue('LENGTH', [[0.25, 0.5], [0.5, 0.5]], A1, s), 10, 1e-3);
  near(takeoffValue('LENGTH', [[0.1, 0.2], [0.35, 0.2], [0.6, 0.2]], A1, s), 20, 1e-3);
});

test('a length follows every corner of the line', () => {
  near(polylineLength([[0, 0], [0.3, 0], [0.3, 0.4]], 1), 0.7);
  near(polylineLength([[0.5, 0.5]], 1), 0);
});

test('an area is inside the outline, closed back to the start, whichever way round it is drawn', () => {
  const square: MarkupPoint[] = [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]];
  near(polygonArea(square, 1), 0.04);
  near(polygonArea([...square].reverse(), 1), 0.04);
  near(polygonArea(square, 2), 0.08);
  // An L shape: a 2 × 2 square with a 1 × 1 corner out, at 1 m per page height on a square sheet.
  near(takeoffValue('AREA', [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]].map(([x, y]) => [x / 10, y / 10] as MarkupPoint), 1, 10)!, 3, 1e-9);
});

test('a count is its points, scale or none; a length or area needs the scale', () => {
  assert.equal(takeoffValue('COUNT', [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]], A1, null), 3);
  assert.equal(takeoffValue('LENGTH', [[0, 0], [1, 1]], A1, null), null);
  assert.equal(takeoffValue('AREA', [[0, 0], [1, 0], [1, 1]], A1, null), null);
});

test('what a measure needs, in words', () => {
  assert.equal(takeoffProblem('LENGTH', [[0.1, 0.1]], 'Beam', true), 'Click at least two points along the line');
  assert.equal(takeoffProblem('AREA', [[0.1, 0.1], [0.2, 0.2]], 'Slab', true), 'Click at least three corners of the area');
  assert.equal(takeoffProblem('COUNT', [], 'Columns', true), 'Click each thing you count');
  assert.equal(takeoffProblem('LENGTH', [[0.1, 0.1], [0.4, 0.1]], '  ', true), 'Say what it is, e.g. "Plinth beam, grid A"');
  assert.equal(takeoffProblem('LENGTH', [[0.1, 0.1], [0.4, 0.1]], 'Beam', false), 'Set the scale on this sheet first: click two points a known distance apart');
  assert.equal(takeoffProblem('COUNT', [[0.1, 0.1]], 'Columns', false), null);
  assert.equal(takeoffProblem('LENGTH', [[0.1, 0.1], [1.4, 0.1]], 'Beam', true), 'Keep the measure on the drawing');
  assert.equal(takeoffProblem('LENGTH', [[0.1, 0.1], [0.2, Number.NaN]], 'Beam', true), 'Measure again');
});

test('what a scale needs, in words', () => {
  assert.equal(scaleProblem([[0.1, 0.1]], 5, A1), 'Click two points a known distance apart');
  assert.equal(scaleProblem([[0.1, 0.1], [0.5, 0.1]], 0, A1), 'Enter the real distance between the points in metres');
  assert.equal(scaleProblem([[0.1, 0.1], [0.1005, 0.1]], 5, A1), 'Click two points further apart, ideally a long dimension');
  assert.equal(scaleProblem([[0.1, 0.1], [0.5, 0.1]], 5, A1), null);
});

test('a DXF in known units takes its scale from the sheet width', () => {
  const { points, lengthM } = dxfScalePoints(42_000, 'mm');
  assert.equal(lengthM, 42);
  near(takeoffValue('LENGTH', [[0, 0.2], [0.5, 0.2]], A1, scaleFrom(points, lengthM, A1)), 21, 1e-3);
});

test('a rectangle is found by its right angles, and any other outline is not', () => {
  const rect: MarkupPoint[] = [[0.1, 0.1], [0.5, 0.1], [0.5, 0.3], [0.1, 0.3]];
  const sides = rectangleSides(rect, 1)!;
  near(sides[0], 0.4);
  near(sides[1], 0.2);
  assert.equal(rectangleSides([[0.1, 0.1], [0.5, 0.1], [0.55, 0.3], [0.1, 0.3]], 1), null);
  assert.equal(rectangleSides(rect.slice(0, 3), 1), null);
});

test('each measure becomes a measurement book line: L, L × B, an area, or nos', () => {
  const s = 10;
  assert.deepEqual(takeoffLine({ kind: 'LENGTH', label: 'Plinth beam A', points: [], value: '12.450' }, 1, s), { description: 'Plinth beam A', nos: 1, length: 12.45, breadth: null });
  assert.deepEqual(takeoffLine({ kind: 'COUNT', label: 'Columns C1', points: [], value: '14.000' }, 1, s), { description: 'Columns C1', nos: 14, length: null, breadth: null });
  assert.deepEqual(takeoffLine({ kind: 'AREA', label: 'Slab S1', points: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.3], [0.1, 0.3]], value: '8.000' }, 1, s), { description: 'Slab S1', nos: 1, length: 4, breadth: 2 });
  assert.deepEqual(takeoffLine({ kind: 'AREA', label: 'Lobby', points: [[0.1, 0.1], [0.5, 0.1], [0.3, 0.4]], value: '6.000' }, 1, s), { description: 'Lobby (area)', nos: 1, length: 6, breadth: null });
  assert.equal(takeoffTotal(['1.111', '2.222', 3.3333]), 6.666);
});

test('a BOQ quantity adds measures of one kind and multiplies by the factor', () => {
  assert.deepEqual(takeoffBoqQty([{ kind: 'AREA', value: '8.000' }, { kind: 'AREA', value: '6.125' }]), { qty: 14.125 });
  assert.deepEqual(takeoffBoqQty([{ kind: 'AREA', value: '8.000' }, { kind: 'AREA', value: '6.125' }], 0.15), { qty: 2.119 });
  assert.match((takeoffBoqQty([{ kind: 'AREA', value: '8' }, { kind: 'LENGTH', value: '3' }]) as { problem: string }).problem, /one kind/);
  assert.match((takeoffBoqQty([]) as { problem: string }).problem, /Pick the measures/);
  assert.match((takeoffBoqQty([{ kind: 'COUNT', value: '2' }], 0) as { problem: string }).problem, /above zero/);
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
