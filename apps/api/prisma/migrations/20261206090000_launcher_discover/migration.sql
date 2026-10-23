-- Launcher phase 3: a company's New and Featured marks on Home's tiles, and requests for access from Discover.
-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('OPEN', 'GRANTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACCESS_REQUEST';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "discoverLocked" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "LauncherFlag" (
    "organizationId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "isNew" BOOLEAN,
    "newUntil" DATE,
    "featured" BOOLEAN,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LauncherFlag_pkey" PRIMARY KEY ("organizationId","nodeId")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "note" TEXT,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'OPEN',
    "reply" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessRequest_organizationId_status_idx" ON "AccessRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AccessRequest_userId_nodeId_idx" ON "AccessRequest"("userId", "nodeId");

-- AddForeignKey
ALTER TABLE "LauncherFlag" ADD CONSTRAINT "LauncherFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "LauncherFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LauncherFlag" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LauncherFlag"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "AccessRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AccessRequest"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
