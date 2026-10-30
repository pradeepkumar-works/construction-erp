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
   when a DPR arrives without manpower). The sheet locks once payroll for its month is approved (it used to lock with the day's DPR). It is a
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
45. ~~**Site imprest** (S). Petty cash float, balance and top-ups.~~
    Done: a petty cash float per site in-charge and project, the cash in hand after their cash expenses (with turned
    down bills shown as cash to account for), top-ups asked for from the phone or the web and paid by accounts,
    cash returned, and a cash ledger with a running balance.
46. ~~**Guarantees, insurance and licences register** (S) with expiry reminders.~~
    Done: bank guarantees (with margin money and claim period), EMDs, insurance policies and licences, company-wide
    or per project, with scans; renewals that keep the earlier periods; release and invocation; totals of money tied
    up; and reminders 30 days before expiry and on expiry.
47. ~~**Handover and defects** (M). Snag list, completion certificate, defect log, close-out checklist.~~
    Done: snags before handover and defects in the defect liability period, reported with photos from the phone or
    web, put right by our team or a subcontractor and accepted by QA/QC; the completion certificate, which starts
    the DLP and marks the project completed; retention and deposit still with the client; a close-out checklist;
    reminders as the DLP ends and when snags pass their due date.
48. ~~**Small items** (S each). QA/QC acceptance on a GRN, procurement status report, unit master, financial-year
    filters.~~
    Done: QA/QC (or an approver) accepts, partly accepts or rejects material on a GRN from the register, with the
    rejected quantity per line and what was wrong; the register filters GRNs awaiting QA/QC. Purchase Orders has a
    Delivery status tab: approved orders with what has arrived and what is still to come, late ones flagged, a vendor
    summary and Excel export. A unit master (Stock → Units) feeds every unit field, and date filters offer this
    month, last month and the last three financial years.
49. ~~**Hindi on the phone app** (M).~~
    Done: every screen of the site app in Hindi, picked under Profile > Language (English stays the default on every
    phone). Shared labels, statuses and the standard permit precautions and toolbox topics are translated too; data
    and server messages stay as entered. Other Indian languages can follow the same files.
50. ~~**Delay penalties and escalation** (S + M).~~
    Done: liquidated damages exposure per project from the contract's rate, period and cap and the delay register (days
    late after extensions granted, to date and forecast, excusable days not yet granted), on the Contract tab and a
    Liquidated damages tab on Delays & Risks. Price variation on RA bills: the contract's formula (components with a
    share of the work value and a base index), this month's indices on each bill, and GST and deductions on work value
    plus price variation.
51. ~~**Product tour** (S).~~
    Done: an antd Tour over the web app's shell (pages, search, approvals, notifications, account) the first time
    someone signs in on a browser, and again from the account menu (Take the tour). The repo carries the antd MCP
    server and llms.txt references for working on the web app.
52. ~~**Material reconciliation** (M). Norms per BOQ item, theoretical against issued, wastage flags.~~
    Done: the QS sets norms (store item per unit of a BOQ item, with the wastage allowed) on a Reconciliation tab under
    Materials. For any period, approved progress × norms gives the theoretical consumption, checked against issues less
    returns from site; items over their allowance (with the excess valued at item rates for cost viewers) or more than
    5% below theoretical are flagged, items issued with no norm are listed, and it all exports to Excel. Demo: the
    hospital project has cement over, steel within and bricks below.
53. ~~**PPE register** (M). PPE issued to named workers, replacements, recovery, missing PPE, from the phone.~~
    Done: a PPE tab in Safety and an Issue PPE screen on the phone (offline, in Hindi). Each project sets the kit every
    worker must have; issuing kit to workers sets a replace-by date from the kind's usual life and marks any older
    one replaced. The register shows who lacks what, who is on site today without it (from the roll call), what is due
    for replacement, kit still out with workers who left, and items lost or kept to recover from each contractor.
54. ~~**RFI register** (M). Requests for information with answers, ageing, and the variation or delay they lead to.~~
    Done: an RFIs tab in Documents, the client portal and the site app. Site and office engineers raise an RFI (with a
    drawing, location, photos, priority and the date the answer is needed, offline from the phone); the client's
    engineer or consultant answers in the portal, or staff record an answer from a letter. Overdue RFIs and the average
    days to answer show on the list; an answer that changes the work raises a variation or a delay linked back to it.

## v5 – close the gaps against Concord ERP

From the gap analysis against Concord's workflow diagrams, brochure and phone app (21 Oct 2026). Payroll, a general
ledger (Tally keeps the books), RMC plant production, a full supplier portal and biometric hardware stay out. Numbering
carries on after the UX items (to 89). Migrations stay additive. Design notes for each item are in the project's
`roadmap/v5-plan.md`.

90. ~~**Payment requests and advances** (M). A request to pay a bill, or an advance against a PO or work order, approved
    through the matrix (new submission type `PAYMENT_REQUEST`) before accounts pays; advances adjusted on later vendor
    bills and capping subcontract advance recovery; a company setting that makes every payment need a request.~~ Done:
    `PaymentRequest` (PR-<year>-0001) on a bill, PO or work order, capped at what is unpaid or not yet advanced, approved
    through the matrix; payments draw on it, and advances have no bill. Vendor bills adjust PO advances, subcontract
    recovery caps at what was paid, Payables shows advances not yet adjusted, Tally gets advance vouchers. Approval
    rules switch `paymentsNeedRequest` (on for new sign-ups). ARCHITECTURE "Payment requests and advances".
91. ~~**Bills without a PO** (M). Vendor bill kinds: hire bills from a hired machine's approved logs with hire terms
    (minimum hours, fuel, operator), workshop bills against job cards, other service bills; debit notes for shortage,
    excess, rejection, returns and rate difference that reduce the payable, reverse input GST and go to Tally.~~ Done:
    `VendorBill.kind` with a nullable PO; a hire bill from the month's approved logs (minimum hours, diesel recovered,
    one per machine and month), a workshop bill for closed job cards, an other bill with a cost head; exceptions and bill
    checks for each. `DebitNote` (DN-<year>-0001) on an approved vendor or subcontract bill, also from a GRN; it reduces
    the payable, GST and cost, and goes to Tally. ARCHITECTURE "Bills without a PO and debit notes".
