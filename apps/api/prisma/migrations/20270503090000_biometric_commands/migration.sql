-- CreateEnum
CREATE TYPE "BiometricCommandKind" AS ENUM ('ADD_USER', 'REMOVE_USER', 'SET_CLOCK');

-- CreateEnum
CREATE TYPE "BiometricCommandStatus" AS ENUM ('QUEUED', 'SENT', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BiometricCommand" (
    "id" TEXT NOT NULL,
    "cmdNo" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "kind" "BiometricCommandKind" NOT NULL,
    "pin" TEXT,
    "name" TEXT,
    "status" "BiometricCommandStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "returnCode" INTEGER,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiometricCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BiometricCommand_deviceId_status_idx" ON "BiometricCommand"("deviceId", "status");

-- CreateIndex
CREATE INDEX "BiometricCommand_organizationId_pin_idx" ON "BiometricCommand"("organizationId", "pin");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricCommand_deviceId_cmdNo_key" ON "BiometricCommand"("deviceId", "cmdNo");

-- AddForeignKey
ALTER TABLE "BiometricCommand" ADD CONSTRAINT "BiometricCommand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricCommand" ADD CONSTRAINT "BiometricCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricCommand" ADD CONSTRAINT "BiometricCommand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "BiometricCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiometricCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BiometricCommand"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
