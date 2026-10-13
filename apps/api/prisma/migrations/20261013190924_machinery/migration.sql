-- CreateEnum
CREATE TYPE "EquipmentOwnership" AS ENUM ('OWNED', 'HIRED');

-- CreateEnum
CREATE TYPE "EquipmentRateUnit" AS ENUM ('HOUR', 'DAY', 'MONTH');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "machineryLogId" TEXT;

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "ownership" "EquipmentOwnership" NOT NULL DEFAULT 'OWNED',
    "supplier" TEXT,
    "registrationNo" TEXT,
    "rate" DECIMAL(18,2),
    "rateUnit" "EquipmentRateUnit" NOT NULL DEFAULT 'HOUR',
    "projectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineryLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hoursWorked" DECIMAL(18,2) NOT NULL,
    "idleHours" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "breakdownHours" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dieselLitres" DECIMAL(18,3),
    "meterStart" DECIMAL(18,2),
    "meterEnd" DECIMAL(18,2),
    "operatorName" TEXT,
    "activityId" TEXT,
    "workDone" TEXT,
    "breakdownNote" TEXT,
    "remarks" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_organizationId_projectId_idx" ON "Equipment"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_organizationId_code_key" ON "Equipment"("organizationId", "code");

-- CreateIndex
CREATE INDEX "MachineryLog_projectId_status_idx" ON "MachineryLog"("projectId", "status");

-- CreateIndex
CREATE INDEX "MachineryLog_equipmentId_date_idx" ON "MachineryLog"("equipmentId", "date");

-- CreateIndex
CREATE INDEX "MachineryLog_organizationId_status_idx" ON "MachineryLog"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryLog" ADD CONSTRAINT "MachineryLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryLog" ADD CONSTRAINT "MachineryLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryLog" ADD CONSTRAINT "MachineryLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryLog" ADD CONSTRAINT "MachineryLog_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryLog" ADD CONSTRAINT "MachineryLog_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryLog" ADD CONSTRAINT "MachineryLog_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_machineryLogId_fkey" FOREIGN KEY ("machineryLogId") REFERENCES "MachineryLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
