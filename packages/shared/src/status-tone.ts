import type {
  AccessRequestStatus,
  BillStage,
  ComplianceDocStatus,
  DefectStatus,
  DeliverableStatus,
  GrnQcStatus,
  ImprestEntryStatus,
  MaintenanceStatus,
  PpeIssueStatus,
  ProgrammeStatus,
  ProjectStatus,
  RfiStatus,
  RiskStatus,
  SafetyIncidentStatus,
  SubmissionStatus,
  WorkPermitStatus,
} from './enums';
import type { BiometricCommandStatus, BiometricPunchResult } from './biometric';
import type { BookVoucherStatus } from './books';
import type { CheckOutcome, SiteOrderState } from './consultant-checks';
import type { ObligationState } from './contract-obligations';
import type { LetterStatus } from './correspondence';
import type { ComponentState } from './component-drawings';
import type { CopyState, ImpactTone } from './design-control';
import type { DesignCommentState, DesignSubmissionStatus } from './design-submissions';
import type { RevisionStatus } from './documents';
import type { DrawingNeedState } from './drawing-schedule';
import type { ApprovalCode } from './epc';
import type { AgentState, ConnectionHealth, IntegrationEventStatus } from './integrations';
import type { MatchState, PaidState, PoReceiptState } from './labels';
import type { EmiStage, EquipmentLoanStatus } from './loans';
import type { ExpiryState, ServiceState } from './maintenance';
import type { HealthLevel } from './management';
import type { MaterialApprovalStatus, MaterialReviewOutcome } from './material-approvals';
import type { MeetingActionStatus, MeetingStatus } from './meetings';
import type { OutboundMessageStatus } from './messaging';
import type { OmChemicalState, OmPeriodStatus } from './om';
import type { PayrollRunStatus, SettlementStatus } from './payroll';
import type { DeliveryState } from './procurement';
import type { EotState, ProgrammeWatchState } from './programme-eot';
import type { OrderStage } from './purchase-queue';
import type { FindingState } from './qa-audits';
import type { PourStatus } from './qa-plan';
import type { AccreditationState, CalibrationResult, CalibrationState } from './qa-registers';
import type { InspectionResult, NcrStatus, TestResult } from './quality';
import type { ReconciliationStatus } from './reconciliation';
import type { MixDesignStatus, RmcBatchStatus, RmcInvoiceStatus, RmcOrderStatus } from './rmc';
import type { LookaheadReadiness, MilestoneState, ScheduleReading, ScheduleState } from './schedule';
import type { EnquiryVendorState } from './small-purchase';
import type { LeaveStatus, OvertimeStatus, StaffAttendanceStatus } from './staff';
import type { EmployeeDocumentState } from './hr-documents';
import type { ClearanceState } from './exit-clearance';
import type { FrontFlag, KitStatus, ReconExceptionKind } from './stock-against-dpr';
import type { ScEnquiryStatus } from './subcontract-enquiries';
import type { SupplierChangeStatus, SupplierDispatchStatus, SupplierInvoiceStage } from './supplier';
import type { TenderStatus } from './tenders';
import type { ImportAction } from './type-bundle';
import type { BillingStatus } from './types';
import type { VariationStatus } from './variation';
import type { InboundState } from './whatsapp';

/**
 * What a status means to the person reading the list, whatever the record (ARCHITECTURE "Status colour"):
 * - `waiting`: waits on someone's decision, reply or delivery (submitted, open, due soon);
 * - `inHand`: being done, nobody else is held up (a draft, planned, under way, dispatched);
 * - `done`: finished or normal, nothing to do (approved, paid, active, passed);
 * - `failed`: rejected, sent back, overdue, failed or lost;
 * - `closed`: closed, cancelled, withdrawn or superseded.
 * The web draws `waiting`, `inHand` and `failed` as a tinted tag with a dot, and `done` and `closed` as quiet text, so the
 * rows that need someone stand out of a column.
 */
export const STATUS_MEANINGS = ['waiting', 'inHand', 'done', 'failed', 'closed'] as const;
export type StatusMeaning = (typeof STATUS_MEANINGS)[number];

const meanings = <S extends string>(map: Record<S, StatusMeaning>) => map;

