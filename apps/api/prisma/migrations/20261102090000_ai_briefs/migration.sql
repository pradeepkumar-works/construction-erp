-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MORNING_BRIEF';

-- AlterEnum
ALTER TYPE "MessageTemplate" ADD VALUE 'MORNING_BRIEF';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "morningBrief" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiBrief" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "date" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "byAssistant" BOOLEAN NOT NULL,
    "unverified" JSONB,
    "model" TEXT,
    "costPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiBrief_organizationId_createdAt_idx" ON "AiBrief"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiBrief_organizationId_key_key" ON "AiBrief"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "AiBrief" ADD CONSTRAINT "AiBrief_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBrief" ADD CONSTRAINT "AiBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBrief" ADD CONSTRAINT "AiBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "AiBrief" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiBrief" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiBrief"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
