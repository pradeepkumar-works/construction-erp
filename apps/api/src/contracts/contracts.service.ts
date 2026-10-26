import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CONTRACT_PERCENT_FIELDS, LD_PERIOD_DAYS, MAX_GST_RATE, canEditContract, canViewContract, delayDays, revisedCompletion, type DelayParty, type LdExposureDto, type ProjectContractDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { ClientsService } from '../clients/clients.service';
import { dateOnly, fxRate, iso, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { PriceVariationDto, UpdateContractDto } from './contracts.dto';

const include = {
  client: { include: { _count: { select: { projects: true } } } },
  risks: { where: { kind: 'DELAY' as const, OR: [{ eotClaimed: true }, { eotGrantedDays: { not: null } }] }, orderBy: { delayStart: 'asc' as const } },
  variations: { where: { status: 'APPROVED' as const }, select: { approvedAmount: true } },
  handover: { select: { completedOn: true } },
  pvComponents: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
} satisfies Prisma.ProjectInclude;
type Row = Prisma.ProjectGetPayload<{ include: typeof include }>;

const pctStr = (d: Prisma.Decimal) => d.toFixed(3).replace(/\.?0+$/, '') || '0';
const ZERO = new Prisma.Decimal(0);
const EXCUSABLE: DelayParty[] = ['CLIENT', 'THIRD_PARTY', 'FORCE_MAJEURE'];
const DAY_MS = 86_400_000;
/** Whole days from a to b (YYYY-MM-DD), 0 when b is not after a. */
const daysAfter = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS));

/** What liquidated damages need besides the contract row: delays in the register and the schedule's last planned finish. */
export interface LdInputs {
  delays: { daysLost: number | null; delayStart: Date | null; delayEnd: Date | null; responsibleParty: DelayParty | null }[];
  scheduleFinish: string | null;
}

/**
 * A project's contract with its client (v3 item 17): agreement, value, dates with the extensions of time granted in the
 * delay register, and the retention, advance, tax and cess percentages RA bills are built with.
 */
