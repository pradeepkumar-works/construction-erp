import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  STANDARD_OBLIGATIONS,
  canEditContract,
  canViewContract,
  daysFrom,
  obligationDue,
  obligationProblem,
  obligationState,
  obligationTotals,
  penaltyAsOf,
  type ContractObligationDto,
  type ContractObligationsDto,
  type ObligationTerms,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ANCHOR_SELECT, anchorsOf, deductedByObligation, termsOf } from './obligation-recovery';
import { CreateContractObligationDto, UpdateContractObligationDto } from './contract-obligations.dto';

type Row = Prisma.ContractObligationGetPayload<object>;

/**
 * A contract's obligations (item 171, ARCHITECTURE "Contract obligations and recoveries"): what each side has to do by
 * when, counted from the agreement, the start, completion or the handover, and what missing it costs on our bills.
 * Seen with the contract terms (`canViewContract`), changed by those who change them (`canEditContract`).
 */
@Injectable()
export class ContractObligationsService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService) {}

  private async assertView(user: RequestUser, projectId: string) {
    if (!canViewContract(user.roleKey)) throw new ForbiddenException('Your role cannot see contract terms');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async assertEdit(user: RequestUser, projectId: string) {
    if (!canEditContract(user.roleKey)) throw new ForbiddenException('Your role cannot change contract terms');
    await this.access.assertCanAccessProject(user, projectId);
  }

  async list(user: RequestUser, projectId: string): Promise<ContractObligationsDto> {
    await this.assertView(user, projectId);
    const today = todayIn();
    const [project, rows, deducted] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { ...ANCHOR_SELECT, contractValue: true } }),
      this.prisma.contractObligation.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      deductedByObligation(this.prisma, { projectId }),
    ]);
    if (!project) throw new NotFoundException('Project not found');
    const anchors = anchorsOf(project);
    const contractValue = Number(project.contractValue ?? 0);
    const obligations: ContractObligationDto[] = rows.map((o) => {
      const terms = termsOf(o);
      const due = obligationDue(terms, anchors);
      const state = obligationState(terms, due, today);
      const late = due ? daysFrom(due, terms.metOn ?? today) : 0;
      return {
        id: o.id,
        code: o.code,
        title: o.title,
        clause: o.clause,
        party: o.party,
        anchor: o.anchor,
        offsetDays: o.offsetDays,
        offsetMonths: o.offsetMonths,
        dueOn: terms.dueOn,
        due,
        state,
        daysLate: state === 'OVERDUE' || state === 'MET_LATE' ? late : null,
        daysLeft: state === 'UPCOMING' || state === 'DUE_SOON' ? -late : null,
        penalty: o.penalty,
        penaltyValue: terms.penaltyValue,
        penaltyToDate: money(penaltyAsOf(terms, due, today, contractValue))!,
        deducted: money(deducted.get(o.id) ?? 0)!,
        metOn: terms.metOn,
        waived: o.waived,
        note: o.note,
      };
    });
    const totals = obligationTotals(obligations.map((o) => ({ state: o.state, penaltyToDate: Number(o.penaltyToDate) })));
    const codes = new Set(rows.map((r) => r.code).filter(Boolean));
    return {
      projectId,
      anchors,
      obligations,
      totals: { ...totals, penaltyToDate: money(totals.penaltyToDate)! },
      standardMissing: STANDARD_OBLIGATIONS.filter((s) => !codes.has(s.code)).map((s) => s.code),
      canEdit: canEditContract(user.roleKey),
    };
  }

  /** The obligation as it would be saved, checked by the rules. */
  private checked(cur: ObligationTerms & { title: string }, dto: UpdateContractObligationDto) {
    const next = {
      title: dto.title !== undefined ? dto.title.trim() : cur.title,
      party: dto.party ?? cur.party,
      anchor: dto.anchor ?? cur.anchor,
      offsetDays: dto.offsetDays ?? cur.offsetDays,
      offsetMonths: dto.offsetMonths ?? cur.offsetMonths,
      dueOn: dto.dueOn !== undefined ? dto.dueOn : cur.dueOn,
      penalty: dto.penalty ?? cur.penalty,
      penaltyValue: dto.penaltyValue !== undefined ? dto.penaltyValue : cur.penaltyValue,
      metOn: dto.metOn !== undefined ? dto.metOn : cur.metOn,
      waived: dto.waived ?? cur.waived,
    };
    // A date of its own only for DATE, a value only with a penalty.
    if (next.anchor !== 'DATE') next.dueOn = null;
    if (next.penalty === 'NONE') next.penaltyValue = null;
    const problem = obligationProblem(next, todayIn());
    if (problem) throw new BadRequestException(problem);
    return {
      title: next.title,
      party: next.party,
      anchor: next.anchor,
      offsetDays: next.offsetDays,
      offsetMonths: next.offsetMonths,
      dueOn: next.dueOn ? parseDate(next.dueOn) : null,
      penalty: next.penalty,
      penaltyValue: next.penaltyValue === null ? null : new Prisma.Decimal(next.penaltyValue),
      metOn: next.metOn ? parseDate(next.metOn) : null,
      waived: next.waived,
    };
  }

  async create(user: RequestUser, projectId: string, dto: CreateContractObligationDto): Promise<ContractObligationsDto> {
    await this.assertEdit(user, projectId);
    const blank: ObligationTerms & { title: string } = { title: '', party: 'CONTRACTOR', anchor: dto.anchor, offsetDays: 0, offsetMonths: 0, dueOn: null, penalty: 'NONE', penaltyValue: null, metOn: null, waived: false };
    const data = this.checked(blank, dto);
    const last = await this.prisma.contractObligation.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const row = await this.prisma.contractObligation.create({
      data: { ...data, clause: dto.clause ?? null, note: dto.note ?? null, organizationId: user.organizationId, projectId, createdById: user.id, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    await this.audit.log(user, 'CONTRACT_OBLIGATION', row.id, 'CREATED', row.title);
    return this.list(user, projectId);
  }

  private async find(user: RequestUser, projectId: string, id: string): Promise<Row> {
    const row = await this.prisma.contractObligation.findFirst({ where: { id, projectId, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Obligation not found');
    return row;
  }

  async update(user: RequestUser, projectId: string, id: string, dto: UpdateContractObligationDto): Promise<ContractObligationsDto> {
    await this.assertEdit(user, projectId);
    const cur = await this.find(user, projectId, id);
    const data = this.checked({ ...termsOf(cur), title: cur.title }, dto);
    await this.prisma.contractObligation.update({
      where: { id },
      data: { ...data, ...(dto.clause !== undefined ? { clause: dto.clause } : {}), ...(dto.note !== undefined ? { note: dto.note } : {}) },
    });
    const action = dto.metOn && !cur.metOn ? 'MET' : dto.waived && !cur.waived ? 'WAIVED' : dto.metOn === null && cur.metOn ? 'REOPENED' : 'UPDATED';
    await this.audit.log(user, 'CONTRACT_OBLIGATION', id, action, data.title);
    return this.list(user, projectId);
  }

  /** Delete one no bill has deducted for; one a bill has stays on the record, waived instead. */
  async remove(user: RequestUser, projectId: string, id: string): Promise<ContractObligationsDto> {
    await this.assertEdit(user, projectId);
    const row = await this.find(user, projectId, id);
    const billed = await this.prisma.raBill.count({ where: { projectId, obligationLines: { array_contains: [{ obligationId: id }] } } });
    if (billed) throw new ConflictException('A bill has deducted for this obligation, so it stays on the record: waive it instead');
    await this.prisma.contractObligation.delete({ where: { id } });
    await this.audit.log(user, 'CONTRACT_OBLIGATION', id, 'DELETED', row.title);
    return this.list(user, projectId);
  }

  /** Put the standard obligations the contract does not have yet (by code) on it, each changeable afterwards. */
  async addStandard(user: RequestUser, projectId: string): Promise<ContractObligationsDto> {
    await this.assertEdit(user, projectId);
    const [have, last] = await Promise.all([
      this.prisma.contractObligation.findMany({ where: { projectId, code: { not: null } }, select: { code: true } }),
      this.prisma.contractObligation.aggregate({ where: { projectId }, _max: { sortOrder: true } }),
    ]);
    const codes = new Set(have.map((h) => h.code));
    const missing = STANDARD_OBLIGATIONS.filter((s) => !codes.has(s.code));
    const start = (last._max.sortOrder ?? -1) + 1;
    await this.prisma.contractObligation.createMany({
      data: missing.map((s, i) => ({
        organizationId: user.organizationId,
        projectId,
        code: s.code,
        title: s.title,
        clause: s.clause,
        party: s.party,
        anchor: s.anchor,
        offsetDays: s.offsetDays,
        offsetMonths: s.offsetMonths,
        penalty: s.penalty,
        penaltyValue: s.penaltyValue === null ? null : new Prisma.Decimal(s.penaltyValue),
        createdById: user.id,
        sortOrder: start + i,
      })),
      skipDuplicates: true,
    });
    if (missing.length) await this.audit.log(user, 'PROJECT', projectId, 'STANDARD_OBLIGATIONS_ADDED', missing.map((m) => m.code).join(', '));
    return this.list(user, projectId);
  }
}
