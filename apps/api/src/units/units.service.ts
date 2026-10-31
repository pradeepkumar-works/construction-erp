import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_UNITS, type UnitDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { isUniqueViolation } from '../common/idempotency';
import { CreateUnitDto, UpdateUnitDto } from './units.dto';

/**
 * Unit master. Units stay free text on items, BOQ and order lines; this list is what the forms suggest,
 * so the store writes "Cum" the same way every time. A company starts with DEFAULT_UNITS.
 */
@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private undo: UndoService,
  ) {
    undo.register('UNIT', { entityType: 'UNIT', check: (user) => this.access.assertCanManageStore(user) });
  }

  async list(user: RequestUser): Promise<UnitDto[]> {
    if (!(await this.prisma.unit.count({ where: { organizationId: user.organizationId } }))) {
      await this.prisma.unit.createMany({ data: DEFAULT_UNITS.map((u) => ({ organizationId: user.organizationId, code: u.code, name: u.name })), skipDuplicates: true });
    }
    const [rows, items] = await Promise.all([
      this.prisma.unit.findMany({ where: { organizationId: user.organizationId }, orderBy: { code: 'asc' } }),
      this.prisma.item.groupBy({ by: ['unit'], where: { organizationId: user.organizationId }, _count: { _all: true } }),
    ]);
    const used = new Map(items.map((i) => [i.unit.toLowerCase(), i._count._all]));
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, isActive: r.isActive, itemCount: used.get(r.code.toLowerCase()) ?? 0 }));
  }

  private async one(user: RequestUser, id: string) {
    const row = await this.prisma.unit.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Unit not found');
    return row;
  }

  private async sameCode(user: RequestUser, code: string, notId?: string) {
    const clash = await this.prisma.unit.findFirst({ where: { organizationId: user.organizationId, code: { equals: code, mode: 'insensitive' }, ...(notId ? { id: { not: notId } } : {}) }, select: { code: true } });
    if (clash) throw new ConflictException(`${clash.code} is already in the list`);
  }

  async create(user: RequestUser, dto: CreateUnitDto): Promise<UnitDto> {
    await this.access.assertCanManageStore(user);
    await this.list(user);
    await this.sameCode(user, dto.code);
    try {
      const row = await this.prisma.unit.create({ data: { organizationId: user.organizationId, code: dto.code, name: dto.name } });
      await this.audit.log(user, 'UNIT', row.id, 'CREATED', row.code);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${dto.code} is already in the list`);
      throw e;
    }
    return (await this.list(user)).find((u) => u.code === dto.code)!;
  }

  async update(user: RequestUser, id: string, dto: UpdateUnitDto): Promise<UnitDto> {
    await this.access.assertCanManageStore(user);
    const row = await this.one(user, id);
    if (dto.code !== undefined && dto.code !== row.code) {
      await this.sameCode(user, dto.code, id);
      const inUse = await this.prisma.item.count({ where: { organizationId: user.organizationId, unit: { equals: row.code, mode: 'insensitive' } } });
      if (inUse) throw new BadRequestException(`${inUse} item${inUse === 1 ? '' : 's'} use ${row.code}; add the new unit and switch this one off instead`);
    }
    await this.prisma.unit.update({ where: { id }, data: { code: dto.code, name: dto.name, isActive: dto.isActive } });
    await this.audit.log(user, 'UNIT', id, 'UPDATED');
    return (await this.list(user)).find((u) => u.id === id)!;
  }

  async remove(user: RequestUser, id: string) {
    await this.access.assertCanManageStore(user);
    const row = await this.one(user, id);
    const inUse = await this.prisma.item.count({ where: { organizationId: user.organizationId, unit: { equals: row.code, mode: 'insensitive' } } });
    if (inUse) throw new ConflictException(`${inUse} item${inUse === 1 ? '' : 's'} use ${row.code}; switch it off instead`);
    const raw = await this.prisma.unit.findUniqueOrThrow({ where: { id } });
    await this.prisma.unit.delete({ where: { id } });
    await this.audit.log(user, 'UNIT', id, 'DELETED', row.code);
    return { ok: true, undo: this.undo.offer(user, 'UNIT', { rows: [{ model: 'unit', data: raw }] }) };
  }
}
