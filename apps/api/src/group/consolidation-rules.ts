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
  /** BALANCE: a sister ledger's balance on its line. TURNOVER: the period's income or expense on a party document with the sister (`sisterTurnover`). */
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
  /** Its books begin after the period: it has nothing to agree with a sister yet, so no pair with it is drawn */
  noBooks?: boolean;
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

// What counts as turnover with a sister

/**
 * Vouchers that are a sale or purchase with a party: an RA bill, a vendor or subcontractor bill, a debit note, an RMC
 * sale, a site expense on credit. Any other voucher counts only when its one party line is the sister (a hand-made
 * journal against the sister alone); receipts and payments never do, nor the deductions they carry.
 */
export const TURNOVER_SOURCES: readonly string[] = ['SALES', 'PURCHASE', 'SUBCONTRACT', 'DEBIT_NOTE', 'RMC_SALE', 'EXPENSE'];
/** Lines a bill or receipt carries that are no sale or purchase: what the other side kept back or recovered, and exchange. */
export const NOT_TURNOVER_LEDGERS: readonly string[] = ['LABOUR_CESS', 'CLIENT_DEDUCTIONS', 'EXCHANGE_DIFFERENCE', 'VENDOR_DEDUCTIONS', 'MATERIAL_RECOVERY', 'FUEL_RECOVERY'];

export interface PostedVoucher {
  source: string;
  lines: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[];
}
export interface LedgerFact {
  key: string;
  /** A vendor's or client's ledger */
  party: boolean;
  /** An income or expense account */
  profitLoss: boolean;
  /** The sister this party ledger is named as */
  sisterId?: string;
}

/**
 * The period's turnover with each sister, by income or expense account (debit less credit): the income and expense lines
 * of the party documents whose party is that sister, leaving out `NOT_TURNOVER_LEDGERS`.
 */
export function sisterTurnover(vouchers: PostedVoucher[], ledgers: Map<string, LedgerFact>): { sisterId: string; accountId: string; net: Prisma.Decimal }[] {
  const out = new Map<string, { sisterId: string; accountId: string; net: Prisma.Decimal }>();
  for (const v of vouchers) {
    const parties = [...new Set(v.lines.filter((l) => ledgers.get(l.accountId)?.party).map((l) => l.accountId))];
    const sisters = [...new Set(parties.map((id) => ledgers.get(id)?.sisterId))];
    if (sisters.length !== 1 || !sisters[0]) continue;
    if (!TURNOVER_SOURCES.includes(v.source) && parties.length !== 1) continue;
    const sisterId = sisters[0];
    for (const l of v.lines) {
      const a = ledgers.get(l.accountId);
      if (!a?.profitLoss || NOT_TURNOVER_LEDGERS.includes(a.key)) continue;
      const k = `${sisterId}|${l.accountId}`;
      const was = out.get(k) ?? { sisterId, accountId: l.accountId, net: ZERO };
      out.set(k, { ...was, net: was.net.add(l.debit).sub(l.credit) });
    }
  }
  return [...out.values()].filter((r) => !r.net.isZero());
}

/**
 * Turnover is matched line against line: a sister's revenue against the other's purchases, subcontract and other
 * costs; its other income against the other's finance costs. Turnover on any other line is neither matched nor taken out.
 */
export const TURNOVER_BUCKETS: { kind: 'SALES' | 'INTEREST'; income: StatementLine[]; cost: StatementLine[] }[] = [
  { kind: 'SALES', income: ['REVENUE'], cost: ['MATERIALS', 'CONSTRUCTION', 'OTHER_EXPENSES'] },
  { kind: 'INTEREST', income: ['OTHER_INCOME'], cost: ['FINANCE'] },
];

const nature = (line: StatementLine) => STATEMENT_LINE_NATURE[line];
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
 * Balances: each company first sets off what it is owed by the sister against what it owes it (both are inside the
 * group), then what A's books say B owes it, net, is matched against what B's books say it owes A, net, whichever way
 * the debt runs. The matched part comes off the owed side's assets and the owing side's liabilities alike, so assets
 * still equal liabilities. Turnover, each way and each `TURNOVER_BUCKETS` line set: the seller's income against the
 * buyer's cost; the part both hold comes off both alike, on those lines, so profit is unchanged. The rest stays in, shown
 * as the difference. A company outside the consolidation counts for nothing, nor one whose books begin after the
 * period; a pair is considered once either side named the other.
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
    if (a.noBooks || b.noBooks) continue;
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
    const balances = (figs: SisterFigure[], n: 'ASSET' | 'LIABILITY') => figs.filter((f) => f.kind === 'BALANCE' && nature(f.line) === n);
    const turnover = (figs: SisterFigure[], lines: StatementLine[]) => figs.filter((f) => f.kind === 'TURNOVER' && lines.includes(f.line));

    const [aAssets, aLiabilities, bAssets, bLiabilities] = [balances(ab, 'ASSET'), balances(ab, 'LIABILITY'), balances(ba, 'ASSET'), balances(ba, 'LIABILITY')];
    if (aAssets.length + aLiabilities.length + bAssets.length + bLiabilities.length) {
      const [aA, aL, bA, bL] = [positive(aAssets), positive(aLiabilities), positive(bAssets), positive(bLiabilities)];
      const aOwn = Prisma.Decimal.min(aA, aL);
      const bOwn = Prisma.Decimal.min(bA, bL);
      // What each company's books say B owes A, net (negative: A owes B).
      const aSays = aA.sub(aL);
      const bSays = bL.sub(bA);
      const toA = aSays.gt(0) && bSays.gt(0) ? Prisma.Decimal.min(aSays, bSays) : ZERO;
      const toB = aSays.lt(0) && bSays.lt(0) ? Prisma.Decimal.min(aSays.neg(), bSays.neg()) : ZERO;
      removals.push(
        ...take(a.id, aAssets, aOwn.add(toA)),
        ...take(a.id, aLiabilities, aOwn.add(toB)),
        ...take(b.id, bLiabilities, bOwn.add(toA)),
        ...take(b.id, bAssets, bOwn.add(toB)),
      );
      // Shown from the side that is owed.
      const [owed, owes, owedSays, owesSays] = aSays.add(bSays).lt(0) ? [b, a, bSays.neg(), aSays.neg()] : [a, b, aSays, bSays];
      out.push({ key: `${a.id}|${b.id}|BALANCE`, kind: 'BALANCE', a: side(owed, owes, owedSays), b: side(owes, owed, owesSays), eliminated: text(aOwn.add(bOwn).add(toA).add(toB)), difference: text(owedSays.sub(owesSays)) });
    }

    for (const bucket of TURNOVER_BUCKETS)
      for (const [seller, buyer, sold, bought] of [
        [a, b, turnover(ab, bucket.income), turnover(ba, bucket.cost)],
        [b, a, turnover(ba, bucket.income), turnover(ab, bucket.cost)],
      ] as const) {
        if (!sold.length && !bought.length) continue;
        const s = positive(sold);
        const p = positive(bought);
        const both = Prisma.Decimal.min(s, p);
        removals.push(...take(seller.id, sold, both), ...take(buyer.id, bought, both));
        out.push({ key: `${seller.id}|${buyer.id}|${bucket.kind}`, kind: bucket.kind, a: side(seller, buyer, s), b: side(buyer, seller, p), eliminated: text(both), difference: text(s.sub(p)) });
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
