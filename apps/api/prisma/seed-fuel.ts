/**
 * Demo fuel sensors and dispenser: the excavator's tracker reads its 300-litre tank, and the road site's
 * diesel dispenser posts its fills. Each morning before work the tank is filled at the dispenser, which makes the
 * day's fuel slip, except on the two latest days, whose slips the store wrote by hand. Three days ago 120 litres went
 * in with no slip at all, and two days ago 45 litres were drained at night with the engine off, so the Engine hours
 * and Fuel tabs and the watch list show both. A fill the store's books are short of waits with the reason (Try again
 * once the receipt is in), and so does the water tanker's, whose tag is not matched yet. The days are rolled up again
 * by the same rules as live readings. Runs once per company (when it has no dispenser).
 */
import { randomBytes, createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { machineSiteRadius } from '@erp/shared';
import { JOB_TIMEZONE } from '../src/notifications/time';
import { dayOf, dayRowData, rollUpDay, type Carry, type DayState, type ReadingFigures } from '../src/telematics/telematics-rules';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const TANK = 300;
const n = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

export async function seedFuel(prisma: PrismaClient, organizationId: string) {
  if (await prisma.integrationConnection.count({ where: { organizationId, kind: 'FUEL_DISPENSER' } })) return;
  const by = await prisma.user.findFirst({ where: { organizationId, email: 'admin@demo.com' }, select: { id: true } });
  const exc = await prisma.equipment.findFirst({
    where: { organizationId, code: 'EXC-01' },
    select: { id: true, code: true, name: true, projectId: true, project: { select: { siteLat: true, siteLng: true, siteRadiusM: true } } },
  });
  if (!by || !exc?.projectId || !exc.project?.siteLat || !exc.project.siteLng) return;
  const projectId = exc.projectId;
  const fuel = await prisma.stockTxn.groupBy({ by: ['itemId'], where: { projectId, item: { isFuel: true } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 1 });
  const readings = await prisma.machineReading.findMany({ where: { equipmentId: exc.id }, orderBy: { at: 'asc' } });
  if (!fuel.length || !readings.length) return;
  const itemId = fuel[0].itemId;
  let stock = Number(fuel[0]._sum.quantity ?? 0);

  await prisma.equipment.update({ where: { id: exc.id }, data: { fuelTankLitres: TANK } });
  const secret = randomBytes(32).toString('base64url');
  const dispenser = await prisma.integrationConnection.create({
    data: {
      organizationId,
      kind: 'FUEL_DISPENSER',
      name: 'Road site diesel dispenser',
      projectId,
      config: { itemId },
      hookSecretHash: hash(secret),
      hookSecretLast4: secret.slice(-4),
      createdById: by.id,
    },
  });
  const tag = await prisma.deviceLink.create({ data: { organizationId, connectionId: dispenser.id, externalId: 'E2003412EXC01', label: 'Excavator tag', equipmentId: exc.id, projectId } });
  const tanker = await prisma.deviceLink.create({ data: { organizationId, connectionId: dispenser.id, externalId: 'E2003412WT07', label: 'Water tanker tag', projectId } });
  const link = readings[0].deviceLinkId;

  const slips = await prisma.stockEntry.findMany({ where: { equipmentId: exc.id, type: 'ISSUE' }, select: { date: true, lines: { select: { quantity: true } } } });
  const slipOn = new Map(slips.map((s) => [s.date.toISOString().slice(0, 10), s.lines.reduce((t, l) => t - Number(l.quantity), 0)]));
  const byDay = new Map<string, typeof readings>();
  for (const r of readings) {
    const d = dayOf(r.at, JOB_TIMEZONE);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const days = [...byDay.keys()].sort();
  const year = new Date().getUTCFullYear();
  const nextNo = async () => {
    const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `ISS-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
    return `ISS-${year}-${String((last ? parseInt(last.entryNo.slice(9), 10) : 0) + 1).padStart(4, '0')}`;
  };
  const point = { lat: Number(exc.project.siteLat), lng: Number(exc.project.siteLng) };
  const pct = (litres: number) => Math.round((litres / TANK) * 10000) / 100;
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);
  const now = Date.now();

  let level = 90;
  const extra: Prisma.MachineReadingCreateManyInput[] = [];
  for (const [i, date] of days.entries()) {
    const fromLatest = days.length - 1 - i;
    const dayReadings = byDay.get(date)!;
    // The morning fill, a few minutes before work: on a slip the store wrote, else at the dispenser, else (three days ago) on none.
    const written = slipOn.get(date);
    const litres = written ?? (fromLatest === 3 ? 120 : 115);
    const fillAt = at(date, '07:40');
    if (fillAt.getTime() < now) {
      extra.push({ organizationId, deviceLinkId: link, equipmentId: exc.id, at: fillAt, fuelPct: pct(level), engineOn: false, ...point });
      if (written === undefined && fromLatest !== 3 && stock < litres) {
        // The store's books ran short of what the dispenser poured: the fill waits with the reason, as a live one would.
        await prisma.fuelDispense.create({
          data: {
            organizationId, connectionId: dispenser.id, externalId: `TX-${date.replace(/-/g, '')}-01`, deviceLinkId: tag.id, at: at(date, '07:43'), litres, meter: dayReadings[0].hourMeter,
            problem: stock > 0 ? `Only ${Math.round(stock * 1000) / 1000} L of diesel is in stock at this project.` : 'Diesel is out of stock at this project.',
          },
        });
      } else if (written === undefined && fromLatest !== 3) {
        const date0 = new Date(`${date}T00:00:00Z`);
        const e = await prisma.stockEntry.create({
          data: {
            organizationId, projectId, type: 'ISSUE', entryNo: await nextNo(), date: date0, createdById: by.id, createdAt: at(date, '07:43'),
            equipmentId: exc.id, meterReading: dayReadings[0].hourMeter, issuedTo: `${exc.code} ${exc.name}`, remarks: `From ${dispenser.name}, 02:13 UTC`,
            lines: { create: [{ organizationId, projectId, itemId, type: 'ISSUE', date: date0, quantity: -litres }] },
          },
        });
        await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: by.id, note: e.entryNo, createdAt: at(date, '07:43') } });
        await prisma.fuelDispense.create({
          data: { organizationId, connectionId: dispenser.id, externalId: `TX-${date.replace(/-/g, '')}-01`, deviceLinkId: tag.id, at: at(date, '07:43'), litres, meter: dayReadings[0].hourMeter, stockEntryId: e.id },
        });
        stock -= litres;
      }
      level = Math.min(TANK - 5, level + litres);
      extra.push({ organizationId, deviceLinkId: link, equipmentId: exc.id, at: at(date, '07:45'), fuelPct: pct(level), engineOn: false, ...point });
    }
    // Through the day the tank falls by what the engine burns (its fuel-used counter).
    let used = n(dayReadings[0].fuelUsed);
    for (const r of dayReadings) {
      const u = n(r.fuelUsed);
      if (u !== null && used !== null) level = Math.max(5, level - (u - used));
      used = u ?? used;
      await prisma.machineReading.update({ where: { id: r.id }, data: { fuelPct: pct(level) } });
    }
    // Two days ago, 45 litres went at night with the engine off.
    if (fromLatest === 2 && at(date, '23:30').getTime() < now) {
      extra.push({ organizationId, deviceLinkId: link, equipmentId: exc.id, at: at(date, '21:00'), fuelPct: pct(level), engineOn: false, ...point });
      level -= 45;
      extra.push({ organizationId, deviceLinkId: link, equipmentId: exc.id, at: at(date, '23:30'), fuelPct: pct(level), engineOn: false, ...point });
    }
  }
  await prisma.machineReading.createMany({ data: extra, skipDuplicates: true });
  await prisma.fuelDispense.create({
    data: { organizationId, connectionId: dispenser.id, externalId: 'TX-WT07-0001', deviceLinkId: tanker.id, at: new Date(now - 20 * 3_600_000), litres: 80, meter: 18_240 },
  });
  await prisma.integrationConnection.update({ where: { id: dispenser.id }, data: { lastEventAt: new Date(now - 20 * 3_600_000), lastSuccessAt: new Date(now - 20 * 3_600_000) } });
  await prisma.deviceLink.update({ where: { id: tag.id }, data: { readings: days.length - 3, lastSeenAt: at(days[days.length - 3] ?? days[0], '07:43') } });

  // The days again from their readings, oldest first so each carries the last.
  const site = { ...point, radiusM: machineSiteRadius(exc.project.siteRadiusM) };
  let carry: Carry | null = null;
  for (const date of days) {
    const rows = await prisma.machineReading.findMany({ where: { equipmentId: exc.id, at: { gte: at(date, '00:00'), lt: new Date(at(date, '00:00').getTime() + 86_400_000) } }, orderBy: { at: 'asc' } });
    const figures: ReadingFigures[] = rows.map((r) => ({ at: r.at, hourMeter: n(r.hourMeter), idleMeter: n(r.idleMeter), fuelUsed: n(r.fuelUsed), fuelPct: n(r.fuelPct), fuelLitres: n(r.fuelLitres), lat: n(r.lat), lng: n(r.lng), engineOn: r.engineOn }));
    const s: DayState = rollUpDay(figures, { date, site, carry, tank: TANK })!;
    await prisma.machineDay.updateMany({ where: { equipmentId: exc.id, date: new Date(`${date}T00:00:00Z`) }, data: dayRowData(s) });
    carry = { meter: s.meterEnd, meterAt: s.meterAt, idle: s.idleEnd, fuelUsed: s.fuelUsedEnd, fuel: s.fuelEnd, fuelAt: s.fuelAt, engineOn: s.lastEngineOn };
  }
}
