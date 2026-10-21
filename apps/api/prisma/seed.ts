/* Demo seed: one organisation, a user for every role, three projects (one per type) with BOQ,
 * activities, approved and pending progress, DPRs and material requests. Safe to re-run. */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { deflateSync } from 'zlib';
import { dprTitle, progressTitle, titleDate } from '../src/common/submission-titles';
import { DEMO_CONTRACTS, textPdf } from '../src/documents/demo-contracts';
import { DEFAULT_CLOSEOUT_ITEMS, PERMIT_PRECAUTIONS, STANDARD_CHECKLISTS, gstinCheckChar, isWeeklyOff, leaveDays, ppeReplaceBy, type PpeKind } from '@erp/shared';

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
  ['SAFETY_OFFICER', 'Safety Officer'],
  ['ACCOUNTS_MANAGER', 'Accounts Manager'],
  ['HR_MANAGER', 'HR Manager'],
  ['CLIENT_ENGINEER', "Client's Engineer (guest)"],
  ['CONSULTANT', 'Consultant / PMC (guest)'],
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
  { email: 'safety@demo.com', name: 'Harish Pradhan', role: 'SAFETY_OFFICER', phone: '9800000016' },
  // Guests from outside the company: they use the client portal only, on the projects below (seedGuests).
  { email: 'client@demo.com', name: 'Er. Bijay Kumar Panda', role: 'CLIENT_ENGINEER', phone: '9800000014' },
  { email: 'pmc@demo.com', name: 'Lakshmi Menon', role: 'CONSULTANT', phone: '9800000015' },
];

/** The client's engineer (Executive Engineer's office, road) and the consultant (PMC, building) on their projects. */
const GUEST_PROJECTS: [string, string][] = [
  ['client@demo.com', 'RD-2026-01'],
  ['pmc@demo.com', 'BL-2026-02'],
];

async function seedGuests(organizationId: string) {
  for (const [email, code] of GUEST_PROJECTS) {
    const [user, project] = await Promise.all([prisma.user.findFirst({ where: { organizationId, email } }), prisma.project.findFirst({ where: { organizationId, code } })]);
    if (user && project) await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: user.id } }, update: {}, create: { projectId: project.id, userId: user.id } });
  }
}

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
  const org = await prisma.organization.upsert({ where: { code: 'DEMO' }, update: { aiEnabled: true }, create: { code: 'DEMO', name: 'Demo Infra Projects Pvt Ltd', aiEnabled: true } });

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
    await seedLdTerms(org.id);
  await seedPriceVariation(org.id);
    await seedPriceVariation(org.id);
    await seedApprovalRules(org.id);
    await seedBills(org.id);
    await seedReceipts(org.id);
    await seedVendors(org.id);
    await seedPurchasing(org.id);
    await seedSubcontracts(org.id);
    await seedPayables(org.id);
    await seedQuality(org.id);
    await seedTestsAndNcrs(org.id);
    await seedDocuments(org.id);
    await seedContractDocuments(org.id);
    await seedStaff(org.id);
    await seedGuests(org.id);
    await seedVariations(org.id);
    await seedRfis(org.id);
    await seedBudgets(org.id);
    await seedStoreMoves(org.id);
    await seedReconciliation(org.id);
    await seedSafety(org.id);
    await seedSectors(org.id);
    await seedMaintenance(org.id);
    await seedSchedule(org.id);
    await seedWorkers(org.id);
    await seedPpe(org.id);
    await seedImprests(org.id);
    await seedCompliance(org.id);
    await seedHandover(org.id);
    await seedCheckAnomalies(org.id);
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
  await seedLdTerms(org.id);
  await seedPriceVariation(org.id);
  await seedApprovalRules(org.id);
  await seedBills(org.id);
  await seedReceipts(org.id);
  await seedVendors(org.id);
  await seedPurchasing(org.id);
  await seedSubcontracts(org.id);
  await seedPayables(org.id);
  await seedQuality(org.id);
  await seedTestsAndNcrs(org.id);
  await seedDocuments(org.id);
  await seedContractDocuments(org.id);
  await seedStaff(org.id);
  await seedGuests(org.id);
  await seedVariations(org.id);
  await seedRfis(org.id);
  await seedBudgets(org.id);
  await seedStoreMoves(org.id);
  await seedReconciliation(org.id);
  await seedSafety(org.id);
  await seedSectors(org.id);
  await seedMaintenance(org.id);
  await seedSchedule(org.id);
  await seedWorkers(org.id);
  await seedPpe(org.id);
  await seedImprests(org.id);
  await seedCompliance(org.id);
  await seedHandover(org.id);
  await seedCheckAnomalies(org.id);

  console.log('Seed complete. Login with any of these (password: password123):');
  for (const u of USERS) console.log(`  ${u.email.padEnd(24)} ${u.role}`);
}

/**
 * Site imprest demo (v4 item 45): the road project's site engineer holds a ₹10,000 float, paid when it was opened 20
 * days ago. Their cash expenses since spend it (one turned down), and today they have asked for the top-up that brings
 * it back to the float. Only when the organisation has no imprest yet.
 */
async function seedCompliance(organizationId: string) {
  if (await prisma.complianceDoc.count({ where: { organizationId } })) return;
  const road = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' } });
  const building = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' } });
  const accounts = await prisma.user.findFirst({ where: { organizationId, role: { key: 'ACCOUNTS_MANAGER' } } });
  if (!road || !building || !accounts) return;
  const rows = [
    { kind: 'BANK_GUARANTEE', category: 'Performance guarantee', reference: 'BG/0412/2026', issuer: 'State Bank of India, Cuttack Main', projectId: road.id, beneficiary: road.clientName ?? 'The client', amount: '4250000', margin: '1062500', issuedOn: -340, expiresOn: 25, claimUntil: 205 },
    { kind: 'BANK_GUARANTEE', category: 'Mobilisation advance guarantee', reference: 'BG/0577/2026', issuer: 'Bank of India, Bhubaneswar', projectId: building.id, beneficiary: building.clientName ?? 'The client', amount: '1800000', margin: '450000', issuedOn: -120, expiresOn: 245, claimUntil: 335 },
    { kind: 'EMD', category: 'Online deposit', reference: 'EMD/RD-26/118', issuer: 'Odisha e-procurement portal', projectId: null, beneficiary: 'Superintending Engineer, NH Circle, Sambalpur', amount: '350000', issuedOn: -45, expiresOn: null, note: 'Tender for 12 km widening, bids open next month' },
    { kind: 'INSURANCE', category: "Contractor's all risk (CAR)", reference: 'CAR/2026/77812', issuer: 'New India Assurance', projectId: road.id, amount: '95000000', issuedOn: -300, expiresOn: 65 },
    { kind: 'INSURANCE', category: "Workmen's compensation", reference: 'WC/2026/40213', issuer: 'United India Insurance', projectId: building.id, amount: '5000000', issuedOn: -360, expiresOn: 6 },
    { kind: 'LICENCE', category: 'Labour licence (CLRA)', reference: 'CLRA/CTC/2025/0931', issuer: 'Assistant Labour Commissioner, Cuttack', projectId: road.id, issuedOn: -370, expiresOn: -4 },
    { kind: 'LICENCE', category: 'Contractor registration', reference: 'Super Class OWD 114/2024', issuer: 'Works Department, Government of Odisha', projectId: null, amount: '25000', issuedOn: -650, expiresOn: 445 },
  ] as const;
  for (const r of rows) {
    const doc = await prisma.complianceDoc.create({
      data: {
        organizationId,
        kind: r.kind,
        category: r.category,
        reference: r.reference,
        issuer: r.issuer,
        projectId: r.projectId,
        beneficiary: 'beneficiary' in r ? r.beneficiary : null,
        amount: 'amount' in r ? D(r.amount) : null,
        margin: 'margin' in r ? D(r.margin) : null,
        issuedOn: day(r.issuedOn),
        expiresOn: r.expiresOn === null ? null : day(r.expiresOn),
        claimUntil: 'claimUntil' in r ? day(r.claimUntil) : null,
        note: 'note' in r ? r.note : null,
        createdById: accounts.id,
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'COMPLIANCE_DOC', entityId: doc.id, action: 'CREATED', actorId: accounts.id, note: `${r.category} ${r.reference}` } });
  }
}

/** Snags on the hospital block before handover, and its close-out checklist started (v4 item 47). */
async function seedHandover(organizationId: string) {
  if (await prisma.defect.count({ where: { organizationId } })) return;
  const building = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' } });
  if (!building) return;
  const engineer = await prisma.user.findFirst({ where: { organizationId, role: { key: 'SITE_ENGINEER' }, memberships: { some: { projectId: building.id } } } });
  const qa = await prisma.user.findFirst({ where: { organizationId, role: { key: 'QA_QC_ENGINEER' } } });
  if (!engineer) return;
  const year = new Date().getUTCFullYear();
  const rows = [
    { title: 'Parapet plaster cracked', location: 'Terrace, east parapet', trade: 'Plaster', priority: 'MEDIUM', reportedOn: -9, dueDate: -2, contractor: 'Maa Tarini Plastering Works' },
    { title: 'Toilet floor slopes away from the drain', location: '2nd floor, ward toilet T4', trade: 'Tiling', priority: 'HIGH', reportedOn: -6, dueDate: 4, assigned: true },
    { title: 'Door closer missing on OT corridor door', location: '1st floor, OT corridor', trade: 'Joinery', priority: 'LOW', reportedOn: -12, dueDate: 3, fixed: -1 },
    { title: 'Paint touch-up after electrical chasing', location: 'Ground floor, OPD waiting hall', trade: 'Painting', priority: 'LOW', reportedOn: -20, dueDate: -10, fixed: -12, closed: true },
  ] as const;
  for (const [i, r] of rows.entries()) {
    const fixed = 'fixed' in r;
    const closed = 'closed' in r;
    const d = await prisma.defect.create({
      data: {
        organizationId,
        projectId: building.id,
        defectNo: `SNG-${year}-${String(i + 1).padStart(4, '0')}`,
        phase: 'SNAG',
        title: r.title,
        location: r.location,
        trade: r.trade,
        priority: r.priority,
        status: closed ? 'CLOSED' : fixed ? 'FIXED' : 'OPEN',
        reportedOn: day(r.reportedOn),
        reportedByName: i === 0 ? "Er. S. Das (client's AE), joint inspection" : null,
        reportedById: engineer.id,
        assignedToId: 'assigned' in r ? engineer.id : null,
        contractor: 'contractor' in r ? r.contractor : null,
        dueDate: day(r.dueDate),
        fixedOn: fixed ? day(r.fixed) : null,
        fixNote: fixed ? 'Put right and checked on site' : null,
        fixedById: fixed ? engineer.id : null,
        closedAt: closed ? new Date() : null,
        closedById: closed ? (qa?.id ?? engineer.id) : null,
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'DEFECT', entityId: d.id, action: 'CREATED', actorId: engineer.id } });
  }
  if (!(await prisma.closeoutItem.count({ where: { projectId: building.id } }))) {
    await prisma.closeoutItem.createMany({
      data: DEFAULT_CLOSEOUT_ITEMS.map((c, n) => ({
        organizationId,
        projectId: building.id,
        category: c.category,
        title: c.title,
        sortOrder: (n + 1) * 10,
        doneOn: n === 2 ? day(-5) : null,
        doneById: n === 2 ? engineer.id : null,
      })),
    });
  }
}

async function seedImprests(organizationId: string) {
  if (await prisma.imprest.count({ where: { organizationId } })) return;
  const project = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' } });
  const holder = await prisma.user.findFirst({ where: { organizationId, email: 'engineer@demo.com' } });
  const accounts = await prisma.user.findFirst({ where: { organizationId, role: { key: 'ACCOUNTS_MANAGER' } } });
  if (!project || !holder || !accounts) return;
  const opened = day(-20);
  const imprest = await prisma.imprest.create({
    data: { organizationId, projectId: project.id, holderId: holder.id, floatAmount: D('10000'), openedOn: opened, createdById: accounts.id, note: 'Petty cash for the site office and small repairs', createdAt: opened },
  });
  await prisma.imprestEntry.create({
    data: { organizationId, imprestId: imprest.id, kind: 'ADVANCE', status: 'PAID', amount: D('10000'), date: opened, paidOn: opened, paymentMode: 'BANK', reference: 'NEFT 0412', reason: 'Float', decidedById: accounts.id, decidedAt: opened, createdAt: opened },
  });
  const spent = await prisma.expense.aggregate({
    where: { organizationId, projectId: project.id, submittedById: holder.id, paymentMode: 'CASH', status: { in: ['SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'] }, date: { gte: opened } },
    _sum: { totalAmount: true },
  });
  const due = spent._sum.totalAmount ?? D(0);
  if (due.gt(0)) {
    await prisma.imprestEntry.create({
      data: { organizationId, imprestId: imprest.id, kind: 'ADVANCE', status: 'REQUESTED', amount: due, date: day(0), reason: 'Bills for the grader hose and drinking water are in', requestedById: holder.id },
    });
  }
  await prisma.auditLog.create({ data: { organizationId, entityType: 'IMPREST', entityId: imprest.id, action: 'OPENED', actorId: accounts.id, note: `${holder.fullName}, float ₹10,000, paid`, createdAt: opened } });
}