@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService) {}

  toDto(p: Row, ld?: LdInputs): ProjectContractDto {
    const today = new Date().toISOString().slice(0, 10);
    const extensions = p.risks.map((r) => ({
      riskId: r.id,
      riskNo: r.riskNo,
      title: r.title,
      delayStart: dateOnly(r.delayStart),
      delayEnd: dateOnly(r.delayEnd),
      daysLost: r.daysLost ?? delayDays(dateOnly(r.delayStart), dateOnly(r.delayEnd), today),
      responsibleParty: r.responsibleParty,
      eotClaimed: r.eotClaimed,
      eotGrantedDays: r.eotGrantedDays,
    }));
    const extensionDays = extensions.reduce((s, e) => s + (e.eotGrantedDays ?? 0), 0);
    const endDate = dateOnly(p.endDate);
    const approvedVariations = p.variations.reduce((s, v) => s.add(v.approvedAmount ?? 0), new Prisma.Decimal(0));
    return {
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      client: p.client ? ClientsService.toDto(p.client) : null,
      clientName: p.clientName,
      workOrderNo: p.workOrderNo,
      agreementNo: p.agreementNo,
      agreementDate: dateOnly(p.agreementDate),
      contractValue: money(p.contractValue),
      approvedVariations: money(approvedVariations)!,
      revisedContractValue: p.contractValue ? money(p.contractValue.add(approvedVariations)) : null,
      startDate: dateOnly(p.startDate),
      endDate,
      extensionDays,
      revisedEndDate: revisedCompletion(endDate, extensionDays),
      extensions,
      retentionPct: pctStr(p.retentionPct),
      securityDepositPct: pctStr(p.securityDepositPct),
      mobilisationAdvance: money(p.mobilisationAdvance)!,
      advanceRecoveryPct: pctStr(p.advanceRecoveryPct),
      defectLiabilityMonths: p.defectLiabilityMonths,
      clientPaymentDays: p.clientPaymentDays,
      noticeDays: p.noticeDays,
      measureTolerancePct: p.measureTolerancePct,
      priceVariation: p.priceVariation,
      pvBaseDate: dateOnly(p.pvBaseDate),
      pvComponents: p.pvComponents.map((c) => ({ id: c.id, name: c.name, sharePct: pctStr(c.sharePct), baseIndex: c.baseIndex.toFixed(3).replace(/\.?0+$/, '') })),
      gstRate: pctStr(p.gstRate),
      tdsPct: pctStr(p.tdsPct),
      gstTdsPct: pctStr(p.gstTdsPct),
      labourCessPct: pctStr(p.labourCessPct),
      ldRatePct: pctStr(p.ldRatePct),
      ldPeriod: p.ldPeriod,
      ldCapPct: pctStr(p.ldCapPct),
      ld: ld ? ContractsService.ldExposure(p, approvedVariations, extensionDays, ld) : null,
      currency: p.currency,
      exchangeRate: fxRate(p.exchangeRate),
      updatedAt: iso(p.updatedAt)!,
    };
  }

  /**
   * Liquidated damages (v4 item 50): days past the completion date after extensions of time, at the contract's rate
   * per day, week or month (part periods pro rata) of the revised contract value, up to the cap. Also the forecast to
   * the schedule's last planned finish, and that forecast if the excusable days not yet granted are granted.
   */
  static ldExposure(
    p: Pick<Row, 'id' | 'code' | 'name' | 'status' | 'contractValue' | 'endDate' | 'ldRatePct' | 'ldPeriod' | 'ldCapPct' | 'handover'>,
    approvedVariations: Prisma.Decimal,
    extensionDays: number,
    inputs: LdInputs,
  ): LdExposureDto | null {
    const endDate = dateOnly(p.endDate);
    if (!p.contractValue || !endDate) return null;
    const today = todayIn();
    const value = p.contractValue.add(approvedVariations);
    const revisedEndDate = revisedCompletion(endDate, extensionDays)!;
    const completedOn = dateOnly(p.handover?.completedOn ?? null);
    const forecastFinish = completedOn ?? (inputs.scheduleFinish && inputs.scheduleFinish > today ? inputs.scheduleFinish : today);
    let excusable = 0;
    let contractor = 0;
    for (const d of inputs.delays) {
      const lost = d.daysLost ?? delayDays(dateOnly(d.delayStart), dateOnly(d.delayEnd), today) ?? 0;
      if (d.responsibleParty && EXCUSABLE.includes(d.responsibleParty)) excusable += lost;
      else if (d.responsibleParty === 'CONTRACTOR') contractor += lost;
    }
    const daysLate = daysAfter(revisedEndDate, completedOn ?? today);
    const forecastDaysLate = daysAfter(revisedEndDate, forecastFinish);
    const eotPendingDays = Math.max(0, excusable - extensionDays);
    const cap = value.mul(p.ldCapPct).div(100).toDecimalPlaces(2);
    const ld = (days: number) => Prisma.Decimal.min(value.mul(p.ldRatePct).div(100).mul(days).div(LD_PERIOD_DAYS[p.ldPeriod]).toDecimalPlaces(2), cap);
    const forecast = ld(forecastDaysLate);
    return {
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      projectStatus: p.status,
      ldRatePct: pctStr(p.ldRatePct),
      ldPeriod: p.ldPeriod,
      ldCapPct: pctStr(p.ldCapPct),
      contractValue: money(value)!,
      endDate,
      extensionDays,
      revisedEndDate,
      completedOn,
      forecastFinish,
      daysLate,
      forecastDaysLate,
      excusableDaysLost: excusable,
      contractorDaysLost: contractor,
      eotPendingDays,
      ldToDate: money(ld(daysLate))!,
      ldForecast: money(forecast)!,
      ldForecastWithEot: money(ld(Math.max(0, forecastDaysLate - eotPendingDays)))!,
      ldCap: money(cap)!,
      capReached: p.ldRatePct.gt(0) && forecast.gte(cap) && cap.gt(0),
    };
  }

  /** Delays and the last planned finish per project, for liquidated damages. */
  private async ldInputs(projectIds: string[]): Promise<Map<string, LdInputs>> {
    const [delays, finishes, milestones] = await Promise.all([
      this.prisma.risk.findMany({ where: { projectId: { in: projectIds }, kind: 'DELAY' }, select: { projectId: true, daysLost: true, delayStart: true, delayEnd: true, responsibleParty: true } }),
      this.prisma.activity.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds } }, _max: { plannedEnd: true } }),
      this.prisma.milestone.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds } }, _max: { dueDate: true } }),
    ]);
    const out = new Map<string, LdInputs>(projectIds.map((id) => [id, { delays: [], scheduleFinish: null }]));
    for (const d of delays) out.get(d.projectId)!.delays.push(d);
    // The Gantt's planned finish: the latest activity end or milestone due date, so the header and the LD agree.
    for (const f of [...finishes.map((f) => ({ projectId: f.projectId, d: dateOnly(f._max.plannedEnd) })), ...milestones.map((m) => ({ projectId: m.projectId, d: dateOnly(m._max.dueDate) }))]) {
      const i = out.get(f.projectId)!;
      if (f.d && (!i.scheduleFinish || f.d > i.scheduleFinish)) i.scheduleFinish = f.d;
    }
    return out;
  }

  /** Liquidated damages exposure of every project the user can see that has a contract value and completion date, largest forecast first. */
  async ldExposureList(user: RequestUser): Promise<LdExposureDto[]> {
    if (!canViewContract(user.roleKey)) throw new ForbiddenException('Your role cannot see contract terms');
    const rows = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), contractValue: { not: null }, endDate: { not: null }, status: { in: ['ACTIVE', 'ON_HOLD', 'COMPLETED'] } },
      include,
    });
    const inputs = await this.ldInputs(rows.map((r) => r.id));
    return rows
      .map((p) => {
        const dto = this.toDto(p, inputs.get(p.id)!);
        return dto.ld;
      })
      .filter((x): x is LdExposureDto => !!x)
      .sort((a, b) => Number(b.ldForecast) - Number(a.ldForecast) || b.forecastDaysLate - a.forecastDaysLate || a.projectName.localeCompare(b.projectName));
  }

  async get(user: RequestUser, projectId: string): Promise<ProjectContractDto> {
    if (!canViewContract(user.roleKey)) throw new ForbiddenException('Your role cannot see contract terms');
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Project not found');
    return this.toDto(row, (await this.ldInputs([row.id])).get(row.id));
  }

  async update(user: RequestUser, projectId: string, dto: UpdateContractDto): Promise<ProjectContractDto> {
    if (!canEditContract(user.roleKey)) throw new ForbiddenException('Your role cannot change contract terms');
    await this.access.assertCanAccessProject(user, projectId);
    const data: Prisma.ProjectUncheckedUpdateInput = {};
    if (dto.clientId !== undefined) {
      if (dto.clientId) {
        const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId: user.organizationId }, select: { name: true } });
        if (!client) throw new NotFoundException('Client not found');
        data.clientName = client.name;
      }
      data.clientId = dto.clientId;
    }
    if (dto.workOrderNo !== undefined) data.workOrderNo = dto.workOrderNo;
    if (dto.agreementNo !== undefined) data.agreementNo = dto.agreementNo;
    if (dto.agreementDate !== undefined) data.agreementDate = dto.agreementDate ? parseDate(dto.agreementDate) : null;
    if (dto.contractValue !== undefined) data.contractValue = dto.contractValue === null ? null : new Prisma.Decimal(dto.contractValue);
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? parseDate(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? parseDate(dto.endDate) : null;
    for (const k of CONTRACT_PERCENT_FIELDS) {
      const v = dto[k];
      if (v === undefined) continue;
      const n = new Prisma.Decimal(v);
      const max = k === 'gstRate' ? MAX_GST_RATE : 100;
      if (n.lt(0) || n.gt(max)) throw new BadRequestException(`${k} must be between 0 and ${max}`);
      data[k] = n;
    }
    if (dto.mobilisationAdvance !== undefined) {
      if (Number(dto.mobilisationAdvance) < 0) throw new BadRequestException('The mobilisation advance cannot be negative');
      data.mobilisationAdvance = new Prisma.Decimal(dto.mobilisationAdvance);
    }
    if (dto.defectLiabilityMonths !== undefined) data.defectLiabilityMonths = dto.defectLiabilityMonths;
    if (dto.clientPaymentDays !== undefined) data.clientPaymentDays = dto.clientPaymentDays;
    if (dto.noticeDays !== undefined) data.noticeDays = dto.noticeDays;
    if (dto.measureTolerancePct !== undefined) data.measureTolerancePct = dto.measureTolerancePct;
    if (dto.priceVariation !== undefined) data.priceVariation = dto.priceVariation;
    for (const k of ['ldRatePct', 'ldCapPct'] as const) {
      const v = dto[k];
      if (v === undefined) continue;
      const n = new Prisma.Decimal(v);
      if (n.lt(0) || n.gt(100)) throw new BadRequestException(`${k} must be between 0 and 100`);
      data[k] = n;
    }
    if (dto.ldPeriod !== undefined) data.ldPeriod = dto.ldPeriod;
    if (dto.currency !== undefined || dto.exchangeRate !== undefined) Object.assign(data, await this.currencyChange(projectId, dto));
    const start = dto.startDate !== undefined ? dto.startDate : undefined;
    const end = dto.endDate !== undefined ? dto.endDate : undefined;
    if (start !== undefined || end !== undefined) {
      const cur = await this.prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true, endDate: true } });
      const s = start !== undefined ? start : dateOnly(cur?.startDate);
      const e = end !== undefined ? end : dateOnly(cur?.endDate);
      if (s && e && e < s) throw new BadRequestException('The completion date cannot be before the start date');
    }
    await this.prisma.project.update({ where: { id: projectId }, data });
    await this.audit.log(user, 'PROJECT', projectId, 'CONTRACT_UPDATED');
    return this.get(user, projectId);
  }

  /**
   * The contract currency (item 130): a project in another currency keeps its figures in rupees at the contract rate, so
   * the rate is needed and cannot move once a bill or receipt has been kept at it.
   */
  private async currencyChange(projectId: string, dto: UpdateContractDto): Promise<Prisma.ProjectUncheckedUpdateInput> {
    const cur = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { currency: true, exchangeRate: true } });
    const currency = dto.currency ?? cur.currency;
    const rate = currency === 'INR' ? null : dto.exchangeRate !== undefined ? dto.exchangeRate : cur.exchangeRate?.toString() ?? null;
    if (currency !== 'INR' && (!rate || Number(rate) <= 0)) throw new BadRequestException(`Give the rupees to one ${currency}, the rate the contract's figures are kept at`);
    const changed = currency !== cur.currency || (rate === null ? cur.exchangeRate !== null : !cur.exchangeRate || !cur.exchangeRate.eq(rate));
    if (changed) {
      const [bills, receipts] = await Promise.all([this.prisma.raBill.count({ where: { projectId } }), this.prisma.receipt.count({ where: { projectId } })]);
      if (bills || receipts) throw new ConflictException('Bills and receipts of this project are kept at its contract rate, so the currency and rate can no longer change');
    }
    return { currency, exchangeRate: rate === null ? null : new Prisma.Decimal(rate) };
  }

  /**
   * The price variation formula (v4 item 50): the base date and the components, each a share of the work value that
   * moves with an index. Replaces the whole list; bills already prepared keep the components they copied until they
   * are filled in again.
   */
  async setPriceVariation(user: RequestUser, projectId: string, dto: PriceVariationDto): Promise<ProjectContractDto> {
    if (!canEditContract(user.roleKey)) throw new ForbiddenException('Your role cannot change contract terms');
    await this.access.assertCanAccessProject(user, projectId);
    const rows = dto.components.map((c, i) => ({ name: c.name.trim(), sharePct: new Prisma.Decimal(c.sharePct), baseIndex: new Prisma.Decimal(c.baseIndex), sortOrder: i }));
    for (const r of rows) {
      if (!r.name) throw new BadRequestException('Each component needs a name');
      if (r.sharePct.lte(0) || r.sharePct.gt(100)) throw new BadRequestException(`${r.name}: the share must be more than 0 and at most 100%`);
      if (r.baseIndex.lte(0)) throw new BadRequestException(`${r.name}: the base index must be more than 0`);
    }
    if (new Set(rows.map((r) => r.name.toLowerCase())).size < rows.length) throw new BadRequestException('Two components have the same name');
    const total = rows.reduce((s, r) => s.add(r.sharePct), ZERO);
    if (total.gt(100)) throw new BadRequestException(`The shares add up to ${total.toFixed(2)}%; they cannot pass 100%`);
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { pvBaseDate: dto.pvBaseDate ? parseDate(dto.pvBaseDate) : null } });
      await tx.priceVariationComponent.deleteMany({ where: { projectId } });
      await tx.priceVariationComponent.createMany({ data: rows.map((r) => ({ ...r, organizationId: user.organizationId, projectId })) });
    });
    await this.audit.log(user, 'PROJECT', projectId, 'PRICE_VARIATION_UPDATED');
    return this.get(user, projectId);
  }
}
