# Build context must be the repository root (monorepo): docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# Install only what the API and its workspace dependencies need
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN CI=true pnpm install --frozen-lockfile --filter @erp/api...

# Build shared package and the API
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @erp/shared build && pnpm --filter @erp/api build

ENV NODE_ENV=production
ENV PORT=4000
ENV UPLOAD_DIR=/app/uploads
RUN mkdir -p /app/uploads
EXPOSE 4000
WORKDIR /app/apps/api
# Apply pending migrations (as the owner in MIGRATE_DATABASE_URL when set), then start
CMD ["sh", "-c", "DATABASE_URL=\"${MIGRATE_DATABASE_URL:-$DATABASE_URL}\" npx prisma migrate deploy && node dist/main.js"]
