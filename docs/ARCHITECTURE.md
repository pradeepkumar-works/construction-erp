# Architecture

## Shape

Three apps on one API and one PostgreSQL database.

```
apps/web (Next.js + Ant Design 6)   apps/mobile (Expo / React Native)
             \                              /
              \---- apps/api (NestJS) ------/
                         |
                    PostgreSQL (Prisma)
                         |
                  local disk uploads (/uploads) -> S3/R2 later
```

`packages/shared` holds the enums, display labels, role permission helpers and the TypeScript
shapes of every API response, so web, mobile and API agree on one contract.

## Multi-tenancy

- Every tenant-scoped table has `organizationId`. All queries filter by the caller's organisation,
  taken from the JWT, never from the request body.
- Users belong to exactly one organisation today, but membership is a normal foreign key so it can
  become a join table without a data migration of the business tables.
- Roles are rows per organisation (`Role.key` is a system key such as `PROJECT_MANAGER`). Each new
  organisation is seeded with the default role set; later, tenants can rename or add roles without
  code changes. Permissions derive from the key in `packages/shared/src/permissions.ts`.
- Postgres row-level security is the second line of defence: policies on every table with
  `organizationId` compare it with `app.org_id`, which `PrismaService` sets (transaction-local) for each
  query of a signed-in request (`src/prisma/tenant-context.ts` carries the organisation through the
  request). Unset means unrestricted, which is what migrations, the seed, scheduled jobs and public
  endpoints rely on. Code inside a request that must look across organisations (the email-in-use check)
  wraps itself in `withoutTenant`. Raw SQL is not wrapped; child tables without `organizationId` are
  reached only through their parent. The policies only bind a role without `BYPASSRLS`, so in production
  the API connects as `erp_runtime` (created by a migration: row read/write rights, owns nothing) while
  migrations and the seed run as the owner from `MIGRATE_DATABASE_URL`.
- New organisations come from `POST /auth/signup` (off unless `ORG_SIGNUP=open`), which creates the
  organisation, the standard roles and the first admin in one transaction. Users join by invite: a
  one-time `PasswordToken` link (SHA-256 stored, invalidated when a newer link is made or one is used).
  Emails are unique across organisations because sign-in is by email alone.
- Not built yet, on purpose: subscriptions, plan limits, branding.

## Access model

- Company-wide roles (Admin, Management, Procurement, Accounts, HR) see all projects.
- Everyone else sees projects they manage or are a member of (`ProjectMember`).
- Approvers come from the organisation's approval matrix (`ApprovalRule`: role, submission type, optional
  rupee limit), limited to projects they can see. Without rules the fixed rule applies (Admin, Management
  and Project Manager approve everything). Admin always approves everything. `ApprovalRightsService`
  (rights, the amount of a submission, which roles to notify) and
  `ProjectAccessService.assertCanApproveSubmission` hold this; `packages/shared/src/approvals.ts` mirrors it
  for the clients from `AuthUser.approvalRights`. Other approver-only actions (editing before approval,
  stock adjustments, deleting a risk) still use the fixed `APPROVER_ROLES`.
- A submitter cannot approve their own entry unless they also hold an approver role.
- `ProjectAccessService` is the single place that encodes these rules; every service calls it.

## One approval workflow

`SubmissionLifecycleService` owns the state machine used by progress entries, DPRs, material
requests, machinery logs, site expenses, measurement sheets, RA bills, purchase orders, vendor bills, work orders,
subcontractor bills and inspections:

```
DRAFT / REJECTED / CHANGES_REQUESTED --submit--> SUBMITTED --review--> APPROVED | REJECTED | CHANGES_REQUESTED
```

Every transition writes an `AuditLog` row (who, what, when, note). A rejected or changes-requested
entry is edited in place (`PATCH`, optionally with `submit: true`) and resubmitted on the same record,
so one id carries the whole history: the resubmission is logged as `RESUBMITTED`, the previous review
(reviewer, time, note) is cleared, and the entry goes back into the approvers' queue. Who may edit
and resubmit is decided by `canEditSubmission` / `canResubmit` in `packages/shared/src/permissions.ts`,
which the API, web and mobile all use: the author while DRAFT / REJECTED / CHANGES_REQUESTED, and
approvers until APPROVED. On an edit, `attachmentIds` is the complete list of attachments; files left
out are detached. Adding a new submission type
(for example measurements) means adding a table with the same six status columns, adding the type to
`SUBMISSION_TYPES` in shared and registering it in the lifecycle service (`delegate`, `pending`) and in
`NotificationsService.describeSubmission`; the approvals queue, review endpoint and audit trail come
free. A type can register `onApproved` (run after approval) and `beforeApprove` (throw to refuse it) hooks; inspection
hold points use the latter on progress. The clients keep a few per-type maps (web drawers on the approvals and notifications pages,
`approvalTypeParam`; mobile `TYPE_ICON`, `EDIT_PATH`, `REVIEW_PATH`, `OUTBOX_PATH`, push routes) that
TypeScript flags when a type is added.

## Planning and progress

- `BoqItem` carries the contract quantity and rate. `Activity` is the unit of site reporting and
  optionally links to a BOQ item.
- `ProgressEntry` records executed quantity against an activity. Only APPROVED entries count.
- BOQ executed quantity = sum of approved progress on its linked activities.
- Physical progress % of a project = activity completion weighted by BOQ value (rate × planned
  quantity), falling back to planned quantity when an activity has no BOQ link.
- Project-type differences (chainage for roads, floors for buildings, connections for water) are
  carried by free-text `location` and the activity list, not by schema. A per-type activity template
  is the planned next step so new projects start from a standard list.

### Activity templates

`DEFAULT_ACTIVITY_TEMPLATES` in `packages/shared/src/templates.ts` holds a standard activity list per project
type (name, unit, start day, duration). An organisation that saves its own list for a type gets
`ActivityTemplate` rows (unique per organisation, type and name); with no rows the built-in list applies, so a
new organisation needs no seeding and `PUT /activity-templates/:type` with an empty list resets to it. Admin and
management edit them (`canManageTemplates`). `scheduleTemplate` (shared, so the web preview matches the API)
turns a list into planned dates: from the project start, scaled so the template span fills the project when an
end date is set. `POST /projects` with `applyTemplate: true`, or `POST /projects/:id/activities/from-template`
(optionally `names`), creates the activities with planned quantity 0, skipping names the project already has.

### Gantt, milestones and baseline

- **Tables.** `Milestone`: project, name, `dueDate`, `baselineDate`, `achievedOn`, note (with a `tenant_isolation`
  policy). `Activity` gained `baselineStart` and `baselineEnd`; `Project` gained `baselineAt`, `baselineById` and
  `baselineNote`. Freezing (`POST /projects/:id/baseline`, `canFreezeBaseline`: admin, management, project
  manager) copies every activity's planned dates and every milestone's due date to the baseline columns in one
  transaction; re-freezing replaces them and writes `BASELINE_REPLACED` to the audit log. An activity added later
  has no baseline dates until the next freeze.
- **Gantt.** `GET /projects/:id/gantt` (anyone who sees the project): per activity the plan, the baseline, the
  actual start (first approved progress) and end (the approved entry that reached 100%), progress, the
  straight-line `expectedPct` for today and a `ScheduleState` (UNSCHEDULED, NOT_STARTED, ON_TRACK, BEHIND when
  progress trails the expected line by more than `BEHIND_TOLERANCE_PCT` (10) points, LATE past its planned end,
  DONE), plus finish slip in days against the baseline; milestones with a `MilestoneState` (UPCOMING, DUE_SOON
  within 14 days, MISSED, ACHIEVED, ACHIEVED_LATE). Helpers in `packages/shared/src/schedule.ts`.
- **Milestones.** `/projects/:id/milestones` CRUD for project editors; achieving one is a `PATCH` with
  `achievedOn`. Dependencies and the critical path are not modelled yet.
- **Web.** Project tab Gantt: summary, baseline banner with Freeze / Re-baseline, a week or month scale with the
  plan bar filled to progress, the baseline as a grey bar under it, milestones as diamonds and a line for today,
  and the milestone list. The Activities tab shows the baseline end under a moved planned end.

### Named worker register

A site labour register, not HR: no PF, ESI or payslips (those stay with Payroll Inputs).

- **Tables.** `Worker`: `workerNo` (W-0001 per organisation, under an advisory lock), name, father's name, phone,
  contractor (linked to the vendor of that name), trade, `WorkerSkill`, `WorkerIdType` and number (Aadhaar keeps only
  the last four digits), `dailyWage` (defaults to the trade's `LabourRate`), `otRate` (empty = daily wage / 8), the
  project they work at, `joinedOn`, `leftOn`, `isActive`. `WorkerAttendance`: one mark per worker per day
  (`StaffAttendanceStatus`), in and out (`HH:mm`), `otHours`, the activity worked on, note, who marked it. Both
  have a `tenant_isolation` policy.
- **Roll call.** `GET /workers/roll-call?projectId&date` lists the workers posted there that day (joined, not
  left) plus anyone already marked there. `PUT /workers/roll-call` (`canManageWorkers` = the attendance recorders,
  with project access) sets or clears marks; overtime defaults to the time past `WORKER_SHIFT_HOURS` (9) between in
  and out. A worker marked at another site that day gives 409, a future day 400, and a day whose DPR is approved
  409 (the same lock as the head count). In the same transaction the day's `AttendanceSheet` takes the roll call's
  counts (present or half day = one head) for each contractor and trade pair on the roll call; other lines stay,
  and a sheet is created when there was none (`mergeHeadCount`, `AttendanceService.applyRollCall`).
- **Muster and output.** `GET /workers/muster?projectId&month` gives each worker's marks by day, man-days (half day
  = 0.5), OT hours and wages at their current rates, and totals per contractor. `GET /workers/output?projectId&from&to`
  gives the man-days tagged to each activity against its approved progress in the same days, and output per
  man-day. Seeing them needs `canViewWorkers` (recorders, quantity surveyors, accounts).
- **Web and mobile.** The Attendance page and project tab gain Roll call, Workers and Muster & output beside the
  head count. The site app has an online Roll call screen.

### Site imprest

- **Tables.** `Imprest`: project, holder (a user who pays site expenses), `floatAmount`, `openedOn`, `closedOn`,
  `isActive`; one per holder per project. `ImprestEntry`: `ADVANCE` or `RETURN`, `REQUESTED` / `PAID` / `REJECTED`,
  amount, dates, payment mode and reference, who asked and who decided. Both have a `tenant_isolation` policy.
- **Cash in hand** = advances paid - returns - the holder's cash expenses at that project since `openedOn` that are
  submitted, approved or sent back (`imprestFigures` in `packages/shared/src/imprest.ts`). A turned-down cash
  expense does not reduce it; it shows as disallowed, cash the holder has to account for. The top-up due is the
  float less the cash in hand; under 20% of the float is low.
