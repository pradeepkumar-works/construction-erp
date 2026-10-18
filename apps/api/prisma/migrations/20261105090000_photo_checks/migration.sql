-- Site photo checks (AI item 76).
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "photoFlagsOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PhotoCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "caption" TEXT,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "draft" JSONB,
    "reason" TEXT,
    "model" TEXT,
    "costPaise" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoCheck_attachmentId_key" ON "PhotoCheck"("attachmentId");

-- CreateIndex
CREATE INDEX "PhotoCheck_organizationId_createdAt_idx" ON "PhotoCheck"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PhotoCheck_projectId_idx" ON "PhotoCheck"("projectId");

-- AddForeignKey
ALTER TABLE "PhotoCheck" ADD CONSTRAINT "PhotoCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoCheck" ADD CONSTRAINT "PhotoCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoCheck" ADD CONSTRAINT "PhotoCheck_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, as on every tenant table (20261013211500_tenant_rls).
ALTER TABLE "PhotoCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhotoCheck" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PhotoCheck"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
