/**
 * Demo group companies (ARCHITECTURE "Group companies"). All names and figures are invented and checked
 * against the client-name blocklist.
 *
 * Demo Infra Group is five companies on one set of sign-ins:
 * - Demo Infra Holdings, the parent (holding): the group's directors, its investments in and loan to the children,
 *   and the corporate guarantees it gives their banks.
 * - Demo Infra Projects (the demo company, seed.ts), roads, a hospital and water schemes.
 * - Demo Buildcon (construction): staff quarters at a port township, and the hospital block's finishing and MEP works
 *   on a work order from Demo Infra Projects.
 * - Demo Design Consultants (consultancy): the design of Demo Infra Projects' water scheme, the client's PMC on a
 *   riverfront promenade, and a feasibility report for four rural roads.
 * - Demo Quality Labs (quality lab): testing for its three sisters on their own sites, the same cube and density results
 *   their QA/QC records, and its bills, which the sisters hold as vendor bills (one paid, one waiting for approval).
 *
 * admin@demo.com runs the group and is the admin everywhere; md@demo.com chairs the holding and sits on every board.
 * Each child has its own people (buildcon@, design@, lab@demo.com and their teams). Every block is skipped once its
 * company has its records, so the seed is safe to run again.
 */
import { Prisma, PrismaClient, type CompanyKind, type ProjectType, type TestKind, type VendorKind } from '@prisma/client';
import { COMPANY_KIND_INFO, ROLE_KEYS, ROLE_LABELS, gstinCheckChar, isWeeklyOff, workSummary } from '@erp/shared';

const D = (v: string | number) => new Prisma.Decimal(v);
const r2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const iso = (offset: number) => day(offset).toISOString().slice(0, 10);
const year = new Date().getUTCFullYear();
const gstin = (pan: string) => `21${pan}1Z${gstinCheckChar(`21${pan}1Z`)}`;

type Weather = 'SUNNY' | 'CLOUDY' | 'RAINY' | 'WINDY' | 'HOT';

interface Person {
  email: string;
  name: string;
  role: string;
  phone: string;
}

interface CompanySeed {
  code: string;
  name: string;
  kind: CompanyKind;
  legalName: string;
  pan: string;
  cin: string;
  people: Person[];
}

/** A company being seeded: its id, its users by email and a running number per document prefix. */
interface Co {
  id: string;
  users: Map<string, string>;
  no: (prefix: string, width?: number) => string;
}

const ADMIN: Person = { email: 'admin@demo.com', name: 'Arun Sharma', role: 'ADMIN', phone: '9800000001' };
const CHAIR: Person = { email: 'md@demo.com', name: 'Rajesh Patnaik', role: 'MANAGEMENT', phone: '9800000002' };

const HOLDING: CompanySeed = {
  code: 'DEMOHOLD',
  name: 'Demo Infra Holdings Pvt Ltd',
  kind: 'HOLDING',
  legalName: 'Demo Infra Holdings Private Limited',
  pan: 'AABCH4321H',
  cin: 'U65993OR2009PTC011284',
  people: [
    ADMIN,
    CHAIR,
    { email: 'cfo@demo.com', name: 'Sunita Agarwal', role: 'MANAGEMENT', phone: '9800000031' },
    { email: 'accounts@demo.com', name: 'Mahesh Gupta', role: 'ACCOUNTS_MANAGER', phone: '9800000012' },
    { email: 'hr@demo.com', name: 'Pooja Reddy', role: 'HR_MANAGER', phone: '9800000013' },
  ],
};

const BUILDCON: CompanySeed = {
  code: 'DEMOBC',
  name: 'Demo Buildcon Pvt Ltd',
  kind: 'CONSTRUCTION',
  legalName: 'Demo Buildcon Private Limited',
  pan: 'AABCB7788K',
  cin: 'U45201OR2016PTC020311',
  people: [
    ADMIN,
    CHAIR,
    { email: 'buildcon@demo.com', name: 'Sanjay Mishra', role: 'MANAGEMENT', phone: '9800000041' },
    { email: 'bc.pm@demo.com', name: 'Nirmala Jena', role: 'PROJECT_MANAGER', phone: '9800000042' },
    { email: 'bc.pm2@demo.com', name: 'Rohit Bhuyan', role: 'PROJECT_MANAGER', phone: '9800000043' },
    { email: 'bc.engineer@demo.com', name: 'Abhishek Rout', role: 'SITE_ENGINEER', phone: '9800000044' },
    { email: 'bc.engineer2@demo.com', name: 'Swati Dash', role: 'SITE_ENGINEER', phone: '9800000045' },
    { email: 'bc.store@demo.com', name: 'Tapan Sethy', role: 'STORE_MANAGER', phone: '9800000046' },
    { email: 'bc.qs@demo.com', name: 'Lipsa Parida', role: 'QUANTITY_SURVEYOR', phone: '9800000047' },
    { email: 'bc.purchase@demo.com', name: 'Kunal Senapati', role: 'PROCUREMENT_MANAGER', phone: '9800000048' },
    { email: 'bc.accounts@demo.com', name: 'Rina Das', role: 'ACCOUNTS_MANAGER', phone: '9800000049' },
  ],
};

const DESIGN: CompanySeed = {
  code: 'DEMODC',
  name: 'Demo Design Consultants Pvt Ltd',
  kind: 'CONSULTANCY',
  legalName: 'Demo Design Consultants Private Limited',
  pan: 'AABCC3344M',
  cin: 'U74210OR2014PTC017842',
  people: [
    ADMIN,
    CHAIR,
    { email: 'design@demo.com', name: 'Ar. Subhashree Mohapatra', role: 'MANAGEMENT', phone: '9800000051' },
    { email: 'dc.pm@demo.com', name: 'Er. Prakash Tripathy', role: 'PROJECT_MANAGER', phone: '9800000052' },
    { email: 'dc.re@demo.com', name: 'Er. Ankita Panda', role: 'PROJECT_MANAGER', phone: '9800000053' },
    { email: 'dc.engineer@demo.com', name: 'Sourav Behera', role: 'SITE_ENGINEER', phone: '9800000054' },
    { email: 'dc.design@demo.com', name: 'Er. Farhan Ali', role: 'SITE_ENGINEER', phone: '9800000055' },
    { email: 'dc.qs@demo.com', name: 'Madhusmita Nanda', role: 'QUANTITY_SURVEYOR', phone: '9800000056' },
    { email: 'dc.accounts@demo.com', name: 'Jyoti Prakash Sahu', role: 'ACCOUNTS_MANAGER', phone: '9800000057' },
  ],
};

const LAB: CompanySeed = {
  code: 'DEMOLAB',
  name: 'Demo Quality Labs Pvt Ltd',
  kind: 'QUALITY_LAB',
  legalName: 'Demo Quality Labs Private Limited',
  pan: 'AABCQ5678F',
  cin: 'U74200OR2019PTC031245',
  people: [
    ADMIN,
    CHAIR,
    { email: 'qaqc@demo.com', name: 'Sneha Iyer', role: 'QA_QC_ENGINEER', phone: '9800000011' },
    { email: 'lab@demo.com', name: 'Dr. Meera Sahoo', role: 'MANAGEMENT', phone: '9800000018' },
    { email: 'lab.pm@demo.com', name: 'Er. Debashish Panigrahi', role: 'PROJECT_MANAGER', phone: '9800000061' },
    { email: 'lab.tech@demo.com', name: 'Rakesh Nayak', role: 'SITE_ENGINEER', phone: '9800000062' },
    { email: 'lab.tech2@demo.com', name: 'Pinky Moharana', role: 'SITE_ENGINEER', phone: '9800000063' },
    { email: 'lab.accounts@demo.com', name: 'Smita Behera', role: 'ACCOUNTS_MANAGER', phone: '9800000064' },
  ],
};

/** The sisters as each other's vendors: [name, kinds, PAN, contact, phone, address]. */
const SISTER_VENDORS: Record<string, [string, VendorKind[], string, string, string, string]> = {
  DEMOLAB: ['Demo Quality Labs Pvt Ltd', ['SERVICE'], 'AABCQ5678F', 'Dr. Meera Sahoo', '9800000018', 'Plot 14, Industrial Estate, Mancheswar, Bhubaneswar'],
  DEMOBC: ['Demo Buildcon Pvt Ltd', ['SUBCONTRACTOR'], 'AABCB7788K', 'Sanjay Mishra', '9800000041', 'Buildcon House, Chandrasekharpur, Bhubaneswar'],
  DEMODC: ['Demo Design Consultants Pvt Ltd', ['SERVICE'], 'AABCC3344M', 'Ar. Subhashree Mohapatra', '9800000051', '3rd floor, Janpath Towers, Bhubaneswar'],
};

/**
 * The group above the demo company (made once) with its admin, and the lab's people, so the group's sign-ins work as soon
 * as the demo company does. The rest of the group comes with `seedGroupCompanies`, after the demo company's projects.
 */
export async function seedDemoGroup(prisma: PrismaClient, demoOrgId: string, passwordHash: string) {
  let { groupId } = await prisma.organization.findUniqueOrThrow({ where: { id: demoOrgId }, select: { groupId: true } });
  if (!groupId) {
    groupId = (await prisma.companyGroup.create({ data: { name: 'Demo Infra Group' } })).id;
    await prisma.organization.update({
      where: { id: demoOrgId },
      data: { groupId, kind: 'CONSTRUCTION', legalName: 'Demo Infra Projects Private Limited', pan: 'AABCD1234E', cin: 'U45200OR2012PTC015678', gstin: gstin('AABCD1234E') },
    });
  }
  const admin = await prisma.login.findUniqueOrThrow({ where: { email: ADMIN.email } });
  await prisma.groupAdmin.upsert({ where: { groupId_loginId: { groupId, loginId: admin.id } }, update: {}, create: { groupId, loginId: admin.id } });
  await ensureCompany(prisma, groupId, LAB, passwordHash);
  return groupId;
}

/** The holding, the building company and the consultancy, and every company's records (see the top of this file). */
export async function seedGroupCompanies(prisma: PrismaClient, demoOrgId: string, passwordHash: string) {
  const groupId = await seedDemoGroup(prisma, demoOrgId, passwordHash);

  const holding = await ensureCompany(prisma, groupId, HOLDING, passwordHash);
  await seedHolding(prisma, holding);

  await seedLab(prisma, await ensureCompany(prisma, groupId, LAB, passwordHash));

  const woNo = await demoWorkOrder(prisma, demoOrgId);

  const buildcon = await ensureCompany(prisma, groupId, BUILDCON, passwordHash);
  await seedBuildcon(prisma, buildcon, woNo);
  await addBuildconDelays(prisma, buildcon);

  const design = await ensureCompany(prisma, groupId, DESIGN, passwordHash);
  await seedDesign(prisma, design);

  await demoSisterBills(prisma, demoOrgId);
}

