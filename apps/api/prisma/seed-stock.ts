/**
 * Stock against the DPR on the town water supply scheme (item 128). Invented names and figures throughout.
 *
 * - Norms on activities: the tanks' concrete (cement, aggregate, sand, admixture per m³) and steel, the zone's pipe
 *   jointing (a coupler a length), and the house connection kit on Tapping and saddle.
 * - Pipe items for every size of zone 2's network; the DI is bought by the tonne with its weight per metre.
 * - A bulk receipt and issues to each component that match the work approved before the DPRs, so the old figures
 *   reconcile; then the DPRs' week: issues to tank 8.2, zone 2 and the house connections.
 * - The planted cases: cement on tank 8.2's ring beam 6% over the mix, HDPE 110 mm cut wastage of 2.1% against
 *   1.5% allowed, four kits short (saddles), DI 200 mm laid above what was issued to the zone, cement issued to tank
 *   8.3 with no work there, and bitumen used on the road with nothing issued.
 *
 * Skipped once the project has any activity norm.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { activityPipeStage } from '@erp/shared';
import { addTownDpr, type DprSeed } from './seed-structure';

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The day before the town DPRs: a ring beam poured (cement over the mix) and road work using bitumen nobody issued. */
const RING_BEAM_DPR: DprSeed = {
  offset: -4,
  approved: true,
  weather: 'SUNNY',
  headCount: [['Mason', 5], ['Helper', 18], ['Operator', 2], ['Supervisor', 2]],
  lines: [
    {
      element: '8.2', activity: 'Bottom ring beam: concrete', qty: 8.8, at: 'Ring beam', crew: [['Mason', 4], ['Helper', 10]], machines: [['Concrete mixer', 5], ['Needle vibrator', 5]],
      material: [['OPC 53 Grade Cement', 74.8], ['Aggregate 20mm', 7.4], ['River Sand (Zone II)', 3.7], ['Admixture PCE (Master Glenium)', 28]],
    },
    { element: '10', activity: 'Bituminous road', qty: 140, at: 'Station Road', crew: [['Helper', 8], ['Operator', 1]], machines: [['Road roller', 5]], material: [['Bitumen VG-30', 0.75], ['Emulsion SS-1', 70]] },
  ],
  nextDayPlan: 'Container wall ring 1 steel; pipe laying on Station Road; tapping in Ward 3',
};

/** [item, unit, per unit of the activity's work, wastage %] */
type NormSeed = [string, string, number, number];
const CONCRETE: NormSeed[] = [['OPC 53 Grade Cement', 'Bags', 8, 2], ['Aggregate 20mm', 'Cum', 0.84, 3], ['River Sand (Zone II)', 'Cum', 0.42, 5], ['Admixture PCE (Master Glenium)', 'Kg', 3.2, 2]];
const STEEL: NormSeed[] = [['TMT Fe500D 12mm', 'MT', 1, 3], ['Binding wire', 'Kg', 11, 5]];
const JOINTING: NormSeed[] = [['HDPE electrofusion coupler 110mm', 'Nos', 0.166667, 2]];
const KIT: NormSeed[] = [['HDPE tapping saddle 110 x 20mm', 'Nos', 1, 0], ['Brass ferrule 15mm', 'Nos', 1, 0], ['MDPE service pipe 20mm', 'Rmt', 6, 2], ['Brass elbow 20mm', 'Nos', 2, 0], ['Ball valve 50mm', 'Nos', 1, 0]];

/** Pipe items per size of zone 2: [diameter, material, name, unit, rate, kg per metre] */
const PIPE_ITEMS: [number, 'HDPE' | 'DI', string, string, string, number | null][] = [
  [90, 'HDPE', 'HDPE PE100 90mm PN6', 'Rmt', '360.00', null],
  [110, 'HDPE', 'HDPE PE100 110mm PN6', 'Rmt', '540.00', null],
  [140, 'HDPE', 'HDPE PE100 140mm PN6', 'Rmt', '820.00', null],
  [160, 'HDPE', 'HDPE PE100 160mm PN6', 'Rmt', '1050.00', null],
  [200, 'DI', 'DI K7 pipe 200mm', 'MT', '72000.00', 33.6],
];

