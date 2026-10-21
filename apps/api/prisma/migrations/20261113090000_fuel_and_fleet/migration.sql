-- Fuel and fleet use (v5 item 93): fuel items issued from stock to a machine, a fuel norm per machine, and the tyres and
-- batteries fitted to it. Additive only: new enums, a table and nullable or defaulted columns.

-- CreateEnum
CREATE TYPE "FuelNormUnit" AS ENUM ('LITRES_PER_HOUR', 'KM_PER_LITRE');

-- CreateEnum
CREATE TYPE "EquipmentPartKind" AS ENUM ('TYRE', 'BATTERY');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "fuelNorm" DECIMAL(18,3),
ADD COLUMN     "fuelNormUnit" "FuelNormUnit",
ADD COLUMN     "fuelTolerancePct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "isFuel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "equipmentId" TEXT,
ADD COLUMN     "meterReading" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "EquipmentPart" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "kind" "EquipmentPartKind" NOT NULL,
    "position" TEXT,
    "make" TEXT,
    "serialNo" TEXT,
    "fittedOn" DATE NOT NULL,
    "fittedMeter" DECIMAL(18,2),
    "removedOn" DATE,
    "removedMeter" DECIMAL(18,2),
    "removalReason" TEXT,
    "cost" DECIMAL(18,2),
    "maintenanceJobId" TEXT,
    "stockEntryId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentPart_equipmentId_kind_idx" ON "EquipmentPart"("equipmentId", "kind");

-- CreateIndex
CREATE INDEX "EquipmentPart_organizationId_idx" ON "EquipmentPart"("organizationId");

-- CreateIndex
CREATE INDEX "StockEntry_equipmentId_date_idx" ON "StockEntry"("equipmentId", "date");

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPart" ADD CONSTRAINT "EquipmentPart_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPart" ADD CONSTRAINT "EquipmentPart_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPart" ADD CONSTRAINT "EquipmentPart_maintenanceJobId_fkey" FOREIGN KEY ("maintenanceJobId") REFERENCES "MaintenanceJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPart" ADD CONSTRAINT "EquipmentPart_stockEntryId_fkey" FOREIGN KEY ("stockEntryId") REFERENCES "StockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPart" ADD CONSTRAINT "EquipmentPart_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Items that are fuel by their category or name are marked as such, so the daily fuel position has them from day one.
UPDATE "Item" SET "isFuel" = true
WHERE lower(coalesce("category", '')) = 'fuel' OR "name" ~* '(diesel|petrol|\mhsd\M)';

-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "EquipmentPart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentPart" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EquipmentPart"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
