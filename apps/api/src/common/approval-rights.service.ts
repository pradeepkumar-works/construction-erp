import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ALL_APPROVAL_RIGHTS, APPROVER_ROLES, ROLE_KEYS, SUBMISSION_TYPES, defaultApprovalRights, hasAmount, machineryLogCost, type ApprovalRightDto, type RoleKey, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { money } from './serialize';

/**
 * Who may approve what, from the organisation's approval matrix (`ApprovalRule`). An organisation without rules
 * uses the fixed rule (APPROVER_ROLES approve every type, no limit). Admin always may approve everything, so a
 * submission can never be left without anyone able to approve it. Project visibility still comes from
 * ProjectAccessService: a right only counts on projects the user can see.
 */
@Injectable()
export class ApprovalRightsService {
  constructor(private prisma: PrismaService) {}

  async isCustom(organizationId: string): Promise<boolean> {
    return (await this.prisma.approvalRule.count({ where: { organizationId } })) > 0;
  }

  async rightsFor(organizationId: string, roleKey: RoleKey): Promise<ApprovalRightDto[]> {
    if (roleKey === 'ADMIN') return ALL_APPROVAL_RIGHTS;
    const rules = await this.prisma.approvalRule.findMany({ where: { organizationId }, include: { role: { select: { key: true } } } });
    if (!rules.length) return defaultApprovalRights(roleKey);
    return rules
      .filter((r) => r.role.key === roleKey && (SUBMISSION_TYPES as readonly string[]).includes(r.submissionType))
      .map((r) => ({ type: r.submissionType as SubmissionType, maxAmount: money(r.maxAmount) }))
      .sort((a, b) => SUBMISSION_TYPES.indexOf(a.type) - SUBMISSION_TYPES.indexOf(b.type));
  }

  /** Role keys that may approve this type at this amount (for notifying the right people). */
  async roleKeysFor(organizationId: string, type: SubmissionType, amount: Prisma.Decimal | null): Promise<RoleKey[]> {
    const rules = await this.prisma.approvalRule.findMany({ where: { organizationId }, include: { role: { select: { key: true } } } });
    if (!rules.length) return APPROVER_ROLES;
    const keys = rules
      .filter((r) => r.submissionType === type && (r.maxAmount === null || amount === null || !hasAmount(type) || amount.lte(r.maxAmount)))
      .map((r) => r.role.key as RoleKey)
      .filter((k) => (ROLE_KEYS as readonly string[]).includes(k));
    return [...new Set<RoleKey>(['ADMIN', ...keys])];
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
      default:
        return null;
    }
  }
}
