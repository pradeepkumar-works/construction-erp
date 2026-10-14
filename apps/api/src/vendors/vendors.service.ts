import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canEditVendors, canSeeVendorBank, gstStateCode, type Paginated, type UnlistedVendorDto, type VendorDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { isUniqueViolation } from '../common/idempotency';
import { iso } from '../common/serialize';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreateVendorDto, ListVendorsQuery, UpdateVendorDto } from './vendors.dto';

const include = { _count: { select: { expenses: true, equipment: true, stockEntries: true } } } satisfies Prisma.VendorInclude;
type Row = Prisma.VendorGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;

const BANK_FIELDS = ['bankAccountName', 'bankAccountNo', 'bankIfsc', 'bankName'] as const;
const PLAIN_FIELDS = ['name', 'kinds', 'gstin', 'pan', 'address', 'contactPerson', 'email', 'phone', 'msmeCategory', 'udyamNo', 'remarks', 'isActive', ...BANK_FIELDS] as const;

/** What an expense, machine or GRN stores for its vendor. */
export interface VendorLink {
  vendorId: string | null;
  name: string | null;
  gstin: string | null;
}

/**
 * Vendor master: suppliers, hire agencies, subcontractors, labour contractors and service providers. Expenses, machines
 * and GRNs link to a vendor and keep a copy of its name; a name typed without picking links to the vendor of that name.
 */
