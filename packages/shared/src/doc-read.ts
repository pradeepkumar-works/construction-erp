/**
 * Reading invoices, challans and drawing title blocks (AI roadmap item 70). The model reads the page images and says
 * where on the page each figure came from; matching what it read to vendors, orders and order lines is plain code here
 * and in the API, and nothing is saved until the user presses Save on the form it fills.
 */
export const DOC_READ_KINDS = ['invoice', 'challan', 'drawing'] as const;
export type DocReadKind = (typeof DOC_READ_KINDS)[number];

/** Pages sent at most, and the most a page image may weigh (the hosted API takes 4.5 MB a request). */
export const DOC_READ_MAX_PAGES = 3;
export const DOC_READ_MAX_PAGE_BYTES = 1_400_000;

/** Fields each kind reads. Lines are read for invoices and challans. */
export const DOC_READ_FIELDS: Record<DocReadKind, readonly string[]> = {
  invoice: ['vendorName', 'gstin', 'invoiceNo', 'invoiceDate', 'poNo', 'subtotal', 'cgst', 'sgst', 'igst', 'freight', 'total'],
  challan: ['supplierName', 'gstin', 'challanNo', 'date', 'vehicleNo', 'poNo'],
  drawing: ['drawingNo', 'revision', 'title', 'date', 'scale', 'issuedBy', 'discipline'],
};

export const DOC_READ_LINE_FIELDS: Record<DocReadKind, readonly string[]> = {
  invoice: ['description', 'hsn', 'quantity', 'unit', 'rate', 'gstRate', 'amount'],
  challan: ['description', 'quantity', 'unit'],
  drawing: [],
};

/** One value read off the page: a string (dates as YYYY-MM-DD) or a number, where it was, and how sure the reading is. */
export interface DocReadField {
  value: string | number | null;
  /** `low` when the model was unsure or the value fails a check (a GSTIN's check character, figures that do not add up) */
  confidence: 'high' | 'low';
  /** Why it is low, in a few words */
  reason: string | null;
  /** 1-based page, and the box around the value on it as [left, top, right, bottom] in thousandths of the page */
  page: number | null;
  box: [number, number, number, number] | null;
}

export type DocReadLine = Record<string, DocReadField>;

export interface DocReadResultDto {
  kind: DocReadKind;
  fields: Record<string, DocReadField>;
  lines: DocReadLine[];
  /** Invoices: the vendor whose GSTIN (or name) matches, the order picked and each line's order line */
  match: {
    vendor: { id: string; name: string } | null;
    purchaseOrder: { id: string; poNo: string } | null;
    /** Index in `lines` to the order line it matched, or null when nothing on the order is like it */
    lines: ({ purchaseOrderLineId: string; itemName: string; score: number } | null)[];
    /** Why the order was picked, or why none was */
    note: string | null;
  } | null;
  model: string;
  costInr: number;
}

/** What a read line can be matched against: an order line, or a material request line. */
export interface MatchCandidate {
  id: string;
  itemName: string;
  specification?: string | null;
  unit: string;
  rate?: number | null;
}

const UNIT_ALIASES: Record<string, string> = {
  bag: 'bags', bags: 'bags', nos: 'nos', no: 'nos', number: 'nos', numbers: 'nos', pcs: 'nos', pc: 'nos', piece: 'nos', pieces: 'nos', ea: 'nos',
  mt: 'mt', ton: 'mt', tons: 'mt', tonne: 'mt', tonnes: 'mt', t: 'mt', kg: 'kg', kgs: 'kg', ltr: 'ltr', l: 'ltr', litre: 'ltr', litres: 'ltr', liter: 'ltr', ltrs: 'ltr',
  cum: 'cum', m3: 'cum', cu: 'cum', cft: 'cft', rmt: 'rmt', rm: 'rmt', m: 'rmt', mtr: 'rmt', metre: 'rmt', meter: 'rmt', sqm: 'sqm', m2: 'sqm',
};

/** A unit as one spelling: "Bags", "bag" → bags; "M3", "Cum" → cum. */
export const normUnit = (u: string | null | undefined): string => {
  const k = (u ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return UNIT_ALIASES[k] ?? k;
};

const words = (s: string): string[] =>
  s
    .toLowerCase()
    // "12 mm", "12mm" and "12" are one number; "53 grade" is 53.
    .replace(/(\d)\s*(mm|kg|grade|swg)\b/g, '$1')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 || /\d/.test(w));

