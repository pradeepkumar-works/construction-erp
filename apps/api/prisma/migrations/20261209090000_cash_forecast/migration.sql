-- CreateTable
CREATE TABLE "CashForecastSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "asOf" DATE NOT NULL,
    "opening" DECIMAL(18,2) NOT NULL,
    "weeks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashForecastSnapshot_organizationId_weekStart_key" ON "CashForecastSnapshot"("organizationId", "weekStart");

-- AddForeignKey
ALTER TABLE "CashForecastSnapshot" ADD CONSTRAINT "CashForecastSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "CashForecastSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashForecastSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashForecastSnapshot"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
