-- Tender bidding (v6 item 110): schedules of rates, the tender register, the priced bid BOQ and the bids read out at opening.

-- CreateEnum
CREATE TYPE "SorBookKind" AS ENUM ('STATE', 'CPWD', 'OWN', 'OTHER');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('PREPARING', 'SUBMITTED', 'WON', 'LOST', 'DROPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenderBidType" AS ENUM ('PERCENTAGE', 'ITEM_RATE');

-- CreateEnum
CREATE TYPE "TenderLineKind" AS ENUM ('MATERIAL', 'LABOUR', 'EQUIPMENT');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "tenderId" TEXT;

-- CreateTable
CREATE TABLE "SorBook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SorBookKind" NOT NULL,
    "edition" TEXT,
    "region" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SorBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SorItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "chapter" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SorItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenderNo" TEXT NOT NULL,
    "nitNo" TEXT,
    "title" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "location" TEXT,
    "bidType" "TenderBidType" NOT NULL DEFAULT 'PERCENTAGE',
    "sorBookId" TEXT,
    "estimatedValue" DECIMAL(18,2),
    "completionMonths" INTEGER,
    "publishedOn" DATE,
    "submitBy" DATE NOT NULL,
    "submittedOn" DATE,
    "openedOn" DATE,
    "quotedPct" DECIMAL(7,2),
    "overheadPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "profitPct" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "tenderFee" DECIMAL(18,2),
    "emdDocId" TEXT,
    "status" "TenderStatus" NOT NULL DEFAULT 'PREPARING',
    "resultOn" DATE,
    "resultNote" TEXT,
    "projectId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "itemNo" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "sorItemId" TEXT,
    "sorRate" DECIMAL(18,2),
    "quotedRate" DECIMAL(18,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderItemLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenderItemId" TEXT NOT NULL,
    "kind" "TenderLineKind" NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qtyPerUnit" DECIMAL(18,6) NOT NULL,
    "wastagePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(18,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TenderItemLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderBid" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "bidderName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SorBook_organizationId_idx" ON "SorBook"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SorBook_organizationId_name_key" ON "SorBook"("organizationId", "name");

-- CreateIndex
CREATE INDEX "SorItem_organizationId_idx" ON "SorItem"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SorItem_bookId_code_key" ON "SorItem"("bookId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_emdDocId_key" ON "Tender"("emdDocId");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_projectId_key" ON "Tender"("projectId");

-- CreateIndex
CREATE INDEX "Tender_organizationId_status_submitBy_idx" ON "Tender"("organizationId", "status", "submitBy");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_organizationId_tenderNo_key" ON "Tender"("organizationId", "tenderNo");

-- CreateIndex
CREATE INDEX "TenderItem_organizationId_idx" ON "TenderItem"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderItem_tenderId_itemNo_key" ON "TenderItem"("tenderId", "itemNo");

-- CreateIndex
CREATE INDEX "TenderItemLine_tenderItemId_idx" ON "TenderItemLine"("tenderItemId");

-- CreateIndex
CREATE INDEX "TenderItemLine_organizationId_idx" ON "TenderItemLine"("organizationId");

-- CreateIndex
CREATE INDEX "TenderBid_organizationId_idx" ON "TenderBid"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderBid_tenderId_bidderName_key" ON "TenderBid"("tenderId", "bidderName");

-- CreateIndex
CREATE INDEX "Attachment_tenderId_idx" ON "Attachment"("tenderId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SorBook" ADD CONSTRAINT "SorBook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SorBook" ADD CONSTRAINT "SorBook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SorItem" ADD CONSTRAINT "SorItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SorItem" ADD CONSTRAINT "SorItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "SorBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_sorBookId_fkey" FOREIGN KEY ("sorBookId") REFERENCES "SorBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_emdDocId_fkey" FOREIGN KEY ("emdDocId") REFERENCES "ComplianceDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_sorItemId_fkey" FOREIGN KEY ("sorItemId") REFERENCES "SorItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItemLine" ADD CONSTRAINT "TenderItemLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItemLine" ADD CONSTRAINT "TenderItemLine_tenderItemId_fkey" FOREIGN KEY ("tenderItemId") REFERENCES "TenderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderItemLine" ADD CONSTRAINT "TenderItemLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderBid" ADD CONSTRAINT "TenderBid_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderBid" ADD CONSTRAINT "TenderBid_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rates, quantities and percentages that make a bid.
ALTER TABLE "SorItem" ADD CONSTRAINT "SorItem_rate" CHECK ("rate" >= 0);
ALTER TABLE "TenderItem" ADD CONSTRAINT "TenderItem_figures" CHECK ("qty" > 0 AND ("sorRate" IS NULL OR "sorRate" >= 0) AND ("quotedRate" IS NULL OR "quotedRate" >= 0));
ALTER TABLE "TenderItemLine" ADD CONSTRAINT "TenderItemLine_figures" CHECK ("qtyPerUnit" > 0 AND "wastagePct" >= 0 AND "wastagePct" <= 100 AND ("rate" IS NULL OR "rate" >= 0));
ALTER TABLE "TenderBid" ADD CONSTRAINT "TenderBid_amount" CHECK ("amount" > 0);
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_terms" CHECK ("overheadPct" >= 0 AND "overheadPct" <= 100 AND "profitPct" >= 0 AND "profitPct" <= 100 AND ("quotedPct" IS NULL OR ("quotedPct" > -100 AND "quotedPct" < 1000)) AND ("completionMonths" IS NULL OR "completionMonths" > 0));

-- Row-level security, as every tenant table.
ALTER TABLE "SorBook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SorBook" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SorBook"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SorItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SorItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SorItem"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "Tender" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tender" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tender"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "TenderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenderItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenderItem"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "TenderItemLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenderItemLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenderItemLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "TenderBid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenderBid" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenderBid"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
