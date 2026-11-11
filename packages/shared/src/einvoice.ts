/**
 * GST e-invoices and e-way bills (ARCHITECTURE "E-invoices and e-way bills"): the JSON NIC's IRP takes for an invoice
 * (INV-01 v1.1) and its e-way bill system takes for a consignment (GENEWAYBILL), when each is needed, what a record must
 * have before it can be sent (in words), the e-way bill's validity, the windows to cancel and extend, and the claims NIC
 * signs into an invoice's QR. Pure, so the API, the records and the test read the same rules. Money travels as decimal
 * strings and is worked in integer paise; the taxes are the ones the owning module stored, allocated over the lines so
 * the lines add up to them exactly.
 */
import type { GstDocumentKind, GstDocumentStatus, GstSourceKind } from './enums';
import { GST_STATES, gstStateCode } from './contract';
import { GSTIN_PATTERN } from './expense';

// ---------------------------------------------------------------------------------------------------------------------
// Codes

/** An HSN (goods) or SAC (services) code: 4, 6 or 8 digits. */
export const HSN_PATTERN = /^(?:[0-9]{4}|[0-9]{6}|[0-9]{8})$/;
/** A company under e-invoicing has a turnover over ₹5 crore, so its codes need at least six digits. */
export const EINVOICE_HSN_DIGITS = 6;

/** What is wrong with a typed HSN or SAC code, or null. */
export function hsnProblem(code: string | null | undefined): string | null {
  const c = code?.trim() ?? '';
  if (!c) return null;
  return HSN_PATTERN.test(c) ? null : 'An HSN or SAC code is 4, 6 or 8 digits';
}

/** An invoice or challan number as GST takes it: up to 16 letters, digits, / and -, not starting with 0, / or -. */
export const GST_DOC_NO_PATTERN = /^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/;

/** A vehicle's registration as the e-way bill takes it (OD02AB1234), or a temporary one (TR or TM and digits). */
export const VEHICLE_NO_PATTERN = /^(?:[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|T[RM][0-9A-Z]{6,13})$/;
/** A typed vehicle number without spaces, dots and dashes, in capitals. */
export const normaliseVehicleNo = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[\s.-]/g, '');

/** The units of quantity GST uses (UQC), from the units the item master is kept in; anything else is OTH. */
const UQC: Record<string, string> = {
  cum: 'CBM', m3: 'CBM', 'm³': 'CBM', cbm: 'CBM',
  bag: 'BAG', bags: 'BAG',
  kg: 'KGS', kgs: 'KGS',
  mt: 'MTS', tonne: 'MTS', tonnes: 'MTS', ton: 'MTS', t: 'MTS',
  qtl: 'QTL', quintal: 'QTL',
  nos: 'NOS', no: 'NOS', each: 'NOS', ea: 'NOS', pcs: 'PCS', pc: 'PCS',
  m: 'MTR', rm: 'MTR', rmt: 'MTR', mtr: 'MTR', metre: 'MTR', meter: 'MTR',
  sqm: 'SQM', m2: 'SQM', 'm²': 'SQM', sqft: 'SQF',
  ltr: 'LTR', l: 'LTR', litre: 'LTR', liter: 'LTR', kl: 'KLR',
  set: 'SET', sets: 'SET', box: 'BOX', roll: 'ROL', drum: 'DRM', bundle: 'BDL',
};
export const uqcOf = (unit: string | null | undefined) => UQC[(unit ?? '').trim().toLowerCase()] ?? 'OTH';