/** How alike two item descriptions are, 0 to 1: shared words over the shorter one's words, numbers counting double. */
export function itemSimilarity(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!wa.size || !wb.size) return 0;
  const weight = (w: string) => (/\d/.test(w) ? 2 : 1);
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += weight(w);
  const small = [...(wa.size <= wb.size ? wa : wb)].reduce((s, w) => s + weight(w), 0);
  // A number in one that the other lacks ("12mm" against "16mm") is a different item.
  const clash = [...wa].some((w) => /\d/.test(w) && !wb.has(w)) && [...wb].some((w) => /\d/.test(w) && !wa.has(w));
  return clash ? (shared / small) * 0.4 : shared / small;
}

/**
 * Pairs each read line with the order line most like it, each order line used once, best pairs first. The unit agreeing
 * and the rate being close add to the description's likeness; a pair under `min` is left unmatched.
 */
export function matchLines(read: { description: string; unit?: string | null; rate?: number | null }[], candidates: MatchCandidate[], min = 0.45): ({ id: string; score: number } | null)[] {
  const pairs: { r: number; c: number; score: number }[] = [];
  read.forEach((l, r) =>
    candidates.forEach((c, ci) => {
      let score = itemSimilarity(l.description, [c.itemName, c.specification].filter(Boolean).join(' '));
      const sameUnit = !!l.unit && normUnit(l.unit) === normUnit(c.unit);
      const sameRate = !!l.rate && !!c.rate && Math.abs(l.rate - c.rate) <= Math.max(1, c.rate * 0.1);
      // The unit and rate only settle between items already alike: 12mm bars at the 16mm rate are still not 16mm bars.
      if (score >= 0.3) score += (sameUnit ? 0.15 : 0) + (sameRate ? 0.1 : 0);
      // An item written in Hindi shares no words with the order's; the unit and a rate within 2% then say it is the one.
      if (!/[a-z]{3}/i.test(l.description.replace(/\d+\s*(mm|kg|ltr|mt)\b/gi, '')) && sameUnit && l.rate && c.rate && Math.abs(l.rate - c.rate) <= c.rate * 0.02) score = Math.max(score, 0.6);
      pairs.push({ r, c: ci, score: Math.min(1, score) });
    }),
  );
  pairs.sort((a, b) => b.score - a.score);
  const out: ({ id: string; score: number } | null)[] = read.map(() => null);
  const used = new Set<number>();
  for (const p of pairs) {
    if (p.score < min || out[p.r] || used.has(p.c)) continue;
    out[p.r] = { id: candidates[p.c].id, score: Math.round(p.score * 100) / 100 };
    used.add(p.c);
  }
  return out;
}

/** A read field's value as a number, or null. */
export const readNumber = (f: DocReadField | undefined): number | null => (typeof f?.value === 'number' ? f.value : null);
/** A read field's value as text, or null. */
export const readText = (f: DocReadField | undefined): string | null => (f?.value === null || f?.value === undefined ? null : String(f.value));

/** A drawing's discipline as printed ("STRUCTURAL", "MEP", "Plumbing & drainage") as the register's, or null. */
export function disciplineOf(text: string | null | undefined): 'ARCHITECTURAL' | 'STRUCTURAL' | 'ROAD' | 'WATER' | 'ELECTRICAL' | 'MECHANICAL' | 'PLUMBING' | null {
  const t = (text ?? '').toLowerCase();
  if (!t) return null;
  if (/archi/.test(t)) return 'ARCHITECTURAL';
  if (/struct|rcc/.test(t)) return 'STRUCTURAL';
  if (/plumb|drain|sanit/.test(t)) return 'PLUMBING';
  if (/elec/.test(t)) return 'ELECTRICAL';
  if (/mech|hvac|mep/.test(t)) return 'MECHANICAL';
  if (/road|highway|pavement/.test(t)) return 'ROAD';
  if (/water|pipe|wtp/.test(t)) return 'WATER';
  return null;
}
