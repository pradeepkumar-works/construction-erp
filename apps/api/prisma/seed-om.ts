/**
 * A water supply scheme in operation and maintenance (ARCHITECTURE "Operation and maintenance"). Invented names
 * and figures throughout.
 *
 * - WS-2025-05, a 7.5 MLD treatment plant with its rising main, two reservoirs and the town's distribution network,
 *   completed and handed over 19 months ago, now in year 2 of five years of O&M at 3% to 4% of the ₹21.6 crore contract
 *   a year, paid quarterly, serving 38,500 people.
 * - A reading for every day since O&M began (one missed in August and one this month): water produced and supplied,
 *   chlorine and pressure at the tail end, complaints and the pump readings. Pressure fell short twice in September
 *   (one allowed, so one penalty) and twice this month; chlorine fell short once last December.
 * - The minimum staff recorded every month, a pump operator short in August 2026 and a lineman in November 2025.
 * - Alum, lime and bleaching powder issued from the plant store against their norm per ML; bleaching powder is running
 *   over the norm this month.
 * - Five quarterly O&M bills approved, certified and paid, and the sixth (year 2, quarter 2) a draft carrying its
 *   staff deduction and pressure penalty, all priced through the same functions as the app.
 *
 * Every date counts back from the first of this month, so the scheme is always in year 2, quarter 3. Skipped once the
 * project exists.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_OM_BENCHMARKS } from '@erp/shared';
import { BILL_TERMS_SELECT, billTotals, writeBill } from '../src/ra-bills/ra-bill-pricing';
import { omPercentages, omPricing } from '../src/om/om-bill';
import { addMonths, monthsBetween, omPeriods } from '../src/om/om-rules';
import { syncBillStage } from '../src/receivables/bill-settlement';

const D = (v: string | number) => new Prisma.Decimal(v);
const CODE = 'WS-2025-05';
const VALUE = 216_000_000;
const POPULATION = 38_500;
const YEAR_PCTS = [3, 3.25, 3.5, 3.75, 4];
const at = (d: string) => new Date(`${d}T00:00:00Z`);
const addDays = (d: string, n: number) => new Date(at(d).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** [role, minimum, monthly pay] */
const STAFF: [string, number, number][] = [
  ['Plant operator', 4, 18000],
  ['Pump operator', 6, 16000],
  ['Lineman and valve operator', 8, 14000],
  ['Chemist', 1, 30000],
  ['Electrician', 2, 20000],
];

/** [item, unit, kg per ML treated, rate] */
const CHEMICALS: [string, string, number, number][] = [
  ['Aluminium sulphate (alum)', 'kg', 25, 14],
  ['Hydrated lime', 'kg', 8, 11],
  ['Bleaching powder', 'kg', 3, 38],
];

/** A steady wobble from the day's number, so the log looks read off meters rather than drawn with a ruler. */
const wobble = (n: number, k: number) => Math.sin(n * 12.9898 + k * 78.233) * 0.5 + Math.sin(n * 0.37 + k) * 0.5;

