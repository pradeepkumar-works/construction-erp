/**
 * Tests for the status meaning map (ARCHITECTURE "Status colour"): every status the web shows has one meaning, and a word
 * means the same on every kind of record. Pure, so it needs no database:
 *
 *   node dist/scripts/status-tone-test.js
 */
import assert from 'node:assert/strict';
import {
  ACCESS_REQUEST_STATUSES,
  AGENT_STATES,
  APPROVAL_CODES,
  BILL_STAGES,
  BIOMETRIC_COMMAND_STATUSES,
  BIOMETRIC_PUNCH_RESULTS,
  BOOK_VOUCHER_STATUSES,
  CALIBRATION_RESULTS,
  COMPLIANCE_DOC_STATUSES,
  CONNECTION_HEALTHS,
  DEFECT_STATUSES,
  DELIVERABLE_STATUSES,
  DESIGN_SUBMISSION_STATUSES,
  EMI_STAGES,
  EOT_STATES,
  EQUIPMENT_LOAN_STATUSES,
  FRONT_FLAGS,
  GRN_QC_STATUSES,
  IMPREST_ENTRY_STATUSES,
  INBOUND_STATES,
  INSPECTION_RESULTS,
  INTEGRATION_EVENT_STATUSES,
  KIT_STATUSES,
  LEAVE_STATUSES,
  LETTER_STATUSES,
  MAINTENANCE_STATUSES,
  MATCH_STATES,
  MATERIAL_APPROVAL_STATUSES,
  MATERIAL_REVIEW_OUTCOMES,
  MEETING_ACTION_STATUSES,
  MEETING_STATUSES,
  MIX_DESIGN_STATUSES,
  NCR_STATUSES,
  OBLIGATION_STATES,
  ORDER_STAGES,
  OUTBOUND_MESSAGE_STATUSES,
  OVERTIME_STATUSES,
  PAID_STATES,
  PAYROLL_RUN_STATUSES,
  PIPELINE_STAGES,
  PIPELINE_KEYS,
  PO_RECEIPT_STATES,
  POUR_STATUSES,
  PPE_ISSUE_STATUSES,
  PROGRAMME_STATUSES,
  PROGRAMME_WATCH_STATES,
  PROJECT_STATUSES,
  RECON_EXCEPTION_KINDS,
  RECONCILIATION_STATUSES,
  REVISION_STATUSES,
  RFI_STATUSES,
  RISK_STATUSES,
  RMC_BATCH_STATUSES,
  RMC_INVOICE_STATUSES,
  RMC_ORDER_STATUSES,
  SAFETY_INCIDENT_STATUSES,
  SC_ENQUIRY_STATUSES,
  SETTLEMENT_STATUSES,
  SITE_ORDER_STATES,
  STAFF_ATTENDANCE_STATUSES,
  STATUS_MEANINGS,
  STATUS_TONES,
  SUBMISSION_STATUSES,
  SUPPLIER_CHANGE_STATUSES,
  SUPPLIER_INVOICE_STAGES,
  TENDER_STATUSES,
  TEST_RESULTS,
  VARIATION_STATUSES,
  WORK_PERMIT_STATUSES,
  statusTone,
  type StatusKind,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

/** Every value of every kind, from the enum's own list where it has one. */
const VALUES: Record<StatusKind, readonly string[]> = {
  submission: SUBMISSION_STATUSES,
  project: PROJECT_STATUSES,
  tender: TENDER_STATUSES,
  billStage: BILL_STAGES,
  paid: PAID_STATES,
  match: MATCH_STATES,
  poReceipt: PO_RECEIPT_STATES,
  delivery: ['NOT_STARTED', 'PARTLY_RECEIVED', 'RECEIVED', 'CLOSED'],
  orderStage: ORDER_STAGES,
  pipelineStage: [...new Set(PIPELINE_KEYS.flatMap((k) => PIPELINE_STAGES[k].map((s) => s.key)))],
  enquiryVendor: ['SENT', 'NOT_SENT', 'OPENED', 'QUOTED', 'EXPIRED'],
  scEnquiry: SC_ENQUIRY_STATUSES,
  grnQc: GRN_QC_STATUSES,
  supplierInvoice: SUPPLIER_INVOICE_STAGES,
  supplierDispatch: ['ON_THE_WAY', 'RECEIVED', 'CANCELLED'],
  supplierChange: SUPPLIER_CHANGE_STATUSES,
  variation: VARIATION_STATUSES,
  bookVoucher: BOOK_VOUCHER_STATUSES,
  imprestEntry: IMPREST_ENTRY_STATUSES,
  payrollRun: PAYROLL_RUN_STATUSES,
  settlement: SETTLEMENT_STATUSES,
  emi: EMI_STAGES,
  equipmentLoan: EQUIPMENT_LOAN_STATUSES,
  billing: ['TRIAL', 'ACTIVE', 'READ_ONLY', 'EXEMPT'],
  accessRequest: ACCESS_REQUEST_STATUSES,
  risk: RISK_STATUSES,
  ncr: NCR_STATUSES,
  defect: DEFECT_STATUSES,
  finding: ['OPEN', 'NCR', 'CLOSED'],
  rfi: RFI_STATUSES,
  meetingAction: MEETING_ACTION_STATUSES,
  meeting: MEETING_STATUSES,
  siteOrder: SITE_ORDER_STATES,
  letter: LETTER_STATUSES,
  maintenance: MAINTENANCE_STATUSES,
  safetyIncident: SAFETY_INCIDENT_STATUSES,
  workPermit: WORK_PERMIT_STATUSES,
  ppeIssue: PPE_ISSUE_STATUSES,
  complianceDoc: COMPLIANCE_DOC_STATUSES,
  testResult: TEST_RESULTS,
  inspectionResult: INSPECTION_RESULTS,
  pour: POUR_STATUSES,
  accreditation: ['VALID', 'EXPIRING', 'EXPIRED', 'NONE'],
  calibration: ['OK', 'DUE_SOON', 'OVERDUE', 'NEVER', 'OUT_OF_USE'],
  calibrationResult: CALIBRATION_RESULTS,
  checkOutcome: ['AGREED', 'LESS', 'MORE'],
  materialApproval: MATERIAL_APPROVAL_STATUSES,
  materialReview: MATERIAL_REVIEW_OUTCOMES,
  designSubmission: DESIGN_SUBMISSION_STATUSES,
  designCode: APPROVAL_CODES,
  designComment: ['OPEN', 'ANSWERED', 'CLOSED'],
  deliverable: DELIVERABLE_STATUSES,
  drawingNeed: ['AWAITED', 'RECEIVED', 'GFC', 'DROPPED'],
  revision: REVISION_STATUSES,
  controlledCopy: ['IN_FORCE', 'TO_RECALL', 'CLOSED'],
  impact: ['danger', 'warning', 'info'],
  schedule: ['UNSCHEDULED', 'NOT_STARTED', 'ON_TRACK', 'BEHIND', 'LATE', 'DONE'],
  milestone: ['UPCOMING', 'DUE_SOON', 'MISSED', 'ACHIEVED', 'ACHIEVED_LATE'],
  lookahead: ['IN_PROGRESS', 'READY', 'WAITING'],
  programme: PROGRAMME_STATUSES,
  programmeWatch: PROGRAMME_WATCH_STATES,
  eot: EOT_STATES,
  obligation: OBLIGATION_STATES,
  service: ['NOT_SET', 'OK', 'DUE_SOON', 'OVERDUE'],
  expiry: ['VALID', 'EXPIRING', 'EXPIRED'],
  reconciliation: RECONCILIATION_STATUSES,
  kit: KIT_STATUSES,
  reconException: RECON_EXCEPTION_KINDS,
  frontFlag: FRONT_FLAGS,
  omPeriod: ['FUTURE', 'RUNNING', 'DUE', 'BILLED'],
  omChemical: ['OVER', 'UNDER', 'WITHIN', 'NO_WATER'],
  rmcOrder: RMC_ORDER_STATUSES,
  rmcBatch: RMC_BATCH_STATUSES,
  rmcInvoice: RMC_INVOICE_STATUSES,
  mixDesign: MIX_DESIGN_STATUSES,
  leave: LEAVE_STATUSES,
  overtime: OVERTIME_STATUSES,
  staffAttendance: STAFF_ATTENDANCE_STATUSES,
  biometricCommand: BIOMETRIC_COMMAND_STATUSES,
  biometricPunch: BIOMETRIC_PUNCH_RESULTS,
  agent: AGENT_STATES,
  connectionHealth: CONNECTION_HEALTHS,
  integrationEvent: INTEGRATION_EVENT_STATUSES,
  outboundMessage: OUTBOUND_MESSAGE_STATUSES,
  inbound: INBOUND_STATES,
  typeImport: ['CREATE', 'REPLACE', 'SAME', 'REFUSED'],
  health: ['good', 'watch', 'act'],
  signal: ['success', 'warning', 'error', 'default'],
};

const kinds = Object.keys(STATUS_TONES) as StatusKind[];
const tone = (kind: StatusKind, status: string) => statusTone(kind, status as never);

test('every value of every kind has a meaning, and the map holds nothing else', () => {
  for (const kind of kinds) {
    const held = Object.keys(STATUS_TONES[kind]).sort();
    assert.deepEqual(held, [...VALUES[kind]].sort(), `${kind} has a meaning for exactly its values`);
    for (const v of VALUES[kind]) assert.ok(STATUS_MEANINGS.includes(tone(kind, v)), `${kind}.${v} has one of the five meanings`);
  }
});

test('"Open" means the same on every register that has it', () => {
  const open = kinds.filter((k) => 'OPEN' in STATUS_TONES[k]);
  for (const k of ['risk', 'ncr', 'defect', 'finding', 'rfi', 'meetingAction', 'siteOrder', 'letter', 'designComment'] as const) {
    assert.ok(open.includes(k), `${k} has an Open status`);
  }
  for (const k of open) assert.equal(tone(k, 'OPEN'), 'waiting', `an open ${k} waits on someone`);
});

test('the same word means the same thing on every kind', () => {
  const quiet = ['done', 'closed'];
  for (const k of kinds) {
    const map = STATUS_TONES[k] as Record<string, string>;
    if (map.REJECTED) assert.equal(map.REJECTED, 'failed', `a rejected ${k} failed`);
    if (map.OVERDUE) assert.equal(map.OVERDUE, 'failed', `an overdue ${k} failed`);
    if (map.SUBMITTED) assert.equal(map.SUBMITTED, 'waiting', `a submitted ${k} waits for a decision`);
    if (map.DUE_SOON) assert.equal(map.DUE_SOON, 'waiting', `a ${k} due soon waits on someone`);
    if (map.DRAFT) assert.equal(map.DRAFT, 'inHand', `a ${k} draft is in hand`);
    if (map.APPROVED) assert.ok(quiet.includes(map.APPROVED), `an approved ${k} is quiet`);
    if (map.PAID) assert.equal(map.PAID, 'done', `a paid ${k} is done`);
    if (map.CANCELLED) assert.equal(map.CANCELLED, 'closed', `a cancelled ${k} is closed`);
    if (map.WITHDRAWN) assert.equal(map.WITHDRAWN, 'closed', `a withdrawn ${k} is closed`);
    if (map.CLOSED) assert.equal(map.CLOSED, 'closed', `a closed ${k} is closed`);
  }
});

test('a list of approved work is quiet, and what waits or was sent back stands out', () => {
  assert.equal(statusTone('submission', 'APPROVED'), 'done');
  assert.equal(statusTone('submission', 'SUBMITTED'), 'waiting');
  assert.equal(statusTone('submission', 'CHANGES_REQUESTED'), 'failed');
  assert.equal(statusTone('project', 'ACTIVE'), 'done');
  assert.equal(statusTone('billStage', 'PAID'), 'done');
  assert.equal(statusTone('schedule', 'LATE'), 'failed', 'only an activity past its finish is red on the Gantt');
  assert.equal(statusTone('schedule', 'BEHIND'), 'waiting');
});

test('a status the map does not know yet reads as quiet, never as an alarm', () => {
  assert.equal(tone('risk', 'SOMETHING_NEW'), 'closed');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`Status meanings: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
