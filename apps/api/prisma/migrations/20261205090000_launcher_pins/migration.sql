-- Launcher phase 2: pins on Home and the places each user opened (Recent).

-- CreateEnum
CREATE TYPE "NavPinKind" AS ENUM ('NODE', 'PROJECT');

-- CreateEnum
CREATE TYPE "NavVisitKind" AS ENUM ('NODE', 'PROJECT', 'RECORD');

-- CreateTable
CREATE TABLE "NavPin" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NavPinKind" NOT NULL,
    "target" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NavPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NavVisitKind" NOT NULL,
    "target" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "NavVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NavPin_organizationId_idx" ON "NavPin"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "NavPin_userId_kind_target_key" ON "NavPin"("userId", "kind", "target");

-- CreateIndex
CREATE INDEX "NavVisit_userId_lastAt_idx" ON "NavVisit"("userId", "lastAt");

-- CreateIndex
CREATE INDEX "NavVisit_organizationId_idx" ON "NavVisit"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "NavVisit_userId_kind_target_key" ON "NavVisit"("userId", "kind", "target");

-- AddForeignKey
ALTER TABLE "NavPin" ADD CONSTRAINT "NavPin_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavPin" ADD CONSTRAINT "NavPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavVisit" ADD CONSTRAINT "NavVisit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavVisit" ADD CONSTRAINT "NavVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "NavPin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NavPin" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NavPin"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "NavVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NavVisit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NavVisit"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
