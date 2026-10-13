/* Demo seed: one organisation, a user for every role, three projects (one per type) with BOQ,
 * activities, approved and pending progress, DPRs and material requests. Safe to re-run. */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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
          body: `${approved.reviewedBy.fullName} approved ${approved.activity.name}: ${approved.quantity.toString()} ${approved.activity.unit} on ${approved.date.toISOString().slice(0, 10)} on ${project.name}. Note: Verified at site`,
          createdAt: approved.reviewedAt ?? new Date(), readAt: approved.reviewedAt ?? new Date(),
        },
      });
    }
    if (submitted && project.projectManagerId) {
      await prisma.notification.create({
        data: {
          organizationId: org.id, userId: project.projectManagerId, type: 'SUBMISSION_SUBMITTED', projectId: project.id, entityType: 'DPR', entityId: submitted.id,
          title: 'DPR awaiting your approval',
          body: `${submitted.submittedBy.fullName} submitted DPR for ${submitted.date.toISOString().slice(0, 10)} on ${project.name}.`,
          createdAt: submitted.submittedAt ?? new Date(),
        },
      });
    }
  }

  await seedAttendance(org.id);
  await seedStock(org.id);

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

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
