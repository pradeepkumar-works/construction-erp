#!/usr/bin/env sh
# Vercel build for the API (Root Directory = apps/api; install runs at the monorepo root).
set -e
pnpm --filter @erp/shared build
npx prisma generate
# Migrations and the seed run as the database owner. MIGRATE_DATABASE_URL is that connection when DATABASE_URL
# is the API's runtime role (erp_runtime, which row-level security applies to); unset = DATABASE_URL for both.
OWNER_URL="${MIGRATE_DATABASE_URL:-$DATABASE_URL}"
DATABASE_URL="$OWNER_URL" npx prisma migrate deploy
if [ "$SEED_ON_BUILD" = "true" ]; then
  echo "SEED_ON_BUILD=true: seeding demo data (idempotent)"
  DATABASE_URL="$OWNER_URL" npx tsx prisma/seed.ts
fi
pnpm build
