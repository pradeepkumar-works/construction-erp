-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "fromSupplier" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MaterialRequestCover" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "materialRequestItemId" TEXT NOT NULL,
    "stockEntryId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRequestCover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "materialRequestId" TEXT NOT NULL,
    "closesOn" DATE NOT NULL,
    "message" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "email" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "emailedAt" TIMESTAMP(3),
    "emailError" TEXT,
    "openedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "quotationId" TEXT,

    CONSTRAINT "EnquiryToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialRequestCover_materialRequestItemId_idx" ON "MaterialRequestCover"("materialRequestItemId");

-- CreateIndex
CREATE INDEX "MaterialRequestCover_stockEntryId_idx" ON "MaterialRequestCover"("stockEntryId");

-- CreateIndex
CREATE INDEX "MaterialRequestCover_organizationId_idx" ON "MaterialRequestCover"("organizationId");

-- CreateIndex
CREATE INDEX "Enquiry_materialRequestId_idx" ON "Enquiry"("materialRequestId");

-- CreateIndex
CREATE INDEX "Enquiry_organizationId_idx" ON "Enquiry"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EnquiryToken_tokenHash_key" ON "EnquiryToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EnquiryToken_vendorId_idx" ON "EnquiryToken"("vendorId");

-- CreateIndex
CREATE INDEX "EnquiryToken_organizationId_idx" ON "EnquiryToken"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EnquiryToken_enquiryId_vendorId_key" ON "EnquiryToken"("enquiryId", "vendorId");

-- AddForeignKey
ALTER TABLE "MaterialRequestCover" ADD CONSTRAINT "MaterialRequestCover_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestCover" ADD CONSTRAINT "MaterialRequestCover_materialRequestItemId_fkey" FOREIGN KEY ("materialRequestItemId") REFERENCES "MaterialRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestCover" ADD CONSTRAINT "MaterialRequestCover_stockEntryId_fkey" FOREIGN KEY ("stockEntryId") REFERENCES "StockEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryToken" ADD CONSTRAINT "EnquiryToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryToken" ADD CONSTRAINT "EnquiryToken_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryToken" ADD CONSTRAINT "EnquiryToken_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryToken" ADD CONSTRAINT "EnquiryToken_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "MaterialRequestCover" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaterialRequestCover" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaterialRequestCover"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "Enquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Enquiry"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "EnquiryToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnquiryToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EnquiryToken"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
