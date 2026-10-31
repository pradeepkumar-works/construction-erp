import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MASTER_LISTS,
  MASTER_LIST_DEFS,
  canManageMaster,
  canViewMasters,
  masterListBySlug,
  masterProblem,
  mergeMaster,
  newMasterCode,
  type MasterCountsDto,
  type MasterEntryDto,
  type MasterList,
  type MasterListDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { isUniqueViolation } from '../common/idempotency';
import { CreateMasterEntryDto, UpdateMasterEntryDto } from './masters.dto';

/**
 * Masters (item 135, ARCHITECTURE "Masters"): the company's simple lists. Standard entries come from `MASTER_LIST_DEFS`;
 * a company's `MasterEntry` rows lay over them by code (a rename, Hindi name or switch-off) or add its own, so nothing is
 * seeded. Records keep the words, so an entry in use is never renamed and only the company's own unused ones are deleted.
 */
@Injectable()
export class MastersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** The list for a `/masters/<slug>` page or a form's picker. */
  listOf(slugOrKey: string): MasterList {
    const def = masterListBySlug(slugOrKey) ?? ((MASTER_LISTS as readonly string[]).includes(slugOrKey) ? MASTER_LIST_DEFS[slugOrKey as MasterList] : undefined);
    if (!def) throw new NotFoundException('No such master list');
    return def.key;
  }

  private assertView(user: RequestUser) {
    if (!canViewMasters(user.roleKey)) throw new ForbiddenException('Masters are for the company’s staff');
  }

  private assertManage(user: RequestUser, list: MasterList) {
    if (!canManageMaster(user.roleKey, list)) throw new ForbiddenException(`You can see the ${MASTER_LIST_DEFS[list].label.toLowerCase()}; ask an administrator to change them`);
  }

  private rows(user: RequestUser, list: MasterList) {
    return this.prisma.masterEntry.findMany({ where: { organizationId: user.organizationId, list }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  /** How many records carry each name (lower case), for "In use". */
  private async usage(user: RequestUser, list: MasterList): Promise<Map<string, number>> {
    const org = user.organizationId;
    const out = new Map<string, number>();
    const add = (name: string | null, n: number) => {
      const k = (name ?? '').trim().toLowerCase();
      if (k) out.set(k, (out.get(k) ?? 0) + n);
    };
    switch (list) {
      case 'trade': {
        const [lines, workers, rates] = await Promise.all([
          this.prisma.attendanceLine.groupBy({ by: ['category'], where: { sheet: { organizationId: org } }, _count: { _all: true } }),
          this.prisma.worker.groupBy({ by: ['trade'], where: { organizationId: org }, _count: { _all: true } }),
          this.prisma.labourRate.groupBy({ by: ['category'], where: { organizationId: org }, _count: { _all: true } }),
        ]);
        lines.forEach((r) => add(r.category, r._count._all));
        workers.forEach((r) => add(r.trade, r._count._all));
        rates.forEach((r) => add(r.category, r._count._all));
        break;
      }
      case 'designation':
        (await this.prisma.employee.groupBy({ by: ['designation'], where: { organizationId: org }, _count: { _all: true } })).forEach((r) => add(r.designation, r._count._all));
        break;
      case 'department':
        (await this.prisma.employee.groupBy({ by: ['department'], where: { organizationId: org }, _count: { _all: true } })).forEach((r) => add(r.department, r._count._all));
        break;
      case 'itemCategory':
        (await this.prisma.item.groupBy({ by: ['category'], where: { organizationId: org }, _count: { _all: true } })).forEach((r) => add(r.category, r._count._all));
        break;
      case 'equipmentCategory':
        (await this.prisma.equipment.groupBy({ by: ['category'], where: { organizationId: org }, _count: { _all: true } })).forEach((r) => add(r.category, r._count._all));
        break;
      case 'letterCategory': {
        // Letters keep the category's code (so a renamed category stays on its letters); count them under its name.
        const names = new Map((await this.entriesFor(org, list)).map((e) => [e.code, e.name]));
        (await this.prisma.letter.groupBy({ by: ['category'], where: { organizationId: org, category: { not: null } }, _count: { _all: true } })).forEach((r) => add(names.get(r.category!) ?? null, r._count._all));
        break;
      }
      case 'ncrCategory':
      case 'ncrRootCause': {
        // NCRs keep the code, like letters.
        const names = new Map((await this.entriesFor(org, list)).map((e) => [e.code, e.name]));
        const by = list === 'ncrCategory' ? 'category' : 'rootCause';
        (await this.prisma.ncr.groupBy({ by: [by], where: { organizationId: org, [by]: { not: null } }, _count: { _all: true } })).forEach((r) => add(names.get(r[by]!) ?? null, r._count._all));
        break;
      }
      case 'instrumentKind': {
        const names = new Map((await this.entriesFor(org, list)).map((e) => [e.code, e.name]));
        (await this.prisma.qaInstrument.groupBy({ by: ['kind'], where: { organizationId: org }, _count: { _all: true } })).forEach((r) => add(names.get(r.kind) ?? null, r._count._all));
        break;
      }
      case 'vertical': {
        // Projects and tenders keep the vertical's code.
        const names = new Map((await this.entriesFor(org, list)).map((e) => [e.code, e.name]));
        const [projects, tenders] = await Promise.all([
          this.prisma.project.groupBy({ by: ['verticalCode'], where: { organizationId: org, verticalCode: { not: null } }, _count: { _all: true } }),
          this.prisma.tender.groupBy({ by: ['verticalCode'], where: { organizationId: org, verticalCode: { not: null } }, _count: { _all: true } }),
        ]);
        [...projects, ...tenders].forEach((r) => add(names.get(r.verticalCode!) ?? null, r._count._all));
        break;
      }
      case 'workTrade':
        (await this.prisma.defect.groupBy({ by: ['trade'], where: { organizationId: org, trade: { not: null } }, _count: { _all: true } })).forEach((r) => add(r.trade, r._count._all));
        break;
    }
    return out;
  }

  private async entries(user: RequestUser, list: MasterList, withUsage: boolean): Promise<MasterEntryDto[]> {
    const [rows, used] = await Promise.all([this.rows(user, list), withUsage ? this.usage(user, list) : null]);
    return mergeMaster(list, rows).map((e) => ({ ...e, inUse: used ? (used.get(e.name.trim().toLowerCase()) ?? 0) : null }));
  }

  /** One list with its entries; `usage` counts the records that carry each name (the master's own page). */
  async list(user: RequestUser, slug: string, usage = false): Promise<MasterListDto> {
    this.assertView(user);
    const list = this.listOf(slug);
    const def = MASTER_LIST_DEFS[list];
    return {
      key: list,
      label: def.label,
      singular: def.singular,
      description: def.description,
      usedOn: def.usedOn,
      canManage: canManageMaster(user.roleKey, list),
      entries: await this.entries(user, list, usage),
    };
  }

  /** Each list's entries switched on and in all, for Administration › Masters. */
  async counts(user: RequestUser): Promise<MasterCountsDto> {
    this.assertView(user);
    const rows = await this.prisma.masterEntry.findMany({ where: { organizationId: user.organizationId }, select: { list: true, code: true, name: true, nameHi: true, isActive: true, sortOrder: true } });
    return {
      lists: MASTER_LISTS.map((key) => {
        const merged = mergeMaster(
          key,
          rows.filter((r) => r.list === key),
        );
        return { key, active: merged.filter((e) => e.isActive).length, total: merged.length };
      }),
    };
  }

  async create(user: RequestUser, slug: string, dto: CreateMasterEntryDto): Promise<MasterEntryDto> {
    const list = this.listOf(slug);
    this.assertManage(user, list);
    const current = await this.entries(user, list, false);
    const problem = masterProblem(dto, current, null);
    if (problem) throw new BadRequestException(problem);
    const code = newMasterCode(dto.name, current.map((e) => e.code));
    const last = await this.prisma.masterEntry.aggregate({ where: { organizationId: user.organizationId, list }, _max: { sortOrder: true } });
    try {
      const row = await this.prisma.masterEntry.create({
        data: { organizationId: user.organizationId, list, code, name: dto.name, nameHi: dto.nameHi || null, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      });
      await this.audit.log(user, 'MASTER', row.id, 'CREATED', `${MASTER_LIST_DEFS[list].label}: ${row.name}`);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${dto.name} is already in the list`);
      throw e;
    }
    return (await this.entries(user, list, true)).find((e) => e.code === code)!;
  }

  async update(user: RequestUser, slug: string, code: string, dto: UpdateMasterEntryDto): Promise<MasterEntryDto> {
    const list = this.listOf(slug);
    this.assertManage(user, list);
    const current = await this.entries(user, list, true);
    const entry = current.find((e) => e.code === code);
    if (!entry) throw new NotFoundException('Entry not found');
    const name = dto.name ?? entry.name;
    const problem = masterProblem({ name, nameHi: dto.nameHi }, current, { code, name: entry.name, inUse: entry.inUse ?? 0 });
    if (problem) throw new BadRequestException(problem);
    const data = {
      name,
      nameHi: dto.nameHi === undefined ? entry.nameHi : dto.nameHi || null,
      isActive: dto.isActive ?? entry.isActive,
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
    const row = await this.prisma.masterEntry.upsert({
      where: { organizationId_list_code: { organizationId: user.organizationId, list, code } },
      create: { organizationId: user.organizationId, list, code, ...data },
      update: data,
    });
    const what = dto.isActive === false ? 'SWITCHED_OFF' : dto.isActive === true && !entry.isActive ? 'SWITCHED_ON' : 'UPDATED';
    await this.audit.log(user, 'MASTER', row.id, what, `${MASTER_LIST_DEFS[list].label}: ${entry.name}${name !== entry.name ? ` → ${name}` : ''}`);
    return (await this.entries(user, list, true)).find((e) => e.code === code)!;
  }

  /** Deletes one of the company's own entries that no record uses; a standard one is switched off instead. */
  async remove(user: RequestUser, slug: string, code: string) {
    const list = this.listOf(slug);
    this.assertManage(user, list);
    const entry = (await this.entries(user, list, true)).find((e) => e.code === code);
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.standard) throw new BadRequestException(`${entry.name} is a standard entry; switch it off instead`);
    if (entry.inUse) throw new ConflictException(`${entry.inUse} record${entry.inUse === 1 ? '' : 's'} use ${entry.name}; switch it off instead`);
    const row = await this.prisma.masterEntry.delete({ where: { organizationId_list_code: { organizationId: user.organizationId, list, code } } });
    await this.audit.log(user, 'MASTER', row.id, 'DELETED', `${MASTER_LIST_DEFS[list].label}: ${row.name}`);
    return { ok: true };
  }

  /** The list as the company has it, for services that fill pickers (the switched-off entries say what to leave out). */
  async entriesFor(organizationId: string, list: MasterList) {
    return mergeMaster(list, await this.prisma.masterEntry.findMany({ where: { organizationId, list } }));
  }
}
