-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "textIndexedAt" TIMESTAMP(3),
ADD COLUMN     "textPages" INTEGER;

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentPage_organizationId_projectId_idx" ON "DocumentPage"("organizationId", "projectId");

-- Full-text search over the pages
CREATE INDEX "DocumentPage_search_idx" ON "DocumentPage" USING GIN ("search");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_attachmentId_page_key" ON "DocumentPage"("attachmentId", "page");

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "DocumentPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentPage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocumentPage"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
