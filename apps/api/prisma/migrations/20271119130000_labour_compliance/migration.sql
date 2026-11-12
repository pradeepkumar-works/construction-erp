-- Contract labour compliance (ARCHITECTURE "Contract labour compliance"): contractors' licences, codes, policies and
-- challans, and the release of a subcontractor bill's payment hold.

-- CreateEnum
CREATE TYPE "LabourPaperKind" AS ENUM ('CLRA_LICENCE', 'PF_CODE', 'ESI_CODE', 'WC_POLICY', 'BOCW_REGISTRATION');

-- CreateEnum
CREATE TYPE "LabourChallanKind" AS ENUM ('PF', 'ESI');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "labourChallanId" TEXT,
ADD COLUMN     "labourPaperId" TEXT;

-- AlterTable
ALTER TABLE "SubcontractBill" ADD COLUMN     "labourHoldNote" TEXT,
ADD COLUMN     "labourHoldReleasedAt" TIMESTAMP(3),
ADD COLUMN     "labourHoldReleasedById" TEXT;

-- CreateTable
CREATE TABLE "LabourPaper" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "kind" "LabourPaperKind" NOT NULL,
    "projectId" TEXT,
    "number" TEXT NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "workers" INTEGER,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabourPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabourChallan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "kind" "LabourChallanKind" NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "workers" INTEGER,
    "paidOn" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabourChallan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabourPaper_organizationId_vendorId_idx" ON "LabourPaper"("organizationId", "vendorId");

-- CreateIndex
CREATE INDEX "LabourPaper_projectId_idx" ON "LabourPaper"("projectId");

-- CreateIndex
CREATE INDEX "LabourChallan_organizationId_month_idx" ON "LabourChallan"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "LabourChallan_organizationId_vendorId_kind_month_key" ON "LabourChallan"("organizationId", "vendorId", "kind", "month");

-- AddForeignKey
ALTER TABLE "SubcontractBill" ADD CONSTRAINT "SubcontractBill_labourHoldReleasedById_fkey" FOREIGN KEY ("labourHoldReleasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_labourPaperId_fkey" FOREIGN KEY ("labourPaperId") REFERENCES "LabourPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_labourChallanId_fkey" FOREIGN KEY ("labourChallanId") REFERENCES "LabourChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourPaper" ADD CONSTRAINT "LabourPaper_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourPaper" ADD CONSTRAINT "LabourPaper_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourPaper" ADD CONSTRAINT "LabourPaper_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourPaper" ADD CONSTRAINT "LabourPaper_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourChallan" ADD CONSTRAINT "LabourChallan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourChallan" ADD CONSTRAINT "LabourChallan_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourChallan" ADD CONSTRAINT "LabourChallan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "LabourPaper" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabourPaper" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LabourPaper"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "LabourChallan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabourChallan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LabourChallan"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
