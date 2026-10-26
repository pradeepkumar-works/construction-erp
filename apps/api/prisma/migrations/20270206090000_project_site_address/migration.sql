-- Where deliveries go on a project (finding 12 of the October review): a purchase order with no delivery
-- address of its own takes this, so the store is not left guessing. Falls back to the project's location.
ALTER TABLE "Project" ADD COLUMN "siteAddress" TEXT;
