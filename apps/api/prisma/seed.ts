/* Demo seed: one organisation, a user for every role, three projects (one per type) with BOQ,
 * activities, approved and pending progress, DPRs and material requests. Safe to re-run. */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { deflateSync } from 'zlib';
import { dprTitle, progressTitle, titleDate } from '../src/common/submission-titles';

const prisma = new PrismaClient();
const D = (v: string | number) => new Prisma.Decimal(v);
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

const ROLES: [string, string][] = [
  ['ADMIN', 'Admin'],
  ['MANAGEMENT', 'Management'],
  ['PROJECT_MANAGER', 'Project Manager'],
  ['TEAM_LEADER', 'Team Leader / Site Supervisor'],
  ['SITE_ENGINEER', 'Site Engineer'],
  ['STORE_MANAGER', 'Store Manager'],
  ['QUANTITY_SURVEYOR', 'Quantity Surveyor'],
  ['PROCUREMENT_MANAGER', 'Procurement Manager'],
  ['QA_QC_ENGINEER', 'QA/QC Engineer'],
  ['ACCOUNTS_MANAGER', 'Accounts Manager'],
  ['HR_MANAGER', 'HR Manager'],
];

const USERS: { email: string; name: string; role: string; phone: string }[] = [
  { email: 'admin@demo.com', name: 'Arun Sharma', role: 'ADMIN', phone: '9800000001' },
  { email: 'md@demo.com', name: 'Rajesh Patnaik', role: 'MANAGEMENT', phone: '9800000002' },
  { email: 'pm@demo.com', name: 'Suresh Nair', role: 'PROJECT_MANAGER', phone: '9800000003' },
  { email: 'pm2@demo.com', name: 'Kavita Rao', role: 'PROJECT_MANAGER', phone: '9800000004' },
  { email: 'tl@demo.com', name: 'Manoj Das', role: 'TEAM_LEADER', phone: '9800000005' },
  { email: 'engineer@demo.com', name: 'Priya Mohanty', role: 'SITE_ENGINEER', phone: '9800000006' },
  { email: 'engineer2@demo.com', name: 'Vikram Singh', role: 'SITE_ENGINEER', phone: '9800000007' },
  { email: 'store@demo.com', name: 'Ramesh Behera', role: 'STORE_MANAGER', phone: '9800000008' },
  { email: 'qs@demo.com', name: 'Anita Verma', role: 'QUANTITY_SURVEYOR', phone: '9800000009' },
  { email: 'procurement@demo.com', name: 'Deepak Kumar', role: 'PROCUREMENT_MANAGER', phone: '9800000010' },
  { email: 'qaqc@demo.com', name: 'Sneha Iyer', role: 'QA_QC_ENGINEER', phone: '9800000011' },
  { email: 'accounts@demo.com', name: 'Mahesh Gupta', role: 'ACCOUNTS_MANAGER', phone: '9800000012' },
  { email: 'hr@demo.com', name: 'Pooja Reddy', role: 'HR_MANAGER', phone: '9800000013' },
];

interface BoqSeed { itemNo: string; description: string; unit: string; rate: string; qty: string; activity: string; start: number; end: number; done: string[] }

const ROAD_BOQ: BoqSeed[] = [
  { itemNo: '1.01', description: 'Clearing and grubbing including removal of vegetation', unit: 'Sqm', rate: '18.50', qty: '85000', activity: 'Site clearance', start: -120, end: -90, done: ['85000'] },
  { itemNo: '2.01', description: 'Earthwork in embankment with approved borrow material', unit: 'Cum', rate: '285.00', qty: '42000', activity: 'Earthwork embankment', start: -100, end: -30, done: ['12000', '11500', '9800', '6200'] },
  { itemNo: '3.01', description: 'Granular Sub Base (GSB) Grading-II', unit: 'Cum', rate: '1650.00', qty: '9800', activity: 'GSB laying', start: -60, end: 10, done: ['2400', '2100', '1900'] },
  { itemNo: '3.02', description: 'Wet Mix Macadam (WMM)', unit: 'Cum', rate: '2150.00', qty: '7400', activity: 'WMM laying', start: -40, end: 30, done: ['1500', '1300'] },
  { itemNo: '4.01', description: 'Dense Bituminous Macadam (DBM) 50mm', unit: 'MT', rate: '7850.00', qty: '5200', activity: 'DBM paving', start: -10, end: 60, done: ['420'] },
  { itemNo: '4.02', description: 'Bituminous Concrete (BC) 30mm', unit: 'MT', rate: '8900.00', qty: '3100', activity: 'BC paving', start: 20, end: 90, done: [] },
  { itemNo: '5.01', description: 'RCC pipe culvert 1200mm dia including headwalls', unit: 'Nos', rate: '485000.00', qty: '6', activity: 'Pipe culverts', start: -80, end: -5, done: ['2', '1', '1'] },
  { itemNo: '6.01', description: 'Road furniture: signage, km stones, guard rails', unit: 'LS', rate: '2450000.00', qty: '1', activity: 'Road furniture', start: 60, end: 120, done: [] },
];

const BUILDING_BOQ: BoqSeed[] = [
  { itemNo: '1.01', description: 'Excavation in all types of soil for foundation', unit: 'Cum', rate: '210.00', qty: '3200', activity: 'Foundation excavation', start: -90, end: -70, done: ['3200'] },
  { itemNo: '2.01', description: 'PCC 1:4:8 below foundation', unit: 'Cum', rate: '5400.00', qty: '280', activity: 'PCC bed', start: -70, end: -60, done: ['280'] },
  { itemNo: '3.01', description: 'RCC M25 in footings and columns up to plinth', unit: 'Cum', rate: '7850.00', qty: '640', activity: 'RCC footings and columns', start: -60, end: -30, done: ['220', '210', '150'] },
  { itemNo: '3.02', description: 'RCC M25 in slab and beams - Ground floor', unit: 'Cum', rate: '8100.00', qty: '420', activity: 'RCC slab GF', start: -30, end: 0, done: ['180', '140'] },
  { itemNo: '3.03', description: 'RCC M25 in slab and beams - First floor', unit: 'Cum', rate: '8100.00', qty: '420', activity: 'RCC slab FF', start: 0, end: 30, done: [] },
  { itemNo: '4.01', description: 'Brick masonry in CM 1:6, 230mm thick', unit: 'Cum', rate: '6200.00', qty: '980', activity: 'Brick masonry', start: -15, end: 60, done: ['95'] },
  { itemNo: '5.01', description: 'Cement plaster 12mm thick internal', unit: 'Sqm', rate: '245.00', qty: '14500', activity: 'Internal plaster', start: 30, end: 100, done: [] },
  { itemNo: '6.01', description: 'Vitrified tile flooring 600x600', unit: 'Sqm', rate: '1150.00', qty: '6800', activity: 'Flooring', start: 70, end: 130, done: [] },
];

const WATER_BOQ: BoqSeed[] = [
  { itemNo: '1.01', description: 'Intake well 6m dia, 18m deep including sinking', unit: 'Nos', rate: '18500000.00', qty: '1', activity: 'Intake well', start: -150, end: -40, done: ['1'] },
  { itemNo: '2.01', description: 'Supply and laying DI K9 pipe 400mm raw water main', unit: 'Rmt', rate: '6850.00', qty: '8200', activity: 'Raw water main laying', start: -100, end: -10, done: ['2600', '2400', '2100'] },
  { itemNo: '3.01', description: 'Water Treatment Plant 10 MLD civil works', unit: 'LS', rate: '42000000.00', qty: '1', activity: 'WTP civil works', start: -90, end: 90, done: [] },
  { itemNo: '4.01', description: 'Overhead tank (ESR) 500 KL, 20m staging', unit: 'Nos', rate: '9800000.00', qty: '3', activity: 'ESR construction', start: -60, end: 120, done: ['1'] },
  { itemNo: '5.01', description: 'Supply and laying HDPE PE100 distribution 110mm', unit: 'Rmt', rate: '920.00', qty: '46000', activity: 'Distribution network', start: -40, end: 150, done: ['6500', '5800'] },
  { itemNo: '6.01', description: 'House service connections with meter', unit: 'Nos', rate: '4200.00', qty: '5400', activity: 'House connections', start: 30, end: 200, done: [] },
];

