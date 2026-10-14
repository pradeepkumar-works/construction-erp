/* Demo seed: one organisation, a user for every role, three projects (one per type) with BOQ,
 * activities, approved and pending progress, DPRs and material requests. Safe to re-run. */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { deflateSync } from 'zlib';
import { dprTitle, progressTitle, titleDate } from '../src/common/submission-titles';
import { STANDARD_CHECKLISTS } from '@erp/shared';

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
    await seedBills(org.id);
    await seedReceipts(org.id);
    await seedVendors(org.id);
    await seedPurchasing(org.id);
    await seedSubcontracts(org.id);
    await seedPayables(org.id);
    await seedQuality(org.id);
    await seedTestsAndNcrs(org.id);
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
  await seedBills(org.id);
  await seedReceipts(org.id);
  await seedVendors(org.id);
  await seedPurchasing(org.id);
  await seedSubcontracts(org.id);
  await seedPayables(org.id);
  await seedQuality(org.id);
  await seedTestsAndNcrs(org.id);

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

/** RA bills: management approves any bill, project managers bills of up to ₹50 lakh of work. */
const BILL_RULES: { roleKey: string; type: string; maxAmount: Prisma.Decimal | null }[] = [
  { roleKey: 'MANAGEMENT', type: 'BILL', maxAmount: null },
  { roleKey: 'PROJECT_MANAGER', type: 'BILL', maxAmount: D(5000000) },
];

/** Purchase orders and vendor bills: management approves any, project managers up to ₹5 lakh. */
const PURCHASE_RULES: typeof BILL_RULES = ['PURCHASE_ORDER', 'VENDOR_BILL'].flatMap((type) => [
  { roleKey: 'MANAGEMENT', type, maxAmount: null },
  { roleKey: 'PROJECT_MANAGER', type, maxAmount: D(500000) },
]);

/** Work orders and subcontractor bills: management approves any, project managers up to ₹5 lakh. */
const SUBCONTRACT_RULES: typeof BILL_RULES = ['WORK_ORDER', 'SUBCONTRACT_BILL'].flatMap((type) => [
  { roleKey: 'MANAGEMENT', type, maxAmount: null },
  { roleKey: 'PROJECT_MANAGER', type, maxAmount: D(500000) },
]);
/** QA/QC passes inspections; management and project managers can too. */
const QUALITY_RULES: typeof BILL_RULES = ['MANAGEMENT', 'PROJECT_MANAGER', 'QA_QC_ENGINEER'].map((roleKey) => ({ roleKey, type: 'INSPECTION', maxAmount: null }));

/**
 * Demo approval matrix: management approves everything, project managers approve everything but site expenses only
 * up to ₹25,000 (bigger bills go to management) and RA bills up to ₹50 lakh, and accounts approves site expenses of any
 * amount, and purchase orders, vendor bills, work orders and subcontractor bills up to ₹5 lakh. Only written when the organisation has no matrix yet, so an
 * admin's own changes are never overwritten; a matrix made before RA bills, purchasing or subcontracts existed gets those rules once,
 * for each type it has no rule for.
 */
