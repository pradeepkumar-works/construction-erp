import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLE_KEYS, ROLE_LABELS, SUBMISSION_TYPES, SUBMISSION_TYPE_LABELS, defaultApprovalRights, hasAmount, isGuest, type ApprovalEscalationDto, type ApprovalMatrixDto, type ApprovalRuleDto, type RoleKey, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { money } from '../common/serialize';
import { SaveApprovalRulesDto } from './approval-rules.dto';

const order = (r: ApprovalRuleDto) => (r.level ?? 1) * 10_000 + ROLE_KEYS.indexOf(r.roleKey) * 100 + SUBMISSION_TYPES.indexOf(r.type);

/**
 * The organisation's approval matrix (who approves which submission type, up to what amount), its higher levels above
 * an amount, and reminders and escalation per type. Admin only.
 */
@Injectable()
export class ApprovalRulesService {
  constructor(private prisma: PrismaService) {}

  async get(user: RequestUser): Promise<ApprovalMatrixDto> {
    const [org, roles, rules, escalations] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { paymentsNeedRequest: true, progressFromDpr: true, ordersNeedApprovedChoice: true } }),
      this.prisma.role.findMany({ where: { organizationId: user.organizationId }, include: { _count: { select: { users: { where: { isActive: true } } } } } }),
      this.prisma.approvalRule.findMany({ where: { organizationId: user.organizationId }, include: { role: { select: { key: true } } } }),
      this.prisma.approvalEscalation.findMany({ where: { organizationId: user.organizationId } }),
    ]);
    // Guests (client, consultant) never approve, so the matrix leaves them out.
    const known = roles.filter((r) => (ROLE_KEYS as readonly string[]).includes(r.key) && !isGuest(r.key as RoleKey)).sort((a, b) => ROLE_KEYS.indexOf(a.key as RoleKey) - ROLE_KEYS.indexOf(b.key as RoleKey));
    const custom = rules.length > 0;
    const list: ApprovalRuleDto[] = custom
      ? rules
          .filter((r) => r.role.key !== 'ADMIN' && (SUBMISSION_TYPES as readonly string[]).includes(r.submissionType))
          .map((r) => ({ roleKey: r.role.key as RoleKey, type: r.submissionType as SubmissionType, maxAmount: money(r.maxAmount), level: r.level, minAmount: money(r.minAmount) }))
      : ROLE_KEYS.filter((k) => k !== 'ADMIN' && !isGuest(k)).flatMap((roleKey) => defaultApprovalRights(roleKey).map((r) => ({ roleKey, type: r.type, maxAmount: null, level: 1, minAmount: null })));
    return {
      custom,
      roles: known.map((r) => ({ roleKey: r.key as RoleKey, roleName: ROLE_LABELS[r.key as RoleKey], users: r._count.users })),
      rules: list.sort((a, b) => order(a) - order(b)),
      paymentsNeedRequest: org.paymentsNeedRequest,
      progressFromDpr: org.progressFromDpr,
      ordersNeedApprovedChoice: org.ordersNeedApprovedChoice,
      escalations: escalations
        .filter((e) => (SUBMISSION_TYPES as readonly string[]).includes(e.submissionType) && (e.remindAfterHours || e.escalateAfterHours))
        .map((e): ApprovalEscalationDto => ({ type: e.submissionType as SubmissionType, remindAfterHours: e.remindAfterHours, escalateAfterHours: e.escalateAfterHours }))
        .sort((a, b) => SUBMISSION_TYPES.indexOf(a.type) - SUBMISSION_TYPES.indexOf(b.type)),
    };
  }

  /** Replace the whole matrix. An empty list resets to the fixed rule. `paymentsNeedRequest`, `progressFromDpr`, `ordersNeedApprovedChoice` and `escalations`, when sent, are saved too. */
  async save(user: RequestUser, dto: SaveApprovalRulesDto): Promise<ApprovalMatrixDto> {
    if (dto.paymentsNeedRequest !== undefined) await this.prisma.organization.update({ where: { id: user.organizationId }, data: { paymentsNeedRequest: dto.paymentsNeedRequest } });
    if (dto.progressFromDpr !== undefined) await this.prisma.organization.update({ where: { id: user.organizationId }, data: { progressFromDpr: dto.progressFromDpr } });
    if (dto.ordersNeedApprovedChoice !== undefined) await this.prisma.organization.update({ where: { id: user.organizationId }, data: { ordersNeedApprovedChoice: dto.ordersNeedApprovedChoice } });
    if (dto.escalations !== undefined) await this.saveEscalations(user, dto.escalations);
    if (dto.rules === undefined) return this.get(user);
    const roles = await this.prisma.role.findMany({ where: { organizationId: user.organizationId }, select: { id: true, key: true } });
    const roleId = new Map(roles.map((r) => [r.key, r.id]));
    const seen = new Set<string>();
    const data: Prisma.ApprovalRuleCreateManyInput[] = [];
    for (const r of dto.rules) {
      if (r.roleKey === 'ADMIN') continue;
      if (isGuest(r.roleKey)) throw new BadRequestException('Client and consultant guests cannot approve submissions');
      const id = roleId.get(r.roleKey);
      if (!id) throw new BadRequestException(`Role ${r.roleKey} does not exist in this organisation`);
      const level = r.level ?? 1;
      const key = `${r.roleKey}:${r.type}:${level}`;
      if (seen.has(key)) throw new BadRequestException(`${r.roleKey} / ${r.type} appears twice at level ${level}`);
      seen.add(key);
      data.push({
        organizationId: user.organizationId,
        roleId: id,
        submissionType: r.type,
        level,
        maxAmount: hasAmount(r.type) && r.maxAmount != null ? new Prisma.Decimal(r.maxAmount) : null,
        minAmount: level > 1 && hasAmount(r.type) && r.minAmount != null ? new Prisma.Decimal(r.minAmount) : null,
      });
    }
    if (dto.rules.length > 0 && data.length === 0) throw new BadRequestException('Give at least one non-admin rule, or send an empty list to go back to the fixed rule');
    this.checkLevels(data);
    await this.prisma.$transaction([this.prisma.approvalRule.deleteMany({ where: { organizationId: user.organizationId } }), this.prisma.approvalRule.createMany({ data })]);
    return this.get(user);
  }

  /** Levels run in order (a third needs a second, a second needs someone at the first), one amount per level, rising. */
  private checkLevels(data: Prisma.ApprovalRuleCreateManyInput[]) {
    for (const type of SUBMISSION_TYPES) {
      const of = data.filter((d) => d.submissionType === type);
      const at = (level: number) => of.filter((d) => (d.level ?? 1) === level);
      const name = SUBMISSION_TYPE_LABELS[type];
      if (at(2).length && !at(1).length) throw new BadRequestException(`${name}: a second approval needs someone to approve first`);
      if (at(3).length && !at(2).length) throw new BadRequestException(`${name}: a third approval needs a second one`);
      const from = (level: number) => {
        const amounts = [...new Set(at(level).map((d) => (d.minAmount == null ? null : new Prisma.Decimal(d.minAmount as Prisma.Decimal.Value).toFixed(2))))];
        if (amounts.length > 1) throw new BadRequestException(`${name}: give every role at level ${level} the same amount`);
        return amounts[0] ?? null;
      };
      const [two, three] = [from(2), from(3)];
      if (two !== null && three !== null && Number(three) < Number(two)) throw new BadRequestException(`${name}: the third approval's amount must be at least the second's`);
    }
  }

  private async saveEscalations(user: RequestUser, list: { type: SubmissionType; remindAfterHours?: number | null; escalateAfterHours?: number | null }[]) {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.type)) throw new BadRequestException(`${SUBMISSION_TYPE_LABELS[e.type]} appears twice`);
      seen.add(e.type);
      if (e.remindAfterHours && e.escalateAfterHours && e.escalateAfterHours < e.remindAfterHours)
        throw new BadRequestException(`${SUBMISSION_TYPE_LABELS[e.type]}: escalate at or after the reminder`);
    }
    const data = list
      .filter((e) => e.remindAfterHours || e.escalateAfterHours)
      .map((e) => ({ organizationId: user.organizationId, submissionType: e.type, remindAfterHours: e.remindAfterHours ?? null, escalateAfterHours: e.escalateAfterHours ?? null }));
    await this.prisma.$transaction([this.prisma.approvalEscalation.deleteMany({ where: { organizationId: user.organizationId } }), this.prisma.approvalEscalation.createMany({ data })]);
  }
}
