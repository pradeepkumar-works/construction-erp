/**
 * Demo connections: a web address that the fleet's GPS service posts to, with the two trackers it has
 * reported on (the excavator's matched, the roller's not yet) and a few messages in the log, and a Connector on the
 * road site's office computer reading its own check. The secrets are random and never shown, so to see a message come
 * in, make a new web address in Admin › Connections. Runs once per company (when it has none yet).
 */
import { randomBytes, createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const ago = (min: number) => new Date(Date.now() - min * 60_000);

export async function seedIntegrations(prisma: PrismaClient, organizationId: string) {
  if (await prisma.integrationConnection.count({ where: { organizationId } })) return;
  const by = await prisma.user.findFirst({ where: { organizationId, email: 'admin@demo.com' }, select: { id: true } });
  const road = await prisma.project.findFirst({ where: { organizationId, code: 'RD-2026-01' }, select: { id: true } });
  if (!by || !road) return;
  const exc = await prisma.equipment.findFirst({ where: { organizationId, code: 'EXC-01' }, select: { id: true } });

  const secret = randomBytes(32).toString('base64url');
  const gps = await prisma.integrationConnection.create({
    data: {
      organizationId,
      kind: 'GENERIC_WEBHOOK',
      name: 'Fleet GPS service',
      projectId: road.id,
      hookSecretHash: hash(secret),
      hookSecretLast4: secret.slice(-4),
      lastEventAt: ago(35),
      lastSuccessAt: ago(35),
      createdById: by.id,
    },
  });
  await prisma.deviceLink.createMany({
    data: [
      { organizationId, connectionId: gps.id, externalId: '867530912345678', label: 'Excavator tracker', equipmentId: exc?.id ?? null, projectId: road.id, firstSeenAt: ago(3 * 1440), lastSeenAt: ago(35), readings: 214 },
      { organizationId, connectionId: gps.id, externalId: '867530998765432', label: 'Roller tracker', projectId: road.id, firstSeenAt: ago(1440), lastSeenAt: ago(95), readings: 61 },
    ],
  });
  const msg = (imei: string, label: string, min: number, extra: Record<string, unknown>) => ({
    organizationId,
    connectionId: gps.id,
    status: 'OK' as const,
    externalId: `gps-${imei.slice(-4)}-${min}`,
    summary: `From ${label}: ${3 + Object.keys(extra).length} fields (deviceId, deviceName, time${Object.keys(extra).length ? ', ' + Object.keys(extra).join(', ') : ''})`,
    detail: { deviceId: imei, deviceName: label, time: ago(min).toISOString(), ...extra },
    createdAt: ago(min),
  });
  await prisma.integrationEvent.createMany({
    data: [
      msg('867530912345678', 'Excavator tracker', 35, { ignition: true, engineHours: 4182.6 }),
      msg('867530998765432', 'Roller tracker', 95, { ignition: false, engineHours: 2210.1 }),
      msg('867530912345678', 'Excavator tracker', 125, { ignition: true, engineHours: 4181.1 }),
    ],
  });

  const pc = await prisma.connectorAgent.create({
    data: {
      organizationId,
      name: 'Road site office PC',
      projectId: road.id,
      tokenHash: hash(`nct_${randomBytes(32).toString('base64url')}`),
      pairedAt: ago(2 * 1440),
      lastSeenAt: ago(20),
      version: '0.1.0',
      hostname: 'RD-SITE-PC',
      createdById: by.id,
    },
  });
  const check = await prisma.integrationConnection.create({
    data: { organizationId, kind: 'CONNECTOR_CHECK', name: 'Road site office check', projectId: road.id, agentId: pc.id, lastEventAt: ago(20), lastSuccessAt: ago(20), createdById: by.id },
  });
  await prisma.integrationEvent.create({
    data: { organizationId, connectionId: check.id, agentId: pc.id, status: 'OK', externalId: 'check-seed', summary: 'Connector on RD-SITE-PC is working', detail: { deviceId: 'RD-SITE-PC', uptimeMin: 2860, waiting: 0 }, createdAt: ago(20) },
  });
}
