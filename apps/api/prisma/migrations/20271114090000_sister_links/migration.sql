-- CreateTable
CREATE TABLE "SisterLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT,
    "clientId" TEXT,
    "sisterId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SisterLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SisterLink_sisterId_idx" ON "SisterLink"("sisterId");

-- CreateIndex
CREATE UNIQUE INDEX "SisterLink_organizationId_vendorId_key" ON "SisterLink"("organizationId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "SisterLink_organizationId_clientId_key" ON "SisterLink"("organizationId", "clientId");

-- AddForeignKey
ALTER TABLE "SisterLink" ADD CONSTRAINT "SisterLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SisterLink" ADD CONSTRAINT "SisterLink_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SisterLink" ADD CONSTRAINT "SisterLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SisterLink" ADD CONSTRAINT "SisterLink_sisterId_fkey" FOREIGN KEY ("sisterId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SisterLink" ADD CONSTRAINT "SisterLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A link names exactly one party, a vendor or a client, and never the company itself.
ALTER TABLE "SisterLink" ADD CONSTRAINT "SisterLink_one_party" CHECK (num_nonnulls("vendorId", "clientId") = 1);
ALTER TABLE "SisterLink" ADD CONSTRAINT "SisterLink_not_itself" CHECK ("sisterId" <> "organizationId");

ALTER TABLE "SisterLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SisterLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SisterLink"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
