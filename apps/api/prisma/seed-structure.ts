/**
 * Demo work breakdown (item 125, ARCHITECTURE "Work breakdown"). All names and figures are invented.
 *
 * - WS-2026-04, a lump-sum town water supply scheme in month 9 of 18: twelve components by their billing share
 *   (intake, pumping, mains, the treatment plant and its units, three overhead tanks, three distribution zones,
 *   restoration, house connections, the HT feeder), each with its template's activities, RCC split into
 *   reinforcement, shuttering and concrete, planned dates and approved progress.
 * - BL-2026-02, the item-rate hospital block: its BOQ grouped in sections and its activities in three components
 *   weighed by BOQ value (no weights given).
 */
import { Prisma, PrismaClient, type WorkElementType } from '@prisma/client';
import { elementPlan, type ElementActivityLine } from '@erp/shared';

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

interface ElementSeed {
  code: string;
  name: string;
  type: WorkElementType;
  weight: number | null;
  specs?: Record<string, number>;
  /** Planned window, days from today */
  start?: number;
  end?: number;
  /** How far along it is, 0 to 1 */
  done?: number;
  /** RCC concrete per activity (m³) and the size of other work, for planned quantities the specs do not give */
  scale?: number;
  subs?: ElementSeed[];
}

const TOWN: ElementSeed[] = [
  { code: '1', name: 'Intake well with approach bridge', type: 'INTAKE_WELL', weight: 7, specs: { diameterM: 6, depthM: 14, liftM: 2.5 }, start: -250, end: 60, done: 0.82, scale: 40 },
  { code: '2', name: 'Raw water pumping machinery', type: 'EM_PACKAGE', weight: 1, start: -120, end: 150, done: 0.35 },
  { code: '3', name: 'Raw water rising main, DI 250 mm', type: 'RISING_MAIN', weight: 1.4, specs: { lengthM: 1850, diameterMm: 250 }, start: -200, end: -40, done: 0.92 },
  {
    code: '4', name: 'Water treatment plant, 3.8 MLD', type: 'WTP', weight: 14.5, specs: { capacityMld: 3.8 },
    subs: [
      { code: '4.1', name: 'Cascade aerator and flash mixer', type: 'WTP_UNIT', weight: 10, specs: { wallHeightM: 3, liftM: 1.5 }, start: -220, end: -30, done: 0.74, scale: 30 },
      { code: '4.2', name: 'Clariflocculator, 19 m dia', type: 'WTP_UNIT', weight: 35, specs: { wallHeightM: 4.5, liftM: 1.5 }, start: -210, end: 60, done: 0.55, scale: 90 },
      { code: '4.3', name: 'Rapid gravity filters, 4 beds', type: 'WTP_UNIT', weight: 30, specs: { wallHeightM: 4.5, liftM: 1.5 }, start: -180, end: 90, done: 0.4, scale: 70 },
      { code: '4.4', name: 'Clear water sump, 600 KL', type: 'SUMP', weight: 15, specs: { capacityKl: 600, wallHeightM: 4.5, liftM: 1.5 }, start: -160, end: 40, done: 0.6, scale: 60 },
      { code: '4.5', name: 'Chlorination and laboratory building', type: 'PUMP_HOUSE', weight: 10, start: -90, end: 120, done: 0.28, scale: 25 },
    ],
  },
  { code: '5', name: 'Clear water pumping machinery', type: 'EM_PACKAGE', weight: 3.8, start: -60, end: 200, done: 0.15 },
  { code: '6', name: 'Clear water rising main, DI 300 mm', type: 'RISING_MAIN', weight: 5.1, specs: { lengthM: 4200, diameterMm: 300 }, start: -180, end: 30, done: 0.62 },
  { code: '7', name: 'Feeder mains to the tanks', type: 'FEEDER_MAIN', weight: 5.6, specs: { lengthM: 7600, diameterMm: 200 }, start: -150, end: 90, done: 0.45 },
  {
    code: '8', name: 'Overhead tanks', type: 'GENERAL', weight: 15.8,
    subs: [
      { code: '8.1', name: 'OHT 650 KL, Ward 4', type: 'OHT', weight: 45, specs: { capacityKl: 650, stagingM: 16, liftM: 3 }, start: -230, end: 80, done: 0.6, scale: 30 },
      { code: '8.2', name: 'OHT 400 KL, Ward 11', type: 'OHT', weight: 30, specs: { capacityKl: 400, stagingM: 16, liftM: 3 }, start: -190, end: 110, done: 0.42, scale: 22 },
      { code: '8.3', name: 'OHT 250 KL, Hill Road', type: 'OHT', weight: 25, specs: { capacityKl: 250, stagingM: 16, liftM: 3 }, start: -120, end: 150, done: 0.24, scale: 16 },
    ],
  },
  {
    code: '9', name: 'Distribution network, HDPE', type: 'GENERAL', weight: 26.5,
    subs: [
      { code: '9.1', name: 'Zone 1, old town', type: 'PIPE_ZONE', weight: 33, specs: { lengthM: 9200, diameterMm: 110 }, start: -200, end: 0, done: 0.72 },
      { code: '9.2', name: 'Zone 2, market and station area', type: 'PIPE_ZONE', weight: 36, specs: { lengthM: 10100, diameterMm: 110 }, start: -140, end: 90, done: 0.46 },
      { code: '9.3', name: 'Zone 3, new colonies', type: 'PIPE_ZONE', weight: 31, specs: { lengthM: 8200, diameterMm: 90 }, start: -60, end: 200, done: 0.18 },
    ],
  },
  { code: '10', name: 'Road restoration', type: 'ROAD_RESTORATION', weight: 9.8, specs: { areaSqm: 24000 }, start: -150, end: 240, done: 0.16, scale: 8000 },
  { code: '11', name: 'House service connections', type: 'HOUSE_CONNECTIONS', weight: 6, specs: { connections: 1450 }, start: -30, end: 250, done: 0.06 },
  { code: '12', name: 'HT feeder line to the intake and the plant', type: 'HT_FEEDER', weight: 3.5, specs: { lengthM: 5200 }, start: -100, end: 120, done: 0.3, scale: 6 },
];

