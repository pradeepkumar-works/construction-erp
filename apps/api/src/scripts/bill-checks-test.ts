/**
 * Bill checks' tests (AI item 69). First each rule on its own, passing and failing, with no database. Then, when
 * DATABASE_URL is set, the demo company: every seeded anomaly must be flagged by the rule meant to catch it, and every
 * other bill and expense must show no flag (the false-positive check). CI runs it after the seed:
 *
 *   node dist/scripts/bill-checks-test.js                 # rules only
 *   DATABASE_URL=… node dist/scripts/bill-checks-test.js  # rules and demo data
 */
import assert from 'node:assert/strict';
import { gstinCheckChar, gstinChecksumOk } from '@erp/shared';
import {
  type Check,
  type ExpenseFacts,
  type OtherVendorBillFacts,
  type RaBillFacts,
  type SubcontractBillFacts,
  type VendorBillFacts,
  expenseChecks,
  otherVendorBillChecks,
  raBillChecks,
  rulesSummary,
  subcontractBillChecks,
  vendorBillChecks,
} from '../checks/bill-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const flags = (checks: Check[]) => checks.filter((c) => !c.ok);
const flagged = (checks: Check[], keyStart: string) => flags(checks).filter((c) => c.key.startsWith(keyStart));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---------------------------------------------------------------------------------------------------------------------
// Vendor bills

const vb: VendorBillFacts = {
  invoiceNo: 'INV-884',
  freight: 1000,
  poFreightLeft: 1000,
  subtotal: 41200,
  gstAmount: 7416,
  total: 49616,
  duplicates: [],
  lines: [
    { id: 'l1', no: 1, item: 'TMT bar 12 mm', unit: 'MT', qty: 100, rate: 412, gstRate: 18, amount: 41200, gstAmount: 7416, poRate: 412, poGstRate: 18, received: 110, receipts: [{ label: 'GRN-0031', href: '/purchase-orders/p', qty: 110 }], billedElsewhere: 0, otherBills: [] },
  ],
};

test('vendor bill: a clean bill has only ticks', () => assert.deepEqual(flags(vendorBillChecks(vb)), []));
test('vendor bill: rate above the PO', () => {
  const f = clone(vb);
  f.lines[0].poRate = 395;
  const [c] = flagged(vendorBillChecks(f), 'rate:');
  assert.equal(c.title, 'Rate ₹412 is above PO rate ₹395 on line 1');
});
test('vendor bill: quantity above what was received', () => {
  const f = clone(vb);
  f.lines[0].qty = 120;
  f.lines[0].amount = 49440;
  f.lines[0].gstAmount = 8899.2;
  f.subtotal = 49440;
  f.gstAmount = 8899.2;
  f.total = 59339.2;
  const [c] = flagged(vendorBillChecks(f), 'qty:');
  assert.equal(c.title, 'Quantity 120 MT is more than received on GRN-0031 (110 MT)');
  assert.deepEqual(c.links, [{ label: 'GRN-0031', href: '/purchase-orders/p' }]);
  assert.equal(flagged(vendorBillChecks(f), 'totals').length, 0);
});
test('vendor bill: quantity already on another bill', () => {
  const f = clone(vb);
  f.lines[0].billedElsewhere = 20;
  f.lines[0].otherBills = [{ label: 'VB-2026-0007', href: '/vendor-bills/x', qty: 20 }];
  const [c] = flagged(vendorBillChecks(f), 'qty:');
  assert.match(c.title, /more than the 90 MT left to bill/);
  f.lines[0].billedElsewhere = 110;
  assert.equal(flagged(vendorBillChecks(f), 'qty:')[0].title, '100 MT on line 1 is already billed on VB-2026-0007');
  assert.match(c.detail!, /20 MT already on VB-2026-0007/);
});
test('vendor bill: nothing received', () => {
  const f = clone(vb);
  f.lines[0].received = 0;
  f.lines[0].receipts = [];
  assert.match(flagged(vendorBillChecks(f), 'qty:')[0].title, /nothing received yet/);
});
test('vendor bill: GST rate differs from the PO', () => {
  const f = clone(vb);
  f.lines[0].poGstRate = 12;
  assert.equal(flagged(vendorBillChecks(f), 'gst-rate:')[0].title, 'GST 18% on line 1 where the PO has 12%');
});
test('vendor bill: freight above what is left on the PO', () => {
  const f = clone(vb);
  f.poFreightLeft = 400;
  assert.equal(flagged(vendorBillChecks(f), 'freight:')[0].title, 'Freight ₹1,000 is above the ₹400 left on the PO');
});