async function seedApprovalRules(organizationId: string) {
  const roles = new Map((await prisma.role.findMany({ where: { organizationId }, select: { id: true, key: true } })).map((r) => [r.key, r.id]));
  const write = (rows: typeof BILL_RULES) =>
    prisma.approvalRule.createMany({
      data: rows.filter((r) => roles.has(r.roleKey)).map((r) => ({ organizationId, roleId: roles.get(r.roleKey)!, submissionType: r.type, maxAmount: r.maxAmount })),
      skipDuplicates: true,
    });
  if ((await prisma.approvalRule.count({ where: { organizationId } })) > 0) {
    for (const type of ['BILL', 'PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'INSPECTION'])
      if ((await prisma.approvalRule.count({ where: { organizationId, submissionType: type } })) === 0)
        await write([...BILL_RULES, ...PURCHASE_RULES, ...SUBCONTRACT_RULES, ...QUALITY_RULES].filter((r) => r.type === type));
    return;
  }
  const types = ['PROGRESS', 'DPR', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT'];
  const rows: { roleKey: string; type: string; maxAmount: Prisma.Decimal | null }[] = [
    ...types.map((type) => ({ roleKey: 'MANAGEMENT', type, maxAmount: null })),
    ...types.map((type) => ({ roleKey: 'PROJECT_MANAGER', type, maxAmount: type === 'EXPENSE' ? D(25000) : null })),
    { roleKey: 'ACCOUNTS_MANAGER', type: 'EXPENSE', maxAmount: null },
    ...BILL_RULES,
    ...PURCHASE_RULES,
    ...SUBCONTRACT_RULES,
    ...QUALITY_RULES,
  ];
  await write(rows);
}

/** Demo first bills: [project type, measurements up to (days ago), bill date, sent, remarks]. */
const DEMO_BILLS: [string, number, number, number, string][] = [
  ['ROAD', 15, 14, 12, 'Earthwork in embankment, first reach'],
  ['BUILDING', 20, 19, 18, 'Foundations and columns up to plinth'],
];

/**
 * Demo RA bill 1 of the road and building projects: their approved measurements of a while ago, approved and sent to
 * the client. Later approved measurements are left for bill 2. Only for a project with no bills yet.
 */
async function seedBills(organizationId: string) {
  for (const [type, upToAgo, billAgo, sentAgo, remarks] of DEMO_BILLS) {
    const project = await prisma.project.findFirst({
      where: { organizationId, type: type as 'ROAD' | 'BUILDING', agreementNo: { not: null } },
      include: { members: { include: { user: { include: { role: true } } } } },
      orderBy: { code: 'asc' },
    });
    if (!project?.projectManagerId || (await prisma.raBill.count({ where: { projectId: project.id } })) > 0) continue;
    const qs = project.members.find((m) => m.user.role.key === 'QUANTITY_SURVEYOR')?.userId ?? project.projectManagerId;
    const upTo = day(-upToAgo);
    const sheets = await prisma.measurementSheet.findMany({ where: { projectId: project.id, status: 'APPROVED', raBillId: null, date: { lte: upTo } }, include: { boqItem: true } });
    if (!sheets.length) continue;
    const r2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const byItem = new Map<string, { boq: (typeof sheets)[number]['boqItem']; qty: Prisma.Decimal }>();
    for (const s of sheets) byItem.set(s.boqItemId, { boq: s.boqItem, qty: (byItem.get(s.boqItemId)?.qty ?? D(0)).add(s.totalQty) });
    const lines = [...byItem.values()].sort((a, b) => a.boq.sortOrder - b.boq.sortOrder).map(({ boq, qty }) => ({ boq, qty, amount: r2(qty.mul(boq.rate)) }));
    const gross = lines.reduce((a, l) => a.add(l.amount), D(0));
    const of = (pct: Prisma.Decimal) => r2(gross.mul(pct).div(100));
    const amounts = {
      retentionAmount: of(project.retentionPct),
      securityDepositAmount: of(project.securityDepositPct),
      advanceRecoveryAmount: Prisma.Decimal.min(of(project.advanceRecoveryPct), project.mobilisationAdvance),
      tdsAmount: of(project.tdsPct),
      gstTdsAmount: of(project.gstTdsPct),
      labourCessAmount: of(project.labourCessPct),
    };
    const gst = of(project.gstRate);
    const totalDeductions = Object.values(amounts).reduce((a, v) => a.add(v), D(0));
    const bill = await prisma.raBill.create({
      data: {
        organizationId, projectId: project.id, billNo: 1, billDate: day(-billAgo), measuredUpTo: upTo, remarks,
        grossPrevious: D(0), grossAmount: gross, grossUpto: gross, gstRate: project.gstRate, gstAmount: gst,
        retentionPct: project.retentionPct, securityDepositPct: project.securityDepositPct, advanceRecoveryPct: project.advanceRecoveryPct,
        tdsPct: project.tdsPct, gstTdsPct: project.gstTdsPct, labourCessPct: project.labourCessPct, ...amounts,
        totalDeductions, netPayable: gross.add(gst).sub(totalDeductions), stage: 'SENT', sentDate: day(-sentAgo),
        status: 'APPROVED', submittedById: qs, submittedAt: day(-billAgo), reviewedById: project.projectManagerId, reviewedAt: day(-billAgo + 1), createdAt: day(-billAgo),
        items: { create: lines.map((l, i) => ({ boqItemId: l.boq.id, boqQty: l.boq.revisedQty ?? l.boq.originalQty, rate: l.boq.rate, prevQty: D(0), thisQty: l.qty, uptoQty: l.qty, amount: l.amount, sortOrder: i })) },
      },
    });
    await prisma.measurementSheet.updateMany({ where: { id: { in: sheets.map((s) => s.id) } }, data: { raBillId: bill.id } });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'CREATED', actorId: qs, createdAt: day(-billAgo) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'SUBMITTED', actorId: qs, createdAt: day(-billAgo) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'APPROVED', actorId: project.projectManagerId, createdAt: day(-billAgo + 1) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'SENT', actorId: qs, note: `Sent to the client on ${day(-sentAgo).toISOString().slice(0, 10)}`, createdAt: day(-sentAgo) },
      ],
    });
  }
}

/** [name, kinds, GSTIN, MSME category, Udyam no., bank account, IFSC, bank, contact, phone] */
type DemoVendor = [string, string[], string, 'MICRO' | 'SMALL' | 'MEDIUM' | null, string | null, string, string, string, string, string];
const VENDORS: DemoVendor[] = [
  ['Kalinga Bitumen & Aggregates', ['SUPPLIER'], '21AAKFK4521B1Z3', 'SMALL', 'UDYAM-OD-19-0012345', '39281726354', 'SBIN0001234', 'State Bank of India, Khordha', 'R. K. Mohanty', '9437012345'],
  ['Utkal Cement Traders', ['SUPPLIER'], '21ABCPU7788C1Z1', 'MICRO', 'UDYAM-OD-19-0045678', '50200012345678', 'HDFC0001842', 'HDFC Bank, Saheed Nagar', 'S. Patnaik', '9861023456'],
  ['Jagannath Pipes & Fittings', ['SUPPLIER'], '21AAGFJ3344D1Z6', null, null, '1234002100045678', 'PUNB0123400', 'Punjab National Bank, Cuttack', 'B. Das', '9437234567'],
  ['Mahalaxmi Earthmovers', ['HIRE_AGENCY'], '21AARFM9087E1Z2', 'SMALL', 'UDYAM-OD-19-0078901', '920020034567891', 'UTIB0000123', 'Axis Bank, Bhubaneswar', 'P. Sahu', '9938045678'],
  ['Kalinga Cranes', ['HIRE_AGENCY', 'SERVICE'], '21AAHFK2211G1Z8', null, null, '0123102000034567', 'IBKL0000123', 'IDBI Bank, Bhubaneswar', 'A. Nayak', '9437456789'],
  ['Sahoo Auto Parts', ['SUPPLIER', 'SERVICE'], '21BXRPS6612K1Z4', 'MICRO', 'UDYAM-OD-19-0091234', '34567812345', 'SBIN0004321', 'State Bank of India, Pipili', 'D. Sahoo', '9861567890'],
  ['Kalinga Safety Store', ['SUPPLIER'], '21AALFK7720P1Z9', null, null, '50100098765432', 'HDFC0002211', 'HDFC Bank, Unit 4', 'M. Behera', '9437678901'],
  ['Utkal Shuttering Works', ['SUBCONTRACTOR', 'LABOUR_CONTRACTOR'], '21CQDPS4410L1Z5', 'MICRO', 'UDYAM-OD-19-0102345', '11223344556', 'SBIN0007788', 'State Bank of India, Patia', 'G. Swain', '9938789012'],
];

