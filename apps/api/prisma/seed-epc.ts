/**
 * An EPC project in another currency (item 130, ARCHITECTURE "EPC"). Invented names and figures throughout.
 *
 * - WW-2026-07, an island sewerage scheme let as one EPC contract of US$ 6.2 million, kept in rupees at the contract
 *   rate of ₹ 83.25: a 6 MLD sequencing batch reactor plant with its units, the plant's mechanical and electrical
 *   equipment, a sewer network in four phases, three pumping stations and the outfall, in month 10 of 18.
 * - 24 design deliverables across the five disciplines, most approved, two sent back with comments, one late.
 * - Ten equipment packages from order to commissioning: the imported air blowers are at sea and will reach site about
 *   two weeks after erection needs them; the centrifuge's inspection is overdue.
 * - Five inputs the client owes: the pumping station 3 land came a month late (a delay recorded against the client),
 *   and the 11 kV supply for testing is overdue now.
 * - The milestone break-up: design stages paid on the approval of their deliverables, equipment on delivery and on
 *   erection of its packages, civil work by progress; three milestone bills, two paid at the day's rate.
 *
 * Skipped once the project exists.
 */
import { Prisma, PrismaClient, type EngineeringDiscipline, type PackageStage } from '@prisma/client';
import { createStandardBreakup, proposedGrid, stagePlan } from '../src/stage-billing/stage-plan';
import { BILL_TERMS_SELECT, billTotals, measuredLines, writeBill } from '../src/ra-bills/ra-bill-pricing';
import { syncBillStage } from '../src/receivables/bill-settlement';
import { seedElementTree, type ElementSeed } from './seed-structure';

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const CODE = 'WW-2026-07';
const RATE = 83.25;
const VALUE_USD = 6_200_000;

const TREE: ElementSeed[] = [
  {
    code: '1', name: 'Sewage treatment plant, 6 MLD SBR', type: 'GENERAL', weight: 38,
    subs: [
      { code: '1.1', name: 'Inlet works, screens and grit chamber', type: 'STP_UNIT', weight: 10, specs: { wallHeightM: 3, liftM: 1.5 }, start: -240, end: -20, done: 0.88, scale: 25 },
      { code: '1.2', name: 'SBR basins, 2 nos', type: 'STP_UNIT', weight: 40, specs: { wallHeightM: 6, liftM: 1.5 }, start: -225, end: 60, done: 0.62, scale: 110 },
      { code: '1.3', name: 'Sludge holding tank and dewatering building', type: 'STP_UNIT', weight: 15, specs: { wallHeightM: 4.5, liftM: 1.5 }, start: -170, end: 90, done: 0.4, scale: 35 },
      { code: '1.4', name: 'Chlorine contact tank and treated water sump', type: 'SUMP', weight: 15, specs: { capacityKl: 300, wallHeightM: 4, liftM: 1.5 }, start: -150, end: 70, done: 0.45, scale: 30 },
      { code: '1.5', name: 'Blower and electrical building', type: 'PUMP_HOUSE', weight: 20, start: -110, end: 120, done: 0.22, scale: 30 },
    ],
  },
  { code: '2', name: 'Plant mechanical equipment', type: 'EM_PACKAGE', weight: 18, start: -200, end: 200, done: 0.3 },
  { code: '3', name: 'Electrical, instrumentation and SCADA', type: 'EM_PACKAGE', weight: 8, start: -180, end: 220, done: 0.12 },
  {
    code: '4', name: 'Sewer network, four phases', type: 'GENERAL', weight: 24,
    subs: [
      { code: '4.1', name: 'Phase 1, harbour front', type: 'PIPE_ZONE', weight: 24, specs: { lengthM: 5200, diameterMm: 250 }, start: -260, end: -60, done: 0.9 },
      { code: '4.2', name: 'Phase 2, old quarter', type: 'PIPE_ZONE', weight: 28, specs: { lengthM: 6100, diameterMm: 250 }, start: -200, end: 30, done: 0.62 },
      { code: '4.3', name: 'Phase 3, resort strip', type: 'PIPE_ZONE', weight: 26, specs: { lengthM: 5800, diameterMm: 200 }, start: -120, end: 120, done: 0.3 },
      { code: '4.4', name: 'Phase 4, airport road', type: 'PIPE_ZONE', weight: 22, specs: { lengthM: 4900, diameterMm: 200 }, start: 10, end: 230, done: 0 },
    ],
  },
  { code: '5', name: 'Sewage pumping stations, 3 nos', type: 'PUMP_HOUSE', weight: 6, start: -190, end: 100, done: 0.48, scale: 28 },
  { code: '6', name: 'Treated water outfall, HDPE 315 mm', type: 'RISING_MAIN', weight: 6, specs: { lengthM: 1200, diameterMm: 315 }, start: -90, end: 150, done: 0.15 },
];

