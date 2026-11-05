/**
 * Correspondence's tests: letter numbers from a series' pattern and the financial year, the short prefix of a
 * project, which outward letters wait for their signatory, replies due, proof of delivery, templates, who keeps letters,
 * and the module's pages in the tree and the menu, with no database. CI runs it after the build:
 *
 *   node dist/scripts/correspondence-test.js
 */
import assert from 'node:assert/strict';
import {
  CONTRACTUAL_LETTER_CATEGORIES,
  DEPARTMENT_MODULES,
  LETTER_NUMBER_PATTERN,
  MASTER_LIST_DEFS,
  STANDARD_LETTER_TEMPLATES,
  actionOverdue,
  awaitingReply,
  canHeadLetters,
  canSignLetters,
  canViewLetters,
  contactLine,
  fillLetterTemplate,
  formatLetterNo,
  letterFy,
  letterApprovalStage,
  letterGate,
  letterSignOff,
  letterStatusLabel,
  readLetterGates,
  NO_LETTER_CATEGORY,
  letterNeedsApproval,
  letterNeedsSeal,
  letterRulesProblem,
  maySealLetters,
  letterPatternProblem,
  letterPrefixOf,
  letterPrefixProblem,
  navNode,
  navSidebar,
  proofMissing,
  replyOverdue,
  type LetterApprovalRule,
  type LetterFacts,
  type LetterRules,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const rules = (approval: LetterApprovalRule, seal: LetterApprovalRule = 'NONE', gates: LetterRules['gates'] = {}): LetterRules => ({ approval, seal, gates });
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const facts = (f: Partial<LetterFacts>): LetterFacts => ({ direction: 'IN', status: 'OPEN', replyBy: null, replied: false, category: null, dispatchedOn: null, deliveredOn: null, actionDue: null, markedToId: null, ...f });

test('a number is the prefix, direction, financial year and running number: P07/OUT/26-27/042', () => {
  assert.equal(formatLetterNo(LETTER_NUMBER_PATTERN, { prefix: 'P07', direction: 'OUT', date: '2026-10-28', n: 42 }), 'P07/OUT/26-27/042');
  assert.equal(formatLetterNo(LETTER_NUMBER_PATTERN, { prefix: 'HO', direction: 'IN', date: '2027-01-05', n: 15 }), 'HO/IN/26-27/015');
  assert.equal(formatLetterNo('{PREFIX}-{DIR}-{YYYY}-{NNNN}', { prefix: 'RD01', direction: 'IN', date: '2027-03-31', n: 7 }), 'RD01-IN-2026-0007');
  assert.equal(formatLetterNo('{PREFIX}/{DIR}/{FY}/{N}', { prefix: 'X', direction: 'OUT', date: '2026-04-01', n: 1234 }), 'X/OUT/26-27/1234', 'a number longer than its padding is written whole');
});

test('the financial year turns on 1 April', () => {
  assert.equal(letterFy('2026-03-31'), '25-26');
  assert.equal(letterFy('2026-04-01'), '26-27');
  assert.equal(letterFy('2099-12-31'), '99-00');
});

test("a project's prefix is short: RD-2026-01 is RD01, any other code keeps its own letters", () => {
  assert.equal(letterPrefixOf('RD-2026-01'), 'RD01');
  assert.equal(letterPrefixOf('ws-2026-3'), 'WS03');
  assert.equal(letterPrefixOf('P07'), 'P07');
  assert.equal(letterPrefixOf('Ring Road/II'), 'RingRoadII');
  assert.equal(letterPrefixOf('///'), 'P');
});

test('a pattern needs the running number, the year and the direction, and only known parts', () => {
  assert.equal(letterPatternProblem(LETTER_NUMBER_PATTERN), null);
  assert.match(letterPatternProblem('{PREFIX}/{DIR}/{FY}')!, /running number/);
  assert.match(letterPatternProblem('{PREFIX}/{DIR}/{NNN}')!, /year/);
  assert.match(letterPatternProblem('{PREFIX}/{FY}/{NNN}')!, /\{DIR\}/);
  assert.match(letterPatternProblem('{PROJECT}/{DIR}/{FY}/{NNN}')!, /\{PROJECT\} is not/);
  assert.match(letterPatternProblem('  ')!, /Enter the pattern/);
  assert.equal(letterPrefixProblem('RD01'), null);
  assert.match(letterPrefixProblem('RD 01')!, /letters, digits/);
});

test('approval before numbering: every letter, only contractual ones (the default), or none', () => {
  for (const c of CONTRACTUAL_LETTER_CATEGORIES) assert.equal(letterNeedsApproval(rules('CONTRACTUAL'), c), true, c);
  assert.equal(letterNeedsApproval(rules('CONTRACTUAL'), 'general'), false);
  assert.equal(letterNeedsApproval(rules('CONTRACTUAL'), null), false);
  assert.equal(letterNeedsApproval(rules('ALL'), null), true);
  assert.equal(letterNeedsApproval(rules('NONE'), 'notice'), false);
  const standard = new Set(MASTER_LIST_DEFS.letterCategory.standard.map((e) => e.code));
  for (const c of CONTRACTUAL_LETTER_CATEGORIES) assert.ok(standard.has(c), `${c} is a standard letter category`);
});

test('replies due: ours to an open letter received, theirs to one of ours issued; none once replied', () => {
  const today = '2026-10-28';
  assert.equal(awaitingReply(facts({ replyBy: '2026-10-30' })), true);
  assert.equal(replyOverdue(facts({ replyBy: '2026-10-27' }), today), true);
  assert.equal(replyOverdue(facts({ replyBy: '2026-10-28' }), today), false, 'due today is not yet late');
  assert.equal(awaitingReply(facts({ replyBy: '2026-10-30', replied: true })), false);
  assert.equal(awaitingReply(facts({ replyBy: '2026-10-30', status: 'CLOSED' })), false);
  assert.equal(awaitingReply(facts({ direction: 'OUT', status: 'ISSUED', replyBy: '2026-10-30' })), true);
  assert.equal(awaitingReply(facts({ direction: 'OUT', status: 'DRAFT', replyBy: '2026-10-30' })), false, 'a draft has not gone');
});

test('a contractual letter issued with no delivery date is at risk; a general one or a delivered one is not', () => {
  assert.equal(proofMissing(facts({ direction: 'OUT', status: 'ISSUED', category: 'notice' })), true);
  assert.equal(proofMissing(facts({ direction: 'OUT', status: 'ISSUED', category: 'notice', deliveredOn: '2026-10-20' })), false);
  assert.equal(proofMissing(facts({ direction: 'OUT', status: 'ISSUED', category: 'general' })), false);
  assert.equal(proofMissing(facts({ direction: 'OUT', status: 'AWAITING_APPROVAL', category: 'claim' })), false);
});

test('an action is late once its date has passed while the letter is open', () => {
  assert.equal(actionOverdue(facts({ markedToId: 'u', actionDue: '2026-10-27' }), '2026-10-28'), true);
  assert.equal(actionOverdue(facts({ markedToId: 'u', actionDue: '2026-10-27', status: 'CLOSED' }), '2026-10-28'), false);
  assert.equal(actionOverdue(facts({ markedToId: null, actionDue: '2026-10-27' }), '2026-10-28'), false);
});

test('a template fills what is known and leaves the rest for the writer', () => {
  const t = fillLetterTemplate('Ref. your letter {theirRef} dated {theirDate} on {subject} for {project}.', { theirRef: 'EE/412', theirDate: '14 Oct 2026', subject: 'GSB trial', project: '' });
  assert.equal(t, 'Ref. your letter EE/412 dated 14 Oct 2026 on GSB trial for {project}.');
  assert.ok(STANDARD_LETTER_TEMPLATES.length >= 3);
  for (const s of STANDARD_LETTER_TEMPLATES) assert.ok(MASTER_LIST_DEFS.letterCategory.standard.some((e) => e.code === s.category), s.name);
  assert.equal(contactLine({ name: 'The Executive Engineer', office: 'R&B Division', organisation: null }), 'The Executive Engineer, R&B Division');
});

test('who keeps letters: the document controller heads them, project managers sign, site engineers neither', () => {
  assert.ok(canHeadLetters('DOCUMENT_CONTROLLER') && canViewLetters('DOCUMENT_CONTROLLER') && !canSignLetters('DOCUMENT_CONTROLLER'));
  assert.ok(canSignLetters('PROJECT_MANAGER') && canViewLetters('PROJECT_MANAGER') && !canHeadLetters('PROJECT_MANAGER'));
  assert.ok(!canViewLetters('SITE_ENGINEER') && !canSignLetters('SITE_ENGINEER'));
  assert.ok(canHeadLetters('MANAGEMENT') && canSignLetters('MANAGEMENT'));
});

test('the module: registers and masters in the tree, in the department menu, and in the sidebar of whoever keeps letters', () => {
  for (const id of ['documents.letters', 'correspondence.outward', 'correspondence.approvals', 'correspondence.contacts', 'correspondence.numbering', 'correspondence.templates', 'correspondence.categories', 'correspondence.partyKinds']) assert.equal(navNode(id)?.parent, 'correspondence', id);
  assert.equal(navNode('documents.letters')?.route, '/correspondence', 'the old Letters node keeps its id (pins) and opens the inward register');
  assert.equal(navNode(MASTER_LIST_DEFS.letterCategory.node)?.route, '/masters/letter-category');
  assert.equal(navNode(MASTER_LIST_DEFS.letterParty.node)?.route, '/masters/letter-party');
  assert.equal(navNode('correspondence.approvals')?.route, '/correspondence/outward?status=AWAITING_APPROVAL', 'the desk is the outward register at the letters waiting for approval');
  const dept = DEPARTMENT_MODULES.find((m) => m.key === 'correspondence')!;
  assert.deepEqual(dept.subs.map((s) => s.key), ['inward', 'outward', 'approvals', 'masters']);
  const hrefs = (roleKey: 'DOCUMENT_CONTROLLER' | 'SITE_ENGINEER' | 'PROJECT_MANAGER') => navSidebar({ roleKey }).flatMap((s) => s.links.map((l) => l.href));
  assert.ok(hrefs('DOCUMENT_CONTROLLER').includes('/correspondence/numbering'));
  assert.ok(hrefs('PROJECT_MANAGER').includes('/correspondence/outward') && !hrefs('PROJECT_MANAGER').includes('/correspondence/numbering'));
  assert.ok(!hrefs('SITE_ENGINEER').some((h) => h.startsWith('/correspondence')));
});

test('the seal at head office: after a signature that is not a director\'s, for the categories its rule names', () => {
  assert.equal(letterNeedsSeal(rules('ALL', 'CONTRACTUAL'), 'claim', 'PROJECT_MANAGER'), true, 'a claim signed by the PM waits for head office');
  assert.equal(letterNeedsSeal(rules('ALL', 'CONTRACTUAL'), 'general', 'PROJECT_MANAGER'), false, 'a general letter is numbered when signed');
  assert.equal(letterNeedsSeal(rules('ALL', 'ALL'), 'general', 'PROJECT_MANAGER'), true);
  assert.equal(letterNeedsSeal(rules('ALL', 'ALL'), 'claim', 'MANAGEMENT'), false, 'a director signing has sealed it already');
  assert.equal(letterNeedsSeal(rules('ALL', 'NONE'), 'claim', 'PROJECT_MANAGER'), false);
  assert.ok(maySealLetters('ADMIN') && maySealLetters('MANAGEMENT') && !maySealLetters('PROJECT_MANAGER') && !maySealLetters('DOCUMENT_CONTROLLER'));
});

test('the seal never reaches a letter the signature does not', () => {
  assert.equal(letterRulesProblem('CONTRACTUAL', 'CONTRACTUAL'), null);
  assert.equal(letterRulesProblem('ALL', 'CONTRACTUAL'), null);
  assert.equal(letterRulesProblem('ALL', 'NONE'), null);
  assert.match(letterRulesProblem('CONTRACTUAL', 'ALL')!, /signed first/);
  assert.match(letterRulesProblem('NONE', 'CONTRACTUAL')!, /signature first/);
});

test('each category passes its own gate; one the company has not set follows the two rules it started with', () => {
  const r = rules('CONTRACTUAL', 'NONE', { 'bill-and-payment': 'SIGN', notice: 'SEAL', claim: 'NONE', [NO_LETTER_CATEGORY]: 'SIGN' });
  assert.equal(letterGate(r, 'notice'), 'SEAL');
  assert.equal(letterGate(r, 'bill-and-payment'), 'SIGN', 'a general category the company asks to be signed');
  assert.equal(letterGate(r, 'claim'), 'NONE', 'a contractual category the company numbers when saved');
  assert.equal(letterGate(r, 'hindrance'), 'SIGN', 'not set: contractual, so signed under the default rule');
  assert.equal(letterGate(r, 'general'), 'NONE');
  assert.equal(letterGate(r, null), 'SIGN', 'letters with no category keep a gate of their own');
  assert.equal(letterGate(rules('ALL', 'CONTRACTUAL'), 'notice'), 'SEAL', 'the rules alone give the same answers as before');
  assert.equal(letterGate(rules('ALL', 'CONTRACTUAL'), 'general'), 'SIGN');
  assert.equal(letterNeedsApproval(r, 'claim'), false);
  assert.equal(letterNeedsSeal(r, 'notice', 'PROJECT_MANAGER'), true);
  assert.equal(letterNeedsSeal(r, 'notice', 'ADMIN'), false, "a director's signature is the seal");
  assert.equal(letterNeedsSeal(r, 'bill-and-payment', 'PROJECT_MANAGER'), false, 'signed is enough');
  assert.deepEqual(readLetterGates({ notice: 'SEAL', claim: 'MAYBE', general: 3 }), { notice: 'SEAL' }, 'anything that is not a gate is dropped');
  assert.deepEqual(readLetterGates(null), {});
  assert.deepEqual(readLetterGates(['SEAL']), {});
});

test('the outward register shows where the signature and the seal stand', () => {
  const at = '2026-10-30T10:00:00Z';
  assert.deepEqual(letterSignOff({ status: 'DRAFT', gate: 'SEAL', signedAt: null, signatoryId: null }), { sign: 'LATER', seal: 'LATER' });
  assert.deepEqual(letterSignOff({ status: 'DRAFT', gate: 'NONE', signedAt: null, signatoryId: null }), { sign: 'NOT_NEEDED', seal: 'NOT_NEEDED' });
  assert.deepEqual(letterSignOff({ status: 'AWAITING_APPROVAL', gate: 'SEAL', signedAt: null, signatoryId: 'pm' }), { sign: 'WAITING', seal: 'LATER' });
  assert.deepEqual(letterSignOff({ status: 'AWAITING_APPROVAL', gate: 'SIGN', signedAt: null, signatoryId: 'pm' }), { sign: 'WAITING', seal: 'NOT_NEEDED' });
  assert.deepEqual(letterSignOff({ status: 'AWAITING_APPROVAL', gate: 'SEAL', signedAt: at, signatoryId: 'pm' }), { sign: 'DONE', seal: 'WAITING' });
  assert.deepEqual(letterSignOff({ status: 'ISSUED', gate: 'SEAL', signedAt: at, signatoryId: 'pm' }), { sign: 'DONE', seal: 'DONE' });
  assert.deepEqual(letterSignOff({ status: 'ISSUED', gate: 'SEAL', signedAt: null, signatoryId: 'md' }), { sign: 'DONE', seal: 'NOT_NEEDED' }, "a director signed: the signature was the seal");
  assert.deepEqual(letterSignOff({ status: 'ISSUED', gate: 'NONE', signedAt: null, signatoryId: null }), { sign: 'NOT_NEEDED', seal: 'NOT_NEEDED' });
  assert.equal(letterStatusLabel({ status: 'AWAITING_APPROVAL', signedAt: null }), 'Waiting for signature');
  assert.equal(letterStatusLabel({ status: 'AWAITING_APPROVAL', signedAt: at }), 'Waiting for the seal');
  assert.equal(letterStatusLabel({ status: 'ISSUED', signedAt: at }), 'Issued');
});

test('where a letter waiting for approval stands', () => {
  assert.equal(letterApprovalStage({ status: 'AWAITING_APPROVAL', signedAt: null }), 'SIGN');
  assert.equal(letterApprovalStage({ status: 'AWAITING_APPROVAL', signedAt: '2026-10-30T10:00:00Z' }), 'SEAL');
  assert.equal(letterApprovalStage({ status: 'ISSUED', signedAt: '2026-10-30T10:00:00Z' }), null);
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
