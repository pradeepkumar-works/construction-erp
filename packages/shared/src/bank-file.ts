/**
 * Bank files (ARCHITECTURE "Bank payments"): the bulk transfer file a company uploads to its bank, in the layouts the
 * banks ask for, and the bank's UTRs read back. Pure, so the vendor batches and the salary run write the same rows and
 * leave out the same people. Amounts travel as decimal strings and are written in rupees with two decimals from integer
 * paise, never through a float.
 */
import type { PaymentBatchStatus } from './enums';

/** One person or party to pay, as the file needs them. */
export interface BankPayee {
  name: string;
  accountNo: string | null | undefined;
  ifsc: string | null | undefined;
  /** Rupees as a decimal string ("125000.5") */
  amount: string;
  /** What the beneficiary's statement shows */
  narration: string;
  /** Ours: the request number or the employee code, which the bank's response echoes */
  reference: string;
  email?: string | null;
}

/** What every row of a file shares. */
export interface BankFileContext {
  debitAccount: string;
  /** YYYY-MM-DD */
  valueDate: string;
}

export type TransferMode = 'NEFT' | 'RTGS';

interface Column {
  header: string;
  cell: (p: BankPayee, mode: TransferMode, ctx: BankFileContext) => string;
}

export interface BankFileFormat {
  label: string;
  /** Whether the first row names the columns */
  header: boolean;
  columns: readonly Column[];
}

/** RTGS from two lakh rupees; NEFT below. */
export const RTGS_FROM_PAISE = 2_00_000_00;

