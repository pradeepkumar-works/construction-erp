import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CustomFieldDef, Prisma } from '@prisma/client';
import {
  CUSTOM_FIELD_ENTITY_INFO,
  canManageCustomFields,
  customFieldProblem,
  fieldKey,
  normaliseCustomField,
  readCustomValues,
  type CustomFieldDto,
  type CustomFieldEntity,
  type FieldKind,
  type FieldValues,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { isUniqueViolation } from '../common/idempotency';
import { iso } from '../common/serialize';
import { CreateCustomFieldDto, OrderCustomFieldsDto, UpdateCustomFieldDto } from './custom-fields.dto';

/** What a record holds under `customValues`, as the API gives it back (it was read by `read` when saved). */
export const storedValues = (v: Prisma.JsonValue | null | undefined): FieldValues => (v && typeof v === 'object' && !Array.isArray(v) ? (v as FieldValues) : {});

const ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }] satisfies Prisma.CustomFieldDefOrderByWithRelationInput[];

/**
 * The company's own fields on its vendors, projects and purchase orders (ARCHITECTURE "Custom fields"). Admins add,
 * change, order, archive and restore them; a key and a kind never change, and nothing is deleted. Each entity's own
 * service reads its values through `read` inside its create and update, the one place they are checked.
 */
