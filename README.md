# Nirmaan: construction ERP & site app

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
- BOQ items (with Excel import on the web) and activities with planned quantities and dates. A new project
  can start with the standard activities for its type (road, building, water supply), scheduled over its
  dates; each organisation can edit those templates.
- Onboarding: a new company signs up (when enabled), the admin invites the team by email or a shareable
  link, and anyone can reset a forgotten password.
- An approval matrix (admin): which roles approve which submission types, with optional rupee limits;
  anything above a limit goes to a higher approver.
- Site submissions from mobile or web: **daily progress** against an activity (with photos),
  **daily progress report (DPR)** with manpower, machinery, work executed, tests, safety, issues
  and next-day plan, and **material requests** with line items.
- One approval workflow for everything: submitted → approved / rejected / changes requested,
  with reviewer note and a full audit trail. Approvers see a single pending queue.
- Lists that scale: progress, DPRs, material requests, projects and users page, search and sort on the
  server, and every list (BOQ and activities too) exports to Excel with the filters on screen.
- Attendance: the site supervisor records the day's head count by contractor and trade (web or
  site app, offline too). It fills the manpower of that day's DPR and locks once the DPR is approved.
- Stock: material is received (GRN, with challan photo) against approved material requests, issued at
  site and adjusted by approvers. Stock on hand per project and item with minimum levels; falling below
  one alerts the store manager and PM. Web Stock page and project tab with Excel export, and receive /
  issue screens in the site app.
- Machinery: equipment master (owned / hired, hire rate, where deployed) and a daily log per machine
  (hours worked, idle, breakdown, hour meter, diesel) filed from the site app, offline too, and
  approved by the PM like any other submission. Web Machinery page and project tab with Excel export.
- Site expenses: bills paid at site with category, vendor GSTIN, taxable value, GST and the bill photo,
  approved by the PM; approved expenses are project cost. Totals by category and status on the web page.
- Measurement book: the QS or site engineer records measurements against a BOQ item and location as
  nos × length × breadth × depth lines with deductions; approved sheets give each BOQ item its measured
  (billable) quantity and value, shown next to executed progress on the BOQ tab. Web page, project tab and
  site-app form (offline too), Excel export one row per line.
- Project cost: approved site expenses, material issued at the item's standard rate, approved machinery logs
  at the hire rate and attendance at each trade's daily rate, against the value of approved progress (and of
  approved measurements), by project and month, with margin. For approvers and accounts.
- Progress reports: weekly, monthly or any period up to three months, from approved data (physical and
  financial progress, activities, BOQ, manpower, machinery, material, issues, next-period plan, photos),
  previewed on the web and printed or saved as PDF.
- Delay and risk register: delays (held up since, days lost, who caused it, extension of time claimed) and
  risks scored probability × impact, with owner, action and due date, closed with a note. A delay or a high
  risk alerts the PM; activities past their planned finish with no delay recorded are flagged. Web page,
  project tab with a heat map and Excel export, site-app screens (offline too), and a section in the progress report.
- Clients and contracts: a client master (department, GSTIN, state, billing address) and per project the
  agreement, contract value, completion date with the extensions of time granted in the delay register, and
  the retention, security deposit, mobilisation advance and recovery, TDS, GST TDS, labour cess and GST
  percentages bills are built with. Billing → Clients and a Contract tab on each project, for approvers, the
  QS and accounts.
- RA bills: the next running-account bill of a project from the approved measurements, with the abstract
  (previous / this bill / up to date per BOQ item, excess and extra items flagged), GST and the contract
  deductions. Approved through the approval matrix, then recorded as sent, certified (the client's cuts are kept
  against the claim) and paid. Printable bill with the measurement annex, Excel export, and approval from the site app.
- Vendors: one master of suppliers, hire agencies, subcontractors and service providers with GSTIN, MSME (Udyam)
  and bank details; expenses, machines and GRNs pick from it, and names typed elsewhere link to it.
- Purchase orders: vendor quotations on an approved material request side by side, a PO raised from the lowest
  (or any) quotation, approved through the approval matrix with limits and printed; GRNs against PO lines; vendor
  bills matched three ways against the PO and what was received, with due dates kept within 45 days for micro and
  small enterprises.
- Subcontracts: work orders on subcontractors at agreed rates per BOQ item (or their own items), their work tagged
  in the measurement book and material issued to them, and running bills with retention, advance recovery, TDS
  (194C, from the PAN) and material recovered at our rates; margin per BOQ item against the client rate; printable
  order and bill.
- Payables: payments to vendors and subcontractors against their approved bills (part payments, TDS at payment),
  a due list by due date with ageing per vendor and project, micro and small enterprise bills flagged before their
  45 days run out, and actual subcontractor bills and cash out on project cost.
