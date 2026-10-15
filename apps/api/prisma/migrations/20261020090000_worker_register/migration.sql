-- CreateEnum
CREATE TYPE "WorkerSkill" AS ENUM ('UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED');

-- CreateEnum
CREATE TYPE "WorkerIdType" AS ENUM ('AADHAAR', 'VOTER_ID', 'DRIVING_LICENCE', 'PAN', 'OTHER');

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workerNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fatherName" TEXT,
    "phone" TEXT,
    "contractor" TEXT NOT NULL,
    "vendorId" TEXT,
    "trade" TEXT NOT NULL,
    "skill" "WorkerSkill" NOT NULL DEFAULT 'UNSKILLED',
    "idType" "WorkerIdType",
    "idNumber" TEXT,
    "dailyWage" DECIMAL(18,2) NOT NULL,
    "otRate" DECIMAL(18,2),
    "projectId" TEXT,
    "joinedOn" DATE,
    "leftOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerAttendance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "StaffAttendanceStatus" NOT NULL,
    "inTime" TEXT,
    "outTime" TEXT,
    "otHours" DECIMAL(4,1),
    "activityId" TEXT,
    "note" TEXT,
    "markedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Worker_organizationId_projectId_idx" ON "Worker"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_organizationId_workerNo_key" ON "Worker"("organizationId", "workerNo");

-- CreateIndex
CREATE INDEX "WorkerAttendance_projectId_date_idx" ON "WorkerAttendance"("projectId", "date");

-- CreateIndex
CREATE INDEX "WorkerAttendance_organizationId_date_idx" ON "WorkerAttendance"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerAttendance_workerId_date_key" ON "WorkerAttendance"("workerId", "date");

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "Worker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Worker" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Worker"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "WorkerAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkerAttendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkerAttendance"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
