-- CreateEnum
CREATE TYPE "ProgrammeStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "EotBasis" AS ENUM ('DELAY', 'VARIATION');

-- CreateEnum
CREATE TYPE "EotStatus" AS ENUM ('SENT', 'FORWARDED', 'DECIDED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "programmeUpdateDays" INTEGER;

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "eotApplicationId" TEXT;

-- CreateTable
CREATE TABLE "ProgrammeSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "submittedOn" DATE NOT NULL,
    "submittedById" TEXT NOT NULL,
    "letterRef" TEXT,
    "note" TEXT,
    "activityCount" INTEGER NOT NULL DEFAULT 0,
    "plannedFinish" DATE,
    "status" "ProgrammeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decidedOn" DATE,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EotApplication" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "appNo" INTEGER NOT NULL,
    "basis" "EotBasis" NOT NULL,
    "appliedOn" DATE NOT NULL,
    "daysClaimed" INTEGER NOT NULL,
    "grounds" TEXT NOT NULL,
    "letterRef" TEXT,
    "variationId" TEXT,
    "status" "EotStatus" NOT NULL DEFAULT 'SENT',
    "forwardedOn" DATE,
    "forwardedById" TEXT,
    "forwardedByName" TEXT,
    "recommendedDays" INTEGER,
    "forwardNote" TEXT,
    "decidedOn" DATE,
    "grantedDays" INTEGER,
    "decisionRef" TEXT,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EotApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgrammeSubmission_organizationId_status_idx" ON "ProgrammeSubmission"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeSubmission_projectId_revision_key" ON "ProgrammeSubmission"("projectId", "revision");

-- CreateIndex
CREATE INDEX "EotApplication_organizationId_status_idx" ON "EotApplication"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EotApplication_projectId_appNo_key" ON "EotApplication"("projectId", "appNo");

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_eotApplicationId_fkey" FOREIGN KEY ("eotApplicationId") REFERENCES "EotApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeSubmission" ADD CONSTRAINT "ProgrammeSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeSubmission" ADD CONSTRAINT "ProgrammeSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeSubmission" ADD CONSTRAINT "ProgrammeSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeSubmission" ADD CONSTRAINT "ProgrammeSubmission_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_forwardedById_fkey" FOREIGN KEY ("forwardedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A revision counts from 0 and is answered on or after it went; an application claims at least a day, is granted no more
-- than it claimed, and is decided and forwarded on or after it was made
ALTER TABLE "ProgrammeSubmission" ADD CONSTRAINT "ProgrammeSubmission_revision_check" CHECK ("revision" >= 0);
ALTER TABLE "ProgrammeSubmission" ADD CONSTRAINT "ProgrammeSubmission_decided_check" CHECK ("decidedOn" IS NULL OR "decidedOn" >= "submittedOn");
ALTER TABLE "Project" ADD CONSTRAINT "Project_programmeUpdateDays_check" CHECK ("programmeUpdateDays" IS NULL OR "programmeUpdateDays" BETWEEN 1 AND 366);
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_no_check" CHECK ("appNo" >= 1);
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_days_check" CHECK ("daysClaimed" >= 1 AND ("grantedDays" IS NULL OR "grantedDays" BETWEEN 0 AND "daysClaimed") AND ("recommendedDays" IS NULL OR "recommendedDays" >= 0));
ALTER TABLE "EotApplication" ADD CONSTRAINT "EotApplication_dates_check" CHECK (("forwardedOn" IS NULL OR "forwardedOn" >= "appliedOn") AND ("decidedOn" IS NULL OR "decidedOn" >= "appliedOn"));

-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "ProgrammeSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeSubmission"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "EotApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EotApplication" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EotApplication"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