92. ~~**Material reconciliation** (L). Resources per BOQ unit (rate analysis); theoretical against issued material per
    project and per subcontractor, with recovery on their next bill; wastage reasons on adjustments; a built-up cost
    estimate per BOQ item; a material overuse warning.~~ Done: `BoqResource` (labour and machine hours per BOQ unit) beside
    the material norms, filled by hand, from a starter library, from another BOQ item or from Excel; Reconciliation's
    Subcontractors view with `ExcessMaterialRecovery` taken off the next subcontract bill; `StockEntry.adjustmentReason`
    and a Wastage view; the Estimate view of built-up rates against the BOQ; `MATERIAL_OVERUSE` on the watch list and
    a `material_reconciliation` tool for Ask. ARCHITECTURE "Material reconciliation".
93. ~~**Fuel and fleet use** (M). Diesel issued from stock to a machine (web and phone), daily fuel position per site, a
    consumption norm per machine with alerts, availability against utilisation, tyre and battery history.~~ Done:
    `Item.isFuel` and fuel issues (`StockEntry.equipmentId`, `meterReading`) on the web and offline on the phone; the
    Fuel tab with each site's daily position; `Equipment.fuelNorm` with `FUEL_NORM` on the watch list; the Utilisation
    tab; `EquipmentPart` for tyres and batteries with their life. ARCHITECTURE "Fuel and fleet use".
94. ~~**Approval levels and escalation** (M). Up to three levels per submission type above an amount (`ApprovalStep`
    records each step, the status columns stay as they are), reminders and escalation when an entry waits, and
    Waiting with others.~~ Done: `ApprovalRule.level` and `minAmount`, `ApprovalStep` and `ApprovalEscalation`; the
    pure rules in `approval-levels.ts`; the stage on every record, the level in the Approvals inbox, the higher levels
    and escalation card on Approval rules, the hourly `jobs/approval-escalation`, and Waiting with others on Home and
    the phone. ARCHITECTURE "Approval levels and escalation".
95. ~~**Purchase small items** (S each). Stock on hand at every site on a material request line, issue or transfer first;
    the item's last five POs on the purchase forms; enquiries emailed to suppliers with a one-time link to quote.~~ Done:
    `GET /material-requests/:id/stock` and Take from stock (`MaterialRequestCover`: an issue here or a transfer from
    another site, taken off what is left to order); `GET /purchase-orders/last-rates` under the rates of the quotation,
    comparative and PO forms; `Enquiry` and `EnquiryToken` (SHA-256 only) with the public page `/quote/<token>`, whose
    answer is a quotation `fromSupplier`. ARCHITECTURE "Small purchase items".
96. ~~**Management view on the phone** (M). Company tiles for admin, management, accounts and project managers: money
    today, dues, attendance today, fuel today, purchase pipeline, approvals by module.~~ Done: `GET
    /dashboard/company-today` in `HomeService` (`seesCompanyToday`, each part behind its module's helper) and Company
    today at the top of the phone's Home, each tile's list in a sheet, kept for offline, in Hindi. ARCHITECTURE
    "Management view on the phone".
97. ~~**Attendance extras** (S + M, kept by Pradeep on 21 Oct). GPS check-in inside the site's area (new `expo-location`,
    next store build), on-duty and tour requests, overtime approval.~~ Done: a project's site location and radius (and
    whether to refuse from outside), check-in records the position and whether it was inside (`checkInPlace`), `ON_DUTY`
    and `TOUR` leave counted present and paid, overtime from check-out waits for the site manager or HR (`/staff/overtime`)
    and payroll pays approved overtime only. `expo-location` needs the next store build. ARCHITECTURE "Attendance extras".

Later, when a customer asks: ~~group companies under one login~~ (item 133), head-office overheads to projects, leads and tendering,
TDS payable summary, a terms and conditions library, scrap sale bills, client dues reminders, multi-currency.

## v6 – HR, payroll, books, RMC, supplier portal and biometrics

On 22 Oct 2026 Pradeep brought back what v5 left out: payroll and the rest of HR, a full set of accounting books, RMC
production and sales, a supplier login portal and biometric attendance devices, with module wise views (each module its
own section and home). Items 106 to 108 are the gaps found on re-checking the Concord documents, added the same day.
Migrations stay additive. Design notes for each item are in the project's `roadmap/v6-plan.md`.

98. ~~**Module home pages** (M). Every sidebar section is a module with an overview page: its figures, what waits for me,
    its lists with counts, its reports and its New actions. Each new module below gets a section and a home.~~ Done:
    `/modules/<key>` for Site, Materials and plant, Purchases, Billing and People, first in each sidebar section;
    `GET /dashboard/modules/:key` (`ModuleHomeService`) with each figure behind its list's helper, Waiting for you by type,
    the section's pages with a line each and its New actions. ARCHITECTURE "Module home pages".
99. ~~**HR records** (M). The full employee master (personal, statutory and bank details, documents), joining,
    confirmation, transfer, increment, exit with full and final settlement, HR letters, an HR dashboard.~~ Done: the staff
    record's personal, statutory, bank and terms fields (private to HR, payroll and the person), `EmployeeEvent` from
    joining to exit with letter numbers and printed letters, documents, Service records on Staff and leave, and the HR
    dashboard on the People home. Full and final settlement moves to item 100. ARCHITECTURE "HR records".
100. ~~**Payroll** (L). Salary structures, PF, ESI, professional tax and salary TDS, a monthly salary run from attendance
    approved through the matrix, payslips on the web and phone, staff loans and advances, the bank file, statutory returns.~~
    Done: dated salary structures with CTC, payroll settings (PF, ESI, PT by state, paid days, overtime), loans and
    advances, a monthly run for the company or a site (HR prepares, management approves, accounts pays) with payslips,
    arrears and bonus by hand, the NEFT bank file, the PF ECR and the ESI file, full and final settlement with gratuity
    and leave encashment, payslips on the Staff page and the phone (in Hindi). TDS quarterly returns (24Q) and Form 16
    are left for the accounts work in 102 and 103.
101. ~~**Biometric attendance** (M). A device register, the ZKTeco / eSSL push protocol (ADMS), a generic webhook and a
    punch file import; device users mapped to employees and workers; punches turned into attendance.~~
    Done: the device register with setup steps, ADMS (`/iclock`), a webhook with a key per device, CSV and Excel punch
    files, user numbers matched to employees and workers (one by one or by employee code), punches kept once and turned
    into staff and worker attendance, with what each punch did. Device commands (enrolling users from the server) are not
    sent; enrol people on the device itself.
