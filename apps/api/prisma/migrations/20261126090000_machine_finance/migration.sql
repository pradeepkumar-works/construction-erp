-- Machine finance (v6 item 108): loans on financed machines and their EMI schedules.

-- CreateEnum
CREATE TYPE "LoanDisbursal" AS ENUM ('MACHINE_COST', 'BANK');

-- CreateEnum
CREATE TYPE "EquipmentLoanStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "EquipmentLoan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "vendorId" TEXT,
    "loanNo" TEXT NOT NULL,
    "sanctionDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "ratePct" DECIMAL(6,3) NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "emi" DECIMAL(18,2) NOT NULL,
    "firstEmiDate" DATE NOT NULL,
    "disbursal" "LoanDisbursal" NOT NULL DEFAULT 'MACHINE_COST',
    "status" "EquipmentLoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedOn" DATE,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tallyExportId" TEXT,

    CONSTRAINT "EquipmentLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanEmi" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "opening" DECIMAL(18,2) NOT NULL,
    "principal" DECIMAL(18,2) NOT NULL,
    "interest" DECIMAL(18,2) NOT NULL,
    "emi" DECIMAL(18,2) NOT NULL,
    "closing" DECIMAL(18,2) NOT NULL,
    "paidOn" DATE,
    "mode" "PaymentMode",
    "reference" TEXT,
    "paidById" TEXT,
    "tallyExportId" TEXT,

    CONSTRAINT "LoanEmi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentLoan_organizationId_equipmentId_idx" ON "EquipmentLoan"("organizationId", "equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentLoan_tallyExportId_idx" ON "EquipmentLoan"("tallyExportId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentLoan_organizationId_loanNo_key" ON "EquipmentLoan"("organizationId", "loanNo");

-- CreateIndex
CREATE INDEX "LoanEmi_organizationId_dueDate_idx" ON "LoanEmi"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "LoanEmi_tallyExportId_idx" ON "LoanEmi"("tallyExportId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanEmi_loanId_no_key" ON "LoanEmi"("loanId", "no");

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanEmi" ADD CONSTRAINT "LoanEmi_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanEmi" ADD CONSTRAINT "LoanEmi_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "EquipmentLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanEmi" ADD CONSTRAINT "LoanEmi_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanEmi" ADD CONSTRAINT "LoanEmi_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A loan's terms are sane, and an EMI's parts add up.
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_terms" CHECK ("amount" > 0 AND "emi" > 0 AND "ratePct" >= 0 AND "ratePct" <= 36 AND "tenureMonths" BETWEEN 1 AND 120 AND "firstEmiDate" >= "sanctionDate");
ALTER TABLE "LoanEmi" ADD CONSTRAINT "LoanEmi_adds_up" CHECK ("principal" >= 0 AND "interest" >= 0 AND "emi" = "principal" + "interest" AND "closing" = "opening" - "principal" AND "closing" >= 0);
ALTER TABLE "LoanEmi" ADD CONSTRAINT "LoanEmi_paid" CHECK (("paidOn" IS NULL) = ("mode" IS NULL));

-- Row-level security, as every tenant table.
ALTER TABLE "EquipmentLoan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentLoan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EquipmentLoan"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "LoanEmi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanEmi" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LoanEmi"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