/** [code, discipline, title, component, planned submit, planned approval, submitted, revision, code, approved] in days from today */
type DeliverableSeed = [string, EngineeringDiscipline, string, string | null, number, number, number | null, string | null, 'A' | 'B' | 'C' | null, number | null];
const DELIVERABLES: DeliverableSeed[] = [
  ['PRC-001', 'PROCESS', 'Process design basis and mass balance', null, -280, -260, -282, 'R0', 'A', -262],
  ['PRC-002', 'PROCESS', 'Hydraulic profile of the plant', '1', -270, -250, -268, 'R1', 'A', -248],
  ['PRC-003', 'PROCESS', 'Process and instrumentation diagrams', '1', -250, -225, -246, 'R2', 'B', -220],
  ['PRC-004', 'PROCESS', 'SBR cycle and aeration calculation', '1.2', -255, -235, -253, 'R0', 'A', -238],
  ['PRC-005', 'PROCESS', 'Operation and maintenance manual', null, -10, 30, null, null, null, null],
  ['CIV-001', 'CIVIL', 'Geotechnical investigation report', null, -285, -270, -286, 'R0', 'A', -272],
  ['CIV-002', 'CIVIL', 'Plant layout and grading plan', '1', -265, -245, -263, 'R1', 'A', -243],
  ['CIV-003', 'CIVIL', 'Inlet works structural drawings', '1.1', -240, -220, -238, 'R1', 'A', -215],
  ['CIV-004', 'CIVIL', 'SBR basins structural drawings', '1.2', -230, -205, -229, 'R2', 'B', -200],
  ['CIV-005', 'CIVIL', 'Blower and electrical building drawings', '1.5', -60, -40, -50, 'R1', 'C', null],
  ['CIV-006', 'CIVIL', 'Sewer longitudinal sections, phases 1 to 4', '4', -220, -200, -221, 'R0', 'A', -198],
  ['MEC-001', 'MECHANICAL', 'Screens and grit removal datasheets', '2', -230, -210, -228, 'R0', 'A', -205],
  ['MEC-002', 'MECHANICAL', 'Air blower sizing and datasheets', '2', -220, -200, -215, 'R1', 'B', -190],
  ['MEC-003', 'MECHANICAL', 'Diffuser grid and decanter layout', '2', -210, -190, -206, 'R0', 'A', -186],
  ['MEC-004', 'MECHANICAL', 'Sludge dewatering centrifuge datasheet', '2', -150, -130, -140, 'R1', 'A', -118],
  ['MEC-005', 'MECHANICAL', 'Pumping station pump selection', '5', -200, -180, -198, 'R0', 'A', -176],
  ['ELE-001', 'ELECTRICAL', 'Single line diagram and load list', '3', -210, -190, -207, 'R1', 'A', -185],
  ['ELE-002', 'ELECTRICAL', 'HT panel and transformer datasheets', '3', -170, -150, -168, 'R0', 'A', -146],
  ['ELE-003', 'ELECTRICAL', 'Cable schedule and routing', '3', -60, -30, -40, 'R0', null, null],
  ['ELE-004', 'ELECTRICAL', 'Earthing and lightning protection', '3', 10, 40, null, null, null, null],
  ['INS-001', 'INSTRUMENTATION', 'Control philosophy', '3', -180, -160, -178, 'R0', 'A', -156],
  ['INS-002', 'INSTRUMENTATION', 'SCADA architecture and I/O list', '3', -120, -95, -118, 'R2', 'B', -90],
  ['INS-003', 'INSTRUMENTATION', 'Instrument datasheets', '3', -90, -60, -70, 'R1', 'C', null],
  ['INS-004', 'INSTRUMENTATION', 'Factory test procedure for the PLC panels', '3', 5, 35, null, null, null, null],
];