// Hire and service bills without a PO (v5 item 91)

const hire: OtherVendorBillFacts = {
  invoiceNo: 'SRH/221',
  freight: 0,
  subtotal: 324000,
  gstAmount: 58320,
  total: 382320,
  duplicates: [],
  lines: [{ id: 'h1', no: 1, item: 'EXC-02 Excavator, hire for Oct 2026', qty: 180, rate: 1800, gstRate: 18, amount: 324000, gstAmount: 58320 }],
  hire: { machine: 'EXC-02 for Oct 2026', unit: 'hour', billedQty: 180, loggedQty: 180, rate: 1800, agreedRate: 1800, otherBills: [], fuelLitres: 0, fuelRecovered: 0 },
  service: null,
};

test('hire bill: a clean bill has only ticks', () => assert.deepEqual(flags(otherVendorBillChecks(hire)), []));
test('hire bill: hours above the logs', () => {
  const f = clone(hire);
  f.hire!.loggedQty = 172;
  assert.equal(flagged(otherVendorBillChecks(f), 'hire-qty:')[0].title, '180 hours billed, 172 in the approved logs');
});
test('hire bill: rate above the agreed rate', () => {
  const f = clone(hire);
  f.hire!.agreedRate = 1700;
  assert.equal(flagged(otherVendorBillChecks(f), 'hire-rate:')[0].title, 'Hire rate ₹1,800 is above the agreed ₹1,700');
});
test('hire bill: a second bill for the machine and month', () => {
  const f = clone(hire);
  f.hire!.otherBills = [{ label: 'VB-2026-0012', href: '/vendor-bills/x' }];
  const [c] = flagged(otherVendorBillChecks(f), 'hire-second:');
  assert.equal(c.title, 'EXC-02 for Oct 2026 is also billed on VB-2026-0012');
  assert.deepEqual(c.links, [{ label: 'VB-2026-0012', href: '/vendor-bills/x' }]);
});
test('hire bill: diesel issued to an owner-fuelled machine not recovered', () => {
  const f = clone(hire);
  f.hire!.fuelLitres = 240;
  assert.equal(flagged(otherVendorBillChecks(f), 'fuel:')[0].title, '240 litres of diesel we issued are not recovered');
  f.hire!.fuelRecovered = 22200;
  assert.equal(flagged(otherVendorBillChecks(f), 'fuel:').length, 0);
});
test('service bill: billed above the job cards', () => {
  const f: OtherVendorBillFacts = { ...clone(hire), hire: null, subtotal: 324000, service: { billed: 324000, recorded: 300000, jobs: [{ label: 'MNT-2026-0004', href: '/machinery?tab=maintenance&id=j' }] } };
  const checks = otherVendorBillChecks(f);
  assert.equal(flagged(checks, 'service:')[0].title, '₹3,24,000 billed before GST; the job cards record ₹3,00,000');
  assert.equal(checks.filter((c) => c.key.startsWith('hire')).length, 0);
});
test('vendor bill: invoice already billed', () => {
  const f = clone(vb);
  f.duplicates = [{ label: 'VB-2026-0007', href: '/vendor-bills/x' }];
  assert.equal(flagged(vendorBillChecks(f), 'duplicate:')[0].title, 'Invoice INV-884 already billed on VB-2026-0007');
});
test('vendor bill: GST does not add up', () => {
  const f = clone(vb);
  f.gstAmount = 7500;
  f.total = 49700;
  const [c] = flagged(vendorBillChecks(f), 'totals');
  assert.equal(c.title, 'GST does not add up');
  assert.match(c.detail!, /GST is ₹7,500, should be ₹7,416/);
});
test('vendor bill: rounding within a rupee passes', () => {
  const f = clone(vb);
  f.lines[0].gstAmount = 7416.4;
  f.gstAmount = 7416.4;
  f.total = 49616.4;
  assert.equal(flagged(vendorBillChecks(f), 'totals').length, 0);
});

// ---------------------------------------------------------------------------------------------------------------------
// Subcontract bills

const sb: SubcontractBillFacts = {
  invoiceNo: 'SJC/12',
  duplicates: [],
  lines: [{ id: 's1', no: 1, description: 'GSB', unit: 'Cum', rate: 300, woRate: 300, woQty: 1000, prevQty: 200, thisQty: 100, uptoQty: 300, amount: 30000, earlierBilled: 200, measuredToDate: 300 }],
  grossAmount: 30000,
  gstRate: 18,
  gstAmount: 5400,
  retentionPct: 5,
  retentionAmount: 1500,
  advanceRecoveryPct: 10,
  advanceRecoveryAmount: 2000,
  tdsPct: 1,
  tdsAmount: 300,
  materialRecovery: 1000,
  excessRecovery: 0,
  otherDeduction: 0,
  totalDeductions: 4800,
  netPayable: 30600,
};

