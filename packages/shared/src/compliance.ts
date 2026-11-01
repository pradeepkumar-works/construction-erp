/**
 * Guarantees, insurance and licences register: bank guarantees, EMDs, insurance policies and licences,
 * company-wide or for one project, flagged as they near expiry (DOC_ALERT_DAYS, as for vehicle papers).
 */
import type { ComplianceDocKind, ComplianceDocStatus } from './enums';
import type { ExpiryState } from './maintenance';
import type { AttachmentDto } from './types';

/** Usual kinds of each entry, offered as suggestions; any other text is allowed. */
export const COMPLIANCE_CATEGORIES: Record<ComplianceDocKind, string[]> = {
  BANK_GUARANTEE: ['Performance guarantee', 'Mobilisation advance guarantee', 'Retention money guarantee', 'Bid security', 'Machinery advance guarantee'],
  EMD: ['Online deposit', 'Demand draft', 'Fixed deposit receipt', 'Bank guarantee'],
  INSURANCE: ["Contractor's all risk (CAR)", "Workmen's compensation", 'Third-party liability', 'Plant and machinery', 'Fire and allied perils'],
  LICENCE: ['Contractor registration', 'Labour licence (CLRA)', 'BOCW registration', 'GST registration', 'Trade licence', 'Explosives licence'],
};

/** What "amount" means for each kind. */
export const COMPLIANCE_AMOUNT_LABELS: Record<ComplianceDocKind, string> = {
  BANK_GUARANTEE: 'Guarantee amount',
  EMD: 'EMD amount',
  INSURANCE: 'Sum insured',
  LICENCE: 'Fee',
};

/** What "issuer" means for each kind. */
export const COMPLIANCE_ISSUER_LABELS: Record<ComplianceDocKind, string> = {
  BANK_GUARANTEE: 'Bank',
  EMD: 'Paid through',
  INSURANCE: 'Insurer',
  LICENCE: 'Issued by',
};

/** Only guarantees and EMDs can be invoked (encashed or forfeited). */
export const canBeInvoked = (kind: ComplianceDocKind) => kind === 'BANK_GUARANTEE' || kind === 'EMD';

export interface ComplianceDocDto {
  id: string;
  kind: ComplianceDocKind;
  category: string | null;
  reference: string;
  issuer: string | null;
  projectId: string | null;
  projectName: string | null;
  beneficiary: string | null;
  amount: string | null;
  margin: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  claimUntil: string | null;
  status: ComplianceDocStatus;
  closedOn: string | null;
  closeNote: string | null;
  renewedFromId: string | null;
  renewedById: string | null;
  note: string | null;
  /** Expiry of an active entry with an expiry date; null otherwise */
  state: ExpiryState | null;
  daysLeft: number | null;
  attachments: AttachmentDto[];
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceTotalsDto {
  active: number;
  /** Active entries expiring within DOC_ALERT_DAYS */
  expiring: number;
  /** Active entries past their expiry date: renew them or get them released */
  expired: number;
  /** Active bank guarantees */
  guaranteesOut: string;
  /** Margin money the banks hold against them */
  marginBlocked: string;
  /** EMDs paid and not yet refunded */
  emdOut: string;
}

export interface ComplianceRegisterDto {
  items: ComplianceDocDto[];
  /** Over every active entry the caller can see, whatever the filters */
  totals: ComplianceTotalsDto;
}

export interface ComplianceDocDetailDto extends ComplianceDocDto {
  /** Earlier entries this one renewed, newest first */
  history: ComplianceDocDto[];
}
