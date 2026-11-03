-- Joining documents: one line per kind for a person, with its file and HR's check; the offer letter event.

-- CreateEnum
CREATE TYPE "EmployeeDocumentStatus" AS ENUM ('UPLOADED', 'VERIFIED', 'REJECTED', 'WAIVED');

-- AlterEnum
ALTER TYPE "EmployeeEventType" ADD VALUE 'OFFERED';


-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "EmployeeDocumentStatus" NOT NULL,
    "attachmentId" TEXT,
    "note" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocument_attachmentId_key" ON "EmployeeDocument"("attachmentId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_organizationId_idx" ON "EmployeeDocument"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocument_employeeId_kind_key" ON "EmployeeDocument"("employeeId", "kind");

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "EmployeeDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmployeeDocument"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
