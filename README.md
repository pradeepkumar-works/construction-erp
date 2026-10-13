# Construction ERP & Site Mobile App

MVP of a construction ERP for road, building and water-supply contractors, with a role-based
mobile app for site staff. Built multi-tenant from day one so it can be offered to several
contractors after the first client is live.

| App | Path | Stack | Port |
|-----|------|-------|------|
| API | `apps/api` | NestJS 11, Prisma 6, PostgreSQL 16 | 4000 |
| Web ERP | `apps/web` | Next.js 15, React 19, Ant Design 6 | 3000 |
| Site mobile app | `apps/mobile` | Expo SDK 57, React Native, expo-router | Expo Go |
| Shared | `packages/shared` | Enums, labels, permissions, API types | - |

## What the MVP does

- Login with JWT; one organisation; a role per user (Admin, Management, Project Manager,
  Team Leader, Site Engineer, Store Manager, QS, Procurement, QA/QC, Accounts, HR).
- Projects of type Road / Building / Water Supply with client, consultant, dates, contract value,
  project manager and team members. Non-company-wide roles see only projects they belong to.
- BOQ items (with Excel import on the web) and activities with planned quantities and dates.
- Site submissions from mobile or web: **daily progress** against an activity (with photos),
  **daily progress report (DPR)** with manpower, machinery, work executed, tests, safety, issues
  and next-day plan, and **material requests** with line items.
- One approval workflow for everything: submitted → approved / rejected / changes requested,
  with reviewer note and a full audit trail. Approvers see a single pending queue.
- Dashboards: company (projects, contract value, pending approvals, delayed activities, DPRs
  today) and project (physical progress weighted by BOQ value, BOQ executed amount, activity
  status, recent submissions).

**Live demo**: web ERP at https://construction-erp-web-pradeep15.vercel.app, API at
https://construction-erp-api-pradeep15.vercel.app/api (Swagger at `/api/docs`), database on Neon.
See `docs/DEPLOY.md` for how it is hosted and `docs/ARCHITECTURE.md` for the data model.

## Run it locally

Prerequisites: Node 22, pnpm 10, PostgreSQL 16 (or Docker).

```bash
pnpm install
cp .env.example apps/api/.env          # edit DATABASE_URL if needed
docker compose up -d postgres          # or point DATABASE_URL at your own Postgres
pnpm --filter @erp/shared build
pnpm db:migrate                        # creates the schema
pnpm db:seed                           # demo organisation, users, three projects
pnpm dev:api                           # http://localhost:4000/api, docs at /api/docs
pnpm dev:web                           # http://localhost:3000
pnpm dev:mobile                        # Expo dev server; scan the QR with Expo Go
```

For the mobile app on a real phone, set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000/api`
(for example in `apps/mobile/.env`) so the phone can reach the API.

## Demo accounts

All passwords are `password123`.

| Email | Role | Sees |
|-------|------|------|
| admin@demo.com | Admin | everything, manages users |
| md@demo.com | Management | all projects, approves |
| pm@demo.com | Project Manager | road + water projects, approves |
| pm2@demo.com | Project Manager | building project, approves |
| engineer@demo.com | Site Engineer | road + water projects, submits |
| engineer2@demo.com | Site Engineer | building + water projects, submits |
| tl@demo.com | Team Leader | road + water projects |
| store@demo.com, qs@demo.com, procurement@demo.com, qaqc@demo.com, accounts@demo.com, hr@demo.com | other roles | as per role |

Suggested demo flow: log in to the mobile app as `engineer@demo.com`, submit a progress entry
with a photo and today's DPR; log in to the web as `pm@demo.com`, open Approvals, approve them,
and watch the project dashboard and BOQ executed quantities update.

## Useful commands

```bash
pnpm typecheck                 # all packages
pnpm build                     # all packages
pnpm db:reset                  # drop, migrate and re-seed
pnpm --filter @erp/api prisma studio
```

## Not in the MVP (next phases)

Procurement (indent → RFQ → PO), store/GRN and stock, attendance and payroll, machinery logs,
measurement book and RA billing, finance, HR, quality registers, offline mode, push notifications,
Excel/PDF report exports beyond the DPR print view, and tenant self-signup/billing.
