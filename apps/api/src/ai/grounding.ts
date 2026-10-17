import type { AiCitationDto } from '@erp/shared';

/**
 * Checks on an answer before it is shown (AI item 67): links may only point at records a tool returned, and every
 * figure should match something in the tool results. Pure functions, so they can be tested without a model.
 */

/** Every `href` in the tool results: the only places an answer may link to. */
export function collectHrefs(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectHrefs(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'href' && typeof v === 'string' && v.startsWith('/')) out.add(v);
      else collectHrefs(v, out);
    }
  }
  return out;
}

const NUMBER_IN_TEXT = /-?\d[\d,]*(?:\.\d+)?/g;

/** Every number in the tool results (amounts arrive as strings like "1234567.50"). */
export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
  else if (typeof value === 'string') {
    for (const m of value.matchAll(NUMBER_IN_TEXT)) {
      const n = Number(m[0].replace(/,/g, ''));
      if (Number.isFinite(n)) out.push(n);
    }
  } else if (Array.isArray(value)) {
    // "22 bills are waiting" counts the rows it was given.
    out.push(value.length);
    value.forEach((v) => collectNumbers(v, out));
  }
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

/** Keeps internal links to records the tools returned; anything else becomes its plain label. */
export function filterLinks(text: string, allowed: Set<string>): { text: string; citations: AiCitationDto[] } {
  const citations: AiCitationDto[] = [];
  const seen = new Set<string>();
  const out = text.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g, (_all, label: string, href: string) => {
    if (!allowed.has(href)) return label;
    if (!seen.has(href)) {
      seen.add(href);
      citations.push({ href, label: label.replace(/[*_`]/g, '').trim() });
    }
    return `[${label}](${href})`;
  });
  return { text: out, citations };
}

/**
 * A figure in the answer: ₹ amounts, amounts in lakh or crore, percentages, quantities. Record numbers (PO-2026-0014),
 * dates, years and small counts are not figures.
 */
const FIGURE = /(₹\s?|Rs\.?\s?|INR\s?)?(?<![\w\-/])(\d[\d,]*(?:\.\d+)?)\s?(lakhs?|lacs?|L\b|crores?|Cr\b|%|percent)?(?![\w\-/]|\.\d)/gi;

type Scale = 'unit' | 'lakh' | 'crore' | 'percent';

const scaleOf = (suffix: string | undefined): Scale => {
  const s = (suffix ?? '').toLowerCase();
  if (s.startsWith('l')) return 'lakh';
  if (s.startsWith('c')) return 'crore';
  if (s === '%' || s === 'percent') return 'percent';
  return 'unit';
};

/** Figures in `answer` that match nothing in the tool results, as written (at most ten). */
export function unverifiedFigures(answer: string, sourceNumbers: number[]): string[] {
  // Link targets and dates are not figures.
  const text = answer
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s\d{4}\b/gi, ' ');
  const bases: Record<Scale, number[]> = {
    unit: sourceNumbers,
    lakh: sourceNumbers.map((n) => n / 1e5),
    crore: sourceNumbers.map((n) => n / 1e7),
    // A share is either given by a tool (62.5) or is a fraction a tool gave (0.625).
    percent: [...sourceNumbers, ...sourceNumbers.map((n) => n * 100)],
  };
  const cache = new Map<string, Set<string>>();
  const known = (scale: Scale, decimals: number) => {
    const key = `${scale}:${decimals}`;
    if (!cache.has(key)) cache.set(key, new Set(bases[scale].map((n) => n.toFixed(decimals))));
    return cache.get(key)!;
  };
  const out: string[] = [];
  for (const m of text.matchAll(FIGURE)) {
    const [whole, currency, digits, suffix] = m;
    const value = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const scale = scaleOf(suffix);
    // Small counts, years and list numbers ("3 approvals", "2026", "1.") are left alone.
    if (!currency && scale === 'unit' && ((Number.isInteger(value) && value < 10) || (/^\d{4}$/.test(digits) && value >= 1990 && value <= 2100))) continue;
    if (!currency && scale === 'unit' && /^\s*\d+\.\s/.test(text.slice(Math.max(0, (m.index ?? 0) - 1), (m.index ?? 0) + digits.length + 2))) continue;
    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
    const set = known(scale, decimals);
    const hit = set.has(value.toFixed(decimals)) || set.has((-value).toFixed(decimals)) || (decimals === 0 && known(scale, 0).has(Math.round(value).toFixed(0)));
    if (!hit) {
      const label = whole.trim();
      if (!out.includes(label)) out.push(label);
      if (out.length >= 10) break;
    }
  }
  return out;
}
