import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BATCH_NO_CHALLAN_HOURS,
  INTEGRATION_KIND_INFO,
  canRunRmcPlant,
  canViewRmc,
  readBatchRow,
  suggestOrder,
  type BatchColumnMap,
  type BatchRowRead,
  type PlantBatchBoardDto,
  type PlantBatchRowDto,
  type PlantControllerDto,
  type SuggestOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { connectionHealth } from '../integrations/integration-rules';
import { readColumnMap, type PlantRowIn } from './batching-rules';
import { dispatchable, orderProgress } from './rmc-rules';
import { iso } from '../common/serialize';

type RowWithBatch = Prisma.PlantBatchRowGetPayload<{ include: { rmcBatch: { select: { batchNo: true } } } }>;

const DAY_MS = 86_400_000;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const columnsOf = (config: unknown): BatchColumnMap | null => (isObj(config) ? (readColumnMap(config.columns).columns ?? null) : null);
const fieldsOf = (v: Prisma.JsonValue): Record<string, string> => (isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x : String(x ?? '')])) : {});

/**
 * A batching plant's controller (ARCHITECTURE "Batching plant controller"): the rows of its batch reports as
 * the Connector reads them, read through the plant's column map, waiting on the RMC page to become challans. A challan
 * is made only through `RmcService.dispatch` (with the row's id), which issues the weighed materials from the plant's
 * store; this service keeps the rows, the map and the board.
 */
