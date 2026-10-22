-- CreateEnum
CREATE TYPE "MaterialApprovalKind" AS ENUM ('MATERIAL', 'SAMPLE');

-- CreateEnum
CREATE TYPE "MaterialApprovalStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MaterialReviewOutcome" AS ENUM ('APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovedMakeSource" AS ENUM ('CONTRACT', 'APPROVAL');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "materialApprovalId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "make" TEXT;

-- CreateTable
CREATE TABLE "MaterialApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "marNo" TEXT NOT NULL,
    "kind" "MaterialApprovalKind" NOT NULL DEFAULT 'MATERIAL',
    "material" TEXT NOT NULL,
    "itemId" TEXT,
    "boqItemId" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT,
    "vendorId" TEXT,
    "usedFor" TEXT,
    "note" TEXT,
    "toParty" TEXT NOT NULL,
    "replyBy" DATE,
    "status" "MaterialApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialApprovalRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "submittedOn" DATE NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submitNote" TEXT,
    "outcome" "MaterialReviewOutcome",
    "reviewedOn" DATE,
    "reviewerName" TEXT,
    "comments" TEXT,
    "reviewRef" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialApprovalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedMake" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "itemId" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT,
    "source" "ApprovedMakeSource" NOT NULL DEFAULT 'CONTRACT',
    "approvalId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovedMake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialApproval_organizationId_projectId_status_idx" ON "MaterialApproval"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialApproval_organizationId_marNo_key" ON "MaterialApproval"("organizationId", "marNo");

-- CreateIndex
CREATE INDEX "MaterialApprovalRevision_organizationId_idx" ON "MaterialApprovalRevision"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialApprovalRevision_approvalId_revision_key" ON "MaterialApprovalRevision"("approvalId", "revision");

-- CreateIndex
CREATE INDEX "ApprovedMake_organizationId_projectId_idx" ON "ApprovedMake"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "ApprovedMake_approvalId_idx" ON "ApprovedMake"("approvalId");

-- CreateIndex
CREATE INDEX "Attachment_materialApprovalId_idx" ON "Attachment"("materialApprovalId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_materialApprovalId_fkey" FOREIGN KEY ("materialApprovalId") REFERENCES "MaterialApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApproval" ADD CONSTRAINT "MaterialApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApproval" ADD CONSTRAINT "MaterialApproval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApproval" ADD CONSTRAINT "MaterialApproval_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApproval" ADD CONSTRAINT "MaterialApproval_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApproval" ADD CONSTRAINT "MaterialApproval_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApproval" ADD CONSTRAINT "MaterialApproval_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApprovalRevision" ADD CONSTRAINT "MaterialApprovalRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApprovalRevision" ADD CONSTRAINT "MaterialApprovalRevision_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "MaterialApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApprovalRevision" ADD CONSTRAINT "MaterialApprovalRevision_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialApprovalRevision" ADD CONSTRAINT "MaterialApprovalRevision_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedMake" ADD CONSTRAINT "ApprovedMake_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedMake" ADD CONSTRAINT "ApprovedMake_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedMake" ADD CONSTRAINT "ApprovedMake_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedMake" ADD CONSTRAINT "ApprovedMake_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "MaterialApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedMake" ADD CONSTRAINT "ApprovedMake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A review has its day and outcome together; an approved make from a request names the request.
ALTER TABLE "MaterialApprovalRevision" ADD CONSTRAINT "MaterialApprovalRevision_reviewed" CHECK (("outcome" IS NULL) = ("reviewedOn" IS NULL));
ALTER TABLE "MaterialApprovalRevision" ADD CONSTRAINT "MaterialApprovalRevision_revision" CHECK ("revision" >= 0);
ALTER TABLE "MaterialApproval" ADD CONSTRAINT "MaterialApproval_revision" CHECK ("revision" >= 0);
ALTER TABLE "ApprovedMake" ADD CONSTRAINT "ApprovedMake_source" CHECK (("source" = 'APPROVAL') = ("approvalId" IS NOT NULL));

-- Row-level security: each organisation sees only its own rows (see 20261013211500_tenant_rls).
ALTER TABLE "MaterialApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaterialApproval" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaterialApproval"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "MaterialApprovalRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaterialApprovalRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaterialApprovalRevision"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "ApprovedMake" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovedMake" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovedMake"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
