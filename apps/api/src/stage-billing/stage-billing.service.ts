import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_SLIPPAGE_TIERS, billsByStages, canEditContract, canPrepareBill, canViewContract, type BillingBreakupDto, type BillingComponentDto, type MilestoneRowDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, fxRate, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { loadStageEvidence } from './stage-evidence';
import { breakupProblems, componentShares, monthEnd, monthsBetween, round3, stageLine, stageValue } from './stage-billing-rules';
import { PROJECT_SELECT, ZERO, compareCodes, createStandardBreakup, num, proposedGrid, stagePlan, type BillStagePlan } from './stage-plan';
import { BillingTermsDto, ClaimStageDto, SaveBillingComponentDto, SaveBillingStageDto, SaveMilestoneGridDto, SaveSlippageTiersDto, StandardBreakupDto } from './stage-billing.dto';

export type { BillStagePlan } from './stage-plan';

type Db = Prisma.TransactionClient;
type D = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const pctStr = (d: D | null) => (d === null ? null : d.toFixed(4).replace(/\.?0+$/, '') || '0');

const COMPONENT_INCLUDE = {
  workElement: { select: { code: true, name: true } },
  stages: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.BillingComponentInclude;

/**
 * The billing break-up of a lump-sum contract (item 129, ARCHITECTURE "Stage billing"): components with their share of
 * the lump sum, their payment stages with the evidence each reads, the milestone grid and its slippage tiers, and what an
 * RA bill takes from them (`planFor`, called by `RaBillsService`). The parts the demo seed runs too are in `stage-plan.ts`.
 */
@Injectable()
export class StageBillingService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  private async assertView(user: RequestUser, projectId: string) {
    if (!canViewContract(user.roleKey)) throw new ForbiddenException('Your role cannot see the billing break-up');
    await this.access.assertCanAccessProject(user, projectId);
  }

  /** Components and stages are set by those who prepare bills; the terms, grid and tiers by those who change the contract. */
  private async assertEdit(user: RequestUser, projectId: string, terms = false) {
    if (terms ? !canEditContract(user.roleKey) : !canPrepareBill(user.roleKey)) throw new ForbiddenException(terms ? 'Your role cannot change contract terms' : 'Your role cannot change the billing break-up');
    await this.access.assertCanAccessProject(user, projectId);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Reading the break-up

  async breakup(user: RequestUser, projectId: string): Promise<BillingBreakupDto> {
    await this.assertView(user, projectId);
    const today = todayIn();
    const [project, components, targets, tiers, billed, bills] = await Promise.all([
      this.prisma.project.findFirstOrThrow({ where: { id: projectId }, select: PROJECT_SELECT }),
      this.prisma.billingComponent.findMany({ where: { projectId }, include: COMPONENT_INCLUDE }),
      this.prisma.milestoneTarget.findMany({ where: { projectId }, orderBy: { month: 'asc' } }),
      this.prisma.slippageTier.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.raBillStageLine.findMany({
        where: { bill: { projectId, status: 'APPROVED' } },
        select: { stageId: true, thisPct: true, certifiedPct: true, bill: { select: { measuredUpTo: true } } },
      }),
      this.prisma.raBill.count({ where: { projectId } }),
    ]);
    components.sort(compareCodes);
    const stages = components.flatMap((c) => c.stages.map((s) => ({ ...s, component: { workElementId: c.workElementId } })));
    const [evidence, activityRows, itemRows, deliverableRows, packageRows] = await Promise.all([
      loadStageEvidence(this.prisma, projectId, today, stages),
      this.prisma.activity.findMany({ where: { id: { in: stages.flatMap((s) => s.activityIds) } }, select: { id: true, name: true } }),
      this.prisma.item.findMany({ where: { id: { in: stages.flatMap((s) => s.itemIds) } }, select: { id: true, name: true } }),
      this.prisma.engineeringDeliverable.findMany({ where: { id: { in: stages.flatMap((s) => s.deliverableIds) } }, select: { id: true, code: true, title: true } }),
      this.prisma.procurementPackage.findMany({ where: { id: { in: stages.flatMap((s) => s.packageIds) } }, select: { id: true, code: true, name: true } }),
    ]);
    const activityName = new Map(activityRows.map((a) => [a.id, a.name]));
    const itemName = new Map(itemRows.map((i) => [i.id, i.name]));
    const deliverableName = new Map(deliverableRows.map((d) => [d.id, `${d.code} ${d.title}`]));
    const packageName = new Map(packageRows.map((p) => [p.id, `${p.code} ${p.name}`]));
    const lumpSum = project.lumpSumValue ?? project.contractValue ?? ZERO;
    const shares = componentShares(lumpSum, components);
    const billedOf = new Map<string, number>();
    for (const l of billed) billedOf.set(l.stageId, (billedOf.get(l.stageId) ?? 0) + num(l.certifiedPct ?? l.thisPct));

    const dtos: BillingComponentDto[] = components.map((c) => {
      const share = shares.get(c.id);
      const stageDtos = c.stages.map((s) => {
        const ev = evidence.get(s.id) ?? { pct: 0, text: '' };
        return {
          id: s.id,
          componentId: c.id,
          name: s.name,
          pct: pctStr(s.pct)!,
          trigger: s.trigger,
          activityIds: s.activityIds,
          activityNames: s.activityIds.map((id) => activityName.get(id) ?? 'An activity since removed'),
          itemIds: s.itemIds,
          itemNames: s.itemIds.map((id) => itemName.get(id) ?? 'An item since removed'),
          scopeQty: s.scopeQty ? s.scopeQty.toFixed(3).replace(/\.?0+$/, '') : null,
          achievedOn: dateOnly(s.achievedOn),
          evidence: s.evidence,
          deliverableIds: s.deliverableIds,
          deliverableNames: s.deliverableIds.map((id) => deliverableName.get(id) ?? 'A deliverable since removed'),
          packageIds: s.packageIds,
          packageNames: s.packageIds.map((id) => packageName.get(id) ?? 'A package since removed'),
          packageStage: s.packageStage,
          value: money(share ? stageValue(share.value, s.pct) : ZERO)!,
          evidencePct: ev.pct,
          evidenceText: ev.text,
          billedPct: round3(billedOf.get(s.id) ?? 0),
        };
      });
      return {
        id: c.id,
        parentId: c.parentId,
        code: c.code,
        name: c.name,
        sharePct: pctStr(c.sharePct),
        basis: c.basis,
        workElementId: c.workElementId,
        workElementLabel: c.workElement ? `${c.workElement.code} ${c.workElement.name}` : null,
        effectiveSharePct: share?.sharePct ?? 0,
        value: share ? money(share.value) : null,
        billedPct: round3(c.stages.reduce((s, st) => s + (num(st.pct) * (billedOf.get(st.id) ?? 0)) / 100, 0)),
        stages: stageDtos,
      };
    });
    // A part's billed % rolls up to its parent by the parts' values.
    for (const c of dtos.filter((x) => dtos.some((k) => k.parentId === x.id))) {
      const kids = dtos.filter((k) => k.parentId === c.id && k.value);
      const total = kids.reduce((s, k) => s + Number(k.value), 0);
      c.billedPct = total > 0 ? round3(kids.reduce((s, k) => s + Number(k.value) * k.billedPct, 0) / total) : 0;
    }

    const start = dateOnly(project.startDate);
    const end = dateOnly(project.endDate);
    const months = start && end ? monthsBetween(start, end) : [...new Set(targets.map((t) => dateOnly(t.month)!))];
    const top = dtos.filter((c) => !c.parentId && c.basis === 'STAGES');
    const grid: MilestoneRowDto[] = top.map((c) => ({
      componentId: c.id,
      code: c.code,
      name: c.name,
      targets: months.map((m) => {
        const t = targets.find((x) => x.componentId === c.id && dateOnly(x.month) === m);
        return t ? num(t.cumulativePct) : null;
      }),
      actual: months.map((m) => (monthEnd(m) > today && m > today ? null : round3(this.billedShareBy(c.id, dtos, billed, monthEnd(m))))),
    }));

    return {
      projectId,
      stageBilling: billsByStages(project.contractModel) && components.length > 0,
      contractModel: project.contractModel,
      currency: project.currency,
      exchangeRate: fxRate(project.exchangeRate),
      lumpSum: money(lumpSum),
      lumpSumSet: project.lumpSumValue !== null,
      tenderFactor: (project.tenderFactor ?? D(1)).toFixed(6).replace(/\.?0+$/, ''),
      advanceRecoveryFromPct: pctStr(project.advanceRecoveryFromPct),
      advanceRecoveryToPct: pctStr(project.advanceRecoveryToPct),
      components: dtos,
      problems: components.length ? breakupProblems(components, stages) : [],
      tiers: (tiers.length ? tiers.map((t) => ({ fromPct: t.fromPct, toPct: t.toPct, withheldPct: t.withheldPct })) : DEFAULT_SLIPPAGE_TIERS.map((t) => ({ fromPct: D(t.fromPct), toPct: t.toPct === null ? null : D(t.toPct), withheldPct: D(t.withheldPct) }))).map((t) => ({
        fromPct: pctStr(t.fromPct)!,
        toPct: pctStr(t.toPct),
        withheldPct: pctStr(t.withheldPct)!,
      })),
      defaultTiers: !tiers.length,
      months,
      grid,
      hasBills: bills > 0,
      canEdit: canPrepareBill(user.roleKey),
      canEditTerms: canEditContract(user.roleKey),
    };
  }

  /** A top-level component's billed % of its value by a day (approved bills whose measurements end by then). */
  private billedShareBy(componentId: string, dtos: BillingComponentDto[], billed: { stageId: string; thisPct: D; certifiedPct: D | null; bill: { measuredUpTo: Date } }[], day: string): number {
    const leaves = (id: string): BillingComponentDto[] => {
      const kids = dtos.filter((k) => k.parentId === id);
      return kids.length ? kids.flatMap((k) => leaves(k.id)) : dtos.filter((d) => d.id === id);
    };
    const own = dtos.find((d) => d.id === componentId);
    const total = Number(own?.value ?? 0);
    if (total <= 0) return 0;
    let sum = 0;
    for (const leaf of leaves(componentId)) {
      for (const s of leaf.stages) {
        const pct = billed.filter((b) => b.stageId === s.id && dateOnly(b.bill.measuredUpTo)! <= day).reduce((x, b) => x + num(b.certifiedPct ?? b.thisPct), 0);
        sum += (Number(s.value) * pct) / 100;
      }
    }
    return (sum / total) * 100;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Changing it

  private async billedStageIds(projectId: string) {
    return new Set((await this.prisma.raBillStageLine.findMany({ where: { bill: { projectId } }, select: { stageId: true }, distinct: ['stageId'] })).map((l) => l.stageId));
  }

  /** The standard break-up from the work breakdown (`createStandardBreakup`), only while no bill has taken its stages. */
  async applyStandard(user: RequestUser, projectId: string, dto: StandardBreakupDto) {
    await this.assertEdit(user, projectId);
    const existing = await this.prisma.billingComponent.count({ where: { projectId } });
    if (existing && !dto.replace) throw new ConflictException('The project has a billing break-up. Replace it, or change it line by line.');
    if (existing && (await this.billedStageIds(projectId)).size) throw new ConflictException('Bills have been made on this break-up, so it can only be changed line by line');
    await this.prisma.$transaction((tx) => createStandardBreakup(tx, user.organizationId, projectId));
    await this.audit.log(user, 'PROJECT', projectId, 'BILLING_BREAKUP', existing ? 'Standard break-up applied again' : 'Standard break-up applied');
    return this.breakup(user, projectId);
  }

  private async assertNotBilled(projectId: string, stageIds: string[], what: string) {
    if (!stageIds.length) return;
    const n = await this.prisma.raBillStageLine.count({ where: { stageId: { in: stageIds }, bill: { projectId } } });
    if (n) throw new ConflictException(`${what} is on a bill already, so it cannot be removed`);
  }

  async saveComponent(user: RequestUser, projectId: string, dto: SaveBillingComponentDto) {
    await this.assertEdit(user, projectId);
    const current = dto.id ? await this.prisma.billingComponent.findFirst({ where: { id: dto.id, projectId }, include: { stages: { select: { id: true } } } }) : null;
    if (dto.id && !current) throw new NotFoundException('Component not found');
    if (dto.parentId) {
      const parent = await this.prisma.billingComponent.findFirst({ where: { id: dto.parentId, projectId }, select: { id: true, parentId: true } });
      if (!parent) throw new BadRequestException('Choose a component of this project as the parent');
      if (parent.parentId) throw new BadRequestException('A part cannot have parts of its own');
      if (dto.id && parent.id === dto.id) throw new BadRequestException('A component cannot be its own part');
    }
    if (dto.workElementId && !(await this.prisma.workElement.count({ where: { id: dto.workElementId, projectId } }))) throw new BadRequestException('Choose a component of this project\'s structure');
    const share = dto.basis === 'STAGES' ? (dto.sharePct ? D(dto.sharePct) : null) : null;
    if (dto.basis === 'STAGES' && (!share || share.lte(0) || share.gt(100))) throw new BadRequestException('Enter its share, above 0 and up to 100%');
    if (dto.basis === 'UNIT_RATE' && current?.stages.length) await this.assertNotBilled(projectId, current.stages.map((s) => s.id), 'A stage of it');
    const data = { parentId: dto.parentId ?? null, code: dto.code, name: dto.name, sharePct: share, basis: dto.basis, workElementId: dto.workElementId ?? null };
    try {
      if (current) {
        await this.prisma.$transaction(async (tx) => {
          await tx.billingComponent.update({ where: { id: current.id }, data });
          if (dto.basis === 'UNIT_RATE') await tx.billingStage.deleteMany({ where: { componentId: current.id } });
        });
      } else {
        const sortOrder = await this.prisma.billingComponent.count({ where: { projectId } });
        await this.prisma.billingComponent.create({ data: { ...data, organizationId: user.organizationId, projectId, sortOrder } });
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Another component has the code ${dto.code}`);
      throw e;
    }
    await this.audit.log(user, 'PROJECT', projectId, 'BILLING_BREAKUP', `${current ? 'Changed' : 'Added'} ${dto.code} ${dto.name}${share ? `, ${pctStr(share)}%` : ', unit rates'}`);
    return this.breakup(user, projectId);
  }

  async removeComponent(user: RequestUser, projectId: string, id: string) {
    await this.assertEdit(user, projectId);
    const row = await this.prisma.billingComponent.findFirst({ where: { id, projectId }, select: { code: true, name: true } });
    if (!row) throw new NotFoundException('Component not found');
    const ids = [id, ...(await this.prisma.billingComponent.findMany({ where: { parentId: id }, select: { id: true } })).map((c) => c.id)];
    const stageIds = (await this.prisma.billingStage.findMany({ where: { componentId: { in: ids } }, select: { id: true } })).map((s) => s.id);
    await this.assertNotBilled(projectId, stageIds, `A stage of ${row.code} ${row.name}`);
    await this.prisma.billingComponent.delete({ where: { id } });
    await this.audit.log(user, 'PROJECT', projectId, 'BILLING_BREAKUP', `Removed ${row.code} ${row.name}`);
    return this.breakup(user, projectId);
  }

  async saveStage(user: RequestUser, projectId: string, dto: SaveBillingStageDto) {
    await this.assertEdit(user, projectId);
    const component = await this.prisma.billingComponent.findFirst({ where: { id: dto.componentId, projectId }, select: { id: true, basis: true, workElementId: true, code: true, _count: { select: { children: true } } } });
    if (!component) throw new BadRequestException('Choose a component of this project');
    if (component.basis !== 'STAGES') throw new BadRequestException('A unit-rate component is paid by its measured items, not stages');
    if (component._count.children) throw new BadRequestException('This component is split into parts: add the stage to a part');
    const current = dto.id ? await this.prisma.billingStage.findFirst({ where: { id: dto.id, projectId } }) : null;
    if (dto.id && !current) throw new NotFoundException('Stage not found');
    const pct = D(dto.pct);
    if (pct.lte(0) || pct.gt(100)) throw new BadRequestException('Enter the stage\'s %, above 0 and up to 100');
    const activityIds = dto.trigger === 'PROGRESS' || dto.trigger === 'TEST' ? [...new Set(dto.activityIds ?? [])] : [];
    if (activityIds.length) {
      const found = await this.prisma.activity.count({ where: { id: { in: activityIds }, projectId } });
      if (found !== activityIds.length) throw new BadRequestException('Choose activities of this project');
    }
    // EPC (item 130): an event can be the approval of deliverables, supply the packages that reach a stage.
    const deliverableIds = dto.trigger === 'EVENT' ? [...new Set(dto.deliverableIds ?? [])] : [];
    if (deliverableIds.length && (await this.prisma.engineeringDeliverable.count({ where: { id: { in: deliverableIds }, projectId } })) !== deliverableIds.length) throw new BadRequestException('Choose deliverables of this project');
    const packageIds = dto.trigger === 'SUPPLY' ? [...new Set(dto.packageIds ?? [])] : [];
    if (packageIds.length && (await this.prisma.procurementPackage.count({ where: { id: { in: packageIds }, projectId } })) !== packageIds.length) throw new BadRequestException('Choose equipment packages of this project');
    const itemIds = dto.trigger === 'SUPPLY' && !packageIds.length ? [...new Set(dto.itemIds ?? [])] : [];
    if (itemIds.length && (await this.prisma.item.count({ where: { id: { in: itemIds }, organizationId: user.organizationId } })) !== itemIds.length) throw new BadRequestException('Choose items from the item master');
    const scopeQty = dto.trigger === 'SUPPLY' && !packageIds.length && dto.scopeQty ? D(dto.scopeQty) : null;
    if (dto.trigger === 'SUPPLY' && !packageIds.length && (!itemIds.length || !scopeQty || scopeQty.lte(0))) throw new BadRequestException('A supply stage needs the items it is supplied against and the scope to supply, or the equipment packages it is paid by');
    const achievedOn = dto.trigger === 'EVENT' && !deliverableIds.length && dto.achievedOn ? dto.achievedOn : null;
    if (achievedOn && achievedOn > todayIn()) throw new BadRequestException('An event cannot be recorded for a day still to come');
    if (current && current.trigger !== dto.trigger) await this.assertNotBilled(projectId, [current.id], 'This stage');
    const data = {
      name: dto.name,
      pct,
      trigger: dto.trigger,
      activityIds,
      itemIds,
      scopeQty,
      achievedOn: achievedOn ? parseDate(achievedOn) : null,
      evidence: dto.trigger === 'EVENT' && !deliverableIds.length ? (dto.evidence ?? null) : null,
      deliverableIds,
      packageIds,
      packageStage: packageIds.length ? (dto.packageStage ?? null) : null,
    };
    if (current) await this.prisma.billingStage.update({ where: { id: current.id }, data });
    else {
      const sortOrder = await this.prisma.billingStage.count({ where: { componentId: component.id } });
      await this.prisma.billingStage.create({ data: { ...data, organizationId: user.organizationId, projectId, componentId: component.id, sortOrder } });
    }
    await this.audit.log(user, 'PROJECT', projectId, 'BILLING_BREAKUP', `${current ? 'Changed' : 'Added'} stage ${dto.name} of ${component.code}${achievedOn ? `, done on ${achievedOn}` : ''}`);
    return this.breakup(user, projectId);
  }

  async removeStage(user: RequestUser, projectId: string, id: string) {
    await this.assertEdit(user, projectId);
    const row = await this.prisma.billingStage.findFirst({ where: { id, projectId }, select: { name: true } });
    if (!row) throw new NotFoundException('Stage not found');
    await this.assertNotBilled(projectId, [id], `The stage ${row.name}`);
    await this.prisma.billingStage.delete({ where: { id } });
    await this.audit.log(user, 'PROJECT', projectId, 'BILLING_BREAKUP', `Removed stage ${row.name}`);
    return this.breakup(user, projectId);
  }

  async saveTerms(user: RequestUser, projectId: string, dto: BillingTermsDto) {
    await this.assertEdit(user, projectId, true);
    const data: Prisma.ProjectUpdateInput = {};
    if (dto.lumpSumValue !== undefined) {
      if (dto.lumpSumValue !== null && D(dto.lumpSumValue).lte(0)) throw new BadRequestException('Enter the lump sum above 0, or leave it empty to use the contract value');
      data.lumpSumValue = dto.lumpSumValue === null ? null : D(dto.lumpSumValue);
    }
    if (dto.tenderFactor !== undefined) {
      if (dto.tenderFactor !== null && (D(dto.tenderFactor).lte(0) || D(dto.tenderFactor).gt(10))) throw new BadRequestException('Enter the tender factor above 0 and up to 10, or leave it empty for 1');
      data.tenderFactor = dto.tenderFactor === null ? null : D(dto.tenderFactor);
    }
    if (dto.advanceRecoveryFromPct !== undefined || dto.advanceRecoveryToPct !== undefined) {
      const from = dto.advanceRecoveryFromPct ?? null;
      const to = dto.advanceRecoveryToPct ?? null;
      if ((from === null) !== (to === null)) throw new BadRequestException('Give both ends of the advance recovery window, or neither');
      if (from !== null && to !== null && (D(from).lt(0) || D(to).gt(100) || D(to).lte(D(from)))) throw new BadRequestException('The window must end after it starts, within 0 to 100% of the contract');
      data.advanceRecoveryFromPct = from === null ? null : D(from);
      data.advanceRecoveryToPct = to === null ? null : D(to);
    }
    await this.prisma.project.update({ where: { id: projectId }, data });
    await this.audit.log(user, 'PROJECT', projectId, 'BILLING_TERMS', 'Lump sum, tender factor or advance window changed');
    return this.breakup(user, projectId);
  }

  async saveGrid(user: RequestUser, projectId: string, dto: SaveMilestoneGridDto) {
    await this.assertEdit(user, projectId, true);
    const ids = dto.rows.map((r) => r.componentId);
    const found = await this.prisma.billingComponent.findMany({ where: { id: { in: ids }, projectId, parentId: null, basis: 'STAGES' }, select: { id: true, code: true } });
    if (found.length !== new Set(ids).size) throw new BadRequestException('The grid is by the components paid in stages; reload and try again');
    const data: Prisma.MilestoneTargetCreateManyInput[] = [];
    for (const r of dto.rows) {
      const code = found.find((f) => f.id === r.componentId)!.code;
      let last = 0;
      for (const t of [...r.targets].sort((a, b) => a.month.localeCompare(b.month))) {
        const pct = D(t.pct);
        if (pct.lt(0) || pct.gt(100)) throw new BadRequestException(`${code}: a target is a % from 0 to 100`);
        if (pct.toNumber() < last) throw new BadRequestException(`${code}: the targets add up month by month, so one cannot be below the month before`);
        last = pct.toNumber();
        data.push({ organizationId: user.organizationId, projectId, componentId: r.componentId, month: parseDate(`${t.month.slice(0, 7)}-01`), cumulativePct: pct });
      }
    }
    await this.prisma.$transaction([this.prisma.milestoneTarget.deleteMany({ where: { projectId } }), this.prisma.milestoneTarget.createMany({ data, skipDuplicates: true })]);
    await this.audit.log(user, 'PROJECT', projectId, 'MILESTONE_GRID', `${dto.rows.length} component${dto.rows.length === 1 ? '' : 's'}`);
    return this.breakup(user, projectId);
  }

  /** A grid proposed from the schedule, not saved (`proposedGrid`). */
  async proposeGrid(user: RequestUser, projectId: string) {
    await this.assertEdit(user, projectId, true);
    return proposedGrid(this.prisma, projectId);
  }

  async saveTiers(user: RequestUser, projectId: string, dto: SaveSlippageTiersDto) {
    await this.assertEdit(user, projectId, true);
    const tiers = dto.tiers.map((t) => ({ fromPct: D(t.fromPct), toPct: t.toPct ? D(t.toPct) : null, withheldPct: D(t.withheldPct) })).sort((a, b) => a.fromPct.cmp(b.fromPct));
    for (const [i, t] of tiers.entries()) {
      if (t.withheldPct.lt(0) || t.withheldPct.gt(100) || t.fromPct.lt(0)) throw new BadRequestException('Each tier withholds 0 to 100%, from 0% behind or more');
      if (t.toPct && t.toPct.lte(t.fromPct)) throw new BadRequestException('Each tier must end after it starts');
      const next = tiers[i + 1];
      if (next && (!t.toPct || !t.toPct.eq(next.fromPct))) throw new BadRequestException('Each tier starts where the one before ends');
      if (!next && t.toPct) throw new BadRequestException('Leave the last tier open-ended');
    }
    await this.prisma.$transaction([
      this.prisma.slippageTier.deleteMany({ where: { projectId } }),
      this.prisma.slippageTier.createMany({ data: tiers.map((t, i) => ({ ...t, organizationId: user.organizationId, projectId, sortOrder: i })) }),
    ]);
    await this.audit.log(user, 'PROJECT', projectId, 'SLIPPAGE_TIERS', tiers.length ? `${tiers.length} tiers` : 'Back to the defaults');
    return this.breakup(user, projectId);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // On a bill

  /** What an RA bill takes from the break-up (`stagePlan`), for `RaBillsService`. */
  planFor(tx: Db, bill: { id: string; projectId: string; billNo: number; measuredUpTo: Date }, opts: { certified?: Map<string, D> } = {}): Promise<BillStagePlan | null> {
    return stagePlan(tx, bill, opts);
  }

  /** Claim a stage by hand on a bill being prepared (less than the evidence gives, or more with a note), or go back to the evidence. */
  async checkClaim(tx: Db, billId: string, stageId: string, dto: ClaimStageDto) {
    const line = await tx.raBillStageLine.findUnique({ where: { billId_stageId: { billId, stageId } } });
    if (!line) throw new NotFoundException('This stage is not on the bill');
    if (dto.pct === undefined || dto.pct === null) {
      await tx.raBillStageLine.update({ where: { id: line.id }, data: { claimedByHand: false, note: null } });
      return;
    }
    const check = stageLine(line.stageValue, num(line.prevPct), num(line.prevPct) + num(line.suggestedPct), { pct: Number(dto.pct), note: dto.note ?? null });
    if ('problem' in check) throw new BadRequestException(check.problem);
    await tx.raBillStageLine.update({ where: { id: line.id }, data: { claimedByHand: true, thisPct: D(check.thisPct), note: dto.note ?? null } });
  }
}
