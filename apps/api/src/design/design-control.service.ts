import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  copyNumbersFor,
  copyState,
  designNotes,
  designRowHasWork,
  designTotals,
  disposeCopyProblem,
  isDesignApproved,
  isGuest,
  issueCopiesProblem,
  recallDays,
  recallLate,
  revisionImpact,
  type ControlledCopyDto,
  type ControlledCopyListDto,
  type CopyDisposal,
  type DesignDashboardDto,
  type DesignProjectRow,
  type RecentRevisionDto,
  type RevisionImpactDto,
  type RevisionImpactFacts,
  type RevisionStatus,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { todayIn } from '../notifications/time';
import { dateOnly, parseDate } from '../common/serialize';
import { ilike, pageArgs, searchWords } from '../common/paging';
import { DrawingScheduleService } from './drawing-schedule.service';
import { DesignSubmissionsService } from './design-submissions.service';
import { CopiesQuery, DisposeCopyDto, IssueCopiesDto } from './design-control.dto';

const copyInclude = {
  project: { select: { name: true } },
  document: { select: { docNo: true, title: true, currentRevisionId: true, currentRevision: { select: { revision: true, issuedOn: true } } } },
  revision: { select: { revision: true } },
  issuedBy: { select: { fullName: true } },
  transmittal: { select: { transmittalNo: true } },
} satisfies Prisma.ControlledCopyInclude;
type CopyRow = Prisma.ControlledCopyGetPayload<{ include: typeof copyInclude }>;

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Controlled copies, what a new revision changes and the design dashboard (ARCHITECTURE "Design and
 * drawings"). The rules are pure in `@erp/shared/design-control.ts`; the dashboard reads the schedule and the submissions
 * through their own services, so its figures are the pages' figures.
 */
@Injectable()
export class DesignControlService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private schedule: DrawingScheduleService,
    private submissions: DesignSubmissionsService,
  ) {}

  private assertView(user: RequestUser) {
    if (isGuest(user.roleKey)) throw new ForbiddenException('Design and drawings are for the company’s own staff');
  }

  private toDto(r: CopyRow, today: string): ControlledCopyDto {
    const disposedOn = dateOnly(r.disposedOn);
    const state = copyState({ revisionId: r.revisionId, disposedOn }, r.document.currentRevisionId);
    const supersededOn = state === 'TO_RECALL' && r.document.currentRevision ? dateOnly(r.document.currentRevision.issuedOn) : null;
    const days = recallDays(state, supersededOn, today);
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      documentId: r.documentId,
      docNo: r.document.docNo,
      title: r.document.title,
      revisionId: r.revisionId,
      revision: r.revision.revision,
      currentRevision: r.document.currentRevisionId && r.document.currentRevisionId !== r.revisionId ? (r.document.currentRevision?.revision ?? null) : null,
      copyNo: r.copyNo,
      holder: r.holder,
      issuedOn: dateOnly(r.issuedOn)!,
      issuedByName: r.issuedBy.fullName,
      transmittalId: r.transmittalId,
      transmittalNo: r.transmittal?.transmittalNo ?? null,
      state,
      supersededOn,
      recallDays: days,
      recallLate: recallLate(days),
      disposedOn,
      disposal: (r.disposal ?? null) as CopyDisposal | null,
      disposalNote: r.disposalNote,
    };
  }

  private async copyRows(user: RequestUser, where: Prisma.ControlledCopyWhereInput) {
    return this.prisma.controlledCopy.findMany({
      where: { ...this.access.submissionWhere(user), ...where },
      include: copyInclude,
      orderBy: [{ document: { docNo: 'asc' } }, { copyNo: 'asc' }, { issuedOn: 'desc' }],
      take: 5000,
    });
  }

  async copies(user: RequestUser, q: CopiesQuery): Promise<ControlledCopyListDto> {
    this.assertView(user);
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const today = todayIn();
    const words = searchWords(q.q);
    const rows = await this.copyRows(user, {
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.documentId ? { documentId: q.documentId } : {}),
      AND: words.map((w) => ({ OR: [{ holder: ilike(w) }, { document: { OR: [{ docNo: ilike(w) }, { title: ilike(w) }] } }] })),
    });
    const all = rows.map((r) => this.toDto(r, today));
    const out = all.filter((c) => c.state !== 'CLOSED');
    const counts = {
      inForce: out.filter((c) => c.state === 'IN_FORCE').length,
      toRecall: out.filter((c) => c.state === 'TO_RECALL').length,
      recallsLate: out.filter((c) => c.recallLate).length,
      holders: new Set(out.map((c) => c.holder.toLowerCase())).size,
    };
    const shown = all
      .filter((c) => (q.state === 'LATE' ? c.recallLate : q.state ? c.state === q.state : q.documentId ? true : c.state !== 'CLOSED'))
      // What is out of date on site first, longest out first.
      .sort((a, b) => Number(b.state === 'TO_RECALL') - Number(a.state === 'TO_RECALL') || (b.recallDays ?? 0) - (a.recallDays ?? 0));
    const args = pageArgs(q);
    return { items: shown.slice(args.skip, args.skip + args.take), total: shown.length, counts };
  }

  private async copyRow(user: RequestUser, id: string) {
    const row = await this.prisma.controlledCopy.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: copyInclude });
    if (!row) throw new NotFoundException('Controlled copy not found');
    return row;
  }

  /** One numbered copy of the document's current revision for each holder. */
  async issue(user: RequestUser, dto: IssueCopiesDto): Promise<ControlledCopyDto[]> {
    const doc = await this.prisma.document.findFirst({
      where: { id: dto.documentId, ...this.access.submissionWhere(user) },
      select: { id: true, projectId: true, docNo: true, currentRevision: { select: { id: true, revision: true, status: true, issuedOn: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.access.assertCanManageDocuments(user, doc.projectId);
    const rev = doc.currentRevision;
    if (!rev) throw new BadRequestException('Add the drawing’s revision to the register before issuing copies');
    if (dto.issuedOn > todayIn()) throw new BadRequestException('The day of issue cannot be after today');
    if (dto.issuedOn < dateOnly(rev.issuedOn)!) throw new BadRequestException(`Revision ${rev.revision} came in on ${dateOnly(rev.issuedOn)}; it cannot be issued before that`);
    if (dto.transmittalId && !(await this.prisma.transmittal.count({ where: { id: dto.transmittalId, projectId: doc.projectId } }))) throw new BadRequestException('Choose a transmittal of this project');
    const existing = await this.prisma.controlledCopy.findMany({ where: { documentId: doc.id }, select: { holder: true, copyNo: true, revisionId: true, disposedOn: true } });
    const problem = issueCopiesProblem({
      holders: dto.holders,
      status: rev.status as RevisionStatus,
      current: true,
      holdersInForce: existing.filter((e) => e.revisionId === rev.id && !e.disposedOn).map((e) => e.holder),
    });
    if (problem) throw new BadRequestException(problem);
    const numbered = copyNumbersFor(dto.holders.filter((h) => h.trim()), existing);
    // A number reused on this revision (a copy taken back and issued again) moves on to the next free one.
    const taken = new Set(existing.filter((e) => e.revisionId === rev.id).map((e) => e.copyNo));
    let spare = Math.max(0, ...existing.map((e) => e.copyNo), ...numbered.map((x) => x.copyNo)) + 1;
    const ids: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const c of numbered) {
        const copyNo = taken.has(c.copyNo) ? spare++ : c.copyNo;
        taken.add(copyNo);
        const row = await tx.controlledCopy.create({
          data: {
            organizationId: user.organizationId,
            projectId: doc.projectId,
            documentId: doc.id,
            revisionId: rev.id,
            copyNo,
            holder: c.holder,
            issuedOn: parseDate(dto.issuedOn),
            issuedById: user.id,
            transmittalId: dto.transmittalId ?? null,
          },
          select: { id: true },
        });
        ids.push(row.id);
      }
    });
    await this.audit.log(user, 'DOCUMENT', doc.id, 'COPIES_ISSUED', `${doc.docNo} ${rev.revision} to ${numbered.map((c) => c.holder).join(', ')}`);
    const today = todayIn();
    return (await this.copyRows(user, { id: { in: ids } })).map((r) => this.toDto(r, today));
  }

  /** The holder of a superseded copy gets the current revision under the same number. */
  async reissue(user: RequestUser, id: string, issuedOn: string): Promise<ControlledCopyDto[]> {
    const row = await this.copyRow(user, id);
    if (copyState({ revisionId: row.revisionId, disposedOn: dateOnly(row.disposedOn) }, row.document.currentRevisionId) !== 'TO_RECALL')
      throw new BadRequestException('This copy is of the current revision, or already taken back');
    return this.issue(user, { documentId: row.documentId, holders: [row.holder], issuedOn, transmittalId: null });
  }

  async dispose(user: RequestUser, id: string, dto: DisposeCopyDto): Promise<ControlledCopyDto> {
    const row = await this.copyRow(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    const problem = disposeCopyProblem({ issuedOn: dateOnly(row.issuedOn)!, disposedOn: dto.disposedOn, today: todayIn(), alreadyOn: dateOnly(row.disposedOn) });
    if (problem) throw new BadRequestException(problem);
    await this.prisma.controlledCopy.update({
      where: { id },
      data: { disposal: dto.disposal, disposedOn: parseDate(dto.disposedOn), disposalNote: dto.note ?? null, disposedById: user.id },
    });
    await this.audit.log(user, 'DOCUMENT', row.documentId, 'COPY_TAKEN_BACK', `${row.document.docNo} ${row.revision.revision} copy ${row.copyNo} from ${row.holder}: ${dto.disposal}`);
    return this.toDto(await this.copyRow(user, id), todayIn());
  }

  /** A copy issued by mistake: only while it is of the current revision and not yet taken back. */
  async remove(user: RequestUser, id: string) {
    const row = await this.copyRow(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    if (row.disposedOn || row.revisionId !== row.document.currentRevisionId) throw new BadRequestException('A copy of an earlier revision, or one taken back, stays on record');
    await this.prisma.controlledCopy.delete({ where: { id } });
    await this.audit.log(user, 'DOCUMENT', row.documentId, 'COPY_DELETED', `${row.document.docNo} ${row.revision.revision} copy ${row.copyNo} to ${row.holder}`);
    return { ok: true };
  }

  /** The facts `revisionImpact` reads, for many documents at once. */
  private async impactFacts(documentIds: string[]) {
    if (!documentIds.length) return new Map<string, RevisionImpactFacts & { revisionId: string | null; docNo: string }>();
    const [docs, copies, rounds, takeoffs, markups, rfis, needs, deliverables] = await Promise.all([
      this.prisma.document.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, docNo: true, currentRevisionId: true, revisions: { orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }], select: { id: true, revision: true, status: true } } },
      }),
      this.prisma.controlledCopy.findMany({ where: { documentId: { in: documentIds } }, select: { documentId: true, revisionId: true, holder: true, copyNo: true, disposedOn: true, revision: { select: { revision: true } } } }),
      this.prisma.designRoundItem.findMany({
        where: { revision: { documentId: { in: documentIds } } },
        select: { revisionId: true, revision: { select: { documentId: true, revision: true } }, round: { select: { revision: true, submission: { select: { id: true, submissionNo: true, status: true } } } } },
      }),
      this.prisma.drawingTakeoff.groupBy({ by: ['documentId', 'revisionId'], where: { documentId: { in: documentIds } }, _count: { _all: true } }),
      this.prisma.drawingMarkup.groupBy({ by: ['documentId', 'revisionId'], where: { documentId: { in: documentIds }, status: 'OPEN' }, _count: { _all: true } }),
      this.prisma.rfi.groupBy({ by: ['documentId'], where: { documentId: { in: documentIds }, status: { in: ['OPEN', 'ANSWERED'] } }, _count: { _all: true } }),
      this.prisma.drawingNeed.groupBy({ by: ['documentId'], where: { documentId: { in: documentIds } }, _count: { _all: true } }),
      this.prisma.engineeringDeliverable.groupBy({ by: ['documentId'], where: { documentId: { in: documentIds } }, _count: { _all: true } }),
    ]);
    const out = new Map<string, RevisionImpactFacts & { revisionId: string | null; docNo: string }>();
    for (const d of docs) {
      const cur = d.revisions.find((r) => r.id === d.currentRevisionId) ?? null;
      const previous = cur ? (d.revisions.find((r) => r.id !== cur.id) ?? null) : null;
      // Each submission's latest round that carried this document.
      const latest = new Map<string, (typeof rounds)[number]>();
      for (const r of rounds.filter((x) => x.revision.documentId === d.id)) {
        const seen = latest.get(r.round.submission.id);
        if (!seen || seen.round.revision < r.round.revision) latest.set(r.round.submission.id, r);
      }
      const earlier = [...latest.values()].filter((r) => r.revisionId !== d.currentRevisionId);
      const pick = (r: (typeof rounds)[number]) => ({ id: r.round.submission.id, submissionNo: r.round.submission.submissionNo, revision: r.revision.revision });
      out.set(d.id, {
        docNo: d.docNo,
        revisionId: cur?.id ?? null,
        revision: cur?.revision ?? '-',
        status: (cur?.status ?? 'FOR_INFORMATION') as RevisionStatus,
        previous: previous?.revision ?? null,
        copiesToRecall: copies
          .filter((c) => c.documentId === d.id && !c.disposedOn && c.revisionId !== d.currentRevisionId)
          .sort((a, b) => a.copyNo - b.copyNo)
          .map((c) => ({ holder: c.holder, copyNo: c.copyNo, revision: c.revision.revision })),
        copiesIssued: copies.filter((c) => c.documentId === d.id && c.revisionId === d.currentRevisionId && !c.disposedOn).length,
        approvedEarlier: earlier.filter((r) => isDesignApproved(r.round.submission.status as never)).map(pick),
        underReviewEarlier: earlier.filter((r) => r.round.submission.status === 'UNDER_REVIEW').map(pick),
        takeoffsEarlier: takeoffs.filter((t) => t.documentId === d.id && t.revisionId !== d.currentRevisionId).reduce((s, t) => s + t._count._all, 0),
        openMarkups: markups.filter((m) => m.documentId === d.id && m.revisionId !== d.currentRevisionId).reduce((s, m) => s + m._count._all, 0),
        openRfis: rfis.find((r) => r.documentId === d.id)?._count._all ?? 0,
        scheduleLines: needs.find((n) => n.documentId === d.id)?._count._all ?? 0,
        deliverables: deliverables.find((x) => x.documentId === d.id)?._count._all ?? 0,
      });
    }
    return out;
  }

  /** What the document's current revision changes, with its controlled copies. */
  async impact(user: RequestUser, documentId: string): Promise<RevisionImpactDto> {
    this.assertView(user);
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, ...this.access.submissionWhere(user) }, select: { id: true, docNo: true } });
    if (!doc) throw new NotFoundException('Document not found');
    const facts = (await this.impactFacts([doc.id])).get(doc.id)!;
    const today = todayIn();
    const copies = (await this.copyRows(user, { documentId: doc.id })).map((r) => this.toDto(r, today));
    return {
      documentId: doc.id,
      docNo: doc.docNo,
      revisionId: facts.revisionId,
      revision: facts.revisionId ? facts.revision : null,
      previous: facts.previous,
      items: facts.revisionId ? revisionImpact(facts) : [],
      copies,
    };
  }

  /** Superseded copies still out, for the watch list and My work. */
  async copiesToRecall(user: RequestUser): Promise<ControlledCopyDto[]> {
    const today = todayIn();
    const rows = await this.copyRows(user, { disposedOn: null });
    return rows.map((r) => this.toDto(r, today)).filter((c) => c.state === 'TO_RECALL');
  }

  /** Every project's drawings, submissions, copies, as-builts and RFIs, and the revisions of the last 30 days with what they change. */
  async dashboard(user: RequestUser, projectId?: string): Promise<DesignDashboardDto> {
    this.assertView(user);
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const today = todayIn();
    const all = { page: 1, pageSize: 100_000, ...(projectId ? { projectId } : {}) };
    const [projects, needs, subs, copies, asBuilt, rfis, recentRevs] = await Promise.all([
      this.prisma.project.findMany({
        where: { ...this.access.projectWhere(user), ...(projectId ? { id: projectId } : {}), type: { notIn: ['STORE', 'PLANT'] } },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.schedule.list(user, all),
      this.submissions.list(user, all),
      this.copyRows(user, { disposedOn: null, ...(projectId ? { projectId } : {}) }),
      this.schedule.asBuiltDue(user, projectId ? { projectId } : {}),
      this.prisma.rfi.groupBy({ by: ['projectId'], where: { ...this.access.submissionWhere(user), ...(projectId ? { projectId } : {}), status: { in: ['OPEN', 'ANSWERED'] } }, _count: { _all: true } }),
      this.prisma.documentRevision.findMany({
        where: { issuedOn: { gte: parseDate(plusDays(today, -30)) }, document: { ...this.access.submissionWhere(user), ...(projectId ? { projectId } : {}) } },
        select: { id: true, revision: true, status: true, issuedOn: true, document: { select: { id: true, docNo: true, title: true, projectId: true, currentRevisionId: true, project: { select: { name: true } } } } },
        orderBy: { issuedOn: 'desc' },
        take: 300,
      }),
    ]);
    const copyDtos = copies.map((r) => this.toDto(r, today));
    const rows: DesignProjectRow[] = projects.map((p) => {
      const n = needs.items.filter((x) => x.projectId === p.id);
      const s = subs.items.filter((x) => x.projectId === p.id);
      const c = copyDtos.filter((x) => x.projectId === p.id && x.state === 'TO_RECALL');
      return {
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        drawingsAwaited: n.filter((x) => x.state === 'AWAITED' || x.state === 'RECEIVED').length,
        drawingsLate: n.filter((x) => x.overdue).length,
        underReview: s.filter((x) => x.status === 'UNDER_REVIEW').length,
        reviewsLate: s.filter((x) => x.daysLate !== null).length,
        withUs: s.filter((x) => x.status === 'REVISE_RESUBMIT' || x.status === 'REJECTED').length,
        commentsToAnswer: s.reduce((t, x) => t + x.openComments, 0),
        copiesToRecall: c.length,
        recallsLate: c.filter((x) => x.recallLate).length,
        asBuiltDue: asBuilt.filter((x) => x.projectId === p.id).length,
        rfisOpen: rfis.find((x) => x.projectId === p.id)?._count._all ?? 0,
        revisionsRecent: recentRevs.filter((r) => r.document.projectId === p.id).length,
      };
    });
    const shown = rows.filter((r) => projectId || designRowHasWork(r));
    // The current revisions of the last 30 days, each with what it changes; the newest first.
    const current = recentRevs.filter((r) => r.document.currentRevisionId === r.id);
    const facts = await this.impactFacts(current.map((r) => r.document.id));
    const recent: RecentRevisionDto[] = current.slice(0, 50).map((r) => {
      const f = facts.get(r.document.id)!;
      return {
        documentId: r.document.id,
        docNo: r.document.docNo,
        title: r.document.title,
        projectId: r.document.projectId,
        projectName: r.document.project.name,
        revision: r.revision,
        status: r.status as RevisionStatus,
        issuedOn: dateOnly(r.issuedOn)!,
        previous: f.previous,
        items: revisionImpact(f),
      };
    });
    return {
      date: today,
      totals: designTotals(shown),
      projects: shown
        .map((r) => ({ ...r, notes: designNotes(r) }))
        // What holds up site first.
        .sort((a, b) => b.drawingsLate + b.recallsLate - (a.drawingsLate + a.recallsLate) || b.reviewsLate - a.reviewsLate || a.projectName.localeCompare(b.projectName)),
      recent,
    };
  }

}
