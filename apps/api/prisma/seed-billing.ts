/**
 * Stage billing on the town water supply scheme (item 129). Invented names and figures throughout.
 *
 * - Terms: 80.7% of the contract is a lump sum shared by the components; road restoration, house connections and the HT
 *   feeder are paid at their unit rates × the tender factor (1.0425). Security deposit 5%, TDS 2%, GST TDS 2%, labour
 *   cess 1%, and a 5% mobilisation advance recovered between 10% and 80% of the contract executed.
 * - The price breakup's lines for those three become measured unit-rate items, with approved measurements.
 * - Ductile iron for the rising mains and the feeder main, and HDPE for zones 1 and 3, received over the months, so
 *   the "Pipes supplied" stages move bill by bill.
 * - The standard break-up from the work breakdown, its design approvals dated, and a milestone grid from the schedule
 *   that the treatment plant has fallen behind.
 * - RA bills 1 to 4, priced from the evidence at their dates as the bills screen would, certified (bill 3 with a stage
 *   cut by the client) and the first three paid. Bill 5 is the QS's to prepare.
 *
 * Skipped once the project has a billing break-up.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { createStandardBreakup, proposedGrid, stagePlan } from '../src/stage-billing/stage-plan';
import { BILL_TERMS_SELECT, billTotals, measuredLines, writeBill } from '../src/ra-bills/ra-bill-pricing';
import { syncBillStage } from '../src/receivables/bill-settlement';

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Unit-rate items replacing the price breakup's lines: [component, item no., description, unit, rate, quantity, measured [days ago, qty, where][]] */
const UNIT_RATE_ITEMS: [string, string, string, string, string, number, [number, number, string][]][] = [
  ['10', '10.01', 'Restoring bituminous road over the trench, 40 mm BC on 50 mm DBM', 'Sqm', '1450.00', 18000, [[160, 900, 'Old town, Ward 2 lanes'], [110, 1100, 'Old town, Ward 5'], [70, 850, 'Market road'], [25, 620, 'Station Road, first reach'], [8, 480, 'Station Road, second reach']]],
  ['10', '10.02', 'Restoring CC road over the trench, M20, 150 mm', 'Sqm', '1900.00', 6000, [[95, 300, 'Ward 3 lanes'], [30, 260, 'Ward 11 lanes']]],
  ['11', '11.01', 'House service connection: saddle, ferrule, 20 mm MDPE up to 6 m, meter chamber', 'Nos', '15200.00', 1450, [[20, 40, 'Ward 3'], [6, 47, 'Ward 3 and 4']]],
  ['12', '12.01', '11 kV line on 9 m PSC poles with ACSR Dog conductor', 'Km', '1950000.00', 5.2, [[85, 0.8, 'Grid substation to the plant'], [30, 0.76, 'Plant to the intake road']]],
  ['12', '12.02', '11 kV / 433 V 315 kVA substation with its protection', 'Nos', '3250000.00', 1, []],
];

/** Pipe received for the mains and zones 1 and 3: [item, unit, rate, kg per metre, diameter, receipts [days ago, metres][]] */
const PIPE_RECEIPTS: [string, string, string, number | null, [number, number][]][] = [
  ['DI K7 pipe 250mm', 'MT', '74000.00', 44.5, [[190, 1850]]],
  ['DI K7 pipe 300mm', 'MT', '76000.00', 55.6, [[165, 1800], [95, 1300], [30, 600]]],
  ['DI K7 pipe 200mm', 'MT', '72000.00', 33.6, [[140, 2400], [75, 1500]]],
  ['HDPE PE100 110mm PN6', 'Rmt', '540.00', null, [[190, 4000], [130, 3500]]],
  ['HDPE PE100 90mm PN6', 'Rmt', '360.00', null, [[35, 2000]]],
];

