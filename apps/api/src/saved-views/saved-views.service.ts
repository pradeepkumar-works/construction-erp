import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SAVED_VIEW_MAX_PER_USER, SAVED_VIEW_MAX_STATE, canManageSharedViews, type SavedViewDto, type SavedViewList, type SavedViewState } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { UndoService } from '../common/undo.service';
import { iso } from '../common/serialize';
import { CreateSavedViewDto, UpdateSavedViewDto } from './saved-views.dto';

const include = { user: { select: { fullName: true } } } satisfies Prisma.SavedViewInclude;
type Row = Prisma.SavedViewGetPayload<{ include: typeof include }>;

/** Only plain string filters and a list of column keys are kept, so a view cannot carry anything else. */
function cleanState(raw: unknown): SavedViewState {
  const s = (raw ?? {}) as { filters?: unknown; columns?: unknown };
  const filters: Record<string, string> = {};
  if (s.filters && typeof s.filters === 'object' && !Array.isArray(s.filters)) {
    for (const [k, v] of Object.entries(s.filters as Record<string, unknown>)) {
      if (/^[a-zA-Z]{1,40}$/.test(k) && typeof v === 'string' && v.length <= 200) filters[k] = v;
    }
  }
  const columns = Array.isArray(s.columns) ? s.columns.filter((c): c is string => typeof c === 'string' && /^[\w-]{1,40}$/.test(c)).slice(0, 40) : undefined;
  const state: SavedViewState = columns ? { filters, columns } : { filters };
  if (JSON.stringify(state).length > SAVED_VIEW_MAX_STATE) throw new BadRequestException('This view holds too much; remove some filters or columns');
  return state;
}

/** Saved views on the busiest lists: personal, or shared with everyone in the company. */
@Injectable()
export class SavedViewsService {
  constructor(
    private prisma: PrismaService,
    private undo: UndoService,
  ) {
    undo.register('SAVED_VIEW', {
      entityType: 'SAVED_VIEW',
      check: (user, row) => {
        if (row.userId !== user.id && !(row.shared && canManageSharedViews(user.roleKey))) throw new ForbiddenException('Only the person who saved this view can change it');
      },
    });
  }

  private toDto(user: RequestUser, r: Row): SavedViewDto {
    return {
      id: r.id,
      list: r.list as SavedViewList,
      name: r.name,
      shared: r.shared,
      state: cleanState(r.state),
      ownerId: r.userId,
      ownerName: r.user.fullName,
      mine: r.userId === user.id,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  /** The caller's own views on a list, then those others shared, each by name. */
  async list(user: RequestUser, list: SavedViewList): Promise<SavedViewDto[]> {
    const rows = await this.prisma.savedView.findMany({
      where: { organizationId: user.organizationId, list, OR: [{ userId: user.id }, { shared: true }] },
      include,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const dtos = rows.map((r) => this.toDto(user, r));
    return [...dtos.filter((d) => d.mine), ...dtos.filter((d) => !d.mine)];
  }

  async create(user: RequestUser, dto: CreateSavedViewDto): Promise<SavedViewDto> {
    const count = await this.prisma.savedView.count({ where: { organizationId: user.organizationId, userId: user.id } });
    if (count >= SAVED_VIEW_MAX_PER_USER) throw new BadRequestException(`You already have ${SAVED_VIEW_MAX_PER_USER} saved views; delete one first`);
    const row = await this.prisma.savedView.create({
      data: { organizationId: user.organizationId, userId: user.id, list: dto.list, name: dto.name.trim(), shared: !!dto.shared, state: cleanState(dto.state) as unknown as Prisma.InputJsonValue },
      include,
    });
    return this.toDto(user, row);
  }

  /** Owners change their views; an admin can also tidy up shared ones. */
  private async editable(user: RequestUser, id: string) {
    const row = await this.prisma.savedView.findFirst({ where: { id, organizationId: user.organizationId, OR: [{ userId: user.id }, { shared: true }] } });
    if (!row) throw new NotFoundException('View not found');
    if (row.userId !== user.id && !canManageSharedViews(user.roleKey)) throw new ForbiddenException('Only the person who saved this view can change it');
    return row;
  }

  async update(user: RequestUser, id: string, dto: UpdateSavedViewDto): Promise<SavedViewDto> {
    await this.editable(user, id);
    const row = await this.prisma.savedView.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.shared !== undefined ? { shared: dto.shared } : {}),
        ...(dto.state !== undefined ? { state: cleanState(dto.state) as unknown as Prisma.InputJsonValue } : {}),
      },
      include,
    });
    return this.toDto(user, row);
  }

  async remove(user: RequestUser, id: string): Promise<{ ok: true; undo: string }> {
    const row = await this.editable(user, id);
    await this.prisma.savedView.delete({ where: { id } });
    return { ok: true, undo: this.undo.offer(user, 'SAVED_VIEW', { rows: [{ model: 'savedView', data: row }] }) };
  }
}
