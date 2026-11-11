-- A company's own fields on vendors, projects and purchase orders (ARCHITECTURE "Custom fields")

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "customValues" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "customValues" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "customValues" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "CustomFieldDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelHi" TEXT,
    "kind" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "min" DECIMAL(18,3),
    "max" DECIMAL(18,3),
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDef_organizationId_entity_key_key" ON "CustomFieldDef"("organizationId", "entity", "key");

-- AddForeignKey
ALTER TABLE "CustomFieldDef" ADD CONSTRAINT "CustomFieldDef_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomFieldDef" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomFieldDef" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomFieldDef"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
