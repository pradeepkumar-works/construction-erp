-- Menu and names: how the sidebar sits and the menu's colours (a curated palette, or the company's own fill).
CREATE TYPE "NavSidebarLook" AS ENUM ('RAIL', 'HEADER', 'FLOATING');

CREATE TYPE "NavPalette" AS ENUM ('QUIET', 'NAVY', 'GRAPHITE', 'FOREST', 'PLUM', 'SAND', 'SKY', 'DUSK', 'OCEAN', 'EMBER', 'MIDNIGHT', 'DAWN', 'CUSTOM');

ALTER TABLE "Organization" ADD COLUMN "navSidebarLook" "NavSidebarLook" NOT NULL DEFAULT 'RAIL',
ADD COLUMN "navPalette" "NavPalette" NOT NULL DEFAULT 'QUIET',
ADD COLUMN "navFill" JSONB;
