/**
 * Drawing markup's tests (item 109): what a mark needs before it is saved, and which marks a sheet shows (its own and
 * the open ones carried from earlier revisions), with no database. CI runs it after the build:
 *
 *   node dist/scripts/markup-test.js
 */
import assert from 'node:assert/strict';
import { MARKUP_MAX_POINTS, canEditMarkup, drawingFileKind, markupProblem, marksForSheet, roundPoint, type MarkupStatus } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('a pin needs one point and a comment; text needs its words', () => {
  assert.equal(markupProblem('PIN', [[0.5, 0.5]], 'Check this level'), null);
  assert.equal(markupProblem('PIN', [[0.5, 0.5]], '  '), 'Write the comment');
  assert.equal(markupProblem('TEXT', [[0.5, 0.5]], null), 'Write the text');
  assert.equal(markupProblem('PIN', [], 'x'), 'Draw the mark on the drawing');
  assert.equal(markupProblem('PIN', [[0.1, 0.1], [0.2, 0.2]], 'x'), 'Draw the mark again');
});

test('a cloud, box or arrow takes two points; the comment is optional', () => {
  for (const kind of ['CLOUD', 'RECT', 'ARROW'] as const) {
    assert.equal(markupProblem(kind, [[0.1, 0.1], [0.4, 0.3]], null), null);
    assert.equal(markupProblem(kind, [[0.1, 0.1]], null), 'Draw the mark on the drawing');
  }
});

test('freehand: up to the limit, longer strokes are refused with what to do', () => {
  const line = (n: number) => Array.from({ length: n }, (_, i) => [i / n, 0.5]);
  assert.equal(markupProblem('PEN', line(MARKUP_MAX_POINTS), null), null);
  assert.match(markupProblem('PEN', line(MARKUP_MAX_POINTS + 1), null)!, /shorter strokes/);
});

test('points must be numbers on the sheet (a little past the border is allowed)', () => {
  assert.equal(markupProblem('RECT', [[-0.02, 0], [1.03, 1]], null), null);
  assert.equal(markupProblem('RECT', [[0, 0], [1.2, 1]], null), 'Keep the mark on the drawing');
  assert.equal(markupProblem('RECT', [[0, 0], ['1', 1]], null), 'Draw the mark again');
  assert.equal(markupProblem('RECT', [[0, 0], [Number.NaN, 1]], null), 'Draw the mark again');
  assert.equal(markupProblem('RECT', 'nope', null), 'Draw the mark on the drawing');
  assert.deepEqual(roundPoint([0.1234567, 0.9999999]), [0.12346, 1]);
});

test("a sheet shows its own marks, and with carry the earlier revisions' open marks on the same file place and page", () => {
  const m = (id: string, revisionId: string, attachmentId: string, fileIndex: number, page: number, status: MarkupStatus) => ({ id, revisionId, attachmentId, fileIndex, page, status });
  const marks = [
    m('own', 'R2', 'f2a', 0, 1, 'OPEN'),
    m('ownResolved', 'R2', 'f2a', 0, 1, 'RESOLVED'),
    m('otherPage', 'R2', 'f2a', 0, 2, 'OPEN'),
    m('r1Open', 'R1', 'f1a', 0, 1, 'OPEN'),
    m('r1Resolved', 'R1', 'f1a', 0, 1, 'RESOLVED'),
    m('r1SecondFile', 'R1', 'f1b', 1, 1, 'OPEN'),
    m('r0Open', 'R0', 'f0a', 0, 1, 'OPEN'),
    m('r3Later', 'R3', 'f3a', 0, 1, 'OPEN'),
  ];
  const order = ['R3', 'R2', 'R1', 'R0'];
  const sheet = { revisionId: 'R2', attachmentId: 'f2a', fileIndex: 0, page: 1 };
  const shown = marksForSheet(marks, order, sheet, true);
  assert.deepEqual(shown.own.map((x) => x.id), ['own', 'ownResolved']);
  assert.deepEqual(shown.carried.map((x) => x.id), ['r1Open', 'r0Open']);
  assert.deepEqual(marksForSheet(marks, order, sheet, false).carried, []);
  // The oldest revision carries nothing; a later revision's marks never go backwards.
  assert.deepEqual(marksForSheet(marks, order, { revisionId: 'R0', attachmentId: 'f0a', fileIndex: 0, page: 1 }, true).carried, []);
});

test('who edits a mark: its maker and document control; files the viewer draws', () => {
  assert.equal(canEditMarkup('SITE_ENGINEER', true), true);
  assert.equal(canEditMarkup('SITE_ENGINEER', false), false);
  assert.equal(canEditMarkup('QA_QC_ENGINEER', false), true);
  assert.equal(drawingFileKind({ fileName: 'GA.PDF', mimeType: 'application/octet-stream' }), 'pdf');
  assert.equal(drawingFileKind({ fileName: 'plan.dxf', mimeType: 'application/octet-stream' }), 'dxf');
  assert.equal(drawingFileKind({ fileName: 'plan.dwg', mimeType: 'image/vnd.dwg' }), 'dwg');
  assert.equal(drawingFileKind({ fileName: 'site.jpg', mimeType: 'image/jpeg' }), 'image');
  assert.equal(drawingFileKind({ fileName: 'site.heic', mimeType: 'image/heic' }), 'other');
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
console.log(`\nDrawing markup: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
