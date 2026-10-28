-- Menu and names: where a company's menu sits, the top bar's look, how pages are grouped into modules, its own module
-- names, and a person's own look. Every company keeps the sidebar it had until an admin changes it.
CREATE TYPE "NavLayout" AS ENUM ('SIDEBAR', 'TOP_BAR');
CREATE TYPE "NavLook" AS ENUM ('NAVY', 'FRAME', 'BAR');
CREATE TYPE "NavModuleSet" AS ENUM ('AREAS', 'DEPARTMENTS');

ALTER TABLE "Organization" ADD COLUMN "navLayout" "NavLayout" NOT NULL DEFAULT 'SIDEBAR';
ALTER TABLE "Organization" ADD COLUMN "navLook" "NavLook" NOT NULL DEFAULT 'NAVY';
ALTER TABLE "Organization" ADD COLUMN "navModuleSet" "NavModuleSet" NOT NULL DEFAULT 'AREAS';
ALTER TABLE "Organization" ADD COLUMN "navNames" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Organization" ADD COLUMN "navPersonalLook" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "navLook" "NavLook";
