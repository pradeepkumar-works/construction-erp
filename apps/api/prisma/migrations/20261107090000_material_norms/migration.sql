-- Material reconciliation: norms of store items per unit of a BOQ item, checked against net issues to site.
-- CreateTable
CREATE TABLE "MaterialNorm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyPerUnit" DECIMAL(18,6) NOT NULL,
    "wastagePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialNorm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialNorm_boqItemId_itemId_key" ON "MaterialNorm"("boqItemId", "itemId");

-- CreateIndex
CREATE INDEX "MaterialNorm_projectId_idx" ON "MaterialNorm"("projectId");

-- CreateIndex
CREATE INDEX "MaterialNorm_organizationId_idx" ON "MaterialNorm"("organizationId");

-- AddForeignKey
ALTER TABLE "MaterialNorm" ADD CONSTRAINT "MaterialNorm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialNorm" ADD CONSTRAINT "MaterialNorm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialNorm" ADD CONSTRAINT "MaterialNorm_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialNorm" ADD CONSTRAINT "MaterialNorm_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialNorm" ADD CONSTRAINT "MaterialNorm_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security, as on every tenant table (20261013211500_tenant_rls).
ALTER TABLE "MaterialNorm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaterialNorm" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaterialNorm"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
