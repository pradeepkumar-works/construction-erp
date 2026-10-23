-- CreateEnum
CREATE TYPE "ContractModel" AS ENUM ('ITEM_RATE', 'LUMP_SUM', 'EPC');

-- CreateEnum
CREATE TYPE "WorkElementLevel" AS ENUM ('COMPONENT', 'SUB_COMPONENT');

-- CreateEnum
CREATE TYPE "WorkElementType" AS ENUM ('INTAKE_WELL', 'PUMP_HOUSE', 'APPROACH_BRIDGE', 'RISING_MAIN', 'FEEDER_MAIN', 'WTP', 'WTP_UNIT', 'SUMP', 'OHT', 'PIPE_ZONE', 'HOUSE_CONNECTIONS', 'ROAD_RESTORATION', 'HT_FEEDER', 'EM_PACKAGE', 'STP_UNIT', 'BLOCK', 'FLOOR', 'ROAD_STRETCH', 'CROSSING', 'GENERAL');

-- AlterEnum
ALTER TYPE "ProjectType" ADD VALUE 'SEWERAGE';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "parentActivityId" TEXT,
ADD COLUMN     "weightPct" DECIMAL(6,3),
ADD COLUMN     "workElementId" TEXT;

-- AlterTable
ALTER TABLE "BoqItem" ADD COLUMN     "section" TEXT,
ADD COLUMN     "sorItemId" TEXT,
ADD COLUMN     "sorRef" TEXT,
ADD COLUMN     "workElementId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "contractModel" "ContractModel" NOT NULL DEFAULT 'ITEM_RATE';

-- CreateTable
CREATE TABLE "WorkElement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "level" "WorkElementLevel" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "elementType" "WorkElementType" NOT NULL DEFAULT 'GENERAL',
    "specs" JSONB,
    "weightPct" DECIMAL(6,3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkElement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkElement_projectId_idx" ON "WorkElement"("projectId");

-- CreateIndex
CREATE INDEX "WorkElement_parentId_idx" ON "WorkElement"("parentId");

-- CreateIndex
CREATE INDEX "WorkElement_organizationId_idx" ON "WorkElement"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkElement_projectId_code_key" ON "WorkElement"("projectId", "code");

-- CreateIndex
CREATE INDEX "Activity_workElementId_idx" ON "Activity"("workElementId");

-- CreateIndex
CREATE INDEX "Activity_parentActivityId_idx" ON "Activity"("parentActivityId");

-- CreateIndex
CREATE INDEX "BoqItem_workElementId_idx" ON "BoqItem"("workElementId");

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_workElementId_fkey" FOREIGN KEY ("workElementId") REFERENCES "WorkElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_sorItemId_fkey" FOREIGN KEY ("sorItemId") REFERENCES "SorItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkElement" ADD CONSTRAINT "WorkElement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkElement" ADD CONSTRAINT "WorkElement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkElement" ADD CONSTRAINT "WorkElement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workElementId_fkey" FOREIGN KEY ("workElementId") REFERENCES "WorkElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_parentActivityId_fkey" FOREIGN KEY ("parentActivityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "WorkElement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkElement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkElement"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