/** Every status the web shows, by kind of record. A new status enum is a line here (and its test in `status-tone-test.ts`). */
export const STATUS_TONES = {
  submission: meanings<SubmissionStatus>({ DRAFT: 'inHand', SUBMITTED: 'waiting', APPROVED: 'done', REJECTED: 'failed', CHANGES_REQUESTED: 'failed' }),
  project: meanings<ProjectStatus>({ PLANNED: 'inHand', ACTIVE: 'done', ON_HOLD: 'waiting', COMPLETED: 'done', CLOSED: 'closed' }),
  tender: meanings<TenderStatus>({ PREPARING: 'inHand', SUBMITTED: 'waiting', WON: 'done', LOST: 'failed', DROPPED: 'closed', CANCELLED: 'closed' }),
  billStage: meanings<BillStage>({ NOT_SENT: 'inHand', SENT: 'waiting', CERTIFIED: 'waiting', PAID: 'done' }),
  paid: meanings<PaidState>({ PAID: 'done', PART: 'waiting', UNPAID: 'waiting' }),
  match: meanings<MatchState>({ MATCHES: 'done', CHECKED: 'done', DOES_NOT_MATCH: 'failed' }),
  poReceipt: meanings<PoReceiptState>({ OPEN: 'waiting', RECEIVED: 'done', CLOSED: 'closed' }),
  delivery: meanings<DeliveryState>({ NOT_STARTED: 'waiting', PARTLY_RECEIVED: 'inHand', RECEIVED: 'done', CLOSED: 'closed' }),
  orderStage: meanings<OrderStage>({ TO_ENQUIRE: 'inHand', AWAITING_QUOTES: 'waiting', TO_FINALISE: 'waiting', AWAITING_APPROVAL: 'waiting', READY: 'inHand' }),
  pipelineStage: meanings<'APPROVAL' | 'TO_ENQUIRE' | 'AWAITING_QUOTES' | 'TO_FINALISE' | 'READY' | 'NOT_STARTED' | 'PARTLY_RECEIVED' | 'SIGN' | 'SEAL' | 'REPLY'>({
    APPROVAL: 'waiting',
    TO_ENQUIRE: 'inHand',
    AWAITING_QUOTES: 'waiting',
    TO_FINALISE: 'waiting',
    READY: 'inHand',
    NOT_STARTED: 'waiting',
    PARTLY_RECEIVED: 'inHand',
    SIGN: 'waiting',
    SEAL: 'waiting',
    REPLY: 'waiting',
  }),
  enquiryVendor: meanings<EnquiryVendorState>({ NOT_SENT: 'inHand', SENT: 'waiting', OPENED: 'waiting', QUOTED: 'done', EXPIRED: 'closed' }),
  scEnquiry: meanings<ScEnquiryStatus>({ OPEN: 'waiting', AWARDED: 'done', CANCELLED: 'closed' }),
  grnQc: meanings<GrnQcStatus>({ ACCEPTED: 'done', PARTLY_ACCEPTED: 'waiting', REJECTED: 'failed' }),
  supplierInvoice: meanings<SupplierInvoiceStage>({ SUBMITTED: 'waiting', BILLED: 'inHand', PAID: 'done', RETURNED: 'failed', WITHDRAWN: 'closed' }),
  supplierDispatch: meanings<SupplierDispatchStatus>({ ON_THE_WAY: 'inHand', RECEIVED: 'done', CANCELLED: 'closed' }),
  supplierChange: meanings<SupplierChangeStatus>({ PENDING: 'waiting', APPROVED: 'done', REJECTED: 'failed' }),
  variation: meanings<VariationStatus>({ DRAFT: 'inHand', SUBMITTED: 'waiting', APPROVED: 'done', REJECTED: 'failed' }),
  bookVoucher: meanings<BookVoucherStatus>({ DRAFT: 'inHand', SUBMITTED: 'waiting', APPROVED: 'done', REJECTED: 'failed', CANCELLED: 'closed' }),
  imprestEntry: meanings<ImprestEntryStatus>({ REQUESTED: 'waiting', PAID: 'done', REJECTED: 'failed' }),
  payrollRun: meanings<PayrollRunStatus>({ DRAFT: 'inHand', SUBMITTED: 'waiting', APPROVED: 'done', PAID: 'done' }),
  settlement: meanings<SettlementStatus>({ DRAFT: 'inHand', APPROVED: 'done', PAID: 'done' }),
  clearance: meanings<ClearanceState>({ PENDING: 'waiting', CLEARED: 'done', DUES: 'failed', NOT_APPLICABLE: 'closed' }),
  emi: meanings<EmiStage>({ PAID: 'done', OVERDUE: 'failed', DUE: 'waiting', LATER: 'closed' }),
  equipmentLoan: meanings<EquipmentLoanStatus>({ ACTIVE: 'done', CLOSED: 'closed' }),
  billing: meanings<BillingStatus>({ TRIAL: 'inHand', ACTIVE: 'done', READ_ONLY: 'failed', EXEMPT: 'closed' }),
  accessRequest: meanings<AccessRequestStatus>({ OPEN: 'waiting', GRANTED: 'done', DECLINED: 'failed' }),
  risk: meanings<RiskStatus>({ OPEN: 'waiting', MONITORING: 'inHand', CLOSED: 'closed' }),
  ncr: meanings<NcrStatus>({ OPEN: 'waiting', ACTION_TAKEN: 'inHand', CLOSED: 'closed' }),
  defect: meanings<DefectStatus>({ OPEN: 'waiting', FIXED: 'inHand', CLOSED: 'closed' }),
  finding: meanings<FindingState>({ OPEN: 'waiting', NCR: 'inHand', CLOSED: 'closed' }),
  rfi: meanings<RfiStatus>({ OPEN: 'waiting', ANSWERED: 'done', CLOSED: 'closed', WITHDRAWN: 'closed' }),
  meetingAction: meanings<MeetingActionStatus>({ OPEN: 'waiting', DONE: 'done', DROPPED: 'closed' }),
  meeting: meanings<MeetingStatus>({ DRAFT: 'inHand', ISSUED: 'done' }),
  siteOrder: meanings<SiteOrderState>({ OPEN: 'waiting', OVERDUE: 'failed', REPLIED: 'waiting', CLOSED: 'closed' }),
  letter: meanings<LetterStatus>({ DRAFT: 'inHand', AWAITING_APPROVAL: 'waiting', ISSUED: 'done', OPEN: 'waiting', CLOSED: 'closed' }),
  maintenance: meanings<MaintenanceStatus>({ OPEN: 'waiting', CLOSED: 'closed' }),
  safetyIncident: meanings<SafetyIncidentStatus>({ OPEN: 'waiting', CLOSED: 'closed' }),
  workPermit: meanings<WorkPermitStatus>({ REQUESTED: 'waiting', ISSUED: 'done', REJECTED: 'failed', CLOSED: 'closed' }),
  ppeIssue: meanings<PpeIssueStatus>({ ISSUED: 'done', RETURNED: 'closed', REPLACED: 'closed', LOST: 'failed' }),
  complianceDoc: meanings<ComplianceDocStatus>({ ACTIVE: 'done', RENEWED: 'closed', RELEASED: 'closed', INVOKED: 'failed' }),
  testResult: meanings<TestResult>({ PENDING: 'waiting', PASS: 'done', FAIL: 'failed' }),
  inspectionResult: meanings<InspectionResult>({ PASS: 'done', FAIL: 'failed', NA: 'closed' }),
  pour: meanings<PourStatus>({ PLANNED: 'inHand', POURED: 'done', CANCELLED: 'closed' }),
  accreditation: meanings<AccreditationState>({ VALID: 'done', EXPIRING: 'waiting', EXPIRED: 'failed', NONE: 'closed' }),
  calibration: meanings<CalibrationState>({ OK: 'done', DUE_SOON: 'waiting', OVERDUE: 'failed', NEVER: 'failed', OUT_OF_USE: 'closed' }),
  calibrationResult: meanings<CalibrationResult>({ OK: 'done', ADJUSTED: 'done', FAILED: 'failed' }),
  checkOutcome: meanings<CheckOutcome>({ AGREED: 'done', LESS: 'failed', MORE: 'waiting' }),
  materialApproval: meanings<MaterialApprovalStatus>({
    DRAFT: 'inHand',
    UNDER_REVIEW: 'waiting',
    APPROVED: 'done',
    APPROVED_AS_NOTED: 'done',
    REVISE_RESUBMIT: 'failed',
    REJECTED: 'failed',
    WITHDRAWN: 'closed',
  }),
  materialReview: meanings<MaterialReviewOutcome>({ APPROVED: 'done', APPROVED_AS_NOTED: 'done', REVISE_RESUBMIT: 'failed', REJECTED: 'failed' }),
  designSubmission: meanings<DesignSubmissionStatus>({
    DRAFT: 'inHand',
    UNDER_REVIEW: 'waiting',
    APPROVED: 'done',
    APPROVED_AS_NOTED: 'done',
    REVISE_RESUBMIT: 'failed',
    REJECTED: 'failed',
    WITHDRAWN: 'closed',
  }),
  designCode: meanings<ApprovalCode>({ A: 'done', B: 'done', C: 'failed', D: 'failed' }),
  designComment: meanings<DesignCommentState>({ OPEN: 'waiting', ANSWERED: 'inHand', CLOSED: 'closed' }),
  componentDrawings: meanings<ComponentState>({ AFC: 'done', UNDER_REVIEW: 'waiting', BACK_WITH_US: 'failed', NOT_SENT: 'inHand', NO_DRAWINGS: 'closed' }),
  deliverable: meanings<DeliverableStatus>({ NOT_STARTED: 'inHand', SUBMITTED: 'waiting', COMMENTS: 'failed', APPROVED: 'done' }),
  drawingNeed: meanings<DrawingNeedState>({ AWAITED: 'waiting', RECEIVED: 'inHand', GFC: 'done', DROPPED: 'closed' }),
  revision: meanings<RevisionStatus>({
    FOR_CONSTRUCTION: 'done',
    APPROVED: 'done',
    APPROVED_WITH_COMMENTS: 'done',
    FOR_APPROVAL: 'waiting',
    FOR_INFORMATION: 'done',
    REJECTED: 'failed',
    AS_BUILT: 'done',
    WITHDRAWN: 'closed',
  }),
  controlledCopy: meanings<CopyState>({ IN_FORCE: 'done', TO_RECALL: 'waiting', CLOSED: 'closed' }),
  impact: meanings<ImpactTone>({ danger: 'failed', warning: 'waiting', info: 'inHand' }),
  /** An activity on the Gantt: behind plan waits on the site, only past its planned finish is late. */
  schedule: meanings<ScheduleState>({ UNSCHEDULED: 'closed', NOT_STARTED: 'inHand', ON_TRACK: 'inHand', BEHIND: 'waiting', LATE: 'failed', DONE: 'done' }),
  milestone: meanings<MilestoneState>({ UPCOMING: 'inHand', DUE_SOON: 'waiting', MISSED: 'failed', ACHIEVED: 'done', ACHIEVED_LATE: 'done' }),
  lookahead: meanings<LookaheadReadiness>({ IN_PROGRESS: 'inHand', READY: 'done', WAITING: 'waiting' }),
  programme: meanings<ProgrammeStatus>({ SUBMITTED: 'waiting', APPROVED: 'done', RETURNED: 'failed' }),
  programmeWatch: meanings<ProgrammeWatchState>({ NO_DATE: 'closed', UPCOMING: 'inHand', DUE_SOON: 'waiting', OVERDUE: 'failed' }),
  eot: meanings<EotState>({ SENT: 'waiting', FORWARDED: 'waiting', OVERDUE: 'failed', GRANTED: 'done', PART_GRANTED: 'done', REFUSED: 'failed', WITHDRAWN: 'closed' }),
  obligation: meanings<ObligationState>({ MET: 'done', MET_LATE: 'done', WAIVED: 'closed', UPCOMING: 'inHand', DUE_SOON: 'waiting', OVERDUE: 'failed', NO_DATE: 'closed' }),
  service: meanings<ServiceState>({ NOT_SET: 'closed', OK: 'done', DUE_SOON: 'waiting', OVERDUE: 'failed' }),
  expiry: meanings<ExpiryState>({ VALID: 'done', EXPIRING: 'waiting', EXPIRED: 'failed' }),
  reconciliation: meanings<ReconciliationStatus>({ OVER: 'failed', UNDER: 'waiting', WITHIN: 'done', NO_WORK: 'closed' }),
  kit: meanings<KitStatus>({ SHORT: 'failed', OVER: 'waiting', OK: 'done' }),
  reconException: meanings<ReconExceptionKind>({ USE_WITHOUT_ISSUE: 'failed', ISSUE_WITHOUT_WORK: 'waiting', LAID_ABOVE_ISSUED: 'failed' }),
  frontFlag: meanings<FrontFlag>({ USED_NOT_ISSUED: 'failed', NOT_REPORTED: 'waiting' }),
  omPeriod: meanings<OmPeriodStatus>({ FUTURE: 'closed', RUNNING: 'inHand', DUE: 'waiting', BILLED: 'done' }),
  omChemical: meanings<OmChemicalState>({ OVER: 'failed', UNDER: 'waiting', WITHIN: 'done', NO_WATER: 'closed' }),
  rmcOrder: meanings<RmcOrderStatus>({ QUOTED: 'waiting', CONFIRMED: 'inHand', CLOSED: 'closed', CANCELLED: 'closed' }),
  rmcBatch: meanings<RmcBatchStatus>({ DISPATCHED: 'inHand', DELIVERED: 'done', REJECTED: 'failed' }),
  rmcInvoice: meanings<RmcInvoiceStatus>({ ISSUED: 'done', CANCELLED: 'closed' }),
  mixDesign: meanings<MixDesignStatus>({ DRAFT: 'inHand', APPROVED: 'done', RETIRED: 'closed' }),
  leave: meanings<LeaveStatus>({ PENDING: 'waiting', APPROVED: 'done', REJECTED: 'failed', CANCELLED: 'closed' }),
  overtime: meanings<OvertimeStatus>({ PENDING: 'waiting', APPROVED: 'done', REJECTED: 'failed' }),
  employeeDocument: meanings<EmployeeDocumentState>({ MISSING: 'waiting', UPLOADED: 'waiting', VERIFIED: 'done', REJECTED: 'failed', WAIVED: 'closed' }),
  staffAttendance: meanings<StaffAttendanceStatus>({ PRESENT: 'done', HALF_DAY: 'done', ABSENT: 'failed' }),
  biometricCommand: meanings<BiometricCommandStatus>({ QUEUED: 'waiting', SENT: 'inHand', DONE: 'done', FAILED: 'failed', CANCELLED: 'closed' }),
  biometricPunch: meanings<BiometricPunchResult>({ APPLIED: 'done', UNMATCHED: 'waiting', LOCKED: 'closed', SKIPPED: 'closed' }),
  agent: meanings<AgentState>({ WAITING_TO_PAIR: 'waiting', CODE_EXPIRED: 'failed', ONLINE: 'done', OFFLINE: 'failed', REVOKED: 'closed' }),
  connectionHealth: meanings<ConnectionHealth>({ NOT_SET_UP: 'waiting', LIVE: 'done', FAILING: 'failed', QUIET: 'waiting', OFF: 'closed' }),
  integrationEvent: meanings<IntegrationEventStatus>({ OK: 'done', FAILED: 'failed', IGNORED: 'closed' }),
  outboundMessage: meanings<OutboundMessageStatus>({ SENT: 'done', FAILED: 'failed', SKIPPED: 'closed' }),
  inbound: meanings<InboundState>({ RECEIVED: 'inHand', ANSWERED: 'done', DRAFTED: 'waiting', SAVED: 'done', DISCARDED: 'closed', FAILED: 'failed' }),
  typeImport: meanings<ImportAction>({ CREATE: 'inHand', REPLACE: 'waiting', SAME: 'closed', REFUSED: 'failed' }),
  health: meanings<HealthLevel>({ good: 'done', watch: 'waiting', act: 'failed' }),
  /** A project's schedule, cost and billing signals (`ScheduleReading.level` and the header's chips). */
  signal: meanings<ScheduleReading['level']>({ success: 'done', warning: 'waiting', error: 'failed', default: 'closed' }),
} as const;

export type StatusKind = keyof typeof STATUS_TONES;
export type StatusOf<K extends StatusKind> = keyof (typeof STATUS_TONES)[K] & string;

/** What `status` of a `kind` of record means; a value the map does not know yet reads as closed (quiet), never as an alarm. */
export function statusTone<K extends StatusKind>(kind: K, status: StatusOf<K>): StatusMeaning {
  return (STATUS_TONES[kind] as Record<string, StatusMeaning>)[status] ?? 'closed';
}