export async function seedTownStock(prisma: PrismaClient, organizationId: string) {
  const project = await prisma.project.findFirst({ where: { organizationId, code: 'WS-2026-04' }, select: { id: true } });
  if (!project || (await prisma.activityMaterialNorm.count({ where: { projectId: project.id } }))) return;
  const projectId = project.id;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  const [pm, keeper] = await Promise.all([user('pm@demo.com'), user('store@demo.com')]);
  if (!pm) return;
  const storeKeeper = keeper ?? pm;

  const item = async (name: string, unit: string, extra: Partial<Prisma.ItemUncheckedCreateInput> = {}) => {
    const found = await prisma.item.findFirst({ where: { organizationId, name, unit } });
    if (found) return Object.keys(extra).length ? prisma.item.update({ where: { id: found.id }, data: extra }) : found;
    return prisma.item.create({ data: { organizationId, name, unit, ...extra } });
  };
  const KIT_RATES: Record<string, string> = { 'HDPE tapping saddle 110 x 20mm': '240.00', 'Brass ferrule 15mm': '180.00', 'MDPE service pipe 20mm': '38.00', 'Brass elbow 20mm': '95.00' };
  const itemId = new Map<string, string>();
  for (const [name, unit] of [...CONCRETE, ...STEEL, ...JOINTING, ...KIT]) itemId.set(name, (await item(name, unit, KIT_RATES[name] ? { rate: D(KIT_RATES[name]) } : {})).id);
  for (const [, , name, unit, rate, kg] of PIPE_ITEMS) itemId.set(name, (await item(name, unit, { rate: D(rate), ...(kg ? { kgPerMetre: D(kg) } : {}) })).id);
  for (const [name, unit] of [['Shuttering plywood 12mm', 'Nos'], ['Bitumen VG-30', 'MT'], ['Emulsion SS-1', 'Ltr']] as const) itemId.set(name, (await item(name, unit)).id);

  const activities = await prisma.activity.findMany({
    where: { projectId },
    select: { id: true, name: true, workElementId: true, pipeStage: true, workElement: { select: { code: true, elementType: true } }, _count: { select: { subActivities: true } } },
  });
  const element = new Map((await prisma.workElement.findMany({ where: { projectId }, select: { id: true, code: true } })).map((e) => [e.code, e.id]));
  const zone2 = element.get('9.2')!;
  const lay = activities.find((a) => a.workElementId === zone2 && activityPipeStage({ pipeStage: a.pipeStage, name: a.name, elementType: a.workElement?.elementType }) === 'LAY_JOINT');
  const tapping = activities.find((a) => a.workElement?.code === '11' && a.name === 'Tapping and saddle');

  // Norms on the activities
  const norms: { activityId: string; norm: NormSeed }[] = [];
  for (const a of activities) {
    if (a._count.subActivities || !a.workElement || !['8.1', '8.2', '8.3'].includes(a.workElement.code)) continue;
    if (a.name.endsWith(': concrete')) for (const n of CONCRETE) norms.push({ activityId: a.id, norm: n });
    if (a.name.endsWith(': reinforcement')) for (const n of STEEL) norms.push({ activityId: a.id, norm: n });
  }
  if (lay) for (const n of JOINTING) norms.push({ activityId: lay.id, norm: n });
  if (tapping) for (const n of KIT) norms.push({ activityId: tapping.id, norm: n });
  for (const { activityId, norm: [name, , qty, wastage] } of norms)
    await prisma.activityMaterialNorm.create({
      data: { organizationId, projectId, activityId, itemId: itemId.get(name)!, qtyPerUnit: D(qty), wastagePct: D(wastage), note: name.includes('Cement') ? 'M25 design mix, 400 kg/m³' : null, updatedById: pm },
    });

  // The DPRs' own use: the ring beam and the road the day before, the jointing cut wastage and the house connection kits
  await addTownDpr(prisma, organizationId, RING_BEAM_DPR);
  const hdpe110 = itemId.get('HDPE PE100 110mm PN6')!;
  if (lay) {
    const lines = await prisma.progressEntry.findMany({ where: { activityId: lay.id, status: 'APPROVED', dailyReportId: { not: null } }, select: { quantity: true, materials: { where: { itemId: hdpe110 }, select: { id: true, quantity: true } } } });
    for (const l of lines) for (const m of l.materials) if (m.quantity.eq(l.quantity)) await prisma.progressMaterial.update({ where: { id: m.id }, data: { quantity: D(r1(Number(l.quantity) * 1.021)) } });
  }
  if (tapping) {
    const lines = await prisma.progressEntry.findMany({ where: { activityId: tapping.id, dailyReportId: { not: null } }, select: { id: true, quantity: true, materials: { select: { itemId: true, sortOrder: true } } } });
    for (const l of lines) {
      const has = new Set(l.materials.map((m) => m.itemId));
      let k = l.materials.length;
      for (const [name, , qty] of KIT)
        if (!has.has(itemId.get(name)!)) await prisma.progressMaterial.create({ data: { organizationId, progressEntryId: l.id, itemId: itemId.get(name)!, quantity: D(r3(Number(l.quantity) * qty)), sortOrder: k++ } });
    }
  }

  // What the work approved before the DPRs needed, by component and item, and pipe laid by size in zone 2
  const before = await prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId, status: 'APPROVED', dailyReportId: null }, _sum: { quantity: true } });
  const doneOf = new Map(before.map((b) => [b.activityId, Number(b._sum.quantity ?? 0)]));
  const elementOf = new Map(activities.map((a) => [a.id, a.workElementId]));
  const history = new Map<string, Map<string, number>>();
  for (const { activityId, norm: [name, , qty, wastage] } of norms) {
    const done = doneOf.get(activityId) ?? 0;
    const el = elementOf.get(activityId);
    if (!done || !el) continue;
    const m = history.get(el) ?? new Map<string, number>();
    history.set(el, m);
    m.set(name, (m.get(name) ?? 0) + done * qty * (1 + wastage / 200));
  }
  const laid = lay
    ? await prisma.progressEntry.findMany({ where: { activityId: lay.id, status: 'APPROVED', dailyReportId: null, pipeSegmentId: { not: null } }, select: { quantity: true, pipeSegment: { select: { diameterMm: true } } } })
    : [];
  const laidBy = new Map<number, number>();
  for (const l of laid) laidBy.set(l.pipeSegment!.diameterMm, (laidBy.get(l.pipeSegment!.diameterMm) ?? 0) + Number(l.quantity));
  const zoneHistory = history.get(zone2) ?? new Map<string, number>();
  history.set(zone2, zoneHistory);
  for (const [dia, , name, , , kg] of PIPE_ITEMS) {
    const m = laidBy.get(dia) ?? 0;
    if (!m) continue;
    // Pipe issued to the zone covers what was laid with a little cut wastage; the DI is 40 m short of what is in the ground
    const metres = dia === 200 ? m - 40 : m * 1.012;
    zoneHistory.set(name, kg ? r3((metres * kg) / 1000) : Math.round(metres));
  }

  // Entries
  const year = new Date().getUTCFullYear();
  const counters: Record<string, number> = {};
  const nextNo = async (prefix: string) => {
    if (counters[prefix] === undefined) {
      const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
      counters[prefix] = last ? parseInt(last.entryNo.slice(prefix.length + 6), 10) : 0;
    }
    counters[prefix] += 1;
    return `${prefix}-${year}-${String(counters[prefix]).padStart(4, '0')}`;
  };
  const entry = async (type: 'RECEIPT' | 'ISSUE', offset: number, data: Partial<Prisma.StockEntryUncheckedCreateInput>, lines: [string, number][]) => {
    const rows = lines.filter(([, q]) => q > 0);
    if (!rows.length) return;
    const e = await prisma.stockEntry.create({
      data: {
        organizationId, projectId, type, entryNo: await nextNo(type === 'RECEIPT' ? 'GRN' : 'ISS'), date: day(offset), createdById: storeKeeper, createdAt: day(offset), ...data,
        lines: { create: rows.map(([name, q], i) => ({ organizationId, projectId, itemId: itemId.get(name)!, type, date: day(offset), quantity: D(type === 'ISSUE' ? -q : q), sortOrder: i })) },
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: storeKeeper, note: e.entryNo, createdAt: day(offset) } });
  };

  const tank2 = element.get('8.2')!;
  const tank3 = element.get('8.3')!;
  const houses = element.get('11')!;
  const RECENT: { offset: number; elementId: string; activityId?: string; to: string; lines: [string, number][] }[] = [
    { offset: -9, elementId: tank3, to: 'Tank gang, Hill Road', lines: [['OPC 53 Grade Cement', 40]] },
    { offset: -6, elementId: tank2, to: 'Tank gang, Ward 11', lines: [['OPC 53 Grade Cement', 80], ['Aggregate 20mm', 7.5], ['River Sand (Zone II)', 4], ['Admixture PCE (Master Glenium)', 30], ['TMT Fe500D 12mm', 2], ['Binding wire', 25], ['Shuttering plywood 12mm', 6]] },
    { offset: -5, elementId: zone2, activityId: lay?.id, to: 'Pipeline gang, zone 2', lines: [['HDPE PE100 110mm PN6', 470], ['HDPE electrofusion coupler 110mm', 70]] },
    { offset: -5, elementId: houses, activityId: tapping?.id, to: 'Plumbing gang, Ward 3', lines: [['HDPE tapping saddle 110 x 20mm', 10], ['Brass ferrule 15mm', 14], ['MDPE service pipe 20mm', 86], ['Brass elbow 20mm', 28], ['Ball valve 50mm', 14]] },
  ];

  // One bulk receipt for everything issued, with some left in the store
  const received = new Map<string, number>();
  const add = (name: string, q: number) => received.set(name, (received.get(name) ?? 0) + q);
  for (const m of history.values()) for (const [name, q] of m) add(name, q);
  for (const r of RECENT) for (const [name, q] of r.lines) add(name, q);
  await entry('RECEIPT', -50, { supplier: 'Narmada Pipes and Building Materials', challanNo: 'NPB/2391', vehicleNo: 'OD-05-BK-2207', qcStatus: 'ACCEPTED' }, [...received].map(([name, q]) => [name, name.includes('PN6') ? Math.ceil((q * 1.08) / 6) * 6 : r3(q * 1.08)]));
  for (const [el, m] of history) await entry('ISSUE', -45, { workElementId: el, issuedTo: el === zone2 ? 'Pipeline gang, zone 2' : 'Site gangs', remarks: 'Material for the work to date' }, [...m].map(([name, q]) => [name, r3(q)]));
  for (const r of RECENT) await entry('ISSUE', r.offset, { workElementId: r.elementId, activityId: r.activityId ?? null, issuedTo: r.to }, r.lines);

  // Issues the general stock seed tied to an activity before the breakdown existed go to the pipeline work they are for
  if (lay) await prisma.stockEntry.updateMany({ where: { projectId, type: 'ISSUE', workElementId: null, activityId: { not: null } }, data: { activityId: lay.id, workElementId: zone2 } });
}