const VENDORS: [string, string][] = [
  ['Halvorsen Fluid Technik', 'Screens, decanters and diffusers'],
  ['Meridian Blower Works', 'Air blowers'],
  ['Saptagiri Pumps Pvt Ltd', 'Submersible pumps'],
  ['Kestrel Separation Systems', 'Decanter centrifuges'],
  ['Vidyut Switchgear Pvt Ltd', 'HT and LT panels, transformers'],
  ['Northlight Automation', 'PLC, SCADA and instruments'],
  ['Tarangini Dosing Systems', 'Chlorination'],
  ['Aravali Power Gensets', 'Diesel generator sets'],
];

interface PackageSeed {
  code: string;
  name: string;
  discipline: EngineeringDiscipline;
  element: string;
  vendor: string;
  scope: string;
  usd: number;
  needed: number;
  ship?: { vessel: string; bl: string; eta: number; portDays: number };
  /** [stage, planned, done] in days from today */
  stages: [PackageStage, number, number | null][];
}

const PACKAGES: PackageSeed[] = [
  {
    code: 'PKG-01', name: 'Fine screens and grit removal', discipline: 'MECHANICAL', element: '2', vendor: 'Halvorsen Fluid Technik', scope: '2 rotary drum screens, 6 mm; vortex grit unit', usd: 185_000, needed: -40,
    ship: { vessel: 'MV Nordic Tern', bl: 'NTN/2026/0112', eta: -80, portDays: 8 },
    stages: [['ORDERED', -220, -222], ['DRAWINGS_APPROVED', -195, -200], ['MANUFACTURED', -130, -128], ['INSPECTED', -120, -118], ['DISPATCHED', -110, -108], ['SHIPPED', -105, -104], ['CUSTOMS_CLEARED', -75, -72], ['DELIVERED', -65, -62], ['ERECTED', -30, -25], ['COMMISSIONED', 60, null]],
  },
  {
    code: 'PKG-02', name: 'SBR decanters and fine bubble diffusers', discipline: 'MECHANICAL', element: '2', vendor: 'Halvorsen Fluid Technik', scope: '4 decanters, 1,800 membrane diffusers with grids', usd: 420_000, needed: -30,
    ship: { vessel: 'MV Nordic Tern', bl: 'NTN/2026/0187', eta: -62, portDays: 8 },
    stages: [['ORDERED', -210, -212], ['DRAWINGS_APPROVED', -185, -184], ['MANUFACTURED', -110, -105], ['INSPECTED', -100, -98], ['DISPATCHED', -95, -90], ['SHIPPED', -90, -86], ['CUSTOMS_CLEARED', -60, -56], ['DELIVERED', -55, -50], ['ERECTED', 10, null], ['COMMISSIONED', 75, null]],
  },
  {
    code: 'PKG-03', name: 'Air blowers with motors and acoustic hoods', discipline: 'MECHANICAL', element: '2', vendor: 'Meridian Blower Works', scope: '2 duty + 1 standby, 2,400 m³/h at 6.5 m', usd: 360_000, needed: 5,
    ship: { vessel: 'MV Ocean Pelican', bl: 'OPL/2026/0418', eta: 12, portDays: 8 },
    stages: [['ORDERED', -200, -198], ['DRAWINGS_APPROVED', -175, -185], ['MANUFACTURED', -90, -70], ['INSPECTED', -80, -58], ['DISPATCHED', -60, -40], ['SHIPPED', -55, -30], ['CUSTOMS_CLEARED', -25, null], ['DELIVERED', -15, null], ['ERECTED', 20, null], ['COMMISSIONED', 80, null]],
  },
  {
    code: 'PKG-04', name: 'Submersible pumps for the pumping stations', discipline: 'MECHANICAL', element: '5', vendor: 'Saptagiri Pumps Pvt Ltd', scope: '9 pumps, 3 per station, with guide rails and panels', usd: 240_000, needed: -60,
    stages: [['ORDERED', -190, -190], ['DRAWINGS_APPROVED', -170, -165], ['MANUFACTURED', -110, -100], ['INSPECTED', -100, -92], ['DISPATCHED', -90, -85], ['DELIVERED', -80, -78], ['ERECTED', -40, -35], ['COMMISSIONED', 40, null]],
  },
  {
    code: 'PKG-05', name: 'Sludge dewatering centrifuge', discipline: 'MECHANICAL', element: '2', vendor: 'Kestrel Separation Systems', scope: '1 decanter centrifuge, 15 m³/h, with polymer dosing', usd: 210_000, needed: 90,
    stages: [['ORDERED', -120, -118], ['DRAWINGS_APPROVED', -105, -110], ['MANUFACTURED', -30, -26], ['INSPECTED', -20, null], ['DISPATCHED', -10, null], ['SHIPPED', -5, null], ['CUSTOMS_CLEARED', 25, null], ['DELIVERED', 35, null], ['ERECTED', 70, null]],
  },
  {
    code: 'PKG-06', name: '11 kV panel and 1,000 kVA transformer', discipline: 'ELECTRICAL', element: '3', vendor: 'Vidyut Switchgear Pvt Ltd', scope: 'RMU, VCB panel, 1,000 kVA 11/0.433 kV transformer', usd: 150_000, needed: 30,
    stages: [['ORDERED', -150, -148], ['DRAWINGS_APPROVED', -130, -140], ['MANUFACTURED', -40, -45], ['INSPECTED', -30, -33], ['DISPATCH_CLEARED', -28, -30], ['DISPATCHED', -25, -4], ['DELIVERED', -15, null], ['ERECTED', 45, null]],
  },
  {
    code: 'PKG-07', name: 'Motor control centres and LT panels', discipline: 'ELECTRICAL', element: '3', vendor: 'Vidyut Switchgear Pvt Ltd', scope: '3 MCCs, PCC, APFC and lighting panels', usd: 175_000, needed: 40,
    stages: [['ORDERED', -140, -135], ['DRAWINGS_APPROVED', -110, -100], ['MANUFACTURED', -20, -10], ['INSPECTED', 0, null], ['DISPATCHED', 10, null], ['DELIVERED', 20, null], ['ERECTED', 50, null]],
  },
  {
    code: 'PKG-08', name: 'PLC, SCADA and field instruments', discipline: 'INSTRUMENTATION', element: '3', vendor: 'Northlight Automation', scope: 'Redundant PLC, 2 SCADA stations, DO, pH, level and flow instruments', usd: 230_000, needed: 120,
    stages: [['ORDERED', -100, -95], ['DRAWINGS_APPROVED', -70, -85], ['MANUFACTURED', 20, null], ['INSPECTED', 35, null], ['DISPATCHED', 45, null], ['SHIPPED', 50, null], ['CUSTOMS_CLEARED', 80, null], ['DELIVERED', 90, null], ['COMMISSIONED', 170, null]],
  },
  {
    code: 'PKG-09', name: 'Chlorination system', discipline: 'MECHANICAL', element: '2', vendor: 'Tarangini Dosing Systems', scope: 'Hypochlorite dosing, 2 x 100% pumps and tanks', usd: 60_000, needed: 100,
    stages: [['ENQUIRY', -60, -62], ['ORDERED', -40, -30], ['DRAWINGS_APPROVED', -10, null], ['MANUFACTURED', 40, null], ['DELIVERED', 70, null], ['ERECTED', 95, null]],
  },
  {
    code: 'PKG-10', name: 'Standby diesel generator, 500 kVA', discipline: 'ELECTRICAL', element: '3', vendor: 'Aravali Power Gensets', scope: '500 kVA in an acoustic enclosure, with AMF panel', usd: 95_000, needed: 110,
    stages: [['ENQUIRY', -20, -20], ['ORDERED', 0, null], ['DELIVERED', 90, null], ['ERECTED', 105, null]],
  },
];