/** A planned quantity for a line the specs leave open: RCC parts from the concrete, the rest from the element's size. */
function plannedFor(line: ElementActivityLine, lines: ElementActivityLine[], scale: number): number {
  if (line.qty !== null) return line.qty;
  // An RCC part's concrete is its activity's.
  const own = line.parentKey ? (lines.find((l) => l.key === line.parentKey) ?? line) : line;
  const concrete = Math.max(4, Math.round(scale * (own.weightPct / 10)));
  if (line.parentKey) {
    if (line.unit === 'MT') return Math.round(concrete * 0.11 * 10) / 10;
    if (line.unit === 'Sqm') return concrete * 6;
    return concrete;
  }
  switch (line.unit) {
    case 'Cum':
      return concrete;
    case 'Sqm':
      return scale > 1000 ? Math.round(scale * (line.weightPct / 100)) : concrete * 8;
    case 'Nos':
      return Math.max(2, Math.round(scale / 4));
    case 'Rmt':
      return Math.max(20, Math.round(scale * 4));
    default:
      return 1;
  }
}

/** How far a line has got when the element is `done` along: lines go in order, each over its share of the weight. */
function fractionDone(lines: ElementActivityLine[], line: ElementActivityLine, done: number): number {
  const top = lines.filter((l) => !l.parentKey);
  const own = line.parentKey ? top.find((t) => t.key === line.parentKey)! : line;
  let before = 0;
  for (const t of top) {
    if (t.key === own.key) break;
    before += t.weightPct;
  }
  const base = Math.min(1, Math.max(0, (done * 100 - before) / own.weightPct));
  if (!line.parentKey || base === 0 || base === 1) return base;
  // Steel goes ahead of the shuttering, and the concrete comes last.
  const lag = line.name.endsWith('reinforcement') ? 0.15 : line.name.endsWith('concrete') ? -0.2 : 0;
  return Math.min(1, Math.max(0, base + lag));
}

