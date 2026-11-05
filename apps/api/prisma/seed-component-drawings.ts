/**
 * Demo drawings by component (Drawings by component, review stages on a submittal): on the Devgarh town water supply
 * scheme, each component's civil, mechanical and electrical drawings in the register, linked to the component, and one
 * submittal per component that passes the proof checker, the TPIA, the PIU and head office in turn. Most components are
 * approved for construction; the intake well waits at head office, the raw water rising main at the PIU, the clear water
 * pumps at the TPIA, the distribution network at the proof checker, the HT feeder is late at the PIU, and the overhead
 * tanks came back from the proof checker with a comment to answer. Writes only what is missing: nothing when the project
 * already has a drawing linked to a component.
 */
import { PrismaClient, type RevisionStatus } from '@prisma/client';
import { day } from './seed-clock';

const PROJECT = 'WS-2026-04';
const STAGES = ['proof-checker', 'tpia', 'piu', 'head-office'];
const REVIEWERS: Record<string, string> = {
  'proof-checker': 'Professor of Structural Engineering, VNIT Nagpur',
  tpia: 'TPIA inspector',
  piu: 'Executive Engineer, PIU Devgarh',
  'head-office': 'Superintending Engineer, head office',
};

type Disc = 'STRUCTURAL' | 'MECHANICAL' | 'ELECTRICAL';
const SHORT: Record<Disc, string> = { STRUCTURAL: 'CIV', MECHANICAL: 'MCH', ELECTRICAL: 'ELE' };
const TITLE: Record<Disc, string> = { STRUCTURAL: 'civil and structural', MECHANICAL: 'mechanical and piping', ELECTRICAL: 'electrical' };

/** A drawing: its discipline, how many revisions (R0…), and the current one's status. */
type Drg = [Disc, number, RevisionStatus];
/** Where the component's submittal stands: approved by all four, waiting at a stage (by index), or sent back by one. */
type Review = { approved: true } | { waitingAt: number; late?: boolean } | { backFrom: number; comment: string };

const COMPONENTS: { code: string; tag: string; drawings: Drg[]; review: Review }[] = [
  { code: '1', tag: 'INT', drawings: [['STRUCTURAL', 4, 'FOR_CONSTRUCTION'], ['MECHANICAL', 4, 'FOR_CONSTRUCTION'], ['ELECTRICAL', 3, 'FOR_APPROVAL']], review: { waitingAt: 3 } },
  { code: '2', tag: 'RWP', drawings: [['MECHANICAL', 4, 'FOR_CONSTRUCTION'], ['ELECTRICAL', 4, 'FOR_CONSTRUCTION']], review: { approved: true } },
  { code: '3', tag: 'RWM', drawings: [['STRUCTURAL', 4, 'FOR_CONSTRUCTION'], ['MECHANICAL', 3, 'FOR_APPROVAL']], review: { waitingAt: 2 } },
  { code: '4', tag: 'WTP', drawings: [['STRUCTURAL', 4, 'FOR_CONSTRUCTION'], ['MECHANICAL', 4, 'FOR_CONSTRUCTION'], ['ELECTRICAL', 4, 'FOR_CONSTRUCTION']], review: { approved: true } },
  { code: '5', tag: 'CWP', drawings: [['MECHANICAL', 4, 'FOR_CONSTRUCTION'], ['ELECTRICAL', 2, 'FOR_APPROVAL']], review: { waitingAt: 1 } },
  { code: '6', tag: 'CWM', drawings: [['STRUCTURAL', 4, 'FOR_CONSTRUCTION']], review: { approved: true } },
  { code: '7', tag: 'FDM', drawings: [['STRUCTURAL', 4, 'FOR_CONSTRUCTION']], review: { approved: true } },
  {
    code: '8',
    tag: 'OHT',
    drawings: [['STRUCTURAL', 2, 'REJECTED'], ['MECHANICAL', 3, 'FOR_APPROVAL']],
    review: { backFrom: 0, comment: 'Increase the staging column bars from 20 mm to 25 mm to satisfy IS 11682 for seismic zone III load combinations.' },
  },
  { code: '9', tag: 'DIS', drawings: [['STRUCTURAL', 2, 'FOR_APPROVAL']], review: { waitingAt: 0 } },
  { code: '10', tag: 'RDR', drawings: [['STRUCTURAL', 4, 'FOR_CONSTRUCTION']], review: { approved: true } },
  { code: '11', tag: 'HSC', drawings: [['MECHANICAL', 4, 'FOR_CONSTRUCTION']], review: { approved: true } },
  { code: '12', tag: 'HTF', drawings: [['ELECTRICAL', 3, 'FOR_APPROVAL']], review: { waitingAt: 2, late: true } },
];