/** A company of the group with the standard roles and its people on their sign-ins (made once; people refreshed). */
async function ensureCompany(prisma: PrismaClient, groupId: string, c: CompanySeed, passwordHash: string): Promise<Co> {
  const existing = await prisma.organization.findUnique({ where: { code: c.code }, select: { id: true } });
  const org =
    existing ??
    (await prisma.organization.create({
      data: {
        code: c.code, name: c.name, groupId, kind: c.kind, legalName: c.legalName, pan: c.pan, cin: c.cin, gstin: gstin(c.pan),
        modulesOff: [...COMPANY_KIND_INFO[c.kind].modulesOff], paymentsNeedRequest: true, progressFromDpr: true, ordersNeedApprovedChoice: true,
      },
    }));
  if (existing) await prisma.organization.update({ where: { id: org.id }, data: { groupId } });
  const roles = new Map<string, string>();
  for (const key of ROLE_KEYS) {
    const r = await prisma.role.upsert({ where: { organizationId_key: { organizationId: org.id, key } }, update: {}, create: { organizationId: org.id, key, name: ROLE_LABELS[key] } });
    roles.set(key, r.id);
  }
  const users = new Map<string, string>();
  for (const p of c.people) {
    const login = await prisma.login.upsert({ where: { email: p.email }, update: {}, create: { email: p.email, passwordHash } });
    const u = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: p.email } },
      update: { fullName: p.name, roleId: roles.get(p.role)!, isActive: true, loginId: login.id },
      create: { organizationId: org.id, email: p.email, fullName: p.name, phone: p.phone, roleId: roles.get(p.role)!, loginId: login.id },
    });
    users.set(p.email, u.id);
  }
  for (const u of await prisma.user.findMany({ where: { organizationId: org.id }, select: { id: true, email: true } })) users.set(u.email, u.id);
  const counters = new Map<string, number>();
  const no = (prefix: string, width = 4) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${year}-${String(n).padStart(width, '0')}`;
  };
  return { id: org.id, users, no };
}

// Building blocks shared by the companies

interface BoqLine {
  no: string;
  text: string;
  unit: string;
  rate: number;
  qty: number;
  activity: string;
  start: number;
  end: number;
  /** Approved progress before the DPRs below, spread over the planned window */
  done?: number[];
  /** Quantity on a working day, written as a line of each DPR while the window is open */
  daily?: number;
  at?: string;
}

/** An activity outside the BOQ (a consultant's site work), recorded on the DPR only */
interface ExtraActivity {
  name: string;
  unit: string;
  qty: number;
  start: number;
  end: number;
  daily: number;
  at?: string;
}

interface DprSeed {
  /** Working days of DPRs up to today; today's waits for the PM */
  days: number;
  crew: [string, number, string][];
  machines: [string, number][];
  issues?: Record<number, string>;
  tests?: Record<number, string>;
  received?: Record<number, string>;
  safety: string;
  next: string;
}

interface ProjectSeed {
  code: string;
  name: string;
  type: ProjectType;
  client: string;
  clientDept?: string;
  clientAddress: string;
  clientPan?: string;
  consultant?: string;
  location: string;
  site: string;
  workOrderNo?: string;
  description: string;
  start: number;
  end: number;
  pm: string;
  engineer: string;
  members: string[];
  terms: { agreementNo: string; agreementAgo: number; gst: number; retention: number; sd: number; tds: number; gstTds: number; cess: number; days: number };
  boq: BoqLine[];
  extra?: ExtraActivity[];
  dpr?: DprSeed;
}

const audit = (prisma: PrismaClient, co: Co, entityType: string, entityId: string, steps: [string, string, number, string?][]) =>
  prisma.auditLog.createMany({ data: steps.map(([action, actorId, ago, note]) => ({ organizationId: co.id, entityType, entityId, action, actorId, note: note ?? null, createdAt: day(ago) })) });

const WEATHER: Weather[] = ['SUNNY', 'CLOUDY', 'HOT', 'SUNNY', 'CLOUDY', 'SUNNY', 'HOT'];
const SWING = [1, 1.15, 0.85, 1.1, 0.9, 1.05, 0.95];
const dailyQty = (daily: number, i: number) => Math.max(1, Math.round(daily * SWING[i % SWING.length]));
/** The last `n` working days up to today, oldest first, as days from today */
const workingDays = (n: number) => {
  const out: number[] = [];
  for (let i = 0; out.length < n; i--) if (i === 0 || !isWeeklyOff(iso(i))) out.unshift(i);
  return out;
};

/** A project with its contract, BOQ, activities, approved progress, DPRs with work lines, and labour attendance. */
async function addProject(prisma: PrismaClient, co: Co, p: ProjectSeed) {
  const u = (email: string) => co.users.get(email)!;
  const value = p.boq.reduce((s, b) => s.add(D(b.rate).mul(b.qty)), D(0));
  const client = await prisma.client.upsert({
    where: { organizationId_name: { organizationId: co.id, name: p.client } },
    update: {},
    create: {
      organizationId: co.id, name: p.client, department: p.clientDept ?? null, billingAddress: p.clientAddress, stateCode: '21',
      ...(p.clientPan ? { pan: p.clientPan, gstin: gstin(p.clientPan) } : {}),
    },
  });
  const t = p.terms;
  const project = await prisma.project.create({
    data: {
      organizationId: co.id, code: p.code, name: p.name, type: p.type, status: 'ACTIVE', clientId: client.id, clientName: p.client, consultantName: p.consultant ?? null,
      location: p.location, siteAddress: p.site, workOrderNo: p.workOrderNo ?? null, description: p.description, startDate: day(p.start), endDate: day(p.end),
      contractValue: r2(value), projectManagerId: u(p.pm), agreementNo: t.agreementNo, agreementDate: day(-t.agreementAgo), gstRate: D(t.gst), retentionPct: D(t.retention),
      securityDepositPct: D(t.sd), tdsPct: D(t.tds), gstTdsPct: D(t.gstTds), labourCessPct: D(t.cess), clientPaymentDays: t.days,
      members: { create: [...new Set([p.engineer, ...p.members])].map((m) => ({ userId: u(m) })) },
    },
  });
  await addWorks(prisma, co, project.id, p);
  return project;
}

/** BOQ, activities, history and DPRs of a project (also used for the lab's first project, which had none). */
async function addWorks(prisma: PrismaClient, co: Co, projectId: string, p: ProjectSeed) {
  const u = (email: string) => co.users.get(email)!;
  const pm = u(p.pm);
  const engineer = u(p.engineer);
  const activities = new Map<string, { id: string; unit: string }>();
  let order = 0;
  for (const b of p.boq) {
    const boq = await prisma.boqItem.create({ data: { organizationId: co.id, projectId, itemNo: b.no, description: b.text, unit: b.unit, rate: D(b.rate), originalQty: D(b.qty), sortOrder: order } });
    const a = await prisma.activity.create({
      data: { organizationId: co.id, projectId, boqItemId: boq.id, name: b.activity, unit: b.unit, plannedQty: D(b.qty), plannedStart: day(b.start), plannedEnd: day(b.end), responsibleId: engineer, sortOrder: order++ },
    });
    activities.set(b.activity, { id: a.id, unit: b.unit });
    const done = b.done ?? [];
    const last = Math.min(b.end, -12);
    for (const [i, qty] of done.entries()) {
      const date = day(Math.round(b.start + ((i + 1) * (last - b.start)) / (done.length + 1)));
      const at = new Date(date.getTime() + 18 * 3_600_000);
      await prisma.progressEntry.create({
        data: {
          organizationId: co.id, projectId, activityId: a.id, date, quantity: D(qty), status: 'APPROVED', submittedById: engineer, submittedAt: at, reviewedById: pm, reviewedAt: at,
          reviewNote: 'Checked', remarks: b.at ?? null, location: b.at ?? null, manpowerCount: 10 + i * 2,
        },
      });
    }
  }
  for (const x of p.extra ?? []) {
    const a = await prisma.activity.create({
      data: { organizationId: co.id, projectId, name: x.name, unit: x.unit, plannedQty: D(x.qty), plannedStart: day(x.start), plannedEnd: day(x.end), responsibleId: engineer, sortOrder: order++ },
    });
    activities.set(x.name, { id: a.id, unit: x.unit });
  }
  if (!p.dpr) return;

  const d = p.dpr;
  const working = [...p.boq.filter((b) => b.daily), ...(p.extra ?? [])];
  for (const [k, offset] of workingDays(d.days).entries()) {
    const approved = offset < 0;
    const date = day(offset);
    const submittedAt = new Date(date.getTime() + 19 * 3_600_000);
    const reviewedAt = approved ? new Date(date.getTime() + 33 * 3_600_000) : null;
    const review = { status: approved ? 'APPROVED' : 'SUBMITTED', submittedById: engineer, submittedAt, reviewedById: approved ? pm : null, reviewedAt, reviewNote: approved ? 'Seen' : null } as const;
    const lines = working
      .filter((w) => w.start <= offset && w.end >= offset)
      .map((w) => ({ activity: 'activity' in w ? w.activity : w.name, qty: dailyQty(w.daily!, k), at: w.at ?? null }));
    const ago = -offset;
    const dpr = await prisma.dailyReport.create({
      data: {
        organizationId: co.id, projectId, date, weather: WEATHER[ago % WEATHER.length], siteCondition: 'Workable',
        manpower: d.crew.map(([category, count]) => ({ category, count: Math.max(1, count + ((k * 3) % 4) - 1) })),
        machinery: d.machines.map(([name, hours]) => ({ name, hours })),
        workExecuted: workSummary(lines.map((l) => ({ activityName: l.activity, parentActivityName: null, quantity: l.qty, unit: activities.get(l.activity)!.unit, location: l.at }))) || 'General site works',
        materialReceived: d.received?.[ago] ?? null, testsConducted: d.tests?.[ago] ?? null, safetyObservations: d.safety, issues: d.issues?.[ago] ?? null, nextDayPlan: d.next, ...review,
      },
    });
    for (const [i, l] of lines.entries()) {
      await prisma.progressEntry.create({
        data: { organizationId: co.id, projectId, activityId: activities.get(l.activity)!.id, dailyReportId: dpr.id, sortOrder: i, date, quantity: D(l.qty), location: l.at, ...review },
      });
    }
    await audit(prisma, co, 'DPR', dpr.id, [
      ['SUBMITTED', engineer, offset],
      ...(approved ? [['APPROVED', pm, Math.min(offset + 1, 0)] as [string, string, number]] : []),
    ]);
    if (!approved)
      await prisma.notification.create({
        data: {
          organizationId: co.id, userId: pm, type: 'SUBMISSION_SUBMITTED', projectId, entityType: 'DPR', entityId: dpr.id, title: 'DPR awaiting your approval',
          body: `${p.name}: today's DPR is waiting for you.`, createdAt: submittedAt,
        },
      });
    const sheetLines = d.crew.map(([category, count, contractor], i) => ({ contractor, category, count: Math.max(1, count + ((k * 3) % 4) - 1), sortOrder: i }));
    await prisma.attendanceSheet.create({
      data: { organizationId: co.id, projectId, date, totalWorkers: sheetLines.reduce((s, l) => s + l.count, 0), recordedById: engineer, lines: { create: sheetLines } },
    });
  }
}

interface BillSeed {
  billNo: number;
  upTo: number;
  billAgo: number;
  sentAgo: number;
  remarks: string;
  certified?: { ago: number; no: string };
  paid?: { ago: number; ref: string; note: string };
}

/**
 * RA bill `billNo` of a project from its approved progress up to `upTo` days ago: one approved measurement sheet per
 * BOQ item for what the earlier bills did not cover, then the bill on the project's terms, approved and sent, and the
 * client's certificate and payment when given.
 */
async function addBill(prisma: PrismaClient, co: Co, projectCode: string, b: BillSeed, people: { qs: string; approver: string; accounts: string }) {
  const project = await prisma.project.findFirstOrThrow({ where: { organizationId: co.id, code: projectCode }, include: { boqItems: { orderBy: { sortOrder: 'asc' } } } });
  const [qs, approver, accounts] = [co.users.get(people.qs)!, co.users.get(people.approver)!, co.users.get(people.accounts)!];
  const upTo = day(-b.upTo);
  const prev = await prisma.raBill.findFirst({ where: { projectId: project.id, billNo: b.billNo - 1 }, include: { items: true } });
  const progress = await prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId: project.id, status: 'APPROVED', date: { lte: upTo } }, _sum: { quantity: true } });
  const acts = await prisma.activity.findMany({ where: { projectId: project.id, boqItemId: { not: null } }, select: { id: true, boqItemId: true } });
  const lines = project.boqItems.flatMap((boq) => {
    const upto = progress.filter((g) => acts.some((a) => a.id === g.activityId && a.boqItemId === boq.id)).reduce((s, g) => s.add(g._sum.quantity ?? 0), D(0));
    const before = prev?.items.find((i) => i.boqItemId === boq.id)?.uptoQty ?? D(0);
    const thisQty = upto.sub(before);
    return thisQty.gt(0) ? [{ boq, prevQty: before, thisQty, uptoQty: upto, amount: r2(thisQty.mul(boq.rate)) }] : [];
  });
  if (!lines.length) return null;
  const gross = lines.reduce((s, l) => s.add(l.amount), D(0));
  const grossPrevious = prev?.grossUpto ?? D(0);
  const of = (pct: Prisma.Decimal) => r2(gross.mul(pct).div(100));
  const amounts = {
    retentionAmount: of(project.retentionPct), securityDepositAmount: of(project.securityDepositPct), advanceRecoveryAmount: D(0),
    tdsAmount: of(project.tdsPct), gstTdsAmount: of(project.gstTdsPct), labourCessAmount: of(project.labourCessPct),
  };
  const gst = of(project.gstRate);
  const totalDeductions = Object.values(amounts).reduce((s, v) => s.add(v), D(0));
  const netPayable = gross.add(gst).sub(totalDeductions);
  const stage = b.paid ? 'PAID' : b.certified ? 'CERTIFIED' : 'SENT';
  const bill = await prisma.raBill.create({
    data: {
      organizationId: co.id, projectId: project.id, billNo: b.billNo, billDate: day(-b.billAgo), measuredUpTo: upTo, remarks: b.remarks,
      grossPrevious, grossAmount: gross, grossUpto: grossPrevious.add(gross), gstRate: project.gstRate, gstAmount: gst,
      retentionPct: project.retentionPct, securityDepositPct: project.securityDepositPct, advanceRecoveryPct: D(0), tdsPct: project.tdsPct, gstTdsPct: project.gstTdsPct,
      labourCessPct: project.labourCessPct, ...amounts, totalDeductions, netPayable, stage, sentDate: day(-b.sentAgo),
      ...(b.certified ? { certifiedDate: day(-b.certified.ago), certificateNo: b.certified.no, claimedGross: gross, claimedNet: netPayable } : {}),
      ...(b.paid ? { paidDate: day(-b.paid.ago) } : {}),
      status: 'APPROVED', submittedById: qs, submittedAt: day(-b.billAgo), reviewedById: approver, reviewedAt: day(-b.billAgo + 1), createdAt: day(-b.billAgo),
      items: {
        create: lines.map((l, i) => ({
          boqItemId: l.boq.id, boqQty: l.boq.originalQty, rate: l.boq.rate, prevQty: l.prevQty, thisQty: l.thisQty, uptoQty: l.uptoQty, amount: l.amount,
          certifiedQty: b.certified ? l.thisQty : null, sortOrder: i,
        })),
      },
    },
  });
  for (const l of lines) {
    const mbNo = co.no('MB');
    const sheet = await prisma.measurementSheet.create({
      data: {
        organizationId: co.id, projectId: project.id, boqItemId: l.boq.id, mbNo, date: upTo, location: project.location ?? 'Site', totalQty: l.thisQty, raBillId: bill.id,
        status: 'APPROVED', submittedById: qs, submittedAt: upTo, reviewedById: approver, reviewedAt: day(-b.upTo + 1), createdAt: upTo,
        lines: { create: [{ description: `${l.boq.description}, as measured with the client's engineer`, quantity: l.thisQty, sortOrder: 0 }] },
      },
    });
    await audit(prisma, co, 'MEASUREMENT', sheet.id, [['SUBMITTED', qs, -b.upTo], ['APPROVED', approver, -b.upTo + 1]]);
  }
  await audit(prisma, co, 'BILL', bill.id, [
    ['CREATED', qs, -b.billAgo], ['SUBMITTED', qs, -b.billAgo], ['APPROVED', approver, -b.billAgo + 1], ['SENT', qs, -b.sentAgo, `Sent to ${project.clientName}`],
    ...(b.certified ? [['CERTIFIED', accounts, -b.certified.ago, `Certificate ${b.certified.no}`] as [string, string, number, string]] : []),
  ]);
  if (b.paid) {
    const receipt = await prisma.receipt.create({
      data: {
        organizationId: co.id, projectId: project.id, billId: bill.id, kind: 'BILL', receiptDate: day(-b.paid.ago), amount: netPayable, mode: 'BANK', reference: b.paid.ref,
        ...amounts, otherDeduction: D(0), remarks: b.paid.note, createdById: accounts, createdAt: day(-b.paid.ago),
      },
    });
    await audit(prisma, co, 'BILL', bill.id, [['PAYMENT_RECEIVED', accounts, -b.paid.ago, `₹${netPayable.toFixed(2)} received`]]);
    await audit(prisma, co, 'RECEIPT', receipt.id, [['CREATED', accounts, -b.paid.ago]]);
  }
  return bill;
}

