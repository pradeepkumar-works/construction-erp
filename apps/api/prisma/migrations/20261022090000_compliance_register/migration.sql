-- CreateEnum
CREATE TYPE "ComplianceDocKind" AS ENUM ('BANK_GUARANTEE', 'EMD', 'INSURANCE', 'LICENCE');

-- CreateEnum
CREATE TYPE "ComplianceDocStatus" AS ENUM ('ACTIVE', 'RENEWED', 'RELEASED', 'INVOKED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COMPLIANCE';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "complianceDocId" TEXT;

-- CreateTable
CREATE TABLE "ComplianceDoc" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ComplianceDocKind" NOT NULL,
    "category" TEXT,
    "reference" TEXT NOT NULL,
    "issuer" TEXT,
    "projectId" TEXT,
    "beneficiary" TEXT,
    "amount" DECIMAL(18,2),
    "margin" DECIMAL(18,2),
    "issuedOn" DATE,
    "expiresOn" DATE,
    "claimUntil" DATE,
    "status" "ComplianceDocStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedOn" DATE,
    "closeNote" TEXT,
    "renewedFromId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDoc_renewedFromId_key" ON "ComplianceDoc"("renewedFromId");

-- CreateIndex
CREATE INDEX "ComplianceDoc_organizationId_status_expiresOn_idx" ON "ComplianceDoc"("organizationId", "status", "expiresOn");

-- CreateIndex
CREATE INDEX "ComplianceDoc_projectId_idx" ON "ComplianceDoc"("projectId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_complianceDocId_fkey" FOREIGN KEY ("complianceDocId") REFERENCES "ComplianceDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDoc" ADD CONSTRAINT "ComplianceDoc_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDoc" ADD CONSTRAINT "ComplianceDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDoc" ADD CONSTRAINT "ComplianceDoc_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "ComplianceDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDoc" ADD CONSTRAINT "ComplianceDoc_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "ComplianceDoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceDoc" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ComplianceDoc"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
