/**
 * Weighbridge (item 148, ARCHITECTURE "Weighbridge"). The Connector on the site computer reads the weighbridge's
 * indicator and sends each weight it held steady as a weighing. The store makes a ticket for each truck from its first
 * weight (loaded, on the way in) and its second (empty, on the way out); the net weight drafts the GRN against the
 * order, and the challan's quantity is checked against it. The figures here are shared by the API, the Stock ›
 * Weighbridge tab, the GRN form and the watch list.
 */

export const WEIGHBRIDGE_SOURCES = ['SERIAL', 'TCP'] as const;
export type WeighbridgeSource = (typeof WEIGHBRIDGE_SOURCES)[number];
export const WEIGHBRIDGE_SOURCE_LABELS: Record<WeighbridgeSource, string> = {
  SERIAL: "A serial port on the Connector's computer (COM3, /dev/ttyUSB0)",
  TCP: 'A network address on the site (the indicator, or its serial-to-network box)',
};

export const WEIGH_BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const;
/** Below this the bridge is taken as empty: a weight is a truck only from here. */
export const WEIGH_MIN_KG = 200;
/** A weight is taken once it holds this long. */
export const WEIGH_STABLE_SECONDS = 3;
/** The most a road weighbridge weighs. */
export const WEIGH_MAX_KG = 150_000;
/** A delivery is short when its net weight is below the challan by more than the larger of these. */
export const WEIGH_SHORT_TOLERANCE_PCT = 0.5;
export const WEIGH_SHORT_TOLERANCE_KG = 20;
/** Short deliveries from one supplier in this many days make a watch list warning, from this many loads. */
export const WEIGH_SHORT_DAYS = 30;
export const WEIGH_SHORT_LOADS = 2;

/** A weighbridge connection's settings: where the Connector reads the indicator, and when a weight counts. */
export interface WeighbridgeConfig {
  source: WeighbridgeSource;
  /** SERIAL: COM3 on Windows, /dev/ttyUSB0 on Linux */
  port?: string;
  baud?: number;
  /** TCP: the indicator's address on the site's network and its port */
  host?: string;
  tcpPort?: number;
  /** A truck from this weight (kg); default WEIGH_MIN_KG */
  minKg?: number;
  /** Seconds a weight must hold; default WEIGH_STABLE_SECONDS */
  stableSeconds?: number;
}

const UNIT_KG: Record<string, number> = { kg: 1, kgs: 1, kilogram: 1, kilograms: 1, mt: 1000, t: 1000, tonne: 1000, tonnes: 1000, ton: 1000, tons: 1000, qtl: 100, quintal: 100, quintals: 100 };