/**
 * Demo vendor master: the regular suppliers, hire agencies and the shuttering subcontractor, linked to the expenses,
 * machines and GRNs that name them. Petty vendors (fuel pump, electricity, stationery) stay as typed, so the "not in
 * the master" list has something to show. Only when the organisation has no vendors yet.
 */
async function seedVendors(organizationId: string) {
  if ((await prisma.vendor.count({ where: { organizationId } })) > 0) return;
  for (const [name, kinds, gstin, msmeCategory, udyamNo, bankAccountNo, bankIfsc, bankName, contactPerson, phone] of VENDORS) {
    const v = await prisma.vendor.create({
      data: {
        organizationId, name, kinds: kinds as never, gstin, pan: gstin.slice(2, 12), stateCode: gstin.slice(0, 2), msmeCategory, udyamNo,
        bankAccountName: name, bankAccountNo, bankIfsc, bankName, contactPerson, phone, address: 'Odisha',
      },
    });
    const match = { equals: name, mode: 'insensitive' as const };
    await prisma.expense.updateMany({ where: { organizationId, vendorId: null, vendor: match }, data: { vendorId: v.id } });
    await prisma.equipment.updateMany({ where: { organizationId, vendorId: null, supplier: match }, data: { vendorId: v.id } });
    await prisma.stockEntry.updateMany({ where: { organizationId, vendorId: null, supplier: match }, data: { vendorId: v.id } });
  }
}

/**
 * Demo receivables: the road project's bill 1 certified as claimed and paid in full with the client's deductions (so
 * retention and TDS show as held), the building bill left outstanding. Only when the organisation has no receipts yet.
 */
async function seedReceipts(organizationId: string) {
  if ((await prisma.receipt.count({ where: { organizationId } })) > 0) return;
  const bill = await prisma.raBill.findFirst({ where: { organizationId, billNo: 1, stage: 'SENT', status: 'APPROVED', project: { type: 'ROAD' } }, include: { items: true } });
  const accounts = await prisma.user.findFirst({ where: { organizationId, role: { key: 'ACCOUNTS_MANAGER' } }, select: { id: true } });
  if (!bill || !accounts) return;
  for (const i of bill.items) await prisma.raBillItem.update({ where: { id: i.id }, data: { certifiedQty: i.thisQty } });
  const paidOn = day(-3);
  await prisma.raBill.update({
    where: { id: bill.id },
    data: { stage: 'PAID', certifiedDate: day(-8), certificateNo: 'EE/RD/2026/101', claimedGross: bill.grossAmount, claimedNet: bill.netPayable, paidDate: paidOn },
  });
  const receipt = await prisma.receipt.create({
    data: {
      organizationId, projectId: bill.projectId, billId: bill.id, kind: 'BILL', receiptDate: paidOn, amount: bill.netPayable, mode: 'BANK', reference: 'SBIN526281904417',
      tdsAmount: bill.tdsAmount, gstTdsAmount: bill.gstTdsAmount, retentionAmount: bill.retentionAmount, securityDepositAmount: bill.securityDepositAmount,
      advanceRecoveryAmount: bill.advanceRecoveryAmount, labourCessAmount: bill.labourCessAmount, otherDeduction: bill.otherDeduction, otherDeductionNote: bill.otherDeductionNote,
      remarks: 'RTGS from the Executive Engineer, R&B Division', createdById: accounts.id, createdAt: paidOn,
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { organizationId, entityType: 'BILL', entityId: bill.id, action: 'CERTIFIED', actorId: accounts.id, note: 'Certificate EE/RD/2026/101', createdAt: day(-8) },
      { organizationId, entityType: 'BILL', entityId: bill.id, action: 'PAYMENT_RECEIVED', actorId: accounts.id, note: `₹${bill.netPayable.toFixed(2)} received`, createdAt: paidOn },
      { organizationId, entityType: 'RECEIPT', entityId: receipt.id, action: 'CREATED', actorId: accounts.id, createdAt: paidOn },
    ],
  });
}

/** Demo purchase: [project type, vendor, freight, payment days, rate and GST % per request line, quotes from others]. */
const DEMO_POS: [string, string, number, number, [number, number][], [string, number, [number, number][]][]][] = [
  ['BUILDING', 'Utkal Cement Traders', 2500, 45, [[385, 28], [58500, 18]], [['Odisha Steel & Cement Depot', 4000, [[392, 28], [57900, 18]]]]],
  ['ROAD', 'Kalinga Bitumen & Aggregates', 0, 30, [[48500, 18], [1150, 5]], []],
];

/**
 * Demo purchasing on the first approved request of the building and road projects: quotations (the building one from
 * two vendors, for the comparative statement), an approved PO to the vendor that supplied it, and the GRN already
 * received against the request moved onto that PO. The building PO has a vendor bill waiting for approval whose
 * steel rate is above the PO, so the match shows an exception. Only when the organisation has no POs yet.
 */
