import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  QA_AUDIT_KIND_LABELS,
  auditCounts,
  auditProblem,
  canRaiseNcr,
  findingOverdue,
  findingState,
  isExternalAudit,
  isGuest,
  type NcrStatus,
  type Paginated,
  type QaAuditDto,
  type QaAuditKind,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService } from '../common/attachments.service';
import { QualityService } from '../quality/quality.service';
import { todayIn } from '../notifications/time';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { AuditsQuery, CloseFindingDto, FindingNcrDto, SaveAuditDto } from './audits.dto';

const auditInclude = {
  project: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  attachments: true,
  findings: { orderBy: { sortOrder: 'asc' as const }, include: { ncr: { select: { ncrNo: true, status: true } } } },
} satisfies Prisma.QaAuditInclude;
type AuditRow = Prisma.QaAuditGetPayload<{ include: typeof auditInclude }>;

/**
 * Audits and visits (item 137 part 3, ARCHITECTURE "QA/QC"): an internal audit or a visit by the client, its consultant,
 * a third-party inspector or the department, with its findings. A finding is closed on its own with a note, or followed
 * through an NCR raised from it by `QualityService.createNcr` (raised by the client when the visit was from outside).
 */
@Injectable()
export class QaAuditsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private quality: QualityService,
  ) {}

  private assertView(user: RequestUser) {
    if (isGuest(user.roleKey)) throw new ForbiddenException('Audits and visits are for the company’s own staff');
  }

  private assertRecord(user: RequestUser) {
    if (!canRaiseNcr(user.roleKey)) throw new ForbiddenException('Only QA/QC, a project manager, management or an admin records audits and visits');
  }

  private toDto(a: AuditRow, today: string): QaAuditDto {
    const date = dateOnly(a.date);
    const findings = a.findings.map((f) => {
      const facts = { closedOn: dateOnly(f.closedOn), ncrStatus: (f.ncr?.status ?? null) as NcrStatus | null };
      return {
        id: f.id,
        text: f.text,
        severity: f.severity,
        dueOn: dateOnly(f.dueOn),
        closedOn: facts.closedOn,
        closingNote: f.closingNote,
        ncrId: f.ncrId,
        ncrNo: f.ncr?.ncrNo ?? null,
        ncrStatus: facts.ncrStatus,
        state: findingState(facts),
        overdueDays: findingOverdue(facts, date, today),
      };
    });
    return {
      id: a.id,
      auditNo: a.auditNo,
      projectId: a.projectId,
      projectName: a.project.name,
      kind: a.kind as QaAuditKind,
      date,
      visitor: a.visitor,
      summary: a.summary,
      score: a.score,
      findings,
      open: auditCounts(findings).open,
      createdByName: a.createdBy.fullName,
      createdAt: iso(a.createdAt),
      attachments: a.attachments.map((x) => this.attachments.toDto(x)),
    };
  }

  /** Findings still open with no NCR raised (closed on their own or turned into an NCR next), most overdue first, for My work. */
  async openFindings(user: RequestUser) {
    const today = todayIn();
    const rows = await this.prisma.qaAuditFinding.findMany({
      where: { organizationId: user.organizationId, audit: this.access.submissionWhere(user), closedOn: null, ncrId: null },
      select: { id: true, text: true, dueOn: true, audit: { select: { id: true, auditNo: true, kind: true, date: true, project: { select: { name: true } } } } },
      take: 500,
    });
    return rows
      .map((f) => {
        const auditOn = dateOnly(f.audit.date);
        const due = dateOnly(f.dueOn);
        return {
          auditId: f.audit.id,
          auditNo: f.audit.auditNo,
          kind: f.audit.kind as QaAuditKind,
          text: f.text,
          projectName: f.audit.project.name,
          due,
          // Past its own put-right day, else past the usual period from the audit.
          overdueDays: due ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000)) || null : findingOverdue({ closedOn: null, ncrStatus: null }, auditOn, today),
          ageDays: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${auditOn}T00:00:00Z`)) / 86_400_000),
        };
      })
      .sort((a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1) || b.ageDays - a.ageDays);
  }

  async list(user: RequestUser, q: AuditsQuery): Promise<Paginated<QaAuditDto>> {
    this.assertView(user);
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const words = searchWords(q.q);
    const where: Prisma.QaAuditWhereInput = {
      ...this.access.submissionWhere(user),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      // Open: a finding neither closed on its own nor through a closed NCR.
      ...(q.open ? { findings: { some: { closedOn: null, OR: [{ ncrId: null }, { ncr: { status: { not: 'CLOSED' } } }] } } } : {}),
      AND: words.map((w) => ({ OR: [{ auditNo: ilike(w) }, { visitor: ilike(w) }, { summary: ilike(w) }, { findings: { some: { text: ilike(w) } } }] })),
    };
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.qaAudit.findMany({ where, include: auditInclude, orderBy: [{ date: q.sortOrder === 'asc' ? 'asc' : 'desc' }, { auditNo: 'desc' }], skip: args.skip, take: args.take }),
      this.prisma.qaAudit.count({ where }),
    ]);
    const today = todayIn();
    return paginated(
      rows.map((r) => this.toDto(r, today)),
      total,
      args,
    );
  }

  private async row(user: RequestUser, id: string) {
    const row = await this.prisma.qaAudit.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: auditInclude });
    if (!row) throw new NotFoundException('Audit not found');
    return row;
  }

  async get(user: RequestUser, id: string): Promise<QaAuditDto> {
    this.assertView(user);
    return this.toDto(await this.row(user, id), todayIn());
  }

  private check(dto: SaveAuditDto) {
    const problem = auditProblem({ kind: dto.kind, date: dto.date, visitor: dto.visitor, findings: dto.findings }, todayIn());
    if (problem) throw new BadRequestException(problem);
    for (const f of dto.findings) if (f.dueOn && f.dueOn < dto.date) throw new BadRequestException('A finding is put right on or after the day it was found');
  }

  async create(user: RequestUser, dto: SaveAuditDto): Promise<QaAuditDto> {
    if (dto.id) {
      const existing = await this.prisma.qaAudit.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.get(user, existing.id);
    }
    this.assertRecord(user);
    await this.access.assertCanAccessProject(user, dto.projectId);
    this.check(dto);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const auditNo = await nextDocNo(tx, user.organizationId, 'AUD', async (prefix) =>
          (await tx.qaAudit.findFirst({ where: { organizationId: user.organizationId, auditNo: { startsWith: prefix } }, orderBy: { auditNo: 'desc' }, select: { auditNo: true } }))?.auditNo ?? null,
        );
        const row = await tx.qaAudit.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            auditNo,
            kind: dto.kind,
            date: parseDate(dto.date),
            visitor: dto.visitor ?? null,
            summary: dto.summary ?? null,
            score: dto.kind === 'INTERNAL' ? (dto.score ?? null) : null,
            createdById: user.id,
            findings: {
              create: dto.findings.map((f, i) => ({ organizationId: user.organizationId, text: f.text, severity: f.severity ?? 'MINOR', dueOn: f.dueOn ? parseDate(f.dueOn) : null, sortOrder: i })),
            },
          },
          select: { id: true, auditNo: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) return this.get(user, dto.id);
      throw e;
    }
    await this.attachments.link(user, 'qaAuditId', id, dto.attachmentIds);
    const out = await this.get(user, id);
    await this.audit.log(user, 'QA_AUDIT', id, 'CREATED', `${out.auditNo} ${QA_AUDIT_KIND_LABELS[out.kind]}, ${out.findings.length} findings`);
    return out;
  }

  /** Change an audit: its facts, and its findings (one with an NCR keeps its words; one left out goes unless it has an NCR). */
  async update(user: RequestUser, id: string, dto: SaveAuditDto): Promise<QaAuditDto> {
    this.assertRecord(user);
    const row = await this.row(user, id);
    if (dto.projectId !== row.projectId) throw new BadRequestException('An audit stays on its project');
    this.check(dto);
    const byId = new Map(row.findings.map((f) => [f.id, f]));
    for (const f of dto.findings) if (f.id && !byId.has(f.id)) throw new BadRequestException('A finding is not on this audit');
    const kept = new Set(dto.findings.map((f) => f.id).filter(Boolean));
    await this.prisma.$transaction(async (tx) => {
      await tx.qaAudit.update({
        where: { id },
        data: { kind: dto.kind, date: parseDate(dto.date), visitor: dto.visitor ?? null, summary: dto.summary ?? null, score: dto.kind === 'INTERNAL' ? (dto.score ?? null) : null },
      });
      await tx.qaAuditFinding.deleteMany({ where: { auditId: id, ncrId: null, id: { notIn: [...kept] as string[] } } });
      for (const [i, f] of dto.findings.entries()) {
        const was = f.id ? byId.get(f.id) : undefined;
        const data = { severity: f.severity ?? 'MINOR', dueOn: f.dueOn ? parseDate(f.dueOn) : null, sortOrder: i };
        if (was) await tx.qaAuditFinding.update({ where: { id: was.id }, data: { ...data, ...(was.ncrId ? {} : { text: f.text }) } });
        else await tx.qaAuditFinding.create({ data: { ...data, organizationId: user.organizationId, auditId: id, text: f.text } });
      }
    });
    await this.attachments.sync(user, 'qaAuditId', id, dto.attachmentIds);
    await this.audit.log(user, 'QA_AUDIT', id, 'UPDATED');
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    this.assertRecord(user);
    const row = await this.row(user, id);
    if (row.findings.some((f) => f.ncrId)) throw new BadRequestException('An NCR was raised from this audit, so it is kept; close its findings instead');
    await this.prisma.qaAudit.delete({ where: { id } });
    await this.audit.log(user, 'QA_AUDIT', id, 'DELETED', row.auditNo);
    return { ok: true };
  }

  private async finding(user: RequestUser, auditId: string, findingId: string) {
    const audit = await this.row(user, auditId);
    const f = audit.findings.find((x) => x.id === findingId);
    if (!f) throw new NotFoundException('Finding not found');
    return { audit, f };
  }

  /** Put right without an NCR: closed with a note of what was done. */
  async closeFinding(user: RequestUser, auditId: string, findingId: string, dto: CloseFindingDto): Promise<QaAuditDto> {
    this.assertRecord(user);
    const { f } = await this.finding(user, auditId, findingId);
    if (f.ncrId) throw new BadRequestException('This finding follows its NCR: close the NCR');
    if (f.closedOn) throw new BadRequestException('This finding is already closed');
    await this.prisma.qaAuditFinding.update({ where: { id: f.id }, data: { closedOn: parseDate(todayIn()), closingNote: dto.note } });
    await this.audit.log(user, 'QA_AUDIT', auditId, 'FINDING_CLOSED', dto.note);
    return this.get(user, auditId);
  }

  async reopenFinding(user: RequestUser, auditId: string, findingId: string): Promise<QaAuditDto> {
    this.assertRecord(user);
    const { f } = await this.finding(user, auditId, findingId);
    if (f.ncrId || !f.closedOn) throw new BadRequestException('Only a finding closed on its own can be opened again');
    await this.prisma.qaAuditFinding.update({ where: { id: f.id }, data: { closedOn: null, closingNote: null } });
    await this.audit.log(user, 'QA_AUDIT', auditId, 'FINDING_REOPENED');
    return this.get(user, auditId);
  }

  /** Raise an NCR from a finding, through the NCR's own create; a visit from outside raises it as the client's. */
  async raiseNcr(user: RequestUser, auditId: string, findingId: string, dto: FindingNcrDto): Promise<QaAuditDto> {
    const { audit, f } = await this.finding(user, auditId, findingId);
    if (f.ncrId) throw new BadRequestException('An NCR is already raised from this finding');
    if (f.closedOn) throw new BadRequestException('This finding is closed');
    const kind = audit.kind as QaAuditKind;
    const ncr = await this.quality.createNcr(user, {
      projectId: audit.projectId,
      title: f.text.length > 200 ? `${f.text.slice(0, 197)}…` : f.text,
      description: `${QA_AUDIT_KIND_LABELS[kind]} ${audit.auditNo} on ${dateOnly(audit.date)}${audit.visitor ? ` by ${audit.visitor}` : ''}: ${f.text}`,
      severity: f.severity,
      // A put-right day already past starts the NCR without one.
      dueDate: f.dueOn && dateOnly(f.dueOn) >= todayIn() ? dateOnly(f.dueOn) : null,
      actionById: dto.actionById ?? null,
      category: dto.category ?? null,
      raisedByClient: isExternalAudit(kind),
    });
    await this.prisma.qaAuditFinding.update({ where: { id: f.id }, data: { ncrId: ncr.id } });
    await this.audit.log(user, 'QA_AUDIT', auditId, 'NCR_RAISED', ncr.ncrNo);
    return this.get(user, auditId);
  }
}