/**
 * Named worker register demo (v4 item 44): Sri Jagannath Constructions' 13 masons and 17 helpers on the road project,
 * with a roll call for the last six days that matches the head-count sheets (8 + i masons and 12 + i helpers on site
 * i days ago). Masons build the culvert headwalls; helpers lay WMM, then DBM from yesterday. Two helpers left at noon
 * three days ago, and a few masons stayed back two hours. Only when the organisation has no worker yet.
 */
async function seedWorkers(organizationId: string) {
  if (await prisma.worker.count({ where: { organizationId } })) return;
  const project = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' }, include: { activities: true, members: { include: { user: { include: { role: true } } } } } });
  if (!project) return;
  const marker = project.members.find((m) => m.user.role.key === 'TEAM_LEADER')?.userId ?? project.projectManagerId;
  if (!marker) return;
  const contractor = 'Sri Jagannath Constructions';
  const vendor = await prisma.vendor.findFirst({ where: { organizationId, name: contractor }, select: { id: true } });
  const act = (name: string) => project.activities.find((a) => a.name === name)?.id ?? null;
  const [culverts, wmm, dbm] = [act('Pipe culverts'), act('WMM laying'), act('DBM paving')];
  const masons = ['Ramesh Behera', 'Sanjay Pradhan', 'Bijay Sahoo', 'Prakash Nayak', 'Ashok Swain', 'Dillip Mallick', 'Santosh Jena', 'Manoj Rout', 'Pradeep Das', 'Sukanta Barik', 'Niranjan Sethi', 'Rabindra Muduli', 'Gopal Parida'];
  const helpers = ['Bapi Majhi', 'Laxman Hembram', 'Sunil Tudu', 'Raju Naik', 'Kartik Mahanta', 'Purna Dehury', 'Babula Singh', 'Tutu Biswal', 'Ganesh Murmu', 'Mithun Patra', 'Dhaneswar Bag', 'Saroj Sahu', 'Hari Kisan', 'Bikash Gouda', 'Jitu Mohanty', 'Kanha Lenka', 'Rinku Bhoi'];
  const ids: { id: string; trade: 'Mason' | 'Helper'; n: number }[] = [];
  let no = 0;
  for (const [trade, names, wage] of [['Mason', masons, '900.00'], ['Helper', helpers, '550.00']] as const) {
    for (const [n, name] of names.entries()) {
      no += 1;
      const aadhaar = n % 3 !== 2;
      const w = await prisma.worker.create({
        data: {
          organizationId, workerNo: `W-${String(no).padStart(4, '0')}`, name, contractor, vendorId: vendor?.id ?? null, trade,
          skill: trade === 'Mason' ? (n < 3 ? 'HIGHLY_SKILLED' : 'SKILLED') : 'UNSKILLED',
          idType: aadhaar ? 'AADHAAR' : 'VOTER_ID', idNumber: aadhaar ? `XXXX-XXXX-${String(4120 + no * 37).slice(-4)}` : `OR/12/${String(104300 + no * 11)}`,
          phone: n % 2 ? null : `94370${String(51230 + no * 7).padStart(5, '0')}`,
          dailyWage: D(trade === 'Mason' && n < 3 ? '950.00' : wage), projectId: project.id, joinedOn: day(-40 - (n % 4) * 10),
        },
      });
      ids.push({ id: w.id, trade, n });
    }
  }
  for (let i = 5; i >= 0; i--) {
    const date = day(-i);
    for (const w of ids) {
      const onSite = w.n < (w.trade === 'Mason' ? 8 + i : 12 + i);
      const half = onSite && i === 3 && w.trade === 'Helper' && w.n < 2;
      const ot = onSite && w.trade === 'Mason' && w.n < 3 && i % 2 === 1;
      await prisma.workerAttendance.create({
        data: {
          organizationId, workerId: w.id, projectId: project.id, date, markedById: marker,
          status: !onSite ? 'ABSENT' : half ? 'HALF_DAY' : 'PRESENT',
          inTime: onSite ? '08:00' : null, outTime: onSite ? (half ? '12:30' : ot ? '19:00' : '17:00') : null, otHours: ot ? D(2) : null,
          activityId: !onSite ? null : w.trade === 'Mason' ? culverts : i <= 1 ? dbm : wmm,
          note: half ? 'Left at noon (diesel delay)' : null,
        },
      });
    }
  }
}

/**
 * Demo PPE register on the road project's named workers: the standard kit issued as they joined, gloves for the
 * masons (now due for replacement), a helmet lost and re-issued (to recover from the contractor), and three helpers
 * on today's roll call still without a reflective jacket (one without a helmet either). Only when the
 * organisation has no PPE issue yet.
 */
async function seedPpe(organizationId: string) {
  if (await prisma.ppeIssue.count({ where: { organizationId } })) return;
  const workers = await prisma.worker.findMany({ where: { organizationId, isActive: true, projectId: { not: null } }, orderBy: { workerNo: 'asc' } });
  const issuer = (await prisma.user.findFirst({ where: { organizationId, email: 'safety@demo.com' } })) ?? (await prisma.user.findFirst({ where: { organizationId, email: 'store@demo.com' } }));
  if (!workers.length || !issuer) return;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const issue = async (w: (typeof workers)[number], kind: PpeKind, on: Date, extra: Partial<Prisma.PpeIssueUncheckedCreateInput> = {}) =>
    prisma.ppeIssue.create({
      data: { organizationId, projectId: w.projectId!, workerId: w.id, kind, issuedOn: on, replaceBy: new Date(`${ppeReplaceBy(kind, iso(on))}T00:00:00Z`), issuedById: issuer.id, createdAt: on, ...extra },
    });
  const helpers = workers.filter((w) => w.trade === 'Helper');
  for (const [i, w] of workers.entries()) {
    const joined = w.joinedOn ?? day(-40);
    const h = helpers.indexOf(w);
    // Three helpers on today's roll call have no jacket yet (jackets ran out); one of them has no helmet either.
    const kinds: PpeKind[] = h >= 9 && h <= 11 ? (h === 11 ? ['SAFETY_SHOES'] : ['HELMET', 'SAFETY_SHOES']) : ['HELMET', 'SAFETY_SHOES', 'REFLECTIVE_JACKET'];
    for (const kind of kinds) {
      if (kind === 'HELMET' && i === 4) {
        await issue(w, kind, joined, { status: 'LOST', closedOn: day(-20), closeNote: 'Fell into the culvert pit', recoverable: true, closedById: issuer.id });
        await issue(w, kind, day(-20), { note: 'Replacement for the one lost' });
      } else await issue(w, kind, joined, { size: kind === 'SAFETY_SHOES' ? String(7 + (i % 4)) : kind === 'REFLECTIVE_JACKET' ? (i % 3 ? 'L' : 'XL') : null });
    }
    if (w.trade === 'Mason') await issue(w, 'GLOVES', day(-45), { note: 'Cotton gloves for concreting' });
  }
}

/**
 * Machinery maintenance demo (v4 item 42): service schedules (the excavator due soon, the backhoe overdue, the mixer
 * fine), a closed service with spares issued from the road store, the grader's breakdown fixed by the hire agency, an
 * open breakdown on the backhoe, vehicle papers (the tipper's insurance expiring and its PUC lapsed) and drivers (one
 * licence expiring, one expired). Only when the organisation has no job card yet.
 */
async function seedSchedule(organizationId: string) {
  if (await prisma.milestone.count({ where: { organizationId } })) return;
  const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  // Days each activity's finish has moved since the baseline was frozen (by sort order), and the project's milestones:
  // [name, due (days from today, or the project end), days the due date has moved since the baseline, achieved (days after the start)].
  const plans: Record<'ROAD' | 'BUILDING' | 'WATER_SUPPLY', { slip: Record<number, number>; milestones: [string, number | 'end', number, number | null][] }> = {
    ROAD: {
      slip: { 1: 8, 2: 12, 3: 15, 4: 20, 5: 20, 7: 20 },
      milestones: [
        ['Mobilisation complete', -92, 0, 26],
        ['Embankment complete, Km 12 to Km 20', -30, 0, 101],
        ['GSB complete, Km 12 to Km 20', 10, 15, null],
        ['Bituminous surface complete', 95, 20, null],
        ['Road opened to traffic', 'end', 0, null],
      ],
    },
    BUILDING: {
      slip: { 3: 6, 4: 10, 5: 10, 6: 14, 7: 14 },
      milestones: [
        ['Foundations complete', -30, 0, 62],
        ['Ground floor slab cast', -3, 6, null],
        ['Roof slab cast', 150, 10, null],
        ['Block B handed over', 'end', 0, null],
      ],
    },
    WATER_SUPPLY: {
      slip: { 2: 10, 3: 18, 4: 18, 5: 25 },
      milestones: [
        ['Intake well complete', -40, 5, 115],
        ['WTP trial run', 95, 10, null],
        ['Water supplied to the first village', 140, 18, null],
        ['Scheme commissioned', 'end', 0, null],
      ],
    },
  };
  for (const [type, plan] of Object.entries(plans) as [keyof typeof plans, (typeof plans)[keyof typeof plans]][]) {
    const project = await prisma.project.findFirst({ where: { organizationId, type }, orderBy: { code: 'asc' }, include: { activities: true } });
    if (!project?.startDate || !project.endDate || !project.projectManagerId) continue;
    for (const a of project.activities) {
      if (!a.plannedStart || !a.plannedEnd) continue;
      const slip = plan.slip[a.sortOrder] ?? 0;
      await prisma.activity.update({ where: { id: a.id }, data: { baselineStart: plus(a.plannedStart, -Math.round(slip / 2)), baselineEnd: plus(a.plannedEnd, -slip) } });
    }
    for (const [i, [name, due, slip, achieved]] of plan.milestones.entries()) {
      const dueDate = due === 'end' ? project.endDate : day(due);
      await prisma.milestone.create({
        data: { organizationId, projectId: project.id, name, dueDate, baselineDate: plus(dueDate, -slip), achievedOn: achieved === null ? null : plus(project.startDate, achieved), sortOrder: i },
      });
    }
    const frozen = plus(project.startDate, 14);
    await prisma.project.update({ where: { id: project.id }, data: { baselineAt: frozen, baselineById: project.projectManagerId, baselineNote: 'Programme submitted with the agreement' } });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'PROJECT', entityId: project.id, action: 'BASELINE_FROZEN', actorId: project.projectManagerId, note: 'Programme submitted with the agreement', createdAt: frozen } });
  }
}

