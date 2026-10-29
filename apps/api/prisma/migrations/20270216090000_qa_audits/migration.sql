-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "qaAuditId" TEXT;

-- CreateTable
CREATE TABLE "QaAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "auditNo" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INTERNAL',
    "date" DATE NOT NULL,
    "visitor" TEXT,
    "summary" TEXT,
    "score" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaAuditFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "severity" "NcrSeverity" NOT NULL DEFAULT 'MINOR',
    "dueOn" DATE,
    "closedOn" DATE,
    "closingNote" TEXT,
    "ncrId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QaAuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QaAudit_projectId_date_idx" ON "QaAudit"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "QaAudit_organizationId_auditNo_key" ON "QaAudit"("organizationId", "auditNo");

-- CreateIndex
CREATE UNIQUE INDEX "QaAuditFinding_ncrId_key" ON "QaAuditFinding"("ncrId");

-- CreateIndex
CREATE INDEX "QaAuditFinding_auditId_idx" ON "QaAuditFinding"("auditId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_qaAuditId_fkey" FOREIGN KEY ("qaAuditId") REFERENCES "QaAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaAudit" ADD CONSTRAINT "QaAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaAudit" ADD CONSTRAINT "QaAudit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaAudit" ADD CONSTRAINT "QaAudit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaAuditFinding" ADD CONSTRAINT "QaAuditFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaAuditFinding" ADD CONSTRAINT "QaAuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "QaAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaAuditFinding" ADD CONSTRAINT "QaAuditFinding_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "QaAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaAudit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QaAudit"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "QaAuditFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaAuditFinding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QaAuditFinding"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
