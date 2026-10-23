-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "noticeDays" INTEGER;

-- CreateTable
CREATE TABLE "HindranceCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dailyReportId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "remark" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "category" "RiskCategory",
    "party" "DelayParty",
    "title" TEXT,
    "delayStart" DATE,
    "matched" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "riskId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HindranceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HindranceCheck_dailyReportId_key" ON "HindranceCheck"("dailyReportId");

-- CreateIndex
CREATE INDEX "HindranceCheck_organizationId_decision_idx" ON "HindranceCheck"("organizationId", "decision");

-- CreateIndex
CREATE INDEX "HindranceCheck_projectId_idx" ON "HindranceCheck"("projectId");

-- CreateIndex
CREATE INDEX "HindranceCheck_riskId_idx" ON "HindranceCheck"("riskId");

-- AddForeignKey
ALTER TABLE "HindranceCheck" ADD CONSTRAINT "HindranceCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HindranceCheck" ADD CONSTRAINT "HindranceCheck_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HindranceCheck" ADD CONSTRAINT "HindranceCheck_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "HindranceCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HindranceCheck" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HindranceCheck"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
