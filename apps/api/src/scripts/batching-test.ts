/**
 * Batching plant tests: a batching plant connection's settings, a column map, a row from the Connector, a
 * row read through the map (figures, dates, the materials in their items' units), the first map guessed from a
 * report's headers, and the order a batch was for. No database. CI runs it after the build:
 *
 *   node dist/scripts/batching-test.js
 */
import assert from 'node:assert/strict';
import { columnMapProblem, defaultPerUnit, guessColumns, readBatchRow, readFigure, readStamp, suggestOrder, type BatchColumnMap, type SuggestOrder } from '@erp/shared';
import { readBatchingConfig, readColumnMap, readPlantRow } from '../rmc/batching-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const MAP: BatchColumnMap = {
  fields: { BATCH_NO: 'Batch No', DATE: 'Date', TIME: 'Time', QUANTITY: 'Qty m3', MIX: 'Recipe', TRUCK: 'Truck' },
  materials: [
    { column: 'CEM (kg)', itemId: 'cement', perUnit: 50 },
    { column: 'Sand (kg)', itemId: 'sand', perUnit: 1600 },
    { column: 'Admix (kg)', itemId: 'admix', perUnit: 1 },
  ],
};
const ROW = { 'Batch No': '1201', Date: '29-10-2026', Time: '08:15', 'Qty m3': '6.0', Recipe: 'M25-OPC-01', Truck: 'od 02 ax 1101', 'CEM (kg)': '2,281.5', 'Sand (kg)': '4320', 'Admix (kg)': '19.2', 'Water (L)': '960' };

test("a batching plant's settings: its folder, the files it reads, and a map already matched kept", () => {
  assert.deepEqual(readBatchingConfig({ folder: 'D:\\Batch Reports\\' }).config, { folder: 'D:\\Batch Reports', extensions: ['csv', 'txt'], sinceDays: 2, columns: null });
  assert.deepEqual(readBatchingConfig({ folder: '\\\\PLANT-PC\\Reports', extensions: ['.CSV'], sinceDays: 5 }).config?.extensions, ['csv']);
  assert.equal(readBatchingConfig({ folder: '/home/plant/reports/' }).config?.folder, '/home/plant/reports');
  assert.equal(readBatchingConfig({ folder: 'D:\\' }).config?.folder, 'D:\\');
  assert.match(readBatchingConfig({}).problem!, /folder the controller writes/);
  assert.match(readBatchingConfig({ folder: 'reports' }).problem!, /in full/);
  assert.match(readBatchingConfig({ folder: 'D:\\Reports\\..\\Windows' }).problem!, /in full/);
  assert.match(readBatchingConfig({ folder: 'D:\\Reports', extensions: ['xlsx'] }).problem!, /export its reports as CSV/);
  assert.match(readBatchingConfig({ folder: 'D:\\Reports', sinceDays: 90 }).problem!, /between 1 and 30/);
  // The admin changing the folder keeps the columns the plant matched.
  assert.deepEqual(readBatchingConfig({ folder: 'E:\\Reports' }, { folder: 'D:\\Reports', columns: MAP }).config?.columns, MAP);
});

test('a column map needs the batch number and the cubic metres, each column once, and kg per unit for each material', () => {
  assert.equal(columnMapProblem(MAP, Object.keys(ROW)), null);
  assert.match(columnMapProblem({ fields: { BATCH_NO: 'Batch No' }, materials: [] }, null)!, /cubic metres batched/);
  assert.match(columnMapProblem({ fields: { BATCH_NO: 'Batch No', QUANTITY: 'Batch No' }, materials: [] }, null)!, /Batch No is chosen twice/);
  assert.match(columnMapProblem({ ...MAP, materials: [...MAP.materials, { column: 'Water (L)', itemId: 'cement', perUnit: 1 }] }, null)!, /two columns/);
  assert.match(columnMapProblem({ ...MAP, materials: [{ column: 'Sand (kg)', itemId: 'sand', perUnit: 0 }] }, null)!, /cum of sand/);
  assert.match(columnMapProblem(MAP, ['Batch No', 'Qty m3'])!, /not a column of the report/);
  assert.deepEqual(readColumnMap(null), { columns: null });
  assert.match(readColumnMap({ fields: {}, materials: [{ column: 'X' }] }).problem!, /names its column and its item/);
});

test('a row from the Connector: its key, file, line and columns as text', () => {
  const r = readPlantRow({ key: 'pb-1', file: 'B.csv', line: 3, fields: { 'Batch No': 1201, Date: '29-10-2026', Blank: null } });
  assert.deepEqual(r.row, { key: 'pb-1', file: 'B.csv', line: 3, fields: { 'Batch No': '1201', Date: '29-10-2026', Blank: '' } });
  assert.match(readPlantRow({ fields: { a: '1' } }).problem!, /No key/);
  assert.match(readPlantRow({ key: 'k' }).problem!, /No columns/);
  assert.match(readPlantRow({ key: 'k', fields: {} }).problem!, /no columns/);
  assert.match(readPlantRow({ key: 'k', fields: { a: { b: 1 } } }).problem!, /not text or a number/);
  assert.match(readPlantRow('x').problem!, /not a JSON object/);
});

