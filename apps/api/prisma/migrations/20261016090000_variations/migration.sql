-- Variation register (v4 item 37): variations per project with the client's decision; approved ones change the BOQ
-- and add up to the revised contract value. Additive only: new enums, tables and a nullable attachment column.
-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VariationCause" AS ENUM ('CLIENT_INSTRUCTION', 'DESIGN_CHANGE', 'SITE_CONDITION', 'QUANTITY_DEVIATION', 'OTHER');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "variationId" TEXT;

-- CreateTable
CREATE TABLE "Variation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "varNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "cause" "VariationCause" NOT NULL,
    "description" TEXT,
    "status" "VariationStatus" NOT NULL DEFAULT 'DRAFT',
    "claimedAmount" DECIMAL(18,2) NOT NULL,
    "approvedAmount" DECIMAL(18,2),
    "submittedDate" DATE,
    "submittedRef" TEXT,
    "decidedDate" DATE,
    "clientRef" TEXT,
    "decisionNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "isNewItem" BOOLEAN NOT NULL DEFAULT false,
    "itemNo" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "approvedQty" DECIMAL(18,3),
    "approvedRate" DECIMAL(18,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VariationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Variation_organizationId_status_idx" ON "Variation"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Variation_projectId_varNo_key" ON "Variation"("projectId", "varNo");

-- CreateIndex
CREATE INDEX "VariationLine_variationId_idx" ON "VariationLine"("variationId");

-- CreateIndex
CREATE INDEX "VariationLine_boqItemId_idx" ON "VariationLine"("boqItemId");

-- CreateIndex
CREATE INDEX "VariationLine_organizationId_idx" ON "VariationLine"("organizationId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationLine" ADD CONSTRAINT "VariationLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationLine" ADD CONSTRAINT "VariationLine_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationLine" ADD CONSTRAINT "VariationLine_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "Variation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Variation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Variation"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "VariationLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VariationLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VariationLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