- **API.** `/imprests` (accounts and approvers see their projects' imprests, others only their own). Accounts,
  admins and management (`canManageImprest`) open one (optionally paying the float), advance cash, pay or turn down
  a top-up, take cash back, change the float and close it (only with nil cash in hand and no top-up waiting). The
  holder asks for a top-up (one waiting at a time), which notifies accounts (`IMPREST` notification, hidden from
  older phone builds); paying or turning it down notifies the holder. `GET /imprests/:id` adds the cash ledger with
  a running balance.
- **Web and mobile.** A Site Imprest page with each float's cash in hand and the top-ups waiting; the site app's My
  imprest screen shows the holder's balance and asks for a top-up.

### Guarantees, insurance and licences

- **Table.** `ComplianceDoc`: kind (`BANK_GUARANTEE`, `EMD`, `INSURANCE`, `LICENCE`), a free-text type
  (suggestions in `COMPLIANCE_CATEGORIES`), number, issuer, an optional project (none = company-wide), beneficiary,
  amount (sum insured for a policy), margin money for a guarantee, issue and expiry dates, a guarantee's claim
  period, and status `ACTIVE` / `RENEWED` / `RELEASED` / `INVOKED`. Scans are attachments (`complianceDocId`).
  `tenant_isolation` policy as usual.
- **Renewal** creates a new entry pointing back at the old one (`renewedFromId`), which becomes `RENEWED`; the
  detail lists the earlier periods. Deleting a renewal makes the entry it replaced active again. Release (returned,
  refunded, cancelled, surrendered) and invoke (encashed, forfeited; guarantees and EMDs only) close an entry.
- **API.** `/compliance-docs` with totals (guarantees out, margin blocked, EMD out, expiring, expired). Accounts,
  admins and management keep it (`canManageCompliance`); project managers read their projects' entries.
- **Reminders.** `NotificationJobsService.complianceDue` (with the daily digest, or `GET
  /notifications/jobs/compliance-due`) alerts active entries once when they come within 30 days of expiry and
  once when expired, to the keepers and the project's manager (`COMPLIANCE` notification, hidden from older phone
  builds).
- **Web.** A Guarantees & Licences page under Billing; no phone screen (an office register).

### Handover and defects

- **Tables.** `ProjectHandover` (one per project): completion date, certificate number and date, certified by, the
  defect liability period (DLP) in months and its end (`dlpEnd` in `packages/shared/src/handover.ts`, clamped to the
  month's last day), with the certificate as attachments (`handoverId`). `Defect`: `SNG-` (phase `SNAG`, before
  handover) or `DEF-` (phase `DEFECT`, in the DLP) numbers, title, location, trade, priority, who found it, assignee
  or subcontractor, due date, status `OPEN` / `FIXED` / `CLOSED` with the fix note, cost and who accepted it; photos
  are attachments (`defectId`). `CloseoutItem`: the project's close-out checklist lines by category. All three have
  `tenant_isolation` policies.
- **Flow.** Site and office staff report snags and defects and mark them fixed (`canReportDefect`); QA/QC and
  approvers accept (close) or reopen them (`canCloseDefect`). A new entry is a defect once completion is recorded
  for its date, a snag before. Closing one never fixed needs a note. Offline retries send a client `id`.
- **Completion.** The project's approvers record it (`PUT /projects/:id/handover`, `canManageHandover`): the DLP
  defaults to the contract's `defectLiabilityMonths` (12 when empty), the project becomes `COMPLETED`, and the
  standard checklist (`DEFAULT_CLOSEOUT_ITEMS`) is added when the project has none. Removing it sets the project
  back to `ACTIVE`.
- **Summary.** `GET /projects/:id/handover` returns the completion, snag and defect counts (overdue, cost of
  defects), retention and security deposit still with the client (from receipts, only for `canViewContract`
  roles), and the checklist. Guests (client's engineer, consultant) are kept out.
- **Reminders.** `NotificationJobsService.handoverDue` (with the daily digest, or `GET
  /notifications/jobs/handover-due`) tells the accounts keepers and the project manager once when the DLP comes
  within 30 days of its end and once when it is over, to claim back retention; and tells the assignee and project
  manager when an open entry passes its due date (`DEFECT` notification, hidden from older phone builds).
- **Web and phone.** A Handover tab on the project. The phone has Snags & defects under Submit: report with photos
  (online), list by status, mark fixed with photos after, accept or reopen.

## Lists: paging, search, sort and export

`GET /progress`, `/dpr`, `/material-requests`, `/attendance`, `/stock/entries`, `/stock/balances`, `/stock/items`,
`/machinery-logs`, `/equipment`, `/expenses`, `/measurements`,
`/projects` and `/users` return `Paginated<T>`
(`items`, `total`, `page`, `pageSize`). They share `PageQuery` (`apps/api/src/common/paging.ts`):

- `page` (1-based) and `pageSize` (default 25, max 500; `limit` is a deprecated alias).
- `q`: case-insensitive search. Each word must match one of the list's columns (for example progress
  searches activity, location, remarks, project and submitter), so "cement urgent" narrows rather than widens.
- `sortBy` from the list's allowed columns in `LIST_SORT_FIELDS` (`packages/shared/src/paging.ts`) and
  `sortOrder`; an unknown column is a 400. Every sort ends with `id` so pages never overlap.
- The usual filters still apply (`projectId`, `status`, `mine`, project `type` / `status`, user `roleKey` /
  `isActive`). Query-string booleans are parsed strictly (`?mine=false` is false).

Visibility rules are unchanged: paging runs on the same `submissionWhere` / `projectWhere` clauses.
Dropdowns that need every project or user ask for one page of 500. BOQ items and activities stay
unpaged per-project arrays.

On the web, `useListState` holds a table's page, size, search and sort, and the progress, DPR and
material request tables are one `*List` component used both on their own page and inside the project
tabs. Export fetches every matching row page by page with the current filters (not just the visible
page) and writes `.xlsx` in the browser with SheetJS; column layouts live in `src/lib/exportColumns.ts`.
Material requests export one row per item so quantities can be summed.

## Attendance

The site supervisor records who worked each day: `AttendanceSheet` (one per project per day, unique on
`projectId` + `date`) holds `AttendanceLine` rows of contractor (`Departmental` for the company's own
workers), trade and head count. `totalWorkers` is stored on the sheet so lists sort and total cheaply.

- **Not an approval submission.** Attendance has no status columns and is not in the approvals queue.
  It feeds the day's DPR, and the DPR is what the PM approves. A sheet stays editable until that DPR is
  approved, then it locks (`isAttendanceLocked` in `packages/shared/src/permissions.ts`).
- **Who.** Team leaders, site engineers and approvers record and correct it (`ATTENDANCE_RECORDER_ROLES`,
  checked by `ProjectAccessService.assertCanRecordAttendance`); everyone who can see the project can
  read it. Every create, edit and delete is in `AuditLog` as entity type `ATTENDANCE`.
- **API.** `GET /attendance` (paged; `projectId`, `from`, `to`, `q` over project, recorder, remarks,
  contractor and trade), `GET /attendance/day?projectId&date` (`sheet: null` when not recorded),
  `GET /attendance/suggestions` (contractor and trade names used before), `POST` (optional client `id`,
  idempotent like the submissions; 409 if the day already has a sheet), `PATCH /:id` (`lines` replaces
  all rows) and `DELETE /:id`. Rows with the same contractor and trade are merged and zero rows dropped
  (`normalizeAttendanceLines` in shared).
- **Feeding the DPR.** `attendanceToManpower` adds the rows up by trade. The web and site-app DPR forms
  fill manpower from the day's sheet (or, offline, from a sheet still in the phone's outbox) until the
  user edits it, and `POST /dpr` without manpower takes it from the sheet on the server, so a DPR queued
  offline after the attendance still gets the figures. Editing the sheet later does not change a DPR
  that already exists.

## Stock

The store register per project, fed by approved material requests:

- **Tables.** `Item` is the organisation's material master (unique on name + unit). `StockEntry` is one
  document: a `RECEIPT` (GRN), `ISSUE` or `ADJUSTMENT`, numbered `GRN-` / `ISS-` / `ADJ-<year>-0001`
  per organisation. Its lines are `StockTxn` rows with a signed quantity (receipts positive, issues
  negative) plus copies of project, item, type and date, so a balance is a `groupBy` sum without joins.
  `StockMinLevel` holds the minimum of an item at a project.
- **Rules.** A GRN is against an `APPROVED` material request; each line may take up to what is still
  pending on it (`StockTxn.materialRequestItemId` records which line), and the request line's name and
  unit find or create the `Item`. An issue may not exceed the stock on hand, an adjustment may not take
  it below zero, and deleting an entry is refused when its stock has since been issued. Every stock write
  of an organisation runs in a transaction under a Postgres advisory lock, so two issues racing for the
  same stock cannot both pass and entry numbers never collide. Creates take an optional client `id`
  like the submissions. Dates may be back-dated, not set in the future.
- **Roles.** Receive and issue: `STOCK_KEEPER_ROLES` (store manager, site engineer, approvers). Item
  master and minimum levels: store manager or approver (`canManageStore`). Adjustments and deleting
  entries: approvers (`canAdjustStock`). Checks live in `ProjectAccessService.assertCanKeepStock` /
  `assertCanManageStore` / `assertCanAdjustStock`; anyone who sees the project can read its stock.
- **Not an approval submission.** Entries have no status; the approval happened on the material request.
- **Low stock.** When an issue, adjustment or deletion takes an item from at-or-above its minimum to
  below it (`crossesBelowMin` in shared), the project's store managers and its PM get a `LOW_STOCK`
  notification (in-app and push), deduplicated per entry and item. Balances carry a `low` flag and the
  list filters on it.
- **API.** `GET /stock/balances` (paged in memory after the sums; `projectId`, `lowOnly`, `inStock`, `q`),
  `GET /stock/entries` (paged; `projectId`, `type`, `itemId`, `materialRequestId`, `from`, `to`, `q`),
  `GET /stock/receivable` (approved requests with pending quantities), `POST /stock/receipts`,
  `/stock/issues`, `/stock/adjustments`, `DELETE /stock/entries/:id`, `PUT /stock/min-levels`, and the
  item master under `/stock/items`. Material request lines now carry `receivedQty`.
- **Clients.** Web: Stock page (stock on hand with minimum editor and item ledger, register, item
  master) and a Stock tab per project; the material request drawer shows received quantities and a
  Receive button. Site app: `app/stock/` (stock on hand, receive, issue), online only because the
  pending and on-hand checks need the server.
- **Transfers, returns and counts.** Four more entry types: `TRANSFER_OUT` (`TRO-`) takes stock out of one
  project's store with `toProjectId`; the receiving store books a `TRANSFER_IN` (`TRI-`, linked by
  `transferOutId`) for the full quantities, once, on or after the sent date. Until then the transfer is "on the
  way" (`GET /stock/transfers/incoming`) and the sender cannot delete it once received. `RETURN_TO_VENDOR`
  (`RTV-`, supplier and reason required) takes stock out; `RETURN_FROM_SITE` (`RFS-`) brings unused material
  back, up to what is out on site (issued net of returns), and comes off the project's material cost. A stock
  count (`POST /stock/counts`) posts the differences between counted and book quantities as one adjustment and
  returns `{counted, entry}` (`entry` null when everything matched). Balances show transfers in their own
  column; returns from site net off issued, returns to vendor off received.
- **Valuation.** `GET /stock/valuation` values stock on hand at the item master rate and ages it first in,
  first out over the inward movements (0-30, 31-90, 91-180, over 180 days). Store managers, approvers and
  anyone who sees project cost.
- **Older phones.** Installed site-app builds only know the first three types, so `GET /stock/entries` lists
  receipts, issues and adjustments unless `allTypes=true` or a `type` is asked for. Current web and app send
  `allTypes`.

## Machinery

- **Tables.** `Equipment` is the organisation's fleet: unique `code`, name, category, `ownership`
  (`OWNED` / `HIRED`, with the hire agency in `supplier`), registration number, `rate` per `rateUnit`
  (`HOUR` / `DAY` / `MONTH`) and the project it is deployed at now (`projectId`, null = yard). A machine
  with logs cannot be deleted, only marked inactive; inactive machines cannot be logged.
  `MachineryLog` is one machine's day at one project: hours worked, idle and breakdown, hour meter
  start / end, diesel litres, operator, optional activity, work done, breakdown note and photos, plus
  the six status columns.
