import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ASSET_CLASSES,
  IT_BLOCKS,
  STANDARD_RESIDUAL_PCT,
  accumulatedTo,
  assetProblem,
  canManageFixedAssets,
  disposalResult,
  fyCodeOf,
  itBlockSchedule,
  runPeriodLabel,
  runCharge,
  runPeriodProblem,
  runStepProblem,
  wdvRate,
  type AssetClassCode,
  type DepreciableAsset,
  type DepreciationRunDetailDto,
  type DepreciationRunDto,
  type FixedAssetBooksCheckDto,
  type FixedAssetDetailDto,
  type FixedAssetDto,
  type FixedAssetListDto,
  type ItBlockRowDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, formatDay, iso, money, parseDate } from '../common/serialize';
import { ilike, pageArgs, searchWords } from '../common/paging';
import { nextDocNo } from '../common/doc-number';
import { todayIn } from '../notifications/time';
import { BooksService } from '../books/books.service';
import { StatementsService } from '../statements/statements.service';
import { shortId } from '../posting/posting.service';
import { CreateFixedAssetDto, DisposeAssetDto, FixedAssetQuery, ItScheduleQuery, PrepareRunDto, TransferAssetDto, UpdateFixedAssetDto } from './fixed-assets.dto';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

const assetInclude = {
  project: { select: { name: true } },
  vendor: { select: { name: true } },
  equipment: { select: { code: true } },
} satisfies Prisma.FixedAssetInclude;
type AssetRow = Prisma.FixedAssetGetPayload<{ include: typeof assetInclude }>;
const runInclude = { preparedBy: { select: { fullName: true } }, postedBy: { select: { fullName: true } }, _count: { select: { lines: true } } } satisfies Prisma.DepreciationRunInclude;
type RunRow = Prisma.DepreciationRunGetPayload<{ include: typeof runInclude }>;

const depreciable = (a: { cost: Prisma.Decimal; residual: Prisma.Decimal; lifeYears: number; method: 'SLM' | 'WDV'; putToUseOn: Date; openingAsOf: Date | null; openingDepreciation: Prisma.Decimal; disposedOn: Date | null }): DepreciableAsset => ({
  cost: Number(a.cost),
  residual: Number(a.residual),
  lifeYears: a.lifeYears,
  method: a.method,
  putToUseOn: dateOnly(a.putToUseOn),
  opening: a.openingAsOf ? { asOf: dateOnly(a.openingAsOf), amount: Number(a.openingDepreciation) } : null,
  disposedOn: dateOnly(a.disposedOn),
});

/**
 * Fixed assets (ARCHITECTURE "Fixed assets"): the register, transfers between sites, depreciation runs and disposals.
 * The figures are the pure schedule in `@erp/shared/fixed-assets.ts`; what reaches the books is the posting service's
 * `fixedAssets` block, run here straight after a change so the day book has it. Kept by admin, management and accounts.
 */
