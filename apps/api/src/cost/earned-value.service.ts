import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { EarnedValueActivityDto, EarnedValueDto, EvBacSource, EvBasis } from '@erp/shared';
import { canViewCost } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, money } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { BudgetService } from './budget.service';
import { CostService, total } from './cost.service';
import { earnedScheduleDate, forecastFinish, indices, monthEnds, plannedShare, type PlannedSlice } from './earned-value-rules';

const pct1 = (share: number) => Math.round(share * 1000) / 10;

/**
 * Earned value of one project (v6 item 115). Each BOQ item's value (quantity × rate) is spread over the days of its
 * activities, weighted by their planned quantity: the baseline dates once a baseline is frozen, else the planned dates. An
 * item with no dated activity is spread over the project's dates. Earned is approved progress (or approved measurement)
 * at BOQ rates over the BOQ value. Both shares are then put on the budget at completion (`BudgetService`), so planned and
 * earned value compare with actual cost (`CostService`, the Cost tab's figures).
 */
@Injectable()
export class EarnedValueService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private cost: CostService,
    private budget: BudgetService,
  ) {}

  async get(user: RequestUser, projectId: string, basis: EvBasis = 'PROGRESS'): Promise<EarnedValueDto> {
    if (!canViewCost(user.roleKey)) throw new ForbiddenException('Earned value is for approvers and accounts');
    await this.access.assertCanAccessProject(user, projectId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId },
      select: { id: true, code: true, name: true, contractValue: true, startDate: true, endDate: true, baselineAt: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    const today = todayIn();
    const [forecast, acc, items, activities, progress, measured] = await Promise.all([
      this.budget.forecasts(user.organizationId, [project]).then((m) => m.get(projectId)!),
      this.cost.compute(user.organizationId, [projectId], undefined).then((m) => m.get(projectId)!),
      this.prisma.boqItem.findMany({ where: { projectId }, select: { id: true, rate: true, originalQty: true, revisedQty: true } }),
      this.prisma.activity.findMany({
        where: { projectId, boqItemId: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, boqItemId: true, plannedQty: true, plannedStart: true, plannedEnd: true, baselineStart: true, baselineEnd: true },
      }),
      this.prisma.progressEntry.findMany({ where: { projectId, status: 'APPROVED' }, select: { activityId: true, date: true, quantity: true } }),
      basis === 'MEASURED'
        ? this.prisma.measurementSheet.findMany({ where: { projectId, status: 'APPROVED' }, select: { date: true, totalQty: true, boqItem: { select: { rate: true } } } })
        : Promise.resolve([]),
    ]);

    const usesBaseline = !!project.baselineAt;
    const datesOf = (a: (typeof activities)[number]) => {
      const s = usesBaseline && a.baselineStart && a.baselineEnd ? a.baselineStart : a.plannedStart;
      const e = usesBaseline && a.baselineStart && a.baselineEnd ? a.baselineEnd : a.plannedEnd;
      return s && e ? { start: dateOnly(s)!, end: dateOnly(e)! } : null;
    };
    const rateOf = new Map(items.map((b) => [b.id, b.rate.toNumber()]));
    const boqValue = items.reduce((s, b) => s + (b.revisedQty ?? b.originalQty).toNumber() * b.rate.toNumber(), 0);
    const projectStart = dateOnly(project.startDate);
    const projectEnd = dateOnly(project.endDate);

    // Each BOQ item's value over its activities' days.
    const slices: PlannedSlice[] = [];
    let unscheduled = 0;
    for (const b of items) {
      const value = (b.revisedQty ?? b.originalQty).toNumber() * b.rate.toNumber();
      if (value <= 0) continue;
      const dated = activities.filter((a) => a.boqItemId === b.id).flatMap((a) => (datesOf(a) ? [{ ...datesOf(a)!, qty: Math.max(0, a.plannedQty.toNumber()) }] : []));
      if (!dated.length) {
        unscheduled += value;
        if (projectStart && projectEnd) slices.push({ value, start: projectStart, end: projectEnd });
        continue;
      }
      const weight = dated.reduce((s, d) => s + d.qty, 0);
      for (const d of dated) slices.push({ value: value * (weight > 0 ? d.qty / weight : 1 / dated.length), start: d.start, end: d.end });
    }

    const bacSource: EvBacSource = forecast.headBudget ? 'HEADS' : forecast.boqBudget ? 'BOQ_BUDGET' : 'BOQ_VALUE';
    const bac = forecast.bac ? forecast.bac.toNumber() : boqValue;
    const scale = boqValue > 0 ? bac / boqValue : 0;
    const starts = slices.map((s) => s.start).sort();
    const ends = slices.map((s) => s.end).sort();
    const start = projectStart && (!starts[0] || projectStart < starts[0]) ? projectStart : (starts[0] ?? projectStart);
    const plannedFinish = ends[ends.length - 1] ?? projectEnd;

    // Earned value at BOQ rates, by day.
    const activityRate = new Map(activities.map((a) => [a.id, rateOf.get(a.boqItemId!) ?? 0]));
    const earnedLog: { date: string; value: number }[] =
      basis === 'MEASURED'
        ? measured.map((m) => ({ date: dateOnly(m.date)!, value: m.totalQty.toNumber() * m.boqItem.rate.toNumber() }))
        : progress.map((p) => ({ date: dateOnly(p.date)!, value: p.quantity.toNumber() * (activityRate.get(p.activityId) ?? 0) }));
    const earnedTo = (date: string) => (boqValue > 0 ? Math.min(1, earnedLog.filter((e) => e.date <= date).reduce((s, e) => s + e.value, 0) / boqValue) : 0);
    const costMonths = [...acc.months.entries()].map(([month, m]) => ({ month, amount: total(m.heads).toNumber() }));
    const costTo = (month: string) => costMonths.filter((m) => m.month <= month).reduce((s, m) => s + m.amount, 0);

    const plannedNow = plannedShare(slices, today);
    const earnedNow = earnedTo(today);
    const pv = plannedNow * bac;
    const ev = earnedNow * bac;
    const ac = total(forecast.heads).toNumber();
    const ix = indices({ bac, pv, ev, ac });
    const earnedOn = start && plannedFinish ? earnedScheduleDate(slices, earnedNow, start, plannedFinish) : null;
    const pace = start && plannedFinish ? forecastFinish(start, plannedFinish, today, earnedOn) : { spiT: null, finish: null, daysLate: null };

    const thisMonth = today.slice(0, 7);
    const curve =
      start && plannedFinish
        ? monthEnds(start, plannedFinish > today ? plannedFinish : today).map(({ month, end }) => {
            const cut = month === thisMonth ? today : end;
            const past = month <= thisMonth;
            return { month, pv: money(plannedShare(slices, cut) * bac)!, ev: past ? money(earnedTo(cut) * bac) : null, ac: past ? money(costTo(month)) : null };
          })
        : [];

    // Activities, behind first: each one's planned and earned share against its own dates and quantity.
    const doneQty = new Map<string, number>();
    for (const p of progress) doneQty.set(p.activityId, (doneQty.get(p.activityId) ?? 0) + p.quantity.toNumber());
    const rows: EarnedValueActivityDto[] = activities.flatMap((a) => {
      const d = datesOf(a);
      const qty = a.plannedQty.toNumber();
      const value = qty * (activityRate.get(a.id) ?? 0) * scale;
      if (!d || value <= 0) return [];
      const planned = plannedShare([{ value: 1, start: d.start, end: d.end }], today);
      const earned = Math.min(1, (doneQty.get(a.id) ?? 0) / qty);
      return [{ id: a.id, name: a.name, value: money(value)!, plannedPct: pct1(planned), earnedPct: pct1(earned), sv: money((earned - planned) * value)! }];
    });
    rows.sort((x, y) => Number(x.sv) - Number(y.sv) || x.name.localeCompare(y.name));

    const m = (n: number | null) => (n === null ? null : money(n));
    return {
      projectId,
      projectCode: project.code,
      projectName: project.name,
      today,
      basis,
      bacSource,
      pvSource: usesBaseline ? 'BASELINE' : 'PLAN',
      start,
      plannedFinish,
      bac: money(bac)!,
      boqValue: money(boqValue)!,
      unscheduledValue: money(unscheduled)!,
      plannedPct: pct1(plannedNow),
      earnedPct: pct1(earnedNow),
      pv: money(pv)!,
      ev: money(ev)!,
      ac: money(ac)!,
      sv: money(ix.sv)!,
      cv: money(ix.cv)!,
      spi: ix.spi,
      cpi: ix.cpi,
      eac: m(ix.eac),
      eacWithSchedule: m(ix.eacWithSchedule),
      etc: m(ix.etc),
      vac: m(ix.vac),
      tcpi: ix.tcpi,
      earnedOn,
      spiT: pace.spiT,
      forecastFinish: pace.finish,
      daysLate: pace.daysLate,
      curve,
      activities: rows,
    };
  }
}
