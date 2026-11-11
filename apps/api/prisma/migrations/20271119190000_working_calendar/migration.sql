
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "scheduleDaysOff" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "workingCalendar" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ScheduleBreak" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleBreak_organizationId_idx" ON "ScheduleBreak"("organizationId");

-- CreateIndex
CREATE INDEX "ScheduleBreak_projectId_fromDate_idx" ON "ScheduleBreak"("projectId", "fromDate");

-- AddForeignKey
ALTER TABLE "ScheduleBreak" ADD CONSTRAINT "ScheduleBreak_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBreak" ADD CONSTRAINT "ScheduleBreak_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security: a break is its company's alone.
ALTER TABLE "ScheduleBreak" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduleBreak" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScheduleBreak"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