@Injectable()
export class PlantBatchesService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  /** A row the Connector read (from `IntegrationsService.takeIn`): kept once per file and row text, with its batch number when the columns are matched. */
  async take(c: { id: string; organizationId: string; projectId: string | null; config: unknown }, row: PlantRowIn): Promise<{ duplicate: boolean; read: BatchRowRead }> {
    if (!c.projectId) throw new BadRequestException('The connection has no plant; choose it in Connections');
    const read = readBatchRow(row.fields, columnsOf(c.config));
    const made = await this.prisma.plantBatchRow.createMany({
      data: [{ organizationId: c.organizationId, connectionId: c.id, plantId: c.projectId, rowKey: row.key, file: row.file, line: row.line, fields: row.fields, batchNo: read.batchNo }],
      skipDuplicates: true,
    });
    return { duplicate: made.count === 0, read };
  }

  private async plantIds(user: RequestUser, plantId?: string): Promise<string[]> {
    if (!canViewRmc(user.roleKey)) throw new ForbiddenException('Your role does not see RMC');
    const rows = await this.prisma.project.findMany({ where: { ...this.access.projectWhere(user), type: 'PLANT', ...(plantId ? { id: plantId } : {}) }, select: { id: true } });
    if (plantId && !rows.length) throw new NotFoundException('Plant not found or not accessible');
    return rows.map((r) => r.id);
  }

  /** The plants' controllers, the batches waiting for a challan (one row per batch number, the newest) and those done this week. */
  async board(user: RequestUser, plantId?: string): Promise<PlantBatchBoardDto> {
    const plants = await this.plantIds(user, plantId);
    const now = new Date();
    const conns = await this.prisma.integrationConnection.findMany({
      where: { organizationId: user.organizationId, kind: 'BATCHING_PLANT', projectId: { in: plants } },
      include: { project: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const connIds = conns.map((c) => c.id);
    const columns = new Map(conns.map((c) => [c.id, columnsOf(c.config)]));
    const [waitingRows, doneRows, newest, orders] = await Promise.all([
      this.prisma.plantBatchRow.findMany({
        where: { connectionId: { in: connIds }, rmcBatchId: null, dismissedAt: null, takenAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
        include: { rmcBatch: { select: { batchNo: true } } },
        orderBy: [{ takenAt: 'desc' }, { line: 'desc' }],
        take: 500,
      }),
      this.prisma.plantBatchRow.findMany({
        where: { connectionId: { in: connIds }, OR: [{ rmcBatchId: { not: null } }, { dismissedAt: { not: null } }], takenAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
        include: { rmcBatch: { select: { batchNo: true } } },
        orderBy: [{ takenAt: 'desc' }, { line: 'desc' }],
        take: 300,
      }),
      Promise.all(connIds.map((id) => this.prisma.plantBatchRow.findFirst({ where: { connectionId: id }, orderBy: [{ takenAt: 'desc' }, { line: 'desc' }], select: { connectionId: true, fields: true } }))),
      this.prisma.rmcOrder.findMany({
        where: { organizationId: user.organizationId, plantId: { in: plants }, status: 'CONFIRMED' },
        select: {
          id: true,
          plantId: true,
          orderNo: true,
          quantity: true,
          site: true,
          client: { select: { name: true } },
          project: { select: { name: true } },
          mixDesign: { select: { code: true, grade: true } },
          batches: { select: { quantity: true, status: true, invoiceId: true } },
        },
      }),
    ]);
    const ordersAt = new Map<string, SuggestOrder[]>();
    for (const o of orders) {
      const left = Number(dispatchable(o.quantity, orderProgress(o.batches)));
      if (left <= 0) continue;
      const list = ordersAt.get(o.plantId) ?? [];
      list.push({ id: o.id, orderNo: o.orderNo, mixDesignCode: o.mixDesign.code, grade: o.mixDesign.grade, left, customer: o.client?.name ?? o.project?.name ?? o.site ?? '' });
      ordersAt.set(o.plantId, list);
    }
    const itemIds = new Set<string>();
    for (const m of columns.values()) for (const x of m?.materials ?? []) itemIds.add(x.itemId);
    const items = new Map((await this.prisma.item.findMany({ where: { id: { in: [...itemIds] }, organizationId: user.organizationId }, select: { id: true, name: true, unit: true } })).map((i) => [i.id, i]));

    const dto = (r: RowWithBatch): PlantBatchRowDto => {
      const read = readBatchRow(fieldsOf(r.fields), columns.get(r.connectionId) ?? null);
      const at = read.at ?? r.takenAt;
      const open = !r.rmcBatchId && !r.dismissedAt;
      const order = open && !read.problems.length ? suggestOrder(read, ordersAt.get(r.plantId) ?? []) : null;
      return {
        id: r.id,
        connectionId: r.connectionId,
        plantId: r.plantId,
        takenAt: iso(r.takenAt),
        file: r.file,
        line: r.line,
        batchNo: read.batchNo,
        at: iso(read.at),
        quantity: read.quantity !== null ? read.quantity.toFixed(3) : null,
        mix: read.mix,
        truck: read.truck,
        orderRef: read.orderRef,
        materials: read.materials.map((m) => ({ itemId: m.itemId, itemName: items.get(m.itemId)?.name ?? 'Item', unit: items.get(m.itemId)?.unit ?? '', actualQty: m.actualQty.toFixed(3) })),
        problems: read.problems,
        suggestedOrderId: order?.id ?? null,
        late: open && now.getTime() - at.getTime() > BATCH_NO_CHALLAN_HOURS * 3_600_000,
        rmcBatchId: r.rmcBatchId,
        rmcBatchNo: r.rmcBatch?.batchNo ?? null,
        dismissedAt: iso(r.dismissedAt),
        dismissReason: r.dismissReason,
      };
    };
    // A controller that writes a batch again (a day's file rewritten) shows it once: the newest row for each number.
    const once = (rows: RowWithBatch[]) => {
      const seen = new Set<string>();
      return rows.filter((r) => {
        const no = readBatchRow(fieldsOf(r.fields), columns.get(r.connectionId) ?? null).batchNo;
        const k = no ? `${r.connectionId}|${no}` : r.id;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    const done = once(doneRows).map(dto);
    const doneKeys = new Set(done.filter((d) => d.batchNo).map((d) => `${d.connectionId}|${d.batchNo}`));
    const waiting = once(waitingRows)
      .map(dto)
      .filter((w) => !w.batchNo || !doneKeys.has(`${w.connectionId}|${w.batchNo}`))
      .sort((a, b) => (a.at ?? a.takenAt).localeCompare(b.at ?? b.takenAt));
    const newestOf = new Map(newest.filter((n): n is NonNullable<typeof n> => !!n).map((n) => [n.connectionId, fieldsOf(n.fields)]));
    const controllers: PlantControllerDto[] = conns.map((c) => {
      const sample = newestOf.get(c.id) ?? null;
      return {
        connectionId: c.id,
        name: c.name,
        plantId: c.projectId!,
        plantName: c.project?.name ?? '',
        health: connectionHealth({ ...c, quietAfterMin: INTEGRATION_KIND_INFO.BATCHING_PLANT.quietAfterMin }, now),
        lastEventAt: iso(c.lastEventAt),
        folder: isObj(c.config) && typeof c.config.folder === 'string' ? c.config.folder : '',
        columns: columns.get(c.id) ?? null,
        headers: sample ? Object.keys(sample) : [],
        sample,
      };
    });
    return { controllers, waiting, done, late: waiting.filter((w) => w.late).length, canDispatch: canRunRmcPlant(user.roleKey), canMatch: canRunRmcPlant(user.roleKey) };
  }

  private async connection(user: RequestUser, id: string) {
    const c = await this.prisma.integrationConnection.findFirst({ where: { id, organizationId: user.organizationId, kind: 'BATCHING_PLANT' } });
    if (!c || !c.projectId) throw new NotFoundException('Batching plant not found');
    await this.plantIds(user, c.projectId);
    return c;
  }

  /** The plant's column map, saved from a real report: the waiting rows are read through it again. */
  async saveColumns(user: RequestUser, connectionId: string, raw: unknown): Promise<PlantBatchBoardDto> {
    if (!canRunRmcPlant(user.roleKey)) throw new ForbiddenException('Only the plant’s store and engineers match the columns');
    const c = await this.connection(user, connectionId);
    const sample = await this.prisma.plantBatchRow.findFirst({ where: { connectionId }, orderBy: [{ takenAt: 'desc' }, { line: 'desc' }], select: { fields: true } });
    const map = readColumnMap(raw, sample ? Object.keys(fieldsOf(sample.fields)) : null);
    if (map.problem !== undefined) throw new BadRequestException(map.problem);
    if (!map.columns) throw new BadRequestException('Choose what the columns mean');
    const ids = map.columns.materials.map((m) => m.itemId);
    const found = await this.prisma.item.count({ where: { id: { in: ids }, organizationId: user.organizationId } });
    if (found !== new Set(ids).size) throw new BadRequestException('A material is not an item of the company');
    const config = { ...(isObj(c.config) ? c.config : {}), columns: map.columns } as unknown as Prisma.InputJsonValue;
    const open = await this.prisma.plantBatchRow.findMany({ where: { connectionId, rmcBatchId: null }, select: { id: true, fields: true }, take: 5000 });
    await this.prisma.$transaction([
      this.prisma.integrationConnection.update({ where: { id: c.id }, data: { config } }),
      ...open.map((r) => this.prisma.plantBatchRow.update({ where: { id: r.id }, data: { batchNo: readBatchRow(fieldsOf(r.fields), map.columns).batchNo } })),
    ]);
    await this.audit.log(user, 'INTEGRATION', c.id, 'UPDATED', `Batch report columns matched: ${map.columns.materials.length} materials`);
    return this.board(user, c.projectId!);
  }

  /** A batch that will have no challan (a test batch, a wash-out), set aside with the reason; every row of its number goes with it. */
  async dismiss(user: RequestUser, id: string, reason: string): Promise<PlantBatchBoardDto> {
    if (!canRunRmcPlant(user.roleKey)) throw new ForbiddenException('Only the plant’s store and engineers set a batch aside');
    const r = await this.prisma.plantBatchRow.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Batch row not found');
    await this.plantIds(user, r.plantId);
    if (r.rmcBatchId) throw new BadRequestException('That batch is on a challan already');
    await this.prisma.plantBatchRow.updateMany({
      where: { connectionId: r.connectionId, rmcBatchId: null, dismissedAt: null, ...(r.batchNo ? { batchNo: r.batchNo } : { id: r.id }) },
      data: { dismissedAt: new Date(), dismissReason: reason },
    });
    await this.audit.log(user, 'RMC_BATCH', r.id, 'UPDATED', `Controller batch ${r.batchNo ?? r.line ?? ''} set aside: ${reason}`);
    return this.board(user, r.plantId);
  }

  /** The row a challan is made from, checked: at this plant, not on a challan, not set aside, and read through the map. */
  async forDispatch(organizationId: string, id: string, plantId: string) {
    const r = await this.prisma.plantBatchRow.findFirst({ where: { id, organizationId }, include: { connection: { select: { config: true } } } });
    if (!r || r.plantId !== plantId) throw new BadRequestException('That batch from the controller is not at this order’s plant');
    if (r.rmcBatchId) throw new BadRequestException('That batch is on a challan already');
    if (r.dismissedAt) throw new BadRequestException('That batch was set aside');
    return { row: r, read: readBatchRow(fieldsOf(r.fields), columnsOf(r.connection.config)) };
  }

  /** Ties a batch's rows to its challan, in the challan's transaction; false when another challan took them first. */
  async tie(tx: Prisma.TransactionClient, row: { id: string; connectionId: string; batchNo: string | null }, rmcBatchId: string): Promise<boolean> {
    const n = await tx.plantBatchRow.updateMany({
      where: { connectionId: row.connectionId, rmcBatchId: null, dismissedAt: null, ...(row.batchNo ? { batchNo: row.batchNo } : { id: row.id }) },
      data: { rmcBatchId },
    });
    return n.count > 0;
  }
}

