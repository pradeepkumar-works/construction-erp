/**
 * The newer modules for the demo group's child companies (seed-group.ts made the companies, their people and projects):
 * - Demo Design Consultants: its drawing register for the Jajpur scheme it designs, the design submissions to its sister and
 *   the state engineering college (codes, comments), the drawing schedule on the riverfront PMC, and its letters.
 * - Demo Quality Labs: its NABL central lab and field lab, the testing machines in the calibration register (one due soon,
 *   one overdue), its tests put against the lab and machine, and its letters (a retest asked for, the NABL visit).
 * - Demo Buildcon: the staff quarters' quality plan, the group lab and its site lab with instruments, the drawings it
 *   waits on from the Port Township Board's architect, and its letters.
 * - Demo Infra Holdings: head office letters (the bank on the corporate guarantee, the board meeting, the ROC filing).
 * All names are invented and checked against the client-name blocklist. Each block runs once per company (when that
 * module has nothing yet), so the seed is safe to run again and on a live demo that no longer takes the full seed.
 */
import { Prisma, PrismaClient, type DocumentDiscipline, type LetterAction, type LetterDirection, type LetterMode, type LetterStatus, type ProjectType, type RevisionStatus } from '@prisma/client';
import { HEAD_OFFICE_PREFIX, LETTER_NUMBER_PATTERN, STANDARD_QA_PLANS, formatLetterNo, letterFy, letterPrefixOf, masterCode } from '@erp/shared';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const year = new Date().getUTCFullYear();

type Db = PrismaClient;

async function people(prisma: Db, organizationId: string, emails: string[]) {
  const rows = await prisma.user.findMany({ where: { organizationId, email: { in: emails } }, select: { id: true, email: true } });
  return new Map(rows.map((r) => [r.email, r.id]));
}

async function projectsOf(prisma: Db, organizationId: string) {
  const rows = await prisma.project.findMany({ where: { organizationId }, select: { id: true, code: true, type: true, clientId: true, projectManagerId: true } });
  return new Map(rows.map((r) => [r.code, r]));
}

export async function seedGroupModules(prisma: Db, demoOrgId: string) {
  const { groupId } = await prisma.organization.findUniqueOrThrow({ where: { id: demoOrgId }, select: { groupId: true } });
  if (!groupId) return;
  const companies = await prisma.organization.findMany({ where: { groupId, code: { in: ['DEMODC', 'DEMOLAB', 'DEMOBC', 'DEMOHOLD'] } }, select: { id: true, code: true } });
  const id = (code: string) => companies.find((c) => c.code === code)?.id;
  const dc = id('DEMODC');
  const lab = id('DEMOLAB');
  const bc = id('DEMOBC');
  const hold = id('DEMOHOLD');
  if (dc) {
    await designRegister(prisma, dc);
    await designSubmissions(prisma, dc);
    await designSchedule(prisma, dc);
    await designLetters(prisma, dc);
  }
  if (lab) {
    await labRegisters(prisma, lab);
    await labLetters(prisma, lab);
  }
  if (bc) {
    await buildconQuality(prisma, bc);
    await buildconSchedule(prisma, bc);
    await buildconLetters(prisma, bc);
  }
  if (hold) await holdingLetters(prisma, hold);
}

// ---------------------------------------------------------------------------------------------------------------------
// Correspondence: the address book, letters numbered from their series, marks, and the series' counters.

type ContactSpec = { name: string; office?: string; organisation?: string; address?: string; email?: string; client?: boolean };
type LetterSpec = {
  /** project code, or null for head office */
  project: string | null;
  direction: LetterDirection;
  /** letter date, days from today */
  date: number;
  /** received, days from today (inward) */
  received?: number;
  contact: string;
  subject: string;
  summary?: string;
  body?: string;
  category: string;
  mode?: LetterMode;
  status?: LetterStatus;
  theirRef?: string;
  replyBy?: number;
  by: string;
  signatory?: string;
  mark?: { to: string; action: LetterAction; due: number; note: string; ago: number };
  dispatched?: { docketNo?: string; delivered?: number; proof?: string };
  confidential?: boolean;
  priority?: 'NORMAL' | 'URGENT';
};

