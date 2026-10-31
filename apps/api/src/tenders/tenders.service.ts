import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  RATE_LIBRARY,
  bidLevel,
  pickOpenings,
  workKindOf,
  type PastOpeningDto,
  type PastOpeningsDto,
  TENDER_DUE_DAYS,
  TENDER_OPEN,
  TENDER_RESULTS,
  TENDER_STATUS_LABELS,
  canMakeProjectFromTender,
  canManageCompliance,
  canManageTenders,
  canViewTenders,
  equipmentHourlyRate,
  pickLibraryItem,
  sameUnit,
  suggestRateLibrary,
  type TenderBidDto,
  type TenderDetailDto,
  type TenderDto,
  type TenderItemDto,
  type TenderListDto,
  type TenderStatus,
  type TenderSummaryDto,
  inVertical,
  verticalProblem,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MastersService } from '../masters/masters.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { todayIn } from '../notifications/time';
import { ProjectsService } from '../projects/projects.service';
import { addMonths } from '../machine-loans/loan-rules';
import { daysToSubmit, fyStart, moveProblem, pctOver, priceItem, rankBids, submitProblem, tenderTotals, withPct, type PricedItem, type Terms } from './tender-rules';
import {
  CreateTenderDto,
  CreateTenderItemDto,
  EmdReturnedDto,
  MakeProjectDto,
  SubmitTenderDto,
  TenderBidInput,
  TenderFieldsInput,
  TenderItemImportDto,
  TenderItemInput,
  TenderLibraryDto,
  TenderLinesDto,
  TenderQuery,
  TenderStatusDto,
  UpdateTenderDto,
} from './tenders.dto';

type D = Prisma.Decimal;
type Tx = Prisma.TransactionClient;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);
const six = (v: D) => v.toFixed(6).replace(/\.?0+$/, '') || '0';
const pct2 = (v: D) => v.toFixed(2).replace(/\.?0+$/, '') || '0';
const key = (s: string) => s.trim().toLowerCase();
const r2 = (v: D) => v.toDecimalPlaces(2, Dec.ROUND_HALF_UP);
const OUR_BID = 'Our bid';

const TENDER_INCLUDE = {
  client: { select: { name: true } },
  sorBook: { select: { name: true } },
  emdDoc: { select: { id: true, reference: true, issuer: true, amount: true, expiresOn: true, status: true } },
  project: { select: { id: true, code: true } },
  createdBy: { select: { fullName: true } },
  bids: { orderBy: { amount: 'asc' } },
  items: { orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }], include: { sorItem: { select: { code: true } }, lines: { orderBy: { sortOrder: 'asc' } } } },
} satisfies Prisma.TenderInclude;
type TenderRow = Prisma.TenderGetPayload<{ include: typeof TENDER_INCLUDE }>;
type ItemRow = TenderRow['items'][number];

/** A tender with its bid priced: each item, the totals and the bids ranked. */
interface Priced {
  terms: Terms;
  items: { row: ItemRow; priced: PricedItem }[];
  totals: ReturnType<typeof tenderTotals>;
  ranked: ReturnType<typeof rankBids>;
}

/**
 * Tender bidding (v6 item 110). The register keeps each tender's notice, dates, EMD (a guarantees entry of kind EMD) and
 * result; the bid BOQ is priced from each item's rate analysis (materials, labour and machine hours a unit takes, at the
 * item master's, labour and machine rates unless given) with the tender's overheads and profit, and quoted either as one
 * percentage on the SOR or a rate per item. The bids read out at opening rank the quote; a won tender becomes a project
 * with its BOQ (at the quoted rates, the budget rate from the analysis), material norms and resources, cost budget,
 * the EMD and the performance guarantee. Priced and kept by admin, management and the QS; seen by project managers and
 * accounts.
 */