async function seedMaintenance(organizationId: string) {
  if (await prisma.maintenanceJob.count({ where: { organizationId } })) return;
  const eq = async (code: string) => prisma.equipment.findFirst({ where: { organizationId, code } });
  const [exc, grd, jcb, dg, mix, tc, tip] = await Promise.all(['EXC-01', 'GRD-01', 'JCB-01', 'DG-01', 'MIX-01', 'TC-01', 'TIP-07'].map(eq));
  const keeper = await prisma.user.findFirst({ where: { organizationId, email: 'store@demo.com' } });
  const engineer = await prisma.user.findFirst({ where: { organizationId, email: 'engineer@demo.com' } });
  const engineer2 = await prisma.user.findFirst({ where: { organizationId, email: 'engineer2@demo.com' } });
  if (!exc || !grd || !jcb || !dg || !mix || !tc || !tip || !keeper || !engineer || !engineer2 || !exc.projectId) return;
  const year = new Date().getUTCFullYear();
  const audit = (entityType: string, entityId: string, action: string, actorId: string, at: Date, note?: string) =>
    prisma.auditLog.create({ data: { organizationId, entityType, entityId, action, actorId, note: note ?? null, createdAt: at } });

  const schedules: [typeof exc, number | null, number | null, number, number][] = [
    [exc, 250, 90, -86, 1150],
    [jcb, 250, 90, -95, 2010],
    [dg, 40, 30, -4, 3120],
    [mix, 500, 180, -30, 1800],
    [tip, null, 120, -60, 48200],
  ];
  for (const [m, hours, days, last, meter] of schedules)
    await prisma.equipment.update({ where: { id: m.id }, data: { serviceIntervalHours: hours ? D(hours) : null, serviceIntervalDays: days, lastServiceDate: day(last), lastServiceMeter: D(meter) } });

  // Spares at the road store: an opening count, then the excavator's service issue against its job card.
  const spare = (name: string, unit: string, rate: string) =>
    prisma.item.upsert({ where: { organizationId_name_unit: { organizationId, name, unit } }, update: {}, create: { organizationId, name, unit, rate: D(rate), category: 'Spares & lubricants' } });
  const [oil, filter, grease, hyd] = await Promise.all([spare('Engine oil 15W-40', 'Ltr', '310'), spare('Oil filter (EX200)', 'Nos', '850'), spare('Grease (lithium)', 'Kg', '260'), spare('Hydraulic oil 68', 'Ltr', '240')]);
  const nextNo = async (prefix: string) => {
    const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
    return `${prefix}-${year}-${String((last ? parseInt(last.entryNo.slice(prefix.length + 6), 10) : 0) + 1).padStart(4, '0')}`;
  };
  const stockEntry = async (type: 'ADJUSTMENT' | 'ISSUE', offset: number, data: Partial<Prisma.StockEntryUncheckedCreateInput>, lines: [string, number][]) => {
    const e = await prisma.stockEntry.create({
      data: {
        organizationId, projectId: exc.projectId!, type, entryNo: await nextNo(type === 'ISSUE' ? 'ISS' : 'ADJ'), date: day(offset), createdById: keeper.id, createdAt: day(offset), ...data,
        lines: { create: lines.map(([itemId, q], i) => ({ organizationId, projectId: exc.projectId!, itemId, type, date: day(offset), quantity: D(q), sortOrder: i })) },
      },
    });
    await audit('STOCK', e.id, 'CREATED', keeper.id, day(offset), e.entryNo);
    return e;
  };
  await stockEntry('ADJUSTMENT', -90, { remarks: 'Opening stock of spares and lubricants' }, [[oil.id, 60], [filter.id, 4], [grease.id, 10], [hyd.id, 40]]);

  const jobs = [
    { m: exc, kind: 'SERVICE', by: keeper, open: -86, close: -86, meter: 1150, description: '250-hour service due', workshop: 'Own mechanic (Bhagaban Sethi)', workDone: 'Engine oil and filter changed, fuel filter cleaned, all points greased.', labour: 1800, parts: 0, down: 6, spares: [[oil.id, -24], [filter.id, -1], [grease.id, -2]] as [string, number][] },
    { m: grd, kind: 'BREAKDOWN', by: engineer, open: -2, close: -2, meter: null, description: 'Hydraulic hose burst on the blade lift; machine stopped at Ch 14+600.', workshop: 'Mahalaxmi Earthmovers (hire agency)', workDone: 'Hose replaced by the agency mechanic at their cost.', labour: 0, parts: 0, down: 3, spares: [] },
    { m: mix, kind: 'BREAKDOWN', by: engineer2, open: -9, close: -8, meter: null, description: 'Drum motor not starting; concreting of the lift shaft wall held up.', workshop: 'Sri Durga Electricals', workDone: 'Motor rewound and starter contactor replaced.', labour: 2500, parts: 1800, down: 7, spares: [] },
    { m: jcb, kind: 'BREAKDOWN', by: engineer, open: 0, close: null, meter: 2240, description: 'Loader arm cylinder leaking oil; machine parked at the pipe yard.', workshop: null, workDone: null, labour: 0, parts: 0, down: null, spares: [] },
  ] as const;
  let n = 0;
  for (const j of jobs) {
    const job = await prisma.maintenanceJob.create({
      data: {
        organizationId, equipmentId: j.m.id, projectId: j.m.projectId, jobNo: `MNT-${year}-${String(++n).padStart(4, '0')}`, kind: j.kind, date: day(j.open),
        meterReading: j.meter ? D(j.meter) : null, description: j.description, workshop: j.workshop, reportedById: j.by.id, createdAt: day(j.open),
        ...(j.close !== null ? { status: 'CLOSED' as const, closedDate: day(j.close), workDone: j.workDone, labourCost: D(j.labour), partsCost: D(j.parts), downtimeHours: j.down ? D(j.down) : null, closedById: keeper.id } : {}),
      },
    });
    await audit('MAINTENANCE_JOB', job.id, 'CREATED', j.by.id, day(j.open));
    if (j.close !== null) await audit('MAINTENANCE_JOB', job.id, 'CLOSED', keeper.id, day(j.close), j.workDone);
    if (j.spares.length) await stockEntry('ISSUE', j.open, { issuedTo: `${j.m.code} (${job.jobNo})`, remarks: `Spares for service ${job.jobNo}`, maintenanceJobId: job.id }, [...j.spares]);
  }

  const docs: [typeof exc, 'INSURANCE' | 'FITNESS' | 'PERMIT' | 'PUC' | 'ROAD_TAX' | 'REGISTRATION' | 'OTHER', string | null, string | null, number, string | null][] = [
    [tip, 'INSURANCE', 'OG-25-2401-1801-00004471', 'New India Assurance', -353, null],
    [tip, 'INSURANCE', 'OG-26-2401-1801-00009120', 'New India Assurance', 12, 'Comprehensive, IDV ₹28 lakh'],
    [tip, 'FITNESS', 'FC/OD02/2026/1187', 'RTO Bhubaneswar', 210, null],
    [tip, 'PERMIT', 'NP/OD/2026/0420', 'STA Odisha', 150, 'Goods carriage, Odisha'],
    [tip, 'PUC', 'PUC-OD02-77812', 'Pipili emission test centre', -3, null],
    [tip, 'ROAD_TAX', 'TAX/OD02/26-27/5531', 'RTO Bhubaneswar', 170, 'Paid for the year'],
    [exc, 'INSURANCE', 'CE-26-3310-0000-2214', 'United India Insurance', 140, 'Contractor’s plant and machinery policy'],
    [jcb, 'INSURANCE', 'CE-26-3310-0000-2251', 'United India Insurance', 25, null],
    [jcb, 'PUC', 'PUC-OD02-77901', 'Pipili emission test centre', 60, null],
    [tc, 'OTHER', 'LT/KC/2026/031', 'Competent person (Factories Act)', 45, 'Load test certificate of the tower crane'],
  ];
  for (const [m, type, number, issuer, validTo, notes] of docs)
    await prisma.equipmentDocument.create({ data: { organizationId, equipmentId: m.id, type, number, issuer, validFrom: day(validTo - 365), validTo: day(validTo), notes, createdAt: day(-30) } });

  const drivers: [string, string, string, string, number, typeof exc][] = [
    ['Sukanta Behera', '9437012345', 'OD0220190012345', 'HMV', 20, tip],
    ['Sanjay Nayak', '9437023456', 'OD0220170045678', 'HMV, excavator operator', 640, exc],
    ['Pradip Sahoo', '9437034567', 'OD1920180078123', 'HMV', 400, jcb],
    ['Bikash Mallick', '9437045678', 'OD0520150011223', 'Crane operator', -10, tc],
  ];
  for (const [name, phone, licenceNo, licenceClass, validTo, m] of drivers)
    await prisma.driver.create({ data: { organizationId, name, phone, licenceNo, licenceClass, licenceValidTo: day(validTo), equipmentId: m.id, notes: m === tc ? 'From Kalinga Cranes with the hired crane' : null } });
}

/**
 * Demo transfers and returns (v4 item 39) on the road project's store: unused material back from site, a transfer to
 * the water supply project already received there, a second one still in transit, and material returned to the
 * supplier of the GRN. Only when the organisation has no transfer yet.
 */
/**
 * Sector progress demo (v4 item 41): the road's chainage range with the approved progress placed along it, the
 * hospital's floors, and the water scheme's villages, its raw water main along a chainage and a pipe testing activity.
 * Only fills what is still empty, so re-running it changes nothing.
 */
async function seedSectors(organizationId: string) {
  const find = (code: string) => prisma.project.findFirst({ where: { organizationId, code } });
  const approved = (projectId: string, activityName: string) =>
    prisma.progressEntry.findMany({ where: { projectId, activity: { name: activityName }, status: 'APPROVED' }, orderBy: { date: 'asc' }, include: { activity: true } });

  const road = await find('RD-2026-01');
  if (road) {
    if (road.chainageStart === null) await prisma.project.update({ where: { id: road.id }, data: { chainageStart: 12000, chainageEnd: 28000 } });
    for (const layer of ['Earthwork embankment', 'GSB laying', 'WMM laying', 'DBM paving']) {
      let at = 12000;
      for (const e of await approved(road.id, layer)) {
        const len = Math.max(50, Math.round((Number(e.quantity) / Number(e.activity.plannedQty)) * 16000));
        if (e.chainageFrom === null) await prisma.progressEntry.update({ where: { id: e.id }, data: { chainageFrom: at, chainageTo: Math.min(at + len, 28000), location: e.location ?? `Ch ${Math.floor(at / 1000)}+${String(at % 1000).padStart(3, '0')}` } });
        at = Math.min(at + len, 28000);
      }
    }
    const culverts = [13420, 17880, 21150, 24600];
    for (const [i, e] of (await approved(road.id, 'Pipe culverts')).entries()) {
      if (e.chainageFrom === null && culverts[i] !== undefined) await prisma.progressEntry.update({ where: { id: e.id }, data: { chainageFrom: culverts[i], chainageTo: culverts[i] } });
    }
    await prisma.progressEntry.updateMany({ where: { projectId: road.id, status: 'SUBMITTED', location: 'Ch. 14+200 to 14+650', chainageFrom: null }, data: { chainageFrom: 14200, chainageTo: 14650 } });
  }

  const hospital = await find('BL-2026-02');
  if (hospital) {
    if (!hospital.floors.length) await prisma.project.update({ where: { id: hospital.id }, data: { floors: ['Foundation', 'Plinth', 'Ground floor', 'First floor', 'Second floor', 'Third floor', 'Terrace'] } });
    const floorOf: Record<string, string[]> = {
      'Foundation excavation': ['Foundation'],
      'PCC bed': ['Foundation'],
      'RCC footings and columns': ['Foundation', 'Plinth', 'Ground floor'],
      'RCC slab GF': ['Ground floor', 'Ground floor'],
      'Brick masonry': ['Ground floor'],
    };
    for (const [activity, floors] of Object.entries(floorOf)) {
      for (const [i, e] of (await approved(hospital.id, activity)).entries()) {
        if (e.floor === null) await prisma.progressEntry.update({ where: { id: e.id }, data: { floor: floors[Math.min(i, floors.length - 1)] } });
      }
    }
  }

  const water = await find('WS-2026-03');
  if (water) {
    const villages = ['Barabati', 'Rampur', 'Kesarpada', 'Sonepur', 'Gopalpur', 'Tentulia'];
    if (!water.villages.length) await prisma.project.update({ where: { id: water.id }, data: { villages, chainageStart: 0, chainageEnd: 8200 } });
    let at = 0;
    for (const e of await approved(water.id, 'Raw water main laying')) {
      const len = Math.round(Number(e.quantity));
      if (e.chainageFrom === null) await prisma.progressEntry.update({ where: { id: e.id }, data: { chainageFrom: at, chainageTo: Math.min(at + len, 8200) } });
      at = Math.min(at + len, 8200);
    }
    for (const [i, e] of (await approved(water.id, 'Distribution network')).entries()) {
      if (e.village === null) await prisma.progressEntry.update({ where: { id: e.id }, data: { village: villages[i % villages.length] } });
    }
    await prisma.progressEntry.updateMany({ where: { projectId: water.id, location: 'Zone 3, Village Barabati', village: null }, data: { village: 'Barabati' } });
    let testing = await prisma.activity.findFirst({ where: { projectId: water.id, name: 'Hydraulic testing of pipelines' } });
    if (!testing) {
      const network = await prisma.activity.findFirst({ where: { projectId: water.id, name: 'Distribution network' } });
      const engineer = await prisma.user.findFirst({ where: { organizationId, email: 'engineer@demo.com' } });
      const pm = await prisma.user.findFirst({ where: { organizationId, email: 'pm@demo.com' } });
      if (network && engineer && pm) {
        testing = await prisma.activity.create({
          data: { organizationId, projectId: water.id, name: 'Hydraulic testing of pipelines', unit: 'Rmt', plannedQty: D('54200'), plannedStart: network.plannedStart, plannedEnd: network.plannedEnd, sortOrder: network.sortOrder },
        });
        for (const [daysAgo, qty, village] of [[12, '3200', 'Barabati'], [5, '2600', 'Rampur']] as const) {
          const date = day(-daysAgo);
          await prisma.progressEntry.create({
            data: { organizationId, projectId: water.id, activityId: testing.id, date, quantity: D(qty), village, location: village, status: 'APPROVED', submittedById: engineer.id, submittedAt: date, reviewedById: pm.id, reviewedAt: date, reviewNote: 'Test pressure held for 2 hours', remarks: 'Hydro test at 1.5 times working pressure' },
          });
        }
      }
    }
  }
}

/**
 * Demo safety (v4 item 40): the safety officer joins the road and building projects; a few incidents and near misses
 * (one closed with its root cause), toolbox talks, and permits to work (one waiting, one live, one closed). Only when
 * the organisation has no safety records yet.
 */
