/**
 * Demo telematics (item 146): the fleet's GPS service becomes a tracker service, and the excavator's tracker has
 * read every day it was logged, half-hourly from eight in the morning. Two days ago the engine ran six hours though
 * the log says eight, and four days ago it went about seven kilometres from the road site after lunch, so the Engine
 * hours tab and the log show both. The days are rolled up by the same rules as live readings. Runs once per company.
 */
import { PrismaClient } from '@prisma/client';
import { machineSiteRadius } from '@erp/shared';
import { dayRowData, rollUpDay, type Carry, type DayState, type ReadingFigures } from '../src/telematics/telematics-rules';

export async function seedTelematics(prisma: PrismaClient, organizationId: string) {
  if (await prisma.machineDay.count({ where: { organizationId } })) return;
  // From item 146 on, the demo's GPS service is a tracker service, so its messages make machine days.
  await prisma.integrationConnection.updateMany({ where: { organizationId, name: 'Fleet GPS service', kind: 'GENERIC_WEBHOOK' }, data: { kind: 'GPS_TRACKER' } });
  const exc = await prisma.equipment.findFirst({ where: { organizationId, code: 'EXC-01' }, select: { id: true, projectId: true, project: { select: { siteLat: true, siteLng: true, siteRadiusM: true } } } });
  const link = await prisma.deviceLink.findFirst({ where: { organizationId, externalId: '867530912345678' } });
  if (!exc?.project?.siteLat || !exc.project.siteLng || !link) return;
  if (link.equipmentId !== exc.id) await prisma.deviceLink.update({ where: { id: link.id }, data: { equipmentId: exc.id } });
  const site = { lat: Number(exc.project.siteLat), lng: Number(exc.project.siteLng), radiusM: machineSiteRadius(exc.project.siteRadiusM) };
  const logs = await prisma.machineryLog.findMany({ where: { equipmentId: exc.id, status: { not: 'REJECTED' } }, orderBy: { date: 'asc' } });
  const now = Date.now();
  let carry: Carry | null = null;
  let idle = 310;
  let fuel = 41_200;
  for (const [i, l] of logs.entries()) {
    const date = l.date.toISOString().slice(0, 10);
    const start = carry?.meter ?? Number(l.meterStart ?? 1500 + i * 8);
    const short = i === logs.length - 3;
    const away = i === logs.length - 5;
    const hours = short ? 6 : Number(l.hoursWorked) + Number(l.idleHours);
    const idleShare = Number(l.idleHours) / Math.max(1, hours);
    const readings: ReadingFigures[] = [];
    for (let h = 0; h <= hours + 0.5; h += 0.5) {
      const at = new Date(Date.parse(`${date}T08:00:00+05:30`) + h * 3_600_000);
      if (at.getTime() > now) break;
      const run = Math.min(h, hours);
      const off = away && h >= 5 && h <= 6.5 ? 0.063 : 0;
      readings.push({
        at,
        hourMeter: Math.round((start + run) * 100) / 100,
        idleMeter: Math.round((idle + run * idleShare) * 100) / 100,
        fuelUsed: Math.round((fuel + run * 14.5) * 1000) / 1000,
        lat: Math.round((site.lat + off + Math.sin(h) * 0.002) * 1e6) / 1e6,
        lng: Math.round((site.lng + Math.cos(h) * 0.002) * 1e6) / 1e6,
        engineOn: h < hours,
      });
    }
    if (!readings.length) continue;
    await prisma.machineReading.createMany({ data: readings.map((r) => ({ organizationId, deviceLinkId: link.id, equipmentId: exc.id, ...r })), skipDuplicates: true });
    const s: DayState = rollUpDay(readings, { date, site, carry })!;
    await prisma.machineDay.create({ data: { organizationId, equipmentId: exc.id, projectId: exc.projectId, date: l.date, ...dayRowData(s) } });
    carry = { meter: s.meterEnd, meterAt: s.meterAt, idle: s.idleEnd, fuelUsed: s.fuelUsedEnd };
    idle = s.idleEnd ?? idle;
    fuel = s.fuelUsedEnd ?? fuel;
  }
}
