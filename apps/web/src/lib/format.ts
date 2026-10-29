import dayjs from 'dayjs';
import type { ContractCurrency, SubmissionStatus, MaterialPriority, NotificationType, ProjectStatus, StockEntryType } from '@erp/shared';
import { currencySymbol, fromRupees, isForeign, toRupees } from '@erp/shared';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** ₹ and a no-break space, so the symbol never wraps away from its figure (docs/WRITING.md). */
export const RUPEE = '₹\u00A0';

/** Full INR with Indian digit grouping: ₹ 18,65,00,000 */
export function formatINR(value: string | number | null | undefined, decimals = false): string {
  const n = toNumber(value);
  return `${RUPEE}${decimals ? inr2.format(n) : inr.format(n)}`;
}

/** Compact INR for KPIs: ₹ 1.87 Cr / ₹ 12.5 L / ₹ 85,000 */
export function formatINRCompact(value: string | number | null | undefined): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${RUPEE}${(n / 1e7).toFixed(2)}\u00A0Cr`;
  if (abs >= 1e5) return `${RUPEE}${(n / 1e5).toFixed(2)}\u00A0L`;
  return `${RUPEE}${inr.format(n)}`;
}

const intl2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intl0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Money a project keeps in rupees, in its contract currency (item 130): "US$ 74,850.00" on a foreign contract at the
 * contract rate, else formatINR. International digit grouping abroad, Indian at home.
 */
export function formatMoney(rupees: string | number | null | undefined, c: ContractCurrency | null | undefined, decimals = false): string {
  if (!isForeign(c)) return formatINR(rupees, decimals);
  const v = fromRupees(toNumber(rupees), c.exchangeRate);
  return `${currencySymbol(c.currency)}\u00A0${decimals ? intl2.format(v) : intl0.format(v)}`;
}

/** A form's money field on a foreign contract: rupees kept to the amount in the currency, and back (identity at home). */
export const inContract = (rupees: number | null | undefined, c: ContractCurrency | null | undefined) =>
  rupees === null || rupees === undefined ? rupees : isForeign(c) ? fromRupees(rupees, c.exchangeRate) : rupees;
export const outOfContract = (amount: number | null | undefined, c: ContractCurrency | null | undefined) =>
  amount === null || amount === undefined ? amount : isForeign(c) ? toRupees(amount, c.exchangeRate) : amount;
/** The prefix of a money field in the contract currency. */
export const moneyPrefix = (c: ContractCurrency | null | undefined) => (isForeign(c) ? currencySymbol(c.currency) : '₹');

/** Compact money in the contract currency for KPIs: US$ 6.20 M, or formatINRCompact at home. */
export function formatMoneyCompact(rupees: string | number | null | undefined, c: ContractCurrency | null | undefined): string {
  if (!isForeign(c)) return formatINRCompact(rupees);
  const v = fromRupees(toNumber(rupees), c.exchangeRate);
  const abs = Math.abs(v);
  const sym = `${currencySymbol(c.currency)}\u00A0`;
  if (abs >= 1e6) return `${sym}${(v / 1e6).toFixed(2)}\u00A0M`;
  if (abs >= 1e3) return `${sym}${(v / 1e3).toFixed(1)}\u00A0K`;
  return `${sym}${intl0.format(v)}`;
}

export function formatQty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return num.format(toNumber(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM YYYY') : value;
}

/** A day in words, for a greeting: "Thursday 22 October". */
export function formatLongDay(value: Date | string): string {
  const d = dayjs(value);
  return d.isValid() ? d.format('dddd D MMMM') : String(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM YYYY, HH:mm') : value;
}

/** A label inside a sentence: "RA Bill" reads "RA bill", "Measurement (MB)" reads "measurement (MB)"; abbreviations keep their capitals. */
export function inSentence(label: string): string {
  return label
    .split(' ')
    .map((w) => (/^\(?[A-Z0-9]{2,}\)?$/.test(w) ? w : w.toLowerCase()))
    .join(' ');
}

const pctFormats = new Map<string, Intl.NumberFormat>();

/**
 * A percentage, written one way everywhere (UX item 85): whole numbers from 10% up, one decimal below it (2.5%, and 2%
 * rather than 2.0%), `%` without a space, `–` for none. `digits` fixes the decimals instead ({ digits: 0 } for a
 * whole number always).
 */
export function formatPct(value: number | string | null | undefined, opts: { digits?: number } = {}): string {
  if (value === null || value === undefined || value === '') return '–';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '–';
  const digits = opts.digits ?? (Math.abs(n) >= 9.95 ? 0 : 1);
  const key = `${digits}:${opts.digits !== undefined}`;
  let f = pctFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: opts.digits ?? 0 });
    pctFormats.set(key, f);
  }
  // -0.04 rounds to "-0": a percentage that rounds to nothing reads 0%.
  const text = f.format(n);
  return `${/^-0(\.0+)?$/.test(text) ? text.slice(1) : text}%`;
}

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  DRAFT: 'default',
  // Pending is orange and changes-requested purple (as in the site app), so neither reads as the brand blue.
  SUBMITTED: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  CHANGES_REQUESTED: 'purple',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  PLANNED: 'blue',
  ACTIVE: 'green',
  ON_HOLD: 'orange',
  COMPLETED: 'purple',
  CLOSED: 'default',
};

export const STOCK_ENTRY_COLORS: Record<StockEntryType, string> = {
  RECEIPT: 'green',
  ISSUE: 'blue',
  ADJUSTMENT: 'purple',
  TRANSFER_OUT: 'gold',
  TRANSFER_IN: 'cyan',
  RETURN_TO_VENDOR: 'volcano',
  RETURN_FROM_SITE: 'geekblue',
};

export const PRIORITY_COLORS: Record<MaterialPriority, string> = {
  LOW: 'default',
  NORMAL: 'blue',
  HIGH: 'orange',
  URGENT: 'red',
};

export const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  SUBMISSION_SUBMITTED: 'orange',
  SUBMISSION_APPROVED: 'green',
  SUBMISSION_REJECTED: 'red',
  SUBMISSION_CHANGES_REQUESTED: 'purple',
  DPR_REMINDER: 'blue',
  APPROVAL_DIGEST: 'purple',
  LOW_STOCK: 'volcano',
  RISK_RAISED: 'magenta',
  TEST_DUE: 'geekblue',
  TEST_FAILED: 'red',
  NCR: 'volcano',
  DOCUMENT_ISSUED: 'cyan',
  LEAVE: 'lime',
  OVERTIME: 'lime',
  BILLS_DUE: 'gold',
  PORTAL: 'geekblue',
  SAFETY: 'red',
  MACHINERY: 'orange',
  IMPREST: 'gold',
  COMPLIANCE: 'purple',
  DEFECT: 'volcano',
  WATCH_LIST: 'gold',
  MORNING_BRIEF: 'cyan',
  SUPPLIER: 'geekblue',
  COMMENT: 'blue',
  ACCESS_REQUEST: 'purple',
  HANDOFF: 'blue',
  LETTER: 'purple',
};

/** "2 min ago", "3 h ago", "4 d ago", then a date. */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  if (!d.isValid()) return value;
  const min = Math.max(0, Math.floor((Date.now() - d.valueOf()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} d ago`;
  return d.format('DD MMM YYYY');
}