- **Rules.** Worked + idle + breakdown may not exceed 24, the meter may not run backwards and breakdown
  hours need a note (`machineryLogProblem` in shared, used by the API and both clients). A machine has
  at most one log per day that is not rejected; creates and edits check this under a per-machine
  advisory lock, so two phones logging the same machine cannot both succeed, and resubmitting a rejected
  log is refused once another log took its day. Creates take an optional client `id` (offline outbox).
- **Roles.** Log: `MACHINERY_LOGGER_ROLES` (team leader, site engineer, store manager, approvers) on
  projects they can see. Review: approvers, as for every submission. Equipment master: approvers
  (`canManageEquipment`); the `rate` field is returned to approvers only.
- **API.** `/equipment` (paged; `projectId`, `ownership`, `includeInactive`, `q`) with POST / PATCH /
  DELETE, and `/machinery-logs` (paged; `projectId`, `equipmentId`, `status`, `from`, `to`,
  `breakdownOnly`, `mine`, `q`) with the usual create / edit / submit / delete. Review and audit go
  through `/approvals/machinery/:id/...`.
- **Clients.** Web: Machinery page and project tab (daily logs with review, equipment master, Excel
  export of both). Site app: `app/machinery/new.tsx` (offline-capable) and `[id].tsx`, a Submit tile,
  a Machinery segment in My submissions and a section in Approvals.

## Site expenses

- **Table.** `Expense`: project, `expenseNo` (`EXP-<year>-0001` per organisation, allocated under an
  advisory lock), date, `category` (`ExpenseCategory`), description, vendor, vendor GSTIN, bill number,
  taxable `amount`, `gstRate`, `gstAmount`, `totalAmount`, `paymentMode`, optional activity, remarks,
  bill photos and the six status columns.
- **GST.** The API computes GST as rate × amount (`gstFor` in shared). A bill's own GST may be sent
  instead and is accepted within ₹1 of the computed figure (bills round per line). Changing the amount
  or rate on an edit recomputes GST unless the bill's GST comes with it. GSTIN is checked against the
  15-character pattern.
- **Roles.** File: `EXPENSE_SUBMITTER_ROLES` (team leader, site engineer, store manager, accounts,
  approvers). Approve: approvers, as for every submission.
- **Cost.** Only `APPROVED` expenses are project cost. `GET /expenses/summary` returns, for the same
  filters as the list, the count, taxable / GST / total, approved and pending totals and totals by
  category; the web list shows it above the table.
- **API.** `/expenses` (paged; `projectId`, `status`, `category`, `paymentMode`, `from`, `to`,
  `noReceipt`, `mine`, `q`) with create / edit / submit / delete, `/expenses/summary`, and review and
  audit through `/approvals/expense/:id/...`.
- **Clients.** Web: Site Expenses page and project tab (totals, category chips, filters, Excel export).
  Site app: `app/expense/new.tsx` (bill photo, GST chips, live total, offline-capable) and `[id].tsx`.

## Measurement book

- **Tables.** `MeasurementSheet`: project, BOQ item, `mbNo` (`MB-<year>-0001` per organisation, from
  `common/doc-number.ts`, the helper expenses use too), date, location (chainage, grid, floor),
  remarks, `totalQty` in the BOQ item's unit, photos or sketches and the six status columns.
  `MeasurementLine`: description, optional nos / length / breadth / depth, `deduct`, signed `quantity`.
- **Arithmetic.** `measurementLineQty` in shared: nos × L × B × D with blank factors counted as 1,
  rounded to 3 decimals, negative for a deduction. A line needs nos or at least one dimension and the
  sheet total must be above zero. The API recomputes every line; what the client sends as quantity is
  ignored. An edit with `lines` replaces all lines.
- **Rollup.** `GET /projects/:id/boq` adds `measuredQty` (approved sheets), `measuredAmount` (× rate)
  and `pendingMeasuredQty` (submitted). The measured quantity is what RA billing (v3) will bill; the
  activity progress (`executedQty`) stays the site's own count and the two sit side by side on the BOQ tab.
- **Roles.** Record: `MEASUREMENT_ROLES` (QS, site engineer, PM, management, admin). Approve: approvers.
- **API.** `/measurements` (paged; `projectId`, `boqItemId`, `status`, `from`, `to`, `mine`, `q`) with
  create / edit / submit / delete, review and audit through `/approvals/measurement/:id/...`.
- **Clients.** Web: Measurement Book page and project tab (line editor with live totals, Excel export one
  row per line), Measured column on the BOQ tab. Site app: `app/measurement/new.tsx` (offline-capable)
  and `[id].tsx`.

## Inspections

- **Tables.** `ChecklistTemplate`: a named list of points per organisation (`items` String[]); "Add standard
  checklists" copies `STANDARD_CHECKLISTS` from `packages/shared/src/quality.ts`. `Activity` gains
  `checklistTemplateId` (the checklist its inspections start from) and `holdPoint`. `Inspection`: project, activity,
  `inspectionNo` (`INS-<year>-0001`), the date the work is ready, location, remarks, `checklistName` and `checklist`
  (JSON copy of the points, `[{ item, result: PASS | FAIL | NA | null, remark }]`, so editing a template never changes
  an inspection), photos (`Attachment.inspectionId`) and the six status columns.
- **Lifecycle.** A submission of type `INSPECTION`: requested = SUBMITTED, passed = APPROVED, failed = REJECTED,
  re-inspect = CHANGES_REQUESTED (site rectifies, edits if needed and requests again on the same record). Labels for
  this wording are `INSPECTION_STATUS_LABELS`; notifications say "requested", "passed", "failed".
- **Inspecting.** `POST /inspections/:id/inspect` takes one result per point, a note, extra photos and the decision,
  saves the results and calls `lifecycle.review`. Pass needs no point Not OK; fail and re-inspect need a point Not OK
  or a note (the points Not OK are appended to the review note). The generic `/approvals/inspection/:id/review`
  refuses, so an inspection is never passed without its checklist.
- **Who.** Request: `INSPECTION_REQUEST_ROLES` (team leader, site engineer, QA/QC, approvers). Inspect: the approval
  matrix; under the fixed rule `SPECIALIST_APPROVERS` adds QA/QC to the approvers for `INSPECTION` only
  (`defaultApproverRoles`). Checklists: `CHECKLIST_ADMIN_ROLES` (QA/QC, PM, management, admin). The activity's
  checklist and hold point are set with the activity (project editors).
- **Hold points.** `InspectionsService` registers `beforeApprove('PROGRESS')`: progress of a hold-point activity is
  approved only when a passed inspection of that activity exists at the same location (case and spacing ignored;
  `sameLocation`), or any passed inspection when the progress entry gives no location.
- **Clients.** Web: Site → Inspections (list, checklists tab), project tab, drawer with the inspector's checklist,
  activity form fields. Site app: request (`app/inspection/new.tsx`, offline-capable) and `[id].tsx`, where QA/QC
  records the checklist.

## Tests and NCRs

Registers, not approval submissions (`QualityService`, `/quality/...`).

- **Tables.** `QualityTest`: project, optional activity, `testNo` (`TST-<year>-0001`), `kind` (`TestKind`), what was
  sampled, location, `sampledOn`, the specification as written plus `specMin` / `specMax` / `unit`, `result`
  (PENDING / PASS / FAIL), remarks, photos (`Attachment.qualityTestId`). `QualityTestReading` (child, no
  `organizationId`, so no RLS policy of its own): label, `dueOn`, `value`, `testedOn`, in `sortOrder`. A new test gets
  its kind's readings from `TEST_KIND_DEFAULTS` (cubes: 7 and 28 days after sampling). `Ncr`: `ncrNo`
  (`NCR-<year>-0001`), title, description, location, `severity`, `status` (OPEN / ACTION_TAKEN / CLOSED), raiser,
  `actionById` (who rectifies) and `dueDate`, `cause` / `correctiveAction` / `preventiveAction` / `actionAt`,
  `closedById` / `closedAt` / `closureNote`, optional links to the activity, the inspection and the test, photos
  (`Attachment.ncrId`).
- **Result.** `judgeTest` (shared): with a specification the last reading decides (the 28-day cubes, not the 7-day
  ones); PENDING until it has a value. Without one the result is as recorded. A change to FAIL sends `TEST_FAILED`.
- **NCR flow.** Raise (QA/QC or an approver, `NCR_ROLES`) → site records the cause and corrective action
  (`POST /quality/ncrs/:id/action`; the assignee or `INSPECTION_REQUEST_ROLES`, `canActOnNcr`) → QA/QC closes it
  (`/close`, only from ACTION_TAKEN) or reopens it with a note (`/reopen`). Every step writes `AuditLog` (`NCR`) and
  notifies (`NCR`). An NCR is deleted only while OPEN with no action, by its raiser or an approver.
- **Who.** Record tests and readings: `QUALITY_TEST_ROLES` (as for inspections) with project access. The
  specification, kind and a recorded result: whoever recorded the test, QA/QC or an approver (`canEditTest`).
- **Reminders.** `NotificationJobsService.testsDue` sends `TEST_DUE` once per reading due on or before the day with
  no value, to the test's recorder and the project's quality approvers who are on the project
  (`ProjectAccessService.qualityWatchers`). It runs after the approval digest (same cron), in-process with it, or
  alone at `jobs/tests-due`.
- **Clients.** Web: Site → Quality has tabs Inspections / Tests / NCRs / Checklists (`?tab=`, `?id=` opens a test or
  NCR from a notification); a project's Quality tab shows the first three. Raise NCR from a failed test or an
  inspection that failed or was sent back. Site app: `app/quality.tsx` (open NCRs, pending tests), `ncr/[id].tsx`
  (record the action with photos; QA/QC closes or reopens) and `test/[id].tsx` (enter readings).

## Document register

Registers, not approval submissions (`DocumentsService`; `/documents`, `/transmittals`, `/letters`).

- **Tables.** `Document`: project, `docNo` (as issued, unique per project), title, `kind`, `discipline`, remarks and
  `currentRevisionId`. `DocumentRevision` (child, no RLS policy of its own): `revision` (unique per document),
  `issuedOn`, `status` (`RevisionStatus`), who issued it, remarks, files (`Attachment.revisionId`). The current
  revision is the latest issued (then the latest added); the service keeps `currentRevisionId` in step on every
  add, change and delete, so lists filter and sort by it. `Transmittal` (`TRN-<year>-0001`): to, attention,
  `purpose`, `sentOn`, remarks, `acknowledgedOn` / `acknowledgedBy`; `TransmittalItem` (child) lists revisions with
  copies. `Letter`: `direction` IN / OUT numbered `IN-` / `OUT-<year>-0001`, their reference, date, party, subject,
  gist, `replyBy` (IN only), `inReplyToId` (another letter), `riskId` (a delay or risk), files (`Attachment.letterId`).
- **Rules.** A revision sent on a transmittal is kept (`onDelete: Restrict`), so is its document; withdraw it with a
  new revision marked Withdrawn. An acknowledged transmittal keeps its list and cannot be deleted. A received letter
  awaits a reply while it has `replyBy` and no OUT letter answers it.
- **Who.** Anyone with project access reads the register and transmittals. `DOCUMENT_CONTROL_ROLES` (admin,
  management, PM, QS, QA/QC) change them. Letters are contractual: `CORRESPONDENCE_ROLES` (admin, management, PM, QS)
  read and record them; others get 403 and no Letters tab.
- **Notification.** A revision that becomes current with status `FOR_CONSTRUCTION` sends `DOCUMENT_ISSUED` to the
  project's manager and members (`ProjectAccessService.projectPeople`), once per revision.
