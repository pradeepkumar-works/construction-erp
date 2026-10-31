import type { ContractModel, WorkElementLevel, WorkElementType, PipeNodeKind, PipeMaterial, PipeScope, PipeStage, LdPeriod, GrnQcStatus, ComplianceDocKind, ComplianceDocStatus, DefectPhase, DefectPriority, DefectStatus, ImprestEntryKind, ImprestEntryStatus, WorkerIdType, WorkerSkill, EquipmentDocType, MaintenanceKind, MaintenanceStatus, BillStage, ReceiptKind, VendorKind, MsmeCategory, EquipmentOwnership, ExpenseCategory, PaymentMode, EquipmentRateUnit, MaterialPriority, NotificationType, ProjectStatus, ProjectType, WorkLocation, DelayParty, PasswordTokenPurpose, RiskCategory, RiskKind, RiskStatus, RoleKey, SafetyIncidentStatus, SafetyIncidentType, StockEntryType, SubmissionStatus, SubmissionType, Weather, WorkPermitStatus, WorkPermitType, PpeKind, PpeIssueStatus, RfiStatus, RfiPriority, PaymentRequestKind, FundPurpose, VendorBillKind, HireFuelBy, DebitNoteReason, BoqResourceKind, StockAdjustmentReason, FuelNormUnit, EquipmentPartKind, ApprovalStepAction, MarkupKind, MarkupStatus, MarkupColor, NavPinKind, NavVisitKind, AccessRequestStatus, NavLayout, NavLook, NavModuleSet, CompanyKind } from './enums';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  ROAD: 'Road or infrastructure',
  BUILDING: 'Building',
  WATER_SUPPLY: 'Water supply',
  SEWERAGE: 'Sewerage',
  OTHER: 'Other works',
  PLANT: 'RMC plant',
  STORE: 'Central store or yard',
};

export const WORK_LOCATION_LABELS: Record<WorkLocation, string> = { CHAINAGE: 'Chainage', FLOOR: 'Floor', VILLAGE: 'Village' };

export const CONTRACT_MODEL_LABELS: Record<ContractModel, string> = {
  ITEM_RATE: 'Item rate',
  LUMP_SUM: 'Lump sum',
  EPC: 'EPC (design and build)',
};

export const WORK_ELEMENT_LEVEL_LABELS: Record<WorkElementLevel, string> = { COMPONENT: 'Component', SUB_COMPONENT: 'Sub-component' };

export const WORK_ELEMENT_TYPE_LABELS: Record<WorkElementType, string> = {
  INTAKE_WELL: 'Intake well',
  PUMP_HOUSE: 'Pump house',
  APPROACH_BRIDGE: 'Approach bridge',
  RISING_MAIN: 'Rising main',
  FEEDER_MAIN: 'Feeder main',
  WTP: 'Water treatment plant',
  WTP_UNIT: 'Treatment plant unit',
  SUMP: 'Sump',
  OHT: 'Overhead tank',
  PIPE_ZONE: 'Pipe network zone',
  HOUSE_CONNECTIONS: 'House connections',
  ROAD_RESTORATION: 'Road restoration',
  HT_FEEDER: 'HT feeder line',
  EM_PACKAGE: 'Electrical and mechanical package',
  STP_UNIT: 'Sewage treatment unit',
  BLOCK: 'Building block',
  FLOOR: 'Floor',
  ROAD_STRETCH: 'Road stretch',
  CROSSING: 'Crossing',
  GENERAL: 'Other',
};

export const PIPE_NODE_KIND_LABELS: Record<PipeNodeKind, string> = {
  JUNCTION: 'Junction',
  TANK: 'Tank',
  SOURCE: 'Source',
  SLUICE_VALVE: 'Sluice valve',
  AIR_VALVE: 'Air valve',
  SCOUR: 'Scour valve',
  CHAMBER: 'Chamber',
  END: 'Dead end',
  CROSSING_PIT: 'Crossing pit',
};

export const PIPE_MATERIAL_LABELS: Record<PipeMaterial, string> = { HDPE: 'HDPE', MDPE: 'MDPE', DI: 'DI', CI: 'CI', MS: 'MS', PVC: 'PVC', GRP: 'GRP', OTHER: 'Other' };

export const PIPE_SCOPE_LABELS: Record<PipeScope, string> = { PROPOSED: 'Proposed', EXISTING: 'Existing' };

/** What a stage's done figure is called ("Laid 1,240 m"). */
export const PIPE_STAGE_LABELS: Record<PipeStage, string> = {
  TRENCH: 'Trenched',
  BEDDING: 'Bedded',
  LAY_JOINT: 'Laid and jointed',
  VALVES: 'Valves fixed',
  BACKFILL: 'Backfilled',
  TEST: 'Tested',
  RESTORATION: 'Restored',
  COMMISSIONING: 'Commissioned',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes requested',
};

