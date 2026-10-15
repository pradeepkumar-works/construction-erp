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
16. ~~**Postgres row-level security** as the second tenant guard.~~ Done: every table with `organizationId`
    (and `Organization` itself) has a `tenant_isolation` policy, forced for the table owner. The API sets
    `app.org_id` for each query of a signed-in request (`PrismaService`, transaction-local), so a query that
    forgets its organisation filter still cannot read or write another organisation's rows. Without a
    signed-in user (sign-in, sign-up, public file links, scheduled jobs, the seed, migrations) nothing is
    set and the policies let everything through. `GET /api/health` reports `tenantGuard`
    (`enforced`, `bypassed` when the database role skips row-level security, or `off`). `TENANT_RLS=off`
    is the kill switch; `prisma/rls-rollback.sql` removes the policies. Follow-up: an `erp_runtime` role (no
    `BYPASSRLS`, created by a migration) for the API to connect as, with migrations and the seed on the owner
    connection in `MIGRATE_DATABASE_URL`, so the guard is enforced on Neon too.

## v3 – make money move through Nirmaan

v2 records what happened on site and what it cost at standard rates; nothing is billed, bought or paid
through it yet. v3 builds each money flow on data v2 already captures and ends it in a Tally voucher. Order:
A, then B, then C; D to F after; G alongside (33 first, the store listings need the privacy page). Sizes are
relative to a v2 item (S about one, M about two, L about three). The full draft with the open questions is
[Nirmaan v3 roadmap (draft)](https://claude.ai/code/artifact/750a4e2d-379f-42f1-8d5d-9206495467b6).

### A. Get paid
17. ~~**Contracts and clients** (S). `Client` master (name, GSTIN, billing address, department); per project the
    agreement number and date, contract value, extensions granted (from the delay register), retention %,
    security deposit, mobilisation advance and recovery %, defect liability months, price variation flag.~~
    Done: `Client` master (department, GSTIN with state code and PAN taken from it, billing address, contact) on a
    Billing → Clients page; per project the agreement, value and dates, and the retention, security deposit,
    advance recovery, TDS, GST TDS, labour cess and GST percentages bills use, edited on a Contract tab. A delay
    records the days of extension granted (`eotGrantedDays`), which move the contract's completion date.
18. ~~**RA bills** (L). Bill N per project from approved measurements: per BOQ item up to previous / this bill /
    up to date quantity and amount, quantities beyond the BOQ flagged as deviation or extra item, deductions
    (retention, advance recovery, TDS, labour cess, security deposit) and GST as per-project settings. A seventh
    submission type (`BILL`) through the lifecycle and the approval matrix, then sent → certified (client's
    certified quantity per item) → paid. Abstract + measurement print view; measurements lock once billed.~~
    Done: `RaBill` takes the approved measurements up to a date that no earlier bill took, with the abstract per
    BOQ item, GST and the contract deductions (advance recovery capped at the advance outstanding, plus an "other"
    deduction); one open bill per project; `BILL` in the lifecycle and approval matrix (seed: management any amount,
    PM up to ₹50 lakh); then sent → certified (quantity cuts re-price the bill, keep the claim and come back in the
    next bill) → paid. Billing → RA Bills, a project tab, the print view with measurement annex, Excel export and a
    read-and-approve screen in the site app.
19. ~~**Receivables** (M). Receipts against certified bills (amount, date, UTR, deductions actually made), ageing
    per client and project, retention held and its release date, a dashboard tile, cash in on the cost view.~~
    Done: `Receipt` against a bill sent to the client (part payments, with the deductions the client actually made),
    or a retention / security deposit release against the project; a bill is paid once its receipts settle work +
    GST. Billing → Receivables with ageing from the date sent, per project and client, open bills, retention and
    deposit held with the retention due date (revised completion + defect liability), TDS deducted, and the receipts
    register; "Record payment" on the bill; a dashboard tile; billed value and cash in on the cost view.

### B. Pay others
20. ~~**Vendors** (S). One master for suppliers, hire agencies and subcontractors (GSTIN, PAN, bank, MSME Udyam
    number); expenses, equipment and POs pick from it instead of free text.~~
    Done: `Vendor` with kinds (supplier, hire agency, subcontractor, labour contractor, services), GSTIN / PAN / state,
    contact, MSME category and Udyam number, bank account (shown only to admin, management, procurement and
    accounts). Expenses, machines and GRNs link to it: picked from suggestions on the web, and a name typed anywhere
    (site app included) links to the vendor of that name. A "Not in the master" list shows names typed that match
    no vendor, with "Add to master". POs (item 21) will pick from it too.
21. ~~**Purchase orders** (L). Material request → quotes → comparative statement → PO (approval matrix with
    limits) → GRN against PO lines → vendor bill with a three-way match. Screens for `PROCUREMENT_MANAGER`.
    `Item.rate` becomes the last PO rate.~~
    Done: quotations on an approved material request and the comparative (lowest landed rate marked), "Raise PO"
    from a quotation or without one, PO numbering, freight, payment days (45 at most for micro and small vendors),
    print view, approval through the matrix (demo: PM up to ₹5 lakh, management without limit), close short. GRNs
    against PO lines (web and site app); ordering beyond what the request still needs is refused. Vendor bills
    against a PO with the three-way match (quantity received and not yet billed, PO rate, GST, freight); exceptions
    are flagged for the approver rather than blocking. Approving a PO sets `Item.rate`. Approval of POs and bills
    from the site app.
22. ~~**Subcontractor work orders and bills** (L). Work order with rates per BOQ item or own items; their work in
    the measurement book with a contractor field; their RA bill with retention, advance and material-issued
    recovery and TDS; attendance contractors linked to the vendor master; margin per BOQ item.~~
    Done: work orders (BOQ items or own items; GST, retention, advance, TDS and payment terms; approval through the
    matrix, print, close). Measurements and material issues are tagged to an open order on the web and in the site
    app; the same measurement still counts for the client's RA bill. Running bills take the approved tagged
    measurements and unrecovered issues up to a date, recover material at `Item.rate`, cap advance recovery at
    what is outstanding, and keep one open bill per order. TDS defaults from the PAN (1% individual or HUF, else 2%).
    Attendance contractor names link to the vendor master. Margin per BOQ item on the project's Subcontracts tab.
23. ~~**Payables** (M). Payments against approved bills, ageing, due list, micro and small enterprise bills
    flagged as they near 45 days; the cost view uses actual bills where they exist.~~
    Done: payments against approved vendor and subcontractor bills (part payments, TDS and other deductions at
    payment, ₹1 tolerance), a due list with ageing by days past due, per vendor and project, MSME bills flagged 7 days
    before the due date. Project cost gains a subcontractors head from approved bills (replacing the material they
    were charged for and their gangs' attendance), vendor bills and cash out.

### C. Accounts bridge
24. ~~**Tally export** (M). Monthly Tally XML of RA bills, vendor and subcontractor bills, approved expenses,
    receipts and payments; ledger mapping screen; vouchers marked exported so none goes twice. Tally stays the
    books; no general ledger in Nirmaan.~~
    Done: TallyPrime XML (the open question's recommendation) of certified RA bills (sales), receipts with the
    client's deductions, vendor bills (purchase), subcontractor bills (journal), vendor payments and site expenses,
    up to a month end; a ledger screen with default names, the company and GST state, projects as cost centres, and
    a ledger masters file to import once. Each record goes once; exported receipts and payments are locked until the
    export is undone. Receipts against a bill not yet certified wait for the certificate.
25. ~~**GST registers** (S). Outward supplies from RA bills (GSTR-1 layout) and input tax from vendor bills and
    expenses for GSTR-2B reconciliation, as Excel. E-invoicing only when a customer must, through a GSP.~~
    Done: Billing → GST Registers for a range of months: approved RA bills as B2B or B2CS supplies with the HSN (SAC
    9954) summary, input tax from vendor bills (per rate), subcontractor bills and site expenses with claimable and
    not claimable apart, output less input tax, and one Excel workbook with the GSTR-1 offline tool's b2b, b2cs and
    hsn sheets plus the input register in the GSTR-2B layout. No e-invoicing yet.

### D. Quality and documents
26. ~~**Inspections** (M). Inspection request from site per activity and location, passed or failed by
    `QA_QC_ENGINEER` against a checklist template with photos; reuses the submission lifecycle (pass =
    approved, fail = rejected, re-inspect = changes requested); optional hold points on progress.~~
    Done: Site → Inspections and the site app. Site requests an inspection of an activity at a location with photos;
    QA/QC marks each checklist point OK / Not OK / N/A and passes, fails or asks for re-inspection. Organisation
    checklists (eight standard ones to start from), a default checklist per activity, and hold points: a hold-point
    activity's progress is approved only after a passed inspection at that location.
27. ~~**Tests and NCRs** (M). Tests with result against specification (concrete cubes with 7 and 28-day
    reminders, compaction, others); non-conformance reports with cause, corrective action and closure.~~
    Done: Site → Quality (Tests and NCRs tabs) and Tests & NCRs in the site app. Cubes get 7 and 28-day readings,
    reminded when due; the last reading decides pass or fail against the specification. QA/QC raises an NCR (from a
    failed test or inspection), site records the cause and corrective action, QA/QC closes or reopens it.
28. ~~**Document register** (M). Drawings and documents with revision and status, current revision only (and
    offline) on the site app, transmittals, numbered letters in and out linked to delays.~~
    Done: Site → Documents (Register, Transmittals, Letters) and a project tab. Each revision carries its status and
    files; the latest issued is current and a revision good for construction notifies the project. Transmittals list
    revisions with copies, print a cover sheet and record who signed for them. Letters in and out are numbered, answer
    each other and link to a delay (shown on the delay). Site app: Drawings, current revisions only, saved offline.

### E. People
29. ~~**Staff and leave** (M). Staff master separate from contractor labour, staff attendance from the site app,
    leave approved by `HR_MANAGER` or the project manager, holidays per site.~~
    Done: People → Staff & Leave and My attendance & leave / Staff register in the site app. Employees (with or
    without a login) are posted at a site or head office; they check in and out themselves or the site in-charge marks
    the register. Leave (casual 12, sick 12, earned 15 a year, comp-off for off days worked, unpaid) skips Sundays and
    holidays, is checked against the balance and decided by HR or the site's project manager, never the employee.
30. ~~**Payroll inputs** (S). Monthly days present, leave and overtime per employee for the payroll provider,
    and a monthly summary per labour contractor. No statutory payroll calculations.~~
    Done: People → Payroll Inputs. Staff: days on the rolls, Sundays and holidays, present, leave by type, absent,
    days not marked, comp-off earned, overtime, loss of pay and paid days, exported to Excel. Labour contractors: man-days
    by project and trade from the attendance register at the daily rates, marking contractors paid through work orders.

### F. Reach
31. ~~**WhatsApp and SMS** (M). Approval requests, send-backs, DPR reminders and invite links through the
    WhatsApp Business Platform (Meta-approved templates), SMS fallback (DLT registration); channels per user.~~
    Done: each user switches WhatsApp and SMS on for their own number (web Notifications, app Profile) and can send a
    test. Approval requests, send-backs and the DPR reminder go on WhatsApp, falling back to SMS; invites go to the
    number the admin enters; every message is in a log for management. WhatsApp goes through WATI (Meta's Cloud API
    is the alternative), which also carries the morning approvals digest, test-due and payments-due reminders. Sending
    starts once the WATI and MSG91 (DLT) keys are set (docs/DEPLOY.md); until then messages are logged as not set up.
32. ~~**Client and consultant portal** (M). Guest login for the client's engineer or PMC on their projects:
    approved progress, DPRs, reports, certify RA bills, attend inspections. Access only through
    `project-access.service.ts` and `permissions.ts`.~~
    Done: two guest roles (Client's Engineer, Consultant / PMC) the admin invites and puts on projects like anyone
    else. They sign in on the web and land in the portal: approved progress by activity, approved DPRs, the progress
    report, RA bills once sent (certify with cuts, which tells the QS and bill approvers) and inspections (record that
    they attended, with remarks). They are told when a bill is sent or an inspection requested. Every other route
    refuses them, and the site app sends them to the web.

### G. Running Nirmaan as a business
33. ~~**Data export and privacy** (S). Full company export (Excel per module, photos zipped), company deletion on
    request, `/privacy` page.~~
    Done: Admin > Data & Privacy downloads one zip with an Excel file per table and every stored file, built in the
    browser and recorded in the audit log. An admin can ask for the company to be deleted: after 30 days (cancellable,
    every admin emailed, a banner on every page meanwhile) the daily job erases all its rows and files. The demo
    company is protected. A public `/privacy` page says what is kept, where and who sees it.
34. ~~**Plans and billing** (M). Trial, plans by active projects or users, Razorpay subscriptions with GST
    invoices; an unpaid company goes read-only, never deleted.~~
    Done, switched off until configured: a free trial (30 days), then a monthly price per active project (or per user,
    `BILLING_UNIT`), paid a month or a year ahead (a year charges ten months) through Razorpay Checkout, with a numbered
    GST tax invoice per payment. When the trial or paid period ends the company is read-only (402 on writes, banner
    for everyone, entries wait on the phone); nothing is deleted. Admins are emailed 7 days and 1 day before. Staff
    can move a trial's end from the console. Prepaid periods rather than auto-debit: UPI autopay mandates add caps and
    failed-debit handling, so auto-renewal can follow once there are paying customers.
35. ~~**Platform admin** (S). Console for Nirmaan staff (companies, users, activity, storage, plan, suspend);
    read-only support access only with consent, written to the audit log.~~
    Done: staff (emails in `PLATFORM_ADMIN_EMAILS`) get a console listing every company with users, projects, last
    activity, storage and status, and can suspend a company (nobody in it can sign in) or lift it. A company admin can
    allow support for 7 days under Data & Privacy; staff then open the company read-only for 2 hours, with a banner and
    an Exit, and every visit, consent and suspension shows in the company's log. Plan is added with item 34.

Not in v3: a general ledger, statutory payroll, tendering, critical-path scheduling, BIM.

## v4 – close the gaps against the reference documents

From the coverage check against the client's design spreadsheet, proposal and the Nway brochure (15 Oct 2026). A
full HR setup is out of scope by decision: no salary master, payroll run, payslips, HR letters, exit and settlement or
statutory payroll; Staff & Leave and Payroll Inputs stay as they are. Migrations stay additive, because Vercel
preview deployments run them against the production database before a PR is merged.

36. ~~**Dashboard tiles** (S). Vendor payable, this month's expense and billing, and financial progress on the
    company dashboard.~~
    Done: a second row of finance tiles for the roles that may see each figure. Receivables and vendor payable
    (overdue in red); this month's cost across all heads with site expenses beside it (cost viewers); RA bills
    approved this month before GST, and financial progress as approved RA bills to date against the contract value
    of the projects that have one (bill viewers).
37. ~~**Variation register** (M). Variations with client reference and approval; approved variations add up to a
    revised contract value; extra items are billed only once approved.~~
    Done: Billing → Variations and a project tab. A variation lists quantity changes on BOQ items and new items with
    proposed rates; it is sent to the client and the client's decision is recorded with their reference, per item
    quantity and rate. Approval updates the BOQ (revised quantities, new items) and the revised contract value on the
    contract, projects and dashboard. Extra items with no BOQ quantity stay out of RA bills until then, and the bill
    says which were held back.
38. ~~**Budget, forecast and cash flow** (M). Budget per BOQ item, budget against actual and forecast to complete,
    cash-flow forecast from bills due, receivables and payables.~~
    Done: a Budget & Cash Flow tab on each project and a Cash flow tab on Project Cost. The budget is set by cost head
    and as a budgeted cost per unit on BOQ items (planned margin per item); the tab shows budget, actual, earned and
    variance per head, and the forecast at completion and forecast margin. The cash-flow forecast covers six months or
    twelve weeks: unpaid RA bills, retention releases and work still to bill coming in; unpaid vendor bills and the
    cost still to spend going out. The client's payment days are a contract term.
39. ~~**Stores round-out** (M). Site-to-site transfers, returns to vendor and from site, stock count sheet, valuation
    and ageing.~~
    Done: from the Stock tab's More menu a store can transfer material to another project (it shows as on the way
    until the other store receives it), take back unused material from site (off the project's material cost),
    return material to the supplier, and run a stock count (blank sheet to print, counted quantities posted as one
    adjustment). A Value & ageing tab values stock at item rates and shows how long it has sat in the store.
40. ~~**Safety** (M). Incidents and near misses, toolbox talks, permits to work, from the phone.~~
    Done: a Safety page, project tab and phone screen. Site staff report an incident or near miss (with photos,
    offline too), record toolbox talks and ask for a permit to work with the standard precautions for the kind of
    work. A new Safety Officer role is told of each, closes incidents with the root cause and corrective action, and
    issues or rejects permits; the summary counts days without a lost-time injury.
41. ~~**Sector progress views** (L). Road chainage strip chart, building floor by activity matrix, water supply
    village-wise laid and tested.~~
    Done: progress entries and measurements take a chainage from and to, a floor or a village, picked from the
    project's sector settings. A project tab (Chainage, Floors, or Villages & Pipeline) and a phone screen show a strip
    chart of each road layer along the stretch, a floor by activity matrix, and for water supply pipe ordered,
    supplied, laid and tested with a village by village table.
42. ~~**Machinery maintenance and vehicle documents** (M). Service schedule, breakdown work orders, spares, expiry
    alerts, drivers.~~
    Done: job cards for services and breakdowns (reported from the phone), spares issued from the project store
    against them, a service schedule by working hours or days that a closed service restarts, insurance, fitness,
    permit, PUC, road tax and RC with renewals, and drivers with their licence. A daily alert tells admins and the
    store team of services falling due and papers or licences expiring within 30 days.
43. ~~**Gantt and baseline** (M). Gantt with milestones and a frozen baseline.~~
    Done: a Gantt tab per project (weeks or months) with the plan filled to progress, the frozen baseline under it,
    milestones and today; milestones with due, baseline and achieved dates; freezing or replacing the baseline by
    the project's managers, with each activity's and milestone's slip against it. Dependencies and critical path
    later.
44. ~~**Named worker register** (M). Workers per labour contractor, attendance per worker, output per man-day.~~
    Done: workers by name per labour contractor with trade, skill, ID (Aadhaar as its last four digits) and wage; a
    daily roll call per site (present, half day, absent, in and out, overtime, activity) on the web and the site app
    that keeps the day's head count in step; a monthly muster with wages per worker and contractor; and output per
    man-day against approved progress. No PF or ESI.
45. **Site imprest** (S). Petty cash float, balance and top-ups.
46. **Guarantees, insurance and licences register** (S) with expiry reminders.
47. **Handover and defects** (M). Snag list, completion certificate, defect log, close-out checklist.
48. **Small items** (S each). QA/QC acceptance on a GRN, procurement status report, unit master, financial-year
    filters.
49. **Hindi on the phone app** (M).
50. **Delay penalties and escalation** (S + M). Liquidated damages exposure, then price variation on RA bills.

## Definition of done for every item
Prisma migration, API endpoints with Swagger, shared types, web screen, mobile screen where site
staff use it, seed data updated, `pnpm typecheck` + `next build` + mobile `tsc` clean, smoke test
updated if the API contract changed, README / ARCHITECTURE updated.
