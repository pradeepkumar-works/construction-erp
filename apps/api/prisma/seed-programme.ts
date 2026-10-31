/**
 * Demo programme and EOT (item 173). On the road: four revisions of the programme (Rev 0 approved, Rev 1 returned with
 * comments, Rev 2 approved and in force, Rev 3 with the client's engineer since last month, so the next update is due
 * soon), and an extension of time applied for the encroachment delay, waiting for the engineer to forward it. On the
 * building: the drawing revision delay's 7 days, granted on an application the consultant forwarded. The other works
 * projects keep a monthly update from the first programme on, the latest one with the client if it went this week. Runs once per
 * company (when it has no programme revision yet), after the risks, the contracts and the guests.
 */
import { PrismaClient } from '@prisma/client';

const DAY = 86_400_000;
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

export async function seedProgramme(prisma: PrismaClient, organizationId: string) {
  if (await prisma.programmeSubmission.count({ where: { organizationId } })) return;
  const [road, building, client, pmc] = await Promise.all([
    prisma.project.findFirst({ where: { organizationId, code: 'RD-2026-01' }, select: { id: true, projectManagerId: true, agreementDate: true } }),
    prisma.project.findFirst({ where: { organizationId, code: 'BL-2026-02' }, select: { id: true, projectManagerId: true } }),
    prisma.user.findFirst({ where: { organizationId, email: 'client@demo.com' }, select: { id: true } }),
    prisma.user.findFirst({ where: { organizationId, email: 'pmc@demo.com' }, select: { id: true } }),
  ]);

  if (road?.projectManagerId && client) {
    const pm = road.projectManagerId;
    const plan = await prisma.activity.aggregate({ where: { projectId: road.id }, _count: { _all: true }, _max: { plannedEnd: true } });
    if (plan._count._all) {
      const finish = plan._max.plannedEnd;
      const earlier = (days: number) => (finish ? new Date(finish.getTime() - days * DAY) : null);
      // Never before the agreement: the first revision goes 12 days after it.
      const start = road.agreementDate ? Math.round((road.agreementDate.getTime() - day(0).getTime()) / DAY) + 12 : -118;
      const at = (ago: number) => day(Math.max(-ago, start));
      const revisions = [
        { sent: 118, finish: earlier(21), status: 'APPROVED' as const, answered: 110, note: 'Baseline programme as per the agreement.', comments: null },
        { sent: 88, finish: earlier(14), status: 'RETURNED' as const, answered: 82, note: 'Embankment resequenced around the encroachment at Ch 12+300.', comments: 'Show the bridge works on a separate sheet and the monsoon allowance for GSB and WMM. Resubmit within 7 days.' },
        { sent: 75, finish: earlier(7), status: 'APPROVED' as const, answered: 66, note: 'Comments of the engineer answered: bridge works shown separately, monsoon allowance added.', comments: null },
        { sent: 27, finish, status: 'SUBMITTED' as const, answered: null, note: 'Monthly update: GSB delayed by the rain, encroachment stretch held back.', comments: null },
      ];
      for (const [revision, r] of revisions.entries())
        await prisma.programmeSubmission.create({
          data: {
            organizationId, projectId: road.id, revision, submittedOn: at(r.sent), submittedById: pm, letterRef: `PRG/${String(revision + 1).padStart(2, '0')}`, note: r.note,
            activityCount: plan._count._all, plannedFinish: r.finish, status: r.status,
            decidedOn: r.answered === null ? null : at(r.answered), decidedById: r.answered === null ? null : client.id, decisionNote: r.comments,
            createdAt: at(r.sent),
          },
        });
    }

    const encroachment = await prisma.risk.findFirst({ where: { projectId: road.id, kind: 'DELAY', title: { startsWith: 'Encroachment' }, eotApplicationId: null }, select: { id: true, delayStart: true } });
    if (encroachment) {
      // Counted as the register counts a delay still holding work up: from its first day to today, both days in.
      const lost = encroachment.delayStart ? Math.round((day(0).getTime() - encroachment.delayStart.getTime()) / DAY) + 1 : 14;
      await prisma.eotApplication.create({
        data: {
          organizationId, projectId: road.id, appNo: 1, basis: 'DELAY', appliedOn: day(-4), daysClaimed: lost, letterRef: 'EOT/01',
          grounds: 'Shops and a cattle shed inside the right of way from Ch 12+300 to 12+650 hold up 350 m of embankment. The site was not handed over free of encroachment as the contract requires; the hindrance was notified the day it started.',
          createdById: road.projectManagerId, createdAt: day(-4),
          delays: { connect: [{ id: encroachment.id }] },
        },
      });
      await prisma.risk.update({ where: { id: encroachment.id }, data: { eotClaimed: true } });
    }
  }

  await monthlyUpdates(prisma, organizationId);

  if (building?.projectManagerId && pmc) {
    // The contract seed already granted this delay its 7 days: the application is the record of that decision.
    const drawings = await prisma.risk.findFirst({ where: { projectId: building.id, kind: 'DELAY', title: { startsWith: 'GF slab reinforcement drawings' }, eotApplicationId: null }, select: { id: true, eotGrantedDays: true } });
    if (drawings) {
      const granted = drawings.eotGrantedDays ?? 7;
      await prisma.eotApplication.create({
        data: {
          organizationId, projectId: building.id, appNo: 1, basis: 'DELAY', appliedOn: day(-10), daysClaimed: granted, letterRef: 'EOT/01',
          grounds: 'The architect revised the ground floor slab reinforcement drawings after the shuttering was up; the bar bending schedule was redone and the pour waited for the revised drawings.',
          status: 'DECIDED', forwardedOn: day(-8), forwardedById: pmc.id, recommendedDays: granted, forwardNote: 'Verified against the drawing register: revision R2 issued late.',
          decidedOn: day(-3), grantedDays: granted, decisionRef: 'Client letter 412', decidedById: building.projectManagerId,
          createdById: building.projectManagerId, createdAt: day(-10),
          delays: { connect: [{ id: drawings.id }] },
        },
      });
      await prisma.risk.update({ where: { id: drawings.id }, data: { eotClaimed: true, eotGrantedDays: granted } });
    }
  }
}

