import { Prisma } from '@prisma/client';
import { billRecoveryLines, obligationDue, revisedCompletion, type ObligationAnchors, type ObligationBillLine, type ObligationBillLineDto, type ObligationTerms } from '@erp/shared';
import { dateOnly, money } from '../common/serialize';

/*
 * Contract obligations on a bill (item 171): what each obligation missed costs as of the bill's date less what earlier
 * bills took. `billTotals` runs it for every works bill, and `ContractObligationsService` reads the same anchors.
 */

/** What an obligation's deadline is counted from: the agreement, the start, completion after extensions, the handover. */
export const ANCHOR_SELECT = {
  agreementDate: true,
  startDate: true,
  endDate: true,
  handover: { select: { completedOn: true } },
  risks: { where: { kind: 'DELAY', eotGrantedDays: { not: null } }, select: { eotGrantedDays: true } },
} satisfies Prisma.ProjectSelect;
type AnchorRow = Prisma.ProjectGetPayload<{ select: typeof ANCHOR_SELECT }>;

export function anchorsOf(p: AnchorRow): ObligationAnchors {
  const eot = p.risks.reduce((s, r) => s + (r.eotGrantedDays ?? 0), 0);
  return {
    AGREEMENT: dateOnly(p.agreementDate),
    START: dateOnly(p.startDate),
    COMPLETION: revisedCompletion(dateOnly(p.endDate), eot),
    HANDOVER: dateOnly(p.handover?.completedOn ?? null),
  };
}

type ObligationRow = Prisma.ContractObligationGetPayload<object>;

/** The rules' view of a stored obligation. */
export const termsOf = (o: ObligationRow): ObligationTerms => ({
  party: o.party,
  anchor: o.anchor,
  offsetDays: o.offsetDays,
  offsetMonths: o.offsetMonths,
  dueOn: dateOnly(o.dueOn),
  penalty: o.penalty,
  penaltyValue: o.penaltyValue?.toString() ?? null,
  metOn: dateOnly(o.metOn),
  waived: o.waived,
});

/** Lines as a bill keeps them (`RaBill.obligationLines`), money as strings. */
export const storedLines = (v: Prisma.JsonValue | null): ObligationBillLineDto[] => (Array.isArray(v) ? (v as unknown as ObligationBillLineDto[]) : []);

/** What the bills in `where` deducted per obligation, net of what they gave back. */
export async function deductedByObligation(tx: Prisma.TransactionClient, where: Prisma.RaBillWhereInput): Promise<Map<string, number>> {
  const bills = await tx.raBill.findMany({ where: { ...where, obligationRecovery: { not: 0 } }, select: { obligationLines: true } });
  const out = new Map<string, number>();
  for (const b of bills) for (const l of storedLines(b.obligationLines)) out.set(l.obligationId, Math.round(((out.get(l.obligationId) ?? 0) + Number(l.amount)) * 100) / 100);
  return out;
}

const toDto = (l: ObligationBillLine): ObligationBillLineDto => ({ ...l, upto: money(l.upto)!, previous: money(l.previous)!, amount: money(l.amount)! });

/** A works bill's recovery lines and their total, priced at the bill's date against the contract value. */
export async function obligationRecovery(tx: Prisma.TransactionClient, bill: { projectId: string; billNo: number; billDate: Date }, contractValue: Prisma.Decimal | null) {
  const [project, obligations, previous] = await Promise.all([
    tx.project.findUniqueOrThrow({ where: { id: bill.projectId }, select: ANCHOR_SELECT }),
    tx.contractObligation.findMany({ where: { projectId: bill.projectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    deductedByObligation(tx, { projectId: bill.projectId, billNo: { lt: bill.billNo } }),
  ]);
  if (!obligations.length) return { total: new Prisma.Decimal(0), lines: [] as ObligationBillLineDto[] };
  const anchors = anchorsOf(project);
  const lines = billRecoveryLines(
    obligations.map((o) => {
      const terms = termsOf(o);
      return { ...terms, id: o.id, title: o.title, clause: o.clause, due: obligationDue(terms, anchors) };
    }),
    dateOnly(bill.billDate)!,
    Number(contractValue ?? 0),
    previous,
  );
  const total = lines.reduce((s, l) => s.add(l.amount), new Prisma.Decimal(0));
  return { total, lines: lines.map(toDto) };
}
