import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { redateDemos } from '../src/demo/redate';
import { day, seedToday } from './seed-clock';

/**
 * The demo clock (ARCHITECTURE "Demo clock"): before a top-up, bring a demo dated on an earlier day up to today (what the
 * daily job does), so new records and old ones tell one story.
 */
export async function redateDemo(prisma: PrismaClient) {
  const moved = await redateDemos(prisma, seedToday());
  for (const m of moved) console.log(`Demo clock: company ${m.organizationId} moved ${m.days} days forward`);
}

/** After a top-up: the demo company and its group's companies are dated today (only where not yet dated). */
export async function markDemoDated(prisma: PrismaClient, demoOrgId: string) {
  const { groupId } = await prisma.organization.findUniqueOrThrow({ where: { id: demoOrgId }, select: { groupId: true } });
  await prisma.organization.updateMany({ where: { OR: [{ id: demoOrgId }, ...(groupId ? [{ groupId }] : [])], demoDatedOn: null }, data: { demoDatedOn: day(0) } });
}

const phoneOf = (phone: string | null) => `91${(phone ?? '').replace(/\D/g, '').slice(-10)}`;

/**
 * WhatsApp entries (AI item 120): what people sent the company's number over the last week, so the page has a story.
 * The site engineer's indent saved as drafted, a voice note's progress changed in its form, a photo of a fuel bill
 * still waiting to be saved; the project manager's question answered; the director asking for the day's cement.
 * Only when the company has none.
 */
export async function seedWhatsappEntries(prisma: PrismaClient, organizationId: string) {
  if (await prisma.inboundMessage.count({ where: { organizationId } })) return;
  const users = await prisma.user.findMany({ where: { organizationId, email: { in: ['engineer@demo.com', 'pm@demo.com', 'md@demo.com'] } }, select: { id: true, email: true, phone: true } });
  const by = (email: string) => users.find((u) => u.email === email);
  const engineer = by('engineer@demo.com');
  const pm = by('pm@demo.com');
  const md = by('md@demo.com');
  const road = await prisma.project.findFirst({ where: { organizationId, code: 'RD-2026-01' }, select: { id: true, name: true } });
  if (!engineer || !pm || !md || !road) return;
  const indent = await prisma.materialRequest.findFirst({ where: { organizationId, projectId: road.id, submittedById: engineer.id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  const progress = await prisma.progressEntry.findFirst({ where: { organizationId, projectId: road.id, dailyReportId: null }, orderBy: { date: 'desc' }, select: { id: true } });
  const at = (offset: number, hour: number) => new Date(day(offset).getTime() + (hour - 5.5) * 3_600_000);
  const draft = (kind: string, title: string, values: Record<string, unknown>) => ({ kind, title, projectId: road.id, projectName: road.name, values: { projectId: road.id, ...values }, flags: [] }) as unknown as Prisma.InputJsonValue;
  const rows: Prisma.InboundMessageUncheckedCreateInput[] = [
    {
      userId: engineer.id,
      type: 'TEXT',
      text: 'Raise indent for 60 bags OPC 53 cement for RD-2026-01, needed by Friday',
      state: indent ? 'SAVED' : 'DRAFTED',
      draft: draft('material-request', `Indent for ${road.name}: 1 item`, { items: [{ itemName: 'OPC 53 Grade Cement', quantity: 60, unit: 'BAG' }] }),
      reply: 'Indent for 60 bags of OPC 53 Grade Cement drafted. Check the date needed and tap Save.',
      ...(indent ? { recordKind: 'material-request', recordId: indent.id, outcome: 'SAVED' as const, decidedAt: at(-5, 10) } : {}),
      createdAt: at(-5, 9),
    },
    {
      userId: engineer.id,
      type: 'VOICE',
      transcript: 'Aaj kilometre chaudah par ek sau bees metre WBM bichhaya, do roller chale',
      text: null,
      state: progress ? 'SAVED' : 'DRAFTED',
      draft: draft('progress', `Progress on ${road.name}: WBM, 120 m`, { quantity: 120, remarks: 'WBM at Km 14, two rollers' }),
      reply: 'Progress drafted: 120 m of WBM at Km 14. Check the activity and tap Save.',
      ...(progress ? { recordKind: 'progress', recordId: progress.id, outcome: 'CHANGED' as const, decidedAt: at(-2, 18) } : {}),
      createdAt: at(-2, 18),
    },
    {
      userId: engineer.id,
      type: 'TEXT',
      text: 'Paid 2,360 cash for diesel for the water tanker today, bill 4471 from Highway Fuels',
      state: 'DRAFTED',
      draft: draft('expense', `Site expense on ${road.name}: ₹2,360 for fuel, today`, { date: seedToday(), category: 'FUEL', description: 'Diesel for the water tanker', vendor: 'Highway Fuels', billNo: '4471', amount: 2360, gstRate: 0, paymentMode: 'CASH' }),
      reply: 'Site expense of ₹2,360 for fuel drafted. Tap Save to submit it.',
      createdAt: at(0, 8),
    },
    {
      userId: pm.id,
      type: 'TEXT',
      text: 'Which bills are waiting for me on the highway job?',
      state: 'ANSWERED',
      reply: 'The bills waiting for you on Bhubaneswar - Puri Highway are in Approvals, oldest first, with their amounts and checks.',
      createdAt: at(-1, 19),
    },
    {
      userId: md.id,
      type: 'TEXT',
      text: 'How much cement was used across all sites yesterday?',
      state: 'ANSWERED',
      reply: "Yesterday's cement issues by site are on Stock, with the days of stock left at each site.",
      createdAt: at(-1, 9),
    },
  ];
  for (const r of rows) {
    const u = users.find((x) => x.id === r.userId)!;
    await prisma.inboundMessage.create({ data: { ...r, organizationId, fromPhone: phoneOf(u.phone), recordClientId: randomUUID() } });
  }
}