/** Kilograms in one of a unit, for the units a weighbridge can weigh in; null for anything else (cum, bags, nos). */
export function kgPerUnit(unit: string | null | undefined): number | null {
  if (!unit) return null;
  return UNIT_KG[unit.toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Kilograms as a quantity in a unit (3 decimals), or null when the unit is not a weight. */
export function kgToUnit(kg: number, unit: string | null | undefined): number | null {
  const f = kgPerUnit(unit);
  return f === null ? null : r3(kg / f);
}

/** A ticket's weights: the heavier is gross (loaded) and the lighter tare (empty), whichever came first. */
export function weighNet(first: number, second: number | null): { grossKg: number; tareKg: number; netKg: number } | null {
  if (second === null) return null;
  const grossKg = Math.max(first, second);
  const tareKg = Math.min(first, second);
  return { grossKg, tareKg, netKg: r3(grossKg - tareKg) };
}

/** What is wrong with a ticket's second weight, if anything. */
export function weighStepProblem(first: { kg: number; at: Date }, second: { kg: number; at: Date }): string | null {
  if (second.at.getTime() < first.at.getTime()) return 'The second weight is from before the first. Pick the weight taken when the truck came back on the bridge.';
  if (Math.abs(first.kg - second.kg) < WEIGH_MIN_KG) return `The two weights differ by only ${Math.round(Math.abs(first.kg - second.kg))} kg. Weigh the truck once loaded and once empty.`;
  return null;
}

export interface ShortCheck {
  challanKg: number;
  netKg: number;
  /** Challan less net: above zero the truck brought less than the challan says */
  shortKg: number;
  shortPct: number;
  allowanceKg: number;
  /** Short by more than the allowance */
  short: boolean;
}

/** The net weight against the challan's quantity in the order line's unit; null when the unit is not a weight or no challan quantity is known. */
export function shortSupply(netKg: number, challanQty: number | null, unit: string | null | undefined): ShortCheck | null {
  const f = kgPerUnit(unit);
  if (f === null || challanQty === null || !(challanQty > 0)) return null;
  const challanKg = r3(challanQty * f);
  const shortKg = r3(challanKg - netKg);
  const allowanceKg = Math.max(WEIGH_SHORT_TOLERANCE_KG, r3((challanKg * WEIGH_SHORT_TOLERANCE_PCT) / 100));
  return { challanKg, netKg, shortKg, shortPct: Math.round((shortKg / challanKg) * 10000) / 100, allowanceKg, short: shortKg > allowanceKg };
}

/** Kilograms a GRN booked above the ticket's net weight, beyond the same allowance; null when it is within it or the unit is not a weight. */
export function grnAboveNet(grnQty: number, netKg: number, unit: string | null | undefined): number | null {
  const f = kgPerUnit(unit);
  if (f === null) return null;
  const above = r3(grnQty * f - netKg);
  return above > Math.max(WEIGH_SHORT_TOLERANCE_KG, (netKg * WEIGH_SHORT_TOLERANCE_PCT) / 100) ? above : null;
}

export const WEIGH_TICKET_STATES = ['FIRST', 'WEIGHED', 'RECEIVED', 'CANCELLED'] as const;
export type WeighTicketState = (typeof WEIGH_TICKET_STATES)[number];
export const WEIGH_TICKET_STATE_LABELS: Record<WeighTicketState, string> = {
  FIRST: 'Waiting for the second weight',
  WEIGHED: 'Weighed, GRN to make',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

export function weighTicketState(t: { secondKg: unknown; stockEntryId: string | null; cancelledAt: unknown }): WeighTicketState {
  if (t.cancelledAt) return 'CANCELLED';
  if (t.stockEntryId) return 'RECEIVED';
  return t.secondKg === null || t.secondKg === undefined ? 'FIRST' : 'WEIGHED';
}

export interface WeighingDto {
  id: string;
  projectId: string;
  connectionId: string;
  connectionName: string;
  at: string;
  weightKg: string;
  /** How long the indicator held it */
  stableSeconds: number | null;
}

export interface WeighTicketWeightDto {
  kg: string;
  at: string;
  /** Typed by hand (the bridge's reading was not used) */
  typed: boolean;
}

export interface WeighTicketDto {
  id: string;
  ticketNo: string;
  projectId: string;
  projectName: string;
  vehicleNo: string;
  vendorId: string | null;
  vendorName: string | null;
  purchaseOrderId: string | null;
  poNo: string | null;
  purchaseOrderLineId: string | null;
  itemName: string | null;
  unit: string | null;
  challanNo: string | null;
  /** The challan's quantity, in the order line's unit */
  challanQty: string | null;
  first: WeighTicketWeightDto;
  second: WeighTicketWeightDto | null;
  grossKg: string | null;
  tareKg: string | null;
  netKg: string | null;
  /** The net weight in the order line's unit, when it is a weight */
  netQty: string | null;
  short: ShortCheck | null;
  state: WeighTicketState;
  stockEntryId: string | null;
  grnNo: string | null;
  /** What the GRN booked on the ticket's line */
  grnQty: string | null;
  /** Kilograms the GRN booked above the net weight, beyond the allowance */
  grnAboveNetKg: number | null;
  cancelReason: string | null;
  remarks: string | null;
  createdByName: string;
  createdAt: string;
}

/** Stock › Weighbridge: what is on the bridge, the trucks waiting, the tickets to receive and the latest done. */
export interface WeighbridgeBoardDto {
  /** Weighbridge connections on the user's sites */
  bridges: number;
  /** Weights the bridge took in the last day that no ticket uses */
  weighings: WeighingDto[];
  open: WeighTicketDto[];
  weighed: WeighTicketDto[];
  /** Received or cancelled in the last week */
  done: WeighTicketDto[];
}
