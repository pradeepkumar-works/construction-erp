-- CreateEnum
CREATE TYPE "IsDiscipline" AS ENUM ('CIVIL', 'MECHANICAL', 'ELECTRICAL');

-- CreateTable
CREATE TABLE "IsStandard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "reaffirmed" INTEGER,
    "title" TEXT NOT NULL,
    "discipline" "IsDiscipline" NOT NULL,
    "subject" TEXT NOT NULL,
    "clauses" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "checkedOn" DATE,
    "checkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsStandard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IsStandard_organizationId_code_key" ON "IsStandard"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "IsStandard" ADD CONSTRAINT "IsStandard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsStandard" ADD CONSTRAINT "IsStandard_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "IsStandard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IsStandard" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IsStandard"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