/** RA bills 1 to 4: [measured up to, bill date, sent, certified, paid (days ago, 0 for not yet), certificate no.] */
const BILLS: [number, number, number, number, number, string][] = [
  [200, 198, 196, 180, 165, 'SUWM/DVG/RA-01'],
  [150, 148, 146, 130, 115, 'SUWM/DVG/RA-02'],
  [100, 98, 96, 80, 62, 'SUWM/DVG/RA-03'],
  [40, 38, 36, 20, 0, 'SUWM/DVG/RA-04'],
];

export async function seedTownBilling(prisma: PrismaClient, organizationId: string) {
  const project = await prisma.project.findFirst({ where: { organizationId, code: 'WS-2026-04' }, select: { id: true, contractValue: true } });
  if (!project?.contractValue || (await prisma.billingComponent.count({ where: { projectId: project.id } }))) return;
  const projectId = project.id;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  const [pm, qs, store, accounts] = await Promise.all([user('pm@demo.com'), user('qs@demo.com'), user('store@demo.com'), user('accounts@demo.com')]);
  if (!pm || !qs) return;
  if (await prisma.raBill.count({ where: { projectId } })) return;

  // Terms
  const elements = await prisma.workElement.findMany({ where: { projectId }, select: { id: true, code: true, parentId: true, weightPct: true } });
  const element = new Map(elements.map((e) => [e.code, e]));
  const unitShare = ['10', '11', '12'].reduce((s, c) => s + Number(element.get(c)?.weightPct ?? 0), 0);
  const value = project.contractValue;
  await prisma.project.update({
    where: { id: projectId },
    data: {
      agreementNo: 'SUWM/DVG/AGT/2025/07', agreementDate: day(-275), lumpSumValue: value.mul(100 - unitShare).div(100).toDecimalPlaces(2), tenderFactor: D('1.0425'),
      mobilisationAdvance: value.mul(5).div(100), advanceRecoveryFromPct: D(10), advanceRecoveryToPct: D(80),
      securityDepositPct: D(5), retentionPct: D(0), tdsPct: D(2), gstTdsPct: D(2), labourCessPct: D(1), gstRate: D(18),
    },
  });

  // Unit-rate items and their measurements
  const year = new Date().getUTCFullYear();
  const lastMb = await prisma.measurementSheet.findFirst({ where: { organizationId, mbNo: { startsWith: `MB-${year}-` } }, orderBy: { mbNo: 'desc' }, select: { mbNo: true } });
  let mb = lastMb ? parseInt(lastMb.mbNo.slice(8), 10) : 0;
  await prisma.boqItem.deleteMany({ where: { projectId, itemNo: { in: ['PB-10', 'PB-11', 'PB-12'] }, measurements: { none: {} } } });
  const lastSort = await prisma.boqItem.aggregate({ where: { projectId }, _max: { sortOrder: true } });
  let sort = (lastSort._max.sortOrder ?? 0) + 1;
  for (const [code, itemNo, description, unit, rate, qty, sheets] of UNIT_RATE_ITEMS) {
    const boq = await prisma.boqItem.create({
      data: { organizationId, projectId, itemNo, description, unit, rate: D(rate), originalQty: D(qty), section: 'Unit-rate items', workElementId: element.get(code)!.id, sortOrder: sort++ },
    });
    for (const [ago, q, location] of sheets) {
      const sheet = await prisma.measurementSheet.create({
        data: {
          organizationId, projectId, boqItemId: boq.id, mbNo: `MB-${year}-${String(++mb).padStart(4, '0')}`, date: day(-ago), location, totalQty: D(q), status: 'APPROVED',
          submittedById: qs, submittedAt: day(-ago), reviewedById: pm, reviewedAt: day(-ago + 1), createdAt: day(-ago),
          lines: { create: [{ description: location, nos: unit === 'Nos' ? D(q) : null, length: unit === 'Nos' ? null : D(q), quantity: D(q), sortOrder: 0 }] },
        },
      });
      await prisma.auditLog.createMany({
        data: [
          { organizationId, entityType: 'MEASUREMENT', entityId: sheet.id, action: 'SUBMITTED', actorId: qs, createdAt: day(-ago) },
          { organizationId, entityType: 'MEASUREMENT', entityId: sheet.id, action: 'APPROVED', actorId: pm, createdAt: day(-ago + 1) },
        ],
      });
    }
  }

  // Pipe received over the months
  const lastGrn = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `GRN-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
  let grn = lastGrn ? parseInt(lastGrn.entryNo.slice(9), 10) : 0;
  for (const [name, unit, rate, kg, receipts] of PIPE_RECEIPTS) {
    const diameter = Number(/(\d+)mm/.exec(name)![1]);
    const found = await prisma.item.findFirst({ where: { organizationId, name, unit } });
    const pipe = { rate: D(rate), pipeDiameterMm: diameter, pipeMaterial: name.startsWith('DI') ? 'DI' : 'HDPE', ...(kg ? { kgPerMetre: D(kg) } : {}) } as const;
    const item = found ? await prisma.item.update({ where: { id: found.id }, data: pipe }) : await prisma.item.create({ data: { organizationId, name, unit, ...pipe } });
    for (const [ago, metres] of receipts) {
      const quantity = D(kg ? r3((metres * kg) / 1000) : metres);
      const e = await prisma.stockEntry.create({
        data: {
          organizationId, projectId, type: 'RECEIPT', entryNo: `GRN-${year}-${String(++grn).padStart(4, '0')}`, date: day(-ago), createdById: store ?? pm, createdAt: day(-ago),
          supplier: name.startsWith('DI') ? 'Kaveri Ductile Pipes' : 'Sabari Polymers', challanNo: `DC/${4100 + grn}`, qcStatus: 'ACCEPTED',
          lines: { create: [{ organizationId, projectId, itemId: item.id, type: 'RECEIPT', date: day(-ago), quantity, sortOrder: 0 }] },
        },
      });
      await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: e.id, action: 'CREATED', actorId: store ?? pm, note: e.entryNo, createdAt: day(-ago) } });
    }
  }

  // The standard break-up, its design approvals and the milestone grid
  await createStandardBreakup(prisma, organizationId, projectId);
  const starts = await prisma.activity.groupBy({ by: ['workElementId'], where: { projectId }, _min: { plannedStart: true } });
  const startOf = new Map(starts.map((s) => [s.workElementId, s._min.plannedStart]));
  const firstEvents = await prisma.billingStage.findMany({ where: { projectId, trigger: 'EVENT', sortOrder: 0 }, select: { id: true, component: { select: { workElementId: true } } } });
  for (const [i, s] of firstEvents.entries()) {
    const start = startOf.get(s.component.workElementId) ?? day(-260);
    const on = new Date(Math.min(start.getTime() + 20 * 86_400_000, day(-5).getTime()));
    await prisma.billingStage.update({ where: { id: s.id }, data: { achievedOn: on, evidence: `EE letter SUWM/DES/${114 + i}` } });
  }
  const grid = await proposedGrid(prisma, projectId);
  const components = await prisma.billingComponent.findMany({ where: { projectId, parentId: null, basis: 'STAGES' }, select: { id: true, code: true } });
  const codeOf = new Map(components.map((c) => [c.id, c.code]));
  // The contract's grid sits a little behind the working schedule, except the treatment plant's, which it holds to.
  for (const row of grid.rows) {
    const strict = codeOf.get(row.componentId) === '4';
    await prisma.milestoneTarget.createMany({
      data: grid.months.map((m, i) => ({ organizationId, projectId, componentId: row.componentId, month: new Date(`${m}T00:00:00Z`), cumulativePct: D(strict ? row.targets[i] : Math.round(row.targets[i] * 0.7)) })),
    });
  }

  // RA bills 1 to 4
  const terms = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: BILL_TERMS_SELECT });
  for (const [n, [upTo, billAgo, sentAgo, certAgo, paidAgo, certificateNo]] of BILLS.entries()) {
    const billNo = n + 1;
    const created = await prisma.raBill.create({
      data: {
        organizationId, projectId, billNo, billDate: day(-billAgo), measuredUpTo: day(-upTo), remarks: `Stages and unit-rate items up to ${day(-upTo).toISOString().slice(0, 10)}`,
        grossPrevious: 0, grossAmount: 0, grossUpto: 0, gstRate: terms.gstRate, gstAmount: 0, retentionPct: 0, securityDepositPct: 0, advanceRecoveryPct: 0, tdsPct: 0, gstTdsPct: 0, labourCessPct: 0,
        retentionAmount: 0, securityDepositAmount: 0, advanceRecoveryAmount: 0, tdsAmount: 0, gstTdsAmount: 0, labourCessAmount: 0, totalDeductions: 0, netPayable: 0,
        status: 'DRAFT', submittedById: qs, createdAt: day(-billAgo),
      },
    });
    const plan = await stagePlan(prisma, created);
    const lines = await measuredLines(prisma, created, plan);
    const priced = await billTotals(prisma, created, lines, terms, terms, plan);
    await writeBill(prisma, created.id, lines, priced.amounts, priced.data, plan);
    const claimed = await prisma.raBill.findUniqueOrThrow({ where: { id: created.id }, include: { stageLines: true, items: true } });

    // The client's certificate: as claimed, but on bill 3 the 400 KL tank's staging is passed at half of what was claimed.
    const tank2 = element.get('8.2')?.id;
    const cutStage = billNo === 3 && tank2 ? await prisma.billingStage.findFirst({ where: { projectId, name: 'Staging', component: { workElementId: tank2 } }, select: { id: true } }) : null;
    const certified = new Map(claimed.stageLines.map((l) => [l.stageId, l.stageId === cutStage?.id ? l.thisPct.div(2).toDecimalPlaces(3) : l.thisPct]));
    const certPlan = await stagePlan(prisma, claimed, { certified });
    if (certPlan) for (const l of certPlan.lines) await prisma.raBillStageLine.update({ where: { billId_stageId: { billId: claimed.id, stageId: l.stageId } }, data: { certifiedPct: l.certifiedPct, amount: l.amount } });
    const certLines = claimed.items.map((i) => ({ ...i, certifiedQty: i.thisQty }));
    const final = await billTotals(prisma, claimed, certLines, terms, terms, certPlan);
    for (const [i, l] of certLines.entries()) await prisma.raBillItem.update({ where: { id: l.id }, data: { certifiedQty: l.certifiedQty, amount: final.amounts[i] } });
    const bill = await prisma.raBill.update({
      where: { id: claimed.id },
      data: {
        ...final.data, status: 'APPROVED', submittedAt: day(-billAgo), reviewedById: pm, reviewedAt: day(-billAgo + 1), stage: 'CERTIFIED', sentDate: day(-sentAgo),
        certifiedDate: day(-certAgo), certificateNo, claimedGross: claimed.grossAmount, claimedNet: claimed.netPayable,
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
        organizationId, projectId, billId: bill.id, kind: 'BILL', receiptDate: day(-paidAgo), amount: bill.netPayable, mode: 'BANK', reference: `SUWM${String(880120 + billNo * 37)}`,
        tdsAmount: bill.tdsAmount, gstTdsAmount: bill.gstTdsAmount, retentionAmount: bill.retentionAmount, securityDepositAmount: bill.securityDepositAmount,
        advanceRecoveryAmount: bill.advanceRecoveryAmount, labourCessAmount: bill.labourCessAmount, otherDeduction: bill.otherDeduction.add(Prisma.Decimal.max(bill.slippageWithheld, 0)), otherDeductionNote: bill.slippageWithheld.gt(0) ? 'Milestone slippage withheld' : null,
        remarks: 'RTGS from the State Urban Water Mission', createdById: accounts, createdAt: day(-paidAgo),
      },
    });
    await syncBillStage(prisma, bill.id);
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'PAYMENT_RECEIVED', actorId: accounts, note: `₹${bill.netPayable.toFixed(2)} received`, createdAt: day(-paidAgo) },
        { organizationId, entityType: 'RECEIPT', entityId: receipt.id, action: 'CREATED', actorId: accounts, createdAt: day(-paidAgo) },
      ],
    });
  }
}
