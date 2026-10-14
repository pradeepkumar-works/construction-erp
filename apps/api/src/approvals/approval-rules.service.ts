import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLE_KEYS, SUBMISSION_TYPES, defaultApprovalRights, hasAmount, isGuest, type ApprovalMatrixDto, type ApprovalRuleDto, type RoleKey, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { money } from '../common/serialize';
import { SaveApprovalRulesDto } from './approval-rules.dto';

const order = (r: ApprovalRuleDto) => ROLE_KEYS.indexOf(r.roleKey) * 100 + SUBMISSION_TYPES.indexOf(r.type);

/** The organisation's approval matrix (who approves which submission type, up to what amount). Admin only. */
@Injectable()
export class ApprovalRulesService {
  constructor(private prisma: PrismaService) {}

  async get(user: RequestUser): Promise<ApprovalMatrixDto> {
    const [roles, rules] = await Promise.all([
      this.prisma.role.findMany({ where: { organizationId: user.organizationId }, include: { _count: { select: { users: { where: { isActive: true } } } } } }),
      this.prisma.approvalRule.findMany({ where: { organizationId: user.organizationId }, include: { role: { select: { key: true } } } }),
    ]);
    // Guests (client, consultant) never approve, so the matrix leaves them out.
    const known = roles.filter((r) => (ROLE_KEYS as readonly string[]).includes(r.key) && !isGuest(r.key as RoleKey)).sort((a, b) => ROLE_KEYS.indexOf(a.key as RoleKey) - ROLE_KEYS.indexOf(b.key as RoleKey));
    const custom = rules.length > 0;
    const list: ApprovalRuleDto[] = custom
      ? rules
          .filter((r) => r.role.key !== 'ADMIN' && (SUBMISSION_TYPES as readonly string[]).includes(r.submissionType))
          .map((r) => ({ roleKey: r.role.key as RoleKey, type: r.submissionType as SubmissionType, maxAmount: money(r.maxAmount) }))
      : ROLE_KEYS.filter((k) => k !== 'ADMIN' && !isGuest(k)).flatMap((roleKey) => defaultApprovalRights(roleKey).map((r) => ({ roleKey, type: r.type, maxAmount: null })));
    return {
      custom,
      roles: known.map((r) => ({ roleKey: r.key as RoleKey, roleName: r.name, users: r._count.users })),
      rules: list.sort((a, b) => order(a) - order(b)),
    };
  }

  /** Replace the whole matrix. An empty list resets to the fixed rule. */
  async save(user: RequestUser, dto: SaveApprovalRulesDto): Promise<ApprovalMatrixDto> {
    const roles = await this.prisma.role.findMany({ where: { organizationId: user.organizationId }, select: { id: true, key: true } });
    const roleId = new Map(roles.map((r) => [r.key, r.id]));
    const seen = new Set<string>();
    const data: Prisma.ApprovalRuleCreateManyInput[] = [];
    for (const r of dto.rules) {
      if (r.roleKey === 'ADMIN') continue;
      if (isGuest(r.roleKey)) throw new BadRequestException('Client and consultant guests cannot approve submissions');
      const id = roleId.get(r.roleKey);
      if (!id) throw new BadRequestException(`Role ${r.roleKey} does not exist in this organisation`);
      const key = `${r.roleKey}:${r.type}`;
      if (seen.has(key)) throw new BadRequestException(`${r.roleKey} / ${r.type} appears twice`);
      seen.add(key);
      data.push({ organizationId: user.organizationId, roleId: id, submissionType: r.type, maxAmount: hasAmount(r.type) && r.maxAmount != null ? new Prisma.Decimal(r.maxAmount) : null });
    }
    if (dto.rules.length > 0 && data.length === 0) throw new BadRequestException('Give at least one non-admin rule, or send an empty list to go back to the fixed rule');
    await this.prisma.$transaction([this.prisma.approvalRule.deleteMany({ where: { organizationId: user.organizationId } }), this.prisma.approvalRule.createMany({ data })]);
    return this.get(user);
  }
}