const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function seedComponentDrawings(prisma: PrismaClient, organizationId: string) {
  const project = await prisma.project.findFirst({ where: { organizationId, code: PROJECT }, select: { id: true } });
  if (!project) return;
  if (await prisma.document.count({ where: { projectId: project.id, workElementId: { not: null } } })) return;
  const by = await prisma.user.findFirst({ where: { organizationId, email: { in: ['docs@demo.com', 'pm@demo.com'] } }, orderBy: { email: 'asc' }, select: { id: true } });
  if (!by) return;
  const elements = await prisma.workElement.findMany({ where: { projectId: project.id, parentId: null }, select: { id: true, code: true, name: true } });
  const year = day(0).getUTCFullYear();
  const taken = new Set((await prisma.designSubmission.findMany({ where: { organizationId }, select: { submissionNo: true } })).map((s) => s.submissionNo));
  let next = 101;
  const nextNo = () => {
    while (taken.has(`DSN-${year}-0${next}`)) next++;
    const no = `DSN-${year}-0${next}`;
    taken.add(no);
    return no;
  };

  for (const [i, c] of COMPONENTS.entries()) {
    const el = elements.find((e) => e.code === c.code);
    if (!el) continue;
    // Spread the components over the last three months so the dates read like a real programme.
    const start = day(-95 + i * 4);
    const docs: { id: string; revisionId: string }[] = [];
    for (const [disc, count, status] of c.drawings) {
      const docNo = `DTW-${c.tag}-${SHORT[disc]}-01`;
      if (await prisma.document.findFirst({ where: { projectId: project.id, docNo }, select: { id: true } })) continue;
      const doc = await prisma.document.create({
        data: { organizationId, projectId: project.id, docNo, title: `${el.name}, ${TITLE[disc]} general arrangement`, kind: 'DRAWING', discipline: disc, workElementId: el.id, createdById: by.id },
        select: { id: true },
      });
      let currentId = '';
      for (let r = 0; r < count; r++) {
        const rev = await prisma.documentRevision.create({
          data: { documentId: doc.id, revision: `R${r}`, issuedOn: plus(start, r * 6), status: r === count - 1 ? status : 'FOR_APPROVAL', receivedFrom: 'Design team', issuedById: by.id },
          select: { id: true },
        });
        currentId = rev.id;
      }
      await prisma.document.update({ where: { id: doc.id }, data: { currentRevisionId: currentId } });
      docs.push({ id: doc.id, revisionId: currentId });
    }
    if (!docs.length) continue;

    // One submittal for the component's drawings, through the four review stages.
    const submittedOn = plus(start, 20);
    const r = c.review;
    const cleared = 'approved' in r ? STAGES.length : 'waitingAt' in r ? r.waitingAt : r.backFrom;
    const marks: { stage: string; code: string; clearedOn: string; reviewerName: string; reviewRef: string | null }[] = STAGES.slice(0, cleared).map((stage, k) => ({ stage, code: 'A', clearedOn: ymd(plus(submittedOn, (k + 1) * 7)), reviewerName: REVIEWERS[stage], reviewRef: null }));
    const lastCleared = marks.length ? new Date(`${marks[marks.length - 1].clearedOn}T00:00:00Z`) : submittedOn;
    if ('backFrom' in r) marks.push({ stage: STAGES[r.backFrom], code: 'C', clearedOn: ymd(plus(submittedOn, 11)), reviewerName: REVIEWERS[STAGES[r.backFrom]], reviewRef: 'VNIT/PC/2026/57' });
    const final = 'approved' in r ? 'A' : 'backFrom' in r ? 'C' : null;
    const status = 'approved' in r ? 'APPROVED' : 'backFrom' in r ? 'REVISE_RESUBMIT' : 'UNDER_REVIEW';
    // A late stage was asked to reply two weeks after the stage before cleared; it is now past that.
    const replyBy = 'waitingAt' in r && r.late ? plus(day(0), -6) : plus(lastCleared, 14);
    const sub = await prisma.designSubmission.create({
      data: {
        organizationId,
        projectId: project.id,
        submissionNo: nextNo(),
        title: `${el.name}, drawings for approval`,
        kind: 'DRAWINGS',
        purpose: 'APPROVAL',
        toParty: 'The Executive Engineer, PIU Devgarh',
        source: 'CLIENT',
        stages: STAGES,
        replyBy,
        status,
        revision: 0,
        createdById: by.id,
        docs: { create: docs.map((d, k) => ({ documentId: d.id, sortOrder: k })) },
      },
      select: { id: true },
    });
    const finalMark = marks[marks.length - 1];
    await prisma.designSubmissionRound.create({
      data: {
        organizationId,
        submissionId: sub.id,
        revision: 0,
        submittedOn,
        submittedById: by.id,
        code: final,
        reviewedOn: final && finalMark ? new Date(`${finalMark.clearedOn}T00:00:00Z`) : null,
        reviewerName: final && finalMark ? finalMark.reviewerName : null,
        marks,
        items: { create: docs.map((d) => ({ revisionId: d.revisionId })) },
      },
    });
    if ('backFrom' in r)
      await prisma.designComment.create({ data: { organizationId, submissionId: sub.id, commentNo: 1, round: 0, stage: STAGES[r.backFrom], madeOn: new Date(`${finalMark.clearedOn}T00:00:00Z`), documentId: docs[0].id, text: r.comment } });
  }
}
