/**
 * Demo design submissions (item 138 part 2): on the road, which we design, the typical cross sections approved by the
 * Authority's Engineer, the pipe culvert vetted by a state engineering college with one remark and then sent for approval,
 * now late with the reviewer; on the hospital, the slab concreting method statement approved with comments (one still to
 * answer) and the plumbing riser shop drawing with the architect. Dates sit against the register's revisions. Runs once
 * per company (when it has none yet), after the demo documents and the drawing schedule.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const today = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const notAfterToday = (d: Date) => (d > today() ? today() : d);

const ENGINEER = 'The Authority’s Engineer, four-laning project';
const COLLEGE = 'The Head, Department of Civil Engineering, State Engineering College';
const CONSULTANT = 'The Structural Consultant, Health Department';
const ARCHITECT = 'The Architect, Health Department';

type Round = { sentOffset: number; code?: 'A' | 'B' | 'C' | 'D'; codedOffset?: number; reviewer?: string; ref?: string; note?: string };
type Comment = { text: string; doc?: string; round?: number; reply?: string; repliedOffset?: number; closed?: boolean };
type Sub = {
  no: string;
  project: string;
  title: string;
  kind: string;
  purpose: 'APPROVAL' | 'VETTING';
  toParty: string;
  source: string;
  docs: string[];
  /** Offsets in days from the first document's current revision */
  rounds: Round[];
  replyDays: number;
  status: string;
  fee?: string;
  certificateNo?: string;
  note?: string;
  comments?: Comment[];
};

