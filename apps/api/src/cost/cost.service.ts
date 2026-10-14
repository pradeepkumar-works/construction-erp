import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CostHeadsDto, CostMonthDto, ExpenseCategory, LabourRatesDto, ProjectCostDto, ProjectCostSummaryDto } from '@erp/shared';
import { canSetLabourRates, canViewCost, machineryLogCost } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dec, money, parseDate } from '../common/serialize';
import { CostQuery, SetLabourRatesDto } from './cost.dto';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);
const key = (s: string) => s.trim().toLowerCase();
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

interface Heads {
  expenses: D;
  material: D;
  machinery: D;
  labour: D;
}
const emptyHeads = (): Heads => ({ expenses: ZERO, material: ZERO, machinery: ZERO, labour: ZERO });
const total = (h: Heads) => h.expenses.plus(h.material).plus(h.machinery).plus(h.labour);
const headsDto = (h: Heads): CostHeadsDto => ({ expenses: money(h.expenses)!, material: money(h.material)!, machinery: money(h.machinery)!, labour: money(h.labour)!, total: money(total(h))! });

/** Everything the cost view needs for one project, before it is turned into DTOs. */
interface Acc {
  heads: Heads;
  executed: D;
  measured: D;
  billed: D;
  cashIn: D;
  months: Map<string, { heads: Heads; executed: D }>;
  expenses: Map<string, { count: number; amount: D }>;
  material: Map<string, { name: string; unit: string; qty: D; rate: D | null; amount: D }>;
  machinery: Map<string, { code: string; name: string; rateUnit: 'HOUR' | 'DAY' | 'MONTH'; rate: D | null; days: number; hours: D; amount: D }>;
  labour: Map<string, { category: string; manDays: number; rate: D | null; amount: D }>;
  unpricedItems: Set<string>;
  unpricedLogs: number;
  unpricedManDays: number;
}

const newAcc = (): Acc => ({
  heads: emptyHeads(),
  executed: ZERO,
  measured: ZERO,
  billed: ZERO,
  cashIn: ZERO,
  months: new Map(),
  expenses: new Map(),
  material: new Map(),
  machinery: new Map(),
  labour: new Map(),
  unpricedItems: new Set(),
  unpricedLogs: 0,
  unpricedManDays: 0,
});

/**
 * Project cost view: approved site expenses, material issued at the item's standard rate, approved
 * machinery logs at the machine's hire rate and attendance man-days at the trade's daily rate, set
 * against the value of approved progress (and of approved measurements) in the same period, with what was billed
 * (approved RA bills) and received from the client.
 */