async function seedPurchasing(organizationId: string) {
  if ((await prisma.purchaseOrder.count({ where: { organizationId } })) > 0) return;
  const userOf = async (role: string) => (await prisma.user.findFirst({ where: { organizationId, role: { key: role } }, select: { id: true } }))?.id;
  const [buyer, md, accounts] = [await userOf('PROCUREMENT_MANAGER'), await userOf('MANAGEMENT'), await userOf('ACCOUNTS_MANAGER')];
  if (!buyer || !md || !accounts) return;
  const vendorOf = async (name: string) =>
    (await prisma.vendor.findFirst({ where: { organizationId, name } })) ??
    prisma.vendor.create({ data: { organizationId, name, kinds: ['SUPPLIER'], gstin: '21AAECO5521R1Z2', pan: 'AAECO5521R', stateCode: '21', contactPerson: 'N. Mishra', phone: '9437890123', address: 'Rasulgarh, Bhubaneswar' } });
  const year = new Date().getUTCFullYear();
  let n = 0;
  for (const [type, vendorName, freight, paymentDays, prices, others] of DEMO_POS) {
    const mr = await prisma.materialRequest.findFirst({ where: { organizationId, status: 'APPROVED', project: { type: type as never } }, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    if (!mr || mr.items.length < prices.length) continue;
    const vendor = await vendorOf(vendorName);
    const quote = async (v: { id: string }, f: number, rates: [number, number][], offset: number) =>
      prisma.quotation.create({
        data: {
          organizationId, projectId: mr.projectId, materialRequestId: mr.id, vendorId: v.id, quoteDate: day(offset), validUntil: day(offset + 30), deliveryDays: 3, freight: D(f),
          paymentTerms: '45 days from invoice', createdById: buyer, createdAt: day(offset),
          lines: { create: rates.map(([rate, gst], i) => ({ materialRequestItemId: mr.items[i].id, rate: D(rate), gstRate: D(gst) })) },
        },
      });
    const q = await quote(vendor, freight, prices, -9);
    for (const [other, f, rates] of others) await quote(await vendorOf(other), f, rates, -9);
    const lines = mr.items.slice(0, prices.length).map((it, i) => {
      const [rate, gst] = prices[i];
      const amount = it.quantity.mul(rate).toDecimalPlaces(2);
      return { materialRequestItemId: it.id, itemName: it.itemName, specification: it.specification, unit: it.unit, quantity: it.quantity, rate: D(rate), gstRate: D(gst), amount, gstAmount: amount.mul(gst).div(100).toDecimalPlaces(2), sortOrder: i };
    });
    const subtotal = lines.reduce((t, l) => t.add(l.amount), D(0));
    const gstAmount = lines.reduce((t, l) => t.add(l.gstAmount), D(0));
    const poNo = `PO-${year}-${String(++n).padStart(4, '0')}`;
    const po = await prisma.purchaseOrder.create({
      data: {
        organizationId, projectId: mr.projectId, vendorId: vendor.id, poNo, poDate: day(-8), materialRequestId: mr.id, quotationId: q.id, deliveryBy: day(-3),
        deliveryAddress: 'Site store', paymentTerms: `${paymentDays} days from invoice`, paymentDays, freight: D(freight), subtotal, gstAmount, total: subtotal.add(gstAmount).add(freight),
        status: 'APPROVED', submittedById: buyer, submittedAt: day(-8), reviewedById: md, reviewedAt: day(-8), createdAt: day(-8),
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'PURCHASE_ORDER', entityId: po.id, action: 'CREATED', actorId: buyer, createdAt: day(-8) },
        { organizationId, entityType: 'PURCHASE_ORDER', entityId: po.id, action: 'SUBMITTED', actorId: buyer, createdAt: day(-8) },
        { organizationId, entityType: 'PURCHASE_ORDER', entityId: po.id, action: 'APPROVED', actorId: md, createdAt: day(-8) },
      ],
    });
    for (const l of po.lines) {
      const item = await prisma.item.findFirst({ where: { organizationId, name: l.itemName, unit: l.unit } });
      if (item) await prisma.item.update({ where: { id: item.id }, data: { rate: l.rate } });
      await prisma.stockTxn.updateMany({ where: { materialRequestItemId: l.materialRequestItemId, type: 'RECEIPT' }, data: { purchaseOrderLineId: l.id } });
    }
    await prisma.stockEntry.updateMany({ where: { materialRequestId: mr.id, type: 'RECEIPT' }, data: { purchaseOrderId: po.id, vendorId: vendor.id, supplier: vendor.name } });

    if (type !== 'BUILDING') continue;
    // The vendor's invoice for what was received, steel billed above the PO rate
    const received = await prisma.stockTxn.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: po.lines.map((l) => l.id) } }, _sum: { quantity: true } });
    const billLines = po.lines.flatMap((l) => {
      const qty = received.find((r) => r.purchaseOrderLineId === l.id)?._sum.quantity;
      if (!qty || qty.lte(0)) return [];
      const rate = l.sortOrder === 1 ? l.rate.add(700) : l.rate;
      const amount = qty.mul(rate).toDecimalPlaces(2);
      return [{ purchaseOrderLineId: l.id, quantity: qty, rate, gstRate: l.gstRate, amount, gstAmount: amount.mul(l.gstRate).div(100).toDecimalPlaces(2), sortOrder: l.sortOrder }];
    });
    const steel = po.lines.find((l) => l.sortOrder === 1)!;
    const bSub = billLines.reduce((t, l) => t.add(l.amount), D(0));
    const bGst = billLines.reduce((t, l) => t.add(l.gstAmount), D(0));
    const bill = await prisma.vendorBill.create({
      data: {
        organizationId, projectId: po.projectId, vendorId: vendor.id, purchaseOrderId: po.id, billNo: `VB-${year}-0001`, invoiceNo: 'UCT/2026/551', invoiceDate: day(-2),
        dueDate: day(-2 + paymentDays), freight: D(freight), subtotal: bSub, gstAmount: bGst, total: bSub.add(bGst).add(freight),
        matched: false, exceptions: [`${steel.itemName}: rate ₹${steel.rate.add(700).toFixed(2)} is above the PO rate ₹${steel.rate.toFixed(2)}`],
        remarks: 'Vendor says the steel rate was revised on the day of dispatch', status: 'SUBMITTED', submittedById: accounts, submittedAt: day(-1), createdAt: day(-1),
        lines: { create: billLines },
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'CREATED', actorId: accounts, createdAt: day(-1) },
        { organizationId, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'SUBMITTED', actorId: accounts, createdAt: day(-1) },
      ],
    });
  }
}