102. ~~**Accounting books** (L). Chart of accounts, vouchers with approval, automatic postings from every module through one
    posting service (shared with the Tally export), cash, bank and day books, ledgers with projects as cost centres.~~
    Done: the posting service shared with the Tally export (now with salary runs, salary payments and loans to staff),
    the chart of accounts by Tally's groups, journal, payment, receipt and contra vouchers with approval and cancelling,
    the day book, cash and bank books and ledgers with running balances and projects as cost centres, and the Accounts
    module. Opening balances, the statements and the year close follow in 103.
103. ~~**Financial statements** (M). Opening balances, trial balance (also by project), profit and loss, balance sheet,
    bank reconciliation, financial year close and lock.~~
    Done: the day the books begin with opening balances, the trial balance by group and by project, profit and loss
    (also by project) and the balance sheet in Schedule III order beside the year before, with a line per account where
    accounts choose; bank statements imported from CSV or Excel, matched automatically or by hand, and the bank
    reconciliation statement; the lock date and closing (and reopening) a year. TDS returns (24Q, 26Q) and Form 16 are
    not built.
104. ~~**RMC production and sales** (L). A plant, mix designs, quotations and sales orders, production schedule, batch
    reports drawing the plant's stock, delivery challans, cube tests, sales bills with GST and customer receipts.~~
    Done: a plant is a project of type RMC plant; mix designs approved by quality; quotes that become orders; the plant's
    day (orders to pour, trucks by grade, the store against what is left to pour); each truck a batch and its challan
    issuing the materials from the plant's store at the design or as weighed; delivered or turned back; cubes as a quality
    test at the grade's strength; GST bills from delivered challans and money received, both posted to the books and the
    Tally export. Not built: a batching controller link (the weighed figures are typed from the printout), signatures
    on the phone, and returned concrete.
105. ~~**Supplier portal** (L). Supplier and subcontractor logins: enquiries, POs and work orders to accept, dispatch notes,
    invoices uploaded as bills to check, payments and a statement, profile and bank changes with approval.~~
    Done: logins given from Vendors with an invite link; the supplier quotes on enquiries, accepts POs and WOs, sends a
    dispatch note with each truck (the store picks it on the GRN), sends invoices with their file to the Supplier inbox
    where accounts record the bill or return it, follows each to payment, reads a statement from any date, and asks for
    changes to their details (bank changes approved only by those who pay). Not built: suppliers on the phone app, and
    e-invoice (IRN) checks on their invoices.
106. ~~**Central store** (M). Stock held at a store or yard that is not a project, with receipts, issues and transfers
    to and from sites.~~
    Done: a store is a project of type Central store or yard (no DPR, no activities), with its own GRNs, issues, counts
    and valuation; Central stores lists each with its value, low items and transfers on the way; transfers go site to
    store, store to site or store to store; a site's material request shows the store's stock, and the store's people
    send from it. Not built: bin locations inside a store, and a store-wide reorder run.
107. ~~**Site fund requests** (S). A site asks head office for money, or a payment on behalf of another site, as a payment
    request kind; released into its imprest or paid to the party.~~
    Done: a fund request is a payment request for a purpose, approved by the matrix, released into the site's imprest
    (in parts if needed) or paid to a party on account, and a site may ask on behalf of another it works at; Site imprest
    has a Fund requests tab, and the phone approves them. Not built: asking from the phone, and settling a party's
    on-account payment against their later bill (the books and Tally carry it on account).
108. ~~**Machine finance** (M). Loans on financed machines with the EMI schedule, EMIs paid and due, reminders, posted to the
    books and the machine's cost.~~
    Done: Accounts → Machine loans records a loan on an owned machine, builds its EMI schedule, records EMIs paid in order
    (or closes it early), shows what is owed by lender, reminds before and after each due date with an overdue EMI on
    the watch list, and posts the loan and each EMI to the books and Tally (interest to finance costs); each loan shows
    the interest per hour the machine works. Not built: floating rates (a rate change re-schedules nothing), part
    prepayments that keep the loan running, and loans from the phone.
110. ~~**Tender bidding** (L). A tender register (NIT, client, EMD, dates, documents, result), a company Schedule of Rates
    library imported from Excel (state SOR, CPWD DSR, own rates), the bid BOQ priced from rate analysis with the quoted
    percentage above or below the SOR, others' bids after opening (L1, L2), and a won tender turned into a project with
    its BOQ, budget and guarantees.~~
    Done: Billing → Tenders keeps the register with the EMD in the guarantees, prices the bid BOQ (imported from Excel and
    matched by SOR code) from each item's rate analysis with overheads and profit, quotes a percentage on the SOR or item
    rates with the margin shown, ranks the bids read out at opening, and makes a won tender a project with its BOQ, norms,
    resources, budget and guarantees. Billing → Schedule of rates keeps the SOR books, imported from Excel. Not built:
    e-tender portal downloads, corrigenda as versions, a bid's own documents checklist, and tenders on the phone.