export const APPROVAL_STEP_ACTION_LABELS: Record<ApprovalStepAction, string> = { APPROVED: 'Approved', ESCALATED: 'Escalated', REMINDED: 'Reminded' };

export const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = {
  PROGRESS: 'Progress entry',
  DPR: 'Daily report',
  MATERIAL_REQUEST: 'Indent',
  MACHINERY: 'Machinery log',
  EXPENSE: 'Site expense',
  MEASUREMENT: 'Measurement',
  BILL: 'RA bill',
  PURCHASE_ORDER: 'Purchase order',
  VENDOR_BILL: 'Vendor bill',
  WORK_ORDER: 'Work order',
  SUBCONTRACT_BILL: 'Subcontractor bill',
  INSPECTION: 'Inspection',
  PAYMENT_REQUEST: 'Payment request',
};

/** A group of entries of one type (the approvals inbox, on the web and the phone): the list's own name in the menu. */
export const SUBMISSION_TYPE_PLURAL_LABELS: Record<SubmissionType, string> = {
  PROGRESS: 'Progress entries',
  DPR: 'Daily reports',
  MATERIAL_REQUEST: 'Indents',
  MACHINERY: 'Machinery logs',
  EXPENSE: 'Site expenses',
  MEASUREMENT: 'Measurement book',
  BILL: 'RA bills',
  PURCHASE_ORDER: 'Purchase orders',
  VENDOR_BILL: 'Vendor bills',
  WORK_ORDER: 'Work orders',
  SUBCONTRACT_BILL: 'Subcontractor bills',
  INSPECTION: 'Inspections',
  PAYMENT_REQUEST: 'Payment requests',
};

export const PAYMENT_REQUEST_KIND_LABELS: Record<PaymentRequestKind, string> = {
  BILL: 'Bill payment',
  PO_ADVANCE: 'Advance on a purchase order',
  WO_ADVANCE: 'Advance on a work order',
  FUND_REQUEST: 'Fund request',
};

export const FUND_PURPOSE_LABELS: Record<FundPurpose, string> = {
  WAGES: 'Wages',
  LOCAL_PURCHASE: 'Local purchase',
  PETTY_CONTRACTOR: 'Advance to a petty contractor',
  SITE_RUNNING: 'Site running costs',
  OTHER: 'Other',
};

export const VENDOR_BILL_KIND_LABELS: Record<VendorBillKind, string> = {
  PO: 'Against a purchase order',
  HIRE: 'Machine hire',
  SERVICE: 'Workshop service',
  OTHER: 'Other service',
};

export const HIRE_FUEL_BY_LABELS: Record<HireFuelBy, string> = {
  OWNER: 'Owner fuels it',
  COMPANY: 'We fuel it',
};

export const FUEL_NORM_UNIT_LABELS: Record<FuelNormUnit, string> = {
  LITRES_PER_HOUR: 'Litres an hour',
  KM_PER_LITRE: 'Km a litre',
};

export const EQUIPMENT_PART_KIND_LABELS: Record<EquipmentPartKind, string> = {
  TYRE: 'Tyre',
  BATTERY: 'Battery',
};

export const DEBIT_NOTE_REASON_LABELS: Record<DebitNoteReason, string> = {
  SHORTAGE: 'Short supply',
  EXCESS: 'Billed in excess',
  REJECTED: 'Rejected at QA/QC',
  RETURNED: 'Returned to vendor',
  RATE_DIFFERENCE: 'Rate difference',
  OTHER: 'Other',
};

export const BOQ_RESOURCE_KIND_LABELS: Record<BoqResourceKind, string> = {
  LABOUR: 'Labour',
  EQUIPMENT: 'Machine',
};

export const STOCK_ADJUSTMENT_REASON_LABELS: Record<StockAdjustmentReason, string> = {
  OPENING: 'Opening stock',
  WASTAGE: 'Wastage',
  DAMAGE: 'Damaged',
  THEFT: 'Theft or loss',
  COUNT_DIFFERENCE: 'Count difference',
  OTHER: 'Other',
};

