import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canManageApprovedMakes,
  canRaiseMaterialApprovals,
  canViewMaterialApprovals,
  revisionLabel,
  type ApprovedMakeDto,
  type MakeWarningDto,
  type MaterialApprovalDetailDto,
  type MaterialApprovalDto,
  type MaterialApprovalListDto,
  type MaterialApprovalStatus,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, parseDate } from '../common/serialize';
import { nextDocNo } from '../common/doc-number';
import { todayIn } from '../notifications/time';
import { averageDays, daysBetween, daysOutstanding, isApproval, makeWarnings, reviewProblem, statusAfter, submitProblem } from './material-approval-rules';
import {
  ApprovedMakeQuery,
  CreateApprovedMakeDto,
  CreateMaterialApprovalDto,
  MakeCheckDto,
  MaterialApprovalQuery,
  ReviewMaterialApprovalDto,
  SubmitMaterialApprovalDto,
  UpdateMaterialApprovalDto,
  WithdrawMaterialApprovalDto,
} from './material-approvals.dto';

const INCLUDE = {
  project: { select: { code: true, name: true } },
  createdBy: { select: { fullName: true } },
  vendor: { select: { name: true } },
  boqItem: { select: { itemNo: true } },
  revisions: { orderBy: { revision: 'desc' }, include: { submittedBy: { select: { fullName: true } } } },
} satisfies Prisma.MaterialApprovalInclude;
type Row = Prisma.MaterialApprovalGetPayload<{ include: typeof INCLUDE }>;

const MAKE_INCLUDE = {
  project: { select: { code: true, name: true } },
  createdBy: { select: { fullName: true } },
  approval: { select: { marNo: true } },
} satisfies Prisma.ApprovedMakeInclude;

/** Requests waiting on us: back for revision or rejected. */
const WITH_US: MaterialApprovalStatus[] = ['REVISE_RESUBMIT', 'REJECTED'];
const DECIDED: MaterialApprovalStatus[] = ['APPROVED', 'APPROVED_AS_NOTED', 'WITHDRAWN'];

/**
 * Material approvals. A request puts a make (or a sample) for a material up to the client's engineer or
 * consultant; each submission is a revision (R0, R1…) with the reviewer's outcome, recorded from their letter. An
 * approval puts the make on the project's approved makes, alongside those from the contract's list, and a purchase
 * order line for a listed material in another make is flagged. Rules in `material-approval-rules.ts`.
 */
