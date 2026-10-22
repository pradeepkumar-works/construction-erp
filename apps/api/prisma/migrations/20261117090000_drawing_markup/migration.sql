-- Drawing markup (item 109): marks on a revision's drawing in the viewer. Additive only.
-- CreateEnum
CREATE TYPE "MarkupKind" AS ENUM ('PIN', 'CLOUD', 'RECT', 'ARROW', 'TEXT', 'PEN');

-- CreateEnum
CREATE TYPE "MarkupStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MarkupColor" AS ENUM ('RED', 'BLUE', 'GREEN', 'ORANGE');

-- CreateTable
CREATE TABLE "DrawingMarkup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "markupNo" INTEGER NOT NULL,
    "revisionId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "kind" "MarkupKind" NOT NULL,
    "points" JSONB NOT NULL,
    "color" "MarkupColor" NOT NULL DEFAULT 'RED',
    "note" TEXT,
    "status" "MarkupStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "rfiId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingMarkup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawingMarkup_organizationId_status_idx" ON "DrawingMarkup"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DrawingMarkup_revisionId_idx" ON "DrawingMarkup"("revisionId");

-- CreateIndex
CREATE INDEX "DrawingMarkup_attachmentId_idx" ON "DrawingMarkup"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingMarkup_documentId_markupNo_key" ON "DrawingMarkup"("documentId", "markupNo");

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "DrawingMarkup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrawingMarkup" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DrawingMarkup"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