export function progressStatus(pct: number): 'success' | 'exception' | 'normal' | 'active' {
  if (pct >= 100) return 'success';
  return 'active';
}

/** The heading a feed groups a moment under: "Today", "Yesterday", "Monday" within the week, then the date. */
export function dayLabel(value: string): string {
  const d = dayjs(value).startOf('day');
  const days = dayjs().startOf('day').diff(d, 'day');
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.format('dddd');
  return d.format('DD MMM YYYY');
}

/** "Oct 2026": a month on its own (a bill's index month, a cost row). */
export function formatMonth(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value.length === 7 ? `${value}-01` : value);
  return d.isValid() ? d.format('MMM YYYY') : value;
}

/** "Oct": a month's short name, from YYYY-MM or a date (a home tile's "Billed in Oct"). */
export function formatMonthName(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value.length === 7 ? `${value}-01` : value);
  return d.isValid() ? d.format('MMM') : value;
}

/** "Oct 26": a month on a chart's axis or in its table, where the year is short. */
export function formatMonthShort(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value.length === 7 ? `${value}-01` : value);
  return d.isValid() ? d.format('MMM YY') : value;
}

/** "15 Oct": a day inside a range whose year is given once ("15 Oct to 21 Oct 2026"). */
export function formatDayMonth(value: string | dayjs.Dayjs | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM') : String(value);
}
