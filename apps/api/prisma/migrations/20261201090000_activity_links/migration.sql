-- CreateEnum
CREATE TYPE "ActivityLinkType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateTable
CREATE TABLE "ActivityLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "ActivityLinkType" NOT NULL DEFAULT 'FS',
    "lagDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLink_projectId_idx" ON "ActivityLink"("projectId");

-- CreateIndex
CREATE INDEX "ActivityLink_successorId_idx" ON "ActivityLink"("successorId");

-- CreateIndex
CREATE INDEX "ActivityLink_organizationId_idx" ON "ActivityLink"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityLink_predecessorId_successorId_key" ON "ActivityLink"("predecessorId", "successorId");

-- AddForeignKey
ALTER TABLE "ActivityLink" ADD CONSTRAINT "ActivityLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLink" ADD CONSTRAINT "ActivityLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLink" ADD CONSTRAINT "ActivityLink_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLink" ADD CONSTRAINT "ActivityLink_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A link joins two different activities, with a lag of at most a year either way.
ALTER TABLE "ActivityLink" ADD CONSTRAINT "ActivityLink_not_self" CHECK ("predecessorId" <> "successorId");
ALTER TABLE "ActivityLink" ADD CONSTRAINT "ActivityLink_lag" CHECK ("lagDays" BETWEEN -365 AND 365);

-- Row-level security: each organisation sees only its own rows (see 20261013211500_tenant_rls).
ALTER TABLE "ActivityLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ActivityLink"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