/**
 * Demo subcontract on the road project: Sri Jagannath Constructions (an individual's firm, so 1% TDS, and a micro
 * enterprise) gets an approved work order for GSB and WMM at subcontract rates, plus its own item for shoulder dressing.
 * The approved measurements of those items and the latest material issue to them are put under the order, so its first
 * bill can be prepared straight away; their attendance rows link to the vendor. Only when the organisation has no
 * work orders yet.
 */
async function seedSubcontracts(organizationId: string) {
  if ((await prisma.workOrder.count({ where: { organizationId } })) > 0) return;
  const userOf = async (role: string) => (await prisma.user.findFirst({ where: { organizationId, role: { key: role } }, select: { id: true } }))?.id;
  const [pm, md] = [await userOf('PROJECT_MANAGER'), await userOf('MANAGEMENT')];
  const project = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, include: { boqItems: true }, orderBy: { createdAt: 'asc' } });
  if (!pm || !md || !project) return;
  const name = 'Sri Jagannath Constructions';
  const vendor =
    (await prisma.vendor.findFirst({ where: { organizationId, name } })) ??
    (await prisma.vendor.create({
      data: {
        organizationId, name, kinds: ['SUBCONTRACTOR', 'LABOUR_CONTRACTOR'], gstin: '21AKPPM3321H1Z7', pan: 'AKPPM3321H', stateCode: '21', msmeCategory: 'MICRO', udyamNo: 'UDYAM-OD-19-0115566',
        bankAccountName: name, bankAccountNo: '40112233445', bankIfsc: 'SBIN0009911', bankName: 'State Bank of India, Khordha', contactPerson: 'J. Mohapatra', phone: '9437345678', address: 'Khordha, Odisha',
      },
    }));
  await prisma.attendanceLine.updateMany({ where: { sheet: { organizationId }, vendorId: null, contractor: { equals: name, mode: 'insensitive' } }, data: { vendorId: vendor.id } });
  const boq = (itemNo: string) => project.boqItems.find((b) => b.itemNo === itemNo);
  const gsb = boq('3.01');
  const wmm = boq('3.02');
  if (!gsb || !wmm) return;
  const lines = [
    { boqItemId: gsb.id, description: `${gsb.itemNo} ${gsb.description}`, unit: gsb.unit, quantity: gsb.revisedQty ?? gsb.originalQty, rate: D(1390) },
    { boqItemId: wmm.id, description: `${wmm.itemNo} ${wmm.description}`, unit: wmm.unit, quantity: wmm.revisedQty ?? wmm.originalQty, rate: D(1780) },
    { boqItemId: null, description: 'Shoulder dressing and side slopes, both sides', unit: 'Km', quantity: D(12), rate: D(18500) },
  ].map((l, i) => ({ ...l, amount: l.quantity.mul(l.rate).toDecimalPlaces(2), sortOrder: i }));
  const value = lines.reduce((t, l) => t.add(l.amount), D(0));
  const wo = await prisma.workOrder.create({
    data: {
      organizationId, projectId: project.id, vendorId: vendor.id, woNo: `WO-${new Date().getUTCFullYear()}-0001`, woDate: day(-20), title: 'GSB and WMM, Km 10 to 22',
      startDate: day(-18), endDate: day(160), gstRate: D(18), retentionPct: D(5), advanceAmount: D(200000), advanceRecoveryPct: D(10), tdsPct: D(1), paymentDays: 30, value,
      terms: 'Rates include labour, machinery and transport. Bitumen, cement and diesel issued from our store are recovered at the store rate.',
      status: 'APPROVED', submittedById: pm, submittedAt: day(-20), reviewedById: md, reviewedAt: day(-19), createdAt: day(-20),
      lines: { create: lines },
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'CREATED', actorId: pm, createdAt: day(-20) },
      { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'SUBMITTED', actorId: pm, createdAt: day(-20) },
      { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'APPROVED', actorId: md, createdAt: day(-19) },
    ],
  });
  await prisma.measurementSheet.updateMany({ where: { projectId: project.id, boqItemId: { in: [gsb.id, wmm.id] }, status: 'APPROVED' }, data: { workOrderId: wo.id } });
  const issue = await prisma.stockEntry.findFirst({ where: { projectId: project.id, type: 'ISSUE', issuedTo: name }, orderBy: { date: 'desc' } });
  if (issue) await prisma.stockEntry.update({ where: { id: issue.id }, data: { workOrderId: wo.id } });
}

/**
 * Demo payables: the road project's supplier (Kalinga Bitumen & Aggregates, a small enterprise) billed what was received
 * against its PO 40 days ago on 30 days' credit; the bill was approved and about half of it paid, so the due list shows
 * it overdue and flagged under the MSMED Act. Only when the organisation has no payments yet.
 */
