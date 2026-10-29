/* Demo seed: one organisation, a user for every role, three projects (one per type) with BOQ,
 * activities, approved and pending progress, DPRs and material requests. Safe to re-run. */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { deflateSync } from 'zlib';
import { dprTitle, progressTitle, titleDate } from '../src/common/submission-titles';
import { DEMO_CONTRACTS, textPdf } from '../src/documents/demo-contracts';
import { addMonths, schedule as loanSchedule } from '../src/machine-loans/loan-rules';
import { seedTownDprs, seedWorkBreakdown } from './seed-structure';
import { seedTownNetwork } from './seed-pipes';
import { seedTownStock } from './seed-stock';
import { seedTownBilling } from './seed-billing';
import { seedEpc } from './seed-epc';
import { seedOm } from './seed-om';
import { seedCorrespondence } from './seed-correspondence';
import { seedQa } from './seed-qa';
import { seedQaRegisters } from './seed-qa-registers';
import { seedQaAudits } from './seed-qa-audits';
import { seedDrawingSchedule } from './seed-drawing-schedule';
import { seedDesignSubmissions } from './seed-design-submissions';
import { seedControlledCopies } from './seed-controlled-copies';
import { seedDemoGroup, seedGroupCompanies } from './seed-group';
import { seedProjectTypes } from './seed-project-types';
import { DEFAULT_SETTINGS, computePayslip, structureCost, type RulesStructure } from '../src/payroll/payroll-rules';
import { COMPANY_KIND_INFO, DEFAULT_CLOSEOUT_ITEMS, PAYSLIP_CODES, PERMIT_PRECAUTIONS, STANDARD_CHECKLISTS, gstinCheckChar, isWeeklyOff, leaveDays, ppeReplaceBy, scaleFrom, takeoffValue, type MarkupPoint, type PpeKind, type TakeoffKind } from '@erp/shared';

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
  ['DOCUMENT_CONTROLLER', 'Document Controller'],
  ['ACCOUNTS_MANAGER', 'Accounts Manager'],
  ['HR_MANAGER', 'HR Manager'],
  ['CLIENT_ENGINEER', "Client's Engineer (guest)"],
  ['CONSULTANT', 'Consultant / PMC (guest)'],
  ['SUPPLIER', 'Supplier (portal)'],
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
  { email: 'docs@demo.com', name: 'Ritu Agarwal', role: 'DOCUMENT_CONTROLLER', phone: '9800000019' },
  // Guests from outside the company: they use the client portal only, on the projects below (seedGuests).
  { email: 'client@demo.com', name: 'Er. Bijay Kumar Panda', role: 'CLIENT_ENGINEER', phone: '9800000014' },
  { email: 'pmc@demo.com', name: 'Lakshmi Menon', role: 'CONSULTANT', phone: '9800000015' },
  // A supplier's own login (v6 item 105): Kalinga Bitumen & Aggregates on the supplier portal (seedSupplierPortal).
  { email: 'supplier@demo.com', name: 'R. K. Mohanty', role: 'SUPPLIER', phone: '9800000017' },
];

/** The client's engineer (Executive Engineer's office, road) and the consultant (PMC, building) on their projects. */
const GUEST_PROJECTS: [string, string][] = [
  ['client@demo.com', 'RD-2026-01'],
  ['pmc@demo.com', 'BL-2026-02'],
];


