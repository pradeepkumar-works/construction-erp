import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ALL_APPROVAL_RIGHTS, MAX_APPROVAL_LEVELS, ROLE_KEYS, SUBMISSION_TYPES, defaultApprovalRights, hasAmount, isGuest, machineryLogCost, type ApprovalRightDto, type RoleKey, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { money } from './serialize';
import { levelRoles, mayDecide, stageOf, type LevelRule, type LevelStep, type Stage } from './approval-levels';

/** One entry to place in its approval levels: `round` is when it was last submitted. */
export interface LevelEntry {
  type: SubmissionType;
  id: string;
  amount: string | null;
  round: Date;
}

/**
 * Who may approve what, from the organisation's approval matrix (`ApprovalRule`). An organisation without rules
 * uses the fixed rule (APPROVER_ROLES approve every type, no limit; QA/QC also passes inspections). Admin always may approve everything, so a
 * submission can never be left without anyone able to approve it. Project visibility still comes from
 * ProjectAccessService: a right only counts on projects the user can see.
 */
@Injectable()
export class ApprovalRightsService {
  constructor(private prisma: PrismaService) {}

  async isCustom(organizationId: string): Promise<boolean> {
    return (await this.prisma.approvalRule.count({ where: { organizationId } })) > 0;
  }

  /** Every rule of the matrix with its level (empty while the organisation uses the fixed rule). */
  async rules(organizationId: string): Promise<LevelRule[]> {
    const rows = await this.prisma.approvalRule.findMany({ where: { organizationId }, include: { role: { select: { key: true } } } });
    return rows
      .filter((r) => (SUBMISSION_TYPES as readonly string[]).includes(r.submissionType) && (ROLE_KEYS as readonly string[]).includes(r.role.key) && !isGuest(r.role.key as RoleKey))
      .map((r) => ({ roleKey: r.role.key as RoleKey, type: r.submissionType as SubmissionType, level: r.level, maxAmount: money(r.maxAmount), minAmount: money(r.minAmount) }));
  }

  async rightsFor(organizationId: string, roleKey: RoleKey): Promise<ApprovalRightDto[]> {
    // Admin decides every level of everything, so nothing is ever left without an approver.
    if (roleKey === 'ADMIN') return ALL_APPROVAL_RIGHTS.flatMap((r) => Array.from({ length: MAX_APPROVAL_LEVELS }, (_, i) => (i ? { ...r, level: i + 1 } : r)));
    if (isGuest(roleKey)) return [];
    const rules = await this.rules(organizationId);
    if (!rules.length) return defaultApprovalRights(roleKey);
    return rules
      .filter((r) => r.roleKey === roleKey)
      .map((r) => ({ type: r.type, maxAmount: r.maxAmount, ...(r.level > 1 ? { level: r.level } : {}) }))
      .sort((a, b) => SUBMISSION_TYPES.indexOf(a.type) - SUBMISSION_TYPES.indexOf(b.type) || (a.level ?? 1) - (b.level ?? 1));
  }

  /** Role keys that may approve this type at this amount and level (for notifying the right people); admin always. */
  async roleKeysFor(organizationId: string, type: SubmissionType, amount: Prisma.Decimal | null, level = 1): Promise<RoleKey[]> {
    return [...new Set<RoleKey>(['ADMIN', ...levelRoles(type, await this.rules(organizationId), level, amount === null ? null : amount.toString())])];
  }

