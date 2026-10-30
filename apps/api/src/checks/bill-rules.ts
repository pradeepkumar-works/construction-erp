/**
 * The rules behind bill checks (AI item 69), as plain functions of a bill's facts so each can be tested on its own
 * (`src/scripts/bill-checks-test.ts`). A rule returns one tick when it passes, or one flag per line or record it found.
 * Keys carry the figures they are about, so a flag accepted on one version of a bill comes back if the bill changes.
 */

export interface Link {
  label: string;
  href: string;
}

export interface Check {
  key: string;
  ok: boolean;
  title: string;
  detail: string | null;
  links: Link[];
}

import { ENGINE_HOURS_TOLERANCE } from '@erp/shared';

/** Rupee and quantity amounts within this much are the same (rounding on each line). */
const MONEY_TOLERANCE = 1;
const QTY_TOLERANCE = 0.0005;

/** ₹4,12,000 or ₹412.50, Indian grouping. */
export const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
export const qty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const pctText = (n: number) => `${qty(n)}%`;
const fig = (n: number) => String(Math.round(n * 1000) / 1000);
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const flag = (key: string, title: string, detail: string | null = null, links: Link[] = []): Check => ({ key, ok: false, title, detail, links });
/** The rule's tick when it found nothing, else its flags. */
const rule = (key: string, passTitle: string, flags: Check[]): Check[] => (flags.length ? flags : [{ key, ok: true, title: passTitle, detail: null, links: [] }]);

/** Figures that should equal what the bill's own terms give; one flag lists every one that does not. */
function totalsRule(key: string, passTitle: string, failTitle: string, parts: { label: string; expected: number; actual: number }[]): Check[] {
  const off = parts.filter((p) => Math.abs(p.expected - p.actual) > MONEY_TOLERANCE);
  if (!off.length) return rule(key, passTitle, []);
  const detail = off.map((p) => `${p.label} is ${inr(p.actual)}, should be ${inr(p.expected)}`).join('; ');
  return [flag(`${key}:${off.map((p) => fig(p.actual)).join(':')}`, failTitle, detail)];
}

const pctOf = (base: number, pct: number) => Math.round(base * pct) / 100;

// ---------------------------------------------------------------------------------------------------------------------
// Vendor bills: against the PO and the GRNs.

export interface VendorBillFacts {
  invoiceNo: string;
  freight: number;
  /** PO freight less what other bills on the PO took. */
  poFreightLeft: number;
  subtotal: number;
  gstAmount: number;
  total: number;
  lines: {
    id: string;
    no: number;
    item: string;
    unit: string;
    qty: number;
    rate: number;
    gstRate: number;
    amount: number;
    gstAmount: number;
    poRate: number;
    poGstRate: number;
    /** Received against this PO line, and the GRNs it came on. */
    received: number;
    receipts: (Link & { qty: number })[];
    /** On other bills of this PO line that are not rejected. */
    billedElsewhere: number;
    otherBills: (Link & { qty: number })[];
  }[];
  /** Other bills or expenses for the same invoice of the same supplier (same GSTIN). */
  duplicates: Link[];
}