/** DPR remarks that read as hindrances (AI item 123), by project type and days ago. */
const HINDRANCE_REMARKS: Record<string, Record<number, string>> = {
  ROAD: { 1: 'Villagers again stopped embankment work at Ch 12+650, encroachment not cleared', 2: 'HT line at Ch 14+100 still not shifted, embankment beyond Ch 14+000 held up since 2 days' },
  BUILDING: { 2: 'First-floor column drawings revised by the architect, waiting for the GFC' },
};
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
    // One sign-in per person (group companies); a password changed on the demo is left alone.
    const login = await prisma.login.upsert({ where: { email: u.email }, update: {}, create: { email: u.email, passwordHash } });
    const row = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: u.email } },
      update: { fullName: u.name, roleId: roles.get(u.role)!, phone: u.phone, isActive: true, loginId: login.id },
      create: { organizationId: org.id, email: u.email, fullName: u.name, roleId: roles.get(u.role)!, phone: u.phone, loginId: login.id },
    });
    users.set(u.email, row.id);
  }
  await seedDemoGroup(prisma, org.id, passwordHash);

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
    await seedSplitQuotes(org.id);
    await seedSubcontracts(org.id);
    await seedPayables(org.id);
    await seedPaymentRequests(org.id);
    await seedHireBills(org.id);
    await seedQuality(org.id);
    await seedTestsAndNcrs(org.id);
    await seedDocuments(org.id);
    await seedCorrespondence(prisma, org.id);
    await seedQa(prisma, org.id);
    await seedQaRegisters(prisma, org.id);
    await seedQaAudits(prisma, org.id);
    await seedDrawingSchedule(prisma, org.id);
    await seedDesignSubmissions(prisma, org.id);
    await seedControlledCopies(prisma, org.id);
    await seedContractDocuments(org.id);
    await seedStaff(org.id);
    await seedAttendanceExtras(org.id);
    await seedHrRecords(org.id);
    await seedPayroll(org.id);
    await seedGuests(org.id);
    await seedVariations(org.id);
    await seedRfis(org.id);
    await seedDrawingMarkups(org.id);
    await seedDrawingTakeoffs(org.id);
    await seedBudgets(org.id);
    await seedStoreMoves(org.id);
    await seedReconciliation(org.id);
    await seedRateAnalysis(org.id);
    await seedFleet(org.id);
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
    await seedBiometric(org.id);
    await seedBooks(org.id);
    await seedOpening(org.id);
    await seedRmc(org.id);
    await seedSupplierPortal(org.id);
    await seedCentralStore(org.id);
    await seedFundRequests(org.id);
    await seedMachineLoans(org.id);
    await seedTenders(org.id);
    await seedPastOpenings(org.id);
    await seedScEnquiries(org.id);
    await seedMeetings(org.id);
    await seedMaterialApprovals(org.id);
    await seedLeakage(org.id);
    await seedAttendanceCheck(org.id);
    await seedActivityLinks(org.id);
    await seedWorkBreakdown(prisma, org.id);
    await seedTownDprs(prisma, org.id);
    await seedTownNetwork(prisma, org.id);
    await seedTownStock(prisma, org.id);
    await seedTownBilling(prisma, org.id);
    await seedEpc(prisma, org.id);
    await seedOm(prisma, org.id);
    await seedProjectTypes(prisma, org.id);
    await seedComments(org.id);
    await seedGroupCompanies(prisma, org.id, passwordHash);
    console.log('Projects already seeded; users/roles refreshed. Run `pnpm db:reset` for a clean slate.');
    return;
  }

  const projects = [
    {
      code: 'RD-2026-01', name: 'Bhubaneswar - Puri Highway Widening (Km 12 to Km 28)', type: 'ROAD' as const, client: 'Odisha Works Department', consultant: 'LEA Associates', location: 'Khordha, Odisha',
      site: 'Project site store, Km 16+400, Bhubaneswar - Puri road, Khordha 752055. Store in charge on site, 7 am to 7 pm.',
      wo: 'WO/OWD/2025/0417', start: -120, end: 240, value: '186500000.00', pm: 'pm@demo.com', members: ['tl@demo.com', 'engineer@demo.com', 'store@demo.com', 'qs@demo.com', 'qaqc@demo.com'], boq: ROAD_BOQ, engineer: 'engineer@demo.com',
    },
    {
      code: 'BL-2026-02', name: 'District Hospital Block B (G+3)', type: 'BUILDING' as const, client: 'Dept. of Health & Family Welfare', consultant: 'Shilpa Architects', location: 'Cuttack, Odisha',
      site: 'Site store, District Hospital campus, Ring Road, Cuttack 753001. Deliveries at gate 2.',
      wo: 'WO/DHFW/2025/1188', start: -90, end: 300, value: '94200000.00', pm: 'pm2@demo.com', members: ['engineer2@demo.com', 'store@demo.com', 'qs@demo.com', 'qaqc@demo.com'], boq: BUILDING_BOQ, engineer: 'engineer2@demo.com',
    },
    {
      code: 'WS-2026-03', name: 'Jajpur Rural Piped Water Supply Scheme', type: 'WATER_SUPPLY' as const, client: 'RWSS Odisha (Jal Jeevan Mission)', consultant: 'WAPCOS', location: 'Jajpur, Odisha',
      site: 'Scheme store, WTP site, Dharmasala block, Jajpur 755007.',
      wo: 'WO/RWSS/2025/0922', start: -150, end: 420, value: '312000000.00', pm: 'pm@demo.com', members: ['tl@demo.com', 'engineer@demo.com', 'engineer2@demo.com', 'store@demo.com', 'procurement@demo.com'], boq: WATER_BOQ, engineer: 'engineer@demo.com',
    },
  ];

  let mrCounter = 1;
  for (const p of projects) {
    const project = await prisma.project.create({
      data: {
        organizationId: org.id, code: p.code, name: p.name, type: p.type, status: 'ACTIVE', clientName: p.client, consultantName: p.consultant, location: p.location, siteAddress: p.site,
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
          // Two remarks read as hindrances for the delay register (AI item 123): one belongs to an open delay, one is new.
          issues: i === 3 ? 'Diesel delivery delayed by 4 hours' : (HINDRANCE_REMARKS[p.type]?.[i] ?? null),
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
  await seedSplitQuotes(org.id);
  await seedSubcontracts(org.id);
  await seedPayables(org.id);
  await seedPaymentRequests(org.id);
  await seedHireBills(org.id);
  await seedQuality(org.id);
  await seedTestsAndNcrs(org.id);
  await seedDocuments(org.id);
  await seedCorrespondence(prisma, org.id);
  await seedQa(prisma, org.id);
  await seedQaRegisters(prisma, org.id);
  await seedQaAudits(prisma, org.id);
  await seedDrawingSchedule(prisma, org.id);
  await seedDesignSubmissions(prisma, org.id);
  await seedControlledCopies(prisma, org.id);
  await seedContractDocuments(org.id);
  await seedStaff(org.id);
  await seedAttendanceExtras(org.id);
  await seedHrRecords(org.id);
  await seedPayroll(org.id);
  await seedGuests(org.id);
  await seedVariations(org.id);
  await seedRfis(org.id);
  await seedDrawingMarkups(org.id);
  await seedDrawingTakeoffs(org.id);
  await seedBudgets(org.id);
  await seedStoreMoves(org.id);
  await seedReconciliation(org.id);
  await seedRateAnalysis(org.id);
  await seedFleet(org.id);
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
  await seedBiometric(org.id);
  await seedBooks(org.id);
  await seedOpening(org.id);
  await seedRmc(org.id);
  await seedSupplierPortal(org.id);
  await seedCentralStore(org.id);
  await seedFundRequests(org.id);
  await seedMachineLoans(org.id);
  await seedTenders(org.id);
  await seedPastOpenings(org.id);
  await seedScEnquiries(org.id);
  await seedMeetings(org.id);
  await seedMaterialApprovals(org.id);
  await seedLeakage(org.id);
  await seedAttendanceCheck(org.id);
  await seedActivityLinks(org.id);
  await seedWorkBreakdown(prisma, org.id);
  await seedTownDprs(prisma, org.id);
  await seedTownNetwork(prisma, org.id);
  await seedTownStock(prisma, org.id);
  await seedTownBilling(prisma, org.id);
  await seedEpc(prisma, org.id);
  await seedOm(prisma, org.id);
  await seedProjectTypes(prisma, org.id);
  await seedComments(org.id);
  await seedGroupCompanies(prisma, org.id, passwordHash);

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
 * Demo rate analysis and subcontractor reconciliation (v5 item 92) on the first building project: labour and machine
 * hours on its concrete, masonry and PCC items (from the starter library's figures), a brickwork work order to Kalinga
 * Builders whose measured 60 cum took more bricks and cement than the norms allow, the receipt and issue of that
 * material to the order, and two adjustments with reasons (bricks broken in unloading, cement set hard). The opening
 * stock adjustments get their reason too. Only when the organisation has no labour or machine lines yet.
 */
async function seedRateAnalysis(organizationId: string) {
  if (await prisma.boqResource.count({ where: { organizationId } })) return;
  await prisma.stockEntry.updateMany({ where: { organizationId, type: 'ADJUSTMENT', adjustmentReason: null, remarks: { startsWith: 'Opening stock' } }, data: { adjustmentReason: 'OPENING' } });
  const project = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, orderBy: { code: 'asc' }, include: { boqItems: true } });
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email } }))?.id;
  const [qs, pm, md, keeper] = [await user('qs@demo.com'), await user('pm@demo.com'), await user('md@demo.com'), await user('store@demo.com')];
  if (!project || !qs || !pm || !md || !keeper) return;
  const boq = (no: string) => project.boqItems.find((b) => b.itemNo === no);
  type Line = [string, 'LABOUR' | 'EQUIPMENT', string, string, string | null];
  // [BOQ item no., kind, trade or equipment category, per unit, note]
  const LINES: Line[] = [
    ['2.01', 'LABOUR', 'Mason', '0.17', null],
    ['2.01', 'LABOUR', 'Helper', '2', null],
    ['2.01', 'EQUIPMENT', 'Concreting', '0.4', 'Mixer'],
    ...['3.01', '3.02', '3.03'].flatMap((no): Line[] => [
      [no, 'LABOUR', 'Mason', '0.25', null],
      [no, 'LABOUR', 'Helper', '2.5', null],
      [no, 'LABOUR', 'Carpenter', no === '3.01' ? '0.6' : '0.9', 'Shuttering, from the last slab'],
      [no, 'LABOUR', 'Bar Bender', no === '3.01' ? '0.77' : '0.63', 'Reinforcement at the norm × 7 days a tonne'],
      [no, 'EQUIPMENT', 'Concreting', '0.8', 'Mixer and vibrator'],
      [no, 'EQUIPMENT', 'Lifting', no === '3.01' ? '0.1' : '0.25', 'Tower crane'],
    ]),
    ['4.01', 'LABOUR', 'Mason', '0.75', null],
    ['4.01', 'LABOUR', 'Helper', '1.75', null],
  ];
  for (const [no, kind, name, qty, note] of LINES) {
    const b = boq(no);
    if (b) await prisma.boqResource.create({ data: { organizationId, projectId: project.id, boqItemId: b.id, kind, name, qtyPerUnit: D(qty), note, updatedById: qs } });
  }
  await prisma.auditLog.create({ data: { organizationId, entityType: 'PROJECT', entityId: project.id, action: 'RATE_ANALYSIS_COPIED', actorId: qs, note: 'Labour and machine hours from the rate analysis' } });

  // Brickwork by a subcontractor: 60 cum measured and approved, bricks and cement issued to the order beyond the norms.
  const masonry = boq('4.01');
  const bricks = await prisma.item.findFirst({ where: { organizationId, name: 'Fly ash bricks 230mm' } });
  const cement = await prisma.item.findFirst({ where: { organizationId, name: 'OPC 53 Grade Cement', unit: 'Bags' } });
  if (!masonry || !bricks || !cement) return;
  const name = 'Kalinga Builders';
  const vendor =
    (await prisma.vendor.findFirst({ where: { organizationId, name } })) ??
    (await prisma.vendor.create({ data: { organizationId, name, kinds: ['SUBCONTRACTOR', 'LABOUR_CONTRACTOR'], pan: 'AAGFK4410L', stateCode: '21', contactPerson: 'S. Pradhan', phone: '9437112233', address: 'Bhubaneswar, Odisha' } }));
  const year = new Date().getUTCFullYear();
  const lastWo = await prisma.workOrder.findFirst({ where: { organizationId, woNo: { startsWith: `WO-${year}-` } }, orderBy: { woNo: 'desc' }, select: { woNo: true } });
  const quantity = masonry.revisedQty ?? masonry.originalQty;
  const rate = D(6100);
  const wo = await prisma.workOrder.create({
    data: {
      organizationId, projectId: project.id, vendorId: vendor.id, woNo: `WO-${year}-${String((lastWo ? parseInt(lastWo.woNo.slice(8), 10) : 0) + 1).padStart(4, '0')}`, woDate: day(-14),
      title: 'Brick masonry, ground floor', startDate: day(-12), endDate: day(75), gstRate: D(0), retentionPct: D(5), tdsPct: D(2), paymentDays: 15, value: quantity.mul(rate).toDecimalPlaces(2),
      terms: 'Rate with material. Bricks and cement issued from our store are recovered at the store rate; use beyond the norm and its wastage is recovered again as a penalty.',
      status: 'APPROVED', submittedById: pm, submittedAt: day(-14), reviewedById: md, reviewedAt: day(-13), createdAt: day(-14),
      lines: { create: [{ boqItemId: masonry.id, description: `${masonry.itemNo} ${masonry.description}`, unit: masonry.unit, quantity, rate, amount: quantity.mul(rate).toDecimalPlaces(2), sortOrder: 0 }] },
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'CREATED', actorId: pm, createdAt: day(-14) },
      { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'APPROVED', actorId: md, createdAt: day(-13) },
    ],
  });
  const lastMb = await prisma.measurementSheet.findFirst({ where: { organizationId, mbNo: { startsWith: `MB-${year}-` } }, orderBy: { mbNo: 'desc' }, select: { mbNo: true } });
  const sheet = await prisma.measurementSheet.create({
    data: {
      organizationId, projectId: project.id, boqItemId: masonry.id, mbNo: `MB-${year}-${String((lastMb ? parseInt(lastMb.mbNo.slice(8), 10) : 0) + 1).padStart(4, '0')}`, date: day(-3),
      location: 'Ground floor, grids A-D', floor: project.floors[0] ?? null, totalQty: D(60), status: 'APPROVED', workOrderId: wo.id,
      submittedById: qs, submittedAt: day(-3), reviewedById: pm, reviewedAt: day(-2), createdAt: day(-3),
      lines: { create: [{ description: 'External and partition walls, 230 mm', nos: D(1), length: D('86.957'), breadth: D('0.23'), depth: D(3), quantity: D(60), sortOrder: 0 }] },
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { organizationId, entityType: 'MEASUREMENT', entityId: sheet.id, action: 'SUBMITTED', actorId: qs, createdAt: day(-3) },
      { organizationId, entityType: 'MEASUREMENT', entityId: sheet.id, action: 'APPROVED', actorId: pm, createdAt: day(-2) },
    ],
  });
  const nextNo = async (prefix: string) => {
    const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
    return `${prefix}-${year}-${String((last ? parseInt(last.entryNo.slice(prefix.length + 6), 10) : 0) + 1).padStart(4, '0')}`;
  };
  // 60 cum takes 30,000 bricks (30,900 with 3%) and 75 bags (76.5 with 2%); the order drew 31,800 and 81.
  const moves: [string, 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT', number, Partial<Prisma.StockEntryUncheckedCreateInput>, [string, number][]][] = [
    ['GRN', 'RECEIPT', -10, { supplier: 'Utkal Cement Traders', challanNo: 'CH-2231', remarks: 'Bricks and cement for the ground-floor masonry' }, [[bricks.id, 32300], [cement.id, 87]]],
    ['ISS', 'ISSUE', -9, { issuedTo: name, workOrderId: wo.id, remarks: 'Ground-floor masonry, first lot' }, [[bricks.id, -18000], [cement.id, -45]]],
    ['ADJ', 'ADJUSTMENT', -8, { remarks: 'Broken in unloading from the truck', adjustmentReason: 'WASTAGE' }, [[bricks.id, -500]]],
    ['ADJ', 'ADJUSTMENT', -5, { remarks: 'Six bags set hard after rain got into the shed', adjustmentReason: 'DAMAGE' }, [[cement.id, -6]]],
    ['ISS', 'ISSUE', -4, { issuedTo: name, workOrderId: wo.id, remarks: 'Ground-floor masonry, second lot' }, [[bricks.id, -13800], [cement.id, -36]]],
  ];
  for (const [prefix, type, ago, data, lines] of moves) {
    const by = type === 'ADJUSTMENT' ? pm : keeper;
    const e = await prisma.stockEntry.create({
      data: {
        organizationId, projectId: project.id, type, entryNo: await nextNo(prefix), date: day(ago), createdById: by, createdAt: day(ago), ...data,
        lines: { create: lines.map(([itemId, q], i) => ({ organizationId, projectId: project.id, itemId, type, date: day(ago), quantity: D(q), sortOrder: i })) },
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: by, note: e.entryNo, createdAt: day(ago) } });
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
  type RfiSeed = Omit<Prisma.RfiUncheckedCreateInput, 'organizationId' | 'projectId' | 'rfiNo' | 'raisedOn' | 'replyBy' | 'raisedById'> & { raisedById?: string };
  const rfi = async (projectId: string, raisedOffset: number, replyOffset: number, { raisedById, ...data }: RfiSeed) => {
    n += 1;
    const by = raisedById ?? raiser.id;
    const r = await prisma.rfi.create({
      data: { organizationId, projectId, rfiNo: `RFI-${year}-${String(n).padStart(4, '0')}`, raisedOn: day(raisedOffset), replyBy: day(replyOffset), raisedById: by, createdAt: day(raisedOffset), ...data },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'RFI', entityId: r.id, action: 'CREATED', actorId: by, note: r.rfiNo, createdAt: day(raisedOffset) } });
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
    // Not the scheme in O&M (seed-om.ts): it has no site work to top up.
    where: { organizationId, status: { not: 'COMPLETED' } },
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
    // Not the scheme in O&M (seed-om.ts): it has no site work to top up.
    where: { organizationId, status: { not: 'COMPLETED' } },
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
      await entry('ISSUE', -i, keeper, { issuedTo: i === 2 ? 'Departmental (machinery)' : main, activityId: activity?.id ?? null, workElementId: activity?.workElementId ?? null, remarks: i === 2 ? 'Diesel for grader, roller and tippers' : null }, lines);
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

/** Fuel norms by machine code (v5 item 93): litres an hour, or km a litre for vehicles. */
const FUEL_NORMS: Record<string, [string, 'LITRES_PER_HOUR' | 'KM_PER_LITRE']> = {
  'EXC-01': ['11', 'LITRES_PER_HOUR'],
  'GRD-01': ['12', 'LITRES_PER_HOUR'],
  'RLR-01': ['6', 'LITRES_PER_HOUR'],
  'MIX-01': ['3', 'LITRES_PER_HOUR'],
  'JCB-01': ['7', 'LITRES_PER_HOUR'],
  'DG-01': ['9', 'LITRES_PER_HOUR'],
  'TIP-07': ['3.5', 'KM_PER_LITRE'],
};

/**
 * Fuel and fleet use (v5 item 93): diesel marked as fuel, a norm on each machine (the excavator's is set below what it
 * burns, so the watch list flags it), fuel issued from the store into each machine for its recent logs, and the
 * tyres on the grader and the battery on the backhoe, one of each replaced. Skipped once any part exists.
 */
async function seedFleet(organizationId: string) {
  if (await prisma.equipmentPart.count({ where: { organizationId } })) return;
  await prisma.item.updateMany({ where: { organizationId, OR: [{ category: { equals: 'Fuel', mode: 'insensitive' } }, { name: { startsWith: 'Diesel', mode: 'insensitive' } }] }, data: { isFuel: true } });
  const machines = await prisma.equipment.findMany({ where: { organizationId } });
  for (const m of machines) {
    const norm = FUEL_NORMS[m.code.replace(/^[A-Z]{2}-(?=[A-Z]+-\d)/, '')];
    if (norm) await prisma.equipment.update({ where: { id: m.id }, data: { fuelNorm: D(norm[0]), fuelNormUnit: norm[1], fuelTolerancePct: D(15) } });
  }

  const year = day(0).getUTCFullYear();
  const nextNo = async () => {
    const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `ISS-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
    return `ISS-${year}-${String((last ? parseInt(last.entryNo.slice(9), 10) : 0) + 1).padStart(4, '0')}`;
  };
  const keeper = await prisma.user.findFirst({ where: { organizationId, email: 'store@demo.com' } });
  if (!keeper) return;
  const logs = await prisma.machineryLog.findMany({
    where: { organizationId, date: { gte: day(-1) }, dieselLitres: { gt: 0 }, status: { not: 'REJECTED' } },
    include: { equipment: true, project: { include: { members: { include: { user: { include: { role: true } } } } } } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });
  for (const log of logs) {
    const fuel = await prisma.stockTxn.groupBy({
      by: ['itemId'], where: { projectId: log.projectId, item: { isFuel: true } }, _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } }, take: 1,
    });
    const balance = Number(fuel[0]?._sum.quantity ?? 0);
    const litres = Number(log.dieselLitres);
    if (!fuel.length || balance < litres) continue;
    const by = log.project.members.find((x) => x.user.role.key === 'STORE_MANAGER')?.userId ?? log.project.projectManagerId ?? keeper.id;
    const e = await prisma.stockEntry.create({
      data: {
        organizationId, projectId: log.projectId, type: 'ISSUE', entryNo: await nextNo(), date: log.date, createdById: by, createdAt: log.date,
        equipmentId: log.equipmentId, meterReading: log.meterStart, issuedTo: `${log.operatorName ?? `${log.equipment.code} ${log.equipment.name}`} (operator)`,
        remarks: `Into ${log.equipment.code} for the day`,
        lines: { create: [{ organizationId, projectId: log.projectId, itemId: fuel[0].itemId, type: 'ISSUE', date: log.date, quantity: D(-litres) }] },
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: by, note: e.entryNo, createdAt: log.date } });
  }

  const meterOf = async (equipmentId: string) =>
    Number((await prisma.machineryLog.findFirst({ where: { equipmentId, meterEnd: { not: null } }, orderBy: { date: 'desc' }, select: { meterEnd: true } }))?.meterEnd ?? 0);
  const part = (equipmentId: string, data: Omit<Prisma.EquipmentPartUncheckedCreateInput, 'organizationId' | 'equipmentId' | 'createdById'>) =>
    prisma.equipmentPart.create({ data: { organizationId, equipmentId, createdById: keeper.id, createdAt: data.fittedOn as Date, ...data } });

  const grader = machines.find((m) => m.code === 'GRD-01');
  if (grader) {
    const now = await meterOf(grader.id);
    for (const [i, position] of ['Front left', 'Front right', 'Rear left front', 'Rear left back', 'Rear right front', 'Rear right back'].entries()) {
      const cut = position === 'Rear right back';
      await part(grader.id, {
        kind: 'TYRE', position, make: 'MRF Muscle Grip 14.00-24', serialNo: `MRF-24-${71830 + i}`, fittedOn: day(-210), fittedMeter: D(now - 1480), cost: D('38500'),
        ...(cut ? { removedOn: day(-35), removedMeter: D(now - 260), removalReason: 'Sidewall cut on the rocky shoulder at Ch. 3+200' } : {}),
      });
      if (cut) await part(grader.id, { kind: 'TYRE', position, make: 'MRF Muscle Grip 14.00-24', serialNo: 'MRF-24-80412', fittedOn: day(-35), fittedMeter: D(now - 260), cost: D('39200') });
    }
  }
  const backhoe = machines.find((m) => m.code === 'JCB-01');
  if (backhoe) {
    const now = await meterOf(backhoe.id);
    await part(backhoe.id, { kind: 'BATTERY', position: 'Battery 1', make: 'Exide Xpress 88 Ah', serialNo: 'EX88-2291', fittedOn: day(-400), fittedMeter: D(Math.max(now - 2100, 0)), removedOn: day(-20), removedMeter: D(Math.max(now - 120, 0)), removalReason: 'Would not hold charge overnight', cost: D('9800') });
    await part(backhoe.id, { kind: 'BATTERY', position: 'Battery 1', make: 'Exide Xpress 88 Ah', serialNo: 'EX88-5530', fittedOn: day(-20), fittedMeter: D(Math.max(now - 120, 0)), cost: D('10450') });
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
    // Not the scheme in O&M (seed-om.ts): it has no site work to top up.
    where: { organizationId, status: { not: 'COMPLETED' } },
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
    // Not the scheme in O&M (seed-om.ts): it has no site work to top up.
    where: { organizationId, status: { not: 'COMPLETED' } },
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
    // Not the scheme in O&M (seed-om.ts): it has no site work to top up.
    where: { organizationId, status: { not: 'COMPLETED' } },
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
    // Not the scheme in O&M (seed-om.ts): it has no site work to top up.
    where: { organizationId, status: { not: 'COMPLETED' } },
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
/** Payment requests (v5 item 90): management approves any, project managers up to ₹5 lakh. */
const PAYMENT_RULES: typeof BILL_RULES = [
  { roleKey: 'MANAGEMENT', type: 'PAYMENT_REQUEST', maxAmount: null },
  { roleKey: 'PROJECT_MANAGER', type: 'PAYMENT_REQUEST', maxAmount: D(500000) },
];
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
    for (const type of ['BILL', 'PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'INSPECTION', 'PAYMENT_REQUEST'])
      if ((await prisma.approvalRule.count({ where: { organizationId, submissionType: type } })) === 0)
        await write([...BILL_RULES, ...PURCHASE_RULES, ...SUBCONTRACT_RULES, ...QUALITY_RULES, ...PAYMENT_RULES].filter((r) => r.type === type));
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
    ...PAYMENT_RULES,
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
 * A request still to be ordered, quoted by two suppliers who each win one item (finding 12 of the October review), so
 * Award lowest per item has something to split: [project type, rate and GST % per line per vendor].
 */
const DEMO_SPLIT: [string, [string, number, [number, number][]][]] = [
  'ROAD',
  [
    ['Kalinga Bitumen & Aggregates', 0, [[48200, 18], [1210, 5]]],
    ['Konark Aggregates & Minerals', 3000, [[49100, 18], [1145, 5]]],
  ],
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
 * Quotations from two suppliers on a request nothing has been ordered on, each cheaper on one item, so the comparative
 * statement offers Award lowest per item (finding 12 of the October review). Only when the request has no quotations.
 */
async function seedSplitQuotes(organizationId: string) {
  const [type, quotes] = DEMO_SPLIT;
  const buyer = (await prisma.user.findFirst({ where: { organizationId, role: { key: 'PROCUREMENT_MANAGER' } }, select: { id: true } }))?.id;
  if (!buyer) return;
  const mr = await prisma.materialRequest.findFirst({
    where: { organizationId, status: 'APPROVED', project: { type: type as never }, quotations: { none: {} }, purchaseOrders: { none: {} } },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!mr || mr.items.length < 2) return;
  for (const [name, freight, rates] of quotes) {
    const vendor =
      (await prisma.vendor.findFirst({ where: { organizationId, name } })) ??
      (await prisma.vendor.create({
        data: { organizationId, name, kinds: ['SUPPLIER'], gstin: '21AAFCM2847K1Z8', pan: 'AAFCM2847K', stateCode: '21', contactPerson: 'S. Patra', phone: '9437556677', address: 'Cuttack Road, Bhubaneswar' },
      }));
    await prisma.quotation.create({
      data: {
        organizationId, projectId: mr.projectId, materialRequestId: mr.id, vendorId: vendor.id, quoteDate: day(-2), validUntil: day(28), deliveryDays: 10, freight: D(freight),
        paymentTerms: '30 days from invoice', createdById: buyer, createdAt: day(-2),
        lines: { create: rates.map(([rate, gst], i) => ({ materialRequestItemId: mr.items[i].id, rate: D(rate), gstRate: D(gst) })) },
      },
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
      // The vendor's account changed three days before the payment: the purchase controls (Q6) ask for a call to confirm it.
      { organizationId, entityType: 'VENDOR', entityId: po.vendorId, action: 'BANK_CHANGED', actorId: accounts, note: 'Account ••4471 to ••9032', createdAt: day(-15) },
      { organizationId, entityType: 'VENDOR_PAYMENT', entityId: payment.id, action: 'CREATED', actorId: accounts, createdAt: day(-12) },
      { organizationId, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'PAYMENT_MADE', actorId: accounts, note: `₹${paid.toFixed(2)} paid (SBIN526287700412)`, createdAt: day(-12) },
    ],
  });
}

/**
 * Demo payment requests (v5 item 90): the road subcontractor's mobilisation advance on its work order, asked for by the
 * project manager, approved by management and paid by accounts (their bills recover it); and an advance on the cement
 * PO, asked for and waiting in the approvals queue. Only when the organisation has no payment requests yet.
 */
async function seedPaymentRequests(organizationId: string) {
  if ((await prisma.paymentRequest.count({ where: { organizationId } })) > 0) return;
  const userOf = async (role: string) => (await prisma.user.findFirst({ where: { organizationId, role: { key: role } }, select: { id: true } }))?.id;
  const [pm, md, accounts] = [await userOf('PROJECT_MANAGER'), await userOf('MANAGEMENT'), await userOf('ACCOUNTS_MANAGER')];
  if (!pm || !md || !accounts) return;
  const year = new Date().getUTCFullYear();
  let n = 0;
  const no = () => `PR-${year}-${String(++n).padStart(4, '0')}`;
  const wo = await prisma.workOrder.findFirst({ where: { organizationId, status: 'APPROVED', advanceAmount: { gt: 0 } }, orderBy: { createdAt: 'asc' } });
  if (wo) {
    const req = await prisma.paymentRequest.create({
      data: {
        organizationId, projectId: wo.projectId, vendorId: wo.vendorId, requestNo: no(), kind: 'WO_ADVANCE', workOrderId: wo.id, amount: wo.advanceAmount, mode: 'BANK', neededBy: day(-16),
        reason: 'Mobilisation advance as per the work order, recovered at 10% from each bill', paidAmount: wo.advanceAmount, paidDate: day(-15),
        status: 'APPROVED', submittedById: pm, submittedAt: day(-18), reviewedById: md, reviewedAt: day(-17), createdAt: day(-18),
      },
    });
    const payment = await prisma.vendorPayment.create({
      data: {
        organizationId, projectId: wo.projectId, vendorId: wo.vendorId, workOrderId: wo.id, paymentRequestId: req.id, paymentDate: day(-15), amount: wo.advanceAmount, mode: 'BANK',
        reference: 'SBIN526287700388', remarks: 'Mobilisation advance', createdById: accounts, createdAt: day(-15),
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'PAYMENT_REQUEST', entityId: req.id, action: 'CREATED', actorId: pm, createdAt: day(-18) },
        { organizationId, entityType: 'PAYMENT_REQUEST', entityId: req.id, action: 'SUBMITTED', actorId: pm, createdAt: day(-18) },
        { organizationId, entityType: 'PAYMENT_REQUEST', entityId: req.id, action: 'APPROVED', actorId: md, createdAt: day(-17) },
        { organizationId, entityType: 'VENDOR_PAYMENT', entityId: payment.id, action: 'CREATED', actorId: accounts, createdAt: day(-15) },
        { organizationId, entityType: 'PAYMENT_REQUEST', entityId: req.id, action: 'PAYMENT_MADE', actorId: accounts, note: `₹${wo.advanceAmount.toFixed(2)} paid (SBIN526287700388)`, createdAt: day(-15) },
      ],
    });
  }
  const po = await prisma.purchaseOrder.findFirst({ where: { organizationId, status: 'APPROVED', closedAt: null, project: { type: 'BUILDING' } }, orderBy: { createdAt: 'asc' } });
  if (po) {
    const amount = po.total.mul(0.1).toDecimalPlaces(0);
    const req = await prisma.paymentRequest.create({
      data: {
        organizationId, projectId: po.projectId, vendorId: po.vendorId, requestNo: no(), kind: 'PO_ADVANCE', purchaseOrderId: po.id, amount, mode: 'BANK', neededBy: day(3),
        reason: '10% advance against the order so the supplier releases the next lot', status: 'SUBMITTED', submittedById: pm, submittedAt: day(-1), createdAt: day(-1),
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'PAYMENT_REQUEST', entityId: req.id, action: 'CREATED', actorId: pm, createdAt: day(-1) },
        { organizationId, entityType: 'PAYMENT_REQUEST', entityId: req.id, action: 'SUBMITTED', actorId: pm, createdAt: day(-1) },
      ],
    });
  }
}

/**
 * Demo bills without a PO and a debit note (v5 item 91): the road project's hired grader (the owner fuels it and its
 * operator comes with it) billed for its approved logs of the month with the diesel in them recovered, approved and
 * waiting to be paid; a crane agency's transport bill booked to its expense head; and a debit note for material short
 * on the road supplier's PO bill. Only when the organisation has no bill without a PO yet.
 */
async function seedHireBills(organizationId: string) {
  if ((await prisma.vendorBill.count({ where: { organizationId, kind: { not: 'PO' } } })) > 0) return;
  const userOf = async (role: string) => (await prisma.user.findFirst({ where: { organizationId, role: { key: role } }, select: { id: true } }))?.id;
  const [md, accounts] = [await userOf('MANAGEMENT'), await userOf('ACCOUNTS_MANAGER')];
  if (!md || !accounts) return;
  const year = new Date().getUTCFullYear();
  const nextBillNo = async () => {
    const last = await prisma.vendorBill.findFirst({ where: { organizationId, billNo: { startsWith: `VB-${year}-` } }, orderBy: { billNo: 'desc' }, select: { billNo: true } });
    return `VB-${year}-${String((last ? parseInt(last.billNo.slice(8), 10) : 0) + 1).padStart(4, '0')}`;
  };
  const audit = (entityId: string, at: number, by: string) =>
    prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'VENDOR_BILL', entityId, action: 'CREATED', actorId: by, createdAt: day(at) },
        { organizationId, entityType: 'VENDOR_BILL', entityId, action: 'SUBMITTED', actorId: by, createdAt: day(at) },
        { organizationId, entityType: 'VENDOR_BILL', entityId, action: 'APPROVED', actorId: md, createdAt: day(at) },
      ],
    });

  const eq = await prisma.equipment.findFirst({
    where: { organizationId, ownership: 'HIRED', rateUnit: 'HOUR', vendorId: { not: null }, projectId: { not: null }, rate: { not: null } },
    include: { vendor: true },
    orderBy: { code: 'asc' },
  });
  const latest = eq && (await prisma.machineryLog.findFirst({ where: { equipmentId: eq.id, projectId: eq.projectId!, status: 'APPROVED' }, orderBy: { date: 'desc' } }));
  if (eq?.vendor && latest) {
    await prisma.equipment.update({ where: { id: eq.id }, data: { hireFuelBy: 'OWNER', hireOperator: true } });
    const from = new Date(Date.UTC(latest.date.getUTCFullYear(), latest.date.getUTCMonth(), 1));
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const logs = await prisma.machineryLog.findMany({ where: { equipmentId: eq.id, projectId: eq.projectId!, status: 'APPROVED', date: { gte: from, lt: to } } });
    const hours = logs.reduce((t, l) => t.add(l.hoursWorked), D(0));
    const litres = logs.reduce((t, l) => t.add(l.dieselLitres ?? 0), D(0));
    const amount = hours.mul(eq.rate!).toDecimalPlaces(2);
    const gstAmount = amount.mul(18).div(100).toDecimalPlaces(2);
    const fuelRate = D('92.50');
    const month = from.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const bill = await prisma.vendorBill.create({
      data: {
        organizationId, projectId: eq.projectId!, vendorId: eq.vendorId!, kind: 'HIRE', equipmentId: eq.id, hireMonth: from, billNo: await nextBillNo(), invoiceNo: `MEM/${year % 100}-${(year % 100) + 1}/0087`,
        invoiceDate: day(-1), dueDate: day(29), subtotal: amount, gstAmount, total: amount.add(gstAmount), fuelLitres: litres, fuelRate, fuelRecovery: litres.mul(fuelRate).toDecimalPlaces(2),
        matched: true, exceptions: [], status: 'APPROVED', submittedById: accounts, submittedAt: day(-1), reviewedById: md, reviewedAt: day(0), createdAt: day(-1),
        lines: { create: [{ description: `${eq.code} ${eq.name}, hire for ${month}`, unit: 'hour', quantity: hours, rate: eq.rate!, gstRate: D(18), amount, gstAmount, sortOrder: 0 }] },
      },
    });
    await prisma.machineryLog.updateMany({ where: { id: { in: logs.map((l) => l.id) } }, data: { vendorBillId: bill.id } });
    await audit(bill.id, -1, accounts);
  }

  const cranes = await prisma.vendor.findFirst({ where: { organizationId, name: 'Kalinga Cranes' } });
  const water = await prisma.project.findFirst({ where: { organizationId, type: 'WATER_SUPPLY' }, orderBy: { code: 'asc' } });
  if (cranes && water) {
    const amount = D('16400');
    const gstAmount = amount.mul(18).div(100).toDecimalPlaces(2);
    const bill = await prisma.vendorBill.create({
      data: {
        organizationId, projectId: water.id, vendorId: cranes.id, kind: 'OTHER', expenseCategory: 'TRANSPORT', billNo: await nextBillNo(), invoiceNo: `KC/${year % 100}-${(year % 100) + 1}/0141`,
        invoiceDate: day(-3), dueDate: day(27), subtotal: amount, gstAmount, total: amount.add(gstAmount), matched: true, exceptions: [],
        status: 'APPROVED', submittedById: accounts, submittedAt: day(-3), reviewedById: md, reviewedAt: day(-2), createdAt: day(-3),
        lines: {
          create: [
            { description: 'Hydra crane for lowering DI pipes, 2 shifts', unit: 'shift', quantity: D(2), rate: D('6200'), gstRate: D(18), amount: D('12400'), gstAmount: D('2232'), sortOrder: 0 },
            { description: 'Mobilisation and return of the crane', unit: 'trip', quantity: D(1), rate: D('4000'), gstRate: D(18), amount: D('4000'), gstAmount: D('720'), sortOrder: 1 },
          ],
        },
      },
    });
    await audit(bill.id, -3, accounts);
  }

  const poBill = await prisma.vendorBill.findFirst({ where: { organizationId, kind: 'PO', invoiceNo: 'KBA/26-27/0213', status: 'APPROVED' }, include: { lines: { include: { purchaseOrderLine: true }, orderBy: { sortOrder: 'asc' } } } });
  const line = poBill?.lines[0];
  if (poBill && line?.purchaseOrderLine) {
    const short = line.quantity.mul(0.02).toDecimalPlaces(3);
    const amount = short.mul(line.rate).toDecimalPlaces(2);
    const gst = amount.mul(line.gstRate).div(100).toDecimalPlaces(2);
    const note = await prisma.debitNote.create({
      data: {
        organizationId, projectId: poBill.projectId, vendorId: poBill.vendorId, noteNo: `DN-${year}-0001`, date: day(-30), reason: 'SHORTAGE', vendorBillId: poBill.id,
        subtotal: amount, gstAmount: gst, total: amount.add(gst), remarks: 'Weighbridge slips show the last two loads short', createdById: accounts, createdAt: day(-30),
        lines: { create: [{ description: `${line.purchaseOrderLine.itemName}, short supplied`, quantity: short, unit: line.purchaseOrderLine.unit, rate: line.rate, amount, gstRate: line.gstRate, gstAmount: gst, sortOrder: 0 }] },
      },
    });
    await prisma.vendorBill.update({ where: { id: poBill.id }, data: { debitNoteAmount: amount.add(gst) } });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'DEBIT_NOTE', entityId: note.id, action: 'CREATED', actorId: accounts, createdAt: day(-30) },
        { organizationId, entityType: 'VENDOR_BILL', entityId: poBill.id, action: 'DEBIT_NOTE', actorId: accounts, note: `₹${amount.add(gst).toFixed(2)} taken off`, createdAt: day(-30) },
      ],
    });
  }
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
        exceptions: first.lines.map((l) => `${l.purchaseOrderLine?.itemName}: ${l.quantity.toFixed(3).replace(/\.?0+$/, '')} ${l.purchaseOrderLine?.unit} billed, ${l.quantity.toFixed(3).replace(/\.?0+$/, '')} received of which ${l.quantity.toFixed(3).replace(/\.?0+$/, '')} is on other bills`),
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
  { type: 'BUILDING', activity: 'RCC footings and columns', kind: 'CONCRETE_CUBE', title: 'M25 cubes, columns C1 to C8', location: 'Columns, ground to first floor', ago: 10, spec: 'Not less than 25 N/mm² at 28 days (IS 456)', unit: 'N/mm²', min: '25', readings: [['7 days', 7, '16.2'], ['28 days', 28, null]] },
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
function drawingPdf(docNo: string, title: string, revision: string, project: string, revised = false): Uint8Array<ArrayBuffer> {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '-');
  const text = (x: number, y: number, size: number, t: string) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(t)}) Tj ET`;
  const body = [
    '1 w 20 20 802 555 re S 0.5 w 522 20 300 110 re S 522 95 m 822 95 l S 522 60 m 822 60 l S 722 20 m 722 60 l S',
    '0.6 G 60 200 m 460 200 l 460 480 l 60 480 l h S 60 340 m 460 340 l S 260 200 m 260 480 l S 0 G',
    // A later revision moves a wall and adds a room, so comparing revisions in the viewer shows a change.
    ...(revised ? ['0.6 G 360 200 m 360 340 l S 260 410 m 460 410 l S 0 G', text(380, 260, 9, 'TOILET BLOCK')] : []),
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

/** A small plan as an ASCII DXF (item 109): walls, a door swing, a column grid and labels on their own layers. */
function drawingDxf(docNo: string, revision: string): Uint8Array<ArrayBuffer> {
  const out: (string | number)[] = [];
  const g = (...pairs: (string | number)[]) => out.push(...pairs);
  const layer = (name: string, color: number) => g(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
  const line = (l: string, x1: number, y1: number, x2: number, y2: number) => g(0, 'LINE', 8, l, 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0);
  const rect = (l: string, x: number, y: number, w: number, h: number) => {
    line(l, x, y, x + w, y);
    line(l, x + w, y, x + w, y + h);
    line(l, x + w, y + h, x, y + h);
    line(l, x, y + h, x, y);
  };
  const text = (l: string, x: number, y: number, h: number, t: string) => g(0, 'TEXT', 8, l, 10, x, 20, y, 30, 0, 40, h, 1, t);
  g(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 4);
  layer('WALLS', 7);
  layer('DOORS', 3);
  layer('GRID', 8);
  layer('TEXT', 5);
  g(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  // Outer walls 12 m × 8 m, 230 mm thick, and partitions (millimetres).
  rect('WALLS', 0, 0, 12000, 8000);
  rect('WALLS', 230, 230, 11540, 7540);
  line('WALLS', 4000, 230, 4000, 7770);
  line('WALLS', 8000, 230, 8000, 4000);
  line('WALLS', 8000, 4000, 11770, 4000);
  for (const [x, y] of [[1500, 230], [5500, 230], [9200, 4000]]) {
    line('DOORS', x, y, x, y + 900);
    g(0, 'ARC', 8, 'DOORS', 10, x, 20, y, 30, 0, 40, 900, 50, 0, 51, 90);
  }
  for (const [i, x] of [0, 4000, 8000, 12000].entries()) {
    line('GRID', x, -1500, x, 9500);
    g(0, 'CIRCLE', 8, 'GRID', 10, x, 20, 10000, 30, 0, 40, 450);
    text('GRID', x - 150, 9850, 300, String(i + 1));
  }
  text('TEXT', 1200, 4000, 350, 'GENTS TOILET');
  text('TEXT', 5200, 4000, 350, 'LADIES TOILET');
  text('TEXT', 8800, 2000, 350, 'STORE');
  text('TEXT', 8800, 6000, 350, 'JANITOR');
  text('TEXT', 0, -2500, 400, `${docNo} Rev ${revision}  Toilet block layout (all dimensions in mm)`);
  g(0, 'ENDSEC', 0, 'EOF');
  const body = out.map((v, i) => (i % 2 === 0 ? String(v).padStart(3, ' ') : String(v))).join('\n') + '\n';
  return new Uint8Array(Buffer.from(body, 'latin1'));
}

/**
 * Marks on the demo drawings (item 109), once per organisation: comments and clouds on the building's ground floor plan
 * (one carried open from Rev R0), and the toilet block as a DXF drawing to show the viewer's CAD side.
 */
async function seedDrawingMarkups(organizationId: string) {
  const plan = await prisma.document.findFirst({ where: { organizationId, docNo: 'ARC-101' }, include: { revisions: { include: { attachments: { orderBy: { createdAt: 'asc' } } }, orderBy: { issuedOn: 'asc' } } } });
  if (!plan || plan.revisions.length < 2) return;
  const project = await prisma.project.findUnique({ where: { id: plan.projectId }, select: { projectManagerId: true } });
  const pm = project?.projectManagerId;
  const site = await prisma.user.findFirst({ where: { organizationId, email: 'engineer2@demo.com' }, select: { id: true } });
  if (!pm) return;

  if (!(await prisma.document.count({ where: { projectId: plan.projectId, docNo: 'ARC-110' } }))) {
    const doc = await prisma.document.create({
      data: { organizationId, projectId: plan.projectId, docNo: 'ARC-110', title: 'Toilet block layout (CAD)', kind: 'DRAWING', discipline: 'ARCHITECTURAL', createdById: pm, createdAt: day(-10) },
    });
    const rev = await prisma.documentRevision.create({
      data: { documentId: doc.id, revision: 'R0', issuedOn: day(-10), status: 'FOR_CONSTRUCTION', receivedFrom: 'Shilpa Architects', remarks: 'DXF from the architect', issuedById: pm, createdAt: day(-10) },
    });
    const dxf = drawingDxf('ARC-110', 'R0');
    await prisma.attachment.create({
      data: { organizationId, fileName: 'ARC-110-R0.dxf', mimeType: 'image/vnd.dxf', size: dxf.length, storagePath: 'db:seed/ARC-110-R0.dxf', data: dxf, uploadedById: pm, revisionId: rev.id, createdAt: day(-10) },
    });
    await prisma.document.update({ where: { id: doc.id }, data: { currentRevisionId: rev.id } });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'DOCUMENT', entityId: doc.id, action: 'CREATED', actorId: pm, note: 'Rev R0', createdAt: day(-10) } });
  }

  if (await prisma.drawingMarkup.count({ where: { organizationId } })) return;
  const [r0, r1] = plan.revisions;
  const f0 = r0.attachments[0];
  const f1 = r1.attachments[0];
  if (!f0 || !f1) return;
  const by = site?.id ?? pm;
  const marks = [
    { rev: r0, file: f0, kind: 'CLOUD' as const, points: [[0.31, 0.2], [0.55, 0.45]], color: 'RED' as const, note: 'Waiting area too small for the OPD queue; enlarge towards grid C', status: 'RESOLVED' as const, ago: 38, by: pm },
    { rev: r0, file: f0, kind: 'PIN' as const, points: [[0.2, 0.62]], color: 'RED' as const, note: 'Sill level of this window is not shown. Confirm 900 mm?', status: 'OPEN' as const, ago: 36, by },
    { rev: r1, file: f1, kind: 'PIN' as const, points: [[0.47, 0.5]], color: 'BLUE' as const, note: 'Toilet block now at grid 5: shift the soil pipe sleeve in the plinth beam before casting', status: 'OPEN' as const, ago: 20, by: pm },
    { rev: r1, file: f1, kind: 'ARROW' as const, points: [[0.66, 0.2], [0.55, 0.33]], color: 'ORANGE' as const, note: 'Door swing clashes with the column', status: 'OPEN' as const, ago: 12, by },
  ];
  for (const [i, m] of marks.entries()) {
    await prisma.drawingMarkup.create({
      data: {
        organizationId,
        projectId: plan.projectId,
        documentId: plan.id,
        markupNo: i + 1,
        revisionId: m.rev.id,
        attachmentId: m.file.id,
        kind: m.kind,
        points: m.points,
        color: m.color,
        note: m.note,
        status: m.status,
        resolvedById: m.status === 'RESOLVED' ? pm : null,
        resolvedAt: m.status === 'RESOLVED' ? day(-25) : null,
        resolvedNote: m.status === 'RESOLVED' ? 'Enlarged on Rev R1' : null,
        createdById: m.by,
        createdAt: day(-m.ago),
      },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'DOCUMENT', entityId: plan.id, action: 'MARKUP_ADDED', actorId: m.by, note: `M${i + 1}: ${m.note}`, createdAt: day(-m.ago) } });
  }
}

/**
 * Measures on the toilet block DXF (v6 item 118), once per organisation: its scale along the 12 m outer wall, a
 * partition's length, two floor areas and the doors counted. The sheet's coordinates follow the viewer's DXF extents
 * (the drawing's points plus a 3 % margin), so the measures sit on the walls they name.
 */
async function seedDrawingTakeoffs(organizationId: string) {
  if (await prisma.drawingTakeoff.count({ where: { organizationId } })) return;
  const doc = await prisma.document.findFirst({ where: { organizationId, docNo: 'ARC-110' }, include: { revisions: { include: { attachments: true } } } });
  const rev = doc?.revisions[0];
  const file = rev?.attachments[0];
  const project = doc ? await prisma.project.findUnique({ where: { id: doc.projectId }, select: { projectManagerId: true } }) : null;
  const qs = await prisma.user.findFirst({ where: { organizationId, role: { key: 'QUANTITY_SURVEYOR' } }, select: { id: true } });
  const by = qs?.id ?? project?.projectManagerId;
  if (!doc || !rev || !file || !by) return;
  // Extents of drawingDxf: x from -450 to 12450 (the grid bubbles), y from -2500 (the title) to 10450, and the margin.
  const m = 12950 * 0.03;
  const [minX, maxY, w, h] = [-450 - m, 10450 + m, 12900 + 2 * m, 12950 + 2 * m];
  const at = (x: number, y: number): MarkupPoint => [Math.round(((x - minX) / w) * 1e6) / 1e6, Math.round(((maxY - y) / h) * 1e6) / 1e6];
  const aspect = w / h;
  const scalePoints: [MarkupPoint, MarkupPoint] = [at(0, 0), at(12000, 0)];
  const scale = scaleFrom(scalePoints, 12, aspect)!;
  await prisma.drawingScale.create({ data: { organizationId, documentId: doc.id, attachmentId: file.id, page: 1, points: scalePoints, lengthM: 12, aspect, setById: by, createdAt: day(-8), updatedAt: day(-8) } });
  await prisma.auditLog.create({ data: { organizationId, entityType: 'DOCUMENT', entityId: doc.id, action: 'SCALE_SET', actorId: by, note: 'Scale set on page 1: 12.000 m between two points', createdAt: day(-8) } });
  const measures: { kind: TakeoffKind; label: string; points: MarkupPoint[] }[] = [
    { kind: 'LENGTH', label: 'Partition between store and janitor, 115 mm brickwork', points: [at(8000, 4000), at(11770, 4000)] },
    { kind: 'AREA', label: 'Gents toilet floor, anti-skid tiles', points: [at(230, 230), at(4000, 230), at(4000, 7770), at(230, 7770)] },
    { kind: 'AREA', label: 'Store floor, IPS flooring', points: [at(8000, 230), at(11770, 230), at(11770, 4000), at(8000, 4000)] },
    { kind: 'COUNT', label: 'Doors D1, 900 mm flush', points: [at(1950, 680), at(5950, 680), at(9650, 4450)] },
  ];
  for (const [i, t] of measures.entries()) {
    const value = takeoffValue(t.kind, t.points, aspect, scale)!;
    await prisma.drawingTakeoff.create({
      data: { organizationId, projectId: doc.projectId, documentId: doc.id, takeoffNo: i + 1, revisionId: rev.id, attachmentId: file.id, page: 1, kind: t.kind, points: t.points, label: t.label, value, createdById: by, createdAt: day(-7) },
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'DOCUMENT', entityId: doc.id, action: 'TAKEOFF_ADDED', actorId: by, note: `T${i + 1}: ${t.label}`, createdAt: day(-7) } });
  }
}

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
        const pdf = drawingPdf(d.docNo, d.title, revision, `${project.code} ${project.name}`, revision !== d.revisions[0][0]);
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
        letterDate: day(-l.ago), receivedOn: l.direction === 'IN' ? day(-l.ago) : null, status: l.direction === 'OUT' ? 'ISSUED' : 'OPEN', party: l.party, subject: l.subject, summary: l.summary, replyBy: l.replyBy === undefined ? null : day(l.replyBy),
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
/**
 * Attendance extras (v5 item 97): the demo sites get a location for GPS check-in; on a fresh seed the last week's
 * overtime waits for the site manager (older overtime approved), and the surveyor was on duty at the client's office.
 * Each part runs once.
 */
async function seedAttendanceExtras(organizationId: string) {
  const sites: [string, string, string, number][] = [
    ['RD-2026-01', '20.114600', '85.831400', 500],
    ['BL-2026-02', '20.462500', '85.883000', 200],
    ['WS-2026-03', '20.848500', '86.336600', 400],
  ];
  for (const [code, lat, lng, radius] of sites)
    await prisma.project.updateMany({ where: { organizationId, code, siteLat: null }, data: { siteLat: D(lat), siteLng: D(lng), siteRadiusM: radius } });

  if ((await prisma.staffAttendance.count({ where: { organizationId, overtimeStatus: { not: null } } })) === 0) {
    const rows = await prisma.staffAttendance.findMany({
      where: { organizationId, overtimeHours: { gt: 0 } },
      select: { id: true, date: true, markedById: true, employee: { select: { project: { select: { projectManagerId: true } } } } },
    });
    for (const r of rows) {
      const recent = r.date >= day(-7);
      const decider = r.employee.project?.projectManagerId ?? r.markedById;
      await prisma.staffAttendance.update({
        where: { id: r.id },
        data: recent ? { overtimeStatus: 'PENDING' } : { overtimeStatus: 'APPROVED', overtimeDecidedById: decider, overtimeDecidedAt: new Date(r.date.getTime() + 86_400_000) },
      });
    }
  }

  if ((await prisma.leaveRequest.count({ where: { organizationId, type: 'ON_DUTY' } })) === 0) {
    const e = await prisma.employee.findFirst({ where: { organizationId, employeeCode: 'EMP-014' }, select: { id: true, project: { select: { projectManagerId: true } } } });
    const hr = await prisma.user.findFirst({ where: { organizationId, email: 'hr@demo.com' }, select: { id: true } });
    let from = -2;
    while (isWeeklyOff(day(from).toISOString().slice(0, 10))) from -= 1;
    const decider = e?.project?.projectManagerId ?? hr?.id;
    if (e && hr && decider) {
      const l = await prisma.leaveRequest.create({
        data: {
          organizationId, employeeId: e.id, type: 'ON_DUTY', fromDate: day(from), toDate: day(from), halfDay: false, days: D(1),
          reason: 'Joint survey with the Works Department at their Khordha office', status: 'APPROVED', appliedById: hr.id,
          decidedById: decider, decidedAt: day(from - 1), createdAt: day(from - 2),
        },
      });
      await prisma.staffAttendance.deleteMany({ where: { employeeId: e.id, date: day(from) } });
      await prisma.auditLog.create({ data: { organizationId, entityType: 'LEAVE', entityId: l.id, action: 'APPROVED', actorId: decider, note: null, createdAt: day(from - 1) } });
    }
  }
}

/** Yearly CTC by designation for the demo staff (v6 item 99), rupees. */
const DEMO_CTC: Record<string, number> = {
  'Managing Director': 3600000, 'IT and systems head': 1500000, 'Project manager': 1440000, 'Site supervisor': 420000, 'Site engineer': 540000,
  'Store keeper': 300000, 'Quantity surveyor': 720000, 'Procurement manager': 960000, 'QA/QC engineer': 600000, 'Accounts manager': 900000,
  'HR manager': 840000, Surveyor: 360000, Driver: 240000, 'Safety officer': 480000, 'Pump operator': 216000,
};

/**
 * HR records (v6 item 99) for the demo staff, once: personal, statutory and bank details, terms, who they report to, and
 * the service events behind today's record (joining for everyone, a confirmation, a transfer, a promotion and an
 * increment). Two people have a birthday in the coming weeks and the newest site engineer's probation ends soon.
 * Bikash Swain has no PAN or bank account yet, so the dashboard's "details missing" has an entry.
 */
async function seedHrRecords(organizationId: string) {
  if ((await prisma.employeeEvent.count({ where: { organizationId } })) > 0) return;
  const staff = await prisma.employee.findMany({ where: { organizationId }, orderBy: { employeeCode: 'asc' } });
  if (!staff.length) return;
  const hr = await prisma.user.findFirst({ where: { organizationId, email: 'hr@demo.com' }, select: { id: true } });
  if (!hr) return;
  const byCode = new Map(staff.map((e) => [e.employeeCode, e]));
  const md = byCode.get('EMP-001');
  const projects = await prisma.project.findMany({ where: { organizationId }, select: { id: true, projectManagerId: true } });
  const pmEmployee = new Map(staff.filter((e) => e.userId).map((e) => [e.userId!, e.id]));
  const letters = new Map<string, number>();
  const letterNo = (date: Date) => {
    const y = String(date.getUTCFullYear());
    const n = (letters.get(y) ?? 0) + 1;
    letters.set(y, n);
    return `HR-${y}-${String(n).padStart(4, '0')}`;
  };
  const banks = [['State Bank of India', 'SBIN0001234'], ['Punjab National Bank', 'PUNB0123400'], ['HDFC Bank', 'HDFC0001234'], ['Odisha Gramya Bank', 'IOBA0OGB001']];
  const today = new Date();
  const events: Prisma.EmployeeEventCreateManyInput[] = [];
  for (const e of staff) {
    const n = Number(e.employeeCode.slice(4));
    const ctc = DEMO_CTC[e.designation] ?? 360000;
    const projectManager = projects.find((p) => p.id === e.projectId)?.projectManagerId;
    const reportsTo = e.employeeCode === 'EMP-001' ? null : e.projectId && projectManager && pmEmployee.get(projectManager) !== e.id ? pmEmployee.get(projectManager) ?? md?.id : md?.id;
    const [bank, ifsc] = banks[n % banks.length];
    // Two birthdays soon (in 5 and 12 days), the rest spread over the year.
    const birthday = n === 6 ? day(5) : n === 15 ? day(12) : new Date(Date.UTC(1975 + (n * 3) % 25, n % 12, 1 + (n * 7) % 27));
    const born = new Date(Date.UTC(n === 6 ? 1996 : n === 15 ? 1988 : birthday.getUTCFullYear(), birthday.getUTCMonth(), birthday.getUTCDate()));
    const missing = e.employeeCode === 'EMP-014';
    const onProbation = e.employeeCode === 'EMP-019';
    await prisma.employee.update({
      where: { id: e.id },
      data: {
        dateOfBirth: born,
        gender: [6, 9, 11, 13, 18].includes(n) ? 'FEMALE' : 'MALE',
        fatherOrSpouseName: `${['Bijay', 'Sarat', 'Prafulla', 'Hari', 'Ashok'][n % 5]} ${e.fullName.split(' ').slice(-1)[0]}`,
        email: e.userId ? null : `${e.fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@demo-staff.in`,
        address: ['Plot 112, Saheed Nagar, Bhubaneswar 751007', 'At/Po Balianta, Khordha 752101', 'Qr. 4B, Unit 8, Bhubaneswar 751012', 'Near Jagannath Temple, Puri 752001'][n % 4],
        bloodGroup: ['B+', 'O+', 'A+', 'AB+', 'O-'][n % 5],
        emergencyContact: `${['Spouse', 'Father', 'Brother', 'Mother'][n % 4]}`,
        emergencyPhone: `98610${String(10000 + n * 137).slice(-5)}`,
        pan: missing ? null : `ABC${'PQRST'[n % 5]}${String.fromCharCode(65 + (n % 26))}${String(1000 + n * 37).slice(-4)}${String.fromCharCode(65 + ((n * 5) % 26))}`,
        aadhaarLast4: String(1000 + n * 211).slice(-4),
        uan: missing ? null : `1012${String(34567800 + n).padStart(8, '0')}`,
        pfNumber: `OR/BBS/0034567/000/${String(n).padStart(7, '0')}`,
        esiNumber: ctc / 12 <= 21000 ? `31${String(12345600 + n).padStart(8, '0')}` : null,
        bankName: missing ? null : bank,
        bankAccountNo: missing ? null : `3${String(2010000000 + n * 7919)}`,
        bankIfsc: missing ? null : ifsc,
        employmentType: onProbation ? 'PROBATION' : e.designation === 'Driver' || e.designation === 'Pump operator' ? 'CONTRACT' : 'PERMANENT',
        grade: ctc >= 1400000 ? 'M3' : ctc >= 800000 ? 'M2' : ctc >= 500000 ? 'M1' : 'S1',
        reportingToId: reportsTo ?? null,
        probationEndsOn: onProbation ? day(18) : e.joinedOn ? new Date(e.joinedOn.getTime() + 180 * 86_400_000) : null,
        confirmedOn: onProbation ? null : e.joinedOn ? new Date(e.joinedOn.getTime() + 182 * 86_400_000) : null,
        noticeDays: ctc >= 800000 ? 60 : 30,
        ctcAnnual: D(ctc),
        ...(onProbation ? { joinedOn: day(-162) } : {}),
      },
    });
    const joined = onProbation ? day(-162) : e.joinedOn;
    if (!joined) continue;
    const firstCtc = e.employeeCode === 'EMP-006' ? ctc - 60000 : ctc;
    const firstDesignation = e.employeeCode === 'EMP-005' ? 'Foreman' : e.designation;
    const firstProject = e.employeeCode === 'EMP-017' ? projects.find((p) => p.id !== e.projectId)?.id ?? e.projectId : e.projectId;
    events.push({ organizationId, employeeId: e.id, type: 'JOINED', effectiveDate: joined, letterNo: letterNo(joined), toProjectId: firstProject, toDesignation: firstDesignation, toDepartment: e.department, toCtc: D(firstCtc), createdById: hr.id, createdAt: joined });
    if (!onProbation) {
      const confirmed = new Date(joined.getTime() + 182 * 86_400_000);
      if (confirmed < today && ['EMP-006', 'EMP-008', 'EMP-012'].includes(e.employeeCode))
        events.push({ organizationId, employeeId: e.id, type: 'CONFIRMED', effectiveDate: confirmed, letterNo: letterNo(confirmed), createdById: hr.id, createdAt: confirmed });
    }
    if (e.employeeCode === 'EMP-005') {
      const on = day(-90);
      events.push({ organizationId, employeeId: e.id, type: 'PROMOTED', effectiveDate: on, letterNo: letterNo(on), fromDesignation: 'Foreman', toDesignation: e.designation, note: 'For running the embankment gang through the monsoon without a lost-time injury', createdById: hr.id, createdAt: on });
    }
    if (e.employeeCode === 'EMP-006') {
      const on = day(-200);
      events.push({ organizationId, employeeId: e.id, type: 'INCREMENT', effectiveDate: on, letterNo: letterNo(on), fromCtc: D(firstCtc), toCtc: D(ctc), note: 'Annual increment', createdById: hr.id, createdAt: on });
    }
    if (e.employeeCode === 'EMP-017' && firstProject !== e.projectId) {
      const on = day(-60);
      events.push({ organizationId, employeeId: e.id, type: 'TRANSFERRED', effectiveDate: on, letterNo: letterNo(on), fromProjectId: firstProject, toProjectId: e.projectId, note: 'To take charge of the structure works', createdById: hr.id, createdAt: on });
    }
  }
  // Letter numbers run in date order through each year.
  events.sort((a, b) => (a.effectiveDate as Date).getTime() - (b.effectiveDate as Date).getTime());
  letters.clear();
  for (const ev of events) ev.letterNo = letterNo(ev.effectiveDate as Date);
  await prisma.employeeEvent.createMany({ data: events });
}

/**
 * Payroll (v6 item 100) for the demo company, once: Odisha settings, a salary structure for everyone from their joining
 * (worked back from their CTC; the pump operator is under the ESI ceiling and the quantity surveyor is on the old tax
 * regime), a loan and a salary advance being recovered, and last month's salary run approved and paid.
 */
async function seedPayroll(organizationId: string) {
  if (await prisma.payrollSettings.findUnique({ where: { organizationId } })) return;
  const staff = await prisma.employee.findMany({ where: { organizationId, isActive: true }, orderBy: { employeeCode: 'asc' } });
  const [hr, md, accounts] = await Promise.all(['hr@demo.com', 'md@demo.com', 'accounts@demo.com'].map((email) => prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } })));
  if (!staff.length || !hr || !md || !accounts) return;
  await prisma.payrollSettings.create({ data: { organizationId, ptState: '21', debitAccountNo: '50200012345678', debitBankName: 'HDFC Bank' } });
  const st = DEFAULT_SETTINGS;
  const structures = new Map<string, { id: string; rules: RulesStructure }>();
  for (const e of staff) {
    const ctc = Number(e.ctcAnnual ?? 360000);
    const monthly = Math.round(ctc / 12);
    const basic = Math.round((monthly * 0.4) / 100) * 100;
    const hra = Math.round((basic * 0.5) / 100) * 100;
    const rules: RulesStructure = { basic, da: 0, hra, conveyance: 1600, special: 0, otherEarnings: 0, pf: true, esi: true, pt: true, taxRegime: e.employeeCode === 'EMP-009' ? 'OLD' : 'NEW', declaredDeductions: e.employeeCode === 'EMP-009' ? 150000 : 0, otherIncome: 0 };
    // The special allowance fills the rest, so gross plus the employer's PF and ESI comes to the CTC.
    rules.special = Math.max(0, monthly - basic - hra - 1600);
    const over = Math.round(structureCost(rules, st).ctcAnnual / 12) - monthly;
    rules.special = Math.max(0, rules.special - over);
    const from = e.joinedOn ?? new Date(Date.UTC(2024, 3, 1));
    const row = await prisma.salaryStructure.create({
      data: { organizationId, employeeId: e.id, effectiveFrom: from, createdById: hr.id, ...rules, note: 'From the appointment letter' },
    });
    structures.set(e.id, { id: row.id, rules });
    await prisma.employee.update({ where: { id: e.id }, data: { ctcAnnual: structureCost(rules, st).ctcAnnual } });
  }
  const now = new Date();
  const ym = (d: Date) => d.toISOString().slice(0, 7);
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const month = ym(last);
  const byCode = new Map(staff.map((e) => [e.employeeCode, e]));
  const loans = [
    { code: 'EMP-008', kind: 'LOAN' as const, amount: 30000, emi: 3000, note: 'Medical emergency' },
    { code: 'EMP-016', kind: 'ADVANCE' as const, amount: 10000, emi: 2500, note: 'Festival advance' },
  ];
  const loanIds = new Map<string, { id: string; kind: 'LOAN' | 'ADVANCE'; emi: number; balance: number }>();
  for (const l of loans) {
    const e = byCode.get(l.code);
    if (!e) continue;
    const row = await prisma.staffLoan.create({ data: { organizationId, employeeId: e.id, kind: l.kind, issuedOn: new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 3)), amount: l.amount, emi: l.emi, startMonth: month, note: l.note, createdById: hr.id } });
    loanIds.set(e.id, { id: row.id, kind: l.kind, emi: l.emi, balance: l.amount });
  }
  // Last month's run, approved by the MD and paid by accounts on the 1st.
  const calendarDays = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate();
  const run = await prisma.payrollRun.create({
    data: { organizationId, runNo: `SAL-${month}`, month, status: 'PAID', preparedById: hr.id, submittedAt: now, approvedById: md.id, approvedAt: now, paidById: accounts.id, paidOn: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), paymentRef: 'NEFT batch 1' },
  });
  const ORDER = Object.keys(PAYSLIP_CODES);
  const totals = { gross: 0, deductions: 0, net: 0, cost: 0 };
  for (const e of staff) {
    const s = structures.get(e.id)!;
    const joined = e.joinedOn ? e.joinedOn.toISOString().slice(0, 10) : null;
    if (joined && joined.slice(0, 7) > month) continue;
    const daysOnRolls = joined && joined.slice(0, 7) === month ? calendarDays - Number(joined.slice(8, 10)) + 1 : calendarDays;
    const loan = loanIds.get(e.id);
    const slip = computePayslip({ month, calendarDays, daysOnRolls, lopDays: e.employeeCode === 'EMP-020' ? 1 : 0, overtimeHours: e.employeeCode === 'EMP-016' ? 6 : 0, structure: s.rules, settings: st, gender: e.gender, loans: loan ? [loan] : [] });
    await prisma.payslip.create({
      data: {
        organizationId, runId: run.id, employeeId: e.id, structureId: s.id, employeeCode: e.employeeCode, employeeName: e.fullName, designation: e.designation,
        projectName: e.projectId ? (await prisma.project.findUnique({ where: { id: e.projectId }, select: { name: true } }))?.name ?? null : null,
        pan: e.pan, uan: e.uan, esiNumber: e.esiNumber, bankName: e.bankName, bankAccountNo: e.bankAccountNo, bankIfsc: e.bankIfsc,
        monthDays: slip.monthDays, paidDays: slip.paidDays, lopDays: slip.lopDays, overtimeHours: e.employeeCode === 'EMP-016' ? 6 : 0,
        gross: slip.gross, deductions: slip.deductions, net: slip.net, employerCost: slip.employerCost, pfWages: slip.pfWages, esiWages: slip.esiWages,
        lines: { create: slip.lines.map((l) => ({ organizationId, kind: l.kind, code: l.code, label: l.label, amount: l.amount, loanId: l.loanId ?? null, sortOrder: ORDER.indexOf(l.code) })) },
      },
    });
    totals.gross += slip.gross;
    totals.deductions += slip.deductions;
    totals.net += slip.net;
    totals.cost += slip.gross + slip.employerCost;
  }
  await prisma.payrollRun.update({ where: { id: run.id }, data: { gross: totals.gross, deductions: totals.deductions, net: totals.net, employerCost: totals.cost } });
}

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

