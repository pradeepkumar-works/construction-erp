-- Approval levels name a role or a position (the `position` master), up to six levels, and approvers can hand their
-- approvals to someone while away (ApprovalDelegation). A company with no position rules and no delegations decides as before.

-- AlterTable
ALTER TABLE "ApprovalRule" ADD COLUMN     "positionCode" TEXT,
ALTER COLUMN "roleId" DROP NOT NULL;

ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_role_or_position" CHECK (("roleId" IS NULL) <> ("positionCode" IS NULL));

-- AlterTable
ALTER TABLE "ApprovalStep" ADD COLUMN     "onBehalfOfId" TEXT;

-- CreateTable
CREATE TABLE "UserPosition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionCode" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDelegation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPosition_organizationId_positionCode_idx" ON "UserPosition"("organizationId", "positionCode");

-- CreateIndex: a head office position (projectId null) is held once, so nulls count as equal
CREATE UNIQUE INDEX "UserPosition_userId_positionCode_projectId_key" ON "UserPosition"("userId", "positionCode", "projectId") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "ApprovalDelegation_organizationId_toUserId_idx" ON "ApprovalDelegation"("organizationId", "toUserId");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_organizationId_fromUserId_idx" ON "ApprovalDelegation"("organizationId", "fromUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRule_organizationId_positionCode_submissionType_lev_key" ON "ApprovalRule"("organizationId", "positionCode", "submissionType", "level");

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_onBehalfOfId_fkey" FOREIGN KEY ("onBehalfOfId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPosition" ADD CONSTRAINT "UserPosition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPosition" ADD CONSTRAINT "UserPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPosition" ADD CONSTRAINT "UserPosition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "UserPosition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserPosition" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserPosition"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "ApprovalDelegation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalDelegation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovalDelegation"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
