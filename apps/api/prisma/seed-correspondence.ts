/**
 * Demo correspondence: the address book, the road project's letters given their categories, marks, dispatch and
 * proof, a reply waiting for the project manager's signature, and a head office letter from the bank. Numbers come from
 * the same series the service uses, so the next letter recorded continues them. Runs once per company (when it has no
 * address book yet), after `seedDocuments` made the road project's letters.
 */
import { PrismaClient } from '@prisma/client';
import { HEAD_OFFICE_PREFIX, LETTER_NUMBER_PATTERN, formatLetterNo, letterFy, letterPrefixOf, type LetterDirection } from '@erp/shared';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function seedCorrespondence(prisma: PrismaClient, organizationId: string) {
  if (await prisma.letterContact.count({ where: { organizationId } })) return;
  const road = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' }, select: { id: true, code: true, projectManagerId: true, clientId: true } });
  if (!road?.projectManagerId) return;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id ?? null;
  const [docs, qaqc, qs, md] = await Promise.all([user('docs@demo.com'), user('qaqc@demo.com'), user('qs@demo.com'), user('md@demo.com')]);
  const pm = road.projectManagerId;
  const desk = docs ?? pm;

  const contact = (data: { name: string; office?: string; organisation?: string; address?: string; email?: string; clientId?: string | null }) =>
    prisma.letterContact.create({ data: { organizationId, name: data.name, office: data.office ?? null, organisation: data.organisation ?? null, address: data.address ?? null, email: data.email ?? null, clientId: data.clientId ?? null } });
  const ee = await contact({ name: 'The Executive Engineer', office: 'R&B Division, Khordha', organisation: 'Works Department', address: 'R&B Division Office, Station Road, Khordha 752055', clientId: road.clientId });
  const ae = await contact({ name: 'The Team Leader', office: 'Authority Engineer, Bhubaneswar–Puri', organisation: 'LEA Associates', address: 'Plot 214, Jaydev Vihar, Bhubaneswar 751013', email: 'ae.bbsrpuri@example.com' });
  const bank = await contact({ name: 'The Branch Manager', office: 'Commercial Branch, Bhubaneswar', organisation: 'State Bank of India', address: 'Janpath, Bhubaneswar 751001' });
  await contact({ name: 'The Assistant Commissioner', office: 'Circle 2, Bhubaneswar', organisation: 'GST Department', address: 'Rajaswa Bhawan, Bhubaneswar 751001' });

  // The road project's letters from seedDocuments: their parties, categories and how they went.
  const letters = await prisma.letter.findMany({ where: { organizationId, projectId: road.id }, orderBy: { letterDate: 'asc' } });
  const bySubject = (start: string) => letters.find((l) => l.subject.startsWith(start));
  const counters = new Map<string, { direction: LetterDirection; projectId: string | null; prefix: string; fy: string; n: number }>();
  const nextNo = (projectId: string | null, prefix: string, direction: LetterDirection, date: Date) => {
    const fy = letterFy(ymd(date));
    const key = `${projectId ?? 'HO'}:${direction}:${fy}`;
    const c = counters.get(key) ?? { direction, projectId, prefix, fy, n: 0 };
    c.n += 1;
    counters.set(key, c);
    return formatLetterNo(LETTER_NUMBER_PATTERN, { prefix, direction, date: ymd(date), n: c.n });
  };
  const roadPrefix = letterPrefixOf(road.code);
  for (const l of letters) {
    const letterNo = nextNo(road.id, roadPrefix, l.direction, l.receivedOn ?? l.letterDate);
    const toEe = l.party.startsWith('Executive Engineer');
    await prisma.letter.update({ where: { id: l.id }, data: { letterNo, contactId: toEe ? ee.id : l.party.startsWith('LEA') ? ae.id : null, party: toEe ? 'The Executive Engineer, R&B Division, Khordha' : l.party.startsWith('LEA') ? 'The Team Leader, Authority Engineer, LEA Associates' : l.party } });
  }
  const notice = bySubject('Hindrance:');
  if (notice) await prisma.letter.update({ where: { id: notice.id }, data: { category: 'hindrance', signatoryId: pm, approvedAt: notice.letterDate, mode: 'SPEED_POST', docketNo: 'EO481236957IN', dispatchedOn: notice.letterDate, deliveredOn: day(-15), deliveryProof: 'Speed post delivered, tracking kept' } });
  const eot = bySubject('Request for extension of time');
  if (eot) await prisma.letter.update({ where: { id: eot.id }, data: { category: 'extension-of-time', signatoryId: pm, approvedAt: eot.letterDate, mode: 'HAND', dispatchedOn: eot.letterDate, replyBy: day(10) } });
  const eviction = bySubject('Re: encroachment');
  if (eviction) await prisma.letter.update({ where: { id: eviction.id }, data: { category: 'hindrance', mode: 'POST', status: 'CLOSED', closedAt: day(-9), closedById: pm, closedNote: 'Noted: the stretch follows the eviction drive' } });
  const gsb = bySubject('Comments on the GSB trial stretch');
  const report = bySubject('Monthly progress report format');
  const mark = async (letterId: string, toId: string, action: 'REPLY' | 'COMPLY', due: Date, note: string, ago: number) => {
    await prisma.letterMark.create({ data: { organizationId, letterId, fromId: desk, toId, action, dueOn: due, note, createdAt: day(-ago) } });
    await prisma.letter.update({ where: { id: letterId }, data: { markedToId: toId, action, actionDue: due } });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'LETTER', entityId: letterId, action: 'MARKED', actorId: desk, createdAt: day(-ago) } });
  };
  if (gsb) {
    await prisma.letter.update({ where: { id: gsb.id }, data: { category: 'quality', mode: 'EMAIL', priority: 'URGENT' } });
    if (qaqc) await mark(gsb.id, qaqc, 'REPLY', day(3), 'Send the revised job mix with the fresh gradation results', 3);
  }
  if (report) {
    await prisma.letter.update({ where: { id: report.id }, data: { category: 'general', mode: 'EMAIL' } });
    await mark(report.id, pm, 'COMPLY', day(-2), 'Change the monthly report to their format from this month', 9);
  }

  // The reply to the GSB comments, drafted by the QS and waiting for the project manager's signature.
  if (gsb && qs) {
    const draft = await prisma.letter.create({
      data: {
        organizationId,
        projectId: road.id,
        direction: 'OUT',
        status: 'AWAITING_APPROVAL',
        letterDate: day(0),
        party: 'The Team Leader, Authority Engineer, LEA Associates',
        contactId: ae.id,
        subject: 'Re: Comments on the GSB trial stretch',
        category: 'quality',
        body: `With reference to your letter ${gsb.theirRef} regarding the gradation of the GSB trial stretch, we submit the revised job mix formula with fresh sieve analysis of the material from the new source.\n\nThe revised mix is within the specified grading. We request your approval to lay the next trial stretch on the coming Monday.`,
        inReplyToId: gsb.id,
        signatoryId: pm,
        sentForApprovalAt: day(0),
        createdById: qs,
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'LETTER', entityId: draft.id, action: 'SUBMITTED', actorId: qs, createdAt: day(0) } });
  }

  // Head office: the bank's letter on the guarantee limit, marked to the managing director.
  const received = day(-1);
  const hoNo = nextNo(null, HEAD_OFFICE_PREFIX, 'IN', received);
  const ho = await prisma.letter.create({
    data: {
      organizationId,
      projectId: null,
      direction: 'IN',
      status: 'OPEN',
      letterNo: hoNo,
      theirRef: 'SBI/CB/BG/2026/77',
      letterDate: day(-3),
      receivedOn: received,
      party: 'The Branch Manager, Commercial Branch, State Bank of India',
      contactId: bank.id,
      subject: 'Renewal of the bank guarantee limit',
      summary: 'The guarantee limit falls due for renewal; send the audited accounts and the order book by the date asked.',
      category: 'bank',
      mode: 'HAND',
      replyBy: day(12),
      confidential: true,
      createdById: desk,
    },
  });
  if (md) await mark(ho.id, md, 'REPLY', day(10), 'Accounts to prepare the papers; please sign the reply', 1);

  // The series, so the next letter recorded continues these numbers.
  const made = new Map<string, string>();
  for (const c of counters.values()) {
    const key = `${c.projectId ?? 'HO'}:${c.direction}`;
    let seriesId = made.get(key);
    if (!seriesId) {
      seriesId = (await prisma.letterSeries.create({ data: { organizationId, projectId: c.projectId, direction: c.direction, prefix: c.projectId ? roadPrefix : HEAD_OFFICE_PREFIX, pattern: LETTER_NUMBER_PATTERN } })).id;
      made.set(key, seriesId);
      await prisma.letter.updateMany({ where: { organizationId, projectId: c.projectId, direction: c.direction, letterNo: { not: null } }, data: { seriesId } });
    }
    await prisma.letterSeriesCounter.create({ data: { seriesId, fy: c.fy, last: c.n } });
  }
}
