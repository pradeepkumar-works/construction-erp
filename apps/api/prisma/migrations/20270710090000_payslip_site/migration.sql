-- A payslip keeps the site the person was posted at, so their salary counts in that project's cost
ALTER TABLE "Payslip" ADD COLUMN "projectId" TEXT;

ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Payslip_projectId_idx" ON "Payslip"("projectId");

-- Payslips made before: the site of the same name in the same company.
UPDATE "Payslip" s SET "projectId" = p."id"
  FROM "Project" p
  WHERE s."projectName" IS NOT NULL AND p."organizationId" = s."organizationId" AND p."name" = s."projectName";
