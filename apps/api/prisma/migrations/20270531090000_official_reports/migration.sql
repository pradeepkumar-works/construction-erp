-- CreateEnum
CREATE TYPE "OfficialReportKind" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "OfficialReportIssue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "OfficialReportKind" NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "reportNo" INTEGER,
    "docNo" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialReportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficialReportIssue_organizationId_projectId_kind_idx" ON "OfficialReportIssue"("organizationId", "projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialReportIssue_projectId_kind_periodFrom_revision_key" ON "OfficialReportIssue"("projectId", "kind", "periodFrom", "revision");

-- AddForeignKey
ALTER TABLE "OfficialReportIssue" ADD CONSTRAINT "OfficialReportIssue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialReportIssue" ADD CONSTRAINT "OfficialReportIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialReportIssue" ADD CONSTRAINT "OfficialReportIssue_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "OfficialReportIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfficialReportIssue" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OfficialReportIssue"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