export async function seedWorkBreakdown(prisma: PrismaClient, organizationId: string) {
  if (await prisma.project.count({ where: { organizationId, code: 'WS-2026-04' } })) return;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  const [pm, engineer, engineer2, tl, store, qs] = await Promise.all(['pm@demo.com', 'engineer@demo.com', 'engineer2@demo.com', 'tl@demo.com', 'store@demo.com', 'qs@demo.com'].map(user));
  if (!pm || !engineer || !engineer2 || !tl || !store || !qs) return;

  const value = 384_000_000;
  const project = await prisma.project.create({
    data: {
      organizationId, code: 'WS-2026-04', name: 'Devgarh Town Water Supply Scheme, 3.8 MLD', type: 'WATER_SUPPLY', status: 'ACTIVE', contractModel: 'LUMP_SUM',
      clientName: 'State Urban Water Mission', consultantName: 'Hydroplan Consultants', location: 'Devgarh', workOrderNo: 'WO/SUWM/2025/0311',
      startDate: day(-270), endDate: day(270), contractValue: D(value), projectManagerId: pm, villages: ['Zone 1', 'Zone 2', 'Zone 3'],
      description: 'Turnkey scheme: river intake, 3.8 MLD treatment plant, three overhead tanks, 27.5 km of HDPE distribution and 1,450 house connections, paid by stages against the price breakup',
      members: { create: [engineer, engineer2, tl, store, qs].map((userId) => ({ userId })) },
    },
  });

  let actSort = 0;
  let boqSort = 0;
  const entries: Prisma.ProgressEntryCreateManyInput[] = [];
  const create = async (e: ElementSeed, parentId: string | null, parentWeightShare: number) => {
    const element = await prisma.workElement.create({
      data: {
        organizationId, projectId: project.id, parentId, level: parentId ? 'SUB_COMPONENT' : 'COMPONENT', code: e.code, name: e.name, elementType: e.type,
        specs: e.specs ?? Prisma.DbNull, weightPct: e.weight === null ? null : D(e.weight), sortOrder: Number(e.code.split('.').pop()),
      },
    });
    // The price breakup: one lump-sum line per component, its share of the contract (sub-components share their component's).
    const share = parentId ? parentWeightShare * ((e.weight ?? 0) / 100) : (e.weight ?? 0) / 100;
    if (!e.subs) {
      await prisma.boqItem.create({
        data: { organizationId, projectId: project.id, itemNo: `PB-${e.code}`, description: e.name, unit: 'LS', rate: D((value * share).toFixed(2)), originalQty: D(1), section: 'Price breakup', workElementId: element.id, sortOrder: boqSort++ },
      });
    }
    for (const s of e.subs ?? []) await create(s, element.id, share);
    if (e.subs || e.start === undefined || e.end === undefined) return;

    const lines = elementPlan(e.type, e.specs);
    const top = lines.filter((l) => !l.parentKey);
    const span = e.end - e.start;
    const idOf = new Map<string, string>();
    let at = 0;
    const windowOf = new Map<string, [number, number]>();
    for (const t of top) {
      const from = e.start + Math.round((at / 100) * span * 0.85);
      const to = Math.max(from + 7, e.start + Math.round(((at + t.weightPct) / 100) * span));
      windowOf.set(t.key, [from, to]);
      at += t.weightPct;
    }
    for (const line of [...top, ...lines.filter((l) => l.parentKey)]) {
      const [from, to] = windowOf.get(line.parentKey ?? line.key)!;
      const planned = plannedFor(line, lines, e.scale ?? 20);
      const hasParts = !line.parentKey && lines.some((l) => l.parentKey === line.key);
      const row = await prisma.activity.create({
        data: {
          organizationId, projectId: project.id, workElementId: element.id, parentActivityId: line.parentKey ? idOf.get(line.parentKey)! : null, name: line.name, unit: line.unit,
          plannedQty: D(planned), weightPct: D(line.weightPct), plannedStart: day(from), plannedEnd: day(to), responsibleId: e.code.startsWith('9') || e.code.startsWith('11') ? engineer2 : engineer,
          sortOrder: actSort++,
        },
      });
      idOf.set(line.key, row.id);
      if (hasParts) continue;
      const frac = fractionDone(lines, line, e.done ?? 0);
      const qty = line.unit === 'LS' ? (frac >= 1 ? 1 : 0) : Math.round(planned * frac * 1000) / 1000;
      if (qty <= 0) continue;
      // Approved in one to three goes inside its window, none in the future.
      const parts = qty >= 3 && line.unit !== 'LS' ? Math.min(3, Math.ceil(frac * 3)) : 1;
      let left = qty;
      for (let i = 0; i < parts; i++) {
        const q = i === parts - 1 ? left : Math.round((qty / parts) * 1000) / 1000;
        left = Math.round((left - q) * 1000) / 1000;
        const date = day(Math.min(-1, from + Math.round(((i + 1) * (to - from)) / (parts + 1))));
        entries.push({
          organizationId, projectId: project.id, activityId: row.id, date, quantity: D(q), status: 'APPROVED', submittedById: engineer, submittedAt: date, reviewedById: pm, reviewedAt: date,
          reviewNote: 'Checked at site', remarks: `${e.name}: ${line.name}`, location: e.code.startsWith('9') ? e.name.split(',')[0] : null, village: e.code.startsWith('9') ? e.name.split(',')[0] : null, manpowerCount: 8 + i * 2,
        });
      }
    }
  };
  for (const e of TOWN) await create(e, null, 1);
  await prisma.progressEntry.createMany({ data: entries });

  // Today's work waiting for approval: the 650 KL tank's container wall.
  const waiting = await prisma.activity.findFirst({ where: { projectId: project.id, name: 'Container wall: shuttering', workElement: { code: '8.1' } } });
  if (waiting) {
    await prisma.progressEntry.create({
      data: { organizationId, projectId: project.id, activityId: waiting.id, date: day(0), quantity: D(60), status: 'SUBMITTED', submittedById: engineer, submittedAt: new Date(), remarks: 'Container wall shuttering, second ring fixed', manpowerCount: 14 },
    });
  }

  await seedHospitalSections(prisma, organizationId);
}

