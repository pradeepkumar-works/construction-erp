import { Prisma } from '@prisma/client';
import {
  BALANCE_SHEET_SECTIONS,
  PROFIT_LOSS_EXPENSES,
  PROFIT_LOSS_INCOME,
  STATEMENT_LINE_LABELS,
  STATEMENT_LINE_NATURE,
  type ConsolidatedRowDto,
  type ConsolidatedSectionDto,
  type ConsolidationDto,
  type SisterPairDto,
  type StatementLine,
} from '@erp/shared';

/**
 * Consolidated accounts (item 192, ARCHITECTURE "Consolidated accounts"), pure: each company's statement lines summed
 * by line, less what passed between sister companies. Tested with golden figures in `src/scripts/consolidation-test.ts`.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const text = (v: Prisma.Decimal) => v.toFixed(2);

/** What a company's books hold with one sister, in the line's own sense (`StatementsService.companyFigures`). */
export interface SisterFigure {
  sisterId: string;
  /** BALANCE: a sister ledger's balance on its line. TURNOVER: the period's income or expense through a sister ledger. */
  kind: 'BALANCE' | 'TURNOVER';
  line: StatementLine;
  amount: Prisma.Decimal;
}

export interface CompanyFigures {
  id: string;
  name: string;
  /** Its profit and loss and balance sheet lines, in each line's own sense (the two sets of lines do not overlap) */
  lines: Partial<Record<StatementLine, Prisma.Decimal>>;
  sisters: SisterFigure[];
}

/** A company named a party in its books as this sister. */
export interface SisterLinkFact {
  companyId: string;
  sisterId: string;
}

/** An amount taken off one company's line, in the line's own sense. */
export interface Removal {
  companyId: string;
  line: StatementLine;
  amount: Prisma.Decimal;
}

const nature = (line: StatementLine) => STATEMENT_LINE_NATURE[line];
const sumOf = (figs: SisterFigure[]) => figs.reduce((s, f) => s.add(f.amount), ZERO);
const positive = (figs: SisterFigure[]) => figs.reduce((s, f) => (f.amount.gt(0) ? s.add(f.amount) : s), ZERO);

/** Take `amount` off the figures, largest first, never past a figure: the removals, by the figures' lines. */
function take(companyId: string, figs: SisterFigure[], amount: Prisma.Decimal): Removal[] {
  const out: Removal[] = [];
  let left = amount;
  for (const f of [...figs].filter((x) => x.amount.gt(0)).sort((p, q) => q.amount.comparedTo(p.amount))) {
    if (left.lte(0)) break;
    const x = Prisma.Decimal.min(left, f.amount);
    out.push({ companyId, line: f.line, amount: x });
    left = left.sub(x);
  }
  return out;
}

/**
 * What comes out between each pair of sisters in the consolidation, and the pairs with both companies' figures.
 * Balances: what A's books say B owes it against what B's books say it owes A; the part both hold comes off A's assets
 * and B's liabilities alike (and the other way round), so assets still equal liabilities. Sales, each way: what A's
 * income through B's ledger is against B's expense through A's; the part both hold comes off A's income and B's expense
 * alike, so profit is unchanged. The rest stays in, shown as the difference. A company outside the consolidation
 * counts for nothing; a pair is considered once either side named the other.
 */
