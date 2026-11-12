/**
 * Excess and saving statement, and quantity beyond the deviation limit (ARCHITECTURE "Excess and saving statement").
 * Each BOQ item's agreement quantity against what it is expected to end at: the excess over it and the saving under it,
 * at the bill rate. Quantity past the deviation limit (the contract's measurement tolerance) is paid at a revised rate
 * through a variation, which adds an excess item under the BOQ item ("2.8-X") with that rate; extra items come in
 * through variations too.
 */

const paise = (v: number) => Math.round(v * 100);
const rupees = (p: number) => p / 100;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** The item number of a BOQ item's excess item: "2.8-X", then "2.8-X2" and on while the number is taken. */
export function excessItemNo(parentNo: string, taken: ReadonlySet<string>): string {
  const has = (n: string) => taken.has(n.toLowerCase());
  if (!has(`${parentNo}-X`)) return `${parentNo}-X`;
  for (let i = 2; ; i++) if (!has(`${parentNo}-X${i}`)) return `${parentNo}-X${i}`;
}

/** An excess item's description: its BOQ item's, with what it is for. */
export const excessItemDescription = (parent: string) => `${parent} (quantity beyond the deviation limit)`;

export type ExcessSavingKind = 'BOQ' | 'EXCESS' | 'EXTRA';
export const EXCESS_SAVING_KIND_LABELS: Record<ExcessSavingKind, string> = { BOQ: 'BOQ item', EXCESS: 'Beyond the deviation limit', EXTRA: 'Extra item' };

export interface ExcessSavingFact {
  id: string;
  itemNo: string;
  description: string;
  unit: string;
  /** The rate it is billed at (the tender premium in it) */
  rate: number;
  originalQty: number;
  /** After approved variations; null when none changed it */
  revisedQty: number | null;
  /** What the quantity surveyor expects it to end at; null to take the default */
  anticipatedQty: number | null;
  /** Approved measurements to date */
  measuredQty: number;
  /** The BOQ item an excess item is under */
  excessOfId: string | null;
}

export interface ExcessSavingRowDto {
  boqItemId: string;
  kind: ExcessSavingKind;
  itemNo: string;
  description: string;
  unit: string;
  rate: string;
  /** The parent's item number, for an excess item */
  parentItemNo: string | null;
  agreementQty: string;
  agreementAmount: string;
  /** After approved variations */
  sanctionedQty: string;
  measuredQty: string;
  anticipatedQty: string;
  /** The quantity surveyor set it; else it is the larger of measured and sanctioned */
  anticipatedSet: boolean;
  anticipatedAmount: string;
  excessQty: string;
  excessAmount: string;
  savingQty: string;
  savingAmount: string;
  /** A BOQ item's sanctioned quantity plus the tolerance, measured past which needs a variation */
  limitQty: string | null;
  /** How far the anticipated quantity goes past the limit with no excess item to take it */
  pastLimitQty: string | null;
}

export interface ExcessSavingTotals {
  agreement: string;
  anticipated: string;
  excess: string;
  saving: string;
  /** anticipated − agreement */
  net: string;
  /** net ÷ agreement, %, one decimal; null with no agreement amount */
  netPct: number | null;
}

export interface ExcessSavingDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  tolerancePct: number;
  rows: ExcessSavingRowDto[];
  totals: ExcessSavingTotals;
  /** The caller may set anticipated quantities */
  canEdit: boolean;
}

const qty = (n: number) => String(round3(n));
const amt = (p: number) => rupees(p).toFixed(2);

/**
 * The statement's rows in BOQ order (each excess item right under its BOQ item) and totals. A row's anticipated quantity
 * defaults to the larger of what is measured and what is sanctioned, so a saving shows only where the quantity surveyor
 * expects less.
 */
export function excessSaving(items: ExcessSavingFact[], tolerancePct: number): { rows: ExcessSavingRowDto[]; totals: ExcessSavingTotals } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const hasExcess = new Set(items.filter((i) => i.excessOfId).map((i) => i.excessOfId!));
  const ordered: ExcessSavingFact[] = [];
  for (const i of items) {
    if (i.excessOfId && byId.has(i.excessOfId)) continue;
    ordered.push(i, ...items.filter((x) => x.excessOfId === i.id));
  }
  let agreementP = 0;
  let anticipatedP = 0;
  let excessP = 0;
  let savingP = 0;
  const rows = ordered.map((i): ExcessSavingRowDto => {
    const parent = i.excessOfId ? byId.get(i.excessOfId) : undefined;
    const kind: ExcessSavingKind = parent ? 'EXCESS' : i.originalQty > 0 ? 'BOQ' : 'EXTRA';
    const sanctioned = i.revisedQty ?? i.originalQty;
    const anticipated = i.anticipatedQty ?? Math.max(i.measuredQty, sanctioned);
    const agreement = i.originalQty;
    const excess = Math.max(0, round3(anticipated - agreement));
    const saving = Math.max(0, round3(agreement - anticipated));
    const pAgreement = paise(agreement * i.rate);
    const pAnticipated = paise(anticipated * i.rate);
    const pExcess = paise(excess * i.rate);
    const pSaving = paise(saving * i.rate);
    agreementP += pAgreement;
    anticipatedP += pAnticipated;
    excessP += pExcess;
    savingP += pSaving;
    const limit = kind === 'BOQ' ? round3(sanctioned * (1 + tolerancePct / 100)) : null;
    const past = limit !== null && !hasExcess.has(i.id) ? round3(anticipated - limit) : 0;
    return {
      boqItemId: i.id,
      kind,
      itemNo: i.itemNo,
      description: i.description,
      unit: i.unit,
      rate: i.rate.toFixed(2),
      parentItemNo: parent?.itemNo ?? null,
      agreementQty: qty(agreement),
      agreementAmount: amt(pAgreement),
      sanctionedQty: qty(sanctioned),
      measuredQty: qty(i.measuredQty),
      anticipatedQty: qty(anticipated),
      anticipatedSet: i.anticipatedQty !== null,
      anticipatedAmount: amt(pAnticipated),
      excessQty: qty(excess),
      excessAmount: amt(pExcess),
      savingQty: qty(saving),
      savingAmount: amt(pSaving),
      limitQty: limit === null ? null : qty(limit),
      pastLimitQty: past > 0 ? qty(past) : null,
    };
  });
  const net = anticipatedP - agreementP;
  return {
    rows,
    totals: {
      agreement: amt(agreementP),
      anticipated: amt(anticipatedP),
      excess: amt(excessP),
      saving: amt(savingP),
      net: amt(net),
      netPct: agreementP ? Math.round((net / agreementP) * 1000) / 10 : null,
    },
  };
}

/** What stops an anticipated quantity being set: below zero, or below what is already measured. */
export function anticipatedQtyProblem(anticipated: number | null, measured: number): string | null {
  if (anticipated === null) return null;
  if (!Number.isFinite(anticipated) || anticipated < 0) return 'Enter a quantity of 0 or more';
  if (anticipated < measured) return `It is already measured to ${round3(measured)}: expect at least that`;
  return null;
}
