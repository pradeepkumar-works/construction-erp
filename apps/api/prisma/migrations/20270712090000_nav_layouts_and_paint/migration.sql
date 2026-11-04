-- Menu and names: three more layouts (modules on the top bar and sub-modules in the sidebar, two top bars, two sidebars)
-- and which of a layout's parts take the menu's colours. The "Sidebar and header" look was the sidebar layout with both
-- parts in colour, so it becomes that paint.
ALTER TYPE "NavLayout" ADD VALUE 'TOP_AND_SIDE';
ALTER TYPE "NavLayout" ADD VALUE 'TWO_BARS';
ALTER TYPE "NavLayout" ADD VALUE 'TWO_SIDEBARS';

CREATE TYPE "NavPaint" AS ENUM ('SIDE', 'TOP', 'BOTH', 'NONE');

ALTER TABLE "Organization" ADD COLUMN "navPaint" "NavPaint" NOT NULL DEFAULT 'SIDE';

UPDATE "Organization" SET "navPaint" = 'BOTH' WHERE "navSidebarLook" = 'HEADER';

ALTER TYPE "NavSidebarLook" RENAME TO "NavSidebarLook_old";
CREATE TYPE "NavSidebarLook" AS ENUM ('RAIL', 'FLOATING');
ALTER TABLE "Organization" ALTER COLUMN "navSidebarLook" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "navSidebarLook" TYPE "NavSidebarLook"
  USING (CASE WHEN "navSidebarLook"::text = 'HEADER' THEN 'RAIL' ELSE "navSidebarLook"::text END)::"NavSidebarLook";
ALTER TABLE "Organization" ALTER COLUMN "navSidebarLook" SET DEFAULT 'RAIL';
DROP TYPE "NavSidebarLook_old";

-- The palettes follow the taste guide: no violet, no rust. Plum becomes Oxblood and Ember becomes Walnut, so a company
-- that chose one keeps the nearest colour.
ALTER TYPE "NavPalette" RENAME VALUE 'PLUM' TO 'OXBLOOD';
ALTER TYPE "NavPalette" RENAME VALUE 'EMBER' TO 'WALNUT';

-- Lagoon: Pradeep's deep-sea teal, across the bar through three stops.
ALTER TYPE "NavPalette" ADD VALUE 'LAGOON';
