-- Liquidated damages terms on the contract (v4 item 50). Additive: new enum and columns with defaults.
CREATE TYPE "LdPeriod" AS ENUM ('DAY', 'WEEK', 'MONTH');

ALTER TABLE "Project" ADD COLUMN "ldRatePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN "ldPeriod" "LdPeriod" NOT NULL DEFAULT 'WEEK',
ADD COLUMN "ldCapPct" DECIMAL(5,2) NOT NULL DEFAULT 10;