async function seedPayables(organizationId: string) {
  if ((await prisma.vendorPayment.count({ where: { organizationId } })) > 0) return;
  const userOf = async (role: string) => (await prisma.user.findFirst({ where: { organizationId, role: { key: role } }, select: { id: true } }))?.id;
  const [md, accounts] = [await userOf('MANAGEMENT'), await userOf('ACCOUNTS_MANAGER')];
  const po = await prisma.purchaseOrder.findFirst({
    where: { organizationId, status: 'APPROVED', project: { type: 'ROAD' }, vendorBills: { none: {} } },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, vendor: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!md || !accounts || !po) return;
  const received = await prisma.stockTxn.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: po.lines.map((l) => l.id) } }, _sum: { quantity: true } });
  const lines = po.lines.flatMap((l) => {
    const qty = received.find((r) => r.purchaseOrderLineId === l.id)?._sum.quantity;
    if (!qty || qty.lte(0)) return [];
    const amount = qty.mul(l.rate).toDecimalPlaces(2);
    return [{ purchaseOrderLineId: l.id, quantity: qty, rate: l.rate, gstRate: l.gstRate, amount, gstAmount: amount.mul(l.gstRate).div(100).toDecimalPlaces(2), sortOrder: l.sortOrder }];
  });
  if (!lines.length) return;
  if (!po.vendor.msmeCategory) await prisma.vendor.update({ where: { id: po.vendorId }, data: { msmeCategory: 'SMALL', udyamNo: 'UDYAM-OD-19-0042871' } });
  const year = new Date().getUTCFullYear();
  const count = await prisma.vendorBill.count({ where: { organizationId, billNo: { startsWith: `VB-${year}-` } } });
  const subtotal = lines.reduce((t, l) => t.add(l.amount), D(0));
  const gstAmount = lines.reduce((t, l) => t.add(l.gstAmount), D(0));
  const total = subtotal.add(gstAmount).add(po.freight);
  const paid = total.div(2).toDecimalPlaces(0);
  const bill = await prisma.vendorBill.create({
    data: {
      organizationId, projectId: po.projectId, vendorId: po.vendorId, purchaseOrderId: po.id, billNo: `VB-${year}-${String(count + 1).padStart(4, '0')}`, invoiceNo: 'KBA/26-27/0213',
      invoiceDate: day(-40), dueDate: day(-40 + Math.min(po.paymentDays ?? 30, 45)), freight: po.freight, subtotal, gstAmount, total, matched: true, exceptions: [],
      status: 'APPROVED', submittedById: accounts, submittedAt: day(-39), reviewedById: md, reviewedAt: day(-38), createdAt: day(-39), paidAmount: paid,
      lines: { create: lines },
    },
  });
  const payment = await prisma.vendorPayment.create({
    data: {
      organizationId, projectId: po.projectId, vendorId: po.vendorId, vendorBillId: bill.id, paymentDate: day(-12), amount: paid, mode: 'BANK', reference: 'SBIN526287700412',
      remarks: 'Part payment; balance after the bitumen test certificates', createdById: accounts, createdAt: day(-12),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { organizationId, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'CREATED', actorId: accounts, createdAt: day(-39) },
      { organizationId, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'SUBMITTED', actorId: accounts, createdAt: day(-39) },
      { organizationId, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'APPROVED', actorId: md, createdAt: day(-38) },
      { organizationId, entityType: 'VENDOR_PAYMENT', entityId: payment.id, action: 'CREATED', actorId: accounts, createdAt: day(-12) },
      { organizationId, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'PAYMENT_MADE', actorId: accounts, note: `₹${paid.toFixed(2)} paid (SBIN526287700412)`, createdAt: day(-12) },
    ],
  });
}

/** Which standard checklist each demo activity inspects against; `true` marks a hold point. */
const ACTIVITY_CHECKLISTS: Record<string, [string, boolean?]> = {
  'Earthwork embankment': ['Subgrade and embankment layer'],
  Subgrade: ['Subgrade and embankment layer'],
  'GSB laying': ['GSB / WMM layer'],
  'WMM laying': ['GSB / WMM layer', true],
  'DBM paving': ['Bituminous layer'],
  'BC paving': ['Bituminous layer'],
  'RCC footings and columns': ['Reinforcement before concreting'],
  'RCC slab GF': ['Reinforcement before concreting'],
  'RCC slab FF': ['Reinforcement before concreting', true],
  'Brick masonry': ['Brickwork'],
  'Raw water main laying': ['Pipe laying and hydro test'],
  'Distribution network': ['Pipe laying and hydro test'],
};

/** Demo inspections: [project type, activity, location, days ago, status, inspector's note, points not OK]. */
const DEMO_INSPECTIONS: [string, string, string, number, 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED', string | null, number[]][] = [
  ['BUILDING', 'RCC slab GF', 'Ground floor slab, bays 1 to 4', 6, 'APPROVED', 'Cover and laps fine. Proceed with the pour.', []],
  ['BUILDING', 'RCC footings and columns', 'Columns C1 to C8, ground to first floor', 1, 'SUBMITTED', null, []],
  ['ROAD', 'GSB laying', 'Km 12+000 to 12+500, LHS', 3, 'CHANGES_REQUESTED', 'Rework the low patch at Km 12+300 and call for re-inspection.', [3]],
];

/**
 * The standard inspection checklists, linked to the demo activities they fit (two of them hold points), and a few
 * inspections: one passed, one waiting for QA/QC and one sent back for re-inspection. Only where none exist yet.
 */
