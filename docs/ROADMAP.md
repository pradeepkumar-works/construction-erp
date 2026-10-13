# Roadmap

## v1 (done) – MVP for the first client demo

Login and roles, projects, BOQ with Excel import, activities, daily progress with photos, DPR with
print view, material requests, one approval workflow with audit trail, company and project
dashboards, web ERP and site mobile app, hosted on Vercel + Neon.

## v2 – close the site-to-office loop

Order matters: each item builds on the previous one.

### A. Finish what v1 started
1. ~~**Edit and resubmit** a submission after REJECTED / CHANGES_REQUESTED (web + mobile).~~ Done:
   `PATCH` + `submit: true` on one record, `RESUBMITTED` audit action, edit button on web tables and
   drawers and on the mobile detail screens, demo seed includes one entry of each.
2. **Notifications** (done): in-app + Expo push on approve / reject / changes requested and on new
   submissions for approvers; daily "DPR not submitted" reminder; email digest of pending approvals.
   `Notification` and `PushToken` tables, jobs via Vercel Cron.
3. ~~**Offline entry on mobile**: local queue (SQLite) for progress, DPR, material request; sync on
   reconnect. API: client-generated ids + idempotency on create.~~ Done: optional `id` on the three
   create endpoints (a repeat returns the existing entry), SQLite outbox with photos copied to the
   app's documents folder, automatic sync on reconnect / app foreground, Outbox screen with retry and
   discard, last-loaded projects, activities and lists cached on the phone.
4. ~~**Server-side paging, search and sort** on all list endpoints (`Paginated<T>` already in shared);
   Excel export of each list.~~ Done: progress, DPR, material requests, projects and users return
   `Paginated<T>` with `page`, `pageSize`, `q`, `sortBy`, `sortOrder`; web tables page, search and sort
   on the server; every list (plus BOQ and activities) exports all matching rows to Excel; the site
   app's My Submissions searches on the server and loads more as you scroll. BOQ and activities stay
   whole-project arrays because forms and progress weighting need every row.
5. ~~**Attendance by supervisor**: daily worker count by category and contractor per project;
   feeds DPR manpower automatically.~~ Done: `AttendanceSheet` (one per project per day) with
   `AttendanceLine` rows of contractor, trade and head count; web register (page + project tab, Excel
   export one row per contractor and trade) and a site-app screen that also works offline through the
   outbox. A new DPR takes its manpower from that day's sheet (filled in the forms, and on the server
   when a DPR arrives without manpower). The sheet locks once the day's DPR is approved. It is a
   register, not an approval submission: the DPR it feeds is what gets approved.

### B. Phase 2 modules (from the client proposal)
6. **Material receipt and stock**: GRN against an approved material request, issue to site, stock
   balance per project and item, minimum-stock alerts. Tables: `Item` master, `StockTxn`.
7. **Machinery log**: equipment master, daily hours / idle / diesel / breakdown from mobile; goes
   through the approval lifecycle.
8. **Site expenses**: category, amount, GST, receipt photo, approval; posts to project cost.
9. **Measurement book**: measurements by BOQ item and location with dimensions; rollup to executed
   quantity (replaces or complements activity progress for billing).

### C. Management value
10. **Project cost view**: expenses + material issued + machinery + labour vs BOQ executed value.
11. **Weekly / monthly progress report** PDF from approved data, in the client's format.
12. **Delay and risk register**.

### D. Product / SaaS foundations
13. **Activity templates per project type** (Road / Building / Water Supply) applied at project creation.
14. **Configurable approval matrix** with amount limits (table-driven, replaces fixed role rules).
15. **Organisation onboarding**: create org, invite users by email, default roles; password reset.
16. **Postgres row-level security** as the second tenant guard.

## v3 – commercial and back office
Procurement (indent → RFQ → comparative → PO → vendor bill), RA billing from the measurement book,
receivables / payables with Tally export, HR and leave, payroll export, QA/QC inspections and tests,
document register with revisions, WhatsApp / SMS alerts.

## Definition of done for every item
Prisma migration, API endpoints with Swagger, shared types, web screen, mobile screen where site
staff use it, seed data updated, `pnpm typecheck` + `next build` + mobile `tsc` clean, smoke test
updated if the API contract changed, README / ARCHITECTURE updated.
