/**
 * Demo consultant checks (item 172): on the building, the consultant's engineer checks as resident engineer and has
 * checked the largest approved measurement sheet; the site order book has an order copied in from the paper book,
 * complied with and closed, and one the consultant wrote in the portal last week, waiting for its compliance. Runs once
 * per company (when it has no site order yet), after the guests and measurements.
 */
import { PrismaClient } from '@prisma/client';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

export async function seedConsultantChecks(prisma: PrismaClient, organizationId: string) {
  if (await prisma.siteOrder.count({ where: { organizationId } })) return;
  const [building, pmc] = await Promise.all([
    prisma.project.findFirst({ where: { organizationId, code: 'BL-2026-02' }, select: { id: true, projectManagerId: true } }),
    prisma.user.findFirst({ where: { organizationId, email: 'pmc@demo.com' }, select: { id: true, fullName: true } }),
  ]);
  if (!building || !pmc) return;
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: building.id, userId: pmc.id } } });
  if (!member) return;
  if (!member.checkLevel) await prisma.projectMember.update({ where: { id: member.id }, data: { checkLevel: 'RESIDENT_ENGINEER' } });

  const sheets = await prisma.measurementSheet.findMany({ where: { projectId: building.id, status: 'APPROVED' }, select: { id: true, date: true, totalQty: true, boqItem: { select: { rate: true } } } });
  const largest = sheets.sort((a, b) => b.totalQty.mul(b.boqItem.rate).cmp(a.totalQty.mul(a.boqItem.rate)))[0];
  if (largest && !(await prisma.measurementCheck.count({ where: { sheetId: largest.id } })))
    await prisma.measurementCheck.create({
      data: { organizationId, projectId: building.id, sheetId: largest.id, checkedById: pmc.id, level: 'RESIDENT_ENGINEER', checkedOn: largest.date, recordedQty: largest.totalQty, checkedQty: largest.totalQty, note: 'Checked at site with the QS' },
    });

  const recorder = building.projectManagerId;
  await prisma.siteOrder.create({
    data: {
      organizationId,
      projectId: building.id,
      orderNo: 1,
      date: day(-24),
      issuedByName: 'Resident engineer (consultant)',
      issuedByLevel: 'RESIDENT_ENGINEER',
      location: 'Ground floor slab',
      instruction: 'Keep the ground floor slab under curing for 14 days; hessian to be kept wet and a curing log kept at site.',
      complyBy: day(-22),
      status: 'CLOSED',
      reply: 'Hessian laid and kept wet from the day after the pour; the curing log is in the site office.',
      repliedById: recorder,
      repliedOn: day(-22),
      closeNote: 'Seen at site and accepted in the book.',
      closedById: recorder,
      closedOn: day(-9),
      recordedById: recorder,
    },
  });
  await prisma.siteOrder.create({
    data: {
      organizationId,
      projectId: building.id,
      orderNo: 2,
      date: day(-6),
      issuedById: pmc.id,
      issuedByName: pmc.fullName,
      issuedByLevel: 'RESIDENT_ENGINEER',
      location: 'First floor columns',
      instruction: 'Cover blocks of the first floor columns to be 40 mm as drawing; replace the 25 mm blocks seen at the corner columns before the pour.',
      complyBy: day(1),
    },
  });
}
