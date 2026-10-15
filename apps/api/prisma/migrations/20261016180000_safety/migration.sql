-- Safety (roadmap v4 item 40): incident and near-miss register, toolbox talks, permits to work, and a Safety Officer role.

-- CreateEnum
CREATE TYPE "SafetyIncidentType" AS ENUM ('NEAR_MISS', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'PROPERTY_DAMAGE', 'FATALITY');

-- CreateEnum
CREATE TYPE "SafetyIncidentStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "WorkPermitType" AS ENUM ('HOT_WORK', 'WORK_AT_HEIGHT', 'EXCAVATION', 'CONFINED_SPACE', 'ELECTRICAL', 'LIFTING', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkPermitStatus" AS ENUM ('REQUESTED', 'ISSUED', 'REJECTED', 'CLOSED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SAFETY';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "safetyIncidentId" TEXT,
ADD COLUMN     "toolboxTalkId" TEXT,
ADD COLUMN     "workPermitId" TEXT;

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "incidentNo" TEXT NOT NULL,
    "type" "SafetyIncidentType" NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "injuredCount" INTEGER NOT NULL DEFAULT 0,
    "injuredNames" TEXT,
    "contractor" TEXT,
    "immediateAction" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "daysLost" INTEGER,
    "status" "SafetyIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closureNote" TEXT,
    "reportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolboxTalk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "talkNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "topic" TEXT NOT NULL,
    "conductedBy" TEXT NOT NULL,
    "contractor" TEXT,
    "attendeeCount" INTEGER NOT NULL,
    "attendees" TEXT,
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolboxTalk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPermit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "permitNo" TEXT NOT NULL,
    "type" "WorkPermitType" NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contractor" TEXT,
    "workerCount" INTEGER,
    "workers" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "precautions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "WorkPermitStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issueNote" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPermit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetyIncident_projectId_date_idx" ON "SafetyIncident"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyIncident_organizationId_incidentNo_key" ON "SafetyIncident"("organizationId", "incidentNo");

-- CreateIndex
CREATE INDEX "ToolboxTalk_projectId_date_idx" ON "ToolboxTalk"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ToolboxTalk_organizationId_talkNo_key" ON "ToolboxTalk"("organizationId", "talkNo");

-- CreateIndex
CREATE INDEX "WorkPermit_projectId_status_idx" ON "WorkPermit"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPermit_organizationId_permitNo_key" ON "WorkPermit"("organizationId", "permitNo");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_safetyIncidentId_fkey" FOREIGN KEY ("safetyIncidentId") REFERENCES "SafetyIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_toolboxTalkId_fkey" FOREIGN KEY ("toolboxTalkId") REFERENCES "ToolboxTalk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workPermitId_fkey" FOREIGN KEY ("workPermitId") REFERENCES "WorkPermit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolboxTalk" ADD CONSTRAINT "ToolboxTalk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolboxTalk" ADD CONSTRAINT "ToolboxTalk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolboxTalk" ADD CONSTRAINT "ToolboxTalk_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The new role for every existing organisation (new ones get it at sign-up).
INSERT INTO "Role" ("id", "organizationId", "key", "name")
SELECT gen_random_uuid()::text, "id", 'SAFETY_OFFICER', 'Safety Officer' FROM "Organization"
ON CONFLICT ("organizationId", "key") DO NOTHING;

-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "SafetyIncident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafetyIncident" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SafetyIncident"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "ToolboxTalk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ToolboxTalk" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ToolboxTalk"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "WorkPermit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkPermit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkPermit"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
