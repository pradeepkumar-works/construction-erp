-- Attendance extras (v5 item 97): GPS check-in, on-duty and tour leave, overtime approval. Additive only.
ALTER TYPE "LeaveType" ADD VALUE 'ON_DUTY';
ALTER TYPE "LeaveType" ADD VALUE 'TOUR';
ALTER TYPE "NotificationType" ADD VALUE 'OVERTIME';

CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Project" ADD COLUMN "siteLat" DECIMAL(9,6),
ADD COLUMN "siteLng" DECIMAL(9,6),
ADD COLUMN "siteRadiusM" INTEGER,
ADD COLUMN "siteCheckInStrict" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StaffAttendance" ADD COLUMN "checkInLat" DECIMAL(9,6),
ADD COLUMN "checkInLng" DECIMAL(9,6),
ADD COLUMN "checkInAccuracyM" INTEGER,
ADD COLUMN "checkInDistanceM" INTEGER,
ADD COLUMN "checkInInside" BOOLEAN,
ADD COLUMN "overtimeStatus" "OvertimeStatus",
ADD COLUMN "overtimeDecidedById" TEXT,
ADD COLUMN "overtimeDecidedAt" TIMESTAMP(3),
ADD COLUMN "overtimeNote" TEXT;

ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_overtimeDecidedById_fkey" FOREIGN KEY ("overtimeDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Overtime recorded before approval existed was already paid on that basis.
UPDATE "StaffAttendance" SET "overtimeStatus" = 'APPROVED' WHERE "overtimeHours" > 0;
