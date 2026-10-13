-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "measurementId" TEXT;

-- CreateTable
CREATE TABLE "MeasurementSheet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "mbNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "remarks" TEXT,
    "totalQty" DECIMAL(18,3) NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasurementSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementLine" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nos" DECIMAL(18,3),
    "length" DECIMAL(18,3),
    "breadth" DECIMAL(18,3),
    "depth" DECIMAL(18,3),
    "deduct" BOOLEAN NOT NULL DEFAULT false,
    "quantity" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MeasurementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeasurementSheet_projectId_status_idx" ON "MeasurementSheet"("projectId", "status");

-- CreateIndex
CREATE INDEX "MeasurementSheet_boqItemId_status_idx" ON "MeasurementSheet"("boqItemId", "status");

-- CreateIndex
CREATE INDEX "MeasurementSheet_organizationId_status_idx" ON "MeasurementSheet"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementSheet_organizationId_mbNo_key" ON "MeasurementSheet"("organizationId", "mbNo");

-- CreateIndex
CREATE INDEX "MeasurementLine_sheetId_idx" ON "MeasurementLine"("sheetId");

-- AddForeignKey
ALTER TABLE "MeasurementSheet" ADD CONSTRAINT "MeasurementSheet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementSheet" ADD CONSTRAINT "MeasurementSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementSheet" ADD CONSTRAINT "MeasurementSheet_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementSheet" ADD CONSTRAINT "MeasurementSheet_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementSheet" ADD CONSTRAINT "MeasurementSheet_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "MeasurementLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "MeasurementSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "MeasurementSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