async function main() {
  const org = await prisma.organization.upsert({ where: { code: 'DEMO' }, update: {}, create: { code: 'DEMO', name: 'Demo Infra Projects Pvt Ltd' } });

  const roles = new Map<string, string>();
  for (const [key, name] of ROLES) {
    const r = await prisma.role.upsert({ where: { organizationId_key: { organizationId: org.id, key } }, update: { name }, create: { organizationId: org.id, key, name } });
    roles.set(key, r.id);
  }

  const passwordHash = await bcrypt.hash('password123', 10);
  const users = new Map<string, string>();
  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: u.email } },
      update: { fullName: u.name, roleId: roles.get(u.role)!, phone: u.phone, isActive: true },
      create: { organizationId: org.id, email: u.email, fullName: u.name, roleId: roles.get(u.role)!, phone: u.phone, passwordHash },
    });
    users.set(u.email, row.id);
  }

  const already = await prisma.project.count({ where: { organizationId: org.id } });
  if (already > 0) {
    await seedAttendance(org.id);
    await seedStock(org.id);
    await seedMachinery(org.id);
    await seedExpenses(org.id);
    await seedMeasurements(org.id);
    await seedCostRates(org.id);
    await seedRisks(org.id);
    await seedContracts(org.id);
    await seedApprovalRules(org.id);
    console.log('Projects already seeded; users/roles refreshed. Run `pnpm db:reset` for a clean slate.');
    return;
  }

  const projects = [
    {
      code: 'RD-2026-01', name: 'Bhubaneswar - Puri Highway Widening (Km 12 to Km 28)', type: 'ROAD' as const, client: 'Odisha Works Department', consultant: 'LEA Associates', location: 'Khordha, Odisha',
      wo: 'WO/OWD/2025/0417', start: -120, end: 240, value: '186500000.00', pm: 'pm@demo.com', members: ['tl@demo.com', 'engineer@demo.com', 'store@demo.com', 'qs@demo.com', 'qaqc@demo.com'], boq: ROAD_BOQ, engineer: 'engineer@demo.com',
    },
    {
      code: 'BL-2026-02', name: 'District Hospital Block B (G+3)', type: 'BUILDING' as const, client: 'Dept. of Health & Family Welfare', consultant: 'Shilpa Architects', location: 'Cuttack, Odisha',
      wo: 'WO/DHFW/2025/1188', start: -90, end: 300, value: '94200000.00', pm: 'pm2@demo.com', members: ['engineer2@demo.com', 'store@demo.com', 'qs@demo.com', 'qaqc@demo.com'], boq: BUILDING_BOQ, engineer: 'engineer2@demo.com',
    },
    {
      code: 'WS-2026-03', name: 'Jajpur Rural Piped Water Supply Scheme', type: 'WATER_SUPPLY' as const, client: 'RWSS Odisha (Jal Jeevan Mission)', consultant: 'WAPCOS', location: 'Jajpur, Odisha',
      wo: 'WO/RWSS/2025/0922', start: -150, end: 420, value: '312000000.00', pm: 'pm@demo.com', members: ['tl@demo.com', 'engineer@demo.com', 'engineer2@demo.com', 'store@demo.com', 'procurement@demo.com'], boq: WATER_BOQ, engineer: 'engineer@demo.com',
    },
  ];

  let mrCounter = 1;
  for (const p of projects) {
    const project = await prisma.project.create({
      data: {
        organizationId: org.id, code: p.code, name: p.name, type: p.type, status: 'ACTIVE', clientName: p.client, consultantName: p.consultant, location: p.location,
        workOrderNo: p.wo, startDate: day(p.start), endDate: day(p.end), contractValue: D(p.value), projectManagerId: users.get(p.pm)!,
        members: { create: p.members.map((m) => ({ userId: users.get(m)! })) },
      },
    });
    const engineerId = users.get(p.engineer)!;
    const pmId = users.get(p.pm)!;

    let order = 0;
    for (const b of p.boq) {
      const boq = await prisma.boqItem.create({ data: { organizationId: org.id, projectId: project.id, itemNo: b.itemNo, description: b.description, unit: b.unit, rate: D(b.rate), originalQty: D(b.qty), sortOrder: order } });
      const activity = await prisma.activity.create({
        data: { organizationId: org.id, projectId: project.id, boqItemId: boq.id, name: b.activity, unit: b.unit, plannedQty: D(b.qty), plannedStart: day(b.start), plannedEnd: day(b.end), responsibleId: engineerId, sortOrder: order },
      });
      order++;
      // Approved progress history, spread across the planned window
      for (let i = 0; i < b.done.length; i++) {
        const date = day(Math.min(b.start + Math.round(((i + 1) * (b.end - b.start)) / (b.done.length + 1)), -1));
        await prisma.progressEntry.create({
          data: { organizationId: org.id, projectId: project.id, activityId: activity.id, date, quantity: D(b.done[i]), status: 'APPROVED', submittedById: engineerId, submittedAt: date, reviewedById: pmId, reviewedAt: date, reviewNote: 'Verified at site', remarks: `${b.activity} executed as per drawing`, manpowerCount: 12 + i * 3 },
        });
      }
    }

    // A couple of pending submissions so the approvals queue has content
    const activities = await prisma.activity.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' } });
    const inProgress = activities.filter((a) => a.plannedStart! <= day(0) && a.plannedEnd! >= day(-5)).slice(0, 2);
    for (const a of inProgress) {
      await prisma.progressEntry.create({
        data: { organizationId: org.id, projectId: project.id, activityId: a.id, date: day(0), quantity: a.plannedQty.mul(0.04).toDecimalPlaces(0), status: 'SUBMITTED', submittedById: engineerId, submittedAt: new Date(), remarks: 'Today\'s work, awaiting PM approval', location: p.type === 'ROAD' ? 'Ch. 14+200 to 14+650' : p.type === 'BUILDING' ? 'Grid C4-D7' : 'Zone 3, Village Barabati', manpowerCount: 18, machineryUsed: p.type === 'ROAD' ? 'Motor grader, vibratory roller, 2 tippers' : p.type === 'BUILDING' ? 'Transit mixer, concrete pump' : 'Excavator, pipe trailer' },
      });
    }

    // One entry sent back with "changes requested" so the edit-and-resubmit flow can be demoed from the site app
    if (inProgress[0]) {
      const a = inProgress[0];
      const sent = await prisma.progressEntry.create({
        data: { organizationId: org.id, projectId: project.id, activityId: a.id, date: day(-1), quantity: a.plannedQty.mul(0.05).toDecimalPlaces(0), status: 'CHANGES_REQUESTED', submittedById: engineerId, submittedAt: day(-1), reviewedById: pmId, reviewedAt: day(-1), reviewNote: 'Quantity looks high for one day and there is no site photo. Please re-check and attach a photo.', remarks: 'Yesterday\'s work', manpowerCount: 16 },
      });
      for (const [actorId, action, note] of [[engineerId, 'CREATED', null], [engineerId, 'SUBMITTED', null], [pmId, 'CHANGES_REQUESTED', 'Quantity looks high for one day and there is no site photo. Please re-check and attach a photo.']] as const) {
        await prisma.auditLog.create({ data: { organizationId: org.id, entityType: 'PROGRESS', entityId: sent.id, action, actorId, note, createdAt: day(-1) } });
      }
    }

    // DPRs for the last 5 days (approved) plus today (submitted)
    for (let i = 5; i >= 0; i--) {
      const date = day(-i);
      await prisma.dailyReport.create({
        data: {
          organizationId: org.id, projectId: project.id, date, weather: i % 3 === 0 ? 'SUNNY' : i % 3 === 1 ? 'CLOUDY' : 'HOT', siteCondition: 'Workable',
          manpower: [{ category: 'Mason', count: 8 + i }, { category: 'Helper', count: 20 + i }, { category: 'Operator', count: 4 }, { category: 'Supervisor', count: 2 }],
          machinery: p.type === 'ROAD' ? [{ name: 'Motor grader', hours: 8 }, { name: 'Vibratory roller', hours: 7.5 }, { name: 'Tipper (x4)', hours: 32 }] : p.type === 'BUILDING' ? [{ name: 'Transit mixer', hours: 6 }, { name: 'Tower crane', hours: 8 }] : [{ name: 'Excavator', hours: 8 }, { name: 'Butt fusion machine', hours: 6 }],
          materialReceived: i === 2 ? 'Cement 400 bags, 12mm rebar 8 MT' : null,
          workExecuted: inProgress.map((a) => `${a.name} continued`).join('; ') || 'General site works',
          testsConducted: i === 1 ? 'Cube test samples taken (3 nos), FDD test at Ch. 14+300' : null,
          safetyObservations: 'Toolbox talk conducted. PPE compliance 100%.',
          issues: i === 3 ? 'Diesel delivery delayed by 4 hours' : null,
          nextDayPlan: 'Continue current activities; shuttering for next pour',
          status: i === 0 ? 'SUBMITTED' : 'APPROVED', submittedById: engineerId, submittedAt: date, reviewedById: i === 0 ? null : pmId, reviewedAt: i === 0 ? null : date,
        },
      });
    }

    const mrItems = p.type === 'ROAD'
      ? [{ itemName: 'Bitumen VG-30', specification: 'IOCL / HPCL, bulk', unit: 'MT', quantity: '40' }, { itemName: 'Aggregate 20mm', specification: 'Crushed, approved quarry', unit: 'Cum', quantity: '600' }]
      : p.type === 'BUILDING'
        ? [{ itemName: 'OPC 53 Grade Cement', specification: 'UltraTech / ACC, 50kg bags', unit: 'Bags', quantity: '500' }, { itemName: 'TMT Fe500D 12mm', specification: 'Tata / JSW', unit: 'MT', quantity: '10' }]
        : [{ itemName: 'HDPE PE100 110mm PN6', specification: 'IS 4984, 6m lengths', unit: 'Rmt', quantity: '3000' }, { itemName: 'DI K9 pipe 400mm', specification: 'IS 8329', unit: 'Rmt', quantity: '600' }];
    // Material requests: one approved, one submitted, one rejected (to be edited and resubmitted)
    for (const status of ['APPROVED', 'SUBMITTED', 'REJECTED'] as const) {
      const reviewed = status !== 'SUBMITTED';
      const mr = await prisma.materialRequest.create({
        data: {
          organizationId: org.id, projectId: project.id, requestNo: `MR-${new Date().getUTCFullYear()}-${String(mrCounter++).padStart(4, '0')}`,
          requiredDate: day(status === 'APPROVED' ? -2 : status === 'REJECTED' ? 4 : 7), priority: status === 'APPROVED' ? 'HIGH' : 'NORMAL',
          remarks: status === 'APPROVED' ? 'Urgent for next pour' : status === 'REJECTED' ? 'Extra stock for the weekend' : 'Regular monthly requirement',
          status, submittedById: engineerId, submittedAt: day(status === 'APPROVED' ? -6 : status === 'REJECTED' ? -1 : 0), reviewedById: reviewed ? pmId : null, reviewedAt: reviewed ? day(status === 'APPROVED' ? -5 : -1) : null,
          reviewNote: status === 'REJECTED' ? 'Quantities are double what the next fortnight needs. Reduce and resubmit with a required date after the current stock runs out.' : null,
          items: { create: mrItems.map((it, idx) => ({ ...it, quantity: D(status === 'REJECTED' ? Number(it.quantity) * 2 : it.quantity), sortOrder: idx })) },
        },
      });
      if (status === 'REJECTED') {
        for (const [actorId, action, note] of [[engineerId, 'CREATED', mr.requestNo], [engineerId, 'SUBMITTED', null], [pmId, 'REJECTED', mr.reviewNote]] as const) {
          await prisma.auditLog.create({ data: { organizationId: org.id, entityType: 'MATERIAL_REQUEST', entityId: mr.id, action, actorId, note, createdAt: day(-1) } });
        }
      }
    }
  }

  // Notifications: the engineer sees recent reviews, the PM sees what is waiting. Push tokens are registered by the app.
  const projectsSeeded = await prisma.project.findMany({ where: { organizationId: org.id }, include: { projectManager: true } });
  for (const project of projectsSeeded) {
    const [approved, submitted] = await Promise.all([
      prisma.progressEntry.findFirst({ where: { projectId: project.id, status: 'APPROVED' }, orderBy: { reviewedAt: 'desc' }, include: { activity: true, reviewedBy: true } }),
      prisma.dailyReport.findFirst({ where: { projectId: project.id, status: 'SUBMITTED' }, include: { submittedBy: true } }),
    ]);
    if (approved?.reviewedBy) {
      await prisma.notification.create({
        data: {
          organizationId: org.id, userId: approved.submittedById, type: 'SUBMISSION_APPROVED', projectId: project.id, entityType: 'PROGRESS', entityId: approved.id,
          title: 'Progress entry approved',
          body: `${approved.reviewedBy.fullName} approved ${progressTitle(approved.activity.name, approved.quantity.toString(), approved.activity.unit, approved.date)} on ${project.name}. Note: Verified at site`,
          createdAt: approved.reviewedAt ?? new Date(), readAt: approved.reviewedAt ?? new Date(),
        },
      });
    }
    if (submitted && project.projectManagerId) {
      await prisma.notification.create({
        data: {
          organizationId: org.id, userId: project.projectManagerId, type: 'SUBMISSION_SUBMITTED', projectId: project.id, entityType: 'DPR', entityId: submitted.id,
          title: 'DPR awaiting your approval',
          body: `${submitted.submittedBy.fullName} submitted ${dprTitle(submitted.date)} on ${project.name}.`,
          createdAt: submitted.submittedAt ?? new Date(),
        },
      });
    }
  }

  await seedAttendance(org.id);
  await seedStock(org.id);
  await seedMachinery(org.id);
  await seedExpenses(org.id);
  await seedMeasurements(org.id);
  await seedCostRates(org.id);
  await seedRisks(org.id);
  await seedContracts(org.id);
  await seedApprovalRules(org.id);

  console.log('Seed complete. Login with any of these (password: password123):');
  for (const u of USERS) console.log(`  ${u.email.padEnd(24)} ${u.role}`);
}

