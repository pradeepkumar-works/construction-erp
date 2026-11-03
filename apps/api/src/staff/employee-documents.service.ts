import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EMPLOYEE_DOCUMENT_INFO,
  EMPLOYEE_DOCUMENT_STATE_LABELS,
  canManageStaff,
  canViewEmployeePrivate,
  documentCheckProblem,
  documentChecklist,
  documentLetterProblem,
  documentsOutstanding,
  type EmployeeDocumentKind,
  type EmployeeDocumentsChecklistDto,
  type EmployeeEventType,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { CheckEmployeeDocumentDto } from './staff.dto';

const docInclude = {
  attachment: { select: ATTACHMENT_FIELDS },
  checkedBy: { select: { fullName: true } },
} satisfies Prisma.EmployeeDocumentInclude;

/**
 * Joining documents: a line per kind for a person, its file and HR's check (`@erp/shared/hr-documents.ts`). HR and the
 * person file papers; only HR verifies, sends back or sets aside. The offer and appointment letters ask
 * `letterProblem` before they go out.
 */
@Injectable()
export class EmployeeDocumentsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
  ) {}

  private async employeeFor(user: RequestUser, id: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, ...this.access.staffWhere(user) }, select: { id: true, fullName: true, userId: true } });
    if (!e) throw new NotFoundException('Employee not found');
    return e;
  }

  private kindOf(kind: string): EmployeeDocumentKind {
    if (!(kind in EMPLOYEE_DOCUMENT_INFO)) throw new NotFoundException('No such document on the checklist');
    return kind as EmployeeDocumentKind;
  }

  async checklist(user: RequestUser, employeeId: string): Promise<EmployeeDocumentsChecklistDto> {
    const e = await this.employeeFor(user, employeeId);
    if (!canManageStaff(user.roleKey) && !canViewEmployeePrivate(user.roleKey) && e.userId !== user.id) throw new ForbiddenException('Only HR, payroll and the person themselves see their documents');
    const [rows, others] = await Promise.all([
      this.prisma.employeeDocument.findMany({ where: { employeeId, organizationId: user.organizationId }, include: docInclude }),
      this.prisma.attachment.findMany({ where: { employeeId, organizationId: user.organizationId, joiningDocument: null }, select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } }),
    ]);
    const byKind = new Map(rows.map((r) => [r.kind, r]));
    const facts = rows.map((r) => ({ kind: r.kind, status: r.status }));
    return {
      employeeId,
      lines: documentChecklist(facts).map((l) => {
        const r = byKind.get(l.kind);
        return {
          ...l,
          hint: EMPLOYEE_DOCUMENT_INFO[l.kind].hint,
          file: r?.attachment ? this.attachments.toDto(r.attachment) : null,
          note: r?.note ?? null,
          checkedByName: r?.checkedBy?.fullName ?? null,
          checkedAt: r?.checkedAt?.toISOString() ?? null,
        };
      }),
      outstanding: documentsOutstanding(facts).map((k) => EMPLOYEE_DOCUMENT_INFO[k].label),
      letterProblem: documentLetterProblem('OFFERED', facts),
      otherFiles: others.map((a) => this.attachments.toDto(a)),
    };
  }

  /** File a paper for a kind (a fresh copy replaces the last): it waits for HR's check again. HR or the person. */
  async file(user: RequestUser, employeeId: string, kindParam: string, attachmentId: string): Promise<EmployeeDocumentsChecklistDto> {
    const kind = this.kindOf(kindParam);
    const e = await this.employeeFor(user, employeeId);
    if (!canManageStaff(user.roleKey) && e.userId !== user.id) throw new ForbiddenException('Only HR and the person themselves file their documents');
    await this.attachments.link(user, 'employeeId', employeeId, [attachmentId]);
    const a = await this.prisma.attachment.findFirst({ where: { id: attachmentId, organizationId: user.organizationId }, select: { employeeId: true, joiningDocument: { select: { id: true, employeeId: true, kind: true } } } });
    if (!a || a.employeeId !== employeeId) throw new BadRequestException('That file belongs to another record. Upload it again.');
    if (a.joiningDocument && a.joiningDocument.kind !== kind) throw new BadRequestException(`That file is already filed as ${EMPLOYEE_DOCUMENT_INFO[this.kindOf(a.joiningDocument.kind)].label}. Upload it again for this one.`);
    const fresh = { status: 'UPLOADED' as const, attachmentId, note: null, checkedById: null, checkedAt: null };
    const before = await this.prisma.employeeDocument.findUnique({ where: { employeeId_kind: { employeeId, kind } }, select: { attachmentId: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeDocument.upsert({
        where: { employeeId_kind: { employeeId, kind } },
        create: { organizationId: user.organizationId, employeeId, kind, ...fresh },
        update: fresh,
      });
      // The copy it replaces leaves the person's files (it stays in storage, as any detached upload does).
      if (before?.attachmentId && before.attachmentId !== attachmentId) await tx.attachment.update({ where: { id: before.attachmentId }, data: { employeeId: null } });
    });
    await this.audit.log(user, 'EMPLOYEE', employeeId, 'UPDATED', `${EMPLOYEE_DOCUMENT_INFO[kind].label} filed`);
    return this.checklist(user, employeeId);
  }

  /** Verify against the original, send back for a fresh copy, or set aside as not needed for this person. HR only. */
  async check(user: RequestUser, employeeId: string, kindParam: string, dto: CheckEmployeeDocumentDto): Promise<EmployeeDocumentsChecklistDto> {
    const kind = this.kindOf(kindParam);
    this.access.assertCanManageStaff(user);
    await this.employeeFor(user, employeeId);
    const row = await this.prisma.employeeDocument.findUnique({ where: { employeeId_kind: { employeeId, kind } }, select: { status: true } });
    const problem = documentCheckProblem(kind, row?.status ?? 'MISSING', dto.decision, dto.note);
    if (problem) throw new BadRequestException(problem);
    const checked = { status: dto.decision, note: dto.decision === 'VERIFIED' ? null : dto.note!.trim(), checkedById: user.id, checkedAt: new Date() };
    await this.prisma.employeeDocument.upsert({
      where: { employeeId_kind: { employeeId, kind } },
      create: { organizationId: user.organizationId, employeeId, kind, ...checked },
      update: checked,
    });
    await this.audit.log(user, 'EMPLOYEE', employeeId, 'UPDATED', `${EMPLOYEE_DOCUMENT_INFO[kind].label}: ${EMPLOYEE_DOCUMENT_STATE_LABELS[dto.decision].toLowerCase()}${checked.note ? ` (${checked.note})` : ''}`);
    return this.checklist(user, employeeId);
  }

  /** Take a kind back to not received: its file leaves the person's record. HR only. */
  async remove(user: RequestUser, employeeId: string, kindParam: string): Promise<EmployeeDocumentsChecklistDto> {
    const kind = this.kindOf(kindParam);
    this.access.assertCanManageStaff(user);
    await this.employeeFor(user, employeeId);
    const row = await this.prisma.employeeDocument.findUnique({ where: { employeeId_kind: { employeeId, kind } }, select: { id: true, attachmentId: true } });
    if (!row) return this.checklist(user, employeeId);
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeDocument.delete({ where: { id: row.id } });
      if (row.attachmentId) await tx.attachment.update({ where: { id: row.attachmentId }, data: { employeeId: null } });
    });
    await this.audit.log(user, 'EMPLOYEE', employeeId, 'UPDATED', `${EMPLOYEE_DOCUMENT_INFO[kind].label} removed`);
    return this.checklist(user, employeeId);
  }

  /** Why an event's letter cannot go out yet: the offer and appointment letters wait for the papers. */
  async letterProblem(employeeId: string, type: EmployeeEventType): Promise<string | null> {
    const rows = await this.prisma.employeeDocument.findMany({ where: { employeeId }, select: { kind: true, status: true } });
    return documentLetterProblem(type, rows);
  }

  /** The papers still to verify for each of these people, by label; people with none outstanding are left out. */
  async outstandingFor(organizationId: string, employeeIds: string[]): Promise<Map<string, string[]>> {
    const rows = await this.prisma.employeeDocument.findMany({ where: { organizationId, employeeId: { in: employeeIds } }, select: { employeeId: true, kind: true, status: true } });
    const by = new Map<string, { kind: string; status: (typeof rows)[number]['status'] }[]>(employeeIds.map((id) => [id, []]));
    for (const r of rows) by.get(r.employeeId)?.push(r);
    const out = new Map<string, string[]>();
    for (const [id, docs] of by) {
      const missing = documentsOutstanding(docs);
      if (missing.length) out.set(id, missing.map((k) => EMPLOYEE_DOCUMENT_INFO[k].label));
    }
    return out;
  }
}
