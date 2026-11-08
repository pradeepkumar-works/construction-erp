/**
 * Demo Indian Standards: the electrical and mechanical tests of commissioning at the water supply scheme's pump house
 * (earth pits, insulation of the motor and a cable run, pump duty, the air vessel's hydro test), one insulation test
 * failed, and the company's check of two editions against BIS: IS 456 last month, IS 3043 over a year ago, so it is due.
 * Runs once per company (when it has no standard of its own yet), after the demo QA/QC.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { STANDARD_IS_CODES } from '@erp/shared';
import { day } from './seed-clock';

const D = (v: number | string) => new Prisma.Decimal(v);

export async function seedIsStandards(prisma: PrismaClient, organizationId: string) {
  if (await prisma.isStandard.count({ where: { organizationId } })) return;
  const water = await prisma.project.findFirst({ where: { organizationId, type: 'WATER_SUPPLY' }, orderBy: { code: 'asc' }, select: { id: true } });
  const qa = await prisma.user.findFirst({ where: { organizationId, email: 'qaqc@demo.com' }, select: { id: true } });
  if (!water || !qa) return;

  for (const [code, ago] of [['IS_456', 30], ['IS_3043', 400]] as const) {
    const s = STANDARD_IS_CODES.find((x) => x.code === code)!;
    await prisma.isStandard.create({
      data: {
        organizationId, code, number: s.number, year: s.year, reaffirmed: s.reaffirmed, title: s.title, discipline: s.discipline, subject: s.subject,
        clauses: s.clauses as unknown as Prisma.InputJsonValue, checkedOn: day(-ago), checkedById: qa.id,
      },
    });
  }

  const year = day(0).getUTCFullYear();
  const last = await prisma.qualityTest.findFirst({ where: { organizationId, testNo: { startsWith: `TST-${year}-` } }, orderBy: { testNo: 'desc' }, select: { testNo: true } });
  let n = parseInt(last?.testNo.slice(9) ?? '0', 10);
  const test = async (o: { code: string; title: string; location: string; ago: number; unit: string; min?: number; max?: number; value: number; label: string; result: 'PASS' | 'FAIL'; remarks: string }) => {
    n += 1;
    await prisma.qualityTest.create({
      data: {
        organizationId, projectId: water.id, testNo: `TST-${year}-${String(n).padStart(4, '0')}`, kind: 'OTHER', title: o.title, location: o.location, sampledOn: day(-o.ago),
        unit: o.unit, specMin: o.min === undefined ? null : D(o.min), specMax: o.max === undefined ? null : D(o.max), result: o.result, remarks: o.remarks, createdById: qa.id, createdAt: day(-o.ago), testTypeCode: o.code,
        readings: { create: [{ label: o.label, dueOn: day(-o.ago), value: D(o.value), testedOn: day(-o.ago), sortOrder: 0 }] },
      },
    });
  };
  await test({ code: 'EARTH', title: 'Earth pit 1, pump house main earth', location: 'Pump house, earth pit 1', ago: 6, unit: 'Ω', max: 1, value: 0.68, label: 'Resistance', result: 'PASS', remarks: 'Fall-of-potential method; bentonite fill around the electrode.' });
  await test({ code: 'EARTH', title: 'Earth pit 2, transformer neutral', location: 'Pump house, earth pit 2', ago: 6, unit: 'Ω', max: 1, value: 0.82, label: 'Resistance', result: 'PASS', remarks: 'Tested before connecting to the grid.' });
  await test({ code: 'INSULATION', title: 'Distribution board DB-2 outgoing circuits', location: 'Pump house control room', ago: 4, unit: 'MΩ', min: 1, value: 0.45, label: 'At 500 V DC', result: 'FAIL', remarks: 'Moisture in the cable trench junction box. Dry out, reseal and test again.' });
  await test({ code: 'INSULATION', title: 'Pump motor 1 windings to earth', location: 'Pump house, pump 1', ago: 3, unit: 'MΩ', min: 1, value: 120, label: 'At 500 V DC', result: 'PASS', remarks: 'Before the first run.' });
  await test({ code: 'PUMP', title: 'Pump 1 at the duty point', location: 'Pump house, pump 1', ago: 2, unit: '%', min: 75, value: 76.4, label: 'Efficiency at the duty point', result: 'PASS', remarks: 'At full duty flow; head and discharge within class C.' });
  await test({ code: 'VESSEL_HYDRO', title: 'Surge vessel hydrostatic test', location: 'Pump house delivery header', ago: 1, unit: 'bar', min: 13, value: 13, label: 'Pressure held', result: 'PASS', remarks: 'Held 30 minutes at 1.3 times the design pressure; no drop, no leak at the flanges.' });
}