async function writeLetters(prisma: Db, organizationId: string, contacts: Record<string, ContactSpec>, letters: LetterSpec[]) {
  if (await prisma.letterContact.count({ where: { organizationId } })) return;
  const projects = await projectsOf(prisma, organizationId);
  const emails = [...new Set(letters.flatMap((l) => [l.by, l.signatory, l.mark?.to].filter((e): e is string => !!e)))];
  const users = await people(prisma, organizationId, emails);
  const firstClient = [...projects.values()].find((p) => p.clientId)?.clientId ?? null;
  const contactIds = new Map<string, { id: string; label: string }>();
  for (const [key, c] of Object.entries(contacts)) {
    const row = await prisma.letterContact.create({
      data: { organizationId, name: c.name, office: c.office ?? null, organisation: c.organisation ?? null, address: c.address ?? null, email: c.email ?? null, clientId: c.client ? firstClient : null },
    });
    contactIds.set(key, { id: row.id, label: [c.name, c.office, c.organisation].filter(Boolean).join(', ') });
  }

  const counters = new Map<string, { direction: LetterDirection; projectId: string | null; prefix: string; fy: string; n: number }>();
  const nextNo = (projectId: string | null, prefix: string, direction: LetterDirection, date: Date) => {
    const fy = letterFy(ymd(date));
    const key = `${projectId ?? 'HO'}:${direction}:${fy}`;
    const c = counters.get(key) ?? { direction, projectId, prefix, fy, n: 0 };
    c.n += 1;
    counters.set(key, c);
    return formatLetterNo(LETTER_NUMBER_PATTERN, { prefix, direction, date: ymd(date), n: c.n });
  };

  for (const l of [...letters].sort((a, b) => (a.received ?? a.date) - (b.received ?? b.date))) {
    const by = users.get(l.by);
    const contact = contactIds.get(l.contact);
    if (!by || !contact) continue;
    const project = l.project ? projects.get(l.project) : null;
    if (l.project && !project) continue;
    const status: LetterStatus = l.status ?? (l.direction === 'IN' ? 'OPEN' : 'ISSUED');
    const numbered = status !== 'DRAFT' && status !== 'AWAITING_APPROVAL';
    const when = day(l.received ?? l.date);
    const signatory = l.signatory ? (users.get(l.signatory) ?? null) : null;
    const letter = await prisma.letter.create({
      data: {
        organizationId,
        projectId: project?.id ?? null,
        direction: l.direction,
        status,
        letterNo: numbered ? nextNo(project?.id ?? null, project ? letterPrefixOf(project.code) : HEAD_OFFICE_PREFIX, l.direction, when) : null,
        theirRef: l.theirRef ?? null,
        letterDate: day(l.date),
        receivedOn: l.received !== undefined ? day(l.received) : null,
        party: contact.label,
        contactId: contact.id,
        subject: l.subject,
        summary: l.summary ?? null,
        body: l.body ?? null,
        category: masterCode(l.category),
        priority: l.priority ?? 'NORMAL',
        confidential: l.confidential ?? false,
        mode: l.mode ?? null,
        replyBy: l.replyBy !== undefined ? day(l.replyBy) : null,
        signatoryId: signatory,
        sentForApprovalAt: status === 'AWAITING_APPROVAL' ? day(l.date) : null,
        approvedAt: status === 'ISSUED' && signatory ? day(l.date) : null,
        signedAt: status === 'ISSUED' && signatory ? day(l.date) : null,
        signedById: status === 'ISSUED' && signatory ? signatory : null,
        docketNo: l.dispatched?.docketNo ?? null,
        dispatchedOn: l.dispatched ? day(l.date) : null,
        deliveredOn: l.dispatched?.delivered !== undefined ? day(l.dispatched.delivered) : null,
        deliveryProof: l.dispatched?.proof ?? null,
        createdById: by,
        createdAt: day(l.received ?? l.date),
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'LETTER', entityId: letter.id, action: status === 'AWAITING_APPROVAL' ? 'SUBMITTED' : 'CREATED', actorId: by, createdAt: day(l.received ?? l.date) } });
    const markTo = l.mark ? users.get(l.mark.to) : undefined;
    if (l.mark && markTo) {
      await prisma.letterMark.create({ data: { organizationId, letterId: letter.id, fromId: by, toId: markTo, action: l.mark.action, dueOn: day(l.mark.due), note: l.mark.note, createdAt: day(-l.mark.ago) } });
      await prisma.letter.update({ where: { id: letter.id }, data: { markedToId: markTo, action: l.mark.action, actionDue: day(l.mark.due) } });
      await prisma.auditLog.create({ data: { organizationId, entityType: 'LETTER', entityId: letter.id, action: 'MARKED', actorId: by, createdAt: day(-l.mark.ago) } });
    }
  }

  // The series, so the next letter recorded continues these numbers.
  const made = new Map<string, string>();
  for (const c of counters.values()) {
    const key = `${c.projectId ?? 'HO'}:${c.direction}`;
    let seriesId = made.get(key);
    if (!seriesId) {
      seriesId = (await prisma.letterSeries.create({ data: { organizationId, projectId: c.projectId, direction: c.direction, prefix: c.prefix, pattern: LETTER_NUMBER_PATTERN } })).id;
      made.set(key, seriesId);
      await prisma.letter.updateMany({ where: { organizationId, projectId: c.projectId, direction: c.direction, letterNo: { not: null } }, data: { seriesId } });
    }
    await prisma.letterSeriesCounter.create({ data: { seriesId, fy: c.fy, last: c.n } });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Demo Design Consultants

const SISTER = 'Demo Infra Projects, for the scheme authority';
const COLLEGE = 'The Head, Department of Civil Engineering, State Engineering College';
const PROMENADE_ARCHITECT = 'The Architect, riverfront promenade';

type DocSpec = { docNo: string; title: string; kind?: 'DRAWING' | 'REPORT'; discipline: DocumentDiscipline; revs: { rev: string; ago: number; status: RevisionStatus; remarks?: string }[] };

/** The Jajpur scheme's drawings and reports as the consultancy issues them, and the promenade drawings it checks as PMC. */
async function designRegister(prisma: Db, organizationId: string) {
  if (await prisma.document.count({ where: { organizationId } })) return;
  const projects = await projectsOf(prisma, organizationId);
  const users = await people(prisma, organizationId, ['dc.design@demo.com', 'dc.re@demo.com']);
  const design = users.get('dc.design@demo.com');
  const re = users.get('dc.re@demo.com');
  if (!design || !re) return;
  const add = async (code: string, by: string, from: string | null, docs: DocSpec[]) => {
    const project = projects.get(code);
    if (!project) return;
    for (const d of docs) {
      const doc = await prisma.document.create({ data: { organizationId, projectId: project.id, docNo: d.docNo, title: d.title, kind: d.kind ?? 'DRAWING', discipline: d.discipline, createdById: by, createdAt: day(-d.revs[0].ago) } });
      let current: string | null = null;
      for (const r of d.revs) {
        current = (await prisma.documentRevision.create({ data: { documentId: doc.id, revision: r.rev, issuedOn: day(-r.ago), status: r.status, receivedFrom: from, remarks: r.remarks ?? null, issuedById: by, createdAt: day(-r.ago) } })).id;
      }
      await prisma.document.update({ where: { id: doc.id }, data: { currentRevisionId: current } });
    }
  };
  await add('DC-2026-01', design, null, [
    { docNo: 'JW-HYD-01', title: 'Design basis report and network hydraulics', kind: 'REPORT', discipline: 'WATER', revs: [{ rev: 'R0', ago: 70, status: 'FOR_APPROVAL' }, { rev: 'R1', ago: 48, status: 'APPROVED', remarks: 'Peak factor 3.0 as asked' }] },
    { docNo: 'JW-WTP-01', title: 'Water treatment plant, 10 MLD, general arrangement', discipline: 'WATER', revs: [{ rev: 'R0', ago: 30, status: 'APPROVED_WITH_COMMENTS' }] },
    { docNo: 'JW-WTP-05', title: 'Clariflocculator, structural details', discipline: 'STRUCTURAL', revs: [{ rev: 'R0', ago: 12, status: 'FOR_APPROVAL' }] },
    { docNo: 'JW-ESR-01', title: 'Elevated reservoir 500 KL on 20 m staging, general arrangement', discipline: 'STRUCTURAL', revs: [{ rev: 'R0', ago: 40, status: 'FOR_APPROVAL' }, { rev: 'R1', ago: 21, status: 'FOR_CONSTRUCTION' }] },
    { docNo: 'JW-ESR-02', title: 'Elevated reservoir, staging and container design calculations', kind: 'REPORT', discipline: 'STRUCTURAL', revs: [{ rev: 'R0', ago: 19, status: 'FOR_APPROVAL' }] },
  ]);
  await add('DC-2026-02', re, PROMENADE_ARCHITECT, [
    { docNo: 'RFP-AR-101', title: 'Promenade paving and landscape layout, stretch 1', discipline: 'ARCHITECTURAL', revs: [{ rev: 'R0', ago: 26, status: 'FOR_CONSTRUCTION' }] },
    { docNo: 'RFP-ST-201', title: 'River retaining wall, typical section', discipline: 'STRUCTURAL', revs: [{ rev: 'R0', ago: 33, status: 'FOR_APPROVAL' }, { rev: 'R1', ago: 9, status: 'FOR_CONSTRUCTION', remarks: 'Weep holes at 1.5 m as checked' }] },
  ]);
}

async function designSubmissions(prisma: Db, organizationId: string) {
  if (await prisma.designSubmission.count({ where: { organizationId } })) return;
  const project = (await projectsOf(prisma, organizationId)).get('DC-2026-01');
  const by = (await people(prisma, organizationId, ['dc.pm@demo.com'])).get('dc.pm@demo.com');
  if (!project || !by) return;
  const docs = await prisma.document.findMany({ where: { projectId: project.id }, select: { id: true, docNo: true, currentRevisionId: true, currentRevision: { select: { issuedOn: true } } } });
  const doc = (no: string) => docs.find((d) => d.docNo === no);
  type Spec = { no: string; title: string; kind: string; purpose: 'APPROVAL' | 'VETTING'; toParty: string; docs: string[]; status: string; rounds: { code?: 'A' | 'B' | 'C'; coded?: number; reviewer?: string; ref?: string }[]; replyDays: number; fee?: string; comments?: { text: string; doc: string; reply?: string; closed?: boolean }[] };
  const specs: Spec[] = [
    { no: '0001', title: 'Design basis and network hydraulics', kind: 'DESIGN_BASIS', purpose: 'APPROVAL', toParty: SISTER, docs: ['JW-HYD-01'], status: 'APPROVED', rounds: [{ code: 'A', coded: 6, reviewer: 'Executive Engineer, scheme authority', ref: 'EE/JJM/DBR/14' }], replyDays: 14 },
    {
      no: '0002', title: 'Water treatment plant general arrangement', kind: 'DRAWINGS', purpose: 'APPROVAL', toParty: SISTER, docs: ['JW-WTP-01'], status: 'APPROVED_AS_NOTED', replyDays: 14,
      rounds: [{ code: 'B', coded: 9, reviewer: 'Executive Engineer, scheme authority', ref: 'EE/JJM/WTP/22' }],
      comments: [
        { text: 'Show the sludge drying beds with the approach road for the tractor.', doc: 'JW-WTP-01', reply: 'Added on sheet 2 with a 3.5 m approach.', closed: true },
        { text: 'Chemical house to be moved upwind of the filter house.', doc: 'JW-WTP-01' },
      ],
    },
    { no: '0003', title: 'Elevated reservoir staging and container calculations', kind: 'CALCULATIONS', purpose: 'VETTING', toParty: COLLEGE, docs: ['JW-ESR-02'], status: 'UNDER_REVIEW', rounds: [{}], replyDays: 10, fee: '45000.00' },
    { no: '0004', title: 'Clariflocculator structural details', kind: 'DRAWINGS', purpose: 'APPROVAL', toParty: SISTER, docs: ['JW-WTP-05'], status: 'UNDER_REVIEW', rounds: [{}], replyDays: 14 },
  ];
  for (const s of specs) {
    const rows = s.docs.map(doc).filter((d): d is NonNullable<typeof d> => !!d?.currentRevisionId && !!d.currentRevision);
    if (rows.length !== s.docs.length) continue;
    const sent = rows[0].currentRevision!.issuedOn;
    const created = await prisma.designSubmission.create({
      data: {
        organizationId, projectId: project.id, submissionNo: `DSN-${year}-${s.no}`, title: s.title, kind: s.kind, purpose: s.purpose, toParty: s.toParty, source: 'OWN',
        replyBy: plus(sent, s.replyDays), status: s.status, revision: s.rounds.length - 1, fee: s.fee ? new Prisma.Decimal(s.fee) : null, createdById: by,
        docs: { create: rows.map((d, i) => ({ documentId: d.id, sortOrder: i })) },
      },
      select: { id: true },
    });
    for (const [i, r] of s.rounds.entries()) {
      await prisma.designSubmissionRound.create({
        data: {
          organizationId, submissionId: created.id, revision: i, submittedOn: sent, submittedById: by, code: r.code ?? null, reviewedOn: r.code ? plus(sent, r.coded ?? 0) : null,
          reviewerName: r.reviewer ?? null, reviewRef: r.ref ?? null, items: { create: rows.map((d) => ({ revisionId: d.currentRevisionId! })) },
        },
      });
    }
    for (const [i, c] of (s.comments ?? []).entries()) {
      const repliedOn = c.reply ? plus(sent, 12) : null;
      await prisma.designComment.create({
        data: { organizationId, submissionId: created.id, commentNo: i + 1, round: 0, documentId: doc(c.doc)?.id ?? null, text: c.text, reply: c.reply ?? null, repliedOn, repliedById: c.reply ? by : null, closedOn: c.closed ? repliedOn : null },
      });
    }
  }
}

async function designSchedule(prisma: Db, organizationId: string) {
  if (await prisma.drawingNeed.count({ where: { organizationId } })) return;
  const projects = await projectsOf(prisma, organizationId);
  const users = await people(prisma, organizationId, ['dc.pm@demo.com', 'dc.re@demo.com']);
  type Line = { docNo?: string; title: string; discipline: DocumentDiscipline; source: string; fromParty?: string; neededBy: number; activity?: string; remarks?: string };
  const add = async (code: string, by: string | undefined, lines: Line[]) => {
    const project = projects.get(code);
    if (!project || !by) return;
    const docs = await prisma.document.findMany({ where: { projectId: project.id }, select: { id: true, docNo: true } });
    const activities = await prisma.activity.findMany({ where: { projectId: project.id }, select: { id: true, name: true } });
    for (const l of lines) {
      await prisma.drawingNeed.create({
        data: {
          organizationId, projectId: project.id, docNo: l.docNo ?? null, title: l.title, discipline: l.discipline, source: l.source, fromParty: l.fromParty ?? null, neededBy: day(l.neededBy),
          activityId: l.activity ? (activities.find((a) => a.name.toLowerCase().includes(l.activity!))?.id ?? null) : null,
          remarks: l.remarks ?? null, documentId: l.docNo ? (docs.find((d) => d.docNo === l.docNo)?.id ?? null) : null, createdById: by,
        },
      });
    }
  };
  // What the sister's site needs from the design, and when.
  await add('DC-2026-01', users.get('dc.pm@demo.com'), [
    { docNo: 'JW-HYD-01', title: 'Design basis report and network hydraulics', discipline: 'WATER', source: 'OWN', neededBy: -50, activity: 'network' },
    { docNo: 'JW-ESR-01', title: 'Elevated reservoir general arrangement', discipline: 'STRUCTURAL', source: 'OWN', neededBy: -18, activity: 'esr' },
    { docNo: 'JW-WTP-05', title: 'Clariflocculator structural details', discipline: 'STRUCTURAL', source: 'OWN', neededBy: -3, activity: 'wtp', remarks: 'The sister has started the WTP raft; the clariflocculator wall details are needed before the next lift.' },
    { title: 'Intake well and approach bridge', discipline: 'STRUCTURAL', source: 'OWN', neededBy: 12, activity: 'wtp' },
    { title: 'House service connection standard details', discipline: 'WATER', source: 'OWN', neededBy: 30 },
  ]);
  // As PMC on the promenade: what the contractor waits on from the client's architect.
  await add('DC-2026-02', users.get('dc.re@demo.com'), [
    { docNo: 'RFP-AR-101', title: 'Paving and landscape layout, stretch 1', discipline: 'ARCHITECTURAL', source: 'ARCHITECT', fromParty: PROMENADE_ARCHITECT, neededBy: -30 },
    { docNo: 'RFP-ST-201', title: 'River retaining wall, typical section', discipline: 'STRUCTURAL', source: 'ARCHITECT', fromParty: PROMENADE_ARCHITECT, neededBy: -14, remarks: 'R1 came nine days late; the wall gang moved to stretch 2 meanwhile.' },
    { title: 'Ghat steps and viewing deck details', discipline: 'ARCHITECTURAL', source: 'ARCHITECT', fromParty: PROMENADE_ARCHITECT, neededBy: -6, remarks: 'Reminded twice at the weekly meeting.' },
    { title: 'Promenade lighting and cabling layout', discipline: 'ELECTRICAL', source: 'ARCHITECT', fromParty: PROMENADE_ARCHITECT, neededBy: 15 },
  ]);
}

async function designLetters(prisma: Db, organizationId: string) {
  await writeLetters(
    prisma,
    organizationId,
    {
      sister: { name: 'The Project Manager', office: 'Jajpur rural water supply scheme', organisation: 'Demo Infra Projects Pvt Ltd', address: 'Scheme office, WTP site, Dharmasala block, Jajpur', client: true },
      rda: { name: 'The Chief Engineer', office: 'Engineering wing', organisation: 'Riverfront Development Authority, Cuttack', address: 'Riverfront Bhawan, Ring Road, Cuttack 753008' },
      rwd: { name: 'The Executive Engineer', office: 'Rural Works Division, Dhenkanal', organisation: 'Rural Works Department', address: 'Division office, Collectorate road, Dhenkanal 759001' },
      college: { name: 'The Head', office: 'Department of Civil Engineering', organisation: 'State Engineering College', address: 'College campus, Bhubaneswar 751003' },
      coa: { name: 'The Registrar', office: 'Registration and renewals', organisation: 'Council of Architecture', address: 'India Habitat Centre, Lodhi Road, New Delhi 110003' },
    },
    [
      { project: 'DC-2026-01', direction: 'OUT', date: -19, contact: 'college', subject: 'Vetting of the elevated reservoir design', summary: 'Calculations for the 500 KL reservoir on 20 m staging, with the fee of ₹45,000 paid.', category: 'Drawing and design', mode: 'COURIER', by: 'dc.pm@demo.com', signatory: 'design@demo.com', dispatched: { docketNo: 'BD71236654', delivered: -17, proof: 'Courier delivered, signed by the department office' } },
      { project: 'DC-2026-01', direction: 'IN', date: -4, received: -3, contact: 'sister', theirRef: 'DIPL/JWS/DES/031', subject: 'Clariflocculator details needed before the next lift', summary: 'The WTP raft is cast; the wall details are needed within the week to keep the pour on 10 Nov.', category: 'Drawing and design', mode: 'EMAIL', replyBy: 2, by: 'dc.pm@demo.com', priority: 'URGENT', mark: { to: 'dc.design@demo.com', action: 'COMPLY', due: 2, note: 'Issue R0 for construction once the college confirms the wall thickness', ago: 3 } },
      { project: 'DC-2026-02', direction: 'IN', date: -9, received: -8, contact: 'rda', theirRef: 'RDA/ENG/PMC/118', subject: 'Monthly progress report of the promenade, format', summary: 'The authority wants the PMC report with photographs of each stretch and the cube results.', category: 'General', mode: 'EMAIL', replyBy: 5, by: 'dc.re@demo.com', mark: { to: 'dc.re@demo.com', action: 'COMPLY', due: 5, note: 'Change the report from this month', ago: 8 } },
      { project: 'DC-2026-02', direction: 'OUT', date: -6, contact: 'rda', subject: 'Delay in the ghat steps drawings', summary: 'The contractor waits on the architect; we ask the authority to have the drawings issued this week.', category: 'Drawing and design', mode: 'HAND', by: 'dc.re@demo.com', signatory: 'dc.pm@demo.com', dispatched: { delivered: -6, proof: 'Received at the inward desk' } },
      { project: 'DC-2026-03', direction: 'IN', date: -12, received: -11, contact: 'rwd', theirRef: 'RWD/DKL/DPR/77', subject: 'Approval of the alignment of the four roads', summary: 'Alignments approved with a shift near the school on road 3; go ahead with the DPR.', category: 'Drawing and design', mode: 'POST', by: 'dc.pm@demo.com', status: 'CLOSED' },
      { project: 'DC-2026-03', direction: 'OUT', date: 0, contact: 'rwd', subject: 'Traffic survey results and pavement design for the four roads', summary: 'Seven-day counts and the design traffic in msa for each road, for the division’s comments.', category: 'Drawing and design', status: 'AWAITING_APPROVAL', by: 'dc.engineer@demo.com', signatory: 'dc.pm@demo.com' },
      { project: null, direction: 'IN', date: -5, received: -4, contact: 'coa', theirRef: 'COA/REN/2026/5512', subject: 'Renewal of the firm’s registration', summary: 'Renewal falls due next month; send the partners’ certificates.', category: 'Statutory and tax', mode: 'EMAIL', replyBy: 20, by: 'dc.accounts@demo.com', mark: { to: 'design@demo.com', action: 'REPLY', due: 15, note: 'Please sign the renewal form', ago: 4 } },
    ],
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Demo Quality Labs

async function labRegisters(prisma: Db, organizationId: string) {
  if (await prisma.qaLab.count({ where: { organizationId } })) return;
  const projects = await projectsOf(prisma, organizationId);
  const tech = (await people(prisma, organizationId, ['lab.tech@demo.com'])).get('lab.tech@demo.com');
  const road = projects.get('LAB-01');
  if (!tech || !road) return;
  const central = await prisma.qaLab.create({
    data: { organizationId, name: 'Central laboratory, Mancheswar', kind: 'NABL', nablNo: 'TC-9150', nablValidTill: day(210), address: 'Plot 31, Mancheswar Industrial Estate, Bhubaneswar 751010', contact: 'Dr. Meera Sahoo', phone: '9800000018', notes: 'Concrete, steel, cement, bricks, soil and bitumen. NABL scope renewed this year.' },
  });
  const field = await prisma.qaLab.create({ data: { organizationId, name: 'Field lab, Km 16 camp', kind: 'SITE', projectId: road.id, contact: 'Rakesh Nayak', notes: 'Field density, gradation and bitumen extraction for the highway.' } });

  const instrument = (o: { lab: string; projectId: string | null; name: string; kind: string; serialNo: string; make: string; range: string; intervalDays: number; calibratedAgo: number; agency: string; certificateNo: string; result?: string }) =>
    prisma.qaInstrument.create({
      data: {
        organizationId, name: o.name, kind: masterCode(o.kind), serialNo: o.serialNo, make: o.make, range: o.range, projectId: o.projectId, labId: o.lab, intervalDays: o.intervalDays,
        lastCalibratedOn: day(-o.calibratedAgo), nextDueOn: plus(day(-o.calibratedAgo), o.intervalDays), lastResult: o.result ?? 'OK', certificateNo: o.certificateNo,
        calibrations: {
          create: [
            { organizationId, calibratedOn: day(-o.calibratedAgo - o.intervalDays), certificateNo: `${o.certificateNo}-P`, agency: o.agency, result: 'OK', nextDueOn: day(-o.calibratedAgo), createdById: tech, createdAt: day(-o.calibratedAgo - o.intervalDays) },
            { organizationId, calibratedOn: day(-o.calibratedAgo), certificateNo: o.certificateNo, agency: o.agency, result: o.result ?? 'OK', nextDueOn: plus(day(-o.calibratedAgo), o.intervalDays), createdById: tech, createdAt: day(-o.calibratedAgo) },
          ],
        },
      },
    });
  const agency = 'National Calibration Services, Kolkata';
  const ctm = await instrument({ lab: central.id, projectId: null, name: 'CTM 3000 kN, digital', kind: 'Compression testing machine', serialNo: 'CTM-3110', make: 'HEICO', range: '0 to 3000 kN', intervalDays: 365, calibratedAgo: 120, agency, certificateNo: 'NCS/26/CTM/0418' });
  const ring = await instrument({ lab: central.id, projectId: null, name: 'Proving ring 50 kN (UTM load check)', kind: 'Proving ring', serialNo: 'PR-50-07', make: 'AIMIL', range: '0 to 50 kN', intervalDays: 365, calibratedAgo: 355, agency, certificateNo: 'NCS/25/PR/1902' });
  await instrument({ lab: central.id, projectId: null, name: 'Hot air oven 0 to 300 °C', kind: 'Oven', serialNo: 'OV-22', make: 'Labline', range: 'Ambient to 300 °C', intervalDays: 365, calibratedAgo: 200, agency, certificateNo: 'NCS/26/OV/0233' });
  const sieves = await instrument({ lab: field.id, projectId: road.id, name: 'IS sieve set, 75 mm to 75 micron', kind: 'Sieves', serialNo: 'SV-14', make: 'Jayant', range: '75 mm to 75 µm', intervalDays: 180, calibratedAgo: 186, agency, certificateNo: 'NCS/26/SV/0101' });
  const scale = await instrument({ lab: field.id, projectId: road.id, name: 'Electronic balance 30 kg', kind: 'Weighing scale', serialNo: 'EB-30-3', make: 'Essae', range: '0 to 30 kg', intervalDays: 365, calibratedAgo: 40, agency: 'Legal Metrology, Khordha', certificateNo: 'LM/VC/26/3310' });
  await instrument({ lab: field.id, projectId: road.id, name: 'Bitumen thermometer', kind: 'Thermometer', serialNo: 'TH-09', make: 'Zeal', range: '0 to 250 °C', intervalDays: 180, calibratedAgo: 30, agency, certificateNo: 'NCS/26/TH/0877' });

  // The lab's own tests against the lab and machine they were done on.
  const tests = await prisma.qualityTest.findMany({ where: { organizationId, labId: null }, select: { id: true, kind: true, projectId: true, sampledOn: true, result: true }, orderBy: { sampledOn: 'asc' } });
  let n = 0;
  for (const t of tests) {
    const atField = t.projectId === road.id && (t.kind === 'FIELD_DENSITY' || t.kind === 'AGGREGATE');
    const reported = t.result !== 'PENDING';
    await prisma.qualityTest.update({
      where: { id: t.id },
      data: {
        labId: atField ? field.id : central.id,
        instrumentId: t.kind === 'CONCRETE_CUBE' || t.kind === 'BRICK' ? ctm.id : t.kind === 'STEEL' ? ring.id : t.kind === 'AGGREGATE' ? sieves.id : t.kind === 'FIELD_DENSITY' ? scale.id : null,
        sentOn: t.sampledOn,
        reportOn: reported ? plus(t.sampledOn, t.kind === 'CONCRETE_CUBE' ? 28 : 3) : null,
        labReportNo: reported ? `DQL/${year}/${String(++n + 300).padStart(4, '0')}` : null,
      },
    });
  }
}

async function labLetters(prisma: Db, organizationId: string) {
  await writeLetters(
    prisma,
    organizationId,
    {
      dipl: { name: 'The Project Manager', office: 'Bhubaneswar–Puri highway widening', organisation: 'Demo Infra Projects Pvt Ltd', address: 'Site office, Km 16+400, Khordha', client: true },
      bc: { name: 'The Project Manager', office: 'Port township staff quarters', organisation: 'Demo Buildcon Pvt Ltd', address: 'Site office, Port township, Paradip 754142' },
      nabl: { name: 'The Assessment Coordinator', office: 'Testing laboratories', organisation: 'National Accreditation Board for Testing and Calibration Laboratories', address: 'Sector 62, Noida 201309' },
    },
    [
      { project: 'LAB-01', direction: 'OUT', date: -3, contact: 'dipl', subject: 'Field density below the specification at Ch. 19+200', summary: 'Two of five spots under 97 per cent of MDD in the GSB layer; we recommend recompaction and a retest before the next layer.', category: 'Quality', mode: 'EMAIL', by: 'lab.pm@demo.com', signatory: 'lab@demo.com' },
      { project: 'LAB-03', direction: 'IN', date: -2, received: -2, contact: 'bc', theirRef: 'DBC/PTSQ/QA/019', subject: 'Retest of the failed cubes, second floor slab', summary: 'Asks for cores from the slab at three places, witnessed by the Board’s engineer.', category: 'Quality', mode: 'EMAIL', replyBy: 3, by: 'lab.pm@demo.com', priority: 'URGENT', mark: { to: 'lab.tech@demo.com', action: 'COMPLY', due: 3, note: 'Take the core cutter on Monday; fix the time with the Board', ago: 2 } },
      { project: 'LAB-02', direction: 'OUT', date: -6, contact: 'dipl', subject: 'Brick compressive strength below 7.5 N/mm²', summary: 'Lot from the new kiln fails; we suggest the lot is rejected and a fresh sample sent.', category: 'Quality', mode: 'HAND', by: 'lab.pm@demo.com', signatory: 'lab@demo.com', dispatched: { delivered: -6, proof: 'Received by the site QA engineer' } },
      { project: null, direction: 'IN', date: -10, received: -9, contact: 'nabl', theirRef: 'NABL/TL/SURV/2026/2241', subject: 'Surveillance assessment of the central laboratory', summary: 'The assessors visit on the dates proposed; send the proficiency testing results and the calibration register.', category: 'Statutory and tax', mode: 'EMAIL', replyBy: 6, by: 'lab.accounts@demo.com', mark: { to: 'lab@demo.com', action: 'REPLY', due: 6, note: 'Confirm the dates; the proving ring calibration is due before the visit', ago: 9 } },
    ],
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Demo Buildcon

async function buildconQuality(prisma: Db, organizationId: string) {
  const projects = await projectsOf(prisma, organizationId);
  const quarters = projects.get('BC-2026-01');
  const engineer = (await people(prisma, organizationId, ['bc.engineer@demo.com'])).get('bc.engineer@demo.com');
  if (!quarters || !engineer) return;
  if (!(await prisma.qaPlanLine.count({ where: { organizationId } })))
    await prisma.qaPlanLine.createMany({ data: STANDARD_QA_PLANS[quarters.type as ProjectType].map((l, i) => ({ organizationId, projectId: quarters.id, ...l, sortOrder: i })) });
  if (await prisma.qaLab.count({ where: { organizationId } })) return;
  await prisma.qaLab.create({
    data: { organizationId, name: 'Demo Quality Labs (group lab)', kind: 'GROUP', nablNo: 'TC-9150', nablValidTill: day(210), address: 'Plot 31, Mancheswar Industrial Estate, Bhubaneswar 751010', contact: 'Er. Debashish Panigrahi', phone: '9800000061', notes: 'Cubes, steel and cores for both sites; the sister’s bills come to us as vendor bills.' },
  });
  const site = await prisma.qaLab.create({ data: { organizationId, name: 'Site lab, staff quarters', kind: 'SITE', projectId: quarters.id, contact: 'Abhishek Rout', notes: 'Slump, cube casting and sieve analysis of sand.' } });
  const instruments: { name: string; kind: string; serialNo: string; range: string; intervalDays: number; ago: number }[] = [
    { name: 'Slump cone', kind: 'Slump cone', serialNo: 'BC-SC-01', range: '300 mm', intervalDays: 365, ago: 90 },
    { name: 'Cube moulds 150 mm, set of 9', kind: 'Cube moulds', serialNo: 'BC-CM-09', range: '150 mm', intervalDays: 365, ago: 371 },
    { name: 'Platform scale 300 kg', kind: 'Weighing scale', serialNo: 'BC-WS-02', range: '0 to 300 kg', intervalDays: 365, ago: 350 },
  ];
  for (const o of instruments) {
    await prisma.qaInstrument.create({
      data: {
        organizationId, name: o.name, kind: masterCode(o.kind), serialNo: o.serialNo, make: 'Local', range: o.range, projectId: quarters.id, labId: site.id, intervalDays: o.intervalDays,
        lastCalibratedOn: day(-o.ago), nextDueOn: plus(day(-o.ago), o.intervalDays), lastResult: 'OK', certificateNo: `DQL/CAL/${o.serialNo}`,
        calibrations: { create: [{ organizationId, calibratedOn: day(-o.ago), certificateNo: `DQL/CAL/${o.serialNo}`, agency: 'Demo Quality Labs', result: 'OK', nextDueOn: plus(day(-o.ago), o.intervalDays), createdById: engineer }] },
      },
    });
  }
}

async function buildconSchedule(prisma: Db, organizationId: string) {
  if (await prisma.drawingNeed.count({ where: { organizationId } })) return;
  const projects = await projectsOf(prisma, organizationId);
  const quarters = projects.get('BC-2026-01');
  const finishes = projects.get('BC-2026-02');
  const pm = (await people(prisma, organizationId, ['bc.pm@demo.com'])).get('bc.pm@demo.com');
  if (!quarters || !pm) return;
  const architect = 'The Architect, Port Township Board';
  const lines: { projectId: string; title: string; discipline: DocumentDiscipline; source: string; fromParty: string; neededBy: number; activity?: string; remarks?: string }[] = [
    { projectId: quarters.id, title: 'Raft and column layout, blocks A and B', discipline: 'STRUCTURAL', source: 'CLIENT', fromParty: architect, neededBy: -60, activity: 'raft' },
    { projectId: quarters.id, title: 'Third floor slab reinforcement', discipline: 'STRUCTURAL', source: 'CLIENT', fromParty: architect, neededBy: -5, activity: 'slab', remarks: 'Shuttering of the third floor is ready; slab gang on other work.' },
    { projectId: quarters.id, title: 'Typical flat plumbing layout', discipline: 'PLUMBING', source: 'CLIENT', fromParty: architect, neededBy: 8, activity: 'plumbing' },
    { projectId: quarters.id, title: 'Kitchen and toilet tile layout', discipline: 'ARCHITECTURAL', source: 'CLIENT', fromParty: architect, neededBy: 24, activity: 'flooring' },
  ];
  if (finishes) {
    lines.push(
      { projectId: finishes.id, title: 'Electrical single line diagram, Block B', discipline: 'ELECTRICAL', source: 'CLIENT', fromParty: 'Demo Infra Projects, hospital site', neededBy: -10, activity: 'panels' },
      { projectId: finishes.id, title: 'Fire fighting riser and sprinkler layout', discipline: 'MECHANICAL', source: 'CLIENT', fromParty: 'Demo Infra Projects, hospital site', neededBy: 6, activity: 'fire' },
    );
  }
  for (const l of lines) {
    const activityId = l.activity ? ((await prisma.activity.findFirst({ where: { projectId: l.projectId, name: { contains: l.activity, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null) : null;
    await prisma.drawingNeed.create({ data: { organizationId, projectId: l.projectId, title: l.title, discipline: l.discipline, source: l.source, fromParty: l.fromParty, neededBy: day(l.neededBy), activityId, remarks: l.remarks ?? null, createdById: pm } });
  }
}

async function buildconLetters(prisma: Db, organizationId: string) {
  await writeLetters(
    prisma,
    organizationId,
    {
      board: { name: 'The Superintending Engineer', office: 'Estate and works wing', organisation: 'Port Township Board, Paradip', address: 'Administrative building, Port township, Paradip 754142', client: true },
      dipl: { name: 'The Project Manager', office: 'District Hospital Block B', organisation: 'Demo Infra Projects Pvt Ltd', address: 'Site office, District Hospital campus, Ring Road, Cuttack 753001' },
      lab: { name: 'The Laboratory Manager', office: 'Central laboratory', organisation: 'Demo Quality Labs Pvt Ltd', address: 'Plot 31, Mancheswar Industrial Estate, Bhubaneswar 751010' },
    },
    [
      { project: 'BC-2026-01', direction: 'IN', date: -7, received: -6, contact: 'board', theirRef: 'PTB/EW/SQ/204', subject: 'Third floor slab: drawings and pour approval', summary: 'Revised reinforcement drawings follow; do not pour the third floor slab until they are issued.', category: 'Drawing and design', mode: 'HAND', replyBy: 4, by: 'bc.pm@demo.com', mark: { to: 'bc.engineer@demo.com', action: 'NOTE', due: 4, note: 'Hold the slab; move the gang to block masonry', ago: 6 } },
      { project: 'BC-2026-01', direction: 'OUT', date: -2, contact: 'board', subject: 'Hindrance: third floor slab drawings awaited', summary: 'Shuttering and steel are ready since the 5th; idle gang and shuttering hire from that day are to the Board’s account.', category: 'Hindrance', mode: 'SPEED_POST', by: 'bc.qs@demo.com', signatory: 'bc.pm@demo.com', dispatched: { docketNo: 'EO553219874IN' } },
      { project: 'BC-2026-01', direction: 'OUT', date: -3, contact: 'lab', subject: 'Retest of the failed cubes, second floor slab', summary: 'Please take three cores from the second floor slab, witnessed by the Board’s engineer.', category: 'Quality', mode: 'EMAIL', by: 'bc.engineer@demo.com', signatory: 'bc.pm@demo.com' },
      { project: 'BC-2026-02', direction: 'IN', date: -4, received: -4, contact: 'dipl', theirRef: 'DIPL/DHB/SC/012', subject: 'Handing over of the second floor for finishes', summary: 'Second floor free from the 10th; start tiling and conduiting to keep the handover date.', category: 'General', mode: 'EMAIL', by: 'bc.pm2@demo.com', status: 'CLOSED' },
      { project: 'BC-2026-02', direction: 'OUT', date: 0, contact: 'dipl', subject: 'RA bill 3 for the finishes and MEP works', summary: 'Covering letter with the measurement sheets and the joint record of the first floor.', category: 'Bill and payment', status: 'AWAITING_APPROVAL', by: 'bc.qs@demo.com', signatory: 'bc.pm2@demo.com' },
    ],
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Demo Infra Holdings

async function holdingLetters(prisma: Db, organizationId: string) {
  await writeLetters(
    prisma,
    organizationId,
    {
      bank: { name: 'The Chief Manager', office: 'Corporate banking branch, Bhubaneswar', organisation: 'Union Bank of India', address: 'Janpath, Unit 9, Bhubaneswar 751022' },
      roc: { name: 'The Registrar of Companies', office: 'Odisha', organisation: 'Ministry of Corporate Affairs', address: 'Corporate Bhawan, Cuttack 753001' },
      board: { name: 'The Directors', office: 'Board of directors', organisation: 'Demo Infra Holdings Pvt Ltd', address: 'Registered office, Bhubaneswar' },
    },
    [
      { project: null, direction: 'IN', date: -8, received: -7, contact: 'bank', theirRef: 'UBI/CBB/CG/2026/41', subject: 'Corporate guarantee for Demo Buildcon’s working capital limit', summary: 'Renewal of the limit needs the holding’s board resolution and a fresh guarantee deed.', category: 'Bank', mode: 'HAND', replyBy: 10, by: 'cfo@demo.com', confidential: true, mark: { to: 'md@demo.com', action: 'REPLY', due: 8, note: 'Board resolution at the meeting on the 12th', ago: 7 } },
      { project: null, direction: 'OUT', date: -5, contact: 'board', subject: 'Notice of the board meeting', summary: 'Agenda: guarantee for Demo Buildcon, the loan to Demo Quality Labs and the half-year accounts.', category: 'Invitation and meeting', mode: 'EMAIL', by: 'cfo@demo.com', signatory: 'md@demo.com' },
      { project: null, direction: 'IN', date: -15, received: -14, contact: 'roc', theirRef: 'ROC/CTC/2026/AOC/887', subject: 'Annual return and financial statements, filing acknowledged', summary: 'Forms for the last year taken on record.', category: 'Statutory and tax', mode: 'PORTAL', by: 'accounts@demo.com', status: 'CLOSED' },
    ],
  );
}
