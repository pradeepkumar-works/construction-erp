-- Demo clock (ARCHITECTURE "Demo clock"): the day a demo company's records were last dated to. The daily job moves its
-- dates forward by the days since, so the demo stops reading late as it ages. Only demo companies have one.
ALTER TABLE "Organization" ADD COLUMN "demoDatedOn" DATE;

-- The live demo (code DEMO) and the companies of its group were dated when they were seeded: the demo's latest daily
-- report is its "today" then. A customer's company keeps null and is never moved.
UPDATE "Organization" o
   SET "demoDatedOn" = LEAST(CURRENT_DATE, (SELECT MAX(d."date") FROM "DailyReport" d JOIN "Organization" demo ON demo."id" = d."organizationId" WHERE demo."code" = 'DEMO'))
 WHERE o."code" = 'DEMO'
    OR o."groupId" IS NOT NULL AND o."groupId" = (SELECT g."groupId" FROM "Organization" g WHERE g."code" = 'DEMO');
