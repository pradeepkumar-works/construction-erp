-- Biometric attendance (v6 item 101): devices, device users matched to employees or workers, punches
-- CreateEnum
CREATE TYPE "BiometricProtocol" AS ENUM ('ADMS', 'WEBHOOK', 'FILE');

-- CreateEnum
CREATE TYPE "BiometricPunchResult" AS ENUM ('APPLIED', 'UNMATCHED', 'LOCKED', 'SKIPPED');

-- AlterTable
ALTER TABLE "StaffAttendance" ADD COLUMN     "biometricDeviceId" TEXT;

-- AlterTable
ALTER TABLE "WorkerAttendance" ADD COLUMN     "biometricDeviceId" TEXT;

-- CreateTable
CREATE TABLE "BiometricDevice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "protocol" "BiometricProtocol" NOT NULL,
    "serialNo" TEXT,
    "apiKey" TEXT,
    "projectId" TEXT,
    "utcOffsetMin" INTEGER NOT NULL DEFAULT 330,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "lastPunchAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricUser" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "employeeId" TEXT,
    "workerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricPunch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "punchedAt" TIMESTAMP(3) NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "result" "BiometricPunchResult" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiometricPunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BiometricDevice_serialNo_key" ON "BiometricDevice"("serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricDevice_apiKey_key" ON "BiometricDevice"("apiKey");

-- CreateIndex
CREATE INDEX "BiometricDevice_organizationId_idx" ON "BiometricDevice"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricUser_organizationId_pin_key" ON "BiometricUser"("organizationId", "pin");

-- CreateIndex
CREATE INDEX "BiometricPunch_organizationId_date_idx" ON "BiometricPunch"("organizationId", "date");

-- CreateIndex
CREATE INDEX "BiometricPunch_organizationId_pin_date_idx" ON "BiometricPunch"("organizationId", "pin", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricPunch_deviceId_pin_punchedAt_key" ON "BiometricPunch"("deviceId", "pin", "punchedAt");

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_biometricDeviceId_fkey" FOREIGN KEY ("biometricDeviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_biometricDeviceId_fkey" FOREIGN KEY ("biometricDeviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricUser" ADD CONSTRAINT "BiometricUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricUser" ADD CONSTRAINT "BiometricUser_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricUser" ADD CONSTRAINT "BiometricUser_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricPunch" ADD CONSTRAINT "BiometricPunch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricPunch" ADD CONSTRAINT "BiometricPunch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BiometricDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiometricDevice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BiometricDevice"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "BiometricUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiometricUser" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BiometricUser"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "BiometricPunch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiometricPunch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BiometricPunch"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
