-- TDS by section and the quarterly returns (ARCHITECTURE "TDS returns"): deductions, challans, returns filed, lower
-- deduction certificates, the company's TAN, and the deductions made before sections backfilled from each tdsAmount.

-- CreateEnum
CREATE TYPE "TdsReturnForm" AS ENUM ('FORM_26Q', 'FORM_24Q');

-- CreateEnum
CREATE TYPE "TdsReturnStatus" AS ENUM ('FILED', 'REOPENED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "tan" TEXT;

-- CreateTable
CREATE TABLE "TdsDeduction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "form" "TdsReturnForm" NOT NULL,
    "section" TEXT,
    "vendorId" TEXT,
    "employeeId" TEXT,
    "deducteeName" TEXT NOT NULL,
    "deducteePan" TEXT,
    "deducteeRef" TEXT,
    "projectId" TEXT,
    "paidOn" DATE NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL,
    "rate" DECIMAL(6,3),
    "tdsAmount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "certificateNo" TEXT,
    "vendorPaymentId" TEXT,
    "subcontractBillId" TEXT,
    "payslipId" TEXT,
    "challanId" TEXT,
    "backfilled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdsChallan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "form" "TdsReturnForm" NOT NULL,
    "bsrCode" TEXT NOT NULL,
    "challanSerial" TEXT NOT NULL,
    "depositedOn" DATE NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "interest" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "other" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "minorHead" TEXT NOT NULL DEFAULT '200',
    "createdById" TEXT NOT NULL,
    "tallyExportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsChallan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdsReturn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "form" "TdsReturnForm" NOT NULL,
    "periodFrom" DATE NOT NULL,
    "status" "TdsReturnStatus" NOT NULL DEFAULT 'FILED',
    "filedOn" DATE NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "corrections" INTEGER NOT NULL DEFAULT 0,
    "filedById" TEXT NOT NULL,
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdsCertificate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "rate" DECIMAL(6,3) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "limitAmount" DECIMAL(18,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TdsCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TdsDeduction_vendorPaymentId_key" ON "TdsDeduction"("vendorPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "TdsDeduction_subcontractBillId_key" ON "TdsDeduction"("subcontractBillId");

-- CreateIndex
CREATE UNIQUE INDEX "TdsDeduction_payslipId_key" ON "TdsDeduction"("payslipId");

-- CreateIndex
CREATE INDEX "TdsDeduction_organizationId_form_paidOn_idx" ON "TdsDeduction"("organizationId", "form", "paidOn");

-- CreateIndex
CREATE INDEX "TdsDeduction_challanId_idx" ON "TdsDeduction"("challanId");

-- CreateIndex
CREATE INDEX "TdsDeduction_vendorId_idx" ON "TdsDeduction"("vendorId");

-- CreateIndex
CREATE INDEX "TdsDeduction_employeeId_idx" ON "TdsDeduction"("employeeId");

-- CreateIndex
CREATE INDEX "TdsChallan_organizationId_form_depositedOn_idx" ON "TdsChallan"("organizationId", "form", "depositedOn");

-- CreateIndex
CREATE INDEX "TdsChallan_tallyExportId_idx" ON "TdsChallan"("tallyExportId");

-- CreateIndex
CREATE UNIQUE INDEX "TdsChallan_organizationId_bsrCode_depositedOn_challanSerial_key" ON "TdsChallan"("organizationId", "bsrCode", "depositedOn", "challanSerial");

-- CreateIndex
CREATE UNIQUE INDEX "TdsReturn_organizationId_form_periodFrom_key" ON "TdsReturn"("organizationId", "form", "periodFrom");

-- CreateIndex
CREATE INDEX "TdsCertificate_vendorId_section_idx" ON "TdsCertificate"("vendorId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "TdsCertificate_organizationId_certificateNo_key" ON "TdsCertificate"("organizationId", "certificateNo");

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_vendorPaymentId_fkey" FOREIGN KEY ("vendorPaymentId") REFERENCES "VendorPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_subcontractBillId_fkey" FOREIGN KEY ("subcontractBillId") REFERENCES "SubcontractBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "TdsChallan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChallan" ADD CONSTRAINT "TdsChallan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChallan" ADD CONSTRAINT "TdsChallan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChallan" ADD CONSTRAINT "TdsChallan_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsReturn" ADD CONSTRAINT "TdsReturn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsReturn" ADD CONSTRAINT "TdsReturn_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsReturn" ADD CONSTRAINT "TdsReturn_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsCertificate" ADD CONSTRAINT "TdsCertificate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsCertificate" ADD CONSTRAINT "TdsCertificate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsCertificate" ADD CONSTRAINT "TdsCertificate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A deduction comes from exactly one payment, bill or payslip, and deducts something.
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_one_source" CHECK (num_nonnulls("vendorPaymentId", "subcontractBillId", "payslipId") = 1);
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_tds_positive" CHECK ("tdsAmount" > 0);
ALTER TABLE "TdsChallan" ADD CONSTRAINT "TdsChallan_amounts" CHECK ("tax" >= 0 AND "interest" >= 0 AND "fee" >= 0 AND "other" >= 0);

ALTER TABLE "TdsDeduction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TdsDeduction" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TdsDeduction"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "TdsChallan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TdsChallan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TdsChallan"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "TdsReturn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TdsReturn" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TdsReturn"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "TdsCertificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TdsCertificate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TdsCertificate"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

-- One-time backfill: every TDS amount recorded before sections becomes a deduction, marked backfilled so its voucher
-- keeps the old TDS Payable ledger. Approved subcontractor bills are 194C at the work order's percent; approved or paid
-- salary runs are 192 per payslip on the month's last day; a vendor payment's section is not known, so it is left to
-- confirm (it blocks the quarter's return until accounts pick one).
INSERT INTO "TdsDeduction" ("id", "organizationId", "form", "section", "vendorId", "deducteeName", "deducteePan", "projectId", "paidOn", "amountPaid", "rate", "tdsAmount", "subcontractBillId", "backfilled", "updatedAt")
SELECT gen_random_uuid()::text, b."organizationId", 'FORM_26Q', '194C', w."vendorId", v."name",
       CASE WHEN upper(trim(v."pan")) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN upper(trim(v."pan")) END,
       b."projectId", b."billDate", b."grossAmount", b."tdsPct", b."tdsAmount", b."id", true, CURRENT_TIMESTAMP
FROM "SubcontractBill" b
JOIN "WorkOrder" w ON w."id" = b."workOrderId"
JOIN "Vendor" v ON v."id" = w."vendorId"
WHERE b."status" = 'APPROVED' AND b."tdsAmount" > 0;

INSERT INTO "TdsDeduction" ("id", "organizationId", "form", "section", "vendorId", "deducteeName", "deducteePan", "projectId", "paidOn", "amountPaid", "rate", "tdsAmount", "vendorPaymentId", "backfilled", "updatedAt")
SELECT gen_random_uuid()::text, p."organizationId", 'FORM_26Q', NULL, p."vendorId", v."name",
       CASE WHEN upper(trim(v."pan")) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN upper(trim(v."pan")) END,
       p."projectId", p."paymentDate", p."amount" + p."tdsAmount" + p."otherDeduction", NULL, p."tdsAmount", p."id", true, CURRENT_TIMESTAMP
FROM "VendorPayment" p
JOIN "Vendor" v ON v."id" = p."vendorId"
WHERE p."tdsAmount" > 0;

INSERT INTO "TdsDeduction" ("id", "organizationId", "form", "section", "employeeId", "deducteeName", "deducteePan", "deducteeRef", "projectId", "paidOn", "amountPaid", "rate", "tdsAmount", "payslipId", "backfilled", "updatedAt")
SELECT gen_random_uuid()::text, s."organizationId", 'FORM_24Q', '192', s."employeeId", s."employeeName",
       CASE WHEN upper(trim(s."pan")) ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN upper(trim(s."pan")) END,
       s."employeeCode", s."projectId",
       (to_date(r."month" || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date,
       s."gross", CASE WHEN s."gross" > 0 THEN round(t."tds" * 100 / s."gross", 3) END, t."tds", s."id", true, CURRENT_TIMESTAMP
FROM "Payslip" s
JOIN "PayrollRun" r ON r."id" = s."runId"
JOIN (SELECT "payslipId", sum("amount") AS "tds" FROM "PayslipLine" WHERE "code" = 'TDS' GROUP BY "payslipId") t ON t."payslipId" = s."id"
WHERE r."status" IN ('APPROVED', 'PAID') AND t."tds" > 0;
