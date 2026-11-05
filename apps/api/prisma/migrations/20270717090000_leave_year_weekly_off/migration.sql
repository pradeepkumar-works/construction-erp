-- Leave year (January or April start) and the staff weekly off, for the company and per site.
ALTER TABLE "PayrollSettings" ADD COLUMN "leaveYearStart" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PayrollSettings" ADD COLUMN "weeklyOff" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN "weeklyOff" INTEGER;
