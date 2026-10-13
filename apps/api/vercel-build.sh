#!/usr/bin/env sh
# Vercel build for the API (Root Directory = apps/api; install runs at the monorepo root).
set -e
pnpm --filter @erp/shared build
npx prisma generate
npx prisma migrate deploy
if [ "$SEED_ON_BUILD" = "true" ]; then
  echo "SEED_ON_BUILD=true: seeding demo data (idempotent)"
  npx tsx prisma/seed.ts
fi
pnpm build