- **Clients.** Web: Site → Documents with tabs Register / Transmittals / Letters (`?tab=`, `?id=` opens a document,
  `&letter=` a letter) and a project Documents tab; the document drawer sends its current revision on a transmittal;
  the transmittal prints a cover sheet; a delay's drawer lists its letters. Site app: `app/documents.tsx` lists a
  project's current revisions (`GET /documents/site`, cached for offline) and "Save offline" downloads their files to
  the app's document directory (`src/offline/drawings.ts`, removing superseded ones). Saved PDFs open from the phone
  (Android: a PDF viewer through `expo-intent-launcher`; iOS: the preview sheet through `expo-sharing`), images in the
  app; unsaved files open online.

## Staff and leave

The company's own staff, separate from contractor labour (`StaffService`; `/staff/*`). Leave has its own approval
flow, not `SubmissionLifecycleService`: it is a person's request, not site data a manager signs off.

- **Tables** (tenant tables). `Employee`: `employeeCode` (unique per organisation, `EMP-001` when left blank), name,
  designation, department, phone, `userId` (their login, unique; optional), `projectId` (posting; null = head
  office), `joinedOn`, `leftOn` / `isActive` (records are never deleted). `StaffAttendance`: one row per employee per
  day (`status` PRESENT / HALF_DAY / ABSENT, the site worked at, `checkIn` / `checkOut` when they checked in
  themselves, `overtimeHours`, note, who marked it). `LeaveRequest`: `type` (`LeaveType`), from / to, `halfDay`,
  `days` (working days), reason, `status` (`LeaveStatus`), who applied and decided, decision note. `Holiday`: a date
  for every site (`projectId` null) or one site.
- **Calendar.** Sunday is the weekly off everywhere; leave days skip Sundays and the employee's site holidays
  (`leaveDays` in `packages/shared/src/staff.ts`, also used by the web and app forms). A standard day is 9 hours:
  check-out records overtime past it in half hours, and under half a day marks a half day.
- **Balances** are per calendar year (leave counts in the year it starts; a request cannot span two years): casual
  12, sick 12, earned 15 (`LEAVE_ENTITLEMENT`), comp-off = weekly offs and holidays worked (half a day earns half),
  unpaid without limit. Waiting and approved requests both count. Applying or approving beyond the balance, or
  overlapping other waiting or approved leave, is refused; an advisory lock per employee serialises the check.
- **Who.** `STAFF_ADMIN_ROLES` (admin, management, HR) keep the staff master and holidays, see everyone and decide
  anyone's leave. Attendance recorders (`canMarkStaff`) see and mark the staff posted at their projects. Leave is
  decided by a staff admin or the manager of the employee's posting project, never by the employee
  (`ProjectAccessService.canDecideLeave` / `leaveDeciderWhere`). Everyone checks in and applies for their own leave
  once HR links their login; a staff admin can apply for someone else. The employee (before it starts) or a staff
  admin (any time) cancels.
- **Notification.** `LEAVE`: an application goes to HR managers and the posting's project manager (admins and
  management when the company has no HR); a decision goes to the employee and whoever applied.
- **Clients.** Web: People → Staff & Leave with tabs My attendance & leave, Leave (`?leave=` opens one), Staff
  register, Staff and Holidays. Site app: My attendance & leave (`app/staff.tsx`: check in and out, balances, apply,
  leave waiting on you) and Staff register (`app/staff-register.tsx`).

## Payroll inputs

Read-only reports (`PayrollService`; `GET /payroll/staff`, `GET /payroll/contractors`, `?month=YYYY-MM&projectId=`).
Nirmaan hands the payroll provider its inputs; PF, ESI, professional tax and salary TDS are worked out there.

- **Staff month.** Per employee on the rolls for any part of the month (`joinedOn` / `leftOn`): days on the rolls,
  Sundays and holidays (at their site), working days, present (a half day counts half), approved leave by type
  (working days only; a half-day leave counts half and the other half follows the attendance), absent, days not
  marked (working days up to today with neither attendance nor leave; not deducted, flagged for checking), Sundays
  and holidays worked (comp-off earned), overtime hours, loss-of-pay days (absent, leave without pay, the unworked
  half of a half day without leave) and paid days = days on the rolls - loss of pay. For `PAYROLL_ROLES` (admin,
  management, HR, accounts).
- **Labour contractors' month.** Attendance lines summed by contractor, project and trade: days with a sheet,
  man-days, the trade's `LabourRate` and amount. A contractor with an approved work order on the project is marked,
  since they are paid through its bills (and project cost leaves them out of labour). For payroll roles and
  `COST_VIEW_ROLES`, limited to the projects the user can see.
- **Client.** Web: People → Payroll Inputs, tabs Staff and Labour contractors, a month picker (the month just ended
  until the 10th) and Excel export of each.

## Clients and contracts

- **Tables.** `Client` is the organisation's client master (unique name; department, GSTIN, PAN, GST `stateCode`,
  billing address, contact, `isActive`). The state code and PAN follow the GSTIN when one is given. A project
  links to it with `Project.clientId`; `Project.clientName` keeps a copy of the name (renaming the client renames
  it on its projects) so lists, search and reports work unchanged, and stays free text on projects without one.
- **Contract terms** are columns on `Project`: `agreementNo` / `agreementDate` (next to the existing work order,
  contract value and dates), `retentionPct`, `securityDepositPct`, `mobilisationAdvance` with `advanceRecoveryPct`,
  `defectLiabilityMonths`, `priceVariation`, and the bill rates `gstRate`, `tdsPct`, `gstTdsPct`, `labourCessPct`
  (all percentages of the work value, `Decimal(5,2)`, 0 by default except GST 18). Settings, not code, because they
  differ by client and change with the rules.
- **Extensions of time** come from the delay register: a delay has `eotClaimed` and, once the client grants it,
  `eotGrantedDays`. The contract's revised completion is the agreement's end date plus the days granted.
- **Roles.** Contract terms and bills are seen by `BILLING_ROLES` (admin, management, PM, QS, accounts) on projects
  they can see; the client master and contract terms are changed by `CONTRACT_EDITOR_ROLES` (admin, management, PM,
  accounts). The client list itself is readable by anyone signed in (pickers).
- **API.** `/clients` (paged; `q`, `includeInactive`) with POST / PATCH / DELETE (a client with projects is made
  inactive instead), `GET` / `PUT /projects/:id/contract` (`ProjectContractDto`, only the fields sent change), and
  `clientId` on `POST` / `PATCH /projects`.
- **Clients.** Web: Billing → Clients page, a Contract tab on each project (agreement, bill percentages, extensions
  from the delay register) with an edit form, a client picker on the project form, and "EOT granted" on delays.

## RA bills

- **Tables.** `RaBill` (number per project, `isFinal`, `billDate`, `measuredUpTo`; work value previous / this bill /
  up to date; `gstRate` / `gstAmount`; the six deduction percentages copied from the project and their amounts, an
  `otherDeduction` with a note, `totalDeductions`, `netPayable`; `claimedGross` / `claimedNet`; `stage` NOT_SENT →
  SENT → CERTIFIED → PAID with their dates and the certificate number; the six submission status columns).
  `RaBillItem` per BOQ item: BOQ quantity and rate at the time, `prevQty`, `thisQty`, `uptoQty`, `certifiedQty`,
  `amount`. `MeasurementSheet.raBillId` says which bill took a sheet; `Attachment.raBillId` holds documents.
- **Building a bill** (`RaBillsService.recompute`, in one transaction). The bill takes every `APPROVED` sheet of the
  project with no bill and a date up to `measuredUpTo`. Up to date quantity per BOQ item = all sheets in earlier bills
  and this one; previous = what earlier bills passed (`certifiedQty`, else `thisQty`); this bill = the difference, so a
  quantity the client cut comes back in the next bill. Amounts are quantity × rate rounded to paise; each deduction is
  its percentage of this bill's work value, advance recovery capped at the advance not yet recovered; net = work + GST
  − deductions. A draft or returned bill is rebuilt on every edit and on submit, so measurements approved meanwhile are
  included. Only one bill per project may be unapproved (advisory lock `RA:<projectId>`), and nothing follows a final bill.
- **After approval** the bill is recorded as sent and certified (`POST /ra-bills/:id/send|certify`, billing roles).
  Certifying with lower quantities keeps the first claim, re-prices the bill on the certified quantities and
  rebuilds the next bill if it is still open. It becomes paid through receipts (below).
- **Roles.** Prepared and moved along by `BILLING_ROLES`; seen by them and by any role the approval matrix lets
  approve `BILL` (amount basis: the work value before GST and deductions). A BOQ item that has been billed cannot be deleted.
- **API.** `/ra-bills` (paged; `projectId`, `status`, `stage`, `q`), `GET /ra-bills/:id` (with the measurements and
  their lines), `POST` (draft unless `submit`), `PATCH`, `POST /:id/submit`, `DELETE` (not approved only); review
  and audit through `/approvals/bill/:id/...`.
- **Clients.** Web: Billing → RA Bills and an RA Bills tab on each project (prepare form, drawer with the abstract,
  deductions, measurements and stage actions, print view in `components/bills/billPrint.ts`, Excel export). The
  measurement book shows which bill took each sheet. Site app: `app/bill/[id].tsx` to read and approve.

## Variations

- **Tables.** `Variation` (number per project, `V-n`; title, `cause`, justification; `status` DRAFT → SUBMITTED →
  APPROVED / REJECTED; `claimedAmount`, `approvedAmount`; sent date and our reference; decision date, the client's
  reference and a note). `VariationLine`: a quantity change on a BOQ item (`boqItemId`, BOQ rate) or a new item
  (`isNewItem`, item no., description, unit, proposed rate), with `approvedQty` / `approvedRate` once decided.
  `Attachment.variationId` holds the instruction, drawing or estimate. Not a submission: the client decides, not the
  approval matrix.
- **Extra items.** A BOQ item with no quantity (original 0, no revised quantity) is an extra item waiting for a
  variation. `RaBillsService.recompute` takes only sheets of items that have a quantity (`BILLABLE_BOQ_ITEM`), so a
  measured extra item stays out of the bill and the unapproved bill lists it in `heldExtraItems`. The BOQ form refuses
  to give an extra item a quantity by hand.
- **Approval** (`POST /variations/:id/decide`, one transaction, advisory lock `VAR:<projectId>`) applies the approved
  quantities: an existing item's revised quantity moves by the approved change, an extra item gets its quantity and
  the approved rate, and a new item is added to the BOQ (original 0, revised = approved). An approved variation cannot
  be edited or deleted. Revised contract value = contract value + approved variations, on `ProjectSummary`, the
  contract and `GET /variations/summary`; the dashboard's financial progress uses it.
- **Roles.** Prepared, sent and decided by `VARIATION_ROLES` (admin, management, PM, QS); read by `BILLING_ROLES`.
- **API.** `/variations` (paged; `projectId`, `status`, `q`), `GET /variations/summary`, `GET /:id`, `POST`, `PATCH`
  (until approved; `lines` replaces all), `POST /:id/submit`, `POST /:id/decide`, `DELETE` (not approved).
- **Clients.** Web: Billing → Variations and a Variations tab on each project (totals, register, drawer with the send
  and decision steps); the Contract tab shows the revised contract value and the RA bill drawer warns about held
  extra items. No site app screen: variations are office work.

## Budget and cash flow

- **Tables.** `ProjectBudget` (one per project; an amount per cost head: expenses, material, machinery, labour,
  subcontract; notes; who set it). `BoqItem.budgetRate` is our budgeted cost per unit (never sent in `BoqItemDto`, so
  site roles do not see it). `Project.clientPaymentDays` is a contract term (null = 30 days, `DEFAULT_CLIENT_PAYMENT_DAYS`).
