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
- Postgres row-level security is the planned second line of defence once there is a second tenant.
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
requests, machinery logs, site expenses and measurement sheets:

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
free. The clients keep a few per-type maps (web drawers on the approvals and notifications pages,
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

## Project cost

- **Heads.** Site expenses (`APPROVED`, total incl. GST, by bill date); material issued (`StockTxn` of
  type `ISSUE` × `Item.rate`, the standard rate in the item master); machinery (`APPROVED` logs: hourly
  rate × hours worked, daily rate per log, monthly rate ÷ 30 per log, `machineryLogCost` in shared);
  labour (attendance head count × `LabourRate.dailyRate` of the trade, matched case-insensitively).
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
  long-running hosts. Transports are plain `fetch` calls (Expo push API, Resend) with no SDKs.
- Stock writes call `notify()` directly for `LOW_STOCK` (see Stock), and the register for `RISK_RAISED`
  (`entityId` is the register entry; web opens `/risks?id=`, the site app `/risk/<id>`).
- A new notification type = enum value in `schema.prisma` and `packages/shared` (+ label), a
  `notify()` call, and a route in the web `notificationHref` / mobile `notificationRoute` helpers.

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
