-- CreateEnum
CREATE TYPE "AccountGroup" AS ENUM ('CAPITAL_ACCOUNT', 'RESERVES_SURPLUS', 'LOANS_LIABILITY', 'SECURED_LOANS', 'UNSECURED_LOANS', 'CURRENT_LIABILITIES', 'DUTIES_TAXES', 'PROVISIONS', 'SUNDRY_CREDITORS', 'FIXED_ASSETS', 'INVESTMENTS', 'CURRENT_ASSETS', 'BANK_ACCOUNTS', 'CASH_IN_HAND', 'DEPOSITS_ASSET', 'LOANS_ADVANCES_ASSET', 'STOCK_IN_HAND', 'SUNDRY_DEBTORS', 'SALES_ACCOUNTS', 'DIRECT_INCOMES', 'INDIRECT_INCOMES', 'PURCHASE_ACCOUNTS', 'DIRECT_EXPENSES', 'INDIRECT_EXPENSES', 'SUSPENSE');

-- CreateEnum
CREATE TYPE "BookVoucherType" AS ENUM ('JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'SALES', 'PURCHASE', 'DEBIT_NOTE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "BookVoucherStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "tallyExportId" TEXT,
ADD COLUMN     "tallyPaymentExportId" TEXT;

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "group" "AccountGroup" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookVoucher" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "type" "BookVoucherType" NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "reference" TEXT,
    "party" TEXT,
    "narration" TEXT NOT NULL,
    "projectId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "BookVoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "hash" TEXT,
    "preparedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BookLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BooksState" (
    "organizationId" TEXT NOT NULL,
    "lastPostedAt" TIMESTAMP(3),
    "held" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "BooksState_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_organizationId_key_key" ON "LedgerAccount"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_organizationId_name_key" ON "LedgerAccount"("organizationId", "name");

-- CreateIndex
CREATE INDEX "BookVoucher_organizationId_date_idx" ON "BookVoucher"("organizationId", "date");

-- CreateIndex
CREATE INDEX "BookVoucher_organizationId_status_idx" ON "BookVoucher"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BookVoucher_organizationId_source_sourceId_key" ON "BookVoucher"("organizationId", "source", "sourceId");

-- CreateIndex
CREATE INDEX "BookLine_accountId_idx" ON "BookLine"("accountId");

-- CreateIndex
CREATE INDEX "BookLine_voucherId_idx" ON "BookLine"("voucherId");

-- CreateIndex
CREATE INDEX "BookLine_organizationId_projectId_idx" ON "BookLine"("organizationId", "projectId");

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tallyPaymentExportId_fkey" FOREIGN KEY ("tallyPaymentExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookVoucher" ADD CONSTRAINT "BookVoucher_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookVoucher" ADD CONSTRAINT "BookVoucher_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookVoucher" ADD CONSTRAINT "BookVoucher_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookVoucher" ADD CONSTRAINT "BookVoucher_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLine" ADD CONSTRAINT "BookLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLine" ADD CONSTRAINT "BookLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "BookVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLine" ADD CONSTRAINT "BookLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookLine" ADD CONSTRAINT "BookLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksState" ADD CONSTRAINT "BooksState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "StaffLoan" ADD COLUMN     "tallyExportId" TEXT;

-- AddForeignKey
ALTER TABLE "StaffLoan" ADD CONSTRAINT "StaffLoan_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security for the books (see 20261013211500_tenant_rls)
ALTER TABLE "LedgerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LedgerAccount" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LedgerAccount"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "BookVoucher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookVoucher" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookVoucher"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "BookLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "BooksState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BooksState" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BooksState"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