/** [name, due, given, note] in days from today */
const CLIENT_INPUTS: [string, number, number | null, string | null][] = [
  ['Treated water quality standard confirmed', -250, -252, 'BOD 10, TSS 10 mg/l at the outfall'],
  ['Land for pumping station 3 handed over', -230, -200, 'Plot at the fish market was occupied until the lease ended'],
  ['Consent to discharge treated water to the sea', -120, -125, null],
  ['11 kV supply at the plant for testing', -20, null, 'The utility has not laid the feeder from the island substation'],
  ['Road cutting permission, phase 4', 30, null, null],
];

/** Milestone bills: [measured up to, bill date, sent, certified, paid (0 for not yet), day's rate, certificate no.] */
const BILLS: [number, number, number, number, number, number, string][] = [
  [190, 188, 186, 172, 158, 83.9, 'CPWSA/EPC/IPC-01'],
  [110, 108, 106, 92, 78, 82.6, 'CPWSA/EPC/IPC-02'],
  [35, 33, 31, 18, 0, 0, 'CPWSA/EPC/IPC-03'],
];

export async function seedEpc(prisma: PrismaClient, organizationId: string) {
  if (await prisma.project.count({ where: { organizationId, code: CODE } })) return;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  const [pm, engineer, engineer2, qs, store, procurement, qaqc, accounts] = await Promise.all(
    ['pm2@demo.com', 'engineer@demo.com', 'engineer2@demo.com', 'qs@demo.com', 'store@demo.com', 'procurement@demo.com', 'qaqc@demo.com', 'accounts@demo.com'].map(user),
  );
  if (!pm || !engineer || !engineer2 || !qs || !store || !procurement || !qaqc) return;

  const value = Math.round(VALUE_USD * RATE);
  const project = await prisma.project.create({
    data: {
      organizationId, code: CODE, name: 'Coral Point Island Sewerage and Treatment Plant', type: 'SEWERAGE', status: 'ACTIVE', contractModel: 'EPC',
      clientName: 'Coral Point Water and Sewerage Authority', consultantName: 'Tidewater Engineering Associates', location: 'Coral Point', workOrderNo: 'CPWSA/EPC/2025/02',
      agreementNo: 'CPWSA/EPC/AGT/2025/02', agreementDate: day(-305), startDate: day(-300), endDate: day(250), contractValue: D(value), currency: 'USD', exchangeRate: D(RATE),
      projectManagerId: pm, villages: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
      description: 'Design, supply, build and commission an island sewerage scheme abroad: a 6 MLD SBR plant, 22 km of sewers in four phases, three pumping stations and the outfall, paid in US dollars by milestones',
      // Overseas: no Indian GST, TDS or cess on the client's bills; 5% retention and a 10% advance recovered between 10% and 80% executed.
      gstRate: D(0), tdsPct: D(0), gstTdsPct: D(0), labourCessPct: D(0), retentionPct: D(5), securityDepositPct: D(0), mobilisationAdvance: D(value * 0.1), advanceRecoveryFromPct: D(10), advanceRecoveryToPct: D(80),
      defectLiabilityMonths: 24, clientPaymentDays: 30, ldRatePct: D(0.1), ldPeriod: 'DAY', ldCapPct: D(10),
      members: { create: [engineer, engineer2, qs, store, procurement, qaqc].map((userId) => ({ userId })) },
    },
  });
  const projectId = project.id;
  await seedElementTree(prisma, { organizationId, projectId, value, tree: TREE, pm, engineer, engineer2, secondEngineer: (c) => c.startsWith('4'), located: (c) => c.startsWith('4.') });
  const elements = await prisma.workElement.findMany({ where: { projectId }, select: { id: true, code: true, parentId: true } });
  const element = new Map(elements.map((e) => [e.code, e]));

  // Deliverables
  for (const [i, [code, discipline, title, el, plannedSubmit, plannedApproval, submitted, revision, approvalCode, approved]] of DELIVERABLES.entries()) {
    const status = approved !== null ? 'APPROVED' : approvalCode ? 'COMMENTS' : submitted !== null ? 'SUBMITTED' : 'NOT_STARTED';
    await prisma.engineeringDeliverable.create({
      data: {
        organizationId, projectId, discipline, code, title, workElementId: el ? element.get(el)!.id : null, plannedSubmitOn: day(plannedSubmit), plannedApprovalOn: day(plannedApproval),
        submittedOn: submitted === null ? null : day(submitted), revision, approvalCode, approvedOn: approved === null ? null : day(approved), status, sortOrder: i,
      },
    });
  }

  // Suppliers and packages
  const vendorId = new Map<string, string>();
  for (const [name, remarks] of VENDORS) {
    const found = await prisma.vendor.findFirst({ where: { organizationId, name }, select: { id: true } });
    vendorId.set(name, found?.id ?? (await prisma.vendor.create({ data: { organizationId, name, kinds: ['SUPPLIER'], remarks } })).id);
  }
  for (const [i, p] of PACKAGES.entries()) {
    const row = await prisma.procurementPackage.create({
      data: {
        organizationId, projectId, code: p.code, name: p.name, discipline: p.discipline, workElementId: element.get(p.element)!.id, vendorId: vendorId.get(p.vendor)!, scope: p.scope,
        value: D(Math.round(p.usd * RATE)), neededOn: day(p.needed), vessel: p.ship?.vessel ?? null, billOfLading: p.ship?.bl ?? null, eta: p.ship ? day(p.ship.eta) : null,
        portToSiteDays: p.ship?.portDays ?? null, sortOrder: i,
      },
    });
    await prisma.packageStageDate.createMany({
      data: p.stages.map(([stage, planned, done]) => ({ organizationId, packageId: row.id, stage, plannedOn: day(planned), actualOn: done === null ? null : day(done) })),
    });
  }

  // Client inputs, the late land recorded as a delay against the client
  const year = new Date().getUTCFullYear();
  const lastRisk = await prisma.risk.findFirst({ where: { organizationId, riskNo: { startsWith: `RISK-${year}-` } }, orderBy: { riskNo: 'desc' }, select: { riskNo: true } });
  let riskNo = lastRisk ? parseInt(lastRisk.riskNo.slice(10), 10) : 0;
  for (const [i, [name, due, given, note]] of CLIENT_INPUTS.entries()) {
    const late = given !== null && given > due;
    const delay = late
      ? await prisma.risk.create({
          data: {
            organizationId, projectId, riskNo: `RISK-${year}-${String(++riskNo).padStart(4, '0')}`, kind: 'DELAY', category: 'CLIENT', title: `Client input late: ${name}`,
            description: `Due from the client on ${day(due).toISOString().slice(0, 10)}, given on ${day(given).toISOString().slice(0, 10)}.${note ? ` ${note}` : ''}`,
            probability: 5, impact: 4, score: 20, status: 'CLOSED', delayStart: day(due + 1), delayEnd: day(given), responsibleParty: 'CLIENT', eotClaimed: true,
            closedAt: day(given), closureNote: 'Land handed over', raisedById: pm, createdAt: day(due + 2),
          },
        })
      : null;
    await prisma.milestone.create({
      data: { organizationId, projectId, name, dueDate: day(due), baselineDate: day(due), achievedOn: given === null ? null : day(given), note, byClient: true, delayId: delay?.id ?? null, sortOrder: 100 + i },
    });
  }

  // The milestone break-up: design stages on their deliverables, equipment on its packages, the rest by progress
  await createStandardBreakup(prisma, organizationId, projectId);
  await prisma.project.update({ where: { id: projectId }, data: { lumpSumValue: D(value), tenderFactor: D(1) } });
  const deliverables = await prisma.engineeringDeliverable.findMany({ where: { projectId }, select: { id: true, workElementId: true, discipline: true } });
  const packages = await prisma.procurementPackage.findMany({ where: { projectId }, select: { id: true, workElementId: true } });
  const stages = await prisma.billingStage.findMany({ where: { projectId }, select: { id: true, name: true, trigger: true, sortOrder: true, component: { select: { workElementId: true, code: true } } } });
  const activities = await prisma.activity.findMany({ where: { projectId, parentActivityId: null }, select: { id: true, name: true, workElementId: true } });
  for (const s of stages) {
    const el = elements.find((e) => e.id === s.component.workElementId);
    if (!el) continue;
    if (s.trigger === 'EVENT' && s.sortOrder === 0) {
      let own = deliverables.filter((d) => d.workElementId === el.id).map((d) => d.id);
      if (!own.length && el.parentId) own = deliverables.filter((d) => d.workElementId === el.parentId).map((d) => d.id);
      if (own.length) await prisma.billingStage.update({ where: { id: s.id }, data: { deliverableIds: own } });
      else await prisma.billingStage.update({ where: { id: s.id }, data: { achievedOn: day(-240), evidence: 'Engineer\'s letter CPWSA/ENG/031' } });
    }
    // The plant's equipment is paid on delivery and on erection of its packages.
    const kit = packages.filter((p) => p.workElementId === el.id).map((p) => p.id);
    if (kit.length && (s.name === 'Supplied to site' || s.name === 'Erected')) {
      await prisma.billingStage.update({ where: { id: s.id }, data: { trigger: 'SUPPLY', activityIds: [], packageIds: kit, packageStage: s.name === 'Erected' ? 'ERECTED' : 'DELIVERED' } });
    }
    // Sewers are supplied and laid by the same crews: the supply stage reads the laying.
    if (s.trigger === 'SUPPLY' && s.name === 'Pipes supplied') {
      const laying = activities.filter((a) => a.workElementId === el.id && a.name === 'Pipe lowering, laying and jointing').map((a) => a.id);
      await prisma.billingStage.update({ where: { id: s.id }, data: { name: 'Pipes supplied and laid', trigger: 'PROGRESS', activityIds: laying, itemIds: [], scopeQty: null } });
    }
  }
  const grid = await proposedGrid(prisma, projectId);
  for (const row of grid.rows) {
    await prisma.milestoneTarget.createMany({
      data: grid.months.map((m, i) => ({ organizationId, projectId, componentId: row.componentId, month: new Date(`${m}T00:00:00Z`), cumulativePct: D(Math.round(row.targets[i] * 0.8)) })),
    });
  }

  // Three milestone bills; the first two paid at the day's rate
  const terms = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: BILL_TERMS_SELECT });
  for (const [n, [upTo, billAgo, sentAgo, certAgo, paidAgo, dayRate, certificateNo]] of BILLS.entries()) {
    const created = await prisma.raBill.create({
      data: {
        organizationId, projectId, billNo: n + 1, billDate: day(-billAgo), measuredUpTo: day(-upTo), remarks: `Interim payment certificate for milestones up to ${day(-upTo).toISOString().slice(0, 10)}`,
        grossPrevious: 0, grossAmount: 0, grossUpto: 0, gstRate: terms.gstRate, gstAmount: 0, retentionPct: 0, securityDepositPct: 0, advanceRecoveryPct: 0, tdsPct: 0, gstTdsPct: 0, labourCessPct: 0,
        retentionAmount: 0, securityDepositAmount: 0, advanceRecoveryAmount: 0, tdsAmount: 0, gstTdsAmount: 0, labourCessAmount: 0, totalDeductions: 0, netPayable: 0,
        status: 'DRAFT', submittedById: qs, createdAt: day(-billAgo),
      },
    });
    const plan = await stagePlan(prisma, created);
    const lines = await measuredLines(prisma, created, plan);
    const priced = await billTotals(prisma, created, lines, terms, terms, plan);
    await writeBill(prisma, created.id, lines, priced.amounts, priced.data, plan);
    const claimed = await prisma.raBill.findUniqueOrThrow({ where: { id: created.id }, include: { stageLines: true } });
    if (plan) for (const l of claimed.stageLines) await prisma.raBillStageLine.update({ where: { id: l.id }, data: { certifiedPct: l.thisPct } });
    const bill = await prisma.raBill.update({
      where: { id: claimed.id },
      data: {
        status: 'APPROVED', submittedAt: day(-billAgo), reviewedById: pm, reviewedAt: day(-billAgo + 1), stage: 'CERTIFIED', sentDate: day(-sentAgo), certifiedDate: day(-certAgo), certificateNo,
        claimedGross: claimed.grossAmount, claimedNet: claimed.netPayable,
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'CREATED', actorId: qs, createdAt: day(-billAgo) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'SUBMITTED', actorId: qs, createdAt: day(-billAgo) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'APPROVED', actorId: pm, createdAt: day(-billAgo + 1) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'SENT', actorId: qs, note: `Sent to the client on ${day(-sentAgo).toISOString().slice(0, 10)}`, createdAt: day(-sentAgo) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'CERTIFIED', actorId: qs, note: `Certificate ${certificateNo}`, createdAt: day(-certAgo) },
      ],
    });
    if (!paidAgo || !accounts) continue;
    const receipt = await prisma.receipt.create({
      data: {
        organizationId, projectId, billId: bill.id, kind: 'BILL', receiptDate: day(-paidAgo), amount: bill.netPayable, exchangeRate: D(dayRate), mode: 'BANK', reference: `SWIFT CPW${String(5512 + n * 41)}`,
        retentionAmount: bill.retentionAmount, advanceRecoveryAmount: bill.advanceRecoveryAmount, otherDeduction: Prisma.Decimal.max(bill.slippageWithheld, 0), otherDeductionNote: bill.slippageWithheld.gt(0) ? 'Milestone slippage withheld' : null,
        remarks: `Wire from the Coral Point Water and Sewerage Authority at ₹ ${dayRate} to the dollar`, createdById: accounts, createdAt: day(-paidAgo),
      },
    });
    await syncBillStage(prisma, bill.id);
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'PAYMENT_RECEIVED', actorId: accounts, note: `US$ ${(bill.netPayable.toNumber() / RATE).toFixed(2)} received`, createdAt: day(-paidAgo) },
        { organizationId, entityType: 'RECEIPT', entityId: receipt.id, action: 'CREATED', actorId: accounts, createdAt: day(-paidAgo) },
      ],
    });
  }
}
