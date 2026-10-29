-- CreateTable
CREATE TABLE "ControlledCopy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "copyNo" INTEGER NOT NULL,
    "holder" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "issuedById" TEXT NOT NULL,
    "transmittalId" TEXT,
    "disposal" TEXT,
    "disposedOn" DATE,
    "disposalNote" TEXT,
    "disposedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledCopy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlledCopy_organizationId_projectId_idx" ON "ControlledCopy"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "ControlledCopy_documentId_idx" ON "ControlledCopy"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCopy_revisionId_copyNo_key" ON "ControlledCopy"("revisionId", "copyNo");

-- AddForeignKey
ALTER TABLE "ControlledCopy" ADD CONSTRAINT "ControlledCopy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCopy" ADD CONSTRAINT "ControlledCopy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCopy" ADD CONSTRAINT "ControlledCopy_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCopy" ADD CONSTRAINT "ControlledCopy_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCopy" ADD CONSTRAINT "ControlledCopy_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCopy" ADD CONSTRAINT "ControlledCopy_transmittalId_fkey" FOREIGN KEY ("transmittalId") REFERENCES "Transmittal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCopy" ADD CONSTRAINT "ControlledCopy_disposedById_fkey" FOREIGN KEY ("disposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "ControlledCopy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ControlledCopy" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ControlledCopy"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
