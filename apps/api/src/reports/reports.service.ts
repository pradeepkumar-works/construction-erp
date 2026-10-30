import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MEDIUM_RISK_SCORE, type ProgressReportDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AttachmentsService } from '../common/attachments.service';
import { physicalProgress } from '../common/progress';
import { dateOnly, dec, money, parseDate, pct } from '../common/serialize';
import { ProgressReportQuery } from './reports.dto';

const Dec = Prisma.Decimal;
type D = Prisma.Decimal;
const ZERO = new Dec(0);
const DAY = 86_400_000;
const MAX_DAYS = 92;
const MAX_PHOTOS = 8;
const sum = <T>(rows: T[], f: (r: T) => D) => rows.reduce((s, r) => s.plus(f(r)), ZERO);

/** Weekly / monthly progress report for one project, from approved data (plus attendance and the store register). */
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private attachments: AttachmentsService,
  ) {}

  async progress(user: RequestUser, q: ProgressReportQuery): Promise<ProgressReportDto> {
    await this.access.assertCanAccessProject(user, q.projectId);
    const from = parseDate(q.from);
    const to = parseDate(q.to);
    if (from > to) throw new BadRequestException('The period starts after it ends');
    const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
    if (days > MAX_DAYS) throw new BadRequestException(`A report covers at most ${MAX_DAYS} days`);
    const projectId = q.projectId;
    const inPeriod = { gte: from, lte: to };
    const nextEnd = new Date(to.getTime() + days * DAY);

    const [project, org, activities, boqItems, sheets, attendance, logs, txns, dprs, photos, register, elements] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { projectManager: { select: { fullName: true } } } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { name: true } }),
      this.prisma.activity.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { boqItem: { select: { id: true, rate: true } }, progressEntries: { where: { status: 'APPROVED', date: { lte: to } }, select: { date: true, quantity: true } } },
      }),
      this.prisma.boqItem.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }] }),
      this.prisma.measurementSheet.findMany({ where: { projectId, status: 'APPROVED', date: { lte: to } }, select: { boqItemId: true, date: true, totalQty: true } }),
      this.prisma.attendanceLine.findMany({ where: { sheet: { projectId, date: inPeriod } }, select: { category: true, count: true, sheet: { select: { date: true } } } }),
      this.prisma.machineryLog.findMany({
        where: { projectId, status: 'APPROVED', date: inPeriod },
        select: { hoursWorked: true, idleHours: true, breakdownHours: true, equipment: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.stockTxn.findMany({ where: { projectId, date: inPeriod, type: { in: ['RECEIPT', 'ISSUE'] } }, select: { type: true, quantity: true, item: { select: { id: true, name: true, unit: true } } } }),
      this.prisma.dailyReport.findMany({ where: { projectId, date: inPeriod }, orderBy: { date: 'asc' }, select: { date: true, status: true, weather: true, issues: true, safetyObservations: true, nextDayPlan: true } }),
      this.prisma.attachment.findMany({
        where: { mimeType: { startsWith: 'image/' }, progressEntry: { projectId, status: 'APPROVED', date: inPeriod } },
        orderBy: { createdAt: 'desc' },
        take: MAX_PHOTOS,
        omit: { data: true },
        include: { progressEntry: { select: { date: true, activity: { select: { name: true } } } } },
      }),
      this.prisma.risk.findMany({
        where: {
          projectId,
          OR: [
            { kind: 'DELAY', delayStart: { lte: to }, OR: [{ delayEnd: null }, { delayEnd: { gte: from } }] },
            { kind: 'RISK', score: { gte: MEDIUM_RISK_SCORE }, createdAt: { lt: new Date(to.getTime() + 86_400_000) }, OR: [{ closedAt: null }, { closedAt: { gt: to } }] },
          ],
        },
        orderBy: [{ score: 'desc' }, { riskNo: 'asc' }],
        include: { activity: { select: { name: true } }, owner: { select: { fullName: true } } },
      }),
      this.prisma.workElement.findMany({ where: { projectId }, select: { id: true, parentId: true, weightPct: true } }),
    ]);

    const todayUtc = parseDate(new Date().toISOString().slice(0, 10));
    // Activities: this period, cumulative, % and delay at the end of the period.
    const activityRows = activities.map((a) => {
      const cumulative = sum(a.progressEntries, (e) => e.quantity);
      const period = sum(
        a.progressEntries.filter((e) => e.date >= from),
        (e) => e.quantity,
      );
      const before = cumulative.minus(period);
      const p = pct(cumulative, a.plannedQty);
      return { a, cumulative, period, before, pct: p };
    });
    const physical = {
      atStartPct: physicalProgress(activityRows.map((r) => ({ ...r.a, rate: r.a.boqItem?.rate ?? null, executed: r.before })), elements),
      atEndPct: physicalProgress(activityRows.map((r) => ({ ...r.a, rate: r.a.boqItem?.rate ?? null, executed: r.cumulative })), elements),
    };

    // BOQ: executed (approved progress through linked activities) and measured, valued at the BOQ rate.
    const boqRows = boqItems.map((b) => {
      const linked = activityRows.filter((r) => r.a.boqItem?.id === b.id);
      const periodQty = sum(linked, (r) => r.period);
      const cumulativeQty = sum(linked, (r) => r.cumulative);
      const mb = sheets.filter((s) => s.boqItemId === b.id);
      const measuredPeriodQty = sum(
        mb.filter((s) => s.date >= from),
        (s) => s.totalQty,
      );
      const measuredCumulativeQty = sum(mb, (s) => s.totalQty);
      return { b, periodQty, cumulativeQty, measuredPeriodQty, measuredCumulativeQty };
    });
    const periodValue = sum(boqRows, (r) => r.periodQty.mul(r.b.rate));
    const cumulativeValue = sum(boqRows, (r) => r.cumulativeQty.mul(r.b.rate));

    // Manpower from attendance.
    const attendanceDays = new Set(attendance.map((l) => l.sheet.date.getTime())).size;
    const trades = new Map<string, number>();
    for (const l of attendance) trades.set(l.category, (trades.get(l.category) ?? 0) + l.count);

    const machines = new Map<string, { code: string; name: string; days: number; hours: D; idle: D; down: D }>();
    for (const l of logs) {
      const m = machines.get(l.equipment.id) ?? { code: l.equipment.code, name: l.equipment.name, days: 0, hours: ZERO, idle: ZERO, down: ZERO };
      machines.set(l.equipment.id, { ...m, days: m.days + 1, hours: m.hours.plus(l.hoursWorked), idle: m.idle.plus(l.idleHours), down: m.down.plus(l.breakdownHours) });
    }

    const materials = new Map<string, { name: string; unit: string; received: D; issued: D }>();
    for (const t of txns) {
      const m = materials.get(t.item.id) ?? { name: t.item.name, unit: t.item.unit, received: ZERO, issued: ZERO };
      if (t.type === 'RECEIPT') m.received = m.received.plus(t.quantity);
      else m.issued = m.issued.plus(t.quantity.abs());
      materials.set(t.item.id, m);
    }

    const approvedDprs = dprs.filter((d) => d.status === 'APPROVED');
    const notes = (f: (d: (typeof dprs)[number]) => string | null) =>
      approvedDprs.filter((d) => (f(d) ?? '').trim()).map((d) => ({ date: dateOnly(d.date)!, text: f(d)!.trim() }));

    const start = project.startDate;
    const end = project.endDate;
    const timeElapsedPct = start && end && end > start ? Math.round(Math.min(100, Math.max(0, ((to.getTime() - start.getTime() + DAY) / (end.getTime() - start.getTime() + DAY)) * 100)) * 10) / 10 : null;
    const contract = project.contractValue;
    // A Monday-to-Sunday week carries the summary paragraph written overnight for it (AI item 74), when there is one.
    const week = days === 7 && from.getUTCDay() === 1 ? await this.prisma.aiBrief.findUnique({ where: { organizationId_key: { organizationId: user.organizationId, key: `WEEK:${projectId}:${q.from}` } } }) : null;
    const narrative = week ? { text: (week.lines as { text: string }[]).map((l) => l.text).join(' '), writtenAt: week.createdAt.toISOString(), byAssistant: week.byAssistant } : null;

    return {
      narrative,
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        type: project.type,
        clientName: project.clientName,
        consultantName: project.consultantName,
        workOrderNo: project.workOrderNo,
        location: project.location,
        startDate: dateOnly(project.startDate),
        endDate: dateOnly(project.endDate),
        contractValue: money(contract),
        projectManagerName: project.projectManager?.fullName ?? null,
      },
      organizationName: org.name,
      from: q.from,
      to: q.to,
      generatedAt: new Date().toISOString(),
      physical,
      timeElapsedPct,
      financial: {
        periodValue: money(periodValue)!,
        cumulativeValue: money(cumulativeValue)!,
        contractPct: contract && contract.gt(0) ? Math.round(cumulativeValue.div(contract).mul(1000).toNumber()) / 10 : null,
        measuredPeriodValue: money(sum(boqRows, (r) => r.measuredPeriodQty.mul(r.b.rate)))!,
        measuredCumulativeValue: money(sum(boqRows, (r) => r.measuredCumulativeQty.mul(r.b.rate)))!,
      },
      activities: activityRows.map((r) => ({
        id: r.a.id,
        name: r.a.name,
        unit: r.a.unit,
        plannedQty: dec(r.a.plannedQty)!,
        periodQty: dec(r.period)!,
        cumulativeQty: dec(r.cumulative)!,
        pct: r.pct,
        plannedStart: dateOnly(r.a.plannedStart),
        plannedEnd: dateOnly(r.a.plannedEnd),
        delayed: !!r.a.plannedEnd && r.a.plannedEnd <= to && r.pct < 100,
      })),
      boq: boqRows
        .filter((r) => r.periodQty.gt(0) || r.measuredPeriodQty.gt(0))
        .map((r) => ({
          itemNo: r.b.itemNo,
          description: r.b.description,
          unit: r.b.unit,
          rate: money(r.b.rate)!,
          periodQty: dec(r.periodQty)!,
          periodValue: money(r.periodQty.mul(r.b.rate))!,
          cumulativeQty: dec(r.cumulativeQty)!,
          cumulativeValue: money(r.cumulativeQty.mul(r.b.rate))!,
          measuredPeriodQty: dec(r.measuredPeriodQty)!,
        })),
      manpower: [...trades.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, manDays]) => ({ category, manDays, avgPerDay: attendanceDays ? Math.round((manDays / attendanceDays) * 10) / 10 : 0 })),
      attendanceDays,
      machinery: [...machines.values()]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((m) => ({ code: m.code, name: m.name, days: m.days, hours: dec(m.hours)!, idleHours: dec(m.idle)!, breakdownHours: dec(m.down)! })),
      materials: [...materials.values()].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ name: m.name, unit: m.unit, received: dec(m.received)!, issued: dec(m.issued)! })),
      dpr: { days, approved: approvedDprs.length, rainyDays: approvedDprs.filter((d) => d.weather === 'RAINY').length },
      issues: notes((d) => d.issues),
      safety: notes((d) => d.safetyObservations),
      delays: register
        .filter((x) => x.kind === 'DELAY' && x.delayStart)
        .map((x) => {
          const start = x.delayStart! < from ? from : x.delayStart!;
          // An ongoing delay counts to today when the period runs past it.
          const last = to < todayUtc ? to : todayUtc;
          const end = x.delayEnd && x.delayEnd < last ? x.delayEnd : last;
          return {
            riskNo: x.riskNo,
            title: x.title,
            activityName: x.activity?.name ?? null,
            from: dateOnly(x.delayStart)!,
            to: dateOnly(x.delayEnd),
            daysInPeriod: Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1),
            responsibleParty: x.responsibleParty,
            eotClaimed: x.eotClaimed,
            status: x.status,
          };
        }),
      risks: register
        .filter((x) => x.kind === 'RISK')
        .map((x) => ({ riskNo: x.riskNo, title: x.title, score: x.score, mitigation: x.mitigation, ownerName: x.owner?.fullName ?? null, dueDate: dateOnly(x.dueDate) })),
      nextPeriod: activityRows
        .filter((r) => r.pct < 100 && !!r.a.plannedStart && r.a.plannedStart <= nextEnd)
        .map((r) => ({ activityId: r.a.id, name: r.a.name, unit: r.a.unit, balanceQty: dec(Prisma.Decimal.max(r.a.plannedQty.minus(r.cumulative), ZERO))!, plannedEnd: dateOnly(r.a.plannedEnd) })),
      photos: photos.map((p) => ({
        url: this.attachments.toDto(p).url,
        caption: [p.progressEntry?.activity.name, dateOnly(p.progressEntry?.date ?? null)].filter(Boolean).join(' · '),
      })),
    };
  }
}
