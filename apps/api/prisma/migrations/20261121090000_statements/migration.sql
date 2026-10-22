-- CreateEnum
CREATE TYPE "StatementLine" AS ENUM ('REVENUE', 'OTHER_INCOME', 'MATERIALS', 'INVENTORY_CHANGE', 'CONSTRUCTION', 'EMPLOYEE', 'FINANCE', 'DEPRECIATION', 'OTHER_EXPENSES', 'TAX', 'SHARE_CAPITAL', 'RESERVES', 'LONG_BORROWINGS', 'SHORT_BORROWINGS', 'TRADE_PAYABLES', 'OTHER_CURRENT_LIABILITIES', 'SHORT_PROVISIONS', 'PPE', 'CWIP', 'INVESTMENTS', 'LONG_LOANS', 'INVENTORIES', 'TRADE_RECEIVABLES', 'CASH', 'SHORT_LOANS', 'OTHER_CURRENT_ASSETS');

-- AlterTable
ALTER TABLE "BooksState" ADD COLUMN     "booksFrom" DATE,
ADD COLUMN     "lockedUpTo" DATE;

-- AlterTable
ALTER TABLE "LedgerAccount" ADD COLUMN     "statementLine" "StatementLine";

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "withdrawal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deposit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2),
    "seq" INTEGER NOT NULL DEFAULT 0,
    "fingerprint" TEXT NOT NULL,
    "bookLineId" TEXT,
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_bookLineId_key" ON "BankStatementLine"("bookLineId");

-- CreateIndex
CREATE INDEX "BankStatementLine_organizationId_accountId_date_idx" ON "BankStatementLine"("organizationId", "accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_organizationId_accountId_fingerprint_key" ON "BankStatementLine"("organizationId", "accountId", "fingerprint");

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bookLineId_fkey" FOREIGN KEY ("bookLineId") REFERENCES "BookLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (see 20261013211500_tenant_rls)
ALTER TABLE "BankStatementLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankStatementLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BankStatementLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
