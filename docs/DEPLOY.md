# Deployment

Current demo deployment (October 2026):

| Piece | Where | URL / id |
|-------|-------|----------|
| Database | Neon Postgres 16, Singapore (`aws-ap-southeast-1`) | project `construction-erp` (`lucky-wind-88524683`), database `construction_erp` |
| API | Vercel project `construction-erp-api` (NestJS preset, region `sin1`) | https://construction-erp-api-pradeep15.vercel.app/api (docs at `/api/docs`) |
| Web ERP | Vercel project `construction-erp-web` (Next.js) | https://construction-erp-web-pradeep15.vercel.app |
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
| `CRON_SECRET` | long random string; Vercel Cron sends it as `Authorization: Bearer` to the daily notification jobs. Jobs are disabled when unset. |
| `NOTIFICATION_TIMEZONE` | IANA zone for "today" in the DPR reminder and digest (default `Asia/Kolkata`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | email through Resend: approval digest, user invites and password resets. Unset = nothing is emailed (the digest is logged; invite links are shown to the admin to share; "Forgot password" tells users to ask their admin). `EMAIL_FROM` must be a verified sender/domain in Resend. |
| `WEB_URL` | web ERP URL used for links in emails (digest, invites, password resets). Password-reset emails need it (or `CORS_ORIGINS`). |
| `TENANT_RLS` | `off` stops the API setting the organisation for Postgres row-level security (kill switch; the policies then allow everything). Unset = on. `GET /api/health` shows `tenantGuard`: `enforced`, `off`, or `bypassed` when the database role has BYPASSRLS or is a superuser (then connect with a role without it). To remove the policies: `psql "$DATABASE_URL" -f apps/api/prisma/rls-rollback.sql`. |
| `ORG_SIGNUP` | `open` lets new companies create an organisation at `/signup`; unset = closed |
| `EXPO_ACCESS_TOKEN` | optional; only if push security is enforced on the Expo project |
| `NOTIFICATION_JOBS_INPROCESS`, `DPR_REMINDER_TIME`, `APPROVAL_DIGEST_TIME` | run the jobs from a timer inside the API (Docker / Railway) instead of Vercel Cron; times are `HH:mm` in `NOTIFICATION_TIMEZONE` |
| `PUSH_DISABLED`, `EMAIL_DISABLED` | `true` switches a channel off (useful on preview deployments) |

Web (`apps/web`): `NEXT_PUBLIC_API_URL`, e.g. `https://construction-erp-api-pradeep15.vercel.app/api`.

Mobile (`apps/mobile`): `EXPO_PUBLIC_API_URL`, same value. For push notifications the app needs an
EAS project id (`eas init` writes `extra.eas.projectId` into `app.json`) and a development or
production build; Expo Go on Android cannot receive remote push.

## How a deploy works

- **API on Vercel**: root directory `apps/api`; `apps/api/vercel.json` runs `vercel-build.sh`, which
  builds `packages/shared`, runs `prisma generate`, `prisma migrate deploy` (applies any new migration
  in `apps/api/prisma/migrations`), optionally seeds, then `nest build`. Vercel serves `dist/main.js`
  as a function.
- **Scheduled jobs on Vercel**: `apps/api/vercel.json` declares two crons, `03:30 UTC` (09:00 IST)
  for the approvals digest and `11:30 UTC` (17:00 IST) for the DPR reminder. Vercel calls
  `GET /api/notifications/jobs/...` with `Authorization: Bearer $CRON_SECRET`; set `CRON_SECRET` in
  the project's environment variables (Hobby plans allow once-a-day schedules, which these are).
  Run a job by hand with `curl -H "Authorization: Bearer $CRON_SECRET" $API_URL/notifications/jobs/dpr-reminder`.
- **Web on Vercel**: root directory `apps/web`; build command builds `packages/shared` then `next build`.
- **Git auto-deploy**: both Vercel projects are linked to `pradeepkumar-works/construction-erp`.
  Every push to the production branch (`claude/modest-brown-emrt4b` today; change it in each
  project's Settings → Git when you adopt `main`) builds and deploys automatically. Other branches
  get preview deployments.

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
