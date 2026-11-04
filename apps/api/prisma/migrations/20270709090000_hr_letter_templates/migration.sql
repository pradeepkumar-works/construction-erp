-- HR letter templates: the company's own words for each letter
CREATE TABLE "HrLetterTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrLetterTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrLetterTemplate_organizationId_kind_key" ON "HrLetterTemplate"("organizationId", "kind");

ALTER TABLE "HrLetterTemplate" ADD CONSTRAINT "HrLetterTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrLetterTemplate" ADD CONSTRAINT "HrLetterTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HrLetterTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HrLetterTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HrLetterTemplate"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