export function eliminations(companies: CompanyFigures[], links: SisterLinkFact[]): { removals: Removal[]; pairs: SisterPairDto[] } {
  const inside = new Map(companies.map((c, i) => [c.id, i]));
  const named = new Set(links.map((l) => `${l.companyId}>${l.sisterId}`));
  const pairKeys = new Set<string>();
  const pairs: [CompanyFigures, CompanyFigures][] = [];
  for (const l of links) {
    const i = inside.get(l.companyId);
    const j = inside.get(l.sisterId);
    if (i === undefined || j === undefined || i === j) continue;
    const [a, b] = i < j ? [companies[i], companies[j]] : [companies[j], companies[i]];
    const key = `${a.id}|${b.id}`;
    if (pairKeys.has(key)) continue;
    pairKeys.add(key);
    pairs.push([a, b]);
  }
  pairs.sort(([a1, b1], [a2, b2]) => inside.get(a1.id)! - inside.get(a2.id)! || inside.get(b1.id)! - inside.get(b2.id)!);

  const removals: Removal[] = [];
  const out: SisterPairDto[] = [];
  const side = (c: CompanyFigures, other: CompanyFigures, amount: Prisma.Decimal) => ({ companyId: c.id, name: c.name, amount: text(amount), named: named.has(`${c.id}>${other.id}`) });
  for (const [a, b] of pairs) {
    const ab = a.sisters.filter((f) => f.sisterId === b.id);
    const ba = b.sisters.filter((f) => f.sisterId === a.id);
    const of = (figs: SisterFigure[], kind: SisterFigure['kind'], n: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE') => figs.filter((f) => f.kind === kind && nature(f.line) === n);

    const [aAssets, aLiabilities, bAssets, bLiabilities] = [of(ab, 'BALANCE', 'ASSET'), of(ab, 'BALANCE', 'LIABILITY'), of(ba, 'BALANCE', 'ASSET'), of(ba, 'BALANCE', 'LIABILITY')];
    if (aAssets.length + aLiabilities.length + bAssets.length + bLiabilities.length) {
      const owedToA = Prisma.Decimal.min(positive(aAssets), positive(bLiabilities));
      const owedToB = Prisma.Decimal.min(positive(bAssets), positive(aLiabilities));
      removals.push(...take(a.id, aAssets, owedToA), ...take(b.id, bLiabilities, owedToA), ...take(b.id, bAssets, owedToB), ...take(a.id, aLiabilities, owedToB));
      // What A's books say B owes A, and what B's books say it owes A; shown from the side that is owed.
      const aSays = sumOf(aAssets).sub(sumOf(aLiabilities));
      const bSays = sumOf(bLiabilities).sub(sumOf(bAssets));
      const [owed, owes, owedSays, owesSays] = aSays.add(bSays).lt(0) ? [b, a, bSays.neg(), aSays.neg()] : [a, b, aSays, bSays];
      out.push({ key: `${a.id}|${b.id}|BALANCE`, kind: 'BALANCE', a: side(owed, owes, owedSays), b: side(owes, owed, owesSays), eliminated: text(owedToA.add(owedToB)), difference: text(owedSays.sub(owesSays)) });
    }

    for (const [seller, buyer, sold, bought] of [
      [a, b, of(ab, 'TURNOVER', 'INCOME'), of(ba, 'TURNOVER', 'EXPENSE')],
      [b, a, of(ba, 'TURNOVER', 'INCOME'), of(ab, 'TURNOVER', 'EXPENSE')],
    ] as const) {
      if (!sold.length && !bought.length) continue;
      const both = Prisma.Decimal.min(positive(sold), positive(bought));
      removals.push(...take(seller.id, sold, both), ...take(buyer.id, bought, both));
      const s = sumOf(sold);
      const p = sumOf(bought);
      out.push({ key: `${seller.id}|${buyer.id}|SALES`, kind: 'SALES', a: side(seller, buyer, s), b: side(buyer, seller, p), eliminated: text(both), difference: text(s.sub(p)) });
    }
  }
  return { removals, pairs: out };
}

/** A row's figures as numbers: each company's, what came out, the group's. */
interface Figures {
  companies: Map<string, Prisma.Decimal>;
  eliminated: Prisma.Decimal;
  group: Prisma.Decimal;
}

const asRow = (key: string, line: StatementLine | null, label: string, f: Figures, total: boolean): ConsolidatedRowDto => ({
  key,
  line,
  label,
  companies: Object.fromEntries([...f.companies].map(([id, v]) => [id, text(v)])),
  eliminated: text(f.eliminated),
  group: text(f.group),
  total,
});

const combine = (ids: string[], parts: { f: Figures; sign: 1 | -1 }[]): Figures => {
  const pick = (g: (f: Figures) => Prisma.Decimal) => parts.reduce((s, p) => (p.sign === 1 ? s.add(g(p.f)) : s.sub(g(p.f))), ZERO);
  return { companies: new Map(ids.map((id) => [id, pick((f) => f.companies.get(id) ?? ZERO)])), eliminated: pick((f) => f.eliminated), group: pick((f) => f.group) };
};

/**
 * The group's profit and loss and balance sheet: every company's lines in its own column, the eliminations as one
 * column (negative takes away) and the group's, with the totals the companies' own statements have.
 */
export function consolidate(companies: CompanyFigures[], links: SisterLinkFact[]): Pick<ConsolidationDto, 'profitLoss' | 'balanceSheet' | 'pairs'> {
  const { removals, pairs } = eliminations(companies, links);
  const ids = companies.map((c) => c.id);
  const lineFigures = (line: StatementLine): Figures => {
    const own = new Map(companies.map((c) => [c.id, c.lines[line] ?? ZERO]));
    const eliminated = removals.filter((r) => r.line === line).reduce((s, r) => s.sub(r.amount), ZERO);
    const group = [...own.values()].reduce((s, v) => s.add(v), eliminated);
    return { companies: own, eliminated, group };
  };
  const lines = (order: StatementLine[]) => order.map((line) => ({ line, f: lineFigures(line) }));
  const sum = (rows: { f: Figures }[]) => combine(ids, rows.map((r) => ({ f: r.f, sign: 1 as const })));

  const income = lines(PROFIT_LOSS_INCOME);
  const expenses = lines(PROFIT_LOSS_EXPENSES);
  const tax = lineFigures('TAX');
  const totalIncome = sum(income);
  const totalExpenses = sum(expenses);
  const beforeTax = combine(ids, [{ f: totalIncome, sign: 1 }, { f: totalExpenses, sign: -1 }]);
  const profit = combine(ids, [{ f: beforeTax, sign: 1 }, { f: tax, sign: -1 }]);
  const lineRow = (r: { line: StatementLine; f: Figures }) => asRow(r.line, r.line, STATEMENT_LINE_LABELS[r.line], r.f, false);
  const profitLoss = [
    ...income.map(lineRow),
    asRow('TOTAL_INCOME', null, 'Total income', totalIncome, true),
    ...expenses.map(lineRow),
    asRow('TOTAL_EXPENSES', null, 'Total expenses', totalExpenses, true),
    asRow('PROFIT_BEFORE_TAX', null, 'Profit before tax', beforeTax, true),
    asRow('TAX', 'TAX', STATEMENT_LINE_LABELS.TAX, tax, false),
    asRow('PROFIT', null, 'Profit for the period', profit, true),
  ];

  const sections: ConsolidatedSectionDto[] = BALANCE_SHEET_SECTIONS.map((s) => {
    const rows = lines(s.lines);
    return { key: s.key, label: s.label, side: s.side, rows: rows.map(lineRow), total: asRow(`${s.key}_TOTAL`, null, s.label, sum(rows), true) };
  });
  const sideTotal = (side: 'ASSET' | 'LIABILITY', key: string, label: string) =>
    asRow(key, null, label, sum(BALANCE_SHEET_SECTIONS.filter((s) => s.side === side).flatMap((s) => lines(s.lines))), true);
  return {
    profitLoss,
    balanceSheet: { sections, totalLiabilities: sideTotal('LIABILITY', 'TOTAL_LIABILITIES', 'Total equity and liabilities'), totalAssets: sideTotal('ASSET', 'TOTAL_ASSETS', 'Total assets') },
    pairs,
  };
}

/**
 * The period a company's figures cover. BOOKS: the consolidation's own. LOCK: the profit and loss and the balance sheet
 * stop at the company's lock when it falls before the period's end (a lock before the period's start leaves no
 * profit and loss: `to` is then before `from`); a company with no lock runs to the period's end.
 */
export function companyPeriod(basis: ConsolidationDto['basis'], period: { from: string; to: string }, lockedUpTo: string | null): { from: string; to: string } {
  if (basis === 'LOCK' && lockedUpTo && lockedUpTo < period.to) return { from: period.from, to: lockedUpTo };
  return { ...period };
}
