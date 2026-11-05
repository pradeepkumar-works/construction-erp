/**
 * Demo item codes and standards (item 176) and pump readings on fuel slips (item 178). An item takes its code only when
 * it has none and no other item holds it; a site's slips take readings only when none of them has any, chained from the
 * first slip at 10,000 litres, so a rerun changes nothing.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const CODES: [name: string, unit: string, code: string, standard: string | null][] = [
  ['OPC 53 Grade Cement', 'Bags', 'CEM-OPC53', 'IS 269'],
  ['TMT Fe500D 12mm', 'MT', 'STL-TMT-12', 'IS 1786 Fe 500D'],
  ['TMT Fe500D 16mm', 'MT', 'STL-TMT-16', 'IS 1786 Fe 500D'],
  ['River Sand (Zone II)', 'Cum', 'AGG-SAND-Z2', 'IS 383 Zone II'],
  ['Aggregate 20mm', 'Cum', 'AGG-20', 'IS 383'],
  ['Aggregate 10mm', 'Cum', 'AGG-10', 'IS 383'],
  ['DI K7 pipe 200mm', 'MT', 'PIPE-DI-K7-200', 'IS 8329 K7'],
  ['DI K7 pipe 250mm', 'MT', 'PIPE-DI-K7-250', 'IS 8329 K7'],
  ['DI K7 pipe 300mm', 'MT', 'PIPE-DI-K7-300', 'IS 8329 K7'],
  ['DI K9 pipe 400mm', 'Rmt', 'PIPE-DI-K9-400', 'IS 8329 K9'],
  ['HDPE PE100 110mm PN6', 'Rmt', 'PIPE-HDPE-110', 'IS 4984 PE100 PN6'],
  ['Fly ash bricks 230mm', 'Nos', 'BRK-FLY-230', 'IS 12894'],
  ['Diesel', 'Ltr', 'FUEL-HSD', 'IS 1460'],
  ['Bitumen VG-30', 'MT', 'BIT-VG30', 'IS 73 VG-30'],
];

export async function seedItemCodes(prisma: PrismaClient, organizationId: string) {
  for (const [name, unit, code, standard] of CODES) {
    const item = await prisma.item.findFirst({ where: { organizationId, name, unit, code: null }, select: { id: true } });
    if (!item || (await prisma.item.count({ where: { organizationId, code } }))) continue;
    await prisma.item.update({ where: { id: item.id }, data: { code, standard } });
  }

  const slips = await prisma.stockEntry.findMany({
    where: { organizationId, type: 'ISSUE', equipmentId: { not: null }, lines: { some: { item: { isFuel: true } } } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, projectId: true, pumpEnd: true, lines: { select: { quantity: true } } },
  });
  const bySite = new Map<string, typeof slips>();
  for (const s of slips) bySite.set(s.projectId, [...(bySite.get(s.projectId) ?? []), s]);
  for (const site of bySite.values()) {
    if (site.some((s) => s.pumpEnd !== null)) continue;
    let reading = new Prisma.Decimal(10000);
    for (const s of site) {
      const litres = s.lines.reduce((sum, t) => sum.add(t.quantity.abs()), new Prisma.Decimal(0));
      const end = reading.add(litres);
      await prisma.stockEntry.update({ where: { id: s.id }, data: { pumpStart: reading, pumpEnd: end } });
      reading = end;
    }
  }
}