@Injectable()
export class CostService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  private assertCanView(user: RequestUser) {
    if (!canViewCost(user.roleKey)) throw new ForbiddenException('Project cost is for approvers and accounts');
  }

  private range(q: CostQuery): Prisma.DateTimeFilter | undefined {
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('The period starts after it ends');
    if (!q.from && !q.to) return undefined;
    return { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
  }

  async summary(user: RequestUser, q: CostQuery): Promise<ProjectCostSummaryDto[]> {
    this.assertCanView(user);
    const projects = await this.prisma.project.findMany({ where: this.access.projectWhere(user), orderBy: { code: 'asc' } });
    const accs = await this.compute(user.organizationId, projects.map((p) => p.id), this.range(q));
    return projects.map((p) => this.summaryDto(p, accs.get(p.id)!));
  }

  async project(user: RequestUser, projectId: string, q: CostQuery): Promise<ProjectCostDto> {
    this.assertCanView(user);
    await this.access.assertCanAccessProject(user, projectId);
    const p = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!p) throw new NotFoundException('Project not found');
    const acc = (await this.compute(user.organizationId, [projectId], this.range(q))).get(projectId)!;
    const sortAmount = <T extends { amount: D }>(a: T, b: T) => b.amount.comparedTo(a.amount);
    const months: CostMonthDto[] = [...acc.months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({ month, executedValue: money(m.executed)!, ...headsDto(m.heads) }));
    return {
      ...this.summaryDto(p, acc),
      from: q.from ?? null,
      to: q.to ?? null,
      months,
      expensesByCategory: [...acc.expenses.entries()]
        .map(([category, v]) => ({ category: category as ExpenseCategory, count: v.count, amount: v.amount }))
        .sort(sortAmount)
        .map((v) => ({ ...v, amount: money(v.amount)! })),
      materialByItem: [...acc.material.entries()]
        .map(([itemId, v]) => ({ itemId, ...v }))
        .sort((a, b) => sortAmount(a, b) || a.name.localeCompare(b.name))
        .map((v) => ({ itemId: v.itemId, name: v.name, unit: v.unit, quantity: dec(v.qty)!, rate: money(v.rate), amount: money(v.amount)! })),
      machineryByEquipment: [...acc.machinery.entries()]
        .map(([equipmentId, v]) => ({ equipmentId, ...v }))
        .sort((a, b) => sortAmount(a, b) || a.code.localeCompare(b.code))
        .map((v) => ({ equipmentId: v.equipmentId, code: v.code, name: v.name, rateUnit: v.rateUnit, rate: money(v.rate), days: v.days, hours: dec(v.hours)!, amount: money(v.amount)! })),
      labourByTrade: [...acc.labour.values()]
        .sort((a, b) => sortAmount(a, b) || b.manDays - a.manDays)
        .map((v) => ({ category: v.category, manDays: v.manDays, dailyRate: money(v.rate), amount: money(v.amount)! })),
    };
  }

  private summaryDto(p: { id: string; code: string; name: string; type: ProjectCostSummaryDto['projectType']; contractValue: D | null }, acc: Acc): ProjectCostSummaryDto {
    const cost = total(acc.heads);
    return {
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      projectType: p.type,
      contractValue: money(p.contractValue),
      executedValue: money(acc.executed)!,
      measuredValue: money(acc.measured)!,
      cost: headsDto(acc.heads),
      margin: money(acc.executed.minus(cost))!,
      costPct: acc.executed.gt(0) ? Math.round(cost.div(acc.executed).mul(1000).toNumber()) / 10 : null,
      billedValue: money(acc.billed)!,
      cashIn: money(acc.cashIn)!,
      unpriced: { materialItems: acc.unpricedItems.size, machineryLogs: acc.unpricedLogs, labourManDays: acc.unpricedManDays },
    };
  }

  private async compute(organizationId: string, projectIds: string[], date: Prisma.DateTimeFilter | undefined): Promise<Map<string, Acc>> {
    const out = new Map(projectIds.map((id) => [id, newAcc()]));
    if (!projectIds.length) return out;
    const scope = { organizationId, projectId: { in: projectIds }, ...(date ? { date } : {}) };
    const inProjects = { organizationId, projectId: { in: projectIds } };
    const [progress, measurements, expenses, issues, logs, attendance, rates, bills, receipts] = await Promise.all([
      this.prisma.progressEntry.findMany({ where: { ...scope, status: 'APPROVED' }, select: { projectId: true, date: true, quantity: true, activity: { select: { boqItem: { select: { rate: true } } } } } }),
      this.prisma.measurementSheet.findMany({ where: { ...scope, status: 'APPROVED' }, select: { projectId: true, totalQty: true, boqItem: { select: { rate: true } } } }),
      this.prisma.expense.findMany({ where: { ...scope, status: 'APPROVED' }, select: { projectId: true, date: true, category: true, totalAmount: true } }),
      this.prisma.stockTxn.findMany({ where: { ...scope, type: 'ISSUE' }, select: { projectId: true, date: true, quantity: true, item: { select: { id: true, name: true, unit: true, rate: true } } } }),
      this.prisma.machineryLog.findMany({ where: { ...scope, status: 'APPROVED' }, select: { projectId: true, date: true, hoursWorked: true, equipment: { select: { id: true, code: true, name: true, rate: true, rateUnit: true } } } }),
      this.prisma.attendanceLine.findMany({
        where: { sheet: { organizationId, projectId: { in: projectIds }, ...(date ? { date } : {}) } },
        select: { category: true, count: true, sheet: { select: { projectId: true, date: true } } },
      }),
      this.prisma.labourRate.findMany({ where: { organizationId } }),
      this.prisma.raBill.groupBy({ by: ['projectId'], where: { ...inProjects, status: 'APPROVED', ...(date ? { billDate: date } : {}) }, _sum: { grossAmount: true } }),
      this.prisma.receipt.groupBy({ by: ['projectId'], where: { ...inProjects, ...(date ? { receiptDate: date } : {}) }, _sum: { amount: true } }),
    ]);
    for (const b of bills) out.get(b.projectId)!.billed = b._sum.grossAmount ?? ZERO;
    for (const r of receipts) out.get(r.projectId)!.cashIn = r._sum.amount ?? ZERO;
    const month = (acc: Acc, d: Date) => {
      const k = monthOf(d);
      let m = acc.months.get(k);
      if (!m) acc.months.set(k, (m = { heads: emptyHeads(), executed: ZERO }));
      return m;
    };
    const add = (acc: Acc, d: Date, head: keyof Heads, amount: D) => {
      acc.heads[head] = acc.heads[head].plus(amount);
      const m = month(acc, d);
      m.heads[head] = m.heads[head].plus(amount);
    };

    for (const p of progress) {
      const rate = p.activity.boqItem?.rate;
      if (!rate) continue;
      const acc = out.get(p.projectId)!;
      const v = p.quantity.mul(rate);
      acc.executed = acc.executed.plus(v);
      const m = month(acc, p.date);
      m.executed = m.executed.plus(v);
    }
    for (const s of measurements) {
      const acc = out.get(s.projectId)!;
      acc.measured = acc.measured.plus(s.totalQty.mul(s.boqItem.rate));
    }
    for (const e of expenses) {
      const acc = out.get(e.projectId)!;
      add(acc, e.date, 'expenses', e.totalAmount);
      const c = acc.expenses.get(e.category) ?? { count: 0, amount: ZERO };
      acc.expenses.set(e.category, { count: c.count + 1, amount: c.amount.plus(e.totalAmount) });
    }
    for (const t of issues) {
      const acc = out.get(t.projectId)!;
      const qty = t.quantity.abs();
      const amount = t.item.rate ? qty.mul(t.item.rate) : ZERO;
      if (!t.item.rate) acc.unpricedItems.add(t.item.id);
      add(acc, t.date, 'material', amount);
      const r = acc.material.get(t.item.id) ?? { name: t.item.name, unit: t.item.unit, qty: ZERO, rate: t.item.rate, amount: ZERO };
      acc.material.set(t.item.id, { ...r, qty: r.qty.plus(qty), amount: r.amount.plus(amount) });
    }
    for (const l of logs) {
      const acc = out.get(l.projectId)!;
      const c = machineryLogCost(l.equipment.rate?.toString(), l.equipment.rateUnit, l.hoursWorked.toString());
      const amount = c === null ? ZERO : new Dec(c).toDecimalPlaces(2);
      if (c === null) acc.unpricedLogs += 1;
      add(acc, l.date, 'machinery', amount);
      const r = acc.machinery.get(l.equipment.id) ?? { code: l.equipment.code, name: l.equipment.name, rateUnit: l.equipment.rateUnit, rate: l.equipment.rate, days: 0, hours: ZERO, amount: ZERO };
      acc.machinery.set(l.equipment.id, { ...r, days: r.days + 1, hours: r.hours.plus(l.hoursWorked), amount: r.amount.plus(amount) });
    }
    const rateOf = new Map(rates.map((r) => [key(r.category), r.dailyRate]));
    for (const a of attendance) {
      const acc = out.get(a.sheet.projectId)!;
      const rate = rateOf.get(key(a.category)) ?? null;
      const amount = rate ? rate.mul(a.count) : ZERO;
      if (!rate) acc.unpricedManDays += a.count;
      add(acc, a.sheet.date, 'labour', amount);
      const r = acc.labour.get(key(a.category)) ?? { category: a.category, manDays: 0, rate, amount: ZERO };
      acc.labour.set(key(a.category), { ...r, manDays: r.manDays + a.count, amount: r.amount.plus(amount) });
    }
    return out;
  }

  /* ---------- labour rates ---------- */

  async labourRates(user: RequestUser): Promise<LabourRatesDto> {
    this.assertCanView(user);
    const [rates, trades] = await Promise.all([
      this.prisma.labourRate.findMany({ where: { organizationId: user.organizationId }, orderBy: { category: 'asc' } }),
      this.prisma.attendanceLine.groupBy({ by: ['category'], where: { sheet: { organizationId: user.organizationId } } }),
    ]);
    const priced = new Set(rates.map((r) => key(r.category)));
    const unpriced = [...new Map(trades.filter((t) => !priced.has(key(t.category))).map((t) => [key(t.category), t.category])).values()].sort();
    return { rates: rates.map((r) => ({ id: r.id, category: r.category, dailyRate: money(r.dailyRate)! })), unpricedTrades: unpriced };
  }

  async setLabourRates(user: RequestUser, dto: SetLabourRatesDto): Promise<LabourRatesDto> {
    if (!canSetLabourRates(user.roleKey)) throw new ForbiddenException('Only admin, management or accounts can set labour rates');
    const seen = new Set<string>();
    for (const r of dto.rates) {
      if (seen.has(key(r.category))) throw new BadRequestException(`${r.category} is listed twice`);
      seen.add(key(r.category));
      if (new Dec(r.dailyRate).isNegative()) throw new BadRequestException('A daily rate cannot be negative');
    }
    const organizationId = user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.labourRate.findMany({ where: { organizationId } });
      const byKey = new Map(existing.map((r) => [key(r.category), r]));
      await tx.labourRate.deleteMany({ where: { organizationId, id: { in: existing.filter((r) => !seen.has(key(r.category))).map((r) => r.id) } } });
      for (const r of dto.rates) {
        const dailyRate = new Dec(r.dailyRate).toDecimalPlaces(2);
        const found = byKey.get(key(r.category));
        if (found) await tx.labourRate.update({ where: { id: found.id }, data: { category: r.category, dailyRate } });
        else await tx.labourRate.create({ data: { organizationId, category: r.category, dailyRate } });
      }
    });
    await this.audit.log(user, 'LABOUR_RATE', organizationId, 'UPDATED', dto.rates.map((r) => `${r.category} ${r.dailyRate}`).join(', ').slice(0, 500));
    return this.labourRates(user);
  }
}
