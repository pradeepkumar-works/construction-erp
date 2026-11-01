import { currencySymbol, fromRupees, isForeign, type ContractCurrency } from './epc';

/**
 * How numbers read, on the web, in print, in Excel and in the API's own words (ARCHITECTURE "Headline figures"). The web's
 * `lib/format.ts` re-exports these, so a screen and the figures it shows say a number one way.
 */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const intl0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** ₹ and a no-break space, so the symbol never wraps away from its figure (docs/WRITING.md). */
export const RUPEE = '₹ ';

/** An empty cell or value: an en dash, so it never reads as a minus sign. */
export const NO_VALUE = '–';

/** A minus sign (U+2212), not a hyphen, before the symbol: "−₹ 26,773". */
const MINUS = '−';

/** Full INR with Indian digit grouping: ₹ 18,65,00,000 */
export function formatINR(value: string | number | null | undefined, decimals = false): string {
  const n = toNumber(value);
  return `${RUPEE}${decimals ? inr2.format(n) : inr.format(n)}`;
}

/** Compact INR for KPIs: ₹ 1.87 Cr / ₹ 12.50 L / ₹ 85,000 */
export function formatINRCompact(value: string | number | null | undefined): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${RUPEE}${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${RUPEE}${(n / 1e5).toFixed(2)} L`;
  return `${RUPEE}${inr.format(n)}`;
}

export function formatQty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return NO_VALUE;
  return num.format(toNumber(value));
}

/** A count of things, grouped the Indian way: "1,23,456". */
export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? NO_VALUE : inr.format(value);
}

/** "1 bill", "3 bills"; `many` for a plural that is not `one` + s ("activity", "activities"). */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A label inside a sentence: "RA Bill" reads "RA bill", "Measurement (MB)" reads "measurement (MB)"; abbreviations keep their capitals. */
export function inSentence(label: string): string {
  return label
    .split(' ')
    .map((w) => (/^\(?[A-Z0-9]{2,}\)?$/.test(w) ? w : w.toLowerCase()))
    .join(' ');
}

const pctFormats = new Map<string, Intl.NumberFormat>();

/**
 * A percentage, written one way everywhere: whole numbers from 10% up, one decimal below it (2.5%, and 2%
 * rather than 2.0%), `%` without a space, `–` for none. `digits` fixes the decimals instead ({ digits: 0 } for a
 * whole number always).
 */
export function formatPct(value: number | string | null | undefined, opts: { digits?: number } = {}): string {
  if (value === null || value === undefined || value === '') return NO_VALUE;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return NO_VALUE;
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

/** Words twice: as shown ("₹ 14.16 Cr", "Sep") and as a screen reader should say them ("₹ 14.16 crore", "September"). */
export interface Words {
  readonly text: string;
  readonly spoken: string;
}

/**
 * The one unit a strip's money shares, so ₹ 9.42 Cr never sits beside ₹ 99.18 L: crore from a crore, lakh from a lakh,
 * else rupees; a contract in another currency gets million, thousand or units of its own.
 */
export type MoneyUnit = 'crore' | 'lakh' | 'rupee' | 'million' | 'thousand' | 'unit';

const UNITS: Record<MoneyUnit, { size: number; text: string; spoken: string; digits: number }> = {
  crore: { size: 1e7, text: ' Cr', spoken: ' crore', digits: 2 },
  lakh: { size: 1e5, text: ' L', spoken: ' lakh', digits: 2 },
  rupee: { size: 1, text: '', spoken: '', digits: 0 },
  million: { size: 1e6, text: ' M', spoken: ' million', digits: 2 },
  thousand: { size: 1e3, text: ' K', spoken: ' thousand', digits: 1 },
  unit: { size: 1, text: '', spoken: '', digits: 0 },
};

const inContractUnits = (rupees: number, c?: ContractCurrency | null) => (isForeign(c) ? fromRupees(rupees, c.exchangeRate) : rupees);

/** The unit for these rupee amounts, from the largest of them. */
export function moneyUnitOf(rupees: readonly number[], c?: ContractCurrency | null): MoneyUnit {
  const top = Math.max(0, ...rupees.map((r) => Math.abs(inContractUnits(r, c))));
  if (isForeign(c)) return top >= 1e6 ? 'million' : top >= 1e3 ? 'thousand' : 'unit';
  return top >= 1e7 ? 'crore' : top >= 1e5 ? 'lakh' : 'rupee';
}

/**
 * Money in a fixed unit: "₹ 0.99 Cr" beside "₹ 14.16 Cr", a minus (U+2212) before the symbol. An amount that would read
 * below 0.01 of the unit reads in its own instead, and nothing reads "₹ 0", never "₹ 0.00 Cr".
 */
export function formatMoneyIn(rupees: number, unit: MoneyUnit, c?: ContractCurrency | null): Words {
  const v = inContractUnits(rupees, c);
  const abs = Math.abs(v);
  const symbol = isForeign(c) ? `${currencySymbol(c.currency)} ` : RUPEE;
  if (abs === 0) return { text: `${symbol}0`, spoken: `${symbol}0` };
  const own = abs < UNITS[unit].size * 0.005 ? moneyUnitOf([rupees], c) : unit;
  const u = UNITS[own];
  const digits = u.size === 1 ? (isForeign(c) ? intl0.format(abs) : inr.format(abs)) : (abs / u.size).toFixed(u.digits);
  const sign = v < 0 ? MINUS : '';
  return { text: `${sign}${symbol}${digits}${u.text}`, spoken: `${v < 0 ? 'minus ' : ''}${symbol}${digits}${u.spoken}` };
}

/** Money in its own compact unit, for a note: "₹ 3.20 L" beside a strip in crore. */
export const moneyWords = (rupees: number, c?: ContractCurrency | null): Words => formatMoneyIn(rupees, moneyUnitOf([rupees], c), c);