/**
 * Biometric attendance (v6 item 101): a ZKTeco gate terminal (ADMS) at the site where the workers are, a face reader at
 * head office posting to the webhook, and an old eSSL at the yard whose punch files are imported. Staff are enrolled
 * under their code number and five workers under 1001 onwards; two numbers punched yesterday are not matched yet.
 */
/**
 * Books (v6 item 102): the promoters' capital into the bank, office rent paid and cash drawn for the sites, approved, and
 * the office electricity bill waiting for the MD. The modules' own vouchers are posted the first time someone opens the books.
 */
async function seedBooks(organizationId: string) {
  if (await prisma.bookVoucher.count({ where: { organizationId, source: 'MANUAL' } })) return;
  const [accounts, md] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId, email: 'accounts@demo.com' }, select: { id: true } }),
    prisma.user.findFirst({ where: { organizationId, email: 'md@demo.com' }, select: { id: true } }),
  ]);
  if (!accounts || !md) return;
  const account = (key: string, name: string, group: 'BANK_ACCOUNTS' | 'CASH_IN_HAND' | 'CAPITAL_ACCOUNT' | 'INDIRECT_EXPENSES', isSystem: boolean) =>
    prisma.ledgerAccount.upsert({ where: { organizationId_key: { organizationId, key } }, create: { organizationId, key, name, group, isSystem }, update: {}, select: { id: true } });
  const bank = await account('BANK', 'Bank Account', 'BANK_ACCOUNTS', true);
  const cash = await account('CASH', 'Cash', 'CASH_IN_HAND', true);
  const capital = await account('ACCOUNT:demo-capital', 'Capital - Promoters', 'CAPITAL_ACCOUNT', false);
  const rent = await account('ACCOUNT:demo-office-rent', 'Office Rent', 'INDIRECT_EXPENSES', false);
  const fy = (d: Date) => {
    const y = d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0);
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  };
  const voucher = async (no: string, type: 'RECEIPT' | 'PAYMENT' | 'CONTRA', date: Date, narration: string, amount: number, dr: string, cr: string, approved: boolean, reference: string | null, seq = 1) =>
    prisma.bookVoucher.create({
      data: {
        organizationId,
        voucherNo: `${no}/${fy(date)}/${String(seq).padStart(4, '0')}`,
        type,
        date,
        source: 'MANUAL',
        reference,
        narration,
        amount,
        status: approved ? 'APPROVED' : 'SUBMITTED',
        preparedById: accounts.id,
        submittedAt: new Date(),
        ...(approved ? { approvedById: md.id, approvedAt: new Date() } : {}),
        lines: {
          createMany: {
            data: [
              { organizationId, accountId: dr, debit: amount, sortOrder: 0 },
              { organizationId, accountId: cr, credit: amount, sortOrder: 1 },
            ],
          },
        },
      },
    });
  await voucher('RV', 'RECEIPT', day(-40), "Promoters' capital brought in", 5_000_000, bank.id, capital.id, true, 'NEFT HDFC0001234');
  await voucher('PV', 'PAYMENT', day(-20), 'Head office rent for the month', 85_000, rent.id, bank.id, true, 'CHQ 104522');
  await voucher('CV', 'CONTRA', day(-30), 'Cash drawn for site expenses', 200_000, cash.id, bank.id, true, 'Self cheque 104530');
  const power = await account('ACCOUNT:demo-office-power', 'Office Electricity', 'INDIRECT_EXPENSES', false);
  await voucher('PV', 'PAYMENT', day(-1), 'Head office electricity bill', 12_400, power.id, bank.id, false, 'TPCODL 7781', 2);
}

