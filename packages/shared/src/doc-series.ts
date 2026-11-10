/**
 * Document number series (ARCHITECTURE "Company settings"): how a company numbers its purchase orders, bills, permits and
 * the rest. Every kind numbers through `nextDocNo` in the API, which reads the company's pattern for the kind here; a kind
 * the company has not set keeps the standard PO-2026-0001. The running number is always the last part and four digits,
 * and it starts again whenever the part before it changes: each year with {YYYY}, each financial year with {FY}.
 */
import { financialYearOf } from './procurement';

/** Every kind of document numbered by series, in the order Settings lists them, with its standard code. */
export const DOC_SERIES_KINDS = {
  PO: 'Purchase orders',
  WO: 'Work orders',
  VB: 'Vendor bills',
  PR: 'Payment requests',
  DN: 'Debit notes',
  EXP: 'Site expenses',
  MR: 'Indents',
  MAR: 'Material approvals',
  SCE: 'Subcontract enquiries',
  TND: 'Tenders',
  MB: 'Measurement sheets',
  INS: 'Inspections',
  TST: 'Tests',
  NCR: 'NCRs',
  POUR: 'Pour cards',
  AUD: 'QA audits',
  INC: 'Incidents',
  PTW: 'Permits to work',
  TBT: 'Toolbox talks',
  RISK: 'Risks and delays',
  RFI: 'RFIs',
  TRN: 'Transmittals',
  DSN: 'Design submissions',
  MOM: 'Minutes of meetings',
  MNT: 'Machine maintenance',
  SNG: 'Snags',
  DEF: 'Defects',
  RMC: 'RMC orders',
  DC: 'RMC delivery challans',
  RINV: 'RMC invoices',
} as const;
export type DocSeriesKind = keyof typeof DOC_SERIES_KINDS;
export const DOC_SERIES_KIND_KEYS = Object.keys(DOC_SERIES_KINDS) as DocSeriesKind[];

/** The parts a pattern can have besides its own letters. */
export const DOC_SERIES_TOKENS = ['{YYYY}', '{YY}', '{FY}', '{NNNN}'] as const;
/** The company's patterns by kind; a kind it has not set is not in it. */
export type DocSeriesSettings = Partial<Record<DocSeriesKind, string>>;

/** The standard pattern of a kind: PO-{YYYY}-{NNNN}, which numbers PO-2026-0001. */
export const standardDocPattern = (kind: string) => `${kind}-{YYYY}-{NNNN}`;

/** The company's pattern for a kind, else the standard one. */
export function docPatternOf(settings: unknown, kind: string): string {
  const own = readDocSeries(settings)[kind as DocSeriesKind];
  return own ?? standardDocPattern(kind);
}

/** The stored settings as patterns by kind, leaving out anything that is not a known kind with a good pattern. */
export function readDocSeries(raw: unknown): DocSeriesSettings {
  const out: DocSeriesSettings = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k in DOC_SERIES_KINDS && typeof v === 'string' && !docPatternProblem(v)) out[k as DocSeriesKind] = v.trim();
  }
  return out;
}

/** The financial year (April to March) of a date as 26-27. */
export function fyShort(date: string): string {
  const fy = financialYearOf(date);
  return `${fy.from.slice(2, 4)}-${fy.to.slice(2, 4)}`;
}

/** Everything before the running number on a date: PO/BBSR/26-27/ for PO/BBSR/{FY}/{NNNN}. */
export function docNoPrefix(pattern: string, date: string): string {
  return pattern
    .trim()
    .replace(/\{NNNN\}$/, '')
    .replace(/\{YYYY\}/g, date.slice(0, 4))
    .replace(/\{YY\}/g, date.slice(2, 4))
    .replace(/\{FY\}/g, fyShort(date));
}

/** The number a pattern gives the `n`th document of its prefix on a date. */
export const formatDocNo = (pattern: string, date: string, n: number) => `${docNoPrefix(pattern, date)}${String(n).padStart(4, '0')}`;

/**
 * The running number after `last`, the highest number so far that starts with this prefix (null for none). A number of
 * another pattern that only starts the same way (PO/26-27/0041 under a new PO/ prefix) does not count.
 */
export function nextRunningNo(prefix: string, last: string | null): number {
  if (!last || !last.startsWith(prefix)) return 1;
  const rest = last.slice(prefix.length);
  return /^\d+$/.test(rest) ? parseInt(rest, 10) + 1 : 1;
}

/** What is wrong with a pattern, or null. */
export function docPatternProblem(pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return 'Enter the pattern, such as PO/{FY}/{NNNN}';
  if (p.length > 30) return 'Keep the pattern to 30 characters';
  const unknown = (p.match(/\{[^}]*\}/g) ?? []).filter((t) => !(DOC_SERIES_TOKENS as readonly string[]).includes(t));
  if (unknown.length) return `${unknown[0]} is not a part a number can have; use ${DOC_SERIES_TOKENS.join(' ')}`;
  if (!p.endsWith('{NNNN}')) return 'End the pattern with {NNNN}, the running number';
  if ((p.match(/\{NNNN\}/g) ?? []).length > 1) return 'Put {NNNN} in the pattern once';
  const own = p.replace(/\{[^}]*\}/g, '');
  if (!/^[A-Za-z0-9/._-]*$/.test(own)) return 'Use letters, digits and / - _ . in the pattern, with no spaces';
  if (!/[A-Za-z]/.test(own)) return 'Start the pattern with letters, such as PO, so each kind reads apart';
  return null;
}

/** What is wrong with a company's patterns, or null: each must be good, and no two kinds may share one. */
export function docSeriesProblem(series: Record<string, string>): string | null {
  const seen = new Map<string, string>();
  for (const [kind, pattern] of Object.entries(series)) {
    if (!(kind in DOC_SERIES_KINDS)) return `${kind} is not a kind of document Nirmaan numbers`;
    const problem = docPatternProblem(pattern);
    if (problem) return `${DOC_SERIES_KINDS[kind as DocSeriesKind]}: ${problem}`;
    const key = pattern.trim().toUpperCase();
    const other = seen.get(key);
    if (other) return `${DOC_SERIES_KINDS[other as DocSeriesKind]} and ${DOC_SERIES_KINDS[kind as DocSeriesKind]} have the same pattern; give each its own`;
    seen.set(key, kind);
  }
  return null;
}

/** When a pattern's numbers start again, in words for Settings. */
export function docSeriesRestarts(pattern: string): string {
  if (pattern.includes('{FY}')) return 'Each financial year';
  if (pattern.includes('{YYYY}') || pattern.includes('{YY}')) return 'Each calendar year';
  return 'Never';
}