111. ~~**Subcontract enquiries and comparison** (M). Quotes from several subcontractors on chosen BOQ items, a comparative
    statement by item and total, and the chosen quote becoming the work order.~~
    Done: Purchases → Subcontract enquiries sends chosen BOQ items (or the enquiry's own) to several subcontractors,
    takes each quote as it comes, sets the rates side by side with the lowest of each item marked, ranks complete quotes
    L1, L2… against the client's rates, and awards one as a draft work order (a reason needed when it is not L1). Not
    built: sending the enquiry by email or WhatsApp from the app, subcontractors quoting through the supplier portal, and
    enquiries on the phone.
112. ~~**Meetings and action items** (M). Attendees, minutes, decisions and actions (owner, due date, linked RFI, NCR or
    variation), the MOM as a PDF by email or WhatsApp, open actions in My work.~~
    Done: Site → Meetings records a project's meeting (our staff and outsiders by name, points noted and decided, actions
    with an owner, a due date and an RFI, NCR or variation), issues the minutes (emailed in the body to everyone with an
    address, our owners told), prints them (Save as PDF), shares them as a WhatsApp message, shows what earlier meetings
    left open, lists every action by due date and puts each owner's open ones in My work. Not built: the minutes as a PDF
    attachment, meetings on the phone (owners get the push and see the card on the phone's Home), and recurring meetings.
113. ~~**Material approvals** (M). The approved makes list, material and sample approval requests with review outcomes and
    revisions, days outstanding, and a warning on a PO for a make not approved.~~
    Done: Materials and plant → Material approvals raises a request for a make or a sample (material, item, BOQ item, make,
    model, supplier, why this make, files) to the client's engineer or the consultant, submits it as R0, records each
    outcome (approved, approved as noted, revise and resubmit, rejected) with the comments and reference, resubmits it as
    R1, R2… perhaps in another make, or withdraws it, and counts what waits past its reply date. Each project keeps its
    approved makes (from the contract, or approved on request); a purchase order line now names its make, and a line for a
    listed material in another make, or none, is flagged on the order form and the order. Not built: the client or
    consultant answering in the client portal, a My work card, and requests on the phone.
114. ~~**Schedule links and critical path** (M). Finish-to-start and other links with lag, the critical path, a three-week
    look-ahead, Primavera XER and MS Project XML import and export.~~
    Done: on a project's Gantt each activity opens its links (finish to start, start to start, finish to finish, start to
    finish, with a lag or lead), loops are refused, and the critical path, float and the earliest start the links allow
    are drawn on the bars; activities planned before their links allow are counted with Move them. The Look-ahead tab
    shows the next three weeks day by day with what is under way, ready to start or waiting, and on what. The schedule
    goes out as MS Project XML or Primavera P6 XER and comes back in (previewed, matched by name). Not built: working
    calendars and holidays (days are calendar days), resource levelling, and links on the phone.
115. ~~**Earned value** (M). Planned value from the baseline and BOQ, earned value from measured or certified work, actual
    cost from the books; SPI, CPI, EAC and the S-curve per project.~~ Done: a project's Money > Earned value tab. Each BOQ
    item's value is spread over its activities' baseline (else planned) days; earned from approved progress or measured
    work; actual cost is the Cost tab's. SPI, CPI, EAC (two ways), ETC, VAC, TCPI, the earned schedule and the finish it
    points to, the S-curve and the activities furthest behind. Not built: earned value by cost head or on the phone.
116. ~~**Comments and mentions** (S). Threaded comments on any record, @mentions that notify, resolved threads.~~ Done:
    Comments on every submission's record (page, drawer and the Approvals pane), meetings and material approvals; @mentions
    of staff who can open the record, notices for mentions and replies, resolve and reopen. Not built: comments on the
    phone (the notice opens the record there), comments on registers without a page of their own, email of a mention.
117. ~~**Module switches** (S). An admin turns modules off for the company; they leave the sidebar, search, New menu and
    Ask, the API refuses them, the data is kept. Plans can set which modules a tier has.~~ Done: twelve optional modules
    under Admin > Modules, off everywhere on the web, the phone and the API with the data kept; three plans (Essentials,
    Business, Enterprise) set from the console. Not built: switching off single pages inside a module, or a price per plan
    (the subscription price stays per unit).
118. ~~**Measure on drawings** (M). In the drawing viewer (item 109): scale from two points, length, area and count, saved as
    measurement sheet lines or a BOQ quantity.~~ Done: a scale per sheet (two points, or a DXF's drawing units), lengths,
    areas and counts (T1, T2… per document) worked out again when the scale changes, totals by kind, measures put into a
    new measurement sheet (a rectangle as L × B) or set as a BOQ item's original or revised quantity times a factor.
    ARCHITECTURE "Measuring on drawings". Not built: measuring on the phone, measures carried onto a later revision, a
    scale per detail on one sheet.

Items 110 to 118 come from the comparison with OpenConstructionERP (AGPL-3.0: its ideas only, never its code or cost data).

## Drawings in the app (item 109, numbered after v6's 98 to 108)

Asked by Pradeep on 22 Oct 2026: "can we integrate drawing tools, to view and edit drawing files". Options weighed: Autodesk
Platform Services (full DWG and Revit, but paid per file converted and needs an Autodesk account), Apryse and Nutrient
(complete PDF and CAD markup, thousands of dollars a year), the free DWG readers (LibreDWG and its web builds, GPL, and
patchy), dxf-viewer (MPL, three.js), a whiteboard such as Excalidraw over an image, and PDF.js with our own markup layer.
No open-source web CAD editor is good enough to change drawings, so editing stays in AutoCAD and Nirmaan views, marks up
and tracks revisions.

109. ~~**Drawing viewer and markup** (L). View a revision's PDF, DXF or image in the app, mark it up (comment pins,
     clouds, boxes, arrows, text, freehand), resolve marks, carry open ones onto the next revision, compare two
     revisions, raise an RFI from a mark; the phone shows the marks and adds comment pins on image drawings.~~ Done:
     `DrawingMarkup` (M1, M2… per document, points 0 to 1 of the page, `OPEN` / `RESOLVED`, optional RFI) and
     `/documents/:id/markups`; the viewer at `/documents/drawing` (pdf.js legacy build, dxf-parser with our own canvas
     renderer and layers, images), an overlay compare of two revisions, a marked-up PNG; uploads take `.dxf` and `.dwg`
     (DWG kept for download). Phone: `drawing/[id]` from Drawings. ARCHITECTURE "Drawing viewer and markup". Later, if
     wanted: DWG opened directly through Autodesk Platform Services on the company's own account, marks on PDFs on the
     phone (needs a WebView in a store build), measuring with a calibrated scale (planned as item 118).

## AI – Ask Nirmaan and what follows

Rules for every AI item: the AI reads only what the asking user can see (through `AiToolsService`), never submits,
approves, pays or deletes anything, cites the records it used, is off per company until an admin switches it on (on
for DEMO), and stays inside a monthly allowance per company and a daily question limit per person. The model for each
job is Pradeep's call once item 67's evaluation (`apps/api/scripts/ai-eval.ts`) has run on the preview.

67. **Ask Nirmaan (web) and the AI foundation** (L). Built: the panel (header button, Ctrl J, Ctrl K), streaming answers
    with linked records and flagged figures, history, ratings, Admin > Ask Nirmaan, the role-by-role access check in CI,
    and the golden and red-team eval. Goes live once `OPENROUTER_API_KEY` is set on the API and the eval has run.