export const MATERIAL_PRIORITY_LABELS: Record<MaterialPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: 'Admin',
  MANAGEMENT: 'Management',
  PROJECT_MANAGER: 'Project manager',
  TEAM_LEADER: 'Team leader or site supervisor',
  SITE_ENGINEER: 'Site engineer',
  STORE_MANAGER: 'Store manager',
  QUANTITY_SURVEYOR: 'Quantity surveyor',
  PROCUREMENT_MANAGER: 'Procurement manager',
  QA_QC_ENGINEER: 'QA/QC engineer',
  SAFETY_OFFICER: 'Safety officer',
  DOCUMENT_CONTROLLER: 'Document controller',
  ACCOUNTS_MANAGER: 'Accounts manager',
  HR_MANAGER: 'HR manager',
  CLIENT_ENGINEER: "Client's engineer (guest)",
  CONSULTANT: 'Consultant or PMC (guest)',
  SUPPLIER: 'Supplier (portal)',
};

export const WEATHER_LABELS: Record<Weather, string> = {
  SUNNY: 'Sunny',
  CLOUDY: 'Cloudy',
  RAINY: 'Rainy',
  WINDY: 'Windy',
  HOT: 'Hot',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  SUBMISSION_SUBMITTED: 'Waiting for your approval',
  SUBMISSION_APPROVED: 'Approved',
  SUBMISSION_REJECTED: 'Rejected',
  SUBMISSION_CHANGES_REQUESTED: 'Changes requested',
  DPR_REMINDER: 'DPR reminder',
  APPROVAL_DIGEST: 'Approvals waiting',
  LOW_STOCK: 'Low stock',
  RISK_RAISED: 'Delay or risk recorded',
  TEST_DUE: 'Test due',
  TEST_FAILED: 'Test failed',
  NCR: 'Non-conformance',
  DOCUMENT_ISSUED: 'Drawing issued',
  LEAVE: 'Leave',
  OVERTIME: 'Overtime',
  BILLS_DUE: 'Payments due',
  PORTAL: 'Client portal',
  SAFETY: 'Safety',
  MACHINERY: 'Machinery',
  IMPREST: 'Site imprest',
  COMPLIANCE: 'Guarantees and licences',
  DEFECT: 'Snags and defects',
  WATCH_LIST: 'Watch list',
  MORNING_BRIEF: 'Morning brief',
  SUPPLIER: 'Supplier portal',
  COMMENT: 'Comments',
  ACCESS_REQUEST: 'Access requests',
  HANDOFF: 'Your turn',
  LETTER: 'Letter',
};

export const STOCK_ENTRY_TYPE_LABELS: Record<StockEntryType, string> = {
  RECEIPT: 'Receipt (GRN)',
  ISSUE: 'Issue',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  RETURN_TO_VENDOR: 'Return to vendor',
  RETURN_FROM_SITE: 'Return from site',
};

/** Common units used in BOQ / activities. Free text is still allowed. */
export const COMMON_UNITS = ['Cum', 'Sqm', 'Rmt', 'MT', 'Nos', 'Kg', 'Ltr', 'LS', 'Km', '%'];

/** Manpower categories used in DPR manpower summary. */
export const MANPOWER_CATEGORIES = ['Mason', 'Carpenter', 'Bar Bender', 'Helper', 'Operator', 'Driver', 'Electrician', 'Plumber', 'Supervisor', 'Other'];

/** Contractor name for the company's own (departmental) workers on an attendance sheet. */
export const DEPARTMENTAL_CONTRACTOR = 'Departmental';

export const EQUIPMENT_OWNERSHIP_LABELS: Record<EquipmentOwnership, string> = {
  OWNED: 'Owned',
  HIRED: 'Hired',
};

export const EQUIPMENT_RATE_UNIT_LABELS: Record<EquipmentRateUnit, string> = {
  HOUR: 'per hour',
  DAY: 'per day',
  MONTH: 'per month',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  FUEL: 'Fuel',
  TRANSPORT: 'Transport / hiring',
  REPAIRS: 'Repairs and maintenance',
  MATERIAL_LOCAL: 'Local material purchase',
  LABOUR: 'Labour payment',
  FOOD_WELFARE: 'Food and welfare',
  TRAVEL: 'Travel',
  RENT_UTILITIES: 'Rent and utilities',
  OFFICE: 'Site office',
  SAFETY: 'Safety items',
  OTHER: 'Other',
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK: 'Bank (RTGS, NEFT or cheque)',
  CARD: 'Card',
  CREDIT: 'On credit',
};

export const RISK_KIND_LABELS: Record<RiskKind, string> = {
  DELAY: 'Delay',
  RISK: 'Risk',
};

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  LAND: 'Land / right of way',
  DESIGN: 'Drawings and design',
  CLIENT: 'Client decisions',
  MATERIAL: 'Material supply',
  LABOUR: 'Labour',
  EQUIPMENT: 'Equipment',
  WEATHER: 'Weather',
  FINANCE: 'Payments and finance',
  STATUTORY: 'Permits and statutory',
  SAFETY: 'Safety',
  UTILITY: 'Utility shifting',
  OTHER: 'Other',
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  OPEN: 'Open',
  MONITORING: 'Monitoring',
  CLOSED: 'Closed',
};