  /** This round's steps of each entry, by "type:id". */
  async stepsOf(entries: LevelEntry[]): Promise<Map<string, (LevelStep & { note: string | null; actorName: string | null })[]>> {
    const out = new Map<string, (LevelStep & { note: string | null; actorName: string | null })[]>();
    if (!entries.length) return out;
    const rows = await this.prisma.approvalStep.findMany({
      where: { entityId: { in: entries.map((e) => e.id) } },
      include: { actor: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const roundOf = new Map(entries.map((e) => [`${e.type}:${e.id}`, e.round.getTime()]));
    for (const r of rows) {
      const key = `${r.entityType}:${r.entityId}`;
      if (roundOf.get(key) !== r.round.getTime()) continue;
      out.set(key, [...(out.get(key) ?? []), { level: r.level, action: r.action, actorId: r.actorId, createdAt: r.createdAt, note: r.note, actorName: r.actor?.fullName ?? null }]);
    }
    return out;
  }

  /** Where each entry stands in its levels, with the organisation's rules (one read of each). */
  async stages(organizationId: string, entries: LevelEntry[]): Promise<{ rules: LevelRule[]; stages: Map<string, Stage> }> {
    const [rules, steps] = await Promise.all([this.rules(organizationId), this.stepsOf(entries)]);
    const stages = new Map(entries.map((e) => [`${e.type}:${e.id}`, stageOf(e.type, rules, e.amount, e.round, steps.get(`${e.type}:${e.id}`) ?? [])]));
    return { rules, stages };
  }

  /** May the user decide this one entry now, and where does it stand. */
  async decide(user: { id: string; organizationId: string; roleKey: RoleKey }, entry: LevelEntry) {
    const { rules, stages } = await this.stages(user.organizationId, [entry]);
    const stage = stages.get(`${entry.type}:${entry.id}`)!;
    return { rules, stage, ...mayDecide(user, entry.type, rules, entry.amount, stage) };
  }

  /** The round an entry is in: when it was last submitted (or created, for entries submitted with it). */
  async entryOf(type: SubmissionType, id: string): Promise<LevelEntry & { status: string }> {
    const row = (await this.submissionModel(type).findUnique({ where: { id }, select: { status: true, submittedAt: true, createdAt: true } })) as { status: string; submittedAt: Date | null; createdAt: Date } | null;
    const amount = await this.amountOf(type, id);
    return { type, id, amount: amount === null ? null : amount.toString(), round: row?.submittedAt ?? row?.createdAt ?? new Date(0), status: row?.status ?? 'DRAFT' };
  }

  /** The Prisma model of a submission type (every one has the six status columns). */
  submissionModel(type: SubmissionType): any {
    switch (type) {
      case 'PROGRESS':
        return this.prisma.progressEntry;
      case 'DPR':
        return this.prisma.dailyReport;
      case 'MATERIAL_REQUEST':
        return this.prisma.materialRequest;
      case 'MACHINERY':
        return this.prisma.machineryLog;
      case 'EXPENSE':
        return this.prisma.expense;
      case 'MEASUREMENT':
        return this.prisma.measurementSheet;
      case 'BILL':
        return this.prisma.raBill;
      case 'PURCHASE_ORDER':
        return this.prisma.purchaseOrder;
      case 'VENDOR_BILL':
        return this.prisma.vendorBill;
      case 'WORK_ORDER':
        return this.prisma.workOrder;
      case 'SUBCONTRACT_BILL':
        return this.prisma.subcontractBill;
      case 'INSPECTION':
        return this.prisma.inspection;
      case 'PAYMENT_REQUEST':
        return this.prisma.paymentRequest;
      case 'SUPPLIER_CHOICE':
        return this.prisma.supplierChoice;
    }
  }

  /** Is the amount within the right? Types without an amount, or an unknown amount, are always within. */
  static within(right: ApprovalRightDto | undefined, type: SubmissionType, amount: Prisma.Decimal | null): boolean {
    if (!right) return false;
    if (right.maxAmount === null || amount === null || !hasAmount(type)) return true;
    return amount.lte(new Prisma.Decimal(right.maxAmount));
  }

  /** The amount an approval limit is checked against (see APPROVAL_AMOUNT_BASIS); null when the type has none or it is unknown. */
  async amountOf(type: SubmissionType, id: string): Promise<Prisma.Decimal | null> {
    switch (type) {
      case 'EXPENSE': {
        const x = await this.prisma.expense.findUnique({ where: { id }, select: { totalAmount: true } });
        return x?.totalAmount ?? null;
      }
      case 'MEASUREMENT': {
        const m = await this.prisma.measurementSheet.findUnique({ where: { id }, select: { totalQty: true, boqItem: { select: { rate: true } } } });
        return m ? m.totalQty.mul(m.boqItem.rate).toDecimalPlaces(2) : null;
      }
      case 'PROGRESS': {
        const p = await this.prisma.progressEntry.findUnique({ where: { id }, select: { quantity: true, activity: { select: { boqItem: { select: { rate: true } } } } } });
        return p?.activity.boqItem ? p.quantity.mul(p.activity.boqItem.rate).toDecimalPlaces(2) : null;
      }
      case 'MACHINERY': {
        const l = await this.prisma.machineryLog.findUnique({ where: { id }, select: { hoursWorked: true, equipment: { select: { rate: true, rateUnit: true } } } });
        const c = l ? machineryLogCost(l.equipment.rate?.toString() ?? null, l.equipment.rateUnit, l.hoursWorked.toString()) : null;
        return c === null ? null : new Prisma.Decimal(c).toDecimalPlaces(2);
      }
      case 'BILL': {
        const b = await this.prisma.raBill.findUnique({ where: { id }, select: { grossAmount: true } });
        return b?.grossAmount ?? null;
      }
      case 'PURCHASE_ORDER': {
        const o = await this.prisma.purchaseOrder.findUnique({ where: { id }, select: { total: true } });
        return o?.total ?? null;
      }
      case 'VENDOR_BILL': {
        const v = await this.prisma.vendorBill.findUnique({ where: { id }, select: { total: true } });
        return v?.total ?? null;
      }
      case 'WORK_ORDER': {
        const w = await this.prisma.workOrder.findUnique({ where: { id }, select: { value: true } });
        return w?.value ?? null;
      }
      case 'SUBCONTRACT_BILL': {
        const b = await this.prisma.subcontractBill.findUnique({ where: { id }, select: { grossAmount: true } });
        return b?.grossAmount ?? null;
      }
      case 'PAYMENT_REQUEST': {
        const r = await this.prisma.paymentRequest.findUnique({ where: { id }, select: { amount: true } });
        return r?.amount ?? null;
      }
      case 'SUPPLIER_CHOICE': {
        const c = await this.prisma.supplierChoice.findUnique({ where: { id }, select: { amount: true } });
        return c?.amount ?? null;
      }
      default:
        return null;
    }
  }
}
