-- CreateEnum
CREATE TYPE "ImprestEntryKind" AS ENUM ('ADVANCE', 'RETURN');

-- CreateEnum
CREATE TYPE "ImprestEntryStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'IMPREST';

-- CreateTable
CREATE TABLE "Imprest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "floatAmount" DECIMAL(18,2) NOT NULL,
    "openedOn" DATE NOT NULL,
    "closedOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Imprest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprestEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "imprestId" TEXT NOT NULL,
    "kind" "ImprestEntryKind" NOT NULL,
    "status" "ImprestEntryStatus" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "paidOn" DATE,
    "paymentMode" "PaymentMode",
    "reference" TEXT,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImprestEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Imprest_organizationId_isActive_idx" ON "Imprest"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Imprest_holderId_idx" ON "Imprest"("holderId");

-- CreateIndex
CREATE UNIQUE INDEX "Imprest_projectId_holderId_key" ON "Imprest"("projectId", "holderId");

-- CreateIndex
CREATE INDEX "ImprestEntry_imprestId_status_idx" ON "ImprestEntry"("imprestId", "status");

-- CreateIndex
CREATE INDEX "ImprestEntry_organizationId_status_idx" ON "ImprestEntry"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "Imprest" ADD CONSTRAINT "Imprest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imprest" ADD CONSTRAINT "Imprest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imprest" ADD CONSTRAINT "Imprest_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Imprest" ADD CONSTRAINT "Imprest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprestEntry" ADD CONSTRAINT "ImprestEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprestEntry" ADD CONSTRAINT "ImprestEntry_imprestId_fkey" FOREIGN KEY ("imprestId") REFERENCES "Imprest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprestEntry" ADD CONSTRAINT "ImprestEntry_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprestEntry" ADD CONSTRAINT "ImprestEntry_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "Imprest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Imprest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Imprest"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "ImprestEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImprestEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ImprestEntry"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