@Injectable()
export class FixedAssetsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private access: ProjectAccessService, private books: BooksService, private statements: StatementsService) {}

  private assertCan(user: RequestUser) {
    if (!canManageFixedAssets(user.roleKey)) throw new ForbiddenException('Fixed assets are kept by admin, management and accounts');
  }

  /** Refuse a day the books cannot take: on or before the lock, or before they begin. */
  private async assertOpen(organizationId: string, day: string, what: string) {
    const { booksFrom, lockedUpTo } = await this.books.period(organizationId);
    if (lockedUpTo && day <= lockedUpTo) throw new BadRequestException(`The books are locked up to ${formatDay(lockedUpTo)}, so ${what} cannot go in. Ask management to move the lock under Accounts › Opening and year close, or date it after that.`);
    if (booksFrom && day < booksFrom) throw new BadRequestException(`The books begin on ${formatDay(booksFrom)}, so ${what} dated before that is in the opening balances. Date it on or after that day.`);
  }

  /** Depreciation in the books by asset: posted runs only. */
  private async charged(db: Tx | PrismaService, organizationId: string, ids?: string[]): Promise<Map<string, Prisma.Decimal>> {
    const rows = await db.depreciationLine.groupBy({ by: ['assetId'], where: { organizationId, run: { status: 'POSTED' }, ...(ids ? { assetId: { in: ids } } : {}) }, _sum: { amount: true } });
    return new Map(rows.map((r) => [r.assetId, r._sum.amount ?? ZERO]));
  }

  private toDto(a: AssetRow, posted: Prisma.Decimal | undefined): FixedAssetDto {
    const depreciation = a.openingDepreciation.add(posted ?? 0);
    const result = a.status === 'DISPOSED' ? disposalResult({ cost: Number(a.cost), accumulated: Number(depreciation), proceeds: Number(a.proceeds ?? 0) }) : null;
    return {
      id: a.id,
      assetNo: a.assetNo,
      name: a.name,
      assetClass: a.assetClass as AssetClassCode,
      method: a.method,
      cost: money(a.cost),
      residual: money(a.residual),
      lifeYears: a.lifeYears,
      putToUseOn: dateOnly(a.putToUseOn),
      fundedBy: a.fundedBy,
      vendorId: a.vendorId,
      vendorName: a.vendor?.name ?? null,
      invoiceNo: a.invoiceNo,
      serialNo: a.serialNo,
      projectId: a.projectId,
      projectName: a.project?.name ?? null,
      equipmentId: a.equipmentId,
      equipmentCode: a.equipment?.code ?? null,
      openingAsOf: dateOnly(a.openingAsOf),
      openingDepreciation: money(a.openingDepreciation),
      status: a.status,
      disposedOn: dateOnly(a.disposedOn),
      proceeds: money(a.proceeds),
      depreciation: money(depreciation),
      bookValue: a.status === 'DISPOSED' ? money(0) : money(a.cost.sub(depreciation)),
      disposalResult: result ? money(result.gain - result.loss) : null,
      note: a.note,
      charged: !!posted && posted.gt(0),
    };
  }

  private async find(user: RequestUser, id: string, db: Tx | PrismaService = this.prisma): Promise<AssetRow> {
    const a = await db.fixedAsset.findFirst({ where: { id, organizationId: user.organizationId }, include: assetInclude });
    if (!a) throw new NotFoundException('Asset not found');
    return a;
  }

  // The register

  async list(user: RequestUser, q: FixedAssetQuery): Promise<FixedAssetListDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const words = searchWords(q.q);
    const where: Prisma.FixedAssetWhereInput = {
      organizationId: org,
      ...(q.status ? { status: q.status } : {}),
      ...(q.assetClass ? { assetClass: q.assetClass } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(words.length ? { AND: words.map((w) => ({ OR: [{ assetNo: ilike(w) }, { name: ilike(w) }, { serialNo: ilike(w) }, { equipment: { code: ilike(w) } }] })) } : {}),
    };
    const args = pageArgs(q);
    const order = q.sortOrder ?? (q.sortBy ? 'asc' : 'desc');
    const [rows, total, inUse, charged] = await Promise.all([
      this.prisma.fixedAsset.findMany({ where, include: assetInclude, orderBy: [{ [q.sortBy ?? 'assetNo']: order }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.fixedAsset.count({ where }),
      this.prisma.fixedAsset.findMany({ where: { organizationId: org, status: 'ACTIVE' }, select: { id: true, cost: true, openingDepreciation: true } }),
      this.charged(this.prisma, org),
    ]);
    const sum = (f: (a: (typeof inUse)[number]) => Prisma.Decimal) => inUse.reduce((s, a) => s.add(f(a)), ZERO);
    const dep = sum((a) => a.openingDepreciation.add(charged.get(a.id) ?? 0));
    const cost = sum((a) => a.cost);
    return {
      items: rows.map((r) => this.toDto(r, charged.get(r.id))),
      total,
      page: args.page,
      pageSize: args.pageSize,
      summary: { count: inUse.length, cost: money(cost), depreciation: money(dep), bookValue: money(cost.sub(dep)) },
    };
  }

  /** The register's book value beside the balance sheet's property, plant and equipment line today. */
  async booksCheck(user: RequestUser): Promise<FixedAssetBooksCheckDto> {
    this.assertCan(user);
    const asOn = todayIn();
    const [sheet, inUse, charged] = await Promise.all([
      this.statements.balanceSheet(user, asOn),
      this.prisma.fixedAsset.findMany({ where: { organizationId: user.organizationId, status: 'ACTIVE' }, select: { id: true, cost: true, openingDepreciation: true } }),
      this.charged(this.prisma, user.organizationId),
    ]);
    const register = inUse.reduce((s, a) => s.add(a.cost).sub(a.openingDepreciation).sub(charged.get(a.id) ?? 0), ZERO);
    const ppe = D(sheet.sections.flatMap((s) => s.lines).find((l) => l.line === 'PPE')?.amount ?? 0);
    return { asOn, register: money(register), ppe: money(ppe), difference: money(ppe.sub(register)) };
  }

  async get(user: RequestUser, id: string): Promise<FixedAssetDetailDto> {
    this.assertCan(user);
    const a = await this.find(user, id);
    const [transfers, lines] = await Promise.all([
      this.prisma.assetTransfer.findMany({ where: { assetId: id }, include: { fromProject: { select: { name: true } }, toProject: { select: { name: true } }, by: { select: { fullName: true } } }, orderBy: [{ on: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.depreciationLine.findMany({ where: { assetId: id }, include: { run: { select: { id: true, status: true, periodFrom: true, periodTo: true } } }, orderBy: { from: 'desc' } }),
    ]);
    const posted = lines.filter((l) => l.run.status === 'POSTED').reduce((s, l) => s.add(l.amount), ZERO);
    return {
      ...this.toDto(a, posted),
      transfers: transfers.map((t) => ({ id: t.id, on: dateOnly(t.on), fromName: t.fromProject?.name ?? null, toName: t.toProject?.name ?? null, note: t.note, byName: t.by.fullName })),
      charges: lines.map((l) => ({ runId: l.run.id, period: runPeriodLabel(dateOnly(l.run.periodFrom), dateOnly(l.run.periodTo)), from: dateOnly(l.from), to: dateOnly(l.to), amount: money(l.amount), status: l.run.status })),
      scheduledToDate: money(accumulatedTo(depreciable(a), todayIn())),
      wdvRatePct: a.method === 'WDV' ? (wdvRate(Number(a.cost), Number(a.residual), a.lifeYears) * 100).toFixed(2) : null,
    };
  }

  /** What a new or changed asset's schedule reads, with the standard residual and life filled in, checked by `assetProblem`. */
  private async terms(user: RequestUser, dto: UpdateFixedAssetDto, was?: AssetRow) {
    const assetClass = dto.assetClass ?? was?.assetClass ?? '';
    const cost = dto.cost ?? Number(was?.cost ?? 0);
    const classOf = ASSET_CLASSES[assetClass as AssetClassCode];
    const residual = dto.residual ?? (dto.cost === undefined && was ? Number(was.residual) : Math.round(cost * STANDARD_RESIDUAL_PCT) / 100);
    const lifeYears = dto.lifeYears ?? (dto.assetClass === undefined && was ? was.lifeYears : (classOf?.lifeYears ?? 0));
    const fundedBy = dto.fundedBy ?? was?.fundedBy ?? 'BANK';
    const vendorId = dto.vendorId !== undefined ? dto.vendorId : (was?.vendorId ?? null);
    const openingAsOf = dto.openingAsOf !== undefined ? dto.openingAsOf : dateOnly(was?.openingAsOf ?? null);
    const openingDepreciation = dto.openingDepreciation ?? (openingAsOf ? Number(was?.openingDepreciation ?? 0) : 0);
    const putToUseOn = dto.putToUseOn ?? dateOnly(was!.putToUseOn);
    const name = dto.name ?? was?.name ?? '';
    const method = dto.method ?? was?.method ?? 'SLM';
    const opening = openingAsOf ? { asOf: openingAsOf, amount: openingDepreciation } : null;
    const { booksFrom } = await this.books.period(user.organizationId);
    const problem = assetProblem({ name, assetClass, method, cost, residual, lifeYears, putToUseOn, fundedBy, vendorId, opening, booksFrom });
    if (problem) throw new BadRequestException(problem);
    if (vendorId && !(await this.prisma.vendor.findFirst({ where: { id: vendorId, organizationId: user.organizationId }, select: { id: true } }))) throw new BadRequestException('Choose a vendor from the vendor master');
    if (fundedBy !== 'IN_BOOKS') await this.assertOpen(user.organizationId, putToUseOn, 'an asset bought then');
    return { assetClass, method, cost, residual, lifeYears, fundedBy, vendorId: fundedBy === 'VENDOR' ? vendorId : null, putToUseOn, opening };
  }

  /**
   * Add an asset; with `equipmentId`, an owned machine becomes one (a hired machine never does, and a machine is one asset
   * at most), at the machine's site.
   */
  async create(user: RequestUser, dto: CreateFixedAssetDto): Promise<FixedAssetDetailDto> {
    this.assertCan(user);
    const org = user.organizationId;
    let projectId = dto.projectId ?? null;
    if (dto.equipmentId) projectId = await this.makeFromEquipment(user, dto.equipmentId, dto.projectId);
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const t = await this.terms(user, dto);
    const id = await this.prisma.$transaction(async (tx) => {
      const assetNo = await nextDocNo(tx, org, 'FA', async (prefix) => (await tx.fixedAsset.findFirst({ where: { organizationId: org, assetNo: { startsWith: prefix } }, orderBy: { assetNo: 'desc' }, select: { assetNo: true } }))?.assetNo ?? null);
      const a = await tx.fixedAsset.create({
        data: {
          organizationId: org,
          assetNo,
          name: dto.name,
          assetClass: t.assetClass,
          method: t.method,
          cost: t.cost,
          residual: t.residual,
          lifeYears: t.lifeYears,
          putToUseOn: parseDate(t.putToUseOn),
          fundedBy: t.fundedBy,
          vendorId: t.vendorId,
          invoiceNo: dto.invoiceNo || null,
          serialNo: dto.serialNo || null,
          projectId,
          equipmentId: dto.equipmentId ?? null,
          openingAsOf: t.opening ? parseDate(t.opening.asOf) : null,
          openingDepreciation: t.opening?.amount ?? 0,
          note: dto.note || null,
          createdById: user.id,
        },
      });
      return a.id;
    });
    await this.audit.log(user, 'FIXED_ASSET', id, 'CREATED', dto.equipmentId ? 'Made from a machine' : null);
    await this.books.postAll(org, 0);
    return this.get(user, id);
  }

  /** An owned machine not yet in the register: its site is where the asset is, unless the form says otherwise. */
  private async makeFromEquipment(user: RequestUser, equipmentId: string, projectId: string | null | undefined): Promise<string | null> {
    const e = await this.prisma.equipment.findFirst({ where: { id: equipmentId, organizationId: user.organizationId }, select: { code: true, ownership: true, projectId: true, fixedAsset: { select: { assetNo: true } } } });
    if (!e) throw new NotFoundException('Machine not found');
    if (e.ownership === 'HIRED') throw new BadRequestException(`${e.code} is hired. Only machines the company owns go in the fixed asset register.`);
    if (e.fixedAsset) throw new ConflictException(`${e.code} is already asset ${e.fixedAsset.assetNo}`);
    return projectId !== undefined ? projectId : e.projectId;
  }

  async update(user: RequestUser, id: string, dto: UpdateFixedAssetDto): Promise<FixedAssetDetailDto> {
    this.assertCan(user);
    await this.find(user, id);
    const schedule = (['assetClass', 'method', 'cost', 'residual', 'lifeYears', 'putToUseOn', 'fundedBy', 'vendorId', 'openingAsOf', 'openingDepreciation'] as const).some((k) => dto[k] !== undefined);
    await this.prisma.$transaction(async (tx) => {
      let t: Awaited<ReturnType<FixedAssetsService['terms']>> | null = null;
      if (schedule) {
        await this.lockRuns(tx, user.organizationId);
        const now = await this.find(user, id, tx);
        if (now.status === 'DISPOSED') throw new BadRequestException(`${now.assetNo} is disposed; only its name, papers and note can change`);
        if ((await this.charged(tx, user.organizationId, [id])).get(id)?.gt(0)) throw new BadRequestException(`A posted depreciation run has charged ${now.assetNo}, so its cost, class, life and method are fixed. Undo those runs first.`);
        if (now.tallyExportId) throw new BadRequestException(`${now.assetNo} is already exported to Tally. Undo that export under Accounts › Tally export first.`);
        if (now.fundedBy !== 'IN_BOOKS') await this.assertOpen(user.organizationId, dateOnly(now.putToUseOn), 'a change to an asset bought then');
        t = await this.terms(user, dto, now);
      }
      await tx.fixedAsset.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.serialNo !== undefined ? { serialNo: dto.serialNo || null } : {}),
          ...(dto.invoiceNo !== undefined ? { invoiceNo: dto.invoiceNo || null } : {}),
          ...(dto.note !== undefined ? { note: dto.note || null } : {}),
          ...(t
            ? {
                assetClass: t.assetClass,
                method: t.method,
                cost: t.cost,
                residual: t.residual,
                lifeYears: t.lifeYears,
                putToUseOn: parseDate(t.putToUseOn),
                fundedBy: t.fundedBy,
                vendorId: t.vendorId,
                openingAsOf: t.opening ? parseDate(t.opening.asOf) : null,
                openingDepreciation: t.opening?.amount ?? 0,
              }
            : {}),
        },
      });
    });
    await this.audit.log(user, 'FIXED_ASSET', id, 'UPDATED');
    if (schedule) await this.books.postAll(user.organizationId, 0);
    return this.get(user, id);
  }

  /** Delete an asset entered by mistake: never charged by a run, not disposed, not in Tally. */
  async remove(user: RequestUser, id: string) {
    this.assertCan(user);
    const a = await this.find(user, id);
    if (a.status === 'DISPOSED') throw new BadRequestException(`${a.assetNo} is disposed; its sale stays in the books`);
    if (await this.prisma.depreciationLine.count({ where: { assetId: id } })) throw new BadRequestException(`A depreciation run has charged ${a.assetNo}. Take it out of those runs first.`);
    if (a.tallyExportId) throw new BadRequestException(`${a.assetNo} is already exported to Tally. Undo that export under Accounts › Tally export first.`);
    if (a.fundedBy !== 'IN_BOOKS') await this.assertOpen(user.organizationId, dateOnly(a.putToUseOn), 'removing an asset bought then');
    await this.prisma.fixedAsset.delete({ where: { id } });
    await this.audit.log(user, 'FIXED_ASSET', id, 'DELETED', a.assetNo);
    await this.books.postAll(user.organizationId, 0);
    return { ok: true };
  }

  /** Move an asset to another site (or head office) on a day: the history row and the asset's place in one go, and its machine's site with it. */
  async transfer(user: RequestUser, id: string, dto: TransferAssetDto) {
    this.assertCan(user);
    const a = await this.find(user, id);
    if (a.equipmentId) this.access.assertCanManageEquipment(user, `Move ${a.equipment?.code ?? 'its machine'} in Plant; its asset moves with it`);
    const to = dto.toProjectId ?? null;
    if (a.status === 'DISPOSED') throw new BadRequestException(`${a.assetNo} is disposed`);
    if (to === a.projectId) throw new BadRequestException(`${a.assetNo} is already ${a.project ? `at ${a.project.name}` : 'at head office'}`);
    if (dto.on < dateOnly(a.putToUseOn)) throw new BadRequestException(`Date the move on or after ${formatDay(dateOnly(a.putToUseOn))}, when it was put to use`);
    if (dto.on > todayIn()) throw new BadRequestException('Date the move today or earlier');
    if (to) await this.access.assertCanAccessProject(user, to);
    await this.prisma.$transaction(async (tx) => {
      await tx.assetTransfer.create({ data: { organizationId: user.organizationId, assetId: id, on: parseDate(dto.on), fromProjectId: a.projectId, toProjectId: to, note: dto.note || null, byId: user.id } });
      await tx.fixedAsset.update({ where: { id }, data: { projectId: to } });
      if (a.equipmentId) await tx.equipment.update({ where: { id: a.equipmentId }, data: { projectId: to } });
    });
    await this.audit.log(user, 'FIXED_ASSET', id, 'TRANSFERRED', dto.note);
    return this.get(user, id);
  }

  /**
   * Sell or scrap an asset: it leaves the register on the day, and its voucher takes the money in and the depreciation
   * charged off its cost, with the difference a profit or loss. A run posted for days after it must be undone first.
   */
  async dispose(user: RequestUser, id: string, dto: DisposeAssetDto) {
    this.assertCan(user);
    const a = await this.find(user, id);
    if (a.status === 'DISPOSED') throw new BadRequestException(`${a.assetNo} was disposed on ${formatDay(dateOnly(a.disposedOn))}`);
    if (dto.on < dateOnly(a.putToUseOn)) throw new BadRequestException(`Date it on or after ${formatDay(dateOnly(a.putToUseOn))}, when it was put to use`);
    if (dto.on > todayIn()) throw new BadRequestException('Date it today or earlier');
    await this.assertOpen(user.organizationId, dto.on, 'a sale on that day');
    await this.prisma.$transaction(async (tx) => {
      await this.lockRuns(tx, user.organizationId);
      const after = await tx.depreciationLine.findFirst({ where: { assetId: id, to: { gt: parseDate(dto.on) }, run: { status: 'POSTED' } }, include: { run: { select: { periodFrom: true, periodTo: true } } }, orderBy: { to: 'desc' } });
      if (after) throw new BadRequestException(`Depreciation for ${runPeriodLabel(dateOnly(after.run.periodFrom), dateOnly(after.run.periodTo))} is posted on ${a.assetNo} for days after that. Undo that run first, or date the sale after it.`);
      const moved = await tx.fixedAsset.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'DISPOSED', disposedOn: parseDate(dto.on), proceeds: dto.proceeds, disposalMode: dto.mode ?? 'BANK', disposalNote: dto.note || null } });
      if (moved.count !== 1) throw new ConflictException(`${a.assetNo} is already disposed`);
    });
    await this.audit.log(user, 'FIXED_ASSET', id, 'DISPOSED', `${dto.proceeds > 0 ? `Sold for ₹${dto.proceeds.toFixed(2)}` : 'Scrapped'}${dto.note ? `: ${dto.note}` : ''}`);
    await this.books.postAll(user.organizationId, 0);
    return this.get(user, id);
  }

  /** Income Tax depreciation by block for a financial year, rolled from the register. */
  async itSchedule(user: RequestUser, q: ItScheduleQuery): Promise<{ fy: string; blocks: ItBlockRowDto[] }> {
    this.assertCan(user);
    const fy = q.fy ?? fyCodeOf(todayIn());
    const assets = await this.prisma.fixedAsset.findMany({ where: { organizationId: user.organizationId }, select: { assetClass: true, cost: true, putToUseOn: true, disposedOn: true, proceeds: true } });
    const rows = itBlockSchedule(
      assets.map((a) => ({ itBlock: ASSET_CLASSES[a.assetClass as AssetClassCode].itBlock, cost: Number(a.cost), putToUseOn: dateOnly(a.putToUseOn), disposedOn: dateOnly(a.disposedOn), proceeds: Number(a.proceeds ?? 0) })),
      fy,
    );
    const m = (n: number) => n.toFixed(2);
    return {
      fy,
      blocks: rows.map((r) => ({
        block: r.block,
        label: IT_BLOCKS[r.block].label,
        ratePct: r.rate * 100,
        openingWdv: m(r.openingWdv),
        additions: m(r.additions),
        halfRateAdditions: m(r.halfRateAdditions),
        disposals: m(r.disposals),
        depreciation: m(r.depreciation),
        closingWdv: m(r.closingWdv),
        shortTermGain: m(r.shortTermGain),
      })),
    };
  }

  // Depreciation runs

  private runDto(r: RunRow, voucherNo: string | null): DepreciationRunDto {
    const from = dateOnly(r.periodFrom);
    const to = dateOnly(r.periodTo);
    return {
      id: r.id,
      from,
      to,
      period: runPeriodLabel(from, to),
      status: r.status,
      total: money(r.total),
      assets: r._count.lines,
      preparedByName: r.preparedBy.fullName,
      preparedAt: iso(r.preparedAt),
      postedByName: r.postedBy?.fullName ?? null,
      postedAt: iso(r.postedAt),
      voucherNo,
    };
  }

  async listRuns(user: RequestUser): Promise<DepreciationRunDto[]> {
    this.assertCan(user);
    const rows = await this.prisma.depreciationRun.findMany({ where: { organizationId: user.organizationId }, include: runInclude, orderBy: { periodFrom: 'desc' }, take: 200 });
    return rows.map((r) => this.runDto(r, r.status === 'POSTED' ? `DEP/${shortId(r.id)}` : null));
  }

  async getRun(user: RequestUser, id: string): Promise<DepreciationRunDetailDto> {
    this.assertCan(user);
    const r = await this.prisma.depreciationRun.findFirst({ where: { id, organizationId: user.organizationId }, include: runInclude });
    if (!r) throw new NotFoundException('Depreciation run not found');
    const [lines, voucher] = await Promise.all([
      this.prisma.depreciationLine.findMany({ where: { runId: id }, include: { asset: { select: { assetNo: true, name: true, assetClass: true, method: true } } }, orderBy: { asset: { assetNo: 'asc' } } }),
      r.status === 'POSTED' ? this.prisma.bookVoucher.findFirst({ where: { organizationId: user.organizationId, source: 'DEPRECIATION', sourceId: id }, select: { voucherNo: true } }) : null,
    ]);
    let postProblem: string | null = null;
    if (r.status === 'DRAFT') {
      try {
        await this.assertMayPost(this.prisma, r);
        await this.assertSalesNotInTally(this.prisma, id);
      } catch (e) {
        postProblem = (e as Error).message;
      }
    }
    return {
      ...this.runDto(r, voucher?.voucherNo ?? null),
      lines: lines.map((l) => ({ assetId: l.assetId, assetNo: l.asset.assetNo, name: l.asset.name, assetClass: l.asset.assetClass as AssetClassCode, method: l.asset.method, from: dateOnly(l.from), to: dateOnly(l.to), amount: money(l.amount) })),
      postProblem,
    };
  }

  /**
   * Each asset's line for the period: what the schedule has charged by its end less the opening and the runs before it,
   * so the days those runs missed are caught up; nothing for an asset fully charged or gone before the period.
   */
  private async charges(tx: Tx, organizationId: string, from: string, to: string) {
    const [assets, before] = await Promise.all([
      tx.fixedAsset.findMany({
        where: { organizationId, putToUseOn: { lte: parseDate(to) }, OR: [{ disposedOn: null }, { disposedOn: { gte: parseDate(from) } }] },
        select: { id: true, cost: true, residual: true, lifeYears: true, method: true, putToUseOn: true, openingAsOf: true, openingDepreciation: true, disposedOn: true },
      }),
      tx.depreciationLine.groupBy({ by: ['assetId'], where: { organizationId, run: { periodTo: { lt: parseDate(from) } } }, _sum: { amount: true }, _max: { to: true } }),
    ]);
    const charged = new Map(before.map((b) => [b.assetId, b]));
    return assets.flatMap((a) => {
      const c = charged.get(a.id);
      const line = runCharge(depreciable(a), from, to, Number(c?._sum.amount ?? 0), c?._max.to ? dateOnly(c._max.to) : null);
      return line ? [{ assetId: a.id, ...line }] : [];
    });
  }

  /** Replace a draft run's lines with the schedule's, under the org's run lock; returns the total. */
  private async fill(tx: Tx, organizationId: string, runId: string, from: string, to: string) {
    const lines = await this.charges(tx, organizationId, from, to);
    await tx.depreciationLine.deleteMany({ where: { runId } });
    if (lines.length) await tx.depreciationLine.createMany({ data: lines.map((l) => ({ organizationId, runId, assetId: l.assetId, from: parseDate(l.from), to: parseDate(l.to), amount: l.amount })) });
    const total = lines.reduce((s, l) => s.add(l.amount), ZERO);
    await tx.depreciationRun.update({ where: { id: runId }, data: { total } });
    return total;
  }

  private lockRuns(tx: Tx, organizationId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FA_RUN:${organizationId}`}))`;
  }

  /** Prepare a draft run for a month or a year: every asset's charge from the schedule, and the total, before anything posts. */
  async prepareRun(user: RequestUser, dto: PrepareRunDto): Promise<DepreciationRunDetailDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const id = await this.prisma.$transaction(async (tx) => {
      await this.lockRuns(tx, org);
      const others = await tx.depreciationRun.findMany({ where: { organizationId: org }, select: { periodFrom: true, periodTo: true } });
      const problem = runPeriodProblem(dto.from, dto.to, others.map((o) => ({ from: dateOnly(o.periodFrom), to: dateOnly(o.periodTo) })), todayIn());
      if (problem) throw new BadRequestException(problem);
      const run = await tx.depreciationRun.create({ data: { organizationId: org, periodFrom: parseDate(dto.from), periodTo: parseDate(dto.to), preparedById: user.id } });
      await this.fill(tx, org, run.id, dto.from, dto.to);
      return run.id;
    });
    await this.audit.log(user, 'DEPRECIATION_RUN', id, 'CREATED', runPeriodLabel(dto.from, dto.to));
    return this.getRun(user, id);
  }

  private async draft(tx: Tx | PrismaService, user: RequestUser, id: string) {
    const r = await tx.depreciationRun.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Depreciation run not found');
    return r;
  }

  /** Refuse a step the runs' order does not allow (`runStepProblem`). */
  private async assertInOrder(tx: Tx | PrismaService, r: { id: string; organizationId: string; periodFrom: Date; periodTo: Date }, step: Parameters<typeof runStepProblem>[0]) {
    const others = await tx.depreciationRun.findMany({ where: { organizationId: r.organizationId, id: { not: r.id } }, select: { periodFrom: true, periodTo: true, status: true } });
    const problem = runStepProblem(step, { from: dateOnly(r.periodFrom), to: dateOnly(r.periodTo) }, others.map((o) => ({ from: dateOnly(o.periodFrom), to: dateOnly(o.periodTo), status: o.status })));
    if (problem) throw new BadRequestException(problem);
  }

  /** Refuse posting a draft: a period not yet ended, inside the lock or before the books, or ahead of a draft before it. */
  private async assertMayPost(tx: Tx | PrismaService, r: { id: string; organizationId: string; periodFrom: Date; periodTo: Date }) {
    const [from, to] = [dateOnly(r.periodFrom), dateOnly(r.periodTo)];
    const problem = runPeriodProblem(from, to, [], todayIn());
    if (problem) throw new BadRequestException(problem);
    const label = runPeriodLabel(from, to);
    await this.assertOpen(r.organizationId, to, `depreciation for ${label}`);
    await this.assertOpen(r.organizationId, from, `depreciation for ${label}`);
    await this.assertInOrder(tx, r, 'post');
  }

  /** Refuse posting or undoing a run that charges an asset whose sale Tally has: the sale's voucher reads what the runs charged. */
  private async assertSalesNotInTally(tx: Tx | PrismaService, runId: string) {
    const sold = await tx.depreciationLine.findFirst({ where: { runId, asset: { tallyDisposalExportId: { not: null } } }, select: { asset: { select: { assetNo: true } } } });
    if (sold) throw new BadRequestException(`The sale of ${sold.asset.assetNo} is already exported to Tally, and this run changes the depreciation it took off. Undo that export under Accounts › Tally export first.`);
  }

  /** Prepare a draft again, after assets were added or changed. */
  async refreshRun(user: RequestUser, id: string): Promise<DepreciationRunDetailDto> {
    this.assertCan(user);
    await this.prisma.$transaction(async (tx) => {
      await this.lockRuns(tx, user.organizationId);
      const r = await this.draft(tx, user, id);
      if (r.status !== 'DRAFT') throw new BadRequestException('This run is in the books. Undo the posting to prepare it again.');
      await this.assertInOrder(tx, r, 'refresh');
      await tx.depreciationRun.update({ where: { id }, data: { preparedById: user.id, preparedAt: new Date() } });
      await this.fill(tx, user.organizationId, id, dateOnly(r.periodFrom), dateOnly(r.periodTo));
    });
    return this.getRun(user, id);
  }

  /**
   * Post a draft: its lines are prepared once more from the schedule, then it becomes one journal on its last day. Only
   * from DRAFT, so a run is never posted twice; refused on or before the lock and before the books begin.
   */
  async postRun(user: RequestUser, id: string): Promise<DepreciationRunDetailDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const period = await this.prisma.$transaction(async (tx) => {
      await this.lockRuns(tx, org);
      const r = await this.draft(tx, user, id);
      if (r.status !== 'DRAFT') throw new ConflictException(`Depreciation for ${runPeriodLabel(dateOnly(r.periodFrom), dateOnly(r.periodTo))} is already in the books`);
      const label = runPeriodLabel(dateOnly(r.periodFrom), dateOnly(r.periodTo));
      await this.assertMayPost(tx, r);
      const total = await this.fill(tx, org, id, dateOnly(r.periodFrom), dateOnly(r.periodTo));
      await this.assertSalesNotInTally(tx, id);
      if (total.isZero()) throw new BadRequestException(`Nothing to charge for ${label}: no asset in use then has depreciation left`);
      const moved = await tx.depreciationRun.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'POSTED', postedById: user.id, postedAt: new Date() } });
      if (moved.count !== 1) throw new ConflictException(`Depreciation for ${label} is already in the books`);
      return label;
    });
    await this.audit.log(user, 'DEPRECIATION_RUN', id, 'POSTED', period);
    await this.books.postAll(org, 0);
    return this.getRun(user, id);
  }

  /** Take a posted run back to draft (not once Tally has it, nor inside the locked books): its voucher leaves the books. */
  async undoPost(user: RequestUser, id: string): Promise<DepreciationRunDetailDto> {
    this.assertCan(user);
    const org = user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      await this.lockRuns(tx, org);
      const r = await this.draft(tx, user, id);
      if (r.status !== 'POSTED') throw new BadRequestException('This run is not in the books');
      if (r.tallyExportId) throw new BadRequestException('This run is already exported to Tally. Undo that export under Accounts › Tally export first.');
      await this.assertInOrder(tx, r, 'undo');
      await this.assertSalesNotInTally(tx, id);
      const what = `taking back depreciation for ${runPeriodLabel(dateOnly(r.periodFrom), dateOnly(r.periodTo))}`;
      await this.assertOpen(org, dateOnly(r.periodTo), what);
      await this.assertOpen(org, dateOnly(r.periodFrom), what);
      await tx.depreciationRun.update({ where: { id }, data: { status: 'DRAFT', postedById: null, postedAt: null } });
    });
    await this.audit.log(user, 'DEPRECIATION_RUN', id, 'UNPOSTED');
    await this.books.postAll(org, 0);
    return this.getRun(user, id);
  }

  async removeRun(user: RequestUser, id: string) {
    this.assertCan(user);
    const r = await this.prisma.$transaction(async (tx) => {
      await this.lockRuns(tx, user.organizationId);
      const r = await this.draft(tx, user, id);
      if (r.status !== 'DRAFT') throw new BadRequestException('Undo the posting before deleting the run');
      await this.assertInOrder(tx, r, 'delete');
      const gone = await tx.depreciationRun.deleteMany({ where: { id, status: 'DRAFT' } });
      if (gone.count !== 1) throw new ConflictException('This run was posted meanwhile. Undo the posting before deleting it.');
      return r;
    });
    await this.audit.log(user, 'DEPRECIATION_RUN', id, 'DELETED', runPeriodLabel(dateOnly(r.periodFrom), dateOnly(r.periodTo)));
    return { ok: true };
  }
}
