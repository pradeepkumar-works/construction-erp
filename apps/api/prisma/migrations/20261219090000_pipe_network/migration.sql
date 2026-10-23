-- CreateEnum
CREATE TYPE "PipeNodeKind" AS ENUM ('JUNCTION', 'TANK', 'SOURCE', 'SLUICE_VALVE', 'AIR_VALVE', 'SCOUR', 'CHAMBER', 'END', 'CROSSING_PIT');

-- CreateEnum
CREATE TYPE "PipeMaterial" AS ENUM ('HDPE', 'MDPE', 'DI', 'CI', 'MS', 'PVC', 'GRP', 'OTHER');

-- CreateEnum
CREATE TYPE "PipeScope" AS ENUM ('PROPOSED', 'EXISTING');

-- CreateEnum
CREATE TYPE "PipeStage" AS ENUM ('TRENCH', 'BEDDING', 'LAY_JOINT', 'VALVES', 'BACKFILL', 'TEST', 'RESTORATION', 'COMMISSIONING');

-- AlterEnum
ALTER TYPE "TestKind" ADD VALUE 'HYDRAULIC';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "pipeStage" "PipeStage";

-- AlterTable
ALTER TABLE "ProgressEntry" ADD COLUMN     "pipeNodeId" TEXT,
ADD COLUMN     "pipeSegmentId" TEXT;

-- CreateTable
CREATE TABLE "PipeNode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PipeNodeKind" NOT NULL DEFAULT 'JUNCTION',
    "groundLevel" DECIMAL(10,3),
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "chainage" INTEGER,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipeNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipeSegment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "lengthM" DECIMAL(18,3) NOT NULL,
    "diameterMm" INTEGER NOT NULL,
    "material" "PipeMaterial" NOT NULL DEFAULT 'HDPE',
    "pipeClass" TEXT,
    "scope" "PipeScope" NOT NULL DEFAULT 'PROPOSED',
    "surface" TEXT,
    "crossing" TEXT,
    "boqItemId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipeSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipeTestSegment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "qualityTestId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,

    CONSTRAINT "PipeTestSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipeNode_zoneId_idx" ON "PipeNode"("zoneId");

-- CreateIndex
CREATE INDEX "PipeNode_organizationId_idx" ON "PipeNode"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PipeNode_projectId_code_key" ON "PipeNode"("projectId", "code");

-- CreateIndex
CREATE INDEX "PipeSegment_zoneId_idx" ON "PipeSegment"("zoneId");

-- CreateIndex
CREATE INDEX "PipeSegment_organizationId_idx" ON "PipeSegment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PipeSegment_projectId_code_key" ON "PipeSegment"("projectId", "code");

-- CreateIndex
CREATE INDEX "PipeTestSegment_segmentId_idx" ON "PipeTestSegment"("segmentId");

-- CreateIndex
CREATE INDEX "PipeTestSegment_organizationId_idx" ON "PipeTestSegment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PipeTestSegment_qualityTestId_segmentId_key" ON "PipeTestSegment"("qualityTestId", "segmentId");

-- CreateIndex
CREATE INDEX "ProgressEntry_pipeSegmentId_idx" ON "ProgressEntry"("pipeSegmentId");

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_pipeSegmentId_fkey" FOREIGN KEY ("pipeSegmentId") REFERENCES "PipeSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_pipeNodeId_fkey" FOREIGN KEY ("pipeNodeId") REFERENCES "PipeNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeNode" ADD CONSTRAINT "PipeNode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeNode" ADD CONSTRAINT "PipeNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeNode" ADD CONSTRAINT "PipeNode_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "WorkElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSegment" ADD CONSTRAINT "PipeSegment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSegment" ADD CONSTRAINT "PipeSegment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSegment" ADD CONSTRAINT "PipeSegment_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "WorkElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSegment" ADD CONSTRAINT "PipeSegment_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "PipeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSegment" ADD CONSTRAINT "PipeSegment_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "PipeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeSegment" ADD CONSTRAINT "PipeSegment_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeTestSegment" ADD CONSTRAINT "PipeTestSegment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeTestSegment" ADD CONSTRAINT "PipeTestSegment_qualityTestId_fkey" FOREIGN KEY ("qualityTestId") REFERENCES "QualityTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeTestSegment" ADD CONSTRAINT "PipeTestSegment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "PipeSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security for the new tenant tables (as 20261013211500_tenant_rls).
ALTER TABLE "PipeNode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipeNode" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PipeNode"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "PipeSegment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipeSegment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PipeSegment"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "PipeTestSegment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipeTestSegment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PipeTestSegment"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
