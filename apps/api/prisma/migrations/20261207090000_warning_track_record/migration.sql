-- Item 119: what became of each warning (track record and pauses), resumed kinds, and the warnings each person was told about.
-- CreateEnum
CREATE TYPE "WarningOutcome" AS ENUM ('FIXED', 'KNOWN', 'WRONG');

-- AlterTable
ALTER TABLE "WarningDismissal" ADD COLUMN     "outcome" "WarningOutcome" NOT NULL DEFAULT 'KNOWN';

-- CreateTable
CREATE TABLE "WarningOutcomeLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "warningKey" TEXT NOT NULL,
    "outcome" "WarningOutcome" NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarningOutcomeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarningKindResume" (
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resumedAt" TIMESTAMP(3) NOT NULL,
    "resumedById" TEXT NOT NULL,

    CONSTRAINT "WarningKindResume_pkey" PRIMARY KEY ("organizationId","kind")
);

-- CreateTable
CREATE TABLE "WarningAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warningKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "alertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarningAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarningOutcomeLog_organizationId_kind_createdAt_idx" ON "WarningOutcomeLog"("organizationId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "WarningAlert_organizationId_idx" ON "WarningAlert"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WarningAlert_userId_warningKey_key" ON "WarningAlert"("userId", "warningKey");

-- AddForeignKey
ALTER TABLE "WarningOutcomeLog" ADD CONSTRAINT "WarningOutcomeLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarningOutcomeLog" ADD CONSTRAINT "WarningOutcomeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarningKindResume" ADD CONSTRAINT "WarningKindResume_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarningKindResume" ADD CONSTRAINT "WarningKindResume_resumedById_fkey" FOREIGN KEY ("resumedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarningAlert" ADD CONSTRAINT "WarningAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarningAlert" ADD CONSTRAINT "WarningAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "WarningOutcomeLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarningOutcomeLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WarningOutcomeLog"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "WarningKindResume" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarningKindResume" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WarningKindResume"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "WarningAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarningAlert" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WarningAlert"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
