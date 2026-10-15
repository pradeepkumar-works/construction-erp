-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "pvBaseDate" DATE;

-- AlterTable
ALTER TABLE "RaBill" ADD COLUMN     "pvAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pvIndexMonth" DATE,
ADD COLUMN     "pvNote" TEXT;

-- CreateTable
CREATE TABLE "PriceVariationComponent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sharePct" DECIMAL(5,2) NOT NULL,
    "baseIndex" DECIMAL(12,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceVariationComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaBillPvLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sharePct" DECIMAL(5,2) NOT NULL,
    "baseIndex" DECIMAL(12,3) NOT NULL,
    "currentIndex" DECIMAL(12,3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RaBillPvLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceVariationComponent_projectId_idx" ON "PriceVariationComponent"("projectId");

-- CreateIndex
CREATE INDEX "RaBillPvLine_billId_idx" ON "RaBillPvLine"("billId");

-- AddForeignKey
ALTER TABLE "PriceVariationComponent" ADD CONSTRAINT "PriceVariationComponent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceVariationComponent" ADD CONSTRAINT "PriceVariationComponent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillPvLine" ADD CONSTRAINT "RaBillPvLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RaBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "PriceVariationComponent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceVariationComponent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceVariationComponent"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
