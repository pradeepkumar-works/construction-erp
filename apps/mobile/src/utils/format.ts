import { translate } from '../i18n/translate';

/** The app's language for text built outside components; LanguageProvider keeps it in step (v4 item 49). */
let language = 'en';
export function setFormatLanguage(code: string) {
  language = code;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** Local date as YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toIsoDate(new Date());
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toIsoDate(d) === s;
}

export function addDays(iso: string, days: number): string {
  const base = isIsoDate(iso) ? new Date(`${iso}T00:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return toIsoDate(base);
}

/**
 * Month names for each app language (UX item 88). Written out here rather than asked of `Intl`, which Hermes builds
 * differ on, so a date reads the same on every phone. Digits stay Latin in Hindi too: that is Hindi's default in CLDR
 * (`hi-IN` uses `latn`) and what site staff see on bills, challans and their phones.
 */
const MONTHS: Record<string, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जन॰', 'फ़र॰', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल॰', 'अग॰', 'सित॰', 'अक्तू॰', 'नव॰', 'दिस॰'],
};
const WEEKDAYS: Record<string, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  hi: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
};
const monthName = (i: number) => (MONTHS[language] ?? MONTHS.en)[i];

/** "2026-10-13" or an ISO timestamp -> "13 Oct 2026" (Hindi: "13 अक्तू॰ 2026"), in the app's language. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${Number(m[3])} ${monthName(Number(m[2]) - 1)} ${m[1]}`;
}

/** "Tue, 13 Oct 2026": a date with its weekday, for the date fields. */
export function formatDayDate(value: string | null | undefined): string {
  if (!value || !isIsoDate(value.slice(0, 10))) return formatDate(value);
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return `${(WEEKDAYS[language] ?? WEEKDAYS.en)[d.getDay()]}, ${formatDate(value)}`;
}

/** A time of day on this phone, 24-hour: "14:05". */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}, ${formatTime(d)}`;
}

/** Indian digit grouping (1,50,000), the same in both languages: lakh and crore are how amounts are said on site. */
function groupIndian(int: string): string {
  if (int.length <= 3) return int;
  const last3 = int.slice(-3);
  return `${int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/** A number with Indian grouping and at most `decimals` places (trailing zeros dropped): 150000 -> "1,50,000". */
export function formatNumber(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac = ''] = fixed.split('.');
  const trimmed = frac.replace(/0+$/, '');
  return `${n < 0 && Number(fixed) !== 0 ? '-' : ''}${groupIndian(int)}${trimmed ? `.${trimmed}` : ''}`;
}

/**
 * Rupees with Indian grouping: "₹1,50,000.00" with paise (`paise`, the default, for bills), "₹1,50,000" rounded
 * otherwise.
 */
export function formatMoney(value: string | number | null | undefined, opts: { paise?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const paise = opts.paise ?? true;
  const fixed = Math.abs(n).toFixed(paise ? 2 : 0);
  const [int, frac] = fixed.split('.');
  return `${n < 0 && Number(fixed) !== 0 ? '-' : ''}₹${groupIndian(int)}${frac ? `.${frac}` : ''}`;
}

/** ₹ in lakh / crore, as the web's formatINRCompact: "₹12.50 L", "₹1.20 Cr". */
export function formatMoneyCompact(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return formatMoney(n, { paise: false });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return translate(language, 'just now');
  if (min < 60) return translate(language, '{n} min ago', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return translate(language, '{n} h ago', { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return translate(language, '{n} d ago', { n: d });
  return formatDate(value);
}

/** Decimal strings from the API -> compact display, grouped like money (1,50,000.5) so the two agree on one screen. */
export function fmtQty(value: string | number | null | undefined): string {
  return formatNumber(value, 2);
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0%';
  return `${Math.round(n)}%`;
}

export function clampPct(n: number | null | undefined): number {
  if (!n || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
