import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canEditContract, CLIENT_TERM_PERCENTS, gstStateCode, type ClientDto, type Paginated } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { isUniqueViolation } from '../common/idempotency';
import { iso } from '../common/serialize';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreateClientDto, ListClientsQuery, UpdateClientDto } from './clients.dto';

const include = { _count: { select: { projects: true } } } satisfies Prisma.ClientInclude;
type Row = Prisma.ClientGetPayload<{ include: typeof include }>;
const pct = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());

/** Client master: the departments and owners the organisation builds for. Projects link to a client for billing. */
@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private undo: UndoService,
  ) {
    undo.register('CLIENT', { entityType: 'CLIENT', check: (user) => this.assertCanEdit(user) });
  }

  static toDto(r: Prisma.ClientGetPayload<object> & { _count?: { projects: number } }): ClientDto {
    return {
      id: r.id,
      name: r.name,
      department: r.department,
      gstin: r.gstin,
      pan: r.pan,
      billingAddress: r.billingAddress,
      stateCode: r.stateCode,
      contactPerson: r.contactPerson,
      email: r.email,
      phone: r.phone,
      isActive: r.isActive,
      retentionPct: pct(r.retentionPct),
      securityDepositPct: pct(r.securityDepositPct),
      tdsPct: pct(r.tdsPct),
      gstTdsPct: pct(r.gstTdsPct),
      labourCessPct: pct(r.labourCessPct),
      gstRate: pct(r.gstRate),
      defectLiabilityMonths: r.defectLiabilityMonths,
      clientPaymentDays: r.clientPaymentDays,
      projectCount: r._count?.projects ?? 0,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  /** The usual terms sent, each 0 to 100 (GST to 28); what is not sent stays. */
  private terms(dto: Partial<CreateClientDto>) {
    const out: Record<string, string | number | null> = {};
    for (const k of CLIENT_TERM_PERCENTS) {
      const v = dto[k];
      if (v === undefined) continue;
      if (v !== null && (Number(v) < 0 || Number(v) > (k === 'gstRate' ? 28 : 100))) throw new BadRequestException(`${k} must be between 0 and ${k === 'gstRate' ? 28 : 100}`);
      out[k] = v;
    }
    if (dto.defectLiabilityMonths !== undefined) out.defectLiabilityMonths = dto.defectLiabilityMonths;
    if (dto.clientPaymentDays !== undefined) out.clientPaymentDays = dto.clientPaymentDays;
    return out;
  }

  private assertCanEdit(user: RequestUser) {
    if (!canEditContract(user.roleKey)) throw new ForbiddenException('Your role cannot change the client master');
  }

  async list(user: RequestUser, q: ListClientsQuery): Promise<Paginated<ClientDto>> {
    const where: Prisma.ClientWhereInput = { organizationId: user.organizationId };
    if (!q.includeInactive) where.isActive = true;
    const words = searchWords(q.q);
    if (words.length) where.AND = words.map((w) => ({ OR: [{ name: ilike(w) }, { department: ilike(w) }, { gstin: ilike(w) }, { contactPerson: ilike(w) }] }));
    const order = q.sortOrder ?? (q.sortBy === 'createdAt' ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({ where, include, orderBy: [{ [q.sortBy ?? 'name']: order }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.client.count({ where }),
    ]);
    return paginated(rows.map((r: Row) => ClientsService.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<ClientDto> {
    const row = await this.prisma.client.findFirst({ where: { id, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Client not found');
    return ClientsService.toDto(row);
  }

  /** The state code follows the GSTIN; without a GSTIN it is whatever was set by hand. */
  private stateCode(gstin: string | null | undefined, stateCode: string | null | undefined): string | null | undefined {
    const fromGstin = gstStateCode(gstin);
    if (fromGstin) return fromGstin;
    return stateCode;
  }

  async create(user: RequestUser, dto: CreateClientDto): Promise<ClientDto> {
    this.assertCanEdit(user);
    try {
      const row = await this.prisma.client.create({
        data: {
          organizationId: user.organizationId,
          name: dto.name,
          department: dto.department ?? null,
          gstin: dto.gstin ?? null,
          pan: dto.pan ?? (dto.gstin ? dto.gstin.slice(2, 12) : null),
          billingAddress: dto.billingAddress ?? null,
          stateCode: this.stateCode(dto.gstin, dto.stateCode) ?? null,
          contactPerson: dto.contactPerson ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          ...this.terms(dto),
        },
      });
      await this.audit.log(user, 'CLIENT', row.id, 'CREATED');
      return this.get(user, row.id);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`A client named ${dto.name} already exists`);
      throw e;
    }
  }

  async update(user: RequestUser, id: string, dto: UpdateClientDto): Promise<ClientDto> {
    this.assertCanEdit(user);
    const current = await this.prisma.client.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!current) throw new NotFoundException('Client not found');
    const data: Prisma.ClientUpdateInput = {};
    for (const k of ['name', 'department', 'gstin', 'pan', 'billingAddress', 'contactPerson', 'email', 'phone', 'isActive'] as const) if (dto[k] !== undefined) (data as Record<string, unknown>)[k] = dto[k];
    Object.assign(data, this.terms(dto));
    const gstin = dto.gstin !== undefined ? dto.gstin : current.gstin;
    if (dto.gstin !== undefined || dto.stateCode !== undefined) data.stateCode = this.stateCode(gstin, dto.stateCode !== undefined ? dto.stateCode : current.stateCode) ?? null;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data });
        // Projects keep a copy of the client's name for lists, search and reports.
        if (dto.name !== undefined && dto.name !== current.name) await tx.project.updateMany({ where: { clientId: id }, data: { clientName: dto.name } });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`A client named ${dto.name} already exists`);
      throw e;
    }
    await this.audit.log(user, 'CLIENT', id, 'UPDATED');
    return this.get(user, id);
  }

  /** A client with projects is made inactive instead. */
  async remove(user: RequestUser, id: string) {
    this.assertCanEdit(user);
    const row = await this.prisma.client.findFirst({ where: { id, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Client not found');
    if (row._count.projects > 0) throw new ConflictException(`${row.name} has ${row._count.projects} project(s); mark the client inactive instead`);
    await this.prisma.client.delete({ where: { id } });
    await this.audit.log(user, 'CLIENT', id, 'DELETED');
    return { ok: true, undo: this.undo.offer(user, 'CLIENT', { rows: [{ model: 'client', data: row }] }) };
  }
}