/** Contractors per project type for the demo attendance register. */
const CONTRACTORS: Record<string, [string, string]> = {
  ROAD: ['Sri Jagannath Constructions', 'Maa Tarini Labour Supply'],
  BUILDING: ['Kalinga Builders', 'Utkal Shuttering Works'],
  WATER_SUPPLY: ['Biswal Pipeline Contractors', 'Maa Tarini Labour Supply'],
};

/**
 * Attendance for the last six days of every project that has none yet (also backfills a database seeded
 * before attendance existed). Totals by trade match the seeded DPR manpower. The water supply project has
 * no sheet for today, so recording one can be demoed from the site app.
 */
async function seedAttendance(organizationId: string) {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    include: { members: { include: { user: { include: { role: true } } } } },
    orderBy: { code: 'asc' },
  });
  for (const project of projects) {
    if ((await prisma.attendanceSheet.count({ where: { projectId: project.id } })) > 0) continue;
    const pick = (role: string) => project.members.find((m) => m.user.role.key === role)?.userId;
    const recorder = pick('TEAM_LEADER') ?? pick('SITE_ENGINEER') ?? project.projectManagerId;
    if (!recorder) continue;
    const [main, helpers] = CONTRACTORS[project.type] ?? ['Labour contractor', 'Labour supply'];
    for (let i = 5; i >= 0; i--) {
      if (i === 0 && project.type === 'WATER_SUPPLY') continue;
      const lines = [
        { contractor: 'Departmental', category: 'Supervisor', count: 2 },
        { contractor: 'Departmental', category: 'Operator', count: 4 },
        { contractor: main, category: 'Mason', count: 8 + i },
        { contractor: main, category: 'Helper', count: 12 + i },
        { contractor: helpers, category: 'Helper', count: 8 },
      ];
      const total = lines.reduce((s, l) => s + l.count, 0);
      const sheet = await prisma.attendanceSheet.create({
        data: {
          organizationId, projectId: project.id, date: day(-i), totalWorkers: total, recordedById: recorder,
          remarks: i === 3 ? 'Two helpers left at noon (diesel delay)' : null,
          lines: { create: lines.map((l, idx) => ({ ...l, sortOrder: idx })) },
        },
      });
      await prisma.auditLog.create({ data: { organizationId, entityType: 'ATTENDANCE', entityId: sheet.id, action: 'CREATED', actorId: recorder, note: `${day(-i).toISOString().slice(0, 10)}: ${total} workers`, createdAt: day(-i) } });
    }
  }
}

