/** A batching plant's batch report read into rows, and its folder read once per change. Run: npm test */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readReport, sniffDelimiter, splitLine } from './csv';
import { readBatchFolder } from './batch-folder';

// Separators, quotes and blank cells.
assert.equal(sniffDelimiter('Batch No;Date;Qty'), ';');
assert.equal(sniffDelimiter('Batch No\tDate\tQty'), '\t');
assert.equal(sniffDelimiter('Batch No'), ',');
assert.deepEqual(splitLine('1201,"Sai Developers, Patia",6.0,', ','), ['1201', 'Sai Developers, Patia', '6.0', '']);
assert.deepEqual(splitLine('"say ""M25"""; 7', ';'), ['say "M25"', '7']);

// A report with a title line, a repeated header, a short row and a blank line; the same row keeps its key.
const text = 'PLANT 1 BATCH REPORT\r\nBatch No,Date,Time,Recipe,Qty m3,CEM (kg),Sand (kg)\r\n1201,29-10-2026,08:15,M25-OPC-01,6.0,2280,4320\r\n\r\nBatch No,Date,Time,Recipe,Qty m3,CEM (kg),Sand (kg)\r\n1202,29-10-2026,09:02,M25-OPC-01,6.0\r\n';
const r = readReport('BATCH_20261029.CSV', text);
assert.deepEqual(r.headers, ['Batch No', 'Date', 'Time', 'Recipe', 'Qty m3', 'CEM (kg)', 'Sand (kg)']);
assert.equal(r.rows.length, 2);
assert.deepEqual(r.rows[0].fields, { 'Batch No': '1201', Date: '29-10-2026', Time: '08:15', Recipe: 'M25-OPC-01', 'Qty m3': '6.0', 'CEM (kg)': '2280', 'Sand (kg)': '4320' });
assert.equal(r.rows[1].fields['CEM (kg)'], '');
assert.equal(r.rows[0].line, 3);
assert.match(r.rows[0].key, /^pb-[0-9a-f]{40}$/);
assert.equal(readReport('BATCH_20261029.CSV', text + '1203,29-10-2026,09:40,M20-OPC-01,6.0,1980,4450\r\n').rows[0].key, r.rows[0].key);
assert.notEqual(readReport('other.csv', text).rows[0].key, r.rows[0].key);
// Two columns of one name are told apart; a file of numbers only has no header.
assert.deepEqual(readReport('x.csv', 'No,Agg,Agg\n1,2,3\n').headers, ['No', 'Agg', 'Agg (2)']);
assert.deepEqual(readReport('x.csv', '1,2,3\n4,5,6\n'), { headers: [], rows: [] });

// The folder: rows go once; a grown file sends only its new rows; an old file is left on the first run.
async function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'nirmaan-batch-'));
  try {
    const conn = { id: 'c1', kind: 'BATCHING_PLANT', name: 'Plant', credential: null, config: { folder: dir, extensions: ['csv'], sinceDays: 2 } };
    writeFileSync(join(dir, 'today.csv'), text);
    writeFileSync(join(dir, 'old.csv'), text.replace(/1201/g, '9001'));
    const old = new Date(Date.now() - 5 * 86_400_000);
    utimesSync(join(dir, 'old.csv'), old, old);
    writeFileSync(join(dir, 'notes.pdf'), 'x');
    const first = await readBatchFolder(conn);
    assert.deepEqual(first.map((x) => (x.payload.fields as Record<string, string>)['Batch No']), ['1201', '1202']);
    assert.equal(first[0].id, first[0].payload.key);
    assert.equal((await readBatchFolder(conn)).length, 0);
    writeFileSync(join(dir, 'today.csv'), text + '1203,29-10-2026,09:40,M20-OPC-01,6.0,1980,4450\r\n');
    const later = await readBatchFolder(conn);
    assert.deepEqual(later.map((x) => (x.payload.fields as Record<string, string>)['Batch No']), ['1203']);
    await assert.rejects(readBatchFolder({ ...conn, id: 'c2', config: { folder: join(dir, 'missing') } }), /could not be read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

folder().then(() => console.log('Connector batch reports: all tests pass'));
