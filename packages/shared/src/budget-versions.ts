/**
 * A project's budget in versions (ARCHITECTURE "Budget and cash flow"). Version 1 is the budget as first approved; each
 * later one is a revision with a reason. A version is prepared (DRAFT, or RETURNED to fix), SUBMITTED to admin or
 * management, and APPROVED by someone other than its preparer, which SUPERSEDES the version before. Only the approved
 * version counts: the forecast, the cash flow, the PO check and the BOQ items' budget rates read it.
 */
import type { BudgetStatus, RoleKey } from './enums';
import { COST_HEADS, type CostHead } from './cost';
import { canApproveBudget } from './permissions';
import { ownEntryProblem } from './approvals';
import { BUDGET_REVISION_OTHER } from './masters';

/** A project has at most one of these at a time: the revision being prepared or waiting for a decision. */
export const OPEN_BUDGET_STATUSES: readonly BudgetStatus[] = ['DRAFT', 'SUBMITTED', 'RETURNED'];
/** Its preparer may still change it. */
export const EDITABLE_BUDGET_STATUSES: readonly BudgetStatus[] = ['DRAFT', 'RETURNED'];

export const isOpenBudget = (s: BudgetStatus) => OPEN_BUDGET_STATUSES.includes(s);
export const isEditableBudget = (s: BudgetStatus) => EDITABLE_BUDGET_STATUSES.includes(s);

/** The version in force: the approved one (the latest, should there ever be two). */
export function approvedVersionOf<T extends { status: BudgetStatus; versionNo: number }>(versions: readonly T[]): T | null {
  return versions.filter((v) => v.status === 'APPROVED').sort((a, b) => b.versionNo - a.versionNo)[0] ?? null;
}

/** The version still being prepared or decided, if any. */
export function openVersionOf<T extends { status: BudgetStatus }>(versions: readonly T[]): T | null {
  return versions.find((v) => isOpenBudget(v.status)) ?? null;
}

type Amount = string | number;

/** What the rules read of a version. Heads are null when it has no cost-head budget. */
export interface BudgetVersionInput {
  versionNo: number;
  reasonCode: string | null;
  reasonNote: string | null;
  heads: Record<CostHead, Amount> | null;
  lines: { budgetRate: Amount }[];
}

/** A version's amounts as they may be saved: none below zero. */
export function budgetAmountProblem(v: Pick<BudgetVersionInput, 'heads' | 'lines'>): string | null {
  if (v.heads && COST_HEADS.some((h) => Number(v.heads![h]) < 0)) return 'A budget cannot be negative';
  if (v.lines.some((l) => Number(l.budgetRate) < 0)) return 'A budget rate cannot be negative';
  return null;
}

/** What stops a version being submitted; null when it may go. */
export function budgetVersionProblem(v: BudgetVersionInput): string | null {
  const amounts = budgetAmountProblem(v);
  if (amounts) return amounts;
  if (!v.heads && !v.lines.length) return 'Set the budget by cost head, or give the BOQ items a budget rate';
  if (v.versionNo > 1 && !v.reasonCode) return 'Choose why the budget is revised';
  if (v.reasonCode === BUDGET_REVISION_OTHER && !v.reasonNote?.trim()) return 'Say why the budget is revised';
  return null;
}

export type BudgetDecision = 'APPROVE' | 'RETURN';

/**
 * What stops `deciderId` deciding a version; null when they may. Admin and management decide, only a submitted version,
 * never one they prepared, and a return says what to change.
 */
export function budgetDecisionProblem(d: {
  version: { status: BudgetStatus; preparedById: string };
  deciderId: string;
  deciderRole: RoleKey;
  decision?: BudgetDecision;
  note?: string | null;
}): string | null {
  if (!canApproveBudget(d.deciderRole)) return 'Admin or management approve a budget';
  if (d.version.status !== 'SUBMITTED') return 'This version is not waiting for a decision';
  const own = ownEntryProblem(d.version.preparedById, d.deciderId);
  if (own) return 'You prepared this version, so someone else in admin or management decides it.';
  if (d.decision === 'RETURN' && !d.note?.trim()) return 'Say what to change, so the version can be fixed and sent again';
  return null;
}

/** A version's figures: its heads (null for none) and its BOQ budget at today's quantities (null when no item has a rate). */
export interface BudgetFigures {
  heads: Record<CostHead, number> | null;
  boqBudget: number | null;
}

/** The budget at completion: the cost-head total, else the BOQ budget. */
export function budgetAtCompletionOf(f: BudgetFigures): number | null {
  return f.heads ? round2(COST_HEADS.reduce((s, h) => s + f.heads![h], 0)) : f.boqBudget;
}

export interface BudgetAmountChangeDto {
  from: string | null;
  to: string | null;
  /** to − from, a missing side read as zero; null when both are missing */
  change: string | null;
}

/** What a version changes against the one before it, by head and in total. */
export interface BudgetChangeDto {
  /** Each head, when either version has a cost-head budget; else empty */
  heads: (BudgetAmountChangeDto & { head: CostHead })[];
  boqBudget: BudgetAmountChangeDto;
  /** The budget at completion */
  total: BudgetAmountChangeDto;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (n: number | null) => (n === null ? null : round2(n).toFixed(2));
const amountChange = (from: number | null, to: number | null): BudgetAmountChangeDto => ({
  from: str(from),
  to: str(to),
  change: from === null && to === null ? null : str((to ?? 0) - (from ?? 0)),
});

/** `proposed` against `approved` (null for a first version, whose change is all of it). */
export function budgetChange(approved: BudgetFigures | null, proposed: BudgetFigures): BudgetChangeDto {
  const hasHeads = !!approved?.heads || !!proposed.heads;
  return {
    heads: hasHeads ? COST_HEADS.map((head) => ({ head, ...amountChange(approved?.heads?.[head] ?? null, proposed.heads?.[head] ?? null) })) : [],
    boqBudget: amountChange(approved?.boqBudget ?? null, proposed.boqBudget),
    total: amountChange(approved ? budgetAtCompletionOf(approved) : null, budgetAtCompletionOf(proposed)),
  };
}

/** One version in a project's budget history. */
export interface BudgetVersionDto {
  id: string;
  versionNo: number;
  status: BudgetStatus;
  /** Code of the `budgetRevision` master; null on version 1 */
  reasonCode: string | null;
  /** The reason's words, from the company's master */
  reasonName: string | null;
  reasonNote: string | null;
  variationId: string | null;
  variationNo: string | null;
  notes: string | null;
  /** The budget at completion this version sets */
  total: string | null;
  preparedById: string;
  preparedByName: string;
  createdAt: string;
  submittedAt: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  approvedAt: string | null;
  /** Against the version before it (for an open one, the version in force) */
  change: BudgetChangeDto;
}

/** The version being prepared or decided, with what it sets and what the caller may do with it. */
export interface BudgetOpenVersionDto extends BudgetVersionDto {
  heads: Record<CostHead, string> | null;
  /** BOQ budget rates of this version; items left out have none */
  lines: { boqItemId: string; budgetRate: string }[];
  /** What stops it being submitted (`budgetVersionProblem`); null when it may go */
  problem: string | null;
  can: { edit: boolean; submit: boolean; decide: boolean; delete: boolean };
}