/** Opening stock per project type: [item, unit, quantity, minimum, issued per day for the last three days]. */
const OPENING_STOCK: Record<string, [string, string, number, number, number][]> = {
  ROAD: [['Diesel', 'Ltr', 2400, 1000, 520], ['OPC 53 Grade Cement', 'Bags', 300, 100, 40], ['Emulsion SS-1', 'Ltr', 1800, 500, 150]],
  BUILDING: [['Diesel', 'Ltr', 900, 300, 80], ['Binding wire', 'Kg', 250, 50, 20], ['Shuttering plywood 12mm', 'Nos', 120, 40, 10]],
  WATER_SUPPLY: [['Diesel', 'Ltr', 1600, 600, 360], ['HDPE electrofusion coupler 110mm', 'Nos', 400, 100, 45], ['Ball valve 50mm', 'Nos', 60, 20, 4]],
};

/**
 * Store register for every project that has none yet (also backfills an older database): opening stock
 * ten days ago, a GRN against the approved material request (second line half received), issues over the
 * last three days and minimum levels. Diesel on the road project ends below its minimum with an alert.
 */
async function seedStock(organizationId: string) {
  const year = new Date().getUTCFullYear();
  const counters: Record<string, number> = {};
  const nextNo = async (prefix: string) => {
    if (counters[prefix] === undefined) {
      const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
      counters[prefix] = last ? parseInt(last.entryNo.slice(prefix.length + 6), 10) : 0;
    }
    counters[prefix] += 1;
    return `${prefix}-${year}-${String(counters[prefix]).padStart(4, '0')}`;
  };
  const item = async (name: string, unit: string, category: string | null = null) =>
    (await prisma.item.findFirst({ where: { organizationId, name, unit } })) ?? prisma.item.create({ data: { organizationId, name, unit, category } });

  const projects = await prisma.project.findMany({
    where: { organizationId },
    include: { members: { include: { user: { include: { role: true } } } }, activities: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { code: 'asc' },
  });
  for (const project of projects) {
    if ((await prisma.stockEntry.count({ where: { projectId: project.id } })) > 0) continue;
    const pick = (role: string) => project.members.find((m) => m.user.role.key === role)?.userId;
    const keeper = pick('STORE_MANAGER') ?? pick('SITE_ENGINEER') ?? project.projectManagerId;
    const pm = project.projectManagerId ?? keeper;
    if (!keeper || !pm) continue;
    const entry = async (type: 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT', offset: number, by: string, data: Partial<Prisma.StockEntryUncheckedCreateInput>, lines: { itemId: string; quantity: Prisma.Decimal; materialRequestItemId?: string }[]) => {
      const e = await prisma.stockEntry.create({
        data: {
          organizationId, projectId: project.id, type, entryNo: await nextNo(type === 'RECEIPT' ? 'GRN' : type === 'ISSUE' ? 'ISS' : 'ADJ'), date: day(offset), createdById: by, createdAt: day(offset), ...data,
          lines: { create: lines.map((l, i) => ({ organizationId, projectId: project.id, itemId: l.itemId, type, date: day(offset), quantity: l.quantity, materialRequestItemId: l.materialRequestItemId ?? null, sortOrder: i })) },
        },
      });
      await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: by, note: e.entryNo, createdAt: day(offset) } });
      return e;
    };

    // Opening stock, entered by the PM
    const opening = OPENING_STOCK[project.type] ?? [];
    const openingItems = [];
    for (const [name, unit, qty, min, perDay] of opening) openingItems.push({ row: await item(name, unit, name === 'Diesel' ? 'Fuel' : null), qty, min, perDay });
    await entry('ADJUSTMENT', -10, pm, { remarks: 'Opening stock as per physical count' }, openingItems.map((o) => ({ itemId: o.row.id, quantity: D(o.qty) })));
    for (const o of openingItems)
      await prisma.stockMinLevel.create({ data: { organizationId, projectId: project.id, itemId: o.row.id, minQty: D(o.min), updatedById: pm } });

    // GRN against the approved material request: first line in full, second line half
    const mr = await prisma.materialRequest.findFirst({ where: { projectId: project.id, status: 'APPROVED' }, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    const received: { itemId: string; qty: Prisma.Decimal }[] = [];
    if (mr && mr.items.length) {
      const lines = [];
      for (const [idx, l] of mr.items.entries()) {
        const row = await item(l.itemName, l.unit);
        const qty = idx === 0 ? l.quantity : l.quantity.div(2).toDecimalPlaces(0);
        lines.push({ itemId: row.id, quantity: qty, materialRequestItemId: l.id });
        received.push({ itemId: row.id, qty });
      }
      await entry('RECEIPT', -4, keeper, { materialRequestId: mr.id, supplier: project.type === 'ROAD' ? 'Kalinga Bitumen & Aggregates' : project.type === 'BUILDING' ? 'Utkal Cement Traders' : 'Jagannath Pipes & Fittings', challanNo: `CH-${1180 + projects.indexOf(project)}`, vehicleNo: 'OD-02-AK-4471' }, lines);
      if (received[0]) await prisma.stockMinLevel.create({ data: { organizationId, projectId: project.id, itemId: received[0].itemId, minQty: received[0].qty.div(5).toDecimalPlaces(0), updatedById: keeper } });
    }

    // Issues over the last three days
    const [main] = CONTRACTORS[project.type] ?? ['Labour contractor'];
    const activity = project.activities.find((a) => a.plannedStart && a.plannedEnd && a.plannedStart <= day(0) && a.plannedEnd >= day(-5)) ?? project.activities[0];
    for (let i = 3; i >= 1; i--) {
      const lines = openingItems.map((o) => ({ itemId: o.row.id, quantity: D(-o.perDay) }));
      if (received[0]) lines.push({ itemId: received[0].itemId, quantity: received[0].qty.div(4).toDecimalPlaces(0).neg() });
      await entry('ISSUE', -i, keeper, { issuedTo: i === 2 ? 'Departmental (machinery)' : main, activityId: activity?.id ?? null, remarks: i === 2 ? 'Diesel for grader, roller and tippers' : null }, lines);
    }

    // Alert for whatever ended below its minimum
    const low = openingItems.filter((o) => o.qty - 3 * o.perDay < o.min);
    for (const o of low) {
      const balance = o.qty - 3 * o.perDay;
      await prisma.notification.create({
        data: {
          organizationId, userId: keeper, type: 'LOW_STOCK', projectId: project.id, createdAt: day(-1),
          title: `Low stock: ${o.row.name}`,
          body: `${o.row.name} at ${project.name} is down to ${balance} ${o.row.unit} (minimum ${o.min} ${o.row.unit}).`,
        },
      });
    }
  }
}

/** [code, name, category, ownership, supplier, rate, rateUnit, hours per day, diesel litres per hour] by project type. */
type Machine = [string, string, string, 'OWNED' | 'HIRED', string | null, string, 'HOUR' | 'DAY' | 'MONTH', number, number];
const FLEET: Record<string, Machine[]> = {
  ROAD: [
    ['EXC-01', 'Excavator (Tata Hitachi EX200)', 'Earthmoving', 'OWNED', null, '1800', 'HOUR', 8, 14],
    ['GRD-01', 'Motor grader (Caterpillar 120)', 'Earthmoving', 'HIRED', 'Mahalaxmi Earthmovers', '2200', 'HOUR', 7, 12],
    ['RLR-01', 'Vibratory roller 10 t', 'Compaction', 'HIRED', 'Mahalaxmi Earthmovers', '14000', 'DAY', 8, 6],
  ],
  BUILDING: [
    ['TC-01', 'Tower crane (Potain 6 t)', 'Lifting', 'HIRED', 'Kalinga Cranes', '450000', 'MONTH', 9, 0],
    ['MIX-01', 'Concrete mixer with hopper', 'Concreting', 'OWNED', null, '450', 'HOUR', 6, 3],
  ],
  WATER_SUPPLY: [
    ['JCB-01', 'Backhoe loader (JCB 3DX)', 'Earthmoving', 'OWNED', null, '1200', 'HOUR', 8, 7],
    ['DG-01', 'DG set 62.5 kVA', 'Power', 'OWNED', null, '600', 'HOUR', 6, 9],
  ],
};