export async function seedDesignSubmissions(prisma: PrismaClient, organizationId: string) {
  if (await prisma.designSubmission.count({ where: { organizationId } })) return;
  const by = await prisma.user.findFirst({ where: { organizationId, email: { in: ['docs@demo.com', 'pm@demo.com'] } }, orderBy: { email: 'asc' }, select: { id: true } });
  if (!by) return;
  const projects = await prisma.project.findMany({ where: { organizationId, code: { in: ['BL-2026-02', 'RD-2026-01'] } }, select: { id: true, code: true } });
  const year = today().getUTCFullYear();

  const subs: Sub[] = [
    {
      no: '0001',
      project: 'RD-2026-01',
      title: 'Typical cross sections, Km 12 to Km 28',
      kind: 'DRAWINGS',
      purpose: 'APPROVAL',
      toParty: ENGINEER,
      source: 'CLIENT',
      docs: ['RD-TCS-01'],
      rounds: [{ sentOffset: -12, code: 'A', codedOffset: -2, reviewer: 'Team Leader, Authority’s Engineer', ref: 'AE/TL/112' }],
      replyDays: 14,
      status: 'APPROVED',
    },
    {
      no: '0002',
      project: 'RD-2026-01',
      title: 'Structural design of the pipe culvert at Km 13+420',
      kind: 'CALCULATIONS',
      purpose: 'VETTING',
      toParty: COLLEGE,
      source: 'DESIGN_CONSULTANT',
      docs: ['RD-CD-07'],
      rounds: [{ sentOffset: -3, code: 'B', codedOffset: 0, reviewer: 'Professor of Structural Engineering', ref: 'CE/VET/2026/118' }],
      replyDays: 7,
      status: 'APPROVED_AS_NOTED',
      fee: '35000.00',
      certificateNo: 'CE/VET/2026/118',
      comments: [{ text: 'Check the barrel for the 40 t axle load of IRC 6 class 70R as well as class A.', doc: 'RD-CD-07', reply: 'Checked for class 70R wheeled: stresses within limits, calculation sheet 14 added.', repliedOffset: 1, closed: true }],
    },
    {
      no: '0003',
      project: 'RD-2026-01',
      title: 'Pipe culvert at Km 13+420, general arrangement',
      kind: 'DRAWINGS',
      purpose: 'APPROVAL',
      toParty: ENGINEER,
      source: 'CLIENT',
      docs: ['RD-CD-07'],
      rounds: [{ sentOffset: 1, note: 'With the vetting certificate CE/VET/2026/118 enclosed.' }],
      replyDays: 5,
      status: 'UNDER_REVIEW',
      note: 'The culvert holds up the embankment between Km 13+200 and Km 13+600.',
    },
    {
      no: '0004',
      project: 'BL-2026-02',
      title: 'Method statement for concreting of slabs',
      kind: 'METHOD_STATEMENT',
      purpose: 'APPROVAL',
      toParty: CONSULTANT,
      source: 'CONSULTANT',
      docs: ['MS-01'],
      rounds: [{ sentOffset: -2, code: 'B', codedOffset: 9, reviewer: 'Structural Consultant', ref: 'SC/HB/41' }],
      replyDays: 14,
      status: 'APPROVED_AS_NOTED',
      comments: [
        { text: 'State the curing period for slabs with fly ash based cement (10 days minimum).', reply: 'Clause 7.3 revised: 10 days curing with ponding for PPC.', repliedOffset: 12 },
        { text: 'Give the stripping times for slab soffits and beam sides against the grade of concrete.' },
      ],
    },
    {
      no: '0005',
      project: 'BL-2026-02',
      title: 'Plumbing riser shop drawing',
      kind: 'SHOP_DRAWINGS',
      purpose: 'APPROVAL',
      toParty: ARCHITECT,
      source: 'ARCHITECT',
      docs: ['PLB-301'],
      rounds: [{ sentOffset: 0 }],
      replyDays: 14,
      status: 'UNDER_REVIEW',
    },
  ];

  for (const s of subs) {
    const project = projects.find((p) => p.code === s.project);
    if (!project) continue;
    const docs = await prisma.document.findMany({
      where: { projectId: project.id, docNo: { in: s.docs } },
      select: { id: true, docNo: true, currentRevision: { select: { id: true, issuedOn: true } } },
    });
    if (docs.length !== s.docs.length || docs.some((d) => !d.currentRevision)) continue;
    const base = docs[0].currentRevision!.issuedOn;
    const last = s.rounds[s.rounds.length - 1];
    const sentLast = notAfterToday(plus(base, last.sentOffset));
    const created = await prisma.designSubmission.create({
      data: {
        organizationId,
        projectId: project.id,
        submissionNo: `DSN-${year}-${s.no}`,
        title: s.title,
        kind: s.kind,
        purpose: s.purpose,
        toParty: s.toParty,
        source: s.source,
        replyBy: plus(sentLast, s.replyDays),
        status: s.status,
        revision: s.rounds.length - 1,
        note: s.note ?? null,
        fee: s.fee ? new Prisma.Decimal(s.fee) : null,
        certificateNo: s.certificateNo ?? null,
        createdById: by.id,
        docs: { create: docs.map((d, i) => ({ documentId: d.id, sortOrder: i })) },
      },
      select: { id: true },
    });
    for (const [i, r] of s.rounds.entries()) {
      await prisma.designSubmissionRound.create({
        data: {
          organizationId,
          submissionId: created.id,
          revision: i,
          submittedOn: notAfterToday(plus(base, r.sentOffset)),
          submittedById: by.id,
          submitNote: r.note ?? null,
          code: r.code ?? null,
          reviewedOn: r.code ? notAfterToday(plus(base, r.codedOffset ?? 0)) : null,
          reviewerName: r.reviewer ?? null,
          reviewRef: r.ref ?? null,
          items: { create: docs.map((d) => ({ revisionId: d.currentRevision!.id })) },
        },
      });
    }
    for (const [i, c] of (s.comments ?? []).entries()) {
      const repliedOn = c.reply ? notAfterToday(plus(base, c.repliedOffset ?? 0)) : null;
      await prisma.designComment.create({
        data: {
          organizationId,
          submissionId: created.id,
          commentNo: i + 1,
          round: c.round ?? 0,
          documentId: c.doc ? (docs.find((d) => d.docNo === c.doc)?.id ?? null) : null,
          text: c.text,
          reply: c.reply ?? null,
          repliedOn,
          repliedById: c.reply ? by.id : null,
          closedOn: c.closed ? repliedOn : null,
        },
      });
    }
  }
}
