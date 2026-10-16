-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedView_organizationId_list_idx" ON "SavedView"("organizationId", "list");

-- CreateIndex
CREATE INDEX "SavedView_userId_idx" ON "SavedView"("userId");

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedView" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SavedView"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
