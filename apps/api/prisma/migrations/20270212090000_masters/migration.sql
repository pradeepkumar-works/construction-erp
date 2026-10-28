-- Masters (item 135): the company's entries in its simple master lists (trades, designations, departments, item and
-- equipment categories). Standard entries live in code; rows lay over them by code or add the company's own.
CREATE TABLE "MasterEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MasterEntry_organizationId_list_code_key" ON "MasterEntry"("organizationId", "list", "code");

ALTER TABLE "MasterEntry" ADD CONSTRAINT "MasterEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MasterEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MasterEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MasterEntry"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