export function vendorBillChecks(f: VendorBillFacts): Check[] {
  const rates = f.lines
    .filter((l) => l.rate > l.poRate + 0.005)
    .map((l) => flag(`rate:${l.id}:${fig(l.rate)}`, `Rate ${inr(l.rate)} is above PO rate ${inr(l.poRate)} on line ${l.no}`, l.item));

  const quantities = f.lines
    .filter((l) => l.qty > l.received - l.billedElsewhere + QTY_TOLERANCE)
    .map((l) => {
      const grns = listOf(l.receipts.map((r) => r.label));
      const links = [...l.receipts, ...l.otherBills].map(({ label, href }) => ({ label, href }));
      const key = `qty:${l.id}:${fig(l.qty)}:${fig(l.received - l.billedElsewhere)}`;
      if (!l.receipts.length) return flag(key, `Quantity ${qty(l.qty)} ${l.unit} billed on line ${l.no}, nothing received yet`, l.item, links);
      if (l.billedElsewhere <= 0) return flag(key, `Quantity ${qty(l.qty)} ${l.unit} is more than received on ${grns} (${qty(l.received)} ${l.unit})`, `Line ${l.no}, ${l.item}`, links);
      const left = Math.max(0, l.received - l.billedElsewhere);
      if (left <= 0)
        return flag(
          key,
          `${qty(l.qty)} ${l.unit} on line ${l.no} is already billed on ${listOf(l.otherBills.map((b) => b.label))}`,
          `${l.item}: ${qty(l.received)} ${l.unit} received on ${grns}, all of it billed before`,
          links,
        );
      return flag(
        key,
        `Quantity ${qty(l.qty)} ${l.unit} is more than the ${qty(left)} ${l.unit} left to bill`,
        `Line ${l.no}, ${l.item}: ${qty(l.received)} ${l.unit} received on ${grns}, ${qty(l.billedElsewhere)} ${l.unit} already on ${listOf(l.otherBills.map((b) => b.label))}`,
        links,
      );
    });

  const gstRates = f.lines
    .filter((l) => Math.abs(l.gstRate - l.poGstRate) > 0.001)
    .map((l) => flag(`gst-rate:${l.id}:${fig(l.gstRate)}`, `GST ${pctText(l.gstRate)} on line ${l.no} where the PO has ${pctText(l.poGstRate)}`, l.item));

  const freight =
    f.freight > Math.max(0, f.poFreightLeft) + MONEY_TOLERANCE
      ? [flag(`freight:${fig(f.freight)}`, `Freight ${inr(f.freight)} is above the ${inr(Math.max(0, f.poFreightLeft))} left on the PO`)]
      : [];

  const duplicates = f.duplicates.map((d) => flag(`duplicate:${d.href}`, `Invoice ${f.invoiceNo} already billed on ${d.label}`, null, [d]));

  const lineParts = f.lines.flatMap((l) => [
    { label: `Line ${l.no} amount`, expected: Math.round(l.qty * l.rate * 100) / 100, actual: l.amount },
    { label: `Line ${l.no} GST`, expected: pctOf(l.amount, l.gstRate), actual: l.gstAmount },
  ]);
  const sum = (pick: (l: VendorBillFacts['lines'][number]) => number) => f.lines.reduce((s, l) => s + pick(l), 0);
  const totals = totalsRule('totals', 'GST and totals add up', 'GST does not add up', [
    ...lineParts,
    { label: 'Subtotal', expected: sum((l) => l.amount), actual: f.subtotal },
    { label: 'GST', expected: sum((l) => l.gstAmount), actual: f.gstAmount },
    { label: 'Total', expected: f.subtotal + f.gstAmount + f.freight, actual: f.total },
  ]);

  // Most serious first: the summary line starts with the first open flag.
  return [
    ...rule('duplicates', 'No other bill for this invoice', duplicates),
    ...rule('quantities', 'Quantities within what was received', quantities),
    ...rule('rates', 'Rates within the PO', rates),
    ...rule('gst-rates', 'GST rates as on the PO', gstRates),
    ...rule('freight', 'Freight within the PO', freight),
    ...totals,
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Vendor bills without a PO (v5 item 91): a hire bill against the machine's logs, a service bill against its job cards.

export interface OtherVendorBillFacts {
  invoiceNo: string;
  freight: number;
  subtotal: number;
  gstAmount: number;
  total: number;
  lines: { id: string; no: number; item: string; qty: number; rate: number; gstRate: number; amount: number; gstAmount: number }[];
  duplicates: Link[];
  hire: {
    /** "EXC-02 for Oct 2026" */
    machine: string;
    unit: string;
    /** Hours, days or months billed on the hire line, and what the approved logs give */
    billedQty: number;
    loggedQty: number;
    rate: number;
    agreedRate: number | null;
    /** Other bills for the same machine, project and month (not rejected) */
    otherBills: Link[];
    /** Diesel we issued to a machine the owner fuels, and what the bill recovers */
    fuelLitres: number;
    fuelRecovered: number;
    /**
     * The logs' days the machine's tracker or maker's feed read (item 146): hours logged (worked and idle) and what
     * the engine ran on them (within 2% or half an hour), and days logged as working on which the engine did not run
     */
    engine?: { days: number; loggedHours: number; engineHours: number; deadDays: string[] } | null;
  } | null;
  service: { billed: number; recorded: number; jobs: Link[] } | null;
}

export function otherVendorBillChecks(f: OtherVendorBillFacts): Check[] {
  const duplicates = f.duplicates.map((d) => flag(`duplicate:${d.href}`, `Invoice ${f.invoiceNo} already billed on ${d.label}`, null, [d]));
  const h = f.hire;
  const hours = h && h.billedQty > h.loggedQty + QTY_TOLERANCE ? [flag(`hire-qty:${fig(h.billedQty)}:${fig(h.loggedQty)}`, `${qty(h.billedQty)} ${h.unit}s billed, ${qty(h.loggedQty)} in the approved logs`, h.machine)] : [];
  const rates = h && h.agreedRate !== null && h.rate > h.agreedRate + 0.005 ? [flag(`hire-rate:${fig(h.rate)}`, `Hire rate ${inr(h.rate)} is above the agreed ${inr(h.agreedRate)}`, h.machine)] : [];
  const second = h && h.otherBills.length ? [flag(`hire-second:${h.otherBills.map((b) => b.label).join(':')}`, `${h.machine} is also billed on ${listOf(h.otherBills.map((b) => b.label))}`, null, h.otherBills)] : [];
  const fuel =
    h && h.fuelLitres > 0 && h.fuelRecovered <= 0
      ? [flag(`fuel:${fig(h.fuelLitres)}`, `${qty(h.fuelLitres)} litres of diesel we issued are not recovered`, `${h.machine}: the owner fuels it, so the diesel in its logs comes off the bill`)]
      : [];
  const e = h?.engine;
  const engine = !e || !e.days
    ? []
    : [
        ...(e.loggedHours > e.engineHours + Math.max(ENGINE_HOURS_TOLERANCE, e.engineHours * 0.02)
          ? [flag(`hire-engine:${fig(e.loggedHours)}:${fig(e.engineHours)}`, `${qty(e.loggedHours)} hours logged on ${e.days} tracked ${e.days === 1 ? 'day' : 'days'}; the engine ran ${qty(e.engineHours)}`, `${h!.machine}: from its tracker's hour meter`)]
          : []),
        ...(e.deadDays.length
          ? [flag(`hire-dead:${e.deadDays.join(':')}`, `Logged as working on ${e.deadDays.length === 1 ? 'a day' : `${e.deadDays.length} days`} the engine did not run`, `${h!.machine}: ${listOf(e.deadDays)}`)]
          : []),
      ];
  const s = f.service;
  const service = s && s.billed > s.recorded + MONEY_TOLERANCE ? [flag(`service:${fig(s.billed)}:${fig(s.recorded)}`, `${inr(s.billed)} billed before GST; the job cards record ${inr(s.recorded)}`, null, s.jobs)] : [];
  const lineParts = f.lines.flatMap((l) => [
    { label: `Line ${l.no} amount`, expected: Math.round(l.qty * l.rate * 100) / 100, actual: l.amount },
    { label: `Line ${l.no} GST`, expected: pctOf(l.amount, l.gstRate), actual: l.gstAmount },
  ]);
  const sum = (pick: (l: OtherVendorBillFacts['lines'][number]) => number) => f.lines.reduce((t, l) => t + pick(l), 0);
  const totals = totalsRule('totals', 'GST and totals add up', 'GST does not add up', [
    ...lineParts,
    { label: 'Subtotal', expected: sum((l) => l.amount), actual: f.subtotal },
    { label: 'GST', expected: sum((l) => l.gstAmount), actual: f.gstAmount },
    { label: 'Total', expected: f.subtotal + f.gstAmount + f.freight, actual: f.total },
  ]);
  return [
    ...rule('duplicates', 'No other bill for this invoice', duplicates),
    ...(h
      ? [
          ...rule('hire-second', 'No other bill for this machine and month', second),
          ...rule('hire-qty', 'Hours within the approved logs', hours),
          ...(h.engine?.days ? rule('hire-engine', "Logged hours within the engine's", engine) : []),
          ...rule('hire-rate', 'Hire rate as agreed', rates),
          ...rule('fuel', 'Diesel we issued is recovered', fuel),
        ]
      : []),
    ...(s ? rule('service', 'Within the job cards', service) : []),
    ...totals,
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Subcontract bills: against the work order and the measurement book.

export interface SubcontractBillFacts {
  invoiceNo: string | null;
  lines: {
    id: string;
    no: number;
    description: string;
    unit: string;
    rate: number;
    woRate: number;
    woQty: number;
    prevQty: number;
    thisQty: number;
    uptoQty: number;
    amount: number;
    /** What the bills before this one took on the line, in total. */
    earlierBilled: number;
    /** On the approved measurement sheets of this bill and the earlier ones; null for the work order's own items (no BOQ item). */
    measuredToDate: number | null;
  }[];
  grossAmount: number;
  gstRate: number;
  gstAmount: number;
  retentionPct: number;
  retentionAmount: number;
  advanceRecoveryPct: number;
  advanceRecoveryAmount: number;
  tdsPct: number;
  tdsAmount: number;
  materialRecovery: number;
  excessRecovery: number;
  otherDeduction: number;
  totalDeductions: number;
  netPayable: number;
  duplicates: Link[];
  /**
   * Man-day lines against the site's attendance over the bill's days (AI item 124, `AttendanceCheckService.forBill`):
   * absent when the bill has none. Counts only; workers are never named on a bill.
   */
  manDays?: { lineId: string; no: number; description: string; billed: number; supported: number | null; excess: number; excessInr: number; flagged: boolean; sources: string; span: string; link: Link }[];
}

export function subcontractBillChecks(f: SubcontractBillFacts): Check[] {
  const rates = f.lines
    .filter((l) => l.rate > l.woRate + 0.005)
    .map((l) => flag(`rate:${l.id}:${fig(l.rate)}`, `Rate ${inr(l.rate)} is above the work order rate ${inr(l.woRate)} on line ${l.no}`, l.description));

  const pastOrder = f.lines
    .filter((l) => l.uptoQty > l.woQty + QTY_TOLERANCE)
    .map((l) =>
      flag(`wo-qty:${l.id}:${fig(l.uptoQty)}`, `Bill takes line ${l.no} to ${qty(l.uptoQty)} ${l.unit}, past the work order's ${qty(l.woQty)} ${l.unit}`, l.description),
    );

  const previous = f.lines
    .filter((l) => Math.abs(l.prevQty - l.earlierBilled) > QTY_TOLERANCE)
    .map((l) =>
      flag(`prev:${l.id}:${fig(l.prevQty)}`, `Previous quantity on line ${l.no} is ${qty(l.prevQty)} ${l.unit}; earlier bills took ${qty(l.earlierBilled)} ${l.unit}`, l.description),
    );

  const measured = f.lines
    .filter((l) => l.measuredToDate !== null && Math.abs(l.uptoQty - l.measuredToDate) > QTY_TOLERANCE)
    .map((l) =>
      flag(
        `measured:${l.id}:${fig(l.uptoQty)}:${fig(l.measuredToDate!)}`,
        `Line ${l.no} is billed to ${qty(l.uptoQty)} ${l.unit}; the measurement book has ${qty(l.measuredToDate!)} ${l.unit}`,
        l.description,
      ),
    );

  const duplicates = f.invoiceNo ? f.duplicates.map((d) => flag(`duplicate:${d.href}`, `Invoice ${f.invoiceNo} already billed on ${d.label}`, null, [d])) : [];

  const base = Math.max(f.grossAmount, 0);
  const totals = totalsRule('totals', 'GST, deductions and net payable add up', 'Totals do not add up', [
    ...f.lines.map((l) => ({ label: `Line ${l.no} amount`, expected: Math.round(l.thisQty * l.rate * 100) / 100, actual: l.amount })),
    { label: 'Gross', expected: f.lines.reduce((s, l) => s + l.amount, 0), actual: f.grossAmount },
    { label: 'GST', expected: pctOf(base, f.gstRate), actual: f.gstAmount },
    { label: 'Retention', expected: pctOf(base, f.retentionPct), actual: f.retentionAmount },
    { label: 'TDS', expected: pctOf(base, f.tdsPct), actual: f.tdsAmount },
    // Advance recovery stops at what is left of the advance, so it may be less than its percentage, never more.
    { label: 'Advance recovery', expected: Math.min(pctOf(base, f.advanceRecoveryPct), f.advanceRecoveryAmount), actual: f.advanceRecoveryAmount },
    { label: 'Deductions', expected: f.retentionAmount + f.advanceRecoveryAmount + f.tdsAmount + f.materialRecovery + f.excessRecovery + f.otherDeduction, actual: f.totalDeductions },
    { label: 'Net payable', expected: f.grossAmount + f.gstAmount - f.totalDeductions, actual: f.netPayable },
  ]);

  const days = (f.manDays ?? [])
    .filter((l) => l.flagged)
    .map((l) =>
      flag(
        `mandays:${l.lineId}:${fig(l.billed)}:${l.supported === null ? 'none' : fig(l.supported)}`,
        l.supported === null
          ? `Line ${l.no} bills ${qty(l.billed)} man-days with no head count or roll call for ${l.span}`
          : `Line ${l.no} bills ${qty(l.billed)} man-days; the site's attendance for ${l.span} supports ${qty(l.supported)}`,
        `${l.description}: ${l.sources}. ${qty(l.excess)} man-days (${inr(l.excessInr)}) above the records; hold them until the contractor shows the muster.`,
        [l.link],
      ),
    );

  return [
    ...(f.invoiceNo ? rule('duplicates', 'No other bill for this invoice', duplicates) : []),
    ...rule('wo-qty', 'Quantities within the work order', pastOrder),
    ...(f.manDays?.length ? rule('mandays', "Man-days within the site's head count and roll call", days) : []),
    ...(f.lines.some((l) => l.measuredToDate !== null) ? rule('measured', 'Quantities match the measurement book', measured) : []),
    ...rule('rates', 'Rates as on the work order', rates),
    ...rule('prev', 'Previous quantities match earlier bills', previous),
    ...totals,
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// RA bills: against the BOQ, the measurement book and the bill before.

export interface RaBillFacts {
  items: {
    id: string;
    itemNo: string;
    unit: string;
    /** The BOQ quantity today (revised if a variation changed it). */
    boqQty: number;
    rate: number;
    boqRate: number;
    prevQty: number;
    thisQty: number;
    uptoQty: number;
    /** Certified by the client, when they cut the quantity. */
    certifiedQty: number | null;
    amount: number;
    /** What earlier bills took (certified where certified). */
    earlierBilled: number;
    /** On the approved measurement sheets of this bill and the earlier ones. */
    measuredToDate: number;
  }[];
  /** A lump-sum bill's payment stages (item 129), what they add to the work value. */
  stageAmount: number;
  grossAmount: number;
  pvAmount: number;
  gstRate: number;
  gstAmount: number;
  /**
   * The percentage deductions (retention, security deposit, TDS…); advance recovery may stop short of its percentage, or
   * follow a recovery window (`expected`, item 129).
   */
  deductions: { label: string; pct: number; amount: number; capped?: boolean; expected?: number }[];
  otherDeduction: number;
  /** Withheld for milestone slippage (item 129), negative when the bill releases it. */
  slippageWithheld: number;
  /** Service level penalties on an O&M bill (item 131) */
  omPenalty?: number;
  /** What the contract's missed obligations cost on this bill (item 167), negative when given back */
  obligationRecovery?: number;
  totalDeductions: number;
  netPayable: number;
}

export function raBillChecks(f: RaBillFacts): Check[] {
  const pastBoq = f.items
    .filter((i) => i.uptoQty > i.boqQty + QTY_TOLERANCE)
    .map((i) =>
      flag(
        `boq-qty:${i.id}:${fig(i.uptoQty)}:${fig(i.boqQty)}`,
        `Bill takes BOQ item ${i.itemNo} past its contract quantity`,
        `${qty(i.uptoQty)} ${i.unit} billed to date against ${qty(i.boqQty)} ${i.unit} in the BOQ; a variation is needed for the extra`,
      ),
    );

  const measured = f.items
    .filter((i) => Math.abs(i.uptoQty - i.measuredToDate) > QTY_TOLERANCE)
    .map((i) =>
      flag(`measured:${i.id}:${fig(i.uptoQty)}:${fig(i.measuredToDate)}`, `Item ${i.itemNo} is billed to ${qty(i.uptoQty)} ${i.unit}; the measurement book has ${qty(i.measuredToDate)} ${i.unit}`),
    );

  const rates = f.items
    .filter((i) => Math.abs(i.rate - i.boqRate) > 0.005)
    .map((i) => flag(`rate:${i.id}:${fig(i.rate)}:${fig(i.boqRate)}`, `Rate ${inr(i.rate)} on item ${i.itemNo} differs from the BOQ rate ${inr(i.boqRate)}`));

  const previous = f.items
    .filter((i) => Math.abs(i.prevQty - i.earlierBilled) > QTY_TOLERANCE)
    .map((i) => flag(`prev:${i.id}:${fig(i.prevQty)}`, `Previous quantity of item ${i.itemNo} is ${qty(i.prevQty)} ${i.unit}; earlier bills took ${qty(i.earlierBilled)} ${i.unit}`));

  const base = Math.max(f.grossAmount + f.pvAmount, 0);
  const totals = totalsRule('totals', 'GST, deductions and net payable add up', 'Totals do not add up', [
    ...f.items.map((i) => ({ label: `Item ${i.itemNo} amount`, expected: Math.round((i.certifiedQty ?? i.thisQty) * i.rate * 100) / 100, actual: i.amount })),
    { label: 'Gross', expected: f.items.reduce((s, i) => s + i.amount, f.stageAmount), actual: f.grossAmount },
    { label: 'GST', expected: pctOf(base, f.gstRate), actual: f.gstAmount },
    ...f.deductions.map((d) => ({ label: d.label, expected: d.expected ?? (d.capped ? Math.min(pctOf(base, d.pct), d.amount) : pctOf(base, d.pct)), actual: d.amount })),
    { label: 'Deductions', expected: f.deductions.reduce((s, d) => s + d.amount, 0) + f.otherDeduction + f.slippageWithheld + (f.omPenalty ?? 0) + (f.obligationRecovery ?? 0), actual: f.totalDeductions },
    { label: 'Net payable', expected: f.grossAmount + f.pvAmount + f.gstAmount - f.totalDeductions, actual: f.netPayable },
  ]);

  return [
    ...rule('boq-qty', 'Quantities within the BOQ', pastBoq),
    ...rule('measured', 'Quantities match the measurement book', measured),
    ...rule('rates', 'Rates as in the BOQ', rates),
    ...rule('prev', 'Previous quantities match earlier bills', previous),
    ...totals,
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Site expenses.

/** Income Tax section 40A(3): a cash payment above this to one party in a day is not allowed as an expense. */
export const CASH_LIMIT = 10_000;

export interface ExpenseFacts {
  amount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  paymentMode: string;
  vendorGstin: string | null;
  gstinValid: boolean | null;
  billNo: string | null;
  /** Other expenses or vendor bills for the same bill, or the same vendor, amount and day. */
  duplicates: (Link & { sameBill: boolean })[];
}

export function expenseChecks(f: ExpenseFacts): Check[] {
  const gst = totalsRule('gst', 'GST and total add up', 'GST does not add up', [
    { label: 'GST', expected: pctOf(f.amount, f.gstRate), actual: f.gstAmount },
    { label: 'Total', expected: f.amount + f.gstAmount, actual: f.totalAmount },
  ]);
  const gstin =
    f.vendorGstin === null
      ? []
      : rule('gstin', 'GSTIN is valid', f.gstinValid ? [] : [flag(`gstin:${f.vendorGstin}`, `GSTIN ${f.vendorGstin} fails its check character`, 'A character is probably mistyped; check it against the bill.')]);
  const cash =
    f.paymentMode !== 'CASH'
      ? []
      : rule(
          'cash',
          `Cash within ${inr(CASH_LIMIT)}`,
          f.totalAmount > CASH_LIMIT
            ? [flag(`cash:${fig(f.totalAmount)}`, `${inr(f.totalAmount)} paid in cash, above the ${inr(CASH_LIMIT)} limit`, 'Income Tax section 40A(3) does not allow a cash payment above ₹10,000 to one party in a day as an expense.')]
            : [],
        );
  const duplicates = f.duplicates.map((d) =>
    d.sameBill ? flag(`duplicate:${d.href}`, `Bill ${f.billNo} already filed on ${d.label}`, null, [d]) : flag(`duplicate:${d.href}`, `Looks like ${d.label}: same vendor, amount and date`, null, [d]),
  );
  return [...rule('duplicates', 'Not filed before', duplicates), ...cash, ...gstin, ...gst];
}

/** The line shown when the model does not write one. */
export function rulesSummary(checks: { ok: boolean; title: string; accepted?: unknown }[]): string {
  const open = checks.filter((c) => !c.ok && !c.accepted);
  const accepted = checks.filter((c) => !c.ok && c.accepted).length;
  const passed = checks.filter((c) => c.ok).length;
  if (!open.length) return accepted ? `All checks pass or are accepted (${accepted} accepted).` : `All ${passed} checks pass.`;
  const first = open[0].title.replace(/\.$/, '');
  return open.length === 1 ? `1 thing to look at: ${first}.` : `${open.length} things to look at, starting with: ${first}.`;
}