async function seedSafety(organizationId: string) {
  const officer = await prisma.user.findFirst({ where: { organizationId, email: 'safety@demo.com' } });
  const road = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' } });
  const building = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' } });
  const engineer = await prisma.user.findFirst({ where: { organizationId, email: 'engineer@demo.com' } });
  const engineer2 = await prisma.user.findFirst({ where: { organizationId, email: 'engineer2@demo.com' } });
  const tl = await prisma.user.findFirst({ where: { organizationId, email: 'tl@demo.com' } });
  if (!officer || !road || !building || !engineer || !engineer2 || !tl) return;
  for (const p of [road, building])
    await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: p.id, userId: officer.id } }, update: {}, create: { projectId: p.id, userId: officer.id } });
  if (await prisma.safetyIncident.count({ where: { organizationId } })) return;
  const year = new Date().getUTCFullYear();
  const no = (prefix: string, n: number) => `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  const audit = (entityType: string, entityId: string, action: string, actorId: string, at: Date, note?: string) =>
    prisma.auditLog.create({ data: { organizationId, entityType, entityId, action, actorId, note: note ?? null, createdAt: at } });

  const incidents = [
    { p: road, by: engineer, type: 'NEAR_MISS', off: -12, time: '10:20', location: 'Ch 14+300, WMM stretch', description: 'Tipper reversed towards the paver crew without a banksman; the crew stepped clear.', contractor: 'Maa Tarini Transport', immediate: 'Work stopped; driver briefed.', root: 'No banksman posted after the shift change.', action: 'Banksman for every reversing tipper; reversing alarm checked daily.', closed: true },
    { p: building, by: engineer2, type: 'FIRST_AID', off: -6, time: '15:40', location: 'Block A, 2nd floor slab edge', description: 'Helper cut his palm on a protruding binding wire while carrying shuttering plates.', contractor: 'Mahanadi Builders', injured: 1, names: 'Bapi Nayak (helper)', immediate: 'Cleaned and dressed at the first-aid box; back to work.', closed: false },
    { p: road, by: tl, type: 'PROPERTY_DAMAGE', off: -3, time: '08:05', location: 'Batching plant yard', description: 'Loader bucket hit the cement silo ladder while turning; ladder bent, no one hurt.', contractor: null, immediate: 'Silo access closed until the ladder is repaired.', closed: false },
    { p: building, by: engineer2, type: 'NEAR_MISS', off: -1, time: '11:30', location: 'Block B, scaffold on the east face', description: 'A brick fell from the 3rd-floor scaffold; it landed inside the barricaded area.', contractor: 'Mahanadi Builders', immediate: 'Toe boards fitted on that bay.', closed: false },
  ];
  let n = 0;
  for (const i of incidents) {
    const at = day(i.off);
    const row = await prisma.safetyIncident.create({
      data: {
        organizationId, projectId: i.p.id, incidentNo: no('INC', ++n), type: i.type as 'NEAR_MISS', date: at, time: i.time, location: i.location, description: i.description,
        injuredCount: i.injured ?? 0, injuredNames: i.names ?? null, contractor: i.contractor, immediateAction: i.immediate,
        rootCause: i.root ?? null, correctiveAction: i.action ?? null, reportedById: i.by.id, createdAt: at,
        ...(i.closed ? { status: 'CLOSED' as const, closedAt: day(i.off + 2), closedById: officer.id, closureNote: 'Checked on the next two shifts.' } : {}),
      },
    });
    await audit('SAFETY_INCIDENT', row.id, 'CREATED', i.by.id, at);
    if (i.closed) await audit('SAFETY_INCIDENT', row.id, 'CLOSED', officer.id, day(i.off + 2), 'Checked on the next two shifts.');
  }

  const talks = [
    { p: road, off: -7, topic: 'Traffic management and reversing vehicles', by: 'Harish Pradhan (safety officer)', contractor: 'Maa Tarini Transport', count: 24, mins: 15 },
    { p: building, off: -5, topic: 'Working at height and harness use', by: 'Harish Pradhan (safety officer)', contractor: 'Mahanadi Builders', count: 38, mins: 20 },
    { p: road, off: -2, topic: 'Heat stress, water and rest', by: 'Manoj Das (supervisor)', contractor: null, count: 31, mins: 10 },
    { p: building, off: 0, topic: 'Housekeeping and slips, trips, falls', by: 'Priya Mohanty', contractor: 'Mahanadi Builders', count: 35, mins: 15 },
  ];
  n = 0;
  for (const t of talks) {
    const at = day(t.off);
    const row = await prisma.toolboxTalk.create({
      data: { organizationId, projectId: t.p.id, talkNo: no('TBT', ++n), date: at, topic: t.topic, conductedBy: t.by, contractor: t.contractor, attendeeCount: t.count, durationMinutes: t.mins, recordedById: officer.id, createdAt: at },
    });
    await audit('TOOLBOX_TALK', row.id, 'CREATED', officer.id, at);
  }

  const at = (offDays: number, hour: number) => {
    const d = day(offDays);
    d.setUTCHours(hour - 5, 30, 0, 0); // hour in India time
    return d;
  };
  const permits = [
    { p: building, by: engineer2, type: 'HOT_WORK', location: 'Terrace, overhead tank stand', description: 'Welding the tank stand brackets', contractor: 'Mahanadi Builders', workers: 3, from: at(-4, 9), to: at(-4, 18), status: 'CLOSED', note: 'Fire extinguisher and a watcher at all times.' },
    { p: building, by: engineer2, type: 'WORK_AT_HEIGHT', location: 'Block A, east face 3rd to 5th floor', description: 'External plastering from the scaffold', contractor: 'Mahanadi Builders', workers: 6, from: at(0, 8), to: at(2, 18), status: 'ISSUED', note: 'Harness anchored to the lifeline, not the scaffold.' },
    { p: road, by: engineer, type: 'EXCAVATION', location: 'Ch 15+120, culvert CD-7', description: 'Excavation for the culvert foundation, 2.4 m deep', contractor: null, workers: 8, from: at(1, 8), to: at(1, 18), status: 'REQUESTED', note: null },
  ] as const;
  n = 0;
  for (const p of permits) {
    const issued = p.status !== 'REQUESTED';
    const row = await prisma.workPermit.create({
      data: {
        organizationId, projectId: p.p.id, permitNo: no('PTW', ++n), type: p.type, location: p.location, description: p.description, contractor: p.contractor, workerCount: p.workers,
        validFrom: p.from, validTo: p.to, precautions: PERMIT_PRECAUTIONS[p.type].slice(0, 4), status: p.status, requestedById: p.by.id, createdAt: day(-5),
        ...(issued ? { issuedById: officer.id, issuedAt: p.from, issueNote: p.note } : {}),
        ...(p.status === 'CLOSED' ? { closedById: p.by.id, closedAt: p.to, closeNote: 'Work done, area checked for embers.' } : {}),
      },
    });
    await audit('WORK_PERMIT', row.id, 'REQUESTED', p.by.id, day(-5));
    if (issued) await audit('WORK_PERMIT', row.id, 'ISSUED', officer.id, p.from);
    if (p.status === 'CLOSED') await audit('WORK_PERMIT', row.id, 'CLOSED', p.by.id, p.to);
  }
}

async function seedStoreMoves(organizationId: string) {
  if (await prisma.stockEntry.count({ where: { organizationId, type: 'TRANSFER_OUT' } })) return;
  const road = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' } });
  const other = await prisma.project.findFirst({ where: { organizationId, type: 'WATER_SUPPLY' }, orderBy: { code: 'asc' } });
  const keeper = await prisma.user.findFirst({ where: { organizationId, email: 'store@demo.com' } });
  if (!road || !other || !keeper) return;
  const year = new Date().getUTCFullYear();
  const nextNo = async (prefix: string) => {
    const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
    return `${prefix}-${year}-${String((last ? parseInt(last.entryNo.slice(prefix.length + 6), 10) : 0) + 1).padStart(4, '0')}`;
  };
  type Move = 'TRANSFER_OUT' | 'TRANSFER_IN' | 'RETURN_TO_VENDOR' | 'RETURN_FROM_SITE';
  const PREFIX: Record<Move, string> = { TRANSFER_OUT: 'TRO', TRANSFER_IN: 'TRI', RETURN_TO_VENDOR: 'RTV', RETURN_FROM_SITE: 'RFS' };
  const entry = async (projectId: string, type: Move, offset: number, data: Partial<Prisma.StockEntryUncheckedCreateInput>, lines: { itemId: string; quantity: Prisma.Decimal }[]) => {
    const e = await prisma.stockEntry.create({
      data: {
        organizationId, projectId, type, entryNo: await nextNo(PREFIX[type]), date: day(offset), createdById: keeper.id, createdAt: day(offset), ...data,
        lines: { create: lines.map((l, i) => ({ organizationId, projectId, itemId: l.itemId, type, date: day(offset), quantity: l.quantity, sortOrder: i })) },
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: keeper.id, note: e.entryNo, createdAt: day(offset) } });
    return e;
  };
  const sums = await prisma.stockTxn.groupBy({ by: ['itemId', 'type'], where: { projectId: road.id }, _sum: { quantity: true } });
  const of = (itemId: string, type: string) => sums.find((x) => x.itemId === itemId && x.type === type)?._sum.quantity ?? D(0);
  const itemIds = [...new Set(sums.map((x) => x.itemId))];
  const balance = (itemId: string) => sums.filter((x) => x.itemId === itemId).reduce((t, x) => t.add(x._sum.quantity ?? 0), D(0));
  const issued = itemIds.filter((id) => of(id, 'ISSUE').lt(0) && balance(id).gt(0));
  if (issued.length < 2) return;
  const [a, b] = issued;
  await entry(road.id, 'RETURN_FROM_SITE', -1, { issuedTo: 'Departmental (machinery)', remarks: 'Unused after the WMM stretch was closed for the day' }, [{ itemId: a, quantity: of(a, 'ISSUE').neg().div(10).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN).add(1) }]);
  const sent = balance(b).div(10).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN).add(1);
  const out = await entry(road.id, 'TRANSFER_OUT', -2, { toProjectId: other.id, issuedTo: other.name, vehicleNo: 'OD-02-BK-2290', challanNo: 'DC-311' }, [{ itemId: b, quantity: sent.neg() }]);
  await entry(other.id, 'TRANSFER_IN', -1, { transferOutId: out.id, supplier: road.name, vehicleNo: 'OD-02-BK-2290', challanNo: 'DC-311' }, [{ itemId: b, quantity: sent }]);
  await entry(road.id, 'TRANSFER_OUT', 0, { toProjectId: other.id, issuedTo: other.name, vehicleNo: 'OD-02-BK-2290', challanNo: 'DC-318', remarks: 'Urgent: their pipe bedding stretch' }, [{ itemId: a, quantity: D(-1) }]);
  const grn = await prisma.stockEntry.findFirst({ where: { projectId: road.id, type: 'RECEIPT' }, include: { lines: true }, orderBy: { date: 'asc' } });
  const line = grn?.lines.find((l) => balance(l.itemId).gt(2));
  if (grn && line)
    await entry(road.id, 'RETURN_TO_VENDOR', 0, { supplier: grn.supplier, vendorId: grn.vendorId, challanNo: 'DN-07', remarks: 'Part of the load was below the specified grade' }, [{ itemId: line.itemId, quantity: D(-1) }]);
}

/**
 * Demo material reconciliation on the first building project: the QS's norms for cement, steel and bricks on its
 * concrete and masonry items, and a receipt and an issue of them for each month with progress (so stock balances do
 * not move; months before the register in Nirmaan opened are marked as copied from the old register). The history is sized so that cement comes out over its allowance,
 * steel within it and bricks below theoretical; binding wire, plywood and diesel stay without a norm. Only when the
 * organisation has no norms yet.
 */
async function seedReconciliation(organizationId: string) {
  if (await prisma.materialNorm.count({ where: { organizationId } })) return;
  const project = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' } });
  const qs = (await prisma.user.findFirst({ where: { organizationId, email: 'qs@demo.com' } })) ?? (await prisma.user.findFirst({ where: { organizationId, email: 'pm@demo.com' } }));
  const keeper = (await prisma.user.findFirst({ where: { organizationId, email: 'store@demo.com' } })) ?? qs;
  if (!project || !qs || !keeper) return;
  const item = async (name: string, unit: string, rate: string | null) =>
    (await prisma.item.findFirst({ where: { organizationId, name, unit } })) ?? prisma.item.create({ data: { organizationId, name, unit, rate: rate === null ? null : D(rate) } });
  const cement = await item('OPC 53 Grade Cement', 'Bags', '395.00');
  const steel = await item('TMT Fe500D 12mm', 'MT', '61500.00');
  const bricks = await item('Fly ash bricks 230mm', 'Nos', '8.50');
  // [BOQ item no., item, quantity per unit, wastage %, note]
  const NORMS: [string, { id: string }, string, number, string][] = [
    ['2.01', cement, '3.4', 2, 'PCC 1:4:8, nominal mix'],
    ['3.01', cement, '8.2', 2, 'M25 design mix, 410 kg per cum'],
    ['3.01', steel, '0.11', 3, 'Footings and columns, from the bar bending schedule'],
    ['3.02', cement, '8.2', 2, 'M25 design mix, 410 kg per cum'],
    ['3.02', steel, '0.09', 3, 'Slabs and beams, from the bar bending schedule'],
    ['3.03', cement, '8.2', 2, 'M25 design mix, 410 kg per cum'],
    ['3.03', steel, '0.09', 3, 'Slabs and beams, from the bar bending schedule'],
    ['4.01', bricks, '500', 3, '230 mm wall'],
    ['4.01', cement, '1.25', 2, 'CM 1:6 mortar'],
  ];
  const boq = new Map((await prisma.boqItem.findMany({ where: { projectId: project.id } })).map((b) => [b.itemNo, b]));
  const norms: { boqItemId: string; itemId: string; qty: Prisma.Decimal }[] = [];
  for (const [no, it, qty, wastage, note] of NORMS) {
    const b = boq.get(no);
    if (!b) continue;
    await prisma.materialNorm.create({ data: { organizationId, projectId: project.id, boqItemId: b.id, itemId: it.id, qtyPerUnit: D(qty), wastagePct: D(wastage), note, updatedById: qs.id } });
    norms.push({ boqItemId: b.id, itemId: it.id, qty: D(qty) });
  }
  await prisma.auditLog.create({ data: { organizationId, entityType: 'PROJECT', entityId: project.id, action: 'MATERIAL_NORM_ADDED', actorId: qs.id, note: `${norms.length} norms from the rate analysis` } });

  // Store history before the register opened: theoretical × factor, less what the register already shows used.
  const opened = (await prisma.stockEntry.findFirst({ where: { projectId: project.id }, orderBy: { date: 'asc' }, select: { date: true } }))?.date ?? day(0);
  const progress = await prisma.progressEntry.findMany({
    where: { projectId: project.id, status: 'APPROVED', activity: { boqItemId: { in: norms.map((n) => n.boqItemId) } } },
    select: { date: true, quantity: true, activity: { select: { boqItemId: true } } },
  });
  // [item, consumption as a factor of theoretical, decimal places (-2 = hundreds)]
  const FACTOR: [{ id: string }, number, number][] = [[cement, 1.05, 0], [steel, 1.016, 3], [bricks, 0.905, -2]];
  const used = await prisma.stockTxn.groupBy({ by: ['itemId', 'type'], where: { projectId: project.id, type: { in: ['ISSUE', 'RETURN_FROM_SITE'] } }, _sum: { quantity: true } });
  const months = new Map<string, { first: Date; last: Date; theo: Map<string, Prisma.Decimal> }>();
  const total = new Map<string, Prisma.Decimal>();
  for (const p of progress) {
    for (const n of norms.filter((x) => x.boqItemId === p.activity.boqItemId)) {
      const t = p.quantity.mul(n.qty);
      total.set(n.itemId, (total.get(n.itemId) ?? D(0)).add(t));
      const key = p.date.toISOString().slice(0, 7);
      const m = months.get(key) ?? { first: p.date, last: p.date, theo: new Map() };
      if (p.date < m.first) m.first = p.date;
      if (p.date > m.last) m.last = p.date;
      m.theo.set(n.itemId, (m.theo.get(n.itemId) ?? D(0)).add(t));
      months.set(key, m);
    }
  }
  const year = new Date().getUTCFullYear();
  const nextNo = async (prefix: string) => {
    const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
    return `${prefix}-${year}-${String((last ? parseInt(last.entryNo.slice(prefix.length + 6), 10) : 0) + 1).padStart(4, '0')}`;
  };
  const histTotal = new Map<string, Prisma.Decimal>();
  for (const m of months.values()) for (const [id, t] of m.theo) histTotal.set(id, (histTotal.get(id) ?? D(0)).add(t));
  for (const [key, m] of [...months].sort((a, b) => a[0].localeCompare(b[0]))) {
    const lines: { itemId: string; quantity: Prisma.Decimal }[] = [];
    for (const [it, factor, places] of FACTOR) {
      const hist = histTotal.get(it.id);
      const theo = m.theo.get(it.id);
      if (!hist || !theo || hist.lte(0)) continue;
      const already = used.filter((u) => u.itemId === it.id).reduce((s, u) => s.add(u._sum.quantity ?? 0), D(0)).neg();
      const target = (total.get(it.id) ?? D(0)).mul(factor).minus(already);
      const share = target.mul(theo).div(hist);
      const qty = places < 0 ? share.div(10 ** -places).toDecimalPlaces(0).mul(10 ** -places) : share.toDecimalPlaces(places);
      if (qty.gt(0)) lines.push({ itemId: it.id, quantity: qty });
    }
    if (!lines.length) continue;
    for (const [type, prefix, date, sign, data] of [
      ['RECEIPT', 'GRN', m.first, 1, { supplier: 'Various suppliers', remarks: m.first < opened ? `Receipts for ${key}, from the store register before Nirmaan` : `Receipts for ${key}` }],
      ['ISSUE', 'ISS', m.last, -1, { issuedTo: 'Departmental (concrete and masonry gangs)', remarks: m.last < opened ? `Issues for ${key}, from the store register before Nirmaan` : `Issues for ${key}` }],
    ] as const) {
      const e = await prisma.stockEntry.create({
        data: {
          organizationId, projectId: project.id, type, entryNo: await nextNo(prefix), date, createdById: keeper.id, createdAt: date, ...data,
          lines: { create: lines.map((l, i) => ({ organizationId, projectId: project.id, itemId: l.itemId, type, date, quantity: l.quantity.mul(sign), sortOrder: i })) },
        },
      });
      await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: keeper.id, note: e.entryNo, createdAt: date } });
    }
  }
}

/**
 * Demo RFI register. Road: RFI 1 (culverts between Km 17 and 19) answered by the client's engineer in the portal and
 * closed with variation V-1; RFI 2 (kerb stones) answered by letter and waiting to be closed, linked to V-2; RFI 3
 * (HT line at Ch 14+100) waiting and 9 days late, linked to the risk. Hospital: RFI 4 (footing level) urgent and due
 * tomorrow, on STR-201; RFI 5 (fire door rating) not yet due. Only when the organisation has no RFI yet.
 */
async function seedRfis(organizationId: string) {
  if (await prisma.rfi.count({ where: { organizationId } })) return;
  const user = (email: string) => prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } });
  const [engineer, qs, client] = await Promise.all([user('engineer@demo.com'), user('qs@demo.com'), user('client@demo.com')]);
  const road = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' } });
  const building = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' } });
  const raiser = engineer ?? qs;
  if (!road || !building || !raiser) return;
  const doc = (projectId: string, docNo: string) => prisma.document.findFirst({ where: { projectId, docNo }, select: { id: true } });
  const variation = (projectId: string, varNo: number) => prisma.variation.findFirst({ where: { projectId, varNo }, select: { id: true } });
  const risk = (projectId: string, title: string) => prisma.risk.findFirst({ where: { projectId, title: { startsWith: title } }, select: { id: true } });
  const year = new Date().getUTCFullYear();
  let n = 0;
  const rfi = async (projectId: string, raisedOffset: number, replyOffset: number, data: Omit<Prisma.RfiUncheckedCreateInput, 'organizationId' | 'projectId' | 'rfiNo' | 'raisedOn' | 'replyBy'>) => {
    n += 1;
    const r = await prisma.rfi.create({
      data: { organizationId, projectId, rfiNo: `RFI-${year}-${String(n).padStart(4, '0')}`, raisedOn: day(raisedOffset), replyBy: day(replyOffset), raisedById: raiser.id, createdAt: day(raisedOffset), ...data },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'RFI', entityId: r.id, action: 'CREATED', actorId: data.raisedById ?? raiser.id, note: r.rfiNo, createdAt: day(raisedOffset) } });
    return r;
  };
  const toRoad = road.consultantName ?? road.clientName ?? "Client's engineer";
  await rfi(road.id, -34, -27, {
    subject: 'Cross drainage between Km 17 and Km 19',
    question: 'Water ponds on both sides of the embankment between Km 17+200 and Km 18+900; the plan and profile show no cross drainage there. Should culverts be added, and of what size?',
    proposal: 'Two 1.2 m pipe culverts at Km 17+640 and Km 18+410, and a 2 x 2 m box culvert at Km 18+860.',
    location: 'Km 17+200 to Km 18+900',
    toParty: toRoad,
    documentId: (await doc(road.id, 'RD-PP-03'))?.id ?? null,
    costImpact: true,
    status: 'CLOSED',
    answer: 'Agreed. Provide the two pipe culverts and the box culvert as proposed; submit the variation with rates.',
    answeredOn: day(-29),
    answeredById: client?.id ?? null,
    answeredByName: client ? null : "Client's engineer",
    closedOn: day(-20),
    closeNote: 'Variation V-1 submitted and approved',
    closedById: qs?.id ?? raiser.id,
    variationId: (await variation(road.id, 1))?.id ?? null,
  });
  await rfi(road.id, -16, -9, {
    subject: 'Kerb stones on the bridge approaches',
    question: 'The typical cross section shows a kerb on the bridge approaches but the BOQ has no quantity for it. Should kerbs be laid, and to which type?',
    proposal: 'Precast M30 kerb 300 x 250 mm on both sides, 150 m per approach.',
    location: 'Bridge approaches, Km 15+100 and Km 21+700',
    toParty: toRoad,
    documentId: (await doc(road.id, 'RD-TCS-01'))?.id ?? null,
    costImpact: true,
    status: 'ANSWERED',
    answer: 'Kerbs are to be provided as per IRC:86. Precast M30 type is acceptable. Submit a variation for the quantity.',
    answeredOn: day(-6),
    answeredByName: 'Executive Engineer, Odisha Works Department (by letter)',
    answerRef: 'EE/OWD/R&B/2026/1182',
    variationId: (await variation(road.id, 2))?.id ?? null,
  });
  await rfi(road.id, -16, -9, {
    subject: 'HT line crossing at Ch 14+100',
    question: 'The 33 kV line crossing at Ch 14+100 has not been shifted and blocks the embankment and the WMM on the LHS. When will OPTCL shift it, and should we leave a gap in the meantime?',
    location: 'Ch 14+100, LHS',
    toParty: toRoad,
    priority: 'URGENT',
    timeImpact: true,
    riskId: (await risk(road.id, 'HT line crossing'))?.id ?? null,
  });
  const toBuilding = building.consultantName ?? building.clientName ?? 'Consultant';
  await rfi(building.id, -1, 1, {
    subject: 'Footing F12 level differs between drawings',
    question: 'STR-201 shows the founding level of footing F12 at -1.50 m; the architectural section shows -1.80 m. Which level do we follow? Excavation at grid C-4 is complete to -1.50 m.',
    proposal: 'Follow the structural drawing (-1.50 m).',
    location: 'Grid C-4, footing F12',
    toParty: toBuilding,
    priority: 'URGENT',
    documentId: (await doc(building.id, 'STR-201'))?.id ?? null,
    timeImpact: true,
  });
  await rfi(building.id, -3, 4, {
    subject: 'Fire rating of the stair core doors',
    question: 'The door schedule lists the stair core doors as flush doors; the fire NOC drawings call for 2-hour fire-rated doors. Please confirm the rating and the hardware.',
    location: 'Stair cores A and B, all floors',
    toParty: toBuilding,
    documentId: (await doc(building.id, 'ARC-101'))?.id ?? null,
    costImpact: true,
    raisedById: qs?.id ?? raiser.id,
  });
}

/**
 * Demo budgets (v4 item 38): the first road and building projects get a budget rate on every BOQ item (78 to 88% of the
 * client's rate) and a cost-head budget split from that total; the road's client pays in 45 days. Other projects are left
 * without a budget. Only when the organisation has no budget yet.
 */
async function seedBudgets(organizationId: string) {
  if (await prisma.projectBudget.count({ where: { organizationId } })) return;
  const pm = await prisma.user.findFirst({ where: { organizationId, email: 'pm@demo.com' } });
  if (!pm) return;
  const split = { material: 0.44, subcontract: 0.2, machinery: 0.16, labour: 0.12, expenses: 0.08 };
  for (const type of ['ROAD', 'BUILDING'] as const) {
    const project = await prisma.project.findFirst({ where: { organizationId, type }, orderBy: { code: 'asc' } });
    if (!project) continue;
    const items = await prisma.boqItem.findMany({ where: { projectId: project.id }, orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }] });
    let total = D(0);
    for (const [i, b] of items.entries()) {
      const budgetRate = b.rate.mul(0.78 + (i % 6) * 0.02).toDecimalPlaces(2);
      await prisma.boqItem.update({ where: { id: b.id }, data: { budgetRate } });
      total = total.add((b.revisedQty ?? b.originalQty).mul(budgetRate));
    }
    const heads = Object.fromEntries(Object.entries(split).map(([k, f]) => [k, total.mul(f).div(1000).toDecimalPlaces(0).mul(1000)])) as Record<keyof typeof split, Prisma.Decimal>;
    await prisma.projectBudget.create({
      data: { organizationId, projectId: project.id, ...heads, notes: 'Budget from the tender rate analysis, revised after award.', updatedById: pm.id },
    });
    if (type === 'ROAD') await prisma.project.update({ where: { id: project.id }, data: { clientPaymentDays: 45 } });
  }
}

/**
 * Demo variation register (v4 item 37). Road: V-1 approved by the client (two more pipe culverts and a new box
 * culvert, approved at a lower rate), V-2 with the client (kerb stones, already in the BOQ as an extra item with no
 * quantity). Building: V-1 still a draft. Only when the organisation has no variations yet.
 */
async function seedVariations(organizationId: string) {
  if (await prisma.variation.count({ where: { organizationId } })) return;
  const road = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' } });
  const building = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' } });
  const qs = await prisma.user.findFirst({ where: { organizationId, email: 'qs@demo.com' } });
  if (!road || !building || !qs) return;
  const r2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const audit = (entityId: string, action: string, ago: number, note?: string) =>
    prisma.auditLog.create({ data: { organizationId, entityType: 'VARIATION', entityId, action, actorId: qs.id, note: note ?? null, createdAt: day(-ago) } });

  const culvert = await prisma.boqItem.findFirst({ where: { projectId: road.id, itemNo: '5.01' } });
  if (culvert) {
    const top = (await prisma.boqItem.aggregate({ where: { projectId: road.id }, _max: { sortOrder: true } }))._max.sortOrder ?? 0;
    const box = await prisma.boqItem.upsert({
      where: { projectId_itemNo: { projectId: road.id, itemNo: '5.02' } },
      update: {},
      create: { organizationId, projectId: road.id, itemNo: '5.02', description: 'RCC box culvert 2 x 2 m at Km 18.4 including wing walls', unit: 'Nos', rate: D(1180000), originalQty: D(0), revisedQty: D(1), sortOrder: top + 1 },
    });
    await prisma.boqItem.update({ where: { id: culvert.id }, data: { revisedQty: (culvert.revisedQty ?? culvert.originalQty).add(2) } });
    const claimed = r2(D(2).mul(culvert.rate)).add(1250000);
    const approved = r2(D(2).mul(culvert.rate)).add(1180000);
    const v1 = await prisma.variation.create({
      data: {
        organizationId, projectId: road.id, varNo: 1, title: 'Additional cross drainage between Km 17 and Km 19', cause: 'SITE_CONDITION',
        description: 'Water logging seen in the first monsoon; the Executive Engineer asked for two more pipe culverts and a box culvert at the nallah.',
        status: 'APPROVED', claimedAmount: claimed, approvedAmount: approved,
        submittedDate: day(-40), submittedRef: 'NIR/RD/2026/031', decidedDate: day(-25), clientRef: 'EE/RD/KHD/2026/233', decisionNote: 'Box culvert allowed at the analysed rate of ₹11.80 lakh.',
        createdById: qs.id, createdAt: day(-45),
        lines: {
          create: [
            { organizationId, boqItemId: culvert.id, itemNo: culvert.itemNo, description: culvert.description, unit: culvert.unit, qty: D(2), rate: culvert.rate, approvedQty: D(2), approvedRate: culvert.rate, sortOrder: 0 },
            { organizationId, boqItemId: box.id, isNewItem: true, itemNo: box.itemNo, description: box.description, unit: box.unit, qty: D(1), rate: D(1250000), approvedQty: D(1), approvedRate: D(1180000), sortOrder: 1 },
          ],
        },
      },
    });
    await audit(v1.id, 'CREATED', 45);
    await audit(v1.id, 'SENT_TO_CLIENT', 40, 'Ref NIR/RD/2026/031');
    await audit(v1.id, 'APPROVED_BY_CLIENT', 25, 'Ref EE/RD/KHD/2026/233');

    const kerb = await prisma.boqItem.upsert({
      where: { projectId_itemNo: { projectId: road.id, itemNo: '6.02' } },
      update: {},
      create: { organizationId, projectId: road.id, itemNo: '6.02', description: 'Precast kerb stones on bridge approaches', unit: 'Rmt', rate: D(450), originalQty: D(0), sortOrder: top + 2 },
    });
    const v2 = await prisma.variation.create({
      data: {
        organizationId, projectId: road.id, varNo: 2, title: 'Kerb stones on bridge approaches', cause: 'DESIGN_CHANGE',
        description: 'Revised GFC drawing RD-GEN-014 R2 adds kerbs on both approaches of the minor bridge.',
        status: 'SUBMITTED', claimedAmount: r2(D(640).mul(450)), submittedDate: day(-6), submittedRef: 'NIR/RD/2026/044', createdById: qs.id, createdAt: day(-8),
        lines: { create: [{ organizationId, boqItemId: kerb.id, isNewItem: true, itemNo: kerb.itemNo, description: kerb.description, unit: kerb.unit, qty: D(640), rate: D(450), sortOrder: 0 }] },
      },
    });
    await audit(v2.id, 'CREATED', 8);
    await audit(v2.id, 'SENT_TO_CLIENT', 6, 'Ref NIR/RD/2026/044');
  }

  const masonry = await prisma.boqItem.findFirst({ where: { projectId: building.id, itemNo: '4.01' } });
  if (masonry) {
    const v = await prisma.variation.create({
      data: {
        organizationId, projectId: building.id, varNo: 1, title: 'Additional toilet block for the OPD wing', cause: 'CLIENT_INSTRUCTION',
        status: 'DRAFT', claimedAmount: r2(D(60).mul(masonry.rate)).add(r2(D(35).mul(8100))), createdById: qs.id, createdAt: day(-2),
        lines: {
          create: [
            { organizationId, boqItemId: masonry.id, itemNo: masonry.itemNo, description: masonry.description, unit: masonry.unit, qty: D(60), rate: masonry.rate, sortOrder: 0 },
            { organizationId, isNewItem: true, itemNo: '7.01', description: 'RCC M25 in toilet block slab, beams and columns', unit: 'Cum', qty: D(35), rate: D(8100), sortOrder: 1 },
          ],
        },
      },
    });
    await audit(v.id, 'CREATED', 2);
  }
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
          vendorGstin: rate > 0 ? DEMO_EXPENSE_GSTIN : null, billNo: vendor ? `B-${3100 + counter}` : null,
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

/** Liquidated damages terms (v4 item 50) on seeded contracts that have none: 0.5% of the contract value per week, capped at 10%. */
async function seedLdTerms(organizationId: string) {
  await prisma.project.updateMany({ where: { organizationId, agreementNo: { not: null }, ldRatePct: 0 }, data: { ldRatePct: D('0.5'), ldPeriod: 'WEEK', ldCapPct: D(10) } });
}

/** Price variation formulas (v4 item 50) by project type: component, share of the work value (%), base index (WPI-like). */
const PV_FORMULAS: Partial<Record<string, [string, string, string][]>> = {
  ROAD: [['Bitumen', '15', '612.4'], ['Fuel (HSD)', '10', '158.3'], ['Cement', '10', '139.8'], ['Steel', '5', '141.2'], ['Labour', '25', '412']],
  WATER_SUPPLY: [['Pipes and steel', '25', '141.2'], ['Cement', '10', '139.8'], ['Fuel (HSD)', '5', '158.3'], ['Labour', '20', '412']],
};

/** The formula on seeded contracts with a price variation clause and no components yet; base date a month before the agreement. */
async function seedPriceVariation(organizationId: string) {
  const projects = await prisma.project.findMany({ where: { organizationId, priceVariation: true, pvComponents: { none: {} } }, select: { id: true, type: true, agreementDate: true } });
  for (const p of projects) {
    const formula = PV_FORMULAS[p.type];
    if (!formula) continue;
    const base = p.agreementDate ? new Date(Date.UTC(p.agreementDate.getUTCFullYear(), p.agreementDate.getUTCMonth() - 1, 1)) : null;
    await prisma.project.update({ where: { id: p.id }, data: { pvBaseDate: base } });
    await prisma.priceVariationComponent.createMany({
      data: formula.map(([name, share, index], i) => ({ organizationId, projectId: p.id, name, sharePct: D(share), baseIndex: D(index), sortOrder: i })),
    });
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

/** The GSTIN typed on the demo expenses that have GST, with its proper check character. */
const DEMO_EXPENSE_GSTIN = `21AAKFS1234M1Z${gstinCheckChar('21AAKFS1234M1Z')}`;

/** Bill checks' demo anomalies (AI item 69): [project type, description, vendor, GSTIN, bill no, amount, GST %, payment mode]. */
type DemoAnomaly = ['ROAD' | 'BUILDING' | 'WATER_SUPPLY', string, string, string | null, string, string, number, 'CASH' | 'UPI'];
const ANOMALY_EXPENSES: DemoAnomaly[] = [
  // Filed twice: the same bill as the approved hydraulic hose expense (bill no filled in from it).
  ['ROAD', 'Hydraulic hose for grader GRD-01', 'Sahoo Auto Parts', DEMO_EXPENSE_GSTIN, '', '2400', 18, 'CASH'],
  // Above the ₹10,000 cash limit of Income Tax section 40A(3).
  ['WATER_SUPPLY', 'JCB hire for trench backfilling, 1 day', 'Mahalaxmi Earthmovers', null, 'ME-0921', '14500', 0, 'CASH'],
  // A GSTIN with a mistyped character.
  ['BUILDING', 'Waterproofing compound, 2 buckets', 'Odisha Chem Agencies', `21AADFO7712Q1Z${gstinCheckChar('21AADFO7712Q1Z') === 'A' ? 'B' : 'A'}`, 'OCA/1187', '3200', 18, 'UPI'],
];

/**
 * Bills with something wrong in them, for the checks before approval (AI item 69) to catch, all waiting for approval:
 * an expense filed twice, one paid in cash above the limit, one with a mistyped GSTIN, and a second copy of the road
 * supplier's invoice billing what was already billed (on top of the building bill's steel above the PO rate). Each is
 * added once, found by its description or invoice, so this also runs on an existing demo company; the demo expenses'
 * GSTIN gets its proper check character so the clean ones pass.
 */
async function seedCheckAnomalies(organizationId: string) {
  // Vendors' GSTINs with a valid check character, so an invoice read off paper matches its vendor (AI item 70).
  for (const v of await prisma.vendor.findMany({ where: { organizationId, gstin: { not: null } }, select: { id: true, gstin: true } })) {
    const check = v.gstin!.length === 15 ? gstinCheckChar(v.gstin!.slice(0, 14)) : null;
    if (check && v.gstin![14] !== check) await prisma.vendor.update({ where: { id: v.id }, data: { gstin: `${v.gstin!.slice(0, 14)}${check}` } });
  }
  await prisma.expense.updateMany({ where: { organizationId, vendorGstin: { startsWith: '21AAKFS1234M1Z', not: DEMO_EXPENSE_GSTIN } }, data: { vendorGstin: DEMO_EXPENSE_GSTIN } });
  const year = new Date().getUTCFullYear();

  for (const [type, description, vendor, gstin, billNo, amount, rate, paymentMode] of ANOMALY_EXPENSES) {
    if (await prisma.expense.count({ where: { organizationId, description } })) continue;
    const project = await prisma.project.findFirst({ where: { organizationId, type }, include: { members: { include: { user: { include: { role: true } } } } }, orderBy: { code: 'asc' } });
    const filer = project?.members.find((m) => m.user.role.key === 'SITE_ENGINEER')?.userId ?? project?.projectManagerId;
    if (!project || !filer) continue;
    const original = billNo ? null : await prisma.expense.findFirst({ where: { projectId: project.id, vendor, status: 'APPROVED', billNo: { not: null } }, orderBy: { date: 'asc' } });
    if (!billNo && !original) continue;
    const last = await prisma.expense.findFirst({ where: { organizationId, expenseNo: { startsWith: `EXP-${year}-` } }, orderBy: { expenseNo: 'desc' }, select: { expenseNo: true } });
    const expenseNo = `EXP-${year}-${String((last ? parseInt(last.expenseNo.slice(9), 10) : 0) + 1).padStart(4, '0')}`;
    const gst = D(amount).mul(rate).div(100).toDecimalPlaces(2);
    const x = await prisma.expense.create({
      data: {
        organizationId, projectId: project.id, expenseNo, date: day(-1), category: (type === 'WATER_SUPPLY' ? 'TRANSPORT' : type === 'ROAD' ? 'REPAIRS' : 'MATERIAL_LOCAL') as never, description, vendor,
        vendorGstin: gstin, billNo: billNo || original!.billNo, amount: D(amount), gstRate: D(rate), gstAmount: gst, totalAmount: D(amount).plus(gst), paymentMode,
        status: 'SUBMITTED', submittedById: filer, submittedAt: day(-1), createdAt: day(-1),
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'EXPENSE', entityId: x.id, action: 'CREATED', actorId: filer, createdAt: day(-1) },
        { organizationId, entityType: 'EXPENSE', entityId: x.id, action: 'SUBMITTED', actorId: filer, createdAt: day(-1) },
      ],
    });
  }

  // The road supplier's invoice again, typed with dashes, for what its approved bill already took.
  const first = await prisma.vendorBill.findFirst({ where: { organizationId, invoiceNo: 'KBA/26-27/0213' }, include: { lines: { include: { purchaseOrderLine: true } } } });
  const accounts = (await prisma.user.findFirst({ where: { organizationId, role: { key: 'ACCOUNTS_MANAGER' } }, select: { id: true } }))?.id;
  if (first && accounts && !(await prisma.vendorBill.count({ where: { organizationId, invoiceNo: 'KBA-26-27-0213' } }))) {
    const count = await prisma.vendorBill.count({ where: { organizationId, billNo: { startsWith: `VB-${year}-` } } });
    const bill = await prisma.vendorBill.create({
      data: {
        organizationId, projectId: first.projectId, vendorId: first.vendorId, purchaseOrderId: first.purchaseOrderId, billNo: `VB-${year}-${String(count + 1).padStart(4, '0')}`, invoiceNo: 'KBA-26-27-0213',
        invoiceDate: first.invoiceDate, dueDate: first.dueDate, freight: D(0), subtotal: first.subtotal, gstAmount: first.gstAmount, total: first.subtotal.add(first.gstAmount),
        matched: false,
        exceptions: first.lines.map((l) => `${l.purchaseOrderLine.itemName}: ${l.quantity.toFixed(3).replace(/\.?0+$/, '')} ${l.purchaseOrderLine.unit} billed, ${l.quantity.toFixed(3).replace(/\.?0+$/, '')} received of which ${l.quantity.toFixed(3).replace(/\.?0+$/, '')} is on other bills`),
        remarks: 'Invoice copy received by post', status: 'SUBMITTED', submittedById: accounts, submittedAt: day(-1), createdAt: day(-1),
        lines: { create: first.lines.map((l) => ({ purchaseOrderLineId: l.purchaseOrderLineId, quantity: l.quantity, rate: l.rate, gstRate: l.gstRate, amount: l.amount, gstAmount: l.gstAmount, sortOrder: l.sortOrder })) },
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

/** A one-page placeholder drawing (A4 landscape PDF with a border and title block), so documents open on every host. */
function drawingPdf(docNo: string, title: string, revision: string, project: string): Uint8Array<ArrayBuffer> {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '-');
  const text = (x: number, y: number, size: number, t: string) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(t)}) Tj ET`;
  const body = [
    '1 w 20 20 802 555 re S 0.5 w 522 20 300 110 re S 522 95 m 822 95 l S 522 60 m 822 60 l S 722 20 m 722 60 l S',
    '0.6 G 60 200 m 460 200 l 460 480 l 60 480 l h S 60 340 m 460 340 l S 260 200 m 260 480 l S 0 G',
    text(60, 520, 22, title),
    text(60, 160, 11, 'Placeholder drawing created by the Nirmaan demo data.'),
    text(530, 110, 9, project),
    text(530, 75, 12, title.length > 44 ? `${title.slice(0, 43)}...` : title),
    text(530, 35, 14, docNo),
    text(730, 35, 14, `Rev ${revision}`),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

/** The sample contracts (AI item 75): a CONTRACT document with its text PDF on each demo project that has none. */
async function seedContractDocuments(organizationId: string) {
  for (const c of DEMO_CONTRACTS) {
    const project = await prisma.project.findFirst({ where: { organizationId, type: c.projectType }, orderBy: { code: 'asc' } });
    if (!project?.projectManagerId || (await prisma.document.count({ where: { projectId: project.id, docNo: c.docNo } }))) continue;
    const by = project.projectManagerId;
    const ago = 120;
    const doc = await prisma.document.create({
      data: { organizationId, projectId: project.id, docNo: c.docNo, title: c.title, kind: 'CONTRACT', discipline: 'GENERAL', remarks: 'Sample contract for Ask Nirmaan', createdById: by, createdAt: day(-ago) },
    });
    const rev = await prisma.documentRevision.create({
      data: { documentId: doc.id, revision: 'R0', issuedOn: day(-ago), status: 'APPROVED_WITH_COMMENTS', receivedFrom: c.from, remarks: 'Signed agreement', issuedById: by, createdAt: day(-ago) },
    });
    const pdf = textPdf(c.title, c.pages);
    await prisma.attachment.create({
      data: { organizationId, fileName: `${c.docNo}.pdf`, mimeType: 'application/pdf', size: pdf.length, storagePath: `db:seed/${c.docNo}.pdf`, data: new Uint8Array(pdf), uploadedById: by, revisionId: rev.id, createdAt: day(-ago) },
    });
    await prisma.document.update({ where: { id: doc.id }, data: { currentRevisionId: rev.id } });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'DOCUMENT', entityId: doc.id, action: 'CREATED', actorId: by, note: 'Rev R0', createdAt: day(-ago) } });
  }
}

