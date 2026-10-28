-- Project types and component kinds a company sets up itself (item 134, ARCHITECTURE "Project types"). Everything is
-- new tables and nullable columns: a company with no rows of its own keeps using the standard types and kinds, which
-- are data in @erp/shared, and existing projects keep `type` (their type is the standard one of that kind).

-- CreateEnum
CREATE TYPE "WorkLocation" AS ENUM ('CHAINAGE', 'FLOOR', 'VILLAGE');

-- AlterEnum
ALTER TYPE "ProjectType" ADD VALUE 'OTHER';

-- DropIndex
DROP INDEX "ActivityTemplate_organizationId_projectType_idx";

-- DropIndex
DROP INDEX "ActivityTemplate_organizationId_projectType_name_key";

-- AlterTable
ALTER TABLE "ActivityTemplate" ADD COLUMN     "typeCode" TEXT;
-- A saved list belonged to a built-in kind; it now belongs to that kind's standard type, whose code is the kind's name.
UPDATE "ActivityTemplate" SET "typeCode" = "projectType"::text;
ALTER TABLE "ActivityTemplate" ALTER COLUMN "typeCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "typeCode" TEXT,
ADD COLUMN     "typeVersion" INTEGER;

-- AlterTable
ALTER TABLE "WorkElement" ADD COLUMN     "kindCode" TEXT;

-- CreateTable
CREATE TABLE "ProjectTypeConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseType" "ProjectType" NOT NULL,
    "description" TEXT,
    "locations" "WorkLocation"[] DEFAULT ARRAY[]::"WorkLocation"[],
    "pipeNetwork" BOOLEAN NOT NULL DEFAULT false,
    "contractModel" "ContractModel" NOT NULL DEFAULT 'ITEM_RATE',
    "kinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "breakdown" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentKind" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "elementType" "WorkElementType" NOT NULL,
    "specFields" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentKind_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTypeConfig_organizationId_code_key" ON "ProjectTypeConfig"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentKind_organizationId_code_key" ON "ComponentKind"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ActivityTemplate_organizationId_typeCode_idx" ON "ActivityTemplate"("organizationId", "typeCode");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTemplate_organizationId_typeCode_name_key" ON "ActivityTemplate"("organizationId", "typeCode", "name");

-- AddForeignKey
ALTER TABLE "ProjectTypeConfig" ADD CONSTRAINT "ProjectTypeConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTypeConfig" ADD CONSTRAINT "ProjectTypeConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentKind" ADD CONSTRAINT "ComponentKind_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentKind" ADD CONSTRAINT "ComponentKind_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security for the new tenant tables (as in 20261013211500_tenant_rls).
ALTER TABLE "ProjectTypeConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectTypeConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProjectTypeConfig"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "ComponentKind" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComponentKind" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ComponentKind"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