/**
 * Equipment and the last five days of machinery logs per project (skipped for projects that already have
 * equipment, so it also backfills older databases). Older days are approved; yesterday's and today's are
 * waiting for the PM; one log on the road project has a breakdown and one was sent back for changes.
 */
async function seedMachinery(organizationId: string) {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    include: { members: { include: { user: { include: { role: true } } } }, activities: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { code: 'asc' },
  });
  for (const project of projects) {
    if ((await prisma.equipment.count({ where: { projectId: project.id } })) > 0) continue;
    const fleet = FLEET[project.type] ?? [];
    const pick = (role: string) => project.members.find((m) => m.user.role.key === role)?.userId;
    const logger = pick('SITE_ENGINEER') ?? pick('TEAM_LEADER') ?? project.projectManagerId;
    const pm = project.projectManagerId;
    if (!logger || !pm || !fleet.length) continue;
    const activity = project.activities.find((a) => a.plannedStart && a.plannedEnd && a.plannedStart <= day(0) && a.plannedEnd >= day(-5)) ?? project.activities[0];
    for (const [mi, [code, name, category, ownership, supplier, rate, rateUnit, hours, dieselPerHour]] of fleet.entries()) {
      // Codes are unique per organisation; prefix with the project when the plain code is taken.
      const taken = await prisma.equipment.count({ where: { organizationId, code } });
      const eq = await prisma.equipment.create({
        data: {
          organizationId, projectId: project.id, code: taken ? `${project.code.slice(0, 2)}-${code}` : code, name, category, ownership, supplier, rate: D(rate), rateUnit,
          registrationNo: category === 'Earthmoving' ? `OD-02-E-${4100 + mi * 37 + projects.indexOf(project) * 11}` : null, createdAt: day(-30),
        },
      });
      let meter = 1200 + mi * 850 + projects.indexOf(project) * 300;
      for (let i = 5; i >= 0; i--) {
        const breakdown = project.type === 'ROAD' && mi === 1 && i === 2 ? 3 : 0;
        const idle = i === 3 ? 1.5 : 0.5;
        const worked = Math.max(hours - breakdown - idle, 0);
        const status = i >= 2 ? 'APPROVED' : 'SUBMITTED';
        const changes = project.type === 'ROAD' && mi === 0 && i === 1;
        const finalStatus = changes ? 'CHANGES_REQUESTED' : status;
        const reviewed = finalStatus !== 'SUBMITTED';
        const log = await prisma.machineryLog.create({
          data: {
            organizationId, projectId: project.id, equipmentId: eq.id, date: day(-i), hoursWorked: D(worked), idleHours: D(idle), breakdownHours: D(breakdown),
            dieselLitres: dieselPerHour ? D(Math.round(worked * dieselPerHour)) : null, meterStart: D(meter), meterEnd: D(meter + worked + idle),
            operatorName: ['Ramesh Behera', 'Sanjay Nayak', 'Pradip Sahoo'][mi % 3], activityId: activity?.id ?? null,
            workDone: activity ? `${activity.name}` : null, breakdownNote: breakdown ? 'Hydraulic hose burst; replaced by the hire agency mechanic' : null,
            status: finalStatus, submittedById: logger, submittedAt: day(-i), createdAt: day(-i),
            reviewedById: reviewed ? pm : null, reviewedAt: reviewed ? day(-i + 1 > 0 ? 0 : -i + 1) : null,
            reviewNote: changes ? 'Hour-meter closing reading does not match the photo; please recheck' : null,
          },
        });
        meter += worked + idle;
        await prisma.auditLog.createMany({
          data: [
            { organizationId, entityType: 'MACHINERY', entityId: log.id, action: 'CREATED', actorId: logger, createdAt: day(-i) },
            { organizationId, entityType: 'MACHINERY', entityId: log.id, action: 'SUBMITTED', actorId: logger, createdAt: day(-i) },
            ...(reviewed ? [{ organizationId, entityType: 'MACHINERY', entityId: log.id, action: finalStatus, actorId: pm, note: log.reviewNote, createdAt: day(-i + 1 > 0 ? 0 : -i + 1) }] : []),
          ],
        });
        if (changes)
          await prisma.notification.create({
            data: {
              organizationId, userId: logger, type: 'SUBMISSION_CHANGES_REQUESTED', projectId: project.id, entityType: 'MACHINERY', entityId: log.id, createdAt: day(0),
              title: 'Machinery log needs changes', body: `The PM requested changes to ${eq.code} ${eq.name} on ${titleDate(day(-i))}. Note: ${log.reviewNote}`,
            },
          });
      }
    }
    // One idle machine at the yard, never logged
    if (project.type === 'ROAD' && !(await prisma.equipment.count({ where: { organizationId, code: 'TIP-07' } })))
      await prisma.equipment.create({ data: { organizationId, code: 'TIP-07', name: 'Tipper 16 cum', category: 'Transport', ownership: 'OWNED', rate: D('9000'), rateUnit: 'DAY', registrationNo: 'OD-02-AK-4471' } });
  }
}

