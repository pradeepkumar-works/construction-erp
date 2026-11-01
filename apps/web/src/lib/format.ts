import dayjs from 'dayjs';
import type { ContractCurrency } from '@erp/shared';
import { currencySymbol, formatINR, formatINRCompact, fromRupees, isForeign, NO_VALUE, plural, toNumber, toRupees } from '@erp/shared';

// Moved to @erp/shared (numbers.ts), so the headline figures, print, Excel and the API read numbers the same way.
export { formatCount, formatINR, formatINRCompact, formatPct, formatQty, inSentence, NO_VALUE, plural, RUPEE, toNumber } from '@erp/shared';

/** How a month picker shows its month: "Oct 2026", as `formatMonth` writes it. */
export const MONTH_PICKER_FORMAT = 'MMM YYYY';

const intl2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intl0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Money a project keeps in rupees, in its contract currency: "US$ 74,850.00" on a foreign contract at the
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

/** A file size: "820 KB", "12.4 MB". */
export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return NO_VALUE;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

/** Today as YYYY-MM-DD in India, the day the API counts by (`todayIn`), whatever the browser's own time zone. */
export const todayDate = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** When something falls due, from the days left (negative when past): "in 1 day", "today", "3 days late". */
export const formatDue = (days: number): string => (days < 0 ? `${plural(-days, 'day')} late` : days === 0 ? 'today' : `in ${plural(days, 'day')}`);

export function formatDate(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM YYYY') : value;
}

/** A day in words, for a greeting: "Thursday 22 October". */
export function formatLongDay(value: Date | string): string {
  const d = dayjs(value);
  return d.isValid() ? d.format('dddd D MMMM') : String(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM YYYY, HH:mm') : value;
}

/** The time of day only, 24-hour: "07:45". */
export function formatTime(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  const d = dayjs(value);
  return d.isValid() ? d.format('HH:mm') : value;
}

/** "2 min ago", "3 h ago", "4 d ago", then a date. */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
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
  if (!value) return NO_VALUE;
  const d = dayjs(value.length === 7 ? `${value}-01` : value);
  return d.isValid() ? d.format('MMM YYYY') : value;
}

/** "October 2026": a month in a sentence or a heading (a payslip, a hire bill's line). */
export function formatMonthLong(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  const d = dayjs(value.length === 7 ? `${value}-01` : value);
  return d.isValid() ? d.format('MMMM YYYY') : value;
}

/** "Oct": a month's short name, from YYYY-MM or a date (a home tile's "Billed in Oct"). */
export function formatMonthName(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  const d = dayjs(value.length === 7 ? `${value}-01` : value);
  return d.isValid() ? d.format('MMM') : value;
}

/** "Oct 26": a month on a chart's axis or in its table, where the year is short. */
export function formatMonthShort(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  const d = dayjs(value.length === 7 ? `${value}-01` : value);
  return d.isValid() ? d.format('MMM YY') : value;
}

/** "15 Oct": a day inside a range whose year is given once ("15 Oct to 21 Oct 2026"). */
export function formatDayMonth(value: string | dayjs.Dayjs | null | undefined): string {
  if (!value) return NO_VALUE;
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM') : String(value);
}