/** The books begin on 1 April before the demo's records, with the balances brought in from the old books (v6 item 103). */
async function seedOpening(organizationId: string) {
  if (await prisma.bookVoucher.count({ where: { organizationId, source: 'OPENING' } })) return;
  const accounts = await prisma.user.findFirst({ where: { organizationId, email: 'accounts@demo.com' }, select: { id: true } });
  if (!accounts) return;
  const back = day(-60);
  const start = new Date(Date.UTC(back.getUTCFullYear() - (back.getUTCMonth() < 3 ? 1 : 0), 3, 1));
  const openingDay = new Date(start.getTime() - 86_400_000);
  const account = (key: string, name: string, group: 'BANK_ACCOUNTS' | 'CAPITAL_ACCOUNT' | 'FIXED_ASSETS' | 'SECURED_LOANS' | 'DEPOSITS_ASSET' | 'RESERVES_SURPLUS', isSystem: boolean) =>
    prisma.ledgerAccount.upsert({ where: { organizationId_key: { organizationId, key } }, create: { organizationId, key, name, group, isSystem }, update: {}, select: { id: true } });
  const lines: [{ id: string }, number, number][] = [
    [await account('ACCOUNT:demo-plant', 'Plant and Machinery', 'FIXED_ASSETS', false), 4_200_000, 0],
    [await account('BANK', 'Bank Account', 'BANK_ACCOUNTS', true), 650_000, 0],
    [await account('ACCOUNT:demo-deposits', 'Security Deposits (EMD and Utilities)', 'DEPOSITS_ASSET', false), 300_000, 0],
    [await account('ACCOUNT:demo-capital', 'Capital - Promoters', 'CAPITAL_ACCOUNT', false), 0, 2_500_000],
    [await account('ACCOUNT:demo-term-loan', 'Term Loan - State Bank of India', 'SECURED_LOANS', false), 0, 1_800_000],
    [await account('PROFIT_AND_LOSS', 'Profit & Loss A/c', 'RESERVES_SURPLUS', true), 0, 850_000],
  ];
  await prisma.booksState.upsert({ where: { organizationId }, create: { organizationId, booksFrom: start }, update: { booksFrom: start } });
  await prisma.bookVoucher.create({
    data: {
      organizationId,
      voucherNo: 'Opening',
      type: 'JOURNAL',
      date: openingDay,
      source: 'OPENING',
      narration: `Balances brought in as on ${openingDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
      amount: 5_150_000,
      status: 'APPROVED',
      preparedById: accounts.id,
      approvedById: accounts.id,
      approvedAt: new Date(),
      lines: { createMany: { data: lines.map(([a, debit, credit], i) => ({ organizationId, accountId: a.id, debit, credit, sortOrder: i })) } },
    },
  });
}

async function seedBiometric(organizationId: string) {
  if (await prisma.biometricDevice.count({ where: { organizationId } })) return;
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { code: true } });
  const hr = await prisma.user.findFirst({ where: { organizationId, email: 'hr@demo.com' }, select: { id: true } });
  const worker = await prisma.worker.findFirst({ where: { organizationId, isActive: true, projectId: { not: null } }, select: { projectId: true } });
  if (!org || !hr || !worker?.projectId) return;
  const tag = org.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  const gate = await prisma.biometricDevice.create({
    data: { organizationId, name: 'Gate terminal', model: 'ZKTeco K40', protocol: 'ADMS', serialNo: `ZK${tag}0001`, projectId: worker.projectId, createdById: hr.id, lastSeenAt: new Date() },
  });
  await prisma.biometricDevice.create({ data: { organizationId, name: 'Head office face reader', model: 'eSSL F22', protocol: 'WEBHOOK', apiKey: `bio_demo_${tag.toLowerCase()}_headoffice`, createdById: hr.id } });
  await prisma.biometricDevice.create({ data: { organizationId, name: 'Yard terminal', model: 'eSSL X990', protocol: 'FILE', createdById: hr.id } });
  const staff = await prisma.employee.findMany({ where: { organizationId, isActive: true, employeeCode: { in: ['EMP-001', 'EMP-002', 'EMP-003', 'EMP-004', 'EMP-005', 'EMP-009', 'EMP-010', 'EMP-011', 'EMP-012'] } }, select: { id: true, employeeCode: true } });
  const workers = await prisma.worker.findMany({ where: { organizationId, isActive: true, projectId: worker.projectId }, orderBy: { workerNo: 'asc' }, take: 5, select: { id: true } });
  await prisma.biometricUser.createMany({
    data: [
      ...staff.map((e) => ({ organizationId, pin: String(Number(e.employeeCode.slice(4))), employeeId: e.id })),
      ...workers.map((w, i) => ({ organizationId, pin: String(1001 + i), workerId: w.id })),
    ],
  });
  const y = day(-1);
  const at = (h: number, m: number) => new Date(y.getTime() + (h * 60 + m - 330) * 60_000);
  const t = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  await prisma.biometricPunch.createMany({
    data: [
      [31, 8, 52],
      [31, 18, 5],
      [1099, 7, 58],
    ].map(([pin, h, m]) => ({ organizationId, deviceId: gate.id, pin: String(pin), punchedAt: at(h, m), date: y, time: t(h, m), result: 'UNMATCHED' as const })),
  });
  await prisma.biometricDevice.update({ where: { id: gate.id }, data: { lastPunchAt: at(18, 5) } });
}

/**
 * RMC (v6 item 104): a batching plant at Patia run as a project of type PLANT, with its store's opening stock and a
 * cement delivery, three mix designs (M30 still waiting for quality), an order from a builder that has had trucks for
 * three days (the first day's challans billed and part paid, cubes taken from one), the plant supplying the hospital
 * site, and a quote not yet accepted.
 */
async function seedRmc(organizationId: string) {
  if (await prisma.project.count({ where: { organizationId, type: 'PLANT' } })) return;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  const [pm, store, qa, accounts, md, engineer] = await Promise.all(['pm@demo.com', 'store@demo.com', 'qaqc@demo.com', 'accounts@demo.com', 'md@demo.com', 'engineer@demo.com'].map(user));
  if (!pm || !store || !qa || !accounts || !md || !engineer) return;
  const hospital = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, select: { id: true } });
  const year = new Date().getUTCFullYear();
  const no = (prefix: string, n: number) => `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  const plant = await prisma.project.create({
    data: {
      organizationId, code: 'RMC-01', name: 'Patia RMC Plant (60 m³/h)', type: 'PLANT', status: 'ACTIVE', location: 'Patia, Bhubaneswar', startDate: day(-400), projectManagerId: pm,
      description: 'Batching plant selling ready-mix concrete to builders and supplying our own sites',
      members: { create: [store, qa, engineer].map((userId) => ({ userId })) },
    },
  });
  const item = async (name: string, unit: string, rate: string) =>
    (await prisma.item.findFirst({ where: { organizationId, name, unit } })) ?? prisma.item.create({ data: { organizationId, name, unit, rate: D(rate) } });
  const cement = await item('OPC 53 Grade Cement', 'Bags', '395.00');
  const sand = await item('River Sand (Zone II)', 'Cum', '1600.00');
  const agg20 = await item('Aggregate 20mm', 'Cum', '1350.00');
  const agg10 = await item('Aggregate 10mm', 'Cum', '1250.00');
  const admix = await item('Admixture PCE (Master Glenium)', 'Kg', '145.00');
  const mats = [cement, sand, agg20, agg10, admix];

  // Stock: opening count, then a cement delivery
  let stockNo = { ADJ: 0, GRN: 0, ISS: 0 };
  const lastNo = async (prefix: 'ADJ' | 'GRN' | 'ISS') => {
    const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
    return last ? parseInt(last.entryNo.slice(prefix.length + 6), 10) : 0;
  };
  stockNo = { ADJ: await lastNo('ADJ'), GRN: await lastNo('GRN'), ISS: await lastNo('ISS') };
  const stockEntry = async (type: 'ADJUSTMENT' | 'RECEIPT' | 'ISSUE', offset: number, by: string, data: Partial<Prisma.StockEntryUncheckedCreateInput>, lines: [string, Prisma.Decimal][]) => {
    const prefix = type === 'ADJUSTMENT' ? 'ADJ' : type === 'RECEIPT' ? 'GRN' : 'ISS';
    stockNo[prefix] += 1;
    return prisma.stockEntry.create({
      data: {
        organizationId, projectId: plant.id, type, entryNo: no(prefix, stockNo[prefix]), date: day(offset), createdById: by, createdAt: day(offset), ...data,
        lines: { create: lines.map(([itemId, quantity], i) => ({ organizationId, projectId: plant.id, itemId, type, date: day(offset), quantity, sortOrder: i })) },
      },
    });
  };
  await stockEntry('ADJUSTMENT', -20, pm, { remarks: 'Opening stock as per physical count at the plant' }, [[cement.id, D(2400)], [sand.id, D(140)], [agg20.id, D(160)], [agg10.id, D(100)], [admix.id, D(900)]]);
  await stockEntry('RECEIPT', -5, store, { supplier: 'Utkal Cement Traders', challanNo: 'UCT-5520', vehicleNo: 'OD-02-BT-7781' }, [[cement.id, D(800)]]);
  for (const [m, min] of [[cement, 600], [sand, 40], [agg20, 40], [agg10, 30]] as const) await prisma.stockMinLevel.create({ data: { organizationId, projectId: plant.id, itemId: m.id, minQty: D(min), updatedById: pm } });

  // Mix designs, per cubic metre: cement bags, sand, 20 mm, 10 mm, admixture kg
  const design = async (code: string, grade: string, slumpMm: number, qty: number[], approved: boolean) =>
    prisma.mixDesign.create({
      data: {
        organizationId, plantId: plant.id, code, grade, slumpMm, description: `${grade} with OPC 53, pumpable`, status: approved ? 'APPROVED' : 'DRAFT', createdById: engineer,
        ...(approved ? { approvedById: qa, approvedAt: day(-30) } : {}), createdAt: day(approved ? -32 : -1),
        lines: { create: qty.map((q, i) => ({ organizationId, itemId: mats[i].id, quantity: D(q), sortOrder: i })) },
      },
      include: { lines: true },
    });
  const m20 = await design('M20-OPC-01', 'M20', 100, [6.6, 0.48, 0.54, 0.34, 2.6], true);
  const m25 = await design('M25-OPC-01', 'M25', 120, [7.6, 0.45, 0.52, 0.33, 3.2], true);
  await design('M30-OPC-01', 'M30', 120, [8.4, 0.42, 0.5, 0.32, 3.8], false);

  const client = async (name: string, gstin: string, contact: string, phone: string) =>
    prisma.client.upsert({ where: { organizationId_name: { organizationId, name } }, update: {}, create: { organizationId, name, gstin, pan: gstin.slice(2, 12), stateCode: gstin.slice(0, 2), contactPerson: contact, phone, billingAddress: 'Bhubaneswar, Odisha' } });
  const sai = await client('Sai Developers Pvt Ltd', '21AAKCS4471M1Z3', 'R. Sahoo', '9437220011');
  const kalinga = await client('Kalinga Homes LLP', '21AAPFK9902Q1Z6', 'A. Behera', '9861440022');

  const order = (n: number, data: Omit<Prisma.RmcOrderUncheckedCreateInput, 'organizationId' | 'orderNo' | 'plantId' | 'createdById'>) =>
    prisma.rmcOrder.create({ data: { organizationId, orderNo: no('RMC', n), plantId: plant.id, createdById: pm, ...data } });
  const tower = await order(1, { date: day(-6), status: 'CONFIRMED', confirmedAt: day(-5), clientId: sai.id, site: 'Sai Residency Tower B raft, Patia', mixDesignId: m25.id, quantity: D(60), rate: D(5950), pumpRate: D(350), pourDate: day(0), notes: 'Pour in three days; pump at site from 7 am' });
  const own = hospital ? await order(2, { date: day(-3), status: 'CONFIRMED', confirmedAt: day(-3), projectId: hospital.id, site: 'Block B first-floor slab', mixDesignId: m20.id, quantity: D(30), rate: D(5300), pumpRate: null, pourDate: day(1) }) : null;
  await order(3, { date: day(-1), status: 'QUOTED', clientId: kalinga.id, site: 'Kalinga Greens villas, Khandagiri', mixDesignId: m25.id, quantity: D(40), rate: D(6050), pumpRate: D(350), validUntil: day(10), notes: 'Asked for M30 too; quote once quality approves the design' });

  // Trucks: each a batch, its challan and the materials issued from the plant's store
  let dc = 0;
  const truck = async (o: { id: string; orderNo: string }, d: typeof m25, offset: number, hour: number, m3: number, status: 'DELIVERED' | 'DISPATCHED', pumped: boolean, to: string, truckNo: string, receivedBy: string | null) => {
    dc += 1;
    const batchNo = no('DC', dc);
    const at = new Date(day(offset).getTime() + (hour - 5.5) * 3_600_000);
    const lines = d.lines.map((l, i) => {
      const designQty = l.quantity.mul(m3).toDecimalPlaces(3);
      // The weigh-bridge rarely agrees to the kilo: cement a touch over on the first truck of a day
      const actualQty = i === 0 && hour < 9 ? designQty.mul(1.012).toDecimalPlaces(3) : designQty;
      return { itemId: l.itemId, designQty, actualQty };
    });
    const entry = await stockEntry('ISSUE', offset, store, { issuedTo: `${batchNo} to ${to}`, remarks: `${m3} m³ ${d.grade} (${d.code}) on ${o.orderNo}, truck ${truckNo}`, createdAt: at }, lines.map((l) => [l.itemId, l.actualQty.neg()]));
    return prisma.rmcBatch.create({
      data: {
        organizationId, batchNo, plantId: plant.id, orderId: o.id, mixDesignId: d.id, date: day(offset), dispatchedAt: at, quantity: D(m3), truck: truckNo, driver: ['Bapi Das', 'Raju Nayak', 'Sibu Mallick'][dc % 3], pumped, slumpMm: d.slumpMm,
        status, deliveredAt: status === 'DELIVERED' ? new Date(at.getTime() + 50 * 60_000) : null, receivedBy, stockEntryId: entry.id, createdById: store, createdAt: at,
        lines: { create: lines.map((l) => ({ organizationId, ...l })) },
      },
    });
  };
  const sai2 = 'Sai Developers Pvt Ltd';
  const first = [];
  for (const [i, t] of ['OD-02-AX-1101', 'OD-02-AX-1102', 'OD-02-AX-1103'].entries()) first.push(await truck(tower, m25, -2, 8 + i, 6, 'DELIVERED', true, sai2, t, 'R. Sahoo, site engineer'));
  for (const [i, t] of ['OD-02-AX-1101', 'OD-02-AX-1102'].entries()) await truck(tower, m25, -1, 8 + i * 2, 6, 'DELIVERED', true, sai2, t, 'R. Sahoo, site engineer');
  if (own && hospital) await truck(own, m20, -1, 13, 6, 'DELIVERED', false, 'Own site: District Hospital Block B', 'OD-02-AX-1103', 'Site engineer, Block B');
  await truck(tower, m25, 0, 7, 6, 'DELIVERED', true, sai2, 'OD-02-AX-1101', 'R. Sahoo, site engineer');
  await truck(tower, m25, 0, 9, 6, 'DISPATCHED', true, sai2, 'OD-02-AX-1102', null);

  // Cubes from the first truck, cast at the plant
  const lastTest = await prisma.qualityTest.findFirst({ where: { organizationId, testNo: { startsWith: `TST-${year}-` } }, orderBy: { testNo: 'desc' }, select: { testNo: true } });
  const testNo = no('TST', (lastTest ? parseInt(lastTest.testNo.slice(9), 10) : 0) + 1);
  await prisma.qualityTest.create({
    data: {
      organizationId, projectId: plant.id, testNo, kind: 'CONCRETE_CUBE', title: `M25 cubes, ${first[0].batchNo} to ${sai2}`, location: 'Sai Residency Tower B raft, Patia', sampledOn: day(-2), specification: 'Not less than 25 N/mm² at 28 days',
      unit: 'N/mm²', specMin: D(25), result: 'PENDING', createdById: qa, rmcBatchId: first[0].id,
      readings: { create: [{ label: '7 days', dueOn: day(5), sortOrder: 0 }, { label: '28 days', dueOn: day(26), sortOrder: 1 }] },
    },
  });

  // The first day's challans billed, and part of it paid
  const qty = D(18);
  const concrete = qty.mul(5950);
  const pumping = qty.mul(350);
  const taxable = concrete.add(pumping);
  const gst = taxable.mul(18).div(100).toDecimalPlaces(2);
  const cgst = gst.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const invoice = await prisma.rmcInvoice.create({
    data: { organizationId, invoiceNo: no('RINV', 1), plantId: plant.id, clientId: sai.id, orderId: tower.id, date: day(-1), quantity: qty, concrete, pumping, taxable, cgst, sgst: gst.sub(cgst), igst: D(0), total: taxable.add(gst), createdById: accounts, createdAt: day(-1) },
  });
  await prisma.rmcBatch.updateMany({ where: { id: { in: first.map((b) => b.id) } }, data: { invoiceId: invoice.id } });
  await prisma.rmcReceipt.create({ data: { organizationId, clientId: sai.id, invoiceId: invoice.id, date: day(0), amount: D(75000), mode: 'BANK', reference: 'NEFT UTR SBIN226104471', createdById: accounts } });
}

/**
 * The supplier portal (v6 item 105): supplier@demo.com is Kalinga Bitumen & Aggregates' login. Their road PO waits for
 * them to accept it; a dispatch note for part of what is left is on the way, so the store can fill a GRN from it; an
 * invoice waits with accounts; and they asked for their bank account to change. Only once per organisation.
 */
async function seedSupplierPortal(organizationId: string) {
  const vendor = await prisma.vendor.findFirst({ where: { organizationId, name: 'Kalinga Bitumen & Aggregates' } });
  const login = await prisma.user.findFirst({ where: { organizationId, email: 'supplier@demo.com' } });
  if (!vendor || !login) return;
  await prisma.user.update({ where: { id: login.id }, data: { vendorId: vendor.id } });
  if ((await prisma.supplierDispatch.count({ where: { organizationId } })) > 0) return;
  const po = await prisma.purchaseOrder.findFirst({
    where: { organizationId, vendorId: vendor.id, status: 'APPROVED' },
    include: { lines: { orderBy: { sortOrder: 'asc' }, include: { stockTxns: { select: { quantity: true } } } } },
    orderBy: { poDate: 'asc' },
  });
  if (!po) return;
  const left = po.lines
    .map((l) => ({ line: l, left: l.quantity.sub(l.stockTxns.reduce((t, x) => t.add(x.quantity), D(0))) }))
    .filter((x) => x.left.gt(0));
  if (left.length) {
    await prisma.supplierDispatch.create({
      data: {
        organizationId, vendorId: vendor.id, purchaseOrderId: po.id, dispatchNo: 'KBA/DC/0412', date: day(0), vehicleNo: 'OD02AB1234', transporter: 'Own truck',
        remarks: 'First lot; the rest follows when the plant restarts', createdById: login.id, createdAt: day(0),
        lines: { create: left.slice(0, 1).map((x) => ({ organizationId, purchaseOrderLineId: x.line.id, quantity: x.left.div(2).toDecimalPlaces(3) })) },
      },
    });
  }
  const invoiceLine = po.lines[po.lines.length - 1];
  const received = invoiceLine.stockTxns.reduce((t, x) => t.add(x.quantity), D(0));
  const amount = received.mul(invoiceLine.rate).mul(D(1).add(invoiceLine.gstRate.div(100))).toDecimalPlaces(2);
  if (amount.gt(0)) {
    const inv = await prisma.supplierInvoice.create({
      data: {
        organizationId, vendorId: vendor.id, purchaseOrderId: po.id, invoiceNo: 'KBA/2026/0388', invoiceDate: day(-1), amount, gstAmount: amount.sub(received.mul(invoiceLine.rate)).toDecimalPlaces(2),
        notes: `${invoiceLine.itemName} received at site`, createdById: login.id, createdAt: day(-1),
      },
    });
    const file = new Uint8Array(billImage());
    await prisma.attachment.create({
      data: { organizationId, fileName: 'KBA-2026-0388.png', mimeType: 'image/png', size: file.length, storagePath: 'db:seed/KBA-2026-0388.png', data: file, uploadedById: login.id, supplierInvoiceId: inv.id, createdAt: day(-1) },
    });
  }
  await prisma.supplierChangeRequest.create({
    data: {
      organizationId, vendorId: vendor.id, createdById: login.id, createdAt: day(-1), note: 'We moved our account to the Bhubaneswar branch',
      changes: { bankAccountNo: '39281726999', bankIfsc: 'SBIN0000052', bankName: 'State Bank of India, Bhubaneswar Main' },
      previous: { bankAccountNo: vendor.bankAccountNo, bankIfsc: vendor.bankIfsc, bankName: vendor.bankName },
    },
  });
}

/**
 * Central store (v6 item 106): the company's store at Khordha, a project of type STORE kept by the store manager, with
 * its opening stock, a cement delivery, cement sent to the highway and received there, steel on the road to the hospital,
 * and shuttering plywood the hospital sent back that has not arrived yet.
 */
async function seedCentralStore(organizationId: string) {
  if (await prisma.project.count({ where: { organizationId, type: 'STORE' } })) return;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  // Run by the MD's office, not a site's project manager.
  const [pm, store] = await Promise.all(['md@demo.com', 'store@demo.com'].map(user));
  const road = await prisma.project.findFirst({ where: { organizationId, code: 'RD-2026-01' }, select: { id: true, name: true } });
  const hospital = await prisma.project.findFirst({ where: { organizationId, type: 'BUILDING' }, select: { id: true, name: true } });
  if (!pm || !store || !road || !hospital) return;
  const year = new Date().getUTCFullYear();
  const cs = await prisma.project.create({
    data: {
      organizationId, code: 'CS-01', name: 'Khordha Central Store', type: 'STORE', status: 'ACTIVE', location: 'NH-16 yard, Khordha', startDate: day(-200), projectManagerId: pm,
      description: 'Company store and yard: bulk cement, steel and shuttering held for the sites',
      members: { create: [{ userId: store }] },
    },
  });
  const item = async (name: string, unit: string, rate: string) =>
    (await prisma.item.findFirst({ where: { organizationId, name, unit } })) ?? prisma.item.create({ data: { organizationId, name, unit, rate: D(rate) } });
  const cement = await item('OPC 53 Grade Cement', 'Bags', '395.00');
  const steel = await item('TMT Fe500D 12mm', 'MT', '61500.00');
  const wire = await item('Binding wire', 'Kg', '78.00');
  const ply = await item('Shuttering plywood 12mm', 'Nos', '1450.00');
  const last: Record<string, number> = {};
  const nextNo = async (prefix: string) => {
    if (last[prefix] === undefined) {
      const row = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
      last[prefix] = row ? parseInt(row.entryNo.slice(prefix.length + 6), 10) : 0;
    }
    last[prefix] += 1;
    return `${prefix}-${year}-${String(last[prefix]).padStart(4, '0')}`;
  };
  const PREFIX = { ADJUSTMENT: 'ADJ', RECEIPT: 'GRN', TRANSFER_OUT: 'TRO', TRANSFER_IN: 'TRI' } as const;
  const entry = async (type: keyof typeof PREFIX, projectId: string, offset: number, by: string, data: Partial<Prisma.StockEntryUncheckedCreateInput>, lines: [string, Prisma.Decimal][]) =>
    prisma.stockEntry.create({
      data: {
        organizationId, projectId, type, entryNo: await nextNo(PREFIX[type]), date: day(offset), createdById: by, createdAt: day(offset), ...data,
        lines: { create: lines.map(([itemId, quantity], i) => ({ organizationId, projectId, itemId, type, date: day(offset), quantity, sortOrder: i })) },
      },
    });
  await entry('ADJUSTMENT', cs.id, -60, pm, { remarks: 'Opening stock as per physical count at the yard' }, [[cement.id, D(1200)], [steel.id, D(24)], [wire.id, D(600)], [ply.id, D(180)]]);
  await entry('RECEIPT', cs.id, -10, store, { supplier: 'Utkal Cement Traders', challanNo: 'UCT-5491', vehicleNo: 'OD-02-BT-7781' }, [[cement.id, D(600)]]);
  for (const [m, min] of [[cement, 400], [steel, 8], [wire, 150]] as const) await prisma.stockMinLevel.create({ data: { organizationId, projectId: cs.id, itemId: m.id, minQty: D(min), updatedById: pm } });
  // Cement to the highway, received there the next day
  const toRoad = await entry('TRANSFER_OUT', cs.id, -4, store, { toProjectId: road.id, issuedTo: road.name, vehicleNo: 'OD-02-AK-4410', remarks: 'For the culvert at Km 18' }, [[cement.id, D(-200)]]);
  await entry('TRANSFER_IN', road.id, -3, store, { transferOutId: toRoad.id, supplier: cs.name, vehicleNo: 'OD-02-AK-4410' }, [[cement.id, D(200)]]);
  // Steel on the road to the hospital, not received yet
  await entry('TRANSFER_OUT', cs.id, -1, store, { toProjectId: hospital.id, issuedTo: hospital.name, vehicleNo: 'OD-05-C-2290', challanNo: 'CS/DC/0031', remarks: 'Block B second-floor slab' }, [[steel.id, D(-5)], [wire.id, D(-80)]]);
  // Plywood the hospital no longer needs, on its way back to the yard
  await entry('TRANSFER_OUT', hospital.id, 0, store, { toProjectId: cs.id, issuedTo: cs.name, vehicleNo: 'OD-05-C-2290', remarks: 'Spare after the first-floor slab' }, [[ply.id, D(-30)]]);
}

/**
 * Site fund requests demo (v6 item 107): the highway's engineer asked head office for ₹40,000 of wages money into
 * their imprest, approved by the MD and released; and now asks ₹25,000 to be paid on account to a petty contractor
 * for the culvert headwalls, on behalf of the highway from the water supply scheme, waiting for approval. Only when
 * the organisation has no fund request yet.
 */
async function seedFundRequests(organizationId: string) {
  if (await prisma.paymentRequest.count({ where: { organizationId, kind: 'FUND_REQUEST' } })) return;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  const [engineer, md, accounts] = await Promise.all(['engineer@demo.com', 'md@demo.com', 'accounts@demo.com'].map(user));
  const road = await prisma.project.findFirst({ where: { organizationId, code: 'RD-2026-01' }, select: { id: true } });
  const water = await prisma.project.findFirst({ where: { organizationId, type: 'WATER_SUPPLY' }, orderBy: { code: 'asc' }, select: { id: true } });
  if (!engineer || !md || !accounts || !road) return;
  const imprest = await prisma.imprest.findFirst({ where: { organizationId, projectId: road.id, holderId: engineer, isActive: true } });
  if (!imprest) return;
  const name = 'Maa Tarini Labour Group';
  const petty =
    (await prisma.vendor.findFirst({ where: { organizationId, name } })) ??
    (await prisma.vendor.create({ data: { organizationId, name, kinds: ['LABOUR_CONTRACTOR'], pan: 'ABCPT6621K', stateCode: '21', contactPerson: 'Bhagaban Sethi', phone: '9437265510', address: 'Pipili, Puri' } }));
  const year = new Date().getUTCFullYear();
  const last = await prisma.paymentRequest.findFirst({ where: { organizationId, requestNo: { startsWith: `PR-${year}-` } }, orderBy: { requestNo: 'desc' }, select: { requestNo: true } });
  let n = last ? parseInt(last.requestNo.slice(8), 10) : 0;
  const no = () => `PR-${year}-${String(++n).padStart(4, '0')}`;

  const wages = await prisma.paymentRequest.create({
    data: {
      organizationId, projectId: road.id, imprestId: imprest.id, requestNo: no(), kind: 'FUND_REQUEST', purpose: 'WAGES', amount: D('40000'), mode: 'BANK', neededBy: day(-6),
      reason: 'Weekly wages of the local helpers on the WMM stretch', paidAmount: D('40000'), paidDate: day(-6),
      status: 'APPROVED', submittedById: engineer, submittedAt: day(-8), reviewedById: md, reviewedAt: day(-7), createdAt: day(-8),
    },
  });
  await prisma.imprestEntry.create({
    data: {
      organizationId, imprestId: imprest.id, kind: 'ADVANCE', status: 'PAID', amount: D('40000'), date: day(-6), paidOn: day(-6), paymentMode: 'BANK', reference: 'NEFT 0977',
      reason: `${wages.requestNo}: wages, weekly wages of the local helpers on the WMM stretch`, requestedById: engineer, decidedById: accounts, decidedAt: day(-6), paymentRequestId: wages.id, createdAt: day(-6),
    },
  });
  const onAccount = await prisma.paymentRequest.create({
    data: {
      organizationId, projectId: road.id, raisedAtProjectId: water?.id ?? null, vendorId: petty.id, requestNo: no(), kind: 'FUND_REQUEST', purpose: 'PETTY_CONTRACTOR', amount: D('25000'), mode: 'BANK', neededBy: day(2),
      reason: 'Advance for the culvert headwall masonry gang; adjusted in their bill at month end', status: 'SUBMITTED', submittedById: engineer, submittedAt: day(-1), createdAt: day(-1),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { organizationId, entityType: 'PAYMENT_REQUEST', entityId: wages.id, action: 'CREATED', actorId: engineer, createdAt: day(-8) },
      { organizationId, entityType: 'PAYMENT_REQUEST', entityId: wages.id, action: 'SUBMITTED', actorId: engineer, createdAt: day(-8) },
      { organizationId, entityType: 'PAYMENT_REQUEST', entityId: wages.id, action: 'APPROVED', actorId: md, createdAt: day(-7) },
      { organizationId, entityType: 'PAYMENT_REQUEST', entityId: wages.id, action: 'PAYMENT_MADE', actorId: accounts, note: "₹40000.00 released into the imprest (NEFT 0977)", createdAt: day(-6) },
      { organizationId, entityType: 'PAYMENT_REQUEST', entityId: onAccount.id, action: 'CREATED', actorId: engineer, createdAt: day(-1) },
      { organizationId, entityType: 'PAYMENT_REQUEST', entityId: onAccount.id, action: 'SUBMITTED', actorId: engineer, createdAt: day(-1) },
    ],
  });
}

/**
 * Machine finance (v6 item 108): an excavator on a 48-month HDFC Bank loan, paid up to two months ago with last month's
 * EMI unpaid (so the watch list and the reminders have one overdue), and the road project's tipper on a Tata Capital
 * loan into the bank, every EMI paid and the next falling due within the week.
 */
async function seedMachineLoans(organizationId: string) {
  if (await prisma.equipmentLoan.count({ where: { organizationId } })) return;
  const accounts = (await prisma.user.findFirst({ where: { organizationId, email: 'accounts@demo.com' }, select: { id: true } }))?.id;
  const excavator = await prisma.equipment.findFirst({ where: { organizationId, ownership: 'OWNED', category: 'Earthmoving' }, orderBy: { code: 'asc' }, select: { id: true } });
  const tipper = await prisma.equipment.findFirst({ where: { organizationId, code: 'TIP-07' }, select: { id: true } });
  if (!accounts) return;
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const loans = [
    { equipmentId: excavator?.id, lenderName: 'HDFC Bank', loanNo: 'CEL-55102938', amount: 3_800_000, ratePct: 9.25, tenureMonths: 48, sanction: -430, firstDue: [-17, -13], paidUpTo: -30, disbursal: 'MACHINE_COST' as const, note: 'Hypothecated to HDFC Bank; NACH from the current account' },
    { equipmentId: tipper?.id, lenderName: 'Tata Capital', loanNo: 'TCL-EQ-778120', amount: 2_400_000, ratePct: 10.5, tenureMonths: 36, sanction: -150, firstDue: [3, -4], paidUpTo: -1, disbursal: 'BANK' as const, note: 'Loan against the tipper, credited to the current account' },
  ];
  for (const l of loans) {
    if (!l.equipmentId) continue;
    // [days, months]: the HDFC loan's EMI fell due 17 days ago (unpaid), the tipper's falls due in 3 days.
    const first = new Date(`${addMonths(ymd(day(l.firstDue[0])), l.firstDue[1])}T00:00:00Z`);
    const rows = loanSchedule({ amount: l.amount, ratePct: l.ratePct, tenureMonths: l.tenureMonths, firstEmiDate: ymd(first) });
    const loan = await prisma.equipmentLoan.create({
      data: {
        organizationId, equipmentId: l.equipmentId, lenderName: l.lenderName, loanNo: l.loanNo, sanctionDate: day(l.sanction), amount: D(l.amount), ratePct: D(l.ratePct), tenureMonths: l.tenureMonths,
        emi: rows[0].emi, firstEmiDate: first, disbursal: l.disbursal, note: l.note, createdById: accounts, createdAt: day(l.sanction),
      },
    });
    const paidUpTo = ymd(day(l.paidUpTo));
    await prisma.loanEmi.createMany({
      data: rows.map((r) => ({
        organizationId, loanId: loan.id, no: r.no, dueDate: new Date(`${r.dueDate}T00:00:00Z`), opening: r.opening, principal: r.principal, interest: r.interest, emi: r.emi, closing: r.closing,
        ...(r.dueDate <= paidUpTo ? { paidOn: new Date(`${r.dueDate}T00:00:00Z`), mode: 'BANK' as const, reference: `NACH ${r.dueDate.replace(/-/g, '').slice(2)}`, paidById: accounts } : {}),
      })),
    });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'EQUIPMENT_LOAN', entityId: loan.id, action: 'CREATED', actorId: accounts, createdAt: day(l.sanction) } });
    // A loan older than the books comes in with the opening balances: what it owed then, against the plant it bought.
    const st = await prisma.booksState.findUnique({ where: { organizationId } });
    const opening = await prisma.bookVoucher.findFirst({ where: { organizationId, source: 'OPENING' }, include: { lines: { select: { sortOrder: true } } } });
    const plant = await prisma.ledgerAccount.findFirst({ where: { organizationId, key: 'ACCOUNT:demo-plant' }, select: { id: true } });
    if (st?.booksFrom && loan.sanctionDate < st.booksFrom && opening && plant) {
      const from = ymd(st.booksFrom);
      const before = rows.filter((r) => r.dueDate < from);
      const owed = before.length ? before[before.length - 1].closing : D(l.amount);
      const ledger = await prisma.ledgerAccount.create({ data: { organizationId, key: `LOAN:${loan.id}`, name: `${l.lenderName} Loan ${l.loanNo}`, group: 'SECURED_LOANS', isSystem: true } });
      const order = Math.max(0, ...opening.lines.map((x) => x.sortOrder)) + 1;
      await prisma.bookLine.createMany({
        data: [
          { organizationId, voucherId: opening.id, accountId: plant.id, debit: owed, sortOrder: order },
          { organizationId, voucherId: opening.id, accountId: ledger.id, credit: owed, sortOrder: order + 1 },
        ],
      });
      await prisma.bookVoucher.update({ where: { id: opening.id }, data: { amount: opening.amount.add(owed) } });
    }
  }
}

