-- The DPR form of a project type (item 134 part 2, ARCHITECTURE "DPR form per project type"). New table and new
-- columns only: a company with no saved form keeps its types' standard forms (@erp/shared dpr-form.ts), and a DPR made
-- before this has no form version (its type's standard form) and no values of its own fields.

-- AlterTable
ALTER TABLE "DailyReport" ADD COLUMN     "dprFormConfigId" TEXT,
ADD COLUMN     "extra" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ProgressEntry" ADD COLUMN     "extra" JSONB;

-- CreateTable
CREATE TABLE "DprFormConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DprFormConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DprFormConfig_organizationId_typeCode_version_key" ON "DprFormConfig"("organizationId", "typeCode", "version");

-- AddForeignKey
ALTER TABLE "DprFormConfig" ADD CONSTRAINT "DprFormConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DprFormConfig" ADD CONSTRAINT "DprFormConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_dprFormConfigId_fkey" FOREIGN KEY ("dprFormConfigId") REFERENCES "DprFormConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security for the new tenant table (as in 20261013211500_tenant_rls).
ALTER TABLE "DprFormConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DprFormConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DprFormConfig"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
