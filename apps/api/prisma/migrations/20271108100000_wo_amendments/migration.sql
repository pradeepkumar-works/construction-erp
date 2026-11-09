-- Work order amendments: an approved order's lines changed or added and its end date moved, approved as a submission
-- (type WO_AMENDMENT) and applied to the order's lines in place.

-- AlterTable
ALTER TABLE "SubcontractBillLine" ADD COLUMN     "prevAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "amendmentNo" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WorkOrderAmendment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "amendmentNo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "endDate" DATE,
    "endDateBefore" DATE,
    "valueBefore" DECIMAL(18,2) NOT NULL,
    "valueAfter" DECIMAL(18,2) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderAmendmentLine" (
    "id" TEXT NOT NULL,
    "amendmentId" TEXT NOT NULL,
    "workOrderLineId" TEXT,
    "boqItemId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qtyBefore" DECIMAL(18,3),
    "rateBefore" DECIMAL(18,2),
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkOrderAmendmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderAmendment_organizationId_status_idx" ON "WorkOrderAmendment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WorkOrderAmendment_projectId_status_idx" ON "WorkOrderAmendment"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderAmendment_workOrderId_amendmentNo_key" ON "WorkOrderAmendment"("workOrderId", "amendmentNo");

-- CreateIndex
CREATE INDEX "WorkOrderAmendmentLine_amendmentId_idx" ON "WorkOrderAmendmentLine"("amendmentId");

-- CreateIndex
CREATE INDEX "WorkOrderAmendmentLine_workOrderLineId_idx" ON "WorkOrderAmendmentLine"("workOrderLineId");

-- AddForeignKey
ALTER TABLE "WorkOrderAmendment" ADD CONSTRAINT "WorkOrderAmendment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAmendment" ADD CONSTRAINT "WorkOrderAmendment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAmendment" ADD CONSTRAINT "WorkOrderAmendment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAmendment" ADD CONSTRAINT "WorkOrderAmendment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAmendment" ADD CONSTRAINT "WorkOrderAmendment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAmendmentLine" ADD CONSTRAINT "WorkOrderAmendmentLine_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "WorkOrderAmendment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAmendmentLine" ADD CONSTRAINT "WorkOrderAmendmentLine_workOrderLineId_fkey" FOREIGN KEY ("workOrderLineId") REFERENCES "WorkOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAmendmentLine" ADD CONSTRAINT "WorkOrderAmendmentLine_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one amendment per order is open (draft, waiting or sent back) at a time.
CREATE UNIQUE INDEX "WorkOrderAmendment_one_open" ON "WorkOrderAmendment"("workOrderId") WHERE "status" NOT IN ('APPROVED', 'REJECTED');

-- Earlier bills' amounts per line, as the bills made them (a bill line's previous value was its quantity at its own rate).
UPDATE "SubcontractBillLine" l SET "prevAmount" = COALESCE((
  SELECT SUM(e."amount") FROM "SubcontractBillLine" e
  JOIN "SubcontractBill" eb ON eb."id" = e."billId"
  JOIN "SubcontractBill" b ON b."id" = l."billId"
  WHERE e."workOrderLineId" = l."workOrderLineId" AND eb."workOrderId" = b."workOrderId" AND eb."billNo" < b."billNo"
), 0);

-- Who approves a work order approves its amendments, with the same limits, levels and reminders, so nothing waits on
-- Admin alone; an admin changes them in Approval rules.
INSERT INTO "ApprovalRule" ("id", "organizationId", "roleId", "positionCode", "submissionType", "maxAmount", "level", "minAmount", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "organizationId", "roleId", "positionCode", 'WO_AMENDMENT', "maxAmount", "level", "minAmount", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ApprovalRule" WHERE "submissionType" = 'WORK_ORDER'
ON CONFLICT DO NOTHING;

INSERT INTO "ApprovalEscalation" ("id", "organizationId", "submissionType", "remindAfterHours", "escalateAfterHours", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "organizationId", 'WO_AMENDMENT', "remindAfterHours", "escalateAfterHours", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ApprovalEscalation" WHERE "submissionType" = 'WORK_ORDER'
ON CONFLICT DO NOTHING;

-- Row-level security, as on every tenant table (20261013211500_tenant_rls).
ALTER TABLE "WorkOrderAmendment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrderAmendment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkOrderAmendment"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
