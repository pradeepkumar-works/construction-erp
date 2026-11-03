-- CreateTable
CREATE TABLE "ProjectOpening" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "expenses" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "material" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "machinery" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "labour" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subcontract" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "workDone" DECIMAL(18,2),
    "notes" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectOpening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectOpening_projectId_key" ON "ProjectOpening"("projectId");

-- CreateIndex
CREATE INDEX "ProjectOpening_organizationId_idx" ON "ProjectOpening"("organizationId");

-- CreateIndex
CREATE INDEX "ProjectOpening_organizationId_asOf_idx" ON "ProjectOpening"("organizationId", "asOf");

-- AddForeignKey
ALTER TABLE "ProjectOpening" ADD CONSTRAINT "ProjectOpening_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectOpening" ADD CONSTRAINT "ProjectOpening_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectOpening" ADD CONSTRAINT "ProjectOpening_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "ProjectOpening" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectOpening" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProjectOpening"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
