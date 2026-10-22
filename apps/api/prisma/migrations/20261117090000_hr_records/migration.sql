-- HR records (v6 item 99): the full employee master, service events with their letters, employee documents. Additive only.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'PROBATION', 'CONTRACT', 'TRAINEE', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "EmployeeEventType" AS ENUM ('JOINED', 'CONFIRMED', 'TRANSFERRED', 'PROMOTED', 'INCREMENT', 'WARNING', 'RESIGNED', 'TERMINATED', 'RETIRED');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "employeeId" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "aadhaarLast4" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "bankIfsc" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "confirmedOn" DATE,
ADD COLUMN     "ctcAnnual" DECIMAL(18,2),
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "esiNumber" TEXT,
ADD COLUMN     "exitReason" TEXT,
ADD COLUMN     "fatherOrSpouseName" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "noticeDays" INTEGER,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "pfNumber" TEXT,
ADD COLUMN     "probationEndsOn" DATE,
ADD COLUMN     "reportingToId" TEXT,
ADD COLUMN     "uan" TEXT;

-- CreateTable
CREATE TABLE "EmployeeEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmployeeEventType" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "letterNo" TEXT NOT NULL,
    "fromProjectId" TEXT,
    "toProjectId" TEXT,
    "fromDesignation" TEXT,
    "toDesignation" TEXT,
    "fromDepartment" TEXT,
    "toDepartment" TEXT,
    "fromCtc" DECIMAL(18,2),
    "toCtc" DECIMAL(18,2),
    "noticeGivenOn" DATE,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeEvent_organizationId_type_effectiveDate_idx" ON "EmployeeEvent"("organizationId", "type", "effectiveDate");

-- CreateIndex
CREATE INDEX "EmployeeEvent_employeeId_effectiveDate_idx" ON "EmployeeEvent"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeEvent_organizationId_letterNo_key" ON "EmployeeEvent"("organizationId", "letterNo");

-- CreateIndex
CREATE INDEX "Attachment_employeeId_idx" ON "Attachment"("employeeId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reportingToId_fkey" FOREIGN KEY ("reportingToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEvent" ADD CONSTRAINT "EmployeeEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEvent" ADD CONSTRAINT "EmployeeEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEvent" ADD CONSTRAINT "EmployeeEvent_fromProjectId_fkey" FOREIGN KEY ("fromProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEvent" ADD CONSTRAINT "EmployeeEvent_toProjectId_fkey" FOREIGN KEY ("toProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEvent" ADD CONSTRAINT "EmployeeEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "EmployeeEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmployeeEvent"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