/**
 * Tender bidding (v6 item 110): a demo schedule of rates (made-up figures in the shape of a state SOR), a road tender
 * being priced, a hospital building whose bids are opened with us lowest, a water supply tender lost at L2 with its EMD
 * still to come back, and one not bid.
 */
async function seedTenders(organizationId: string) {
  if (await prisma.tender.count({ where: { organizationId } })) return;
  const qs = (await prisma.user.findFirst({ where: { organizationId, email: 'qs@demo.com' }, select: { id: true } })) ?? (await prisma.user.findFirst({ where: { organizationId, email: 'admin@demo.com' }, select: { id: true } }));
  if (!qs) return;
  const book = await prisma.sorBook.create({ data: { organizationId, name: 'Odisha SOR 2024-25 (demo)', kind: 'STATE', edition: '2024-25', region: 'Odisha, Works Department', note: 'Demo figures in the shape of a state schedule; import the real one from Excel.', createdById: qs.id } });
  await prisma.sorBook.create({ data: { organizationId, name: 'Own rates 2026', kind: 'OWN', edition: '2026', note: 'Our rates for private work', createdById: qs.id } });
  const sor: [string, string, string, string, number][] = [
    ['2.1', 'Earthwork', 'Earthwork in excavation by mechanical means in ordinary soil, lead up to 1 km', 'cum', 168],
    ['2.4', 'Earthwork', 'Embankment with approved borrow material, compacted to 97% density', 'cum', 312],
    ['3.2', 'Sub-base and base', 'Granular sub-base, grading II, mixed in place and compacted', 'cum', 2140],
    ['3.5', 'Sub-base and base', 'Wet mix macadam laid with a paver and compacted', 'cum', 2985],
    ['4.1', 'Bituminous work', 'Prime coat over a granular surface', 'sqm', 52],
    ['4.3', 'Bituminous work', 'Tack coat on a bituminous surface', 'sqm', 21],
    ['4.6', 'Bituminous work', 'Dense bituminous macadam, grade II, 50 to 75 mm', 'cum', 11850],
    ['4.8', 'Bituminous work', 'Bituminous concrete, grade II, 30 to 40 mm', 'cum', 13420],
    ['5.1', 'Concrete', 'PCC 1:4:8 (M7.5) in foundation', 'cum', 6150],
    ['5.3', 'Concrete', 'RCC M25 in superstructure, concrete only', 'cum', 8960],
    ['5.6', 'Concrete', 'Reinforcement steel Fe 500D, cut, bent and placed', 'MT', 78400],
    ['6.2', 'Masonry', 'Brickwork in fly ash bricks in cement mortar 1:6', 'cum', 6420],
    ['7.1', 'Finishing', '12 mm cement plaster 1:6', 'sqm', 285],
    ['8.4', 'Water supply', 'Laying and jointing DI K9 pipe, 400 mm', 'Rmt', 6150],
    ['9.2', 'Drainage', 'RCC hume pipe culvert NP3, 900 mm', 'Rmt', 9850],
  ];
  await prisma.sorItem.createMany({ data: sor.map(([code, chapter, description, unit, rate]) => ({ organizationId, bookId: book.id, code, chapter, description, unit, rate: D(rate) })) });
  const sorItems = new Map((await prisma.sorItem.findMany({ where: { bookId: book.id } })).map((s) => [s.code, s]));
  const store = async (word: string) => prisma.item.findFirst({ where: { organizationId, name: { contains: word, mode: 'insensitive' } }, select: { id: true, name: true, unit: true, rate: true } });
  const [cement, sand, agg20, agg10, bitumen, bricks, pipe] = await Promise.all(['Cement', 'Sand', 'Aggregate 20', 'Aggregate 10', 'Bitumen', 'bricks', 'DI K9'].map(store));
  // A material line from the store when the item is there (else by name), labour by trade, machines by category.
  const mat = (it: Awaited<ReturnType<typeof store>>, name: string, unit: string, qty: number, rate: number, waste = 0) => ({ kind: 'MATERIAL' as const, itemId: it?.id ?? null, name: it?.name ?? name, unit: it?.unit ?? unit, qtyPerUnit: D(qty), wastagePct: D(waste), rate: it?.rate ?? D(rate) });
  const res = (kind: 'LABOUR' | 'EQUIPMENT', name: string, qty: number, rate: number) => ({ kind, itemId: null, name, unit: kind === 'LABOUR' ? 'day' : 'hour', qtyPerUnit: D(qty), wastagePct: D(0), rate: D(rate) });
  const lab = (n: string, q: number) => res('LABOUR', n, q, { Mason: 900, Helper: 550, Operator: 1100, 'Bar Bender': 850 }[n] ?? 600);
  const mach = (n: string, q: number) => res('EQUIPMENT', n, q, { Earthmoving: 1450, Compaction: 1200, Concreting: 650, Lifting: 1800 }[n] ?? 1000);
  type Item = { no: string; code: string; qty: number; lines: ReturnType<typeof mat | typeof res>[] };
  const tenders: {
    no: string; nit: string; title: string; client: string; location: string; bidType: 'PERCENTAGE' | 'ITEM_RATE'; status: 'PREPARING' | 'SUBMITTED' | 'LOST' | 'DROPPED';
    submitBy: number; submitted?: number; opened?: number; result?: number; pct?: number; months: number; emd?: [string, string]; items: Item[]; bids?: [string, number][]; note?: string; estimate?: number;
  }[] = [
    {
      no: 'TND-2026-0001', nit: 'OWD/RD/NIT-14/2026-27', title: 'Improvement of Khurda-Begunia road, km 0.000 to 14.200', client: 'Odisha Works Department', location: 'Khurda', bidType: 'PERCENTAGE', status: 'PREPARING', submitBy: 9, pct: -3.5, months: 18, emd: ['DD 004512', 'State Bank of India'],
      items: [
        { no: '1', code: '2.1', qty: 18500, lines: [mach('Earthmoving', 0.06), lab('Helper', 0.03)] },
        { no: '2', code: '2.4', qty: 42000, lines: [mat(null, 'Borrow earth', 'cum', 1.25, 95), mach('Earthmoving', 0.05), mach('Compaction', 0.03), lab('Helper', 0.04)] },
        { no: '3', code: '3.2', qty: 9800, lines: [mat(null, 'GSB material, grading II', 'cum', 1.32, 1150, 2), mach('Compaction', 0.04), mach('Earthmoving', 0.03), lab('Helper', 0.1)] },
        { no: '4', code: '3.5', qty: 6400, lines: [mat(agg20, 'Aggregate 20mm', 'cum', 0.9, 1150, 2), mat(agg10, 'Aggregate 10mm', 'cum', 0.35, 1250, 2), mat(null, 'Stone dust', 'cum', 0.3, 900), mach('Earthmoving', 0.2), mach('Compaction', 0.05), lab('Helper', 0.12), lab('Operator', 0.03)] },
        { no: '5', code: '4.6', qty: 2100, lines: [mat(bitumen, 'Bitumen VG-30', 'MT', 0.11, 48500, 1), mat(agg20, 'Aggregate 20mm', 'cum', 1.05, 1150, 2), mat(agg10, 'Aggregate 10mm', 'cum', 0.35, 1250, 2), mach('Compaction', 0.15), lab('Helper', 0.3), lab('Operator', 0.1)] },
        { no: '6', code: '4.8', qty: 1150, lines: [mat(bitumen, 'Bitumen VG-30', 'MT', 0.135, 48500, 1), mat(agg10, 'Aggregate 10mm', 'cum', 1.1, 1250, 2), mach('Compaction', 0.2), lab('Helper', 0.35), lab('Operator', 0.12)] },
      ],
    },
    {
      no: 'TND-2026-0002', nit: 'H&FW/CHC/07/2026', title: 'Construction of 30-bed CHC building at Pipili', client: 'Dept. of Health & Family Welfare', location: 'Pipili, Puri', bidType: 'ITEM_RATE', status: 'SUBMITTED', submitBy: -6, submitted: -7, opened: -2, months: 15, emd: ['BG 0090/2026', 'Bank of India'],
      items: [
        { no: '1.01', code: '5.1', qty: 240, lines: [mat(cement, 'Cement', 'bag', 3.4, 385, 2), mat(sand, 'Sand', 'cum', 0.47, 1600, 5), mat(agg20, 'Aggregate 20mm', 'cum', 0.94, 1150, 3), lab('Mason', 0.17), lab('Helper', 2), mach('Concreting', 0.4)] },
        { no: '1.02', code: '5.3', qty: 1450, lines: [mat(cement, 'Cement', 'bag', 8.2, 385, 2), mat(sand, 'Sand', 'cum', 0.41, 1600, 5), mat(agg20, 'Aggregate 20mm', 'cum', 0.83, 1150, 3), lab('Mason', 0.25), lab('Helper', 2.5), mach('Concreting', 0.8)] },
        { no: '1.03', code: '5.6', qty: 182, lines: [mat(null, 'TMT bars Fe 500D', 'MT', 1, 62000, 3), lab('Bar Bender', 6), lab('Helper', 6)] },
        { no: '1.04', code: '6.2', qty: 980, lines: [mat(bricks, 'Fly ash bricks', 'Nos', 500, 8.5, 3), mat(cement, 'Cement', 'bag', 1.3, 385, 2), mat(sand, 'Sand', 'cum', 0.27, 1600, 5), lab('Mason', 1), lab('Helper', 1.4)] },
        { no: '1.05', code: '7.1', qty: 12400, lines: [mat(cement, 'Cement', 'bag', 0.13, 385, 2), mat(sand, 'Sand', 'cum', 0.016, 1600, 5), lab('Mason', 0.06), lab('Helper', 0.07)] },
      ],
      bids: [['Utkal Builders', 1.031], ['Mahanadi Infra', 1.062]],
    },
    {
      no: 'TND-2026-0003', nit: 'RWSS/JJM/NIT-22/2026-27', title: 'Rural piped water supply to 12 villages, Jatni block', client: 'RWSS Odisha (Jal Jeevan Mission)', location: 'Jatni', bidType: 'PERCENTAGE', status: 'LOST', submitBy: -62, submitted: -63, opened: -45, result: -30, pct: 2.8, months: 12, emd: ['DD 118206', 'Union Bank of India'],
      items: [
        { no: 'A1', code: '8.4', qty: 5200, lines: [mat(pipe, 'DI K9 pipe 400mm', 'Rmt', 1, 5200, 1), lab('Mason', 0.05), lab('Helper', 0.15), mach('Lifting', 0.08)] },
        { no: 'A2', code: '2.1', qty: 9800, lines: [mach('Earthmoving', 0.06), lab('Helper', 0.03)] },
      ],
      bids: [['Kalinga Infra Projects', -1.5], ['Jagannath Constructions', 4.1]],
      note: 'L1 Kalinga Infra Projects at 1.50% below',
    },
    { no: 'TND-2026-0004', nit: 'KH/BW/2026/03', title: 'Boundary wall and gate, Kalinga Homes phase 2', client: 'Kalinga Homes LLP', location: 'Bhubaneswar', bidType: 'ITEM_RATE', status: 'DROPPED', submitBy: -20, months: 4, items: [], estimate: 4_800_000, note: 'Not bid: our crews are on the Khurda road at the time' },
  ];
  const clients = new Map((await prisma.client.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((c) => [c.name, c.id]));
  for (const t of tenders) {
    const sorValue = t.items.reduce((s, i) => s.plus(D(i.qty).mul(sorItems.get(i.code)!.rate)), D(0));
    const estimate = t.estimate ? D(t.estimate) : sorValue;
    const tender = await prisma.tender.create({
      data: {
        organizationId, tenderNo: t.no, nitNo: t.nit, title: t.title, clientId: clients.get(t.client) ?? null, clientName: t.client, location: t.location, bidType: t.bidType, sorBookId: book.id,
        estimatedValue: estimate, completionMonths: t.months, publishedOn: day(t.submitBy - 30), submitBy: day(t.submitBy), submittedOn: t.submitted !== undefined ? day(t.submitted) : null,
        openedOn: t.opened !== undefined ? day(t.opened) : null, quotedPct: t.pct !== undefined ? D(t.pct) : null, tenderFee: D(t.items.length ? 5900 : 1180), status: t.status,
        resultOn: t.result !== undefined ? day(t.result) : t.status === 'DROPPED' ? day(t.submitBy - 3) : null, resultNote: t.note ?? null, createdById: qs.id, createdAt: day(t.submitBy - 25),
      },
    });
    for (const [n, i] of t.items.entries()) {
      const s = sorItems.get(i.code)!;
      const item = await prisma.tenderItem.create({ data: { organizationId, tenderId: tender.id, itemNo: i.no, description: s.description, unit: s.unit, qty: D(i.qty), sorItemId: s.id, sorRate: s.rate, sortOrder: n } });
      await prisma.tenderItemLine.createMany({ data: i.lines.map((l, k) => ({ ...l, organizationId, tenderItemId: item.id, sortOrder: k })) });
    }
    if (t.emd) {
      // 1% of the estimate, as most notices ask.
      const doc = await prisma.complianceDoc.create({
        data: { organizationId, kind: 'EMD', category: 'EMD', reference: t.emd[0], issuer: t.emd[1], beneficiary: t.client, amount: estimate.div(100).toDecimalPlaces(0), issuedOn: day(t.submitBy - 3), expiresOn: day(t.submitBy + 180), note: `Tender ${t.no}: ${t.title}`, createdById: qs.id },
      });
      await prisma.tender.update({ where: { id: tender.id }, data: { emdDocId: doc.id } });
    }
    if (t.bids) {
      // Our quote, to price the others' bids against: the built-up rates on an item-rate tender, the percentage on the SOR otherwise.
      const ours = t.bidType === 'PERCENTAGE'
        ? sorValue.mul(D(100).plus(t.pct!)).div(100)
        : t.items.reduce((sum, i) => {
            const cost = i.lines.reduce((c, l) => c.plus(l.qtyPerUnit.mul(D(100).plus(l.wastagePct)).div(100).mul(l.rate!).toDecimalPlaces(2)), D(0));
            const rate = cost.plus(cost.mul(10).div(100).toDecimalPlaces(2)).plus(cost.mul(8).div(100).toDecimalPlaces(2));
            return sum.plus(D(i.qty).mul(rate).toDecimalPlaces(2));
          }, D(0));
      await prisma.tenderBid.createMany({
        data: t.bids.map(([name, f]) => ({ organizationId, tenderId: tender.id, bidderName: name, amount: (t.bidType === 'PERCENTAGE' ? sorValue.mul(D(100).plus(f)).div(100) : ours.mul(f)).toDecimalPlaces(0) })),
      });
    }
    await prisma.auditLog.create({ data: { organizationId, entityType: 'TENDER', entityId: tender.id, action: 'CREATED', actorId: qs.id, createdAt: day(t.submitBy - 25) } });
  }
}

/**
 * Past openings for bid intelligence (intelligence quick win Q4): three road tenders of the Works Department lost over
 * the last year and a half, where we quoted near 4 to 6% below and L1 landed near 10% below, so the Khurda road being
 * priced shows the level. Percentage tenders on the estimate (no BOQ kept), added once to a company that has tenders.
 */
async function seedPastOpenings(organizationId: string) {
  if (await prisma.tender.findFirst({ where: { organizationId, tenderNo: 'TND-2025-0003' }, select: { id: true } })) return;
  const book = await prisma.sorBook.findFirst({ where: { organizationId, name: 'Odisha SOR 2024-25 (demo)' }, select: { id: true } });
  const qs = await prisma.user.findFirst({ where: { organizationId, email: { in: ['qs@demo.com', 'admin@demo.com'] } }, orderBy: { email: 'desc' }, select: { id: true } });
  if (!book || !qs) return;
  const client = 'Odisha Works Department';
  const clientId = (await prisma.client.findFirst({ where: { organizationId, name: client }, select: { id: true } }))?.id ?? null;
  const past: { no: string; nit: string; title: string; location: string; opened: number; estimate: number; pct: number; bids: [string, number][] }[] = [
    { no: 'TND-2025-0003', nit: 'OWD/RD/NIT-31/2024-25', title: 'Strengthening of Jatni-Khurda road, km 4.000 to 11.500', location: 'Jatni', opened: -420, estimate: 86_400_000, pct: -4.2, bids: [['Kalinga Infra Projects', -9.8], ['Utkal Builders', -6.5]] },
    { no: 'TND-2025-0007', nit: 'OWD/RD/NIT-07/2025-26', title: 'Widening of Balugaon-Tangi road to two lanes', location: 'Balugaon', opened: -300, estimate: 142_000_000, pct: -6, bids: [['Mahanadi Infra', -11.2], ['Jagannath Constructions', -7.4], ['Utkal Builders', -5.1]] },
    { no: 'TND-2025-0011', nit: 'OWD/RD/NIT-19/2025-26', title: 'Periodic renewal of Delang-Pipili road', location: 'Pipili', opened: -150, estimate: 38_500_000, pct: -5.5, bids: [['Kalinga Infra Projects', -10.4], ['Utkal Builders', -5]] },
  ];
  for (const t of past) {
    const estimate = D(t.estimate);
    await prisma.tender.create({
      data: {
        organizationId, tenderNo: t.no, nitNo: t.nit, title: t.title, clientId, clientName: client, location: t.location, bidType: 'PERCENTAGE', sorBookId: book.id,
        estimatedValue: estimate, completionMonths: 12, publishedOn: day(t.opened - 45), submitBy: day(t.opened - 7), submittedOn: day(t.opened - 8), openedOn: day(t.opened),
        quotedPct: D(t.pct), tenderFee: D(5900), status: 'LOST', resultOn: day(t.opened + 14), resultNote: `L1 ${t.bids[0][0]} at ${Math.abs(t.bids[0][1]).toFixed(2)}% below`, createdById: qs.id, createdAt: day(t.opened - 40),
        bids: { create: t.bids.map(([name, f]) => ({ organizationId, bidderName: name, amount: estimate.mul(D(100).plus(f)).div(100).toDecimalPlaces(0) })) },
      },
    });
  }
}

/**
 * Subcontract enquiries demo (v6 item 111). The road project's GSB and WMM went out to two subcontractors a month ago and
 * the lower quote became its work order; the hospital's brickwork and plaster has two quotes in (L1 and L2 a few lakh
 * apart) and one awaited; the water scheme's distribution lines have one partial quote. Only when the organisation has
 * no enquiry yet.
 */
async function seedScEnquiries(organizationId: string) {
  if (await prisma.subcontractEnquiry.count({ where: { organizationId } })) return;
  const pm = (await prisma.user.findFirst({ where: { organizationId, email: 'pm@demo.com' }, select: { id: true } })) ?? (await prisma.user.findFirst({ where: { organizationId, email: 'admin@demo.com' }, select: { id: true } }));
  if (!pm) return;
  const vendors = new Map((await prisma.vendor.findMany({ where: { organizationId, kinds: { has: 'SUBCONTRACTOR' } }, select: { id: true, name: true } })).map((v) => [v.name, v.id]));
  const year = new Date().getUTCFullYear();
  type Own = { description: string; unit: string; qty: number };
  type Quote = { vendor: string; received?: number; gst?: number; validFor?: number; rates: (number | null)[]; note?: string };
  const enquiries: { code: string; title: string; scope: string; created: number; closes: number; boq: [string, number | null][]; own?: Own[]; quotes: Quote[]; award?: { vendor: string; on: number } }[] = [
    {
      code: '', title: 'GSB and WMM, Km 10 to 22', created: -32, closes: -24,
      scope: 'Rates include labour, machinery and transport. Bitumen, cement and diesel issued from our store are recovered at the store rate.',
      boq: [['3.01', null], ['3.02', null]], own: [{ description: 'Shoulder dressing and side slopes, both sides', unit: 'Km', qty: 12 }],
      quotes: [
        { vendor: 'Sri Jagannath Constructions', received: -25, rates: [1390, 1780, 18500] },
        { vendor: 'Kalinga Builders', received: -24, rates: [1445, 1810, 21000], note: 'Can start only after the monsoon' },
      ],
      award: { vendor: 'Sri Jagannath Constructions', on: -20 },
    },
    {
      code: 'BL-2026-02', title: 'Brickwork and plaster, first floor and above', created: -12, closes: 3,
      scope: 'Rates include all materials, labour, scaffolding and curing. Water and power at one point per floor from us.',
      boq: [['4.01', 420], ['5.01', 6200]], own: [{ description: 'Scaffolding for masonry and plaster, hire and erection', unit: 'LS', qty: 1 }],
      quotes: [
        { vendor: 'Kalinga Builders', received: -6, rates: [5380, 186, 42000], validFor: 30 },
        { vendor: 'Sri Jagannath Constructions', received: -4, rates: [5290, 194, 38000], validFor: 45, note: 'Bricks from their own kiln at Athagarh' },
        { vendor: 'Utkal Shuttering Works', rates: [] },
      ],
    },
    {
      code: 'WS-2026-03', title: 'HDPE distribution lines and house connections, zone 2', created: -5, closes: 6,
      scope: 'Pipes and fittings issued free from our store; rates for laying, jointing, testing and trench restoration.',
      boq: [['5.01', 18000], ['6.01', 2100]],
      quotes: [
        { vendor: 'Sri Jagannath Constructions', received: -1, gst: 12, rates: [96, null], note: 'House connections not quoted: no plumbers free till March' },
        { vendor: 'Kalinga Builders', rates: [] },
      ],
    },
  ];
  for (const [n, e] of enquiries.entries()) {
    const project = e.code
      ? await prisma.project.findFirst({ where: { organizationId, code: e.code }, include: { boqItems: true } })
      : await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, include: { boqItems: true }, orderBy: { createdAt: 'asc' } });
    if (!project) continue;
    const rows = [
      ...e.boq.map(([no, qty]) => {
        const b = project.boqItems.find((x) => x.itemNo === no);
        return b ? { boqItemId: b.id, description: b.description, unit: b.unit, quantity: qty === null ? (b.revisedQty ?? b.originalQty) : D(qty) } : null;
      }),
      ...(e.own ?? []).map((o) => ({ boqItemId: null, description: o.description, unit: o.unit, quantity: D(o.qty) })),
    ];
    if (rows.some((r) => !r) || e.quotes.some((q) => !vendors.has(q.vendor))) continue;
    const wo = e.award ? await prisma.workOrder.findFirst({ where: { organizationId, projectId: project.id, title: e.title } }) : null;
    const enquiry = await prisma.subcontractEnquiry.create({
      data: {
        organizationId, projectId: project.id, enquiryNo: `SCE-${year}-${String(n + 1).padStart(4, '0')}`, title: e.title, scope: e.scope, closesOn: day(e.closes), createdById: pm.id, createdAt: day(e.created),
        items: { create: rows.map((r, i) => ({ ...r!, organizationId, sortOrder: i })) },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    const audit: { action: string; note: string | null; at: number }[] = [{ action: 'CREATED', note: null, at: e.created }];
    let awarded: string | null = null;
    for (const q of e.quotes) {
      const quote = await prisma.subcontractQuote.create({
        data: {
          organizationId, enquiryId: enquiry.id, vendorId: vendors.get(q.vendor)!, receivedOn: q.received !== undefined ? day(q.received) : null, gstRate: D(q.gst ?? 18),
          validUntil: q.received !== undefined && q.validFor ? day(q.received + q.validFor) : null, note: q.note ?? null, createdAt: day(e.created),
          lines: { create: q.rates.flatMap((rate, i) => (rate === null ? [] : [{ organizationId, itemId: enquiry.items[i].id, rate: D(rate) }])) },
        },
      });
      if (q.received !== undefined) audit.push({ action: 'QUOTE_ENTERED', note: q.vendor, at: q.received });
      if (e.award?.vendor === q.vendor) awarded = quote.id;
    }
    if (e.award && awarded) {
      await prisma.subcontractEnquiry.update({ where: { id: enquiry.id }, data: { status: 'AWARDED', awardedQuoteId: awarded, workOrderId: wo?.id ?? null, decidedAt: day(e.award.on) } });
      audit.push({ action: 'AWARDED', note: `${e.award.vendor}${wo ? `, ${wo.woNo}` : ''}`, at: e.award.on });
    }
    await prisma.auditLog.createMany({ data: audit.map((a) => ({ organizationId, entityType: 'SC_ENQUIRY', entityId: enquiry.id, action: a.action, note: a.note, actorId: pm.id, createdAt: day(a.at) })) });
  }
}

/**
 * Meetings and action items (v6 item 112): the road's last two progress reviews and its monthly review with the
 * client, a design meeting on the hospital, and this week's water scheme review still in draft. Some actions are done,
 * one is overdue with the project manager, and some are about an RFI.
 */
async function seedMeetings(organizationId: string) {
  if (await prisma.meeting.count({ where: { organizationId } })) return;
  const users = new Map((await prisma.user.findMany({ where: { organizationId }, select: { id: true, email: true, fullName: true, phone: true } })).map((u) => [u.email, u]));
  const pm = users.get('pm@demo.com') ?? users.get('admin@demo.com');
  if (!pm) return;
  const year = new Date().getUTCFullYear();
  type Who = string | { name: string; org: string; email?: string; phone?: string; absent?: boolean };
  type Act = { text: string; owner: Who; due: number | null; done?: number; dropped?: number; note?: string; rfi?: string };
  const meetings: {
    code: string; title: string; kind: 'PROGRESS' | 'CLIENT' | 'DESIGN'; held: number; time: string; venue: string; chair: string; agenda: string; next: number | null;
    issued: boolean; by: string; who: Who[]; notes: [('NOTE' | 'DECISION'), string][]; actions: Act[];
  }[] = [
    {
      code: 'RD-2026-01', title: 'Progress review, Km 12 to 20', kind: 'PROGRESS', held: -15, time: '10:00', venue: 'Site office, Km 14', chair: 'Suresh Nair', next: -8, issued: true, by: 'pm@demo.com',
      agenda: 'Progress against the programme\nEarthwork and GSB in Km 16 to 20\nQuality: culvert at Km 17.4\nSafety',
      who: ['pm@demo.com', 'engineer@demo.com', 'tl@demo.com', 'qaqc@demo.com', { name: 'P. K. Sahoo', org: 'Sri Jagannath Constructions', phone: '9437012345' }],
      notes: [
        ['NOTE', 'Earthwork in embankment is at 78% against 82% planned; the shortfall is in Km 18 to 20 where the borrow area was flooded.'],
        ['NOTE', 'GSB is complete up to Km 16; WMM has started on the left carriageway.'],
        ['DECISION', 'Borrow earth for Km 18 to 20 to come from the Pipili area till the flooded pit dries out.'],
        ['DECISION', 'Night work on WMM allowed on the left carriageway with lighting and flagmen.'],
      ],
      actions: [
        { text: 'Fix lighting and two flagmen for night work on the left carriageway', owner: 'tl@demo.com', due: -12, done: -12 },
        { text: 'Get the borrow area at Pipili approved by the client', owner: 'pm@demo.com', due: -10, done: -9 },
        { text: 'Cast cubes for the culvert top slab at Km 17.4 and test at 7 and 28 days', owner: 'qaqc@demo.com', due: -8, done: -8 },
      ],
    },
    {
      code: 'RD-2026-01', title: 'Progress review, Km 12 to 20', kind: 'PROGRESS', held: -8, time: '10:00', venue: 'Site office, Km 14', chair: 'Suresh Nair', next: -1, issued: true, by: 'pm@demo.com',
      agenda: 'Actions from the last review\nProgress against the programme\nHT line crossing at Ch 14+100\nBills of Sri Jagannath',
      who: ['pm@demo.com', 'engineer@demo.com', 'tl@demo.com', 'qs@demo.com', 'qaqc@demo.com', { name: 'P. K. Sahoo', org: 'Sri Jagannath Constructions', phone: '9437012345' }, { name: 'Deepak Kumar', org: 'Head office', absent: true }],
      notes: [
        ['NOTE', 'Earthwork is at 84% against 86% planned; the Pipili borrow area has closed most of the gap.'],
        ['NOTE', 'The HT line at Ch 14+100 still stops the embankment over 60 m. TPCODL has not given its estimate for shifting.'],
        ['DECISION', 'Work past the HT line to go on both sides, leaving the 60 m stretch for last.'],
        ['DECISION', 'A second paver to be hired for DBM from 1 November rather than moving the one from the water scheme.'],
        ['NOTE', 'Sri Jagannath asked for the shoulder dressing bill to be cleared before Diwali.'],
      ],
      actions: [
        { text: 'Get the shifting estimate for the HT line at Ch 14+100 from TPCODL and send it to the client', owner: 'pm@demo.com', due: -3, rfi: 'HT line crossing at Ch 14+100' },
        { text: 'Re-sequence WMM between Km 18 and 20 to keep one lane open to traffic', owner: 'tl@demo.com', due: -4, done: -5 },
        { text: 'Send the 7-day cube results of the culvert slab to the client', owner: 'qaqc@demo.com', due: -2, done: -2 },
        { text: 'Measure and certify the shoulder dressing bill of Sri Jagannath', owner: 'qs@demo.com', due: 2 },
        { text: 'Line up a second paver for DBM from 1 November', owner: 'pm@demo.com', due: 6 },
        { text: 'Move the batching plant to Km 22', owner: 'tl@demo.com', due: -1, dropped: -1, note: 'Not needed: DBM comes from the hot mix plant at Km 9' },
      ],
    },
    {
      code: 'RD-2026-01', title: 'Monthly review with the client', kind: 'CLIENT', held: -2, time: '11:30', venue: 'NH division office, Bhubaneswar', chair: 'Er. Bijay Kumar Panda', next: 28, issued: true, by: 'pm@demo.com',
      agenda: 'Progress for the month\nDrawings and RFIs pending with the client\nRA bill 4\nUtility shifting',
      who: [{ name: 'Er. Bijay Kumar Panda', org: 'Client, NH division', email: 'client@demo.com' }, 'md@demo.com', 'pm@demo.com', 'qs@demo.com'],
      notes: [
        ['NOTE', 'Physical progress is 61% against 64% planned; the client accepted the reasons for the gap in Km 18 to 20.'],
        ['NOTE', 'Drawings for the cross drainage between Km 17 and 19 are still pending with the client.'],
        ['DECISION', 'The client will take up the HT line shifting with TPCODL at its level.'],
        ['DECISION', 'RA bill 4 to be checked jointly on site before submission.'],
      ],
      actions: [
        { text: 'Issue the cross drainage drawings for Km 17 to 19', owner: { name: 'Er. Bijay Kumar Panda', org: 'Client, NH division' }, due: 8, rfi: 'Cross drainage between Km 17 and Km 19' },
        { text: 'Send the revised programme for the bridge approaches', owner: 'pm@demo.com', due: 5 },
        { text: 'Fix a date for the joint measurement of RA bill 4', owner: 'qs@demo.com', due: 3 },
      ],
    },
    {
      code: 'BL-2026-02', title: 'Design coordination with the architect and PMC', kind: 'DESIGN', held: -5, time: '15:00', venue: 'PMC office, Cuttack', chair: 'Lakshmi Menon', next: 9, issued: true, by: 'md@demo.com',
      agenda: 'Stair core doors\nFooting F12\nMEP routing in the OT block',
      who: ['md@demo.com', 'qs@demo.com', 'qaqc@demo.com', { name: 'Lakshmi Menon', org: 'PMC' }, { name: 'Ar. S. Mishra', org: 'Mishra Associates, architects', email: 'architect@example.com' }],
      notes: [
        ['NOTE', 'Footing F12 is to be built to the structural drawing; the architectural drawing will be corrected.'],
        ['DECISION', 'Stair core doors to be 2-hour fire rated, as the fire NOC asks.'],
        ['NOTE', 'MEP routing in the OT block needs a combined services drawing before the first floor slab.'],
      ],
      actions: [
        { text: 'Price the 2-hour fire-rated doors and send a variation', owner: 'qs@demo.com', due: 4, rfi: 'Fire rating of the stair core doors' },
        { text: 'Issue the combined services drawing for the OT block', owner: { name: 'Ar. S. Mishra', org: 'Mishra Associates, architects' }, due: 10 },
      ],
    },
    {
      code: 'WS-2026-03', title: 'Weekly progress review, zone 2', kind: 'PROGRESS', held: 0, time: '09:30', venue: 'Site office, Jajpur', chair: 'Suresh Nair', next: 7, issued: false, by: 'pm@demo.com',
      agenda: 'Pipe laying in zone 2\nHouse connections\nOverhead tank',
      who: ['pm@demo.com', 'engineer@demo.com', 'tl@demo.com'],
      notes: [
        ['NOTE', 'HDPE laying is at 7.2 km of 18 km in zone 2.'],
        ['DECISION', 'House connections to start in the streets already pressure tested.'],
      ],
      actions: [{ text: 'Find a plumbing gang for house connections in zone 2', owner: 'tl@demo.com', due: 7 }],
    },
  ];
  let n = 0;
  for (const m of [...meetings].sort((a, b) => a.held - b.held)) {
    const project = await prisma.project.findFirst({ where: { organizationId, code: m.code }, select: { id: true } });
    const by = users.get(m.by) ?? pm;
    if (!project) continue;
    const rfis = await prisma.rfi.findMany({ where: { organizationId, projectId: project.id }, select: { id: true, subject: true } });
    const person = (w: Who) => (typeof w === 'string' ? users.get(w) : null);
    n += 1;
    const meeting = await prisma.meeting.create({
      data: {
        organizationId, projectId: project.id, meetingNo: `MOM-${year}-${String(n).padStart(4, '0')}`, title: m.title, kind: m.kind, heldOn: day(m.held), startTime: m.time, venue: m.venue, chairedBy: m.chair,
        agenda: m.agenda, nextOn: m.next === null ? null : day(m.next), status: m.issued ? 'ISSUED' : 'DRAFT', issuedAt: m.issued ? new Date(day(m.held).getTime() + 12.5 * 3_600_000) : null, issuedById: m.issued ? by.id : null, createdById: by.id, createdAt: day(m.held),
        attendees: {
          create: m.who.flatMap((w, i) => {
            const u = person(w);
            if (typeof w === 'string' && !u) return [];
            return [u
              ? { organizationId, userId: u.id, name: u.fullName, email: u.email, phone: u.phone, sortOrder: i }
              : { organizationId, name: (w as Exclude<Who, string>).name, organisation: (w as Exclude<Who, string>).org, email: (w as Exclude<Who, string>).email ?? null, phone: (w as Exclude<Who, string>).phone ?? null, present: !(w as Exclude<Who, string>).absent, sortOrder: i }];
          }),
        },
        points: { create: m.notes.map(([kind, text], i) => ({ organizationId, kind, text, sortOrder: i })) },
        actions: {
          create: m.actions.map((a, i) => {
            const u = person(a.owner);
            const closed = a.done ?? a.dropped;
            return {
              organizationId, projectId: project.id, text: a.text, ownerUserId: u?.id ?? null, ownerName: u?.fullName ?? (typeof a.owner === 'string' ? a.owner : a.owner.name), dueOn: a.due === null ? null : day(a.due),
              status: a.done !== undefined ? 'DONE' as const : a.dropped !== undefined ? 'DROPPED' as const : 'OPEN' as const, doneOn: closed === undefined ? null : day(closed), closeNote: a.note ?? null, closedById: closed === undefined ? null : (u?.id ?? by.id),
              rfiId: a.rfi ? (rfis.find((r) => r.subject === a.rfi)?.id ?? null) : null, sortOrder: i,
            };
          }),
        },
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'MEETING', entityId: meeting.id, action: 'CREATED', note: null, actorId: by.id, createdAt: day(m.held) },
        ...(m.issued ? [{ organizationId, entityType: 'MEETING', entityId: meeting.id, action: 'ISSUED', note: null, actorId: by.id, createdAt: new Date(day(m.held).getTime() + 12.5 * 3_600_000) }] : []),
      ],
    });
  }
}

/** Material approvals (v6 item 113): the contract's approved makes on the road and the hospital, and requests in every state. */
/**
 * Leakage checks (AI item 121) have machines to find: the hired grader is paid for 200 hours a month whatever it works
 * (it works about six hours a day), and 60 litres of diesel went into the excavator eight days ago, a day it has no
 * log. Material over the norms comes from the reconciliation seed. Once per organisation.
 */
async function seedLeakage(organizationId: string) {
  const grader = await prisma.equipment.findFirst({ where: { organizationId, code: 'GRD-01', ownership: 'HIRED', rateUnit: 'HOUR' } });
  if (!grader || grader.hireMinHours) return;
  await prisma.equipment.update({ where: { id: grader.id }, data: { hireMinHours: D(200) } });

  const excavator = await prisma.equipment.findFirst({ where: { organizationId, code: 'EXC-01' }, select: { id: true, code: true, name: true, projectId: true } });
  const keeper = await prisma.user.findFirst({ where: { organizationId, email: 'store@demo.com' }, select: { id: true } });
  if (!excavator?.projectId || !keeper) return;
  const date = day(-8);
  if (await prisma.machineryLog.count({ where: { equipmentId: excavator.id, date } })) return;
  const fuel = await prisma.stockTxn.groupBy({ by: ['itemId'], where: { projectId: excavator.projectId, item: { isFuel: true } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 1 });
  if (!fuel.length || Number(fuel[0]._sum.quantity ?? 0) < 60) return;
  const year = day(0).getUTCFullYear();
  const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `ISS-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
  const entryNo = `ISS-${year}-${String((last ? parseInt(last.entryNo.slice(9), 10) : 0) + 1).padStart(4, '0')}`;
  const e = await prisma.stockEntry.create({
    data: {
      organizationId, projectId: excavator.projectId, type: 'ISSUE', entryNo, date, createdById: keeper.id, createdAt: date,
      equipmentId: excavator.id, issuedTo: 'Ramesh Behera (operator)', remarks: `Into ${excavator.code} for the day`,
      lines: { create: [{ organizationId, projectId: excavator.projectId, itemId: fuel[0].itemId, type: 'ISSUE', date, quantity: D(-60) }] },
    },
  });
  await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: keeper.id, note: e.entryNo, createdAt: date } });
}

/**
 * Attendance cross-check demo (AI item 124) on the road project, over five days of its roll call before the latest:
 * every named worker of Sri Jagannath Constructions enrolled on the gate terminal and punching in and out, except three
 * helpers marked present on the middle day who did not punch. Two labour work orders billed in man-days, both bills
 * waiting for approval: Sri Jagannath's asks 9 more helper man-days than the head count (the bill check and the watch
 * list flag it; masons match), Maa Tarini Labour Supply's helpers match the head count. Only when no work order is
 * billed in man-days yet.
 */
async function seedAttendanceCheck(organizationId: string) {
  if (await prisma.workOrderLine.count({ where: { workOrder: { organizationId }, unit: 'Man-day' } })) return;
  const project = await prisma.project.findFirst({ where: { organizationId, type: 'ROAD' }, orderBy: { code: 'asc' } });
  const gate = project ? await prisma.biometricDevice.findFirst({ where: { organizationId, projectId: project.id } }) : null;
  const sjc = await prisma.vendor.findFirst({ where: { organizationId, name: 'Sri Jagannath Constructions' } });
  const md = await prisma.user.findFirst({ where: { organizationId, email: 'md@demo.com' }, select: { id: true } });
  if (!project?.projectManagerId || !gate || !sjc || !md) return;
  const pm = project.projectManagerId;
  const roll = await prisma.workerAttendance.findMany({ where: { projectId: project.id, worker: { contractor: sjc.name } }, include: { worker: true }, orderBy: [{ date: 'asc' }, { worker: { workerNo: 'asc' } }] });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  // The roll call's last six days but the latest, which is left as the site marked it (the biometric test punches then).
  const dates = [...new Set(roll.map((r) => iso(r.date)))].sort().slice(-6, -1);
  if (dates.length < 4) return;

  // Enrol the crew (the first five already are) and punch them in and out on the gate terminal.
  const workers = [...new Map(roll.map((r) => [r.workerId, r.worker])).values()];
  const enrolled = new Set((await prisma.biometricUser.findMany({ where: { organizationId, workerId: { in: workers.map((w) => w.id) } }, select: { workerId: true } })).map((b) => b.workerId));
  const taken = new Set((await prisma.biometricUser.findMany({ where: { organizationId }, select: { pin: true } })).map((b) => b.pin));
  const toEnrol = workers.filter((w) => !enrolled.has(w.id)).map((w) => ({ organizationId, workerId: w.id, pin: String(1000 + parseInt(w.workerNo.slice(2), 10)) })).filter((b) => !taken.has(b.pin));
  if (toEnrol.length) await prisma.biometricUser.createMany({ data: toEnrol });
  const pins = new Map((await prisma.biometricUser.findMany({ where: { organizationId, workerId: { in: workers.map((w) => w.id) } }, select: { pin: true, workerId: true } })).map((b) => [b.workerId!, b.pin]));
  const skipDay = dates[dates.length - 3];
  const skip = new Set(roll.filter((r) => iso(r.date) === skipDay && r.status === 'PRESENT' && r.worker.trade === 'Helper').slice(-3).map((r) => r.id));
  const punches: Prisma.BiometricPunchCreateManyInput[] = [];
  const punched: string[] = [];
  for (const r of roll) {
    const pin = pins.get(r.workerId);
    if (!pin || !dates.includes(iso(r.date)) || r.status === 'ABSENT' || skip.has(r.id)) continue;
    const n = parseInt(r.worker.workerNo.slice(2), 10);
    const times = [`07:${String(48 + (n % 11)).padStart(2, '0')}`, r.outTime ?? '17:00'];
    for (const time of times) {
      const [h, m] = time.split(':').map(Number);
      punches.push({ organizationId, deviceId: gate.id, pin, punchedAt: new Date(r.date.getTime() + (h * 60 + m - gate.utcOffsetMin) * 60_000), date: r.date, time, result: 'APPLIED' });
    }
    punched.push(r.id);
  }
  await prisma.biometricPunch.createMany({ data: punches, skipDuplicates: true });
  await prisma.workerAttendance.updateMany({ where: { id: { in: punched } }, data: { biometricDeviceId: gate.id } });

  // The head count each bill is checked against, over the same days.
  const mtls =
    (await prisma.vendor.findFirst({ where: { organizationId, name: 'Maa Tarini Labour Supply' } })) ??
    (await prisma.vendor.create({ data: { organizationId, name: 'Maa Tarini Labour Supply', kinds: ['LABOUR_CONTRACTOR'], pan: 'BQTPM2231K', stateCode: '21', contactPerson: 'Bhagaban Mohanty', phone: '9437664120', address: 'Khordha, Odisha' } }));
  await prisma.attendanceLine.updateMany({ where: { sheet: { projectId: project.id }, vendorId: null, contractor: { equals: mtls.name, mode: 'insensitive' } }, data: { vendorId: mtls.id } });
  const range = { gte: new Date(`${dates[0]}T00:00:00Z`), lte: new Date(`${dates[dates.length - 1]}T00:00:00Z`) };
  const heads = async (contractor: string, category: string) =>
    (await prisma.attendanceLine.aggregate({ where: { sheet: { projectId: project.id, date: range }, contractor, category }, _sum: { count: true } }))._sum.count ?? 0;
  const year = new Date().getUTCFullYear();
  const upTo = range.lte;
  const billDate = day(0);
  for (const [vendor, title, invoiceNo, lines] of [
    [sjc, 'Labour for culverts, WMM and DBM (man-days)', 'SJC/LAB/26/014', [['Mason (man-day)', 900, await heads(sjc.name, 'Mason')], ['Helper (man-day)', 550, (await heads(sjc.name, 'Helper')) + 9]]],
    [mtls, 'Helpers for kerb and drain work (man-days)', 'MTLS/26/0088', [['Helper (man-day)', 520, await heads(mtls.name, 'Helper')]]],
  ] as const) {
    if (lines.some(([, , qty]) => !qty)) continue;
    const last = await prisma.workOrder.findFirst({ where: { organizationId, woNo: { startsWith: `WO-${year}-` } }, orderBy: { woNo: 'desc' }, select: { woNo: true } });
    const woLines = lines.map(([description, rate], i) => ({ boqItemId: null, description, unit: 'Man-day', quantity: D(600), rate: D(rate), amount: D(600 * rate), sortOrder: i }));
    const wo = await prisma.workOrder.create({
      data: {
        organizationId, projectId: project.id, vendorId: vendor.id, woNo: `WO-${year}-${String((last ? parseInt(last.woNo.slice(8), 10) : 0) + 1).padStart(4, '0')}`, woDate: new Date(range.gte.getTime() - 2 * 86_400_000),
        title, startDate: range.gte, endDate: day(90), gstRate: D(0), retentionPct: D(0), tdsPct: D(1), paymentDays: 7, value: woLines.reduce((t, l) => t.add(l.amount), D(0)),
        terms: 'Labour supply at the man-day rates, paid on the head count kept at site. Tools and safety gear by the contractor.',
        status: 'APPROVED', submittedById: pm, submittedAt: range.gte, reviewedById: md.id, reviewedAt: range.gte, createdAt: range.gte,
        lines: { create: woLines },
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    const billLines = wo.lines.map((l, i) => {
      const qty = D(lines[i][2]);
      return { workOrderLineId: l.id, rate: l.rate, prevQty: D(0), thisQty: qty, uptoQty: qty, amount: qty.mul(l.rate).toDecimalPlaces(2), sortOrder: i };
    });
    const gross = billLines.reduce((t, l) => t.add(l.amount), D(0));
    const tds = gross.mul(1).div(100).toDecimalPlaces(2);
    const bill = await prisma.subcontractBill.create({
      data: {
        organizationId, projectId: project.id, workOrderId: wo.id, billNo: 1, billDate, measuredUpTo: upTo, invoiceNo, dueDate: day(7),
        grossPrevious: D(0), grossAmount: gross, grossUpto: gross, gstRate: D(0), gstAmount: D(0), retentionPct: D(0), advanceRecoveryPct: D(0), tdsPct: D(1),
        retentionAmount: D(0), advanceRecoveryAmount: D(0), tdsAmount: tds, materialRecovery: D(0), totalDeductions: tds, netPayable: gross.sub(tds),
        status: 'SUBMITTED', submittedById: pm, submittedAt: billDate, createdAt: billDate,
        lines: { create: billLines },
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'CREATED', actorId: pm, createdAt: range.gte },
        { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'APPROVED', actorId: md.id, createdAt: range.gte },
        { organizationId, entityType: 'SUBCONTRACT_BILL', entityId: bill.id, action: 'CREATED', actorId: pm, createdAt: billDate },
        { organizationId, entityType: 'SUBCONTRACT_BILL', entityId: bill.id, action: 'SUBMITTED', actorId: pm, createdAt: billDate },
      ],
    });
  }
}

async function seedMaterialApprovals(organizationId: string) {
  if (await prisma.materialApproval.count({ where: { organizationId } })) return;
  const users = new Map((await prisma.user.findMany({ where: { organizationId }, select: { id: true, email: true } })).map((u) => [u.email, u.id]));
  const by = users.get('qaqc@demo.com') ?? users.get('pm@demo.com') ?? users.get('admin@demo.com');
  const pmId = users.get('pm@demo.com') ?? by;
  const mdId = users.get('md@demo.com') ?? by;
  if (!by || !pmId || !mdId) return;
  const projects = new Map((await prisma.project.findMany({ where: { organizationId, code: { in: ['RD-2026-01', 'BL-2026-02'] } }, select: { id: true, code: true } })).map((p) => [p.code, p.id]));
  const items = new Map((await prisma.item.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((i) => [i.name, i.id]));
  const vendors = new Map((await prisma.vendor.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((v) => [v.name, v.id]));
  const year = new Date().getUTCFullYear();

  // The makes the contract lists, as each project's particular specifications name them.
  const listed: [code: string, material: string, item: string | null, makes: string[], note: string][] = [
    ['RD-2026-01', 'Bitumen VG-30', 'Bitumen VG-30', ['IOCL', 'HPCL', 'BPCL'], 'Contract, Annexure 4: list of approved makes'],
    ['RD-2026-01', 'Bitumen emulsion SS-1', 'Emulsion SS-1', ['IOCL', 'HPCL'], 'Contract, Annexure 4: list of approved makes'],
    ['RD-2026-01', 'Cement OPC 53 grade', 'OPC 53 Grade Cement', ['UltraTech', 'ACC', 'Ramco'], 'Contract, Annexure 4: list of approved makes'],
    ['RD-2026-01', 'TMT bars Fe500D', 'TMT Fe500D 12mm', ['Tata Tiscon', 'SAIL', 'JSW Neosteel'], 'Contract, Annexure 4: primary producers only'],
    ['BL-2026-02', 'Cement OPC 53 grade', 'OPC 53 Grade Cement', ['UltraTech', 'ACC'], 'Particular specifications, clause 3.2'],
    ['BL-2026-02', 'TMT bars Fe500D', 'TMT Fe500D 12mm', ['Tata Tiscon', 'SAIL'], 'Particular specifications, clause 3.4: primary producers only'],
    ['BL-2026-02', 'Concrete admixture PCE', 'Admixture PCE (Master Glenium)', ['Master Builders', 'Fosroc', 'Sika'], 'Particular specifications, clause 3.7'],
  ];
  for (const [code, material, item, makes, note] of listed) {
    const projectId = projects.get(code);
    if (!projectId) continue;
    await prisma.approvedMake.createMany({
      data: makes.map((make) => ({ organizationId, projectId, material, itemId: item ? (items.get(item) ?? null) : null, make, source: 'CONTRACT' as const, note, createdById: mdId, createdAt: day(-60) })),
    });
  }

  type Rev = { on: number; note?: string; outcome?: 'APPROVED' | 'APPROVED_AS_NOTED' | 'REVISE_RESUBMIT' | 'REJECTED'; reviewed?: number; reviewer?: string; comments?: string; ref?: string; make?: string };
  const requests: {
    code: string; kind: 'MATERIAL' | 'SAMPLE'; material: string; item?: string; boq?: string; make: string; model?: string; vendor?: string; usedFor?: string; note?: string; to: string;
    created: number; replyBy?: number; revs: Rev[]; withdrawn?: [number, string]; by?: string;
  }[] = [
    {
      code: 'BL-2026-02', kind: 'SAMPLE', material: 'Fly ash bricks 230 mm', item: 'Fly ash bricks 230mm', boq: '4.01', make: 'Maa Tarini Fly Ash Bricks', vendor: 'Kalinga Builders', usedFor: 'All 230 mm walls',
      note: 'IS 12894 class 7.5; test report for compressive strength and water absorption attached.', to: 'Lakshmi Menon, PMC', created: -48,
      revs: [{ on: -46, note: 'Twelve bricks left at the PMC office with the test report.', outcome: 'APPROVED', reviewed: -41, reviewer: 'Lakshmi Menon', ref: 'PMC/AIIMS/MA/014' }],
    },
    {
      code: 'BL-2026-02', kind: 'MATERIAL', material: 'Vitrified floor tiles 600 x 600', boq: '6.01', make: 'Kajaria', model: 'Eternity series, double charge', usedFor: 'Wards and corridors, all floors',
      note: 'Equal to the listed Somany range; slip resistance R10.', to: 'Lakshmi Menon, PMC', created: -32,
      revs: [
        { on: -30, note: 'Catalogue and two sample tiles in Ivory.', outcome: 'REVISE_RESUBMIT', reviewed: -24, reviewer: 'Lakshmi Menon', comments: 'Shade too dark for the wards. Send a lighter shade with the water absorption test certificate.', ref: 'PMC/AIIMS/MA/021' },
        { on: -20, note: 'Lighter shade (Crema) with the test certificate from the plant.', outcome: 'APPROVED_AS_NOTED', reviewed: -14, reviewer: 'Lakshmi Menon', comments: 'Approved in the matt finish only. Glossy tiles are not to be used in wards or corridors.', ref: 'PMC/AIIMS/MA/027' },
      ],
    },
    {
      code: 'BL-2026-02', kind: 'MATERIAL', material: 'TMT bars Fe500D', item: 'TMT Fe500D 12mm', boq: '3.02', make: 'Kamdhenu', model: 'Fe 500D', vendor: 'Odisha Steel & Cement Depot', usedFor: 'Slabs and beams, first floor',
      note: 'Available from stock at short notice; mill test certificate attached.', to: 'Lakshmi Menon, PMC', created: -16, by: 'pm@demo.com',
      revs: [{ on: -15, outcome: 'REJECTED', reviewed: -10, reviewer: 'Lakshmi Menon', comments: 'Not a primary producer. Only makes on the contract list (Tata Tiscon, SAIL) are to be used.', ref: 'PMC/AIIMS/MA/031' }],
    },
    {
      code: 'BL-2026-02', kind: 'MATERIAL', material: 'Fire-rated doors, 2 hours', make: 'Shakti Hormann', model: 'FD-120 steel door with vision panel', usedFor: 'Stair cores, all floors',
      note: 'As decided at the design meeting: 2-hour rating for the fire NOC. Test certificate from CBRI attached.', to: 'Ar. S. Mishra, Mishra Associates', created: -7, replyBy: -1,
      revs: [{ on: -6, note: 'Data sheet, CBRI fire test certificate and a door schedule.' }],
    },
    {
      code: 'BL-2026-02', kind: 'MATERIAL', material: 'Waterproofing for the OT block terrace', make: 'Dr. Fixit', model: 'Newcoat, two coats with fibre mesh', usedFor: 'OT block terrace',
      note: 'Specification calls for an elastomeric coating with ten years’ warranty.', to: 'Lakshmi Menon, PMC', created: -1, revs: [],
    },
    {
      code: 'RD-2026-01', kind: 'MATERIAL', material: 'Metal beam crash barrier', boq: '6.01', make: 'Tata Steel', model: 'W-beam, 3 mm, hot-dip galvanised', vendor: 'Kalinga Safety Store', usedFor: 'Bridge approaches and high embankments',
      note: 'MoRTH section 810; IRC 119.', to: 'Er. Bijay Kumar Panda, NH division', created: -4, replyBy: 7, by: 'pm@demo.com',
      revs: [{ on: -3, note: 'Catalogue, galvanising test report and a drawing of the post spacing.' }],
    },
    {
      code: 'RD-2026-01', kind: 'SAMPLE', material: 'Precast kerb stones', boq: '6.02', make: 'Utkal Precast', model: 'M30, 300 x 250 x 1000', usedFor: 'Bridge approaches',
      note: 'Cast at the Km 9 yard; cube results attached.', to: 'Er. Bijay Kumar Panda, NH division', created: -12,
      revs: [{ on: -9, note: 'Two kerb stones at the site office.', outcome: 'REVISE_RESUBMIT', reviewed: -2, reviewer: 'Er. Bijay Kumar Panda', comments: 'Edges chipped and honeycombing on one face. Recast with vibrating table and submit again.', ref: 'NH/BBSR/2026/1187' }],
    },
    {
      code: 'RD-2026-01', kind: 'MATERIAL', material: 'Bitumen emulsion SS-1', item: 'Emulsion SS-1', boq: '4.01', make: 'Hindustan Colas', usedFor: 'Tack coat', to: 'Er. Bijay Kumar Panda, NH division', created: -26,
      revs: [{ on: -25 }], withdrawn: [-20, 'IOCL emulsion is now available from the depot, and it is on the contract list.'],
    },
  ];

  const boq = new Map((await prisma.boqItem.findMany({ where: { projectId: { in: [...projects.values()] } }, select: { id: true, itemNo: true, projectId: true } })).map((b) => [`${b.projectId}:${b.itemNo}`, b.id]));
  let n = 0;
  for (const r of [...requests].sort((a, b) => a.created - b.created)) {
    const projectId = projects.get(r.code);
    if (!projectId) continue;
    const maker = (r.by && users.get(r.by)) || by;
    const last = r.revs[r.revs.length - 1];
    const status = r.withdrawn ? 'WITHDRAWN' : !last ? 'DRAFT' : (last.outcome ?? 'UNDER_REVIEW');
    n += 1;
    const m = await prisma.materialApproval.create({
      data: {
        organizationId, projectId, marNo: `MAR-${year}-${String(n).padStart(4, '0')}`, kind: r.kind, material: r.material, itemId: r.item ? (items.get(r.item) ?? null) : null,
        boqItemId: r.boq ? (boq.get(`${projectId}:${r.boq}`) ?? null) : null, make: last?.make ?? r.make, model: r.model ?? null, vendorId: r.vendor ? (vendors.get(r.vendor) ?? null) : null,
        usedFor: r.usedFor ?? null, note: r.note ?? null, toParty: r.to, replyBy: r.replyBy === undefined ? null : day(r.replyBy), status, revision: Math.max(0, r.revs.length - 1), createdById: maker, createdAt: day(r.created),
        revisions: {
          create: r.revs.map((v, i) => ({
            organizationId, revision: i, submittedOn: day(v.on), submittedById: maker, submitNote: v.note ?? null, outcome: v.outcome ?? null, reviewedOn: v.reviewed === undefined ? null : day(v.reviewed),
            reviewerName: v.reviewer ?? null, comments: v.comments ?? null, reviewRef: v.ref ?? null, recordedById: v.outcome ? maker : null, createdAt: day(v.on),
          })),
        },
      },
    });
    if (last?.outcome === 'APPROVED' || last?.outcome === 'APPROVED_AS_NOTED')
      await prisma.approvedMake.create({
        data: { organizationId, projectId, material: r.material, itemId: m.itemId, make: m.make, model: m.model, source: 'APPROVAL', approvalId: m.id, note: last.outcome === 'APPROVED_AS_NOTED' ? (last.comments ?? null) : null, createdById: maker, createdAt: day(last.reviewed ?? 0) },
      });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'MATERIAL_APPROVAL', entityId: m.id, action: 'CREATED', note: null, actorId: maker, createdAt: day(r.created) },
        ...r.revs.flatMap((v, i) => [
          { organizationId, entityType: 'MATERIAL_APPROVAL', entityId: m.id, action: i ? 'RESUBMITTED' : 'SUBMITTED', note: `R${i}`, actorId: maker, createdAt: day(v.on) },
          ...(v.outcome ? [{ organizationId, entityType: 'MATERIAL_APPROVAL', entityId: m.id, action: `REVIEWED_${v.outcome}`, note: `R${i}`, actorId: maker, createdAt: day(v.reviewed ?? v.on) }] : []),
        ]),
        ...(r.withdrawn ? [{ organizationId, entityType: 'MATERIAL_APPROVAL', entityId: m.id, action: 'WITHDRAWN', note: r.withdrawn[1], actorId: maker, createdAt: day(r.withdrawn[0]) }] : []),
      ],
    });
  }

  // The hospital's first order names its makes: the cement is on the list, the steel (Kamdhenu, rejected) is not, so the order is flagged.
  const po = await prisma.purchaseOrder.findFirst({ where: { organizationId, projectId: projects.get('BL-2026-02') }, orderBy: { poNo: 'asc' }, select: { id: true } });
  if (po) {
    await prisma.purchaseOrderLine.updateMany({ where: { purchaseOrderId: po.id, itemName: 'OPC 53 Grade Cement', make: null }, data: { make: 'UltraTech' } });
    await prisma.purchaseOrderLine.updateMany({ where: { purchaseOrderId: po.id, itemName: 'TMT Fe500D 12mm', make: null }, data: { make: 'Kamdhenu' } });
  }
}

/** Links between the road's and the hospital's activities (v6 item 114), so the Gantt has a critical path and one clash. */
async function seedActivityLinks(organizationId: string) {
  if (await prisma.activityLink.count({ where: { organizationId } })) return;
  const plan: [code: string, pred: string, succ: string, type: 'FS' | 'SS' | 'FF' | 'SF', lag: number][] = [
    ['RD-2026-01', 'Site clearance', 'Earthwork embankment', 'SS', 20],
    ['RD-2026-01', 'Earthwork embankment', 'GSB laying', 'SS', 40],
    ['RD-2026-01', 'GSB laying', 'WMM laying', 'SS', 20],
    ['RD-2026-01', 'WMM laying', 'DBM paving', 'SS', 30],
    ['RD-2026-01', 'DBM paving', 'BC paving', 'SS', 30],
    ['RD-2026-01', 'BC paving', 'Road furniture', 'FF', 30],
    ['RD-2026-01', 'Pipe culverts', 'BC paving', 'FS', 0],
    ['BL-2026-02', 'Foundation excavation', 'PCC bed', 'SS', 20],
    ['BL-2026-02', 'PCC bed', 'RCC footings and columns', 'SS', 10],
    ['BL-2026-02', 'RCC footings and columns', 'RCC slab GF', 'SS', 30],
    ['BL-2026-02', 'RCC slab GF', 'RCC slab FF', 'SS', 30],
    ['BL-2026-02', 'RCC slab GF', 'Brick masonry', 'SS', 15],
    // Planned to start the day the first floor slab ends, a day before the link allows: the Gantt shows the clash.
    ['BL-2026-02', 'RCC slab FF', 'Internal plaster', 'FS', 0],
    ['BL-2026-02', 'Internal plaster', 'Flooring', 'SS', 30],
  ];
  const projects = new Map((await prisma.project.findMany({ where: { organizationId, code: { in: ['RD-2026-01', 'BL-2026-02'] } }, select: { id: true, code: true } })).map((p) => [p.code, p.id]));
  const activities = await prisma.activity.findMany({ where: { organizationId, projectId: { in: [...projects.values()] } }, select: { id: true, name: true, projectId: true } });
  const id = (projectId: string, name: string) => activities.find((a) => a.projectId === projectId && a.name === name)?.id;
  await prisma.activityLink.createMany({
    data: plan.flatMap(([code, pred, succ, type, lagDays]) => {
      const projectId = projects.get(code);
      const p = projectId && id(projectId, pred);
      const s = projectId && id(projectId, succ);
      return projectId && p && s ? [{ organizationId, projectId, predecessorId: p, successorId: s, type, lagDays }] : [];
    }),
  });
}

/**
 * Comments and mentions (v6 item 116): a question on today's road DPR waiting in the project manager's queue, answered by
 * the engineer; a resolved thread on the hospital's first order about the cement make; and the team leader telling the
 * project manager, on the last progress review, that night work has stopped. The mentions are in the bell.
 */
async function seedComments(organizationId: string) {
  if (await prisma.comment.count({ where: { organizationId } })) return;
  const users = new Map((await prisma.user.findMany({ where: { organizationId }, select: { id: true, email: true, fullName: true } })).map((u) => [u.email, u]));
  const [pm, pm2, engineer, tl, procurement] = ['pm@demo.com', 'pm2@demo.com', 'engineer@demo.com', 'tl@demo.com', 'procurement@demo.com'].map((e) => users.get(e));
  if (!pm || !pm2 || !engineer || !tl || !procurement) return;
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);
  type Note = { by: typeof pm; body: string; mentions?: (typeof pm)[]; at: number };
  const thread = async (entityType: string, entityId: string, projectId: string, title: string, notes: Note[], resolvedBy?: typeof pm, resolvedAt?: number) => {
    const [first, ...rest] = notes;
    const root = await prisma.comment.create({
      data: {
        organizationId, entityType, entityId, projectId, authorId: first.by!.id, body: first.body, mentions: (first.mentions ?? []).map((m) => m!.id), createdAt: ago(first.at),
        ...(resolvedBy ? { resolvedById: resolvedBy.id, resolvedAt: ago(resolvedAt ?? 0) } : {}),
      },
    });
    for (const n of rest) {
      await prisma.comment.create({ data: { organizationId, entityType, entityId, projectId, parentId: root.id, authorId: n.by!.id, body: n.body, mentions: (n.mentions ?? []).map((m) => m!.id), createdAt: ago(n.at) } });
    }
    // The bell: a notice for each mention in an open thread.
    if (!resolvedBy) {
      for (const n of notes) {
        for (const m of n.mentions ?? []) {
          await prisma.notification.create({
            data: { organizationId, userId: m!.id, type: 'COMMENT', title: `${n.by!.fullName} mentioned you on ${title}`, body: n.body.slice(0, 140), projectId, entityType, entityId, createdAt: ago(n.at), dedupeKey: `COMMENT:seed:${root.id}:${m!.id}` },
          });
        }
      }
    }
  };

  const dpr = await prisma.dailyReport.findFirst({ where: { organizationId, project: { code: 'RD-2026-01' }, status: 'SUBMITTED' }, orderBy: { date: 'desc' }, select: { id: true, projectId: true, date: true } });
  if (dpr) {
    await thread('DPR', dpr.id, dpr.projectId, `Daily Progress Report of ${dpr.date.toISOString().slice(0, 10)}`, [
      { by: pm, body: `@${engineer.fullName} labour on the WMM gang is 18 against 24 yesterday. Short of hands, or moved to the culvert?`, mentions: [engineer], at: 3 },
      { by: engineer, body: 'Six went to the culvert at Km 17.4 for the top slab shuttering. They are back on WMM tomorrow morning.', at: 2 },
    ]);
  }
  const po = await prisma.purchaseOrder.findFirst({ where: { organizationId, project: { code: 'BL-2026-02' } }, orderBy: { createdAt: 'asc' }, select: { id: true, projectId: true, poNo: true } });
  if (po) {
    await thread(
      'PURCHASE_ORDER', po.id, po.projectId, `Purchase Order ${po.poNo}`,
      [
        { by: procurement, body: `@${pm2.fullName} UltraTech is not on the hospital's approved cement makes yet. Hold this line till the request comes back, or switch to ACC?`, mentions: [pm2], at: 50 },
        { by: pm2, body: 'Keep UltraTech. The PMC said on the phone it will be approved this week; the order is for next month.', at: 46 },
        { by: procurement, body: 'Noted, keeping it.', at: 45 },
      ],
      procurement, 45,
    );
  }
  const meeting = await prisma.meeting.findFirst({ where: { organizationId, project: { code: 'RD-2026-01' }, status: 'ISSUED', kind: 'PROGRESS' }, orderBy: { heldOn: 'desc' }, select: { id: true, projectId: true, meetingNo: true, title: true } });
  if (meeting) {
    await thread('MEETING', meeting.id, meeting.projectId, `${meeting.meetingNo} ${meeting.title}`, [
      { by: tl, body: `@${pm.fullName} the flagmen are on day shift only this week, so night work on the WMM stopped from Tuesday. Shall I ask the subcontractor for two more?`, mentions: [pm], at: 20 },
    ]);
  }
}
