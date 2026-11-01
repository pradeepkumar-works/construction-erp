/**
 * DPR work line tests. Up to previous, cumulative, % and balance (two lines on one activity add up in
 * order), material from the norms, the crew on the lines against the head count, machine hours and material added up,
 * the work summary, grouping by component › sub-component, and the line checks.
 *
 *   node dist/scripts/dpr-lines-test.js
 */
import assert from 'node:assert/strict';
import { crewCheck, dprActivityLabel, dprLineProblem, groupLines, lineFigures, lineLocation, machineHours, materialUsed, suggestMaterials, workSummary } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('a line adds to what was approved before: cumulative, % and balance', () => {
  const [f] = lineFigures([{ activityId: 'conc', quantity: '11.5' }], new Map([['conc', 69]]), new Map([['conc', 34.5]]));
  assert.deepEqual(f, { previous: '34.5', cumulative: '46', pct: 66.7, balance: '23' });
});

test('two lines of one DPR on the same activity add up in order', () => {
  const f = lineFigures(
    [
      { activityId: 'lay', quantity: '84' },
      { activityId: 'trench', quantity: '96' },
      { activityId: 'lay', quantity: '36' },
    ],
    new Map([['lay', 120], ['trench', 96]]),
    new Map(),
  );
  assert.deepEqual(f.map((x) => [x.previous, x.cumulative, x.pct, x.balance]), [
    ['0', '84', 70, '36'],
    ['0', '96', 100, '0'],
    ['84', '120', 100, '0'],
  ]);
});

test('nothing planned gives no %, and work over the scope a negative balance', () => {
  assert.equal(lineFigures([{ activityId: 'x', quantity: 5 }], new Map(), new Map())[0].pct, null);
  const [over] = lineFigures([{ activityId: 'x', quantity: 5 }], new Map([['x', 10]]), new Map([['x', 8]]));
  assert.equal(over.balance, '-3');
  assert.equal(over.pct, 130);
});

test('material is suggested from the norms, to three places, and none for no quantity', () => {
  const norms = [
    { itemId: 'cement', qtyPerUnit: '8' },
    { itemId: 'steel', qtyPerUnit: '0.0012' },
    { itemId: 'none', qtyPerUnit: '0' },
  ];
  assert.deepEqual(suggestMaterials('11.5', norms), [
    { itemId: 'cement', quantity: '92' },
    { itemId: 'steel', quantity: '0.014' },
  ]);
  assert.deepEqual(suggestMaterials('0', norms), []);
  assert.deepEqual(suggestMaterials('', norms), []);
});

test('the crew on the lines is checked against the head count', () => {
  const lines = [{ labour: [{ category: 'Mason', count: 4 }, { category: 'Helper', count: 10 }] }, { labour: [{ category: 'Bar bender', count: 6 }] }, { labour: null }];
  assert.deepEqual(crewCheck(lines, [{ category: 'Mason', count: 6 }, { category: 'Helper', count: 18 }]), { onLines: 20, headCount: 24, difference: 4 });
  assert.deepEqual(crewCheck(lines, []), { onLines: 20, headCount: null, difference: null });
  assert.equal(crewCheck(lines, [{ category: 'Helper', count: 12 }]).difference, -8);
});

test('machine hours and material used add up by name and item, in first-used order', () => {
  assert.deepEqual(machineHours([{ machines: [{ name: 'JCB 3DX', hours: 7 }] }, { machines: [{ name: 'Mixer', hours: 6 }, { name: ' JCB 3DX ', hours: 1.5 }] }, { machines: null }]), [
    { name: 'JCB 3DX', hours: 8.5 },
    { name: 'Mixer', hours: 6 },
  ]);
  const used = materialUsed([
    { materials: [{ itemId: 'c', itemName: 'Cement', unit: 'Bag', quantity: '92' }] },
    { materials: [{ itemId: 'p', itemName: 'HDPE 110', unit: 'm', quantity: '84' }, { itemId: 'c', itemName: 'Cement', unit: 'Bag', quantity: '8.5' }] },
  ]);
  assert.deepEqual(used.map((m) => [m.itemName, m.quantity]), [['Cement', '100.5'], ['HDPE 110', '84']]);
});

test('the work summary names the sub-activity under its activity, the quantity and the place', () => {
  assert.equal(
    workSummary([
      { activityName: 'Concrete', parentActivityName: 'Staging lift 4', quantity: '11.500', unit: 'Cum', location: 'Lift 4 of 6' },
      { activityName: 'Trench', parentActivityName: null, quantity: '96', unit: 'm', location: null },
    ]),
    'Staging lift 4 › Concrete 11.5 Cum at Lift 4 of 6; Trench 96 m',
  );
});

test('a sub-activity is named under its activity, without its name twice', () => {
  assert.equal(dprActivityLabel({ name: 'Container wall: concrete', parentActivityName: 'Container wall' }), 'Container wall › concrete');
  assert.equal(dprActivityLabel({ name: 'Concrete', parentActivityName: 'Staging lift 4' }), 'Staging lift 4 › Concrete');
  assert.equal(dprActivityLabel({ name: 'Trench', parentActivityName: null }), 'Trench');
});

test('lines group by component › sub-component in the order they first appear', () => {
  const line = (componentCode: string | null, componentName: string | null, subComponentCode: string | null = null, subComponentName: string | null = null) => ({ componentCode, componentName, subComponentCode, subComponentName });
  const groups = groupLines([line('8', 'Overhead tanks', '8.2', 'OHT 400 KL'), line('9', 'Distribution'), line('8', 'Overhead tanks', '8.2', 'OHT 400 KL'), line(null, null)]);
  assert.deepEqual(groups.map((g) => [g.label, g.lines.length]), [
    ['Overhead tanks › OHT 400 KL', 2],
    ['Distribution', 1],
    ['Outside the breakdown', 1],
  ]);
});

test('a line says where it was done: the location, else the chainage, floor or village', () => {
  const at = { location: null, chainageFrom: null, chainageTo: null, floor: null, village: null };
  assert.equal(lineLocation({ ...at, location: ' P-27, J-12 to J-13 ' }), 'P-27, J-12 to J-13');
  assert.equal(lineLocation({ ...at, chainageFrom: 1200, chainageTo: 1296 }), 'Ch 1200 to 1296 m');
  assert.equal(lineLocation({ ...at, floor: 'Third' }), 'Third');
  assert.equal(lineLocation(at), null);
});

test('a line needs its activity and a quantity above 0, and says so', () => {
  assert.equal(dprLineProblem({ activityId: '', quantity: '4' }, 2), 'Line 2: choose the activity');
  assert.equal(dprLineProblem({ activityId: 'a', quantity: '' }, 1), 'Line 1: enter the quantity done today');
  assert.equal(dprLineProblem({ activityId: 'a', quantity: 'x' }, 1), 'Line 1: enter the quantity done today');
  assert.equal(dprLineProblem({ activityId: 'a', quantity: '0' }, 3), 'Line 3: the quantity must be more than 0');
  assert.equal(dprLineProblem({ activityId: 'a', quantity: '0.5' }, 1), null);
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