async function seedQuality(organizationId: string) {
  await prisma.checklistTemplate.createMany({ data: STANDARD_CHECKLISTS.map((c) => ({ organizationId, name: c.name, items: c.items })), skipDuplicates: true });
  const checklists = new Map((await prisma.checklistTemplate.findMany({ where: { organizationId } })).map((c) => [c.name, c]));
  for (const [activity, [checklist, holdPoint]] of Object.entries(ACTIVITY_CHECKLISTS)) {
    const c = checklists.get(checklist);
    if (c) await prisma.activity.updateMany({ where: { organizationId, name: activity, checklistTemplateId: null }, data: { checklistTemplateId: c.id, holdPoint: !!holdPoint } });
  }
  if ((await prisma.inspection.count({ where: { organizationId } })) > 0) return;
  const qa = await prisma.user.findFirst({ where: { organizationId, email: 'qaqc@demo.com' } });
  if (!qa) return;
  const year = new Date().getUTCFullYear();
  let counter = 0;
  for (const [type, activityName, location, ago, status, note, failed] of DEMO_INSPECTIONS) {
    const project = await prisma.project.findFirst({ where: { organizationId, type: type as Prisma.ProjectWhereInput['type'] }, include: { activities: { where: { name: activityName } } }, orderBy: { code: 'asc' } });
    const activity = project?.activities[0];
    const items = activity?.checklistTemplateId ? [...checklists.values()].find((c) => c.id === activity.checklistTemplateId) : undefined;
    const by = project ? await prisma.user.findFirst({ where: { organizationId, role: { key: 'SITE_ENGINEER' }, memberships: { some: { projectId: project.id } } } }) : null;
    if (!project || !activity || !items || !by) continue;
    const reviewed = status !== 'SUBMITTED';
    const checklist = items.items.map((item, i) => ({ item, result: reviewed ? (failed.includes(i) ? 'FAIL' : 'PASS') : null, remark: failed.includes(i) ? 'Level low by 25 mm over 6 m' : null }));
    counter += 1;
    const x = await prisma.inspection.create({
      data: {
        organizationId, projectId: project.id, activityId: activity.id, inspectionNo: `INS-${year}-${String(counter).padStart(4, '0')}`, date: day(-ago), location,
        checklistName: items.name, checklist, status, submittedById: by.id, submittedAt: day(-ago), createdAt: day(-ago),
        reviewedById: reviewed ? qa.id : null, reviewedAt: reviewed ? day(Math.min(0, -ago + 1)) : null, reviewNote: note,
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'INSPECTION', entityId: x.id, action: 'CREATED', actorId: by.id, createdAt: day(-ago) },
        { organizationId, entityType: 'INSPECTION', entityId: x.id, action: 'SUBMITTED', actorId: by.id, createdAt: day(-ago) },
        ...(reviewed ? [{ organizationId, entityType: 'INSPECTION', entityId: x.id, action: status, actorId: qa.id, note, createdAt: day(Math.min(0, -ago + 1)) }] : []),
      ],
    });
  }
}

type DemoTest = {
  type: 'BUILDING' | 'ROAD';
  activity: string;
  kind: 'CONCRETE_CUBE' | 'FIELD_DENSITY' | 'BRICK';
  title: string;
  location: string;
  ago: number;
  spec: string;
  unit: string;
  min: string;
  /** [label, days after sampling, value] */
  readings: [string, number, string | null][];
};

/** Demo tests: cubes passed, cubes waiting for their 7 and 28-day results, a failed brick test and two compaction tests. */
const DEMO_TESTS: DemoTest[] = [
  { type: 'BUILDING', activity: 'RCC slab GF', kind: 'CONCRETE_CUBE', title: 'M25 cubes, GF slab bays 1 to 4', location: 'Ground floor slab', ago: 34, spec: 'Not less than 25 N/mm² at 28 days (IS 456)', unit: 'N/mm²', min: '25', readings: [['7 days', 7, '18.9'], ['28 days', 28, '28.6']] },
  { type: 'BUILDING', activity: 'RCC footings and columns', kind: 'CONCRETE_CUBE', title: 'M25 cubes, columns C1 to C8', location: 'Columns, ground to first floor', ago: 10, spec: 'Not less than 25 N/mm² at 28 days (IS 456)', unit: 'N/mm²', min: '25', readings: [['7 days', 7, '17.6'], ['28 days', 28, null]] },
  { type: 'BUILDING', activity: 'RCC footings and columns', kind: 'CONCRETE_CUBE', title: 'M25 cubes, plinth beams', location: 'Plinth beams, grid A to D', ago: 7, spec: 'Not less than 25 N/mm² at 28 days (IS 456)', unit: 'N/mm²', min: '25', readings: [['7 days', 7, null], ['28 days', 28, null]] },
  { type: 'BUILDING', activity: 'Brick masonry', kind: 'BRICK', title: 'Fly ash bricks, lot 3 (Sai Bricks)', location: 'Stack at gate 2', ago: 6, spec: 'Compressive strength not less than 3.5 N/mm² (IS 1077)', unit: 'N/mm²', min: '3.5', readings: [['Result', 3, '2.9']] },
  { type: 'ROAD', activity: 'Earthwork embankment', kind: 'FIELD_DENSITY', title: 'Embankment top layer compaction, sand replacement', location: 'Km 12+000 to 12+500, LHS', ago: 12, spec: 'Not less than 97% of MDD for the top 500 mm (MoRTH 305)', unit: '%', min: '97', readings: [['Result', 0, '98.2']] },
  { type: 'ROAD', activity: 'Earthwork embankment', kind: 'FIELD_DENSITY', title: 'Embankment top layer compaction, sand replacement', location: 'Km 12+500 to 13+000, LHS', ago: 4, spec: 'Not less than 97% of MDD for the top 500 mm (MoRTH 305)', unit: '%', min: '97', readings: [['Result', 0, '95.4']] },
];