interface VendorSeed {
  name: string;
  kinds: VendorKind[];
  pan: string;
  contact: string;
  phone: string;
  address: string;
  msme?: 'MICRO' | 'SMALL';
}

async function vendorOf(prisma: PrismaClient, co: Co, v: VendorSeed) {
  return (
    (await prisma.vendor.findFirst({ where: { organizationId: co.id, name: v.name } })) ??
    prisma.vendor.create({
      data: {
        organizationId: co.id, name: v.name, kinds: v.kinds, gstin: gstin(v.pan), pan: v.pan, stateCode: '21', msmeCategory: v.msme ?? null,
        contactPerson: v.contact, phone: v.phone, address: v.address, bankAccountName: v.name,
      },
    })
  );
}

const itemOf = async (prisma: PrismaClient, co: Co, name: string, unit: string, category: string | null = null) =>
  (await prisma.item.findFirst({ where: { organizationId: co.id, name, unit } })) ?? prisma.item.create({ data: { organizationId: co.id, name, unit, category, isFuel: name === 'Diesel' } });

/** [item, specification, unit, quantity, rate, GST %] */
type BuyLine = [string, string, string, number, number, number];

interface BuySeed {
  projectCode: string;
  vendor: VendorSeed;
  other?: { vendor: VendorSeed; rates: number[]; freight: number };
  lines: BuyLine[];
  /** Days ago: request, order, receipt */
  mrAgo: number;
  poAgo: number;
  grnAgo: number;
  /** Share of each line received */
  received: number[];
  freight: number;
  paymentDays: number;
  challan: string;
  vehicle: string;
  bill?: { invoiceNo: string; ago: number; approved: boolean };
  people: { requester: string; approver: string; buyer: string; keeper: string; accounts: string };
}

