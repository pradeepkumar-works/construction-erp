-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('DRAWING', 'SPECIFICATION', 'REPORT', 'METHOD_STATEMENT', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentDiscipline" AS ENUM ('GENERAL', 'ARCHITECTURAL', 'STRUCTURAL', 'ROAD', 'WATER', 'ELECTRICAL', 'MECHANICAL', 'PLUMBING');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('FOR_INFORMATION', 'FOR_APPROVAL', 'APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED', 'FOR_CONSTRUCTION', 'AS_BUILT', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TransmittalPurpose" AS ENUM ('FOR_CONSTRUCTION', 'FOR_APPROVAL', 'FOR_INFORMATION', 'FOR_REVIEW', 'AS_REQUESTED');

-- CreateEnum
CREATE TYPE "LetterDirection" AS ENUM ('IN', 'OUT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_ISSUED';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "letterId" TEXT,
ADD COLUMN     "revisionId" TEXT;

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "docNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'DRAWING',
    "discipline" "DocumentDiscipline" NOT NULL DEFAULT 'GENERAL',
    "remarks" TEXT,
    "currentRevisionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "status" "RevisionStatus" NOT NULL,
    "receivedFrom" TEXT,
    "remarks" TEXT,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transmittal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "transmittalNo" TEXT NOT NULL,
    "toParty" TEXT NOT NULL,
    "attention" TEXT,
    "purpose" "TransmittalPurpose" NOT NULL,
    "sentOn" DATE NOT NULL,
    "remarks" TEXT,
    "acknowledgedOn" DATE,
    "acknowledgedBy" TEXT,
    "sentById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transmittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransmittalItem" (
    "id" TEXT NOT NULL,
    "transmittalId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransmittalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Letter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "direction" "LetterDirection" NOT NULL,
    "letterNo" TEXT NOT NULL,
    "theirRef" TEXT,
    "letterDate" DATE NOT NULL,
    "party" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT,
    "replyBy" DATE,
    "inReplyToId" TEXT,
    "riskId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentRevisionId_key" ON "Document"("currentRevisionId");

-- CreateIndex
CREATE INDEX "Document_organizationId_kind_idx" ON "Document"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Document_projectId_docNo_key" ON "Document"("projectId", "docNo");

-- CreateIndex
CREATE INDEX "DocumentRevision_documentId_createdAt_idx" ON "DocumentRevision"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRevision_documentId_revision_key" ON "DocumentRevision"("documentId", "revision");

-- CreateIndex
CREATE INDEX "Transmittal_projectId_sentOn_idx" ON "Transmittal"("projectId", "sentOn");

-- CreateIndex
CREATE UNIQUE INDEX "Transmittal_organizationId_transmittalNo_key" ON "Transmittal"("organizationId", "transmittalNo");

-- CreateIndex
CREATE INDEX "TransmittalItem_revisionId_idx" ON "TransmittalItem"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "TransmittalItem_transmittalId_revisionId_key" ON "TransmittalItem"("transmittalId", "revisionId");

-- CreateIndex
CREATE INDEX "Letter_projectId_letterDate_idx" ON "Letter"("projectId", "letterDate");

-- CreateIndex
CREATE INDEX "Letter_riskId_idx" ON "Letter"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "Letter_organizationId_letterNo_key" ON "Letter"("organizationId", "letterNo");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "Letter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "DocumentRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transmittal" ADD CONSTRAINT "Transmittal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transmittal" ADD CONSTRAINT "Transmittal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transmittal" ADD CONSTRAINT "Transmittal_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransmittalItem" ADD CONSTRAINT "TransmittalItem_transmittalId_fkey" FOREIGN KEY ("transmittalId") REFERENCES "Transmittal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransmittalItem" ADD CONSTRAINT "TransmittalItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_inReplyToId_fkey" FOREIGN KEY ("inReplyToId") REFERENCES "Letter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Document" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Transmittal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transmittal" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Transmittal" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Letter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Letter" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Letter" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
