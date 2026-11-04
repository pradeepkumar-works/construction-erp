-- Exit clearance (no dues) before a full and final settlement, and the dues it recovers.
CREATE TYPE "ClearanceState" AS ENUM ('PENDING', 'CLEARED', 'DUES', 'NOT_APPLICABLE');

ALTER TABLE "FinalSettlement" ADD COLUMN "clearanceRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE TABLE "ExitClearanceLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "ClearanceState" NOT NULL,
    "amount" DECIMAL(18,2),
    "note" TEXT,
    "clearedById" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExitClearanceLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExitClearanceLine_employeeId_code_key" ON "ExitClearanceLine"("employeeId", "code");
CREATE INDEX "ExitClearanceLine_organizationId_idx" ON "ExitClearanceLine"("organizationId");

ALTER TABLE "ExitClearanceLine" ADD CONSTRAINT "ExitClearanceLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExitClearanceLine" ADD CONSTRAINT "ExitClearanceLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExitClearanceLine" ADD CONSTRAINT "ExitClearanceLine_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExitClearanceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExitClearanceLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExitClearanceLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
