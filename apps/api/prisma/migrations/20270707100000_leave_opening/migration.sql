-- Leave an employee had before Nirmaan: days taken that year and earned leave brought forward.
CREATE TABLE "LeaveOpening" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" "LeaveType" NOT NULL,
    "takenBefore" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "broughtForward" DECIMAL(5,1),
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveOpening_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaveOpening_employeeId_year_type_key" ON "LeaveOpening"("employeeId", "year", "type");
CREATE INDEX "LeaveOpening_organizationId_idx" ON "LeaveOpening"("organizationId");

ALTER TABLE "LeaveOpening" ADD CONSTRAINT "LeaveOpening_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveOpening" ADD CONSTRAINT "LeaveOpening_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveOpening" ADD CONSTRAINT "LeaveOpening_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaveOpening" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveOpening" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeaveOpening"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