/** Why the IRP cancels an IRN (its codes). */
export const IRN_CANCEL_REASONS = { '1': 'Duplicate', '2': 'Data entry mistake', '3': 'Order cancelled', '4': 'Other' } as const;
export type IrnCancelReason = keyof typeof IRN_CANCEL_REASONS;
/** Why the e-way bill system cancels an e-way bill (its codes, in a different order from the IRP's). */
export const EWB_CANCEL_REASONS = { '1': 'Duplicate', '2': 'Order cancelled', '3': 'Data entry mistake', '4': 'Other' } as const;
export type EwbCancelReason = keyof typeof EWB_CANCEL_REASONS;
/** Why an e-way bill's validity is extended (its codes). */
export const EWB_EXTEND_REASONS = { '1': 'Natural calamity', '2': 'Law and order', '4': 'Transshipment', '5': 'Accident', '99': 'Other' } as const;
export type EwbExtendReason = keyof typeof EWB_EXTEND_REASONS;
/** How the goods go (NIC's codes); only road needs a vehicle number. */
export const TRANSPORT_MODES = { '1': 'Road', '2': 'Rail', '3': 'Air', '4': 'Ship' } as const;
export type TransportMode = keyof typeof TRANSPORT_MODES;
/** Regular, or over-dimensional cargo (which travels 20 km a day of validity, not 200). */
export const VEHICLE_TYPES = { R: 'Regular', O: 'Over-dimensional cargo' } as const;
export type VehicleType = keyof typeof VEHICLE_TYPES;

/** An RA bill's invoice number, as the GST register and its e-invoice report it: RA/<project code>/<bill no>. */
export const raInvoiceNo = (projectCode: string, billNo: number) => `RA/${projectCode}/${billNo}`;

/** Which kind of document each source gets. */
export const GST_SOURCE_DOC: Record<GstSourceKind, GstDocumentKind> = { RA_BILL: 'IRN', RMC_INVOICE: 'IRN', RMC_BATCH: 'EWB', STOCK_TRANSFER: 'EWB' };
/** A document that holds its source: being made or made, not cancelled or refused. */
export const isLiveGstStatus = (s: GstDocumentStatus) => s === 'PENDING' || s === 'ACTIVE';

// ---------------------------------------------------------------------------------------------------------------------
// Money in paise

/** Integer paise of a decimal string of rupees ("1250.5" → 125050); null when it is not one. */
export function gstPaise(amount: string | number): number | null {
  const m = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/.exec(String(amount).trim());
  if (!m) return null;
  const p = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -p : p;
}
const P = (amount: string | number) => gstPaise(amount) ?? 0;
/** Rupees as the JSON number NIC takes, to the paisa. */
const rupees = (p: number) => Math.round(p) / 100;
/** Paise at a percentage rate, rounded half up. */
const atRate = (p: number, rate: number) => Math.round((p * rate) / 100);

/** GST on a value split as the posting service splits it: IGST across states, else CGST rounded down and SGST the rest. */
export function splitGst(gstPaise: number, interState: boolean): { igst: number; cgst: number; sgst: number } {
  if (interState) return { igst: gstPaise, cgst: 0, sgst: 0 };
  const cgst = Math.floor(gstPaise / 2);
  return { igst: 0, cgst, sgst: gstPaise - cgst };
}

// ---------------------------------------------------------------------------------------------------------------------
// Dates

/** "2026-11-10" → "10/11/2026", as both systems take dates. */
export const gstDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const IST_MS = 330 * 60_000;
const ymdIst = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
/** The IRP's and e-way bill system's own time format, in India's time: "2026-11-10 14:05:00". */
export const gstDateTime = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 19).replace('T', ' ');
/** Reads "2026-11-10 14:05:00" or "10/11/2026 02:05:00 PM" (India's time) back into an instant; null when it is neither. */
export function readGstDateTime(s: string | null | undefined): Date | null {
  const t = (s ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) - IST_MS);
  m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)?$/i.exec(t);
  if (!m) return null;
  let h = +m[4] % (m[7] ? 12 : 24);
  if (m[7]?.toUpperCase() === 'PM') h += 12;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], h, +m[5], +(m[6] ?? 0)) - IST_MS);
}

// ---------------------------------------------------------------------------------------------------------------------
// Parties and addresses

/** A seller, buyer or place goods move between, as the record knows it. */
export interface GstParty {
  /** Null for an unregistered buyer */
  gstin: string | null;
  legalName: string;
  /** The address as typed, with its PIN code somewhere in it */
  address: string | null;
  /** Who it is, for the words of a problem: "the company", "Acme Builders", "site Ring Road" */
  who: string;
  /** Where to fix its address and GSTIN, for the words of a problem: "on Company settings" */
  fixAt: string;
  /** Its GST state when it has no GSTIN to read it from (an unregistered client) */
  stateCode?: string | null;
}

