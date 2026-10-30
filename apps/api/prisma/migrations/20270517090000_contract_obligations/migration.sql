-- CreateEnum
CREATE TYPE "ObligationAnchor" AS ENUM ('AGREEMENT', 'START', 'COMPLETION', 'HANDOVER', 'DATE');

-- CreateEnum
CREATE TYPE "ObligationPenalty" AS ENUM ('NONE', 'WITHHOLD_PCT', 'ONCE_PCT', 'PER_MONTH', 'ONCE_AMOUNT');

-- CreateEnum
CREATE TYPE "ObligationParty" AS ENUM ('CONTRACTOR', 'CLIENT');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "securityDepositCapPct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "RaBill" ADD COLUMN     "obligationLines" JSONB,
ADD COLUMN     "obligationRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ContractObligation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "clause" TEXT,
    "party" "ObligationParty" NOT NULL DEFAULT 'CONTRACTOR',
    "anchor" "ObligationAnchor" NOT NULL,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "offsetMonths" INTEGER NOT NULL DEFAULT 0,
    "dueOn" DATE,
    "penalty" "ObligationPenalty" NOT NULL DEFAULT 'NONE',
    "penaltyValue" DECIMAL(18,3),
    "metOn" DATE,
    "waived" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractObligation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractObligation_organizationId_metOn_idx" ON "ContractObligation"("organizationId", "metOn");

-- CreateIndex
CREATE UNIQUE INDEX "ContractObligation_projectId_code_key" ON "ContractObligation"("projectId", "code");

-- AddForeignKey
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A day of its own for a DATE obligation, offsets within reason, and the client's obligations carry no penalty
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_date_check" CHECK ("anchor" <> 'DATE' OR "dueOn" IS NOT NULL);
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_offset_check" CHECK ("offsetDays" BETWEEN 0 AND 3650 AND "offsetMonths" BETWEEN 0 AND 120);
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_client_check" CHECK ("party" = 'CONTRACTOR' OR "penalty" = 'NONE');

-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "ContractObligation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractObligation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ContractObligation"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
