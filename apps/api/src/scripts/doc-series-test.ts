/**
 * Document number series (ARCHITECTURE "Company settings"): patterns, prefixes by calendar and financial year, the
 * running number after the last one, the checks on a company's patterns, and the logo's checks, with no database.
 * CI runs it after the build:
 *
 *   node dist/scripts/doc-series-test.js
 */
import assert from 'node:assert/strict';
import {
  DOC_SERIES_KIND_KEYS,
  LOGO_MAX_BYTES,
  docNoPrefix,
  docPatternOf,
  docPatternProblem,
  docSeriesProblem,
  docSeriesRestarts,
  formatDocNo,
  fyShort,
  logoProblem,
  nextRunningNo,
  readDocSeries,
  standardDocPattern,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('the standard pattern numbers as before: PO-2026-0001', () => {
  assert.equal(standardDocPattern('PO'), 'PO-{YYYY}-{NNNN}');
  assert.equal(formatDocNo(standardDocPattern('PO'), '2026-11-10', 1), 'PO-2026-0001');
  assert.equal(docPatternOf({}, 'EXP'), 'EXP-{YYYY}-{NNNN}', 'a kind the company has not set keeps the standard');
  assert.equal(docPatternOf(null, 'WO'), 'WO-{YYYY}-{NNNN}');
});

test('the financial year runs April to March', () => {
  assert.equal(fyShort('2026-04-01'), '26-27');
  assert.equal(fyShort('2027-03-31'), '26-27');
  assert.equal(fyShort('2026-03-31'), '25-26');
  assert.equal(docNoPrefix('PO/BBSR/{FY}/{NNNN}', '2026-11-10'), 'PO/BBSR/26-27/');
  assert.equal(formatDocNo('PO/{FY}/{NNNN}', '2027-01-05', 12), 'PO/26-27/0012');
  assert.equal(formatDocNo('WO{YY}{NNNN}', '2026-11-10', 7), 'WO260007');
  assert.equal(formatDocNo('DN/{NNNN}', '2026-11-10', 3), 'DN/0003', 'a pattern with no year never starts again');
});

test('numbers start again when the part before the running number changes', () => {
  assert.notEqual(docNoPrefix('PO/{FY}/{NNNN}', '2027-03-31'), docNoPrefix('PO/{FY}/{NNNN}', '2027-04-01'));
  assert.equal(docNoPrefix('PO/{FY}/{NNNN}', '2026-12-31'), docNoPrefix('PO/{FY}/{NNNN}', '2027-01-01'), 'a financial year runs over the new year');
  assert.equal(docSeriesRestarts('PO/{FY}/{NNNN}'), 'Each financial year');
  assert.equal(docSeriesRestarts('PO-{YYYY}-{NNNN}'), 'Each calendar year');
  assert.equal(docSeriesRestarts('PO/{NNNN}'), 'Never');
});

test('the running number follows the highest one with the prefix, and starts at 1 for a new prefix', () => {
  assert.equal(nextRunningNo('PO/26-27/', null), 1);
  assert.equal(nextRunningNo('PO/26-27/', 'PO/26-27/0041'), 42);
  assert.equal(nextRunningNo('PO-2026-', 'PO-2026-0009'), 10);
  assert.equal(nextRunningNo('PO/', 'PO/26-27/0041'), 1, 'an older number that only starts the same way does not count');
  assert.equal(nextRunningNo('P', 'Q-2026-0001'), 1);
});

test('a pattern ends with the running number, has letters of its own and no spaces', () => {
  assert.equal(docPatternProblem('PO/{FY}/{NNNN}'), null);
  assert.equal(docPatternProblem('PO-{YYYY}-{NNNN}'), null);
  assert.match(docPatternProblem('') ?? '', /Enter the pattern/);
  assert.match(docPatternProblem('PO/{FY}') ?? '', /End the pattern with \{NNNN\}/);
  assert.match(docPatternProblem('{NNNN}/PO/{NNNN}') ?? '', /End the pattern|once/);
  assert.match(docPatternProblem('PO/{MM}/{NNNN}') ?? '', /\{MM\} is not a part/);
  assert.match(docPatternProblem('PO {FY} {NNNN}') ?? '', /no spaces/);
  assert.match(docPatternProblem('{FY}/{NNNN}') ?? '', /Start the pattern with letters/);
  assert.match(docPatternProblem(`${'P'.repeat(30)}{NNNN}`) ?? '', /30 characters/);
});

test("a company's patterns are each good and never shared by two kinds", () => {
  assert.equal(docSeriesProblem({ PO: 'PO/{FY}/{NNNN}', WO: 'WO/{FY}/{NNNN}' }), null);
  assert.match(docSeriesProblem({ PO: 'ORD/{FY}/{NNNN}', WO: 'ord/{FY}/{NNNN}' }) ?? '', /Purchase orders and Work orders have the same pattern/);
  assert.match(docSeriesProblem({ XX: 'XX/{NNNN}' }) ?? '', /not a kind of document/);
  assert.match(docSeriesProblem({ PO: 'PO/{FY}' }) ?? '', /^Purchase orders: End the pattern/);
  const standard = Object.fromEntries(DOC_SERIES_KIND_KEYS.map((k) => [k, standardDocPattern(k)]));
  assert.equal(docSeriesProblem(standard), null, 'the standard patterns never clash');
});

test('stored settings read only known kinds with good patterns', () => {
  assert.deepEqual(readDocSeries({ PO: 'PO/{FY}/{NNNN}', XX: 'XX/{NNNN}', WO: 'WO/{FY}', MB: 5 }), { PO: 'PO/{FY}/{NNNN}' });
  assert.deepEqual(readDocSeries('nonsense'), {});
  assert.deepEqual(readDocSeries([]), {});
});

test('a logo is a PNG, JPEG or WebP of 200 KB at most', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(logoProblem(png), null);
  assert.equal(logoProblem('data:image/jpeg;base64,/9j/4AAQ'), null);
  assert.match(logoProblem('data:image/svg+xml;base64,PHN2Zz4=') ?? '', /SVG/);
  assert.match(logoProblem('https://example.com/logo.png') ?? '', /Choose a PNG/);
  assert.match(logoProblem(`data:image/png;base64,${'A'.repeat(Math.ceil((LOGO_MAX_BYTES + 10) / 3) * 4)}`) ?? '', /200 KB/);
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
if (failed) process.exit(1);
