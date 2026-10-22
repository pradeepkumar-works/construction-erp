-- CreateEnum
CREATE TYPE "ScEnquiryStatus" AS ENUM ('OPEN', 'AWARDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SubcontractEnquiry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enquiryNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "closesOn" DATE,
    "status" "ScEnquiryStatus" NOT NULL DEFAULT 'OPEN',
    "awardedQuoteId" TEXT,
    "workOrderId" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractEnquiryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubcontractEnquiryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractQuote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "receivedOn" DATE,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "validUntil" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractQuoteLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "SubcontractQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractEnquiry_workOrderId_key" ON "SubcontractEnquiry"("workOrderId");

-- CreateIndex
CREATE INDEX "SubcontractEnquiry_organizationId_status_idx" ON "SubcontractEnquiry"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SubcontractEnquiry_projectId_idx" ON "SubcontractEnquiry"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractEnquiry_organizationId_enquiryNo_key" ON "SubcontractEnquiry"("organizationId", "enquiryNo");

-- CreateIndex
CREATE INDEX "SubcontractEnquiryItem_organizationId_idx" ON "SubcontractEnquiryItem"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractEnquiryItem_enquiryId_boqItemId_key" ON "SubcontractEnquiryItem"("enquiryId", "boqItemId");

-- CreateIndex
CREATE INDEX "SubcontractQuote_organizationId_idx" ON "SubcontractQuote"("organizationId");

-- CreateIndex
CREATE INDEX "SubcontractQuote_vendorId_idx" ON "SubcontractQuote"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractQuote_enquiryId_vendorId_key" ON "SubcontractQuote"("enquiryId", "vendorId");

-- CreateIndex
CREATE INDEX "SubcontractQuoteLine_itemId_idx" ON "SubcontractQuoteLine"("itemId");

-- CreateIndex
CREATE INDEX "SubcontractQuoteLine_organizationId_idx" ON "SubcontractQuoteLine"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractQuoteLine_quoteId_itemId_key" ON "SubcontractQuoteLine"("quoteId", "itemId");

-- AddForeignKey
ALTER TABLE "SubcontractEnquiry" ADD CONSTRAINT "SubcontractEnquiry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractEnquiry" ADD CONSTRAINT "SubcontractEnquiry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "SubcontractEnquiry" ADD CONSTRAINT "SubcontractEnquiry_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractEnquiry" ADD CONSTRAINT "SubcontractEnquiry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractEnquiryItem" ADD CONSTRAINT "SubcontractEnquiryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractEnquiryItem" ADD CONSTRAINT "SubcontractEnquiryItem_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "SubcontractEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractEnquiryItem" ADD CONSTRAINT "SubcontractEnquiryItem_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractQuote" ADD CONSTRAINT "SubcontractQuote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractQuote" ADD CONSTRAINT "SubcontractQuote_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "SubcontractEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractQuote" ADD CONSTRAINT "SubcontractQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractQuoteLine" ADD CONSTRAINT "SubcontractQuoteLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractQuoteLine" ADD CONSTRAINT "SubcontractQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SubcontractQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractQuoteLine" ADD CONSTRAINT "SubcontractQuoteLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SubcontractEnquiryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Figures that cannot be wrong
ALTER TABLE "SubcontractEnquiryItem" ADD CONSTRAINT "SubcontractEnquiryItem_quantity" CHECK ("quantity" > 0);
ALTER TABLE "SubcontractQuoteLine" ADD CONSTRAINT "SubcontractQuoteLine_rate" CHECK ("rate" >= 0);
ALTER TABLE "SubcontractQuote" ADD CONSTRAINT "SubcontractQuote_gstRate" CHECK ("gstRate" >= 0 AND "gstRate" <= 28);

-- Row-level security (see 20261013211500_tenant_rls)
ALTER TABLE "SubcontractEnquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubcontractEnquiry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SubcontractEnquiry"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SubcontractEnquiryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubcontractEnquiryItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SubcontractEnquiryItem"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SubcontractQuote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubcontractQuote" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SubcontractQuote"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SubcontractQuoteLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubcontractQuoteLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SubcontractQuoteLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