test('subcontract bill: a clean bill has only ticks (advance recovery capped below its %)', () => assert.deepEqual(flags(subcontractBillChecks(sb)), []));
test('subcontract bill: rate above the work order', () => {
  const f = clone(sb);
  f.lines[0].woRate = 280;
  assert.equal(flagged(subcontractBillChecks(f), 'rate:')[0].title, 'Rate ₹300 is above the work order rate ₹280 on line 1');
});
test('subcontract bill: past the work order quantity', () => {
  const f = clone(sb);
  f.lines[0].woQty = 250;
  assert.equal(flagged(subcontractBillChecks(f), 'wo-qty:')[0].title, "Bill takes line 1 to 300 Cum, past the work order's 250 Cum");
});
test('subcontract bill: previous quantity differs from earlier bills', () => {
  const f = clone(sb);
  f.lines[0].earlierBilled = 180;
  assert.equal(flagged(subcontractBillChecks(f), 'prev:').length, 1);
});
test('subcontract bill: billed beyond the measurement book', () => {
  const f = clone(sb);
  f.lines[0].measuredToDate = 280;
  assert.equal(flagged(subcontractBillChecks(f), 'measured:')[0].title, 'Line 1 is billed to 300 Cum; the measurement book has 280 Cum');
});
test("subcontract bill: the work order's own items have no measurement check", () => {
  const f = clone(sb);
  f.lines[0].measuredToDate = null;
  assert.equal(subcontractBillChecks(f).filter((c) => c.key.startsWith('measured')).length, 0);
});
test('subcontract bill: advance recovery above its %', () => {
  const f = clone(sb);
  f.advanceRecoveryAmount = 3500;
  f.totalDeductions = 6300;
  f.netPayable = 29100;
  assert.match(flagged(subcontractBillChecks(f), 'totals')[0].detail!, /Advance recovery is ₹3,500, should be ₹3,000/);
});
test('subcontract bill: man-days above the attendance, counts only (item 124)', () => {
  const f = clone(sb);
  const line = { lineId: 'l1', no: 1, description: 'Helper (man-day)', billed: 96, supported: 87, excess: 9, excessInr: 4950, flagged: true, sources: 'head count 87, roll call 86, punched 83', span: '18 Oct to 23 Oct', link: { label: 'Attendance cross-check', href: '/attendance-check' } };
  f.manDays = [line];
  const found = flagged(subcontractBillChecks(f), 'mandays:');
  assert.equal(found[0].title, "Line 1 bills 96 man-days; the site's attendance for 18 Oct to 23 Oct supports 87");
  assert.equal(found[0].key, 'mandays:l1:96:87');
  f.manDays = [{ ...line, billed: 87, excess: 0, excessInr: 0, flagged: false }];
  assert.ok(subcontractBillChecks(f).some((c) => c.key === 'mandays' && c.ok));
  assert.equal(subcontractBillChecks(sb).filter((c) => c.key.startsWith('mandays')).length, 0);
});
test('subcontract bill: invoice already billed', () => {
  const f = clone(sb);
  f.duplicates = [{ label: 'WO-2026-0002 bill 1', href: '/subcontract-bills/x' }];
  assert.equal(flagged(subcontractBillChecks(f), 'duplicate:').length, 1);
});

// ---------------------------------------------------------------------------------------------------------------------
// RA bills

const ra: RaBillFacts = {
  items: [{ id: 'r1', itemNo: '4.2', unit: 'Cum', boqQty: 1200, rate: 2500, boqRate: 2500, prevQty: 800, thisQty: 300, uptoQty: 1100, certifiedQty: null, amount: 750000, earlierBilled: 800, measuredToDate: 1100 }],
  grossAmount: 750000,
  pvAmount: 0,
  gstRate: 18,
  gstAmount: 135000,
  deductions: [
    { label: 'Retention', pct: 5, amount: 37500 },
    { label: 'Advance recovery', pct: 10, amount: 50000, capped: true },
    { label: 'TDS', pct: 2, amount: 15000 },
  ],
  otherDeduction: 0,
  totalDeductions: 102500,
  netPayable: 782500,
};

