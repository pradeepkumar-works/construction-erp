-- AlterTable
ALTER TABLE "BoqItem" ADD COLUMN     "budgetRate" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientPaymentDays" INTEGER;

-- CreateTable
CREATE TABLE "ProjectBudget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "expenses" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "material" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "machinery" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "labour" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subcontract" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBudget_projectId_key" ON "ProjectBudget"("projectId");

-- CreateIndex
CREATE INDEX "ProjectBudget_organizationId_idx" ON "ProjectBudget"("organizationId");

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "ProjectBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectBudget" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProjectBudget"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
