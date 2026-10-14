-- CreateEnum
CREATE TYPE "TestKind" AS ENUM ('CONCRETE_CUBE', 'FIELD_DENSITY', 'SOIL', 'AGGREGATE', 'BITUMEN', 'BRICK', 'STEEL', 'WATER', 'OTHER');

-- CreateEnum
CREATE TYPE "TestResult" AS ENUM ('PENDING', 'PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "NcrSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NcrStatus" AS ENUM ('OPEN', 'ACTION_TAKEN', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TEST_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'TEST_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'NCR';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "ncrId" TEXT,
ADD COLUMN     "qualityTestId" TEXT;

-- CreateTable
CREATE TABLE "QualityTest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT,
    "testNo" TEXT NOT NULL,
    "kind" "TestKind" NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "sampledOn" DATE NOT NULL,
    "specification" TEXT,
    "unit" TEXT,
    "specMin" DECIMAL(18,3),
    "specMax" DECIMAL(18,3),
    "result" "TestResult" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityTestReading" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueOn" DATE,
    "value" DECIMAL(18,3),
    "testedOn" DATE,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QualityTestReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ncr" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT,
    "inspectionId" TEXT,
    "qualityTestId" TEXT,
    "ncrNo" TEXT NOT NULL,
    "raisedOn" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "severity" "NcrSeverity" NOT NULL DEFAULT 'MINOR',
    "status" "NcrStatus" NOT NULL DEFAULT 'OPEN',
    "raisedById" TEXT NOT NULL,
    "actionById" TEXT,
    "dueDate" DATE,
    "cause" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "actionAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closureNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ncr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QualityTest_projectId_result_idx" ON "QualityTest"("projectId", "result");

-- CreateIndex
CREATE INDEX "QualityTest_organizationId_kind_idx" ON "QualityTest"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "QualityTest_organizationId_testNo_key" ON "QualityTest"("organizationId", "testNo");

-- CreateIndex
CREATE INDEX "QualityTestReading_testId_idx" ON "QualityTestReading"("testId");

-- CreateIndex
CREATE INDEX "QualityTestReading_dueOn_idx" ON "QualityTestReading"("dueOn");

-- CreateIndex
CREATE INDEX "Ncr_projectId_status_idx" ON "Ncr"("projectId", "status");

-- CreateIndex
CREATE INDEX "Ncr_organizationId_status_idx" ON "Ncr"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ncr_organizationId_ncrNo_key" ON "Ncr"("organizationId", "ncrNo");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_qualityTestId_fkey" FOREIGN KEY ("qualityTestId") REFERENCES "QualityTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityTestReading" ADD CONSTRAINT "QualityTestReading_testId_fkey" FOREIGN KEY ("testId") REFERENCES "QualityTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_qualityTestId_fkey" FOREIGN KEY ("qualityTestId") REFERENCES "QualityTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_actionById_fkey" FOREIGN KEY ("actionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "QualityTest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualityTest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QualityTest" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Ncr" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ncr" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Ncr" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
