-- Measuring on drawings (v6 item 118): the scale of a sheet, and lengths, areas and counts taken off it.
-- CreateEnum
CREATE TYPE "TakeoffKind" AS ENUM ('LENGTH', 'AREA', 'COUNT');

-- CreateTable
CREATE TABLE "DrawingScale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "points" JSONB NOT NULL,
    "lengthM" DECIMAL(18,3) NOT NULL,
    "aspect" DOUBLE PRECISION NOT NULL,
    "setById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingTakeoff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "takeoffNo" INTEGER NOT NULL,
    "revisionId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "kind" "TakeoffKind" NOT NULL,
    "points" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "value" DECIMAL(18,3) NOT NULL,
    "measurementId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingTakeoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawingScale_documentId_idx" ON "DrawingScale"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingScale_attachmentId_page_key" ON "DrawingScale"("attachmentId", "page");

-- CreateIndex
CREATE INDEX "DrawingTakeoff_attachmentId_page_idx" ON "DrawingTakeoff"("attachmentId", "page");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingTakeoff_documentId_takeoffNo_key" ON "DrawingTakeoff"("documentId", "takeoffNo");

-- AddForeignKey
ALTER TABLE "DrawingScale" ADD CONSTRAINT "DrawingScale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingScale" ADD CONSTRAINT "DrawingScale_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingScale" ADD CONSTRAINT "DrawingScale_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingScale" ADD CONSTRAINT "DrawingScale_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingTakeoff" ADD CONSTRAINT "DrawingTakeoff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingTakeoff" ADD CONSTRAINT "DrawingTakeoff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingTakeoff" ADD CONSTRAINT "DrawingTakeoff_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingTakeoff" ADD CONSTRAINT "DrawingTakeoff_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingTakeoff" ADD CONSTRAINT "DrawingTakeoff_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingTakeoff" ADD CONSTRAINT "DrawingTakeoff_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "MeasurementSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingTakeoff" ADD CONSTRAINT "DrawingTakeoff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A real distance, a value that is not negative, pages and numbers from 1.
ALTER TABLE "DrawingScale" ADD CONSTRAINT "DrawingScale_length_check" CHECK ("lengthM" > 0 AND "aspect" > 0 AND "page" >= 1);
ALTER TABLE "DrawingTakeoff" ADD CONSTRAINT "DrawingTakeoff_value_check" CHECK ("value" >= 0 AND "page" >= 1 AND "takeoffNo" >= 1);

-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "DrawingScale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrawingScale" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DrawingScale"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "DrawingTakeoff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrawingTakeoff" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DrawingTakeoff"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
