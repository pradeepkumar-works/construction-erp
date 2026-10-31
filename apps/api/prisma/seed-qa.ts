/**
 * Demo QA/QC plans: the building and road projects' quality plans from the standard ones, the demo tests
 * counted under them, and the building's pour register: three slab and column pours with passed cards and 28-day cubes
 * (with the ground floor slab's, four results for the IS 456 check), one poured yesterday without a passed card and short
 * of cubes, and one planned for tomorrow waiting for its card. Runs once per company (when it has no plan yet), after the
 * demo tests and inspections.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { POUR_CARD_CHECKLIST, STANDARD_QA_PLANS, planLineFor, type ProjectType } from '@erp/shared';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const D = (v: number | string) => new Prisma.Decimal(v);
const KIND_TYPE: Record<string, string> = { CONCRETE_CUBE: 'CUBE', FIELD_DENSITY: 'FDD', BRICK: 'BRICK' };

export async function seedQa(prisma: PrismaClient, organizationId: string) {
  if (await prisma.qaPlanLine.count({ where: { organizationId } })) return;
  const year = new Date().getUTCFullYear();
  const projects = await Promise.all(
    (['BUILDING', 'ROAD'] as const).map((type) => prisma.project.findFirst({ where: { organizationId, type }, orderBy: { code: 'asc' }, select: { id: true, type: true } })),
  );
  for (const p of projects) {
    if (!p) continue;
    await prisma.qaPlanLine.createMany({ data: STANDARD_QA_PLANS[p.type as ProjectType].map((l, i) => ({ organizationId, projectId: p.id, ...l, sortOrder: i })) });
    const lines = await prisma.qaPlanLine.findMany({ where: { projectId: p.id }, select: { id: true, testType: true, grade: true } });
    const tests = await prisma.qualityTest.findMany({ where: { projectId: p.id, testTypeCode: null }, select: { id: true, kind: true, title: true } });
    for (const t of tests) {
      const code = KIND_TYPE[t.kind];
      if (code) await prisma.qualityTest.update({ where: { id: t.id }, data: { testTypeCode: code, planLineId: planLineFor(code, t.title, lines)?.id ?? null } });
    }
  }

  const building = projects[0];
  if (!building) return;
  const [qa, se] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId, email: 'qaqc@demo.com' }, select: { id: true } }),
    prisma.user.findFirst({ where: { organizationId, role: { key: 'SITE_ENGINEER' }, memberships: { some: { projectId: building.id } } }, select: { id: true } }),
  ]);
  const acts = await prisma.activity.findMany({ where: { projectId: building.id, name: { in: ['RCC footings and columns', 'RCC slab GF'] } }, select: { id: true, name: true } });
  const columns = acts.find((a) => a.name === 'RCC footings and columns');
  const slab = acts.find((a) => a.name === 'RCC slab GF');
  if (!qa || !se || !columns || !slab) return;
  const cubeLine = (await prisma.qaPlanLine.findFirst({ where: { projectId: building.id, testType: 'CUBE' }, select: { id: true } }))?.id ?? null;

  const lastNo = async (kind: 'TST' | 'INS') =>
    kind === 'TST'
      ? (await prisma.qualityTest.findFirst({ where: { organizationId, testNo: { startsWith: `TST-${year}-` } }, orderBy: { testNo: 'desc' }, select: { testNo: true } }))?.testNo
      : (await prisma.inspection.findFirst({ where: { organizationId, inspectionNo: { startsWith: `INS-${year}-` } }, orderBy: { inspectionNo: 'desc' }, select: { inspectionNo: true } }))?.inspectionNo;
  let tst = parseInt((await lastNo('TST'))?.slice(9) ?? '0', 10);
  let ins = parseInt((await lastNo('INS'))?.slice(9) ?? '0', 10);
  let pourN = 0;
  const no = (kind: string, n: number) => `${kind}-${year}-${String(n).padStart(4, '0')}`;

  const card = async (activityId: string, ago: number, location: string, passed: boolean | null) => {
    ins += 1;
    const checklist = POUR_CARD_CHECKLIST.items.map((item) => ({ item, result: passed ? 'PASS' : null, remark: null }));
    return prisma.inspection.create({
      data: {
        organizationId, projectId: building.id, activityId, inspectionNo: no('INS', ins), date: day(-ago), location, checklistName: POUR_CARD_CHECKLIST.name, checklist,
        status: passed ? 'APPROVED' : 'SUBMITTED', submittedById: se.id, submittedAt: day(-ago), reviewedById: passed ? qa.id : null, reviewedAt: passed ? day(-ago) : null, createdAt: day(-ago),
      },
    });
  };
  const cubes = async (pourId: string, activityId: string, ago: number, location: string, seven: string | null, twentyEight: string | null) => {
    tst += 1;
    const result = twentyEight === null ? 'PENDING' : Number(twentyEight) < 25 ? 'FAIL' : 'PASS';
    await prisma.qualityTest.create({
      data: {
        organizationId, projectId: building.id, activityId, testNo: no('TST', tst), kind: 'CONCRETE_CUBE', title: `M25 cubes, ${location}`, location, sampledOn: day(-ago),
        specification: 'Not less than 25 N/mm² at 28 days (IS 456)', unit: 'N/mm²', specMin: D(25), result, createdById: se.id, createdAt: day(-ago),
        testTypeCode: 'CUBE', planLineId: cubeLine, pourId,
        readings: {
          create: [
            { label: '7 days', dueOn: day(-ago + 7), value: seven === null ? null : D(seven), testedOn: seven === null ? null : day(-ago + 7), sortOrder: 0 },
            { label: '28 days', dueOn: day(-ago + 28), value: twentyEight === null ? null : D(twentyEight), testedOn: twentyEight === null ? null : day(-ago + 28), sortOrder: 1 },
          ],
        },
      },
    });
  };
  const pour = async (o: { activityId: string; ago: number; location: string; volume: number; status: 'PLANNED' | 'POURED'; inspectionId: string | null; supplier?: string }) => {
    pourN += 1;
    return prisma.pour.create({
      data: {
        organizationId, projectId: building.id, activityId: o.activityId, pourNo: no('POUR', pourN), date: day(-o.ago), location: o.location, grade: 'M25', plannedVolume: D(o.volume),
        volume: o.status === 'POURED' ? D(o.volume) : null, source: 'RMC', supplier: o.supplier ?? 'Nirmaan RMC plant, Patia', status: o.status, inspectionId: o.inspectionId,
        createdById: se.id, pouredAt: o.status === 'POURED' ? day(-o.ago) : null, createdAt: day(-o.ago - 1),
      },
    });
  };

  // Footings and columns, poured with passed cards; their 28-day cubes are in.
  const past: { ago: number; location: string; volume: number; results: [string, string][] }[] = [
    { ago: 60, location: 'Footings F1 to F12', volume: 14, results: [['20.1', '29.4'], ['19.6', '31.2']] },
    { ago: 52, location: 'Columns C1 to C16, up to plinth', volume: 9, results: [['18.8', '27.8']] },
  ];
  for (const p of past) {
    const c = await card(columns.id, p.ago, p.location, true);
    const row = await pour({ activityId: columns.id, ago: p.ago, location: p.location, volume: p.volume, status: 'POURED', inspectionId: c.id });
    for (const [seven, twentyEight] of p.results) await cubes(row.id, columns.id, p.ago, p.location, seven, twentyEight);
  }
  // The ground floor slab's cubes already in the register count under its pour.
  const slabCard = await card(slab.id, 34, 'Ground floor slab', true);
  const slabPour = await pour({ activityId: slab.id, ago: 34, location: 'Ground floor slab', volume: 21, status: 'POURED', inspectionId: slabCard.id });
  await prisma.qualityTest.updateMany({ where: { projectId: building.id, location: 'Ground floor slab', kind: 'CONCRETE_CUBE', pourId: null }, data: { pourId: slabPour.id } });
  // Yesterday's lift: the card is still waiting for QA/QC and one cube set of two was taken.
  const liftCard = await card(slab.id, 1, 'GF beams, grid E to H', null);
  const lift = await pour({ activityId: slab.id, ago: 1, location: 'GF beams, grid E to H', volume: 12, status: 'POURED', inspectionId: liftCard.id });
  await cubes(lift.id, slab.id, 1, 'GF beams, grid E to H', null, null);
  // Tomorrow's pour, its card asked for.
  const nextCard = await card(slab.id, 0, 'First floor slab, bays 1 to 3', null);
  await pour({ activityId: slab.id, ago: -1, location: 'First floor slab, bays 1 to 3', volume: 38, status: 'PLANNED', inspectionId: nextCard.id });
}
