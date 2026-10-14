-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "advanceRecoveryPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "agreementDate" DATE,
ADD COLUMN     "agreementNo" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "defectLiabilityMonths" INTEGER,
ADD COLUMN     "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
ADD COLUMN     "gstTdsPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "labourCessPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "mobilisationAdvance" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "priceVariation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retentionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "securityDepositPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "eotGrantedDays" INTEGER;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "billingAddress" TEXT,
    "stateCode" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_name_key" ON "Client"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tenant row-level security (see 20261013211500_tenant_rls)
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Client"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
