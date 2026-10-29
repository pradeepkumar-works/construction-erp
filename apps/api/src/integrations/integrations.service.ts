import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canManageIntegrations,
  CONNECTOR_BATCH_MAX,
  CONNECTOR_POLL_SECONDS,
  INTEGRATION_KIND_INFO,
  integrationKindFromSlug,
  integrationKindSlug,
  type ConnectorAgentDto,
  type ConnectorConfigDto,
  type ConnectorPairCodeDto,
  type ConnectorReadingResultDto,
  type DeviceLinkDto,
  type HookResultDto,
  type IntegrationConnectionDto,
  type IntegrationEventDto,
  type IntegrationEventStatus,
  type IntegrationKind,
  type IntegrationSecretDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { iso } from '../common/serialize';
import { setTenant, withoutTenant } from '../prisma/tenant-context';
import {
  agentState,
  bearer,
  connectionHealth,
  hashSecret,
  last4,
  logDetail,
  looksLikeToken,
  newSecret,
  normalisePairCode,
  openSecret,
  pairCode,
  pairCodeExpiry,
  readBatch,
  readGeneric,
  sealSecret,
  TOKEN_PREFIX,
  type RawReading,
} from './integration-rules';
import type { ConnectorReadingsDto, CreateAgentDto, CreateConnectionDto, EventQuery, MatchDeviceDto, PairConnectorDto, UpdateConnectionDto } from './integrations.dto';

type Connection = Prisma.IntegrationConnectionGetPayload<{
  include: { project: { select: { name: true } }; agent: { select: { name: true } }; _count: { select: { deviceLinks: true } } };
}>;
type Agent = Prisma.ConnectorAgentGetPayload<{ include: { project: { select: { name: true } }; _count: { select: { connections: true } } } }>;

/** What a kind's reader made of one message: how it went, a line for the log, and the device it was about. */
export interface HandlerResult {
  status: IntegrationEventStatus;
  summary: string;
  device?: { externalId: string; label: string | null } | null;
}

/** A kind's reader. Later kinds (trackers, fuel, weighbridges…) add theirs in `handlers`; each makes drafts, never approved records. */
export type IntegrationHandler = (conn: { id: string; organizationId: string; projectId: string | null }, payload: unknown, at: Date) => Promise<HandlerResult>;

const connInclude = { project: { select: { name: true } }, agent: { select: { name: true } }, _count: { select: { deviceLinks: true } } } as const;
const agentInclude = { project: { select: { name: true } }, _count: { select: { connections: true } } } as const;