test('RA bill: a clean bill has only ticks', () => assert.deepEqual(flags(raBillChecks(ra)), []));
test('RA bill: past the BOQ quantity', () => {
  const f = clone(ra);
  f.items[0].boqQty = 1000;
  const [c] = flagged(raBillChecks(f), 'boq-qty:');
  assert.equal(c.title, 'Bill takes BOQ item 4.2 past its contract quantity');
  assert.match(c.detail!, /1,100 Cum billed to date against 1,000 Cum/);
});
test('RA bill: billed beyond the measurement book', () => {
  const f = clone(ra);
  f.items[0].measuredToDate = 1050;
  assert.equal(flagged(raBillChecks(f), 'measured:').length, 1);
});
test('RA bill: rate differs from the BOQ', () => {
  const f = clone(ra);
  f.items[0].boqRate = 2450;
  assert.equal(flagged(raBillChecks(f), 'rate:')[0].title, 'Rate ₹2,500 on item 4.2 differs from the BOQ rate ₹2,450');
});
test('RA bill: previous quantity differs after the client certified less', () => {
  const f = clone(ra);
  f.items[0].earlierBilled = 780;
  assert.equal(flagged(raBillChecks(f), 'prev:').length, 1);
});
test('RA bill: a certified quantity prices the item', () => {
  const f = clone(ra);
  f.items[0].certifiedQty = 290;
  assert.match(flagged(raBillChecks(f), 'totals')[0].detail!, /Item 4.2 amount is ₹7,50,000, should be ₹7,25,000/);
});
test('RA bill: net payable wrong', () => {
  const f = clone(ra);
  f.netPayable = 790000;
  assert.match(flagged(raBillChecks(f), 'totals')[0].detail!, /Net payable/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Expenses

const gstin = `27AAPFU0939F1Z${gstinCheckChar('27AAPFU0939F1Z')}`;
const ex: ExpenseFacts = { amount: 2400, gstRate: 18, gstAmount: 432, totalAmount: 2832, paymentMode: 'CASH', vendorGstin: gstin, gstinValid: gstinChecksumOk(gstin), billNo: 'B-3105', duplicates: [] };

test('GSTIN check character: known GSTINs pass, a typo fails', () => {
  assert.equal(gstinChecksumOk('27AAPFU0939F1ZV'), true);
  assert.equal(gstinChecksumOk('29AAGCB7383J1Z4'), true);
  assert.equal(gstinChecksumOk('27AAPFU0939F1ZW'), false);
  assert.equal(gstinChecksumOk('27AAPFU0939G1ZV'), false);
});
test('expense: a clean expense has only ticks', () => assert.deepEqual(flags(expenseChecks(ex)), []));
test('expense: GST does not add up', () => {
  assert.equal(flagged(expenseChecks({ ...ex, gstAmount: 500, totalAmount: 2900 }), 'gst').length, 1);
});
test('expense: mistyped GSTIN', () => {
  assert.equal(flagged(expenseChecks({ ...ex, vendorGstin: '27AAPFU0939F1ZW', gstinValid: false }), 'gstin:')[0].title, 'GSTIN 27AAPFU0939F1ZW fails its check character');
});
test('expense: no GSTIN, no GSTIN tick', () => assert.equal(expenseChecks({ ...ex, vendorGstin: null, gstinValid: null }).some((c) => c.key.startsWith('gstin')), false));
test('expense: cash above ₹10,000', () => {
  assert.equal(flagged(expenseChecks({ ...ex, amount: 14500, gstRate: 0, gstAmount: 0, totalAmount: 14500 }), 'cash:')[0].title, '₹14,500 paid in cash, above the ₹10,000 limit');
  assert.equal(flagged(expenseChecks({ ...ex, amount: 14500, gstRate: 0, gstAmount: 0, totalAmount: 14500, paymentMode: 'BANK' }), 'cash').length, 0);
  assert.equal(flagged(expenseChecks({ ...ex, amount: 10000, gstRate: 0, gstAmount: 0, totalAmount: 10000 }), 'cash').length, 0);
});
test('expense: filed before, by bill or by vendor, amount and day', () => {
  const c = expenseChecks({ ...ex, duplicates: [{ label: 'EXP-2026-0004', href: '/expenses/a', sameBill: true }, { label: 'EXP-2026-0006', href: '/expenses/b', sameBill: false }] });
  assert.deepEqual(flagged(c, 'duplicate:').map((f) => f.title), ['Bill B-3105 already filed on EXP-2026-0004', 'Looks like EXP-2026-0006: same vendor, amount and date']);
});
test('summary from the rules', () => {
  assert.equal(rulesSummary(expenseChecks(ex)), 'All 4 checks pass.');
  assert.equal(rulesSummary(expenseChecks({ ...ex, amount: 14500, gstRate: 0, gstAmount: 0, totalAmount: 14500 })), '1 thing to look at: ₹14,500 paid in cash, above the ₹10,000 limit.');
});

// ---------------------------------------------------------------------------------------------------------------------

function runRules(): number {
  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      fn();
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
    }
  }
  console.log(`Rules: ${cases.length - failed} of ${cases.length} tests pass`);
  return failed;
}

/** What each seeded anomaly must be flagged with (the rule's key prefix); found by invoice or description. */
const ANOMALIES: { kind: 'vendor-bill' | 'expense' | 'subcontract-bill'; find: string; expect: string[] }[] = [
  { kind: 'vendor-bill', find: 'UCT/2026/551', expect: ['rate:'] },
  { kind: 'vendor-bill', find: 'KBA-26-27-0213', expect: ['qty:', 'duplicate:'] },
  { kind: 'expense', find: 'Hydraulic hose for grader GRD-01', expect: ['duplicate:'] },
  { kind: 'expense', find: 'JCB hire for trench backfilling, 1 day', expect: ['cash:'] },
  { kind: 'expense', find: 'Waterproofing compound, 2 buckets', expect: ['gstin:'] },
  // Attendance cross-check (item 124): 9 more helper man-days than the head count.
  { kind: 'subcontract-bill', find: 'SJC/LAB/26/014', expect: ['mandays:'] },
];

async function runDemo(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { BillChecksService } = await import('../checks/bill-checks.service');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const checks = app.get(BillChecksService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let bills = 0;
  await new Promise<void>((resolve, reject) =>
    tenantMiddleware(null, null, () => {
      setTenant(org.id);
      (async () => {
        const admin = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, role: { key: 'ADMIN' }, isActive: true }, include: { role: true } });
        const user = { id: admin.id, organizationId: org.id, roleKey: admin.role.key, fullName: admin.fullName, email: admin.email } as never;
        const where = { organizationId: org.id };
        const all = [
          ...(await prisma.vendorBill.findMany({ where, select: { id: true, invoiceNo: true, billNo: true } })).map((b) => ({ kind: 'vendor-bill' as const, id: b.id, find: b.invoiceNo, label: b.billNo })),
          ...(await prisma.expense.findMany({ where, select: { id: true, description: true, expenseNo: true } })).map((b) => ({ kind: 'expense' as const, id: b.id, find: b.description, label: b.expenseNo })),
          ...(await prisma.subcontractBill.findMany({ where, select: { id: true, billNo: true, invoiceNo: true, workOrder: { select: { woNo: true } } } })).map((b) => ({ kind: 'subcontract-bill' as const, id: b.id, find: b.invoiceNo ?? '', label: `${b.workOrder.woNo} bill ${b.billNo}` })),
          ...(await prisma.raBill.findMany({ where, select: { id: true, billNo: true, project: { select: { code: true } } } })).map((b) => ({ kind: 'ra-bill' as const, id: b.id, find: '', label: `${b.project.code} RA bill ${b.billNo}` })),
        ];
        // Bills the browser tests made on a reused database are not demo data.
        const demo = all.filter((b) => !/^E2E|e2e/i.test(b.find));
        for (const anomaly of ANOMALIES) if (!demo.some((b) => b.kind === anomaly.kind && b.find === anomaly.find)) problems.push(`Seeded anomaly not found: ${anomaly.find}`);
        for (const b of demo) {
          bills++;
          const found = flags(await checks.checksOf(user, b.kind, b.id));
          const anomaly = ANOMALIES.find((a) => a.kind === b.kind && a.find === b.find);
          if (anomaly) {
            for (const key of anomaly.expect) if (!found.some((f) => f.key.startsWith(key))) problems.push(`${b.label} (${b.find}): expected a ${key} flag, got ${found.map((f) => f.key).join(', ') || 'none'}`);
            for (const f of found) if (!anomaly.expect.some((key) => f.key.startsWith(key))) problems.push(`${b.label}: unexpected flag "${f.title}"`);
          } else for (const f of found) problems.push(`${b.label}: clean demo record flagged "${f.title}"${f.detail ? ` (${f.detail})` : ''}`);
        }
      })().then(resolve, reject);
    }),
  );
  await app.close();
  for (const p of problems) console.error(`FAIL ${p}`);
  console.log(`Demo data: ${bills} bills and expenses checked, ${ANOMALIES.length} seeded anomalies, ${problems.length} problems`);
  return problems.length;
}

async function main() {
  let failed = runRules();
  if (process.env.DATABASE_URL) failed += await runDemo();
  process.exit(failed ? 1 : 0);
}

void main();
