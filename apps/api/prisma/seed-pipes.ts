/**
 * Demo pipe network (item 126, ARCHITECTURE "Pipe network"). All names, codes and figures are invented.
 *
 * Zone 2 of the town water supply scheme (WS-2026-04, component 9.2) gets a branched HDPE network fed from its
 * overhead tank: a spine of twenty junctions with six branches, a sluice valve at the head of each branch and a scour
 * at the tail, 10.1 km in all. The zone's approved progress is laid out pipe by pipe from the tank outwards (each stage a
 * little behind the one before), the pipe lines on the DPRs move onto the pipes just past each stage's front, and a
 * passed hydraulic test covers the first pipes. Runs once: a zone that already has pipes is left alone.
 */
import { Prisma, PrismaClient, type PipeMaterial, type PipeNodeKind } from '@prisma/client';
import { VALVE_NODE_KINDS, activityPipeStage, isLengthUnit, lineLocation, segmentLabel, workSummary, type PipeStage } from '@erp/shared';

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

interface NodeSeed {
  code: string;
  kind: PipeNodeKind;
  x: number;
  y: number;
}
interface PipeSeed {
  code: string;
  from: string;
  to: string;
  diameterMm: number;
  material: PipeMaterial;
  pipeClass: string;
  surface: string;
  lengthM?: number;
}

/** The zone as the design office's model would give it: nodes placed on a town grid, pipes junction to junction. */
function townZone(total: number): { nodes: NodeSeed[]; pipes: PipeSeed[] } {
  const nodes: NodeSeed[] = [{ code: 'OHT-2', kind: 'TANK', x: 0, y: 0 }];
  const pipes: PipeSeed[] = [];
  const spineSize = (n: number): Pick<PipeSeed, 'diameterMm' | 'material' | 'pipeClass'> =>
    n <= 3 ? { diameterMm: 200, material: 'DI', pipeClass: 'K7' } : n <= 10 ? { diameterMm: 160, material: 'HDPE', pipeClass: 'PN 6' } : { diameterMm: 140, material: 'HDPE', pipeClass: 'PN 6' };
  // The spine runs east along Station Road and the market, bending with the streets.
  for (let n = 1; n <= 20; n++) {
    nodes.push({ code: `J-${n}`, kind: 'JUNCTION', x: n * 230, y: Math.round(140 * Math.sin(n / 3.2)) });
    pipes.push({ code: `P-${n}`, from: n === 1 ? 'OHT-2' : `J-${n - 1}`, to: `J-${n}`, ...spineSize(n), surface: n <= 8 ? 'Bitumen road' : n <= 14 ? 'CC road' : 'Earthen' });
  }
  nodes.push({ code: 'SC-1', kind: 'SCOUR', x: 21 * 230 - 120, y: Math.round(140 * Math.sin(20 / 3.2)) + 40 });
  pipes.push({ code: 'P-21', from: 'J-20', to: 'SC-1', diameterMm: 110, material: 'HDPE', pipeClass: 'PN 6', surface: 'Earthen', lengthM: 18 });
  // Six branches into the wards, north and south in turn, each behind a sluice valve.
  let j = 21;
  let p = 22;
  [3, 6, 9, 12, 15, 18].forEach((at, b) => {
    const base = nodes.find((x) => x.code === `J-${at}`)!;
    const dir = b % 2 ? 1 : -1;
    const valve = `SV-${b + 1}`;
    nodes.push({ code: valve, kind: 'SLUICE_VALVE', x: base.x + 20, y: base.y + dir * 60 });
    pipes.push({ code: `P-${p++}`, from: base.code, to: valve, diameterMm: 110, material: 'HDPE', pipeClass: 'PN 6', surface: 'CC road', lengthM: 8 });
    let prev = valve;
    const steps = b < 2 ? 5 : 4;
    for (let k = 1; k <= steps; k++) {
      const code = `J-${j++}`;
      nodes.push({ code, kind: k === steps && b === 4 ? 'AIR_VALVE' : 'JUNCTION', x: base.x + 20 + (k % 2) * 60, y: base.y + dir * (60 + k * 200) });
      pipes.push({ code: `P-${p++}`, from: prev, to: code, diameterMm: k <= 2 ? 110 : 90, material: 'HDPE', pipeClass: 'PN 6', surface: k <= 2 ? 'CC road' : 'Earthen' });
      prev = code;
    }
  });
  // Lengths follow the drawing (with a little for the streets' bends) and add up to the zone's scope.
  const at = new Map(nodes.map((n) => [n.code, n]));
  const drawn = (x: PipeSeed) => Math.hypot(at.get(x.from)!.x - at.get(x.to)!.x, at.get(x.from)!.y - at.get(x.to)!.y) * 1.08;
  const fixed = pipes.filter((x) => x.lengthM).reduce((s, x) => s + x.lengthM!, 0);
  const free = pipes.filter((x) => !x.lengthM);
  const scale = (total - fixed) / free.reduce((s, x) => s + drawn(x), 0);
  for (const x of free) x.lengthM = round1(drawn(x) * scale);
  const last = free[free.length - 1];
  last.lengthM = round1(last.lengthM! + total - pipes.reduce((s, x) => s + x.lengthM!, 0));
  return { nodes, pipes };
}

