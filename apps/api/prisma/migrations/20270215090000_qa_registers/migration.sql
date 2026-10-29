-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "qaCalibrationId" TEXT;

-- AlterTable
ALTER TABLE "Ncr" ADD COLUMN     "category" TEXT,
ADD COLUMN     "raisedByClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reworkCost" DECIMAL(18,2),
ADD COLUMN     "rootCause" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "mtcCategories" TEXT[] DEFAULT ARRAY['steel', 'cement', 'pipes-and-fittings']::TEXT[];

-- AlterTable
ALTER TABLE "QualityTest" ADD COLUMN     "instrumentId" TEXT,
ADD COLUMN     "labCharge" DECIMAL(18,2),
ADD COLUMN     "labId" TEXT,
ADD COLUMN     "labReportNo" TEXT,
ADD COLUMN     "reportOn" DATE,
ADD COLUMN     "sentOn" DATE;

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "mtcDate" DATE,
ADD COLUMN     "mtcNo" TEXT;

-- CreateTable
CREATE TABLE "QaLab" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OUTSIDE',
    "nablNo" TEXT,
    "nablValidTill" DATE,
    "projectId" TEXT,
    "address" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaLab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaInstrument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "serialNo" TEXT,
    "make" TEXT,
    "range" TEXT,
    "projectId" TEXT,
    "labId" TEXT,
    "intervalDays" INTEGER NOT NULL DEFAULT 365,
    "lastCalibratedOn" DATE,
    "nextDueOn" DATE,
    "lastResult" TEXT,
    "certificateNo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaCalibration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "calibratedOn" DATE NOT NULL,
    "certificateNo" TEXT,
    "agency" TEXT,
    "result" TEXT NOT NULL DEFAULT 'OK',
    "nextDueOn" DATE,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QaLab_organizationId_name_key" ON "QaLab"("organizationId", "name");

-- CreateIndex
CREATE INDEX "QaInstrument_organizationId_nextDueOn_idx" ON "QaInstrument"("organizationId", "nextDueOn");

-- CreateIndex
CREATE INDEX "QaCalibration_instrumentId_calibratedOn_idx" ON "QaCalibration"("instrumentId", "calibratedOn");

-- CreateIndex
CREATE INDEX "QualityTest_labId_reportOn_idx" ON "QualityTest"("labId", "reportOn");

-- CreateIndex
CREATE INDEX "QualityTest_instrumentId_idx" ON "QualityTest"("instrumentId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_qaCalibrationId_fkey" FOREIGN KEY ("qaCalibrationId") REFERENCES "QaCalibration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "QaLab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "QaInstrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaLab" ADD CONSTRAINT "QaLab_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaLab" ADD CONSTRAINT "QaLab_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaInstrument" ADD CONSTRAINT "QaInstrument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaInstrument" ADD CONSTRAINT "QaInstrument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaInstrument" ADD CONSTRAINT "QaInstrument_labId_fkey" FOREIGN KEY ("labId") REFERENCES "QaLab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaCalibration" ADD CONSTRAINT "QaCalibration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaCalibration" ADD CONSTRAINT "QaCalibration_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "QaInstrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaCalibration" ADD CONSTRAINT "QaCalibration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "QaLab" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaLab" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QaLab"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "QaInstrument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaInstrument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QaInstrument"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "QaCalibration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaCalibration" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QaCalibration"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
