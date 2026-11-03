-- The department menu is the standard (ARCHITECTURE "Menu and names"): every company opens on the department modules,
-- and a new one starts there. A company can still choose the work-area set in Admin › Menu and names.
ALTER TABLE "Organization" ALTER COLUMN "navModuleSet" SET DEFAULT 'DEPARTMENTS';
UPDATE "Organization" SET "navModuleSet" = 'DEPARTMENTS' WHERE "navModuleSet" = 'AREAS';
