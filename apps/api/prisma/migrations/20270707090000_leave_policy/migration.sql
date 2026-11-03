-- Leave policy per company (HR audit, fix 4): days a year by type, earned leave carried forward, pro rata for joiners.
ALTER TABLE "PayrollSettings" ADD COLUMN "casualLeaveDays" DECIMAL(4,1) NOT NULL DEFAULT 12;
ALTER TABLE "PayrollSettings" ADD COLUMN "sickLeaveDays" DECIMAL(4,1) NOT NULL DEFAULT 12;
ALTER TABLE "PayrollSettings" ADD COLUMN "earnedLeaveDays" DECIMAL(4,1) NOT NULL DEFAULT 15;
ALTER TABLE "PayrollSettings" ADD COLUMN "earnedCarryMax" DECIMAL(4,1) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollSettings" ADD COLUMN "leaveProRata" BOOLEAN NOT NULL DEFAULT false;
