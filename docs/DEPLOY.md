# Deployment

Current demo deployment (October 2026):

| Piece | Where | URL / id |
|-------|-------|----------|
| Database | Neon Postgres 16, Singapore (`aws-ap-southeast-1`) | project `construction-erp` (`lucky-wind-88524683`), database `construction_erp` |
| API | Vercel project `construction-erp-api` (NestJS preset, region `sin1`) | https://construction-erp-api.vercel.app/api (docs at `/api/docs`) |
| Web ERP | Vercel project `construction-erp-web` (Next.js) | https://construction-erp-web.vercel.app |
| Mobile | Expo Go / EAS build, pointed at the API URL above | not hosted |
| Photos | stored in Postgres (`Attachment.data`) because Vercel functions have no disk | switch to Vercel Blob by setting `BLOB_READ_WRITE_TOKEN` |

Railway was the first choice for the API (Dockerfile and `railway.json` are in `apps/api`) but the
Railway account's trial has expired; the API runs on Vercel instead until a Railway plan is chosen.

## Environment variables

API (`apps/api`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (Neon direct, non-pooled host) |
| `JWT_SECRET` | long random string; rotate to log everyone out |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `STORAGE_MODE` | `db` on serverless hosts; unset = local disk; `BLOB_READ_WRITE_TOKEN` set = Vercel Blob |
| `SEED_ON_BUILD` | `true` runs the demo seed during the Vercel build (idempotent: refreshes users, never duplicates projects). Set to `false` once real client data exists. |
| `CORS_ORIGINS` | optional comma-separated allow-list of browser origins; unset = any origin |
| `UPLOAD_DIR` | disk mode only |

Web (`apps/web`): `NEXT_PUBLIC_API_URL`, e.g. `https://construction-erp-api.vercel.app/api`.

Mobile (`apps/mobile`): `EXPO_PUBLIC_API_URL`, same value.

## How a deploy works

- **API on Vercel**: root directory `apps/api`; `apps/api/vercel.json` runs `vercel-build.sh`, which
  builds `packages/shared`, runs `prisma generate`, `prisma migrate deploy` (applies any new migration
  in `apps/api/prisma/migrations`), optionally seeds, then `nest build`. Vercel serves `dist/main.js`
  as a function.
- **Web on Vercel**: root directory `apps/web`; build command builds `packages/shared` then `next build`.
- **Git auto-deploy**: the Vercel projects were created without a Git link because the Vercel GitHub
  App does not yet have access to this repository. To enable deploy-on-push: on GitHub go to
  Settings → Applications → Vercel → Repository access and add `construction-erp`, then in each Vercel
  project's Settings → Git connect `pradeepkumar-works/construction-erp` with the matching root
  directory and production branch. Until then, redeploy by running `vercel deploy --prod` from
  `apps/api` or `apps/web` with the Vercel CLI, or ask for a redeploy.

## Database

- Schema is managed by Prisma migrations in `apps/api/prisma/migrations`. Never edit the Neon schema
  by hand; add a migration locally (`pnpm db:migrate`) and deploy.
- Neon's free tier scales the compute to zero when idle; the first request after a pause takes a
  second or two. Fine for a demo.
- Take a Neon snapshot or branch before loading real client data.

## Moving the API to Railway later

1. Choose a Railway plan, create a project and a service from the GitHub repo with Dockerfile path
   `apps/api/Dockerfile` (build context is the repo root).
2. Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`; attach a volume at `/app/uploads` or set
   `BLOB_READ_WRITE_TOKEN` / keep `STORAGE_MODE=db`.
3. Generate a domain, then point `NEXT_PUBLIC_API_URL` (Vercel web) and `EXPO_PUBLIC_API_URL`
   (mobile) at it.