68. **Explain and summarise** (M): "Summarise this week" on a project; "Explain" beside a cost head over budget, a late
    activity and an RA bill.
69. **Bill checks before approval** (M): rule checks on vendor, subcontract and RA bills and expenses (rate above PO,
    quantity above GRN, duplicate invoice, GST, BOQ overrun) with a one-line summary.
70. **Read invoices and challans** (L): a photo or PDF fills a vendor bill or GRN draft, each field showing its source.
71. **Drafts from a sentence** (M): "Raise an MR for 200 bags of OPC 53 for Tower B by Friday" opens the filled form.
72. **Ask and dictate on the phone, in Hindi** (L): an Ask tab and a dictated DPR in the site app.
73. **Early warnings** (M): a watch list of forecast slips, cash gaps, late vendors, stock-outs and missing DPRs.
74. **Morning brief and weekly narrative** (S).
75. **Ask the contract** (M): answers with quotes and page numbers from contracts, specifications and letters.
76. **Site photo checks** (M): captions and advisory flags on site photos.
77. **AI usage, controls and pricing** (S): usage by feature, an admin conversation log, roles allowed, and the AI
    allowance in Plans and billing.

## AI for site problems (items 119 to 124)

Asked by Pradeep on 23 Oct 2026: build the AI strategy for construction site problems (the doc "Nirmaan AI strategy for
site problems", copy in the project's `roadmap/ai-strategy/`). Its top five come first, in its order, on the AI items
above, each one pull request merged once CI and the browser tests are green. The build plan is the doc "Nirmaan AI site
intelligence: build plan". Rules first, models only to read what sites send; nothing writes without a named person.

119. ~~**AI flags: why, how sure, track record** (S). Every watch-list warning leads with the action and its cost, opens its
     working, says Checked, Likely or Check this, is dismissed as Fixed, Known or Wrong, and shows "right 7 of the last
     10"; a kind marked Wrong too often pauses; at most 5 new warnings a person a day.~~ Done: `action`, `impact`,
     `confidence` and `working` on every warning, outcomes in `WarningOutcomeLog`, the Track record tab, pauses and
     Resume (admin and management), the daily alerts (`warningAlerts`). ARCHITECTURE "Early warnings".
120. ~~**WhatsApp and voice capture** (L): a WhatsApp text, photo or Hindi voice note becomes a draft DPR line, material
     request, expense, snag, hindrance or safety observation, saved in the sender's name on one tap.~~ Done for DPRs,
     material requests, expenses and progress entries (the draft tools Ask Nirmaan already has): the Cloud API and WATI
     webhooks, voice notes heard by `TRANSCRIBE_PROVIDER` (OpenRouter audio model or Sarvam), Save and Discard by
     button or "1"/"2"/"haan"/"nahi", `/whatsapp-capture` with the go-live figure (saved as drafted, aim 70%), and the
     form link that counts a changed save. Hold-ups go in the DPR's issues, for 123 to pick up; snags and safety
     observations wait for their own draft tools. Site staff use WhatsApp itself, so there is no phone screen.
     ARCHITECTURE "WhatsApp entries".
121. ~~**Material and fuel leakage checks** (M): material used against what approved work allows, month by month and site
     against site, PO rates above another site's, fuel above norm or issued with no log, hired machines idle while paid.~~
     Done: `/leakage` with the month's flags, rupees at risk and working (material from `ReconciliationService.forPeriod`
     against the allowance and the company median, rates by `rateAboveOthers`, fuel with no log and off its norm, idle
     hourly and monthly hire), the rate check on the PO form, record and approval pane, and the RATE_ABOVE, FUEL_NO_LOG
     and IDLE_HIRE watch-list kinds. Per-activity material waits for the DPR work lines (item 127). ARCHITECTURE
     "Leakage checks".
122. ~~**13-week cash forecast and billing readiness** (L): the bank balance and 13 weeks of money in and out as a range,
     why each short week is short, last month's error; measured work not billed and a drafted payment reminder.~~
     Done: `/cash-forecast` (opening from the books, client bills at each client's days with their spread, measured work
     not billed, payables, open POs and WOs, salaries, EMIs, dues and advances; why a week is short, chase and hold, the
     weekly snapshot and its error four weeks on) and the CASH warning read from it; `/billing-readiness` with Draft
     reminder quoting the contract's payment clause. ARCHITECTURE "Cash forecast and billing readiness".
123. ~~**Hindrance to notice** (M): a hindrance in a DPR or message suggested as a delay, the contract's notice clock on the
     watch list, and the notice letter drafted for the PM.~~
     Done: DPR remarks (a WhatsApp DPR's too) read by `hindrance-rules.ts` (100 labelled remarks, all read right) and the
     model for those it cannot place, recorded, added to an open delay or dismissed on Delays and risks or the DPR; the
     contract's notice days (the filed contract's clause suggested) and NOTICE_DUE at 7, 3 and 0 days; Draft notice; the
     delay register printout. ARCHITECTURE "Hindrance register to notice".
124. ~~**Attendance cross-check** (M): man-days billed against biometric punches, roll call, head-count sheet and DPR
     manpower, as a bill check and a page for HR and the PM.~~
     Done: a subcontractor bill's man-day lines against the head count, the named roll call and the punches over the
     bill's days (a check on the bill, MANDAYS_ABOVE on the watch list), and `/attendance-check` with those bills,
     workers on the roll call with no punch, a crew's head count above its roll call and a site's head count above its
     DPR; workers named to HR and the PM only. Backtest on 24 labelled crews: 9 of 11 flags real, every padding the
     records show caught. ARCHITECTURE "Attendance cross-check".

## Project kinds, structured DPR and stock reconciliation (items 125 to 131)

Asked by Pradeep on 23 Oct 2026, from a client's project documents (kept out of the repo): make every kind of project
the client runs work end to end, with component and sub-component progress, activity and sub-activity, pipe laid
junction to junction, and stock against the DPR. The design is the doc "Project kinds, DPR format and stock
reconciliation: design". One pull request each, in this order.

