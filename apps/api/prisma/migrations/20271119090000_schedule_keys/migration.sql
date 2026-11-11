-- The schedule file's own row id on activities and milestones, so a re-import finds them even where names repeat.
ALTER TABLE "Activity" ADD COLUMN "scheduleKey" TEXT;
ALTER TABLE "Milestone" ADD COLUMN "scheduleKey" TEXT;
CREATE UNIQUE INDEX "Activity_projectId_scheduleKey_key" ON "Activity"("projectId", "scheduleKey");
CREATE UNIQUE INDEX "Milestone_projectId_scheduleKey_key" ON "Milestone"("projectId", "scheduleKey");
