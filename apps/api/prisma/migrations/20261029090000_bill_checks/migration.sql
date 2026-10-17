-- CreateTable
CREATE TABLE "BillCheckAcceptance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "acceptedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillCheckAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillCheckSummary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT,
    "costPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillCheckSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillCheckAcceptance_organizationId_idx" ON "BillCheckAcceptance"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BillCheckAcceptance_kind_billId_checkKey_key" ON "BillCheckAcceptance"("kind", "billId", "checkKey");

-- CreateIndex
CREATE INDEX "BillCheckSummary_organizationId_createdAt_idx" ON "BillCheckSummary"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillCheckSummary_kind_billId_fingerprint_key" ON "BillCheckSummary"("kind", "billId", "fingerprint");

-- AddForeignKey
ALTER TABLE "BillCheckAcceptance" ADD CONSTRAINT "BillCheckAcceptance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCheckAcceptance" ADD CONSTRAINT "BillCheckAcceptance_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCheckSummary" ADD CONSTRAINT "BillCheckSummary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "BillCheckAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillCheckAcceptance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BillCheckAcceptance"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "BillCheckSummary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillCheckSummary" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BillCheckSummary"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
