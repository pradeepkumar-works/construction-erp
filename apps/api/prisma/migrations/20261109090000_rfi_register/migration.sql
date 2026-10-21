-- RFI register: requests for information to the client or consultant, answered in the portal or from a letter.
-- CreateEnum
CREATE TYPE "RfiStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RfiPriority" AS ENUM ('NORMAL', 'URGENT');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "rfiId" TEXT;

-- CreateTable
CREATE TABLE "Rfi" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rfiNo" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "proposal" TEXT,
    "location" TEXT,
    "priority" "RfiPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "RfiStatus" NOT NULL DEFAULT 'OPEN',
    "toParty" TEXT NOT NULL,
    "raisedOn" DATE NOT NULL,
    "replyBy" DATE NOT NULL,
    "documentId" TEXT,
    "boqItemId" TEXT,
    "costImpact" BOOLEAN NOT NULL DEFAULT false,
    "timeImpact" BOOLEAN NOT NULL DEFAULT false,
    "answer" TEXT,
    "answeredOn" DATE,
    "answeredById" TEXT,
    "answeredByName" TEXT,
    "answerRef" TEXT,
    "closedOn" DATE,
    "closeNote" TEXT,
    "closedById" TEXT,
    "variationId" TEXT,
    "riskId" TEXT,
    "raisedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rfi_organizationId_rfiNo_key" ON "Rfi"("organizationId", "rfiNo");

-- CreateIndex
CREATE INDEX "Rfi_projectId_status_idx" ON "Rfi"("projectId", "status");

-- CreateIndex
CREATE INDEX "Rfi_organizationId_status_idx" ON "Rfi"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Attachment_rfiId_idx" ON "Attachment"("rfiId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security, as on every tenant table (20261013211500_tenant_rls).
ALTER TABLE "Rfi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rfi" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Rfi"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
