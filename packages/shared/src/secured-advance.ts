/**
 * Secured advance on an RA bill (CPWD practice): the client pays a share of the value of non-perishable material the
 * contractor has brought to site for the work and not yet used, against an indenture, and takes it back as the material
 * is used. Each bill declares the material at site again: it pays the advance on what is there now and recovers the
 * previous bill's advance, so the net effect of a bill is this advance less the previous one. Pure, tested in
 * `apps/api/src/scripts/secured-advance-test.ts`; `billTotals` prices a bill with it.
 */

/**
 * `x` rounded half up to paise, where `x` is known to have at most `exactDp` decimals (a quantity of 3 times a rate of
 * 2 has 5): the float noise goes first, so 0.5 × 0.01 is 0.01, as the bill's decimal arithmetic makes it.
 */
function roundPaise(x: number, exactDp: number): number {
  const [whole, frac = ''] = Math.abs(x).toFixed(exactDp).split('.');
  const scaled = Number(whole + frac);
  const unit = 10 ** (exactDp - 2);
  return (Math.sign(x) * Math.floor((scaled + unit / 2) / unit)) / 100;
}

export interface SecuredAdvanceLineInput {
  /** The item master's item, when picked */
  itemId?: string | null;
  description: string;
  unit: string;
  qtyAtSite: number | string;
  rate: number | string;
}

export interface SecuredAdvanceLine extends SecuredAdvanceLineInput {
  /** Quantity at site × rate */
  value: number;
  /** value × the bill's % */
  advance: number;
}

export interface SecuredAdvance {
  lines: SecuredAdvanceLine[];
  /** Σ advance: what this bill pays on the material at site now */
  securedAdvance: number;
  /** The previous bill's advance, recovered on this bill */
  recovered: number;
  /** securedAdvance − recovered: what the bill adds to (or, once material is used, takes off) the net payable */
  net: number;
}

/** Each line's value and advance at `pct`, this bill's advance, the previous bill's recovered, and the net of the two. */
export function securedAdvanceOf(f: { pct: number | string | null; lines: SecuredAdvanceLineInput[]; previous: number | string }): SecuredAdvance {
  const pct = Number(f.pct ?? 0);
  const lines = f.lines.map((l) => {
    const value = roundPaise(Number(l.qtyAtSite) * Number(l.rate), 5);
    return { ...l, value, advance: roundPaise((value * pct) / 100, 6) };
  });
  const securedAdvance = roundPaise(lines.reduce((s, l) => s + l.advance, 0), 2);
  const recovered = roundPaise(Number(f.previous), 2);
  return { lines, securedAdvance, recovered, net: roundPaise(securedAdvance - recovered, 2) };
}

/** What stops a bill's material at site from being saved; null when it can be. */
export function securedAdvanceProblem(f: { pct: number | string | null; lines: SecuredAdvanceLineInput[]; isFinal: boolean; om: boolean }): string | null {
  if (!f.lines.length) return null;
  if (f.om) return 'An O&M bill takes no secured advance: that belongs to the works';
  if (f.isFinal) return 'A final bill carries no secured advance: by then the material is used, and the bill recovers the last advance';
  if (f.pct === null || f.pct === '' || Number(f.pct) <= 0) return 'The contract gives no secured advance: set its % on the contract terms first';
  for (const [i, l] of f.lines.entries()) {
    const at = `Line ${i + 1}`;
    if (!l.description.trim()) return `${at}: name the material`;
    if (!l.unit.trim()) return `${at}: give the unit`;
    if (!(Number(l.qtyAtSite) > 0)) return `${at}: enter the quantity at site, more than 0`;
    if (!(Number(l.rate) > 0)) return `${at}: enter the rate it was bought at, more than 0`;
  }
  return null;
}