type DemoRevision = [string, number, 'FOR_CONSTRUCTION' | 'FOR_APPROVAL' | 'APPROVED_WITH_COMMENTS', string | null];
type DemoDocument = { docNo: string; title: string; kind: 'DRAWING' | 'METHOD_STATEMENT' | 'SPECIFICATION'; discipline: 'ARCHITECTURAL' | 'STRUCTURAL' | 'PLUMBING' | 'ROAD' | 'WATER' | 'GENERAL'; from: string; revisions: DemoRevision[] };
// Revisions are [revision, days ago, status, remarks], oldest first.
const DEMO_DOCUMENTS: Record<string, DemoDocument[]> = {
  BUILDING: [
    { docNo: 'ARC-101', title: 'Ground floor plan', kind: 'DRAWING', discipline: 'ARCHITECTURAL', from: 'Shilpa Architects', revisions: [['R0', 40, 'FOR_APPROVAL', null], ['R1', 25, 'FOR_CONSTRUCTION', 'OPD waiting area enlarged; toilet block moved to grid 5']] },
    { docNo: 'STR-201', title: 'Foundation layout and footing details', kind: 'DRAWING', discipline: 'STRUCTURAL', from: 'Shilpa Architects (structural)', revisions: [['R0', 45, 'FOR_CONSTRUCTION', null]] },
    { docNo: 'STR-205', title: 'First floor slab reinforcement', kind: 'DRAWING', discipline: 'STRUCTURAL', from: 'Shilpa Architects (structural)', revisions: [['R0', 20, 'FOR_CONSTRUCTION', null], ['R1', 2, 'FOR_CONSTRUCTION', 'Extra bars around the lift cut-out between grids C and D']] },
    { docNo: 'PLB-301', title: 'Plumbing riser diagram', kind: 'DRAWING', discipline: 'PLUMBING', from: 'Plumbing subcontractor', revisions: [['R0', 6, 'FOR_APPROVAL', 'Sent to the architect for approval']] },
    { docNo: 'MS-01', title: 'Method statement for concreting of slabs', kind: 'METHOD_STATEMENT', discipline: 'GENERAL', from: 'Site QA/QC', revisions: [['R0', 30, 'APPROVED_WITH_COMMENTS', 'Curing by ponding for 14 days, not 7']] },
  ],
  ROAD: [
    { docNo: 'RD-PP-03', title: 'Plan and profile Km 12 to Km 16', kind: 'DRAWING', discipline: 'ROAD', from: 'LEA Associates', revisions: [['R0', 60, 'FOR_CONSTRUCTION', null], ['R1', 12, 'FOR_CONSTRUCTION', 'Grade line revised at Km 12+300 to 12+650 (encroachment stretch)']] },
    { docNo: 'RD-TCS-01', title: 'Typical cross sections', kind: 'DRAWING', discipline: 'ROAD', from: 'LEA Associates', revisions: [['R0', 60, 'FOR_CONSTRUCTION', null]] },
    { docNo: 'RD-CD-07', title: 'Pipe culvert at Km 13+420', kind: 'DRAWING', discipline: 'STRUCTURAL', from: 'Design office', revisions: [['R0', 8, 'FOR_APPROVAL', 'Submitted to the Authority Engineer']] },
    { docNo: 'SP-ROAD', title: 'Technical specifications (MoRTH 5th revision, contract volume III)', kind: 'SPECIFICATION', discipline: 'GENERAL', from: 'Odisha Works Department', revisions: [['R0', 90, 'APPROVED_WITH_COMMENTS', 'As in the agreement']] },
  ],
};