125. ~~**Work breakdown** (L): components and sub-components with weights, activities and sub-activities, progress rolled
     up to the project; BOQ sections and SOR references; SEWERAGE and the contract model.~~ Done: `WorkElement`, the
     roll-up in `@erp/shared/wbs.ts`, built-in component templates (RCC as reinforcement, shuttering and concrete,
     lifts from heights), the Structure tab with Excel in and out, BOQ by section, the phone's read-only tree, and the
     demo town scheme. A company's own component templates wait. ARCHITECTURE "Work breakdown".
126. ~~**Pipe network** (L): junctions and segments, laid, jointed, tested and commissioned junction to junction.~~ Done:
     `PipeNode` and `PipeSegment` per zone or main, imported from EPANET or Excel with a preview matched by code; DPR
     lines name their segment and are held to its length; segment status, the pipe sheet by diameter and working
     fronts; hydraulic tests that name their pipes; the Pipe network tab with its map, the DPR's pipeline table, the
     phone's segment picker and the demo zone. Drawing a network by hand and GIS layers wait. ARCHITECTURE "Pipe network".
127. ~~**Structured DPR** (L): DPR work lines against activities and sub-activities, with location, manpower, machines and
     material used per line.~~ Done: a DPR's lines are its progress entries (crew, machines, work order, material in
     `ProgressMaterial`), submitted and approved with it, hold points checked per line; scope, up to previous,
     cumulative and balance per line; the form and record on the web and the phone, the print in the site's layout,
     material from the norms, Copy yesterday, and the "progress from the DPR only" switch. ARCHITECTURE "Structured DPR".
128. ~~**Stock against the DPR** (M): material issued against what the DPR lines' quantities allow, per activity.~~ Done:
     norms on activities, issues and returns to a component, used per DPR and the work-front position in Materials,
     and the Structure, Pipe (scope to buy by size, cut wastage, laid above issued), Kits and Exceptions views with
     Excel; pipe items carry diameter, material and weight per metre. A norm library, kit tables, the watch list and
     the phone's view wait. ARCHITECTURE "Stock against the DPR".
129. ~~**Stage billing** (M): lump-sum and EPC bills by stage against the components' billing shares.~~ Done: the
     billing break-up (components, parts and stages, the standard one from the work breakdown), each stage's evidence
     (dated events, progress, supply, testing), stage lines on RA bills with claims by hand and the client's cut,
     unit-rate items at rate × tender factor, the milestone grid with slippage withheld and released, and the advance
     recovered in a window. Interest on advances, portal stage certification and the unit-rate total moving the
     contract value wait. ARCHITECTURE "Stage billing".
130. ~~**EPC packages, deliverables and currency** (L).~~ Done: engineering deliverables by discipline with the client's
     codes and lateness, equipment packages from order to commissioning with the shipment and a forecast on site
     against the day needed (watch list PACKAGE_LATE), client inputs that become delays, payment stages released by
     deliverables and packages, and a contract currency kept in rupees at the contract rate with the day's rate on
     receipts and the exchange difference in the books. A phone view, foreign purchase orders and portal approvals wait.
     ARCHITECTURE "EPC".
131. ~~**Operation and maintenance** (M): a completed scheme's running, complaints and contract payments.~~ Done: the
     O&M contract after handover (years and % of the contract, instalments, benchmarks, minimum staff, chemical norms),
     the daily service level log with failures against the benchmarks, staff recorded monthly, chemicals against their
     norm per ML, and each period's O&M bill as an RA bill (instalment less staff short, penalties as a deduction), with
     the watch list's OM_SERVICE and the demo scheme in year 2. The phone's daily entry, a complaints register and meter
     feeds wait. ARCHITECTURE "Operation and maintenance".

## Management dashboard and reports (item 132)

Asked by Pradeep on 26 Oct 2026: a dashboard and the reports management needs, from the BI review in the end-to-end
test report.

132. ~~**Management dashboard and reports** (L).~~ Done: `/management` with every contract project's health and reasons,
     progress against plan, money from contract to work done, billed, certified and paid, cost against budget, what
     clients owe, approvals by age, cash and the monthly trend; a drill-down per project; and nine reports with Print and
     Excel (Monthly MIS, project profit and loss, work in progress, receivables and payables ageing, procurement spend,
     labour and attendance, stock position, approvals waiting). The phone, a scheduled MIS email and the My work card for
     work not billed wait. ARCHITECTURE "Management dashboard and reports".

## Group companies (item 133)

Asked by Pradeep on 28 Oct 2026: a parent company with child companies of different kinds (construction, consultancy,
quality checking). Research and design in the Claude Doc "Group and child companies: research and design".

133. **Group companies.** ~~Phase 1 (L):~~ Done: a group above companies, one sign-in across them with a company switcher
     (web header, account menu on a phone, Profile in the app), company kinds that set the modules a new company starts
     with, legal details per company, and Admin › Group companies for the group's admins to add companies and give people
     places. ARCHITECTURE "Group companies".
     Phase 2 (L): work between sister companies, such as a lab's tests or a consultancy's supervision on a sister's
     project, as an inter-company order and bill that post to both companies' books.
     Phase 3 (M): group reports across companies (receivables, payables, cash, headcount) for the group's admins and
     management, and masters shared across the group (vendors, items, rates) where the companies want them.

## Project types (item 134)

Asked by Pradeep on 28 Oct 2026: project types, each type's activities and its DPR form configurable by the company,
with default templates for each type. Plan in the artifact "Configurable project types, activities and DPR forms".

134. **Project types.** ~~Part 1 (L):~~ Done: the company's project types (the six standard ones, its copies and its
     own, each built on a kind of work) with their places, pipe network, usual contract, starting breakdown and loose
     activities; a library of component kinds (specs and steps as data, the twenty built-in kinds included); New project
     picks the type and how many of each starting component; the Structure tab offers the type's kinds first.
     ARCHITECTURE "Project types".
     ~~Part 2 (L):~~ Done: the DPR form per type: which built-in fields show, are required and what they are called,
     photos, the work lines' picker and parts, and up to 20 fields of the company's own (for the day or each line,
     with a Hindi label); saved as versions, each report keeping the one it was made on; web, phone, record, print,
     export and Ask Nirmaan follow it. ARCHITECTURE "DPR form per project type".
     ~~Part 3 (M):~~ Done: Update projects on a type or a kind, a preview per project of what it would gain (only
     additions, new work with no weight so progress stays) with items to leave out; export and import of types (with
     their DPR forms) and kinds as a file, previewed item by item through the editors' checks. ARCHITECTURE "Updating
     projects from their type" and "Export and import of project types".