- **Forecast** (`BudgetService`). % complete = executed value (approved progress × BOQ rate) ÷ BOQ value, capped at
  100%. Budget at completion = the cost-head total, else Σ BOQ qty × budget rate. Actual cost is `CostService.compute`
  from the start of the project. Earned = budget × % complete; variance = earned − actual; forecast at completion =
  actual + budget × (1 − % complete); forecast margin = revised contract value − forecast.
- **Cash flow** (`CashFlowService`, six months or twelve weeks from today). In: open RA bills (receivables summary) due
  the payment days after sending, approved bills not sent due the payment days after the bill date, retention and
  deposit held at the release date, and work still to bill (revised contract value − approved bills' work value) spread
  evenly to the revised completion date, paid the payment days later, × (1 + GST − retention − SD − TDS − GST TDS − cess).
  Out: open vendor and subcontractor bills (payables summary) by due date, and the forecast to complete spread evenly
  to completion. Anything due before today goes in the first period. A project with no budget has no "cost still to
  spend"; one past or without a completion date is spread over the next 91 days. Completed and closed projects only
  contribute their open bills.
- **Roles.** Seen by cost viewers (`COST_VIEW_ROLES`); set by `BUDGET_ROLES` (admin, management, PM).
- **API.** `GET /cost/projects/:id/budget`, `PUT /cost/projects/:id/budget` (`heads` null removes the cost-head
  budget; `items` sets BOQ budget rates, the rest keep theirs), `GET /cost/cash-flow?projectId&granularity=MONTH|WEEK`.

## Vendors

- **Table.** `Vendor` (tenant table, name unique per organisation, case-insensitive in the service): `kinds`
  (SUPPLIER, HIRE_AGENCY, SUBCONTRACTOR, LABOUR_CONTRACTOR, SERVICE), GSTIN, PAN and state code (both taken from the
  GSTIN), address and contact, `msmeCategory` and `udyamNo`, bank account name / number / IFSC / bank. `Expense`,
  `Equipment` and `StockEntry` have a `vendorId` and keep their text field (`vendor`, `supplier`) as a copy of the name.
- **Linking** (`VendorsService.resolve`). A `vendorId` links and sets the name (and an expense's GSTIN when none is
  given); `vendorId: null` unlinks and keeps the typed name; a typed name without an id links to the active vendor of
  that name. Adding or renaming a vendor links the unlinked entries that typed its name, and a rename updates the copy
  on linked entries. A vendor in use cannot be deleted, only made inactive.
- **Roles.** Everyone reads the master (pickers); `canEditVendors` (admin, management, PM, procurement, accounts,
  stores) edits it; bank details are returned to and changed by `canSeeVendorBank` (admin, management, procurement,
  accounts) only.
- **API.** `/vendors` (paged; `kind`, `msme`, `includeInactive`, `q`), `GET /vendors/unlisted` (names in use that are
  not in the master), `GET|PATCH|DELETE /vendors/:id`. Web: Purchases → Vendors; `VendorPicker` on the expense, machine and GRN
  forms.

## Purchasing

Material request → quotations → comparative statement → purchase order → GRN against the PO → vendor bill with a
three-way match (`apps/api/src/purchasing`).

- **Tables** (tenant tables). `Quotation` + `QuotationLine` (a vendor's rate and GST per line of an approved
  material request; one quotation per vendor per request). `PurchaseOrder` + `PurchaseOrderLine` (numbered
  `PO-<year>-0001`, optional `materialRequestId` / `quotationId`, freight, payment days, delivery date,
  `closedAt` / `closeNote`). `VendorBill` + `VendorBillLine` (numbered `VB-<year>-0001`, the vendor's invoice number
  unique per vendor, lines against PO lines, `matched` and `exceptions` stored at save). `StockEntry.purchaseOrderId`
  and `StockTxn.purchaseOrderLineId` tie a GRN to the PO. POs and vendor bills are approval submissions
  (`PURCHASE_ORDER`, `VENDOR_BILL`) with the six status columns; their amount for the approval matrix is the total.
- **Comparative.** `GET /material-requests/:id/comparative` puts the quotations side by side; the lowest landed rate
  (rate with GST) per line is marked, and `lowestQuotationId` is the cheapest quotation that covers every line.
- **Ordering.** An MR-linked PO line may order at most what the request line still needs: requested less what other
  POs hold (a closed PO holds only what it received) less what was received directly against the request.
  `MaterialRequestItemDto.toOrderQty` carries that. Editing a PO is allowed until it is approved; an approved PO
  is closed short (with a note) instead of edited or deleted. Approving a PO sets `Item.rate` of each line's item
  (found or created by name and unit) through the lifecycle's `onApproved` hook.
- **Receiving.** `POST /stock/receipts` with `purchaseOrderId` receives against an approved, open PO: supplier,
  vendor and request come from the PO, each line may take up to what is still pending on its PO line, and the stock
  line also counts against the request line. Receipts against a request without a PO work as before.
- **Three-way match** (`VendorBillsService.match`). Per line: quantity billed against received less billed on
  other non-rejected bills; rate against the PO rate (higher is an exception); GST rate against the PO's. Freight
  against what is left of the PO's freight; freight carries no GST. Exceptions are recorded and shown, not
  blocking: the approver decides. A closed PO can still be billed for what was received. A GRN cannot be deleted
  once bills need its quantity.
- **MSME.** Payment days default to 30 and may not exceed 45 for a micro or small vendor (MSMED Act s.15); a bill's
  due date is invoice date + the PO's payment days, capped at 45 for such vendors.
- **Roles.** `canPurchase` (admin, management, PM, procurement) enters quotations and raises POs;
  `canViewPurchaseOrders` adds the store, accounts and site engineers; `canRecordVendorBill` (admin, management,
  procurement, accounts) records bills, and `canViewVendorBills` adds PMs. The demo seed's approval matrix lets PMs
  approve POs and vendor bills up to ₹5 lakh and management without limit. An organisation that already has its own
  matrix needs rules for the two new types; until then only Admin approves them.
- **API.** `GET /material-requests/:id/quotations`, `/quotations` (`POST`, `GET|PATCH|DELETE /:id`),
  `/purchase-orders` (paged; `projectId`, `vendorId`, `materialRequestId`, `status`, `open`, `q`),
  `GET /purchase-orders/receivable`, `POST /purchase-orders/:id/submit|close`, `/vendor-bills` (paged; `projectId`,
  `vendorId`, `purchaseOrderId`, `status`, `exceptions`, `q`), `POST /vendor-bills/:id/submit`.
- **Clients.** Web: Purchases → Purchase Orders and Vendor Bills, a Purchase Orders tab per project, and on an
  approved material request the comparative with "Raise PO"; PO print view in `components/purchasing/poPrint.ts`.
  The GRN form picks a PO or a request. Site app: approve POs and vendor bills, and receive against a PO.

### GRN QA/QC, delivery status, units and financial years

`POST /stock/entries/:id/qc` records QA/QC's check of a GRN (`canCheckGrn`: QA/QC and approvers, through
`assertCanCheckGrn`): `StockEntry.qcStatus` ACCEPTED, PARTLY_ACCEPTED or REJECTED with `qcAt`, `qcById` and a note,
which is required unless accepted. Partly accepted takes a rejected quantity per line (`StockTxn.rejectedQty`, at most
the quantity received); rejected marks every line in full. It can be recorded again to correct it and is audited as
`QC_<status>`. Stock is not changed: rejected material goes back with a return to vendor. `GET /stock/entries?qc=`
filters by result, with `PENDING` for receipts not yet checked.

`GET /purchase-orders/status` (purchase order viewers; `show` PENDING, LATE or ALL, `projectId`, `vendorId`, PO date
`from`/`to`) lists approved orders with ordered, received and pending quantity and value per line from the receipts
against each PO line, the delivery state (nothing received, partly received, received, closed short), days late
against `deliveryBy`, the last receipt and GRNs awaiting QA/QC, plus totals and a per-vendor summary. The web shows it
as the Delivery status tab on Purchase Orders (`?tab=status`).

`Unit` is a per-organisation list of unit codes (RLS-protected). Units stay free text on items and lines; the list
is what `UnitInput` suggests on every quantity form. `GET /units` seeds `DEFAULT_UNITS` the first time, store
managers and approvers add, rename (only while no item uses the code), switch off and delete units that no item uses.
`rangePresets()` (`apps/web/src/lib/dates.ts`) gives date-range filters This month, Last month and the last three
financial years (April to March, `recentFinancialYears` in shared).

## Subcontracts

Work order → their work in the measurement book under it → material issued to them → their running bill with
retention, advance, TDS and material recovery (`apps/api/src/subcontracts`).

- **Tables** (tenant tables). `WorkOrder` + `WorkOrderLine` (numbered `WO-<year>-0001`; a line is a BOQ item of the
  project, at most once per order, or the order's own item with description and unit; terms: GST rate, retention %,
  advance and its recovery %, TDS %, payment days; `closedAt` / `closeNote`). `SubcontractBill` (numbered 1, 2, …
  per order, `isFinal`) + `SubcontractBillLine` (previous / this / up-to-date quantity per order line) +
  `SubcontractBillMaterial` (material recovered per item). `MeasurementSheet.workOrderId` and
  `StockEntry.workOrderId` tag work and issues to an order; `subcontractBillId` on both records which bill took
  them. `AttendanceLine.vendorId` links a contractor's gang to the vendor master. Work orders and their bills are
  approval submissions (`WORK_ORDER`, `SUBCONTRACT_BILL`); the matrix amount is the order value and the bill's work
  value.
- **Measurements are shared.** A sheet tagged to a work order still counts for the client's RA bill: the same work
  is billed to the client at the BOQ rate and paid to the subcontractor at the order rate. Tagging is allowed only
  for an approved, open order with a line on that BOQ item in the same project (`assertOpenWorkOrder`).
- **The bill** (`SubcontractBillsService.recompute`). BOQ lines take approved measurements tagged to the order up to
  "measured up to" that no earlier bill took; own items take the quantity entered on the bill (a BOQ line given a
  quantity is refused). Material: ISSUE entries tagged to the order up to the same day and not yet recovered, valued
  at `Item.rate` (the last PO rate) when the bill is saved. Deductions in order: retention %, advance recovery %
  (capped at what is still outstanding), TDS % on the work value, material, other (with a note). Net payable = work
  + GST − deductions. Due date = bill date + the order's payment days (default 30, at most 45 for a micro or small
  enterprise). One open bill per order and nothing after the final bill, under advisory lock `SB:<workOrderId>`;
  a draft is recomputed on every save. An issue recovered in an approved bill cannot be deleted.
- **Defaults.** TDS under section 194C from the PAN: 1% when its fourth letter is P or H, else 2% (no PAN is
  shown as a 20% warning, not defaulted). GST 18% when the vendor has a GSTIN, else 0.
- **Margin.** `GET /work-orders/margin?projectId=` gives, per BOQ item on approved orders, the client rate against
  the order rate weighted by order quantity (billing roles only).
- **Roles.** `canIssueWorkOrder` (admin, management, PM, procurement, QS) issues orders; `canViewWorkOrders` adds site
  engineers, the store and accounts (they tag work and issues). `canPrepareSubcontractBill` (the billing roles)
  prepares bills; approvers with a `SUBCONTRACT_BILL` rule see them too. Demo matrix: PM up to ₹5 lakh, management
  without limit.
- **Attendance.** A contractor name on attendance links to an active subcontractor or labour contractor of that name
  (case-insensitive, "Departmental" excepted); vendor adopt and rename carry the link. Attendance suggestions list
  those vendors.
