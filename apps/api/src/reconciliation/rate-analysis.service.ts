import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BoqResourceDto, EstimateItemDto, EstimateLineDto, ProjectEstimateDto, RateAnalysisResultDto } from '@erp/shared';
import { BOQ_RESOURCE_UNITS, RATE_LIBRARY, canSetRateAnalysis, canViewCost, canViewReconciliation, equipmentHourlyRate, pickLibraryItem, sameUnit } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dec, iso, money } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { builtUpRate } from './reconciliation-rules';
import { CopyRateAnalysisDto, EstimateTermsDto, ImportRateAnalysisDto, SaveBoqResourceDto } from './reconciliation.dto';

type D = Prisma.Decimal;
type Tx = Prisma.TransactionClient;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);

/** Six places with trailing zeros dropped, as norms are shown. */
const six = (v: D) => v.toFixed(6).replace(/\.?0+$/, '') || '0';
const pct = (v: D) => v.toFixed(2).replace(/\.?0+$/, '') || '0';
const key = (s: string) => s.trim().toLowerCase();

const RESOURCE_INCLUDE = { updatedBy: { select: { fullName: true } } } satisfies Prisma.BoqResourceInclude;
type ResourceRow = Prisma.BoqResourceGetPayload<{ include: typeof RESOURCE_INCLUDE }>;

const resourceDto = (r: ResourceRow): BoqResourceDto => ({
  id: r.id,
  boqItemId: r.boqItemId,
  kind: r.kind,
  name: r.name,
  qtyPerUnit: six(r.qtyPerUnit),
  note: r.note,
  updatedByName: r.updatedBy.fullName,
  updatedAt: iso(r.updatedAt)!,
});

/** A line to write onto a BOQ item: a material norm or a labour or machine resource. */
type Line = { kind: 'MATERIAL'; itemId: string; qtyPerUnit: D; wastagePct: D; note: string | null } | { kind: 'LABOUR' | 'EQUIPMENT'; name: string; qtyPerUnit: D; note: string | null };

/**
 * Rate analysis and the estimate. A BOQ item's analysis is its material norms (MaterialNorm, also what the
 * reconciliation reads) plus the labour and machine hours one unit takes (BoqResource). It is filled by hand, from the
 * starter library in @erp/shared, from another BOQ item, or from Excel; the estimate prices it at the item master's
 * rates, the labour rates and the company's equipment rates, adds the project's overheads and profit, and sets the
 * built-up rate against the BOQ rate.
 */
