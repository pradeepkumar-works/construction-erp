-- Budget versions, made safe for the code before them (it reads ProjectBudget while a deploy rolls out): the preparer
-- stays in the column "updatedById" (the schema's preparedById maps to it), and the versions with no cost-head budget
-- that 20271108090000 made for projects with only BOQ budget rates are taken out. Their rates stay on the BOQ items,
-- which the forecast reads, and a project's first revision starts from them.

ALTER TABLE "ProjectBudget" DROP CONSTRAINT "ProjectBudget_preparedById_fkey";
ALTER TABLE "ProjectBudget" RENAME COLUMN "preparedById" TO "updatedById";
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DELETE FROM "ProjectBudget" pb
WHERE pb."versionNo" = 1 AND pb."status" = 'APPROVED' AND pb."expenses" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ProjectBudget" o WHERE o."projectId" = pb."projectId" AND o."id" <> pb."id");