/** How far along each length stage the zone is, as a share of its pipes from the tank outwards. */
const STAGE_FRONT: Partial<Record<PipeStage, number>> = { TRENCH: 0.7, BEDDING: 0.68, LAY_JOINT: 0.62, BACKFILL: 0.5, TEST: 0.34, RESTORATION: 0.26, COMMISSIONING: 0 };

export async function seedTownNetwork(prisma: PrismaClient, organizationId: string) {
  const project = await prisma.project.findFirst({ where: { organizationId, code: 'WS-2026-04' }, select: { id: true } });
  if (!project) return;
  const zone = await prisma.workElement.findFirst({ where: { projectId: project.id, code: '9.2', elementType: 'PIPE_ZONE' }, select: { id: true, name: true, specs: true } });
  if (!zone || (await prisma.pipeSegment.count({ where: { zoneId: zone.id } }))) return;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  const [pm, engineer, qa] = await Promise.all([user('pm@demo.com'), user('engineer2@demo.com'), user('qaqc@demo.com')]);
  if (!pm || !engineer) return;

  // Stage activities of every pipe zone and main get their stage, so the DPR and the tab need no guessing.
  const pipeActivities = await prisma.activity.findMany({
    where: { projectId: project.id, workElement: { elementType: { in: ['PIPE_ZONE', 'RISING_MAIN', 'FEEDER_MAIN'] } } },
    select: { id: true, name: true, unit: true, workElementId: true, workElement: { select: { elementType: true } } },
  });
  for (const a of pipeActivities) {
    const stage = activityPipeStage({ name: a.name, elementType: a.workElement?.elementType });
    if (stage) await prisma.activity.update({ where: { id: a.id }, data: { pipeStage: stage } });
  }
  const stageOf = new Map<PipeStage, string>();
  for (const a of pipeActivities) {
    const stage = activityPipeStage({ name: a.name, elementType: a.workElement?.elementType });
    if (a.workElementId === zone.id && stage && !stageOf.has(stage)) stageOf.set(stage, a.id);
  }
  const unitOf = new Map(pipeActivities.map((a) => [a.id, a.unit]));

  const scope = Number((zone.specs as { lengthM?: number } | null)?.lengthM ?? 10100);
  const net = townZone(scope);
  const nodeId = new Map<string, string>();
  for (const n of net.nodes) {
    const row = await prisma.pipeNode.create({ data: { organizationId, projectId: project.id, zoneId: zone.id, code: n.code, kind: n.kind, x: n.x, y: n.y, groundLevel: D((112 - n.x / 900 + n.y / 400).toFixed(2)) } });
    nodeId.set(n.code, row.id);
  }
  const segs: { id: string; code: string; from: string; to: string; lengthM: number; diameterMm: number }[] = [];
  for (const [i, x] of net.pipes.entries()) {
    const row = await prisma.pipeSegment.create({
      data: {
        organizationId, projectId: project.id, zoneId: zone.id, code: x.code, fromNodeId: nodeId.get(x.from)!, toNodeId: nodeId.get(x.to)!, lengthM: D(x.lengthM!),
        diameterMm: x.diameterMm, material: x.material, pipeClass: x.pipeClass, scope: 'PROPOSED', surface: x.surface, sortOrder: i,
      },
    });
    segs.push({ id: row.id, code: x.code, from: x.from, to: x.to, lengthM: x.lengthM!, diameterMm: x.diameterMm });
  }

  // The order the pipes go in: out from the tank, each pipe after the one that reaches it.
  const order: typeof segs = [];
  const reached = new Set(['OHT-2']);
  while (order.length < segs.length) {
    const next = segs.find((s) => !order.includes(s) && (reached.has(s.from) || reached.has(s.to)));
    if (!next) break;
    order.push(next);
    reached.add(next.from);
    reached.add(next.to);
  }
  const label = (s: (typeof segs)[number]) => segmentLabel({ code: s.code, fromCode: s.from, toCode: s.to });

  // The zone's approved progress, laid out again pipe by pipe: whole pipes up to each stage's front, the oldest nearest the tank.
  await prisma.progressEntry.deleteMany({ where: { projectId: project.id, activityId: { in: [...stageOf.values()] }, dailyReportId: null, status: 'APPROVED' } });
  const filled = new Map<string, number>();
  const entries: Prisma.ProgressEntryCreateManyInput[] = [];
  const zoneName = zone.name.split(',')[0];
  for (const [stage, share] of Object.entries(STAGE_FRONT) as [PipeStage, number][]) {
    const activityId = stageOf.get(stage);
    if (!activityId || !share || !isLengthUnit(unitOf.get(activityId) ?? '')) continue;
    const count = Math.round(order.length * share);
    order.slice(0, count).forEach((s, i) => {
      const date = day(-140 + Math.round(((i + 1) * 130) / count) + Math.round((1 - share) * 6));
      filled.set(`${s.id}|${stage}`, s.lengthM);
      entries.push({
        organizationId, projectId: project.id, activityId, pipeSegmentId: s.id, date: date > day(-4) ? day(-4) : date, quantity: D(s.lengthM), status: 'APPROVED', submittedById: engineer,
        submittedAt: date, reviewedById: pm, reviewedAt: date, reviewNote: 'Checked at site', location: zoneName, village: zoneName, remarks: `${label(s)}`, manpowerCount: 8,
      });
    });
  }
  // Valves and the scour fixed where the pipe on both sides is laid.
  const valvesId = stageOf.get('VALVES');
  const laid = new Set(order.slice(0, Math.round(order.length * STAGE_FRONT.LAY_JOINT!)).flatMap((s) => [s.from, s.to]));
  const valveNodes = net.nodes.filter((n) => VALVE_NODE_KINDS.includes(n.kind));
  if (valvesId) {
    await prisma.progressEntry.deleteMany({ where: { projectId: project.id, activityId: valvesId, dailyReportId: null, status: 'APPROVED' } });
    for (const [i, n] of valveNodes.filter((v) => laid.has(v.code)).entries()) {
      const date = day(-120 + i * 12);
      entries.push({
        organizationId, projectId: project.id, activityId: valvesId, pipeNodeId: nodeId.get(n.code), date, quantity: D(1), status: 'APPROVED', submittedById: engineer, submittedAt: date,
        reviewedById: pm, reviewedAt: date, reviewNote: 'Checked at site', location: zoneName, remarks: n.code, manpowerCount: 4,
      });
    }
  }
  await prisma.progressEntry.createMany({ data: entries });

  // The zone's length stages are planned at the network's length, its valve stage at its valves.
  const lengthStages = [...stageOf].filter(([stage, id]) => stage !== 'VALVES' && isLengthUnit(unitOf.get(id) ?? '')).map(([, id]) => id);
  await prisma.activity.updateMany({ where: { id: { in: lengthStages } }, data: { plannedQty: D(scope) } });
  if (valvesId) await prisma.activity.update({ where: { id: valvesId }, data: { plannedQty: D(valveNodes.length) } });

  // The DPRs' pipe lines move onto the pipes just past each stage's front, in date order.
  const lines = await prisma.progressEntry.findMany({
    where: { projectId: project.id, dailyReportId: { not: null }, activityId: { in: [...stageOf.values()] } },
    orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, activityId: true, quantity: true, location: true, dailyReportId: true },
  });
  for (const l of lines) {
    const stage = [...stageOf].find(([, id]) => id === l.activityId)?.[0];
    if (!stage || stage === 'VALVES' || !isLengthUnit(unitOf.get(l.activityId) ?? '')) continue;
    const open = order.filter((x) => !filled.has(`${x.id}|${stage}`));
    const s = open.find((x) => x.lengthM >= Number(l.quantity)) ?? open.reduce<(typeof open)[number] | undefined>((a, x) => (!a || x.lengthM > a.lengthM ? x : a), undefined);
    if (!s) continue;
    const qty = Math.min(Number(l.quantity), s.lengthM);
    filled.set(`${s.id}|${stage}`, qty);
    // Keep the street, drop the old junction numbers: the pipe says where now.
    const street = (l.location ?? '').split(',')[0].trim();
    await prisma.progressEntry.update({ where: { id: l.id }, data: { pipeSegmentId: s.id, quantity: D(qty), location: street && !/^[PJ]-\d/.test(street) ? street : null } });
  }
  // Their reports' summaries name the pipes.
  for (const dprId of new Set(lines.map((l) => l.dailyReportId!))) {
    const rows = await prisma.progressEntry.findMany({
      where: { dailyReportId: dprId },
      orderBy: { sortOrder: 'asc' },
      select: { quantity: true, location: true, chainageFrom: true, chainageTo: true, floor: true, village: true, activity: { select: { name: true, unit: true, parentActivity: { select: { name: true } } } }, pipeSegment: { select: { code: true, fromNode: { select: { code: true } }, toNode: { select: { code: true } } } } },
    });
    const summary = workSummary(
      rows.map((r) => ({
        activityName: r.activity.name,
        parentActivityName: r.activity.parentActivity?.name ?? null,
        quantity: r.quantity.toString(),
        unit: r.activity.unit,
        location: lineLocation({ ...r, chainageFrom: r.chainageFrom === null ? null : Number(r.chainageFrom), chainageTo: r.chainageTo === null ? null : Number(r.chainageTo), segmentLabel: r.pipeSegment ? segmentLabel({ code: r.pipeSegment.code, fromCode: r.pipeSegment.fromNode.code, toCode: r.pipeSegment.toNode.code }) : null }),
      })),
    );
    await prisma.dailyReport.update({ where: { id: dprId }, data: { workExecuted: summary } });
  }

  // The first pipes from the tank passed their hydraulic test.
  const tested = order.slice(0, Math.min(6, Math.round(order.length * STAGE_FRONT.TEST!)));
  if (qa && tested.length) {
    const year = new Date().getUTCFullYear();
    const last = await prisma.qualityTest.findFirst({ where: { organizationId, testNo: { startsWith: `TST-${year}-` } }, orderBy: { testNo: 'desc' }, select: { testNo: true } });
    const testNo = `TST-${year}-${String((last ? parseInt(last.testNo.slice(9), 10) : 0) + 1).padStart(4, '0')}`;
    const testActivity = stageOf.get('TEST') ?? null;
    const row = await prisma.qualityTest.create({
      data: {
        organizationId, projectId: project.id, activityId: testActivity, testNo, kind: 'HYDRAULIC', title: `Hydraulic test, ${tested[0].code} to ${tested[tested.length - 1].code}`,
        location: `${zoneName}, from the tank`, sampledOn: day(-60), specification: 'Held at 1.5 times the working pressure for 2 hours with no drop (IS 4127)', unit: 'kg/cm²', specMin: D(9),
        result: 'PASS', createdById: qa, createdAt: day(-60),
        readings: { create: [{ label: 'Pressure held', dueOn: day(-60), value: D(9), testedOn: day(-60), sortOrder: 0 }] },
        pipeSegments: { create: tested.map((s) => ({ organizationId, segmentId: s.id })) },
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'QUALITY_TEST', entityId: row.id, action: 'CREATED', actorId: qa, createdAt: day(-60) } });
  }
}
