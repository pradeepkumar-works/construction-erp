-- Item 83 (speed): indexes for the columns the lists sort and filter on (organisation + date or status), the project
-- manager's projects (visibility), a reviewer's own decisions (approvals inbox) and every attachment parent column (each
-- record and list reads its files by parent). Indexes only: no table or data changes.

-- CreateIndex
CREATE INDEX "Project_projectManagerId_idx" ON "Project"("projectManagerId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_poDate_idx" ON "PurchaseOrder"("organizationId", "poDate");

-- CreateIndex
CREATE INDEX "VendorBill_organizationId_invoiceDate_idx" ON "VendorBill"("organizationId", "invoiceDate");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_woDate_idx" ON "WorkOrder"("organizationId", "woDate");

-- CreateIndex
CREATE INDEX "SubcontractBill_organizationId_billDate_idx" ON "SubcontractBill"("organizationId", "billDate");

-- CreateIndex
CREATE INDEX "ProgressEntry_organizationId_date_idx" ON "ProgressEntry"("organizationId", "date");

-- CreateIndex
CREATE INDEX "ProgressEntry_projectId_date_idx" ON "ProgressEntry"("projectId", "date");

-- CreateIndex
CREATE INDEX "DailyReport_organizationId_date_idx" ON "DailyReport"("organizationId", "date");

-- CreateIndex
CREATE INDEX "MaterialRequest_organizationId_status_idx" ON "MaterialRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MaterialRequest_organizationId_createdAt_idx" ON "MaterialRequest"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MachineryLog_organizationId_date_idx" ON "MachineryLog"("organizationId", "date");

-- CreateIndex
CREATE INDEX "Expense_organizationId_date_idx" ON "Expense"("organizationId", "date");

-- CreateIndex
CREATE INDEX "MeasurementSheet_organizationId_date_idx" ON "MeasurementSheet"("organizationId", "date");

-- CreateIndex
CREATE INDEX "RaBill_organizationId_billDate_idx" ON "RaBill"("organizationId", "billDate");

-- CreateIndex
CREATE INDEX "Attachment_progressEntryId_idx" ON "Attachment"("progressEntryId");

-- CreateIndex
CREATE INDEX "Attachment_dailyReportId_idx" ON "Attachment"("dailyReportId");

-- CreateIndex
CREATE INDEX "Attachment_materialRequestId_idx" ON "Attachment"("materialRequestId");

-- CreateIndex
CREATE INDEX "Attachment_stockEntryId_idx" ON "Attachment"("stockEntryId");

-- CreateIndex
CREATE INDEX "Attachment_machineryLogId_idx" ON "Attachment"("machineryLogId");

-- CreateIndex
CREATE INDEX "Attachment_expenseId_idx" ON "Attachment"("expenseId");

-- CreateIndex
CREATE INDEX "Attachment_measurementId_idx" ON "Attachment"("measurementId");

-- CreateIndex
CREATE INDEX "Attachment_riskId_idx" ON "Attachment"("riskId");

-- CreateIndex
CREATE INDEX "Attachment_raBillId_idx" ON "Attachment"("raBillId");

-- CreateIndex
CREATE INDEX "Attachment_purchaseOrderId_idx" ON "Attachment"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "Attachment_vendorBillId_idx" ON "Attachment"("vendorBillId");

-- CreateIndex
CREATE INDEX "Attachment_workOrderId_idx" ON "Attachment"("workOrderId");

-- CreateIndex
CREATE INDEX "Attachment_subcontractBillId_idx" ON "Attachment"("subcontractBillId");

-- CreateIndex
CREATE INDEX "Attachment_inspectionId_idx" ON "Attachment"("inspectionId");

-- CreateIndex
CREATE INDEX "Attachment_qualityTestId_idx" ON "Attachment"("qualityTestId");

-- CreateIndex
CREATE INDEX "Attachment_ncrId_idx" ON "Attachment"("ncrId");

-- CreateIndex
CREATE INDEX "Attachment_revisionId_idx" ON "Attachment"("revisionId");

-- CreateIndex
CREATE INDEX "Attachment_letterId_idx" ON "Attachment"("letterId");

-- CreateIndex
CREATE INDEX "Attachment_variationId_idx" ON "Attachment"("variationId");

-- CreateIndex
CREATE INDEX "Attachment_safetyIncidentId_idx" ON "Attachment"("safetyIncidentId");

-- CreateIndex
CREATE INDEX "Attachment_toolboxTalkId_idx" ON "Attachment"("toolboxTalkId");

-- CreateIndex
CREATE INDEX "Attachment_workPermitId_idx" ON "Attachment"("workPermitId");

-- CreateIndex
CREATE INDEX "Attachment_maintenanceJobId_idx" ON "Attachment"("maintenanceJobId");

-- CreateIndex
CREATE INDEX "Attachment_equipmentDocId_idx" ON "Attachment"("equipmentDocId");

-- CreateIndex
CREATE INDEX "Attachment_complianceDocId_idx" ON "Attachment"("complianceDocId");

-- CreateIndex
CREATE INDEX "Attachment_defectId_idx" ON "Attachment"("defectId");

-- CreateIndex
CREATE INDEX "Attachment_handoverId_idx" ON "Attachment"("handoverId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Inspection_organizationId_date_idx" ON "Inspection"("organizationId", "date");