@Injectable()
export class MaterialApprovalsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
  ) {}

  private assertView(user: RequestUser) {
    if (!canViewMaterialApprovals(user.roleKey)) throw new ForbiddenException('Material approvals are for the company’s own staff');
  }
  private assertRaise(user: RequestUser) {
    if (!canRaiseMaterialApprovals(user.roleKey)) throw new ForbiddenException('Your role does not raise material approvals');
  }

  private where(user: RequestUser): Prisma.MaterialApprovalWhereInput {
    return { organizationId: user.organizationId, project: this.access.projectWhere(user) };
  }

  private toDto(r: Row, today: string): MaterialApprovalDto {
    const current = r.revisions.find((v) => v.revision === r.revision) ?? null;
    const submittedOn = r.status === 'DRAFT' ? null : dateOnly(current?.submittedOn ?? null);
    const replyBy = dateOnly(r.replyBy);
    return {
      id: r.id,
      marNo: r.marNo,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      kind: r.kind,
      material: r.material,
      itemId: r.itemId,
      boqItemId: r.boqItemId,
      boqItemNo: r.boqItem?.itemNo ?? null,
      make: r.make,
      model: r.model,
      vendorId: r.vendorId,
      vendorName: r.vendor?.name ?? null,
      usedFor: r.usedFor,
      toParty: r.toParty,
      replyBy,
      status: r.status,
      revision: r.revision,
      submittedOn,
      daysOutstanding: daysOutstanding(r.status, submittedOn, today),
      overdue: r.status === 'UNDER_REVIEW' && !!replyBy && replyBy < today,
      createdByName: r.createdBy.fullName,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async list(user: RequestUser, q: MaterialApprovalQuery): Promise<MaterialApprovalListDto> {
    this.assertView(user);
    const today = todayIn();
    const base: Prisma.MaterialApprovalWhereInput = { ...this.where(user), ...(q.projectId ? { projectId: q.projectId } : {}) };
    const status = q.status ?? 'open';
    const words = q.q?.trim();
    const where: Prisma.MaterialApprovalWhereInput = {
      ...base,
      ...(q.kind ? { kind: q.kind } : {}),
      ...(status === 'open' ? { status: { notIn: DECIDED } } : status === 'review' ? { status: 'UNDER_REVIEW' } : status === 'decided' ? { status: { in: DECIDED } } : {}),
      ...(words
        ? {
            OR: [
              { marNo: { contains: words, mode: 'insensitive' } },
              { material: { contains: words, mode: 'insensitive' } },
              { make: { contains: words, mode: 'insensitive' } },
              { model: { contains: words, mode: 'insensitive' } },
              { vendor: { name: { contains: words, mode: 'insensitive' } } },
              { project: { OR: [{ code: { contains: words, mode: 'insensitive' } }, { name: { contains: words, mode: 'insensitive' } }] } },
            ],
          }
        : {}),
    };
    const monthStart = parseDate(`${today.slice(0, 7)}-01`);
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000);
    const [rows, underReview, overdue, withUs, approvedThisMonth, reviewed] = await Promise.all([
      this.prisma.materialApproval.findMany({ where, include: INCLUDE, orderBy: [{ updatedAt: 'desc' }], take: 300 }),
      this.prisma.materialApproval.count({ where: { ...base, status: 'UNDER_REVIEW' } }),
      this.prisma.materialApproval.count({ where: { ...base, status: 'UNDER_REVIEW', replyBy: { lt: parseDate(today) } } }),
      this.prisma.materialApproval.count({ where: { ...base, status: { in: WITH_US } } }),
      this.prisma.materialApprovalRevision.count({ where: { approval: base, outcome: { in: ['APPROVED', 'APPROVED_AS_NOTED'] }, reviewedOn: { gte: monthStart } } }),
      this.prisma.materialApprovalRevision.findMany({ where: { approval: base, reviewedOn: { gte: since } }, select: { submittedOn: true, reviewedOn: true } }),
    ]);
    const items = rows.map((r) => this.toDto(r, today));
    // Open ones: what waits longest with the reviewer first, then what is back with us, then drafts.
    if (status === 'open' || status === 'review') {
      const rank = (a: MaterialApprovalDto) => (a.status === 'UNDER_REVIEW' ? 0 : a.status === 'DRAFT' ? 2 : 1);
      items.sort((a, b) => rank(a) - rank(b) || (b.daysOutstanding ?? 0) - (a.daysOutstanding ?? 0));
    }
    return {
      items,
      summary: {
        underReview,
        overdue,
        withUs,
        approvedThisMonth,
        avgDaysToDecide: averageDays(reviewed.map((r) => ({ submittedOn: dateOnly(r.submittedOn), reviewedOn: dateOnly(r.reviewedOn)! }))),
      },
    };
  }

  private async row(user: RequestUser, id: string) {
    this.assertView(user);
    const row = await this.prisma.materialApproval.findFirst({
      where: { id, ...this.where(user) },
      include: { ...INCLUDE, attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } }, approvedMakes: { select: { id: true } } },
    });
    if (!row) throw new NotFoundException('Material approval not found');
    return row;
  }

  async get(user: RequestUser, id: string): Promise<MaterialApprovalDetailDto> {
    const r = await this.row(user, id);
    const today = todayIn();
    const raise = canRaiseMaterialApprovals(user.roleKey);
    const withdrawn = r.status === 'WITHDRAWN' ? await this.prisma.auditLog.findFirst({ where: { organizationId: user.organizationId, entityType: 'MATERIAL_APPROVAL', entityId: id, action: 'WITHDRAWN' }, orderBy: { createdAt: 'desc' }, select: { note: true } }) : null;
    return {
      ...this.toDto(r, today),
      note: r.note,
      withdrawnNote: withdrawn?.note ?? null,
      revisions: r.revisions.map((v) => {
        const sub = dateOnly(v.submittedOn);
        const rev = dateOnly(v.reviewedOn);
        return {
          id: v.id,
          revision: v.revision,
          submittedOn: sub,
          submittedByName: v.submittedBy.fullName,
          submitNote: v.submitNote,
          outcome: v.outcome,
          reviewedOn: rev,
          reviewerName: v.reviewerName,
          comments: v.comments,
          reviewRef: v.reviewRef,
          days: Math.max(0, daysBetween(sub, rev ?? today)),
        };
      }),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      approvedMakeId: r.approvedMakes[0]?.id ?? null,
      canEdit: raise && r.status === 'DRAFT',
      canSubmit: raise && (r.status === 'DRAFT' || WITH_US.includes(r.status)),
      canRecord: raise && r.status === 'UNDER_REVIEW',
      canResubmit: raise && WITH_US.includes(r.status),
      canWithdraw: raise && (r.status === 'UNDER_REVIEW' || WITH_US.includes(r.status)),
    };
  }

  /** The item, BOQ item and supplier given, checked to be the company's and the project's. */
  private async checkLinks(user: RequestUser, projectId: string, d: { itemId?: string | null; boqItemId?: string | null; vendorId?: string | null }) {
    const org = user.organizationId;
    const [item, boq, vendor] = await Promise.all([
      d.itemId ? this.prisma.item.findFirst({ where: { id: d.itemId, organizationId: org }, select: { id: true } }) : null,
      d.boqItemId ? this.prisma.boqItem.findFirst({ where: { id: d.boqItemId, projectId, organizationId: org }, select: { id: true } }) : null,
      d.vendorId ? this.prisma.vendor.findFirst({ where: { id: d.vendorId, organizationId: org }, select: { id: true } }) : null,
    ]);
    if (d.itemId && !item) throw new BadRequestException('That item is not on the item master');
    if (d.boqItemId && !boq) throw new BadRequestException('That BOQ item is not on this project');
    if (d.vendorId && !vendor) throw new BadRequestException('That supplier is not on the vendor list');
  }

  async create(user: RequestUser, dto: CreateMaterialApprovalDto): Promise<MaterialApprovalDetailDto> {
    this.assertRaise(user);
    await this.access.assertCanAccessProject(user, dto.projectId);
    await this.checkLinks(user, dto.projectId, dto);
    const org = user.organizationId;
    const id = await this.prisma.$transaction(async (tx) => {
      const marNo = await nextDocNo(tx, org, 'MAR', async (prefix) =>
        (await tx.materialApproval.findFirst({ where: { organizationId: org, marNo: { startsWith: prefix } }, orderBy: { marNo: 'desc' }, select: { marNo: true } }))?.marNo ?? null,
      );
      const m = await tx.materialApproval.create({
        data: {
          organizationId: org,
          projectId: dto.projectId,
          marNo,
          kind: dto.kind ?? 'MATERIAL',
          material: dto.material,
          itemId: dto.itemId ?? null,
          boqItemId: dto.boqItemId ?? null,
          make: dto.make,
          model: dto.model ?? null,
          vendorId: dto.vendorId ?? null,
          usedFor: dto.usedFor ?? null,
          note: dto.note ?? null,
          toParty: dto.toParty,
          replyBy: dto.replyBy ? parseDate(dto.replyBy) : null,
          createdById: user.id,
        },
      });
      return m.id;
    });
    await this.attachments.link(user, 'materialApprovalId', id, dto.attachmentIds);
    await this.audit.log(user, 'MATERIAL_APPROVAL', id, 'CREATED');
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateMaterialApprovalDto): Promise<MaterialApprovalDetailDto> {
    this.assertRaise(user);
    const r = await this.row(user, id);
    // Under review only the reply-by date moves; anything else changes with a new revision.
    const onlyDate = Object.entries(dto).every(([k, v]) => v === undefined || k === 'replyBy');
    if (r.status !== 'DRAFT' && !(r.status === 'UNDER_REVIEW' && onlyDate)) throw new ConflictException('This request has gone to the reviewer. Changes go in a new revision.');
    await this.checkLinks(user, r.projectId, dto);
    await this.prisma.materialApproval.update({
      where: { id },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.material !== undefined ? { material: dto.material } : {}),
        ...(dto.itemId !== undefined ? { itemId: dto.itemId } : {}),
        ...(dto.boqItemId !== undefined ? { boqItemId: dto.boqItemId } : {}),
        ...(dto.make !== undefined ? { make: dto.make } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.vendorId !== undefined ? { vendorId: dto.vendorId } : {}),
        ...(dto.usedFor !== undefined ? { usedFor: dto.usedFor } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.toParty !== undefined ? { toParty: dto.toParty } : {}),
        ...(dto.replyBy !== undefined ? { replyBy: dto.replyBy ? parseDate(dto.replyBy) : null } : {}),
      },
    });
    await this.attachments.sync(user, 'materialApprovalId', id, dto.attachmentIds);
    await this.audit.log(user, 'MATERIAL_APPROVAL', id, 'UPDATED');
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    this.assertRaise(user);
    const r = await this.row(user, id);
    if (r.status !== 'DRAFT') throw new ConflictException('A request that went to the reviewer stays on record. Withdraw it instead.');
    await this.prisma.materialApproval.delete({ where: { id } });
    await this.audit.log(user, 'MATERIAL_APPROVAL', id, 'DELETED', `${r.marNo} ${r.material}, ${r.make}`);
    return { ok: true };
  }

  /** Send to the reviewer: R0 from a draft, or the next revision after revise-and-resubmit or a rejection. */
  async submit(user: RequestUser, id: string, dto: SubmitMaterialApprovalDto): Promise<MaterialApprovalDetailDto> {
    this.assertRaise(user);
    const r = await this.row(user, id);
    const today = todayIn();
    const last = r.revisions[0] ?? null;
    const problem = submitProblem(r.status, { submittedOn: dto.submittedOn, today, lastReviewedOn: dateOnly(last?.reviewedOn ?? null) });
    if (problem) throw new BadRequestException(problem);
    const revision = r.status === 'DRAFT' ? 0 : r.revision + 1;
    const done = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.materialApproval.updateMany({
        where: { id, status: r.status, revision: r.revision },
        data: {
          status: 'UNDER_REVIEW',
          revision,
          ...(dto.replyBy !== undefined ? { replyBy: dto.replyBy ? parseDate(dto.replyBy) : null } : {}),
          ...(r.status !== 'DRAFT' && dto.make ? { make: dto.make } : {}),
          ...(r.status !== 'DRAFT' && dto.model !== undefined ? { model: dto.model } : {}),
        },
      });
      if (!moved.count) return false;
      await tx.materialApprovalRevision.create({
        data: { organizationId: user.organizationId, approvalId: id, revision, submittedOn: parseDate(dto.submittedOn), submittedById: user.id, submitNote: dto.note ?? null },
      });
      return true;
    });
    if (!done) throw new ConflictException('Someone else changed this request. Reload it and try again.');
    await this.attachments.sync(user, 'materialApprovalId', id, dto.attachmentIds);
    await this.audit.log(user, 'MATERIAL_APPROVAL', id, r.status === 'DRAFT' ? 'SUBMITTED' : 'RESUBMITTED', revisionLabel(revision));
    return this.get(user, id);
  }

  /** The reviewer's outcome on the current revision, from their letter or mail. An approval lists the make. */
  async review(user: RequestUser, id: string, dto: ReviewMaterialApprovalDto): Promise<MaterialApprovalDetailDto> {
    this.assertRaise(user);
    const r = await this.row(user, id);
    const current = r.revisions.find((v) => v.revision === r.revision);
    const problem = reviewProblem(r.status, { outcome: dto.outcome, reviewedOn: dto.reviewedOn, submittedOn: dateOnly(current?.submittedOn ?? null) ?? dto.reviewedOn, comments: dto.comments, today: todayIn() });
    if (problem) throw new BadRequestException(problem);
    const done = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.materialApproval.updateMany({ where: { id, status: 'UNDER_REVIEW', revision: r.revision }, data: { status: statusAfter(dto.outcome) } });
      if (!moved.count) return false;
      await tx.materialApprovalRevision.update({
        where: { approvalId_revision: { approvalId: id, revision: r.revision } },
        data: { outcome: dto.outcome, reviewedOn: parseDate(dto.reviewedOn), reviewerName: dto.reviewerName ?? null, comments: dto.comments ?? null, reviewRef: dto.reviewRef ?? null, recordedById: user.id },
      });
      if (isApproval(dto.outcome))
        await tx.approvedMake.create({
          data: {
            organizationId: user.organizationId,
            projectId: r.projectId,
            material: r.material,
            itemId: r.itemId,
            make: r.make,
            model: r.model,
            source: 'APPROVAL',
            approvalId: id,
            note: dto.outcome === 'APPROVED_AS_NOTED' ? (dto.comments ?? null) : null,
            createdById: user.id,
          },
        });
      return true;
    });
    if (!done) throw new ConflictException('Someone else changed this request. Reload it and try again.');
    await this.audit.log(user, 'MATERIAL_APPROVAL', id, `REVIEWED_${dto.outcome}`, revisionLabel(r.revision));
    return this.get(user, id);
  }

  async withdraw(user: RequestUser, id: string, dto: WithdrawMaterialApprovalDto): Promise<MaterialApprovalDetailDto> {
    this.assertRaise(user);
    const r = await this.row(user, id);
    if (r.status !== 'UNDER_REVIEW' && !WITH_US.includes(r.status)) throw new ConflictException(r.status === 'DRAFT' ? 'A draft is deleted, not withdrawn.' : 'Only a request still in play is withdrawn.');
    await this.prisma.materialApproval.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    await this.audit.log(user, 'MATERIAL_APPROVAL', id, 'WITHDRAWN', dto.note);
    return this.get(user, id);
  }

  // Approved makes

  private makeDto(m: Prisma.ApprovedMakeGetPayload<{ include: typeof MAKE_INCLUDE }>): ApprovedMakeDto {
    return {
      id: m.id,
      projectId: m.projectId,
      projectCode: m.project.code,
      projectName: m.project.name,
      material: m.material,
      itemId: m.itemId,
      make: m.make,
      model: m.model,
      source: m.source,
      approvalId: m.approvalId,
      marNo: m.approval?.marNo ?? null,
      note: m.note,
      createdByName: m.createdBy.fullName,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async makes(user: RequestUser, q: ApprovedMakeQuery): Promise<ApprovedMakeDto[]> {
    this.assertView(user);
    const words = q.q?.trim();
    const rows = await this.prisma.approvedMake.findMany({
      where: {
        organizationId: user.organizationId,
        project: this.access.projectWhere(user),
        ...(q.projectId ? { projectId: q.projectId } : {}),
        ...(words ? { OR: [{ material: { contains: words, mode: 'insensitive' } }, { make: { contains: words, mode: 'insensitive' } }, { model: { contains: words, mode: 'insensitive' } }] } : {}),
      },
      include: MAKE_INCLUDE,
      orderBy: [{ project: { code: 'asc' } }, { material: 'asc' }, { make: 'asc' }],
      take: 1000,
    });
    return rows.map((m) => this.makeDto(m));
  }

  async addMake(user: RequestUser, dto: CreateApprovedMakeDto): Promise<ApprovedMakeDto> {
    if (!canManageApprovedMakes(user.roleKey)) throw new ForbiddenException('Your role does not keep the approved makes');
    await this.access.assertCanAccessProject(user, dto.projectId);
    await this.checkLinks(user, dto.projectId, { itemId: dto.itemId });
    const m = await this.prisma.approvedMake.create({
      data: { organizationId: user.organizationId, projectId: dto.projectId, material: dto.material, itemId: dto.itemId ?? null, make: dto.make, model: dto.model ?? null, source: 'CONTRACT', note: dto.note ?? null, createdById: user.id },
      include: MAKE_INCLUDE,
    });
    await this.audit.log(user, 'APPROVED_MAKE', m.id, 'CREATED', `${m.material}: ${m.make}`);
    return this.makeDto(m);
  }

  async removeMake(user: RequestUser, makeId: string) {
    if (!canManageApprovedMakes(user.roleKey)) throw new ForbiddenException('Your role does not keep the approved makes');
    const m = await this.prisma.approvedMake.findFirst({ where: { id: makeId, organizationId: user.organizationId, project: this.access.projectWhere(user) } });
    if (!m) throw new NotFoundException('Approved make not found');
    if (m.source === 'APPROVAL') throw new ConflictException('This make was approved on a request, which stays on record. Raise a request to change it.');
    await this.prisma.approvedMake.delete({ where: { id: makeId } });
    await this.audit.log(user, 'APPROVED_MAKE', makeId, 'DELETED', `${m.material}: ${m.make}`);
    return { ok: true };
  }

  /** Order lines checked against the project's approved makes; a make under review on a request is named. */
  async makeCheck(user: RequestUser, dto: MakeCheckDto): Promise<MakeWarningDto[]> {
    this.assertView(user);
    await this.access.assertCanAccessProject(user, dto.projectId);
    const org = user.organizationId;
    const [approved, pending] = await Promise.all([
      this.prisma.approvedMake.findMany({ where: { organizationId: org, projectId: dto.projectId }, select: { material: true, make: true, item: { select: { name: true } } } }),
      this.prisma.materialApproval.findMany({ where: { organizationId: org, projectId: dto.projectId, status: 'UNDER_REVIEW' }, select: { material: true, make: true, marNo: true } }),
    ]);
    // A make listed against an item counts for the item's name too.
    const listed = approved.flatMap((a) => [{ material: a.material, make: a.make }, ...(a.item && a.item.name !== a.material ? [{ material: a.item.name, make: a.make }] : [])]);
    const found = makeWarnings(dto.lines, listed, pending);
    return found;
  }

  /** For search: requests by number, material or make. */
  async search(user: RequestUser, q: string): Promise<MaterialApprovalDto[]> {
    return (await this.list(user, { q, status: 'all' })).items;
  }

}