export async function seedOm(prisma: PrismaClient, organizationId: string) {
  if (await prisma.project.count({ where: { organizationId, code: CODE } })) return;
  const user = async (email: string) => (await prisma.user.findFirst({ where: { organizationId, email }, select: { id: true } }))?.id;
  const [pm, engineer2, qs, store, qaqc, accounts, hr] = await Promise.all(
    ['pm2@demo.com', 'engineer2@demo.com', 'qs@demo.com', 'store@demo.com', 'qaqc@demo.com', 'accounts@demo.com', 'hr@demo.com'].map(user),
  );
  if (!pm || !engineer2 || !qs || !store || !qaqc) return;

  // O&M began on the first of the month 18 months ago; the works were completed a few days before.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const startOn = addMonths(thisMonth, -18);
  const completedOn = addDays(startOn, -4);
  const yesterday = addDays(today, -1);

  const project = await prisma.project.create({
    data: {
      organizationId, code: CODE, name: 'Lakeview Nagar Water Supply Scheme', type: 'WATER_SUPPLY', status: 'COMPLETED', contractModel: 'ITEM_RATE',
      clientName: 'Lakeview Nagar Municipal Council', consultantName: 'Bluewater Project Consultants', location: 'Lakeview Nagar', workOrderNo: 'LNMC/WS/2022/11',
      agreementNo: 'LNMC/WS/AGT/2022/11', agreementDate: at(addMonths(startOn, -33)), startDate: at(addMonths(startOn, -32)), endDate: at(completedOn), contractValue: D(VALUE),
      projectManagerId: pm, villages: ['Zone A', 'Zone B', 'Zone C'],
      description: 'A 7.5 MLD water treatment plant, 6.2 km rising main, two elevated reservoirs and 64 km of distribution network, built and now run for five years of operation and maintenance',
      // Water supply O&M for a town council: no GST, 2% TDS; the works' retention was released at handover.
      gstRate: D(0), tdsPct: D(2), gstTdsPct: D(0), labourCessPct: D(0), retentionPct: D(5), securityDepositPct: D(0), defectLiabilityMonths: 12, clientPaymentDays: 30,
      members: { create: [engineer2, qs, store, qaqc].map((userId) => ({ userId })) },
    },
  });
  const projectId = project.id;
  await prisma.projectHandover.create({
    data: {
      organizationId, projectId, completedOn: at(completedOn), certificateNo: 'LNMC/WS/CC/07', certificateDate: at(addDays(completedOn, 10)), certifiedBy: 'Executive Engineer, Lakeview Nagar Municipal Council',
      dlpMonths: 12, dlpEndsOn: at(addMonths(`${completedOn.slice(0, 7)}-01`, 12)), note: 'Completed after the 72-hour trial run; O&M by the same contract from the next month', recordedById: pm,
    },
  });

  // The O&M contract
  const items = new Map<string, string>();
  for (const [name, unit, , rate] of CHEMICALS) {
    const found = await prisma.item.findFirst({ where: { organizationId, name }, select: { id: true } });
    items.set(name, found?.id ?? (await prisma.item.create({ data: { organizationId, name, unit, category: 'Water treatment chemicals', rate: D(rate) } })).id);
  }
  const contract = await prisma.omContract.create({
    data: {
      organizationId, projectId, startOn: at(startOn), years: 5, yearPcts: YEAR_PCTS.map(D), instalmentsPerYear: 4, extensionYears: 2, population: POPULATION,
      benchmarks: DEFAULT_OM_BENCHMARKS as unknown as Prisma.InputJsonValue,
      note: 'Clause 14 of the agreement: O&M paid quarterly in arrears; penalties as in Schedule J, staff short deducted at the monthly pay of the role.',
      staffNorms: { create: STAFF.map(([role, required, pay], i) => ({ organizationId, role, required, monthlyPay: D(pay), sortOrder: i })) },
      chemicalNorms: { create: CHEMICALS.map(([name, , perMl]) => ({ organizationId, itemId: items.get(name)!, perMl: D(perMl) })) },
    },
  });
  await prisma.auditLog.create({ data: { organizationId, entityType: 'OM_CONTRACT', entityId: contract.id, action: 'CREATED', actorId: pm, note: `5 years from ${startOn}`, createdAt: at(addDays(completedOn, 12)) } });

  // A reading every day from the start to yesterday
  const sep = addMonths(thisMonth, -1);
  const aug = addMonths(thisMonth, -2);
  const dec = addMonths(thisMonth, -10);
  const missing = new Set([addDays(aug, 14), addDays(thisMonth, 11)]);
  const lowPressure = new Map([[addDays(sep, 4), 6.2], [addDays(sep, 17), 5.6], [addDays(thisMonth, 6), 6.4], [addDays(thisMonth, 15), 5.9]]);
  const lowChlorine = new Set([addDays(dec, 20)]);
  const days: Prisma.ServiceLevelDayCreateManyInput[] = [];
  const produced = new Map<string, number>();
  for (let d = startOn, n = 0; d <= yesterday; d = addDays(d, 1), n++) {
    if (missing.has(d) || d > today) continue;
    // Demand grows a little each year and peaks in the hot months
    const month = Number(d.slice(5, 7));
    const summer = month >= 4 && month <= 6 ? 1.04 : 1;
    const supplied = Math.round(5560 * summer * (1 + n / 20000) * (1 + 0.025 * wobble(n, 1)));
    const lossShare = 0.135 + 0.02 * wobble(n, 2);
    const producedKl = Math.round(supplied / (1 - lossShare));
    produced.set(d, producedKl);
    const received = 1 + ((n * 7) % 5);
    days.push({
      organizationId, projectId, date: at(d), producedKl: D(producedKl), suppliedKl: D(supplied),
      residualChlorine: D(lowChlorine.has(d) ? 0.12 : r1(0.42 + 0.12 * wobble(n, 3)).toFixed(2)),
      tailPressureM: D(lowPressure.get(d) ?? r1(9.4 + 1.2 * wobble(n, 4))),
      complaintsReceived: received, complaintsClosed48h: n % 15 === 7 ? received - 1 : received,
      pumpEfficiencyPct: n % 7 === 0 ? D(r1(67 + 2.5 * wobble(n, 5))) : null,
      note: lowPressure.has(d) ? 'Low pressure at the Zone C tail end: valve at the market junction found throttled' : lowChlorine.has(d) ? 'Chlorinator tripped in the night; dosing restored at 6 am' : null,
      enteredById: n % 6 === 0 ? qaqc : engineer2, createdAt: at(d),
    });
  }
  await prisma.serviceLevelDay.createMany({ data: days });

  // Staff deployed each month up to last month: one pump operator short in August, one lineman in November last year
  const nov = addMonths(thisMonth, -11);
  const staffRows: Prisma.OmStaffMonthCreateManyInput[] = [];
  for (const m of monthsBetween(startOn, addDays(thisMonth, -1))) {
    for (const [role, required] of STAFF) {
      const short = (m === aug.slice(0, 7) && role === 'Pump operator') || (m === nov.slice(0, 7) && role === 'Lineman and valve operator') ? 1 : 0;
      staffRows.push({ organizationId, projectId, month: at(`${m}-01`), role, deployed: required - short, recordedById: hr ?? pm, createdAt: at(addMonths(`${m}-01`, 1)) });
    }
  }
  await prisma.omStaffMonth.createMany({ data: staffRows });

  // Chemicals: a receipt each quarter, issued weekly for the last four months at the norm, bleaching powder over it this month
  const year = now.getUTCFullYear();
  const counters: Record<string, number> = {};
  const nextNo = async (prefix: string) => {
    if (counters[prefix] === undefined) {
      const last = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `${prefix}-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
      counters[prefix] = last ? parseInt(last.entryNo.slice(prefix.length + 6), 10) : 0;
    }
    counters[prefix] += 1;
    return `${prefix}-${year}-${String(counters[prefix]).padStart(4, '0')}`;
  };
  const entry = async (type: 'RECEIPT' | 'ISSUE', date: string, data: Partial<Prisma.StockEntryUncheckedCreateInput>, lines: [string, number][]) => {
    const rows = lines.filter(([, q]) => q > 0);
    if (!rows.length) return;
    await prisma.stockEntry.create({
      data: {
        organizationId, projectId, type, entryNo: await nextNo(type === 'RECEIPT' ? 'GRN' : 'ISS'), date: at(date), createdById: store, createdAt: at(date), ...data,
        lines: { create: rows.map(([name, q], i) => ({ organizationId, projectId, itemId: items.get(name)!, type, date: at(date), quantity: D(type === 'ISSUE' ? -q : q), sortOrder: i })) },
      },
    });
  };
  const issueFrom = addMonths(thisMonth, -3);
  const issues: { date: string; lines: [string, number][] }[] = [];
  // Each month in four lots (1st to 7th, 8th to 14th, 15th to 21st, 22nd to the end), issued on the lot's first day
  const lots = monthsBetween(issueFrom, today).flatMap((m) => [1, 8, 15, 22].map((n) => `${m}-${String(n).padStart(2, '0')}`));
  for (const d of lots.filter((x) => x <= today)) {
    const end = d.endsWith('-22') ? addDays(addMonths(`${d.slice(0, 7)}-01`, 1), -1) : addDays(d, 6);
    let ml = 0;
    for (let x = d; x <= end && x <= yesterday; x = addDays(x, 1)) ml += (produced.get(x) ?? 0) / 1000;
    if (!ml) continue;
    const over = d >= thisMonth;
    issues.push({ date: d, lines: CHEMICALS.map(([name, , perMl]) => [name, r3(perMl * ml * (name === 'Bleaching powder' ? (over ? 1.18 : 1.04) : name === 'Hydrated lime' ? 0.97 : 1.03))]) });
  }
  const total = new Map<string, number>();
  for (const i of issues) for (const [name, q] of i.lines) total.set(name, (total.get(name) ?? 0) + q);
  await entry('RECEIPT', addDays(issueFrom, -3), { supplier: 'Godavari Chemicals and Minerals', challanNo: 'GCM/4471', vehicleNo: 'MH-14-KT-6620', qcStatus: 'ACCEPTED' }, [...total].map(([name, q]) => [name, Math.ceil((q * 1.15) / 50) * 50]));
  for (const i of issues) await entry('ISSUE', i.date, { issuedTo: 'Treatment plant shift operators', remarks: 'Dosing for the week' }, i.lines);

  // The O&M bills: five approved and paid, the last finished quarter a draft
  const terms = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: BILL_TERMS_SELECT });
  const pcts = omPercentages(terms);
  const periods = omPeriods({ startOn, years: 5, yearPcts: YEAR_PCTS, instalmentsPerYear: 4, contractValue: VALUE }).filter((p) => p.to < thisMonth);
  for (const [n, p] of periods.entries()) {
    const billDate = addDays(p.to, 6);
    const draft = n === periods.length - 1;
    const created = await prisma.raBill.create({
      data: {
        organizationId, projectId, billNo: n + 1, billDate: at(billDate), measuredUpTo: at(p.to), omYear: p.year, omInstalment: p.instalment, remarks: `O&M charges for ${p.label.toLowerCase()}`,
        grossPrevious: 0, grossAmount: 0, grossUpto: 0, gstRate: terms.gstRate, gstAmount: 0, retentionPct: 0, securityDepositPct: 0, advanceRecoveryPct: 0, tdsPct: 0, gstTdsPct: 0, labourCessPct: 0,
        retentionAmount: 0, securityDepositAmount: 0, advanceRecoveryAmount: 0, tdsAmount: 0, gstTdsAmount: 0, labourCessAmount: 0, totalDeductions: 0, netPayable: 0,
        status: 'DRAFT', submittedById: qs, createdAt: at(billDate),
      },
    });
    const { pricing, detail } = await omPricing(prisma, { projectId, billNo: created.billNo, omYear: p.year, omInstalment: p.instalment });
    const priced = await billTotals(prisma, created, [], pcts, terms, null, pricing);
    await writeBill(prisma, created.id, [], priced.amounts, priced.data, null);
    await prisma.raBill.update({ where: { id: created.id }, data: { omDetail: detail as unknown as Prisma.InputJsonValue } });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'BILL', entityId: created.id, action: 'CREATED', actorId: qs, createdAt: at(billDate) } });
    if (draft) continue;

    const sent = addDays(billDate, 2);
    const certified = addDays(billDate, 18);
    const paid = addDays(billDate, 38);
    const certificateNo = `LNMC/OM/${p.year}-${p.instalment}`;
    const priced2 = await prisma.raBill.findUniqueOrThrow({ where: { id: created.id } });
    const bill = await prisma.raBill.update({
      where: { id: created.id },
      data: {
        status: 'APPROVED', submittedAt: at(billDate), reviewedById: pm, reviewedAt: at(addDays(billDate, 1)), stage: 'CERTIFIED', sentDate: at(sent), certifiedDate: at(certified), certificateNo,
        claimedGross: priced2.grossAmount, claimedNet: priced2.netPayable,
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'SUBMITTED', actorId: qs, createdAt: at(billDate) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'APPROVED', actorId: pm, createdAt: at(addDays(billDate, 1)) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'SENT', actorId: qs, note: `Sent to the client on ${sent}`, createdAt: at(sent) },
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'CERTIFIED', actorId: qs, note: `Certificate ${certificateNo}`, createdAt: at(certified) },
      ],
    });
    if (!accounts) continue;
    const receipt = await prisma.receipt.create({
      data: {
        organizationId, projectId, billId: bill.id, kind: 'BILL', receiptDate: at(paid), amount: bill.netPayable, mode: 'BANK', reference: `NEFT LNMC${String(30418 + n * 57)}`,
        tdsAmount: bill.tdsAmount, otherDeduction: bill.omPenalty, otherDeductionNote: bill.omPenalty.gt(0) ? 'Service level penalties' : null,
        remarks: `O&M charges, ${p.label.toLowerCase()}`, createdById: accounts, createdAt: at(paid),
      },
    });
    await syncBillStage(prisma, bill.id);
    await prisma.auditLog.createMany({
      data: [
        { organizationId, entityType: 'BILL', entityId: bill.id, action: 'PAYMENT_RECEIVED', actorId: accounts, createdAt: at(paid) },
        { organizationId, entityType: 'RECEIPT', entityId: receipt.id, action: 'CREATED', actorId: accounts, createdAt: at(paid) },
      ],
    });
  }
}
