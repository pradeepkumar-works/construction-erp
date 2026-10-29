-- AlterEnum
ALTER TYPE "IntegrationKind" ADD VALUE 'FUEL_DISPENSER';

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "fuelTankLitres" DECIMAL(18,3);

-- AlterTable
ALTER TABLE "MachineDay" ADD COLUMN     "fuelAt" TIMESTAMP(3),
ADD COLUMN     "fuelEnd" DECIMAL(18,3),
ADD COLUMN     "fuelEvents" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "fuelStart" DECIMAL(18,3);

-- CreateTable
CREATE TABLE "FuelDispense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "deviceLinkId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "litres" DECIMAL(18,3) NOT NULL,
    "meter" DECIMAL(18,2),
    "stockEntryId" TEXT,
    "problem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelDispense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuelDispense_stockEntryId_key" ON "FuelDispense"("stockEntryId");

-- CreateIndex
CREATE INDEX "FuelDispense_organizationId_stockEntryId_idx" ON "FuelDispense"("organizationId", "stockEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelDispense_connectionId_externalId_key" ON "FuelDispense"("connectionId", "externalId");

-- AddForeignKey
ALTER TABLE "FuelDispense" ADD CONSTRAINT "FuelDispense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelDispense" ADD CONSTRAINT "FuelDispense_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelDispense" ADD CONSTRAINT "FuelDispense_deviceLinkId_fkey" FOREIGN KEY ("deviceLinkId") REFERENCES "DeviceLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelDispense" ADD CONSTRAINT "FuelDispense_stockEntryId_fkey" FOREIGN KEY ("stockEntryId") REFERENCES "StockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "FuelDispense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FuelDispense" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FuelDispense"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
