-- O&M contract (item 131): the contract, its minimum staff and chemical norms, staff deployed by month, the daily
-- service level log, and the O&M year and instalment on an RA bill.

-- AlterTable
ALTER TABLE "RaBill" ADD COLUMN     "omDetail" JSONB,
ADD COLUMN     "omInstalment" INTEGER,
ADD COLUMN     "omPenalty" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "omYear" INTEGER;

-- CreateTable
CREATE TABLE "OmContract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startOn" DATE NOT NULL,
    "years" INTEGER NOT NULL,
    "yearPcts" DECIMAL(6,3)[],
    "instalmentsPerYear" INTEGER NOT NULL DEFAULT 4,
    "extensionYears" INTEGER NOT NULL DEFAULT 0,
    "population" INTEGER NOT NULL,
    "benchmarks" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmStaffNorm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "required" INTEGER NOT NULL,
    "monthlyPay" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OmStaffNorm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmStaffMonth" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "role" TEXT NOT NULL,
    "deployed" INTEGER NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmStaffMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLevelDay" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "producedKl" DECIMAL(18,3) NOT NULL,
    "suppliedKl" DECIMAL(18,3) NOT NULL,
    "residualChlorine" DECIMAL(6,2),
    "tailPressureM" DECIMAL(6,2),
    "complaintsReceived" INTEGER NOT NULL DEFAULT 0,
    "complaintsClosed48h" INTEGER NOT NULL DEFAULT 0,
    "pumpEfficiencyPct" DECIMAL(5,2),
    "note" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceLevelDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmChemicalNorm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "perMl" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "OmChemicalNorm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OmContract_projectId_key" ON "OmContract"("projectId");

-- CreateIndex
CREATE INDEX "OmContract_organizationId_idx" ON "OmContract"("organizationId");

-- CreateIndex
CREATE INDEX "OmStaffNorm_organizationId_idx" ON "OmStaffNorm"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OmStaffNorm_contractId_role_key" ON "OmStaffNorm"("contractId", "role");

-- CreateIndex
CREATE INDEX "OmStaffMonth_organizationId_idx" ON "OmStaffMonth"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OmStaffMonth_projectId_month_role_key" ON "OmStaffMonth"("projectId", "month", "role");

-- CreateIndex
CREATE INDEX "ServiceLevelDay_organizationId_idx" ON "ServiceLevelDay"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLevelDay_projectId_date_key" ON "ServiceLevelDay"("projectId", "date");

-- CreateIndex
CREATE INDEX "OmChemicalNorm_organizationId_idx" ON "OmChemicalNorm"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OmChemicalNorm_contractId_itemId_key" ON "OmChemicalNorm"("contractId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RaBill_projectId_omYear_omInstalment_key" ON "RaBill"("projectId", "omYear", "omInstalment");

-- AddForeignKey
ALTER TABLE "OmContract" ADD CONSTRAINT "OmContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmContract" ADD CONSTRAINT "OmContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmStaffNorm" ADD CONSTRAINT "OmStaffNorm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmStaffNorm" ADD CONSTRAINT "OmStaffNorm_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OmContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmStaffMonth" ADD CONSTRAINT "OmStaffMonth_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmStaffMonth" ADD CONSTRAINT "OmStaffMonth_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmStaffMonth" ADD CONSTRAINT "OmStaffMonth_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLevelDay" ADD CONSTRAINT "ServiceLevelDay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLevelDay" ADD CONSTRAINT "ServiceLevelDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLevelDay" ADD CONSTRAINT "ServiceLevelDay_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmChemicalNorm" ADD CONSTRAINT "OmChemicalNorm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmChemicalNorm" ADD CONSTRAINT "OmChemicalNorm_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OmContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmChemicalNorm" ADD CONSTRAINT "OmChemicalNorm_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security (copy of 20261013211500_tenant_rls)
ALTER TABLE "OmContract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OmContract" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OmContract"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "OmStaffNorm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OmStaffNorm" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OmStaffNorm"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "OmStaffMonth" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OmStaffMonth" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OmStaffMonth"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "ServiceLevelDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceLevelDay" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ServiceLevelDay"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "OmChemicalNorm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OmChemicalNorm" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OmChemicalNorm"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
