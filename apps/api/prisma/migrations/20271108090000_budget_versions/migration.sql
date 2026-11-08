-- A project's budget is approved and revised (ARCHITECTURE "Budget and cash flow"): one ProjectBudget row per version,
-- the BOQ budget rates of each version in ProjectBudgetLine. Each budget already set becomes version 1, approved by
-- whoever last set it; BoqItem.budgetRate stays as the approved figure. Only additions the code before versions still
-- reads past (its column keeps its name, no version without cost heads is made), so a deploy can roll out after it.

CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED', 'SUPERSEDED');

DROP INDEX "ProjectBudget_organizationId_idx";
DROP INDEX "ProjectBudget_projectId_key";

ALTER TABLE "ProjectBudget"
ADD COLUMN     "versionNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "reasonCode" TEXT,
ADD COLUMN     "reasonNote" TEXT,
ADD COLUMN     "variationId" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decisionNote" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ALTER COLUMN "expenses" DROP NOT NULL,
ALTER COLUMN "expenses" DROP DEFAULT,
ALTER COLUMN "material" DROP NOT NULL,
ALTER COLUMN "material" DROP DEFAULT,
ALTER COLUMN "machinery" DROP NOT NULL,
ALTER COLUMN "machinery" DROP DEFAULT,
ALTER COLUMN "labour" DROP NOT NULL,
ALTER COLUMN "labour" DROP DEFAULT,
ALTER COLUMN "subcontract" DROP NOT NULL,
ALTER COLUMN "subcontract" DROP DEFAULT;

UPDATE "ProjectBudget"
SET "status" = 'APPROVED', "submittedAt" = "updatedAt", "decidedById" = "updatedById", "decidedAt" = "updatedAt", "approvedAt" = "updatedAt";

ALTER TABLE "ProjectBudget" ALTER COLUMN "versionNo" DROP DEFAULT;

-- A version has a cost-head budget or none: the five heads are all set or all null.
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_heads_all_or_none" CHECK (
  ("expenses" IS NULL AND "material" IS NULL AND "machinery" IS NULL AND "labour" IS NULL AND "subcontract" IS NULL)
  OR ("expenses" IS NOT NULL AND "material" IS NOT NULL AND "machinery" IS NOT NULL AND "labour" IS NOT NULL AND "subcontract" IS NOT NULL)
);

CREATE TABLE "ProjectBudgetLine" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "budgetRate" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ProjectBudgetLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectBudgetLine_boqItemId_idx" ON "ProjectBudgetLine"("boqItemId");
CREATE UNIQUE INDEX "ProjectBudgetLine_budgetId_boqItemId_key" ON "ProjectBudgetLine"("budgetId", "boqItemId");
CREATE INDEX "ProjectBudget_organizationId_status_idx" ON "ProjectBudget"("organizationId", "status");
CREATE UNIQUE INDEX "ProjectBudget_projectId_versionNo_key" ON "ProjectBudget"("projectId", "versionNo");
-- At most one version of a project is still being prepared or waits for a decision.
CREATE UNIQUE INDEX "ProjectBudget_one_open_per_project" ON "ProjectBudget"("projectId") WHERE "status" IN ('DRAFT', 'SUBMITTED', 'RETURNED');

ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectBudgetLine" ADD CONSTRAINT "ProjectBudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "ProjectBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBudgetLine" ADD CONSTRAINT "ProjectBudgetLine_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Each project's BOQ budget rates are the lines of its version 1.
INSERT INTO "ProjectBudgetLine" ("id", "budgetId", "boqItemId", "budgetRate")
SELECT gen_random_uuid()::text, pb."id", b."id", b."budgetRate"
FROM "BoqItem" b
JOIN "ProjectBudget" pb ON pb."projectId" = b."projectId" AND pb."versionNo" = 1
WHERE b."budgetRate" IS NOT NULL;