/** A purchase from request to vendor bill: approved request, quotations, approved PO, GRN and the vendor's invoice. */
async function addPurchase(prisma: PrismaClient, co: Co, b: BuySeed) {
  const project = await prisma.project.findFirstOrThrow({ where: { organizationId: co.id, code: b.projectCode } });
  const [requester, approver, buyer, keeper, accounts] = [b.people.requester, b.people.approver, b.people.buyer, b.people.keeper, b.people.accounts].map((e) => co.users.get(e)!);
  const mr = await prisma.materialRequest.create({
    data: {
      organizationId: co.id, projectId: project.id, requestNo: co.no('MR'), requiredDate: day(-b.grnAgo), priority: 'HIGH', remarks: 'For the next pours',
      status: 'APPROVED', submittedById: requester, submittedAt: day(-b.mrAgo), reviewedById: project.projectManagerId, reviewedAt: day(-b.mrAgo), createdAt: day(-b.mrAgo),
      items: { create: b.lines.map(([itemName, specification, unit, qty], i) => ({ itemName, specification, unit, quantity: D(qty), sortOrder: i })) },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  await audit(prisma, co, 'MATERIAL_REQUEST', mr.id, [['SUBMITTED', requester, -b.mrAgo], ['APPROVED', project.projectManagerId ?? approver, -b.mrAgo]]);
  const vendor = await vendorOf(prisma, co, b.vendor);
  const quote = (vendorId: string, rates: number[], freight: number) =>
    prisma.quotation.create({
      data: {
        organizationId: co.id, projectId: project.id, materialRequestId: mr.id, vendorId, quoteDate: day(-b.mrAgo + 1), validUntil: day(-b.mrAgo + 31), deliveryDays: 4, freight: D(freight),
        paymentTerms: `${b.paymentDays} days from invoice`, createdById: buyer, createdAt: day(-b.mrAgo + 1),
        lines: { create: rates.map((rate, i) => ({ materialRequestItemId: mr.items[i].id, rate: D(rate), gstRate: D(b.lines[i][5]) })) },
      },
    });
  const q = await quote(vendor.id, b.lines.map((l) => l[4]), b.freight);
  if (b.other) await quote((await vendorOf(prisma, co, b.other.vendor)).id, b.other.rates, b.other.freight);
  const poLines = mr.items.map((it, i) => {
    const [, , , , rate, gstRate] = b.lines[i];
    const amount = r2(it.quantity.mul(rate));
    return { materialRequestItemId: it.id, itemName: it.itemName, specification: it.specification, unit: it.unit, quantity: it.quantity, rate: D(rate), gstRate: D(gstRate), amount, gstAmount: r2(amount.mul(gstRate).div(100)), sortOrder: i };
  });
  const subtotal = poLines.reduce((s, l) => s.add(l.amount), D(0));
  const gstAmount = poLines.reduce((s, l) => s.add(l.gstAmount), D(0));
  const po = await prisma.purchaseOrder.create({
    data: {
      organizationId: co.id, projectId: project.id, vendorId: vendor.id, poNo: co.no('PO'), poDate: day(-b.poAgo), materialRequestId: mr.id, quotationId: q.id, deliveryBy: day(-b.grnAgo),
      deliveryAddress: project.siteAddress ?? 'Site store', paymentTerms: `${b.paymentDays} days from invoice`, paymentDays: b.paymentDays, freight: D(b.freight), subtotal, gstAmount,
      total: subtotal.add(gstAmount).add(b.freight), status: 'APPROVED', submittedById: buyer, submittedAt: day(-b.poAgo), reviewedById: approver, reviewedAt: day(-b.poAgo), createdAt: day(-b.poAgo),
      lines: { create: poLines },
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  await audit(prisma, co, 'PURCHASE_ORDER', po.id, [['CREATED', buyer, -b.poAgo], ['SUBMITTED', buyer, -b.poAgo], ['APPROVED', approver, -b.poAgo]]);
  const got = po.lines.map((l, i) => ({ line: l, qty: l.quantity.mul(b.received[i] ?? 1).toDecimalPlaces(0) })).filter((g) => g.qty.gt(0));
  const grnLines = [];
  for (const [i, g] of got.entries()) {
    const item = await itemOf(prisma, co, g.line.itemName, g.line.unit);
    await prisma.item.update({ where: { id: item.id }, data: { rate: g.line.rate } });
    grnLines.push({ organizationId: co.id, projectId: project.id, itemId: item.id, type: 'RECEIPT' as const, date: day(-b.grnAgo), quantity: g.qty, materialRequestItemId: g.line.materialRequestItemId, purchaseOrderLineId: g.line.id, sortOrder: i });
  }
  const grn = await prisma.stockEntry.create({
    data: {
      organizationId: co.id, projectId: project.id, type: 'RECEIPT', entryNo: co.no('GRN'), date: day(-b.grnAgo), createdById: keeper, createdAt: day(-b.grnAgo),
      materialRequestId: mr.id, purchaseOrderId: po.id, vendorId: vendor.id, supplier: vendor.name, challanNo: b.challan, vehicleNo: b.vehicle, lines: { create: grnLines },
    },
  });
  await audit(prisma, co, 'STOCK', grn.id, [['CREATED', keeper, -b.grnAgo, grn.entryNo]]);
  if (!b.bill) return;
  const billLines = got.map((g, i) => {
    const amount = r2(g.qty.mul(g.line.rate));
    return { purchaseOrderLineId: g.line.id, quantity: g.qty, rate: g.line.rate, gstRate: g.line.gstRate, amount, gstAmount: r2(amount.mul(g.line.gstRate).div(100)), sortOrder: i };
  });
  const bSub = billLines.reduce((s, l) => s.add(l.amount), D(0));
  const bGst = billLines.reduce((s, l) => s.add(l.gstAmount), D(0));
  const ago = b.bill.ago;
  const bill = await prisma.vendorBill.create({
    data: {
      organizationId: co.id, projectId: project.id, vendorId: vendor.id, purchaseOrderId: po.id, kind: 'PO', billNo: co.no('VB'), invoiceNo: b.bill.invoiceNo, invoiceDate: day(-ago),
      dueDate: day(-ago + b.paymentDays), freight: D(b.freight), subtotal: bSub, gstAmount: bGst, total: bSub.add(bGst).add(b.freight), matched: true, exceptions: [],
      status: b.bill.approved ? 'APPROVED' : 'SUBMITTED', submittedById: accounts, submittedAt: day(-ago), reviewedById: b.bill.approved ? approver : null, reviewedAt: b.bill.approved ? day(-ago + 1) : null,
      createdAt: day(-ago), lines: { create: billLines },
    },
  });
  await audit(prisma, co, 'VENDOR_BILL', bill.id, [['CREATED', accounts, -ago], ['SUBMITTED', accounts, -ago], ...(b.bill.approved ? [['APPROVED', approver, -ago + 1] as [string, string, number]] : [])]);
}

/** A request the PM has not looked at yet */
async function addRequest(prisma: PrismaClient, co: Co, projectCode: string, by: string, lines: [string, string, string, number][], remarks: string) {
  const project = await prisma.project.findFirstOrThrow({ where: { organizationId: co.id, code: projectCode } });
  const mr = await prisma.materialRequest.create({
    data: {
      organizationId: co.id, projectId: project.id, requestNo: co.no('MR'), requiredDate: day(6), priority: 'NORMAL', remarks, status: 'SUBMITTED', submittedById: co.users.get(by)!,
      submittedAt: new Date(), items: { create: lines.map(([itemName, specification, unit, qty], i) => ({ itemName, specification, unit, quantity: D(qty), sortOrder: i })) },
    },
  });
  await audit(prisma, co, 'MATERIAL_REQUEST', mr.id, [['SUBMITTED', co.users.get(by)!, 0]]);
}

/** Opening stock a month ago, issues on the last three days and minimum levels: [item, unit, opening, minimum, issued a day] */
async function addStore(prisma: PrismaClient, co: Co, projectCode: string, keeperEmail: string, issuedTo: string, activity: string, rows: [string, string, number, number, number][]) {
  const project = await prisma.project.findFirstOrThrow({ where: { organizationId: co.id, code: projectCode } });
  const keeper = co.users.get(keeperEmail)!;
  const act = await prisma.activity.findFirst({ where: { projectId: project.id, name: activity }, select: { id: true } });
  const items = [];
  for (const [name, unit, qty, min, perDay] of rows) items.push({ item: await itemOf(prisma, co, name, unit, name === 'Diesel' ? 'Fuel' : null), qty, min, perDay });
  const entry = async (type: 'ADJUSTMENT' | 'ISSUE', offset: number, prefix: string, extra: Partial<Prisma.StockEntryUncheckedCreateInput>, lines: { itemId: string; quantity: Prisma.Decimal }[]) => {
    const e = await prisma.stockEntry.create({
      data: {
        organizationId: co.id, projectId: project.id, type, entryNo: co.no(prefix), date: day(offset), createdById: keeper, createdAt: day(offset), ...extra,
        lines: { create: lines.map((l, i) => ({ organizationId: co.id, projectId: project.id, itemId: l.itemId, type, date: day(offset), quantity: l.quantity, sortOrder: i })) },
      },
    });
    await audit(prisma, co, 'STOCK', e.id, [['CREATED', keeper, offset, e.entryNo]]);
  };
  await entry('ADJUSTMENT', -30, 'ADJ', { remarks: 'Opening stock as per physical count' }, items.map((i) => ({ itemId: i.item.id, quantity: D(i.qty) })));
  for (const i of items) await prisma.stockMinLevel.create({ data: { organizationId: co.id, projectId: project.id, itemId: i.item.id, minQty: D(i.min), updatedById: keeper } });
  for (let k = 3; k >= 1; k--)
    await entry('ISSUE', -k, 'ISS', { issuedTo, activityId: act?.id ?? null }, items.filter((i) => i.perDay > 0).map((i) => ({ itemId: i.item.id, quantity: D(-i.perDay) })));
}

/** [code, name, designation, department, email or null, posted at (project code) or null] */
type StaffRow = [string, string, string, string, string | null, string | null];

/** Employees, and the last 30 days of attendance for those posted at a site (marked by its PM). */
async function addStaff(prisma: PrismaClient, co: Co, rows: StaffRow[]) {
  const projects = new Map((await prisma.project.findMany({ where: { organizationId: co.id }, select: { id: true, code: true, projectManagerId: true } })).map((p) => [p.code, p]));
  for (const [n, [code, fullName, designation, department, email, posting]] of rows.entries()) {
    const project = posting ? projects.get(posting) : undefined;
    const e = await prisma.employee.create({
      data: {
        organizationId: co.id, employeeCode: code, fullName, designation, department, userId: email ? co.users.get(email) ?? null : null, projectId: project?.id ?? null,
        joinedOn: day(-300 - n * 47), employmentType: 'PERMANENT',
      },
    });
    if (!project?.projectManagerId) continue;
    const marks: Prisma.StaffAttendanceCreateManyInput[] = [];
    for (let i = 30; i >= 1; i--) {
      if (isWeeklyOff(iso(-i))) continue;
      const roll = (n * 7 + i * 13) % 23;
      marks.push({ organizationId: co.id, employeeId: e.id, date: day(-i), projectId: project.id, status: roll === 0 ? 'ABSENT' : roll === 5 ? 'HALF_DAY' : 'PRESENT', markedById: project.projectManagerId, createdAt: day(-i) });
    }
    await prisma.staffAttendance.createMany({ data: marks });
  }
}

/** The standard approval matrix of a new company, as the demo company's: management any amount, PMs within limits. */
async function addApprovalRules(prisma: PrismaClient, co: Co) {
  if (await prisma.approvalRule.count({ where: { organizationId: co.id } })) return;
  const roles = new Map((await prisma.role.findMany({ where: { organizationId: co.id }, select: { id: true, key: true } })).map((r) => [r.key, r.id]));
  const site = ['PROGRESS', 'DPR', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT'];
  const money = ['SUPPLIER_CHOICE', 'PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'PAYMENT_REQUEST'];
  const rows: [string, string, number | null][] = [
    ...site.map((t) => ['MANAGEMENT', t, null] as [string, string, null]),
    ...site.map((t) => ['PROJECT_MANAGER', t, t === 'EXPENSE' ? 25000 : null] as [string, string, number | null]),
    ['ACCOUNTS_MANAGER', 'EXPENSE', null],
    ['MANAGEMENT', 'BILL', null],
    ['PROJECT_MANAGER', 'BILL', 5000000],
    ...money.flatMap((t) => [['MANAGEMENT', t, null], ['PROJECT_MANAGER', t, 500000]] as [string, string, number | null][]),
    ...['MANAGEMENT', 'PROJECT_MANAGER', 'QA_QC_ENGINEER'].map((r) => [r, 'INSPECTION', null] as [string, string, null]),
  ];
  await prisma.approvalRule.createMany({
    data: rows.filter(([role]) => roles.has(role)).map(([role, submissionType, max]) => ({ organizationId: co.id, roleId: roles.get(role)!, submissionType, maxAmount: max === null ? null : D(max) })),
    skipDuplicates: true,
  });
}

/** Site expenses: [days ago, category, description, vendor, amount, GST %, approved] */
async function addExpenses(prisma: PrismaClient, co: Co, projectCode: string, by: string, approver: string, rows: [number, string, string, string, number, number, boolean][]) {
  const project = await prisma.project.findFirstOrThrow({ where: { organizationId: co.id, code: projectCode } });
  for (const [ago, category, description, vendor, amount, gstRate, approved] of rows) {
    const gstAmount = r2(D(amount).mul(gstRate).div(100));
    const x = await prisma.expense.create({
      data: {
        organizationId: co.id, projectId: project.id, expenseNo: co.no('EXP'), date: day(-ago), category: category as never, description, vendor, amount: D(amount), gstRate: D(gstRate),
        gstAmount, totalAmount: D(amount).add(gstAmount), paymentMode: amount > 5000 ? 'UPI' : 'CASH', status: approved ? 'APPROVED' : 'SUBMITTED',
        submittedById: co.users.get(by)!, submittedAt: day(-ago), reviewedById: approved ? co.users.get(approver)! : null, reviewedAt: approved ? day(-ago + 1) : null, createdAt: day(-ago),
      },
    });
    await audit(prisma, co, 'EXPENSE', x.id, [['SUBMITTED', co.users.get(by)!, -ago], ...(approved ? [['APPROVED', co.users.get(approver)!, -ago + 1] as [string, string, number]] : [])]);
  }
}

// Demo Infra Holdings

/**
 * The parent: its directors and officers, the equity it holds in the children and the working-capital loan it gave
 * Demo Buildcon (approved vouchers; this month's interest waits for the chairman), and its corporate guarantees.
 */
async function seedHolding(prisma: PrismaClient, co: Co) {
  if (await prisma.employee.count({ where: { organizationId: co.id } })) return;
  await addStaff(prisma, co, [
    ['GRP-001', 'Rajesh Patnaik', 'Chairman and managing director', 'Board', 'md@demo.com', null],
    ['GRP-002', 'Sunita Agarwal', 'Group chief financial officer', 'Finance', 'cfo@demo.com', null],
    ['GRP-003', 'Ashok Kar', 'Company secretary', 'Secretarial', null, null],
    ['GRP-004', 'Mahesh Gupta', 'Group accounts head', 'Finance', 'accounts@demo.com', null],
    ['GRP-005', 'Pooja Reddy', 'Group HR head', 'Human resources', 'hr@demo.com', null],
  ]);
  const accounts = co.users.get('accounts@demo.com')!;
  const chair = co.users.get('md@demo.com')!;
  const account = (key: string, name: string, group: 'BANK_ACCOUNTS' | 'CAPITAL_ACCOUNT' | 'INVESTMENTS' | 'LOANS_ADVANCES_ASSET' | 'INDIRECT_INCOMES' | 'INDIRECT_EXPENSES', isSystem = false) =>
    prisma.ledgerAccount.upsert({ where: { organizationId_key: { organizationId: co.id, key } }, create: { organizationId: co.id, key, name, group, isSystem }, update: {}, select: { id: true } });
  const bank = await account('BANK', 'Bank Account', 'BANK_ACCOUNTS', true);
  const capital = await account('ACCOUNT:group-capital', 'Share capital - Promoters', 'CAPITAL_ACCOUNT');
  const fy = (d: Date) => {
    const y = d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0);
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  };
  let seq = 0;
  const voucher = async (no: string, type: 'RECEIPT' | 'PAYMENT', ago: number, narration: string, amount: number, dr: string, cr: string, approved: boolean, reference: string) => {
    const date = day(-ago);
    await prisma.bookVoucher.create({
      data: {
        organizationId: co.id, voucherNo: `${no}/${fy(date)}/${String(++seq).padStart(4, '0')}`, type, date, source: 'MANUAL', reference, narration, amount,
        status: approved ? 'APPROVED' : 'SUBMITTED', preparedById: accounts, submittedAt: date, ...(approved ? { approvedById: chair, approvedAt: day(-ago + 1) } : {}),
        lines: { createMany: { data: [{ organizationId: co.id, accountId: dr, debit: amount, sortOrder: 0 }, { organizationId: co.id, accountId: cr, credit: amount, sortOrder: 1 }] } },
      },
    });
  };
  await voucher('RV', 'RECEIPT', 120, "Promoters' share capital", 60_000_000, bank.id, capital.id, true, 'RTGS SBIN0001234');
  for (const [key, name, amount, ago, ref] of [
    ['ACCOUNT:group-inv-projects', 'Investment in Demo Infra Projects Pvt Ltd (equity)', 25_000_000, 110, 'Board resolution 4/2026'],
    ['ACCOUNT:group-inv-buildcon', 'Investment in Demo Buildcon Pvt Ltd (equity)', 12_000_000, 108, 'Board resolution 5/2026'],
    ['ACCOUNT:group-inv-design', 'Investment in Demo Design Consultants Pvt Ltd (equity)', 4_000_000, 108, 'Board resolution 5/2026'],
    ['ACCOUNT:group-inv-lab', 'Investment in Demo Quality Labs Pvt Ltd (equity)', 3_500_000, 95, 'Board resolution 6/2026'],
  ] as const) {
    const inv = await account(key, name, 'INVESTMENTS');
    await voucher('PV', 'PAYMENT', ago, `Subscription to the rights issue of ${name.replace(/^Investment in | \(equity\)$/g, '')}`, amount, inv.id, bank.id, true, ref);
  }
  const loan = await account('ACCOUNT:group-loan-buildcon', 'Loan to Demo Buildcon Pvt Ltd', 'LOANS_ADVANCES_ASSET');
  await voucher('PV', 'PAYMENT', 75, 'Working-capital loan to Demo Buildcon at 10% a year, repayable in 24 months', 8_000_000, loan.id, bank.id, true, 'Loan agreement GRP/L/2026/02');
  const interest = await account('ACCOUNT:group-interest', 'Interest on loans to group companies', 'INDIRECT_INCOMES');
  await voucher('RV', 'RECEIPT', 40, 'Interest from Demo Buildcon for the month', 66_667, bank.id, interest.id, true, 'NEFT from Demo Buildcon');
  await voucher('RV', 'RECEIPT', 2, 'Interest from Demo Buildcon for the month', 66_667, bank.id, interest.id, false, 'NEFT from Demo Buildcon');

  const docs: { kind: 'BANK_GUARANTEE' | 'INSURANCE' | 'LICENCE'; category: string; reference: string; issuer: string; beneficiary?: string; amount?: number; issuedOn: number; expiresOn: number; note?: string }[] = [
    { kind: 'BANK_GUARANTEE', category: 'Corporate guarantee', reference: 'CG/2026/01', issuer: 'Demo Infra Holdings Pvt Ltd', beneficiary: 'State Bank of India, Cuttack Main (cash credit of Demo Infra Projects)', amount: 150_000_000, issuedOn: -210, expiresOn: 520, note: 'Covers the cash credit and BG limits of Demo Infra Projects' },
    { kind: 'BANK_GUARANTEE', category: 'Corporate guarantee', reference: 'CG/2026/02', issuer: 'Demo Infra Holdings Pvt Ltd', beneficiary: 'HDFC Bank, Saheed Nagar (overdraft of Demo Buildcon)', amount: 40_000_000, issuedOn: -90, expiresOn: 640 },
    { kind: 'INSURANCE', category: "Directors' and officers' liability", reference: 'DO/2026/5512', issuer: 'New India Assurance', amount: 50_000_000, issuedOn: -200, expiresOn: 165, note: 'Covers the directors of all five companies' },
    { kind: 'LICENCE', category: 'Annual return and financial statements (ROC)', reference: 'MGT-7 / AOC-4', issuer: 'Registrar of Companies, Cuttack', issuedOn: -330, expiresOn: 35, note: 'File for all five companies after the AGM' },
  ];
  for (const r of docs) {
    const doc = await prisma.complianceDoc.create({
      data: {
        organizationId: co.id, kind: r.kind, category: r.category, reference: r.reference, issuer: r.issuer, beneficiary: r.beneficiary ?? null, amount: r.amount ? D(r.amount) : null,
        issuedOn: day(r.issuedOn), expiresOn: day(r.expiresOn), note: r.note ?? null, createdById: accounts,
      },
    });
    await audit(prisma, co, 'COMPLIANCE_DOC', doc.id, [['CREATED', accounts, r.issuedOn, `${r.category} ${r.reference}`]]);
  }
}

// Demo Quality Labs

const LAB_TERMS = { gst: 18, retention: 0, sd: 0, tds: 2, gstTds: 0, cess: 0, days: 30 };
const LAB_DPR = (place: string): DprSeed => ({
  days: 6,
  crew: [['Lab technician', 2, 'Departmental'], ['Field assistant', 3, 'Departmental']],
  machines: [['Compression testing machine', 3], ['Site vehicle', 6]],
  safety: `Gloves and goggles at the capping station; ${place}`,
  next: 'Collect the cubes due for 7 and 28 days; field tests as called by the site',
});

const LAB_PROJECTS: ProjectSeed[] = [
  {
    code: 'LAB-01', name: 'Third-party testing, Puri highway widening', type: 'ROAD', client: 'Demo Infra Projects Pvt Ltd', clientPan: 'AABCD1234E',
    clientAddress: 'Demo Infra Projects, Km 16+400 site office, Khordha', location: 'Khordha, Odisha', site: 'Field lab at the Km 16+400 site office, Khordha',
    description: 'Soil, aggregate, bitumen and concrete tests for Demo Infra Projects on its Km 12 to 28 widening (RD-2026-01).', start: -60, end: 300,
    pm: 'lab.pm@demo.com', engineer: 'lab.tech@demo.com', members: ['qaqc@demo.com'],
    terms: { agreementNo: 'DIP/QA/2026/07', agreementAgo: 65, ...LAB_TERMS },
    boq: [
      { no: '1.01', text: 'Field dry density by sand replacement', unit: 'Nos', rate: 650, qty: 600, activity: 'Field density tests', start: -60, end: 300, done: [62, 70, 58], daily: 6, at: 'Km 14+000 to 15+000' },
      { no: '1.02', text: 'Proctor test (MDD and OMC) of borrow soil', unit: 'Nos', rate: 1800, qty: 40, activity: 'Proctor tests', start: -60, end: 200, done: [6, 5] },
      { no: '2.01', text: 'Aggregate gradation, flakiness and elongation index', unit: 'Nos', rate: 1500, qty: 120, activity: 'Aggregate tests', start: -50, end: 280, done: [12, 10], daily: 1, at: 'Crusher stockpile, Km 16+400' },
      { no: '3.01', text: 'Bitumen content and Marshall stability of DBM', unit: 'Nos', rate: 3200, qty: 80, activity: 'Marshall tests', start: -12, end: 300, done: [2], daily: 1, at: 'Hot mix plant, Km 18' },
      { no: '4.01', text: 'Compressive strength of concrete cubes, set of 3', unit: 'Set', rate: 450, qty: 150, activity: 'Cube tests', start: -60, end: 300, done: [10, 8] },
    ],
    dpr: { ...LAB_DPR('sand cone kit checked'), tests: { 1: 'FDD at Km 14+300 and 14+550: 98.6% and 97.4% of MDD' } },
  },
  {
    code: 'LAB-02', name: 'Material testing, District Hospital Block B', type: 'BUILDING', client: 'Demo Infra Projects Pvt Ltd', clientPan: 'AABCD1234E',
    clientAddress: 'Demo Infra Projects, Plot 221, Saheed Nagar, Bhubaneswar', location: 'Cuttack, Odisha', site: 'Cube room at gate 2, District Hospital campus, Cuttack',
    description: 'Cubes, steel, cement and masonry units for Demo Infra Projects on the hospital block (BL-2026-02).', start: -90, end: 300,
    pm: 'lab.pm@demo.com', engineer: 'lab.tech2@demo.com', members: ['qaqc@demo.com', 'lab.tech@demo.com'],
    terms: { agreementNo: 'DIP/QA/2026/03', agreementAgo: 95, ...LAB_TERMS },
    boq: [
      { no: '1.01', text: 'Compressive strength of concrete cubes, set of 3', unit: 'Set', rate: 450, qty: 400, activity: 'Cube tests', start: -90, end: 300, done: [38, 36, 34], daily: 3, at: 'Cube room, gate 2' },
      { no: '2.01', text: 'Reinforcement steel: tensile, elongation, bend and rebend', unit: 'Nos', rate: 2200, qty: 60, activity: 'Steel tests', start: -90, end: 200, done: [8, 6] },
      { no: '3.01', text: 'Bricks and blocks: compressive strength and water absorption', unit: 'Nos', rate: 1200, qty: 50, activity: 'Masonry unit tests', start: -30, end: 200, done: [4] },
      { no: '4.01', text: 'Cement: setting time, soundness and mortar cube strength', unit: 'Nos', rate: 3500, qty: 30, activity: 'Cement tests', start: -90, end: 280, done: [5, 4] },
    ],
    dpr: { ...LAB_DPR('curing tank lids kept shut'), tests: { 2: 'Cubes of the plinth beams cast and tagged (3 sets)' } },
  },
  {
    code: 'LAB-03', name: 'Cube and steel testing, port township staff quarters', type: 'BUILDING', client: 'Demo Buildcon Pvt Ltd', clientPan: 'AABCB7788K',
    clientAddress: 'Demo Buildcon, Buildcon House, Chandrasekharpur, Bhubaneswar', location: 'Paradip, Odisha', site: 'Sample collection at the Block A site office, Paradip',
    description: 'Cubes, steel and AAC blocks for Demo Buildcon on the 48 staff quarters (BC-2026-01).', start: -150, end: 380,
    pm: 'lab.pm@demo.com', engineer: 'lab.tech@demo.com', members: [],
    terms: { agreementNo: 'DBC/LAB/2026/01', agreementAgo: 155, ...LAB_TERMS },
    boq: [
      { no: '1.01', text: 'Compressive strength of concrete cubes, set of 3', unit: 'Set', rate: 450, qty: 500, activity: 'Cube tests', start: -150, end: 380, done: [48, 52, 50] },
      { no: '2.01', text: 'Reinforcement steel: tensile, elongation, bend and rebend', unit: 'Nos', rate: 2200, qty: 80, activity: 'Steel tests', start: -150, end: 300, done: [10, 8] },
      { no: '3.01', text: 'AAC blocks: compressive strength, density and drying shrinkage', unit: 'Nos', rate: 1400, qty: 40, activity: 'AAC block tests', start: -40, end: 250, done: [3] },
    ],
  },
  {
    code: 'LAB-04', name: 'Geotechnical investigation and testing, riverfront promenade', type: 'BUILDING', client: 'Demo Design Consultants Pvt Ltd', clientPan: 'AABCC3344M',
    clientAddress: 'Demo Design Consultants, 3rd floor, Janpath Towers, Bhubaneswar', location: 'Cuttack, Odisha', site: 'Riverfront promenade site, Cuttack',
    description: 'Boreholes, plate load tests and concrete testing for the PMC Demo Design Consultants runs on the riverfront promenade (DC-2026-02).', start: -190, end: 340,
    pm: 'lab.pm@demo.com', engineer: 'lab.tech2@demo.com', members: [],
    terms: { agreementNo: 'DDC/SUB/2026/04', agreementAgo: 195, ...LAB_TERMS },
    boq: [
      { no: '1.01', text: 'Boreholes 150 mm, 15 m deep, with SPT and undisturbed samples', unit: 'Nos', rate: 38000, qty: 12, activity: 'Boreholes', start: -190, end: -120, done: [6, 6] },
      { no: '1.02', text: 'Laboratory tests on soil samples', unit: 'Nos', rate: 1600, qty: 96, activity: 'Soil laboratory tests', start: -180, end: -100, done: [40, 36] },
      { no: '1.03', text: 'Plate load test, 300 mm plate', unit: 'Nos', rate: 42000, qty: 3, activity: 'Plate load tests', start: -170, end: -110, done: [2] },
      { no: '2.01', text: 'Compressive strength of concrete cubes, set of 3', unit: 'Set', rate: 450, qty: 200, activity: 'Cube tests', start: -100, end: 340, done: [20, 18, 16] },
    ],
  },
];

/** [project, activity, kind, title, location, sampled (days ago), spec, unit, min, max, readings: [label, days after, value]] */
type LabTest = [string, string, TestKind, string, string, number, string, string, string | null, string | null, [string, number, string | null][]];
const LAB_TESTS: LabTest[] = [
  // The same results the demo company's QA/QC records on its own sites
  ['LAB-01', 'Field density tests', 'FIELD_DENSITY', 'Embankment top layer compaction, sand replacement', 'Km 12+000 to 12+500, LHS', 12, 'Not less than 97% of MDD for the top 500 mm (MoRTH 305)', '%', '97', null, [['Result', 0, '98.2']]],
  ['LAB-01', 'Field density tests', 'FIELD_DENSITY', 'Embankment top layer compaction, sand replacement', 'Km 12+500 to 13+000, LHS', 4, 'Not less than 97% of MDD for the top 500 mm (MoRTH 305)', '%', '97', null, [['Result', 0, '95.4']]],
  ['LAB-01', 'Aggregate tests', 'AGGREGATE', 'Combined flakiness and elongation, 20 mm', 'Crusher stockpile, Km 16+400', 9, 'Not more than 35% (MoRTH 500)', '%', null, '35', [['Result', 1, '27.8']]],
  ['LAB-01', 'Marshall tests', 'BITUMEN', 'DBM bitumen content, first day of paving', 'Hot mix plant, Km 18', 3, 'Between 4.5% and 5.0% by weight of mix (job mix formula)', '%', '4.5', '5.0', [['Result', 1, '4.7']]],
  ['LAB-02', 'Cube tests', 'CONCRETE_CUBE', 'M25 cubes, GF slab bays 1 to 4', 'Ground floor slab', 34, 'Not less than 25 N/mm² at 28 days (IS 456)', 'N/mm²', '25', null, [['7 days', 7, '18.9'], ['28 days', 28, '28.6']]],
  ['LAB-02', 'Cube tests', 'CONCRETE_CUBE', 'M25 cubes, columns C1 to C8', 'Columns, ground to first floor', 10, 'Not less than 25 N/mm² at 28 days (IS 456)', 'N/mm²', '25', null, [['7 days', 7, '16.2'], ['28 days', 28, null]]],
  ['LAB-02', 'Steel tests', 'STEEL', 'TMT Fe500D 12 mm, heat 6614', 'Steel yard, gate 2', 16, 'Tensile strength not less than 565 N/mm², elongation 16% (IS 1786)', 'N/mm²', '565', null, [['Result', 2, '612']]],
  ['LAB-02', 'Masonry unit tests', 'BRICK', 'Fly ash bricks, lot 3', 'Stack at gate 2', 6, 'Compressive strength not less than 3.5 N/mm² (IS 1077)', 'N/mm²', '3.5', null, [['Result', 3, '2.9']]],
  ['LAB-03', 'Cube tests', 'CONCRETE_CUBE', 'M25 cubes, Block A first floor slab', 'Block A, first floor slab', 33, 'Not less than 25 N/mm² at 28 days (IS 456)', 'N/mm²', '25', null, [['7 days', 7, '16.1'], ['28 days', 28, '23.8']]],
  ['LAB-03', 'Cube tests', 'CONCRETE_CUBE', 'M25 cubes, Block A second floor columns', 'Block A, second floor columns', 9, 'Not less than 25 N/mm² at 28 days (IS 456)', 'N/mm²', '25', null, [['7 days', 7, '18.2'], ['28 days', 28, null]]],
  ['LAB-03', 'Steel tests', 'STEEL', 'TMT Fe500D 16 mm, heat 7720', 'Steel yard, Block A', 11, 'Tensile strength not less than 565 N/mm², elongation 16% (IS 1786)', 'N/mm²', '565', null, [['Result', 2, '598']]],
  ['LAB-04', 'Boreholes', 'SOIL', 'SPT at 6 m, borehole BH-7', 'Promenade chainage 0+420', 140, 'N value for the design bearing capacity of 150 kN/m²', 'blows', '15', null, [['Result', 0, '18']]],
  ['LAB-04', 'Cube tests', 'CONCRETE_CUBE', 'M30 cubes, retaining wall panel 6', 'Retaining wall, panel 6', 12, 'Not less than 30 N/mm² at 28 days (IS 456)', 'N/mm²', '30', null, [['7 days', 7, '22.4'], ['28 days', 28, null]]],
];

/**
 * The lab's four engagements with its sisters (the road and hospital of Demo Infra Projects, Demo Buildcon's staff
 * quarters, the riverfront PMC of Demo Design Consultants), its people and staff, tests with results, consumables and
 * bills: the road's first bill paid by Demo Infra Projects, the others sent.
 */
async function seedLab(prisma: PrismaClient, co: Co) {
  // The lab's first project took a name of the client's papers; it is the sister's highway now.
  await prisma.project.updateMany({
    where: { organizationId: co.id, code: 'LAB-01' },
    data: { name: LAB_PROJECTS[0].name, location: LAB_PROJECTS[0].location, description: LAB_PROJECTS[0].description, siteAddress: LAB_PROJECTS[0].site },
  });
  if (await prisma.project.count({ where: { organizationId: co.id, code: 'LAB-02' } })) return;
  await addApprovalRules(prisma, co);
  const lab01 = await prisma.project.findFirst({ where: { organizationId: co.id, code: 'LAB-01' } });
  for (const p of LAB_PROJECTS) {
    if (p.code !== 'LAB-01') {
      await addProject(prisma, co, p);
      continue;
    }
    if (!lab01) {
      await addProject(prisma, co, p);
      continue;
    }
    // An earlier seed made it without works; give it its BOQ, contract, team and DPRs.
    const client = await prisma.client.upsert({
      where: { organizationId_name: { organizationId: co.id, name: p.client } },
      update: {},
      create: { organizationId: co.id, name: p.client, billingAddress: p.clientAddress, stateCode: '21', pan: p.clientPan, gstin: gstin(p.clientPan!) },
    });
    const value = p.boq.reduce((s, b) => s.add(D(b.rate).mul(b.qty)), D(0));
    await prisma.project.update({
      where: { id: lab01.id },
      data: {
        clientId: client.id, clientName: p.client, contractValue: r2(value), projectManagerId: co.users.get(p.pm)!, agreementNo: p.terms.agreementNo, agreementDate: day(-p.terms.agreementAgo),
        gstRate: D(p.terms.gst), tdsPct: D(p.terms.tds), clientPaymentDays: p.terms.days, startDate: day(p.start), endDate: day(p.end),
      },
    });
    for (const m of [p.engineer, ...p.members])
      await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: lab01.id, userId: co.users.get(m)! } }, update: {}, create: { projectId: lab01.id, userId: co.users.get(m)! } });
    await addWorks(prisma, co, lab01.id, p);
  }

  for (const [code, activity, kind, title, location, ago, spec, unit, min, max, readings] of LAB_TESTS) {
    const project = await prisma.project.findFirstOrThrow({ where: { organizationId: co.id, code }, include: { activities: { where: { name: activity } }, members: true } });
    const by = co.users.get(code === 'LAB-02' || code === 'LAB-04' ? 'lab.tech2@demo.com' : 'lab.tech@demo.com')!;
    const last = readings[readings.length - 1][2];
    const v = last === null ? null : Number(last);
    const result = v === null ? 'PENDING' : (min !== null && v < Number(min)) || (max !== null && v > Number(max)) ? 'FAIL' : 'PASS';
    const test = await prisma.qualityTest.create({
      data: {
        organizationId: co.id, projectId: project.id, activityId: project.activities[0]?.id ?? null, testNo: co.no('TST'), kind, title, location, sampledOn: day(-ago), specification: spec, unit,
        specMin: min === null ? null : D(min), specMax: max === null ? null : D(max), result, createdById: by, createdAt: day(-ago),
        remarks: result === 'FAIL' ? 'Reported to the client the same day' : null,
        readings: { create: readings.map(([label, after, value], i) => ({ label, dueOn: day(-ago + after), value: value === null ? null : D(value), testedOn: value === null ? null : day(-ago + after), sortOrder: i })) },
      },
    });
    await audit(prisma, co, 'QUALITY_TEST', test.id, [['CREATED', by, -ago]]);
  }

  await addStore(prisma, co, 'LAB-02', 'lab.tech2@demo.com', 'Cube room', 'Cube tests', [
    ['Sulphur capping compound', 'Kg', 40, 10, 1.5],
    ['Standard sand (IS 650)', 'Kg', 75, 25, 0],
    ['Distilled water', 'Ltr', 120, 40, 6],
  ]);
  await addStore(prisma, co, 'LAB-01', 'lab.tech@demo.com', 'Field lab', 'Field density tests', [
    ['Calibrated sand for FDD', 'Kg', 300, 80, 18],
    ['Diesel', 'Ltr', 160, 50, 12],
  ]);
  await addPurchase(prisma, co, {
    projectCode: 'LAB-02',
    vendor: { name: 'Utkal Scientific Suppliers', kinds: ['SUPPLIER'], pan: 'AAKFU2290L', contact: 'S. K. Rath', phone: '9437300112', address: 'Link Road, Cuttack', msme: 'MICRO' },
    other: { vendor: { name: 'Kalinga Lab Equipments', kinds: ['SUPPLIER'], pan: 'AAKFK8823P', contact: 'B. Swain', phone: '9437300245', address: 'Unit 3, Bhubaneswar' }, rates: [94, 3150], freight: 600 },
    lines: [['Sulphur capping compound', 'Pre-mixed, 25 kg bags', 'Kg', 100, 88, 18], ['Cube moulds 150 mm', 'Cast iron, IS 10086', 'Nos', 12, 2950, 18]],
    mrAgo: 16, poAgo: 14, grnAgo: 9, received: [1, 1], freight: 0, paymentDays: 30, challan: 'USS/2026/418', vehicle: 'OD-05-L-2231',
    bill: { invoiceNo: 'USS/26-27/0418', ago: 8, approved: true },
    people: { requester: 'lab.tech2@demo.com', approver: 'lab@demo.com', buyer: 'lab.pm@demo.com', keeper: 'lab.tech2@demo.com', accounts: 'lab.accounts@demo.com' },
  });
  await addStaff(prisma, co, [
    ['DQL-001', 'Dr. Meera Sahoo', 'Director and head of laboratory', 'Management', 'lab@demo.com', null],
    ['DQL-002', 'Er. Debashish Panigrahi', 'Quality manager', 'Testing', 'lab.pm@demo.com', null],
    ['DQL-003', 'Rakesh Nayak', 'Senior lab technician', 'Testing', 'lab.tech@demo.com', 'LAB-01'],
    ['DQL-004', 'Pinky Moharana', 'Lab technician', 'Testing', 'lab.tech2@demo.com', 'LAB-02'],
    ['DQL-005', 'Smita Behera', 'Accounts executive', 'Accounts', 'lab.accounts@demo.com', null],
    ['DQL-006', 'Bhagyadhar Sethi', 'Field assistant', 'Testing', null, 'LAB-01'],
    ['DQL-007', 'Mamata Pradhan', 'Field assistant', 'Testing', null, 'LAB-02'],
    ['DQL-008', 'Jitendra Barik', 'Driller (geotechnical)', 'Testing', null, 'LAB-04'],
  ]);
  const people = { qs: 'lab.pm@demo.com', approver: 'lab@demo.com', accounts: 'lab.accounts@demo.com' };
  await addBill(prisma, co, 'LAB-01', { billNo: 1, upTo: 32, billAgo: 30, sentAgo: 29, remarks: 'Tests to the end of last month', certified: { ago: 20, no: 'DIP/QA/CERT/011' } }, people);
  await addBill(prisma, co, 'LAB-02', { billNo: 1, upTo: 60, billAgo: 58, sentAgo: 57, remarks: 'Tests to the end of the second month', certified: { ago: 45, no: 'DIP/QA/CERT/007' }, paid: { ago: 30, ref: 'HDFC N2026-118842', note: 'NEFT from Demo Infra Projects' } }, people);
  await addBill(prisma, co, 'LAB-02', { billNo: 2, upTo: 25, billAgo: 23, sentAgo: 22, remarks: 'Tests to the end of last month' }, people);
  await addBill(prisma, co, 'LAB-03', { billNo: 1, upTo: 40, billAgo: 38, sentAgo: 37, remarks: 'Cubes and steel to date', certified: { ago: 28, no: 'DBC/QA/2026/014' }, paid: { ago: 12, ref: 'HDFC N2026-131907', note: 'NEFT from Demo Buildcon' } }, people);
  await addBill(prisma, co, 'LAB-04', { billNo: 1, upTo: 110, billAgo: 105, sentAgo: 104, remarks: 'Geotechnical investigation, report submitted', certified: { ago: 90, no: 'DDC/LAB/C/02' }, paid: { ago: 70, ref: 'ICIC N2026-077120', note: 'NEFT from Demo Design Consultants' } }, people);
}

// Demo Infra Projects' side: the work order to Demo Buildcon and the sisters as vendors

const HOSPITAL_FINISHES: BoqLine[] = [
  { no: '1.01', text: 'Electrical wiring in FR PVC conduit, light and power points', unit: 'Point', rate: 1350, qty: 2400, activity: 'Electrical conduiting and wiring', start: -35, end: 150, done: [220, 260], daily: 38, at: 'First floor, wards 3 and 4' },
  { no: '1.02', text: 'LT panels, DBs and earthing', unit: 'LS', rate: 1850000, qty: 1, activity: 'Panels and earthing', start: 60, end: 200 },
  { no: '2.01', text: 'Internal water supply in CPVC with fittings', unit: 'Point', rate: 1850, qty: 640, activity: 'Plumbing', start: -30, end: 160, done: [60], daily: 7, at: 'Ground floor, OPD toilets' },
  { no: '2.02', text: 'Fire hydrant and sprinkler piping, MS C class', unit: 'Rmt', rate: 1650, qty: 1800, activity: 'Fire fighting piping', start: -5, end: 180, daily: 24, at: 'Basement to first floor shaft' },
  { no: '3.01', text: 'Internal plaster 12 mm CM 1:6 (labour and material)', unit: 'Sqm', rate: 215, qty: 14500, activity: 'Internal plaster', start: 30, end: 100 },
  { no: '3.02', text: 'Laying vitrified tiles 600x600, tiles by the main contractor', unit: 'Sqm', rate: 420, qty: 6800, activity: 'Tile laying', start: 70, end: 130 },
];

/** Demo Infra Projects' work order to Demo Buildcon for the hospital block's finishes and MEP, approved; returns its number. */
async function demoWorkOrder(prisma: PrismaClient, organizationId: string): Promise<string | null> {
  const [name, kinds, pan, contact, phone, address] = SISTER_VENDORS.DEMOBC;
  const existing = await prisma.workOrder.findFirst({ where: { organizationId, vendor: { name } }, select: { woNo: true } });
  if (existing) return existing.woNo;
  const project = await prisma.project.findFirst({ where: { organizationId, code: 'BL-2026-02' } });
  const [pm, md] = await Promise.all(['pm2@demo.com', 'md@demo.com'].map(async (email) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id));
  if (!project || !pm || !md) return null;
  const vendor = await sisterVendor(prisma, organizationId, name, kinds, pan, contact, phone, address);
  const last = await prisma.workOrder.findFirst({ where: { organizationId, woNo: { startsWith: `WO-${year}-` } }, orderBy: { woNo: 'desc' }, select: { woNo: true } });
  const woNo = `WO-${year}-${String((last ? parseInt(last.woNo.slice(8), 10) : 0) + 1).padStart(4, '0')}`;
  const lines = HOSPITAL_FINISHES.map((b, i) => ({ description: b.text, unit: b.unit, quantity: D(b.qty), rate: D(b.rate), amount: r2(D(b.rate).mul(b.qty)), sortOrder: i }));
  const wo = await prisma.workOrder.create({
    data: {
      organizationId, projectId: project.id, vendorId: vendor.id, woNo, woDate: day(-45), title: 'Finishes and MEP works, Block B', startDate: day(-40), endDate: day(260),
      gstRate: D(18), retentionPct: D(5), tdsPct: D(1), paymentDays: 30, value: lines.reduce((s, l) => s.add(l.amount), D(0)),
      terms: 'Measured monthly with our QS; tiles, sanitary ware and light fittings issued free by us.', remarks: 'Placed on our sister company after comparing two outside quotes',
      status: 'APPROVED', submittedById: pm, submittedAt: day(-46), reviewedById: md, reviewedAt: day(-45), createdAt: day(-46), lines: { create: lines },
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'SUBMITTED', actorId: pm, createdAt: day(-46) },
      { organizationId, entityType: 'WORK_ORDER', entityId: wo.id, action: 'APPROVED', actorId: md, createdAt: day(-45) },
    ],
  });
  return woNo;
}

const sisterVendor = async (prisma: PrismaClient, organizationId: string, name: string, kinds: VendorKind[], pan: string, contact: string, phone: string, address: string) =>
  (await prisma.vendor.findFirst({ where: { organizationId, name } })) ??
  prisma.vendor.create({ data: { organizationId, name, kinds, gstin: gstin(pan), pan, stateCode: '21', contactPerson: contact, phone, address, bankAccountName: name } });

/**
 * A sister's RA bill held by the company it billed as a vendor bill, line for line: [buyer org, buyer project, seller
 * code, seller project, bill no, approved, paid on (days ago) or null].
 */
async function mirrorBill(prisma: PrismaClient, buyerOrg: string, buyerProject: string, seller: keyof typeof SISTER_VENDORS, sellerProject: string, billNo: number, approved: boolean, paidAgo: number | null) {
  const sellerOrg = await prisma.organization.findUnique({ where: { code: seller }, select: { id: true } });
  const project = await prisma.project.findFirst({ where: { organizationId: buyerOrg, code: buyerProject } });
  if (!sellerOrg || !project) return;
  const ra = await prisma.raBill.findFirst({ where: { organizationId: sellerOrg.id, billNo, project: { code: sellerProject } }, include: { items: { include: { boqItem: true }, orderBy: { sortOrder: 'asc' } } } });
  if (!ra) return;
  const invoiceNo = `${seller === 'DEMOLAB' ? 'DQL' : 'DDC'}/${sellerProject}/RA-${billNo}`;
  if (await prisma.vendorBill.count({ where: { organizationId: buyerOrg, invoiceNo } })) return;
  const user = async (key: string) => (await prisma.user.findFirst({ where: { organizationId: buyerOrg, role: { key } }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
  const [accounts, approver] = [await user('ACCOUNTS_MANAGER'), project.projectManagerId ?? (await user('MANAGEMENT'))];
  if (!accounts || !approver) return;
  const [name, kinds, pan, contact, phone, address] = SISTER_VENDORS[seller];
  const vendor = await sisterVendor(prisma, buyerOrg, name, kinds, pan, contact, phone, address);
  const lines = ra.items.map((i, k) => ({ description: i.boqItem.description, unit: i.boqItem.unit, quantity: i.thisQty, rate: i.rate, gstRate: ra.gstRate, amount: i.amount, gstAmount: r2(i.amount.mul(ra.gstRate).div(100)), sortOrder: k }));
  const subtotal = lines.reduce((s, l) => s.add(l.amount), D(0));
  const gstAmount = lines.reduce((s, l) => s.add(l.gstAmount), D(0));
  const total = subtotal.add(gstAmount);
  const last = await prisma.vendorBill.findFirst({ where: { organizationId: buyerOrg, billNo: { startsWith: `VB-${year}-` } }, orderBy: { billNo: 'desc' }, select: { billNo: true } });
  const vbNo = `VB-${year}-${String((last ? parseInt(last.billNo.slice(8), 10) : 0) + 1).padStart(4, '0')}`;
  // Received the day after the sister sent it
  const received = Math.max(0, Math.round((day(0).getTime() - ra.billDate.getTime()) / 86_400_000) - 1);
  // One still waiting was entered and sent for approval in the last few days, not left for weeks
  const ago = approved ? received : Math.min(received, 3);
  const paid = paidAgo === null ? null : day(-paidAgo);
  const bill = await prisma.vendorBill.create({
    data: {
      organizationId: buyerOrg, projectId: project.id, vendorId: vendor.id, kind: 'OTHER', expenseCategory: 'OTHER', billNo: vbNo, invoiceNo, invoiceDate: ra.billDate, dueDate: day(-received + 30), subtotal, gstAmount, total,
      matched: true, exceptions: [], remarks: `${seller === 'DEMOLAB' ? 'Testing' : 'Design'} charges of our sister company, RA bill ${billNo}`,
      status: approved ? 'APPROVED' : 'SUBMITTED', submittedById: accounts, submittedAt: day(-ago), reviewedById: approved ? approver : null, reviewedAt: approved ? day(-ago + 2) : null,
      // Settled by the payment and the TDS on it, as payables count it
      paidAmount: paid ? total : D(0), paidDate: paid, createdAt: day(-ago), lines: { create: lines },
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { organizationId: buyerOrg, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'SUBMITTED', actorId: accounts, createdAt: day(-ago) },
      ...(approved ? [{ organizationId: buyerOrg, entityType: 'VENDOR_BILL', entityId: bill.id, action: 'APPROVED', actorId: approver, createdAt: day(-ago + 2) }] : []),
    ],
  });
  if (paid) {
    // The TDS the payer deducts (2%, section 194J) is the TDS on the seller's bill.
    const pay = await prisma.vendorPayment.create({
      data: {
        organizationId: buyerOrg, projectId: project.id, vendorId: vendor.id, vendorBillId: bill.id, paymentDate: paid, amount: total.sub(ra.tdsAmount), mode: 'BANK',
        reference: `NEFT to ${name}`, tdsAmount: ra.tdsAmount, remarks: 'Sister company, paid on the certificate', createdById: accounts, createdAt: paid,
      },
    });
    await prisma.auditLog.create({ data: { organizationId: buyerOrg, entityType: 'VENDOR_PAYMENT', entityId: pay.id, action: 'CREATED', actorId: accounts, createdAt: paid } });
  }
}

/** The lab's and the consultancy's bills in Demo Infra Projects' payables. */
async function demoSisterBills(prisma: PrismaClient, demoOrgId: string) {
  await mirrorBill(prisma, demoOrgId, 'BL-2026-02', 'DEMOLAB', 'LAB-02', 1, true, 30);
  await mirrorBill(prisma, demoOrgId, 'BL-2026-02', 'DEMOLAB', 'LAB-02', 2, false, null);
  await mirrorBill(prisma, demoOrgId, 'RD-2026-01', 'DEMOLAB', 'LAB-01', 1, true, null);
  await mirrorBill(prisma, demoOrgId, 'WS-2026-03', 'DEMODC', 'DC-2026-01', 1, true, 75);
  await mirrorBill(prisma, demoOrgId, 'WS-2026-03', 'DEMODC', 'DC-2026-01', 2, false, null);
}

// Demo Buildcon

const BC_TERMS = { gst: 18, retention: 5, sd: 0, tds: 1, gstTds: 2, cess: 1, days: 45 };

/**
 * The building arm: 48 staff quarters for a port township (month 5, two RA bills, the first paid) and the hospital
 * block's finishes and MEP on Demo Infra Projects' work order (month 2, first bill sent), with their DPRs, labour,
 * purchases, stores, staff and the lab's cube bill.
 */
async function seedBuildcon(prisma: PrismaClient, co: Co, woNo: string | null) {
  if (await prisma.project.count({ where: { organizationId: co.id } })) return;
  await addApprovalRules(prisma, co);
  await addProject(prisma, co, {
    code: 'BC-2026-01', name: 'Port township staff quarters, 48 flats (G+4)', type: 'BUILDING', client: 'Port Township Board, Paradip', clientDept: 'Estate and works wing',
    clientAddress: 'Administrative building, Port Township, Paradip 754142', consultant: 'Nilachal Architects', location: 'Paradip, Odisha',
    site: 'Site store, Sector 7, Port Township, Paradip 754142. Unloading 8 am to 6 pm.', description: 'Two blocks of 24 flats each, RCC frame with AAC block walls, on raft foundations.',
    start: -160, end: 380, pm: 'bc.pm@demo.com', engineer: 'bc.engineer@demo.com', members: ['bc.store@demo.com', 'bc.qs@demo.com', 'bc.purchase@demo.com'],
    terms: { agreementNo: 'PTB/EW/2026/014', agreementAgo: 170, ...BC_TERMS },
    boq: [
      { no: '1.01', text: 'Excavation for raft foundation in all soils, lift up to 3 m', unit: 'Cum', rate: 230, qty: 4200, activity: 'Foundation excavation', start: -160, end: -120, done: [1500, 1500, 1200] },
      { no: '2.01', text: 'PCC M10 below the raft', unit: 'Cum', rate: 5600, qty: 310, activity: 'PCC bed', start: -125, end: -105, done: [160, 150] },
      { no: '3.01', text: 'RCC M25 in raft, columns and walls up to plinth', unit: 'Cum', rate: 8200, qty: 980, activity: 'RCC raft and columns', start: -110, end: -50, done: [260, 240, 230, 250] },
      { no: '3.02', text: 'RCC M25 in slabs, beams and columns above plinth', unit: 'Cum', rate: 8450, qty: 1650, activity: 'RCC slabs and beams', start: -50, end: 140, done: [190, 170, 160], daily: 22, at: 'Block A, second floor' },
      { no: '4.01', text: 'AAC block masonry 200 mm in CM 1:4', unit: 'Cum', rate: 6100, qty: 1380, activity: 'Block masonry', start: -30, end: 170, done: [95, 80], daily: 9, at: 'Block A, ground and first floor' },
      { no: '5.01', text: 'Internal plaster 12 mm CM 1:6', unit: 'Sqm', rate: 255, qty: 21000, activity: 'Internal plaster', start: 60, end: 220 },
      { no: '6.01', text: 'Vitrified tile flooring 600x600 with skirting', unit: 'Sqm', rate: 1180, qty: 8600, activity: 'Flooring', start: 120, end: 260 },
      { no: '7.01', text: 'Internal water supply, sanitary and drainage, per flat', unit: 'Flat', rate: 165000, qty: 48, activity: 'Plumbing and sanitary', start: 30, end: 300 },
    ],
    dpr: {
      days: 6,
      crew: [['Mason', 14, 'Jagannath Labour Supply'], ['Helper', 26, 'Jagannath Labour Supply'], ['Carpenter', 8, 'Departmental'], ['Bar bender', 6, 'Departmental'], ['Supervisor', 2, 'Departmental']],
      machines: [['Tower crane', 8], ['Transit mixer (x2)', 10], ['Concrete pump', 5], ['DG set 125 kVA', 4]],
      issues: { 2: 'Power cut from 11 am to 3 pm; DG set run for the batching plant', 4: 'AAC blocks short by one truck; masonry gang moved to Block B stair walls' },
      tests: { 1: 'Cubes cast for the second floor slab (4 sets), handed to Demo Quality Labs', 3: 'Slump 100 mm at the pump' },
      received: { 3: 'Cement 600 bags', 1: 'AAC blocks 2 trucks' },
      safety: 'Toolbox talk on working at height; edge railing on the second floor slab checked',
      next: 'Second floor slab of Block A: deshuttering bay 1, reinforcement in bay 3',
    },
  });
  await addProject(prisma, co, {
    code: 'BC-2026-02', name: 'District Hospital Block B, finishes and MEP (sub-contract)', type: 'BUILDING', client: 'Demo Infra Projects Pvt Ltd', clientPan: 'AABCD1234E',
    clientAddress: 'Demo Infra Projects, Plot 221, Saheed Nagar, Bhubaneswar', location: 'Cuttack, Odisha', site: 'Gate 2, District Hospital campus, Ring Road, Cuttack 753001',
    workOrderNo: woNo ?? undefined, description: 'Electrical, plumbing, fire fighting, plaster and tile laying on the hospital block, on the work order of our sister company.',
    start: -40, end: 260, pm: 'bc.pm2@demo.com', engineer: 'bc.engineer2@demo.com', members: ['bc.store@demo.com', 'bc.qs@demo.com'],
    terms: { agreementNo: woNo ?? 'WO (Demo Infra Projects)', agreementAgo: 45, gst: 18, retention: 5, sd: 0, tds: 1, gstTds: 0, cess: 0, days: 30 },
    boq: HOSPITAL_FINISHES,
    dpr: {
      days: 6,
      crew: [['Electrician', 8, 'Sri Ganesh Electricals'], ['Helper', 10, 'Sri Ganesh Electricals'], ['Plumber', 4, 'Departmental'], ['Fitter', 3, 'Departmental'], ['Supervisor', 1, 'Departmental']],
      machines: [['Pipe threading machine', 4], ['Welding set', 5]],
      issues: { 1: 'Ward 4 slab cut-outs for the sprinkler drops not left by the main contractor; core cutting asked for' },
      safety: 'Ladders tied; welding screens at the fire shaft',
      next: 'Wiring in ward 5; sprinkler mains on the first floor',
    },
  });
  await addPurchase(prisma, co, {
    projectCode: 'BC-2026-01',
    vendor: { name: 'Paradip Cement & Steel Agencies', kinds: ['SUPPLIER'], pan: 'AAKFP6612Q', contact: 'R. Mallick', phone: '9437411208', address: 'Badapadia Chowk, Paradip', msme: 'SMALL' },
    other: { vendor: { name: 'Jagatsinghpur Traders', kinds: ['SUPPLIER'], pan: 'AAKFJ1145R', contact: 'P. Samal', phone: '9437411960', address: 'Main Road, Jagatsinghpur' }, rates: [379, 59100], freight: 3500 },
    lines: [['OPC 53 Grade Cement', '50 kg bags, BIS marked', 'Bags', 1200, 372, 28], ['TMT Fe500D 16mm', 'Primary producer, with mill test certificate', 'MT', 24, 58200, 18]],
    mrAgo: 20, poAgo: 17, grnAgo: 12, received: [1, 0.85], freight: 0, paymentDays: 45, challan: 'PCSA/1182', vehicle: 'OD-21-F-7740',
    bill: { invoiceNo: 'PCSA/26-27/0612', ago: 10, approved: true },
    people: { requester: 'bc.engineer@demo.com', approver: 'buildcon@demo.com', buyer: 'bc.purchase@demo.com', keeper: 'bc.store@demo.com', accounts: 'bc.accounts@demo.com' },
  });
  await addPurchase(prisma, co, {
    projectCode: 'BC-2026-02',
    vendor: { name: 'Cuttack Electricals & Hardware', kinds: ['SUPPLIER'], pan: 'AAKFC4471S', contact: 'M. Agarwal', phone: '9437522318', address: 'Chandni Chowk, Cuttack', msme: 'MICRO' },
    lines: [['FR PVC conduit 25mm', 'Heavy gauge, ISI', 'Rmt', 6000, 38, 18], ['FRLS copper wire 2.5 sq mm', '90 m coil', 'Coil', 180, 2350, 18]],
    mrAgo: 15, poAgo: 13, grnAgo: 9, received: [1, 1], freight: 0, paymentDays: 30, challan: 'CEH/2210', vehicle: 'OD-05-AB-1185',
    bill: { invoiceNo: 'CEH/26-27/2210', ago: 3, approved: false },
    people: { requester: 'bc.engineer2@demo.com', approver: 'buildcon@demo.com', buyer: 'bc.purchase@demo.com', keeper: 'bc.store@demo.com', accounts: 'bc.accounts@demo.com' },
  });
  await addRequest(prisma, co, 'BC-2026-01', 'bc.engineer@demo.com', [['AAC blocks 600x200x200', 'Density 600 kg/m³', 'Nos', 4500], ['AAC block jointing mortar', '40 kg bags', 'Bags', 120]], 'Masonry of Block A second floor');
  await addStore(prisma, co, 'BC-2026-01', 'bc.store@demo.com', 'Jagannath Labour Supply', 'RCC slabs and beams', [
    ['Diesel', 'Ltr', 600, 200, 45],
    ['Binding wire', 'Kg', 400, 80, 18],
    ['Shuttering plywood 18mm', 'Nos', 260, 60, 6],
  ]);
  await addStore(prisma, co, 'BC-2026-02', 'bc.store@demo.com', 'Sri Ganesh Electricals', 'Electrical conduiting and wiring', [
    ['Modular switch boxes', 'Nos', 900, 200, 40],
    ['CPVC pipe 25mm', 'Rmt', 800, 150, 30],
  ]);
  await addStaff(prisma, co, [
    ['DBC-001', 'Sanjay Mishra', 'Director', 'Management', 'buildcon@demo.com', null],
    ['DBC-002', 'Nirmala Jena', 'Project manager', 'Execution', 'bc.pm@demo.com', 'BC-2026-01'],
    ['DBC-003', 'Rohit Bhuyan', 'Project manager (MEP)', 'Execution', 'bc.pm2@demo.com', 'BC-2026-02'],
    ['DBC-004', 'Abhishek Rout', 'Site engineer', 'Execution', 'bc.engineer@demo.com', 'BC-2026-01'],
    ['DBC-005', 'Swati Dash', 'Site engineer (electrical)', 'Execution', 'bc.engineer2@demo.com', 'BC-2026-02'],
    ['DBC-006', 'Tapan Sethy', 'Store keeper', 'Stores', 'bc.store@demo.com', 'BC-2026-01'],
    ['DBC-007', 'Lipsa Parida', 'Quantity surveyor', 'Contracts', 'bc.qs@demo.com', null],
    ['DBC-008', 'Kunal Senapati', 'Purchase officer', 'Purchase', 'bc.purchase@demo.com', null],
    ['DBC-009', 'Rina Das', 'Accounts manager', 'Accounts', 'bc.accounts@demo.com', null],
    ['DBC-010', 'Hemanta Lenka', 'Site supervisor', 'Execution', null, 'BC-2026-01'],
    ['DBC-011', 'Sushant Ojha', 'Surveyor', 'Execution', null, 'BC-2026-01'],
    ['DBC-012', 'Pradeep Biswal', 'Plumbing foreman', 'Execution', null, 'BC-2026-02'],
  ]);
  const people = { qs: 'bc.qs@demo.com', approver: 'buildcon@demo.com', accounts: 'bc.accounts@demo.com' };
  await addBill(prisma, co, 'BC-2026-01', { billNo: 1, upTo: 75, billAgo: 72, sentAgo: 70, remarks: 'Excavation, PCC and raft up to plinth', certified: { ago: 55, no: 'PTB/EW/RA/1' }, paid: { ago: 38, ref: 'SBIN526281907701', note: 'RTGS from the Port Township Board' } }, people);
  await addBill(prisma, co, 'BC-2026-01', { billNo: 2, upTo: 20, billAgo: 17, sentAgo: 15, remarks: 'Plinth to first floor slab, Block A' }, people);
  await addBill(prisma, co, 'BC-2026-02', { billNo: 1, upTo: 14, billAgo: 10, sentAgo: 9, remarks: 'Conduiting and plumbing to date' }, people);
  await mirrorBill(prisma, co.id, 'BC-2026-01', 'DEMOLAB', 'LAB-03', 1, true, 12);
}

interface DelaySeed {
  projectCode: string;
  title: string;
  category: 'DESIGN' | 'WEATHER' | 'CLIENT';
  party: 'CLIENT' | 'FORCE_MAJEURE';
  /** days ago; no end while it still holds work up */
  start: number;
  end?: number;
  /** days of extension of time granted; none while the claim waits */
  granted?: number;
  mitigation: string;
}

const BUILDCON_DELAYS: DelaySeed[] = [
  {
    projectCode: 'BC-2026-01', title: 'Raft redesigned after the second soil report', category: 'DESIGN', party: 'CLIENT', start: 150, end: 128, granted: 21,
    mitigation: 'Excavation held at 2.4 m; raft drawings revision R1 issued by Nilachal Architects. Extension of 21 days granted by the Board.',
  },
  {
    projectCode: 'BC-2026-01', title: 'Heavy rain flooded the raft excavation', category: 'WEATHER', party: 'FORCE_MAJEURE', start: 118, end: 109, granted: 7,
    mitigation: 'Dewatering pumps run round the clock; PCC restarted once the pit was dry. Extension of 7 days granted.',
  },
  {
    projectCode: 'BC-2026-01', title: 'Lift shaft and machine room drawings awaited from the architect', category: 'DESIGN', party: 'CLIENT', start: 12,
    mitigation: 'Block A lift walls left at the second floor; reminder letter sent and extension of time claimed.',
  },
  {
    projectCode: 'BC-2026-02', title: 'Slab cut-outs for sprinkler drops not left by the main contractor', category: 'CLIENT', party: 'CLIENT', start: 8,
    mitigation: 'Core cutting asked of Demo Infra Projects for ward 4; sprinkler gang moved to the first floor mains. Extension of time claimed.',
  },
];

/**
 * Delays in Demo Buildcon's delay register with the extensions of time they earned, so the contract's revised completion
 * and Progress by project's EOT have something to show. Added by title, so a database seeded before them gets them too.
 */
async function addBuildconDelays(prisma: PrismaClient, co: Co) {
  const last = await prisma.risk.findFirst({ where: { organizationId: co.id, riskNo: { startsWith: `RISK-${year}-` } }, orderBy: { riskNo: 'desc' }, select: { riskNo: true } });
  let counter = last ? parseInt(last.riskNo.slice(10), 10) : 0;
  for (const d of BUILDCON_DELAYS) {
    const project = await prisma.project.findFirst({ where: { organizationId: co.id, code: d.projectCode }, select: { id: true, projectManagerId: true } });
    if (!project?.projectManagerId) continue;
    if (await prisma.risk.count({ where: { projectId: project.id, kind: 'DELAY', title: d.title } })) continue;
    counter += 1;
    const closed = d.end !== undefined;
    const risk = await prisma.risk.create({
      data: {
        organizationId: co.id, projectId: project.id, riskNo: `RISK-${year}-${String(counter).padStart(4, '0')}`, kind: 'DELAY', category: d.category, title: d.title,
        ownerId: project.projectManagerId, probability: 5, impact: 3, score: 15, mitigation: d.mitigation, status: closed ? 'CLOSED' : 'OPEN',
        delayStart: day(-d.start), delayEnd: closed ? day(-d.end!) : null, daysLost: closed ? d.start - d.end! : null, responsibleParty: d.party,
        eotClaimed: true, eotGrantedDays: d.granted ?? null, closedAt: closed ? day(-d.end!) : null, raisedById: project.projectManagerId, createdAt: day(-d.start),
      },
    });
    await prisma.auditLog.create({ data: { organizationId: co.id, entityType: 'RISK', entityId: risk.id, action: 'CREATED', actorId: project.projectManagerId, createdAt: day(-d.start) } });
  }
}

// Demo Design Consultants

const DC_TERMS = { gst: 18, retention: 0, sd: 0, tds: 10, gstTds: 0, cess: 0, days: 30 };

/**
 * The consultancy: the design of Demo Infra Projects' water scheme (fee by deliverable, two bills, the first paid by the
 * sister), the PMC of a riverfront promenade (monthly fee, daily supervision reports, the lab's geotechnical bill) and a
 * feasibility study of four rural roads (surveys under way, a survey sub-consultant's bill), with staff and expenses.
 */
async function seedDesign(prisma: PrismaClient, co: Co) {
  if (await prisma.project.count({ where: { organizationId: co.id } })) return;
  await addApprovalRules(prisma, co);
  await addProject(prisma, co, {
    code: 'DC-2026-01', name: 'Detailed design, Jajpur rural piped water supply scheme', type: 'WATER_SUPPLY', client: 'Demo Infra Projects Pvt Ltd', clientPan: 'AABCD1234E',
    clientAddress: 'Demo Infra Projects, Plot 221, Saheed Nagar, Bhubaneswar', location: 'Jajpur, Odisha', site: 'Design office, Janpath Towers, Bhubaneswar; site visits to the WTP site, Jajpur',
    description: 'Survey, hydraulic, process and structural design and good-for-construction drawings of the turnkey scheme Demo Infra Projects is building (WS-2026-03).',
    start: -170, end: 360, pm: 'dc.pm@demo.com', engineer: 'dc.design@demo.com', members: ['dc.qs@demo.com'],
    terms: { agreementNo: 'DIP/DES/2026/02', agreementAgo: 175, ...DC_TERMS },
    boq: [
      { no: '1.01', text: 'Topographic and DGPS survey of the scheme area', unit: 'LS', rate: 1450000, qty: 1, activity: 'Topographic survey', start: -170, end: -130, done: [1] },
      { no: '2.01', text: 'Hydraulic design of the rising main and distribution network', unit: 'LS', rate: 2100000, qty: 1, activity: 'Network hydraulic design', start: -140, end: -60, done: [0.5, 0.5] },
      { no: '3.01', text: 'Process and structural design of the 10 MLD WTP', unit: 'LS', rate: 2600000, qty: 1, activity: 'WTP design', start: -100, end: 40, done: [0.3, 0.25] },
      { no: '4.01', text: 'Structural design of 500 KL ESRs on 20 m staging', unit: 'Nos', rate: 380000, qty: 3, activity: 'ESR design', start: -90, end: 20, done: [1, 1] },
      { no: '5.01', text: 'Good-for-construction drawings', unit: 'Sheet', rate: 7500, qty: 140, activity: 'GFC drawings', start: -120, end: 120, done: [24, 30, 18] },
      { no: '6.01', text: 'Design support during construction, site visits and RFIs', unit: 'Month', rate: 85000, qty: 14, activity: 'Design support', start: -150, end: 270, done: [1, 1, 1, 1, 1] },
    ],
  });
  await addProject(prisma, co, {
    code: 'DC-2026-02', name: 'PMC, Mahanadi riverfront promenade, phase 1', type: 'BUILDING', client: 'Riverfront Development Authority, Cuttack', clientDept: 'Engineering wing',
    clientAddress: 'RDA office, Buxi Bazaar, Cuttack 753001', location: 'Cuttack, Odisha', site: 'PMC site office, promenade chainage 0+300, Cuttack',
    description: "The client's project management consultant: design review, site supervision, quality and the contractor's bills. The works are by an outside contractor.",
    start: -200, end: 340, pm: 'dc.re@demo.com', engineer: 'dc.engineer@demo.com', members: ['dc.qs@demo.com'],
    terms: { agreementNo: 'RDA/PMC/2026/01', agreementAgo: 205, ...DC_TERMS },
    boq: [
      { no: '1.01', text: 'Resident engineer and site supervision team', unit: 'Month', rate: 465000, qty: 18, activity: 'Site supervision', start: -200, end: 340, done: [1, 1, 1, 1, 1, 1] },
      { no: '2.01', text: 'Quality audits by the head office', unit: 'Nos', rate: 55000, qty: 12, activity: 'Quality audits', start: -180, end: 330, done: [1, 1, 1] },
      { no: '3.01', text: "Checking the contractor's RA bills and measurements", unit: 'Nos', rate: 40000, qty: 18, activity: 'Bill checking', start: -170, end: 340, done: [1, 1, 1, 1] },
    ],
    extra: [
      { name: 'Site inspections', unit: 'Nos', qty: 1400, start: -200, end: 340, daily: 7, at: 'Promenade, chainage 0+000 to 0+800' },
      { name: 'Pour checks', unit: 'Nos', qty: 320, start: -150, end: 300, daily: 2, at: 'Retaining wall panels 5 to 7' },
      { name: 'Measurements verified', unit: 'Nos', qty: 900, start: -170, end: 340, daily: 4 },
    ],
    dpr: {
      days: 6,
      crew: [['Resident engineer', 1, 'Departmental'], ['Site engineer', 3, 'Departmental'], ['Surveyor', 1, 'Departmental'], ['Lab technician', 1, 'Departmental']],
      machines: [['Site vehicle', 7]],
      issues: { 1: "Contractor's concrete pump broke down mid-pour on panel 6; cold joint marked and treatment advised", 3: 'Rain stopped work after 2 pm' },
      tests: { 2: 'Cubes of panel 6 sent to Demo Quality Labs (3 sets)' },
      safety: "Contractor's riverside barricading checked; two workers without harness stopped at the steps",
      next: "Check the reinforcement of panel 7; review the contractor's revised programme",
    },
  });
  await addProject(prisma, co, {
    code: 'DC-2026-03', name: 'Feasibility and DPR, four rural roads (38 km)', type: 'ROAD', client: 'Rural Works Division, Dhenkanal', clientDept: 'Office of the Executive Engineer',
    clientAddress: 'RW Division, Dhenkanal 759001', location: 'Dhenkanal, Odisha', site: 'Survey camp, Dhenkanal',
    description: 'Alignment, traffic, topographic and soil surveys, pavement design, estimates and the detailed project report for four village roads.',
    start: -60, end: 90, pm: 'dc.pm@demo.com', engineer: 'dc.engineer@demo.com', members: ['dc.design@demo.com', 'dc.qs@demo.com'],
    terms: { agreementNo: 'RWD/DKL/2026/33', agreementAgo: 65, ...DC_TERMS },
    boq: [
      { no: '1.01', text: 'Reconnaissance and alignment study', unit: 'km', rate: 9500, qty: 38, activity: 'Alignment study', start: -60, end: -35, done: [38] },
      { no: '2.01', text: 'Classified traffic count (7 days) and axle load survey', unit: 'Nos', rate: 65000, qty: 4, activity: 'Traffic surveys', start: -45, end: -10, done: [2, 2] },
      { no: '3.01', text: 'Topographic survey with DGPS and total station', unit: 'km', rate: 18500, qty: 38, activity: 'Topographic survey', start: -40, end: 20, done: [14, 9] },
      { no: '4.01', text: 'Soil and material investigation', unit: 'km', rate: 6500, qty: 38, activity: 'Soil investigation', start: -20, end: 30, done: [6] },
      { no: '5.01', text: 'Pavement design, estimates and detailed project report', unit: 'Nos', rate: 225000, qty: 4, activity: 'DPR preparation', start: 0, end: 90 },
    ],
  });
  await addExpenses(prisma, co, 'DC-2026-03', 'dc.engineer@demo.com', 'dc.pm@demo.com', [
    [12, 'TRAVEL', 'Hired SUV for the survey team, 6 days', 'Maa Tarini Travels', 15600, 0, true],
    [9, 'FOOD_WELFARE', 'Meals for the traffic count enumerators, 2 stations', 'Hotel Saptasajya', 7200, 5, true],
    [2, 'RENT_UTILITIES', 'Survey camp room rent for the month', 'Sri Hari Lodge', 9000, 0, false],
  ]);
  await addExpenses(prisma, co, 'DC-2026-02', 'dc.engineer@demo.com', 'dc.re@demo.com', [
    [6, 'OFFICE', 'Printing of the monthly progress report, 6 copies', 'Cuttack Print House', 3400, 18, true],
    [1, 'TRAVEL', 'Fuel for the site vehicle', 'IOCL Ring Road', 4800, 0, false],
  ]);
  // The survey sub-consultant's bill on the roads study, and the lab's geotechnical bill on the PMC
  const surveyor = await vendorOf(prisma, co, { name: 'Utkal Geo Surveys', kinds: ['SERVICE'], pan: 'AAKFU7731T', contact: 'N. Rout', phone: '9437633140', address: 'Rasulgarh, Bhubaneswar', msme: 'MICRO' });
  const roads = await prisma.project.findFirstOrThrow({ where: { organizationId: co.id, code: 'DC-2026-03' } });
  const amount = D(23).mul(11200);
  const gst = r2(amount.mul(18).div(100));
  const sb = await prisma.vendorBill.create({
    data: {
      organizationId: co.id, projectId: roads.id, vendorId: surveyor.id, kind: 'OTHER', expenseCategory: 'OTHER', billNo: co.no('VB'), invoiceNo: 'UGS/26-27/077', invoiceDate: day(-4), dueDate: day(26),
      subtotal: amount, gstAmount: gst, total: amount.add(gst), matched: true, exceptions: [], status: 'SUBMITTED', submittedById: co.users.get('dc.accounts@demo.com')!, submittedAt: day(-3), createdAt: day(-3),
      lines: { create: [{ description: 'DGPS control and total station survey, roads 1 and 2', unit: 'km', quantity: D(23), rate: D(11200), gstRate: D(18), amount, gstAmount: gst, sortOrder: 0 }] },
    },
  });
  await audit(prisma, co, 'VENDOR_BILL', sb.id, [['SUBMITTED', co.users.get('dc.accounts@demo.com')!, -3]]);
  await addStaff(prisma, co, [
    ['DDC-001', 'Ar. Subhashree Mohapatra', 'Managing director', 'Management', 'design@demo.com', null],
    ['DDC-002', 'Er. Prakash Tripathy', 'Design manager', 'Design', 'dc.pm@demo.com', null],
    ['DDC-003', 'Er. Ankita Panda', 'Resident engineer', 'Supervision', 'dc.re@demo.com', 'DC-2026-02'],
    ['DDC-004', 'Sourav Behera', 'Site engineer', 'Supervision', 'dc.engineer@demo.com', 'DC-2026-02'],
    ['DDC-005', 'Er. Farhan Ali', 'Structural design engineer', 'Design', 'dc.design@demo.com', null],
    ['DDC-006', 'Madhusmita Nanda', 'Quantity surveyor', 'Contracts', 'dc.qs@demo.com', null],
    ['DDC-007', 'Jyoti Prakash Sahu', 'Accounts manager', 'Accounts', 'dc.accounts@demo.com', null],
    ['DDC-008', 'Sasmita Jena', 'CAD draughtsperson', 'Design', null, null],
    ['DDC-009', 'Ramakanta Dalai', 'Surveyor', 'Survey', null, 'DC-2026-03'],
    ['DDC-010', 'Bibhuti Bhusan Mohanty', 'Site engineer', 'Supervision', null, 'DC-2026-02'],
  ]);
  const people = { qs: 'dc.qs@demo.com', approver: 'design@demo.com', accounts: 'dc.accounts@demo.com' };
  await addBill(prisma, co, 'DC-2026-01', { billNo: 1, upTo: 110, billAgo: 108, sentAgo: 107, remarks: 'Survey, network design and the first ESR', certified: { ago: 95, no: 'DIP/DES/CERT/01' }, paid: { ago: 75, ref: 'SBIN526281904990', note: 'NEFT from Demo Infra Projects' } }, people);
  await addBill(prisma, co, 'DC-2026-01', { billNo: 2, upTo: 28, billAgo: 26, sentAgo: 25, remarks: 'WTP design, second ESR and GFC drawings to date' }, people);
  await addBill(prisma, co, 'DC-2026-02', { billNo: 1, upTo: 95, billAgo: 92, sentAgo: 91, remarks: 'Months 1 to 3', certified: { ago: 80, no: 'RDA/PMC/C/03' }, paid: { ago: 52, ref: 'UBIN526281902215', note: 'RTGS from the Riverfront Development Authority' } }, people);
  await addBill(prisma, co, 'DC-2026-02', { billNo: 2, upTo: 20, billAgo: 18, sentAgo: 17, remarks: 'Months 4 to 6' }, people);
  await mirrorBill(prisma, co.id, 'DC-2026-02', 'DEMOLAB', 'LAB-04', 1, true, 70);
}
