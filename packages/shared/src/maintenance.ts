/** Machinery maintenance and vehicle documents (v4 item 42): service due, papers and licences that expire. */
import type { EquipmentDocType, MaintenanceKind, MaintenanceStatus } from './enums';
import type { AttachmentDto } from './types';

/** Papers and licences are flagged this many days before they expire. */
export const DOC_ALERT_DAYS = 30;
/** A service is "due soon" within this many working hours or days of falling due. */
export const SERVICE_SOON_HOURS = 25;
export const SERVICE_SOON_DAYS = 7;

const DAY_MS = 86_400_000;
const dayNo = (d: string) => Math.floor(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY_MS);
/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => dayNo(to) - dayNo(from);

export type ExpiryState = 'VALID' | 'EXPIRING' | 'EXPIRED';

/** Where a paper or licence stands on `today`: expired, expiring within DOC_ALERT_DAYS, or valid. */
export function expiryState(validTo: string | null | undefined, today: string): { state: ExpiryState; daysLeft: number } | null {
  if (!validTo) return null;
  const daysLeft = daysBetween(today, validTo);
  return { state: daysLeft < 0 ? 'EXPIRED' : daysLeft <= DOC_ALERT_DAYS ? 'EXPIRING' : 'VALID', daysLeft };
}

export const EXPIRY_STATE_LABELS: Record<ExpiryState, string> = { VALID: 'Valid', EXPIRING: 'Expiring', EXPIRED: 'Expired' };

export type ServiceState = 'NOT_SET' | 'OK' | 'DUE_SOON' | 'OVERDUE';

export const SERVICE_STATE_LABELS: Record<ServiceState, string> = { NOT_SET: 'No schedule', OK: 'OK', DUE_SOON: 'Due soon', OVERDUE: 'Overdue' };

export interface ServiceInput {
  intervalHours: string | number | null;
  intervalDays: number | null;
  /** Last service date, or when the machine was added if never serviced */
  since: string | null;
  /** Hours worked since then (approved and pending logs) */
  hoursSince: number;
  today: string;
}

/**
 * Whether a machine is due for service, by working hours or by days since the last service, whichever comes first.
 * `hoursLeft` / `daysLeft` are negative once overdue and null when that interval is not set.
 */
export function serviceState(s: ServiceInput): { state: ServiceState; hoursLeft: number | null; daysLeft: number | null } {
  const iH = s.intervalHours === null || s.intervalHours === '' ? null : Number(s.intervalHours);
  const iD = s.intervalDays;
  if (!iH && !iD) return { state: 'NOT_SET', hoursLeft: null, daysLeft: null };
  const hoursLeft = iH ? Math.round((iH - s.hoursSince) * 10) / 10 : null;
  const daysLeft = iD && s.since ? iD - daysBetween(s.since, s.today) : null;
  const over = (hoursLeft !== null && hoursLeft <= 0) || (daysLeft !== null && daysLeft <= 0);
  const soon = (hoursLeft !== null && hoursLeft <= SERVICE_SOON_HOURS) || (daysLeft !== null && daysLeft <= SERVICE_SOON_DAYS);
  return { state: over ? 'OVERDUE' : soon ? 'DUE_SOON' : 'OK', hoursLeft, daysLeft };
}

/** A spare issued from the store against a job card. */
export interface MaintenanceSpareDto {
  entryId: string;
  entryNo: string;
  date: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
  /** Quantity × the item master's standard rate; null when the item has no rate */
  value: string | null;
}

export interface MaintenanceJobDto {
  id: string;
  jobNo: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  projectId: string | null;
  projectName: string | null;
  kind: MaintenanceKind;
  status: MaintenanceStatus;
  date: string;
  meterReading: string | null;
  description: string;
  workshop: string | null;
  workDone: string | null;
  closedDate: string | null;
  downtimeHours: string | null;
  labourCost: string;
  partsCost: string;
  /** Value of spares issued from the store */
  sparesValue: string;
  /** Labour + bought parts + spares from the store */
  totalCost: string;
  spares: MaintenanceSpareDto[];
  reportedById: string;
  reportedByName: string;
  closedByName: string | null;
  attachments: AttachmentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentDocumentDto {
  id: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  type: EquipmentDocType;
  number: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string;
  notes: string | null;
  state: ExpiryState;
  daysLeft: number;
  attachments: AttachmentDto[];
  createdAt: string;
}

export interface DriverDto {
  id: string;
  name: string;
  phone: string | null;
  licenceNo: string | null;
  licenceClass: string | null;
  licenceValidTo: string | null;
  licenceState: ExpiryState | null;
  daysLeft: number | null;
  equipmentId: string | null;
  equipmentCode: string | null;
  equipmentName: string | null;
  isActive: boolean;
  notes: string | null;
}

/** One machine's service position. */
export interface ServiceStatusDto {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  projectId: string | null;
  projectName: string | null;
  intervalHours: string | null;
  intervalDays: number | null;
  lastServiceDate: string | null;
  hoursSince: string;
  state: ServiceState;
  hoursLeft: number | null;
  daysLeft: number | null;
  /** An open service job card already raised for it */
  openServiceJobId: string | null;
}

export interface MaintenanceSummaryDto {
  /** Every active machine with a service schedule, overdue first, then due soon, then the rest */
  service: ServiceStatusDto[];
  /** Papers expired or expiring within DOC_ALERT_DAYS, soonest first */
  documentsDue: EquipmentDocumentDto[];
  /** Active drivers whose licence has expired or expires within DOC_ALERT_DAYS */
  licencesDue: DriverDto[];
  openJobs: number;
  openBreakdowns: number;
  /** Closed this month: count, downtime hours and total cost */
  closedThisMonth: number;
  downtimeHoursThisMonth: string;
  costThisMonth: string;
}