/** A small PNG that looks like a printed bill (white slip, grey text lines, a total bar). No image library needed. */
function billImage(): Buffer {
  const w = 120, h = 160;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const margin = x < 10 || x >= w - 10 || y < 10 || y >= h - 10;
      const line = !margin && y >= 24 && y < 120 && y % 12 < 3 && x < (y % 24 < 12 ? 100 : 80);
      const header = !margin && y >= 12 && y < 18 && x > 30 && x < 90;
      const total = !margin && y >= 130 && y < 138 && x > 60;
      const [r, g, b] = margin ? [226, 232, 240] : header || total ? [30, 64, 120] : line ? [148, 163, 184] : [255, 255, 255];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** [days ago, category, description, vendor, taxable amount, GST %, payment mode, status, bill photo?] */
type DemoExpense = [number, string, string, string | null, string, number, 'CASH' | 'UPI' | 'BANK' | 'CREDIT', 'APPROVED' | 'SUBMITTED' | 'REJECTED' | 'CHANGES_REQUESTED', boolean];
const EXPENSES: Record<string, DemoExpense[]> = {
  ROAD: [
    [9, 'REPAIRS', 'Hydraulic hose and fittings for grader GRD-01', 'Sahoo Auto Parts', '2400', 18, 'CASH', 'APPROVED', true],
    [8, 'TRANSPORT', 'Tractor hire for water sprinkling (2 days)', 'Maa Mangala Transport', '5000', 0, 'UPI', 'APPROVED', true],
    [6, 'SAFETY', 'Reflective jackets and helmets (20 nos)', 'Kalinga Safety Store', '6200', 12, 'BANK', 'APPROVED', true],
    [5, 'FOOD_WELFARE', 'Drinking water cans for the gang', null, '900', 0, 'CASH', 'APPROVED', false],
    [3, 'MATERIAL_LOCAL', 'Binding wire and nails, local purchase', 'Jagannath Hardware', '1850', 18, 'CASH', 'REJECTED', true],
    [1, 'FUEL', 'Petrol for site motorcycle', 'IOCL Pipili', '700', 0, 'UPI', 'SUBMITTED', true],
    [0, 'REPAIRS', 'Roller vibrator bearing replacement', 'Sahoo Auto Parts', '4800', 18, 'CREDIT', 'SUBMITTED', true],
  ],
  BUILDING: [
    [7, 'RENT_UTILITIES', 'Site office electricity bill, September', 'TPCODL', '3800', 0, 'BANK', 'APPROVED', true],
    [4, 'MATERIAL_LOCAL', 'Cover blocks and PVC spacers', 'Utkal Cement Traders', '2250', 18, 'CASH', 'APPROVED', true],
    [2, 'OFFICE', 'Printer cartridge and A3 paper', 'Bhubaneswar Stationers', '1600', 18, 'UPI', 'CHANGES_REQUESTED', false],
    [0, 'LABOUR', 'Extra shuttering carpenters, Sunday (6 nos)', 'Utkal Shuttering Works', '5400', 0, 'CASH', 'SUBMITTED', false],
  ],
  WATER_SUPPLY: [
    [6, 'TRANSPORT', 'Pipe unloading crane, 4 hours', 'Kalinga Cranes', '3600', 18, 'BANK', 'APPROVED', true],
    [3, 'TRAVEL', 'Engineer travel to Cuttack for pipe inspection', null, '1200', 0, 'CASH', 'APPROVED', true],
    [1, 'FOOD_WELFARE', 'Tea and snacks during hydro test', null, '650', 0, 'CASH', 'SUBMITTED', false],
  ],
};

/**
 * Site expenses for the last ten days per project (skipped for projects that already have some, so it also
 * backfills older databases). Most are approved; the newest wait for the PM, one was rejected and one
 * (building project) was sent back for changes.
 */
async function seedExpenses(organizationId: string) {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    include: { members: { include: { user: { include: { role: true } } } } },
    orderBy: { code: 'asc' },
  });
  const year = new Date().getUTCFullYear();
  const last = await prisma.expense.findFirst({ where: { organizationId, expenseNo: { startsWith: `EXP-${year}-` } }, orderBy: { expenseNo: 'desc' }, select: { expenseNo: true } });
  let counter = last ? parseInt(last.expenseNo.slice(9), 10) : 0;
  // Prisma Bytes wants a plain Uint8Array (Vercel type-checks this file).
  const bill = new Uint8Array(billImage());
  for (const project of projects) {
    if ((await prisma.expense.count({ where: { projectId: project.id } })) > 0) continue;
    const pick = (role: string) => project.members.find((m) => m.user.role.key === role)?.userId;
    const filer = pick('SITE_ENGINEER') ?? pick('TEAM_LEADER') ?? project.projectManagerId;
    const pm = project.projectManagerId;
    if (!filer || !pm) continue;
    for (const [ago, category, description, vendor, amount, rate, paymentMode, status, receipt] of EXPENSES[project.type] ?? []) {
      counter += 1;
      const gst = D(amount).mul(rate).div(100).toDecimalPlaces(2);
      const reviewed = status !== 'SUBMITTED';
      const note = status === 'REJECTED' ? 'Binding wire is in stock at the store; issue from there instead of buying locally' : status === 'CHANGES_REQUESTED' ? 'Please attach the bill photo' : null;
      const x = await prisma.expense.create({
        data: {
          organizationId, projectId: project.id, expenseNo: `EXP-${year}-${String(counter).padStart(4, '0')}`, date: day(-ago), category: category as never, description, vendor,
          vendorGstin: rate > 0 ? '21AAKFS1234M1Z' + String((counter % 9) + 1) : null, billNo: vendor ? `B-${3100 + counter}` : null,
          amount: D(amount), gstRate: D(rate), gstAmount: gst, totalAmount: D(amount).plus(gst), paymentMode,
          status, submittedById: filer, submittedAt: day(-ago), createdAt: day(-ago),
          reviewedById: reviewed ? pm : null, reviewedAt: reviewed ? day(Math.min(0, -ago + 1)) : null, reviewNote: note,
        },
      });
      // A generated placeholder "bill" stored in the database, so it shows on every host.
      if (receipt)
        await prisma.attachment.create({
          data: { organizationId, fileName: `bill-${x.expenseNo}.png`, mimeType: 'image/png', size: bill.length, storagePath: `db:seed/bill-${x.expenseNo}.png`, data: bill, uploadedById: filer, expenseId: x.id, createdAt: day(-ago) },
        });
      await prisma.auditLog.createMany({
        data: [
          { organizationId, entityType: 'EXPENSE', entityId: x.id, action: 'CREATED', actorId: filer, createdAt: day(-ago) },
          { organizationId, entityType: 'EXPENSE', entityId: x.id, action: 'SUBMITTED', actorId: filer, createdAt: day(-ago) },
          ...(reviewed ? [{ organizationId, entityType: 'EXPENSE', entityId: x.id, action: status, actorId: pm, note, createdAt: day(Math.min(0, -ago + 1)) }] : []),
        ],
      });
    }
  }
}

// Measurement book: [days ago, BOQ item no, location, status, review note, lines of [description, nos, L, B, D, deduct]].
type MbLine = [string, number | null, number | null, number | null, number | null, boolean?];
type DemoSheet = [number, string, string, 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED', string | null, MbLine[]];
const MEASUREMENTS: Record<string, DemoSheet[]> = {
  ROAD: [
    [20, '2.01', 'Ch 0+000 to 0+500 LHS', 'APPROVED', null, [['Embankment layers', 1, 500, 12, 1.5], ['Culvert at Ch 0+320', 1, 12, 3, 1.5, true]]],
    [10, '3.01', 'Ch 0+000 to 0+400', 'APPROVED', null, [['GSB full width', 1, 400, 7.5, 0.2]]],
    [5, '5.01', 'Ch 1+240', 'CHANGES_REQUESTED', 'Add the culvert at Ch 1+880 measured the same day', [['RCC pipe culvert 1200mm', 1, null, null, null]]],
    [2, '3.02', 'Ch 0+000 to 0+250', 'SUBMITTED', null, [['WMM base course', 1, 250, 7, 0.25]]],
  ],
  BUILDING: [
    [25, '3.01', 'Grid A1 to C4', 'APPROVED', null, [['Isolated footings F1', 12, 2.4, 2.4, 0.6], ['Columns up to plinth', 12, 0.45, 0.45, 3.2]]],
    [3, '4.01', 'Ground floor external walls', 'REJECTED', 'Measured on the gross wall length; take it between columns', [['External walls 230mm', 1, 84, 0.23, 3], ['Door openings', 6, 1.2, 0.23, 2.1, true]]],
    [1, '3.02', 'Ground floor slab, grid A-D / 1-6', 'SUBMITTED', null, [['Slab 150mm', 1, 24, 18, 0.15], ['Beams 300x450', 1, 120, 0.3, 0.45], ['Staircase opening', 1, 4.5, 3, 0.15, true]]],
  ],
  WATER_SUPPLY: [
    [15, '2.01', 'Ch 2+000 to 3+250', 'APPROVED', null, [['DI K9 400mm laid and jointed', 1, 1250, null, null]]],
    [1, '5.01', 'Ward 4, lanes 1 to 3', 'SUBMITTED', null, [['Lane 1', 1, 420, null, null], ['Lane 2', 1, 365.5, null, null], ['Lane 3', 1, 512, null, null]]],
  ],
};

async function seedMeasurements(organizationId: string) {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    include: { members: { include: { user: { include: { role: true } } } }, boqItems: true },
    orderBy: { code: 'asc' },
  });
  const year = new Date().getUTCFullYear();
  const last = await prisma.measurementSheet.findFirst({ where: { organizationId, mbNo: { startsWith: `MB-${year}-` } }, orderBy: { mbNo: 'desc' }, select: { mbNo: true } });
  let counter = last ? parseInt(last.mbNo.slice(8), 10) : 0;
  for (const project of projects) {
    if ((await prisma.measurementSheet.count({ where: { projectId: project.id } })) > 0) continue;
    const pick = (role: string) => project.members.find((m) => m.user.role.key === role)?.userId;
    const filer = pick('QUANTITY_SURVEYOR') ?? pick('SITE_ENGINEER') ?? project.projectManagerId;
    const pm = project.projectManagerId;
    if (!filer || !pm) continue;
    for (const [ago, itemNo, location, status, note, lines] of MEASUREMENTS[project.type] ?? []) {
      const boq = project.boqItems.find((b) => b.itemNo === itemNo);
      if (!boq) continue;
      const rows = lines.map(([description, nos, length, breadth, depth, deduct], i) => {
        const qty = [nos, length, breadth, depth].reduce<number>((a, v) => a * (v ?? 1), 1);
        const quantity = D(qty).toDecimalPlaces(3).mul(deduct ? -1 : 1);
        return { description, nos: nos === null ? null : D(nos), length: length === null ? null : D(length), breadth: breadth === null ? null : D(breadth), depth: depth === null ? null : D(depth), deduct: !!deduct, quantity, sortOrder: i };
      });
      const totalQty = rows.reduce((a, r) => a.plus(r.quantity), D(0));
      counter += 1;
      const reviewed = status !== 'SUBMITTED';
      const x = await prisma.measurementSheet.create({
        data: {
          organizationId, projectId: project.id, boqItemId: boq.id, mbNo: `MB-${year}-${String(counter).padStart(4, '0')}`, date: day(-ago), location, totalQty,
          status, submittedById: filer, submittedAt: day(-ago), createdAt: day(-ago),
          reviewedById: reviewed ? pm : null, reviewedAt: reviewed ? day(Math.min(0, -ago + 1)) : null, reviewNote: note,
          lines: { create: rows },
        },
      });
      await prisma.auditLog.createMany({
        data: [
          { organizationId, entityType: 'MEASUREMENT', entityId: x.id, action: 'CREATED', actorId: filer, createdAt: day(-ago) },
          { organizationId, entityType: 'MEASUREMENT', entityId: x.id, action: 'SUBMITTED', actorId: filer, createdAt: day(-ago) },
          ...(reviewed ? [{ organizationId, entityType: 'MEASUREMENT', entityId: x.id, action: status, actorId: pm, note, createdAt: day(Math.min(0, -ago + 1)) }] : []),
        ],
      });
    }
  }
}