/** The integration layer (item 139, ARCHITECTURE "Integration layer"): connections, Connectors, the hooks and the log. */
@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Each kind's reader; a generic message is kept in the log with the device it names. */
  private handlers: Record<IntegrationKind, IntegrationHandler> = {
    GENERIC_WEBHOOK: async (_c, payload) => {
      const m = readGeneric(payload);
      return { status: 'OK', summary: m.summary, device: m.deviceId ? { externalId: m.deviceId, label: m.deviceLabel } : null };
    },
    CONNECTOR_CHECK: async (_c, payload) => {
      const m = readGeneric(payload);
      // The computer itself is not a device to match, so nothing is listed under Devices.
      return { status: 'OK', summary: m.deviceId ? `Connector on ${m.deviceLabel ?? m.deviceId} is working` : 'Connector is working' };
    },
  };

  private assertManage(user: RequestUser) {
    if (!canManageIntegrations(user.roleKey)) throw new ForbiddenException('Only an admin or management can manage connections');
  }

  private integrationKey() {
    return process.env.INTEGRATION_KEY || null;
  }

  /* ---------- connections ---------- */

  private async connectionDtos(organizationId: string, rows: Connection[]): Promise<IntegrationConnectionDto[]> {
    const now = new Date();
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    const counts = rows.length
      ? await this.prisma.integrationEvent.groupBy({ by: ['connectionId'], where: { organizationId, connectionId: { in: rows.map((r) => r.id) }, createdAt: { gte: since } }, _count: { _all: true } })
      : [];
    const today = new Map(counts.map((c) => [c.connectionId, c._count._all]));
    return rows.map((c) => {
      const info = INTEGRATION_KIND_INFO[c.kind];
      return {
        id: c.id,
        kind: c.kind,
        name: c.name,
        projectId: c.projectId,
        projectName: c.project?.name ?? null,
        agentId: c.agentId,
        agentName: c.agent?.name ?? null,
        config: (c.config ?? {}) as Record<string, unknown>,
        secretLast4: c.secretLast4,
        hookPathHint: info.transport === 'HOOK' && c.hookSecretLast4 ? `/hooks/${integrationKindSlug(c.kind)}/…${c.hookSecretLast4}` : null,
        isActive: c.isActive,
        health: connectionHealth({ ...c, quietAfterMin: info.quietAfterMin }, now),
        lastEventAt: iso(c.lastEventAt),
        lastSuccessAt: iso(c.lastSuccessAt),
        lastErrorAt: iso(c.lastErrorAt),
        lastError: c.lastError,
        eventsToday: today.get(c.id) ?? 0,
        devices: c._count.deviceLinks,
        createdAt: c.createdAt.toISOString(),
      };
    });
  }

  async connections(user: RequestUser): Promise<IntegrationConnectionDto[]> {
    this.assertManage(user);
    const rows = await this.prisma.integrationConnection.findMany({ where: { organizationId: user.organizationId }, include: connInclude, orderBy: { name: 'asc' } });
    return this.connectionDtos(user.organizationId, rows);
  }

  private async connection(user: RequestUser, id: string) {
    const c = await this.prisma.integrationConnection.findFirst({ where: { id, organizationId: user.organizationId }, include: connInclude });
    if (!c) throw new NotFoundException('That connection is not in this company');
    return c;
  }

  private async checkRefs(user: RequestUser, projectId?: string | null, agentId?: string | null) {
    if (projectId) {
      const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { id: true } });
      if (!p) throw new BadRequestException('Choose a project of this company');
    }
    if (agentId) {
      const a = await this.prisma.connectorAgent.findFirst({ where: { id: agentId, organizationId: user.organizationId, revokedAt: null }, select: { id: true } });
      if (!a) throw new BadRequestException('Choose a Connector of this company that has not been removed');
    }
  }

  private sealed(credential: string) {
    const key = this.integrationKey();
    if (!key) throw new BadRequestException('Keys cannot be saved until INTEGRATION_KEY is set on the server (see DEPLOY.md)');
    return { secretEnc: sealSecret(credential, key), secretLast4: last4(credential) };
  }

  async createConnection(user: RequestUser, dto: CreateConnectionDto): Promise<IntegrationSecretDto> {
    this.assertManage(user);
    const info = INTEGRATION_KIND_INFO[dto.kind];
    if (info.transport === 'CONNECTOR' && !dto.agentId) throw new BadRequestException('Choose the Connector that reads it');
    await this.checkRefs(user, dto.projectId, info.transport === 'CONNECTOR' ? dto.agentId : null);
    const secret = info.transport === 'HOOK' ? newSecret() : null;
    const row = await this.prisma.integrationConnection.create({
      data: {
        organizationId: user.organizationId,
        kind: dto.kind,
        name: dto.name,
        projectId: dto.projectId ?? null,
        agentId: info.transport === 'CONNECTOR' ? dto.agentId! : null,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        ...(dto.credential ? this.sealed(dto.credential) : {}),
        hookSecretHash: secret ? hashSecret(secret) : null,
        hookSecretLast4: secret ? last4(secret) : null,
        createdById: user.id,
      },
      include: connInclude,
    });
    await this.audit.log(user, 'INTEGRATION', row.id, 'CREATED', `${info.label}: ${row.name}`);
    const [connection] = await this.connectionDtos(user.organizationId, [row]);
    return { connection, hookPath: secret ? `/hooks/${integrationKindSlug(row.kind)}/${secret}` : null };
  }

  async updateConnection(user: RequestUser, id: string, dto: UpdateConnectionDto): Promise<IntegrationConnectionDto> {
    this.assertManage(user);
    const c = await this.connection(user, id);
    const connector = INTEGRATION_KIND_INFO[c.kind].transport === 'CONNECTOR';
    if (connector && dto.agentId === null) throw new BadRequestException('Choose the Connector that reads it');
    await this.checkRefs(user, dto.projectId, connector ? dto.agentId : null);
    const data: Prisma.IntegrationConnectionUncheckedUpdateInput = {
      name: dto.name,
      projectId: dto.projectId,
      agentId: connector ? dto.agentId : undefined,
      config: dto.config as Prisma.InputJsonValue | undefined,
      isActive: dto.isActive,
    };
    if (dto.credential === '' || dto.credential === null) Object.assign(data, { secretEnc: null, secretLast4: null });
    else if (dto.credential) Object.assign(data, this.sealed(dto.credential));
    const row = await this.prisma.integrationConnection.update({ where: { id }, data, include: connInclude });
    const note = dto.isActive === false ? 'Switched off' : dto.isActive === true ? 'Switched on' : dto.credential !== undefined ? 'Key changed' : null;
    await this.audit.log(user, 'INTEGRATION', id, 'UPDATED', note);
    return (await this.connectionDtos(user.organizationId, [row]))[0];
  }

  /** A new web address: the old one stops working at once. */
  async newHookSecret(user: RequestUser, id: string): Promise<IntegrationSecretDto> {
    this.assertManage(user);
    const c = await this.connection(user, id);
    if (INTEGRATION_KIND_INFO[c.kind].transport !== 'HOOK') throw new BadRequestException('This connection is read by a Connector and has no web address');
    const secret = newSecret();
    const row = await this.prisma.integrationConnection.update({ where: { id }, data: { hookSecretHash: hashSecret(secret), hookSecretLast4: last4(secret) }, include: connInclude });
    await this.audit.log(user, 'INTEGRATION', id, 'UPDATED', 'New web address');
    const [connection] = await this.connectionDtos(user.organizationId, [row]);
    return { connection, hookPath: `/hooks/${integrationKindSlug(row.kind)}/${secret}` };
  }

  async removeConnection(user: RequestUser, id: string) {
    this.assertManage(user);
    const c = await this.connection(user, id);
    await this.prisma.integrationConnection.delete({ where: { id } });
    await this.audit.log(user, 'INTEGRATION', id, 'DELETED', c.name);
    return { ok: true };
  }

  /* ---------- Connectors ---------- */

  private agentDto(a: Agent, now = new Date()): ConnectorAgentDto {
    return {
      id: a.id,
      name: a.name,
      projectId: a.projectId,
      projectName: a.project?.name ?? null,
      state: agentState(a, now),
      pairCodeExpiresAt: a.pairedAt ? null : iso(a.pairCodeExpiresAt),
      pairedAt: iso(a.pairedAt),
      lastSeenAt: iso(a.lastSeenAt),
      version: a.version,
      hostname: a.hostname,
      connections: a._count.connections,
      createdAt: a.createdAt.toISOString(),
    };
  }

  async agents(user: RequestUser): Promise<ConnectorAgentDto[]> {
    this.assertManage(user);
    const rows = await this.prisma.connectorAgent.findMany({ where: { organizationId: user.organizationId }, include: agentInclude, orderBy: [{ revokedAt: { sort: 'desc', nulls: 'first' } }, { name: 'asc' }] });
    const now = new Date();
    return rows.map((a) => this.agentDto(a, now));
  }

  async createAgent(user: RequestUser, dto: CreateAgentDto): Promise<ConnectorPairCodeDto> {
    this.assertManage(user);
    await this.checkRefs(user, dto.projectId);
    const code = pairCode();
    const expiresAt = pairCodeExpiry(new Date());
    const row = await this.prisma.connectorAgent.create({
      data: { organizationId: user.organizationId, name: dto.name, projectId: dto.projectId ?? null, pairCodeHash: hashSecret(code), pairCodeExpiresAt: expiresAt, createdById: user.id },
      include: agentInclude,
    });
    await this.audit.log(user, 'CONNECTOR', row.id, 'CREATED', row.name);
    return { agent: this.agentDto(row), code, expiresAt: expiresAt.toISOString() };
  }

  /** A fresh code, to pair a Connector again (a new computer, or a code that ran out): the old token stops working. */
  async newPairCode(user: RequestUser, id: string): Promise<ConnectorPairCodeDto> {
    this.assertManage(user);
    const a = await this.prisma.connectorAgent.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!a) throw new NotFoundException('That Connector is not in this company');
    if (a.revokedAt) throw new BadRequestException('This Connector was removed; add a new one');
    const code = pairCode();
    const expiresAt = pairCodeExpiry(new Date());
    const row = await this.prisma.connectorAgent.update({
      where: { id },
      data: { pairCodeHash: hashSecret(code), pairCodeExpiresAt: expiresAt, tokenHash: null, pairedAt: null },
      include: agentInclude,
    });
    await this.audit.log(user, 'CONNECTOR', id, 'UPDATED', 'New pairing code');
    return { agent: this.agentDto(row), code, expiresAt: expiresAt.toISOString() };
  }

  /** Removed for good: its token stops working and its connections wait for another Connector. */
  async revokeAgent(user: RequestUser, id: string): Promise<ConnectorAgentDto> {
    this.assertManage(user);
    const a = await this.prisma.connectorAgent.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!a) throw new NotFoundException('That Connector is not in this company');
    const row = await this.prisma.connectorAgent.update({ where: { id }, data: { revokedAt: a.revokedAt ?? new Date(), tokenHash: null, pairCodeHash: null }, include: agentInclude });
    await this.prisma.integrationConnection.updateMany({ where: { agentId: id }, data: { agentId: null } });
    await this.audit.log(user, 'CONNECTOR', id, 'DELETED', a.name);
    return this.agentDto(row);
  }

  /* ---------- devices ---------- */

  async devices(user: RequestUser): Promise<DeviceLinkDto[]> {
    this.assertManage(user);
    const rows = await this.prisma.deviceLink.findMany({
      where: { organizationId: user.organizationId },
      include: { connection: { select: { name: true, kind: true } }, equipment: { select: { code: true, name: true } }, project: { select: { name: true } } },
      orderBy: [{ equipmentId: { sort: 'asc', nulls: 'first' } }, { lastSeenAt: 'desc' }],
    });
    return rows.map((d) => ({
      id: d.id,
      connectionId: d.connectionId,
      connectionName: d.connection.name,
      kind: d.connection.kind,
      externalId: d.externalId,
      label: d.label,
      equipmentId: d.equipmentId,
      equipmentName: d.equipment ? `${d.equipment.code} ${d.equipment.name}` : null,
      projectId: d.projectId,
      projectName: d.project?.name ?? null,
      firstSeenAt: d.firstSeenAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
      readings: d.readings,
    }));
  }

  async matchDevice(user: RequestUser, id: string, dto: MatchDeviceDto) {
    this.assertManage(user);
    const d = await this.prisma.deviceLink.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!d) throw new NotFoundException('That device is not in this company');
    if (dto.equipmentId) {
      const e = await this.prisma.equipment.findFirst({ where: { id: dto.equipmentId, organizationId: user.organizationId }, select: { id: true } });
      if (!e) throw new BadRequestException('Choose a machine of this company');
    }
    await this.checkRefs(user, dto.projectId);
    await this.prisma.deviceLink.update({ where: { id }, data: { equipmentId: dto.equipmentId, projectId: dto.projectId, label: dto.label } });
    await this.audit.log(user, 'DEVICE_LINK', id, 'UPDATED', dto.equipmentId ? 'Matched to a machine' : dto.equipmentId === null ? 'Match cleared' : null);
    return (await this.devices(user)).find((x) => x.id === id)!;
  }

  /* ---------- the log ---------- */

  async events(user: RequestUser, q: EventQuery): Promise<IntegrationEventDto[]> {
    this.assertManage(user);
    const rows = await this.prisma.integrationEvent.findMany({
      where: { organizationId: user.organizationId, connectionId: q.connectionId, status: q.status },
      include: { connection: { select: { name: true } }, agent: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 200,
    });
    return rows.map((e) => ({
      id: e.id,
      connectionId: e.connectionId,
      connectionName: e.connection?.name ?? null,
      agentName: e.agent?.name ?? null,
      direction: e.direction,
      status: e.status,
      externalId: e.externalId,
      summary: e.summary,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /* ---------- taking a message in ---------- */

  /**
   * One message for a connection: read by its kind, kept in the log, the device it names listed, the connection's
   * health moved on. A message whose id was taken in before is a duplicate and changes nothing.
   */
  private async takeIn(
    conn: { id: string; organizationId: string; projectId: string | null; kind: IntegrationKind; isActive: boolean },
    payload: unknown,
    opts: { externalId: string | null; at: Date; agentId?: string | null },
  ): Promise<{ status: IntegrationEventStatus | 'DUPLICATE'; summary: string }> {
    if (opts.externalId) {
      const seen = await this.prisma.integrationEvent.findUnique({ where: { connectionId_externalId: { connectionId: conn.id, externalId: opts.externalId } }, select: { id: true } });
      if (seen) return { status: 'DUPLICATE', summary: 'Already taken in' };
    }
    let result: HandlerResult;
    if (!conn.isActive) result = { status: 'IGNORED', summary: 'The connection is switched off' };
    else {
      try {
        result = await this.handlers[conn.kind](conn, payload, opts.at);
      } catch (e) {
        result = { status: 'FAILED', summary: (e as Error).message.slice(0, 300) || 'The message could not be read' };
      }
    }
    try {
      await this.prisma.integrationEvent.create({
        data: {
          organizationId: conn.organizationId,
          connectionId: conn.id,
          agentId: opts.agentId ?? null,
          direction: 'IN',
          status: result.status,
          externalId: opts.externalId,
          summary: result.summary,
          detail: logDetail(payload) as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { status: 'DUPLICATE', summary: 'Already taken in' };
      throw e;
    }
    const now = new Date();
    await this.prisma.integrationConnection.update({
      where: { id: conn.id },
      data: {
        lastEventAt: now,
        ...(result.status === 'OK' ? { lastSuccessAt: now } : {}),
        ...(result.status === 'FAILED' ? { lastErrorAt: now, lastError: result.summary } : {}),
      },
    });
    if (result.device && result.status === 'OK') {
      await this.prisma.deviceLink.upsert({
        where: { connectionId_externalId: { connectionId: conn.id, externalId: result.device.externalId } },
        create: { organizationId: conn.organizationId, connectionId: conn.id, externalId: result.device.externalId, label: result.device.label, projectId: conn.projectId, readings: 1 },
        update: { lastSeenAt: now, readings: { increment: 1 } },
      });
    }
    return { status: result.status, summary: result.summary };
  }

  /** POST /hooks/<kind>/<secret>: a vendor's cloud or any service posting to the connection's own web address. */
  async hook(slug: string, secret: string, body: unknown, eventId: string | null): Promise<HookResultDto> {
    const kind = integrationKindFromSlug(slug);
    const c = kind && secret.length >= 32 ? await withoutTenant(() => this.prisma.integrationConnection.findUnique({ where: { hookSecretHash: hashSecret(secret) } })) : null;
    if (!c || c.kind !== kind) throw new UnauthorizedException('Unknown web address. Copy it again from Admin, Connections.');
    setTenant(c.organizationId);
    const r = await this.takeIn(c, body, { externalId: readGeneric(body, eventId).externalId, at: new Date() });
    return { status: r.status === 'DUPLICATE' ? 'IGNORED' : r.status, summary: r.summary };
  }

  /* ---------- the Connector's own calls ---------- */

  /** Pairing: the code shown in Connectors, typed on the site computer, gives it a token that only it keeps. */
  async pair(dto: PairConnectorDto): Promise<{ token: string; agentId: string; name: string }> {
    const code = normalisePairCode(dto.code);
    const a = code ? await withoutTenant(() => this.prisma.connectorAgent.findUnique({ where: { pairCodeHash: hashSecret(code) } })) : null;
    if (!a || a.revokedAt || !a.pairCodeExpiresAt || a.pairCodeExpiresAt < new Date())
      throw new UnauthorizedException('That code is not right or has run out. Make a new one in Admin, Connections, Connectors.');
    setTenant(a.organizationId);
    const token = newSecret(TOKEN_PREFIX);
    await this.prisma.connectorAgent.update({
      where: { id: a.id },
      data: { tokenHash: hashSecret(token), pairCodeHash: null, pairCodeExpiresAt: null, pairedAt: new Date(), lastSeenAt: new Date(), hostname: dto.hostname ?? null, version: dto.version ?? null },
    });
    await this.prisma.auditLog.create({ data: { organizationId: a.organizationId, entityType: 'CONNECTOR', entityId: a.id, action: 'UPDATED', actorId: a.createdById, note: `Paired on ${dto.hostname ?? 'a computer'}` } });
    return { token, agentId: a.id, name: a.name };
  }

  private async agentFor(authorization: string | undefined, version?: string | null) {
    const token = bearer(authorization);
    const a = looksLikeToken(token) ? await withoutTenant(() => this.prisma.connectorAgent.findUnique({ where: { tokenHash: hashSecret(token) }, include: { organization: { select: { name: true } } } })) : null;
    if (!a || a.revokedAt) throw new UnauthorizedException('This Connector is not paired. Pair it again with a new code from Admin, Connections, Connectors.');
    setTenant(a.organizationId);
    await this.prisma.connectorAgent.update({ where: { id: a.id }, data: { lastSeenAt: new Date(), ...(version ? { version: version.slice(0, 40) } : {}) } });
    return a;
  }

  /** GET /connector/config: called every minute, so it is also the Connector's heartbeat. */
  async connectorConfig(authorization: string | undefined, version: string | null): Promise<ConnectorConfigDto> {
    const a = await this.agentFor(authorization, version);
    const rows = await this.prisma.integrationConnection.findMany({ where: { agentId: a.id, isActive: true }, orderBy: { name: 'asc' } });
    const key = this.integrationKey();
    return {
      agent: { id: a.id, name: a.name, organizationName: a.organization.name },
      pollSeconds: CONNECTOR_POLL_SECONDS,
      batchMax: CONNECTOR_BATCH_MAX,
      serverTime: new Date().toISOString(),
      connections: rows.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        config: (c.config ?? {}) as Record<string, unknown>,
        credential: c.secretEnc && key ? openSecret(c.secretEnc, key) : null,
      })),
    };
  }

  /** POST /connector/readings: a batch from the Connector's buffer; each reading's id makes a resend harmless. */
  async connectorReadings(authorization: string | undefined, dto: ConnectorReadingsDto): Promise<ConnectorReadingResultDto> {
    const a = await this.agentFor(authorization);
    const { readings, problems } = readBatch(dto.readings as RawReading[], new Date());
    const ids = [...new Set(readings.map((r) => r.connectionId))];
    const conns = new Map((await this.prisma.integrationConnection.findMany({ where: { id: { in: ids }, organizationId: a.organizationId } })).map((c) => [c.id, c]));
    const result: ConnectorReadingResultDto = { accepted: 0, duplicates: 0, failed: problems.length, problems };
    for (const r of readings) {
      const c = conns.get(r.connectionId);
      if (!c || c.agentId !== a.id) {
        result.failed++;
        result.problems.push(`Reading ${r.id}: its connection is not read by this Connector; fetch the settings again`);
        continue;
      }
      const out = await this.takeIn(c, r.payload, { externalId: r.id, at: r.at, agentId: a.id });
      if (out.status === 'DUPLICATE') result.duplicates++;
      else if (out.status === 'FAILED') {
        result.failed++;
        result.problems.push(`Reading ${r.id}: ${out.summary}`);
      }
      else result.accepted++;
    }
    return result;
  }
}
