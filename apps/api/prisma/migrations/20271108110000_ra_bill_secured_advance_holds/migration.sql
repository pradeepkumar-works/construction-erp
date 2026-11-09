-- Secured advance against material at site, and amounts withheld for disputed items, on client RA bills.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "securedAdvancePct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "RaBill" ADD COLUMN     "securedAdvance" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "securedAdvancePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "securedAdvanceRecovered" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withheld" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withheldReleased" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RaBillSecuredAdvance" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qtyAtSite" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "advance" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RaBillSecuredAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaBillHold" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "closedAt" DATE,
    "lostAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closeNote" TEXT,
    "closedById" TEXT,
    "tallyExportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaBillHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaBillHoldRelease" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "RaBillHoldRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaBillSecuredAdvance_billId_idx" ON "RaBillSecuredAdvance"("billId");

-- CreateIndex
CREATE INDEX "RaBillSecuredAdvance_itemId_idx" ON "RaBillSecuredAdvance"("itemId");

-- CreateIndex
CREATE INDEX "RaBillHold_organizationId_idx" ON "RaBillHold"("organizationId");

-- CreateIndex
CREATE INDEX "RaBillHold_projectId_idx" ON "RaBillHold"("projectId");

-- CreateIndex
CREATE INDEX "RaBillHold_billId_idx" ON "RaBillHold"("billId");

-- CreateIndex
CREATE INDEX "RaBillHold_boqItemId_idx" ON "RaBillHold"("boqItemId");

-- CreateIndex
CREATE INDEX "RaBillHold_tallyExportId_idx" ON "RaBillHold"("tallyExportId");

-- CreateIndex
CREATE INDEX "RaBillHoldRelease_billId_idx" ON "RaBillHoldRelease"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "RaBillHoldRelease_holdId_billId_key" ON "RaBillHoldRelease"("holdId", "billId");

-- AddForeignKey
ALTER TABLE "RaBillSecuredAdvance" ADD CONSTRAINT "RaBillSecuredAdvance_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RaBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillSecuredAdvance" ADD CONSTRAINT "RaBillSecuredAdvance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillHold" ADD CONSTRAINT "RaBillHold_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillHold" ADD CONSTRAINT "RaBillHold_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillHold" ADD CONSTRAINT "RaBillHold_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RaBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillHold" ADD CONSTRAINT "RaBillHold_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillHold" ADD CONSTRAINT "RaBillHold_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillHold" ADD CONSTRAINT "RaBillHold_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillHoldRelease" ADD CONSTRAINT "RaBillHoldRelease_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "RaBillHold"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillHoldRelease" ADD CONSTRAINT "RaBillHoldRelease_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RaBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A hold withholds something, a release gives something back, and no more is lost than was held.
ALTER TABLE "RaBillHold" ADD CONSTRAINT "RaBillHold_amounts" CHECK ("amount" > 0 AND "lostAmount" >= 0 AND "lostAmount" <= "amount");
ALTER TABLE "RaBillHoldRelease" ADD CONSTRAINT "RaBillHoldRelease_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "RaBillHold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RaBillHold" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RaBillHold"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