test("figures and times as controllers print them, read in India's time", () => {
  assert.equal(readFigure('2,281.5'), 2281.5);
  assert.equal(readFigure('2.281,5'), 2281.5);
  assert.equal(readFigure('6,00'), 6);
  assert.equal(readFigure(' 4320 kg'), 4320);
  assert.equal(readFigure('-'), null);
  assert.equal(readFigure(''), null);
  assert.equal(readStamp('29-10-2026', '08:15')?.toISOString(), '2026-10-29T02:45:00.000Z');
  assert.equal(readStamp('2026-10-29 08:15:30')?.toISOString(), '2026-10-29T02:45:30.000Z');
  assert.equal(readStamp('29/10/26 8:15 PM')?.toISOString(), '2026-10-29T14:45:00.000Z');
  assert.equal(readStamp('31-02-2026'), null);
  assert.equal(readStamp('Thursday'), null);
});

test('a row through the map: its batch, load, mix and truck, and each material in its item’s unit', () => {
  const r = readBatchRow(ROW, MAP);
  assert.deepEqual(r, {
    batchNo: '1201',
    at: new Date('2026-10-29T02:45:00.000Z'),
    quantity: 6,
    mix: 'M25-OPC-01',
    truck: 'OD 02 AX 1101',
    orderRef: null,
    materials: [
      { itemId: 'cement', actualQty: 45.63 },
      { itemId: 'sand', actualQty: 2.7 },
      { itemId: 'admix', actualQty: 19.2 },
    ],
    problems: [],
  });
  // A material not weighed (blank or 0) is left out; a load that is not a truck's, or none, keeps it from a challan.
  assert.deepEqual(readBatchRow({ ...ROW, 'Admix (kg)': '0', 'Sand (kg)': '' }, MAP).materials, [{ itemId: 'cement', actualQty: 45.63 }]);
  assert.deepEqual(readBatchRow({ ...ROW, 'Qty m3': '60' }, MAP).problems, ["60 m³ is not a truck's load"]);
  assert.deepEqual(readBatchRow({ ...ROW, 'Qty m3': '', 'Batch No': ' ' }, MAP).problems, ['No batch number in the row', 'No cubic metres in the row']);
  assert.deepEqual(readBatchRow(ROW, null).problems, ['The columns are not matched yet']);
});

test("the first map from a report's headers: the fields, then each material by its usual name", () => {
  const items = [
    { id: 'cement', name: 'OPC 53 Grade Cement', unit: 'Bags' },
    { id: 'sand', name: 'River Sand (Zone II)', unit: 'Cum' },
    { id: 'a20', name: 'Aggregate 20mm', unit: 'Cum' },
    { id: 'a10', name: 'Aggregate 10mm', unit: 'Cum' },
    { id: 'admix', name: 'Admixture PCE (Master Glenium)', unit: 'Kg' },
  ];
  const map = guessColumns(['Batch No', 'Date', 'Time', 'Recipe', 'Qty m3', 'Truck No', 'CEM1 act (kg)', 'Sand act (kg)', 'CA 20mm act (kg)', 'CA 10mm act (kg)', 'Admix (kg)', 'Water (L)'], items);
  assert.deepEqual(map.fields, { BATCH_NO: 'Batch No', DATE: 'Date', TIME: 'Time', QUANTITY: 'Qty m3', MIX: 'Recipe', TRUCK: 'Truck No' });
  assert.deepEqual(
    map.materials.map((m) => [m.column, m.itemId, m.perUnit]),
    [
      ['CEM1 act (kg)', 'cement', 50],
      ['Sand act (kg)', 'sand', 0],
      ['CA 20mm act (kg)', 'a20', 0],
      ['CA 10mm act (kg)', 'a10', 0],
      ['Admix (kg)', 'admix', 1],
    ],
  );
  assert.equal(defaultPerUnit('MT'), 1000);
  assert.equal(defaultPerUnit('Ltr'), 1);
  assert.equal(defaultPerUnit('Cum'), null);
});

test('the order a batch was for: named in its order column, else the only one of its mix with room, else none', () => {
  const o = (id: string, orderNo: string, code: string, grade: string, left: number): SuggestOrder => ({ id, orderNo, mixDesignCode: code, grade, left, customer: 'C' });
  const orders = [o('a', 'RMC-2026-0001', 'M25-OPC-01', 'M25', 24), o('b', 'RMC-2026-0002', 'M20-OPC-01', 'M20', 30), o('c', 'RMC-2026-0004', 'M25-OPC-01', 'M25', 4)];
  assert.equal(suggestOrder({ mix: 'M25-OPC-01', orderRef: null, quantity: 6 }, orders)?.id, 'a'); // c has no room for 6
  assert.equal(suggestOrder({ mix: 'M20', orderRef: null, quantity: 6 }, orders)?.id, 'b');
  assert.equal(suggestOrder({ mix: 'M25-OPC-01', orderRef: null, quantity: 3 }, orders), null); // a and c both could
  assert.equal(suggestOrder({ mix: 'M25-OPC-01', orderRef: 'SO 0004', quantity: 3 }, orders)?.id, 'c');
  assert.equal(suggestOrder({ mix: 'M40', orderRef: null, quantity: 6 }, orders), null);
  assert.equal(suggestOrder({ mix: null, orderRef: null, quantity: 6 }, [orders[1]])?.id, 'b');
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
console.log(`\nBatching plant: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
