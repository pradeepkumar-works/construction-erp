/**
 * HR letter templates (ARCHITECTURE "HR records"): optional parts and paragraphs drop out when a field is empty, the
 * standard words print what the letters printed before, and a template with a field that does not exist is refused.
 * Run: npx tsx --tsconfig tsconfig.json src/scripts/hr-letters-test.ts
 */
import { fillLetter, hrLetterValues, letterTemplateProblem, STANDARD_HR_LETTERS, type EmployeeLetterDto } from '@erp/shared';

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function eq<T>(a: T, b: T) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} is not ${JSON.stringify(b)}`);
}

const letter = (over: Partial<EmployeeLetterDto['event']> = {}, emp: Partial<EmployeeLetterDto['employee']> = {}): EmployeeLetterDto =>
  ({
    event: { type: 'JOINED', effectiveDate: '2026-04-01', fromDesignation: null, toDesignation: 'Site engineer', fromDepartment: null, toDepartment: null, fromProjectName: null, toProjectName: 'Puri Highway', fromCtc: null, toCtc: '480000.00', noticeGivenOn: null, note: null, letterNo: 'HR-2026-0001', createdAt: '2026-04-01T05:00:00Z', ...over },
    company: { name: 'Demo Infra', address: null },
    employee: { fullName: 'Asha Rao', employeeCode: 'EMP-030', designation: 'Site engineer', department: 'Projects', address: null, fatherOrSpouseName: null, joinedOn: '2026-04-01', leftOn: null, postedAt: 'Puri Highway', probationEndsOn: null, noticeDays: 30, ...emp },
    signedBy: { name: 'Pooja Reddy', title: 'HR manager' },
    template: '',
    experienceTemplate: null,
  }) as unknown as EmployeeLetterDto;
const fmt = { date: (d: string) => d, money: (v: string) => `Rs ${Number(v)}` };

check('the standard appointment letter fills the facts and leaves out probation when there is none', () => {
  const paras = fillLetter(STANDARD_HR_LETTERS.JOINED, hrLetterValues(letter(), fmt));
  eq(paras[1], 'We are pleased to appoint you as Site engineer in Projects with Demo Infra, from 2026-04-01, posted at Puri Highway.');
  eq(paras.some((p) => p.includes('probation')), false);
  eq(paras.some((p) => p.includes("30 days' notice")), true);
  eq(paras.length, 5);
});

check('an optional part goes when its field is empty, the rest of the paragraph stays', () => {
  eq(fillLetter('We accept your resignation[ given on {noticeGivenOn}]. Last day {date}.', { noticeGivenOn: null, date: '3 Nov' }), ['We accept your resignation. Last day 3 Nov.']);
  eq(fillLetter('We accept your resignation[ given on {noticeGivenOn}].', { noticeGivenOn: '1 Oct' }), ['We accept your resignation given on 1 Oct.']);
});

check('a note paragraph prints only with a note', () => {
  eq(fillLetter('Dear {name},\n\n{note}\n\nRegards', { name: 'Asha', note: null }), ['Dear Asha,', 'Regards']);
  eq(fillLetter('Dear {name},\n\n{note}\n\nRegards', { name: 'Asha', note: 'Report by 9' }), ['Dear Asha,', 'Report by 9', 'Regards']);
});

check('a transfer names the new designation only when it changes', () => {
  const same = hrLetterValues(letter({ type: 'TRANSFERRED', fromProjectName: 'Cuttack', toProjectName: null, fromDesignation: 'Site engineer', toDesignation: 'Site engineer' }), fmt);
  eq(fillLetter(STANDARD_HR_LETTERS.TRANSFERRED, same)[1], 'You are transferred from Cuttack to head office from 2026-04-01. Please hand over your present work and report there on that day.');
});

check('every standard letter is a template the editor accepts', () => {
  for (const [kind, text] of Object.entries(STANDARD_HR_LETTERS)) if (letterTemplateProblem(text)) throw new Error(`${kind}: ${letterTemplateProblem(text)}`);
});

check('the editor refuses unknown fields, stray braces and brackets that do not close', () => {
  eq(letterTemplateProblem('Dear {fullname},'), 'There is no field {fullname}. Pick one from the list of fields.');
  eq(letterTemplateProblem('Dear {name,'), 'A field is written as a word in curly brackets, such as {name}');
  eq(letterTemplateProblem('Dear {name}[, of {department}'), 'Close the part in square brackets with ]');
  eq(letterTemplateProblem('a] b'), 'There is a ] with no [ before it');
  eq(letterTemplateProblem('  '), 'Write the letter, or use the standard one');
});

console.log(`\n${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
