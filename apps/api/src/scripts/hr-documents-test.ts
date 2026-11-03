/** Joining documents: the checklist, what is outstanding, and the letters that wait for it. Run: node dist/scripts/hr-documents-test.js */
import assert from 'node:assert/strict';
import { documentCheckProblem, documentChecklist, documentLetterProblem, documentsOutstanding, EMPLOYEE_DOCUMENT_KINDS, type DocumentFact, type EmployeeDocumentStatus } from '@erp/shared';

const REQUIRED = ['PHOTO', 'AADHAAR', 'PAN', 'SSC', 'INTER', 'DEGREE', 'EXPERIENCE'];
const all = (status: EmployeeDocumentStatus): DocumentFact[] => REQUIRED.map((kind) => ({ kind, status }));

const cases: [string, () => void][] = [
  ['the mockup list: seven required, the postgraduate degree and the bank proof optional', () => {
    const lines = documentChecklist([]);
    assert.equal(lines.length, EMPLOYEE_DOCUMENT_KINDS.length);
    assert.deepEqual(lines.filter((l) => l.required).map((l) => l.kind), REQUIRED);
    assert.ok(lines.every((l) => l.state === 'MISSING'));
  }],
  ['nothing filed: every required paper is outstanding', () => assert.deepEqual(documentsOutstanding([]), REQUIRED)],
  ['filed but not checked is still outstanding', () => assert.deepEqual(documentsOutstanding(all('UPLOADED')), REQUIRED)],
  ['all verified: nothing outstanding and the letters can go out', () => {
    assert.deepEqual(documentsOutstanding(all('VERIFIED')), []);
    assert.equal(documentLetterProblem('OFFERED', all('VERIFIED')), null);
    assert.equal(documentLetterProblem('JOINED', all('VERIFIED')), null);
  }],
  ['a fresher: experience set aside counts as done', () => {
    const docs = all('VERIFIED').map((d) => (d.kind === 'EXPERIENCE' ? { ...d, status: 'WAIVED' as const } : d));
    assert.deepEqual(documentsOutstanding(docs), []);
  }],
  ['a paper sent back holds the letters', () => {
    const docs = all('VERIFIED').map((d) => (d.kind === 'PAN' ? { ...d, status: 'REJECTED' as const } : d));
    assert.equal(documentLetterProblem('OFFERED', docs), "Verify PAN card before the offer letter. Open the person's Documents tab.");
  }],
  ['optional papers never hold a letter', () => assert.equal(documentLetterProblem('JOINED', all('VERIFIED')), null)],
  ['the appointment letter names itself and lists at most three papers', () => {
    assert.equal(documentLetterProblem('JOINED', []), "Verify Photo, Aadhaar, PAN card and 4 more before the appointment letter. Open the person's Documents tab.");
  }],
  ['other letters never wait for the papers', () => {
    for (const t of ['CONFIRMED', 'TRANSFERRED', 'PROMOTED', 'INCREMENT', 'WARNING', 'RESIGNED', 'TERMINATED', 'RETIRED'] as const) assert.equal(documentLetterProblem(t, []), null);
  }],
  ['verifying needs a file on record', () => {
    assert.match(documentCheckProblem('PAN', 'MISSING', 'VERIFIED', null)!, /Upload it first/);
    assert.match(documentCheckProblem('PAN', 'WAIVED', 'VERIFIED', null)!, /Upload it first/);
    assert.match(documentCheckProblem('PAN', 'VERIFIED', 'VERIFIED', null)!, /already verified/);
    assert.equal(documentCheckProblem('PAN', 'UPLOADED', 'VERIFIED', null), null);
    assert.equal(documentCheckProblem('PAN', 'REJECTED', 'VERIFIED', null), null);
  }],
  ['sending back and setting aside need a reason', () => {
    assert.match(documentCheckProblem('SSC', 'UPLOADED', 'REJECTED', '  ')!, /Say what is wrong/);
    assert.match(documentCheckProblem('EXPERIENCE', 'MISSING', 'WAIVED', undefined)!, /Say why/);
    assert.equal(documentCheckProblem('EXPERIENCE', 'MISSING', 'WAIVED', 'Fresher, first job'), null);
    assert.match(documentCheckProblem('SSC', 'MISSING', 'REJECTED', 'Blurred')!, /no Class 10/);
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