/**
 * Every other active works project with a plan: Rev 0 on the day the Contract tab marks the programme met (else 12 days
 * after the agreement or start), then an update every 30 days, each approved a week later; the latest waits for its
 * answer when it went in the last week.
 */
async function monthlyUpdates(prisma: PrismaClient, organizationId: string) {
  const projects = await prisma.project.findMany({
    where: { organizationId, status: 'ACTIVE', type: { notIn: ['STORE', 'PLANT'] }, programmeSubmissions: { none: {} }, projectManagerId: { not: null } },
    select: { id: true, projectManagerId: true, agreementDate: true, startDate: true, contractObligations: { where: { code: 'PROGRAMME' }, select: { metOn: true } } },
  });
  const today = day(0).getTime();
  for (const p of projects) {
    const plan = await prisma.activity.aggregate({ where: { projectId: p.id }, _count: { _all: true }, _max: { plannedEnd: true } });
    const from = p.contractObligations[0]?.metOn ?? (p.agreementDate ?? p.startDate ? new Date((p.agreementDate ?? p.startDate)!.getTime() + 12 * DAY) : null);
    if (!plan._count._all || !from || from.getTime() > today) continue;
    const sent: number[] = [];
    for (let t = from.getTime(); t <= today; t += 30 * DAY) sent.push(t);
    for (const [revision, t] of sent.entries()) {
      const waiting = revision === sent.length - 1 && today - t < 7 * DAY;
      await prisma.programmeSubmission.create({
        data: {
          organizationId, projectId: p.id, revision, submittedOn: new Date(t), submittedById: p.projectManagerId!, letterRef: `PRG/${String(revision + 1).padStart(2, '0')}`,
          note: revision === 0 ? 'Baseline programme as per the agreement.' : 'Monthly update.', activityCount: plan._count._all, plannedFinish: plan._max.plannedEnd,
          status: waiting ? 'SUBMITTED' : 'APPROVED', decidedOn: waiting ? null : new Date(Math.min(t + 7 * DAY, today)), decidedById: waiting ? null : p.projectManagerId,
          decidedByName: waiting ? null : "Engineer in charge (client's letter)", createdAt: new Date(t),
        },
      });
    }
  }
}
