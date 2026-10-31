/**
 * Demo controlled copies: on the hospital, the slab reinforcement went to R1 two days ago, the site
 * office has its new print and the gangs still hold R0; the foundation and ground floor drawings are in force. On the
 * road, the plan and profile went to R1 twelve days ago and two R0 prints are still out, which the watch list shows.
 * Runs once per company (when it has none yet), after the demo documents.
 */
import { PrismaClient } from '@prisma/client';

const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

type Issue = { rev: string; after: number; holders: [number, string][]; back?: [number, 'RETURNED' | 'DESTROYED', number][] };
type Plan = { project: string; docNo: string; issues: Issue[] };

const PLANS: Plan[] = [
  {
    project: 'BL-2026-02',
    docNo: 'STR-205',
    issues: [
      { rev: 'R0', after: 1, holders: [[1, 'Site office'], [2, 'Steel fixing subcontractor'], [3, 'Formwork subcontractor'], [4, 'Quality lab']], back: [[1, 'RETURNED', 1]] },
      { rev: 'R1', after: 0, holders: [[1, 'Site office']] },
    ],
  },
  { project: 'BL-2026-02', docNo: 'STR-201', issues: [{ rev: 'R0', after: 1, holders: [[1, 'Site office'], [2, 'Steel fixing subcontractor']] }] },
  { project: 'BL-2026-02', docNo: 'ARC-101', issues: [{ rev: 'R1', after: 1, holders: [[1, 'Site office'], [2, 'Finishing subcontractor']] }] },
  {
    project: 'RD-2026-01',
    docNo: 'RD-PP-03',
    issues: [
      { rev: 'R0', after: 2, holders: [[1, 'Site office'], [2, 'Earthwork subcontractor'], [3, 'Survey team'], [4, 'Client’s site engineer']], back: [[1, 'RETURNED', 2], [3, 'DESTROYED', 3]] },
      { rev: 'R1', after: 1, holders: [[1, 'Site office'], [3, 'Survey team']] },
    ],
  },
];

export async function seedControlledCopies(prisma: PrismaClient, organizationId: string) {
  if (await prisma.controlledCopy.count({ where: { organizationId } })) return;
  const by = await prisma.user.findFirst({ where: { organizationId, email: { in: ['docs@demo.com', 'pm@demo.com'] } }, orderBy: { email: 'asc' }, select: { id: true } });
  if (!by) return;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (const plan of PLANS) {
    const doc = await prisma.document.findFirst({
      where: { organizationId, docNo: plan.docNo, project: { code: plan.project } },
      select: { id: true, projectId: true, currentRevisionId: true, revisions: { select: { id: true, revision: true, issuedOn: true } } },
    });
    if (!doc) continue;
    const later = (rev: string) => {
      const r = doc.revisions.find((x) => x.revision === rev);
      const next = doc.revisions.filter((x) => r && x.issuedOn > r.issuedOn).sort((a, b) => a.issuedOn.getTime() - b.issuedOn.getTime())[0];
      return next?.issuedOn ?? null;
    };
    for (const issue of plan.issues) {
      const rev = doc.revisions.find((x) => x.revision === issue.rev);
      if (!rev) continue;
      const issuedOn = plus(rev.issuedOn, issue.after) > today ? today : plus(rev.issuedOn, issue.after);
      const superseded = later(issue.rev);
      for (const [copyNo, holder] of issue.holders) {
        const back = issue.back?.find((b) => b[0] === copyNo);
        const disposedOn = back && superseded ? (plus(superseded, back[2]) > today ? today : plus(superseded, back[2])) : null;
        await prisma.controlledCopy.create({
          data: {
            organizationId,
            projectId: doc.projectId,
            documentId: doc.id,
            revisionId: rev.id,
            copyNo,
            holder,
            issuedOn,
            issuedById: by.id,
            ...(back && disposedOn ? { disposal: back[1], disposedOn, disposedById: by.id, disposalNote: back[1] === 'DESTROYED' ? 'Stamped superseded and torn on site' : null } : {}),
          },
        });
      }
    }
  }
}
