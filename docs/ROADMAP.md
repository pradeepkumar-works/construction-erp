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
6. ~~**Material receipt and stock**: GRN against an approved material request, issue to site, stock
   balance per project and item, minimum-stock alerts. Tables: `Item` master, `StockTxn`.~~ Done:
   `Item` master, `StockEntry` (a GRN, issue slip or adjustment, numbered GRN- / ISS- / ADJ-) with signed
   `StockTxn` lines, and `StockMinLevel` per project and item. A GRN can take up to what is still pending
   on each line of an approved request; an issue up to the stock on hand. Approvers enter opening stock
   and count corrections as adjustments and can delete a wrong entry. Falling below the minimum notifies
   the project's store managers and PM (`LOW_STOCK`). Web Stock page and project tab (stock on hand,
   register, item master, Excel export); site-app Stock, Receive and Issue screens (online only).
7. ~~**Machinery log**: equipment master, daily hours / idle / diesel / breakdown from mobile; goes
   through the approval lifecycle.~~ Done: `Equipment` master (code, owned / hired, hire agency, rate per
   hour / day / month, where it is deployed) and `MachineryLog`, a fourth submission type (`MACHINERY`)
   with hours worked / idle / breakdown (at most 24 a day), hour meter, diesel, operator, activity and
   photos. One log per machine per day unless rejected. Approvals queue, notifications and audit trail as
   for the other types. Web Machinery page and project tab (logs, equipment, Excel export); site-app form
   that also works offline. Rates are shown to approvers only and feed the cost view (item 10).
8. ~~**Site expenses**: category, amount, GST, receipt photo, approval; posts to project cost.~~ Done:
   `Expense` (numbered EXP-<year>-0001) with category, vendor and GSTIN, bill number, taxable value, GST
   rate and amount (typed GST accepted within ₹1 of the rate), payment mode and bill photos. Fifth
   submission type (`EXPENSE`) in the shared lifecycle. `GET /expenses/summary` gives totals by status
   and category; approved expenses are what the cost view counts. Web Site Expenses page and project tab
   with totals and Excel export; site-app form with bill photo that also works offline.
9. ~~**Measurement book**: measurements by BOQ item and location with dimensions; rollup to executed
   quantity (replaces or complements activity progress for billing).~~ Done: `MeasurementSheet` (numbered
   MB-<year>-0001) per BOQ item and location with `MeasurementLine` rows of nos × L × B × D and deductions,
   a sixth submission type (`MEASUREMENT`). Approved sheets roll up to `measuredQty` / `measuredAmount` on
   each BOQ item, next to the activity-progress executed quantity, so billing can use measured work while
   site progress stays as it is. Web Measurement Book page and project tab with a line editor and Excel
   export, Measured column on the BOQ tab; site-app form that also works offline.

### C. Management value
10. ~~**Project cost view**: expenses + material issued + machinery + labour vs BOQ executed value.~~ Done:
    `GET /cost/projects` (every visible project) and `/cost/projects/:id` (cost heads by month, breakdowns by
    expense category, item, machine and trade) for a period. Cost = approved site expenses + material issued
    × the item master's standard rate (new `Item.rate`) + approved machinery logs × hire rate + attendance
    man-days × the trade's daily rate (new `LabourRate` table). Executed value = approved progress × BOQ rate,
    with approved measurements alongside; margin and cost %. Anything without a rate is counted and flagged.
    Web Project Cost page (period presets, Excel export, labour rates editor) and project Cost tab, for
    approvers and accounts.
11. ~~**Weekly / monthly progress report** PDF from approved data, in the client's format.~~ Done:
    `GET /reports/progress?projectId&from&to` (up to 92 days) builds the report from approved progress, DPRs,
    machinery logs and measurements plus attendance and the store register: physical progress at the start
    and end of the period against time elapsed, value executed and measured, activity and BOQ tables,
    manpower, machinery, material, issues and safety from DPRs, next-period plan, photos and signature
    blocks. Web Progress Reports page (weekly / monthly / custom, live A4 preview) prints to PDF from the
    browser, like the DPR print view. The layout is a common Indian public-works format; a client's own
    template can replace `progressReportHtml.ts` once we have it.
12. ~~**Delay and risk register**.~~ Done: `Risk` (numbered RISK-<year>-0001) is either a delay (held up
    since / resumed on, days lost, caused by client / contractor / third party / force majeure, EOT claimed)
    or a risk (probability × impact, 1 to 5 each), with category, activity, owner, mitigation, due date and
    open / monitoring / closed with a closure note. A delay or a risk scored 15+ notifies the PM. Activities
    past their planned finish with no delay recorded are suggested. Web Delays & Risks page and project tab
    (summary, 5 × 5 heat map, Excel export), a Delays and risks section in the progress report, and site-app
    screens that raise entries offline too.

### D. Product / SaaS foundations
13. ~~**Activity templates per project type** (Road / Building / Water Supply) applied at project creation.~~
    Done: built-in standard lists (10 road, 12 building, 8 water-supply activities with unit, start day and
    duration) that an organisation can replace per type (`ActivityTemplate`, admin and management, Activity
    Templates page with a schedule bar, reset to standard). "Add the standard activities" on the new-project
    form, and "Add from template" on a project's Activities tab for existing projects, schedule them over the
    project dates (stretched or squeezed to fit) and skip names the project already has. Planned quantities
    start at 0 for the planner to fill in or link to BOQ items.
14. ~~**Configurable approval matrix** with amount limits (table-driven, replaces fixed role rules).~~
    Done: `ApprovalRule` (role, submission type, optional rupee limit) edited by the admin on the Approval
    Rules page. Limits apply to progress (quantity at BOQ rate), site expenses (bill total with GST),
    measurements (quantity at BOQ rate) and machinery logs (day cost at hire rate); anything above a limit
    leaves that approver's queue and goes to a role with a higher or no limit. Admin always approves
    everything. An organisation without rules keeps the old fixed rule. The queue, review endpoint, new-
    submission notifications and the daily digest all follow the matrix; `/auth/me` returns the user's
    rights for the clients. The demo seeds a matrix (project managers approve site expenses up to ₹25,000,
    accounts approves any expense). Editing before approval, deleting stock entries and risks stay with
    the fixed approver roles.
15. ~~**Organisation onboarding**: create org, invite users by email, default roles; password reset.~~
    Done: `/signup` creates an organisation with all 11 standard roles and its first admin (only when the API
    has `ORG_SIGNUP=open`; activity templates and the approval rule start as the built-in defaults).
    Admins add users with an invite instead of a password: a one-time set-password link (`PasswordToken`,
    only its SHA-256 stored, 7 days) is emailed through Resend and also shown to the admin to share by
    WhatsApp or SMS when email is not set up; users show "Invited" until they choose a password. Forgot
    password on web and mobile emails a 2-hour reset link; an admin can also send a fresh link from the
    Users page. An email can belong to one user across all organisations, since sign-in is by email.
16. **Postgres row-level security** as the second tenant guard.

## v3 – commercial and back office
Procurement (indent → RFQ → comparative → PO → vendor bill), RA billing from the measurement book,
receivables / payables with Tally export, HR and leave, payroll export, QA/QC inspections and tests,
document register with revisions, WhatsApp / SMS alerts.

## Definition of done for every item
Prisma migration, API endpoints with Swagger, shared types, web screen, mobile screen where site
staff use it, seed data updated, `pnpm typecheck` + `next build` + mobile `tsc` clean, smoke test
updated if the API contract changed, README / ARCHITECTURE updated.