export const DELAY_PARTY_LABELS: Record<DelayParty, string> = {
  CLIENT: 'Client',
  CONTRACTOR: 'Contractor (us)',
  THIRD_PARTY: 'Third party',
  FORCE_MAJEURE: 'Force majeure',
};

export const PASSWORD_TOKEN_PURPOSE_LABELS: Record<PasswordTokenPurpose, string> = {
  INVITE: 'Invitation',
  RESET: 'Password reset',
};

export const BILL_STAGE_LABELS: Record<BillStage, string> = {
  NOT_SENT: 'Not sent',
  SENT: 'Sent to client',
  CERTIFIED: 'Certified',
  PAID: 'Paid',
};

export const VENDOR_KIND_LABELS: Record<VendorKind, string> = {
  SUPPLIER: 'Material supplier',
  HIRE_AGENCY: 'Machinery hire',
  SUBCONTRACTOR: 'Subcontractor',
  LABOUR_CONTRACTOR: 'Labour contractor',
  SERVICE: 'Services',
};

export const MSME_CATEGORY_LABELS: Record<MsmeCategory, string> = {
  MICRO: 'Micro',
  SMALL: 'Small',
  MEDIUM: 'Medium',
};

export const RECEIPT_KIND_LABELS: Record<ReceiptKind, string> = {
  BILL: 'Bill payment',
  RETENTION_RELEASE: 'Retention released',
  DEPOSIT_RELEASE: 'Security deposit released',
};

/** The modes money from a client (and a payment out) can take, in the same words as everywhere else. */
export const RECEIPT_MODE_LABELS: Partial<Record<PaymentMode, string>> = { BANK: PAYMENT_MODE_LABELS.BANK, UPI: PAYMENT_MODE_LABELS.UPI, CASH: PAYMENT_MODE_LABELS.CASH };

export const SAFETY_INCIDENT_TYPE_LABELS: Record<SafetyIncidentType, string> = {
  NEAR_MISS: 'Near miss',
  FIRST_AID: 'First aid case',
  MEDICAL_TREATMENT: 'Medical treatment',
  LOST_TIME: 'Lost time injury',
  PROPERTY_DAMAGE: 'Property damage',
  FATALITY: 'Fatality',
};

export const SAFETY_INCIDENT_STATUS_LABELS: Record<SafetyIncidentStatus, string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
};

export const WORK_PERMIT_TYPE_LABELS: Record<WorkPermitType, string> = {
  HOT_WORK: 'Hot work (welding, cutting)',
  WORK_AT_HEIGHT: 'Work at height',
  EXCAVATION: 'Excavation / trench',
  CONFINED_SPACE: 'Confined space',
  ELECTRICAL: 'Electrical work',
  LIFTING: 'Crane / heavy lift',
  OTHER: 'Other',
};

