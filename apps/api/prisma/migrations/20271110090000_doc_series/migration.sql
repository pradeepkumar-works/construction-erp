-- Company settings: document number series, the counters under them, and the company's logo.
ALTER TABLE "Organization" ADD COLUMN "docSeries" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Organization" ADD COLUMN "logo" TEXT;

CREATE TABLE "DocCounter" (
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "last" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocCounter_pkey" PRIMARY KEY ("organizationId","kind","prefix")
);

ALTER TABLE "DocCounter" ADD CONSTRAINT "DocCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocCounter" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocCounter"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