## QA/QC, design and drawings, correspondence and masters (items 135 to 138)

Asked by Pradeep on 28 Oct 2026: QA/QC, Design and drawings, and Correspondence (inward and outward letters) as modules of
their own, analysed as a senior construction business analyst would for an Indian contractor, and masters where the modules
need them. Analysis and decisions in the Claude Doc "QA/QC, Design and drawings, Correspondence and masters: analysis":
masters first, then correspondence, QA/QC and design; Safety stays in Project management; a Document controller role, and
outward letters approved before they are numbered (on by default for notices, claims and EoT letters); letter numbers short,
such as P07/OUT/26-27/042; bar bending schedules later.

135. ~~**Masters and the three modules in the menu** (L).~~ Done: QA/QC, Design and drawings and Correspondence as
     department modules (fifteen), Safety and Correspondence as tree modules, a Masters sub-module in every department and
     Administration › Masters listing them; trades, designations, departments, item categories and equipment categories as
     company lists over standard entries, with Hindi names, picked on the attendance, worker, item, equipment and employee
     forms. ARCHITECTURE "Masters".
136. ~~**Correspondence** (L).~~ Done: company-wide inward and outward registers, marking to a person with an action and
     due date, numbering series by financial year, an address book, templates with sign-off and letterhead print, dispatch
     and proof of delivery, threads and links, replies due, Search, My work and the phone (letters for you, approve and
     close). Inward letters are created through one service method (`recordInward`) that the integrations' email inbox
     (item 155) calls too. Reading a photographed letter with Ask is left for item 155's inbox. ARCHITECTURE
     "Correspondence".
137. **QA/QC** (L): test types and quality plans (ITP), tests due from DPR quantities and receipts, the pour register with
     the IS 456 cube acceptance check, pour cards; then labs and samples sent out, calibration, supplier test certificates,
     audits and visits, NCR categories and root causes, the dashboard and monthly report.
     Part 1 done: test types as a master over sixteen standard ones, a quality plan per project (from the standard plan of
     its type), tests due from approved DPR lines and receipts (IS 456 clause 15.2.2 sampling for concrete), the pour
     register with its pour card as an inspection and the cube acceptance check of IS 456 Table 11 (as amended), and a
     test recorded against its type, plan line and pour. ARCHITECTURE "QA/QC".
     Part 2 done: labs (site, NABL with its accreditation, group) and samples at them with late reports, the calibration
     register with certificates and tests on an instrument out of calibration flagged, the maker's test certificate on a
     GRN with the receipts still missing one, and NCR categories, root causes, client-raised and rework cost.
     Part 3 done: audits and visits (internal, client, consultant, TPI, department) with findings closed or raised as
     NCRs and late after 15 days, the monthly quality report by project with print, My work's audit findings card (web
     and phone) and the watch list's tests short, instruments out of calibration and late lab reports. QA/QC screens of
     its own on the phone are later.
138. **Design and drawings** (L): drawing schedule with late drawings as delays and reminder letters, design submissions and
     comment replies on every project, vetting, controlled copies, numbering, revision impact, the as-built check, the
     design dashboard. Bar bending schedules follow as an item of their own.
     Part 1 done: the drawing schedule per project (from whom, needed by, the work it holds up) matched to the register by
     number, late and due-soon drawings, a reminder letter drafted for each party with what it owes, a late drawing from
     the client's side recorded as a delay toward an extension of time, the watch list's drawings awaited, the next
     drawing number in the company's scheme and the as-built check. ARCHITECTURE "Design and drawings".
     Part 2 done: design submissions for approval or vetting round by round, the documents' revisions sent, a covering
     letter, the reviewer's code A to D moving the register's revisions and the EPC deliverables, the comment resolution
     sheet with our replies (a resubmission waits for them), vetting fees and certificates, late reviews on the watch list
     and as delays. ARCHITECTURE "Design and drawings".
     Part 3 done: controlled copies numbered to their holders and recalled when a revision supersedes them (the watch list
     shows copies out past a week), what a new revision changes (copies, approvals, take-offs, marks, RFIs, EPC
     deliverables) in the document drawer, and the design dashboard by project, also on the module screen. Bar bending
     schedules and design screens on the phone follow as items of their own.

## Intelligence quick wins (Q0 to Q9)

Asked by Pradeep on 28 Oct 2026: "till now we have developed only the transaction capturing layer; what intelligence can we
build?" The answer is the ideas page "Nirmaan intelligence map" (copy in the project's `intelligence/`): 18 checks already
built, 25 ideas ranked, and the open-source projects that could help with their licences. Its ten quick wins are rules over
data Nirmaan already holds, one pull request each, in this order. They carry no roadmap numbers (the integrations thread has
139 to 166); ARCHITECTURE "Intelligence quick wins" has each one's rules.

- ~~**Q0 Other checks on the watch list** (S).~~ Done: the headline of leakage, the cash forecast, billing readiness and the
  attendance cross-check, and Ask Nirmaan while it is off (admins), at the top of the watch list.
- ~~**Q1 Margin fade** (S).~~ Done: the watch list's Margin falling, when the forecast margin at completion drops 2 points
  or more within three months, with the cost heads that ran over their budget for the work earned.
- ~~**Q2 Cube strength at 7 days** (S).~~ Done: the watch list's Cubes weak at 7 days, when a 7-day result ÷ 0.67 falls
  under the 28-day mark while the 28-day result is still to come, so the next lift waits.
- ~~**Q3 DPR credibility** (S).~~ Done: a Checks section on a DPR for its approvers (drawer, page and the Approvals pane):
  work with no crew, no material issued for it in the week, numbers or crews copied day after day, a photo sent before.
- ~~**Q5 Vendor scorecard at L1** (S).~~ Done: a Vendor record row on the comparative statement: deliveries on time and
  rejected at the gate over the last year, and each quotation's rates against the median of the quotations.
- ~~**Q6 Purchase controls** (S).~~ Done: the watch list's Purchase control, for management, accounts and the admin only:
  orders split under an approver's limit, goods received by the person who ordered them, a payment within 30 days after a
  vendor's bank details changed.
