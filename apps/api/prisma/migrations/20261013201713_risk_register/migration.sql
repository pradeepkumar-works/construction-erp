-- CreateEnum
CREATE TYPE "RiskKind" AS ENUM ('DELAY', 'RISK');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('LAND', 'DESIGN', 'CLIENT', 'MATERIAL', 'LABOUR', 'EQUIPMENT', 'WEATHER', 'FINANCE', 'STATUTORY', 'SAFETY', 'UTILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MONITORING', 'CLOSED');

-- CreateEnum
CREATE TYPE "DelayParty" AS ENUM ('CLIENT', 'CONTRACTOR', 'THIRD_PARTY', 'FORCE_MAJEURE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RISK_RAISED';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "riskId" TEXT;

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "riskNo" TEXT NOT NULL,
    "kind" "RiskKind" NOT NULL,
    "category" "RiskCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "activityId" TEXT,
    "ownerId" TEXT,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "mitigation" TEXT,
    "dueDate" DATE,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "delayStart" DATE,
    "delayEnd" DATE,
    "daysLost" INTEGER,
    "responsibleParty" "DelayParty",
    "eotClaimed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closureNote" TEXT,
    "raisedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Risk_projectId_status_idx" ON "Risk"("projectId", "status");

-- CreateIndex
CREATE INDEX "Risk_organizationId_status_idx" ON "Risk"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_organizationId_riskNo_key" ON "Risk"("organizationId", "riskNo");

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