/** An address as GST takes it: two lines of up to 100 characters, a place of 3 to 50, and the PIN code. */
export interface GstAddress {
  addr1: string;
  addr2: string | null;
  place: string;
  pin: number;
}

/**
 * Reads a typed address into GST's parts: the PIN is the last six-digit number not starting with 0, the place the last
 * part before it that is not a state's name, and the lines the rest. Null when there is no PIN or nothing else.
 */
export function readGstAddress(text: string | null | undefined): GstAddress | null {
  const t = (text ?? '').trim();
  const pins = [...t.matchAll(/(?<![0-9])([1-9][0-9]{2}) ?([0-9]{3})(?![0-9])/g)];
  const last = pins[pins.length - 1];
  if (!last) return null;
  const pin = Number(last[1] + last[2]);
  const states = new Set(Object.values(GST_STATES).map((s) => s.toLowerCase()));
  const parts = (t.slice(0, last.index) + t.slice(last.index! + last[0].length))
    .split(/[\n,;]+/)
    .map((p) => p.replace(/\b(?:pin(?: ?code)?|pincode)\b[:.]?/gi, '').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, ''))
    .filter((p) => p && !states.has(p.toLowerCase()) && p.toLowerCase() !== 'india');
  if (!parts.length) return null;
  const place = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const lines = (parts.length > 1 ? parts.slice(0, -1) : parts).join(', ');
  return { addr1: lines.slice(0, 100), addr2: lines.length > 100 ? lines.slice(100, 200) : null, place: place.slice(0, 50), pin };
}

function partyProblems(p: GstParty, registered: boolean): string[] {
  const out: string[] = [];
  if (registered && !GSTIN_PATTERN.test(p.gstin ?? '')) out.push(p.gstin ? `The GSTIN of ${p.who} (${p.gstin}) is not a well-formed GSTIN: correct it ${p.fixAt}` : `Set the GSTIN of ${p.who} ${p.fixAt}`);
  if (p.legalName.trim().length < 3) out.push(`Give ${p.who} a legal name of at least 3 characters ${p.fixAt}`);
  const a = readGstAddress(p.address);
  if (!a) out.push(p.address?.trim() ? `Add the PIN code to the address of ${p.who} ${p.fixAt}` : `Add the address of ${p.who}, with its PIN code, ${p.fixAt}`);
  else if (a.place.length < 3) out.push(`Add the town or city to the address of ${p.who} ${p.fixAt}`);
  return out;
}

const stateOf = (p: GstParty) => gstStateCode(p.gstin) ?? p.stateCode ?? null;

// ---------------------------------------------------------------------------------------------------------------------
// E-invoice (IRN)

/** One line of an invoice: a works bill is one service line; a ready-mix bill its concrete and its pumping. */
export interface EinvoiceLine {
  description: string;
  /** HSN for goods, SAC for a service */
  hsn: string | null;
  isService: boolean;
  /** Decimal strings; a service line without a quantity goes as 1 OTH at its value */
  quantity: string | null;
  unit: string | null;
  taxable: string;
  gstRate: string;
}

/** An invoice as its module stored it. */
export interface EinvoiceSource {
  docNo: string;
  /** YYYY-MM-DD */
  docDate: string;
  seller: GstParty;
  buyer: GstParty;
  /** GST state code the supply is made in */
  placeOfSupply: string | null;
  lines: EinvoiceLine[];
  /** The taxes the module stored for the whole bill, which the lines are allocated to add up to */
  igst: string;
  cgst: string;
  sgst: string;
  /** Where a line's code is set, for the words of a problem: "on Company settings or on the bill" */
  hsnFixAt: string;
}

/** When the IRP must see an invoice: a buyer with a GSTIN, and a company whose turnover put it under e-invoicing by the bill's date. */
export function einvoiceNeeded(f: { buyerGstin: string | null; docDate: string; einvoiceFrom: string | null }): { needed: boolean; reason: string } {
  if (!f.buyerGstin) return { needed: false, reason: 'The client has no GSTIN, so no e-invoice is made (a bill to an unregistered buyer is B2C)' };
  if (!f.einvoiceFrom) return { needed: false, reason: 'The company is not under e-invoicing: set the date it started on Company settings when its turnover passes ₹5 crore' };
  if (f.docDate < f.einvoiceFrom) return { needed: false, reason: `Dated before the company came under e-invoicing on ${f.einvoiceFrom}` };
  return { needed: true, reason: 'A bill to a registered client, from a company under e-invoicing' };
}

