-- Approval levels and escalation (v5 item 94): up to three approvals of one entry above an amount, the steps each entry
-- takes through them, and reminders and escalation per submission type. Every existing rule becomes level 1, so a
-- company without higher levels approves exactly as before.

-- CreateEnum
CREATE TYPE "ApprovalStepAction" AS ENUM ('APPROVED', 'ESCALATED', 'REMINDED');

-- DropIndex
DROP INDEX "ApprovalRule_roleId_submissionType_key";

-- AlterTable
ALTER TABLE "ApprovalRule" ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "minAmount" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "action" "ApprovalStepAction" NOT NULL,
    "round" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEscalation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "submissionType" TEXT NOT NULL,
    "remindAfterHours" INTEGER,
    "escalateAfterHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalStep_entityType_entityId_idx" ON "ApprovalStep"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovalStep_organizationId_createdAt_idx" ON "ApprovalStep"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalEscalation_organizationId_submissionType_key" ON "ApprovalEscalation"("organizationId", "submissionType");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRule_roleId_submissionType_level_key" ON "ApprovalRule"("roleId", "submissionType", "level");

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEscalation" ADD CONSTRAINT "ApprovalEscalation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "ApprovalStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalStep" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovalStep"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "ApprovalEscalation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalEscalation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovalEscalation"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
