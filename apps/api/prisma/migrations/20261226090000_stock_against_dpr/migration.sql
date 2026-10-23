
-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "kgPerMetre" DECIMAL(10,3),
ADD COLUMN     "pipeDiameterMm" INTEGER,
ADD COLUMN     "pipeMaterial" "PipeMaterial";

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "workElementId" TEXT;

-- CreateTable
CREATE TABLE "ActivityMaterialNorm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyPerUnit" DECIMAL(18,6) NOT NULL,
    "wastagePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityMaterialNorm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityMaterialNorm_projectId_idx" ON "ActivityMaterialNorm"("projectId");

-- CreateIndex
CREATE INDEX "ActivityMaterialNorm_organizationId_idx" ON "ActivityMaterialNorm"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityMaterialNorm_activityId_itemId_key" ON "ActivityMaterialNorm"("activityId", "itemId");

-- CreateIndex
CREATE INDEX "StockEntry_workElementId_idx" ON "StockEntry"("workElementId");

-- AddForeignKey
ALTER TABLE "ActivityMaterialNorm" ADD CONSTRAINT "ActivityMaterialNorm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityMaterialNorm" ADD CONSTRAINT "ActivityMaterialNorm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityMaterialNorm" ADD CONSTRAINT "ActivityMaterialNorm_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityMaterialNorm" ADD CONSTRAINT "ActivityMaterialNorm_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityMaterialNorm" ADD CONSTRAINT "ActivityMaterialNorm_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_workElementId_fkey" FOREIGN KEY ("workElementId") REFERENCES "WorkElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (copy of 20261013211500_tenant_rls)
ALTER TABLE "ActivityMaterialNorm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityMaterialNorm" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ActivityMaterialNorm"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

-- Issues and returns already tied to an activity go to its component
UPDATE "StockEntry" e SET "workElementId" = a."workElementId"
FROM "Activity" a
WHERE e."activityId" = a.id AND e."workElementId" IS NULL AND a."workElementId" IS NOT NULL;
