import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COMPLIANCE_DOC_KIND_LABELS,
  DOC_ALERT_DAYS,
  canBeInvoked,
  canManageCompliance,
  canViewCompliance,
  expiryState,
  type ComplianceDocDetailDto,
  type ComplianceDocDto,
  type ComplianceRegisterDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { todayIn } from '../notifications/time';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { CloseComplianceDocDto, CreateComplianceDocDto, ListComplianceQuery, RenewComplianceDocDto, UpdateComplianceDocDto } from './compliance.dto';

const include = {
  project: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  renewedBy: { select: { id: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ComplianceDocInclude;
type Row = Prisma.ComplianceDocGetPayload<{ include: typeof include }>;

const D = (v: string | null | undefined) => (v === null || v === undefined ? v : new Prisma.Decimal(v));
const day = (v: string | null | undefined) => (v === null || v === undefined ? v : parseDate(v));
const addDays = (d: string, n: number) => {
  const x = parseDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/**
 * Guarantees, insurance and licences register. Accounts and admins keep it; project managers see the
 * entries of their projects. Expiring entries are alerted by NotificationJobsService.complianceDue.
 */
@Injectable()
export class ComplianceService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
  ) {}

  private toDto(r: Row, today: string): ComplianceDocDto {
    const expiresOn = dateOnly(r.expiresOn);
    const e = r.status === 'ACTIVE' ? expiryState(expiresOn, today) : null;
    return {
      id: r.id,
      kind: r.kind,
      category: r.category,
      reference: r.reference,
      issuer: r.issuer,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      beneficiary: r.beneficiary,
      amount: money(r.amount),
      margin: money(r.margin),
      issuedOn: dateOnly(r.issuedOn),
      expiresOn,
      claimUntil: dateOnly(r.claimUntil),
      status: r.status,
      closedOn: dateOnly(r.closedOn),
      closeNote: r.closeNote,
      renewedFromId: r.renewedFromId,
      renewedById: r.renewedBy?.id ?? null,
      note: r.note,
      state: e?.state ?? null,
      daysLeft: e?.daysLeft ?? null,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  /** Entries the caller may see: all of the company's for its keepers, their projects' for project managers. */
  private visible(user: RequestUser): Prisma.ComplianceDocWhereInput {
    if (canManageCompliance(user.roleKey)) return { organizationId: user.organizationId };
    if (canViewCompliance(user.roleKey)) return { organizationId: user.organizationId, project: this.access.projectWhere(user) };
    throw new ForbiddenException('Only accounts, admins and project managers see the guarantees and licences register');
  }

  private assertKeeper(user: RequestUser) {
    if (!canManageCompliance(user.roleKey)) throw new ForbiddenException('Only accounts and admins keep the guarantees and licences register');
  }

  private async find(user: RequestUser, id: string) {
    const r = await this.prisma.complianceDoc.findFirst({ where: { id, ...this.visible(user) }, include });
    if (!r) throw new NotFoundException('Entry not found');
    return r;
  }

  async list(user: RequestUser, q: ListComplianceQuery): Promise<ComplianceRegisterDto> {
    const base = this.visible(user);
    const today = todayIn();
    const soon = parseDate(addDays(today, DOC_ALERT_DAYS));
    const where: Prisma.ComplianceDocWhereInput = { ...base };
    if (q.kind) where.kind = q.kind;
    const status = q.state ? 'ACTIVE' : (q.status ?? 'ACTIVE');
    if (status !== 'ALL') where.status = status;
    if (q.state === 'EXPIRED') where.expiresOn = { lt: parseDate(today) };
    if (q.state === 'EXPIRING') where.expiresOn = { gte: parseDate(today), lte: soon };
    if (q.projectId === 'none') where.projectId = null;
    else if (q.projectId) where.projectId = q.projectId;
    if (q.q) {
      const has = { contains: q.q, mode: 'insensitive' as const };
      where.OR = [{ reference: has }, { issuer: has }, { beneficiary: has }, { category: has }, { project: { name: has } }];
    }
    const rows = await this.prisma.complianceDoc.findMany({ where, include, orderBy: [{ expiresOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] });
    const active = await this.prisma.complianceDoc.findMany({ where: { ...base, status: 'ACTIVE' }, select: { kind: true, amount: true, margin: true, expiresOn: true } });
    const sum = (xs: (Prisma.Decimal | null)[]) => xs.reduce<Prisma.Decimal>((t, x) => (x ? t.add(x) : t), new Prisma.Decimal(0)).toFixed(2);
    const states = active.map((a) => expiryState(dateOnly(a.expiresOn), today)?.state);
    return {
      items: rows.map((r) => this.toDto(r, today)),
      totals: {
        active: active.length,
        expiring: states.filter((s) => s === 'EXPIRING').length,
        expired: states.filter((s) => s === 'EXPIRED').length,
        guaranteesOut: sum(active.filter((a) => a.kind === 'BANK_GUARANTEE').map((a) => a.amount)),
        marginBlocked: sum(active.filter((a) => a.kind === 'BANK_GUARANTEE').map((a) => a.margin)),
        emdOut: sum(active.filter((a) => a.kind === 'EMD').map((a) => a.amount)),
      },
    };
  }

  async get(user: RequestUser, id: string): Promise<ComplianceDocDetailDto> {
    const r = await this.find(user, id);
    const today = todayIn();
    const history: ComplianceDocDto[] = [];
    let prev = r.renewedFromId;
    while (prev && history.length < 50) {
      const p = await this.prisma.complianceDoc.findFirst({ where: { id: prev, organizationId: user.organizationId }, include });
      if (!p) break;
      history.push(this.toDto(p, today));
      prev = p.renewedFromId;
    }
    return { ...this.toDto(r, today), history };
  }

  private async checkProject(user: RequestUser, projectId: string | null | undefined) {
    if (!projectId) return;
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { id: true } });
    if (!p) throw new NotFoundException('Project not found');
  }

  private checkDates(issuedOn: string | null | undefined, expiresOn: string | null | undefined, claimUntil: string | null | undefined) {
    if (issuedOn && expiresOn && expiresOn < issuedOn) throw new BadRequestException('The expiry date is before the issue date');
    if (expiresOn && claimUntil && claimUntil < expiresOn) throw new BadRequestException('The claim period cannot end before the expiry date');
  }

  async create(user: RequestUser, dto: CreateComplianceDocDto): Promise<ComplianceDocDetailDto> {
    this.assertKeeper(user);
    await this.checkProject(user, dto.projectId);
    this.checkDates(dto.issuedOn, dto.expiresOn, dto.claimUntil);
    const r = await this.prisma.complianceDoc.create({
      data: {
        organizationId: user.organizationId,
        kind: dto.kind,
        category: dto.category || null,
        reference: dto.reference,
        issuer: dto.issuer || null,
        projectId: dto.projectId || null,
        beneficiary: dto.beneficiary || null,
        amount: D(dto.amount) ?? null,
        margin: dto.kind === 'BANK_GUARANTEE' ? (D(dto.margin) ?? null) : null,
        issuedOn: day(dto.issuedOn) ?? null,
        expiresOn: day(dto.expiresOn) ?? null,
        claimUntil: day(dto.claimUntil) ?? null,
        note: dto.note || null,
        createdById: user.id,
      },
    });
    await this.attachments.link(user, 'complianceDocId', r.id, dto.attachmentIds);
    await this.audit.log(user, 'COMPLIANCE_DOC', r.id, 'CREATED', `${COMPLIANCE_DOC_KIND_LABELS[dto.kind]} ${dto.reference}`);
    return this.get(user, r.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateComplianceDocDto): Promise<ComplianceDocDetailDto> {
    this.assertKeeper(user);
    const r = await this.find(user, id);
    await this.checkProject(user, dto.projectId);
    const pick = <T>(v: T | undefined, cur: T) => (v === undefined ? cur : v);
    this.checkDates(pick(dto.issuedOn, dateOnly(r.issuedOn)), pick(dto.expiresOn, dateOnly(r.expiresOn)), pick(dto.claimUntil, dateOnly(r.claimUntil)));
    const blank = <T>(v: T | null | undefined) => (v === undefined ? undefined : v || null);
    await this.prisma.complianceDoc.update({
      where: { id },
      data: {
        reference: dto.reference,
        category: blank(dto.category),
        issuer: blank(dto.issuer),
        projectId: blank(dto.projectId),
        beneficiary: blank(dto.beneficiary),
        amount: D(dto.amount),
        margin: r.kind === 'BANK_GUARANTEE' ? D(dto.margin) : undefined,
        issuedOn: day(dto.issuedOn),
        expiresOn: day(dto.expiresOn),
        claimUntil: day(dto.claimUntil),
        note: blank(dto.note),
      },
    });
    await this.attachments.sync(user, 'complianceDocId', id, dto.attachmentIds);
    await this.audit.log(user, 'COMPLIANCE_DOC', id, 'UPDATED', null);
    return this.get(user, id);
  }

  /** Replace an active entry with a renewed one (a new number or period); the old one is kept as RENEWED. */
  async renew(user: RequestUser, id: string, dto: RenewComplianceDocDto): Promise<ComplianceDocDetailDto> {
    this.assertKeeper(user);
    const r = await this.find(user, id);
    if (r.status !== 'ACTIVE') throw new ConflictException('Only an active entry can be renewed');
    const today = todayIn();
    const oldExpiry = dateOnly(r.expiresOn);
    const issuedOn = dto.issuedOn ?? (oldExpiry && oldExpiry >= today ? addDays(oldExpiry, 1) : today);
    if (dto.expiresOn <= issuedOn) throw new BadRequestException('The new expiry date must be after the renewal starts');
    this.checkDates(issuedOn, dto.expiresOn, dto.claimUntil);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.complianceDoc.update({ where: { id }, data: { status: 'RENEWED', closedOn: parseDate(issuedOn < today ? issuedOn : today) } });
      return tx.complianceDoc.create({
        data: {
          organizationId: r.organizationId,
          kind: r.kind,
          category: r.category,
          reference: dto.reference ?? r.reference,
          issuer: r.issuer,
          projectId: r.projectId,
          beneficiary: r.beneficiary,
          amount: dto.amount !== undefined ? D(dto.amount) : r.amount,
          margin: r.kind !== 'BANK_GUARANTEE' ? null : dto.margin !== undefined ? D(dto.margin) : r.margin,
          issuedOn: parseDate(issuedOn),
          expiresOn: parseDate(dto.expiresOn),
          claimUntil: day(dto.claimUntil) ?? null,
          note: dto.note || r.note,
          renewedFromId: r.id,
          createdById: user.id,
        },
      });
    });
    await this.attachments.link(user, 'complianceDocId', created.id, dto.attachmentIds);
    await this.audit.log(user, 'COMPLIANCE_DOC', r.id, 'RENEWED', `Renewed to ${dto.expiresOn}`);
    await this.audit.log(user, 'COMPLIANCE_DOC', created.id, 'CREATED', `Renewal of ${r.reference}, valid to ${dto.expiresOn}`);
    return this.get(user, created.id);
  }

  /** Released: the guarantee returned, the EMD refunded, the policy cancelled or the licence surrendered. */
  release(user: RequestUser, id: string, dto: CloseComplianceDocDto) {
    return this.close(user, id, 'RELEASED', dto);
  }

  /** Invoked: the client encashed the guarantee, or the EMD was forfeited. */
  invoke(user: RequestUser, id: string, dto: CloseComplianceDocDto) {
    return this.close(user, id, 'INVOKED', dto);
  }

  private async close(user: RequestUser, id: string, status: 'RELEASED' | 'INVOKED', dto: CloseComplianceDocDto): Promise<ComplianceDocDetailDto> {
    this.assertKeeper(user);
    const r = await this.find(user, id);
    if (r.status !== 'ACTIVE') throw new ConflictException('This entry is already closed');
    if (status === 'INVOKED' && !canBeInvoked(r.kind)) throw new BadRequestException('Only a guarantee or an EMD can be invoked');
    const date = dto.date ?? todayIn();
    if (date > todayIn()) throw new BadRequestException('The date cannot be in the future');
    await this.prisma.complianceDoc.update({ where: { id }, data: { status, closedOn: parseDate(date), closeNote: dto.note || null } });
    await this.audit.log(user, 'COMPLIANCE_DOC', id, status, dto.note || null);
    return this.get(user, id);
  }

  /** Delete an entry made by mistake. Deleting a renewal makes the entry it replaced active again. */
  async remove(user: RequestUser, id: string) {
    this.assertKeeper(user);
    const r = await this.find(user, id);
    if (r.renewedBy) throw new ConflictException('This entry was renewed; delete the renewal first');
    await this.prisma.$transaction(async (tx) => {
      await tx.complianceDoc.delete({ where: { id } });
      if (r.renewedFromId) await tx.complianceDoc.updateMany({ where: { id: r.renewedFromId, status: 'RENEWED' }, data: { status: 'ACTIVE', closedOn: null } });
    });
    await this.audit.log(user, 'COMPLIANCE_DOC', id, 'DELETED', `${COMPLIANCE_DOC_KIND_LABELS[r.kind]} ${r.reference}`);
    return { ok: true };
  }
}
