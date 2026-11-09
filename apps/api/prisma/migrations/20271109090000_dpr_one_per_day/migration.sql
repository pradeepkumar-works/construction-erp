-- One DPR per site per day (review M7). The service checks first; this holds it when two phones file at the same
-- moment. A rejected DPR may be replaced, so it is left out. Additive: an index only, and production had no two
-- such DPRs on 2026-11-09.
CREATE UNIQUE INDEX "DailyReport_one_per_project_day" ON "DailyReport"("projectId", "date") WHERE "status" <> 'REJECTED';