@Injectable()
export class RateAnalysisService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  private async assertView(user: RequestUser, projectId: string) {
    if (!canViewReconciliation(user.roleKey)) throw new ForbiddenException('Rate analysis is for the QS, stores, procurement, accounts and approvers');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async assertEdit(user: RequestUser, projectId: string) {
    if (!canSetRateAnalysis(user.roleKey)) throw new ForbiddenException('Only the QS, the project manager, management or admin can change the rate analysis');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async boqItem(projectId: string, id: string) {
    const b = await this.prisma.boqItem.findFirst({ where: { id, projectId }, select: { id: true, itemNo: true, description: true, unit: true } });
    if (!b) throw new BadRequestException('Choose a BOQ item of this project');
    return b;
  }

  private qty(raw: string, what: string) {
    const q = new Dec(raw).toDecimalPlaces(6);
    if (q.lte(0)) throw new BadRequestException(`${what}: enter a quantity per unit above zero`);
    if (q.gte(new Dec('1e12'))) throw new BadRequestException(`${what}: enter a smaller quantity per unit`);
    return q;
  }

  private wastage(raw: string | undefined, what: string) {
    const w = raw === undefined || raw === '' ? ZERO : new Dec(raw).toDecimalPlaces(2);
    if (w.isNegative() || w.gt(100)) throw new BadRequestException(`${what}: enter a wastage between 0 and 100%`);
    return w;
  }

  // Estimate

  async estimate(user: RequestUser, projectId: string): Promise<ProjectEstimateDto> {
    await this.assertView(user, projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, estimateOverheadPct: true, estimateProfitPct: true } });
    if (!project) throw new NotFoundException('Project not found');
    const [boq, norms, resources, labourRates, machines] = await Promise.all([
      this.prisma.boqItem.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }], select: { id: true, itemNo: true, description: true, unit: true, rate: true, originalQty: true, revisedQty: true } }),
      this.prisma.materialNorm.findMany({ where: { projectId }, include: { item: { select: { name: true, unit: true, rate: true } } }, orderBy: { item: { name: 'asc' } } }),
      this.prisma.boqResource.findMany({ where: { projectId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] }),
      this.prisma.labourRate.findMany({ where: { organizationId: user.organizationId }, select: { category: true, dailyRate: true }, orderBy: { category: 'asc' } }),
      this.prisma.equipment.findMany({ where: { organizationId: user.organizationId, isActive: true }, select: { category: true, rate: true, rateUnit: true } }),
    ]);
    const values = canViewCost(user.roleKey);
    const labourRate = new Map(labourRates.map((l) => [key(l.category), l.dailyRate]));
    // A category's hourly rate is the average over the company's machines in it that have a rate.
    const perCategory = new Map<string, number[]>();
    for (const m of machines) {
      if (!m.category || !m.rate) continue;
      const k = key(m.category);
      perCategory.set(k, [...(perCategory.get(k) ?? []), equipmentHourlyRate(m.rate.toNumber(), m.rateUnit)]);
    }
    const machineRate = new Map([...perCategory].map(([k, rs]) => [k, new Dec(rs.reduce((s, r) => s + r, 0) / rs.length).toDecimalPlaces(2)]));
    const categories = [...new Set(machines.flatMap((m) => (m.category ? [m.category.trim()] : [])))].sort((a, b) => a.localeCompare(b));

    const overheadPct = project.estimateOverheadPct;
    const profitPct = project.estimateProfitPct;
    let boqAmount = ZERO;
    let estimateAmount = ZERO;
    let analysed = 0;
    const items: EstimateItemDto[] = boq.map((b) => {
      const lines: (Omit<EstimateLineDto, 'quantity' | 'rate' | 'amount'> & { rateD: D | null; qtyD: D; wastageD: D | null })[] = [
        ...norms
          .filter((n) => n.boqItemId === b.id)
          .map((n) => ({ kind: 'MATERIAL' as const, id: n.id, itemId: n.itemId, name: n.item.name, unit: n.item.unit, qtyPerUnit: six(n.qtyPerUnit), wastagePct: pct(n.wastagePct), note: n.note, rateD: n.item.rate, qtyD: n.qtyPerUnit, wastageD: n.wastagePct })),
        ...resources
          .filter((r) => r.boqItemId === b.id)
          .map((r) => ({
            kind: r.kind,
            id: r.id,
            itemId: null,
            name: r.name,
            unit: BOQ_RESOURCE_UNITS[r.kind],
            qtyPerUnit: six(r.qtyPerUnit),
            wastagePct: null,
            note: r.note,
            rateD: (r.kind === 'LABOUR' ? labourRate.get(key(r.name)) : machineRate.get(key(r.name))) ?? null,
            qtyD: r.qtyPerUnit,
            wastageD: null,
          })),
      ];
      const quantity = b.revisedQty ?? b.originalQty;
      const priced = builtUpRate(lines.map((l) => ({ kind: l.kind, qtyPerUnit: l.qtyD, wastagePct: l.wastageD, rate: l.rateD })), overheadPct, profitPct, b.rate);
      const has = lines.length > 0;
      if (has) {
        analysed++;
        boqAmount = boqAmount.plus(quantity.mul(b.rate));
        estimateAmount = estimateAmount.plus(quantity.mul(priced.builtUpRate));
      }
      const m = (v: D) => (values ? money(v) : null);
      return {
        boqItemId: b.id,
        itemNo: b.itemNo,
        description: b.description,
        unit: b.unit,
        quantity: dec(quantity)!,
        lines: lines.map(({ rateD, qtyD: _q, wastageD: _w, ...l }, i) => ({
          ...l,
          quantity: six(priced.lines[i].quantity),
          rate: values && rateD ? money(rateD) : null,
          amount: values && priced.lines[i].amount ? money(priced.lines[i].amount!) : null,
        })),
        boqRate: m(b.rate),
        material: has ? m(priced.material) : null,
        labour: has ? m(priced.labour) : null,
        equipment: has ? m(priced.equipment) : null,
        cost: has ? m(priced.cost) : null,
        overheads: has ? m(priced.overheads) : null,
        profit: has ? m(priced.profit) : null,
        builtUpRate: has ? m(priced.builtUpRate) : null,
        margin: has ? m(priced.margin) : null,
        marginPct: has && values ? priced.marginPct : null,
        unpriced: priced.unpriced,
      };
    });
    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      overheadPct: pct(overheadPct),
      profitPct: pct(profitPct),
      items,
      analysedCount: analysed,
      boqAmount: values ? money(boqAmount) : null,
      estimateAmount: values ? money(estimateAmount.toDecimalPlaces(2)) : null,
      labourCategories: labourRates.map((l) => l.category),
      equipmentCategories: categories,
      canEdit: canSetRateAnalysis(user.roleKey),
      canSeeValues: values,
    };
  }

  async setTerms(user: RequestUser, projectId: string, dto: EstimateTermsDto): Promise<{ overheadPct: string; profitPct: string }> {
    await this.assertEdit(user, projectId);
    if (!canViewCost(user.roleKey)) throw new ForbiddenException('Overheads and profit are set by those who see cost');
    const overhead = this.wastage(dto.overheadPct, 'Overheads');
    const profit = this.wastage(dto.profitPct, 'Profit');
    await this.prisma.project.update({ where: { id: projectId }, data: { estimateOverheadPct: overhead, estimateProfitPct: profit } });
    await this.audit.log(user, 'PROJECT', projectId, 'ESTIMATE_TERMS_SET', `Overheads ${pct(overhead)}%, profit ${pct(profit)}%`);
    return { overheadPct: pct(overhead), profitPct: pct(profit) };
  }

  // Labour and machine lines

  async saveResource(user: RequestUser, projectId: string, dto: SaveBoqResourceDto): Promise<BoqResourceDto> {
    await this.assertEdit(user, projectId);
    const boq = await this.boqItem(projectId, dto.boqItemId);
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException(dto.kind === 'LABOUR' ? 'Name the trade' : 'Name the equipment category');
    const qtyPerUnit = this.qty(dto.qtyPerUnit, name);
    const note = dto.note === undefined ? undefined : dto.note?.trim() || null;
    let saved: ResourceRow;
    try {
      if (dto.id) {
        const cur = await this.prisma.boqResource.findFirst({ where: { id: dto.id, projectId, boqItemId: boq.id } });
        if (!cur) throw new NotFoundException('That line is no longer in the rate analysis');
        saved = await this.prisma.boqResource.update({ where: { id: cur.id }, data: { kind: dto.kind, name, qtyPerUnit, ...(note !== undefined ? { note } : {}), updatedById: user.id }, include: RESOURCE_INCLUDE });
      } else {
        saved = await this.prisma.boqResource.upsert({
          where: { boqItemId_kind_name: { boqItemId: boq.id, kind: dto.kind, name } },
          create: { organizationId: user.organizationId, projectId, boqItemId: boq.id, kind: dto.kind, name, qtyPerUnit, note: note ?? null, updatedById: user.id },
          update: { qtyPerUnit, ...(note !== undefined ? { note } : {}), updatedById: user.id },
          include: RESOURCE_INCLUDE,
        });
      }
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${boq.itemNo} already has ${name}; change that line instead`);
      throw e;
    }
    await this.audit.log(user, 'PROJECT', projectId, 'RATE_ANALYSIS_SET', `${boq.itemNo}: ${name} ${six(qtyPerUnit)} ${BOQ_RESOURCE_UNITS[dto.kind]} per ${boq.unit}`);
    return resourceDto(saved);
  }

  async removeResource(user: RequestUser, projectId: string, id: string): Promise<{ ok: true }> {
    await this.assertEdit(user, projectId);
    const r = await this.prisma.boqResource.findFirst({ where: { id, projectId }, include: { boqItem: { select: { itemNo: true } } } });
    if (!r) throw new NotFoundException('That line is no longer in the rate analysis');
    await this.prisma.boqResource.delete({ where: { id: r.id } });
    await this.audit.log(user, 'PROJECT', projectId, 'RATE_ANALYSIS_REMOVED', `${r.boqItem.itemNo}: ${r.name}`);
    return { ok: true };
  }

  // Copy, library and import

  /** Write lines onto a BOQ item: norms by store item, resources by kind and name; `replace` clears the item first. */
  private async write(tx: Tx, user: RequestUser, projectId: string, boqItemId: string, lines: Line[], replace: boolean) {
    let added = 0;
    let updated = 0;
    if (replace) {
      await tx.materialNorm.deleteMany({ where: { boqItemId } });
      await tx.boqResource.deleteMany({ where: { boqItemId } });
    }
    for (const l of lines) {
      if (l.kind === 'MATERIAL') {
        const had = await tx.materialNorm.findUnique({ where: { boqItemId_itemId: { boqItemId, itemId: l.itemId } }, select: { id: true } });
        await tx.materialNorm.upsert({
          where: { boqItemId_itemId: { boqItemId, itemId: l.itemId } },
          create: { organizationId: user.organizationId, projectId, boqItemId, itemId: l.itemId, qtyPerUnit: l.qtyPerUnit, wastagePct: l.wastagePct, note: l.note, updatedById: user.id },
          update: { qtyPerUnit: l.qtyPerUnit, wastagePct: l.wastagePct, note: l.note, updatedById: user.id },
        });
        if (had) updated++;
        else added++;
      } else {
        const had = await tx.boqResource.findUnique({ where: { boqItemId_kind_name: { boqItemId, kind: l.kind, name: l.name } }, select: { id: true } });
        await tx.boqResource.upsert({
          where: { boqItemId_kind_name: { boqItemId, kind: l.kind, name: l.name } },
          create: { organizationId: user.organizationId, projectId, boqItemId, kind: l.kind, name: l.name, qtyPerUnit: l.qtyPerUnit, note: l.note, updatedById: user.id },
          update: { qtyPerUnit: l.qtyPerUnit, note: l.note, updatedById: user.id },
        });
        if (had) updated++;
        else added++;
      }
    }
    return { added, updated };
  }

  /** Fill a BOQ item from another BOQ item (any project the user can open) or from an entry of the starter library. */
  async copy(user: RequestUser, projectId: string, dto: CopyRateAnalysisDto): Promise<RateAnalysisResultDto> {
    await this.assertEdit(user, projectId);
    const target = await this.boqItem(projectId, dto.boqItemId);
    if (!dto.fromBoqItemId === !dto.libraryKey) throw new BadRequestException('Choose a BOQ item to copy from, or an entry of the library');
    const lines: Line[] = [];
    const skipped: string[] = [];
    let from: string;
    if (dto.fromBoqItemId) {
      if (dto.fromBoqItemId === target.id) throw new BadRequestException('Choose another BOQ item to copy from');
      const src = await this.prisma.boqItem.findFirst({
        where: { id: dto.fromBoqItemId, organizationId: user.organizationId },
        select: { itemNo: true, unit: true, projectId: true, project: { select: { code: true } }, materialNorms: true, resources: true },
      });
      if (!src) throw new NotFoundException('The BOQ item to copy from was not found');
      await this.access.assertCanAccessProject(user, src.projectId);
      if (!src.materialNorms.length && !src.resources.length) throw new BadRequestException(`${src.itemNo} has no rate analysis to copy`);
      if (!sameUnit(src.unit, target.unit)) skipped.push(`${src.itemNo} is in ${src.unit} and ${target.itemNo} in ${target.unit}: check the quantities`);
      for (const n of src.materialNorms) lines.push({ kind: 'MATERIAL', itemId: n.itemId, qtyPerUnit: n.qtyPerUnit, wastagePct: n.wastagePct, note: n.note });
      for (const r of src.resources) lines.push({ kind: r.kind, name: r.name, qtyPerUnit: r.qtyPerUnit, note: r.note });
      from = src.projectId === projectId ? src.itemNo : `${src.project.code} ${src.itemNo}`;
    } else {
      const entry = RATE_LIBRARY.find((e) => e.key === dto.libraryKey);
      if (!entry) throw new BadRequestException('That library entry does not exist');
      if (!sameUnit(entry.unit, target.unit)) skipped.push(`The library's ${entry.name} is per ${entry.unit} and ${target.itemNo} is in ${target.unit}: check the quantities`);
      const words = [...new Set(entry.materials.flatMap((m) => m.match.map((set) => set[0])))];
      const items = await this.prisma.item.findMany({ where: { organizationId: user.organizationId, OR: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })) }, select: { id: true, name: true, unit: true } });
      for (const m of entry.materials) {
        const pick = pickLibraryItem(m, items, target.description);
        if (pick.item) lines.push({ kind: 'MATERIAL', itemId: pick.item.id, qtyPerUnit: new Dec(m.qtyPerUnit), wastagePct: new Dec(m.wastagePct), note: `Library: ${entry.name}` });
        else if (pick.wrongUnit) skipped.push(`${m.label}: ${pick.wrongUnit.name} is kept in ${pick.wrongUnit.unit}, the library counts ${m.unit}; add it by hand`);
        else skipped.push(`${m.label}: no store item matches; add it to the item master, then add the norm`);
      }
      for (const r of entry.resources) lines.push({ kind: r.kind, name: r.name, qtyPerUnit: new Dec(r.qtyPerUnit), note: r.note ?? `Library: ${entry.name}` });
      from = `the library's ${entry.name}`;
    }
    const res = await this.prisma.$transaction((tx) => this.write(tx, user, projectId, target.id, lines, !!dto.replace));
    await this.audit.log(user, 'PROJECT', projectId, 'RATE_ANALYSIS_COPIED', `${target.itemNo} from ${from}: ${res.added} added, ${res.updated} changed`);
    return { ...res, skipped };
  }

  /**
   * Rate analysis from Excel: one row per line (BOQ item no., kind, name, quantity per unit, wastage). Every row is
   * checked first; any error refuses the whole sheet with the rows to fix, so a sheet is never half imported.
   */
  async import(user: RequestUser, projectId: string, dto: ImportRateAnalysisDto): Promise<RateAnalysisResultDto> {
    await this.assertEdit(user, projectId);
    const boq = new Map((await this.prisma.boqItem.findMany({ where: { projectId }, select: { id: true, itemNo: true } })).map((b) => [key(b.itemNo), b]));
    const names = [...new Set(dto.rows.filter((r) => r.kind === 'MATERIAL').map((r) => r.name.trim()))];
    const items = names.length ? await this.prisma.item.findMany({ where: { organizationId: user.organizationId, OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) }, select: { id: true, name: true, unit: true } }) : [];
    const errors: string[] = [];
    const byItem = new Map<string, Line[]>();
    const seen = new Set<string>();
    for (const r of dto.rows) {
      const at = `Row ${r.row}`;
      const b = boq.get(key(r.boqItemNo));
      if (!b) {
        errors.push(`${at}: BOQ item ${r.boqItemNo} is not in this project`);
        continue;
      }
      const name = r.name.trim().replace(/\s+/g, ' ');
      let line: Line;
      try {
        const qtyPerUnit = this.qty(r.qtyPerUnit, at);
        if (r.kind === 'MATERIAL') {
          const matches = items.filter((i) => key(i.name) === key(name) && (!r.unit || sameUnit(i.unit, r.unit)));
          if (!matches.length) throw new BadRequestException(`${at}: no store item is called ${name}${r.unit ? ` in ${r.unit}` : ''}`);
          if (matches.length > 1) throw new BadRequestException(`${at}: ${name} is kept in ${matches.map((m) => m.unit).join(' and ')}; fill in the unit`);
          line = { kind: 'MATERIAL', itemId: matches[0].id, qtyPerUnit, wastagePct: this.wastage(r.wastagePct, at), note: r.note?.trim() || null };
        } else {
          line = { kind: r.kind, name, qtyPerUnit, note: r.note?.trim() || null };
        }
      } catch (e) {
        errors.push(e instanceof BadRequestException ? (e.message as string) : `${at}: ${String(e)}`);
        continue;
      }
      const dup = `${b.id}:${line.kind}:${line.kind === 'MATERIAL' ? line.itemId : key(line.name)}`;
      if (seen.has(dup)) {
        errors.push(`${at}: ${name} is on ${r.boqItemNo} twice`);
        continue;
      }
      seen.add(dup);
      byItem.set(b.id, [...(byItem.get(b.id) ?? []), line]);
    }
    if (errors.length) throw new BadRequestException(`Nothing was imported. Fix ${errors.length === 1 ? 'this row' : `these ${errors.length} rows`}: ${errors.slice(0, 8).join('; ')}${errors.length > 8 ? `; and ${errors.length - 8} more` : ''}`);
    const res = await this.prisma.$transaction(
      async (tx) => {
        let added = 0;
        let updated = 0;
        for (const [boqItemId, lines] of byItem) {
          const r = await this.write(tx, user, projectId, boqItemId, lines, false);
          added += r.added;
          updated += r.updated;
        }
        return { added, updated };
      },
      { timeout: 60_000 },
    );
    await this.audit.log(user, 'PROJECT', projectId, 'RATE_ANALYSIS_IMPORTED', `${dto.rows.length} rows for ${byItem.size} BOQ items: ${res.added} added, ${res.updated} changed`);
    return { ...res, skipped: [] };
  }
}
