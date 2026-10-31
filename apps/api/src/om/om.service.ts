import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BILL_STAGE_LABELS,
  SUBMISSION_STATUS_LABELS,
  billLabel,
  canLogServiceLevels,
  canManageOm,
  canPrepareBill,
  canRecordOmStaff,
  canViewOm,
  type OmChemicalRowDto,
  type OmContractDto,
  type OmDto,
  type OmMonthDto,
  type OmPeriodDto,
  type ServiceLevelDayDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, dec, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { benchmarkSettings, loadMonths, loadOm, type LoadedOm } from './om-load';
import { chemicalRow, lastOf, dayFailures, lossPctOf, lpcdOf, monthsBetween, periodOf, termsProblem, type MonthFigures, type OmBillDetail } from './om-rules';
import { SaveOmContractDto, SaveServiceDayDto, SaveStaffMonthDto } from './om.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const num = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : D(v));
const r2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

/**
 * O&M contract (ARCHITECTURE "Operation and maintenance"): the project's O&M tab after handover. The terms are
 * kept by the project's managers, the daily service levels by the site and the lab, staff deployed by HR and the
 * managers; each instalment is billed as an O&M bill through `RaBillsService`. The arithmetic is in `om-rules.ts`.
 */
@Injectable()
export class OmService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private reconciliation: ReconciliationService,
  ) {}

  private async assertView(user: RequestUser, projectId: string) {
    if (!canViewOm(user.roleKey)) throw new ForbiddenException('Your role cannot see the O&M contract');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async loaded(projectId: string): Promise<LoadedOm> {
    const om = await loadOm(this.prisma, projectId);
    if (!om) throw new NotFoundException('This project has no O&M contract yet: set out its terms first');
    return om;
  }

  /** O&M bills of the project, by period. */
  private async bills(projectId: string) {
    return this.prisma.raBill.findMany({
      where: { projectId, omYear: { not: null } },
      select: { id: true, billNo: true, isFinal: true, omYear: true, omInstalment: true, omPenalty: true, omDetail: true, status: true, stage: true },
    });
  }

  /** Whether a day falls in a period that already has its bill (and so can no longer change). */
  private lockedDay(om: LoadedOm, billed: { omYear: number | null; omInstalment: number | null }[], day: string) {
    const p = periodOf(om.periods, day);
    return !!p && billed.some((b) => b.omYear === p.year && b.omInstalment === p.instalment);
  }

  async get(user: RequestUser, projectId: string, month?: string): Promise<OmDto> {
    await this.assertView(user, projectId);
    const today = todayIn();
    const [handover, om] = await Promise.all([
      this.prisma.projectHandover.findUnique({ where: { projectId }, select: { completedOn: true } }),
      loadOm(this.prisma, projectId),
    ]);
    const can = {
      canManage: canManageOm(user.roleKey),
      canLog: canLogServiceLevels(user.roleKey),
      canRecordStaff: canRecordOmStaff(user.roleKey),
      canBill: canPrepareBill(user.roleKey),
    };
    const shownMonth = month ?? today.slice(0, 7);
    if (!om) {
      return { projectId, handedOverOn: dateOnly(handover?.completedOn), contract: null, today, current: null, month: shownMonth, months: [], days: [], periods: [], chemicals: [], ...can };
    }
    const until = today < om.endsOn ? today : om.endsOn;
    const [bills, months] = await Promise.all([this.bills(projectId), until >= om.startOn ? loadMonths(this.prisma, om, projectId, om.startOn, until, today) : Promise.resolve([] as MonthFigures[])]);
    const byMonth = new Map(months.map((m) => [m.month, m]));

    const periods: OmPeriodDto[] = om.periods.map((p) => {
      const bill = bills.find((b) => b.omYear === p.year && b.omInstalment === p.instalment);
      const status = bill ? 'BILLED' : p.from > today ? 'FUTURE' : p.to >= today ? 'RUNNING' : 'DUE';
      let staff = 0;
      let penalty = 0;
      if (bill?.omDetail) {
        const d = bill.omDetail as unknown as OmBillDetail;
        staff = d.staffDeduction;
        penalty = d.penalty;
      } else {
        for (const m of monthsBetween(p.from, p.to)) {
          staff += byMonth.get(m)?.staffDeduction ?? 0;
          penalty += byMonth.get(m)?.penalty ?? 0;
        }
      }
      return {
        year: p.year,
        instalment: p.instalment,
        label: p.label,
        from: p.from,
        to: p.to,
        amount: r2(p.amount),
        staffDeduction: r2(staff),
        penalty: r2(penalty),
        net: r2(Math.max(p.amount - staff, 0) - penalty),
        status,
        billId: bill?.id ?? null,
        billNo: bill?.billNo ?? null,
        billLabel: bill ? billLabel(bill.billNo, bill.isFinal, true) : null,
        billState: bill ? (bill.status === 'APPROVED' ? BILL_STAGE_LABELS[bill.stage] : SUBMISSION_STATUS_LABELS[bill.status]) : null,
      };
    });

    // The log shows a month of the contract: the one asked for, else this one (or the nearest end of the contract).
    const clampMonth = shownMonth < om.startOn.slice(0, 7) ? om.startOn.slice(0, 7) : shownMonth > om.endsOn.slice(0, 7) ? om.endsOn.slice(0, 7) : shownMonth;
    const shownPeriod = periodOf(om.periods, `${clampMonth}-01`)!;
    const periodMonths = monthsBetween(shownPeriod.from, shownPeriod.to);
    const monthFrom = `${clampMonth}-01`;
    const monthTo = lastOf(clampMonth);
    const [dayRows, chemicals] = await Promise.all([
      this.prisma.serviceLevelDay.findMany({ where: { projectId, date: { gte: parseDate(monthFrom), lte: parseDate(monthTo) } }, include: { enteredBy: { select: { fullName: true } } }, orderBy: { date: 'desc' } }),
      this.chemicals(om, projectId, monthFrom, monthTo < today ? monthTo : today),
    ]);
    const days: ServiceLevelDayDto[] = dayRows.map((r) => {
      const reading = {
        date: dateOnly(r.date)!,
        producedKl: Number(r.producedKl),
        suppliedKl: Number(r.suppliedKl),
        residualChlorine: r.residualChlorine === null ? null : Number(r.residualChlorine),
        tailPressureM: r.tailPressureM === null ? null : Number(r.tailPressureM),
        complaintsReceived: r.complaintsReceived,
        complaintsClosed48h: r.complaintsClosed48h,
        pumpEfficiencyPct: r.pumpEfficiencyPct === null ? null : Number(r.pumpEfficiencyPct),
      };
      return {
        id: r.id,
        date: reading.date,
        producedKl: dec(r.producedKl)!,
        suppliedKl: dec(r.suppliedKl)!,
        lpcd: lpcdOf(reading.suppliedKl, om.contract.population),
        lossPct: lossPctOf(reading.producedKl, reading.suppliedKl),
        residualChlorine: dec(r.residualChlorine),
        tailPressureM: dec(r.tailPressureM),
        complaintsReceived: r.complaintsReceived,
        complaintsClosed48h: r.complaintsClosed48h,
        pumpEfficiencyPct: dec(r.pumpEfficiencyPct),
        note: r.note,
        failures: dayFailures(reading, om.settings, om.contract.population),
        enteredByName: r.enteredBy.fullName,
        locked: this.lockedDay(om, bills, reading.date),
      };
    });
    const current = periodOf(om.periods, today);
    return {
      projectId,
      handedOverOn: dateOnly(handover?.completedOn),
      contract: this.contractDto(om),
      today,
      current: current ? { year: current.year, instalment: current.instalment, label: current.label } : null,
      month: clampMonth,
      months: periodMonths.filter((m) => byMonth.has(m)).map((m) => this.monthDto(byMonth.get(m)!)),
      days,
      periods,
      chemicals,
      ...can,
    };
  }

  private contractDto(om: LoadedOm): OmContractDto {
    const c = om.contract;
    return {
      id: c.id,
      startOn: om.startOn,
      endsOn: om.endsOn,
      years: c.years,
      yearPcts: c.yearPcts.map((p) => dec(p)!),
      instalmentsPerYear: c.instalmentsPerYear,
      extensionYears: c.extensionYears,
      population: c.population,
      contractValue: money(c.project.contractValue),
      benchmarks: om.settings,
      staff: c.staffNorms.map((n) => ({ role: n.role, required: n.required, monthlyPay: money(n.monthlyPay)! })),
      chemicals: c.chemicalNorms.map((n) => ({ itemId: n.itemId, itemName: n.item.name, unit: n.item.unit, perMl: dec(n.perMl)! })),
      note: c.note,
    };
  }

  private monthDto(m: MonthFigures): OmMonthDto {
    return {
      month: m.month,
      dueDays: m.dueDays,
      loggedDays: m.loggedDays,
      missingDays: m.missingDays,
      benchmarks: m.benchmarks.map((b) => ({ ...b, limit: String(b.limit), penalty: r2(b.penalty) })),
      penalty: r2(m.penalty),
      staff: m.staff.map((l) => ({ ...l, deduction: r2(l.deduction) })),
      staffDeduction: r2(m.staffDeduction),
      staffRecorded: m.staffRecorded,
    };
  }

  /** The chemicals' use over a span against their norm × the water produced, from the material reconciliation's figures. */
  private async chemicals(om: LoadedOm, projectId: string, from: string, to: string): Promise<OmChemicalRowDto[]> {
    const norms = om.contract.chemicalNorms;
    if (!norms.length || to < from) return [];
    const [rec, produced] = await Promise.all([
      this.reconciliation.forPeriod(projectId, from, to),
      this.prisma.serviceLevelDay.aggregate({ where: { projectId, date: { gte: parseDate(from), lte: parseDate(to) } }, _sum: { producedKl: true } }),
    ]);
    const consumed = new Map<string, number>();
    for (const r of [...rec.items, ...rec.unreconciled]) consumed.set(r.itemId, Number(r.consumedQty));
    const producedKl = Number(produced._sum.producedKl ?? 0);
    return norms.map((n) => {
      const used = consumed.get(n.itemId) ?? 0;
      const row = chemicalRow({ perMl: Number(n.perMl) }, producedKl, used);
      return {
        itemId: n.itemId,
        itemName: n.item.name,
        unit: n.item.unit,
        perMl: dec(n.perMl)!,
        producedMl: dec(row.producedMl)!,
        normQty: dec(row.normQty)!,
        consumedQty: dec(used)!,
        variancePct: row.variancePct,
        status: row.status,
      };
    });
  }

  // Changes

  async saveContract(user: RequestUser, projectId: string, dto: SaveOmContractDto): Promise<OmDto> {
    await this.assertView(user, projectId);
    if (!canManageOm(user.roleKey)) throw new ForbiddenException('Only the project’s managers set the O&M contract’s terms');
    const handover = await this.prisma.projectHandover.findUnique({ where: { projectId }, select: { completedOn: true } });
    if (!handover) throw new BadRequestException('Record the handover first: O&M runs from the completion it certifies');
    const yearPcts = dto.yearPcts.map(Number);
    const problem = termsProblem({ startOn: dto.startOn, years: dto.years, yearPcts, instalmentsPerYear: dto.instalmentsPerYear, population: dto.population });
    if (problem) throw new BadRequestException(problem);
    if (dto.startOn <= dateOnly(handover.completedOn)!) throw new BadRequestException(`O&M starts after the completion on ${dateOnly(handover.completedOn)}: choose a later first of the month`);
    if (new Set(dto.benchmarks.map((b) => b.key)).size !== dto.benchmarks.length) throw new BadRequestException('Each benchmark can be set once');
    if (dto.benchmarks.some((b) => Number(b.limit) < 0 || Number(b.penalty) < 0)) throw new BadRequestException('Limits and penalties cannot be negative');
    const roles = dto.staff.map((s) => s.role.toLowerCase());
    if (new Set(roles).size !== roles.length) throw new BadRequestException('Each role can be listed once');
    if (dto.staff.some((s) => Number(s.monthlyPay) < 0)) throw new BadRequestException('Monthly pay cannot be negative');
    if (new Set(dto.chemicals.map((c) => c.itemId)).size !== dto.chemicals.length) throw new BadRequestException('Each chemical can be listed once');
    if (dto.chemicals.some((c) => !(Number(c.perMl) > 0))) throw new BadRequestException('A chemical’s norm per ML must be more than 0');
    if (dto.chemicals.length) {
      const found = await this.prisma.item.count({ where: { organizationId: user.organizationId, id: { in: dto.chemicals.map((c) => c.itemId) } } });
      if (found !== dto.chemicals.length) throw new BadRequestException('A chemical is not in the item master');
    }

    const [existing, bills] = await Promise.all([this.prisma.omContract.findUnique({ where: { projectId } }), this.bills(projectId)]);
    if (existing && bills.length) {
      // Billed periods stay as they were billed.
      const lastYear = Math.max(...bills.map((b) => b.omYear!));
      if (dateOnly(existing.startOn) !== dto.startOn || existing.instalmentsPerYear !== dto.instalmentsPerYear)
        throw new ConflictException('O&M bills have been made: the start and the instalments a year can no longer change');
      if (dto.years < lastYear) throw new ConflictException(`Year ${lastYear} has been billed: the contract runs at least that long`);
      for (let y = 1; y <= lastYear; y++) {
        if (Number(existing.yearPcts[y - 1] ?? -1) !== yearPcts[y - 1]) throw new ConflictException(`Year ${y} has been billed at ${dec(existing.yearPcts[y - 1])}%: its % can no longer change`);
      }
    }

    const data = {
      startOn: parseDate(dto.startOn),
      years: dto.years,
      yearPcts: yearPcts.map((p) => D(p)),
      instalmentsPerYear: dto.instalmentsPerYear,
      extensionYears: dto.extensionYears ?? 0,
      population: dto.population,
      benchmarks: benchmarkSettings(dto.benchmarks as unknown as Prisma.JsonValue) as unknown as Prisma.InputJsonValue,
      note: dto.note ?? null,
    };
    const org = user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.omContract.upsert({ where: { projectId }, create: { organizationId: org, projectId, ...data }, update: data });
      await tx.omStaffNorm.deleteMany({ where: { contractId: c.id } });
      await tx.omStaffNorm.createMany({ data: dto.staff.map((s, i) => ({ organizationId: org, contractId: c.id, role: s.role, required: s.required, monthlyPay: D(s.monthlyPay), sortOrder: i })) });
      await tx.omChemicalNorm.deleteMany({ where: { contractId: c.id } });
      await tx.omChemicalNorm.createMany({ data: dto.chemicals.map((n) => ({ organizationId: org, contractId: c.id, itemId: n.itemId, perMl: D(n.perMl) })) });
      await this.audit.log(user, 'OM_CONTRACT', c.id, existing ? 'UPDATED' : 'CREATED', `${dto.years} years from ${dto.startOn}`);
    });
    return this.get(user, projectId);
  }

  async saveDay(user: RequestUser, projectId: string, dto: SaveServiceDayDto): Promise<OmDto> {
    await this.assertView(user, projectId);
    if (!canLogServiceLevels(user.roleKey)) throw new ForbiddenException('Your role cannot enter the daily service levels');
    const om = await this.loaded(projectId);
    const today = todayIn();
    if (dto.date > today) throw new BadRequestException('A day’s readings can only be entered once the day has come');
    if (dto.date < om.startOn || dto.date > om.endsOn) throw new BadRequestException(`The O&M contract runs from ${om.startOn} to ${om.endsOn}`);
    const produced = D(dto.producedKl);
    const supplied = D(dto.suppliedKl);
    if (produced.lt(0) || supplied.lt(0)) throw new BadRequestException('Water produced and supplied cannot be negative');
    if (supplied.gt(produced.mul(1.05))) throw new BadRequestException('More water supplied than produced: check the meter readings');
    const received = dto.complaintsReceived ?? 0;
    const closed = dto.complaintsClosed48h ?? 0;
    if (closed > received) throw new BadRequestException('Complaints closed within 48 hours cannot be more than those received');
    const eff = num(dto.pumpEfficiencyPct);
    if (eff && (eff.lt(0) || eff.gt(100))) throw new BadRequestException('Pump efficiency is a % from 0 to 100');
    for (const v of [num(dto.residualChlorine), num(dto.tailPressureM)]) if (v && v.lt(0)) throw new BadRequestException('A reading cannot be negative');
    const bills = await this.bills(projectId);
    if (this.lockedDay(om, bills, dto.date)) throw new ConflictException('This day’s period has been billed: its readings can no longer change');
    const data = {
      producedKl: produced,
      suppliedKl: supplied,
      residualChlorine: num(dto.residualChlorine),
      tailPressureM: num(dto.tailPressureM),
      complaintsReceived: received,
      complaintsClosed48h: closed,
      pumpEfficiencyPct: eff,
      note: dto.note ?? null,
      enteredById: user.id,
    };
    const row = await this.prisma.serviceLevelDay.upsert({
      where: { projectId_date: { projectId, date: parseDate(dto.date) } },
      create: { organizationId: user.organizationId, projectId, date: parseDate(dto.date), ...data },
      update: data,
    });
    await this.audit.log(user, 'SERVICE_LEVEL_DAY', row.id, row.createdAt.getTime() === row.updatedAt.getTime() ? 'CREATED' : 'UPDATED', dto.date);
    return this.get(user, projectId, dto.date.slice(0, 7));
  }

  async removeDay(user: RequestUser, projectId: string, dayId: string): Promise<OmDto> {
    await this.assertView(user, projectId);
    if (!canLogServiceLevels(user.roleKey)) throw new ForbiddenException('Your role cannot change the daily service levels');
    const row = await this.prisma.serviceLevelDay.findFirst({ where: { id: dayId, projectId } });
    if (!row) throw new NotFoundException('Reading not found');
    const om = await this.loaded(projectId);
    const day = dateOnly(row.date)!;
    if (this.lockedDay(om, await this.bills(projectId), day)) throw new ConflictException('This day’s period has been billed: its readings can no longer change');
    await this.prisma.serviceLevelDay.delete({ where: { id: dayId } });
    await this.audit.log(user, 'SERVICE_LEVEL_DAY', dayId, 'DELETED', day);
    return this.get(user, projectId, day.slice(0, 7));
  }

  async saveStaff(user: RequestUser, projectId: string, dto: SaveStaffMonthDto): Promise<OmDto> {
    await this.assertView(user, projectId);
    if (!canRecordOmStaff(user.roleKey)) throw new ForbiddenException('Only HR and the project’s managers record the staff deployed');
    const om = await this.loaded(projectId);
    const first = `${dto.month}-01`;
    if (first > todayIn()) throw new BadRequestException('Staff can be recorded once the month has begun');
    if (lastOf(dto.month) < om.startOn || first > om.endsOn) throw new BadRequestException(`The O&M contract runs from ${om.startOn} to ${om.endsOn}`);
    const roles = new Set(om.norms.map((n) => n.role));
    const unknown = dto.rows.find((r) => !roles.has(r.role));
    if (unknown) throw new BadRequestException(`${unknown.role} is not a role of the contract’s minimum staff`);
    if (this.lockedDay(om, await this.bills(projectId), first)) throw new ConflictException('This month’s period has been billed: its staff can no longer change');
    const month = parseDate(first);
    await this.prisma.$transaction(async (tx) => {
      for (const r of dto.rows) {
        await tx.omStaffMonth.upsert({
          where: { projectId_month_role: { projectId, month, role: r.role } },
          create: { organizationId: user.organizationId, projectId, month, role: r.role, deployed: r.deployed, recordedById: user.id },
          update: { deployed: r.deployed, recordedById: user.id },
        });
      }
    });
    await this.audit.log(user, 'OM_STAFF', projectId, 'UPDATED', dto.month);
    return this.get(user, projectId, dto.month);
  }
}