- ~~**Q7 Next billable stage** (S).~~ Done: Billing readiness opens each project with its next bill: billable today (measured,
  approved and not measured, stages done) and its worth by the month end at the pace of the last 30 days.
- ~~**Q4 Bid intelligence** (S).~~ Done: Past openings beside a tender's pricing: where L1 landed against the SOR on the
  last three years' openings of the same client and kind of work, and how many of them the quote now would have led.
- ~~**Q8 Toolbox talk in Hindi** (S).~~ Done: Today's talk on the toolbox talks list (web) and the talk form (phone): five
  minutes in Hindi and English from today's permits, the project's recent incidents and the work going on, recorded as a talk.
- ~~**Q9 MIS commentary** (S).~~ Done: the Monthly MIS opens with a paragraph written from its own figures (the month
  against the one before, cost, what clients owe and what is not billed, the year's margin, what needs action), on the
  page, in print and in Excel.

## Integrations (items 139 to 166)

Asked by Pradeep on 28 Oct 2026: which IoT, Tally and other integrations Nirmaan can have. The design is the Claude Doc
"Integrations for Nirmaan: IoT, Tally and more (design)" and the decision on how site devices reach Nirmaan is ADR-001.
One integration layer first, then Tally and GST, then the machine and site devices, then money and documents; cameras,
drones, sensors and the rest when a customer asks. The machine and site devices (146 to 150) come right after 139.

139. ~~**Integration layer and the Nirmaan Connector** (L).~~ Done: Administration › Connections with a web address per
     connection (`/api/hooks/<kind>/<secret>`, secrets hashed and shown once), keys sealed under `INTEGRATION_KEY`, the
     log of every message, devices matched to machines and sites, and the Connector (`apps/connector`): paired with a code,
     calling out only, an outbox that keeps readings while the internet is down, a Windows start-up task. ARCHITECTURE
     "Integration layer".
140. **Tally live two-way sync** (L).
141. **E-invoice (IRN), GSTIN check and e-way bills on dispatch** (M).
142. **E-way bill for transfers, returns and machine moves** (S).
143. **GSTR-2B download and match** (M).
144. **Weather by site** (S).
145. **WhatsApp documents to outsiders** (M).
146. ~~**Machine telematics** (L).~~ Done: a maker's AEMP 2.0 feed (ISO 15143-3) read every hour and GPS trackers'
     web addresses (Traccar too) to each machine's day (engine hours from the hour meter, idle, fuel used, how far from
     its site); Machinery › Engine hours beside the logs, a new log filled from the tracker, hire bills checked against
     the engine's hours and service due on the real meter. ARCHITECTURE "Machine telematics".
147. ~~**Fuel sensors and dispensers** (M).~~ Done: a tracker's tank level (% through the machine's tank size, or litres)
     to each machine's day (refills, drains with the engine off, fuel burnt), set against the day's fuel slips on the Fuel
     tab and Engine hours, litres an hour against the norm (the FUEL_NORM check reads the sensor first), FUEL_TANK on the
     watch list, and a site's fuel dispenser posting each fill, made a fuel slip through `StockService.fuelIssue` once its
     tag is matched. ARCHITECTURE "Fuel sensors and dispensers".
148. ~~**Weighbridge** (M).~~ Done: the indicator read by the Connector over its serial port or the site's network, each
     stable weight a weighing, a truck's ticket from its two weights on Stock › Weighbridge, the GRN drafted at the net
     weight (one ticket, one GRN), short supply against the challan beyond 0.5% or 20 kg, and WEIGH_SHORT on the watch list
     for a supplier's repeated short loads. ARCHITECTURE "Weighbridge".
149. ~~**Batching plant controller** (M).~~ Done: the controller's batch reports read by the Connector from its folder, each
     row kept and read through the plant's column map (matched once from a real report), RMC plant › From the batcher with
     the order each batch looks to be for, the challan made from the batch with its own weights (one batch, one challan),
     and trial batches set aside. ARCHITECTURE "Batching plant controller".
150. ~~**Biometric device commands** (S).~~ Done: an ADMS device handed commands when it asks (`getrequest`) and its answers
     read (`devicecmd`); HR puts a user number and name on the devices or takes it off (people who have left marked),
     a device's clock set from Devices and once a day when it says hello, and each command's state on Devices.
     ARCHITECTURE "Biometric attendance", Device commands.
151. **Bank statement feed** (M).
152. **Bank account check** (S).
153. **Vendor, subcontractor and salary payouts** (L).
154. **Aadhaar eSign** (M).
155. **Email inbox for bills and letters** (M).
156. **TDS returns and Form 16** (M).
157. **Site and gate cameras** (L).
158. **Drone survey import** (M).
159. **Concrete maturity import** (S).
160. **Water works meters and SCADA** (L).
161. **DigiLocker at joining** (S).
162. **Maps** (S).
163. **Sign in with Google or Microsoft** (S).
164. **Vehicle papers lookup** (S).
165. **Reading `.mpp` schedules** (M).
166. **Client collections by link or UPI** (M).

## Official progress reports (item 170)

170. ~~**Daily, weekly and monthly progress reports for the client** (M).~~ Done: Reports › Progress reports makes the
     daily, weekly and monthly progress report (MPR) of a project in the company's own design, laid out after the
     reports a PIU and its consultant ask for on a water supply scheme: the contract box, progress by component with
     its weight and status in words, the activities as per the approved programme, the work done entry by entry with
     its location and chainage, observations and deviations with their closure, crew, machines and materials,
     hindrances, the plan for the next period and photographs; the MPR adds the executive summary, delay against the
     programme, village or floor-wise progress, the stage billing milestone grid, bills, variations, drawings,
     meetings and their actions, letters, quality, safety and risks. Previewed on the page and downloaded as PDF, Word
     or Excel; issuing keeps the copy with its number (counted from the start of work) and revision. ARCHITECTURE
     "Official progress reports". Not yet: staff qualifications, the lab's equipment list, the safety yes/no checklist,
     the environment and pre-construction checklist, and the phone.

## Definition of done for every item
Prisma migration, API endpoints with Swagger, shared types, web screen, mobile screen where site
staff use it, seed data updated, `pnpm typecheck` + `next build` + mobile `tsc` clean, smoke test
updated if the API contract changed, README / ARCHITECTURE updated.
