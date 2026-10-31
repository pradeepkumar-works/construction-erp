/**
 * Biometric attendance's tests: reading ADMS uploads, webhook times and punch files, and a person's day
 * from their punches; and the commands handed to an ADMS device and its answers, with no database. CI runs it after the build:
 *
 *   node dist/scripts/biometric-test.js
 */
import assert from 'node:assert/strict';
import {
  admsCommandLine,
  cleanPin,
  codeNumber,
  commandsToSend,
  dayFromPunches,
  devicePinProblem,
  deviceUserName,
  localToUtc,
  parseAdmsAttlog,
  parseAdmsReplies,
  parsePunchFile,
  userCommandState,
  utcToLocal,
  webhookLocal,
  zkDeviceTime,
} from '../biometric/biometric-rules';

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

test("commands for an ADMS device: a user's number and name, taking it off, and the clock in the device's own count", () => {
  const now = new Date('2026-10-29T02:45:30Z'); // 08:15:30 in India
  assert.equal(admsCommandLine({ cmdNo: 7, kind: 'ADD_USER', pin: '14', name: 'Sneha\tIyer' }, now, 330), 'C:7:DATA UPDATE USERINFO PIN=14\tName=Sneha Iyer\tPri=0');
  assert.equal(admsCommandLine({ cmdNo: 8, kind: 'REMOVE_USER', pin: '14', name: null }, now, 330), 'C:8:DATA DELETE USERINFO PIN=14');
  assert.equal(zkDeviceTime('2026-10-29 08:15:30'), 862_215_330);
  assert.equal(admsCommandLine({ cmdNo: 9, kind: 'SET_CLOCK', pin: null, name: null }, now, 330), 'C:9:SET OPTION DateTime=862215330');
  assert.equal(deviceUserName('  Rénuka  Pradhan-Mohapatra (Site Engineer) '), 'Renuka Pradhan-Mohapatra');
  assert.equal(deviceUserName('रमेश'), '');
  assert.equal(devicePinProblem('14'), null);
  assert.match(devicePinProblem('W7')!, /up to 9 digits/);
  assert.match(devicePinProblem('1234567890')!, /up to 9 digits/);
});

test("the device's answers: a line each, done at 0 and refused otherwise; lines that do not read are left out", () => {
  assert.deepEqual(parseAdmsReplies('ID=7&Return=0&CMD=DATA\nID=8&Return=-1&CMD=DATA\r\nnonsense\nID=x&Return=0\nID=9&Return=0&CMD=SET OPTION\n'), [
    { cmdNo: 7, code: 0, cmd: 'DATA' },
    { cmdNo: 8, code: -1, cmd: 'DATA' },
    { cmdNo: 9, code: 0, cmd: 'SET OPTION' },
  ]);
});

test('what a device is handed: queued oldest first, sent ones again after ten quiet minutes, given up after three tries', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const at = (min: number) => new Date(now.getTime() - min * 60_000);
  const rows = [
    { id: 'b', status: 'QUEUED' as const, attempts: 0, sentAt: null, createdAt: at(5) },
    { id: 'a', status: 'QUEUED' as const, attempts: 0, sentAt: null, createdAt: at(30) },
    { id: 'fresh', status: 'SENT' as const, attempts: 1, sentAt: at(3), createdAt: at(40) },
    { id: 'again', status: 'SENT' as const, attempts: 1, sentAt: at(12), createdAt: at(50) },
    { id: 'dead', status: 'SENT' as const, attempts: 3, sentAt: at(15), createdAt: at(60) },
  ];
  assert.deepEqual(commandsToSend(rows, now), { send: ['again', 'a', 'b'], giveUp: ['dead'] });
  const many = Array.from({ length: 14 }, (_, i) => ({ id: `q${i}`, status: 'QUEUED' as const, attempts: 0, sentAt: null, createdAt: at(100 - i) }));
  assert.equal(commandsToSend(many, now).send.length, 10);
});

test('where a user number stands: on the devices its last finished command added it to, waiting, or failed', () => {
  const c = (pin: string, deviceId: string, kind: string, status: string) => ({ pin, deviceId, kind, status });
  const state = userCommandState([
    c('14', 'gate', 'ADD_USER', 'DONE'),
    c('14', 'yard', 'ADD_USER', 'DONE'),
    c('14', 'yard', 'REMOVE_USER', 'DONE'),
    c('14', 'office', 'ADD_USER', 'FAILED'),
    c('22', 'gate', 'ADD_USER', 'QUEUED'),
    c('22', 'yard', 'ADD_USER', 'CANCELLED'),
  ]);
  assert.deepEqual(state.get('14'), { onDevices: 1, commandsWaiting: 0, commandsFailed: 1 });
  assert.deepEqual(state.get('22'), { onDevices: 0, commandsWaiting: 1, commandsFailed: 0 });
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
