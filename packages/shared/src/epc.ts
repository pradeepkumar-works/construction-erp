/**
 * EPC packages and engineering deliverables (ARCHITECTURE "EPC"): what the design team owes the client by
 * discipline, the equipment packages with their dates from enquiry to commissioning against the day site needs them,
 * the inputs the client owes, and the contract currency. The rules are in `apps/api/src/epc/epc-rules.ts`.
 */
import type { ContractModel, DeliverableStatus, EngineeringDiscipline, PackageStage } from './enums';

export const ENGINEERING_DISCIPLINE_LABELS: Record<EngineeringDiscipline, string> = {
  PROCESS: 'Process',
  CIVIL: 'Civil and structural',
  MECHANICAL: 'Mechanical',
  ELECTRICAL: 'Electrical',
  INSTRUMENTATION: 'Instrumentation and control',
};

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  NOT_STARTED: 'Not submitted',
  SUBMITTED: 'With the client',
  COMMENTS: 'Comments to answer',
  APPROVED: 'Approved',
};

/**
 * The codes the client's engineer returns a submission with. A and B approve it (B with comments to take into the next
 * revision); C and D send it back.
 */
export const APPROVAL_CODES = ['A', 'B', 'C', 'D'] as const;
export type ApprovalCode = (typeof APPROVAL_CODES)[number];
export const APPROVAL_CODE_LABELS: Record<ApprovalCode, string> = {
  A: 'A, approved',
  B: 'B, approved with comments',
  C: 'C, revise and resubmit',
  D: 'D, rejected',
};
export const approvalCodeApproves = (code: string | null | undefined) => code === 'A' || code === 'B';

export const PACKAGE_STAGE_LABELS: Record<PackageStage, string> = {
  ENQUIRY: 'Enquiry',
  ORDERED: 'Order placed',
  DRAWINGS_APPROVED: 'Drawings and QAP approved',
  MANUFACTURED: 'Manufactured',
  INSPECTED: 'Inspected',
  DISPATCH_CLEARED: 'Cleared for dispatch',
  DISPATCHED: 'Dispatched',
  SHIPPED: 'Shipped',
  CUSTOMS_CLEARED: 'Customs cleared',
  DELIVERED: 'Delivered to site',
  ERECTED: 'Erected',
  COMMISSIONED: 'Commissioned',
};

/** Shipped and customs only apply to a package that comes by sea or air. */
export const IMPORT_STAGES: PackageStage[] = ['SHIPPED', 'CUSTOMS_CLEARED'];

/** Days from the port to site (customs and the truck) when a package does not say. */
export const DEFAULT_PORT_TO_SITE_DAYS = 10;

