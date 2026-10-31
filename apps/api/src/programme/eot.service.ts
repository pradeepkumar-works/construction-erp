import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  allocateGranted,
  canApplyEot,
  canViewProgramme,
  delayDays,
  eotApplyProblem,
  eotDecisionDue,
  eotDecisionProblem,
  eotForwardProblem,
  eotLabel,
  eotState,
  isClientGuest,
  revisedCompletion,
  variationEotDays,
  variationLabel,
  type EotApplicationDto,
  type EotBasis,
  type EotDelayDto,
  type EotRegisterDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RisksService } from '../risks/risks.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';

const delaySelect = { id: true, riskNo: true, title: true, delayStart: true, delayEnd: true, daysLost: true, eotGrantedDays: true } satisfies Prisma.RiskSelect;
const include = {
  project: { select: { name: true } },
  variation: { select: { id: true, varNo: true, title: true, claimedAmount: true, approvedAmount: true } },
  delays: { select: delaySelect, orderBy: { delayStart: 'asc' } },
  forwardedBy: { select: { fullName: true } },
  decidedBy: { select: { fullName: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.EotApplicationInclude;
type Row = Prisma.EotApplicationGetPayload<{ include: typeof include }>;
type DelayRow = Prisma.RiskGetPayload<{ select: typeof delaySelect }>;

const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** Applications still waiting on the authority, or decided: a delay or variation in one of these is taken. */
const LIVE = ['SENT', 'FORWARDED', 'DECIDED'] as const;

export interface EotInput {
  basis: EotBasis;
  appliedOn?: string;
  daysClaimed: number;
  grounds: string;
  letterRef?: string | null;
  delayIds?: string[];
  variationId?: string | null;
}

/**
 * Extension of time applications (ARCHITECTURE "Programme and EOT"): applied for in writing, forwarded by the
 * Engineer to the competent authority and decided within 30 days, for delays in the register or for added work. The days
 * granted are written to the delays' `eotGrantedDays` (for added work, to a delay entry made through `RisksService.create`),
 * which the revised completion, LD and slippage already read. Rules are pure in `@erp/shared/programme-eot.ts`.
 */
@Injectable()
export class EotService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private risks: RisksService,
  ) {}

  private delayDto(d: DelayRow, today: string): EotDelayDto {
    const start = dateOnly(d.delayStart);
    return { id: d.id, riskNo: d.riskNo, title: d.title, delayStart: start, delayEnd: dateOnly(d.delayEnd), daysLost: d.daysLost ?? delayDays(start, dateOnly(d.delayEnd), today), eotGrantedDays: d.eotGrantedDays };
  }

  private toDto(r: Row, today = todayIn()): EotApplicationDto {
    const appliedOn = dateOnly(r.appliedOn);
    const v = r.variation;
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      appNo: r.appNo,
      label: eotLabel(r.appNo),
      basis: r.basis,
      appliedOn,
      daysClaimed: r.daysClaimed,
      grounds: r.grounds,
      letterRef: r.letterRef,
      variation: v ? { id: v.id, label: variationLabel(v.varNo), title: v.title, value: money(v.approvedAmount ?? v.claimedAmount) } : null,
      delays: r.delays.map((d) => this.delayDto(d, today)),
      decisionDue: eotDecisionDue(appliedOn),
      status: r.status,
      state: eotState({ status: r.status, appliedOn, daysClaimed: r.daysClaimed, grantedDays: r.grantedDays }, today),
      forwardedOn: dateOnly(r.forwardedOn),
      forwardedByName: r.forwardedByName ?? r.forwardedBy?.fullName ?? null,
      recommendedDays: r.recommendedDays,
      forwardNote: r.forwardNote,
      decidedOn: dateOnly(r.decidedOn),
      grantedDays: r.grantedDays,
      decisionRef: r.decisionRef,
      decisionNote: r.decisionNote,
      decidedByName: r.decidedBy?.fullName ?? null,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
    };
  }

  private async assertView(user: RequestUser, projectId: string) {
    if (isClientGuest(user.roleKey)) return this.access.assertCanActAsClient(user, projectId);
    if (!canViewProgramme(user.roleKey)) throw new ForbiddenException('Your role cannot see extension of time applications');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async assertApply(user: RequestUser, projectId: string) {
    if (!canApplyEot(user.roleKey)) throw new ForbiddenException('Your role cannot apply for an extension of time');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async load(user: RequestUser, id: string): Promise<Row> {
    const row = await this.prisma.eotApplication.findFirst({ where: { id, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Extension of time application not found');
    return row;
  }

  /** The contract period in days, start to completion, both counted. */
  private contractDays(p: { startDate: Date | null; endDate: Date | null }) {
    const s = dateOnly(p.startDate);
    const e = dateOnly(p.endDate);
    return s && e ? (delayDays(s, e, e) ?? null) : null;
  }

  async register(user: RequestUser, projectId: string): Promise<EotRegisterDto> {
    await this.assertView(user, projectId);
    const today = todayIn();
    const [project, rows] = await Promise.all([
      this.prisma.project.findFirst({
        where: { id: projectId, organizationId: user.organizationId },
        select: { startDate: true, endDate: true, contractValue: true, risks: { where: { kind: 'DELAY', eotGrantedDays: { not: null } }, select: { eotGrantedDays: true } } },
      }),
      this.prisma.eotApplication.findMany({ where: { projectId }, include, orderBy: { appNo: 'desc' } }),
    ]);
    if (!project) throw new NotFoundException('Project not found');
    const granted = project.risks.reduce((s, r) => s + (r.eotGrantedDays ?? 0), 0);
    const end = dateOnly(project.endDate);
    return {
      projectId,
      originalCompletion: end,
      revisedCompletion: revisedCompletion(end, granted),
      granted,
      pending: rows.filter((r) => r.status === 'SENT' || r.status === 'FORWARDED').reduce((s, r) => s + r.daysClaimed, 0),
      contractDays: this.contractDays(project),
      contractValue: isClientGuest(user.roleKey) ? null : money(project.contractValue),
      applications: rows.map((r) => this.toDto(r, today)),
    };
  }

  /** What a new application can claim for: delays not yet claimed or granted, and variations not yet claimed, with the days in proportion. */
  async options(user: RequestUser, projectId: string) {
    await this.assertApply(user, projectId);
    const today = todayIn();
    const [project, delays, variations] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { startDate: true, endDate: true, contractValue: true } }),
      this.prisma.risk.findMany({
        where: { projectId, kind: 'DELAY', eotGrantedDays: null, OR: [{ eotApplicationId: null }, { eotApplication: { status: 'WITHDRAWN' } }] },
        select: { ...delaySelect, responsibleParty: true },
        orderBy: { delayStart: 'asc' },
      }),
      this.prisma.variation.findMany({
        where: { projectId, status: { in: ['SUBMITTED', 'APPROVED'] }, eotApplications: { none: { status: { in: [...LIVE] } } } },
        select: { id: true, varNo: true, title: true, status: true, claimedAmount: true, approvedAmount: true },
        orderBy: { varNo: 'asc' },
      }),
    ]);
    if (!project) throw new NotFoundException('Project not found');
    const days = this.contractDays(project) ?? 0;
    const value = Number(project.contractValue ?? 0);
    return {
      delays: delays.map((d) => ({ ...this.delayDto(d, today), responsibleParty: d.responsibleParty })),
      variations: variations.map((v) => {
        const amount = v.approvedAmount ?? v.claimedAmount;
        return { id: v.id, label: variationLabel(v.varNo), title: v.title, status: v.status, value: money(amount), suggestedDays: variationEotDays(days, value, Number(amount)) };
      }),
      contractDays: days || null,
    };
  }

  async apply(user: RequestUser, projectId: string, dto: EotInput): Promise<EotApplicationDto> {
    await this.assertApply(user, projectId);
    const today = todayIn();
    const appliedOn = dto.appliedOn ?? today;
    const delayIds = dto.basis === 'DELAY' ? [...new Set(dto.delayIds ?? [])] : [];
    const variationId = dto.basis === 'VARIATION' ? (dto.variationId ?? null) : null;
    const problem = eotApplyProblem({ basis: dto.basis, appliedOn, daysClaimed: dto.daysClaimed, grounds: dto.grounds, delayIds, variationId }, today);
    if (problem) throw new BadRequestException(problem);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`EOT:${projectId}`}))`;
      if (delayIds.length) {
        const found = await tx.risk.findMany({ where: { id: { in: delayIds }, projectId, kind: 'DELAY' }, select: { id: true, riskNo: true, eotGrantedDays: true, eotApplication: { select: { appNo: true, status: true } } } });
        if (found.length !== delayIds.length) throw new BadRequestException('Choose delays from this project’s register');
        for (const d of found) {
          if (d.eotGrantedDays !== null) throw new BadRequestException(`${d.riskNo} already has ${plural(d.eotGrantedDays, 'day')} granted`);
          if (d.eotApplication && d.eotApplication.status !== 'WITHDRAWN') throw new ConflictException(`${d.riskNo} is already claimed in ${eotLabel(d.eotApplication.appNo)}`);
        }
      }
      if (variationId) {
        const v = await tx.variation.findFirst({ where: { id: variationId, projectId }, select: { varNo: true, status: true, eotApplications: { where: { status: { in: [...LIVE] } }, select: { appNo: true } } } });
        if (!v) throw new BadRequestException('Choose a variation of this project');
        if (v.status !== 'SUBMITTED' && v.status !== 'APPROVED') throw new BadRequestException(`${variationLabel(v.varNo)} has to be submitted to the client first`);
        if (v.eotApplications.length) throw new ConflictException(`${variationLabel(v.varNo)} is already claimed in ${eotLabel(v.eotApplications[0].appNo)}`);
      }
      const last = await tx.eotApplication.findFirst({ where: { projectId }, orderBy: { appNo: 'desc' }, select: { appNo: true } });
      const created = await tx.eotApplication.create({
        data: {
          organizationId: user.organizationId,
          projectId,
          appNo: (last?.appNo ?? 0) + 1,
          basis: dto.basis,
          appliedOn: parseDate(appliedOn),
          daysClaimed: dto.daysClaimed,
          grounds: dto.grounds.trim(),
          letterRef: dto.letterRef?.trim() || null,
          variationId,
          createdById: user.id,
        },
      });
      if (delayIds.length) await tx.risk.updateMany({ where: { id: { in: delayIds } }, data: { eotApplicationId: created.id, eotClaimed: true } });
      return tx.eotApplication.findUniqueOrThrow({ where: { id: created.id }, include });
    });
    const label = eotLabel(row.appNo);
    await this.audit.log(user, 'EOT', row.id, 'CREATED', `${label}: ${plural(row.daysClaimed, 'day')} claimed`);
    const guests = await this.access.projectGuests(user.organizationId, projectId);
    if (guests.length)
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: guests.map((g) => g.id),
        type: 'PORTAL',
        title: `${label} for ${row.project.name}: ${plural(row.daysClaimed, 'day')} claimed`,
        body: `${short(row.grounds)} Forward it to the competent authority with your recommendation in the portal.`,
        projectId,
        entityType: 'EOT',
        entityId: row.id,
      });
    return this.toDto(row);
  }

  /**
   * The Engineer forwards it to the competent authority with their recommendation: in the portal as themselves, or staff
   * recording their letter with who forwarded it.
   */
  async forward(user: RequestUser, id: string, dto: { forwardedOn?: string; recommendedDays?: number | null; note?: string | null; forwardedByName?: string | null }): Promise<EotApplicationDto> {
    const row = await this.load(user, id);
    const guest = isClientGuest(user.roleKey);
    if (guest) await this.access.assertCanActAsClient(user, row.projectId);
    else {
      await this.assertApply(user, row.projectId);
      if (!dto.forwardedByName?.trim()) throw new BadRequestException('Name the Engineer who forwarded it, as on their letter');
    }
    const today = todayIn();
    const forwardedOn = dto.forwardedOn ?? today;
    const rules = { status: row.status, appliedOn: dateOnly(row.appliedOn), daysClaimed: row.daysClaimed, grantedDays: row.grantedDays };
    const problem = eotForwardProblem(rules, forwardedOn, dto.recommendedDays ?? null, today);
    if (problem) throw row.status !== 'SENT' ? new ConflictException(problem) : new BadRequestException(problem);
    const note = dto.note?.trim() || null;
    const updated = await this.prisma.eotApplication.update({
      where: { id },
      data: { status: 'FORWARDED', forwardedOn: parseDate(forwardedOn), forwardedById: user.id, forwardedByName: guest ? null : dto.forwardedByName!.trim(), recommendedDays: dto.recommendedDays ?? null, forwardNote: note },
      include,
    });
    const label = eotLabel(row.appNo);
    const rec = dto.recommendedDays === null || dto.recommendedDays === undefined ? 'no figure recommended' : `${plural(dto.recommendedDays, 'day')} recommended`;
    await this.audit.log(user, 'EOT', id, 'FORWARDED', `${rec}${note ? `: ${note}` : ''}`);
    if (guest)
      await this.notifications.handoff({
        organizationId: user.organizationId,
        projectId: row.projectId,
        roles: ['PROJECT_MANAGER'],
        alsoUserIds: [row.createdById],
        exceptUserIds: [user.id],
        title: `${label} forwarded by ${user.fullName}: ${rec}`,
        body: `${row.project.name}: the decision is due by ${eotDecisionDue(dateOnly(row.appliedOn))}.${note ? ` ${short(note)}` : ''}`,
        entityType: 'EOT',
        entityId: id,
        email: { href: `/projects/${row.projectId}?tab=programme&eot=${id}`, cta: 'Open the application' },
      });
    return this.toDto(updated);
  }

  /**
   * The competent authority's decision, recorded from its letter: the days granted (0 refuses it). For delays they are
   * spread over the delays claimed by `allocateGranted`; for added work a delay entry is made for them. Either way the
   * delay register's `eotGrantedDays` moves the revised completion.
   */
  async decide(user: RequestUser, id: string, dto: { decidedOn?: string; grantedDays: number; decisionRef?: string | null; note?: string | null }): Promise<EotApplicationDto> {
    const row = await this.load(user, id);
    await this.assertApply(user, row.projectId);
    const today = todayIn();
    const decidedOn = dto.decidedOn ?? today;
    const appliedOn = dateOnly(row.appliedOn);
    const problem = eotDecisionProblem({ status: row.status, appliedOn, daysClaimed: row.daysClaimed, grantedDays: row.grantedDays }, decidedOn, dto.grantedDays, today);
    if (problem) throw row.status === 'DECIDED' || row.status === 'WITHDRAWN' ? new ConflictException(problem) : new BadRequestException(problem);
    const note = dto.note?.trim() || null;
    const label = eotLabel(row.appNo);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.eotApplication.updateMany({
        where: { id, status: { in: ['SENT', 'FORWARDED'] } },
        data: { status: 'DECIDED', decidedOn: parseDate(decidedOn), grantedDays: dto.grantedDays, decisionRef: dto.decisionRef?.trim() || null, decisionNote: note, decidedById: user.id },
      });
      if (!claimed.count) throw new ConflictException('This application was decided or withdrawn meanwhile');
      if (row.basis === 'DELAY') {
        const split = allocateGranted(
          dto.grantedDays,
          row.delays.map((d) => ({ id: d.id, start: dateOnly(d.delayStart), daysLost: d.daysLost ?? delayDays(dateOnly(d.delayStart), dateOnly(d.delayEnd), decidedOn) ?? 0 })),
        );
        for (const [riskId, days] of Object.entries(split)) await tx.risk.update({ where: { id: riskId }, data: { eotGrantedDays: days, eotClaimed: true } });
      }
    });
    // For added work the extension needs a place in the delay register, made the way every delay is.
    if (row.basis === 'VARIATION' && dto.grantedDays > 0 && row.variation) {
      const v = row.variation;
      const entry = await this.risks.create(user, {
        projectId: row.projectId,
        kind: 'DELAY',
        category: 'CLIENT',
        title: short(`Extension of time for ${variationLabel(v.varNo)}: ${v.title}`, 200),
        description: `${label}, decided on ${decidedOn}${dto.decisionRef?.trim() ? ` (${dto.decisionRef.trim()})` : ''}. ${short(row.grounds, 1500)}`,
        impact: 3,
        delayStart: decidedOn,
        delayEnd: decidedOn,
        daysLost: dto.grantedDays,
        responsibleParty: 'CLIENT',
        eotClaimed: true,
        eotGrantedDays: dto.grantedDays,
      });
      // Closed at once: it is an extension, not a hold-up waiting for its notice.
      await this.risks.update(user, entry.id, { status: 'CLOSED' });
      await this.prisma.risk.update({ where: { id: entry.id }, data: { eotApplicationId: id } });
    }
    await this.audit.log(user, 'EOT', id, 'DECIDED', `${plural(dto.grantedDays, 'day')} granted of ${row.daysClaimed}${note ? `: ${note}` : ''}`);
    const guests = await this.access.projectGuests(user.organizationId, row.projectId);
    if (guests.length)
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: guests.map((g) => g.id),
        type: 'PORTAL',
        title: `${label} for ${row.project.name}: ${dto.grantedDays ? `${plural(dto.grantedDays, 'day')} granted` : 'refused'}`,
        body: `Decided on ${decidedOn}${dto.decisionRef?.trim() ? `, ${dto.decisionRef.trim()}` : ''}.`,
        projectId: row.projectId,
        entityType: 'EOT',
        entityId: id,
      });
    return this.toDto(await this.load(user, id));
  }

  /**
   * A decision recorded wrongly: it goes back to waiting, the delays lose the days it granted and a delay entry made for
   * added work is removed. Contract editors only, audited.
   */
  async undoDecision(user: RequestUser, id: string): Promise<EotApplicationDto> {
    const row = await this.load(user, id);
    await this.assertApply(user, row.projectId);
    if (row.status !== 'DECIDED') throw new ConflictException('Only a decided application can be put back');
    await this.prisma.$transaction(async (tx) => {
      await tx.eotApplication.update({ where: { id }, data: { status: row.forwardedOn ? 'FORWARDED' : 'SENT', decidedOn: null, grantedDays: null, decisionRef: null, decisionNote: null, decidedById: null } });
      if (row.basis === 'VARIATION') await tx.risk.deleteMany({ where: { eotApplicationId: id } });
      else await tx.risk.updateMany({ where: { eotApplicationId: id }, data: { eotGrantedDays: null } });
    });
    await this.audit.log(user, 'EOT', id, 'DECISION_UNDONE', `${plural(row.grantedDays ?? 0, 'day')} granted on ${dateOnly(row.decidedOn)} taken back`);
    return this.toDto(await this.load(user, id));
  }

  /** We withdraw an application still waiting: its delays are free to claim again. */
  async withdraw(user: RequestUser, id: string): Promise<EotApplicationDto> {
    const row = await this.load(user, id);
    await this.assertApply(user, row.projectId);
    if (row.status !== 'SENT' && row.status !== 'FORWARDED') throw new ConflictException(row.status === 'DECIDED' ? 'A decided application cannot be withdrawn' : 'Already withdrawn');
    await this.prisma.$transaction(async (tx) => {
      await tx.eotApplication.update({ where: { id }, data: { status: 'WITHDRAWN' } });
      await tx.risk.updateMany({ where: { eotApplicationId: id }, data: { eotApplicationId: null, eotClaimed: false } });
    });
    await this.audit.log(user, 'EOT', id, 'WITHDRAWN', eotLabel(row.appNo));
    return this.toDto(await this.load(user, id));
  }

  /** Applications past their decision day, for the watch list's EOT_OVERDUE. */
  async overdue(projectIds: string[], today: string) {
    if (!projectIds.length) return [];
    const rows = await this.prisma.eotApplication.findMany({ where: { projectId: { in: projectIds }, status: { in: ['SENT', 'FORWARDED'] } }, include, orderBy: { appliedOn: 'asc' } });
    return rows.map((r) => this.toDto(r, today)).filter((a) => a.state === 'OVERDUE');
  }
}