- Receivables: money received against each bill with what the client deducted (TDS, GST TDS, retention, deposit,
  cess), part payments, retention and deposit releases, ageing per project and client, the retention due date,
  a dashboard tile, and billed value and cash in on project cost.
- Edit and resubmit: a rejected or changes-requested entry is fixed in place (web drawer or site app)
  and sent back for approval with the reviewer's note shown alongside the form.
- Dashboards: company (projects, contract value, pending approvals, delayed activities, DPRs
  today) and project (physical progress weighted by BOQ value, BOQ executed amount, activity
  status, recent submissions).
- Offline entry on the site app: progress, DPR, material requests and attendance filed without signal are kept
  in an outbox on the phone (photos included) and sent automatically when the connection returns.
  Retries never create duplicates because each entry carries its own id from the phone.
- Notifications: the author is told when a submission is approved, rejected or sent back, and
  approvers when something new is waiting. In-app on web and mobile (bell + list), Expo push to
  registered phones, a daily "DPR not submitted" reminder to site staff and a daily email digest of
  pending approvals. See [Notifications](#notifications) below.

**Live demo**: web ERP at https://construction-erp-web-pradeep15.vercel.app, API at
https://construction-erp-api-pradeep15.vercel.app/api (Swagger at `/api/docs`), database on Neon.
See `docs/DEPLOY.md` for how it is hosted, `docs/ARCHITECTURE.md` for the data model and `docs/TESTING.md` for the tests and the phone checklist.

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
| qs@demo.com | Quantity Surveyor | road + building projects, records measurements |
| store@demo.com, procurement@demo.com, qaqc@demo.com, accounts@demo.com, hr@demo.com | other roles | as per role |

Suggested demo flow: log in to the mobile app as `engineer@demo.com`, submit a progress entry
with a photo and today's DPR; log in to the web as `pm@demo.com`, open Approvals, approve them,
and watch the project dashboard and BOQ executed quantities update. Then, still as `engineer@demo.com`, open
"My submissions": the seed includes one progress entry with changes requested and one rejected
material request; tap "Edit and resubmit", fix them and send them back to the PM's queue.

## Notifications

| Event | Who | Channels |
|-------|-----|----------|
| Submission approved / rejected / changes requested | the author | in-app, push |
| Submission submitted | approvers who can see the project | in-app, push |
| Delay recorded, or a risk scored 15+ raised | the project's approvers and the owner | in-app, push |
| Daily "DPR not submitted" reminder (for active projects with no DPR today) | Site Engineers and Team Leaders who are project members (the PM if none) | in-app, push |
| Daily digest of pending approvals | Admin, Management and Project Managers with something waiting | in-app, push, email |

- API: `GET /api/notifications` (list + unread count), `POST /api/notifications/:id/read`,
  `POST /api/notifications/read-all`, `POST`/`DELETE /api/notifications/push-tokens`.
- The two daily jobs are `GET /api/notifications/jobs/dpr-reminder` and
  `GET /api/notifications/jobs/approval-digest`, protected by `CRON_SECRET`
  (`Authorization: Bearer <secret>`). On Vercel they are scheduled in `apps/api/vercel.json`
  (09:00 and 17:00 IST); elsewhere set `NOTIFICATION_JOBS_INPROCESS=true` or call them from any
  scheduler. Both are idempotent per day. `?date=YYYY-MM-DD` runs a job for another day.
- Email goes through the Cogitrex mail service (`communication.cogitrex.com`, sending from
  `notifications@cogitrex.com`) when `MAIL_API_KEY` is set, or through [Resend](https://resend.com) when
  `RESEND_API_KEY` is set (`EMAIL_FROM` is the sender, `WEB_URL` the link in the mail); without a key the
  digest is only logged.
- Push uses the Expo push service and needs no key by default (`EXPO_ACCESS_TOKEN` is optional).
  The phone registers its Expo token after sign-in. Remote push requires a development or EAS build
  with `extra.eas.projectId` in `apps/mobile/app.json` (run `eas init`); Expo Go on Android cannot
  receive push, and the in-app list still works everywhere.
- All variables are listed in `.env.example` and `docs/DEPLOY.md`.

## Useful commands

```bash
pnpm typecheck                 # all packages
pnpm build                     # all packages
pnpm db:reset                  # drop, migrate and re-seed
pnpm --filter @erp/api prisma studio
```

## Not in the MVP (next phases)

See `docs/ROADMAP.md` (v3): receivables, purchase orders,
subcontractor bills, payables, the Tally export, quality, people and reach.