async function seedDocuments(organizationId: string) {
  if ((await prisma.document.count({ where: { organizationId } })) > 0) return;
  const pmFor = async (projectId: string) => (await prisma.project.findUnique({ where: { id: projectId }, select: { projectManagerId: true } }))?.projectManagerId;
  const year = new Date().getUTCFullYear();
  let trn = 0;
  for (const [type, docs] of Object.entries(DEMO_DOCUMENTS)) {
    const project = await prisma.project.findFirst({ where: { organizationId, type: type as never }, orderBy: { code: 'asc' } });
    const by = project ? await pmFor(project.id) : null;
    if (!project || !by) continue;
    const revisions = new Map<string, string>();
    for (const d of docs) {
      const first = d.revisions[0][1];
      const doc = await prisma.document.create({
        data: { organizationId, projectId: project.id, docNo: d.docNo, title: d.title, kind: d.kind, discipline: d.discipline, createdById: by, createdAt: day(-first) },
      });
      let last = '';
      for (const [revision, ago, status, remarks] of d.revisions) {
        const rev = await prisma.documentRevision.create({
          data: { documentId: doc.id, revision, issuedOn: day(-ago), status, receivedFrom: d.from, remarks, issuedById: by, createdAt: day(-ago) },
        });
        const pdf = drawingPdf(d.docNo, d.title, revision, `${project.code} ${project.name}`);
        await prisma.attachment.create({
          data: { organizationId, fileName: `${d.docNo}-${revision}.pdf`, mimeType: 'application/pdf', size: pdf.length, storagePath: `db:seed/${d.docNo}-${revision}.pdf`, data: pdf, uploadedById: by, revisionId: rev.id, createdAt: day(-ago) },
        });
        revisions.set(`${d.docNo} ${revision}`, rev.id);
        last = rev.id;
        await prisma.auditLog.create({ data: { organizationId, entityType: 'DOCUMENT', entityId: doc.id, action: revision === d.revisions[0][0] ? 'CREATED' : 'REVISION_ADDED', actorId: by, note: `Rev ${revision}`, createdAt: day(-ago) } });
      }
      await prisma.document.update({ where: { id: doc.id }, data: { currentRevisionId: last } });
    }

    // Transmittals: drawings to the subcontractor (signed for) and one waiting on the consultant.
    const sends: { to: string; purpose: 'FOR_CONSTRUCTION' | 'FOR_APPROVAL'; ago: number; ack: number | null; items: string[] }[] =
      type === 'ROAD'
        ? [
            { to: 'Sri Jagannath Constructions (earthwork subcontractor)', purpose: 'FOR_CONSTRUCTION', ago: 11, ack: 10, items: ['RD-PP-03 R1', 'RD-TCS-01 R0'] },
            { to: 'LEA Associates (Authority Engineer)', purpose: 'FOR_APPROVAL', ago: 8, ack: null, items: ['RD-CD-07 R0'] },
          ]
        : [{ to: 'Shilpa Architects', purpose: 'FOR_APPROVAL', ago: 6, ack: null, items: ['PLB-301 R0'] }];
    for (const t of sends) {
      trn += 1;
      const row = await prisma.transmittal.create({
        data: {
          organizationId, projectId: project.id, transmittalNo: `TRN-${year}-${String(trn).padStart(4, '0')}`, toParty: t.to, purpose: t.purpose, sentOn: day(-t.ago),
          acknowledgedOn: t.ack === null ? null : day(-t.ack), acknowledgedBy: t.ack === null ? null : 'Site in-charge', sentById: by, createdAt: day(-t.ago),
          items: { create: t.items.map((k, i) => ({ revisionId: revisions.get(k)!, copies: t.purpose === 'FOR_CONSTRUCTION' ? 2 : 1, sortOrder: i })) },
        },
      });
      await prisma.auditLog.create({ data: { organizationId, entityType: 'TRANSMITTAL', entityId: row.id, action: 'CREATED', actorId: by, createdAt: day(-t.ago) } });
    }
  }

  // Letters on the road project: the hindrance notice for the encroachment delay, the reply and the extension claim.
  const road = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' } });
  const pm = road ? await pmFor(road.id) : null;
  if (!road || !pm) return;
  const delay = await prisma.risk.findFirst({ where: { projectId: road.id, kind: 'DELAY', title: { startsWith: 'Encroachment' } } });
  const counters = { IN: 0, OUT: 0 };
  const letter = async (l: { direction: 'IN' | 'OUT'; ago: number; party: string; subject: string; summary: string; theirRef?: string; replyBy?: number; inReplyToId?: string; risk?: boolean }) => {
    counters[l.direction] += 1;
    const row = await prisma.letter.create({
      data: {
        organizationId, projectId: road.id, direction: l.direction, letterNo: `${l.direction}-${year}-${String(counters[l.direction]).padStart(4, '0')}`, theirRef: l.theirRef ?? null,
        letterDate: day(-l.ago), party: l.party, subject: l.subject, summary: l.summary, replyBy: l.replyBy === undefined ? null : day(l.replyBy),
        inReplyToId: l.inReplyToId ?? null, riskId: l.risk && delay ? delay.id : null, createdById: pm, createdAt: day(-l.ago),
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'LETTER', entityId: row.id, action: 'CREATED', actorId: pm, createdAt: day(-l.ago) } });
    return row;
  };
  const ee = 'Executive Engineer, R&B Division, Khordha';
  const notice = await letter({ direction: 'OUT', ago: 17, party: ee, subject: 'Hindrance: encroachment inside the ROW at Ch 12+300 to 12+650', summary: 'Shops and a cattle shed inside the ROW stop 350 m of embankment. Requested removal; time lost will be claimed as an extension.', risk: true });
  await letter({ direction: 'IN', ago: 10, party: ee, theirRef: 'EE/RB/KHD/2026/1184', subject: 'Re: encroachment at Ch 12+300 to 12+650', summary: 'Eviction notice served by the Tahsildar; site to be handed over after the removal drive.', inReplyToId: notice.id, risk: true });
  await letter({ direction: 'OUT', ago: 4, party: ee, subject: 'Request for extension of time: encroachment at Ch 12+300', summary: 'Claiming the days lost from the hindrance notice until the stretch is handed over.', risk: true });
  await letter({ direction: 'IN', ago: 3, party: 'LEA Associates (Authority Engineer)', theirRef: 'LEA/BBSR-PURI/AE/322', subject: 'Comments on the GSB trial stretch', summary: 'Gradation of the trial stretch on the coarse side; submit the revised job mix with fresh test results.', replyBy: 4 });
  await letter({ direction: 'IN', ago: 9, party: 'LEA Associates (Authority Engineer)', theirRef: 'LEA/BBSR-PURI/AE/309', subject: 'Monthly progress report format', summary: 'Use the Authority format for the monthly report from this month; confirm by return.', replyBy: -2 });
}

