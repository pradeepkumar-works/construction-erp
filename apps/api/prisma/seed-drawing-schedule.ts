/**
 * Demo drawing schedule (item 138 part 1): on the hospital, the drawings site needs from the client's structural
 * consultant, the architect and the electrical wing, matched to the register (one came late, the plumbing riser is in
 * but only for approval) and three still awaited, two of them past their day; on the road, the drawings our own design
 * team owes. Runs once per company (when it has no schedule yet), after the demo documents.
 */
import { PrismaClient } from '@prisma/client';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

const CONSULTANT = 'The Structural Consultant, Health Department';
const ARCHITECT = 'The Architect, Health Department';
const ELECTRICAL = 'The Executive Engineer (Electrical), Works Department';

export async function seedDrawingSchedule(prisma: PrismaClient, organizationId: string) {
  if (await prisma.drawingNeed.count({ where: { organizationId } })) return;
  const pm = await prisma.user.findFirst({ where: { organizationId, email: 'pm@demo.com' }, select: { id: true } });
  if (!pm) return;
  const projects = await prisma.project.findMany({ where: { organizationId, code: { in: ['BL-2026-02', 'RD-2026-01'] } }, select: { id: true, code: true } });
  const hospital = projects.find((p) => p.code === 'BL-2026-02');
  const road = projects.find((p) => p.code === 'RD-2026-01');

  type Line = { docNo?: string; title: string; discipline: 'STRUCTURAL' | 'ARCHITECTURAL' | 'PLUMBING' | 'ELECTRICAL' | 'ROAD'; source: string; fromParty?: string; neededBy: Date; activity?: string; remarks?: string };
  const add = async (projectId: string, lines: Line[]) => {
    const docs = await prisma.document.findMany({ where: { projectId }, select: { id: true, docNo: true } });
    const activities = await prisma.activity.findMany({ where: { projectId }, select: { id: true, name: true } });
    for (const l of lines) {
      const activityId = l.activity ? (activities.find((a) => a.name.toLowerCase().includes(l.activity!.toLowerCase()))?.id ?? null) : null;
      await prisma.drawingNeed.create({
        data: {
          organizationId,
          projectId,
          docNo: l.docNo ?? null,
          title: l.title,
          discipline: l.discipline,
          source: l.source,
          fromParty: l.fromParty ?? null,
          neededBy: l.neededBy,
          activityId,
          remarks: l.remarks ?? null,
          documentId: docs.find((d) => d.docNo === l.docNo)?.id ?? null,
          createdById: pm.id,
        },
      });
    }
  };
  // The day a register drawing was first issued, so a matched line's day sits against it.
  const firstIssued = async (projectId: string, docNo: string) =>
    (await prisma.documentRevision.findFirst({ where: { document: { projectId, docNo } }, orderBy: { issuedOn: 'asc' }, select: { issuedOn: true } }))?.issuedOn ?? day(-30);
  const gfcIssued = async (projectId: string, docNo: string) =>
    (await prisma.documentRevision.findFirst({ where: { document: { projectId, docNo }, status: { in: ['FOR_CONSTRUCTION', 'APPROVED', 'APPROVED_WITH_COMMENTS'] } }, orderBy: { issuedOn: 'asc' }, select: { issuedOn: true } }))?.issuedOn ?? day(-30);

  if (hospital) {
    await add(hospital.id, [
      { docNo: 'STR-201', title: 'Foundation layout and footing details', discipline: 'STRUCTURAL', source: 'CONSULTANT', fromParty: CONSULTANT, neededBy: plus(await gfcIssued(hospital.id, 'STR-201'), 5), activity: 'excavation' },
      { docNo: 'ARC-101', title: 'Ground floor plan', discipline: 'ARCHITECTURAL', source: 'ARCHITECT', fromParty: ARCHITECT, neededBy: plus(await gfcIssued(hospital.id, 'ARC-101'), 2) },
      { docNo: 'STR-205', title: 'First floor slab reinforcement', discipline: 'STRUCTURAL', source: 'CONSULTANT', fromParty: CONSULTANT, neededBy: plus(await gfcIssued(hospital.id, 'STR-205'), -6), activity: 'slab', remarks: 'Revision 1 came after the shuttering was ready; two days of the slab gang idle.' },
      { docNo: 'PLB-301', title: 'Plumbing riser diagram', discipline: 'PLUMBING', source: 'ARCHITECT', fromParty: ARCHITECT, neededBy: plus(await firstIssued(hospital.id, 'PLB-301'), 3), remarks: 'In for approval only; sleeves in the second floor slab wait on it.' },
      { docNo: 'STR-210', title: 'Second floor slab reinforcement', discipline: 'STRUCTURAL', source: 'CONSULTANT', fromParty: CONSULTANT, neededBy: day(-12), activity: 'slab', remarks: 'Shuttering of the second floor is complete.' },
      { docNo: 'STR-215', title: 'Staircase and lift well details', discipline: 'STRUCTURAL', source: 'CONSULTANT', fromParty: CONSULTANT, neededBy: day(-4) },
      { title: 'Operation theatre and ICU equipment layout', discipline: 'ARCHITECTURAL', source: 'ARCHITECT', fromParty: ARCHITECT, neededBy: day(5) },
      { docNo: 'ELE-401', title: 'Electrical layout, ground floor', discipline: 'ELECTRICAL', source: 'CLIENT', fromParty: ELECTRICAL, neededBy: day(25) },
    ]);
  }
  if (road) {
    await add(road.id, [
      { docNo: 'RD-TCS-01', title: 'Typical cross sections', discipline: 'ROAD', source: 'OWN', neededBy: plus(await gfcIssued(road.id, 'RD-TCS-01'), 4) },
      { docNo: 'RD-CD-07', title: 'Pipe culvert at Km 13+420', discipline: 'STRUCTURAL', source: 'OWN', neededBy: day(9), remarks: 'With the Authority’s Engineer for approval.' },
      { docNo: 'RD-MB-01', title: 'Minor bridge at Km 15+200, general arrangement', discipline: 'STRUCTURAL', source: 'DESIGN_CONSULTANT', fromParty: 'The bridge design consultant', neededBy: day(20) },
    ]);
  }
}
