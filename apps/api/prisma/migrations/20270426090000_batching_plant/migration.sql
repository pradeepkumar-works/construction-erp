-- AlterEnum
ALTER TYPE "IntegrationKind" ADD VALUE 'BATCHING_PLANT';

-- CreateTable
CREATE TABLE "PlantBatchRow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "file" TEXT,
    "line" INTEGER,
    "fields" JSONB NOT NULL,
    "batchNo" TEXT,
    "rmcBatchId" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "dismissReason" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantBatchRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlantBatchRow_plantId_takenAt_idx" ON "PlantBatchRow"("plantId", "takenAt");

-- CreateIndex
CREATE INDEX "PlantBatchRow_connectionId_batchNo_idx" ON "PlantBatchRow"("connectionId", "batchNo");

-- CreateIndex
CREATE INDEX "PlantBatchRow_rmcBatchId_idx" ON "PlantBatchRow"("rmcBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantBatchRow_connectionId_rowKey_key" ON "PlantBatchRow"("connectionId", "rowKey");

-- AddForeignKey
ALTER TABLE "PlantBatchRow" ADD CONSTRAINT "PlantBatchRow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantBatchRow" ADD CONSTRAINT "PlantBatchRow_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantBatchRow" ADD CONSTRAINT "PlantBatchRow_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantBatchRow" ADD CONSTRAINT "PlantBatchRow_rmcBatchId_fkey" FOREIGN KEY ("rmcBatchId") REFERENCES "RmcBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "PlantBatchRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlantBatchRow" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlantBatchRow"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