@Injectable()
export class CustomFieldsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private toDto(r: CustomFieldDef): CustomFieldDto {
    return {
      id: r.id,
      entity: r.entity as CustomFieldEntity,
      key: r.key,
      label: r.label,
      labelHi: r.labelHi,
      kind: r.kind as FieldKind,
      required: r.required,
      unit: r.unit,
      min: r.min === null ? null : r.min.toNumber(),
      max: r.max === null ? null : r.max.toNumber(),
      options: r.options,
      sortOrder: r.sortOrder,
      archived: !!r.archivedAt,
      archivedAt: iso(r.archivedAt),
    };
  }

  private assertCanManage(user: RequestUser) {
    if (!canManageCustomFields(user.roleKey)) throw new ForbiddenException("Only an admin changes the company's own fields");
  }

  /** An entity's fields, archived ones included (records still show their values), in the company's order. */
  async list(user: RequestUser, entity: CustomFieldEntity): Promise<CustomFieldDto[]> {
    return this.defs(user.organizationId, entity);
  }

  private async defs(organizationId: string, entity: CustomFieldEntity): Promise<CustomFieldDto[]> {
    const rows = await this.prisma.customFieldDef.findMany({ where: { organizationId, entity }, orderBy: ORDER });
    return rows.map((r) => this.toDto(r));
  }

  private async own(user: RequestUser, id: string) {
    const row = await this.prisma.customFieldDef.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Field not found');
    return row;
  }

  async create(user: RequestUser, dto: CreateCustomFieldDto): Promise<CustomFieldDto> {
    this.assertCanManage(user);
    const field = normaliseCustomField(dto);
    const others = await this.defs(user.organizationId, dto.entity);
    const problem = customFieldProblem(field, others, { adding: true });
    if (problem) throw new BadRequestException(problem);
    const key = fieldKey(field.label, others.map((o) => o.key));
    let row: CustomFieldDef;
    try {
      row = await this.prisma.customFieldDef.create({
        data: { organizationId: user.organizationId, entity: dto.entity, key, ...field, sortOrder: Math.max(-1, ...others.map((o) => o.sortOrder)) + 1 },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Another field was just added as ${field.label}; open the list again`);
      throw e;
    }
    await this.audit.log(user, 'CUSTOM_FIELD', row.id, 'CREATED', `${CUSTOM_FIELD_ENTITY_INFO[dto.entity].label}: ${row.label}`);
    return this.toDto(row);
  }

  async update(user: RequestUser, id: string, dto: UpdateCustomFieldDto): Promise<CustomFieldDto> {
    this.assertCanManage(user);
    const current = this.toDto(await this.own(user, id));
    const field = normaliseCustomField({
      label: dto.label ?? current.label,
      labelHi: dto.labelHi !== undefined ? dto.labelHi : current.labelHi,
      kind: current.kind,
      required: dto.required ?? current.required,
      unit: dto.unit !== undefined ? dto.unit : current.unit,
      min: dto.min !== undefined ? dto.min : current.min,
      max: dto.max !== undefined ? dto.max : current.max,
      options: dto.options ?? current.options,
    });
    const others = (await this.defs(user.organizationId, current.entity)).filter((o) => o.id !== id);
    const problem = customFieldProblem(field, others);
    if (problem) throw new BadRequestException(problem);
    const row = await this.prisma.customFieldDef.update({ where: { id }, data: field });
    await this.audit.log(user, 'CUSTOM_FIELD', id, 'UPDATED', `${CUSTOM_FIELD_ENTITY_INFO[current.entity].label}: ${current.label}${row.label !== current.label ? ` → ${row.label}` : ''}`);
    return this.toDto(row);
  }

  /** Archived: no form asks for it and no new value is taken; the records that hold one keep and show it. */
  async setArchived(user: RequestUser, id: string, archived: boolean): Promise<CustomFieldDto> {
    this.assertCanManage(user);
    const current = await this.own(user, id);
    if (!!current.archivedAt === archived) return this.toDto(current);
    if (!archived) {
      const others = (await this.defs(user.organizationId, current.entity as CustomFieldEntity)).filter((o) => o.id !== id);
      const problem = customFieldProblem(this.toDto(current), others, { adding: true });
      if (problem) throw new BadRequestException(problem);
    }
    const row = await this.prisma.customFieldDef.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await this.audit.log(user, 'CUSTOM_FIELD', id, archived ? 'ARCHIVED' : 'RESTORED', `${CUSTOM_FIELD_ENTITY_INFO[current.entity as CustomFieldEntity].label}: ${row.label}`);
    return this.toDto(row);
  }

  async reorder(user: RequestUser, dto: OrderCustomFieldsDto): Promise<CustomFieldDto[]> {
    this.assertCanManage(user);
    const defs = await this.defs(user.organizationId, dto.entity);
    const known = new Set(defs.map((d) => d.id));
    const ids = [...new Set(dto.ids)].filter((id) => known.has(id));
    const rest = defs.filter((d) => !ids.includes(d.id)).map((d) => d.id);
    await this.prisma.$transaction([...ids, ...rest].map((id, i) => this.prisma.customFieldDef.update({ where: { id }, data: { sortOrder: i } })));
    await this.audit.log(user, 'CUSTOM_FIELD', dto.entity, 'REORDERED', CUSTOM_FIELD_ENTITY_INFO[dto.entity].label);
    return this.defs(user.organizationId, dto.entity);
  }

  /**
   * A record's values as sent, read against the entity's fields over what it holds (`readCustomValues`), refused with
   * every problem in words. `required` asks for the required fields (on save; an order's are asked for at submit).
   */
  async read(user: RequestUser, entity: CustomFieldEntity, raw: unknown, before: Prisma.JsonValue | undefined, opts: { required?: boolean } = {}): Promise<FieldValues> {
    const defs = await this.defs(user.organizationId, entity);
    const { values, problems } = readCustomValues(defs, raw, { before, required: opts.required });
    if (problems.length) throw new BadRequestException(problems.join('. '));
    return values;
  }

  /** A purchase order sent for approval: its required fields filled, else refused naming them. */
  async assertComplete(user: RequestUser, entity: CustomFieldEntity, values: Prisma.JsonValue): Promise<void> {
    const defs = await this.defs(user.organizationId, entity);
    const { problems } = readCustomValues(defs, {}, { before: values, required: true });
    if (problems.length) throw new BadRequestException(`${problems.join('. ')} before sending the ${CUSTOM_FIELD_ENTITY_INFO[entity].record} for approval`);
  }
}