- **API.** `/work-orders` (paged; `projectId`, `vendorId`, `status`, `open`, `boqItemId`, `q`),
  `GET /work-orders/margin`, `POST /work-orders/:id/submit|close`, `/subcontract-bills` (paged; `projectId`,
  `vendorId`, `workOrderId`, `status`, `q`), `POST /subcontract-bills/:id/submit`. `/measurements` and
  `/stock/issues` take `workOrderId`; an issue against an order defaults "issued to" to the subcontractor.
- **Clients.** Web: Purchases → Work Orders and Subcontractor Bills, a Subcontracts tab per project (orders, bills,
  margin), print views of the order and the bill (`components/subcontracts/subcontractPrint.ts`), and a work order
  picker on the measurement and issue forms. Site app: approve orders and bills, and tag measurements and issues.

## Receivables

- **Table.** `Receipt` (tenant table): `kind` BILL / RETENTION_RELEASE / DEPOSIT_RELEASE, `billId` for a bill payment,
  `projectId`, `receiptDate`, `amount` credited to the bank, `mode` and `reference` (UTR, cheque), and what the client
  deducted on that payment: `tdsAmount`, `gstTdsAmount`, `retentionAmount`, `securityDepositAmount`,
  `advanceRecoveryAmount`, `labourCessAmount`, `otherDeduction` with a note.
- **Settling a bill** (`src/receivables/bill-settlement.ts`). A bill's invoice is work + GST; a receipt settles its
  amount plus its deductions. Payments go only against approved bills that were sent, and may not settle more than
  is outstanding (₹1 tolerance), under advisory lock `RCPT:<projectId>`. `syncBillStage` moves the bill to PAID (paid
  date = last receipt) once settled ≥ invoice, and back to CERTIFIED / SENT when a receipt is corrected or taken off
  or a certificate raises the amount. A first payment is pre-filled with the bill's own deductions.
- **Releases.** Retention or deposit released is recorded against the project and may not exceed what payments
  deducted less what was released; a bill receipt cannot be changed so that releases would exceed it.
- **Summary** (`GET /receivables`, optional `projectId`). Per project, per client and in total: billed (sent bills),
  received, deducted, outstanding, ageing 0-30 / 31-60 / 61-90 / over 90 days from the date sent, approved bills not
  yet sent, retention and deposit held, TDS and GST TDS deducted; retention due = revised completion date + defect
  liability months; the open bills with days outstanding. The company dashboard shows outstanding and over 90 days;
  project cost shows billed value (approved bills by bill date) and cash in (receipts by date).
- **Roles.** Seen by `BILLING_ROLES` (`canViewContract`); recorded, corrected and deleted by admin, management and
  accounts (`canRecordReceipt`). Each change is in the audit log of the receipt and of its bill.
- **API.** `/receipts` (paged; `projectId`, `billId`, `kind`, `from`, `to`, `q`), `GET|PATCH|DELETE /receipts/:id`,
  `GET /receivables`. Web: Billing → Receivables, "Record payment" and the payments list in the bill drawer.

## Payables

- **Table.** `VendorPayment` (tenant table): against exactly one approved bill, `vendorBillId` or
  `subcontractBillId` (a CHECK constraint), with `projectId`, `vendorId`, `paymentDate`, `amount` paid, `mode`,
  `reference` (UTR, cheque, voucher), and what was deducted at payment: `tdsAmount` (vendor bills only; a
  subcontractor bill already deducts its TDS), `otherDeduction` with a note. `VendorBill` and `SubcontractBill` keep
  `paidAmount` (settled = paid + deducted) and `paidDate` (the last payment once settled in full).
- **Settling a bill** (`src/payables/payables.service.ts`). A vendor bill's payable is its invoice total; a
  subcontractor bill's is its net payable. Payments go only against approved bills, are not dated before the bill or
  in the future, and may not settle more than is outstanding (₹1 tolerance), under advisory lock `PAY:<billId>`.
- **Due list** (`GET /payables`, optional `projectId`, `vendorId`). Per vendor, per project and in total: billed,
  paid, deducted, outstanding, ageing (not yet due, then 1-30 / 31-60 / 61-90 / over 90 days past the due date),
  overdue, due in the next 7 days, retention held on subcontractor bills and TDS deducted; the open bills most urgent
  first. Bills of micro and small enterprises due within 7 days or late are flagged (`msmeFlag`, "MSME at risk"):
  the MSMED Act allows 45 days at most, and PO payment days are already capped at that.
- **Roles.** Seen by admin, management, accounts and project managers in their visible projects (`canViewPayables`);
  recorded, corrected and deleted by admin, management and accounts (`canRecordPayment`). Each change is in the
  audit log of the payment and of its bill.
- **API.** `/vendor-payments` (paged; `projectId`, `vendorId`, `vendorBillId`, `subcontractBillId`, `from`, `to`,
  `q`), `GET|PATCH|DELETE /vendor-payments/:id`, `GET /payables`. Web: Purchases → Payables (KPIs, due list with
  Pay, by vendor, by project, payments), and the payments list with "Record payment" in both bill drawers.

## Tally export

Tally stays the books; Nirmaan sends it vouchers as TallyPrime "Import Data" XML (`src/tally/vouchers.ts`) and keeps
no ledger of its own.

