/**
 * QA/QC's registers (item 137 part 2): a lab's accreditation, samples waiting at a lab, where an instrument stands in the
 * calibration register, whether a test used one out of calibration, and which receipts need the maker's test
 * certificate, with no database. CI runs it after the build:
 *
 *   node dist/scripts/qa-registers-test.js
 */
import assert from 'node:assert/strict';
import {
  MASTER_LIST_DEFS,
  STANDARD_CALIBRATION_DAYS,
  STANDARD_MTC_CATEGORIES,
  accreditationState,
  calibrationDaysFor,
  calibrationProblem,
  calibrationState,
  certificateNeeded,
  labProblem,
  masterCode,
  navNode,
  nextCalibration,
  reportWait,
  sampleState,
  testedOutOfCalibration,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('an NABL lab needs its certificate number and validity; other labs do not', () => {
  assert.equal(labProblem({ name: 'Site lab', kind: 'SITE' }), null);
  assert.match(labProblem({ name: ' ', kind: 'OUTSIDE' })!, /name/);
  assert.match(labProblem({ name: 'Kalinga Testing', kind: 'NABL' })!, /certificate number/);
  assert.match(labProblem({ name: 'Kalinga Testing', kind: 'NABL', nablNo: '5678' })!, /looks like/);
  assert.match(labProblem({ name: 'Kalinga Testing', kind: 'NABL', nablNo: 'TC-5678' })!, /valid till/);
  assert.equal(labProblem({ name: 'Kalinga Testing', kind: 'NABL', nablNo: 'TC-5678', nablValidTill: '2027-06-30' }), null);
});

test('an accreditation is expiring in its last 30 days and expired after', () => {
  const lab = (nablValidTill: string | null) => ({ kind: 'NABL' as const, nablValidTill });
  assert.equal(accreditationState(lab('2027-06-30'), '2026-10-28'), 'VALID');
  assert.equal(accreditationState(lab('2026-11-20'), '2026-10-28'), 'EXPIRING');
  assert.equal(accreditationState(lab('2026-10-27'), '2026-10-28'), 'EXPIRED');
  assert.equal(accreditationState({ kind: 'SITE', nablValidTill: '2020-01-01' }, '2026-10-28'), 'NONE');
});

test('a sample at the lab is late 10 days after it was sent, or after its last reading falls due', () => {
  const t = { labId: 'L', sentOn: '2026-10-01', reportOn: null };
  assert.equal(sampleState(t), 'AT_LAB');
  assert.equal(sampleState({ ...t, reportOn: '2026-10-05' }), 'REPORTED');
  assert.equal(sampleState({ labId: null, sentOn: null, reportOn: null }), 'NOT_SENT');
  assert.deepEqual(reportWait(t, '2026-10-08'), { days: 7, late: false });
  assert.deepEqual(reportWait(t, '2026-10-12'), { days: 11, late: true });
  // 28-day cubes sent on the day they were cast are not late before their reading is due.
  assert.deepEqual(reportWait({ ...t, lastDueOn: '2026-10-29' }, '2026-10-30'), { days: 29, late: false });
  assert.equal(reportWait({ ...t, reportOn: '2026-10-05' }, '2026-10-30'), null);
});

test('an instrument is due soon in its last 15 days, overdue after, and out of use once it fails', () => {
  const i = { lastCalibratedOn: '2025-11-10', nextDueOn: null, intervalDays: 365, lastResult: 'OK' as const, active: true };
  assert.equal(nextCalibration(i), '2026-11-10');
  assert.deepEqual(calibrationState(i, '2026-10-01'), { state: 'OK', dueOn: '2026-11-10', daysLeft: 40 });
  assert.equal(calibrationState(i, '2026-10-28').state, 'DUE_SOON');
  assert.equal(calibrationState(i, '2026-11-11').state, 'OVERDUE');
  assert.equal(calibrationState({ ...i, nextDueOn: '2027-01-31' }, '2026-11-11').state, 'OK', 'the certificate’s own due day wins');
  assert.equal(calibrationState({ ...i, lastResult: 'FAILED' }, '2026-10-01').state, 'OUT_OF_USE');
  assert.equal(calibrationState({ ...i, active: false }, '2026-10-01').state, 'OUT_OF_USE');
  assert.equal(calibrationState({ ...i, lastCalibratedOn: null }, '2026-10-01').state, 'NEVER');
});

test('a test on an instrument past its due day, never calibrated or failed is flagged', () => {
  const i = { lastCalibratedOn: '2025-11-10', nextDueOn: '2026-11-10', intervalDays: 365, lastResult: 'OK' as const };
  assert.equal(testedOutOfCalibration(i, '2026-06-01'), false);
  assert.equal(testedOutOfCalibration(i, '2026-11-11'), true);
  assert.equal(testedOutOfCalibration({ ...i, lastCalibratedOn: null, nextDueOn: null }, '2026-06-01'), true);
  assert.equal(testedOutOfCalibration({ ...i, lastResult: 'FAILED' }, '2026-06-01'), true);
  assert.equal(testedOutOfCalibration({ ...i, lastResult: 'FAILED' }, '2025-10-01'), false, 'before its last calibration the register cannot tell');
});

test('a calibration needs its certificate, is not dated ahead and falls due after it', () => {
  assert.equal(calibrationProblem({ calibratedOn: '2026-10-20', certificateNo: 'CAL/1', result: 'OK' }, '2026-10-28'), null);
  assert.match(calibrationProblem({ calibratedOn: '2026-10-29', certificateNo: 'CAL/1', result: 'OK' }, '2026-10-28')!, /after today/);
  assert.match(calibrationProblem({ calibratedOn: '2026-10-20', result: 'ADJUSTED' }, '2026-10-28')!, /certificate/);
  assert.equal(calibrationProblem({ calibratedOn: '2026-10-20', result: 'FAILED' }, '2026-10-28'), null);
  assert.match(calibrationProblem({ calibratedOn: '2026-10-20', nextDueOn: '2026-10-20', certificateNo: 'CAL/1', result: 'OK' }, '2026-10-28')!, /after the calibration/);
});

test('every standard instrument kind has an interval, and the batching plant is checked twice a year', () => {
  for (const e of MASTER_LIST_DEFS.instrumentKind.standard) assert.ok(STANDARD_CALIBRATION_DAYS[e.code], e.code);
  assert.equal(calibrationDaysFor('batching-plant'), 180);
  assert.equal(calibrationDaysFor('our-own-kind'), 365);
});

test('steel, cement and pipes need the maker’s certificate by name or code; sand does not', () => {
  for (const c of STANDARD_MTC_CATEGORIES) assert.ok(MASTER_LIST_DEFS.itemCategory.standard.some((e) => e.code === c), c);
  assert.equal(certificateNeeded(['Steel'], STANDARD_MTC_CATEGORIES), true);
  assert.equal(certificateNeeded(['Pipes and fittings'], STANDARD_MTC_CATEGORIES), true);
  assert.equal(certificateNeeded(['Aggregate and sand', null], STANDARD_MTC_CATEGORIES), false);
  assert.equal(certificateNeeded(['Cement'], []), false);
  assert.equal(masterCode('Pipes and fittings'), 'pipes-and-fittings');
});

test('the new lists each open from a node of the tree', () => {
  for (const k of ['ncrCategory', 'ncrRootCause', 'instrumentKind'] as const) {
    const def = MASTER_LIST_DEFS[k];
    assert.equal(navNode(def.node)?.route, `/masters/${def.slug}`, k);
    assert.equal(new Set(def.standard.map((e) => e.code)).size, def.standard.length, `${k}: codes are unique`);
  }
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