/**
 * Demo tests and NCRs: the tests above, and three NCRs (bricks below strength still open, low compaction with the
 * corrective action recorded, honeycombing closed). Only where none exist yet.
 */
async function seedTestsAndNcrs(organizationId: string) {
  if ((await prisma.qualityTest.count({ where: { organizationId } })) > 0) return;
  const qa = await prisma.user.findFirst({ where: { organizationId, email: 'qaqc@demo.com' } });
  if (!qa) return;
  const year = new Date().getUTCFullYear();
  const tests = new Map<string, { id: string; projectId: string; activityId: string; testNo: string }>();
  let n = 0;
  for (const t of DEMO_TESTS) {
    const project = await prisma.project.findFirst({ where: { organizationId, type: t.type }, include: { activities: { where: { name: t.activity } } }, orderBy: { code: 'asc' } });
    const activity = project?.activities[0];
    const by = project ? await prisma.user.findFirst({ where: { organizationId, role: { key: 'SITE_ENGINEER' }, memberships: { some: { projectId: project.id } } } }) : null;
    if (!project || !activity || !by) continue;
    const last = t.readings[t.readings.length - 1][2];
    const result = last === null ? 'PENDING' : Number(last) < Number(t.min) ? 'FAIL' : 'PASS';
    n += 1;
    const testNo = `TST-${year}-${String(n).padStart(4, '0')}`;
    const row = await prisma.qualityTest.create({
      data: {
        organizationId, projectId: project.id, activityId: activity.id, testNo, kind: t.kind, title: t.title, location: t.location, sampledOn: day(-t.ago),
        specification: t.spec, unit: t.unit, specMin: D(t.min), result, createdById: by.id, createdAt: day(-t.ago),
        readings: {
          create: t.readings.map(([label, after, value], i) => ({ label, dueOn: day(-t.ago + after), value: value === null ? null : D(value), testedOn: value === null ? null : day(-t.ago + after), sortOrder: i })),
        },
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'QUALITY_TEST', entityId: row.id, action: 'CREATED', actorId: by.id, createdAt: day(-t.ago) } });
    tests.set(t.location, { id: row.id, projectId: project.id, activityId: activity.id, testNo });
  }

  const engineerOf = async (projectId: string) => prisma.user.findFirst({ where: { organizationId, role: { key: 'SITE_ENGINEER' }, memberships: { some: { projectId } } } });
  const bricks = tests.get('Stack at gate 2');
  const compaction = tests.get('Km 12+500 to 13+000, LHS');
  const columns = tests.get('Columns, ground to first floor');
  const ncrs: Prisma.NcrUncheckedCreateInput[] = [];
  if (bricks) {
    const se = await engineerOf(bricks.projectId);
    ncrs.push({
      organizationId, projectId: bricks.projectId, ncrNo: '', raisedOn: day(-3), title: 'Fly ash bricks below specified strength', severity: 'MAJOR', status: 'OPEN',
      description: `Lot 3 from Sai Bricks tested 2.9 N/mm² against 3.5 N/mm² required (IS 1077), ${bricks.testNo}. Do not use the lot; segregate it and ask the supplier to replace it.`,
      location: 'Stack at gate 2', raisedById: qa.id, actionById: se?.id ?? null, dueDate: day(4), activityId: bricks.activityId, qualityTestId: bricks.id, createdAt: day(-3),
    });
  }
  if (compaction) {
    const se = await engineerOf(compaction.projectId);
    ncrs.push({
      organizationId, projectId: compaction.projectId, ncrNo: '', raisedOn: day(-3), title: 'Embankment compaction below 97% at Km 12+500 to 13+000', severity: 'MINOR', status: 'ACTION_TAKEN',
      description: `Field density 95.4% of MDD against 97% required, ${compaction.testNo}. Rework the layer and test again before GSB.`,
      location: 'Km 12+500 to 13+000, LHS', raisedById: qa.id, actionById: se?.id ?? null, dueDate: day(2), activityId: compaction.activityId, qualityTestId: compaction.id,
      cause: 'Moisture below optimum after two dry days; the roller made fewer passes than the trial stretch.',
      correctiveAction: 'Layer scarified, water added to OMC and recompacted with 8 passes of the 10 t roller. Retest requested.',
      preventiveAction: 'Moisture checked before rolling; pass count recorded in the DPR.', actionAt: day(-1), createdAt: day(-3),
    });
  }
  if (columns) {
    ncrs.push({
      organizationId, projectId: columns.projectId, ncrNo: '', raisedOn: day(-8), title: 'Honeycombing at the base of column C4', severity: 'MINOR', status: 'CLOSED',
      description: 'Honeycombing about 150 mm high at the base of C4 after deshuttering; reinforcement not exposed.',
      location: 'Column C4, ground floor', raisedById: qa.id, activityId: columns.activityId, dueDate: day(-5),
      cause: 'Grout loss at the kicker joint; the needle vibrator did not reach the bottom lift.',
      correctiveAction: 'Loose concrete chipped out and the area repaired with polymer-modified mortar.', actionAt: day(-6),
      closedById: qa.id, closedAt: day(-5), closureNote: 'Repair checked by hammer test; acceptable.', createdAt: day(-8),
    });
  }
  for (const [i, x] of ncrs.entries()) {
    const row = await prisma.ncr.create({ data: { ...x, ncrNo: `NCR-${year}-${String(i + 1).padStart(4, '0')}` } });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'NCR', entityId: row.id, action: 'CREATED', actorId: qa.id, createdAt: x.createdAt as Date } });
  }
}
