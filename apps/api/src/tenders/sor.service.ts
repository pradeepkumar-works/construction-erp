import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canManageTenders, canViewTenders, type SorBookDto, type SorImportResultDto, type SorItemDto, type SorItemListDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { iso, money } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { sorRowProblem } from './tender-rules';
import { SorBookInput, SorImportDto, SorItemQuery, UpdateSorBookDto, UpdateSorItemDto } from './tenders.dto';

const Dec = Prisma.Decimal;
type ItemRow = Prisma.SorItemGetPayload<{ include: { book: { select: { name: true } } } }>;

export const sorItemDto = (r: ItemRow): SorItemDto => ({
  id: r.id,
  bookId: r.bookId,
  bookName: r.book.name,
  code: r.code,
  chapter: r.chapter,
  description: r.description,
  unit: r.unit,
  rate: money(r.rate),
});

/**
 * Schedules of rates (v6 item 110): a state SOR, the CPWD DSR or the company's own rates, each a book of items with a
 * code, unit and rate, imported from Excel (a row with a code already in the book updates it). A tender is priced
 * against one book. Kept by those who price tenders; seen by those who see the tender register.
 */
@Injectable()
export class SorService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertView(user: RequestUser) {
    if (!canViewTenders(user.roleKey)) throw new ForbiddenException('Schedules of rates are for those who price tenders');
  }

  private assertEdit(user: RequestUser) {
    if (!canManageTenders(user.roleKey)) throw new ForbiddenException('Only admin, management and the QS keep the schedules of rates');
  }

  private async book(user: RequestUser, id: string) {
    const b = await this.prisma.sorBook.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!b) throw new NotFoundException('Schedule of rates not found');
    return b;
  }

  async books(user: RequestUser): Promise<SorBookDto[]> {
    this.assertView(user);
    const rows = await this.prisma.sorBook.findMany({ where: { organizationId: user.organizationId }, include: { _count: { select: { items: true, tenders: true } } }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
    return rows.map((b) => ({ id: b.id, name: b.name, kind: b.kind, edition: b.edition, region: b.region, note: b.note, itemCount: b._count.items, tenderCount: b._count.tenders, updatedAt: iso(b.updatedAt) }));
  }

  async createBook(user: RequestUser, dto: SorBookInput): Promise<SorBookDto> {
    this.assertEdit(user);
    try {
      const b = await this.prisma.sorBook.create({ data: { organizationId: user.organizationId, name: dto.name, kind: dto.kind, edition: dto.edition ?? null, region: dto.region ?? null, note: dto.note ?? null, createdById: user.id } });
      await this.audit.log(user, 'SOR_BOOK', b.id, 'CREATED', b.name);
      return { id: b.id, name: b.name, kind: b.kind, edition: b.edition, region: b.region, note: b.note, itemCount: 0, tenderCount: 0, updatedAt: iso(b.updatedAt) };
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`There is already a schedule called ${dto.name}`);
      throw e;
    }
  }

  async updateBook(user: RequestUser, id: string, dto: UpdateSorBookDto): Promise<SorBookDto> {
    this.assertEdit(user);
    await this.book(user, id);
    try {
      await this.prisma.sorBook.update({ where: { id }, data: { name: dto.name, kind: dto.kind, edition: dto.edition, region: dto.region, note: dto.note } });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`There is already a schedule called ${dto.name}`);
      throw e;
    }
    await this.audit.log(user, 'SOR_BOOK', id, 'UPDATED');
    return (await this.books(user)).find((b) => b.id === id)!;
  }

  /** A schedule no tender is priced against; its items go with it. */
  async removeBook(user: RequestUser, id: string) {
    this.assertEdit(user);
    const b = await this.book(user, id);
    const used = await this.prisma.tender.count({ where: { sorBookId: id } });
    if (used) throw new ConflictException(`${used} tender${used === 1 ? ' is' : 's are'} priced against ${b.name}. Move ${used === 1 ? 'it' : 'them'} to another schedule first.`);
    await this.prisma.sorBook.delete({ where: { id } });
    await this.audit.log(user, 'SOR_BOOK', id, 'DELETED', b.name);
    return { ok: true };
  }

  async items(user: RequestUser, q: SorItemQuery): Promise<SorItemListDto> {
    this.assertView(user);
    const words = (q.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
    const where: Prisma.SorItemWhereInput = {
      organizationId: user.organizationId,
      ...(q.bookId ? { bookId: q.bookId } : {}),
      ...(words.length ? { AND: words.map((w) => ({ OR: [{ code: { startsWith: w, mode: 'insensitive' as const } }, { description: { contains: w, mode: 'insensitive' as const } }, { chapter: { contains: w, mode: 'insensitive' as const } }] })) } : {}),
    };
    const pageSize = q.pageSize ?? 50;
    const page = q.page ?? 1;
    const [rows, total] = await Promise.all([
      this.prisma.sorItem.findMany({ where, include: { book: { select: { name: true } } }, orderBy: [{ book: { name: 'asc' } }, { code: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.sorItem.count({ where }),
    ]);
    return { items: rows.map(sorItemDto), total };
  }

  /** Rows from Excel into a schedule: a new code is added, a known one updated, an identical one left alone. */
  async importRows(user: RequestUser, bookId: string, dto: SorImportDto): Promise<SorImportResultDto> {
    this.assertEdit(user);
    const b = await this.book(user, bookId);
    if (!dto.rows.length) throw new BadRequestException('The sheet has no rows to import');
    const rows = dto.rows.map((r) => ({ code: r.code.trim(), chapter: r.chapter?.trim() || null, description: r.description.trim().replace(/\s+/g, ' '), unit: r.unit.trim(), rate: r.rate.replace(/[,₹\s]/g, '') }));
    rows.forEach((r, i) => {
      const problem = sorRowProblem(r);
      if (problem) throw new BadRequestException(`Row ${i + 1}${r.code ? ` (${r.code})` : ''}: ${problem}. Fix it in the sheet and import again.`);
    });
    const seen = new Set<string>();
    for (const r of rows) {
      const k = r.code.toLowerCase();
      if (seen.has(k)) throw new BadRequestException(`Item ${r.code} is in the sheet twice. Keep one row for it.`);
      seen.add(k);
    }
    const existing = new Map((await this.prisma.sorItem.findMany({ where: { bookId }, select: { id: true, code: true, chapter: true, description: true, unit: true, rate: true } })).map((e) => [e.code.toLowerCase(), e]));
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    await this.prisma.$transaction(async (tx) => {
      const fresh: Prisma.SorItemCreateManyInput[] = [];
      for (const r of rows) {
        const rate = new Dec(r.rate).toDecimalPlaces(2);
        const e = existing.get(r.code.toLowerCase());
        if (!e) {
          fresh.push({ organizationId: user.organizationId, bookId, code: r.code, chapter: r.chapter, description: r.description, unit: r.unit, rate });
          added++;
        } else if (e.description !== r.description || e.unit !== r.unit || !e.rate.eq(rate) || (r.chapter !== null && e.chapter !== r.chapter)) {
          await tx.sorItem.update({ where: { id: e.id }, data: { description: r.description, unit: r.unit, rate, ...(r.chapter !== null ? { chapter: r.chapter } : {}) } });
          updated++;
        } else unchanged++;
      }
      if (fresh.length) await tx.sorItem.createMany({ data: fresh });
      await tx.sorBook.update({ where: { id: bookId }, data: { updatedAt: new Date() } });
    });
    await this.audit.log(user, 'SOR_BOOK', bookId, 'IMPORTED', `${b.name}: ${added} added, ${updated} updated`);
    return { added, updated, unchanged };
  }

  async updateItem(user: RequestUser, id: string, dto: UpdateSorItemDto): Promise<SorItemDto> {
    this.assertEdit(user);
    const it = await this.prisma.sorItem.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!it) throw new NotFoundException('SOR item not found');
    const r = await this.prisma.sorItem.update({
      where: { id },
      data: { description: dto.description, unit: dto.unit, chapter: dto.chapter, rate: dto.rate === undefined ? undefined : new Dec(dto.rate) },
      include: { book: { select: { name: true } } },
    });
    await this.audit.log(user, 'SOR_BOOK', it.bookId, 'ITEM_UPDATED', it.code);
    return sorItemDto(r);
  }

  /** An item no bid uses keeps nothing behind; one a bid uses stays on that bid with its rate. */
  async removeItem(user: RequestUser, id: string) {
    this.assertEdit(user);
    const it = await this.prisma.sorItem.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!it) throw new NotFoundException('SOR item not found');
    await this.prisma.sorItem.delete({ where: { id } });
    await this.audit.log(user, 'SOR_BOOK', it.bookId, 'ITEM_DELETED', it.code);
    return { ok: true };
  }
}