// Standard material rates and labour daily rates for the cost view (only where none are set).
const ITEM_RATES: Record<string, string> = {
  'Diesel': '92.50', 'Binding wire': '78.00', 'Shuttering plywood 12mm': '1450.00', 'OPC 53 Grade Cement': '395.00', 'TMT Fe500D 12mm': '61500.00',
  'Emulsion SS-1': '48.00', 'Bitumen VG-30': '52000.00', 'Aggregate 20mm': '1350.00', 'HDPE electrofusion coupler 110mm': '310.00',
  'Ball valve 50mm': '1850.00', 'HDPE PE100 110mm PN6': '540.00', 'DI K9 pipe 400mm': '5200.00',
};
const LABOUR_RATES: [string, string][] = [['Mason', '900.00'], ['Helper', '550.00'], ['Operator', '1100.00'], ['Supervisor', '1300.00'], ['Carpenter', '850.00'], ['Bar Bender', '850.00']];

async function seedCostRates(organizationId: string) {
  for (const [name, rate] of Object.entries(ITEM_RATES)) await prisma.item.updateMany({ where: { organizationId, name, rate: null }, data: { rate: D(rate) } });
  if ((await prisma.labourRate.count({ where: { organizationId } })) === 0)
    await prisma.labourRate.createMany({ data: LABOUR_RATES.map(([category, dailyRate]) => ({ organizationId, category, dailyRate: D(dailyRate) })) });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

type SeedRisk = {
  kind: 'DELAY' | 'RISK';
  category: 'LAND' | 'DESIGN' | 'MATERIAL' | 'LABOUR' | 'WEATHER' | 'FINANCE' | 'STATUTORY' | 'SAFETY' | 'UTILITY';
  title: string;
  description?: string;
  activity?: string;
  p: number;
  i: number;
  mitigation: string;
  /** days from today (negative = overdue) */
  due: number | null;
  status: 'OPEN' | 'MONITORING' | 'CLOSED';
  /** days ago */
  delayStart?: number;
  delayEnd?: number;
  party?: 'CLIENT' | 'CONTRACTOR' | 'THIRD_PARTY' | 'FORCE_MAJEURE';
  eot?: boolean;
  closure?: string;
  /** role key of the owner (PROJECT_MANAGER = the project's manager) */
  owner: string;
  raisedAgo: number;
};

const RISKS: Record<string, SeedRisk[]> = {
  ROAD: [
    { kind: 'DELAY', category: 'LAND', title: 'Encroachment at Ch 12+300 to 12+650 holding up embankment', description: 'Shops and a cattle shed inside the ROW on the left side; 350 m of embankment cannot be started.', activity: 'Earthwork embankment', p: 5, i: 4, mitigation: 'Joint inspection with the Tahsildar done; eviction notice served. Work shifted to Ch 13+000 onwards meanwhile.', due: 5, status: 'OPEN', delayStart: 18, party: 'THIRD_PARTY', eot: true, owner: 'PROJECT_MANAGER', raisedAgo: 18 },
    { kind: 'DELAY', category: 'WEATHER', title: 'Heavy rain stopped GSB laying', activity: 'GSB laying', p: 5, i: 2, mitigation: 'Stockpile kept covered; resume once the subgrade dries.', due: null, status: 'CLOSED', delayStart: 9, delayEnd: 7, party: 'FORCE_MAJEURE', closure: 'Work resumed after the stretch dried; 3 rainy days recorded in the DPRs.', owner: 'SITE_ENGINEER', raisedAgo: 9 },
    { kind: 'RISK', category: 'UTILITY', title: 'HT line crossing at Ch 14+100 not yet shifted', p: 4, i: 4, mitigation: 'Letter to the power utility for the shifting estimate; follow up every week.', due: -3, status: 'OPEN', owner: 'PROJECT_MANAGER', raisedAgo: 12 },
    { kind: 'RISK', category: 'MATERIAL', title: 'Bitumen price rise before DBM', activity: 'DBM paving', p: 3, i: 4, mitigation: 'Book VG-30 with the refinery at the current rate for the first 400 MT.', due: 20, status: 'MONITORING', owner: 'QUANTITY_SURVEYOR', raisedAgo: 6 },
  ],
  BUILDING: [
    { kind: 'DELAY', category: 'DESIGN', title: 'GF slab reinforcement drawings revised by the architect', activity: 'RCC slab GF', p: 5, i: 3, mitigation: 'Revised drawings received; bar bending schedule redone.', due: 4, status: 'MONITORING', delayStart: 12, delayEnd: 6, party: 'CLIENT', owner: 'PROJECT_MANAGER', raisedAgo: 12 },
    { kind: 'RISK', category: 'SAFETY', title: 'Edge protection on the first-floor slab', p: 3, i: 5, mitigation: 'Guard rails before deshuttering; daily toolbox talk.', due: 2, status: 'OPEN', owner: 'QA_QC_ENGINEER', raisedAgo: 3 },
    { kind: 'RISK', category: 'LABOUR', title: 'Shuttering carpenters leaving for the festival season', p: 4, i: 3, mitigation: 'Book a second gang in advance; stagger leave.', due: 10, status: 'OPEN', owner: 'SITE_ENGINEER', raisedAgo: 5 },
  ],
  WATER_SUPPLY: [
    { kind: 'DELAY', category: 'STATUTORY', title: 'Railway crossing permission for the raw water main pending', description: 'Push-through at the railway crossing needs the railway’s approval; 600 m of main on either side is laid.', activity: 'Raw water main laying', p: 5, i: 5, mitigation: 'Client to follow up with the railway division; push-through design submitted.', due: 7, status: 'OPEN', delayStart: 25, party: 'CLIENT', eot: true, owner: 'PROJECT_MANAGER', raisedAgo: 25 },
    { kind: 'RISK', category: 'FINANCE', title: 'RA bill 3 payment delayed by the client', p: 3, i: 3, mitigation: 'Escalate to the Executive Engineer; keep supplier credit within limits.', due: 15, status: 'MONITORING', owner: 'PROJECT_MANAGER', raisedAgo: 8 },
  ],
};

/** Delay and risk register: a few entries per project, one notification to the PM for each open delay. */
async function seedRisks(organizationId: string) {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    include: { members: { include: { user: { include: { role: true } } } }, activities: true },
    orderBy: { code: 'asc' },
  });
  const year = new Date().getUTCFullYear();
  const last = await prisma.risk.findFirst({ where: { organizationId, riskNo: { startsWith: `RISK-${year}-` } }, orderBy: { riskNo: 'desc' }, select: { riskNo: true } });
  let counter = last ? parseInt(last.riskNo.slice(10), 10) : 0;
  for (const project of projects) {
    if ((await prisma.risk.count({ where: { projectId: project.id } })) > 0) continue;
    const pm = project.projectManagerId;
    if (!pm) continue;
    const pick = (role: string) => (role === 'PROJECT_MANAGER' ? pm : project.members.find((m) => m.user.role.key === role)?.userId);
    const raiser = pick('SITE_ENGINEER') ?? pm;
    for (const r of RISKS[project.type] ?? []) {
      counter += 1;
      const ownerId = pick(r.owner) ?? pm;
      const delay = r.kind === 'DELAY';
      const x = await prisma.risk.create({
        data: {
          organizationId, projectId: project.id, riskNo: `RISK-${year}-${String(counter).padStart(4, '0')}`,
          kind: r.kind, category: r.category, title: r.title, description: r.description ?? null,
          activityId: r.activity ? (project.activities.find((a) => a.name === r.activity)?.id ?? null) : null,
          ownerId, probability: r.p, impact: r.i, score: r.p * r.i, mitigation: r.mitigation,
          dueDate: r.due === null ? null : day(r.due), status: r.status,
          delayStart: delay && r.delayStart !== undefined ? day(-r.delayStart) : null,
          delayEnd: delay && r.delayEnd !== undefined ? day(-r.delayEnd) : null,
          responsibleParty: r.party ?? null, eotClaimed: !!r.eot,
          closedAt: r.status === 'CLOSED' ? day(-(r.delayEnd ?? 0)) : null, closureNote: r.closure ?? null,
          raisedById: raiser, createdAt: day(-r.raisedAgo),
        },
      });
      await prisma.auditLog.createMany({
        data: [
          { organizationId, entityType: 'RISK', entityId: x.id, action: 'CREATED', actorId: raiser, createdAt: day(-r.raisedAgo) },
          ...(r.status === 'CLOSED' ? [{ organizationId, entityType: 'RISK', entityId: x.id, action: 'CLOSED', actorId: ownerId, note: r.closure ?? null, createdAt: day(-(r.delayEnd ?? 0)) }] : []),
        ],
      });
      if (delay && r.status === 'OPEN' && raiser !== pm) {
        await prisma.notification.create({
          data: {
            organizationId, userId: pm, type: 'RISK_RAISED', projectId: project.id, entityId: x.id, createdAt: day(-r.raisedAgo),
            title: `Delay raised: ${r.title}`,
            body: `${x.riskNo} at ${project.name} (since ${x.delayStart!.toISOString().slice(0, 10)}).`,
            dedupeKey: `RISK_RAISED:${x.id}`,
          },
        });
      }
    }
  }
}

