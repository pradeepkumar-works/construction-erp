import { Prisma } from '@prisma/client';
import { SUPPLIER_BANK_FIELDS, SUPPLIER_PROFILE_FIELDS, type SubmissionStatus, type SupplierInvoiceStage, type SupplierInvoiceStatus, type SupplierProfileField, type SupplierStatementKind } from '@erp/shared';

/**
 * The supplier portal's figures (v6 item 105), with no database: the statement's running balance, what a bill is
 * worth to the supplier, what is still to send on a PO line, whether a dispatch note fits the order, where an invoice
 * stands, and what a profile change touches. Tested in `src/scripts/supplier-test.ts`.
 */
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

/* ---------- the statement ---------- */

export interface StatementEntry {
  date: string;
  kind: SupplierStatementKind;
  ref: string;
  description: string;
  /** Paid, deducted or a debit note */
  debit: Prisma.Decimal.Value;
  /** Billed */
  credit: Prisma.Decimal.Value;
}

export interface StatementLine extends StatementEntry {
  balance: Prisma.Decimal;
}

/** Bills first on a day, then debit notes, then money paid: a bill paid the day it is approved does not dip below zero. */
const KIND_ORDER: Record<SupplierStatementKind, number> = { BILL: 0, DEBIT_NOTE: 1, ADVANCE: 2, PAYMENT: 2 };

/**
 * The statement: entries by date with what is owed after each. Entries before `from` are carried in one opening line.
 * A negative balance means the supplier has been paid ahead (an advance not yet taken off a bill).
 */
export function statement(entries: StatementEntry[], from?: string | null) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.ref.localeCompare(b.ref));
  let balance = ZERO;
  let billed = ZERO;
  let paid = ZERO;
  const rows: StatementLine[] = [];
  let opening: Prisma.Decimal | null = null;
  for (const e of sorted) {
    balance = balance.add(D(e.credit)).sub(D(e.debit));
    if (from && e.date < from) {
      opening = balance;
      continue;
    }
    billed = billed.add(D(e.credit));
    paid = paid.add(D(e.debit));
    rows.push({ ...e, balance });
  }
  return { opening, rows, billed, paid, balance };
}

/** A vendor bill is worth its total to the supplier, less diesel recovered on a hired machine; an advance was debited when paid. */
export const vendorBillCredit = (b: { total: Prisma.Decimal.Value; fuelRecovery: Prisma.Decimal.Value }) => D(b.total).sub(D(b.fuelRecovery));

/**
 * A subcontract bill is worth its net payable plus the advance it recovers (the advance was debited when paid, so
 * taking it off again would count it twice). Retention and TDS stay deducted: retention is released by a later bill.
 */
export const subBillCredit = (b: { netPayable: Prisma.Decimal.Value; advanceRecoveryAmount: Prisma.Decimal.Value }) => D(b.netPayable).add(D(b.advanceRecoveryAmount));

/** A payment settles the bill by what was paid and what was deducted at payment (TDS, other). */
export const paymentDebit = (p: { amount: Prisma.Decimal.Value; tdsAmount: Prisma.Decimal.Value; otherDeduction: Prisma.Decimal.Value }) => D(p.amount).add(D(p.tdsAmount)).add(D(p.otherDeduction));

/** What is due on approved bills, and how much of it is past its due date. */
export function dueSplit(bills: { due: Prisma.Decimal.Value; dueDate: string }[], today: string) {
  let due = ZERO;
  let overdue = ZERO;
  for (const b of bills) {
    const d = D(b.due);
    if (d.lte(0)) continue;
    due = due.add(d);
    if (b.dueDate < today) overdue = overdue.add(d);
  }
  return { due, overdue };
}

/* ---------- dispatch notes ---------- */

/** What is still to send on a PO line: ordered, less received at site, less what is on the way. Never below zero. */
export function toSend(ordered: Prisma.Decimal.Value, received: Prisma.Decimal.Value, onTheWay: Prisma.Decimal.Value) {
  const left = D(ordered).sub(D(received)).sub(D(onTheWay));
  return left.gt(0) ? left : ZERO;
}

/**
 * Why a dispatch note does not fit its order, or null when it does: every line on the order, each line once, a
 * quantity above zero, and no more than is still to send.
 */
export function dispatchProblem(want: { lineId: string; quantity: Prisma.Decimal.Value }[], lines: { id: string; itemName: string; unit: string; toSend: Prisma.Decimal.Value }[]): string | null {
  if (!want.length) return 'Enter the quantity sent on at least one line';
  const seen = new Set<string>();
  for (const w of want) {
    const line = lines.find((l) => l.id === w.lineId);
    if (!line) return 'A line is not on this order. Reload the page and try again.';
    if (seen.has(w.lineId)) return `${line.itemName} is on the note twice`;
    seen.add(w.lineId);
    const q = D(w.quantity);
    if (q.lte(0)) return `Enter the quantity of ${line.itemName} sent`;
    if (q.gt(D(line.toSend))) return D(line.toSend).lte(0) ? `${line.itemName} has nothing left to send on this order` : `Only ${D(line.toSend).toString()} ${line.unit} of ${line.itemName} is left to send`;
  }
  return null;
}

/* ---------- invoices ---------- */

/** Where an invoice stands: returned or withdrawn as recorded; otherwise from the bill made from it (not a rejected one). */
export function invoiceStage(status: SupplierInvoiceStatus, bill: { status: SubmissionStatus; payable: Prisma.Decimal.Value; paid: Prisma.Decimal.Value } | null): SupplierInvoiceStage {
  if (status !== 'SUBMITTED') return status;
  if (!bill || bill.status === 'REJECTED') return 'SUBMITTED';
  return bill.status === 'APPROVED' && D(bill.payable).gt(0) && D(bill.paid).gte(D(bill.payable)) ? 'PAID' : 'BILLED';
}

/* ---------- profile changes ---------- */

export type ProfileValues = Record<SupplierProfileField, string | null>;

const norm = (field: SupplierProfileField, v: string | null | undefined) => {
  const t = (v ?? '').trim();
  if (!t) return null;
  return field === 'gstin' || field === 'pan' || field === 'bankIfsc' || field === 'udyamNo' ? t.toUpperCase() : field === 'email' ? t.toLowerCase() : t;
};

/** The fields a request would change (left out = unchanged; empty = clear it), in profile order. */
export function profileChanges(current: ProfileValues, wanted: Partial<Record<SupplierProfileField, string | null>>) {
  return SUPPLIER_PROFILE_FIELDS.filter((f) => f in wanted)
    .map((field) => ({ field, from: norm(field, current[field]), to: norm(field, wanted[field]) }))
    .filter((c) => c.from !== c.to);
}

export const touchesBank = (fields: SupplierProfileField[]) => fields.some((f) => SUPPLIER_BANK_FIELDS.includes(f));

/** A bank account as the supplier's own page shows it: the last four digits. */
export const maskAccount = (no: string | null) => (no ? (no.length <= 4 ? no : `•••• ${no.slice(-4)}`) : null);
