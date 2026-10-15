-- CreateEnum
CREATE TYPE "GrnQcStatus" AS ENUM ('ACCEPTED', 'PARTLY_ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "qcAt" TIMESTAMP(3),
ADD COLUMN     "qcById" TEXT,
ADD COLUMN     "qcNote" TEXT,
ADD COLUMN     "qcStatus" "GrnQcStatus";

-- AlterTable
ALTER TABLE "StockTxn" ADD COLUMN     "rejectedQty" DECIMAL(18,3);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_organizationId_code_key" ON "Unit"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_qcById_fkey" FOREIGN KEY ("qcById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security: the unit list is per company
ALTER TABLE "Unit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Unit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Unit"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