@Injectable()
export class TendersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private projects: ProjectsService,
    private masters: MastersService,
  ) {}

  private assertView(user: RequestUser) {
    if (!canViewTenders(user.roleKey)) throw new ForbiddenException('The tender register is for head office: admin, management, the QS, project managers and accounts');
  }

  private assertEdit(user: RequestUser) {
    if (!canManageTenders(user.roleKey)) throw new ForbiddenException('Only admin, management and the QS price and record tenders');
  }

  private async row(user: RequestUser, id: string, withFiles = false) {
    const t = await this.prisma.tender.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { ...TENDER_INCLUDE, ...(withFiles ? { attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' as const } } } : {}) },
    });
    if (!t) throw new NotFoundException('Tender not found');
    return t as TenderRow & { attachments?: Prisma.AttachmentGetPayload<{ select: typeof ATTACHMENT_FIELDS }>[] };
  }

  /** The bid BOQ, its rate analysis, the quote and the percentage only change while the bid is being prepared. */
  private assertPreparing(t: { status: TenderStatus }) {
    if (t.status !== 'PREPARING') throw new ConflictException(`This tender is ${TENDER_STATUS_LABELS[t.status].toLowerCase()}: its bid no longer changes. Move it back to preparing to change it.`);
  }

  private price(t: TenderRow): Priced {
    const terms: Terms = { bidType: t.bidType, pct: t.quotedPct, overheadPct: t.overheadPct, profitPct: t.profitPct };
    const items = t.items.map((row) => ({
      row,
      priced: priceItem({ qty: row.qty, sorRate: row.sorRate, ownRate: row.quotedRate, lines: row.lines.map((l) => ({ kind: l.kind, qtyPerUnit: l.qtyPerUnit, wastagePct: l.wastagePct, rate: l.rate })) }, terms),
    }));
    const totals = tenderTotals(
      items.map((i) => ({ qty: i.row.qty, priced: i.priced })),
      terms,
      t.estimatedValue,
    );
    const ranked = rankBids(
      { name: OUR_BID, amount: t.status === 'DROPPED' ? null : totals.quotedAmount },
      t.bids.map((b) => ({ id: b.id, name: b.bidderName, amount: b.amount })),
    );
    return { terms, items, totals, ranked };
  }

  private toDto(t: TenderRow, p: Priced, today: string): TenderDto {
    const opened = t.bids.length > 0;
    const l1 = opened ? p.ranked[0] : null;
    return {
      id: t.id,
      tenderNo: t.tenderNo,
      nitNo: t.nitNo,
      title: t.title,
      clientId: t.clientId,
      clientName: t.client?.name ?? t.clientName,
      location: t.location,
      verticalCode: t.verticalCode,
      status: t.status,
      bidType: t.bidType,
      estimatedValue: money(t.estimatedValue),
      submitBy: dateOnly(t.submitBy)!,
      submittedOn: dateOnly(t.submittedOn),
      openedOn: dateOnly(t.openedOn),
      daysToSubmit: t.status === 'PREPARING' ? daysToSubmit(dateOnly(t.submitBy)!, today) : null,
      quotedAmount: money(p.totals.quotedAmount),
      quotedPct: p.totals.quotedPct,
      rank: opened ? (p.ranked.find((b) => b.us)?.rank ?? null) : null,
      bidders: t.bids.length + (p.totals.quotedAmount && t.status !== 'DROPPED' ? 1 : 0),
      l1Amount: l1 ? money(l1.amount) : null,
      l1Name: l1 ? l1.name : null,
      emdAmount: money(t.emdDoc?.amount),
      emdStatus: t.emdDoc?.status ?? null,
      projectId: t.project?.id ?? null,
      projectCode: t.project?.code ?? null,
    };
  }

  private itemDto(i: { row: ItemRow; priced: PricedItem }): TenderItemDto {
    const { row, priced } = i;
    return {
      id: row.id,
      itemNo: row.itemNo,
      description: row.description,
      unit: row.unit,
      qty: row.qty.toFixed(3).replace(/\.?0+$/, '') || '0',
      sorItemId: row.sorItemId,
      sorCode: row.sorItem?.code ?? null,
      sorRate: money(row.sorRate),
      sorAmount: money(priced.sorAmount),
      lines: row.lines.map((l, n) => ({
        id: l.id,
        kind: l.kind,
        itemId: l.itemId,
        name: l.name,
        unit: l.unit,
        qtyPerUnit: six(l.qtyPerUnit),
        wastagePct: pct2(l.wastagePct),
        rate: money(l.rate),
        amount: money(priced.lineAmounts[n]),
      })),
      material: money(priced.material),
      labour: money(priced.labour),
      equipment: money(priced.equipment),
      cost: money(priced.cost),
      builtUpRate: money(priced.builtUpRate),
      ownRate: money(row.quotedRate),
      quotedRate: money(priced.quotedRate),
      quotedAmount: money(priced.quotedAmount),
      unpriced: priced.unpriced,
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Register

  async list(user: RequestUser, q: TenderQuery): Promise<TenderListDto> {
    this.assertView(user);
    const today = todayIn();
    const status = q.status ?? 'open';
    const words = (q.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
    const rows = await this.prisma.tender.findMany({
      where: { organizationId: user.organizationId },
      include: TENDER_INCLUDE,
      orderBy: [{ submitBy: 'desc' }, { tenderNo: 'desc' }],
    });
    const all = rows.map((t) => ({ t, dto: this.toDto(t, this.price(t), today) }));
    const shown = all.filter(({ t, dto }) => {
      if (status === 'open' && !TENDER_OPEN.includes(t.status)) return false;
      if (status === 'closed' && TENDER_OPEN.includes(t.status)) return false;
      if (status !== 'open' && status !== 'closed' && status !== 'all' && t.status !== status) return false;
      if (!inVertical(t.verticalCode, q.vertical)) return false;
      if (!words.length) return true;
      const hay = [dto.tenderNo, dto.nitNo, dto.title, dto.clientName, dto.location].filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => hay.includes(w.toLowerCase()));
    });
    // Open tenders soonest due first; closed ones latest first.
    if (status === 'open') shown.sort((a, b) => a.dto.submitBy.localeCompare(b.dto.submitBy) || a.dto.tenderNo.localeCompare(b.dto.tenderNo));
    const since = fyStart(today);
    const decided = (s: TenderStatus) => all.filter(({ t }) => t.status === s && dateOnly(t.resultOn ?? t.updatedAt)! >= since);
    const won = decided('WON');
    const summary: TenderSummaryDto = {
      preparing: all.filter(({ t }) => t.status === 'PREPARING').length,
      dueThisWeek: all.filter(({ dto }) => dto.daysToSubmit !== null && dto.daysToSubmit >= 0 && dto.daysToSubmit <= TENDER_DUE_DAYS).length,
      awaitingResult: all.filter(({ t }) => t.status === 'SUBMITTED').length,
      wonCount: won.length,
      wonValue: money(won.reduce((s, { dto }) => s.plus(dto.quotedAmount ?? 0), ZERO))!,
      lostCount: decided('LOST').length,
      emdOut: money(all.filter(({ t }) => t.status !== 'WON' && t.emdDoc?.status === 'ACTIVE').reduce((s, { t }) => s.plus(t.emdDoc?.amount ?? 0), ZERO))!,
    };
    return { items: shown.map((s) => s.dto), summary };
  }

  async get(user: RequestUser, id: string): Promise<TenderDetailDto> {
    this.assertView(user);
    const t = await this.row(user, id, true);
    const today = todayIn();
    const p = this.price(t);
    const rates = await this.rates(user.organizationId);
    const base = p.totals.sorAmount;
    const bids: TenderBidDto[] = p.ranked.map((b) => ({
      id: b.id,
      bidderName: b.name,
      amount: money(b.amount)!,
      pct: pctOver(b.amount, base),
      rank: b.rank,
      us: b.us,
      note: b.id ? (t.bids.find((x) => x.id === b.id)?.note ?? null) : null,
    }));
    return {
      ...this.toDto(t, p, today),
      sorBookId: t.sorBookId,
      sorBookName: t.sorBook?.name ?? null,
      completionMonths: t.completionMonths,
      publishedOn: dateOnly(t.publishedOn),
      overheadPct: pct2(t.overheadPct),
      profitPct: pct2(t.profitPct),
      ownPct: t.quotedPct ? t.quotedPct.toFixed(2) : null,
      tenderFee: money(t.tenderFee),
      emd: t.emdDoc ? { id: t.emdDoc.id, reference: t.emdDoc.reference, issuer: t.emdDoc.issuer, amount: money(t.emdDoc.amount), expiresOn: dateOnly(t.emdDoc.expiresOn), status: t.emdDoc.status } : null,
      resultOn: dateOnly(t.resultOn),
      resultNote: t.resultNote,
      note: t.note,
      items: p.items.map((i) => this.itemDto(i)),
      bids,
      totals: {
        itemCount: p.totals.itemCount,
        analysedCount: p.totals.analysedCount,
        sorAmount: money(p.totals.sorAmount),
        costAmount: money(p.totals.costAmount)!,
        overheads: money(p.totals.overheads)!,
        profit: money(p.totals.profit)!,
        builtUpAmount: money(p.totals.builtUpAmount)!,
        quotedAmount: money(p.totals.quotedAmount),
        costPct: p.totals.costPct,
        builtUpPct: p.totals.builtUpPct,
        quotedPct: p.totals.quotedPct,
        margin: money(p.totals.margin),
      },
      attachments: (t.attachments ?? []).map((a) => this.attachments.toDto(a)),
      labourTrades: [...rates.labour.keys()].map((k) => rates.labourName.get(k)!).sort((a, b) => a.localeCompare(b)),
      equipmentCategories: rates.categories,
      createdByName: t.createdBy.fullName,
      createdAt: iso(t.createdAt)!,
      canEdit: canManageTenders(user.roleKey),
      canMakeProject: canMakeProjectFromTender(user.roleKey) && t.status === 'WON' && !t.projectId,
    };
  }

  /**
   * Bid intelligence (intelligence quick win Q4): the company's past openings of the same client and kind of work, each
   * priced through `price` like the register, with where L1 landed against the SOR (or the estimate) and our place; the
   * choice and the level are pure in `@erp/shared/bid-history.ts`.
   */
  async pastOpenings(user: RequestUser, id: string): Promise<PastOpeningsDto> {
    this.assertView(user);
    const t = await this.row(user, id);
    const today = todayIn();
    const clientKey = (r: { clientId: string | null; clientName: string | null; client: { name: string } | null }) => {
      const name = r.client?.name ?? r.clientName;
      return r.clientId ?? (name ? key(name) : null);
    };
    const kind = workKindOf(t.title);
    const rows = await this.prisma.tender.findMany({
      where: { organizationId: user.organizationId, id: { not: t.id }, openedOn: { not: null }, bids: { some: {} } },
      include: TENDER_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const picked = pickOpenings(
      { tenderId: t.id, clientKey: clientKey(t), kind },
      rows.map((r) => ({ tenderId: r.id, clientKey: clientKey(r), kind: workKindOf(r.title), openedOn: dateOnly(r.openedOn)! })),
      today,
    );
    const openings: PastOpeningDto[] = picked.map((o) => {
      const r = byId.get(o.tenderId)!;
      const p = this.price(r);
      const base = p.totals.sorAmount;
      const l1 = p.ranked[0];
      const us = p.ranked.find((b) => b.us);
      return {
        tenderId: r.id,
        tenderNo: r.tenderNo,
        title: r.title,
        clientName: r.client?.name ?? r.clientName,
        openedOn: o.openedOn,
        kind: o.kind,
        match: o.match,
        bidders: p.ranked.length,
        l1Name: l1.name,
        l1Pct: pctOver(l1.amount, base),
        ourPct: us ? pctOver(us.amount, base) : null,
        ourRank: us?.rank ?? null,
      };
    });
    const quotedPct = this.price(t).totals.quotedPct;
    return { tenderId: t.id, kind, quotedPct, openings, level: bidLevel(openings, quotedPct) };
  }

  /** The company's labour rates by trade and machine rates by category (the average hourly rate of its machines). */
  private async rates(organizationId: string) {
    const [labour, machines] = await Promise.all([
      this.prisma.labourRate.findMany({ where: { organizationId }, select: { category: true, dailyRate: true } }),
      this.prisma.equipment.findMany({ where: { organizationId, isActive: true }, select: { category: true, rate: true, rateUnit: true } }),
    ]);
    const perCategory = new Map<string, number[]>();
    for (const m of machines) {
      if (!m.category || !m.rate) continue;
      const k = key(m.category);
      perCategory.set(k, [...(perCategory.get(k) ?? []), equipmentHourlyRate(m.rate.toNumber(), m.rateUnit)]);
    }
    return {
      labour: new Map(labour.map((l) => [key(l.category), l.dailyRate])),
      labourName: new Map(labour.map((l) => [key(l.category), l.category])),
      machine: new Map([...perCategory].map(([k, rs]) => [k, new Dec(rs.reduce((s, r) => s + r, 0) / rs.length).toDecimalPlaces(2)])),
      categories: [...new Set(machines.flatMap((m) => (m.category ? [m.category.trim()] : [])))].sort((a, b) => a.localeCompare(b)),
    };
  }

  private async clientName(user: RequestUser, dto: TenderFieldsInput): Promise<{ clientId?: string | null; clientName?: string | null }> {
    if (dto.clientId) {
      const c = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId: user.organizationId }, select: { name: true } });
      if (!c) throw new BadRequestException('Choose a client from the client master');
      return { clientId: dto.clientId, clientName: c.name };
    }
    if (dto.clientId === null) return { clientId: null, clientName: dto.clientName ?? null };
    return dto.clientName !== undefined ? { clientName: dto.clientName } : {};
  }

  private async assertBook(user: RequestUser, sorBookId: string | null | undefined) {
    if (!sorBookId) return;
    const b = await this.prisma.sorBook.findFirst({ where: { id: sorBookId, organizationId: user.organizationId }, select: { id: true } });
    if (!b) throw new BadRequestException('Choose a schedule of rates of the company');
  }

  /** The EMD as a guarantees entry: added with its reference, changed with the tender, removed when cleared. */
  private async syncEmd(tx: Tx, user: RequestUser, t: { id: string; tenderNo: string; title: string; clientName: string | null; emdDocId: string | null }, dto: TenderFieldsInput) {
    const touched = dto.emdAmount !== undefined || dto.emdReference !== undefined || dto.emdIssuer !== undefined || dto.emdExpiresOn !== undefined;
    if (!touched) return;
    const cur = t.emdDocId ? await tx.complianceDoc.findUnique({ where: { id: t.emdDocId } }) : null;
    const amount = dto.emdAmount !== undefined ? dto.emdAmount : cur?.amount?.toNumber() ?? null;
    const reference = dto.emdReference !== undefined ? dto.emdReference : cur?.reference ?? null;
    if (!amount) {
      if (cur && cur.status === 'ACTIVE') {
        await tx.tender.update({ where: { id: t.id }, data: { emdDocId: null } });
        await tx.complianceDoc.delete({ where: { id: cur.id } });
      }
      return;
    }
    if (!reference) throw new BadRequestException("Enter the EMD's reference: the DD, BG or receipt number");
    const data = {
      reference,
      issuer: dto.emdIssuer !== undefined ? dto.emdIssuer : cur?.issuer ?? null,
      amount: new Dec(amount),
      expiresOn: dto.emdExpiresOn !== undefined ? (dto.emdExpiresOn ? parseDate(dto.emdExpiresOn) : null) : cur?.expiresOn ?? null,
      beneficiary: t.clientName,
      note: `Tender ${t.tenderNo}: ${t.title}`.slice(0, 500),
    };
    if (cur) await tx.complianceDoc.update({ where: { id: cur.id }, data });
    else {
      const doc = await tx.complianceDoc.create({ data: { ...data, organizationId: user.organizationId, kind: 'EMD', category: 'EMD', createdById: user.id } });
      await tx.tender.update({ where: { id: t.id }, data: { emdDocId: doc.id } });
    }
  }

  /** A tender's vertical (item 167) is a code of the company's vertical master, switched on. */
  private async assertVertical(user: RequestUser, code: string | null | undefined) {
    if (!code) return;
    const problem = verticalProblem(code, await this.masters.entriesFor(user.organizationId, 'vertical'));
    if (problem) throw new BadRequestException(problem);
  }

  private fields(dto: TenderFieldsInput): Prisma.TenderUncheckedUpdateInput {
    const day = (v: string | null | undefined) => (v === undefined ? undefined : v ? parseDate(v) : null);
    const decOrNull = (v: number | null | undefined) => (v === undefined ? undefined : v === null ? null : new Dec(v));
    return {
      nitNo: dto.nitNo,
      location: dto.location,
      verticalCode: dto.verticalCode,
      bidType: dto.bidType,
      sorBookId: dto.sorBookId,
      estimatedValue: decOrNull(dto.estimatedValue),
      completionMonths: dto.completionMonths,
      publishedOn: day(dto.publishedOn),
      quotedPct: decOrNull(dto.quotedPct),
      overheadPct: decOrNull(dto.overheadPct) ?? undefined,
      profitPct: decOrNull(dto.profitPct) ?? undefined,
      tenderFee: decOrNull(dto.tenderFee),
      note: dto.note,
    };
  }

  async create(user: RequestUser, dto: CreateTenderDto): Promise<TenderDetailDto> {
    this.assertEdit(user);
    await this.assertBook(user, dto.sorBookId);
    await this.assertVertical(user, dto.verticalCode);
    const client = await this.clientName(user, dto);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const tenderNo =
          dto.tenderNo ||
          (await nextDocNo(tx, user.organizationId, 'TND', async (prefix) => (await tx.tender.findFirst({ where: { organizationId: user.organizationId, tenderNo: { startsWith: prefix } }, orderBy: { tenderNo: 'desc' }, select: { tenderNo: true } }))?.tenderNo ?? null));
        const t = await tx.tender.create({
          data: { ...(this.fields(dto) as Prisma.TenderUncheckedCreateInput), organizationId: user.organizationId, tenderNo, title: dto.title, submitBy: parseDate(dto.submitBy), clientId: client.clientId ?? null, clientName: client.clientName ?? null, createdById: user.id },
        });
        await this.syncEmd(tx, user, { id: t.id, tenderNo, title: t.title, clientName: t.clientName, emdDocId: null }, dto);
        return t.id;
      });
      await this.attachments.link(user, 'tenderId', id, dto.attachmentIds);
      await this.audit.log(user, 'TENDER', id, 'CREATED', dto.title);
      return this.get(user, id);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Tender number ${dto.tenderNo} is taken. Use another, or leave it blank for the next one.`);
      throw e;
    }
  }

  async update(user: RequestUser, id: string, dto: UpdateTenderDto): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    const pricing = dto.bidType !== undefined || dto.sorBookId !== undefined || dto.quotedPct !== undefined || dto.overheadPct !== undefined || dto.profitPct !== undefined || dto.estimatedValue !== undefined;
    const changes = (a: unknown, b: unknown) => a !== undefined && String(a ?? '') !== String(b ?? '');
    if (pricing && t.status !== 'PREPARING') {
      const moved =
        changes(dto.bidType, t.bidType) ||
        changes(dto.sorBookId, t.sorBookId) ||
        (dto.quotedPct !== undefined && String(dto.quotedPct ?? '') !== (t.quotedPct ? String(t.quotedPct.toNumber()) : '')) ||
        (dto.overheadPct !== undefined && dto.overheadPct !== t.overheadPct.toNumber()) ||
        (dto.profitPct !== undefined && dto.profitPct !== t.profitPct.toNumber()) ||
        (dto.estimatedValue !== undefined && String(dto.estimatedValue ?? '') !== (t.estimatedValue ? String(t.estimatedValue.toNumber()) : ''));
      if (moved) this.assertPreparing(t);
    }
    await this.assertBook(user, dto.sorBookId);
    if (dto.verticalCode !== undefined && dto.verticalCode !== t.verticalCode) await this.assertVertical(user, dto.verticalCode);
    const client = await this.clientName(user, dto);
    try {
      await this.prisma.$transaction(async (tx) => {
        const u = await tx.tender.update({
          where: { id },
          data: { ...this.fields(dto), tenderNo: dto.tenderNo, title: dto.title, submitBy: dto.submitBy ? parseDate(dto.submitBy) : undefined, openedOn: dto.openedOn === undefined ? undefined : dto.openedOn ? parseDate(dto.openedOn) : null, ...client },
        });
        await this.syncEmd(tx, user, { id, tenderNo: u.tenderNo, title: u.title, clientName: u.clientName, emdDocId: u.emdDocId }, dto);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Tender number ${dto.tenderNo} is taken`);
      throw e;
    }
    if (dto.attachmentIds) await this.attachments.sync(user, 'tenderId', id, dto.attachmentIds);
    await this.audit.log(user, 'TENDER', id, 'UPDATED');
    return this.get(user, id);
  }

  /** A tender entered by mistake, or one not bid: its BOQ, bids and an EMD still on hand go with it. */
  async remove(user: RequestUser, id: string) {
    this.assertEdit(user);
    const t = await this.row(user, id);
    if (t.projectId) throw new ConflictException('This tender became a project and stays on record');
    if (t.status === 'WON' || t.status === 'LOST' || t.status === 'SUBMITTED') throw new ConflictException('A bid that went in stays on record. Delete it only while preparing, or when it was not bid or was cancelled.');
    await this.prisma.$transaction(async (tx) => {
      await tx.tender.delete({ where: { id } });
      if (t.emdDoc && t.emdDoc.status === 'ACTIVE') await tx.complianceDoc.delete({ where: { id: t.emdDoc.id } });
    });
    await this.audit.log(user, 'TENDER', id, 'DELETED', `${t.tenderNo} ${t.title}`);
    return { ok: true };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Bid BOQ

  private async sorItem(user: RequestUser, sorBookId: string | null, id: string) {
    const s = await this.prisma.sorItem.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, bookId: true, code: true, description: true, unit: true, rate: true } });
    if (!s) throw new BadRequestException('Choose an item of the schedule of rates');
    if (sorBookId && s.bookId !== sorBookId) throw new BadRequestException('Choose an item of the schedule this tender is priced against');
    return s;
  }

  /** The client's BOQ from Excel: matched to the tender's schedule by SOR code, its rate taken when the sheet has none. */
  async importItems(user: RequestUser, id: string, dto: TenderItemImportDto) {
    this.assertEdit(user);
    const t = await this.row(user, id);
    this.assertPreparing(t);
    if (!dto.items.length) throw new BadRequestException('The sheet has no items to import');
    const codes = [...new Set(dto.items.map((r) => r.sorCode?.trim()).filter((c): c is string => !!c))];
    const sor = t.sorBookId && codes.length ? await this.prisma.sorItem.findMany({ where: { bookId: t.sorBookId, code: { in: codes } }, select: { id: true, code: true, rate: true } }) : [];
    const byCode = new Map(sor.map((s) => [s.code.toLowerCase(), s]));
    const keep = dto.replace ? [] : t.items.map((i) => i.itemNo.toLowerCase());
    const seen = new Set(keep);
    const rows = dto.items.map((r, n) => {
      const where = `Row ${n + 1}${r.itemNo ? ` (${r.itemNo.trim()})` : ''}`;
      const itemNo = r.itemNo.trim();
      const description = r.description.trim().replace(/\s+/g, ' ');
      const unit = r.unit.trim();
      const qty = Number(r.qty.replace(/[,\s]/g, ''));
      if (!itemNo || !description || !unit) throw new BadRequestException(`${where}: give it an item number, description and unit`);
      if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException(`${where}: the quantity is not a number above zero`);
      if (seen.has(itemNo.toLowerCase())) throw new BadRequestException(`${where}: item ${itemNo} is ${dto.replace ? 'in the sheet twice' : 'already in the bid BOQ'}`);
      seen.add(itemNo.toLowerCase());
      const match = r.sorCode ? byCode.get(r.sorCode.trim().toLowerCase()) : undefined;
      const rawRate = r.sorRate?.replace(/[,₹\s]/g, '') ?? '';
      if (rawRate && (!Number.isFinite(Number(rawRate)) || Number(rawRate) < 0)) throw new BadRequestException(`${where}: the SOR rate is not a number`);
      return { itemNo, description, unit, qty: new Dec(qty).toDecimalPlaces(3), sorItemId: match?.id ?? null, sorRate: rawRate ? new Dec(rawRate).toDecimalPlaces(2) : (match?.rate ?? null) };
    });
    const unmatched = dto.items.filter((r) => r.sorCode?.trim() && !byCode.has(r.sorCode.trim().toLowerCase())).length;
    await this.prisma.$transaction(async (tx) => {
      if (dto.replace) await tx.tenderItem.deleteMany({ where: { tenderId: id } });
      const start = dto.replace ? 0 : t.items.length;
      await tx.tenderItem.createMany({ data: rows.map((r, n) => ({ ...r, organizationId: user.organizationId, tenderId: id, sortOrder: start + n })) });
    });
    await this.audit.log(user, 'TENDER', id, 'BOQ_IMPORTED', `${rows.length} items`);
    return { added: rows.length, matched: rows.filter((r) => r.sorItemId).length, unmatched };
  }

  async addItem(user: RequestUser, id: string, dto: CreateTenderItemDto): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    this.assertPreparing(t);
    const s = dto.sorItemId ? await this.sorItem(user, t.sorBookId, dto.sorItemId) : null;
    const description = dto.description ?? s?.description;
    const unit = dto.unit ?? s?.unit;
    if (!description || !unit) throw new BadRequestException('Describe the item and give its unit, or choose it from the schedule of rates');
    try {
      await this.prisma.tenderItem.create({
        data: {
          organizationId: user.organizationId,
          tenderId: id,
          itemNo: dto.itemNo,
          description,
          unit,
          qty: new Dec(dto.qty),
          sorItemId: s?.id ?? null,
          sorRate: dto.sorRate !== undefined && dto.sorRate !== null ? new Dec(dto.sorRate) : (s?.rate ?? null),
          quotedRate: dto.ownRate ? new Dec(dto.ownRate) : null,
          sortOrder: t.items.length,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Item ${dto.itemNo} is already in the bid BOQ`);
      throw e;
    }
    return this.get(user, id);
  }

  private item(t: TenderRow, itemId: string) {
    const i = t.items.find((x) => x.id === itemId);
    if (!i) throw new NotFoundException('That item is not in this bid BOQ');
    return i;
  }

  async updateItem(user: RequestUser, id: string, itemId: string, dto: TenderItemInput): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    this.assertPreparing(t);
    this.item(t, itemId);
    const s = dto.sorItemId ? await this.sorItem(user, t.sorBookId, dto.sorItemId) : null;
    try {
      await this.prisma.tenderItem.update({
        where: { id: itemId },
        data: {
          itemNo: dto.itemNo,
          description: dto.description,
          unit: dto.unit,
          qty: dto.qty !== undefined ? new Dec(dto.qty) : undefined,
          sorItemId: dto.sorItemId === undefined ? undefined : (s?.id ?? null),
          sorRate: dto.sorRate !== undefined ? (dto.sorRate === null ? null : new Dec(dto.sorRate)) : s ? s.rate : undefined,
          quotedRate: dto.ownRate === undefined ? undefined : dto.ownRate === null ? null : new Dec(dto.ownRate),
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Item ${dto.itemNo} is already in the bid BOQ`);
      throw e;
    }
    return this.get(user, id);
  }

  async removeItem(user: RequestUser, id: string, itemId: string) {
    this.assertEdit(user);
    const t = await this.row(user, id);
    this.assertPreparing(t);
    this.item(t, itemId);
    await this.prisma.tenderItem.delete({ where: { id: itemId } });
    return this.get(user, id);
  }

  /** An item's rate analysis, replaced as a whole. A line without a rate takes the master's (store item, labour, machines). */
  async setLines(user: RequestUser, id: string, itemId: string, dto: TenderLinesDto): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    this.assertPreparing(t);
    this.item(t, itemId);
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId).filter((x): x is string => !!x))];
    const store = new Map((await this.prisma.item.findMany({ where: { id: { in: itemIds }, organizationId: user.organizationId }, select: { id: true, name: true, unit: true, rate: true } })).map((i) => [i.id, i]));
    const rates = await this.rates(user.organizationId);
    const data = dto.lines.map((l, n) => {
      const where = `Line ${n + 1}`;
      if (l.kind === 'MATERIAL' && l.itemId && !store.has(l.itemId)) throw new BadRequestException(`${where}: choose a store item of the company`);
      const s = l.kind === 'MATERIAL' && l.itemId ? store.get(l.itemId)! : null;
      const name = l.name?.trim() || s?.name;
      if (!name) throw new BadRequestException(`${where}: ${l.kind === 'MATERIAL' ? 'choose the store item or name the material' : l.kind === 'LABOUR' ? 'name the trade, e.g. Mason' : 'name the machine category, e.g. Concreting'}`);
      const unit = l.unit?.trim() || s?.unit || (l.kind === 'LABOUR' ? 'day' : l.kind === 'EQUIPMENT' ? 'hour' : '');
      if (!unit) throw new BadRequestException(`${where}: give the material's unit`);
      const fallback = l.kind === 'MATERIAL' ? (s?.rate ?? null) : l.kind === 'LABOUR' ? (rates.labour.get(key(name)) ?? null) : (rates.machine.get(key(name)) ?? null);
      return {
        organizationId: user.organizationId,
        tenderItemId: itemId,
        kind: l.kind,
        itemId: s?.id ?? null,
        name,
        unit,
        qtyPerUnit: new Dec(l.qtyPerUnit).toDecimalPlaces(6),
        wastagePct: l.kind === 'MATERIAL' ? new Dec(l.wastagePct ?? 0) : ZERO,
        rate: l.rate === undefined ? fallback : l.rate === null ? null : new Dec(l.rate),
        sortOrder: n,
      };
    });
    await this.prisma.$transaction([this.prisma.tenderItemLine.deleteMany({ where: { tenderItemId: itemId } }), this.prisma.tenderItemLine.createMany({ data })]);
    return this.get(user, id);
  }

  /** Lines from the starter library's entry for an item (the one its description suggests unless named), at the master's rates. */
  private async libraryLines(user: RequestUser, it: { id: string; description: string; unit: string }, libraryKey: string | undefined, rates: Awaited<ReturnType<TendersService['rates']>>) {
    const entry = libraryKey ? RATE_LIBRARY.find((e) => e.key === libraryKey) : suggestRateLibrary(it.description, it.unit);
    if (!entry) return null;
    const words = [...new Set(entry.materials.flatMap((m) => m.match.map((set) => set[0])))];
    const items = words.length ? await this.prisma.item.findMany({ where: { organizationId: user.organizationId, OR: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })) }, select: { id: true, name: true, unit: true, rate: true } }) : [];
    const lines: Prisma.TenderItemLineCreateManyInput[] = [];
    for (const m of entry.materials) {
      const pick = pickLibraryItem(m, items, it.description);
      lines.push({
        organizationId: user.organizationId,
        tenderItemId: it.id,
        kind: 'MATERIAL',
        itemId: pick.item?.id ?? null,
        name: pick.item?.name ?? m.label,
        unit: pick.item?.unit ?? m.unit,
        qtyPerUnit: new Dec(m.qtyPerUnit),
        wastagePct: new Dec(m.wastagePct),
        rate: pick.item?.rate ?? null,
        sortOrder: lines.length,
      });
    }
    for (const r of entry.resources) {
      lines.push({
        organizationId: user.organizationId,
        tenderItemId: it.id,
        kind: r.kind,
        itemId: null,
        name: r.name,
        unit: r.kind === 'LABOUR' ? 'day' : 'hour',
        qtyPerUnit: new Dec(r.qtyPerUnit),
        wastagePct: ZERO,
        rate: (r.kind === 'LABOUR' ? rates.labour.get(key(r.name)) : rates.machine.get(key(r.name))) ?? null,
        sortOrder: lines.length,
      });
    }
    return { entry, lines, unitWarning: !sameUnit(entry.unit, it.unit) };
  }

  async fillFromLibrary(user: RequestUser, id: string, itemId: string, dto: TenderLibraryDto): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    this.assertPreparing(t);
    const it = this.item(t, itemId);
    if (dto.libraryKey && !RATE_LIBRARY.some((e) => e.key === dto.libraryKey)) throw new BadRequestException('That library entry does not exist');
    const found = await this.libraryLines(user, it, dto.libraryKey, await this.rates(user.organizationId));
    if (!found) throw new BadRequestException(`The starter library has nothing like ${it.itemNo}. Enter its analysis by hand.`);
    await this.prisma.$transaction([this.prisma.tenderItemLine.deleteMany({ where: { tenderItemId: itemId } }), this.prisma.tenderItemLine.createMany({ data: found.lines })]);
    return this.get(user, id);
  }

  /** Every item still without an analysis that the starter library knows. */
  async fillAllFromLibrary(user: RequestUser, id: string) {
    this.assertEdit(user);
    const t = await this.row(user, id);
    this.assertPreparing(t);
    const rates = await this.rates(user.organizationId);
    let filled = 0;
    for (const it of t.items.filter((i) => !i.lines.length)) {
      const found = await this.libraryLines(user, it, undefined, rates);
      if (!found || found.unitWarning) continue;
      await this.prisma.tenderItemLine.createMany({ data: found.lines });
      filled++;
    }
    return { filled, left: t.items.filter((i) => !i.lines.length).length - filled };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Submission, opening and result

  async submit(user: RequestUser, id: string, dto: SubmitTenderDto): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    const problem = moveProblem(t.status, 'SUBMITTED', !!t.projectId);
    if (problem) throw new ConflictException(problem);
    const p = this.price(t);
    const why = submitProblem(
      t.bidType,
      p.items.map((i) => ({ itemNo: i.row.itemNo, quotedRate: i.priced.quotedRate })),
      t.quotedPct,
      p.totals.quotedAmount,
    );
    if (why) throw new BadRequestException(why);
    if (dto.submittedOn > todayIn()) throw new BadRequestException('Record the bid once it has gone in, not ahead of the day');
    await this.prisma.tender.update({ where: { id }, data: { status: 'SUBMITTED', submittedOn: parseDate(dto.submittedOn) } });
    await this.audit.log(user, 'TENDER', id, 'SUBMITTED', `${money(p.totals.quotedAmount)}${p.totals.quotedPct ? ` (${p.totals.quotedPct}% on SOR)` : ''}`);
    return this.get(user, id);
  }

  /** The result (won, lost), not bidding, a cancellation, or a step back to correct one. */
  async setStatus(user: RequestUser, id: string, dto: TenderStatusDto): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    if (dto.status === 'SUBMITTED' && t.status === 'PREPARING') throw new BadRequestException('Record the bid as submitted with its date');
    const problem = moveProblem(t.status, dto.status, !!t.projectId);
    if (problem) throw new ConflictException(problem);
    if (dto.on && dto.on > todayIn()) throw new BadRequestException('Choose a date on or before today');
    const result = (TENDER_RESULTS as readonly string[]).includes(dto.status);
    await this.prisma.tender.update({
      where: { id },
      data: {
        status: dto.status,
        resultOn: result ? parseDate(dto.on ?? todayIn()) : null,
        resultNote: result ? (dto.note ?? null) : null,
        ...(dto.status === 'PREPARING' ? { submittedOn: null } : {}),
      },
    });
    await this.audit.log(user, 'TENDER', id, `STATUS_${dto.status}`, dto.note ?? null);
    return this.get(user, id);
  }

  /** Another bidder's price read out at opening, as an amount or a percentage on the SOR value. */
  async addBid(user: RequestUser, id: string, dto: TenderBidInput): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    if (t.status === 'PREPARING' || t.status === 'DROPPED') throw new ConflictException('Record the other bids once ours has gone in and the bids are opened');
    if (!dto.amount === (dto.pct === undefined || dto.pct === null)) throw new BadRequestException('Enter the bid as an amount or as a percentage on the SOR, one of the two');
    let amount: D;
    if (dto.amount) amount = new Dec(dto.amount);
    else {
      const base = this.price(t).totals.sorAmount;
      if (!base) throw new BadRequestException('This tender has no SOR value to put a percentage on. Enter the amount.');
      amount = withPct(base, new Dec(dto.pct!));
    }
    if (dto.bidderName.toLowerCase() === OUR_BID.toLowerCase()) throw new BadRequestException('Our own bid is counted already. Enter the other bidders.');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenderBid.create({ data: { organizationId: user.organizationId, tenderId: id, bidderName: dto.bidderName, amount, note: dto.note ?? null } });
        if (!t.openedOn) await tx.tender.update({ where: { id }, data: { openedOn: parseDate(todayIn()) } });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${dto.bidderName}'s bid is in already. Remove it to change it.`);
      throw e;
    }
    return this.get(user, id);
  }

  async removeBid(user: RequestUser, id: string, bidId: string): Promise<TenderDetailDto> {
    this.assertEdit(user);
    const t = await this.row(user, id);
    if (!t.bids.some((b) => b.id === bidId)) throw new NotFoundException('That bid is not on this tender');
    await this.prisma.tenderBid.delete({ where: { id: bidId } });
    return this.get(user, id);
  }

  /** The EMD of a tender not won comes back: its guarantees entry is released. */
  async emdReturned(user: RequestUser, id: string, dto: EmdReturnedDto): Promise<TenderDetailDto> {
    if (!canManageTenders(user.roleKey) && !canManageCompliance(user.roleKey)) throw new ForbiddenException('Only those who keep tenders or guarantees record an EMD returned');
    this.assertView(user);
    const t = await this.row(user, id);
    if (!t.emdDoc) throw new BadRequestException('This tender has no EMD on record');
    if (t.emdDoc.status !== 'ACTIVE') throw new ConflictException('The EMD is no longer held');
    if (t.status === 'WON') throw new ConflictException('A won tender’s EMD is held with the project until the performance guarantee replaces it. Release it from Guarantees and licences.');
    if (dto.on > todayIn()) throw new BadRequestException('Record the EMD returned once it is back, not ahead of the day');
    await this.prisma.complianceDoc.update({ where: { id: t.emdDoc.id }, data: { status: 'RELEASED', closedOn: parseDate(dto.on), closeNote: dto.note ?? `Returned after tender ${t.tenderNo}` } });
    await this.audit.log(user, 'TENDER', id, 'EMD_RETURNED', dto.note ?? null);
    return this.get(user, id);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Won: the project

  /**
   * A won tender becomes a project: the bid BOQ at the quoted rates (the budget rate is the analysis's cost with
   * overheads), the analysis as the project's material norms and labour and machine resources, the cost budget by head,
   * the EMD moved to the project and the performance guarantee recorded.
   */
  async makeProject(user: RequestUser, id: string, dto: MakeProjectDto) {
    if (!canMakeProjectFromTender(user.roleKey)) throw new ForbiddenException('Admin and management turn a won tender into a project');
    const t = await this.row(user, id);
    if (t.status !== 'WON') throw new ConflictException('Record the tender as won first');
    if (t.projectId) throw new ConflictException(`This tender is project ${t.project?.code} already`);
    const p = this.price(t);
    if (!p.totals.quotedAmount) throw new BadRequestException('The bid has no amount to make the contract value');
    const start = dto.startDate ?? todayIn();
    const project = await this.projects.create(user, {
      code: dto.code,
      name: dto.name || t.title.slice(0, 200),
      type: dto.type,
      status: 'ACTIVE',
      ...(t.clientId ? { clientId: t.clientId } : { clientName: t.clientName ?? undefined }),
      location: t.location ?? undefined,
      ...(t.verticalCode ? { verticalCode: t.verticalCode } : {}),
      workOrderNo: dto.agreementNo ?? undefined,
      description: `Won on tender ${t.tenderNo}${t.nitNo ? ` (${t.nitNo})` : ''}`,
      startDate: start,
      endDate: t.completionMonths ? addMonths(start, t.completionMonths) : undefined,
      contractValue: money(p.totals.quotedAmount)!,
      projectManagerId: dto.projectManagerId ?? undefined,
      applyTemplate: dto.applyTemplate ?? false,
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id: project.id }, data: { estimateOverheadPct: t.overheadPct, estimateProfitPct: t.profitPct, agreementNo: dto.agreementNo ?? null, agreementDate: parseDate(start) } });
        let material = ZERO;
        let labour = ZERO;
        let machinery = ZERO;
        let expenses = ZERO;
        for (const [n, { row, priced }] of p.items.entries()) {
          const boq = await tx.boqItem.create({
            data: {
              organizationId: user.organizationId,
              projectId: project.id,
              itemNo: row.itemNo,
              description: row.description,
              unit: row.unit,
              rate: priced.quotedRate ?? ZERO,
              originalQty: row.qty,
              budgetRate: priced.cost ? r2(priced.cost.plus(priced.overheads!)) : null,
              sortOrder: n,
            },
          });
          if (priced.cost) {
            material = material.plus(r2(row.qty.mul(priced.material!)));
            labour = labour.plus(r2(row.qty.mul(priced.labour!)));
            machinery = machinery.plus(r2(row.qty.mul(priced.equipment!)));
            expenses = expenses.plus(r2(row.qty.mul(priced.overheads!)));
          }
          const norms = new Map<string, Prisma.MaterialNormCreateManyInput>();
          const resources = new Map<string, Prisma.BoqResourceCreateManyInput>();
          for (const l of row.lines) {
            if (l.kind === 'MATERIAL') {
              if (l.itemId && !norms.has(l.itemId)) norms.set(l.itemId, { organizationId: user.organizationId, projectId: project.id, boqItemId: boq.id, itemId: l.itemId, qtyPerUnit: l.qtyPerUnit, wastagePct: l.wastagePct, note: `Tender ${t.tenderNo}`, updatedById: user.id });
            } else {
              const k = `${l.kind}:${key(l.name)}`;
              if (!resources.has(k)) resources.set(k, { organizationId: user.organizationId, projectId: project.id, boqItemId: boq.id, kind: l.kind, name: l.name, qtyPerUnit: l.qtyPerUnit, note: `Tender ${t.tenderNo}`, updatedById: user.id });
            }
          }
          if (norms.size) await tx.materialNorm.createMany({ data: [...norms.values()] });
          if (resources.size) await tx.boqResource.createMany({ data: [...resources.values()] });
        }
        if (p.totals.analysedCount) {
          await tx.projectBudget.create({ data: { organizationId: user.organizationId, projectId: project.id, material, labour, machinery, expenses, subcontract: ZERO, notes: `From the rate analysis of tender ${t.tenderNo}`, updatedById: user.id } });
        }
        if (t.emdDoc) await tx.complianceDoc.update({ where: { id: t.emdDoc.id }, data: { projectId: project.id } });
        if (dto.guarantee) {
          await tx.complianceDoc.create({
            data: {
              organizationId: user.organizationId,
              kind: 'BANK_GUARANTEE',
              category: 'Performance guarantee',
              reference: dto.guarantee.reference,
              issuer: dto.guarantee.issuer ?? null,
              projectId: project.id,
              beneficiary: t.client?.name ?? t.clientName,
              amount: new Dec(dto.guarantee.amount),
              issuedOn: parseDate(start),
              expiresOn: dto.guarantee.expiresOn ? parseDate(dto.guarantee.expiresOn) : null,
              note: `Tender ${t.tenderNo}`,
              createdById: user.id,
            },
          });
        }
        await tx.tender.update({ where: { id }, data: { projectId: project.id } });
      });
    } catch (e) {
      // The project is new and empty but for this: take it away again so the tender can be made a project once more.
      await this.prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
      throw e;
    }
    await this.audit.log(user, 'TENDER', id, 'PROJECT_MADE', project.code);
    return { projectId: project.id, projectCode: project.code };
  }
}
