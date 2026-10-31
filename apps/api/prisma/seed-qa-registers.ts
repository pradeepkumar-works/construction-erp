/**
 * Demo QA/QC registers: the building's site lab and an NABL lab whose accreditation runs out next
 * month, the site lab's instruments (the CTM calibrated, the cube moulds due soon, the scale overdue), the building's
 * tests sent to the labs (cubes crushed at site, bricks and steel at the NABL lab, one report late), categories on the
 * steel, cement and pipes, and categories and root causes on the demo NCRs. Runs once per company (when it has no lab
 * yet), after the demo tests, receipts and NCRs.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { masterCode } from '@erp/shared';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

export async function seedQaRegisters(prisma: PrismaClient, organizationId: string) {
  if (await prisma.qaLab.count({ where: { organizationId } })) return;
  const building = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' }, select: { id: true } });
  const qa = await prisma.user.findFirst({ where: { organizationId, email: 'qaqc@demo.com' }, select: { id: true } });

  // Items the maker certifies, so receipts of them show on Test certificates until the number is entered.
  const categories: [string, string][] = [
    ['TMT', 'Steel'],
    ['Binding wire', 'Steel'],
    ['Cement', 'Cement'],
    ['DI K', 'Pipes and fittings'],
    ['HDPE', 'Pipes and fittings'],
    ['MDPE', 'Pipes and fittings'],
    ['Fly ash bricks', 'Bricks and blocks'],
    ['Aggregate', 'Aggregate and sand'],
    ['Sand', 'Aggregate and sand'],
  ];
  for (const [name, category] of categories) await prisma.item.updateMany({ where: { organizationId, category: null, name: { contains: name, mode: 'insensitive' } }, data: { category } });

  // NCRs: what kind each is and, once site has answered, why it happened.
  const ncrs = await prisma.ncr.findMany({ where: { organizationId }, select: { id: true, title: true, status: true } });
  for (const n of ncrs) {
    const t = n.title.toLowerCase();
    const category = t.includes('brick') ? 'Material' : t.includes('compaction') ? 'Workmanship' : t.includes('honeycomb') ? 'Workmanship' : t.includes('cube') ? 'Concrete strength' : null;
    const rootCause = n.status === 'OPEN' ? null : t.includes('compaction') ? 'Method not followed' : t.includes('honeycomb') ? 'Supervision' : t.includes('cube') ? 'Material defect' : null;
    await prisma.ncr.update({
      where: { id: n.id },
      data: {
        category: category ? masterCode(category) : null,
        rootCause: rootCause ? masterCode(rootCause) : null,
        reworkCost: t.includes('honeycomb') ? new Prisma.Decimal('18500') : null,
        raisedByClient: t.includes('compaction'),
      },
    });
  }

  if (!building || !qa) return;
  const siteLab = await prisma.qaLab.create({ data: { organizationId, name: 'Site lab, Block A', kind: 'SITE', projectId: building.id, contact: 'Lab technician', notes: 'Cubes, slump and sieve analysis' } });
  const nabl = await prisma.qaLab.create({
    data: {
      organizationId,
      name: 'Eastern Materials Testing Laboratory',
      kind: 'NABL',
      nablNo: 'TC-7342',
      nablValidTill: day(24),
      address: 'Plot 14, Mancheswar Industrial Estate, Bhubaneswar',
      contact: 'Reception',
      phone: '9437000000',
      notes: 'Steel, bricks, cement and aggregates. Steel tensile ₹1,800 a set.',
    },
  });

  const instrument = (o: { name: string; kind: string; serialNo: string; make: string; range: string; intervalDays: number; calibratedAgo: number; agency: string; certificateNo: string }) =>
    prisma.qaInstrument.create({
      data: {
        organizationId,
        name: o.name,
        kind: masterCode(o.kind),
        serialNo: o.serialNo,
        make: o.make,
        range: o.range,
        projectId: building.id,
        labId: siteLab.id,
        intervalDays: o.intervalDays,
        lastCalibratedOn: day(-o.calibratedAgo),
        nextDueOn: plus(day(-o.calibratedAgo), o.intervalDays),
        lastResult: 'OK',
        certificateNo: o.certificateNo,
        calibrations: {
          create: [
            { organizationId, calibratedOn: day(-o.calibratedAgo), certificateNo: o.certificateNo, agency: o.agency, result: 'OK', nextDueOn: plus(day(-o.calibratedAgo), o.intervalDays), createdById: qa.id },
          ],
        },
      },
    });
  const ctm = await instrument({ name: 'CTM 2000 kN', kind: 'Compression testing machine', serialNo: 'CTM-2219', make: 'AIMIL', range: '0 to 2000 kN', intervalDays: 365, calibratedAgo: 140, agency: nabl.name, certificateNo: 'EMTL/CAL/26/0412' });
  await instrument({ name: 'Cube moulds 150 mm, set of 12', kind: 'Cube moulds', serialNo: 'CM-12-04', make: 'Local', range: '150 mm', intervalDays: 365, calibratedAgo: 356, agency: nabl.name, certificateNo: 'EMTL/CAL/25/1890' });
  const scale = await instrument({ name: 'Platform scale 100 kg', kind: 'Weighing scale', serialNo: 'WS-0081', make: 'Essae', range: '0 to 100 kg', intervalDays: 365, calibratedAgo: 384, agency: 'Legal Metrology, Cuttack', certificateNo: 'LM/VC/25/7731' });
  await instrument({ name: 'Slump cone', kind: 'Slump cone', serialNo: 'SC-03', make: 'Local', range: '300 mm', intervalDays: 365, calibratedAgo: 60, agency: nabl.name, certificateNo: 'EMTL/CAL/26/0920' });

  // The building's tests: cubes crushed on the site lab's CTM, the rest sent to the NABL lab.
  const tests = await prisma.qualityTest.findMany({
    where: { organizationId, projectId: building.id },
    select: { id: true, kind: true, sampledOn: true, result: true, readings: { select: { testedOn: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { sampledOn: 'asc' },
  });
  let n = 0;
  for (const t of tests) {
    if (t.kind === 'CONCRETE_CUBE') {
      const last = t.readings.map((r) => r.testedOn).filter((d): d is Date => !!d).pop() ?? null;
      await prisma.qualityTest.update({
        where: { id: t.id },
        data: { labId: siteLab.id, sentOn: t.sampledOn, reportOn: t.result === 'PENDING' ? null : last, labReportNo: t.result === 'PENDING' ? null : `SL/${String(++n).padStart(3, '0')}`, instrumentId: ctm.id },
      });
    } else {
      const reported = t.result !== 'PENDING';
      await prisma.qualityTest.update({
        where: { id: t.id },
        data: { labId: nabl.id, sentOn: plus(t.sampledOn, 1), reportOn: reported ? plus(t.sampledOn, 6) : null, labReportNo: reported ? `EMTL/26/${4100 + ++n}` : null, labCharge: new Prisma.Decimal('1800'), instrumentId: t.kind === 'BRICK' ? scale.id : null },
      });
    }
  }
  // A steel sample from this month's TMT lot, at the NABL lab past its usual ten days.
  const last = await prisma.qualityTest.findFirst({ where: { organizationId, testNo: { startsWith: `TST-${new Date().getUTCFullYear()}-` } }, orderBy: { testNo: 'desc' }, select: { testNo: true } });
  const se = await prisma.user.findFirst({ where: { organizationId, role: { key: 'SITE_ENGINEER' }, memberships: { some: { projectId: building.id } } }, select: { id: true } });
  if (last && se) {
    const next = parseInt(last.testNo.slice(9), 10) + 1;
    await prisma.qualityTest.create({
      data: {
        organizationId,
        projectId: building.id,
        testNo: `TST-${new Date().getUTCFullYear()}-${String(next).padStart(4, '0')}`,
        kind: 'STEEL',
        title: 'TMT Fe500D 12 mm, heat 6614',
        sampledOn: day(-16),
        specification: 'IS 1786 Fe500D: 0.2% proof stress not less than 500 N/mm²',
        unit: 'N/mm²',
        specMin: new Prisma.Decimal(500),
        result: 'PENDING',
        createdById: se.id,
        createdAt: day(-16),
        labId: nabl.id,
        sentOn: day(-15),
        labCharge: new Prisma.Decimal('1800'),
      },
    });
  }

  // Receipts: the older steel and cement came with their certificates; the latest ones wait for them.
  const receipts = await prisma.stockEntry.findMany({
    where: { organizationId, type: 'RECEIPT', lines: { some: { item: { category: { in: ['Steel', 'Cement', 'Pipes and fittings'] } } } } },
    select: { id: true, date: true },
    orderBy: { date: 'asc' },
  });
  for (const [i, r] of receipts.slice(0, Math.max(0, receipts.length - 3)).entries()) {
    await prisma.stockEntry.update({ where: { id: r.id }, data: { mtcNo: `TC/${r.date.getUTCFullYear() % 100}/${88100 + i}`, mtcDate: plus(r.date, -2) } });
  }
}
