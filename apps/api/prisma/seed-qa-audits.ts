/**
 * Demo QA/QC audits and visits: on the building, last month's internal audit (scored, its findings
 * closed, one through the honeycombing NCR), the department's quality control visit with one finding past its fifteen
 * days, and this week's third-party inspection with its findings open. Runs once per company (when it has no audit yet),
 * after the demo NCRs.
 */
import { PrismaClient } from '@prisma/client';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

type Finding = { text: string; severity?: 'MINOR' | 'MAJOR' | 'CRITICAL'; dueIn?: number; closedAfter?: number; note?: string; ncrId?: string | null };

export async function seedQaAudits(prisma: PrismaClient, organizationId: string) {
  if (await prisma.qaAudit.count({ where: { organizationId } })) return;
  const building = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' }, select: { id: true } });
  const qa = await prisma.user.findFirst({ where: { organizationId, email: 'qaqc@demo.com' }, select: { id: true } });
  if (!building || !qa) return;
  const honeycomb = await prisma.ncr.findFirst({ where: { organizationId, projectId: building.id, title: { contains: 'honeycomb', mode: 'insensitive' }, auditFinding: null }, select: { id: true } });

  let n = 0;
  const audit = async (o: { kind: string; ago: number; visitor: string; summary: string; score?: number; findings: Finding[] }) => {
    const date = day(-o.ago);
    await prisma.qaAudit.create({
      data: {
        organizationId,
        projectId: building.id,
        auditNo: `AUD-${date.getUTCFullYear()}-${String(++n).padStart(4, '0')}`,
        kind: o.kind,
        date,
        visitor: o.visitor,
        summary: o.summary,
        score: o.score ?? null,
        createdById: qa.id,
        createdAt: date,
        findings: {
          create: o.findings.map((f, i) => ({
            organizationId,
            text: f.text,
            severity: f.severity ?? 'MINOR',
            dueOn: f.dueIn === undefined ? null : day(-o.ago + f.dueIn),
            closedOn: f.closedAfter === undefined ? null : day(-o.ago + f.closedAfter),
            closingNote: f.note ?? null,
            ncrId: f.ncrId ?? null,
            sortOrder: i,
          })),
        },
      },
    });
  };

  await audit({
    kind: 'INTERNAL',
    ago: 40,
    visitor: 'Head office QA/QC',
    summary: 'Quarterly audit of the site lab, stores and the first-floor slab work. Registers kept up to date; cube curing tank needs a thermometer.',
    score: 78,
    findings: [
      { text: 'Curing tank has no thermometer; water temperature not recorded (IS 516 asks for 27 ± 2 °C).', dueIn: 7, closedAfter: 5, note: 'Thermometer fixed; temperature noted twice a day in the curing register.' },
      { text: 'Honeycombing at the base of columns on grid C left without an NCR.', severity: 'MAJOR', ncrId: honeycomb?.id ?? null },
      { text: 'Cement bags stacked against the store wall, more than ten high.', dueIn: 3, closedAfter: 2, note: 'Restacked on pallets, 150 mm off the wall, eight bags high.' },
    ],
  });
  await audit({
    kind: 'DEPARTMENT',
    ago: 22,
    visitor: 'EE (Quality Control), Works Department',
    summary: 'Inspection of the second-floor slab reinforcement and the cube register. Compliance asked for within fifteen days.',
    findings: [
      { text: 'Cover blocks missing under the bottom bars of beams B12 to B15.', severity: 'MAJOR', dueIn: 2, closedAfter: 1, note: 'Cover blocks of 25 mm fixed at 1 m spacing; checked by the engineer before the pour.' },
      { text: 'Lap lengths of slab bars not marked on the bar bending schedule kept at site.', dueIn: 15 },
      { text: 'Seven-day cube results of the first-floor slab to be sent with the compliance report.', dueIn: 15, closedAfter: 9, note: 'Sent with letter of compliance.' },
    ],
  });
  await audit({
    kind: 'TPI',
    ago: 5,
    visitor: 'Third-party inspection agency, Bhubaneswar',
    summary: 'Visit for the third running bill: brickwork, plaster and the steel received this month.',
    findings: [
      { text: 'Joints in the brickwork of the stair walls thicker than 10 mm in places.', dueIn: 10 },
      { text: 'Test certificate of the latest TMT receipt not on file.', severity: 'MAJOR', dueIn: 7 },
    ],
  });
}