/** Every line's taxes, allocated so the lines add up to the stored totals: each at its rate, the last taking what is left. */
function allocateTaxes(lines: { taxable: number; rate: number }[], totals: { igst: number; cgst: number; sgst: number }) {
  const inter = totals.igst !== 0;
  const out = lines.map((l) => splitGst(atRate(l.taxable, l.rate), inter));
  if (out.length) {
    const last = out[out.length - 1];
    for (const k of ['igst', 'cgst', 'sgst'] as const) last[k] += totals[k] - out.reduce((s, x) => s + x[k], 0);
  }
  return out;
}

/** The GST rates the IRP takes on a line (GstRt). */
export const IRP_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28] as const;
const ratesInWords = `${IRP_GST_RATES.slice(0, -1).join(', ')} or ${IRP_GST_RATES[IRP_GST_RATES.length - 1]}%`;

/** Days after an invoice's date that a company with turnover of ₹10 crore or more may still report it to the IRP. */
export const EINVOICE_REPORT_DAYS = 30;

/**
 * What to know before making the IRN, which does not stop it: an invoice older than 30 days, which the IRP refuses from a
 * company with turnover of ₹10 crore or more and takes from a smaller one. The date sent stays the bill's own.
 */
export function einvoiceWarnings(s: EinvoiceSource, now: Date): string[] {
  const days = Math.round((Date.parse(`${ymdIst(now)}T00:00:00Z`) - Date.parse(`${s.docDate}T00:00:00Z`)) / 86_400_000);
  return days > EINVOICE_REPORT_DAYS
    ? [`The bill is dated ${gstDate(s.docDate)}, ${days} days ago. The IRP refuses an invoice more than ${EINVOICE_REPORT_DAYS} days old from a company with turnover of ₹10 crore or more; below that it takes it`]
    : [];
}

/** What the record must have before the IRP can take it, each in words that say what to fill and where. Empty when it can go. */
export function einvoiceProblems(s: EinvoiceSource): string[] {
  const out = [...partyProblems(s.seller, true), ...partyProblems(s.buyer, true)];
  if (!GST_DOC_NO_PATTERN.test(s.docNo)) out.push(`The invoice number ${s.docNo} is not one GST takes: up to 16 letters, digits, / and -, not starting with 0, / or -`);
  if (!s.lines.length || s.lines.every((l) => P(l.taxable) <= 0)) out.push('The bill has no taxable value to report');
  for (const l of s.lines) {
    const code = l.hsn?.trim() ?? '';
    if (!code) out.push(`Set the ${l.isService ? 'SAC' : 'HSN'} code of "${l.description}" ${s.hsnFixAt}`);
    else if (!HSN_PATTERN.test(code) || code.length < EINVOICE_HSN_DIGITS) out.push(`The ${l.isService ? 'SAC' : 'HSN'} code of "${l.description}" (${code}) needs ${EINVOICE_HSN_DIGITS} or 8 digits for e-invoicing: correct it ${s.hsnFixAt}`);
    if (!(IRP_GST_RATES as readonly number[]).includes(Number(l.gstRate))) out.push(`The GST rate of "${l.description}" (${l.gstRate}%) is not one the IRP takes: it takes ${ratesInWords}`);
  }
  const sellerState = stateOf(s.seller);
  const pos = s.placeOfSupply;
  if (!pos || !GST_STATES[pos]) out.push('The place of supply is not known: set the client\'s GST state');
  else if (sellerState && (P(s.igst) !== 0) !== (pos !== sellerState)) {
    out.push(P(s.igst) !== 0 ? `The bill charges IGST but is supplied within ${GST_STATES[pos]}, where the company is registered` : `The bill charges CGST and SGST but is supplied in ${GST_STATES[pos]}, outside the company's state`);
  }
  return out;
}