export const WORK_PERMIT_STATUS_LABELS: Record<WorkPermitStatus, string> = {
  REQUESTED: 'Requested',
  ISSUED: 'Issued',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = {
  SERVICE: 'Service',
  BREAKDOWN: 'Breakdown',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
};

export const EQUIPMENT_DOC_TYPE_LABELS: Record<EquipmentDocType, string> = {
  INSURANCE: 'Insurance',
  FITNESS: 'Fitness certificate',
  PERMIT: 'Permit',
  PUC: 'PUC (pollution)',
  ROAD_TAX: 'Road tax',
  REGISTRATION: 'Registration (RC)',
  OTHER: 'Other',
};

export const WORKER_SKILL_LABELS: Record<WorkerSkill, string> = {
  UNSKILLED: 'Unskilled',
  SEMI_SKILLED: 'Semi-skilled',
  SKILLED: 'Skilled',
  HIGHLY_SKILLED: 'Highly skilled',
};

export const WORKER_ID_TYPE_LABELS: Record<WorkerIdType, string> = {
  AADHAAR: 'Aadhaar',
  VOTER_ID: 'Voter ID',
  DRIVING_LICENCE: 'Driving licence',
  PAN: 'PAN',
  OTHER: 'Other',
};

export const IMPREST_ENTRY_KIND_LABELS: Record<ImprestEntryKind, string> = { ADVANCE: 'Cash advanced', RETURN: 'Cash returned' };
export const IMPREST_ENTRY_STATUS_LABELS: Record<ImprestEntryStatus, string> = { REQUESTED: 'Top-up asked for', PAID: 'Paid', REJECTED: 'Rejected' };

export const COMPLIANCE_DOC_KIND_LABELS: Record<ComplianceDocKind, string> = { BANK_GUARANTEE: 'Bank guarantee', EMD: 'EMD', INSURANCE: 'Insurance', LICENCE: 'Licence' };
export const COMPLIANCE_DOC_STATUS_LABELS: Record<ComplianceDocStatus, string> = { ACTIVE: 'Active', RENEWED: 'Renewed', RELEASED: 'Released', INVOKED: 'Invoked' };
export const DEFECT_PHASE_LABELS: Record<DefectPhase, string> = { SNAG: 'Snag', DEFECT: 'Defect (DLP)' };
export const DEFECT_PRIORITY_LABELS: Record<DefectPriority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
export const DEFECT_STATUS_LABELS: Record<DefectStatus, string> = { OPEN: 'Open', FIXED: 'Fixed', CLOSED: 'Closed' };
export const GRN_QC_STATUS_LABELS: Record<GrnQcStatus, string> = { ACCEPTED: 'Accepted', PARTLY_ACCEPTED: 'Partly accepted', REJECTED: 'Rejected' };

export const LD_PERIOD_LABELS: Record<LdPeriod, string> = { DAY: 'per day', WEEK: 'per week', MONTH: 'per month' };
/** Days in one LD period: part periods count pro rata. */
export const LD_PERIOD_DAYS: Record<LdPeriod, number> = { DAY: 1, WEEK: 7, MONTH: 30 };

export const PPE_KIND_LABELS: Record<PpeKind, string> = {
  HELMET: 'Helmet',
  SAFETY_SHOES: 'Safety shoes',
  REFLECTIVE_JACKET: 'Reflective jacket',
  GLOVES: 'Gloves',
  SAFETY_HARNESS: 'Safety harness',
  GOGGLES: 'Goggles',
  EAR_PROTECTION: 'Ear protection',
  DUST_MASK: 'Dust mask',
  GUMBOOTS: 'Gumboots',
};

export const PPE_ISSUE_STATUS_LABELS: Record<PpeIssueStatus, string> = {
  ISSUED: 'With the worker',
  RETURNED: 'Returned',
  REPLACED: 'Replaced',
  LOST: 'Lost',
};

export const RFI_STATUS_LABELS: Record<RfiStatus, string> = {
  OPEN: 'Waiting for answer',
  ANSWERED: 'Answered',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn',
};

export const RFI_PRIORITY_LABELS: Record<RfiPriority, string> = {
  NORMAL: 'Normal',
  URGENT: 'Urgent',
};

export const MARKUP_KIND_LABELS: Record<MarkupKind, string> = {
  PIN: 'Comment',
  CLOUD: 'Cloud',
  RECT: 'Box',
  ARROW: 'Arrow',
  TEXT: 'Text',
  PEN: 'Freehand',
};

export const MARKUP_STATUS_LABELS: Record<MarkupStatus, string> = { OPEN: 'Open', RESOLVED: 'Resolved' };

export const MARKUP_COLOR_LABELS: Record<MarkupColor, string> = { RED: 'Red', BLUE: 'Blue', GREEN: 'Green', ORANGE: 'Orange' };

export const NAV_PIN_KIND_LABELS: Record<NavPinKind, string> = {
  NODE: 'Page',
  PROJECT: 'Project',
};

export const NAV_VISIT_KIND_LABELS: Record<NavVisitKind, string> = {
  NODE: 'Page',
  PROJECT: 'Project',
  RECORD: 'Record',
};

export const ACCESS_REQUEST_STATUS_LABELS: Record<AccessRequestStatus, string> = {
  OPEN: 'Waiting',
  GRANTED: 'Granted',
  DECLINED: 'Declined',
};

export const NAV_LAYOUT_LABELS: Record<NavLayout, string> = {
  SIDEBAR: 'Sidebar',
  TOP_BAR: 'Top bar',
};

export const NAV_LOOK_LABELS: Record<NavLook, string> = {
  NAVY: 'Navy bar',
  FRAME: 'Light frame',
  BAR: 'One bar',
};

export const NAV_MODULE_SET_LABELS: Record<NavModuleSet, string> = {
  AREAS: 'By work area',
  DEPARTMENTS: 'By department',
};

export const COMPANY_KIND_LABELS: Record<CompanyKind, string> = {
  CONSTRUCTION: 'Construction',
  CONSULTANCY: 'Consultancy',
  QUALITY_LAB: 'Quality lab',
  PLANT: 'RMC plant',
  HOLDING: 'Holding',
};
