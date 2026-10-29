-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "designSubmissionId" TEXT;

-- CreateTable
CREATE TABLE "DesignSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submissionNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DRAWINGS',
    "purpose" TEXT NOT NULL DEFAULT 'APPROVAL',
    "toParty" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CLIENT',
    "replyBy" DATE,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "fee" DECIMAL(18,2),
    "certificateNo" TEXT,
    "riskId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignSubmissionDoc" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DesignSubmissionDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignSubmissionRound" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "submittedOn" DATE NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submitNote" TEXT,
    "letterId" TEXT,
    "code" TEXT,
    "reviewedOn" DATE,
    "reviewerName" TEXT,
    "reviewRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignSubmissionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignRoundItem" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,

    CONSTRAINT "DesignRoundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "commentNo" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "documentId" TEXT,
    "text" TEXT NOT NULL,
    "reply" TEXT,
    "repliedOn" DATE,
    "repliedById" TEXT,
    "closedOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DesignSubmission_riskId_key" ON "DesignSubmission"("riskId");

-- CreateIndex
CREATE INDEX "DesignSubmission_organizationId_projectId_status_idx" ON "DesignSubmission"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DesignSubmission_organizationId_submissionNo_key" ON "DesignSubmission"("organizationId", "submissionNo");

-- CreateIndex
CREATE INDEX "DesignSubmissionDoc_documentId_idx" ON "DesignSubmissionDoc"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignSubmissionDoc_submissionId_documentId_key" ON "DesignSubmissionDoc"("submissionId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignSubmissionRound_submissionId_revision_key" ON "DesignSubmissionRound"("submissionId", "revision");

-- CreateIndex
CREATE INDEX "DesignSubmissionRound_organizationId_idx" ON "DesignSubmissionRound"("organizationId");

-- CreateIndex
CREATE INDEX "DesignRoundItem_revisionId_idx" ON "DesignRoundItem"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignRoundItem_roundId_revisionId_key" ON "DesignRoundItem"("roundId", "revisionId");

-- CreateIndex
CREATE INDEX "DesignComment_organizationId_idx" ON "DesignComment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignComment_submissionId_commentNo_key" ON "DesignComment"("submissionId", "commentNo");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_designSubmissionId_fkey" FOREIGN KEY ("designSubmissionId") REFERENCES "DesignSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmission" ADD CONSTRAINT "DesignSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmission" ADD CONSTRAINT "DesignSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmission" ADD CONSTRAINT "DesignSubmission_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmission" ADD CONSTRAINT "DesignSubmission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmissionDoc" ADD CONSTRAINT "DesignSubmissionDoc_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DesignSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmissionDoc" ADD CONSTRAINT "DesignSubmissionDoc_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmissionRound" ADD CONSTRAINT "DesignSubmissionRound_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmissionRound" ADD CONSTRAINT "DesignSubmissionRound_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DesignSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmissionRound" ADD CONSTRAINT "DesignSubmissionRound_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignSubmissionRound" ADD CONSTRAINT "DesignSubmissionRound_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "Letter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignRoundItem" ADD CONSTRAINT "DesignRoundItem_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "DesignSubmissionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignRoundItem" ADD CONSTRAINT "DesignRoundItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignComment" ADD CONSTRAINT "DesignComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignComment" ADD CONSTRAINT "DesignComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DesignSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignComment" ADD CONSTRAINT "DesignComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignComment" ADD CONSTRAINT "DesignComment_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "DesignSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DesignSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DesignSubmission"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "DesignComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DesignComment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DesignComment"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "DesignSubmissionRound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DesignSubmissionRound" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DesignSubmissionRound"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
