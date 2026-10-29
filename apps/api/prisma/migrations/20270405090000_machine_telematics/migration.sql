-- Machine telematics (item 146): a maker's fleet feed and GPS trackers, readings and each machine's day.

-- AlterEnum

ALTER TYPE "IntegrationKind" ADD VALUE 'MACHINE_FEED';
ALTER TYPE "IntegrationKind" ADD VALUE 'GPS_TRACKER';

-- AlterTable
ALTER TABLE "IntegrationConnection" ADD COLUMN     "lastPolledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MachineReading" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceLinkId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "hourMeter" DECIMAL(18,2),
    "idleMeter" DECIMAL(18,2),
    "fuelPct" DECIMAL(5,2),
    "fuelLitres" DECIMAL(18,3),
    "fuelUsed" DECIMAL(18,3),
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "engineOn" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineDay" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" DATE NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL,
    "readings" INTEGER NOT NULL,
    "meterStart" DECIMAL(18,2),
    "meterEnd" DECIMAL(18,2),
    "meterAt" TIMESTAMP(3),
    "idleStart" DECIMAL(18,2),
    "idleEnd" DECIMAL(18,2),
    "fuelUsedStart" DECIMAL(18,3),
    "fuelUsedEnd" DECIMAL(18,3),
    "onSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastEngineOn" BOOLEAN,
    "meterRejected" INTEGER NOT NULL DEFAULT 0,
    "farthestM" INTEGER,
    "outsideReadings" INTEGER NOT NULL DEFAULT 0,
    "lastLat" DECIMAL(9,6),
    "lastLng" DECIMAL(9,6),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineReading_equipmentId_at_idx" ON "MachineReading"("equipmentId", "at");

-- CreateIndex
CREATE INDEX "MachineReading_organizationId_at_idx" ON "MachineReading"("organizationId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "MachineReading_deviceLinkId_at_key" ON "MachineReading"("deviceLinkId", "at");

-- CreateIndex
CREATE INDEX "MachineDay_organizationId_date_idx" ON "MachineDay"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MachineDay_equipmentId_date_key" ON "MachineDay"("equipmentId", "date");

-- AddForeignKey
ALTER TABLE "MachineReading" ADD CONSTRAINT "MachineReading_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineReading" ADD CONSTRAINT "MachineReading_deviceLinkId_fkey" FOREIGN KEY ("deviceLinkId") REFERENCES "DeviceLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineReading" ADD CONSTRAINT "MachineReading_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDay" ADD CONSTRAINT "MachineDay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDay" ADD CONSTRAINT "MachineDay_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDay" ADD CONSTRAINT "MachineDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "MachineReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MachineReading" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MachineReading"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "MachineDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MachineDay" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MachineDay"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
