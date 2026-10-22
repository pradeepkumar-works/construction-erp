-- Module switches (v6 item 117): the modules a company does not use, and the plan's module set.
CREATE TYPE "ModuleTier" AS ENUM ('ESSENTIALS', 'BUSINESS', 'ENTERPRISE');

ALTER TABLE "Organization" ADD COLUMN "modulesOff" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Organization" ADD COLUMN "moduleTier" "ModuleTier";