/** The hospital block (item rate): BOQ sections, and three components weighed by the BOQ value under them. */
async function seedHospitalSections(prisma: PrismaClient, organizationId: string) {
  const hospital = await prisma.project.findFirst({ where: { organizationId, code: 'BL-2026-02' }, select: { id: true } });
  if (!hospital || (await prisma.workElement.count({ where: { projectId: hospital.id } }))) return;
  const groups: { code: string; name: string; type: WorkElementType; section: string; items: string[] }[] = [
    { code: '1', name: 'Substructure', type: 'GENERAL', section: 'Substructure', items: ['1.01', '2.01', '3.01'] },
    { code: '2', name: 'Frame and slabs', type: 'BLOCK', section: 'RCC frame', items: ['3.02', '3.03'] },
    { code: '3', name: 'Masonry and finishes', type: 'GENERAL', section: 'Masonry and finishes', items: ['4.01', '5.01', '6.01'] },
  ];
  for (const [i, g] of groups.entries()) {
    const element = await prisma.workElement.create({ data: { organizationId, projectId: hospital.id, level: 'COMPONENT', code: g.code, name: g.name, elementType: g.type, sortOrder: i } });
    const items = await prisma.boqItem.findMany({ where: { projectId: hospital.id, itemNo: { in: g.items } }, select: { id: true } });
    await prisma.boqItem.updateMany({ where: { id: { in: items.map((b) => b.id) } }, data: { section: g.section, workElementId: element.id } });
    await prisma.activity.updateMany({ where: { projectId: hospital.id, boqItemId: { in: items.map((b) => b.id) } }, data: { workElementId: element.id } });
  }
}
