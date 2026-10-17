-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WATCH_LIST';

-- CreateTable
CREATE TABLE "WarningDismissal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "warningKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "dismissedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarningDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarningDismissal_organizationId_warningKey_key" ON "WarningDismissal"("organizationId", "warningKey");

-- AddForeignKey
ALTER TABLE "WarningDismissal" ADD CONSTRAINT "WarningDismissal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarningDismissal" ADD CONSTRAINT "WarningDismissal_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "WarningDismissal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarningDismissal" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WarningDismissal"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
