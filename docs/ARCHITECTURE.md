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
requests, machinery logs, site expenses, measurement sheets, RA bills, purchase orders and vendor bills:

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
