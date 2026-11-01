-- Supplier choice approval: the supplier finalised on a material request, sent for approval (submission type
-- SUPPLIER_CHOICE) when the company has purchase orders wait for an approved choice.

-- AlterTable
ALTER TABLE "MaterialRequest" ADD COLUMN     "supplierChoiceId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "ordersNeedApprovedChoice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupplierChoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialRequestId" TEXT NOT NULL,
    "quotationId" TEXT,
    "split" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "reason" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "l1Amount" DECIMAL(18,2),
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierChoice_organizationId_status_idx" ON "SupplierChoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SupplierChoice_projectId_status_idx" ON "SupplierChoice"("projectId", "status");

-- CreateIndex
CREATE INDEX "SupplierChoice_materialRequestId_idx" ON "SupplierChoice"("materialRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequest_supplierChoiceId_key" ON "MaterialRequest"("supplierChoiceId");

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_supplierChoiceId_fkey" FOREIGN KEY ("supplierChoiceId") REFERENCES "SupplierChoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChoice" ADD CONSTRAINT "SupplierChoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChoice" ADD CONSTRAINT "SupplierChoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChoice" ADD CONSTRAINT "SupplierChoice_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChoice" ADD CONSTRAINT "SupplierChoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChoice" ADD CONSTRAINT "SupplierChoice_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChoice" ADD CONSTRAINT "SupplierChoice_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A company with its own approval matrix gets the same rules for supplier choices as for purchase orders (who approves
-- an order approves the choice of its supplier), so nothing waits on Admin alone; an admin changes them in Approval rules.
INSERT INTO "ApprovalRule" ("id", "organizationId", "roleId", "submissionType", "maxAmount", "level", "minAmount", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "organizationId", "roleId", 'SUPPLIER_CHOICE', "maxAmount", "level", "minAmount", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ApprovalRule" WHERE "submissionType" = 'PURCHASE_ORDER'
ON CONFLICT DO NOTHING;

-- Row-level security, as on every tenant table (20261013211500_tenant_rls).
ALTER TABLE "SupplierChoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierChoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupplierChoice"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