@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private toDto(r: Row, user: RequestUser): VendorDto {
    const bank = canSeeVendorBank(user.roleKey);
    return {
      id: r.id,
      name: r.name,
      kinds: r.kinds,
      gstin: r.gstin,
      pan: r.pan,
      stateCode: r.stateCode,
      address: r.address,
      contactPerson: r.contactPerson,
      email: r.email,
      phone: r.phone,
      bankAccountName: bank ? r.bankAccountName : null,
      bankAccountNo: bank ? r.bankAccountNo : null,
      bankIfsc: bank ? r.bankIfsc : null,
      bankName: bank ? r.bankName : null,
      msmeCategory: r.msmeCategory,
      udyamNo: r.udyamNo,
      remarks: r.remarks,
      isActive: r.isActive,
      expenseCount: r._count.expenses,
      equipmentCount: r._count.equipment,
      grnCount: r._count.stockEntries,
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  private assertCanEdit(user: RequestUser, dto: CreateVendorDto | UpdateVendorDto) {
    if (!canEditVendors(user.roleKey)) throw new ForbiddenException('Your role cannot change the vendor master');
    if (!canSeeVendorBank(user.roleKey) && BANK_FIELDS.some((k) => dto[k] !== undefined)) throw new ForbiddenException('Only admin, management, procurement and accounts change bank details');
  }

  /** Anyone signed in can read the master (pickers); bank details only for those who pay vendors. */
  async list(user: RequestUser, q: ListVendorsQuery): Promise<Paginated<VendorDto>> {
    const where: Prisma.VendorWhereInput = { organizationId: user.organizationId };
    if (!q.includeInactive) where.isActive = true;
    if (q.kind) where.kinds = { has: q.kind };
    if (q.msme) where.msmeCategory = q.msme;
    const words = searchWords(q.q);
    if (words.length) where.AND = words.map((w) => ({ OR: [{ name: ilike(w) }, { gstin: ilike(w) }, { pan: ilike(w) }, { contactPerson: ilike(w) }, { phone: ilike(w) }] }));
    const order = q.sortOrder ?? (q.sortBy === 'createdAt' ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.vendor.findMany({ where, include, orderBy: [{ [q.sortBy ?? 'name']: order }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.vendor.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r, user)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<VendorDto> {
    const row = await this.prisma.vendor.findFirst({ where: { id, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Vendor not found');
    return this.toDto(row, user);
  }

  /** The state code follows the GSTIN; without a GSTIN it is whatever was set by hand. */
  private stateCode(gstin: string | null | undefined, stateCode: string | null | undefined) {
    return gstStateCode(gstin) ?? stateCode;
  }

  /** Expenses, machines, GRNs and attendance rows that typed this vendor's name without linking it now link to it. */
  private async adopt(tx: Tx, organizationId: string, vendorId: string, name: string) {
    const match = { equals: name, mode: 'insensitive' as const };
    await tx.expense.updateMany({ where: { organizationId, vendorId: null, vendor: match }, data: { vendorId, vendor: name } });
    await tx.equipment.updateMany({ where: { organizationId, vendorId: null, supplier: match }, data: { vendorId, supplier: name } });
    await tx.stockEntry.updateMany({ where: { organizationId, vendorId: null, supplier: match }, data: { vendorId, supplier: name } });
    await tx.attendanceLine.updateMany({ where: { sheet: { organizationId }, vendorId: null, contractor: match }, data: { vendorId, contractor: name } });
  }

  async create(user: RequestUser, dto: CreateVendorDto): Promise<VendorDto> {
    this.assertCanEdit(user, dto);
    const dup = await this.prisma.vendor.findFirst({ where: { organizationId: user.organizationId, name: { equals: dto.name, mode: 'insensitive' } }, select: { name: true } });
    if (dup) throw new ConflictException(`${dup.name} is already in the vendor master`);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const row = await tx.vendor.create({
          data: {
            organizationId: user.organizationId,
            name: dto.name,
            kinds: dto.kinds ?? [],
            gstin: dto.gstin ?? null,
            pan: dto.pan ?? (dto.gstin ? dto.gstin.slice(2, 12) : null),
            stateCode: this.stateCode(dto.gstin, dto.stateCode) ?? null,
            address: dto.address ?? null,
            contactPerson: dto.contactPerson ?? null,
            email: dto.email ?? null,
            phone: dto.phone ?? null,
            bankAccountName: dto.bankAccountName ?? null,
            bankAccountNo: dto.bankAccountNo ?? null,
            bankIfsc: dto.bankIfsc ?? null,
            bankName: dto.bankName ?? null,
            msmeCategory: dto.msmeCategory ?? null,
            udyamNo: dto.udyamNo ?? null,
            remarks: dto.remarks ?? null,
          },
          select: { id: true },
        });
        await this.adopt(tx, user.organizationId, row.id, dto.name);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${dto.name} is already in the vendor master`);
      throw e;
    }
    await this.audit.log(user, 'VENDOR', id, 'CREATED');
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateVendorDto): Promise<VendorDto> {
    this.assertCanEdit(user, dto);
    const current = await this.prisma.vendor.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!current) throw new NotFoundException('Vendor not found');
    const renamed = dto.name !== undefined && dto.name !== current.name;
    if (renamed) {
      const dup = await this.prisma.vendor.findFirst({ where: { organizationId: user.organizationId, id: { not: id }, name: { equals: dto.name, mode: 'insensitive' } }, select: { name: true } });
      if (dup) throw new ConflictException(`${dup.name} is already in the vendor master`);
    }
    const data: Prisma.VendorUpdateInput = {};
    for (const k of PLAIN_FIELDS) if (dto[k] !== undefined) (data as Record<string, unknown>)[k] = dto[k];
    const gstin = dto.gstin !== undefined ? dto.gstin : current.gstin;
    if (dto.gstin !== undefined || dto.stateCode !== undefined) data.stateCode = this.stateCode(gstin, dto.stateCode !== undefined ? dto.stateCode : current.stateCode) ?? null;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.vendor.update({ where: { id }, data });
        if (renamed) {
          // Linked entries keep a copy of the vendor's name for lists, search and prints.
          await tx.expense.updateMany({ where: { vendorId: id }, data: { vendor: dto.name } });
          await tx.equipment.updateMany({ where: { vendorId: id }, data: { supplier: dto.name } });
          await tx.stockEntry.updateMany({ where: { vendorId: id }, data: { supplier: dto.name } });
          await tx.attendanceLine.updateMany({ where: { vendorId: id }, data: { contractor: dto.name } });
          await this.adopt(tx, user.organizationId, id, dto.name!);
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${dto.name} is already in the vendor master`);
      throw e;
    }
    await this.audit.log(user, 'VENDOR', id, 'UPDATED');
    return this.get(user, id);
  }

  /** A vendor in use is made inactive instead. */
  async remove(user: RequestUser, id: string) {
    this.assertCanEdit(user, {});
    const row = await this.prisma.vendor.findFirst({ where: { id, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Vendor not found');
    const used = row._count.expenses + row._count.equipment + row._count.stockEntries;
    if (used > 0) throw new ConflictException(`${row.name} is on ${used} expense(s), machine(s) or GRN(s); mark the vendor inactive instead`);
    await this.prisma.vendor.delete({ where: { id } });
    await this.audit.log(user, 'VENDOR', id, 'DELETED');
    return { ok: true };
  }

  /** Vendor names typed on expenses, machines and GRNs that are not in the master, most used first. */
  async unlisted(user: RequestUser): Promise<UnlistedVendorDto[]> {
    const organizationId = user.organizationId;
    const [expenses, equipment, grns] = await Promise.all([
      this.prisma.expense.groupBy({ by: ['vendor', 'vendorGstin'], where: { organizationId, vendorId: null, vendor: { not: null } }, _count: { _all: true } }),
      this.prisma.equipment.groupBy({ by: ['supplier'], where: { organizationId, vendorId: null, supplier: { not: null } }, _count: { _all: true } }),
      this.prisma.stockEntry.groupBy({ by: ['supplier'], where: { organizationId, vendorId: null, supplier: { not: null }, type: 'RECEIPT' }, _count: { _all: true } }),
    ]);
    const out = new Map<string, UnlistedVendorDto>();
    const at = (name: string) => {
      const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
      let row = out.get(key);
      if (!row) out.set(key, (row = { name: name.trim().replace(/\s+/g, ' '), expenseCount: 0, equipmentCount: 0, grnCount: 0, gstin: null }));
      return row;
    };
    for (const e of expenses) {
      if (!e.vendor?.trim()) continue;
      const row = at(e.vendor);
      row.expenseCount += e._count._all;
      row.gstin ??= e.vendorGstin;
    }
    for (const e of equipment) if (e.supplier?.trim()) at(e.supplier).equipmentCount += e._count._all;
    for (const g of grns) if (g.supplier?.trim()) at(g.supplier).grnCount += g._count._all;
    // A name that differs from a listed vendor only in case is linked on the vendor's next save, not offered again.
    const listed = new Set((await this.prisma.vendor.findMany({ where: { organizationId }, select: { name: true } })).map((v) => v.name.toLowerCase()));
    return [...out.entries()]
      .filter(([k]) => !listed.has(k))
      .map(([, v]) => v)
      .sort((a, b) => b.expenseCount + b.equipmentCount + b.grnCount - (a.expenseCount + a.equipmentCount + a.grnCount) || a.name.localeCompare(b.name));
  }

  /**
   * The vendor an expense, machine or GRN names. `vendorId` links to the master (and sets the name and, for expenses,
   * the GSTIN when none is given); null unlinks and keeps the typed name; left out, a typed name that matches an active
   * vendor links to it. Returns undefined when neither is being changed.
   */
  async resolve(user: RequestUser, vendorId: string | null | undefined, name: string | null | undefined): Promise<VendorLink | undefined> {
    if (vendorId === undefined && name === undefined) return undefined;
    const typed = name?.trim().replace(/\s+/g, ' ') || null;
    if (vendorId) {
      const v = await this.prisma.vendor.findFirst({ where: { id: vendorId, organizationId: user.organizationId }, select: { id: true, name: true, gstin: true } });
      if (!v) throw new BadRequestException('Vendor not found in the vendor master');
      return { vendorId: v.id, name: v.name, gstin: v.gstin };
    }
    if (vendorId === null || !typed) return { vendorId: null, name: typed, gstin: null };
    const v = await this.prisma.vendor.findFirst({ where: { organizationId: user.organizationId, isActive: true, name: { equals: typed, mode: 'insensitive' } }, select: { id: true, name: true, gstin: true } });
    return v ? { vendorId: v.id, name: v.name, gstin: v.gstin } : { vendorId: null, name: typed, gstin: null };
  }
}
