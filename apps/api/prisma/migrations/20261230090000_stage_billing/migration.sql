-- CreateEnum
CREATE TYPE "BillingBasis" AS ENUM ('STAGES', 'UNIT_RATE');

-- CreateEnum
CREATE TYPE "StageTrigger" AS ENUM ('EVENT', 'PROGRESS', 'SUPPLY', 'TEST');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "advanceRecoveryFromPct" DECIMAL(5,2),
ADD COLUMN     "advanceRecoveryToPct" DECIMAL(5,2),
ADD COLUMN     "lumpSumValue" DECIMAL(18,2),
ADD COLUMN     "tenderFactor" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "RaBill" ADD COLUMN     "slippageLines" JSONB,
ADD COLUMN     "slippageWithheld" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BillingComponent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sharePct" DECIMAL(7,4),
    "basis" "BillingBasis" NOT NULL DEFAULT 'STAGES',
    "workElementId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "trigger" "StageTrigger" NOT NULL,
    "activityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopeQty" DECIMAL(18,3),
    "achievedOn" DATE,
    "evidence" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaBillStageLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "stageValue" DECIMAL(18,2) NOT NULL,
    "prevPct" DECIMAL(7,3) NOT NULL,
    "suggestedPct" DECIMAL(7,3) NOT NULL,
    "thisPct" DECIMAL(7,3) NOT NULL,
    "claimedByHand" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "certifiedPct" DECIMAL(7,3),
    "amount" DECIMAL(18,2) NOT NULL,
    "evidenceText" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RaBillStageLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneTarget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "cumulativePct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "MilestoneTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlippageTier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromPct" DECIMAL(5,2) NOT NULL,
    "toPct" DECIMAL(5,2),
    "withheldPct" DECIMAL(5,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SlippageTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingComponent_projectId_idx" ON "BillingComponent"("projectId");

-- CreateIndex
CREATE INDEX "BillingComponent_organizationId_idx" ON "BillingComponent"("organizationId");

-- CreateIndex
CREATE INDEX "BillingComponent_parentId_idx" ON "BillingComponent"("parentId");

-- CreateIndex
CREATE INDEX "BillingComponent_workElementId_idx" ON "BillingComponent"("workElementId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingComponent_projectId_code_key" ON "BillingComponent"("projectId", "code");

-- CreateIndex
CREATE INDEX "BillingStage_componentId_idx" ON "BillingStage"("componentId");

-- CreateIndex
CREATE INDEX "BillingStage_projectId_idx" ON "BillingStage"("projectId");

-- CreateIndex
CREATE INDEX "BillingStage_organizationId_idx" ON "BillingStage"("organizationId");

-- CreateIndex
CREATE INDEX "RaBillStageLine_stageId_idx" ON "RaBillStageLine"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "RaBillStageLine_billId_stageId_key" ON "RaBillStageLine"("billId", "stageId");

-- CreateIndex
CREATE INDEX "MilestoneTarget_projectId_idx" ON "MilestoneTarget"("projectId");

-- CreateIndex
CREATE INDEX "MilestoneTarget_organizationId_idx" ON "MilestoneTarget"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneTarget_componentId_month_key" ON "MilestoneTarget"("componentId", "month");

-- CreateIndex
CREATE INDEX "SlippageTier_projectId_idx" ON "SlippageTier"("projectId");

-- CreateIndex
CREATE INDEX "SlippageTier_organizationId_idx" ON "SlippageTier"("organizationId");

-- AddForeignKey
ALTER TABLE "BillingComponent" ADD CONSTRAINT "BillingComponent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingComponent" ADD CONSTRAINT "BillingComponent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingComponent" ADD CONSTRAINT "BillingComponent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BillingComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingComponent" ADD CONSTRAINT "BillingComponent_workElementId_fkey" FOREIGN KEY ("workElementId") REFERENCES "WorkElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingStage" ADD CONSTRAINT "BillingStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingStage" ADD CONSTRAINT "BillingStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingStage" ADD CONSTRAINT "BillingStage_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "BillingComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillStageLine" ADD CONSTRAINT "RaBillStageLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RaBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillStageLine" ADD CONSTRAINT "RaBillStageLine_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BillingStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneTarget" ADD CONSTRAINT "MilestoneTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneTarget" ADD CONSTRAINT "MilestoneTarget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneTarget" ADD CONSTRAINT "MilestoneTarget_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "BillingComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlippageTier" ADD CONSTRAINT "SlippageTier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlippageTier" ADD CONSTRAINT "SlippageTier_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Row-level security (copy of 20261013211500_tenant_rls)
ALTER TABLE "BillingComponent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingComponent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BillingComponent"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "BillingStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingStage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BillingStage"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "MilestoneTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MilestoneTarget" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MilestoneTarget"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SlippageTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SlippageTier" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SlippageTier"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