const sellerDtls = (p: GstParty) => {
  const a = readGstAddress(p.address)!;
  return { Gstin: p.gstin!, LglNm: p.legalName.slice(0, 100), Addr1: a.addr1, ...(a.addr2 ? { Addr2: a.addr2 } : {}), Loc: a.place, Pin: a.pin, Stcd: stateOf(p)! };
};

/** NIC's INV-01 schema (v1.1) for a bill whose `einvoiceProblems` are empty. */
export function einvoicePayload(s: EinvoiceSource) {
  const lines = s.lines.map((l) => ({ ...l, t: P(l.taxable), rate: Number(l.gstRate) }));
  const taxes = allocateTaxes(lines.map((l) => ({ taxable: l.t, rate: l.rate })), { igst: P(s.igst), cgst: P(s.cgst), sgst: P(s.sgst) });
  const items = lines.map((l, i) => {
    const tax = taxes[i];
    const qty = l.quantity !== null ? Number(l.quantity) : 1;
    // The price per unit is the line's own: its value over its quantity, never a rate read from elsewhere today.
    const unitPrice = l.quantity !== null && qty > 0 ? Math.round((l.t / qty) * 10) / 1000 : rupees(l.t);
    return {
      SlNo: String(i + 1),
      PrdDesc: l.description.slice(0, 300),
      IsServc: l.isService ? 'Y' : 'N',
      HsnCd: l.hsn!.trim(),
      Qty: qty,
      Unit: l.quantity !== null ? uqcOf(l.unit) : 'OTH',
      UnitPrice: unitPrice,
      TotAmt: rupees(l.t),
      Discount: 0,
      AssAmt: rupees(l.t),
      GstRt: l.rate,
      IgstAmt: rupees(tax.igst),
      CgstAmt: rupees(tax.cgst),
      SgstAmt: rupees(tax.sgst),
      TotItemVal: rupees(l.t + tax.igst + tax.cgst + tax.sgst),
    };
  });
  const sum = (k: 'igst' | 'cgst' | 'sgst') => taxes.reduce((a, t) => a + t[k], 0);
  const ass = lines.reduce((a, l) => a + l.t, 0);
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: s.docNo, Dt: gstDate(s.docDate) },
    SellerDtls: sellerDtls(s.seller),
    BuyerDtls: { ...sellerDtls(s.buyer), Pos: s.placeOfSupply! },
    ItemList: items,
    ValDtls: { AssVal: rupees(ass), CgstVal: rupees(sum('cgst')), SgstVal: rupees(sum('sgst')), IgstVal: rupees(sum('igst')), RndOffAmt: 0, TotInvVal: rupees(ass + sum('igst') + sum('cgst') + sum('sgst')) },
  };
}
export type EinvoicePayload = ReturnType<typeof einvoicePayload>;

/**
 * The claims NIC signs into an invoice's QR code (the QR's JWT carries them as its `data`): both GSTINs, the number,
 * type, date and value, how many lines, the main line's code, the IRN and its date.
 */
