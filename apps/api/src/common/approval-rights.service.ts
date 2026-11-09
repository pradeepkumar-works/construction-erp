import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLE_KEYS, SUBMISSION_TYPES, hasAmount, indentEstimate, isGuest, lastRateKey, machineryLogCost, positionApprover, roleApprover, type ApprovalRightDto, type ApproverKey, type RoleKey, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MastersService } from '../masters/masters.service';
import { todayIn } from '../notifications/time';
import { money, parseDate } from './serialize';
import { approverKeys, levelKeys, mayDecide, rightsOf, stageOf, type Decider, type Holding, type LevelRule, type LevelStep, type Stage } from './approval-levels';

/** One entry to place in its approval levels: `round` is when it was last submitted. */
export interface LevelEntry {
  type: SubmissionType;
  id: string;
  projectId: string;
  amount: string | null;
  round: Date;
  /** Who submitted it (never its approver) */
  submittedById: string | null;
}

/** What a user decides by besides their role: the positions they hold, and the people whose approvals they hold today. */
export interface DeciderFacts {
  holdings: Holding[];
  actingFor: { id: string; roleKey: RoleKey; fullName: string }[];
}

type Who = { id: string; organizationId: string; roleKey: RoleKey };

/**
 * Who may approve what, from the organisation's approval matrix (`ApprovalRule`): each level names roles or positions
 * (`UserPosition`, on the entry's project or at head office), and a delegate decides as the person away while their
 * `ApprovalDelegation` runs. An organisation without rules uses the fixed rule (APPROVER_ROLES approve every type, no
 * limit; QA/QC also passes inspections). Admin always may approve everything, so a submission can never be left without
 * anyone able to approve it. Project visibility still comes from ProjectAccessService: a right only counts on projects
 * the user can see.
 */
@Injectable()
export class ApprovalRightsService {
  constructor(private prisma: PrismaService, private masters: MastersService) {}

  async isCustom(organizationId: string): Promise<boolean> {
    return (await this.prisma.approvalRule.count({ where: { organizationId } })) > 0;
  }

  /** Every rule of the matrix with its level (empty while the organisation uses the fixed rule). */
  async rules(organizationId: string): Promise<LevelRule[]> {
    const rows = await this.prisma.approvalRule.findMany({ where: { organizationId }, include: { role: { select: { key: true } } } });
    return rows.flatMap((r) => {
      if (!(SUBMISSION_TYPES as readonly string[]).includes(r.submissionType)) return [];
      const role = r.role?.key as RoleKey | undefined;
      const approver: ApproverKey | null = r.positionCode ? positionApprover(r.positionCode) : role && (ROLE_KEYS as readonly string[]).includes(role) && !isGuest(role) ? roleApprover(role) : null;
      return approver ? [{ approver, type: r.submissionType as SubmissionType, level: r.level, maxAmount: money(r.maxAmount), minAmount: money(r.minAmount) }] : [];
    });
  }

  /** The positions the user holds and the active delegations to them, by the company's date. */
  async deciderFacts(user: Who): Promise<DeciderFacts> {
    const today = parseDate(todayIn());
    const delegations = await this.prisma.approvalDelegation.findMany({
      where: { organizationId: user.organizationId, toUserId: user.id, startsOn: { lte: today }, endsOn: { gte: today }, fromUser: { isActive: true } },
      select: { fromUser: { select: { id: true, fullName: true, role: { select: { key: true } } } } },
    });
    const actingFor = [...new Map(delegations.map((d) => [d.fromUser.id, { id: d.fromUser.id, roleKey: d.fromUser.role.key as RoleKey, fullName: d.fromUser.fullName }])).values()];
    const holdings = await this.prisma.userPosition.findMany({ where: { organizationId: user.organizationId, userId: { in: [user.id, ...actingFor.map((a) => a.id)] } }, select: { userId: true, positionCode: true, projectId: true } });
    return { holdings, actingFor };
  }

  /** The user as a decider on an entry of `projectId` (null: anywhere). */
  decider(user: Who, projectId: string | null, facts: DeciderFacts): Decider {
    return approverKeys(user, projectId, facts.holdings, facts.actingFor);
  }

  /** What the user approves at all: by their role, their positions anywhere, and the approvals they hold for others today. */
  async rightsFor(user: Who): Promise<ApprovalRightDto[]> {
    if (user.roleKey === 'ADMIN' || isGuest(user.roleKey)) return rightsOf(approverKeys(user, null, []), []);
    const [rules, facts] = await Promise.all([this.rules(user.organizationId), this.deciderFacts(user)]);
    return rightsOf(this.decider(user, null, facts), rules);
  }

  /** Every role's rights by the role alone, reading the matrix once. */
  async rightsByRole(organizationId: string): Promise<Map<RoleKey, ApprovalRightDto[]>> {
    const rules = await this.rules(organizationId);
    return new Map(ROLE_KEYS.map((k) => [k, rightsOf(approverKeys({ id: '', roleKey: k }, null, []), rules)]));
  }

  /** Roles and positions that may approve this type at this amount and level (for notifying the right people); admin always. */
  async levelKeysFor(organizationId: string, type: SubmissionType, amount: Prisma.Decimal | null, level = 1): Promise<ApproverKey[]> {
    return [...new Set<ApproverKey>([roleApprover('ADMIN'), ...levelKeys(type, await this.rules(organizationId), level, amount === null ? null : amount.toString())])];
  }

  /** The company's positions, code to name (its own names over the standard list). */
  async positionNames(organizationId: string): Promise<Map<string, string>> {
    return new Map((await this.masters.entriesFor(organizationId, 'position')).map((e) => [e.code, e.name]));
  }

