import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LABOUR_CHALLAN_KIND_LABELS,
  LABOUR_PAPER_KIND_LABELS,
  canKeepLabourCompliance,
  canReleaseLabourHold,
  canViewLabourCompliance,
  challanDue,
  labourChallanProblem,
  labourHoldWords,
  labourPaperProblem,
  labourProblems,
  monthWords,
  paperValidOn,
  type LabourChallanDto,
  type LabourHoldDto,
  type LabourPaperDto,
  type LabourPaperFact,
  type LabourRegisterDto,
  type LabourStandingDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { todayIn } from '../notifications/time';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { CreateLabourChallanDto, CreateLabourPaperDto, LabourRegisterQuery, UpdateLabourChallanDto, UpdateLabourPaperDto } from './labour-compliance.dto';

const paperInclude = {
  vendor: { select: { name: true } },
  project: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.LabourPaperInclude;
const challanInclude = {
  vendor: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.LabourChallanInclude;
type PaperRow = Prisma.LabourPaperGetPayload<{ include: typeof paperInclude }>;
type ChallanRow = Prisma.LabourChallanGetPayload<{ include: typeof challanInclude }>;

const day = (v: string | null | undefined) => (v === null || v === undefined ? v : parseDate(v));
/** The first day of the month `n` months before `today`'s. */
function monthsBack(today: string, n: number): string {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

/** A contractor's head counts over a period: most men on one day per site, per month across sites, and last day seen per site. */
interface HeadCounts {
  sitePeak: Map<string, number>;
  lastSeen: Map<string, string>;
  months: { month: string; peak: number }[];
}

/**
 * Contract labour compliance (ARCHITECTURE "Contract labour compliance"): contractors' labour licences, PF and ESI codes,
 * workmen's compensation policies, BOCW registrations and monthly challans, judged against the men their head counts show
 * by `labourProblems`. A subcontractor bill's payment is held while something is missing (`assertPayable`, called by
 * payables), unless admin or management released it with a reason.
 */
@Injectable()
export class LabourComplianceService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
  ) {}

  private assertView(user: RequestUser) {
    if (!canViewLabourCompliance(user.roleKey)) throw new ForbiddenException('Your role cannot see contractors’ labour papers');
  }
  private assertKeep(user: RequestUser) {
    if (!canKeepLabourCompliance(user.roleKey)) throw new ForbiddenException('Your role cannot record contractors’ labour papers');
  }

  private paperDto(r: PaperRow, today: string): LabourPaperDto {
    const validFrom = dateOnly(r.validFrom);
    const validTo = dateOnly(r.validTo);
    return {
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      kind: r.kind,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      number: r.number,
      validFrom,
      validTo,
      workers: r.workers,
      note: r.note,
      current: paperValidOn({ validFrom, validTo }, today),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
    };
  }

  private challanDto(r: ChallanRow): LabourChallanDto {
    const paidOn = dateOnly(r.paidOn)!;
    return {
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      kind: r.kind,
      month: r.month,
      amount: money(r.amount)!,
      workers: r.workers,
      paidOn,
      reference: r.reference,
      note: r.note,
      late: paidOn > challanDue(r.month),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
    };
  }

  /** Head counts of these contractors on every site of the company from `from` to `to`. */
  private async headCounts(organizationId: string, vendorIds: string[], from: string, to: string): Promise<Map<string, HeadCounts>> {
    const out = new Map<string, HeadCounts>();
    if (!vendorIds.length) return out;
    const lines = await this.prisma.attendanceLine.findMany({
      where: { vendorId: { in: vendorIds }, count: { gt: 0 }, sheet: { organizationId, date: { gte: parseDate(from), lte: parseDate(to) } } },
      select: { vendorId: true, count: true, sheet: { select: { projectId: true, date: true } } },
    });
    const perSiteDay = new Map<string, number>();
    const perDay = new Map<string, number>();
    for (const l of lines) {
      const d = dateOnly(l.sheet.date)!;
      const sk = `${l.vendorId}|${l.sheet.projectId}|${d}`;
      perSiteDay.set(sk, (perSiteDay.get(sk) ?? 0) + l.count);
      const dk = `${l.vendorId}|${d}`;
      perDay.set(dk, (perDay.get(dk) ?? 0) + l.count);
    }
    const of = (v: string) => {
      let h = out.get(v);
      if (!h) out.set(v, (h = { sitePeak: new Map(), lastSeen: new Map(), months: [] }));
      return h;
    };
    for (const [k, n] of perSiteDay) {
      const [v, p, d] = k.split('|');
      const h = of(v);
      h.sitePeak.set(p, Math.max(h.sitePeak.get(p) ?? 0, n));
      if ((h.lastSeen.get(p) ?? '') < d) h.lastSeen.set(p, d);
    }
    const monthPeak = new Map<string, Map<string, number>>();
    for (const [k, n] of perDay) {
      const [v, d] = k.split('|');
      const m = monthPeak.get(v) ?? new Map<string, number>();
      m.set(d.slice(0, 7), Math.max(m.get(d.slice(0, 7)) ?? 0, n));
      monthPeak.set(v, m);
    }
    for (const [v, m] of monthPeak) of(v).months = [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, peak]) => ({ month, peak }));
    return out;
  }

  private async factsOf(organizationId: string, vendorIds: string[]) {
    const [papers, challans] = await Promise.all([
      this.prisma.labourPaper.findMany({ where: { organizationId, vendorId: { in: vendorIds } }, select: { vendorId: true, kind: true, projectId: true, number: true, validFrom: true, validTo: true, workers: true } }),
      this.prisma.labourChallan.findMany({ where: { organizationId, vendorId: { in: vendorIds } }, select: { vendorId: true, kind: true, month: true } }),
    ]);
    const papersOf = (v: string): LabourPaperFact[] =>
      papers.filter((p) => p.vendorId === v).map((p) => ({ kind: p.kind, projectId: p.projectId, number: p.number, validFrom: dateOnly(p.validFrom), validTo: dateOnly(p.validTo), workers: p.workers }));
    const challansOf = (v: string) => challans.filter((c) => c.vendorId === v).map((c) => ({ kind: c.kind, month: c.month }));
    return { papersOf, challansOf };
  }

  /** Every contractor with men on a site the user sees in the last `months` months, judged as of today, with the papers and challans. */
  async register(user: RequestUser, q: LabourRegisterQuery): Promise<LabourRegisterDto> {
    this.assertView(user);
    const org = user.organizationId;
    const today = todayIn();
    const from = monthsBack(today, (q.months ?? 6) - 1);
    const sites = await this.prisma.project.findMany({ where: { AND: [this.access.projectWhere(user), q.projectId ? { id: q.projectId } : {}] }, select: { id: true, name: true } });
    const siteName = new Map(sites.map((s) => [s.id, s.name]));
    const seen = await this.prisma.attendanceLine.findMany({
      where: { vendorId: q.vendorId ? q.vendorId : { not: null }, count: { gt: 0 }, sheet: { organizationId: org, projectId: { in: sites.map((s) => s.id) }, date: { gte: parseDate(from), lte: parseDate(today) } } },
      select: { vendorId: true },
      distinct: ['vendorId'],
    });
    const vendorIds = seen.map((s) => s.vendorId!);
    const [counts, facts, vendors] = await Promise.all([
      this.headCounts(org, vendorIds, from, today),
      this.factsOf(org, vendorIds),
      this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }),
    ]);
    const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
    const standing: LabourStandingDto[] = [];
    for (const [vendorId, h] of counts) {
      for (const [projectId, sitePeak] of h.sitePeak) {
        if (!siteName.has(projectId)) continue;
        const problems = labourProblems({ projectId, asOf: today, sitePeak, months: h.months, papers: facts.papersOf(vendorId), challans: facts.challansOf(vendorId) });
        standing.push({ vendorId, vendorName: vendorName.get(vendorId) ?? '', projectId, projectName: siteName.get(projectId)!, sitePeak, lastSeen: h.lastSeen.get(projectId)!, problems });
      }
    }
    standing.sort((a, b) => b.problems.length - a.problems.length || a.vendorName.localeCompare(b.vendorName) || a.projectName.localeCompare(b.projectName));

    const vendorWhere = q.vendorId ? { vendorId: q.vendorId } : {};
    const [papers, challans] = await Promise.all([
      this.prisma.labourPaper.findMany({ where: { organizationId: org, ...vendorWhere }, include: paperInclude, orderBy: [{ vendor: { name: 'asc' } }, { kind: 'asc' }, { validTo: 'desc' }], take: 500 }),
      this.prisma.labourChallan.findMany({ where: { organizationId: org, ...vendorWhere, month: { gte: from.slice(0, 7) } }, include: challanInclude, orderBy: [{ month: 'desc' }, { vendor: { name: 'asc' } }, { kind: 'asc' }], take: 1000 }),
    ]);
    return { from, standing, papers: papers.map((p) => this.paperDto(p, today)), challans: challans.map((c) => this.challanDto(c)) };
  }

  /** What a subcontractor bill's contractor has not shown as of the bill's date: men from the order's start to the bill. */
  private async billProblems(organizationId: string, billId: string) {
    const b = await this.prisma.subcontractBill.findFirst({
      where: { id: billId, organizationId },
      select: {
        projectId: true,
        billDate: true,
        labourHoldReleasedAt: true,
        labourHoldNote: true,
        labourHoldReleasedBy: { select: { fullName: true } },
        workOrder: { select: { vendorId: true, woDate: true, startDate: true } },
      },
    });
    if (!b) throw new NotFoundException('Bill not found');
    const vendorId = b.workOrder.vendorId;
    const asOf = dateOnly(b.billDate)!;
    const start = [b.workOrder.woDate, b.workOrder.startDate].filter((d): d is Date => !!d).map((d) => dateOnly(d)!).sort()[0] ?? asOf;
    const from = start < asOf ? start : asOf;
    const [counts, facts] = await Promise.all([this.headCounts(organizationId, [vendorId], from, asOf), this.factsOf(organizationId, [vendorId])]);
    const h = counts.get(vendorId);
    const problems = h ? labourProblems({ projectId: b.projectId, asOf, sitePeak: h.sitePeak.get(b.projectId) ?? 0, months: h.months, papers: facts.papersOf(vendorId), challans: facts.challansOf(vendorId) }) : [];
    return { b, problems };
  }

  /** A bill's hold, for its record and its checks. */
  async forBill(organizationId: string, billId: string): Promise<LabourHoldDto> {
    const { b, problems } = await this.billProblems(organizationId, billId);
    return { problems, releasedAt: b.labourHoldReleasedAt ? iso(b.labourHoldReleasedAt) : null, releasedByName: b.labourHoldReleasedBy?.fullName ?? null, note: b.labourHoldNote };
  }

  /** Refuses a payment on a subcontractor bill whose contractor's labour papers are missing, unless the hold was released. */
  async assertPayable(organizationId: string, billId: string) {
    const hold = await this.forBill(organizationId, billId);
    if (hold.releasedAt || !hold.problems.length) return;
    throw new ConflictException(`Payment held for labour papers: ${labourHoldWords(hold.problems)}. Record them in Labour compliance, or ask management to release the hold on the bill.`);
  }

  /** Pay this bill although papers are missing: admin or management, with the reason. */
  async releaseHold(user: RequestUser, billId: string, note: string): Promise<LabourHoldDto> {
    if (!canReleaseLabourHold(user.roleKey)) throw new ForbiddenException('Only admin and management can release a labour hold');
    const hold = await this.forBill(user.organizationId, billId);
    const bill = await this.prisma.subcontractBill.findUniqueOrThrow({ where: { id: billId }, select: { projectId: true, status: true } });
    await this.access.assertCanAccessProject(user, bill.projectId);
    if (bill.status !== 'APPROVED') throw new ConflictException('Release the hold once the bill is approved');
    if (!hold.problems.length) throw new ConflictException('Nothing is missing on this bill; there is no hold to release');
    if (hold.releasedAt) throw new ConflictException(`The hold was released by ${hold.releasedByName ?? 'someone'} already`);
    await this.prisma.subcontractBill.update({ where: { id: billId }, data: { labourHoldReleasedAt: new Date(), labourHoldReleasedById: user.id, labourHoldNote: note } });
    await this.audit.log(user, 'SUBCONTRACT_BILL', billId, 'LABOUR_HOLD_RELEASED', `${labourHoldWords(hold.problems)}. ${note}`);
    return this.forBill(user.organizationId, billId);
  }

  private async assertVendor(organizationId: string, vendorId: string) {
    const v = await this.prisma.vendor.findFirst({ where: { id: vendorId, organizationId }, select: { id: true } });
    if (!v) throw new NotFoundException('Contractor not found');
  }
  private async assertProject(user: RequestUser, projectId: string | null | undefined) {
    if (!projectId) return;
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { id: true } });
    if (!p) throw new NotFoundException('Site not found');
    await this.access.assertCanAccessProject(user, projectId);
  }

  async createPaper(user: RequestUser, dto: CreateLabourPaperDto): Promise<LabourPaperDto> {
    this.assertKeep(user);
    await this.assertVendor(user.organizationId, dto.vendorId);
    await this.assertProject(user, dto.projectId);
    const p = { kind: dto.kind, projectId: dto.projectId ?? null, number: dto.number, validFrom: dto.validFrom ?? null, validTo: dto.validTo ?? null, workers: dto.workers ?? null };
    const problem = labourPaperProblem(p);
    if (problem) throw new BadRequestException(problem);
    const r = await this.prisma.labourPaper.create({
      data: { organizationId: user.organizationId, vendorId: dto.vendorId, kind: p.kind, projectId: p.projectId, number: p.number, validFrom: day(p.validFrom), validTo: day(p.validTo), workers: p.workers, note: dto.note || null, createdById: user.id },
    });
    await this.attachments.link(user, 'labourPaperId', r.id, dto.attachmentIds);
    await this.audit.log(user, 'LABOUR_PAPER', r.id, 'CREATED', `${LABOUR_PAPER_KIND_LABELS[p.kind]} ${p.number}`);
    return this.paperDto(await this.prisma.labourPaper.findUniqueOrThrow({ where: { id: r.id }, include: paperInclude }), todayIn());
  }

  async updatePaper(user: RequestUser, id: string, dto: UpdateLabourPaperDto): Promise<LabourPaperDto> {
    this.assertKeep(user);
    const cur = await this.prisma.labourPaper.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!cur) throw new NotFoundException('Paper not found');
    if (dto.projectId !== undefined) await this.assertProject(user, dto.projectId);
    const p = {
      kind: cur.kind,
      projectId: dto.projectId !== undefined ? dto.projectId : cur.projectId,
      number: dto.number ?? cur.number,
      validFrom: dto.validFrom !== undefined ? dto.validFrom : dateOnly(cur.validFrom),
      validTo: dto.validTo !== undefined ? dto.validTo : dateOnly(cur.validTo),
      workers: dto.workers !== undefined ? dto.workers : cur.workers,
    };
    const problem = labourPaperProblem(p);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.labourPaper.update({
      where: { id },
      data: { projectId: p.projectId, number: p.number, validFrom: day(p.validFrom), validTo: day(p.validTo), workers: p.workers, ...(dto.note !== undefined ? { note: dto.note || null } : {}) },
    });
    if (dto.attachmentIds) await this.attachments.sync(user, 'labourPaperId', id, dto.attachmentIds);
    await this.audit.log(user, 'LABOUR_PAPER', id, 'UPDATED', null);
    return this.paperDto(await this.prisma.labourPaper.findUniqueOrThrow({ where: { id }, include: paperInclude }), todayIn());
  }

  async removePaper(user: RequestUser, id: string) {
    this.assertKeep(user);
    const cur = await this.prisma.labourPaper.findFirst({ where: { id, organizationId: user.organizationId }, select: { kind: true, number: true } });
    if (!cur) throw new NotFoundException('Paper not found');
    await this.prisma.labourPaper.delete({ where: { id } });
    await this.audit.log(user, 'LABOUR_PAPER', id, 'DELETED', `${LABOUR_PAPER_KIND_LABELS[cur.kind]} ${cur.number}`);
    return { ok: true };
  }

  async createChallan(user: RequestUser, dto: CreateLabourChallanDto): Promise<LabourChallanDto> {
    this.assertKeep(user);
    await this.assertVendor(user.organizationId, dto.vendorId);
    const problem = labourChallanProblem({ month: dto.month, paidOn: dto.paidOn, amount: Number(dto.amount), reference: dto.reference }, todayIn());
    if (problem) throw new BadRequestException(problem);
    const clash = await this.prisma.labourChallan.findFirst({ where: { organizationId: user.organizationId, vendorId: dto.vendorId, kind: dto.kind, month: dto.month }, select: { id: true } });
    if (clash) throw new ConflictException(`A ${LABOUR_CHALLAN_KIND_LABELS[dto.kind]} for ${monthWords(dto.month)} is already recorded for this contractor; open it to correct it`);
    const r = await this.prisma.labourChallan.create({
      data: {
        organizationId: user.organizationId,
        vendorId: dto.vendorId,
        kind: dto.kind,
        month: dto.month,
        amount: new Prisma.Decimal(dto.amount),
        workers: dto.workers ?? null,
        paidOn: parseDate(dto.paidOn),
        reference: dto.reference,
        note: dto.note || null,
        createdById: user.id,
      },
    });
    await this.attachments.link(user, 'labourChallanId', r.id, dto.attachmentIds);
    await this.audit.log(user, 'LABOUR_CHALLAN', r.id, 'CREATED', `${LABOUR_CHALLAN_KIND_LABELS[dto.kind]} ${monthWords(dto.month)} ${dto.reference}`);
    return this.challanDto(await this.prisma.labourChallan.findUniqueOrThrow({ where: { id: r.id }, include: challanInclude }));
  }

  async updateChallan(user: RequestUser, id: string, dto: UpdateLabourChallanDto): Promise<LabourChallanDto> {
    this.assertKeep(user);
    const cur = await this.prisma.labourChallan.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!cur) throw new NotFoundException('Challan not found');
    const next = { month: cur.month, paidOn: dto.paidOn ?? dateOnly(cur.paidOn)!, amount: Number(dto.amount ?? cur.amount), reference: dto.reference ?? cur.reference };
    const problem = labourChallanProblem(next, todayIn());
    if (problem) throw new BadRequestException(problem);
    await this.prisma.labourChallan.update({
      where: { id },
      data: {
        paidOn: parseDate(next.paidOn),
        amount: new Prisma.Decimal(String(next.amount)),
        reference: next.reference,
        ...(dto.workers !== undefined ? { workers: dto.workers } : {}),
        ...(dto.note !== undefined ? { note: dto.note || null } : {}),
      },
    });
    if (dto.attachmentIds) await this.attachments.sync(user, 'labourChallanId', id, dto.attachmentIds);
    await this.audit.log(user, 'LABOUR_CHALLAN', id, 'UPDATED', null);
    return this.challanDto(await this.prisma.labourChallan.findUniqueOrThrow({ where: { id }, include: challanInclude }));
  }

  async removeChallan(user: RequestUser, id: string) {
    this.assertKeep(user);
    const cur = await this.prisma.labourChallan.findFirst({ where: { id, organizationId: user.organizationId }, select: { kind: true, month: true, reference: true } });
    if (!cur) throw new NotFoundException('Challan not found');
    await this.prisma.labourChallan.delete({ where: { id } });
    await this.audit.log(user, 'LABOUR_CHALLAN', id, 'DELETED', `${LABOUR_CHALLAN_KIND_LABELS[cur.kind]} ${monthWords(cur.month)} ${cur.reference}`);
    return { ok: true };
  }
}

