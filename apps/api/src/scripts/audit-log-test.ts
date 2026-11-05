/** The audit log's words: a kind reads in words, from its own, the submission labels, or its key. */
import assert from 'node:assert/strict';
import { auditActionLabel, auditKindLabel, canViewAuditLog } from '@erp/shared';

const cases: [string, () => void][] = [
  ['a submission kind reads its own label', () => assert.equal(auditKindLabel('MATERIAL_REQUEST'), 'Indent')],
  ['a kind with words of its own uses them', () => assert.equal(auditKindLabel('SC_ENQUIRY'), 'Subcontract enquiry')],
  ['any other key reads as words', () => {
    assert.equal(auditKindLabel('WORK_PERMIT'), 'Work permit');
    assert.equal(auditKindLabel('RFI'), 'RFI');
    assert.equal(auditActionLabel('BOQ_IMPORTED'), 'BOQ imported');
  }],
  ['only an admin reads it', () => {
    assert.equal(canViewAuditLog('ADMIN'), true);
    assert.equal(canViewAuditLog('MANAGEMENT'), false);
    assert.equal(canViewAuditLog('PROJECT_MANAGER'), false);
  }],
];

let failed = 0;
for (const [name, run] of cases) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