// Client master and contract terms per project type (v3 item 17). Government clients: retention, GST TDS and labour cess.
const CONTRACTS: Record<string, {
  client: { name: string; department: string; gstin: string; address: string; contact: string; email: string; phone: string };
  agreementNo: string; agreementAgo: number; retention: string; sd: string; advancePct: string | null; recovery: string; tds: string; gstTds: string; cess: string; gst: string; dlp: number; pv: boolean;
  /** EOT granted for the delay with this title */
  eot?: [string, number];
}> = {
  ROAD: {
    client: { name: 'Odisha Works Department', department: 'Roads Division, Khordha', gstin: '21AAAGO1234F1Z5', address: 'Office of the Executive Engineer, R&B Division, Khordha, Odisha 752055', contact: 'Er. S. K. Panda, Executive Engineer', email: 'ee.khordha@example.gov.in', phone: '0674-2000001' },
    agreementNo: '04/EE/R&B/2025-26', agreementAgo: 130, retention: '5', sd: '0', advancePct: '5', recovery: '10', tds: '2', gstTds: '2', cess: '1', gst: '18', dlp: 24, pv: true,
  },
  BUILDING: {
    client: { name: 'Dept. of Health & Family Welfare', department: 'Office of the CDMO, Cuttack', gstin: '21AAAGD5678H1Z2', address: 'Chief District Medical Office, Cuttack, Odisha 753001', contact: 'Dr. M. Sahoo, CDMO', email: 'cdmo.cuttack@example.gov.in', phone: '0671-2000002' },
    agreementNo: '17/CDMO/2025-26', agreementAgo: 100, retention: '5', sd: '2.5', advancePct: null, recovery: '0', tds: '2', gstTds: '2', cess: '1', gst: '18', dlp: 12, pv: false,
    eot: ['GF slab reinforcement drawings revised by the architect', 7],
  },
  WATER_SUPPLY: {
    client: { name: 'RWSS Odisha (Jal Jeevan Mission)', department: 'RWSS Division, Jajpur', gstin: '21AAAGR9012K1Z8', address: 'Office of the Executive Engineer, RWSS Division, Jajpur, Odisha 755001', contact: 'Er. P. Mishra, Executive Engineer', email: 'ee.rwss.jajpur@example.gov.in', phone: '06728-200003' },
    agreementNo: '09/EE/RWSS/2025-26', agreementAgo: 160, retention: '5', sd: '0', advancePct: '10', recovery: '12', tds: '2', gstTds: '2', cess: '1', gst: '18', dlp: 12, pv: true,
  },
};

/** Clients from the projects' client names, and contract terms for projects that have none yet. */
async function seedContracts(organizationId: string) {
  const projects = await prisma.project.findMany({ where: { organizationId }, orderBy: { code: 'asc' } });
  for (const project of projects) {
    const c = CONTRACTS[project.type];
    if (!c || project.agreementNo) continue;
    const client = await prisma.client.upsert({
      where: { organizationId_name: { organizationId, name: project.clientName ?? c.client.name } },
      update: {},
      create: {
        organizationId, name: project.clientName ?? c.client.name, department: c.client.department, gstin: c.client.gstin, pan: c.client.gstin.slice(2, 12), stateCode: c.client.gstin.slice(0, 2),
        billingAddress: c.client.address, contactPerson: c.client.contact, email: c.client.email, phone: c.client.phone,
      },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: {
        clientId: client.id, clientName: client.name, agreementNo: c.agreementNo, agreementDate: day(-c.agreementAgo),
        retentionPct: D(c.retention), securityDepositPct: D(c.sd), mobilisationAdvance: c.advancePct && project.contractValue ? project.contractValue.mul(c.advancePct).div(100).toDecimalPlaces(2) : D(0),
        advanceRecoveryPct: D(c.recovery), tdsPct: D(c.tds), gstTdsPct: D(c.gstTds), labourCessPct: D(c.cess), gstRate: D(c.gst), defectLiabilityMonths: c.dlp, priceVariation: c.pv,
      },
    });
    if (c.eot) await prisma.risk.updateMany({ where: { projectId: project.id, kind: 'DELAY', title: c.eot[0], eotGrantedDays: null }, data: { eotClaimed: true, eotGrantedDays: c.eot[1] } });
  }
}

/**
 * Demo approval matrix: management approves everything, project managers approve everything but site expenses only
 * up to ₹25,000 (bigger bills go to management), and accounts approves site expenses of any amount. Only written
 * when the organisation has no matrix yet, so an admin's own changes are never overwritten.
 */
async function seedApprovalRules(organizationId: string) {
  if ((await prisma.approvalRule.count({ where: { organizationId } })) > 0) return;
  const roles = new Map((await prisma.role.findMany({ where: { organizationId }, select: { id: true, key: true } })).map((r) => [r.key, r.id]));
  const types = ['PROGRESS', 'DPR', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT'];
  const rows: { roleKey: string; type: string; maxAmount: Prisma.Decimal | null }[] = [
    ...types.map((type) => ({ roleKey: 'MANAGEMENT', type, maxAmount: null })),
    ...types.map((type) => ({ roleKey: 'PROJECT_MANAGER', type, maxAmount: type === 'EXPENSE' ? D(25000) : null })),
    { roleKey: 'ACCOUNTS_MANAGER', type: 'EXPENSE', maxAmount: null },
  ];
  await prisma.approvalRule.createMany({
    data: rows.filter((r) => roles.has(r.roleKey)).map((r) => ({ organizationId, roleId: roles.get(r.roleKey)!, submissionType: r.type, maxAmount: r.maxAmount })),
    skipDuplicates: true,
  });
}
