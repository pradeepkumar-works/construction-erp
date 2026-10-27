/** Measurement book arithmetic, shared by the API and the forms. */

export interface MeasurementLineInput {
  nos?: string | number | null;
  length?: string | number | null;
  breadth?: string | number | null;
  depth?: string | number | null;
  deduct?: boolean;
}

const val = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** True when the line has at least one dimension or a count. */
export const hasDimensions = (l: MeasurementLineInput) => [l.nos, l.length, l.breadth, l.depth].some((v) => val(v) !== null);

/** nos × L × B × D with blank factors counted as 1, rounded to 3 decimals; negative for a deduction. */
export function measurementLineQty(l: MeasurementLineInput): number {
  if (!hasDimensions(l)) return 0;
  const q = [l.nos, l.length, l.breadth, l.depth].reduce<number>((p, v) => p * (val(v) ?? 1), 1);
  return round3(l.deduct ? -Math.abs(q) : q);
}

export const measurementTotal = (lines: MeasurementLineInput[]) => round3(lines.reduce((s, l) => s + measurementLineQty(l), 0));

/** How far measurement may run past the BOQ quantity before a variation is needed, when the contract does not say. */
export const MEASURE_TOLERANCE_PCT = 25;

/**
 * Whether a sheet takes a BOQ item's measured quantity past its BOQ quantity plus the contract's tolerance (finding 4
 * of the October review: a sheet five times the BOQ went through). `before` is what the item's other sheets hold
 * (all but rejected ones). An item with no BOQ quantity (an extra item) is held by its variation, not here.
 */
export function measureOverBoq(f: { boqQty: number; before: number; sheet: number; tolerancePct?: number | null }): { cap: number; after: number } | null {
  if (!(f.boqQty > 0)) return null;
  const cap = round3(f.boqQty * (1 + (f.tolerancePct ?? MEASURE_TOLERANCE_PCT) / 100));
  const after = round3(f.before + f.sheet);
  return after > cap ? { cap, after } : null;
}