- **Vouchers** (`src/tally/tally.service.ts`, `build`). Every record not yet exported and dated up to the chosen day:
  - RA bill, approved and certified (amounts are final once certified): **Sales**. Dr client (work + GST), Cr works
    receipts, Cr output CGST + SGST (works on a site are supplied where the site is).
  - Receipt: **Receipt**. Dr bank or cash, Dr each deduction the client made (TDS, GST TDS, retention, security
    deposit, advance recovered, labour cess, other), Cr the client against the bill (`Agst Ref`); a retention or deposit
    release credits the retention or deposit held. A receipt whose bill is not yet certified is held back.
  - Vendor bill: **Purchase**. Dr purchases, freight, input GST; Cr the vendor (`New Ref` = their invoice number).
  - Subcontractor bill: **Journal**. Dr subcontract charges and input GST; Cr the subcontractor with the net payable,
    and retention, advance, TDS, material recovered and other deductions to their ledgers.
  - Vendor payment: **Payment**. Dr the vendor (paid + deducted), Cr bank or cash, TDS payable, other deductions.
  - Site expense: **Payment**. Dr the category (input GST apart only with the vendor's GSTIN), Cr cash or bank, or the
    vendor (or "Site creditors") when on credit.

  Input GST is IGST when the vendor's GST state differs from the company's (`TallyConfig.stateCode`), else CGST + SGST
  (half each, the odd paisa to SGST). Income and expense lines carry the project as cost centre when
  `costCentres` is on. A voucher whose debits and credits differ is held, never exported. `REMOTEID` is
  `nirmaan-<kind>-<id>`.
- **Ledgers.** `TallyConfig` (one row per organisation): company name for `SVCURRENTCOMPANY`, GST state code,
  cost centres on or off, and `ledgers` = overrides of the default names in `TALLY_FIXED_LEDGERS`
  (`packages/shared/src/tally.ts`) and of clients, vendors (their names) and expense categories ("Site <category>").
  `GET /tally/masters.xml` creates those ledgers (with their Tally group, GST duty head, bill-wise for parties) and a
  cost centre per project.
- **Once only.** `TallyExport` keeps the XML, counts and range; each exported record's `tallyExportId` points at it.
  The export runs under advisory lock `TALLY:<org>`. Receipts and vendor payments in an export cannot be changed or
  deleted and a bill's certificate cannot be corrected (`assertNotExported`) until the export is undone; undoing deletes
  the `TallyExport` and the foreign keys clear (`ON DELETE SET NULL`). DTOs show `exportedToTally`.
- **Roles.** Admin, management and accounts (`canExportTally`).
- **API.** `GET|PUT /tally/settings`, `GET /tally/masters.xml`, `GET /tally/preview?upTo&from`, `GET|POST /tally/exports`,
  `GET /tally/exports/:id/xml`, `DELETE /tally/exports/:id`. Web: Billing → Tally Export (to export, exports, ledgers).

## GST registers

- **Outward** (`src/gst/gst.service.ts`). Approved RA bills by bill date, one row each: invoice number as the Tally
  export numbers it (`RA/<project code>/<bill no.>`, flagged above GST's 16 characters), the client's GSTIN (B2B) or
  none (B2CS), place of supply = the company's GST state (Tally settings) else the client's, rate, taxable value =
  work value, CGST + SGST (works on a site are supplied where it is).
- **Input tax.** Approved vendor bills by invoice date, one row per GST rate of their lines; approved subcontractor
  bills and site expenses with GST. IGST when the supplier's GST state (from the GSTIN) differs from the company's,
  else CGST + SGST. Only rows with the supplier's GSTIN count as claimable; the rest show as not claimable.
- **Excel** (`apps/web/src/lib/gstExport.ts`). One workbook: `b2b`, `b2cs` (summed by place of supply and rate) and
  `hsn` (SAC 9954 by rate) with the GSTR-1 offline tool's column headers, and `input tax` laid out like GSTR-2B for
  matching on GSTIN and invoice number. No e-invoicing (IRN); that waits for a customer who must, through a GSP.
- **Roles and API.** Admin, management and accounts (`canViewGstRegisters`). `GET /gst/registers?from&to`. Web:
  Billing → GST Registers (`?from=YYYY-MM&to=YYYY-MM`).

## Project cost

- **Heads.** Site expenses (`APPROVED`, total incl. GST, by bill date); material issued (`StockTxn` of
  type `ISSUE` × `Item.rate`, the standard rate in the item master); machinery (`APPROVED` logs: hourly
  rate × hours worked, daily rate per log, monthly rate ÷ 30 per log, `machineryLogCost` in shared);
  labour (attendance head count × `LabourRate.dailyRate` of the trade, matched case-insensitively);
  subcontractors (work value of `APPROVED` subcontractor bills, by bill date). Where a subcontractor bill exists the
  actual bill replaces the estimate: issues recovered on an approved subcontractor bill drop out of material, and
  attendance of a contractor with an approved work order on the project drops out of labour.
- **Cash.** Billed and cash in from receivables; vendor and subcontractor bills (approved, with GST, by bill date)
  and cash out (payments by date) from payables.
- **Value.** Executed value = `APPROVED` progress quantity × BOQ rate (by progress date); measured value =
  `APPROVED` measurement sheets × BOQ rate. Margin = executed value − cost.
- **Missing rates.** Items, machines or trades without a rate add nothing and are counted in `unpriced`,
  which the web shows as a warning.
- **Access.** `COST_VIEW_ROLES` (admin, management, PM, accounts) within their visible projects;
  `LABOUR_RATE_ROLES` (admin, management, accounts) set labour rates; item rates go with the item master.
- **API.** `GET /cost/projects?from&to`, `GET /cost/projects/:id?from&to`, `GET`/`PUT /cost/labour-rates`.

## Progress report

`GET /reports/progress?projectId&from&to` (any project member, at most 92 days) returns
`ProgressReportDto`: physical progress at the start and end of the period (the same BOQ-weighted rule as
the dashboard, `common/progress.ts`), contract time elapsed, executed value (approved progress × BOQ
rate) for the period and to date, measured value, activity rows (period, to date, %, delayed at period
end), BOQ rows with movement, manpower from attendance, machinery from approved logs, material received
and issued, issues and safety notes from approved DPRs, activities planned to be under way in the next
period of the same length, delays that held up work in the period (days counted within it) and risks
scored 8 or more still open at its end, and up to eight photos from approved progress. The web renders it to an A4
HTML document (`components/reports/progressReportHtml.ts`), previews it in an iframe and prints it to
PDF from the browser.

## Delay and risk register

- **Table.** `Risk`: project, `riskNo` (`RISK-<year>-0001` per organisation, `nextDocNo`), `kind` (DELAY |
  RISK), `category`, title, description, optional activity and owner, `probability` and `impact` (1 to 5)
  with the stored `score` = their product, mitigation, `dueDate`, `status` (OPEN | MONITORING | CLOSED),
  `closedAt` / `closureNote`, `raisedById`. A delay also has `delayStart`, `delayEnd` (null while work is
  still held up), an optional agreed `daysLost` (else counted from the dates, to today while open),
  `responsibleParty` (CLIENT | CONTRACTOR | THIRD_PARTY | FORCE_MAJEURE) and `eotClaimed`. Photos and
  letters are attachments (`Attachment.riskId`).
- **Not a submission.** There is no approval: entries stay open, are followed up by the owner and closed
  with a note (`CLOSED` / `REOPENED` audit actions). Site roles, the QS, QA/QC and approvers raise them
  (`RISK_RAISER_ROLES`); the raiser, the owner or an approver edits or closes (`canEditRisk`); only an
  approver deletes one raised by mistake. Anyone who can see the project reads the register.
- **API.** `GET /risks` (paged, sorted by score; filters kind, status, `active`, category, owner, `mine`,
  `minScore`, `overdue`), `GET /risks/summary` (counts, high risks, open delays, overdue actions, days lost
  and excusable days lost, 5 × 5 heat map of active risks, by category), `GET /risks/suggestions` (activities
  on active projects past their planned end, approved progress short of plan, with no open delay entry),
  `GET /risks/:id`, `/:id/history`, `POST` (idempotent with a client id, so the site app can raise one
  offline), `PATCH` (closing an open delay ends it today unless a date is sent), `DELETE`.
- **Notifications.** A delay, or a risk scored 15 or more (`HIGH_RISK_SCORE`), notifies the project's
  approvers and the owner (`RISK_RAISED`, deduped per entry); assigning a new owner notifies them.
- **Clients.** Web: Delays & Risks page and project tab (summary, heat map, "behind schedule, no delay
  recorded" prompts, Excel export); the progress report has a Delays and risks section. Site app: register
  screen per project, form (offline through the outbox) and detail screen with close / reopen.

### Liquidated damages

The contract carries an LD rate (`Project.ldRatePct`, % of the contract value), the period it is per (`ldPeriod`:
day, week or month of 30 days, part periods pro rata) and a cap (`ldCapPct`, default 10%). `ContractsService.ldExposure`
works out, on the revised contract value (with approved variations): days past the completion date after the extensions
granted in the delay register, to the handover's completion date or today; the forecast to the schedule's last planned
finish; the excusable days lost (client, third party, force majeure) not yet covered by extensions granted, as a claim to
pursue; and LD to date, forecast and forecast if those claims are granted, each capped. `GET /projects/:id/contract`
returns it as `ld`; `GET /ld-exposure` lists every visible active, on-hold or completed project with a contract value
and completion date, largest forecast first. Both are for contract viewers (`canViewContract`). Web: a Liquidated damages
card on the Contract tab and a Liquidated damages tab on Delays & Risks.

## Sector progress

- **Fields.** `Project.chainageStart` / `chainageEnd` (metres from 0+000; roads, and water mains when set),
  `floors` (bottom up) and `villages` (text arrays), set from the project's Sector settings by its editors.
  `ProgressEntry` and `MeasurementSheet` carry `chainageFrom`, `chainageTo`, `floor` and `village`, all optional so
  older phone builds keep working. `resolveSector` (`src/common/sector.ts`) checks them: from ≤ to (a point when
  only "from" is given), inside the project's range, floor and village from the project's lists when it keeps
  them. When no location is typed it is made from them (`sectorLocation`, e.g. "Ch 26+100 to 26+400"), so the
  free-text location that hold points, reports and searches read stays filled. Chainage is typed as km+m
  (`parseChainage` / `formatChainage` in `packages/shared/src/sector.ts`).
- **View.** `GET /projects/:id/sector-progress` from approved and submitted progress entries. Road (and water
  supply with a chainage range): a strip row per activity with each entry's stretch, the length covered by
  approved entries with overlaps counted once (`coveredLength`), the length only waiting for approval, and the
  approved quantity with no chainage. Building: floor × activity approved and waiting quantities. Water supply:
  village × activity, plus pipe in metres: ordered (approved purchase order lines for items in metres named as
  pipe, `isPipeItem`), supplied (receipts less returns to the supplier), laid and tested (activities in metres
  count as laid, or tested when the name says test: `pipelineStageOf`), and laid and tested per village. The
  water template gained "Hydraulic testing of pipelines".
- **Clients.** Web: Chainage / Floors / Villages & Pipeline project tab with Sector settings; chainage, floor and
  village fields on the progress and measurement forms. Site app: the same fields on the progress and measurement
  forms, and a sector screen from the project page.

## Safety

- **Tables.** `SafetyIncident` (`INC-<year>-0001`): project, `type` (NEAR_MISS | FIRST_AID | MEDICAL_TREATMENT |
  LOST_TIME | PROPERTY_DAMAGE | FATALITY), date and optional time, location, description, people hurt and their
  names, contractor, immediate action, root cause, corrective action, `daysLost` (lost time only), `status`
  (OPEN | CLOSED) with closer and note. `ToolboxTalk` (`TBT-`): date, topic, who gave it, contractor, number
  attended and names, minutes, notes. `WorkPermit` (`PTW-`): `type` (HOT_WORK | WORK_AT_HEIGHT | EXCAVATION |
  CONFINED_SPACE | ELECTRICAL | LIFTING | OTHER), location, the work, contractor and workers, `validFrom` /
  `validTo` (at most `PERMIT_MAX_DAYS` = 7 days), `precautions` (text array; the standard ones per type are
  `PERMIT_PRECAUTIONS` in `packages/shared/src/safety.ts`), `status` (REQUESTED | ISSUED | REJECTED | CLOSED)
  with who asked, issued or rejected (`issueNote`) and closed. Photos are attachments on each. All three have
  `tenant_isolation` policies.
- **Who.** A new `SAFETY_OFFICER` role (added to every organisation by the migration). Site roles, the QS,
  QA/QC, the safety officer and approvers report incidents, record talks and ask for permits
  (`canReportSafety`); the safety officer and approvers close or reopen incidents, issue or reject permits and
  delete records (`canManageSafety`, project-checked in `ProjectAccessService.assertCanManageSafety`); whoever
  asked for a permit closes it when the work is done. Not a submission: no approval chain.
- **API.** `GET /safety/summary` (days since the last lost-time injury or fatality, incidents and near misses
  this month, open incidents, people hurt and lost-time cases this year, talks and attendance this month,
  permits waiting, live and run out, count by type); `/safety/incidents` (paged; `POST`, `PATCH`, `DELETE`,
  `/:id/history`, `/:id/close` needs the root cause and corrective action, `/:id/reopen`); `/safety/talks`;
  `/safety/permits` (`active` = waiting or issued; `/:id/issue` with conditions and the precautions checked,
  `/:id/reject` with a reason, `/:id/close`). Creates are idempotent with a client id for the phone outbox.
- **Notifications.** Type `SAFETY`, with `entityType` SAFETY_INCIDENT or WORK_PERMIT. An incident tells the
  project's safety officers, and its approvers unless it is a near miss; a permit request tells both; issue or
  reject tells the requester.
- **Older phones.** Builds before this one crash on a notification type they have no icon for, so
  `GET /notifications` lists only `LEGACY_NOTIFICATION_TYPES` (and counts only those as unread) unless the
  client sends `allTypes=true`, as the web and newer phone builds do.
- **Clients.** Web: Safety page and project tab (summary strip, incident register, toolbox talks, permits with
  Excel export). Site app: Safety screen per project with the same summary, report incident / near miss, toolbox
  talk and permit forms (offline through the outbox), incident detail with close / reopen and permit detail
  with issue, reject and close.

## Machinery maintenance and vehicle papers

- **Tables.** `MaintenanceJob` (`MNT-<year>-0001`): machine, the project it was at (null in the yard), `kind`
  (SERVICE | BREAKDOWN), date, meter reading, fault or work to do, workshop, `status` (OPEN | CLOSED) with
  closing date, work done, downtime hours, `labourCost` and `partsCost` (bought outside). Spares from the store
  are ordinary stock issues with `StockEntry.maintenanceJobId` set, so they move stock and count in the project's
  material cost; the job card values them at the item's standard rate. `EquipmentDocument`: machine, `type`
  (INSURANCE | FITNESS | PERMIT | PUC | ROAD_TAX | REGISTRATION | OTHER), number, issuer, `validFrom`, `validTo`
  (required). A renewal is a new row; lists show the latest per machine and type unless `latestOnly=false`.
  `Driver`: name, phone, licence number, class and validity, the machine they drive, active flag. `Equipment`
  gained `serviceIntervalHours`, `serviceIntervalDays`, `lastServiceDate` and `lastServiceMeter`. All three new
  tables have `tenant_isolation` policies. Machine repair labour and outside parts stay on the job card; they are
  not added to the project cost view (the hire or internal rate already carries a machine's running cost).
- **Service due.** `serviceStatuses` (`src/maintenance/service-status.ts`): hours worked in logs that are not
  rejected since the last service (or since the machine was added) against the hour interval, and days since it
  against the day interval, whichever comes first; due soon within `SERVICE_SOON_HOURS` (25) or
  `SERVICE_SOON_DAYS` (7). Closing a SERVICE job card sets the machine's last service date and meter (never moves
  it back). `expiryState` marks papers and licences expiring within `DOC_ALERT_DAYS` (30) or expired.
- **Who.** Anyone who logs machinery reports a breakdown at a project they can see (`assertCanReportBreakdown`).
  The store manager and approvers (`canManageMaintenance`) raise services, issue spares, close and delete job
  cards (not once spares are issued), and keep papers and drivers; the equipment master and its service
  intervals stay with approvers. Job cards are visible like submissions, plus yard machines for maintenance
  managers; papers and drivers to the whole organisation.
- **API.** `GET /maintenance/summary` (service schedule, papers and licences due, open job cards, this month's
  downtime and cost), `/maintenance/jobs` (CRUD, `/:id/close`, `/:id/spares`), `/equipment-documents`,
  `/drivers`.
- **Alerts.** Type `MACHINERY`. A breakdown tells the project's manager and store managers (store managers and
  admins for a yard machine), `entityType` MAINTENANCE_JOB. The daily `machineryDue` job (with the digest cron,
  `GET /notifications/jobs/machinery-due` by hand) tells admins, management and the machine's project watchers of
  services falling due with no open service job card (EQUIPMENT), papers (EQUIPMENT_DOCUMENT) and licences
  (DRIVER) expiring within 30 days; each once when it falls due and once more when overdue or expired
  (dedupe keys carry the paper id or the last service date). `MACHINERY` is left out of
  `LEGACY_NOTIFICATION_TYPES`.
- **Clients.** Web: Machinery page and project tab gain Maintenance (summary, service schedule with Raise
  service, job cards, a job drawer with spares and close) and, fleet-wide, Papers & drivers (renew, add, edit);
  the equipment form takes the service intervals. Site app: Report a breakdown from the Submit tab (online only).

## Client portal

- **Who.** Two guest roles, `CLIENT_ENGINEER` and `CONSULTANT` (`GUEST_ROLES`, `isGuest`), invited and put on projects
  like staff, so `projectWhere` and `assertCanAccessProject` scope them as usual. They have no approval rights
  (`ApprovalRightsService` gives them none; the approval matrix hides them).
- **Deny by default.** `GuestGuard` (an app guard after `JwtAuthGuard`) refuses a guest on any route not marked
  `@GuestAllowed()`: only the portal, their account (`auth/me`, change password), notifications and their WhatsApp/SMS
  settings. `PortalController` is also `@GuestOnly()`, so staff keep their full screens and never see the cut-down
  views. A new route is closed to guests unless it is marked.
- **What they see** (`/api/portal/*`, `PortalService`): their projects with approved progress by activity, approved
  DPRs, the progress report (`ReportsService.progress`), bills once sent (`RaBillsService.listForClient`, status
  APPROVED and stage past NOT_SENT) and non-draft inspections.
- **What they do.** Certify a SENT bill (`RaBillsService.certifyAsClient`, the same certificate logic as staff
  recording one, audited "by the client in the portal") and record attending an inspection (`Inspection.witnessedById`,
  `witnessedAt`, `witnessNote`; audit WITNESSED). Both need `assertCanActAsClient` (a guest on the project). Sending a
  bill and requesting an inspection notify the project's guests, and their actions notify the QS / bill approvers or
  the requester / quality watchers, all as `PORTAL` notifications.
- **Clients.** Web: guests get a two-item menu and `/portal` (project cards, then tabs: progress, daily reports,
  progress report, RA bills, inspections; `?tab=` and `?open=` deep links); any other page redirects there. The site
  app refuses guest sign-in.

## Company data (export and deletion)

- **Export.** `CompanyDataService` works out every table and how its rows belong to an organisation from the Prisma
  schema (`organizationId`, or a parent's for line tables such as `RaBillItem`), so a new table is exported without a
  change. `/api/company-data/export/tables/:name` pages a table as columns and plain values (sign-in secrets, push
  tokens and file bytes left out); `/export/files` lists stored files with the folder they go in (the kind of record
  they are attached to). The web builds the zip in the browser (`lib/companyExport.ts`, `lib/zip.ts`), so no API
  response gets large on Vercel. Admins only (`canManageCompanyData`); each download is audited `EXPORTED`.
- **Deletion.** An admin types the company name to set `Organization.deletionScheduledFor` 30 days out
  (`DELETION_GRACE_DAYS`); admins are emailed, see a banner, and any of them can cancel. The approval-digest cron
  then runs `purgeDue`: in one transaction per company it clears optional links between the company's rows, deletes
  table by table until nothing is left (a table still referenced waits for the next pass, using savepoints), and
  deletes the organisation; stored files (Blob, disk) are removed after. `PROTECTED_ORG_CODES` (default `DEMO`) can
  never be deleted. `GET /api/company-data/jobs/purge` runs it by hand with `CRON_SECRET`.
- **Privacy page.** `/privacy` (public, in the `(public)` group, allowed by the middleware) describes all this; keep it
  true when data handling changes.

## Platform admin and support access

- **Staff.** A user whose email is in `PLATFORM_ADMIN_EMAILS` (`common/platform-admin.ts`) gets `platformAdmin` on
  `/auth/me` and the `/api/platform` endpoints (`PlatformService`, which reads across organisations with
  `withoutTenant`). Staff are ordinary users of their own organisation otherwise.
- **Suspension.** `Organization.suspendedAt` stops sign-in (`AuthService.issue`) and every existing token
  (`JwtStrategy` requires an unsuspended organisation). Data is kept. Staff cannot suspend their own organisation.
- **Support access.** A company admin sets `Organization.supportAccessUntil` (7 days, `SUPPORT_ACCESS_DAYS`) under Data &
  Privacy, or clears it. While it is set, staff can ask for a support token (`sup: true`, at most 2 hours,
  `SUPPORT_SESSION_HOURS`, and never beyond the consent). `JwtStrategy.support` turns it into an `ADMIN` request user in
  that organisation with `support` set, re-checking the consent and the staff member on every request, so withdrawing
  consent ends the session at once. `SupportReadOnlyGuard` (global) refuses anything but `GET`. The web keeps the staff
  token aside while the support token is in use (`lib/api.ts`) and shows a banner with Exit.
- **Company log.** Consent, withdrawal, each support visit (`SUPPORT_VIEW`), suspensions, exports and deletion requests
  are `AuditLog` rows with `entityType` `COMPANY`; `GET /api/company-data/log` shows them to the company's admins.

## Plans and billing

- **Switch.** `common/billing.ts` `billingConfig()` is null unless Razorpay keys, `BILLING_PRICE` and the seller's name and
  GSTIN are set; with it null nothing below happens. `billingState()` gives EXEMPT (`BILLING_EXEMPT_ORG_CODES`), ACTIVE
  (`Organization.paidUntil` today or later), TRIAL (`trialEndsAt` today or later, or not set yet) or READ_ONLY.
- **Read-only.** `JwtStrategy` marks the request user `billingReadOnly`; `BillingReadOnlyGuard` (global) answers 402 to
  anything but reads, except controllers marked `@AllowWhenUnpaid()` (auth, notifications, messaging preferences,
  company data, billing, platform). `/auth/me` carries `billing` for the web banner and the mobile notice; the mobile
  outbox keeps entries pending on 402.
- **Paying.** `POST /billing/orders` prices the next month or year (units: active projects or staff users, at least
  one; GST split by the buyer's state against the seller's), creates a Razorpay order and a `BillingPayment` row (tenant
  table). Checkout in the browser pays it; `POST /billing/verify` checks the signature, and `POST /billing/webhook`
  (Razorpay's signed `payment.captured` / `order.paid`) does the same for a closed browser. `markPaid` runs once per
  payment under an advisory lock: the period starts the day after the trial or the paid period ends (or today),
  `paidUntil` moves to its end, the invoice is numbered `<prefix><FY>-<n>` without gaps, and `SUBSCRIPTION_PAID` goes in
  the company log.
- **Daily job** (with the digest cron): companies without `trialEndsAt` start their trial; admins are emailed once 7
  days and 1 day before the trial or paid period ends, and when it has (`billingRemindedFor`).

## Money and quantities

Decimal columns everywhere (`Decimal(18,2)` for money, `Decimal(18,3)` for quantities) and strings
over the wire. No floating point for contract values.

## Attachments

Uploaded first (`POST /api/uploads`), then linked to the entry by id. This keeps mobile forms simple
and lets a photo be taken before the form is finished. Local disk now, object storage later; only
`storagePath` changes.

## Notifications

`Notification` is one row per recipient (`userId`) with a `type`, title, body and an optional
pointer (`projectId`, `entityType` + `entityId`) to the submission it is about. In-app lists read
the table; push and email are delivery channels for the same row (`pushedAt`, `emailedAt`).
`PushToken` holds the Expo push tokens of a user's devices; a token moves to whoever signs in on
that device and is deleted on sign-out or when Expo reports it unregistered.

- `SubmissionLifecycleService` is the only emitter for submission events: `submit` notifies the
  project's approvers (`ProjectAccessService.approversForProject`, the inverse of the visibility
  rule), `review` notifies the author. Delivery errors are logged and never fail the transition.
- `NotificationJobsService` runs the two daily jobs: the "DPR not submitted" reminder (active
  projects without a non-draft DPR dated today in `NOTIFICATION_TIMEZONE`) and the pending-approvals
  digest (built from the same `pending()` query that feeds the approvals queue). Each job writes
  a `dedupeKey` (`DPR_REMINDER:<project>:<date>`, `APPROVAL_DIGEST:<date>`) that is unique per
  user, so re-running a job never notifies twice.
- Jobs are triggered by HTTP (`/api/notifications/jobs/*`, guarded by `CRON_SECRET`) so Vercel
  Cron can call them; an optional in-process timer (`NOTIFICATION_JOBS_INPROCESS=true`) covers
  long-running hosts. Transports are plain `fetch` calls (Expo push API, the Cogitrex mail API or Resend) with no SDKs.
- Stock writes call `notify()` directly for `LOW_STOCK` (see Stock), and the register for `RISK_RAISED`
  (`entityId` is the register entry; web opens `/risks?id=`, the site app `/risk/<id>`).
- A new notification type = enum value in `schema.prisma` and `packages/shared` (+ label), a
  `notify()` call, and a route in the web `notificationHref` / mobile `notificationRoute` helpers.
- WhatsApp and SMS (`MessagingService`) are opt-in per user (`User.whatsappAlerts`, `User.smsAlerts`, to
  `User.phone` normalised to `91XXXXXXXXXX`). A `notify()` call that passes `message: { template, params }` also
  sends that template to the recipients who opted in: WhatsApp first, SMS when WhatsApp is off, not set up or fails.
  Approval requests, send-backs, the DPR reminder, the approvals digest, test-due and payments-due reminders carry one; invites call `MessagingService.direct` for the
  number the admin entered. Templates are fixed (`MessageTemplate`; WhatsApp and DLT both need them registered),
  their text lives in `packages/shared/src/messaging.ts`, and each attempt is an `OutboundMessage` row (SENT,
  FAILED, or SKIPPED when the channel is not set up), which is the company's message log. A new message = a template
  value in both enums, its text, its WATI variable names (`WATI_PARAM_NAMES`), a WhatsApp and DLT registration, and a `message` on the `notify()`
  call. WhatsApp goes through WATI when `WATI_API_ENDPOINT` is set, else Meta's Cloud API.

## Languages (mobile)

The site app opens in English on every phone, whatever the device language, and a user switches to Hindi under
Profile > Language; the choice stays on the phone (`LanguageProvider`, `src/i18n/LanguageContext.tsx`). Screens call
`const t = useT()` and wrap every piece of text they show: `t('Submit for approval')`, `t('{n} workers present', { n })`,
and shared labels as `t(SUBMISSION_STATUS_LABELS[s])`. The English text is the key; Hindi lives in
`src/i18n/hi/*.ts` (shared labels and everyday words in `common.ts`, the rest by group of screens), and text without
Hindi falls back to English. Text built outside components takes `t` as a parameter; `timeAgo` follows the app language
through `setFormatLanguage`. Server messages, names and other data stay as entered. `npm run i18n:check` in
`apps/mobile` (also run in CI) lists text passed to `t()` without Hindi, keys whose Hindi differs between files and
placeholders that do not match. Another language is another folder next to `hi` and a row in `LANGUAGES`.

## Offline entry (mobile)

New progress entries, DPRs, material requests and attendance sheets can be filed without a connection.

- **Idempotent creates.** `POST /progress`, `/dpr`, `/material-requests` and `/attendance` accept an optional
  client-generated UUID in `id`. If an entry with that id already exists in the caller's organisation
  the API returns it instead of creating another, and a unique-key race between two retries resolves
  to the first one. So a phone can resend after a lost response without creating duplicates.
- **Outbox.** `apps/mobile/src/offline` keeps a SQLite database (`siteapp.db`) with an `outbox` table
  (one row per queued entry, per user) and a `cache` table. A form submits straight to the API when
  online; when offline, or when the request fails to reach the server, it saves the entry to the
  outbox with a fresh UUID. Picked photos are copied into the app's documents folder because the
  image picker's cache can be purged.
- **Sync.** `OfflineProvider` flushes the outbox in creation order when the network comes back
  (expo-network), when the app returns to the foreground and after sign-in. For each entry it uploads
  any photo without an attachment id (remembering ids as it goes), then posts the entry with its
  client id. Network errors and 5xx stop the run and keep the entry pending; a 4xx (for example a DPR
  for a day that already has one) marks it failed, and the Outbox screen offers retry or discard.
- **Read cache.** `useFetch(..., { cacheKey })` stores the last good response per user, so projects,
  activities, the home screen and My Submissions open offline with the last loaded data.
- Edits and resubmits, reviews and approvals still need a connection: they act on server state that
  may have changed since the phone last saw it.
- Web (Expo web export) uses a localStorage-backed store instead of SQLite.
