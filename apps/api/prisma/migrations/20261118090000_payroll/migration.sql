-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('NEW', 'OLD');

-- CreateEnum
CREATE TYPE "PaidDaysBasis" AS ENUM ('CALENDAR', 'FIXED_26');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "PayslipLineKind" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER');

-- CreateEnum
CREATE TYPE "StaffLoanKind" AS ENUM ('LOAN', 'ADVANCE');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "PayrollSettings" (
    "organizationId" TEXT NOT NULL,
    "pfEmployeePct" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "pfEmployerPct" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "epsPct" DECIMAL(5,2) NOT NULL DEFAULT 8.33,
    "pfWageCeiling" DECIMAL(18,2) NOT NULL DEFAULT 15000,
    "pfCapAtCeiling" BOOLEAN NOT NULL DEFAULT true,
    "esiEmployeePct" DECIMAL(5,2) NOT NULL DEFAULT 0.75,
    "esiEmployerPct" DECIMAL(5,2) NOT NULL DEFAULT 3.25,
    "esiGrossCeiling" DECIMAL(18,2) NOT NULL DEFAULT 21000,
    "ptState" TEXT DEFAULT '21',
    "paidDaysBasis" "PaidDaysBasis" NOT NULL DEFAULT 'CALENDAR',
    "overtimeMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 2,
    "debitAccountNo" TEXT,
    "debitBankName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "basic" DECIMAL(18,2) NOT NULL,
    "da" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hra" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "conveyance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "special" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherEarnings" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pf" BOOLEAN NOT NULL DEFAULT true,
    "esi" BOOLEAN NOT NULL DEFAULT true,
    "pt" BOOLEAN NOT NULL DEFAULT true,
    "taxRegime" "TaxRegime" NOT NULL DEFAULT 'NEW',
    "declaredDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffLoan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "StaffLoanKind" NOT NULL,
    "issuedOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "emi" DECIMAL(18,2) NOT NULL,
    "startMonth" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runNo" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "gross" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "employerCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "preparedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "paidById" TEXT,
    "paidOn" DATE,
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "structureId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "projectName" TEXT,
    "pan" TEXT,
    "uan" TEXT,
    "esiNumber" TEXT,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "bankIfsc" TEXT,
    "monthDays" DECIMAL(5,1) NOT NULL,
    "paidDays" DECIMAL(5,1) NOT NULL,
    "lopDays" DECIMAL(5,1) NOT NULL,
    "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(18,2) NOT NULL,
    "deductions" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "employerCost" DECIMAL(18,2) NOT NULL,
    "pfWages" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "esiWages" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "kind" "PayslipLineKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "loanId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayslipLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalSettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "settlementNo" TEXT NOT NULL,
    "lastWorkingDay" DATE NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "salaryDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "leaveDays" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "leaveEncashment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "serviceYears" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gratuity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "noticeShortDays" INTEGER NOT NULL DEFAULT 0,
    "noticeRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "loanRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherEarnings" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidOn" DATE,
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryStructure_organizationId_idx" ON "SalaryStructure"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryStructure_employeeId_effectiveFrom_key" ON "SalaryStructure"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "StaffLoan_organizationId_employeeId_idx" ON "StaffLoan"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollRun_organizationId_month_idx" ON "PayrollRun"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_organizationId_runNo_key" ON "PayrollRun"("organizationId", "runNo");

-- CreateIndex
CREATE INDEX "Payslip_organizationId_employeeId_idx" ON "Payslip"("organizationId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_runId_employeeId_key" ON "Payslip"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "PayslipLine_payslipId_idx" ON "PayslipLine"("payslipId");

-- CreateIndex
CREATE INDEX "PayslipLine_loanId_idx" ON "PayslipLine"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "FinalSettlement_employeeId_key" ON "FinalSettlement"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "FinalSettlement_organizationId_settlementNo_key" ON "FinalSettlement"("organizationId", "settlementNo");

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLoan" ADD CONSTRAINT "StaffLoan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLoan" ADD CONSTRAINT "StaffLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLoan" ADD CONSTRAINT "StaffLoan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "SalaryStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "StaffLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalSettlement" ADD CONSTRAINT "FinalSettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalSettlement" ADD CONSTRAINT "FinalSettlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalSettlement" ADD CONSTRAINT "FinalSettlement_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalSettlement" ADD CONSTRAINT "FinalSettlement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "PayrollSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PayrollSettings"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SalaryStructure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalaryStructure" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SalaryStructure"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "StaffLoan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffLoan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StaffLoan"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PayrollRun"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "Payslip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payslip" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payslip"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "PayslipLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayslipLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PayslipLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "FinalSettlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinalSettlement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FinalSettlement"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
