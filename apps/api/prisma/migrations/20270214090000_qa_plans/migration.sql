-- AlterTable
ALTER TABLE "QualityTest" ADD COLUMN     "planLineId" TEXT,
ADD COLUMN     "pourId" TEXT,
ADD COLUMN     "testTypeCode" TEXT;

-- CreateTable
CREATE TABLE "TestType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TestKind" NOT NULL,
    "material" TEXT NOT NULL,
    "method" TEXT,
    "unit" TEXT NOT NULL,
    "specMin" DECIMAL(18,3),
    "specMax" DECIMAL(18,3),
    "readings" JSONB NOT NULL,
    "specimens" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaPlanLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "match" TEXT NOT NULL DEFAULT '',
    "grade" TEXT,
    "itemCategory" TEXT,
    "frequency" TEXT NOT NULL,
    "per" DECIMAL(18,3),
    "unit" TEXT,
    "witness" TEXT NOT NULL DEFAULT 'OWN',
    "holdPoint" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaPlanLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pour" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "pourNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "plannedVolume" DECIMAL(18,3) NOT NULL,
    "volume" DECIMAL(18,3),
    "source" TEXT NOT NULL DEFAULT 'RMC',
    "supplier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "inspectionId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "pouredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestType_organizationId_code_key" ON "TestType"("organizationId", "code");

-- CreateIndex
CREATE INDEX "QaPlanLine_projectId_idx" ON "QaPlanLine"("projectId");

-- CreateIndex
CREATE INDEX "QaPlanLine_organizationId_idx" ON "QaPlanLine"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Pour_inspectionId_key" ON "Pour"("inspectionId");

-- CreateIndex
CREATE INDEX "Pour_projectId_date_idx" ON "Pour"("projectId", "date");

-- CreateIndex
CREATE INDEX "Pour_organizationId_status_idx" ON "Pour"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Pour_organizationId_pourNo_key" ON "Pour"("organizationId", "pourNo");

-- CreateIndex
CREATE INDEX "QualityTest_planLineId_idx" ON "QualityTest"("planLineId");

-- CreateIndex
CREATE INDEX "QualityTest_pourId_idx" ON "QualityTest"("pourId");

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_planLineId_fkey" FOREIGN KEY ("planLineId") REFERENCES "QaPlanLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_pourId_fkey" FOREIGN KEY ("pourId") REFERENCES "Pour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestType" ADD CONSTRAINT "TestType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaPlanLine" ADD CONSTRAINT "QaPlanLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaPlanLine" ADD CONSTRAINT "QaPlanLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pour" ADD CONSTRAINT "Pour_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pour" ADD CONSTRAINT "Pour_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pour" ADD CONSTRAINT "Pour_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pour" ADD CONSTRAINT "Pour_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pour" ADD CONSTRAINT "Pour_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "TestType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TestType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TestType"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "QaPlanLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaPlanLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QaPlanLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "Pour" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pour" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Pour"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
