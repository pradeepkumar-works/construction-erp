import type { EquipmentOwnership, EquipmentPartKind, FuelNormUnit } from './enums';

/**
 * Fuel and fleet use (v5 item 93): fuel issued from the store into machines, each site's daily fuel position, a fuel
 * norm per machine checked against its logs, utilisation over a period, and the tyres and batteries on each machine.
 */

/** How far a machine's average may stray from its norm when no tolerance is set (%). */
export const FUEL_TOLERANCE_DEFAULT_PCT = 15;
/** The norm is checked over a machine's latest approved logs with fuel, this many of them. */
export const FUEL_NORM_LOGS = 10;
/** And only once it has at least this many. */
export const FUEL_NORM_MIN_LOGS = 5;
/** Hours a machine is available in a day on site, for utilisation. */
export const SHIFT_HOURS = 8;

/** The meter a machine reads: hours, or km for a vehicle whose norm is in km a litre. */
export const meterUnit = (unit: FuelNormUnit | null | undefined): 'h' | 'km' => (unit === 'KM_PER_LITRE' ? 'km' : 'h');

/** "4.5 litres an hour", "3.2 km a litre" */
export const fuelNormText = (norm: string | number, unit: FuelNormUnit) => `${Number(norm)} ${unit === 'KM_PER_LITRE' ? 'km a litre' : 'litres an hour'}`;

/** One fuel issue into a machine. */
export interface FuelIssueDto {
  entryId: string;
  entryNo: string;
  date: string;
  projectId: string;
  equipmentId: string | null;
  equipmentCode: string | null;
  equipmentName: string | null;
  itemName: string;
  unit: string;
  litres: string;
  meterReading: string | null;
  issuedTo: string | null;
  createdByName: string;
}

/** One fuel item at one site on a day: opening, in, out and closing. */
export interface FuelPositionRowDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  itemId: string;
  itemName: string;
  unit: string;
  opening: string;
  /** Receipts, transfers in, returns from site and adjustments up */
  received: string;
  /** Into machines (fuel issues) */
  issuedToMachines: string;
  /** Other issues, transfers out, returns to the supplier and adjustments down */
  otherOut: string;
  closing: string;
  /** Minimum level set for the item at the site, if any; closing below it shows */
  minLevel: string | null;
}

export interface FuelPositionDto {
  date: string;
  rows: FuelPositionRowDto[];
  /** The day's fuel issues into machines, newest first */
  issues: FuelIssueDto[];
  canIssue: boolean;
}

/** A machine's use over a period. Available = each day on site at the shift, or the hours logged on a longer day; days on site are days with an approved log. */
export interface UtilisationRowDto {
  equipmentId: string;
  code: string;
  name: string;
  category: string | null;
  ownership: EquipmentOwnership;
  projectName: string | null;
  daysOnSite: number;
  availableHours: string;
  workedHours: string;
  idleHours: string;
  breakdownHours: string;
  /** worked ÷ available, % with one decimal */
  utilisationPct: number | null;
  /** (available − breakdown) ÷ available */
  availabilityPct: number | null;
  /** Litres from the logs, and litres a working hour */
  fuelLitres: string;
  fuelPerHour: string | null;
}

export interface UtilisationGroupDto {
  /** null for the fleet total */
  category: string | null;
  machines: number;
  availableHours: string;
  workedHours: string;
  idleHours: string;
  breakdownHours: string;
  utilisationPct: number | null;
  availabilityPct: number | null;
}

export interface FleetUtilisationDto {
  /** null for all time */
  from: string | null;
  to: string | null;
  shiftHours: number;
  rows: UtilisationRowDto[];
  categories: UtilisationGroupDto[];
  fleet: UtilisationGroupDto;
}

/** A tyre or battery on a machine, with its life in hours or km. */
export interface EquipmentPartDto {
  id: string;
  equipmentId: string;
  kind: EquipmentPartKind;
  position: string | null;
  make: string | null;
  serialNo: string | null;
  fittedOn: string;
  fittedMeter: string | null;
  removedOn: string | null;
  removedMeter: string | null;
  removalReason: string | null;
  cost: string | null;
  maintenanceJobId: string | null;
  jobNo: string | null;
  stockEntryId: string | null;
  entryNo: string | null;
  note: string | null;
  /** Meter run from fitting to removal, or to the machine's latest reading while still on; null without readings */
  life: string | null;
  /** Days from fitting to removal, or to today */
  lifeDays: number;
  createdByName: string;
}

export interface EquipmentPartsDto {
  equipmentId: string;
  code: string;
  name: string;
  /** The machine's latest meter reading from its logs, fuel issues and job cards */
  currentMeter: string | null;
  meterUnit: 'h' | 'km';
  parts: EquipmentPartDto[];
  canEdit: boolean;
  canSeeCost: boolean;
}