export function qrText(p: EinvoicePayload, irn: string, irnAt: Date): string {
  const main = [...p.ItemList].sort((a, b) => b.AssAmt - a.AssAmt)[0];
  return JSON.stringify({
    SellerGstin: p.SellerDtls.Gstin,
    BuyerGstin: p.BuyerDtls.Gstin,
    DocNo: p.DocDtls.No,
    DocTyp: p.DocDtls.Typ,
    DocDt: p.DocDtls.Dt,
    TotInvVal: p.ValDtls.TotInvVal,
    ItemCnt: p.ItemList.length,
    MainHsnCode: main?.HsnCd ?? '',
    Irn: irn,
    IrnDt: gstDateTime(irnAt),
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// E-way bill

/** Over this consignment value (with tax) a movement of goods needs an e-way bill. */
export const EWAY_THRESHOLD = '50000';

export function ewayNeeded(totalValue: string): { needed: boolean; reason: string } {
  return P(totalValue) > P(EWAY_THRESHOLD)
    ? { needed: true, reason: 'The goods are worth more than ₹50,000, so they need an e-way bill to move' }
    : { needed: false, reason: 'Goods worth ₹50,000 or less move without an e-way bill, unless the state asks for one' };
}

/** One line of goods: an item (or the concrete) with its HSN, quantity and taxable value. */
export interface EwayLine {
  name: string;
  hsn: string | null;
  quantity: string;
  unit: string;
  taxable: string;
  gstRate: string;
}

/** A consignment as its module knows it, and what the person sending it typed. */
export interface EwaySource {
  /** Supply to a customer, or the company's own goods moving between its places */
  purpose: 'SUPPLY' | 'OWN_USE';
  docNo: string;
  docDate: string;
  /** Seller and buyer; for own use both are the company */
  from: GstParty;
  to: GstParty;
  /** Where the goods leave from and arrive, when not the parties' own addresses (a plant, a site) */
  dispatchFrom: GstParty;
  shipTo: GstParty;
  lines: EwayLine[];
  igst: string;
  cgst: string;
  sgst: string;
  hsnFixAt: string;
}

/** How the goods go, as the person sending them typed it. */
export interface EwayTransport {
  mode: TransportMode;
  vehicleNo: string | null;
  vehicleType: VehicleType;
  distanceKm: number | null;
}

export const EWAY_MAX_KM = 4000;

/** What the consignment's record must have before an e-way bill can be made, each saying what to fill and where. */
export function ewayProblems(s: EwaySource): string[] {
  const out = [...partyProblems(s.from, true)];
  if (s.purpose === 'SUPPLY') out.push(...partyProblems(s.to, !!s.to.gstin));
  out.push(...partyProblems(s.dispatchFrom, false).filter((p) => !out.includes(p)), ...partyProblems(s.shipTo, false).filter((p) => !out.includes(p)));
  if (!GST_DOC_NO_PATTERN.test(s.docNo)) out.push(`The challan number ${s.docNo} is not one GST takes: up to 16 letters, digits, / and -, not starting with 0, / or -`);
  if (!s.lines.length) out.push('Nothing is on the challan');
  for (const l of s.lines) {
    const code = l.hsn?.trim() ?? '';
    if (!code) out.push(`Set the HSN code of ${l.name} ${s.hsnFixAt}`);
    else if (!HSN_PATTERN.test(code)) out.push(`The HSN code of ${l.name} (${code}) is not 4, 6 or 8 digits: correct it ${s.hsnFixAt}`);
    // NIC's e-way bill JSON carries the HSN as a number, which would drop the leading 0 of chapters 01 to 09.
    else if (code.startsWith('0')) out.push(`The HSN code of ${l.name} (${code}) starts with 0, which the e-way bill system's JSON cannot carry: make this e-way bill on the e-way bill portal`);
    if (P(l.taxable) <= 0) out.push(`${l.name} has no value: set its rate ${s.hsnFixAt}`);
  }
  return out;
}

/** What the e-way bill form must have, each saying what to fill. */
export function ewayTransportProblems(t: EwayTransport): string[] {
  const out: string[] = [];
  if (!TRANSPORT_MODES[t.mode]) out.push('Choose how the goods go');
  if (t.mode === '1') {
    const v = normaliseVehicleNo(t.vehicleNo);
    if (!v) out.push('Type the vehicle number, for example OD02AB1234');
    else if (!VEHICLE_NO_PATTERN.test(v)) out.push(`${t.vehicleNo} is not a vehicle number the e-way bill takes: type it as on the plate, for example OD02AB1234`);
  }
  if (t.distanceKm === null || !Number.isInteger(t.distanceKm) || t.distanceKm < 1 || t.distanceKm > EWAY_MAX_KM) out.push(`Type the distance by road in whole kilometres, 1 to ${EWAY_MAX_KM}`);
  return out;
}

/** Days of validity: one per 200 km (20 km for over-dimensional cargo), at least one. */
export const ewayDays = (distanceKm: number, vehicleType: VehicleType) => Math.max(1, Math.ceil(distanceKm / (vehicleType === 'O' ? 20 : 200)));

/**
 * When an e-way bill runs out: each day ends at midnight in India, the first at the midnight after the day it was made
 * (rule 138(10)), so a bill made on the 10th for 150 km is good until the end of the 11th.
 */
export function ewayValidUntil(from: Date, distanceKm: number, vehicleType: VehicleType): Date {
  const d = new Date(`${ymdIst(from)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ewayDays(distanceKm, vehicleType) + 1);
  return new Date(d.getTime() - IST_MS - 1000);
}

/** NIC's GENEWAYBILL JSON for a consignment whose `ewayProblems` are empty. */
export function ewayPayload(s: EwaySource, t: EwayTransport) {
  const lines = s.lines.map((l) => ({ ...l, t: P(l.taxable), rate: Number(l.gstRate) }));
  const own = s.purpose === 'OWN_USE';
  const taxes = own ? lines.map(() => ({ igst: 0, cgst: 0, sgst: 0 })) : allocateTaxes(lines.map((l) => ({ taxable: l.t, rate: l.rate })), { igst: P(s.igst), cgst: P(s.cgst), sgst: P(s.sgst) });
  const inter = !own && P(s.igst) !== 0;
  const from = readGstAddress(s.dispatchFrom.address)!;
  const to = readGstAddress(s.shipTo.address)!;
  const fromState = Number(stateOf(s.from));
  const toGstin = own ? s.from.gstin! : (s.to.gstin ?? 'URP');
  const toState = own ? fromState : Number(stateOf(s.to) ?? stateOf(s.shipTo) ?? 0);
  const sum = (k: 'igst' | 'cgst' | 'sgst') => taxes.reduce((a, t) => a + t[k], 0);
  const value = lines.reduce((a, l) => a + l.t, 0);
  return {
    supplyType: 'O',
    subSupplyType: own ? '5' : '8',
    subSupplyDesc: own ? '' : 'Supply on delivery challan',
    docType: 'CHL',
    docNo: s.docNo,
    docDate: gstDate(s.docDate),
    fromGstin: s.from.gstin!,
    fromTrdName: s.from.legalName.slice(0, 100),
    fromAddr1: from.addr1,
    fromAddr2: from.addr2 ?? '',
    fromPlace: from.place,
    fromPincode: from.pin,
    actFromStateCode: Number(stateOf(s.dispatchFrom) ?? fromState),
    fromStateCode: fromState,
    toGstin,
    toTrdName: (own ? s.from : s.to).legalName.slice(0, 100),
    toAddr1: to.addr1,
    toAddr2: to.addr2 ?? '',
    toPlace: to.place,
    toPincode: to.pin,
    // Where the goods actually go: the ship-to place's state, which may differ from the buyer's.
    actToStateCode: Number(stateOf(s.shipTo) ?? toState),
    toStateCode: toState,
    transactionType: 1,
    otherValue: 0,
    totalValue: rupees(value),
    cgstValue: rupees(sum('cgst')),
    sgstValue: rupees(sum('sgst')),
    igstValue: rupees(sum('igst')),
    cessValue: 0,
    cessNonAdvolValue: 0,
    totInvValue: rupees(value + sum('igst') + sum('cgst') + sum('sgst')),
    transMode: t.mode,
    transDistance: String(t.distanceKm),
    transporterId: '',
    transporterName: '',
    transDocNo: '',
    transDocDate: '',
    vehicleNo: t.mode === '1' ? normaliseVehicleNo(t.vehicleNo) : '',
    vehicleType: t.vehicleType,
    itemList: lines.map((l) => ({
      productName: l.name.slice(0, 100),
      productDesc: l.name.slice(0, 100),
      hsnCode: Number(l.hsn!.trim()), // ewayProblems refuses a code starting with 0, so nothing is lost
      quantity: Number(l.quantity),
      qtyUnit: uqcOf(l.unit),
      cgstRate: own || inter ? 0 : l.rate / 2,
      sgstRate: own || inter ? 0 : l.rate / 2,
      igstRate: !own && inter ? l.rate : 0,
      cessRate: 0,
      cessNonadvol: 0,
      taxableAmount: rupees(l.t),
    })),
  };
}
export type EwayPayload = ReturnType<typeof ewayPayload>;

// ---------------------------------------------------------------------------------------------------------------------
// Windows

export const CANCEL_WINDOW_HOURS = 24;
export const EXTEND_WINDOW_HOURS = 8;

/** An IRN or e-way bill can be cancelled only within 24 hours of being made; after that a credit note undoes it. */
export function cancelWindowProblem(kind: GstDocumentKind, madeAt: Date, now: Date): string | null {
  const until = new Date(madeAt.getTime() + CANCEL_WINDOW_HOURS * 3600_000);
  if (now <= until) return null;
  return kind === 'IRN'
    ? `The IRN was acknowledged more than ${CANCEL_WINDOW_HOURS} hours ago, so the IRP will not cancel it: raise a credit note against the bill instead`
    : `The e-way bill was made more than ${CANCEL_WINDOW_HOURS} hours ago, so it cannot be cancelled; it runs out on its own`;
}

/** The latest a document can be cancelled. */
export const cancelBy = (madeAt: Date) => new Date(madeAt.getTime() + CANCEL_WINDOW_HOURS * 3600_000);

/** An e-way bill's validity can be extended only from 8 hours before it runs out to 8 hours after. */
export function ewayExtendProblem(validUntil: Date, now: Date): string | null {
  const opens = validUntil.getTime() - EXTEND_WINDOW_HOURS * 3600_000;
  const closes = validUntil.getTime() + EXTEND_WINDOW_HOURS * 3600_000;
  if (now.getTime() < opens) return `An e-way bill can be extended only in the ${EXTEND_WINDOW_HOURS} hours before it runs out, from ${gstDateTime(new Date(opens))}`;
  if (now.getTime() > closes) return `The e-way bill ran out more than ${EXTEND_WINDOW_HOURS} hours ago: make a new one`;
  return null;
}

/** The words a refused change says when its record has a live IRN or e-way bill. */
export function liveGstDocWords(kind: GstDocumentKind, number: string | null): string {
  return kind === 'IRN'
    ? `This bill has e-invoice IRN ${number ?? '(being made)'}: cancel the IRN within ${CANCEL_WINDOW_HOURS} hours of its acknowledgement first, or raise a credit note`
    : `This has e-way bill ${number ?? '(being made)'}: cancel the e-way bill first`;
}

// ---------------------------------------------------------------------------------------------------------------------
// What the records show

/** One IRN or e-way bill, as its record shows it. */
export interface GstDocumentDto {
  id: string;
  kind: GstDocumentKind;
  sourceKind: GstSourceKind;
  sourceId: string;
  docNo: string;
  status: GstDocumentStatus;
  /** FAKE (stand-in numbers) or GSP */
  provider: string;
  number: string | null;
  ackNo: string | null;
  ackAt: string | null;
  validUntil: string | null;
  signedQr: string | null;
  vehicleNo: string | null;
  distanceKm: number | null;
  extensions: number;
  error: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelRemark: string | null;
  createdByName: string;
  createdAt: string;
}

/** What a record can do about its IRN or e-way bill, and what it has done. */
export interface GstSourceStateDto {
  kind: GstDocumentKind;
  sourceKind: GstSourceKind;
  sourceId: string;
  docNo: string;
  /** False when the record never gets one (a bill to an unregistered client, a company not under e-invoicing) */
  offered: boolean;
  needed: boolean;
  /** Why it is or is not needed, in words */
  reason: string;
  /** What to fill before it can be made, in words; empty when it can go */
  problems: string[];
  /** What to know before making it, which does not stop it (an invoice older than 30 days) */
  warnings: string[];
  /** The one being made or made, if any */
  live: GstDocumentDto | null;
  /** Earlier ones: cancelled or refused */
  history: GstDocumentDto[];
  canGenerate: boolean;
  canCancel: boolean;
  canExtend: boolean;
  /** Why it cannot be cancelled or extended now, in words */
  cancelProblem: string | null;
  extendProblem: string | null;
  /** The latest it can be cancelled */
  cancelBy: string | null;
  /** E-way bill: what the form starts with (the challan's truck, the value it travels at) */
  vehicleNo: string | null;
  value: string | null;
  /** False when the server has no GST provider set up (GST_PROVIDER) */
  providerReady: boolean;
  providerProblem: string | null;
}