/** Company staff: [code, name, designation, department, login email or null, posting project code or null (head office)]. */
const DEMO_STAFF: [string, string, string, string, string | null, string | null][] = [
  ['EMP-001', 'Rajesh Patnaik', 'Managing Director', 'Management', 'md@demo.com', null],
  ['EMP-002', 'Arun Sharma', 'IT and systems head', 'Administration', 'admin@demo.com', null],
  ['EMP-003', 'Suresh Nair', 'Project manager', 'Execution', 'pm@demo.com', 'RD-2026-01'],
  ['EMP-004', 'Kavita Rao', 'Project manager', 'Execution', 'pm2@demo.com', 'BL-2026-02'],
  ['EMP-005', 'Manoj Das', 'Site supervisor', 'Execution', 'tl@demo.com', 'RD-2026-01'],
  ['EMP-006', 'Priya Mohanty', 'Site engineer', 'Execution', 'engineer@demo.com', 'RD-2026-01'],
  ['EMP-007', 'Vikram Singh', 'Site engineer', 'Execution', 'engineer2@demo.com', 'BL-2026-02'],
  ['EMP-008', 'Ramesh Behera', 'Store keeper', 'Stores', 'store@demo.com', 'RD-2026-01'],
  ['EMP-009', 'Anita Verma', 'Quantity surveyor', 'Contracts', 'qs@demo.com', null],
  ['EMP-010', 'Deepak Kumar', 'Procurement manager', 'Purchase', 'procurement@demo.com', null],
  ['EMP-011', 'Sneha Iyer', 'QA/QC engineer', 'Quality', 'qaqc@demo.com', null],
  ['EMP-012', 'Mahesh Gupta', 'Accounts manager', 'Accounts', 'accounts@demo.com', null],
  ['EMP-013', 'Pooja Reddy', 'HR manager', 'Human resources', 'hr@demo.com', null],
  ['EMP-014', 'Bikash Swain', 'Surveyor', 'Execution', null, 'RD-2026-01'],
  ['EMP-015', 'Sanjay Pradhan', 'Site supervisor', 'Execution', null, 'RD-2026-01'],
  ['EMP-016', 'Laxmidhar Nayak', 'Driver', 'Plant and machinery', null, 'RD-2026-01'],
  ['EMP-017', 'Gopal Mishra', 'Site supervisor', 'Execution', null, 'BL-2026-02'],
  ['EMP-018', 'Rina Sahu', 'Safety officer', 'Safety', null, 'BL-2026-02'],
  ['EMP-019', 'Prakash Jena', 'Site engineer', 'Execution', null, 'WS-2026-03'],
  ['EMP-020', 'Ajit Rout', 'Pump operator', 'Plant and machinery', null, 'WS-2026-03'],
  ['EMP-021', 'Debasish Mallick', 'Store keeper', 'Stores', null, 'WS-2026-03'],
];