/** Integer paise of a decimal string of rupees; null when it is not one. */
export function paiseOf(amount: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** Rupees with two decimals, as a bank file writes them ("125000.50"). */
export function rupees(amount: string): string {
  const p = paiseOf(amount);
  if (p === null) throw new Error(`${amount} is not an amount in rupees`);
  return `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`;
}

/** NEFT below two lakh, RTGS from two lakh. */
export const paymentMode = (amount: string): TransferMode => ((paiseOf(amount) ?? 0) >= RTGS_FROM_PAISE ? 'RTGS' : 'NEFT');

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^[0-9A-Z]{6,20}$/;
const compact = (v: string | null | undefined) => String(v ?? '').replace(/\s+/g, '').toUpperCase();

/** Why a payee cannot go in a bank file, in words for the page; null when they can. */
export function bankFileProblem(p: BankPayee): string | null {
  const account = compact(p.accountNo);
  const ifsc = compact(p.ifsc);
  if (!account && !ifsc) return 'No bank account or IFSC';
  if (!account) return 'No bank account number';
  if (!ifsc) return 'No IFSC';
  if (!ACCOUNT.test(account)) return `Account number ${account} is not 6 to 20 letters and digits`;
  if (!IFSC.test(ifsc)) return `IFSC ${ifsc} is not 11 characters like SBIN0001234`;
  const paise = paiseOf(p.amount);
  if (paise === null || paise <= 0) return 'Nothing to pay';
  return null;
}

/** Text a bank accepts in a name or narration: letters, digits and a few marks, capped. */
const clean = (v: string | null | undefined, max: number) =>
  String(v ?? '')
    .replace(/[^A-Za-z0-9 .&/()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const ddmmyyyy = (d: string, sep: string) => `${d.slice(8, 10)}${sep}${d.slice(5, 7)}${sep}${d.slice(0, 4)}`;
const blank = (header: string): Column => ({ header, cell: () => '' });

/**
 * The layouts. Generic is a plain NEFT and RTGS sheet most banks' bulk upload maps; HDFC (Enet bulk upload, no header),
 * ICICI (CIB bulk payments) and SBI (CINB bulk transfer) follow those banks' templates. A bank's relationship manager
 * gives the company its own sample: check the first file against it, and a different layout is one more entry here.
 */
export const BANK_FILE_FORMATS = {
  GENERIC: {
    label: 'Generic NEFT and RTGS (CSV)',
    header: true,
    columns: [
      { header: 'Payment type', cell: (_, m) => m },
      { header: 'Debit account', cell: (_, __, c) => compact(c.debitAccount) },
      { header: 'Beneficiary name', cell: (p) => clean(p.name, 50) },
      { header: 'Beneficiary account', cell: (p) => compact(p.accountNo) },
      { header: 'IFSC', cell: (p) => compact(p.ifsc) },
      { header: 'Amount', cell: (p) => rupees(p.amount) },
      { header: 'Narration', cell: (p) => clean(p.narration, 30) },
      { header: 'Reference', cell: (p) => clean(p.reference, 30) },
    ],
  },
  HDFC: {
    label: 'HDFC Bank Enet bulk upload',
    header: false,
    columns: [
      { header: 'Transaction type', cell: (_, m) => (m === 'RTGS' ? 'R' : 'N') },
      blank('Beneficiary code'),
      { header: 'Beneficiary account number', cell: (p) => compact(p.accountNo) },
      { header: 'Instrument amount', cell: (p) => rupees(p.amount) },
      { header: 'Beneficiary name', cell: (p) => clean(p.name, 40) },
      blank('Drawee location'),
      blank('Print location'),
      blank('Bene address 1'),
      blank('Bene address 2'),
      blank('Bene address 3'),
      blank('Bene address 4'),
      blank('Bene address 5'),
      blank('Instruction reference number'),
      { header: 'Customer reference number', cell: (p) => clean(p.reference, 20) },
      { header: 'Payment details 1', cell: (p) => clean(p.narration, 30) },
      blank('Payment details 2'),
      blank('Payment details 3'),
      blank('Payment details 4'),
      blank('Payment details 5'),
      blank('Payment details 6'),
      blank('Payment details 7'),
      blank('Cheque number'),
      { header: 'Transaction date', cell: (_, __, c) => ddmmyyyy(c.valueDate, '/') },
      blank('MICR number'),
      { header: 'IFSC code', cell: (p) => compact(p.ifsc) },
      blank('Bene bank name'),
      blank('Bene bank branch name'),
      { header: 'Beneficiary email id', cell: (p) => String(p.email ?? '').trim() },
    ],
  },
  ICICI: {
    label: 'ICICI Bank CIB bulk payments',
    header: true,
    columns: [
      { header: 'PYMT_PROD_TYPE_CODE', cell: () => 'PAB_VENDOR' },
      { header: 'PYMT_MODE', cell: (_, m) => m },
      { header: 'DEBIT_ACC_NO', cell: (_, __, c) => compact(c.debitAccount) },
      { header: 'BNF_NAME', cell: (p) => clean(p.name, 40) },
      { header: 'BENE_ACC_NO', cell: (p) => compact(p.accountNo) },
      { header: 'BENE_IFSC', cell: (p) => compact(p.ifsc) },
      { header: 'AMOUNT', cell: (p) => rupees(p.amount) },
      { header: 'DEBIT_NARR', cell: (p) => clean(p.reference, 30) },
      { header: 'CREDIT_NARR', cell: (p) => clean(p.narration, 30) },
      blank('MOBILE_NUM'),
      { header: 'EMAIL_ID', cell: (p) => String(p.email ?? '').trim() },
      blank('REMARK'),
      { header: 'PYMT_DATE', cell: (_, __, c) => ddmmyyyy(c.valueDate, '-') },
      { header: 'REF_NO', cell: (p) => clean(p.reference, 20) },
    ],
  },
  SBI: {
    label: 'SBI CINB bulk transfer',
    header: true,
    columns: [
      { header: 'Debit account number', cell: (_, __, c) => compact(c.debitAccount) },
      { header: 'Beneficiary account number', cell: (p) => compact(p.accountNo) },
      { header: 'IFSC code', cell: (p) => compact(p.ifsc) },
      { header: 'Beneficiary name', cell: (p) => clean(p.name, 35) },
      { header: 'Amount', cell: (p) => rupees(p.amount) },
      { header: 'Payment mode', cell: (_, m) => m },
      { header: 'Value date', cell: (_, __, c) => ddmmyyyy(c.valueDate, '/') },
      { header: 'Transaction reference', cell: (p) => clean(p.reference, 20) },
      { header: 'Remarks', cell: (p) => clean(p.narration, 30) },
    ],
  },
} as const satisfies Record<string, BankFileFormat>;
export type BankFileFormatKey = keyof typeof BANK_FILE_FORMATS;
export const BANK_FILE_FORMAT_KEYS = Object.keys(BANK_FILE_FORMATS) as BankFileFormatKey[];
export const isBankFileFormat = (v: unknown): v is BankFileFormatKey => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BANK_FILE_FORMATS, v);

export interface BankFileRows {
  /** The file's rows, its header first when the format has one */
  rows: string[][];
  /** The payees written, in order, each with its mode */
  paid: { reference: string; mode: TransferMode }[];
  /** The payees left out, with why */
  missing: { reference: string; name: string; problem: string }[];
}

/** A bank file's rows for the payees, leaving out those `bankFileProblem` refuses. */
export function bankFileRows(format: BankFileFormatKey, ctx: BankFileContext, payees: BankPayee[]): BankFileRows {
  const f: BankFileFormat = BANK_FILE_FORMATS[format];
  const rows: string[][] = f.header ? [f.columns.map((c) => c.header)] : [];
  const paid: BankFileRows['paid'] = [];
  const missing: BankFileRows['missing'] = [];
  for (const p of payees) {
    const problem = bankFileProblem(p);
    if (problem) {
      missing.push({ reference: p.reference, name: p.name, problem });
      continue;
    }
    const mode = paymentMode(p.amount);
    rows.push(f.columns.map((c) => c.cell(p, mode, ctx)));
    paid.push({ reference: p.reference, mode });
  }
  return { rows, paid, missing };
}

/** The rows as CSV: CRLF line ends, a cell quoted only when it holds a comma, a quote or a line break. */
export function bankFileText(rows: string[][]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const UTR = /^(?=.*\d)[A-Z0-9]{8,30}$/;
const isUtrHeader = (h: string) => /\butr\b|utr ?no|bank ref|transaction ref|txn ref|unique transaction/.test(h);
const REJECTED = /reject|fail|return|cancel|invalid/;

export interface UtrRead {
  /** Our reference and the bank's UTR for each paid row */
  found: { reference: string; utr: string }[];
  /** Rows the bank marks rejected or failed */
  rejected: { reference: string; status: string }[];
  /** Rows that could not be read, with why */
  problems: string[];
}

/**
 * The UTRs in a bank's response file (CSV or Excel cells as the bank gives them) or a pasted list ("PR-2026-0001
 * N123456789012345" a line). A row is ours when one of its cells holds one of `references`; its UTR is the cell under a
 * UTR or bank reference heading, else the first UTR-shaped word on the row. A row the bank marks rejected or failed is
 * reported, never read as paid.
 */
export function readUtrResponse(cells: unknown[][], references: string[]): UtrRead {
  const refs = references.map((r) => ({ r, up: r.toUpperCase(), word: new RegExp(`(^|[^A-Z0-9])${r.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Z0-9])`) }));
  const at = cells.slice(0, 20).findIndex((row) => row.some((c) => isUtrHeader(norm(c))));
  const header = at >= 0 ? cells[at].map(norm) : null;
  const utrCol = header ? header.findIndex(isUtrHeader) : -1;
  const statusCol = header ? header.findIndex((h) => /\bstatus\b/.test(h)) : -1;
  const byRef = new Map<string, string>();
  const rejected: UtrRead['rejected'] = [];
  const problems: string[] = [];
  const twice = new Set<string>();
  cells.forEach((row, i) => {
    if (header && i <= at) return;
    const text = row.map((c) => String(c ?? '').trim());
    const hit = refs.find(({ word }) => text.some((c) => word.test(c.toUpperCase())));
    if (!hit) {
      if (text.some((c) => c.split(/[\s,;|]+/).some((w) => UTR.test(w.toUpperCase())))) problems.push(`Row ${i + 1}: no request number of this batch`);
      return;
    }
    const status = statusCol >= 0 ? text[statusCol] ?? '' : '';
    if (status && REJECTED.test(norm(status))) {
      rejected.push({ reference: hit.r, status });
      return;
    }
    const words = header ? [text[utrCol] ?? ''] : text.flatMap((c) => c.split(/[\s,;|]+/));
    const shaped = words.map((w) => w.toUpperCase()).filter((w) => UTR.test(w) && !w.includes(hit.up));
    // Without a heading an account number is UTR-shaped too; NEFT and RTGS UTRs start with the bank's letters.
    const utr = shaped.find((w) => /[A-Z]/.test(w)) ?? shaped[0];
    if (!utr) {
      problems.push(`Row ${i + 1}: no UTR for ${hit.r}`);
      return;
    }
    const before = byRef.get(hit.r);
    if (before && before !== utr) twice.add(hit.r);
    byRef.set(hit.r, utr);
  });
  for (const r of twice) {
    problems.push(`${r} has two different UTRs; import it again with one`);
    byRef.delete(r);
  }
  const owners = new Map<string, string[]>();
  for (const [r, u] of byRef) owners.set(u, [...(owners.get(u) ?? []), r]);
  for (const [u, rs] of owners)
    if (rs.length > 1) {
      problems.push(`UTR ${u} is given for ${rs.join(' and ')}; a UTR belongs to one payment`);
      for (const r of rs) byRef.delete(r);
    }
  return { found: [...byRef].map(([reference, utr]) => ({ reference, utr })), rejected, problems };
}

/** Where a batch's line stands, derived from the batch and its payment. */
export const PAYMENT_BATCH_LINE_STATES = ['READY', 'MISSING', 'LEFT_OUT', 'WAITING', 'PAID', 'REMOVED'] as const;
export type PaymentBatchLineState = (typeof PAYMENT_BATCH_LINE_STATES)[number];
export const PAYMENT_BATCH_LINE_STATE_LABELS: Record<PaymentBatchLineState, string> = {
  READY: 'Ready',
  MISSING: 'Bank details missing',
  LEFT_OUT: 'Left out',
  WAITING: 'Waiting for UTR',
  PAID: 'Paid',
  REMOVED: 'Payment removed',
};

export interface PaymentBatchDto {
  id: string;
  batchNo: string;
  status: PaymentBatchStatus;
  format: BankFileFormatKey;
  debitAccount: string;
  /** Lines in the batch, and those that are (or will be) in the file */
  lines: number;
  inFile: number;
  /** What the file pays: the lines with bank details, or those written into it once exported */
  total: string;
  /** Payments with their UTR */
  paid: number;
  paymentDate: string | null;
  createdByName: string;
  createdAt: string;
  exportedByName: string | null;
  exportedAt: string | null;
  settledAt: string | null;
}

export interface PaymentBatchLineDto {
  id: string;
  paymentRequestId: string;
  requestNo: string;
  vendorId: string;
  vendorName: string;
  projectCode: string;
  projectName: string;
  /** What the request pays: the bill, the order's advance, or on account */
  against: string;
  amount: string;
  state: PaymentBatchLineState;
  /** Why it is not in the file */
  problem: string | null;
  /** The account's last four characters and the IFSC, as the file has them (or will) */
  accountEnding: string | null;
  ifsc: string | null;
  mode: TransferMode | null;
  vendorPaymentId: string | null;
  utr: string | null;
}

export interface PaymentBatchDetailDto extends PaymentBatchDto {
  items: PaymentBatchLineDto[];
  fileName: string | null;
  /** Why the batch cannot be exported now; null when it can */
  exportProblem: string | null;
}

export interface BankFileDto {
  fileName: string;
  mimeType: string;
  content: string;
}

export interface UtrImportResultDto {
  /** UTRs set on payments */
  set: number;
  /** Lines still without a UTR */
  waiting: number;
  rejected: { reference: string; status: string }[];
  problems: string[];
  batch: PaymentBatchDetailDto;
}

/** A payment request accounts could put in a batch now. */
export interface PayableRequestDto {
  id: string;
  requestNo: string;
  vendorName: string;
  projectCode: string;
  against: string;
  left: string;
  /** The batch that holds it, if any */
  inBatch: string | null;
  problem: string | null;
}
