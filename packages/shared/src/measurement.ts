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