/** Contract currencies. Amounts are kept in rupees at the project's contract rate and shown in its currency. */
export const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian rupee' },
  { code: 'USD', symbol: 'US$', name: 'US dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'Pound sterling' },
  { code: 'AED', symbol: 'AED', name: 'UAE dirham' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi riyal' },
  { code: 'QAR', symbol: 'QAR', name: 'Qatari riyal' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani rial' },
  { code: 'BHD', symbol: 'BHD', name: 'Bahraini dinar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar' },
  { code: 'LKR', symbol: 'LKR', name: 'Sri Lankan rupee' },
  { code: 'BDT', symbol: 'BDT', name: 'Bangladeshi taka' },
  { code: 'NPR', symbol: 'NPR', name: 'Nepalese rupee' },
  { code: 'MVR', symbol: 'MVR', name: 'Maldivian rufiyaa' },
  { code: 'MUR', symbol: 'MUR', name: 'Mauritian rupee' },
  { code: 'KES', symbol: 'KES', name: 'Kenyan shilling' },
  { code: 'TZS', symbol: 'TZS', name: 'Tanzanian shilling' },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]['code'];
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as CurrencyCode[];
export const currencySymbol = (code: string | null | undefined) => CURRENCIES.find((c) => c.code === code)?.symbol ?? code ?? '₹';

/** A project's contract currency: its ISO code and the rupees one unit is kept at (null in rupees). */
export interface ContractCurrency {
  currency: string;
  exchangeRate: string | null;
}

/** Whether a project's figures are shown in another currency than rupees. */
export const isForeign = (c: ContractCurrency | null | undefined): c is ContractCurrency & { exchangeRate: string } =>
  !!c && c.currency !== 'INR' && !!c.exchangeRate && Number(c.exchangeRate) > 0;

/** Rupees kept at the contract rate, in the contract currency, to the cent. */
export function fromRupees(rupees: number | string, rate: number | string): number {
  const r = Number(rate);
  return r > 0 ? Math.round((Number(rupees) / r) * 100) / 100 : 0;
}

/** An amount in the contract currency, in rupees at the contract rate, to the paisa. */
export function toRupees(amount: number | string, rate: number | string): number {
  return Math.round(Number(amount) * Number(rate) * 100) / 100;
}

// What the project's Engineering and packages tab reads

export interface DeliverableDto {
  id: string;
  workElementId: string | null;
  workElementLabel: string | null;
  discipline: EngineeringDiscipline;
  /** e.g. PRC-003 */
  code: string;
  title: string;
  /** The document in the register its revisions are filed under */
  documentId: string | null;
  documentNo: string | null;
  documentRevision: string | null;
  plannedSubmitOn: string | null;
  plannedApprovalOn: string | null;
  /** The latest submission, its revision and the code it came back with */
  submittedOn: string | null;
  revision: string | null;
  approvalCode: ApprovalCode | null;
  approvedOn: string | null;
  status: DeliverableStatus;
  note: string | null;
  /** Days past the planned submission (not submitted) or approval (not approved); null when on time */
  lateDays: number | null;
  lateFor: 'SUBMISSION' | 'APPROVAL' | null;
  /** Payment stages its approval releases ("1.1 Basic engineering approved") */
  releases: string[];
}

export interface PackageStageDto {
  stage: PackageStage;
  plannedOn: string | null;
  actualOn: string | null;
  /** Actual less planned, days (late is positive) */
  slipDays: number | null;
}

export interface PackageDto {
  id: string;
  /** e.g. PKG-04 */
  code: string;
  name: string;
  discipline: EngineeringDiscipline;
  workElementId: string | null;
  workElementLabel: string | null;
  vendorId: string | null;
  vendorName: string | null;
  purchaseOrderId: string | null;
  poNo: string | null;
  /** "2 duty + 1 standby, 850 m³/h at 6 m" */
  scope: string | null;
  /** Rupees (at the contract rate on a foreign contract); null for roles that do not see purchase values */
  value: string | null;
  neededOn: string | null;
  /** Comes by sea or air: shipped and customs apply */
  imported: boolean;
  vessel: string | null;
  billOfLading: string | null;
  eta: string | null;
  portToSiteDays: number | null;
  note: string | null;
  /** The stages that apply, in order */
  stages: PackageStageDto[];
  /** The last stage done, and the next one with when it was planned */
  currentStage: PackageStage | null;
  nextStage: PackageStage | null;
  nextPlannedOn: string | null;
  /** Days the next stage is past its planned date */
  nextOverdueDays: number | null;
  /** When it reaches site: delivered, or the ship's ETA plus the days to site, or the plan moved by the slip so far */
  forecastOnSite: string | null;
  forecastFrom: 'DELIVERED' | 'ETA' | 'PLAN' | null;
  /** Days after the site needs it; null when on time or not known */
  lateDays: number | null;
  /** Actual dates out of order and the like */
  problems: string[];
}

export interface ClientInputDto {
  /** A milestone of the project the client owns */
  id: string;
  name: string;
  dueDate: string;
  achievedOn: string | null;
  note: string | null;
  /** Days past due and not given */
  overdueDays: number | null;
  /** The delay recorded for it in the delay register */
  delayId: string | null;
  delayNo: string | null;
}

export interface DisciplineSummaryDto {
  discipline: EngineeringDiscipline;
  total: number;
  submitted: number;
  approved: number;
  late: number;
}

export interface EpcSummaryDto {
  disciplines: DisciplineSummaryDto[];
  deliverables: number;
  approved: number;
  /** Approved of all, % */
  engineeringPct: number;
  packages: number;
  delivered: number;
  /** Packages that will reach site after the day it needs them */
  late: number;
  clientInputsOverdue: number;
}

export interface EpcDto extends ContractCurrency {
  projectId: string;
  contractModel: ContractModel;
  summary: EpcSummaryDto;
  deliverables: DeliverableDto[];
  packages: PackageDto[];
  clientInputs: ClientInputDto[];
  canEditDeliverables: boolean;
  canEditPackages: boolean;
  canEditClientInputs: boolean;
  /** Can record a late client input as a delay */
  canRecordDelay: boolean;
}
