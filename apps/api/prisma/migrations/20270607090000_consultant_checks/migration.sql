-- Consultant checks in the portal (item 172): check levels, measurement checks, hidden work sign-off and the site order book

-- CreateEnum
CREATE TYPE "CheckLevel" AS ENUM ('ASSISTANT_ENGINEER', 'RESIDENT_ENGINEER', 'DEPUTY_TEAM_LEADER', 'TEAM_LEADER');

-- CreateEnum
CREATE TYPE "SiteOrderStatus" AS ENUM ('OPEN', 'REPLIED', 'CLOSED');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "hiddenWork" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "hiddenCountersignNote" TEXT,
ADD COLUMN     "hiddenCountersignedAt" TIMESTAMP(3),
ADD COLUMN     "hiddenCountersignedById" TEXT,
ADD COLUMN     "hiddenNote" TEXT,
ADD COLUMN     "hiddenQty" DECIMAL(18,3),
ADD COLUMN     "hiddenSignedAt" TIMESTAMP(3),
ADD COLUMN     "hiddenSignedById" TEXT,
ADD COLUMN     "hiddenSignedLevel" "CheckLevel";

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "checkLevel" "CheckLevel";

-- CreateTable
CREATE TABLE "MeasurementCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "checkedById" TEXT NOT NULL,
    "level" "CheckLevel" NOT NULL,
    "checkedOn" DATE NOT NULL,
    "recordedQty" DECIMAL(18,3) NOT NULL,
    "checkedQty" DECIMAL(18,3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasurementCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "issuedById" TEXT,
    "issuedByName" TEXT NOT NULL,
    "issuedByLevel" "CheckLevel",
    "location" TEXT,
    "instruction" TEXT NOT NULL,
    "complyBy" DATE,
    "status" "SiteOrderStatus" NOT NULL DEFAULT 'OPEN',
    "reply" TEXT,
    "repliedById" TEXT,
    "repliedOn" DATE,
    "closedById" TEXT,
    "closedOn" DATE,
    "closeNote" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeasurementCheck_projectId_level_idx" ON "MeasurementCheck"("projectId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementCheck_sheetId_checkedById_key" ON "MeasurementCheck"("sheetId", "checkedById");

-- CreateIndex
CREATE INDEX "SiteOrder_organizationId_status_idx" ON "SiteOrder"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiteOrder_projectId_orderNo_key" ON "SiteOrder"("projectId", "orderNo");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_hiddenSignedById_fkey" FOREIGN KEY ("hiddenSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_hiddenCountersignedById_fkey" FOREIGN KEY ("hiddenCountersignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementCheck" ADD CONSTRAINT "MeasurementCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementCheck" ADD CONSTRAINT "MeasurementCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementCheck" ADD CONSTRAINT "MeasurementCheck_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "MeasurementSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementCheck" ADD CONSTRAINT "MeasurementCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- A check names a figure of zero or more, an order number counts from 1, a reply or close comes after the order, and a
-- countersign needs a sign-off
ALTER TABLE "MeasurementCheck" ADD CONSTRAINT "MeasurementCheck_qty_check" CHECK ("checkedQty" >= 0);
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_no_check" CHECK ("orderNo" >= 1);
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_comply_check" CHECK ("complyBy" IS NULL OR "complyBy" >= "date");
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_countersign_check" CHECK ("hiddenCountersignedById" IS NULL OR "hiddenSignedById" IS NOT NULL);

-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "MeasurementCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeasurementCheck" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MeasurementCheck"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "SiteOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SiteOrder"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
