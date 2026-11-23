#!/usr/bin/env sh
# Vercel build for the API (Root Directory = apps/api; install runs at the monorepo root).
set -e
pnpm --filter @erp/shared build
npx prisma generate
# Migrations and the seed run as the database owner. MIGRATE_DATABASE_URL is that connection when DATABASE_URL
# is the API's runtime role (erp_runtime, which row-level security applies to); unset = DATABASE_URL for both.
OWNER_URL="${MIGRATE_DATABASE_URL:-$DATABASE_URL}"
# A preview build never changes the database: previews have shared the production database before, and three
# migrations of unmerged PRs (#39, #237, #313) reached it that way. Migrations and the seed run on the production
# deploy only. A preview with a database of its own (a Neon branch) sets MIGRATE_ON_PREVIEW=true.
if [ "$VERCEL_ENV" = "preview" ] && [ "$MIGRATE_ON_PREVIEW" != "true" ]; then
  echo "Preview build: migrations and the seed are left to the production deploy (MIGRATE_ON_PREVIEW=true to run them)"
else
  # A preview of the client portal PR (#39) tried a renamed copy of an applied migration and left it failed, which blocks
  # every later deploy (P3009). Marking that attempt rolled back is a no-op once done, and on a database without it.
  DATABASE_URL="$OWNER_URL" npx prisma migrate resolve --rolled-back 20261015180000_client_portal > /dev/null 2>&1 || true
  # The same for a renamed copy of contract obligations (#237), whose first name 20270510090000 the database already has.
  DATABASE_URL="$OWNER_URL" npx prisma migrate resolve --rolled-back 20270517090000_contract_obligations > /dev/null 2>&1 || true
  # And for the drawing migrations of #313: a preview applied them as 20270711090000/090100 before they were renamed to
  # 20270713090000/090100, so the renamed review stages failed on columns it already had. Both now run again safely.
  DATABASE_URL="$OWNER_URL" npx prisma migrate resolve --rolled-back 20270713090000_drawing_review_stages > /dev/null 2>&1 || true
  DATABASE_URL="$OWNER_URL" npx prisma migrate deploy
  if [ "$SEED_ON_BUILD" = "true" ]; then
    echo "SEED_ON_BUILD=true: seeding demo data (idempotent)"
    DATABASE_URL="$OWNER_URL" npx tsx prisma/seed.ts
  elif [ "$SEED_TOWN_ON_BUILD" = "true" ]; then
    echo "SEED_TOWN_ON_BUILD=true: adding only the Devgarh demo project (idempotent)"
    DATABASE_URL="$OWNER_URL" npx tsx prisma/seed-town.ts
  elif [ "$SEED_MODULES_ON_BUILD" = "true" ]; then
    echo "SEED_MODULES_ON_BUILD=true: adding what each module's demo data is missing (idempotent, users and passwords kept)"
    # Demo data only: a failed top-up held every API deploy from #355 to #360 while the web went ahead, so it warns instead.
    DATABASE_URL="$OWNER_URL" npx tsx prisma/seed.ts --modules || echo "WARNING: the module seed failed (above); deploying the API without it"
  elif [ "$SEED_GROUP_ON_BUILD" = "true" ]; then
    echo "SEED_GROUP_ON_BUILD=true: adding only the demo group's companies (idempotent)"
    DATABASE_URL="$OWNER_URL" npx tsx prisma/seed-companies.ts
  fi
fi
pnpm build