  /** This round's steps of each entry, by "type:id". */
  async stepsOf(entries: LevelEntry[]): Promise<Map<string, (LevelStep & { note: string | null; actorName: string | null; forName: string | null })[]>> {
    const out = new Map<string, (LevelStep & { note: string | null; actorName: string | null; forName: string | null })[]>();
    if (!entries.length) return out;
    const rows = await this.prisma.approvalStep.findMany({
      where: { entityId: { in: entries.map((e) => e.id) } },
      include: { actor: { select: { fullName: true } }, onBehalfOf: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const roundOf = new Map(entries.map((e) => [`${e.type}:${e.id}`, e.round.getTime()]));
    for (const r of rows) {
      const key = `${r.entityType}:${r.entityId}`;
      if (roundOf.get(key) !== r.round.getTime()) continue;
      out.set(key, [
        ...(out.get(key) ?? []),
        { level: r.level, action: r.action, actorId: r.actorId, onBehalfOfId: r.onBehalfOfId, createdAt: r.createdAt, note: r.note, actorName: r.actor?.fullName ?? null, forName: r.onBehalfOf?.fullName ?? null },
      ]);
    }
    return out;
  }

  /** Where each entry stands in its levels, with the organisation's rules (one read of each). */
  async stages(organizationId: string, entries: LevelEntry[]): Promise<{ rules: LevelRule[]; stages: Map<string, Stage> }> {
    const [rules, steps] = await Promise.all([this.rules(organizationId), this.stepsOf(entries)]);
    const stages = new Map(entries.map((e) => [`${e.type}:${e.id}`, stageOf(e.type, rules, e.amount, e.round, steps.get(`${e.type}:${e.id}`) ?? [], e.submittedById)]));
    return { rules, stages };
  }

  /** May the user decide this one entry now, where does it stand, and whom they decide it for (null: themselves). */
  async decide(user: Who, entry: LevelEntry) {
    const [{ rules, stages }, facts] = await Promise.all([this.stages(user.organizationId, [entry]), this.deciderFacts(user)]);
    const stage = stages.get(`${entry.type}:${entry.id}`)!;
    const decision = mayDecide(this.decider(user, entry.projectId, facts), entry.type, rules, entry.amount, stage);
    return { rules, stage, ...decision, onBehalfOfName: facts.actingFor.find((a) => a.id === decision.onBehalfOf)?.fullName ?? null };
  }

  /** The round an entry is in: when it was last submitted (or created, for entries submitted with it). */
  async entryOf(type: SubmissionType, id: string): Promise<LevelEntry & { status: string }> {
    const row = (await this.submissionModel(type).findUnique({ where: { id }, select: { status: true, projectId: true, submittedAt: true, createdAt: true, submittedById: true } })) as {
      status: string;
      projectId: string;
      submittedAt: Date | null;
      createdAt: Date;
      submittedById: string;
    } | null;
    const amount = await this.amountOf(type, id);
    return {
      type,
      id,
      projectId: row?.projectId ?? '',
      amount: amount === null ? null : amount.toString(),
      round: row?.submittedAt ?? row?.createdAt ?? new Date(0),
      submittedById: row?.submittedById ?? null,
      status: row?.status ?? 'DRAFT',
    };
  }

  /**
   * Material requests' worth for their approval limits (`indentEstimate`): each line at the item's last approved order
   * rate in the company, read for all the requests at once.
   */
  async indentValues(ids: string[]): Promise<Map<string, Prisma.Decimal | null>> {
    const out = new Map<string, Prisma.Decimal | null>();
    if (!ids.length) return out;
    const lines = await this.prisma.materialRequestItem.findMany({ where: { requestId: { in: ids } }, select: { requestId: true, itemName: true, unit: true, quantity: true, request: { select: { organizationId: true } } } });
    const rates = new Map<string, number>();
    const wanted = new Map(lines.map((l) => [lastRateKey(l.itemName, l.unit), l]));
    if (wanted.size) {
      const ordered = await this.prisma.purchaseOrderLine.findMany({
        where: {
          OR: [...wanted.values()].map((l) => ({ itemName: { equals: l.itemName.trim(), mode: 'insensitive' as const }, unit: { equals: l.unit.trim(), mode: 'insensitive' as const } })),
          purchaseOrder: { organizationId: { in: [...new Set(lines.map((l) => l.request.organizationId))] }, status: 'APPROVED' },
        },
        orderBy: [{ purchaseOrder: { poDate: 'desc' } }, { purchaseOrder: { createdAt: 'desc' } }],
        select: { itemName: true, unit: true, rate: true },
      });
      // Newest first, so the first rate seen for an item is its last order's.
      for (const o of ordered) if (!rates.has(lastRateKey(o.itemName, o.unit))) rates.set(lastRateKey(o.itemName, o.unit), o.rate.toNumber());
    }
    for (const id of ids) {
      const { amount } = indentEstimate(
        lines.filter((l) => l.requestId === id).map((l) => ({ itemName: l.itemName, unit: l.unit, quantity: l.quantity.toNumber() })),
        rates,
      );
      out.set(id, amount === null ? null : new Prisma.Decimal(amount));
    }
    return out;
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
      case 'WO_AMENDMENT':
        return this.prisma.workOrderAmendment;
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
      case 'MATERIAL_REQUEST':
        return (await this.indentValues([id])).get(id) ?? null;
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
      // The order's value after it, so a limit cannot be passed in small steps.
      case 'WO_AMENDMENT': {
        const a = await this.prisma.workOrderAmendment.findUnique({ where: { id }, select: { valueAfter: true } });
        return a?.valueAfter ?? null;
      }
      default:
        return null;
    }
  }
}
