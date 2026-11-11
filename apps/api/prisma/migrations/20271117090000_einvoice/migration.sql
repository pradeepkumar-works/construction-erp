-- GST e-invoices and e-way bills (ARCHITECTURE "E-invoices and e-way bills")

ALTER TYPE "IntegrationKind" ADD VALUE 'GST_GSP';

CREATE TYPE "GstDocumentKind" AS ENUM ('IRN', 'EWB');
CREATE TYPE "GstDocumentStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLED', 'FAILED');
CREATE TYPE "GstSourceKind" AS ENUM ('RA_BILL', 'RMC_INVOICE', 'RMC_BATCH', 'STOCK_TRANSFER');

ALTER TABLE "Organization" ADD COLUMN "gstSac" TEXT, ADD COLUMN "einvoiceFrom" DATE;
ALTER TABLE "RaBill" ADD COLUMN "sacCode" TEXT;
ALTER TABLE "Item" ADD COLUMN "hsnCode" TEXT;

CREATE TABLE "GstDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "GstDocumentKind" NOT NULL,
    "sourceKind" "GstSourceKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "docNo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "GstDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "number" TEXT,
    "ackNo" TEXT,
    "ackAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "signedQr" TEXT,
    "vehicleNo" TEXT,
    "distanceKm" INTEGER,
    "extensions" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "response" JSONB,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelRemark" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GstDocument_organizationId_sourceKind_sourceId_idx" ON "GstDocument"("organizationId", "sourceKind", "sourceId");

ALTER TABLE "GstDocument" ADD CONSTRAINT "GstDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GstDocument" ADD CONSTRAINT "GstDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A record has at most one IRN or e-way bill being made or made at a time.
CREATE UNIQUE INDEX "GstDocument_one_live" ON "GstDocument"("organizationId", "kind", "sourceKind", "sourceId") WHERE "status" IN ('PENDING', 'ACTIVE');

ALTER TABLE "GstDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GstDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GstDocument"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
