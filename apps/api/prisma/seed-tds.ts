import { Prisma, PrismaClient } from '@prisma/client';
import { depositDue, quarterOf, quarterStep, rateText, tdsRate } from '@erp/shared';
import { seedToday } from './seed-clock';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * TDS returns. The demo company's TAN; a deduction for every approved subcontractor bill, payment and approved salary
 * run that deducted TDS and has none yet (the seed writes those records directly, so this is the migration's backfill
 * for them); the sections of the payments' TDS confirmed as 194C, all but the latest, which waits under To fix; and last
 * quarter's deductions deposited by one challan a month on the 7th, as the bank would have stamped it. Writes only what
 * is missing: the TAN when there is none, deductions for records without one, challans when the company has none.
 */
export async function seedTds(prisma: PrismaClient, organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { tan: true } });
  if (!org) return;
  if (!org.tan) await prisma.organization.update({ where: { id: organizationId }, data: { tan: 'BBND04217C' } });

  const pan = (col: string) => `CASE WHEN upper(trim(${col})) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN upper(trim(${col})) END`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "TdsDeduction" ("id", "organizationId", "form", "section", "vendorId", "deducteeName", "deducteePan", "projectId", "paidOn", "amountPaid", "rate", "tdsAmount", "subcontractBillId", "backfilled", "updatedAt")
     SELECT gen_random_uuid()::text, b."organizationId", 'FORM_26Q', '194C', w."vendorId", v."name", ${pan('v."pan"')}, b."projectId", b."billDate", b."grossAmount", b."tdsPct", b."tdsAmount", b."id", true, CURRENT_TIMESTAMP
     FROM "SubcontractBill" b JOIN "WorkOrder" w ON w."id" = b."workOrderId" JOIN "Vendor" v ON v."id" = w."vendorId"
     WHERE b."organizationId" = $1 AND b."status" = 'APPROVED' AND b."tdsAmount" > 0 AND NOT EXISTS (SELECT 1 FROM "TdsDeduction" d WHERE d."subcontractBillId" = b."id")`,
    organizationId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "TdsDeduction" ("id", "organizationId", "form", "section", "vendorId", "deducteeName", "deducteePan", "projectId", "paidOn", "amountPaid", "rate", "tdsAmount", "vendorPaymentId", "backfilled", "updatedAt")
     SELECT gen_random_uuid()::text, p."organizationId", 'FORM_26Q', NULL, p."vendorId", v."name", ${pan('v."pan"')}, p."projectId", p."paymentDate", p."amount" + p."tdsAmount" + p."otherDeduction", NULL, p."tdsAmount", p."id", true, CURRENT_TIMESTAMP
     FROM "VendorPayment" p JOIN "Vendor" v ON v."id" = p."vendorId"
     WHERE p."organizationId" = $1 AND p."tdsAmount" > 0 AND NOT EXISTS (SELECT 1 FROM "TdsDeduction" d WHERE d."vendorPaymentId" = p."id")`,
    organizationId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "TdsDeduction" ("id", "organizationId", "form", "section", "employeeId", "deducteeName", "deducteePan", "deducteeRef", "projectId", "paidOn", "amountPaid", "rate", "tdsAmount", "payslipId", "backfilled", "updatedAt")
     SELECT gen_random_uuid()::text, s."organizationId", 'FORM_24Q', '192', s."employeeId", s."employeeName", ${pan('s."pan"')}, s."employeeCode", s."projectId",
            (to_date(r."month" || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date,
            s."gross", CASE WHEN s."gross" > 0 THEN round(t."tds" * 100 / s."gross", 3) END, t."tds", s."id", true, CURRENT_TIMESTAMP
     FROM "Payslip" s JOIN "PayrollRun" r ON r."id" = s."runId"
     JOIN (SELECT "payslipId", sum("amount") AS "tds" FROM "PayslipLine" WHERE "code" = 'TDS' GROUP BY "payslipId") t ON t."payslipId" = s."id"
     WHERE s."organizationId" = $1 AND r."status" IN ('APPROVED', 'PAID') AND t."tds" > 0 AND NOT EXISTS (SELECT 1 FROM "TdsDeduction" d WHERE d."payslipId" = s."id")`,
    organizationId,
  );

  // The payments' TDS taken before sections were kept: confirmed as 194C at the rate for the vendor, all but the latest.
  const toConfirm = await prisma.tdsDeduction.findMany({ where: { organizationId, section: null, challanId: null }, orderBy: [{ paidOn: 'asc' }, { id: 'asc' }], select: { id: true, paidOn: true, amountPaid: true, deducteePan: true } });
  for (const d of toConfirm.slice(0, -1)) {
    const r = tdsRate('194C', { pan: d.deducteePan, certificate: null }, ymd(d.paidOn), d.amountPaid.toString());
    await prisma.tdsDeduction.update({ where: { id: d.id }, data: { section: '194C', rate: D(rateText(r.rate)), reason: r.reason } });
  }

  if (await prisma.tdsChallan.count({ where: { organizationId } })) return;
  const [accounts, books] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId, email: 'accounts@demo.com' }, select: { id: true } }),
    prisma.booksState.findUnique({ where: { organizationId }, select: { lockedUpTo: true, booksFrom: true } }),
  ]);
  if (!accounts) return;
  const today = seedToday();
  const last = quarterStep(quarterOf(today), -1);
  const lockedUpTo = books?.lockedUpTo ? ymd(books.lockedUpTo) : null;
  const booksFrom = books?.booksFrom ? ymd(books.booksFrom) : null;
  const due = await prisma.tdsDeduction.findMany({
    where: { organizationId, section: { not: null }, challanId: null, paidOn: { gte: new Date(`${last.from}T00:00:00Z`), lte: new Date(`${last.to}T00:00:00Z`) } },
    select: { id: true, form: true, paidOn: true, tdsAmount: true },
  });
  // One challan a month per return, deposited on its due day: the 7th of the next month (30 April for March).
  const groups = new Map<string, typeof due>();
  for (const d of due) {
    const key = `${d.form}:${depositDue(ymd(d.paidOn))}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  let serial = 101;
  for (const [key, rows] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const [form, on] = key.split(':') as ['FORM_26Q' | 'FORM_24Q', string];
    if (on > today || (lockedUpTo && on <= lockedUpTo) || (booksFrom && on < booksFrom)) continue;
    await prisma.$transaction(async (tx) => {
      const c = await tx.tdsChallan.create({
        data: { organizationId, form, bsrCode: '0510308', challanSerial: String(serial++).padStart(5, '0'), depositedOn: new Date(`${on}T00:00:00Z`), tax: rows.reduce((t, r) => t.add(r.tdsAmount), D(0)), createdById: accounts.id },
      });
      await tx.tdsDeduction.updateMany({ where: { id: { in: rows.map((r) => r.id) }, challanId: null }, data: { challanId: c.id } });
    }, { maxWait: 15_000, timeout: 60_000 });
  }
}