/**
 * Staff and leave for an organisation that has none yet: employees (most demo logins plus site staff without one),
 * national and site holidays for the year, the last 30 days of attendance at the sites (today is left unmarked so
 * check-in and the register can be demoed) and leave in every state. Priya worked a Sunday, so she has a comp-off.
 */
async function seedStaff(organizationId: string) {
  if ((await prisma.employee.count({ where: { organizationId } })) > 0) return;
  const year = new Date().getUTCFullYear();
  const projects = new Map((await prisma.project.findMany({ where: { organizationId }, select: { id: true, code: true, projectManagerId: true } })).map((p) => [p.code, p]));
  const users = new Map((await prisma.user.findMany({ where: { organizationId }, select: { id: true, email: true } })).map((u) => [u.email, u.id]));
  const hr = users.get('hr@demo.com')!;
  const projectById = new Map([...projects.values()].map((p) => [p.id, p]));

  const holidays: [string, string, string | null][] = [
    [`${year}-01-26`, 'Republic Day', null],
    [`${year}-03-04`, 'Holi', null],
    [`${year}-06-15`, 'Raja Sankranti', 'RD-2026-01'],
    [`${year}-08-15`, 'Independence Day', null],
    [`${year}-10-02`, 'Gandhi Jayanti', null],
    [`${year}-10-20`, 'Dussehra', null],
    [`${year}-11-08`, 'Diwali', null],
    [`${year}-11-24`, 'Bali Jatra', 'BL-2026-02'],
    [`${year}-12-25`, 'Christmas', null],
  ];
  for (const [date, name, code] of holidays) {
    const projectId = code ? projects.get(code)?.id ?? null : null;
    if (code && !projectId) continue;
    await prisma.holiday.create({ data: { organizationId, date: new Date(`${date}T00:00:00Z`), name, projectId } });
  }
  const offFor = (projectId: string | null) => new Set(holidays.filter(([, , c]) => !c || projects.get(c)?.id === projectId).map(([d]) => d));

  const employees = new Map<string, { id: string; projectId: string | null; userId: string | null }>();
  for (const [code, fullName, designation, department, email, posting] of DEMO_STAFF) {
    const userId = email ? users.get(email) ?? null : null;
    const projectId = posting ? projects.get(posting)?.id ?? null : null;
    const e = await prisma.employee.create({
      data: { organizationId, employeeCode: code, fullName, designation, department, phone: null, userId, projectId, joinedOn: day(-400 - Number(code.slice(4)) * 15) },
    });
    employees.set(code, { id: e.id, projectId, userId });
  }

  // Leave: [employee, type, from (days from today), to, half day, status, reason, decision note]
  const leave: [string, 'CASUAL' | 'SICK' | 'EARNED' | 'COMP_OFF', number, number, boolean, 'PENDING' | 'APPROVED' | 'REJECTED', string, string | null][] = [
    ['EMP-006', 'CASUAL', -12, -11, false, 'APPROVED', 'Sister’s wedding at Berhampur', null],
    ['EMP-005', 'SICK', -6, -6, false, 'APPROVED', 'Fever', 'Get well soon'],
    ['EMP-015', 'CASUAL', -3, -3, true, 'APPROVED', 'Bank work in the morning', null],
    ['EMP-007', 'CASUAL', -8, -7, false, 'REJECTED', 'Personal work', 'Slab casting on those days; please take it next week'],
    ['EMP-006', 'EARNED', 8, 10, false, 'PENDING', 'Family trip to Puri', null],
    ['EMP-014', 'CASUAL', 3, 3, false, 'PENDING', 'Land registration at the tahsil office', null],
    ['EMP-017', 'EARNED', 15, 19, false, 'APPROVED', 'Going home to Balasore', null],
  ];
  const onLeave = new Map<string, Set<string>>();
  for (const [code, type, start, end, halfDay, status, reason, note] of leave) {
    const e = employees.get(code)!;
    // Start on a working day whatever today is, keeping the length.
    let from = start;
    while (isWeeklyOff(day(from).toISOString().slice(0, 10)) || offFor(e.projectId).has(day(from).toISOString().slice(0, 10))) from += 1;
    const to = from + (end - start);
    const fromDate = day(from).toISOString().slice(0, 10);
    const toDate = day(to).toISOString().slice(0, 10);
    const days = leaveDays(fromDate, toDate, halfDay, offFor(e.projectId));
    if (!days || fromDate.slice(0, 4) !== toDate.slice(0, 4)) continue;
    const decider = e.projectId ? projectById.get(e.projectId)?.projectManagerId : hr;
    const appliedById = e.userId ?? hr;
    const decided = status !== 'PENDING' && decider && decider !== e.userId ? decider : status !== 'PENDING' ? hr : null;
    const created = day(Math.min(from, 0) - 2);
    const l = await prisma.leaveRequest.create({
      data: {
        organizationId, employeeId: e.id, type, fromDate: day(from), toDate: day(to), halfDay, days: D(days), reason, status, appliedById,
        decidedById: decided, decidedAt: decided ? day(Math.min(from, 0) - 1) : null, decisionNote: note, createdAt: created,
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'LEAVE', entityId: l.id, action: 'CREATED', actorId: appliedById, note: `${days} day(s)`, createdAt: created } });
    if (decided) await prisma.auditLog.create({ data: { organizationId, entityType: 'LEAVE', entityId: l.id, action: status, actorId: decided, note, createdAt: day(Math.min(from, 0) - 1) } });
    if (status === 'APPROVED' && !halfDay) {
      const set = onLeave.get(code) ?? new Set<string>();
      for (let i = from; i <= to; i++) set.add(day(i).toISOString().slice(0, 10));
      onLeave.set(code, set);
    }
  }

  // The last 30 days at the sites (head office staff do not mark attendance in the demo).
  for (const [code, e] of employees) {
    if (!e.projectId) continue;
    const markedBy = projectById.get(e.projectId)?.projectManagerId ?? hr;
    const off = offFor(e.projectId);
    const n = Number(code.slice(4));
    const rows: Prisma.StaffAttendanceCreateManyInput[] = [];
    for (let i = 30; i >= 1; i--) {
      const date = day(-i);
      const d = date.toISOString().slice(0, 10);
      const sundayShift = code === 'EMP-006' && i === 9 && isWeeklyOff(d);
      if ((isWeeklyOff(d) || off.has(d)) && !sundayShift) continue;
      if (onLeave.get(code)?.has(d)) continue;
      const roll = (n * 7 + i * 13) % 23;
      const status = roll === 0 ? 'ABSENT' : roll === 5 || (code === 'EMP-015' && i === 3) ? 'HALF_DAY' : 'PRESENT';
      const overtime = status === 'PRESENT' && roll % 6 === 1 ? D(roll % 4 === 1 ? '2' : '1.5') : null;
      rows.push({ organizationId, employeeId: e.id, date, projectId: e.projectId, status, overtimeHours: overtime, note: sundayShift ? 'Sunday pour, comp-off' : null, markedById: markedBy, createdAt: date });
    }
    // Make sure Priya has a Sunday worked for the comp-off demo even when day -9 was not a Sunday.
    if (code === 'EMP-006' && !rows.some((r) => r.note)) {
      for (let i = 30; i >= 1; i--) {
        const d = day(-i).toISOString().slice(0, 10);
        if (isWeeklyOff(d)) {
          rows.push({ organizationId, employeeId: e.id, date: day(-i), projectId: e.projectId, status: 'PRESENT', note: 'Sunday pour, comp-off', markedById: markedBy, createdAt: day(-i) });
          break;
        }
      }
    }
    await prisma.staffAttendance.createMany({ data: rows });
  }
}
