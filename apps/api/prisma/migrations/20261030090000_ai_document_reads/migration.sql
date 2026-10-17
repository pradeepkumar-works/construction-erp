-- CreateTable
CREATE TABLE "AiDocumentRead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "costPaise" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDocumentRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiDocumentRead_organizationId_createdAt_idx" ON "AiDocumentRead"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiDocumentRead" ADD CONSTRAINT "AiDocumentRead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDocumentRead" ADD CONSTRAINT "AiDocumentRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "AiDocumentRead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiDocumentRead" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiDocumentRead"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
