import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canManageUsers, delegationActive, delegationProblem, isGuest, type ApprovalDelegationDto, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { CreateApprovalDelegationDto } from './approval-delegations.dto';

const INCLUDE = {
  fromUser: { select: { fullName: true } },
  toUser: { select: { fullName: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.ApprovalDelegationInclude;

type Row = Prisma.ApprovalDelegationGetPayload<{ include: typeof INCLUDE }>;

/**
 * Approvals while someone is away (ARCHITECTURE "Approval levels and escalation"): a user hands their approvals to a
 * colleague for some days, or an admin does it for them. While it runs the delegate decides as them too
 * (`ApprovalRightsService.deciderFacts`); nothing here changes what the person away may do.
 */
@Injectable()
export class ApprovalDelegationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private toDto(r: Row, today: string): ApprovalDelegationDto {
    const startsOn = dateOnly(r.startsOn);
    const endsOn = dateOnly(r.endsOn);
    return {
      id: r.id,
      fromUserId: r.fromUserId,
      fromName: r.fromUser.fullName,
      toUserId: r.toUserId,
      toName: r.toUser.fullName,
      startsOn,
      endsOn,
      note: r.note,
      active: delegationActive({ startsOn, endsOn }, today),
      createdByName: r.createdBy?.fullName ?? null,
    };
  }

  /** Delegations not yet over: the caller's own (from or to them), or with `all`, everyone's (admin). */
  async list(user: RequestUser, all = false): Promise<ApprovalDelegationDto[]> {
    if (isGuest(user.roleKey)) throw new ForbiddenException('Approvals are for the company’s staff');
    if (all && !canManageUsers(user.roleKey)) throw new ForbiddenException('Only an admin sees everyone’s delegations');
    const today = todayIn();
    const rows = await this.prisma.approvalDelegation.findMany({
      where: { organizationId: user.organizationId, endsOn: { gte: parseDate(today) }, ...(all ? {} : { OR: [{ fromUserId: user.id }, { toUserId: user.id }] }) },
      include: INCLUDE,
      orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toDto(r, today));
  }

  async create(user: RequestUser, dto: CreateApprovalDelegationDto): Promise<ApprovalDelegationDto> {
    if (isGuest(user.roleKey)) throw new ForbiddenException('Approvals are for the company’s staff');
    const fromUserId = dto.fromUserId ?? user.id;
    if (fromUserId !== user.id && !canManageUsers(user.roleKey)) throw new ForbiddenException('Only an admin hands someone else’s approvals to another person');
    const [from, to] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: fromUserId, organizationId: user.organizationId }, select: { id: true, fullName: true } }),
      this.prisma.user.findFirst({ where: { id: dto.toUserId, organizationId: user.organizationId }, select: { fullName: true, isActive: true, role: { select: { key: true } } } }),
    ]);
    if (!from) throw new NotFoundException('User not found');
    const today = todayIn();
    const problem = delegationProblem({ fromUserId, toUserId: dto.toUserId, startsOn: dto.startsOn, endsOn: dto.endsOn }, to ? { roleKey: to.role.key as RoleKey, isActive: to.isActive, fullName: to.fullName } : null, today);
    if (problem) throw new BadRequestException(problem);
    const row = await this.prisma.approvalDelegation.create({
      data: { organizationId: user.organizationId, fromUserId, toUserId: dto.toUserId, startsOn: parseDate(dto.startsOn), endsOn: parseDate(dto.endsOn), note: dto.note?.trim() || null, createdById: user.id },
      include: INCLUDE,
    });
    await this.audit.log(user, 'APPROVAL_DELEGATION', row.id, 'CREATED', `${row.fromUser.fullName}'s approvals to ${row.toUser.fullName}, ${dto.startsOn} to ${dto.endsOn}`);
    return this.toDto(row, today);
  }

  /** End a delegation now: the person away, the delegate, or an admin. */
  async remove(user: RequestUser, id: string): Promise<{ ok: true }> {
    const row = await this.prisma.approvalDelegation.findFirst({ where: { id, organizationId: user.organizationId }, include: INCLUDE });
    if (!row) throw new NotFoundException('Delegation not found');
    if (row.fromUserId !== user.id && row.toUserId !== user.id && !canManageUsers(user.roleKey)) throw new ForbiddenException('Only the person away, their delegate or an admin ends this');
    await this.prisma.approvalDelegation.delete({ where: { id } });
    await this.audit.log(user, 'APPROVAL_DELEGATION', id, 'DELETED', `${row.fromUser.fullName}'s approvals to ${row.toUser.fullName} ended`);
    return { ok: true };
  }
}
