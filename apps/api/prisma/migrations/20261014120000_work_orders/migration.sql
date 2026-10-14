-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "subcontractBillId" TEXT,
ADD COLUMN     "workOrderId" TEXT;

-- AlterTable
ALTER TABLE "AttendanceLine" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "MeasurementSheet" ADD COLUMN     "subcontractBillId" TEXT,
ADD COLUMN     "workOrderId" TEXT;

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "subcontractBillId" TEXT,
ADD COLUMN     "workOrderId" TEXT;

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "woNo" TEXT NOT NULL,
    "woDate" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "retentionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "advanceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advanceRecoveryPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tdsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "paymentDays" INTEGER,
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "remarks" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderLine" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractBill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "billNo" INTEGER NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "billDate" DATE NOT NULL,
    "measuredUpTo" DATE NOT NULL,
    "invoiceNo" TEXT,
    "dueDate" DATE NOT NULL,
    "grossPrevious" DECIMAL(18,2) NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "grossUpto" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(18,2) NOT NULL,
    "retentionPct" DECIMAL(5,2) NOT NULL,
    "advanceRecoveryPct" DECIMAL(5,2) NOT NULL,
    "tdsPct" DECIMAL(5,2) NOT NULL,
    "retentionAmount" DECIMAL(18,2) NOT NULL,
    "advanceRecoveryAmount" DECIMAL(18,2) NOT NULL,
    "tdsAmount" DECIMAL(18,2) NOT NULL,
    "materialRecovery" DECIMAL(18,2) NOT NULL,
    "otherDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductionNote" TEXT,
    "totalDeductions" DECIMAL(18,2) NOT NULL,
    "netPayable" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "workOrderLineId" TEXT NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "prevQty" DECIMAL(18,3) NOT NULL,
    "thisQty" DECIMAL(18,3) NOT NULL,
    "uptoQty" DECIMAL(18,3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubcontractBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractBillMaterial" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "SubcontractBillMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_status_idx" ON "WorkOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_projectId_status_idx" ON "WorkOrder"("projectId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_vendorId_idx" ON "WorkOrder"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_organizationId_woNo_key" ON "WorkOrder"("organizationId", "woNo");

-- CreateIndex
CREATE INDEX "WorkOrderLine_boqItemId_idx" ON "WorkOrderLine"("boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderLine_workOrderId_boqItemId_key" ON "WorkOrderLine"("workOrderId", "boqItemId");

-- CreateIndex
CREATE INDEX "SubcontractBill_organizationId_status_idx" ON "SubcontractBill"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SubcontractBill_projectId_status_idx" ON "SubcontractBill"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractBill_workOrderId_billNo_key" ON "SubcontractBill"("workOrderId", "billNo");

-- CreateIndex
CREATE INDEX "SubcontractBillLine_workOrderLineId_idx" ON "SubcontractBillLine"("workOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractBillLine_billId_workOrderLineId_key" ON "SubcontractBillLine"("billId", "workOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractBillMaterial_billId_itemId_key" ON "SubcontractBillMaterial"("billId", "itemId");

-- CreateIndex
CREATE INDEX "AttendanceLine_vendorId_idx" ON "AttendanceLine"("vendorId");

-- CreateIndex
CREATE INDEX "MeasurementSheet_workOrderId_idx" ON "MeasurementSheet"("workOrderId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBill" ADD CONSTRAINT "SubcontractBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBill" ADD CONSTRAINT "SubcontractBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBill" ADD CONSTRAINT "SubcontractBill_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBill" ADD CONSTRAINT "SubcontractBill_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBill" ADD CONSTRAINT "SubcontractBill_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBillLine" ADD CONSTRAINT "SubcontractBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SubcontractBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBillLine" ADD CONSTRAINT "SubcontractBillLine_workOrderLineId_fkey" FOREIGN KEY ("workOrderLineId") REFERENCES "WorkOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBillMaterial" ADD CONSTRAINT "SubcontractBillMaterial_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SubcontractBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBillMaterial" ADD CONSTRAINT "SubcontractBillMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLine" ADD CONSTRAINT "AttendanceLine_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_subcontractBillId_fkey" FOREIGN KEY ("subcontractBillId") REFERENCES "SubcontractBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementSheet" ADD CONSTRAINT "MeasurementSheet_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementSheet" ADD CONSTRAINT "MeasurementSheet_subcontractBillId_fkey" FOREIGN KEY ("subcontractBillId") REFERENCES "SubcontractBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_subcontractBillId_fkey" FOREIGN KEY ("subcontractBillId") REFERENCES "SubcontractBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "WorkOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkOrder"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SubcontractBill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubcontractBill" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SubcontractBill"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
