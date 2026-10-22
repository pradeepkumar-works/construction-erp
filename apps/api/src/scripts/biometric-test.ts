/**
 * Biometric attendance's tests (v6 item 101): reading ADMS uploads, webhook times and punch files, and a person's day
 * from their punches, with no database. CI runs it after the build:
 *
 *   node dist/scripts/biometric-test.js
 */
import assert from 'node:assert/strict';
import { cleanPin, codeNumber, dayFromPunches, localToUtc, parseAdmsAttlog, parsePunchFile, utcToLocal, webhookLocal } from '../biometric/biometric-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('ADMS ATTLOG: tab-separated lines read, padded user numbers trimmed, bad lines left out', () => {
  const body = '0014\t2026-10-21 09:02:11\t0\t1\t0\t0\t0\n14\t2026-10-21 18:40:00\t1\t1\n\n7\t2026-13-01 09:00:00\t0\t1\nW7\t2026-10-21 08:55:00\t0\t15\ngarbage line\n';
  assert.deepEqual(parseAdmsAttlog(body), [
    { pin: '14', local: '2026-10-21 09:02:11' },
    { pin: '14', local: '2026-10-21 18:40:00' },
    { pin: 'W7', local: '2026-10-21 08:55:00' },
  ]);
});

test('device clock to UTC and back for India (330 minutes ahead)', () => {
  const at = localToUtc('2026-10-21 09:00:00', 330);
  assert.equal(at.toISOString(), '2026-10-21T03:30:00.000Z');
  assert.equal(utcToLocal(at, 330), '2026-10-21 09:00:00');
  assert.equal(utcToLocal(localToUtc('2026-10-21 02:00:00', 330), 0), '2026-10-20 20:30:00');
});

test('webhook times: device clock as sent, or turned from UTC or another offset', () => {
  assert.equal(webhookLocal('2026-10-21 09:05', 330), '2026-10-21 09:05:00');
  assert.equal(webhookLocal('2026-10-21T09:05:30', 330), '2026-10-21 09:05:30');
  assert.equal(webhookLocal('2026-10-21T03:35:00Z', 330), '2026-10-21 09:05:00');
  assert.equal(webhookLocal('2026-10-21T09:05:00+05:30', 330), '2026-10-21 09:05:00');
  assert.equal(webhookLocal('2026-10-20T23:00:00.000Z', 330), '2026-10-21 04:30:00');
  assert.equal(webhookLocal('21/10/2026 09:05', 330), null);
  assert.equal(webhookLocal('2026-02-30 09:05', 330), null);
});

test('punch file with a header: user number and one date-time column, day first, with AM and PM', () => {
  const csv = 'AC-No.,Name,Date Time,State\r\n0014,Bikash,21/10/2026 9:02 AM,C/In\r\n14,Bikash,21/10/2026 6:40 PM,C/Out\r\n,Nobody,21/10/2026 9:00 AM,C/In\r\n';
  const r = parsePunchFile(csv);
  assert.deepEqual(r.punches, [
    { pin: '14', local: '2026-10-21 09:02:00' },
    { pin: '14', local: '2026-10-21 18:40:00' },
  ]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^Line 4: no user number/);
});

test('punch file with separate date and time columns, tab separated', () => {
  const r = parsePunchFile('Emp Code\tDate\tTime\n7\t2026-10-21\t08:58:40\n7\t2026-10-21\t17:30\n');
  assert.deepEqual(r.punches, [
    { pin: '7', local: '2026-10-21 08:58:40' },
    { pin: '7', local: '2026-10-21 17:30:00' },
  ]);
});

test('punch file with no header: number, date and time; a bad date is reported with its line', () => {
  const r = parsePunchFile('1001,2026-10-21,08:00\n1001,2026-10-21,17:15\n1002,31/02/2026,08:00\n');
  assert.equal(r.punches.length, 2);
  assert.equal(r.punches[1].local, '2026-10-21 17:15:00');
  assert.match(r.errors[0], /^Line 3: the date and time do not read/);
  assert.match(parsePunchFile('User ID;Name\n7;Ravi\n').errors[0], /no date and time columns/);
});

test('a day: in at the first punch, out at the last; a double press is one punch; short days are half days', () => {
  assert.deepEqual(dayFromPunches(['18:40:00', '09:02:11', '13:00:00'], 9), { inTime: '09:02:11', outTime: '18:40:00', hours: 9.63, status: 'PRESENT' });
  assert.deepEqual(dayFromPunches(['09:00:00', '09:04:00'], 9), { inTime: '09:00:00', outTime: null, hours: null, status: 'PRESENT' });
  assert.equal(dayFromPunches(['09:00:00', '12:30:00'], 9).status, 'HALF_DAY');
  assert.equal(dayFromPunches(['09:00:00', '13:30:00'], 9).status, 'PRESENT');
});

test('user numbers from codes: EMP-014 is 14, W-0007 is 7; cleanPin keeps letters', () => {
  assert.equal(codeNumber('EMP-014'), '14');
  assert.equal(codeNumber('W-0007'), '7');
  assert.equal(codeNumber('HO'), null);
  assert.equal(cleanPin(' 00120 '), '120');
  assert.equal(cleanPin('A12'), 'A12');
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
console.log(`\nBiometric: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
