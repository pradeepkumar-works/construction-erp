/**
 * A purchase order against its project's material budget (design review, November 2026: "Accounts budget check"
 * before a PO is approved). Ordered is every other approved order of the project before GST; the order counts before
 * GST too, since the budget is the cost head's. Advice beside the decision, never a gate.
 */
export interface PoBudgetCheckDto {
  /** The project's material budget */
  budget: string;
  /** Other approved orders of the project, before GST */
  ordered: string;
  /** This order, before GST */
  thisOrder: string;
  /** What is left of the budget once this order is placed; negative when it goes over */
  left: string;
}

/** Null when the project has no material budget to stand against. */
export function poBudgetCheck(budget: number | null, ordered: number, thisOrder: number): PoBudgetCheckDto | null {
  if (budget === null || budget <= 0) return null;
  const r2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  return { budget: r2(budget), ordered: r2(ordered), thisOrder: r2(thisOrder), left: r2(budget - ordered - thisOrder) };
}

export const poOverBudget = (c: PoBudgetCheckDto) => Number(c.left) < 0;
