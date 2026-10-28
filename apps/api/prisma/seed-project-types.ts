/**
 * Demo project types (item 134, ARCHITECTURE "Project types"). All names and figures are invented.
 *
 * The standard types and component kinds are data in packages/shared and need no rows. The demo company adds one type
 * of its own, Bridge (built on road, located by chainage), from two kinds of its own: a pier whose shaft is cast in
 * lifts over its height, and a deck of girders and slab. A new project of the type offers two approaches, four piers
 * and the deck, and starts with five loose activities. Safe to run again: the rows are replaced by code.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { STANDARD_COMPONENT_KINDS, componentKindProblems, projectTypeProblems, type ComponentKindDef, type ProjectTypeDef } from '@erp/shared';

const json = (v: unknown) => v as Prisma.InputJsonValue;

export const DEMO_KINDS: ComponentKindDef[] = [
  {
    code: 'BRIDGE_PIER',
    name: 'Bridge pier',
    elementType: 'GENERAL',
    specFields: [
      { key: 'piles', label: 'Piles', unit: 'Nos', default: 6 },
      { key: 'heightM', label: 'Pier height', unit: 'm', default: 9 },
      { key: 'liftM', label: 'Lift height', unit: 'm', default: 3 },
    ],
    steps: [
      { kind: 'plain', name: 'Bored piles', unit: 'Nos', weightPct: 30, qtyFrom: 'piles' },
      { kind: 'rcc', name: 'Pile cap', weightPct: 15 },
      { kind: 'lifts', name: 'Pier shaft', weightPct: 35, over: 'heightM' },
      { kind: 'rcc', name: 'Pier cap', weightPct: 10 },
      {
        kind: 'group',
        name: 'Bearings',
        unit: 'LS',
        weightPct: 10,
        subs: [
          { name: 'Bearing pedestals', unit: 'Nos', weightPct: 40 },
          { name: 'Elastomeric bearings', unit: 'Nos', weightPct: 60 },
        ],
      },
    ],
    active: true,
  },
  {
    code: 'BRIDGE_DECK',
    name: 'Bridge deck',
    elementType: 'GENERAL',
    specFields: [{ key: 'lengthM', label: 'Deck length', unit: 'm' }],
    steps: [
      { kind: 'rcc', name: 'Girders', weightPct: 40, parts: [{ name: 'Casting', unit: 'Cum', weightPct: 70 }, { name: 'Launching', unit: 'Nos', weightPct: 30 }] },
      { kind: 'rcc', name: 'Deck slab', weightPct: 35 },
      { kind: 'plain', name: 'Crash barriers', unit: 'Rmt', weightPct: 10, qtyFrom: 'lengthM' },
      { kind: 'plain', name: 'Expansion joints', unit: 'Rmt', weightPct: 5 },
      { kind: 'plain', name: 'Wearing coat', unit: 'Sqm', weightPct: 10 },
    ],
    active: true,
  },
];

export const DEMO_TYPE: ProjectTypeDef = {
  code: 'BRIDGE',
  name: 'Bridge',
  baseType: 'ROAD',
  description: 'Road bridges on piled foundations, with their approaches.',
  locations: ['CHAINAGE'],
  pipeNetwork: false,
  contractModel: 'ITEM_RATE',
  kinds: ['BRIDGE_PIER', 'BRIDGE_DECK', 'ROAD_STRETCH'],
  breakdown: [
    { key: '1', parentKey: null, kind: 'ROAD_STRETCH', name: 'Approach', count: 2, weightPct: 10 },
    { key: '2', parentKey: null, kind: 'BRIDGE_PIER', name: 'Pier', count: 4, weightPct: 12.5 },
    { key: '3', parentKey: null, kind: 'BRIDGE_DECK', name: 'Deck', count: 1, weightPct: 30 },
  ],
  activities: [
    { name: 'Mobilisation and site office', unit: 'LS', startDay: 0, durationDays: 30 },
    { name: 'Survey and setting out', unit: 'LS', startDay: 0, durationDays: 15 },
    { name: 'River diversion and cofferdams', unit: 'LS', startDay: 20, durationDays: 60 },
    { name: 'Load test', unit: 'LS', startDay: 420, durationDays: 15 },
    { name: 'Handing over', unit: 'LS', startDay: 440, durationDays: 10 },
  ],
  active: true,
};

export async function seedProjectTypes(prisma: PrismaClient, organizationId: string) {
  const kinds = [...STANDARD_COMPONENT_KINDS, ...DEMO_KINDS];
  for (const k of DEMO_KINDS) {
    const problems = componentKindProblems(k);
    if (problems.length) throw new Error(`Demo kind ${k.code}: ${problems.join('; ')}`);
  }
  const problems = projectTypeProblems(DEMO_TYPE, kinds);
  if (problems.length) throw new Error(`Demo type ${DEMO_TYPE.code}: ${problems.join('; ')}`);

  const ownKinds = await prisma.componentKind.count({ where: { organizationId } });
  for (const [i, k] of DEMO_KINDS.entries()) {
    const data = { name: k.name, elementType: k.elementType, specFields: json(k.specFields), steps: json(k.steps), active: k.active };
    await prisma.componentKind.upsert({
      where: { organizationId_code: { organizationId, code: k.code } },
      update: data,
      create: { organizationId, code: k.code, sortOrder: ownKinds + i + 1, ...data },
    });
  }
  const t = DEMO_TYPE;
  const data = {
    name: t.name,
    baseType: t.baseType,
    description: t.description,
    locations: t.locations,
    pipeNetwork: t.pipeNetwork,
    contractModel: t.contractModel,
    kinds: t.kinds,
    breakdown: json(t.breakdown),
    active: t.active,
  };
  await prisma.projectTypeConfig.upsert({
    where: { organizationId_code: { organizationId, code: t.code } },
    update: data,
    create: { organizationId, code: t.code, sortOrder: 7, ...data },
  });
  await prisma.$transaction([
    prisma.activityTemplate.deleteMany({ where: { organizationId, typeCode: t.code } }),
    prisma.activityTemplate.createMany({
      data: t.activities.map((a, i) => ({ organizationId, projectType: t.baseType, typeCode: t.code, name: a.name, unit: a.unit, startDay: a.startDay, durationDays: a.durationDays, sortOrder: i + 1 })),
    }),
  ]);
}
