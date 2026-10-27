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

### Signing in and headers (finding 5 of the October review)

- **Guessing.** `LoginGuardService` counts failed sign-ins in `AuthAttempt` (a platform table, no organisation, left out
  of company data; rows over a day old are removed as new ones come in). Five wrong passwords for an email in 15 minutes
  lock it for 15 minutes from the fifth, whatever comes next; 30 failures from one address (first `x-forwarded-for`
  hop) hold it off. Both answer 429 with when to try again. A good password clears the email's failures. Reset links:
  5 an hour per email and 20 per address, past which nothing is sent and the answer is the same. Rules pure in
  `auth/login-guard-rules.ts`, tested in `src/scripts/login-guard-test.ts`.
- **Sessions.** `User.tokensValidAfter` is set when the password changes (own change, reset link, admin) and the JWT
  strategy refuses a token issued before it, so a leaked session ends with the password. `POST /auth/change-password`
  returns a fresh `accessToken` for the session that made the change. Tokens still last `JWT_EXPIRES_IN` (7 days): the
  phone's outbox works offline for days, so a short token with refresh is left for when the phone stores a refresh
  token securely.
- **Headers.** The API (`common/security-headers.ts`): `nosniff`, `Referrer-Policy`, HSTS over HTTPS, and
  `default-src 'none'; frame-ancestors 'none'` with `X-Frame-Options: DENY` on every answer but stored files (framed
  only by `CORS_ORIGINS`, for the document viewer) and Swagger. A stored HTML, SVG or XML file opens sandboxed. The web
  (`next.config.ts`): a CSP allowing this site, the API (`NEXT_PUBLIC_API_URL`), Razorpay checkout, Vercel Blob uploads
  and Google Fonts for printouts, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff` and HSTS. A new outside
  service a page loads from is a line in that CSP.

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

**Who is told.** An approval ask goes to the approvers on the project (its manager and members) through
`NotificationsService.onProjectFirst`; company-wide approvers (management, admin) are asked only when nobody on the
project may decide the entry, such as one above the PM's limit, and see the rest in the daily digest. When a step is
done, `NotificationsService.handoff` tells the role that acts next (`HANDOFF`, "Your turn"): an approved material request
to procurement, an approved PO to the project's store, a GRN to the requester, QA/QC and (against a PO) accounts, a
client certificate to accounts, a client receipt to the PM and management, a DPR remark that `classifyRemark` reads as an
excusable hindrance to the PM with the notice date, and a new team member. Hand-offs, send-backs and approvals waiting
past their hours are also emailed (`NotifyInput.email`) to users with `emailAlerts` on (the default; Notifications ›
Alerts).

### Navigation tree and module screens (v6 item 98, launcher phase 1)

One tree, `NAV_TREE` in `packages/shared/src/navigation.ts`, lists every module and every page and tab in it: id, parent,
label, Lucide icon, route (or `projectTab`, or `shortcutOf` another node), access key, status (`live`, `building`,
`planned` with its roadmap item), description, keywords and the Concord brochure items it covers. Modules on Home have
`parent: null`; one with a route (Home, Approvals, Watch list) is a page, the others have a screen at `/modules/<key>` (the
keys in `MODULE_KEYS`, which `MODULE_LABELS` and `MODULE_INTROS` take from the tree).

- **Access.** `access` names a check in `NAV_ACCESS`, which wraps the same `@erp/shared` helper the page uses, so a tile or
  link never shows more than the page lets in. A module shows when any of its pages does (`canSeeNav`, `navTilesFor`).
  A page of a module the company has switched off (`pathIsOff` on `user.modulesOff`, v6 item 117) is hidden the same way,
  so it leaves the sidebar, the module screens and Search together.
- **Sidebar.** `navSidebar(user)` (shared, so the route walk reads it too) gives the top links, then each module with its
  pages: a node with a plain route is a link under its label, one whose route is a tab or a filter (`/inspections?tab=tests`)
  only when `nav` names the page it stands for ('Quality'), and a page is one link, under the first node that names it. A
  module with two or more tiles leads with its overview link. `components/shell/nav.ts` adds the icons (`nav-icons.tsx`).
- **Module screen** (`components/modules/ModuleHome.tsx`): a `TileGrid` of the module's tiles for this person (one Tab stop,
  arrow keys between tiles; a project tab with no project chosen in the header asks for one), then the figures from
  `GET /dashboard/modules/:key?projectId=` (`ModuleHomeService`, each behind the helper of the list it counts) and Waiting
  for you (the caller's approvals for `MODULE_SUBMISSION_TYPES`, their own entries sent back, theirs waiting with others).
  The module's `NewMenu` entries are buttons in the header. With one tile for the person, the screen opens that page.
- **Checks.** `apps/web/scripts/nav-check.ts` (CI) fails when a live node's route is not a page of the app, a project tab is
  not one of the project page's, an icon or access key is missing, a module is not in `MODULE_KEYS`, or a Concord item
  (`apps/web/scripts/concord-items.ts`) has no place.

A new page is one node in its module (and an `NAV_ACCESS` line if it needs a new rule). A roadmap item that ships a planned
node turns it `live` and gives it its route. A new module is a node with `parent: null`, its key in `MODULE_KEYS` with its
submission types, and, if it has figures, a branch in `ModuleHomeService.figures`.

### Launcher Home, pins and Recent (launcher phase 2)

Home (`app/(app)/page.tsx`, `components/launcher/HomeLauncher.tsx`) is a launcher: a greeting (the page's `<h1>`), a search
box over the navigation tree, the person's pinned tiles, Recent, and every module they can open as a `TileGrid`. The old
dashboard is the My work page (`/my-work`, a tile of its own); `homeLayout(role)` and `HomeService` still decide what it
shows. The `home` node has `tile: false`, so it is a sidebar link but never a tile.

- **Search** filters the tree by label, keywords, description and module, every word matching, labels that start with the
  text first (up to 12). Enter opens the first match; with none, "Search records for …" hands the text to Search (Ctrl K) through `requestSearch`
  (`components/shell/search-request.ts`).
- **Pins** are `NavPin` rows (`apps/api/src/launcher`), per user across devices: a node of the tree or a project, at most
  `LAUNCHER_PIN_MAX` (12). Order is a fractional index (`positionBetween` in `@erp/shared/launcher.ts`), so a move rewrites
  one row. `GET /launcher` drops pins the person can no longer open (a project they lost, a node `NAV_ACCESS` refuses) and
  refreshes their labels; nothing is deleted. Records are not pinnable. A tile's menu (⋮, right-click, Shift F10) pins or
  unpins; Edit pins reorders by drag or by Move left / Move right buttons. Unpinning offers Undo. The header's Pin to Home
  button pins the page or project you are on, and pins are the sidebar's Pinned section.
- **Recent** is `NavVisit` rows: every tree page, project and record page opened (`useShellPins`, and `RecordFrame` for
  records), merged within `LAUNCHER_VISIT_GAP_MS`; project and record rows are trimmed to `LAUNCHER_VISITS_KEPT` (30), node
  rows are kept for Discover (phase 3). Home shows the latest `LAUNCHER_RECENT_SHOWN` (5); Search shows them before you type.
- **Badges** (`GET /launcher/badges`) come from `HomeService.myWork`, so they never count what My work would not show:
  approvals waiting for the person on the Approvals tile and on each module by `MODULE_SUBMISSION_TYPES`, approvals plus
  entries sent back plus missing daily reports on My work, and the watch list's count on Watch list.
- **Old favourites.** The localStorage favourites and recent pages from before are sent once to `POST /launcher/import`.

Both tables are tenant tables with `tenant_isolation` policies (migration `20261205090000_launcher_pins`).

### Discover and access requests (launcher phase 3)

Home's **Discover** section (`components/launcher/Discover.tsx`) sits between Recent and All modules. What it shows is
`discoverFor(user, launcher, today)` in `@erp/shared/launcher.ts` (pure, tested in `src/scripts/launcher-test.ts`, CI runs it),
over Home's top-level tiles but My work (`LAUNCHER_FLAG_NODES`):

1. tiles marked **New** (until the person opens that module) or **Featured**: `launcherMarks` takes the company's
   `LauncherFlag` row when it has one (a `null` column keeps the default) and otherwise the node's `newUntil` / `featured`
   in the tree (Tenders and RMC plant are New until 31 March 2027);
2. up to three modules the person can open but never has: `GET /launcher` returns `opened`, the top-level tiles of every node
   they visited (`navRootOf` over their `NavVisit` node rows);
3. modules their role cannot open, greyed, with Request access: `canRequestNav` (a module, not Admin, with a page the
   company has not switched off), shown only while the company's `Organization.discoverLocked` is on (the default).

At most `DISCOVER_SHOWN` (6); when New and Featured leave too little room, fewer never-opened modules show so that one
module to ask for still fits. A tile opens a drawer with the module's line and its pages, then Open, or Request access (a
`FormShell` modal with a note). **Requests** are `AccessRequest` rows (`HomeTilesService`, `POST /launcher/access-requests`):
one waiting per person and module, refused for a module the role already opens or cannot ask for; each is audited and sends
`ACCESS_REQUEST` to the company's admins, linking to Admin › Home tiles (`/home-tiles?request=<id>`). There is no grant of its
own: an admin changes the person's role (Users) or turns the module on (Modules), then marks the request granted, or declines
it with a reason; the person gets an `ACCESS_REQUEST` notification (entity `ACCESS_DECISION`, opening Home) either way.

**Admin › Home tiles** (`app/(app)/home-tiles`, `canManageUsers`) answers requests, holds the Discover switch, and marks
each tile New (optionally until a day) or Featured, or back to as shipped (`PUT /launcher/flags/:nodeId`). Changes are
audited on the company. `LauncherFlag` and `AccessRequest` are tenant tables (migration `20261206090000_launcher_discover`).

### The launcher on the phone (launcher phase 4)

The site app's **Home tab** (`apps/mobile/app/(tabs)/index.tsx`) is the launcher too, from the same tree:

- **New entry** stays on top (Progress, DPR, Material, and Attendance or Stock): it is what a site fills in every day.
- **Pinned** is the account's pins (`src/launcher/useLauncher.ts` over `GET /launcher`, cached on the phone with
  `useFetch`'s `cacheKey`, so Home draws them offline). A long press on any tile or page opens its menu
  (`src/launcher/TileMenu.tsx`: Pin to Home, or Move earlier, Move later and Unpin with Undo); screen readers get the same
  menu as an action.
- **Modules** are `navTilesFor(user, null)` as tiles (`NavTileGrid` in `src/components/NavTile.tsx`), two columns on a phone,
  with the counts of `GET /launcher/badges`.
- **Recent** is the latest five visits from any device.
- **My work** (the old Home tab, unchanged) is a tile and the screen `app/my-work.tsx`.

**Where a node opens** is `phoneTarget` in `src/launcher/routes.ts` (no React Native in it):

- its phone screen from `PHONE_ROUTES` (node id to phone path, e.g. `site.dpr` to `/submissions?type=DPR`);
- a module opens its screen `app/module/[key].tsx`, with its pages under their groups (`NavRow`);
- a project tab asks which project and opens the page on the web;
- anything else opens on the web at `LauncherDto.webUrl` (`configuredWebUrl()`: `WEB_URL`, else the first `CORS_ORIGINS`)
  in the in-app browser, and its row says "Opens on the web".

`useOpenNode` (`src/launcher/open.tsx`) records each page opened as a visit, so Recent stays one list on the web and the
phone. The web's `scripts/nav-check.ts` checks that every `PHONE_ROUTES` entry is a live node and a phone screen, and that
every icon of the tree is in the phone's `NAV_ICONS` (`src/components/NavIcon.tsx`, Lucide through `lucide-react-native` and
`react-native-svg`, imported one by one). Every live node's name, description and group has its Hindi in
`src/i18n/hi/nav.ts`, which `npm run i18n:check` checks against `NAV_TREE`.

### Books of account (v6 item 102)

The books are kept from the same postings the Tally export sends. `PostingService` (`apps/api/src/posting`) turns each
module's records into vouchers of keyed ledger lines: certified RA bills are sales, money received is a receipt, approved
vendor bills are purchases, subcontractor bills journals, payments to vendors and site expenses payments (a journal when
bought on credit), debit notes debit notes, an approved salary run a journal on the month's last day (salaries and the
company's PF and ESI against each deduction's payable and salaries payable) and its payment a payment, and a loan or
advance to staff a payment. The Tally export calls it for records not yet exported in its date range (`unexported`,
marked by `tallyExportId`; a run's salary journal and payment are marked apart); the books call it for every record.

`LedgerAccount` is the chart of accounts: one row per ledger key (`PURCHASE`, `VENDOR:<id>`, `CLIENT:<id>`,
`EXPENSE:<category>`, …) made by the posting service with the Tally export's name and group, plus accounts that accounts
add by hand (key `ACCOUNT:<id>`: bank accounts, capital, loans, office heads). Groups (`AccountGroup`) are Tally's primary
groups, each with its nature (asset, liability, income, expense) for the statements (item 103). A system account can be
renamed or regrouped but not closed or deleted.

`BookVoucher` and `BookLine` hold the books. A posted voucher has its `source` (the posting kind) and `sourceId`, is
always approved, and carries a `hash` of what it was built from: `BooksService.postAll` (under an advisory lock, at most
once a minute when someone reads the books, or on Post now) adds new records, rewrites changed ones and removes vouchers
whose record no longer posts. Records whose lines do not balance are held, with the reason, in `BooksState.held`. A
hand-made voucher (`MANUAL`: journal, payment, receipt or contra, numbered `JV/2026-27/0001` by type and financial year)
is checked by `voucherProblem` in `books-rules.ts` (balanced, one side per line, money through cash or bank as the type
says; tested in `src/scripts/books-test.ts`, which CI runs), saved as a draft, submitted, and approved or sent back by
management (`canApproveVouchers`) other than whoever made it; an approved one can be cancelled, which keeps its number.
Every step writes `AuditLog` (entity `BOOK_VOUCHER`). Every line carries the project as cost centre.

The day book, cash and bank books and ledgers read approved vouchers only; a ledger gives the opening balance before
its period, each entry with what it was against and the running balance, and the closing balance. Only `canKeepBooks`
(admin, management, accounts) sees them. The Accounts module (`/modules/accounts`) holds Books, GST registers and the
Tally export, and leads with cash and bank in the books, vouchers to approve and records not posted.

### RMC plant (v6 item 104)

A ready-mix plant is a project of type `PLANT` (`apps/api/src/rmc`), so its materials are bought, received, counted and
seen as at any site, and its RMC is seen by those who see the project (`projectWhere` with `type: 'PLANT'`). Roles:
`canSellRmc` quotes and confirms orders, `canRunRmcPlant` (the stock keepers) dispatches trucks, `canApproveMixDesign`
approves designs, `canBillRmc` (accounts) bills and records receipts, `canRecordTest` takes cubes; `canViewRmc` is any of
them.

`MixDesign` (DRAFT, APPROVED, RETIRED) holds a grade's materials per cubic metre. `RmcOrder` is a quote (QUOTED) until
the customer accepts (CONFIRMED, needs an approved design), then CLOSED or CANCELLED; it is for a client, or an own site
(`projectId`, never billed). `RmcBatch` is one truck and its challan (`DC-`): dispatching numbers the batch, then issues
the materials from the plant's store through `StockService.issue` (which refuses what the store lacks, and then the
batch is removed), at the design times the cubic metres or as weighed (`RmcBatchLine.designQty` / `actualQty`). An order
takes up to 10% past its quantity (`dispatchable`). A truck is DELIVERED (with who received it) or REJECTED (not billed;
its materials stay issued). Cubes are a `QualityTest` of kind `CONCRETE_CUBE` at the plant with `specMin` the grade's
strength, linked by `QualityTest.rmcBatchId`. `RmcInvoice` (`RINV-`) bills an order's delivered unbilled challans:
concrete at the order's rate, pumping on the trucks pumped, GST 18% split by `isInterState` (company's Tally state code
against the client's GSTIN); cancelling one (not sent to Tally, nothing received) frees its challans. `RmcReceipt` is
money received, against a bill (up to its due) or on account. The posting service books a bill as `RMC_SALE` (Dr the
client, Cr Sales of Ready-Mix Concrete with the plant as cost centre, Cr output GST) and a receipt as `RMC_RECEIPT`, so
both reach the books and the Tally export. The figures are pure functions in `rmc-rules.ts`, tested in
`src/scripts/rmc-test.ts`.

### Financial statements (v6 item 103)

The statements read the books' approved vouchers (`apps/api/src/statements`). Each account lands on a Schedule III
(Division I) line through `statementLineOf` in `packages/shared/src/statements.ts`: its group's line (salaries and the
company's PF and ESI on employee benefits), unless accounts chose another for it (`LedgerAccount.statementLine`, offered
only among lines of the same kind), with a balance on the other side moved across as accountants show it (an overdrawn
bank under short-term borrowings, a debit with a supplier under loans and advances, a credit with a client under other
current liabilities, GST credit under other current assets). The trial balance gives each account's opening, debits,
credits and closing for a period (for a project), or each account's movement on each project; profit and loss gives
the period beside the same period a year before (and by project); the balance sheet gives the day beside the same day a
year before, with the profit of years not yet closed inside reserves and surplus. Every figure opens the account's ledger.

Opening balances: `BooksState.booksFrom` is the day the books begin. The `OPENING` voucher holds the balances of assets
and liabilities as on the day before, with whatever does not balance on a system account, Difference in opening balances.
The posting run leaves out module records dated before `booksFrom` (the opening balances stand for them), and a voucher
made by hand cannot be dated before it.

The lock: nothing dated on or before `BooksState.lockedUpTo` is posted, changed or cancelled. A hand-made voucher in the
locked period is refused; a module record added, changed or removed there after the lock keeps its old voucher (or none)
and waits in `BooksState.held` with the reason until the lock moves. Management (`canApproveVouchers`) moves the lock.

A year's close (`YEAR_CLOSE`, one voucher per year, `sourceId` the year's code) empties every income and expense balance
(per project) into the system account Profit & Loss A/c under reserves and moves the lock to 31 March. It needs the year
ended, earlier years with entries closed, no hand-made voucher of the year still open, and no record of the year held.
The statements leave closing vouchers out of a period's movements, so a closed year's profit and loss still shows its
own figures, and count them in balances after it. Only the latest closed year can be reopened (its voucher goes, the lock
moves back to the year before). `OPENING`, `YEAR_CLOSE` and `MANUAL` are `BOOK_OWN_SOURCES`, which the posting run never
touches.

Bank reconciliation: `BankStatementLine` holds a bank account's statement, read from the bank's CSV or Excel by
`readStatement` (the header row found by its names: date, narration, withdrawal and deposit or amount with Dr/Cr,
balance; Indian date styles; a fingerprint per row so the same file imported twice adds nothing). `autoMatch` pairs a
statement line with a bank book line one to one on the same amount and side, from three days before the book's date to
fifteen after, preferring one whose reference the bank names; accounts match the rest by hand, or make a voucher from a
bank-only line (charges, interest). `reconcile` gives the statement on a day: the books' balance, plus payments not yet
presented, less receipts not yet cleared, plus and less the bank's own lines, against the statement's balance on that day;
book entries before the statement's first day are taken as cleared. A posted voucher rewritten by the posting run keeps
its match where the same account still has the same amount; cancelling a voucher unmatches it. All of it is tested in
`src/scripts/statements-test.ts` (CI runs it). The Accounts home adds the year's profit and the bank lines to match.

### Biometric attendance (v6 item 101)

`BiometricDevice` is a terminal in the device register (name, make and model, serial number, the site it stands at, its
clock's UTC offset) that sends punches in one of three ways (`BiometricProtocol`): **ADMS**, the push protocol of ZKTeco,
eSSL and their relatives, where the device calls `GET/POST /iclock/cdata`, `GET /iclock/getrequest` and
`POST /iclock/devicecmd` on the API host (outside the `/api` prefix, `@Public`, found by serial number with
`withoutTenant`; an unknown serial gets 401); **WEBHOOK**, `POST /api/biometric/webhook` with the device's own key in
`X-Device-Key`, for cloud attendance services and middleware; and **FILE**, a CSV or Excel export from the device software
that HR imports on the Punches tab (the web turns Excel into CSV; `parsePunchFile` finds the user number and date/time
columns by their headings and reports lines it cannot read).

Every format goes through `apps/api/src/biometric/biometric-rules.ts` (pure, tested in `src/scripts/biometric-test.ts`,
CI runs it): device-local time to UTC with the device's offset, user numbers without leading zeros, a day's punches to
check-in, check-out and hours with punches within `DOUBLE_PUNCH_MINUTES` of each other read as one. `BiometricPunch`
keeps every punch once (unique on device, user number and instant, so a device that resends its log adds nothing) with
what it did (`BiometricPunchResult`): APPLIED, UNMATCHED (the user number is not matched yet), LOCKED (the day's DPR is
approved) or SKIPPED (with the reason, such as a worker punching at a device with no site, or a worker marked at another
site that day).

`BiometricUser` matches a user number (one per organisation, so a person enrolled on several devices under one number is
one row) to an employee or a worker; HR matches them one by one or by employee code number. Matching re-applies the last
62 days of that number's punches. An employee's day becomes `StaffAttendance` (first and last punch, present or half day
by hours, overtime as PENDING for the usual approval), marked by the person who registered the device; a worker's day
becomes `WorkerAttendance` at the device's site and recounts the DPR head count through `WorkersService.recountHeadCount`.
A staff day already marked keeps the earlier check-in and the later check-out of the two; a worker's roll call at the
same site takes the punches' times. Only `canManageBiometric` (admin, management, HR) sees the Biometric
devices page.

### Payroll (v6 item 100)

Salaries are `SalaryStructure` rows per employee from a date (basic, DA, HRA, conveyance, special, other a month; PF, ESI
and PT on or off; tax regime, deductions declared for the old regime, other income for TDS), so a raise is a new row and
earlier months keep what they paid; a structure cannot start in a month whose run is past draft. `PayrollSettings` (one
row per organisation) holds the PF and ESI rates and ceilings, the professional tax state (`PT_RULES` in
`@erp/shared` by GST state code, with women's slabs and the higher last month where a state has them), paid days on
the calendar or 26, the overtime multiplier and the debit account for the bank file. `StaffLoan` is a loan or advance
recovered by a fixed amount a month from `startMonth`; what is left counts deductions in runs past draft.

Every figure comes from `apps/api/src/payroll/payroll-rules.ts`, pure functions tested by `src/scripts/payroll-test.ts`
(CI runs it): `computePayslip` (days paid from attendance less loss of pay, earnings pro rata, overtime at the multiplier
on (basic + DA) / 26 / 8, PF on basic + DA capped at the ceiling when set, ESI while gross is within the ceiling, rounded up,
PT, TDS as the year's tax on the annualised salary under the person's regime, new-regime rebate with marginal relief and
4% cess, spread over the months left, loans capped by what is left of net), `structureCost` (CTC) and `computeSettlement`.

`PayrollRun` is one month for the company or one site (`SAL-YYYY-MM[-code]`), with a `Payslip` per employee on the rolls
that month (a snapshot of designation, site and bank, the days, the totals) and `PayslipLine`s by code (`PAYSLIP_CODES`).
A run is not a site submission: it has its own approval, not `SubmissionLifecycleService`. HR prepares it, works it out
again while in draft (lines HR adds by hand, `MANUAL_PAYSLIP_CODES`, are kept) and submits it (`canRunPayroll`);
management approves or sends it back (`canApprovePayroll`); accounts marks it paid (`canPayPayroll`) and may send an
approved run back before paying. A paid run is locked. Each step writes `AuditLog` (entity `PAYROLL_RUN`). An approved run
gives the NEFT bank file (CSV), the EPFO ECR 2.0 text (fields joined by `#~#`) and the ESIC monthly contribution CSV;
the web adds the salary register (xlsx) and the payslips to print. A person sees their own payslips once their run is
approved (`GET /payroll/my-payslips`, the Staff page's My payslips tab, the phone's My payslips).

`FinalSettlement` (one per employee, `FNF-<code>`) is worked out once an exit is recorded: unpaid days of the last month,
earned leave not taken (balance from `StaffService.balancesFor`, at (basic + DA) / 26), gratuity from 4.75 years of
service (15/26 of the last basic + DA per year, capped at 25 lakh), notice not served from the resignation's `noticeGivenOn` (gross / 30 a
day) and loans still owed. HR prepares it, management approves, accounts pays; the exit cannot be taken back while one
exists. The web prints the statement with the lines to sign.

### HR records (v6 item 99)

`Employee` carries the whole HR record: job and terms (employment type, grade, reports to, probation end, confirmation,
notice days) that anyone who sees the person sees, and personal, statutory and bank details plus CTC that only staff
admins, payroll (`canViewEmployeePrivate`) and the person themselves get, as `EmployeeDto.private` (null otherwise;
`StaffService.toEmployeeDto(e, user)` decides). Aadhaar is kept as its last four digits only.

Each step of a person's service is an `EmployeeEvent` (`EMPLOYEE_EVENT_TYPES`: joined, confirmed, transferred, promoted,
increment, warning, resigned, terminated, retired) with a letter number `HR-<year>-0001` per organisation
(`nextLetterNo`, under an advisory lock) and the before and after of posting, designation, department and CTC.
`HrService.recordEvent` changes the staff record to match in the same transaction (an exit sets the last working day and
marks them as left); `removeEvent` takes back only the latest event, never the joining, and puts the record back.
Creating a staff record with a joining date writes its JOINED event. `GET /staff/events/:id/letter` returns what the
letter needs; the web prints it from `components/staff/hrLetterPrint.ts` (an exit also prints the experience certificate).
Documents are attachments on `Attachment.employeeId` (`PUT /staff/employees/:id/documents`).

`GET /staff/hr-dashboard` (staff admins and payroll) gives head count by site, department and employment type, who joined
and left this month, probation ending in 30 days or overdue, birthdays and work anniversaries to the end of next month, and
active staff with no PAN, UAN or bank account; the People home shows it under the module's figures.

### Management view on the phone (v5 item 96)

`GET /dashboard/company-today` (`HomeService.companyToday`) is the company's day for the roles in `COMPANY_TODAY_ROLES`
(admin, management, accounts and project managers; anyone else gets 403). Each part is left out unless the role sees its
module, and covers only the projects the caller sees (`projectWhere`):

| Part | Shown to | From |
|---|---|---|
| Paid and received, today against yesterday | `canViewPayables`, `canViewContract` | `VendorPayment.paymentDate`, `Receipt.receiptDate` |
| To pay and to collect, with the overdue part | `canViewPayables`, `canViewContract` | `PayablesService.summary` (due dates), `ReceivablesService.summary` (overdue once past the project's `clientPaymentDays`, 30 when unset) |
| Attendance today | `canViewLabourSummary` | `StaffAttendance` (company-wide roles: all staff; a project manager: staff posted at their sites), attendance sheets and the roll call per active site |
| Fuel today | the Machinery page's gate | `FleetService.fuelPosition` summed per fuel item, sites below their minimum |
| Purchase | `canViewPurchaseOrders` | `PurchaseOrdersService.status` (orders still to come, late), approved requests with something `toOrderOf`, today's GRNs and those QA/QC has not checked in 30 days |
| Approvals by module | everyone here (amounts with `canViewCost`) | `SubmissionLifecycleService.submitted`: every entry waiting in the caller's projects, whoever decides it |
| Waiting with others | everyone here | `SubmissionLifecycleService.waiting` |

Lists carry at most `COMPANY_TODAY_ROWS` rows. The phone (`src/components/CompanyToday.tsx`) puts the tiles above My
work on Home for these roles, in an order per role (accounts lead with money to pay); a tile opens its list in a
`BottomSheet`, and a row opens its record through `phoneRoute` where the phone has a screen for it. The answer is kept
under the `company-today` cache key, so the tiles show offline with the last figures.

### Small purchase items (v5 item 95)

**Stock first.** A material request's lines are free text; `StockService.requestStock` matches each to the item master
by name and unit (`masterItemFor`, adding nothing) and sums `StockTxn` per project over the projects the user can see:
what the request's own site holds and what the others hold. Take from stock (`POST /material-requests/:id/cover`, store
keepers of the sending site, approved requests only) is an `ISSUE` to whoever raised the request when it comes from the
request's site, or a `TRANSFER_OUT` to it from another site (received there as any transfer). Each line gets a
`MaterialRequestCover` row with the quantity, tied to the store entry (deleting the entry deletes it). What a line still
needs is `toOrderOf` in `purchase-math.ts`: requested less what orders hold, what was received without an order and what
stock met; the PO form, the GRN against the request and `toOrderQty` all use it, so met quantities are neither ordered
nor received again. A line can never be met beyond its need: the check runs again under the stock lock.

**Last orders.** `GET /purchase-orders/last-rates?item=name|unit` returns, per item, the last five approved PO lines
(PO, date, vendor, project, quantity, rate, GST) the user may see, newest first. The quotation form, the comparative
statement and the PO form show the latest under each rate and the five in a popover (`LastRates`).

**Enquiries.** Procurement sends an `Enquiry` for an approved request to chosen suppliers with a closing date. Each
vendor gets an `EnquiryToken`: the raw token exists only in its link (`/quote/<token>` on the web), the table keeps its
SHA-256, as for `PasswordToken`; it expires at the end of the closing day (IST), and a new enquiry to the same vendor on the
same request closes the old link. The link is emailed when the vendor has an email and email is set up; the answer to
sending carries every link once, to pass on by WhatsApp. The supplier's page (`GET`/`POST /public/quotes/:token`, no
sign-in, sixty tries in ten minutes per address) is looked up with `withoutTenant` and shows the company, site, items
and closing date. The reply is saved once (the token's `respondedAt` is claimed in the same transaction) as that vendor's
`Quotation` on the request with `fromSupplier` (an earlier one of theirs is replaced unless an order was raised on it),
audited under the buyer who sent the enquiry, who is emailed. It then sits on the comparative statement like any other.

### Approval levels and escalation (v5 item 94)

Who approves a type is the approval matrix (`ApprovalRule`, Settings > Approval rules), or the fixed rule while a company
has none. A rule has a `level` (1 to 3): level 1 is the matrix as before (each role up to its `maxAmount`); levels 2 and 3
apply from their `minAmount` (one amount per level, the third at least the second; no amount means every entry). An
entry whose amount needs a higher level stays `SUBMITTED` after the level before approves it: `review()` writes an
`ApprovalStep` (`APPROVED`, the level, who, the note, and the round, which is its `submittedAt`) and a `LEVEL_APPROVED`
audit line, tells the next level, and returns `{ status, level, levels }`; the last level approves it as before. So the
six status columns stay as they are on every submission table, and a company without levels behaves exactly as before.
Rejecting or sending back at any level ends the round; a resubmission starts a new round, so earlier steps no longer
count.

All decisions read one pure module, `src/common/approval-levels.ts` (tested in `scripts/approval-levels-test.ts`):
`stageOf` (the level an entry waits at, from the round's steps), `levelRoles`, `escalationRoles` (the next level's roles,
management above the last), `queueRoles` and `mayDecide`, which also refuses the person who approved an earlier level of
the same entry and says why ("It has moved on to level 2…"). `ApprovalRightsService.decide` loads the rules and steps
for `ProjectAccessService.assertCanApproveSubmission`; `pending()` keeps only entries the caller decides now;
`GET /approvals/:type/:id/stage` gives a record its levels, steps, whose queue it is in (`waitingWith`) and since when,
`canReview` and the reason; `GET /approvals/waiting` lists the caller's own waiting entries (Home's Waiting with others
card and the phone's My submissions). The web's buttons follow the stage on a record and the Approvals queue in lists.

`ApprovalEscalation` (per type: `remindAfterHours`, `escalateAfterHours`) drives `NotificationJobsService.approvalEscalation`,
run hourly (`GET /notifications/jobs/approval-escalation`, the in-process scheduler on the hour, and inside both daily
crons): once per level it reminds the level's approvers (a `REMINDED` step), and after the escalation time it records
`ESCALATED`, after which the next level's roles (management above the last level) may decide the entry too and are
told by push and WhatsApp.

### Undo after a delete

Deletes are hard deletes. A kind whose delete is cheap to reverse (a single row, or a row with its own lines, and no
other effects) registers with `UndoService` (`src/common/undo.service.ts`) next to its delete, with the same access rule
its delete checks; its delete then returns `{ ok: true, undo }`. `undo` is the deleted rows (and the links the delete
cleared, such as `worker.vendorId`) sealed with AES-GCM under the server's secret, for the deleting user in their
organisation, for a minute. `POST /undo { token }` runs the access rule again and puts the same rows back with the same
ids in one transaction (409 when a row with the same unique name came in since), writing `RESTORED` to `AuditLog`. The
web's `ConfirmDelete` offers Undo for ten seconds whenever a delete returns `undo`. Kinds: holidays, units, clients,
vendors, saved views, workers, milestones, drivers, close-out lines, checklists, stock items and quotations. Submissions
and payments are not undoable: their deletes have side effects (measurements freed, bills back to outstanding, stock).

## Planning and progress

- `BoqItem` carries the contract quantity and rate. `Activity` is the unit of site reporting and
  optionally links to a BOQ item.
- `ProgressEntry` records executed quantity against an activity. Only APPROVED entries count.
- BOQ executed quantity = sum of approved progress on its linked activities.
- Physical progress % of a project = the work breakdown roll-up (below): with no breakdown, activity completion
  weighted by BOQ value (rate × planned quantity), falling back to planned quantity when an activity has no BOQ link.
- Project-type differences (chainage for roads, floors for buildings, connections for water) are
  carried by free-text `location` and the activity list, not by schema. A per-type activity template
  is the planned next step so new projects start from a standard list.

### Work breakdown

Item 125: a project split into what it is made of, so a turnkey scheme reports by component and a lump-sum contract
weighs each by its billing share.

- **Tables.** `WorkElement` (with a `tenant_isolation` policy): project, `parentId`, `level` (COMPONENT, or
  SUB_COMPONENT inside one; two levels, no deeper), outline `code` (unique per project, `3`, `3.2`), name,
  `elementType` (`WorkElementType`: intake well, treatment plant unit, overhead tank, pipe zone, house connections,
  building block…), `specs` (a few numbers its template reads: capacity, staging height, length), `weightPct`, sort
  order. `Activity` gained `workElementId`, `parentActivityId` (a sub-activity; one level) and `weightPct`. `BoqItem`
  gained `section` (bill section or cost centre), `workElementId`, `sorItemId` and `sorRef`. `Project` gained
  `contractModel` (ITEM_RATE, LUMP_SUM, EPC) and `ProjectType` gained SEWERAGE.
- **Roll-up** (`rollUp` in `packages/shared/src/wbs.ts`, pure, used by the API through `progressRollup` /
  `physicalProgress` in `src/common/progress.ts` for the project list, the client portal, the progress report and the
  Structure tab): a leaf activity is approved ÷ planned (0 to 100); an activity with sub-activities has no progress of
  its own and is its parts weighted; an element is its sub-components and activities weighted; the project is its
  components and any activity outside the breakdown. Among siblings, given weights hold and the rest share what is
  left of 100 by value (BOQ amount, else planned quantity); with no weight given they are all weighed by value, which
  for a flat project is the old figure. `src/scripts/wbs-rollup-test.ts` (CI flows) holds it to that.
- **Rules.** Progress goes only against an activity with no sub-activities (`assertTakesProgress` in `src/progress/progress.service.ts`);
  an activity with progress cannot take parts; a sub-activity sits in its activity's component (moving the activity
  moves its parts); deleting an activity with parts is refused; deleting a component deletes its sub-components and
  leaves their activities and BOQ items outside the breakdown.
- **Templates.** `elementPlan(type, specs)` in `packages/shared/src/element-templates.ts` lays out a component's
  activities with weights adding up to 100. Every RCC item is three sub-activities, reinforcement (MT) 35, shuttering
  (m²) 25 and concrete (m³) 40; a staging, steining or wall is one RCC activity per lift (height ÷ lift, at most 20), a
  building block one frame per floor. Quantities come from the specs where they say (pipe length, connections, one per
  lump sum) and are otherwise left for the planner. Built-in only for now; a company's own element templates are a
  follow-up.
- **API.** `GET /projects/:id/structure` (`StructureDto`: elements in outline order with progress, effective weight and
  BOQ amount, activities with their parts), `POST …/structure/elements` (with the template's `activities`),
  `PATCH|DELETE …/structure/elements/:id`, `POST …/structure/elements/reorder` and `…/import` (Excel rows; `3.2` goes
  under `3`). Editing is `PROJECT_EDITOR_ROLES`, like the BOQ.
- **Screens.** Project › Plan › Structure (`components/structure/`): the tree folded to its components, weights (worked
  out ones in grey), progress and BOQ amount, New component with its template's lines and planned quantities, Excel in
  and out. The BOQ tab filters by section and shows section totals; the activity form takes the component, the parent
  activity and the weight; the progress form offers only activities without parts. Phone: project › Structure, read
  only (`app/structure.tsx`).
- **Demo.** `prisma/seed-structure.ts`: WS-2026-04, a lump-sum town water scheme in month 9 (twelve components by
  billing share, 23 elements, about 390 activities with approved progress), and the hospital's BOQ in sections with
  three components weighed by BOQ value.

### Structured DPR

Item 127: the DPR is where the site reports the day's work, line by line against the work breakdown, so the BOQ,
schedule, earned value, bills and the stock check all read the same approved quantities and nobody types them twice.

- **Lines are progress entries.** A work line is a `ProgressEntry` with `dailyReportId` (cascade with the DPR),
  `sortOrder`, `labour` (`[{ category, count }]`, its total in `manpowerCount`), `machines` (`[{ name, hours }]`, names in
  `machineryUsed`), `workOrderId` (the subcontractor's work order, optional) and the usual location fields; material used
  is `ProgressMaterial` rows (store item, quantity; `tenant_isolation` policy), which the stock check against the DPR
  (item 128) reads. Lines take the DPR's day, status and submitter.
- **One approval.** `DprService` saves the complete list of lines with the DPR (`saveLines`, in the DPR's transaction:
  kept by id, new ones added, missing ones removed) and checks each: an activity of the project with no sub-activities,
  store items, a work order of the project, a quantity above 0 (`dprLineProblem`). `SubmissionLifecycleService.onStatus`
  moves the lines with the DPR (submitted, approved, rejected, sent back), and `partOf` refuses submitting or deciding a
  line on its own; the approvals queue, counts and bulk approve leave lines out (`dailyReportId: null`). Hold points
  are checked for every line before the DPR is approved (`InspectionsService`, `beforeApprove('DPR')`). The progress list
  shows lines like any entry, opening their DPR for changes.
- **Figures.** On `GET /dpr/:id` each line carries scope (planned), up to previous (approved on the activity up to the
  DPR's day outside this DPR, plus this DPR's earlier lines on it), cumulative, % and balance (`lineFigures`). With no
  text of its own, `workExecuted` is written from the lines (`workSummary`) and rewritten when they change, so lists,
  search and AI read it as before. The arithmetic is pure in `packages/shared/src/dpr-lines.ts`, tested in
  `src/scripts/dpr-lines-test.ts` (CI flows).
- **Work options.** `GET /dpr/work-options?projectId&date` gives the form the activities that take progress (planned
  within a week and unfinished first, then by component code), each with its component and sub-component, scope, done
  and the BOQ item's material norms; the store items; the project's approved open work orders; and the company switch.
  Material is filled from the norms for the line's quantity (`suggestMaterials`) until the user changes it.
- **Progress from the DPR only.** `Organization.progressFromDpr`, on for companies made after item 127 and switched on
  the Approval rules page: `POST /progress` is refused and the progress form points to Daily reports.
- **Screens.** Web: the DPR form's Work done section (`components/dpr/DprLinesField.tsx`, a `LineTable` with the crew,
  machines, material, work order and remark of each line in a dialog, Copy lines from the last DPR, the crew on the lines
  against the head count); the record groups lines by component › sub-component (`DprLines.tsx`) and the print uses the
  site's layout (S.No, component, sub-component, activity, unit, scope, up to previous, today, cumulative, %, balance,
  remark) in landscape. Phone: `app/dpr/new.tsx` takes lines (`src/forms/dprLines.tsx`: activity picker with this week's
  first, quantity, where, crew, material from the norms, Copy yesterday; offline through the outbox) and `app/dpr/[id].tsx`
  shows them. Machines per line are on the web only; the phone keeps the day's machinery.
- **Demo.** `seedTownDprs` in `prisma/seed-structure.ts`: three days of WS-2026-04 DPRs with tank, pipe laying,
  backfill, house connection and road restoration lines, two approved and the latest waiting for the PM.
- **Next.** The look-ahead's planned quantities and a weekly and monthly report on the same tree follow. Pipe lines
  name their segment (item 126, "Pipe network" below).

### Pipe network

Item 126: a water supply or sewerage project's pipe zones and mains are reported the way the site keeps its pipe
sheet: each pipe junction to junction, trenched, bedded, laid and jointed, backfilled, tested, restored and
commissioned, with valves fixed at their points.

- **Model.** A zone is a `WorkElement` of type `PIPE_ZONE`, `RISING_MAIN` or `FEEDER_MAIN` (`PIPE_ELEMENT_TYPES`). Its
  `PipeNode` rows (code, `PipeNodeKind`: junction, tank, source, valves, scour, chamber, end, crossing pit; ground level,
  x and y from the model, chainage) and `PipeSegment` rows (code, from and to node, length, diameter, `PipeMaterial`,
  class, `PipeScope` proposed or existing, surface, crossing, BOQ item) carry `organizationId`, `projectId` and `zoneId`,
  and codes are unique in a project. All three tables (with `PipeTestSegment`) have `tenant_isolation` policies.
- **Stages.** `Activity.pipeStage` (`PipeStage`) says which stage an activity stands for; new pipe activities get it
  from their name (`guessPipeStage`), and `activityPipeStage` guesses it for older ones on a pipe element. The zone
  template measures every length stage, restoration included, in running metres along the trench.
- **Work on a pipe.** A DPR line of a length stage on a zone with a network names its segment
  (`ProgressEntry.pipeSegmentId`, and `pipeNodeId` for the end it started from or the valve fixed). `DprService`
  refuses a line without one, a segment of another zone or an existing pipe, and a stage taken past the pipe's length
  counting every entry not rejected (`heldOnSegments`, `segmentCapProblem`). Valve lines may name their valve (specials
  have none). `lineLocation` puts the segment first ("P-27, J-12 to J-13, Market road"), so the summary, record, print
  and search name it. The record and print add the day's pipeline table (`pipelineSummary`: metres per stage by zone
  and diameter, valves fixed).
- **Figures.** `GET /projects/:id/pipe-network` (`PipeNetworkService.get`) gives each segment's approved metres per
  stage held to its length, its weighted % (`PIPE_STAGE_WEIGHTS`) and furthest stage (`segmentStatus`), what waits for
  approval, and per zone the pipe sheet by diameter and material (`zoneTable`), the pipes ready to start from the tank or
  a laid pipe (`workingFronts`), and metres recorded before the network was loaded (`unplacedM`). A passed test that
  names segments (`PipeTestSegment`, the test form's Pipes tested on a hydraulic test) counts their testing done. The
  zone's activities and the project's progress still come from the entries through `rollUp`.
- **Import.** The network comes from the design office's model, read on the screen: an EPANET `.inp` file
  (`parseEpanetInp`: junctions, reservoirs as sources, tanks, pipes, valves as valve points, coordinates, US units
  converted, pumps left out and said so) or an Excel book of nodes and pipes with loose headers (`parseNetworkSheets`).
  `POST /projects/:id/pipe-network/import` (project editors) checks it (`networkProblems`), previews what it would do
  matched by code (`importPlan`: new, changed, kept; never a pipe cut below its work) with `dryRun`, and saves only
  without problems: nodes and pipes upserted by code, nothing deleted, the zone's length stages planned at its proposed
  length and its valve stage at its valve count (`planFromNetwork`), audited as `PIPE_NETWORK_IMPORTED`.
  `PATCH .../segments/:id` corrects one pipe (not below its work).
- **Screens.** Web: Project › Plan › Pipe network on water supply and sewerage projects (`components/pipes/`: the zone
  map drawn from coordinates or as a tree from the tank, pipes in the state of their work and thicker by diameter, the
  pipe sheet, ready to start, the pipe list with search, state filter, Export and Correct, and the import dialog); the
  DPR form's Where picks the segment or valve (`DprLinesField`), the test form the pipes tested. Phone: the DPR line's
  segment and valve pickers (`src/forms/dprLines.tsx`).
- **Code.** The arithmetic and readers are pure in `packages/shared/src/pipe-network.ts`, tested in
  `src/scripts/pipe-network-test.ts` (CI flows); `e2e/tests/pipe-network.spec.ts` covers a line held to its pipe, the
  import preview and the tab.
- **Demo.** `seedTownNetwork` (`prisma/seed-pipes.ts`): zone 2 of WS-2026-04, a tank, a 20-junction spine and six
  branches with sluice valves, an air valve and a scour (53 pipes, 10.1 km), its approved work laid out pipe by pipe
  from the tank, the town DPRs' pipe lines on the pipes past each stage's front, and a passed hydraulic test.

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
  `achievedOn`.
- **Links and the critical path (v6 item 114).** `ActivityLink`: project, predecessor, successor, type `ActivityLinkType`
  (FS, SS, FF, SF) and `lagDays` (negative is a lead), one per pair, with CHECKs against a self link and a lag over 365
  days and a `tenant_isolation` policy. The rules are pure functions in `apps/api/src/planning/schedule-rules.ts`, tested
  in `src/scripts/schedule-links-test.ts` (CI runs it): `linkProblem` refuses a self link, a repeat and a loop (naming
  it), and `criticalPath` runs the forward pass in link order (each activity keeps its planned length and starts no
  earlier than planned, later when a link says so; one already started is fixed at its actual start, a done one where it
  ran) and the backward pass from the latest early finish (a successor that has started no longer holds its
  predecessors through FS or SS links), giving early and late dates, total float and `critical` (float 0 or less, not
  done). The Gantt carries them per activity with `linkStartsOn` (planned before its links allow, not started) and the
  summary's links, critical count, conflicts and `networkFinish`. `POST/PATCH/DELETE /projects/:id/links`,
  `POST /projects/:id/schedule/apply-links` (moves each conflict to its link date, length kept; audited
  `SCHEDULED_FROM_LINKS`) are for project editors.
- **Look-ahead.** `GET /projects/:id/lookahead`: the three weeks from this Monday (`lookaheadWeeks`), the open activities
  planned in each and those past their end, each with `readiness` (under way; ready when its finish links' predecessors
  are done, its start links' have started and the lag lets it start by today; else waiting, naming what on).
- **Files.** `schedule-files.ts`: MS Project XML and Primavera P6 XER, out (`GET /projects/:id/schedule/export?format=`,
  anyone who sees the project) and in (`POST /projects/:id/schedule/import`, project editors, `dryRun` previews). Days
  are calendar days, 8 working hours a day. Summary rows and milestones in a file are left out (and listed), activities
  are matched by name (a match takes the file's dates, the rest are added with unit "job"), and the file's links replace
  those between the activities it touched, refused whole if they make a loop. The JSON body limit is 4 MB for this.
- **Web.** Project tab Gantt: summary, baseline banner with Freeze / Re-baseline, a week or month scale with the
  plan bar filled to progress, the baseline as a grey bar under it, milestones as diamonds and a line for today,
  and the milestone list. The Activities tab shows the baseline end under a moved planned end. Critical bars have a
  red top edge, float shows as a dotted line to the late finish and a marker shows where the links let a bar start;
  an activity's row opens its links drawer (waits on, followed by, float). A banner counts the activities planned before
  their links allow, with Move them; Export and Import take MS Project XML or P6 XER. Project tab Look-ahead: the three
  weeks as a grid of days per activity, critical ones marked, what is ready and what waits.

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
- **Central store (v6 item 106).** A store or yard that is not a site is a project of type `STORE` (like the RMC
  plant's `PLANT`), so GRNs against its own POs, issues, counts, valuation and transfers all work as for a site. It
  has no DPR: stores are left out of the DPR reminder, the home "DPR missing" list and the watch list's DPR rules.
  A site's material request lists what the stores hold even to someone who is not one of the store's people
  (`ProjectAccessService.stockSourceWhere`: visible projects plus every `STORE`); only the store's keepers see
  `canSend` and can send from it. `GET /stock/stores` (`canSeeStores`: store manager, procurement, accounts,
  approvers) lists the visible stores with items, value (store managers and cost viewers), items below minimum,
  last movement and transfers on the way out and in; `GET /stock/destinations` lists every open site and store a
  transfer may go to, stores first. The web has Central stores (`/stores`, `/stores/[id]` with the project's stock
  panel); a store's project page redirects there. Chosen over a separate `storeId` on stock rows so every stock
  path stays one path.
- **One name per item (finding 3 of the October review).** Request and order lines are still text, but the web's
  `ItemPicker` picks from the item master with its unit (and a PO line its standard rate), and a new name first offers
  the items it may mean (`similarItems`). On save, `asMasterNames` (`stock/item-master.ts`) writes each line's name and
  unit as the master has them when `masterItemFor` finds the item (case, dots and spacing ignored by `itemKey`, the unit
  by `normUnit`, or a merged old name in `Item.aliases`); GRNs, stock-first, PO approval and the item form's duplicate
  check use the same lookup, so stock, last rates and leakage stay on one item. Existing duplicates are merged once
  from Stock › Item master › Possible duplicates (`GET /stock/items/duplicates`, `duplicateGroups`; `POST
  /stock/items/:id/merge`, store managers and approvers): every foreign key to `Item` (read from the Prisma schema)
  moves to the kept item, a minimum or norm both have keeps the kept one's, request and order lines take its name,
  and the merged names become its aliases. Rules in `@erp/shared/items.ts`, tested in `src/scripts/items-test.ts`.
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

### Fuel and fleet use (v5 item 93)

- **Fuel issue.** `Item.isFuel` marks diesel and petrol (the migration marks items in a Fuel category or named diesel,
  petrol or HSD). `POST /stock/fuel-issues` is an issue slip (`ISS-…`) of one fuel item into one machine:
  `StockEntry.equipmentId` and `meterReading` (hour meter, or odometer for a vehicle). It goes through
  `StockService.issue`, so the stock check, minimum-level alert and numbering are the same as any issue; it refuses an
  item not marked as fuel and an inactive machine, and takes a client `id` (the phone's outbox, `FUEL_ISSUE`). Roles:
  `canIssueFuel` (whoever issues material).
- **Fuel position.** `GET /fleet/fuel-position?date&projectId` (`FleetService`): per site the user sees and fuel item,
  opening (all movements before the day), received (any positive movement), into machines (issues with a machine),
  other issues and closing, against the item's minimum level, with the day's issues into machines.
  `GET /fleet/fuel-issues?from&to&projectId&equipmentId` lists issues over a period.
- **Norm.** `Equipment.fuelNorm` in `fuelNormUnit` (`LITRES_PER_HOUR`, or `KM_PER_LITRE` for a vehicle, whose meter
  is then km) with `fuelTolerancePct` (default 15). `fuelNormCheck` in `warning-rules.ts` averages the machine's latest
  ten logs with fuel (at least five); a log's litres are its diesel, or the fuel issued into it that day when the log
  has none. Off by more than the tolerance gives a `FUEL_NORM` watch-list warning (store manager and approvers,
  `canManageMaintenance`), keyed by machine, direction and 10% step. A log's record shows the fuel issued beside its
  diesel, and a hire bill whose owner fuels the machine recovers the month's fuel issues into it (else the logs'
  diesel).
- **Utilisation.** `GET /fleet/utilisation?from&to&projectId`: approved logs per machine; a day with a log is a day on
  site, available for `SHIFT_HOURS` (8) or the hours logged when longer; utilisation = worked ÷ available,
  availability = (available − breakdown) ÷ available; totals by category and for the fleet.
- **Tyres and batteries.** `EquipmentPart` (tenant table, RLS): kind (`TYRE` / `BATTERY`), position, make, serial,
  fitted on and at what meter, removed on and at what meter with the reason, cost (cost viewers only), optional job
  card or store entry. `GET/POST /equipment/:id/parts`, `PATCH/DELETE /equipment/:id/parts/:partId` (writes:
  `canRecordEquipmentParts`, audited on the machine). Life is the meter run to removal, or to the machine's latest
  reading (logs, fuel issues, job cards) while still on.
- **Clients.** Web: Machinery page and project tab gain Fuel (position, issues, Fuel issue form, Excel) and
  Utilisation (period, by machine and category, Excel); the machine form has the norm; Equipment's tool button opens
  the tyres and batteries drawer; the item master has a Fuel tick. Site app: `app/stock/fuel.tsx` from Stock
  (offline through the outbox, with today's fuel position for the site).

### Machine finance (v6 item 108)

- **Tables.** `EquipmentLoan` (tenant table, RLS): an owned machine, the lender (as typed, optionally a vendor), the
  lender's loan account number (unique in the company), sanction date, amount, yearly rate, tenure, EMI, first EMI date,
  `disbursal` (`MACHINE_COST`: the lender paid the dealer; `BANK`: credited to the company, a loan against a machine
  already owned), `ACTIVE` / `CLOSED` with `closedOn`. `LoanEmi` (tenant table, RLS) is its schedule: number, due date,
  owed before, principal, interest, EMI, owed after, and once paid the day, mode, reference and who recorded it. Checks
  in the migration keep the terms sane and each EMI adding up.
- **Rules.** `src/machine-loans/loan-rules.ts`, tested in `src/scripts/loans-test.ts` (CI runs it): the EMI by the
  annuity formula to the rupee (or the lender's); each month's interest is the rate's twelfth on what is owed at its
  start, the rest repays the loan, and the last EMI clears what is left; EMIs fall on the first EMI's day of each month
  (the month's last day when shorter). EMIs are paid in order, not in the future and not before sanction; the last one
  paid closes the loan. Closing early makes the next EMI repay all that is owed with the lender's interest and drops the
  later ones; undoing the last payment (not once Tally has it) rebuilds the schedule from that EMI. Terms change only
  until the first EMI is paid. Nothing is dated on or before `BooksState.lockedUpTo`.
- **Books.** `PostingService.machineLoans`: a loan is `MACHINE_LOAN`, a journal on its sanction date, Dr Plant and
  Machinery (`MACHINERY`) or the bank (then a Receipt in Tally, `Voucher.voucherType`), Cr the loan's own ledger
  `LOAN:<id>` ("HDFC Bank Loan CEL-…", Secured Loans); each EMI paid is `LOAN_EMI`, a payment, Dr the loan with the
  principal, Dr Interest on Machinery Loans (`LOAN_INTEREST`, shown on the Finance costs line), Cr bank or cash. The
  Tally export marks both (`tallyExportId`) and its ledger list has a Machine loans group. A loan older than
  `booksFrom` comes in with the opening balances.
- **The machine's cost.** The loan page shows the interest paid over the hours the machine has worked (approved logs)
  since the loan. Project cost keeps charging owned machines at their internal rate, which is meant to cover owning
  them, so interest is not added to a project a second time.
- **Due and overdue.** `NotificationJobsService.loanEmisDue` (with the digest, and `GET /notifications/jobs/loan-emis-due`)
  reminds admin, management and accounts once when an EMI falls due within `EMI_DUE_DAYS` (7) and once more when it is
  past its date (type `BILLS_DUE`, entity `EQUIPMENT_LOAN`). `emiOverdue` in `warning-rules.ts` gives a `LOAN_EMI`
  watch-list warning once the oldest unpaid EMI is more than two days late, keyed by loan, EMI and count.
- **API and roles.** `/machine-loans` (list with the running loans by lender, `preview` for the form, `:id` taking a
  loan's or an EMI's id, create, PATCH, DELETE without EMIs paid, `pay`, `foreclose`, `undo-pay`), for
  `canManageMachineLoans` (those who keep the books). `EquipmentDto.loan` names a machine's running loan to them.
- **Clients.** Web: Accounts → Machine loans (`/machine-loans`: owed, overdue, due in 30 days, the year's interest, by
  lender, and the loans) and each loan's page (`/machine-loans/[id]`: terms, cost of finance, the schedule, Pay EMI,
  Close early, Edit, Undo, Delete); a financed machine in Equipment links to its loan. Not on the phone.

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
- **Held to the BOQ (finding 4 of the October review).** A create or an edit of the lines or BOQ item is refused
  when every sheet of the item but rejected ones would pass its BOQ quantity (revised, else original) plus
  `Project.measureTolerancePct` (Contract › Edit; 25 when not set, `MEASURE_TOLERANCE_PCT`): `measureOverBoq` in
  shared, tested in `src/scripts/validation-test.ts`. An extra item (no BOQ quantity) is held by its variation instead.
- **Other input checks.** A DPR, progress entry or attendance sheet is not dated after today in the company's time
  zone (`assertNotAfterToday`, `common/serialize.ts`); quantity fields are `@IsQuantity()` (`common/quantity.ts`: a plain
  decimal above zero, or zero or more), never a bare `IsNumberString`, which takes a minus sign. On the web every date
  field is `components/common/DatePicker` (ESLint refuses antd's), which reads dates typed as 13/10/2026, 13-10-2026,
  13.10.2026 or 13 Oct 26 (`DATE_FORMATS`).
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

## Drawing viewer and markup

Item 109: a revision's drawing opened in the app and marked up, instead of printed, marked by hand and photographed.

- **Table.** `DrawingMarkup` (RLS): document, `markupNo` (M1, M2… unique per document, the next free number, retried on
  a clash), the revision and file (`attachmentId`) it was drawn on, `page`, `kind` (`PIN`, `CLOUD`, `RECT`, `ARROW`,
  `TEXT`, `PEN`), `points` (JSON `[[x, y], …]`, each 0 to 1 of the page's width and height, y down, rounded to 5 places),
  `color` (`RED`, `BLUE`, `GREEN`, `ORANGE`), `note` (needed on a pin, the words of a text mark), `status` OPEN /
  RESOLVED with who, when and a note, and `rfiId`. A client `id` makes a repeated create return the saved mark.
- **Rules** (`packages/shared/src/markup.ts`, tested in `apps/api/src/scripts/markup-test.ts`). `markupProblem` checks the
  points each kind takes (one, two, or up to 1000 for freehand) and the comment. `marksForSheet` gives a sheet its own
  marks and, when asked, the open marks of earlier revisions on the file in the same place (`fileIndex`) and page: the
  carried marks, drawn dashed until someone resolves them. Anyone who can open the document adds marks;
  `canEditMarkup` (whoever made it, and document control) changes, resolves and deletes them. Adding, resolving,
  reopening and deleting are on the document's history. `Document.openMarkups` counts open marks for the register.
- **API.** `GET /documents/:id/markups`, `POST` (create), `PATCH /:markupId` (points, colour, note), `POST /:markupId/resolve`
  and `/reopen`, `PUT /:markupId/rfi` (link the RFI raised from it), `DELETE`. Uploads take `.dxf` and `.dwg` by extension
  (`CAD_MIME_TYPES`, stored as `image/vnd.dxf` and `image/vnd.dwg`); the revision form's uploader keeps drawings at full size.
- **Web viewer** (`/documents/drawing?id&rev&file&page&mark`, `components/drawings/`). `sheet.ts` opens a file as pages
  drawn on a white canvas: PDF with pdf.js (the legacy build, for older phones and browsers), images, and DXF through
  `dxf.ts` (dxf-parser, flattened once into lines and text in model space with blocks placed and arcs cut into segments,
  layers listed to switch off, pale colours drawn dark on white). DWG is not drawn: the free readers are GPL and
  incomplete, so the revision keeps it for download beside a PDF or DXF. The sheet pans and zooms by CSS transform and is
  drawn again at the settled zoom (a canvas is capped at 16 million pixels); marks are an SVG overlay in the sheet's
  0 to 1 space, with pins and line widths a fixed size on screen. Compare draws two revisions at the same size and
  colours ink only on the older red, only on the newer blue, on both grey. Save image draws the canvas and the overlay
  into a PNG. Raise RFI opens the RFI form filled from the mark and links the new RFI back. The register's File column
  and the document drawer link to it with the open count.
- **Phone** (`app/drawing/[id].tsx`, from Drawings). The current revision, its file opened as before (saved on the phone
  or online), and the marks (own and carried) with resolve and delete in a sheet. On an image drawing the marks are
  numbered dots and Add a comment drops a pin where tapped (online). PDFs and DXF are marked up on the web; showing PDF
  pages inside the app needs a WebView, so it waits for a store build.
- **Measuring** (v6 item 118, below).

### Measuring on drawings (v6 item 118)

Lengths, areas and counts taken off a revision's sheet in the viewer, instead of a scale rule on a print, and put into
the measurement book or a BOQ item's quantity.

- **Tables** (RLS, migration `20261204090000_drawing_takeoff`). `DrawingScale`: one per file and page, two `points` in
  the markup's 0 to 1 page space, the real `lengthM` between them and the page's `aspect` (width over height) when it was
  set. `DrawingTakeoff`: T1, T2… per document (next free number, retried on a clash; a client `id` makes a repeat return
  the saved one), the revision, file and page, `kind` (`LENGTH`, `AREA`, `COUNT`), `points`, `label`, `value`
  (`Decimal(18,3)` in m, m² or nos) and `measurementId`, the measurement sheet it went into.
- **Rules** (`packages/shared/src/takeoff.ts`, tested in `apps/api/src/scripts/takeoff-test.ts`, CI runs it). A point is
  (x × aspect, y) in page heights, so the scale is metres per page height (`scaleFrom`) and lengths (`polylineLength`) and
  areas (shoelace, `polygonArea`) come out in metres and square metres whatever the page's shape. `takeoffProblem` and
  `scaleProblem` say what is missing; a length or area needs the sheet's scale, a count does not. A DXF's scale can come
  from its drawing units instead of two clicks (`dxfScalePoints`: the page is the drawing's extents wide).
  `takeoffLine` makes a measurement book line: a length is nos 1 × L, a rectangle (four right angles) L × B, any other
  area its area as L, a count nos. `takeoffBoqQty` adds measures of one kind and multiplies by a factor (a slab's
  thickness).
- **API** (`DrawingTakeoffsService`, `/documents/:id/takeoffs`): `GET` (scales and measures), `PUT scale` (works the
  page's lengths and areas out again), `POST` (a measure), `PATCH /:takeoffId` (rename), `DELETE /:takeoffId`,
  `PUT measurement` (records the sheet the measures went into, once saved) and `PUT boq` (sets a BOQ item's original or
  revised quantity through `PlanningService.updateBoq`, so its rules hold; for `PROJECT_EDITOR_ROLES`). Anyone who can
  open the document measures and sets the scale; `canEditMarkup` renames and deletes. Each step is on the document's
  history, and a BOQ quantity from a drawing on the BOQ item's too (`QTY_FROM_DRAWING`).
- **Web.** The viewer's toolbar has Set the scale, Measure a length, Measure an area and Count. Points are clicks (a
  drag still pans, two fingers zoom); a double-click, Enter or Finish ends a measure, closing on the first corner ends an
  area, Backspace or Undo point takes the last point back, Escape drops it. A bar over the drawing shows the figure so far
  with the pointer's point, and the measure is named when finished. Beside the drawing, Marks | Measures (`?panel=`):
  the sheet's scale (or how to set it, and for a DXF its drawing units), totals by kind, and the measures (this sheet or
  the whole drawing, `?take=` picks one) with ticks; Add to measurement book opens the measurement form with a line per
  measure (`MeasurementFormModal`'s `prefill`), Set BOQ quantity picks the item, original or revised, and a factor.
- **Demo.** The toilet block DXF (ARC-110) has its scale along the 12 m wall, a partition's length, two floors and the
  doors counted.
- **Not built.** Measuring on the phone, measures carried onto a later revision, a scale per viewport on a sheet with
  details at other scales, and arcs in a length.

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
- **Clients.** Web: People → Staff and leave with tabs My attendance and leave, Leave (`?leave=` opens one), Overtime,
  Staff register, Staff and Holidays. Site app: My attendance & leave (`app/staff.tsx`: check in and out, balances,
  apply, leave and overtime waiting on you) and Staff register (`app/staff-register.tsx`).

### Attendance extras (v5 item 97)

- **GPS check-in.** A project can carry its site's location (`siteLat`, `siteLng`, `siteRadiusM`, default 300 m) and
  `siteCheckInStrict`, set in the project form (both coordinates or neither; strict needs a location). `MyStaffDto.site`
  is the posting's location. The web (browser geolocation) and the phone (`expo-location`, `src/utils/location.ts`,
  while in use) send `lat`, `lng` and `accuracyM` with the check-in when the site has a location; the server works out
  the distance (`checkInPlace` in `packages/shared/src/staff.ts`, haversine, allowing the position's accuracy up to
  50 m) and stores `checkInLat/Lng/AccuracyM/DistanceM/Inside` on `StaffAttendance`. Outside is flagged (orange tag in
  the register, on My attendance and on the overtime list); a strict site refuses a check-in from outside or without a
  position, with a message saying what to do. The register is the fallback: the site manager can still mark anyone.
  `expo-location` is a native module, so the phone needs the next store build; until then a check-in sends no position.
- **On duty and tour.** `LeaveType` `ON_DUTY` and `TOUR` are requested and decided like leave but have no balance
  (`LEAVE_ENTITLEMENT` null) and count present and paid in payroll (`countsAsPresent`), each still shown in its own
  column.
- **Overtime approval.** `StaffAttendance.overtimeStatus` (`OvertimeStatus` PENDING / APPROVED / REJECTED, with who and
  when, and a note). Overtime from a check-out waits; overtime typed in the register is approved when the person
  saving it may decide it (`canDecideLeave`: a staff admin or the posting's project manager), else it waits; an
  unchanged value keeps its decision. `GET /staff/overtime` lists what waits on the caller (`leaveDeciderWhere`),
  `POST /staff/attendance/:id/overtime/approve|reject` decides it (reject needs a reason), audited as
  `STAFF_OVERTIME`. Notification `OVERTIME`: a check-out with overtime tells the leave approvers, a decision tells the
  employee. `StaffSummaryDto.overtimeToDecide` badges the Overtime tab. Payroll's `overtimeHours` is approved overtime
  only (rows from before the migration were set approved), and `overtimePendingHours` shows what still waits.

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

### Setting up a project (finding 6 of the October review)

- **Starting terms.** A new project no longer bills with every deduction at 0%. `ProjectsService.create` takes its
  terms from the project named in `copyFromProjectId` (the `COPIED_TERMS`: deductions, GST, LD, defect liability,
  payment and notice days, measurement tolerance, price variation), else from its client's usual terms
  (`Client.retentionPct`, `securityDepositPct`, `tdsPct`, `gstTdsPct`, `labourCessPct`, `gstRate`,
  `defectLiabilityMonths`, `clientPaymentDays`, nullable, on the client form), else `STANDARD_TERMS` (5% retention,
  2% TDS, 2% GST TDS, 1% cess, 18% GST), merged field by field by `termsFor` (`@erp/shared/project-setup.ts`).
  Approval rules are company-wide, so there is nothing of them to copy.
- **Team.** `POST /projects/:id/members` takes `userIds` (several at once) as well as `userId`, and
  `POST /projects/:id/members/copy { fromProjectId }` adds everyone on another project the caller sees; each person is
  told once, as before. Copying from a project at creation copies its team too.
- **Setup checklist.** `GET /projects/:id/setup` (`ProjectSetupDto`, `ProjectSetupService`) ticks `SETUP_STEPS` from the
  project's own records with the pure `setupSteps` (team, dates and value, BOQ, activities, BOQ items linked to an
  activity, activity dates, baseline, agreement, budget, chainage/floors/villages, material norms), leaving out the
  steps the role cannot do. The Overview shows it (`ProjectSetup`) to those who edit projects while `setupShown`: an open
  project of a kind that has one (not a store or plant), under 10% done, not hidden, with steps left. Each step links
  to its tab; `PUT /projects/:id/setup { hidden }` hides it for everyone (`Project.setupHiddenAt`).
- **BOQ against the contract.** `boqContractGap` flags an item-rate project whose BOQ total (at revised quantities) is
  more than `BOQ_GAP_PCT` (15%) from its contract value, since work done, earned value and the budget are all built on
  the BOQ. It holds the checklist's BOQ step open, shows on the BOQ tab, and is the watch list's `BOQ_OFF_CONTRACT`
  (managers who see cost and edit projects), so it reaches the morning brief. Lump sum and EPC are priced by stages and
  left out. Tested in `src/scripts/project-setup-test.ts`.

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

## Earned value (v6 item 115)

- **Arithmetic** (`apps/api/src/cost/earned-value-rules.ts`, pure, tested in `src/scripts/earned-value-test.ts`, CI runs it).
  Each BOQ item's value (revised, else original, qty × rate) is a slice spread evenly over the days of each activity linked
  to it, weighted by the activities' planned quantity: baseline dates once a baseline is frozen, else planned dates. An item
  with no dated activity is spread over the project's dates and reported as unscheduled. Planned share on a day = the share of
  the slices due by its end. Earned share = approved progress (or, with `basis=MEASURED`, approved measurement sheets) × BOQ
  rate ÷ BOQ value, capped at 1. Both shares are put on the budget at completion (`BudgetService.forecasts`: cost heads,
  else BOQ budget rates, else the BOQ value itself, with a note that the cost index then includes the margin), so planned
  value (PV) and earned value (EV) compare with actual cost (AC, `CostService.compute`, the Cost tab's figure).
- **Indices.** SV = EV − PV, CV = EV − AC, SPI = EV ÷ PV, CPI = EV ÷ AC, EAC = BAC ÷ CPI, EAC with the schedule = AC +
  (BAC − EV) ÷ (CPI × SPI), ETC = EAC − AC, VAC = BAC − EAC, TCPI = (BAC − EV) ÷ (BAC − AC). No index while its divisor is
  zero. Earned schedule = the first day the plan had the earned share done; SPI(t) = earned schedule ÷ days elapsed, and the
  forecast finish stretches the planned duration by it.
- **Curve.** Month ends from the start to the later of the planned finish and today (at most 48); the current month is cut
  at today; EV and AC are left out after it. Activities with value and dates are listed by schedule variance, most behind first.
- **Roles.** Cost viewers (`COST_VIEW_ROLES`) on projects they can open.
- **API.** `GET /cost/projects/:id/earned-value?basis=PROGRESS|MEASURED`.
- **Web.** Project > Money > Earned value (`components/cost/EarnedValuePanel.tsx`), the chart in `components/home/charts.tsx`.

## Comments and mentions (v6 item 116)

- **Table.** `Comment` (kind and record id, project, author, body up to 4000 characters, `mentions` as user ids, edited,
  removed, and on a thread's first comment whether and by whom it is resolved; replies point at the first comment). CHECKs
  on the length and on resolving only a first comment. Tenant table with RLS.
- **Kinds** (`COMMENT_KINDS`, `packages/shared/src/comments.ts`): every submission type, `MEETING` and `MATERIAL_APPROVAL`.
  `CommentTargetsService` loads the record through its own service with the caller, so whoever may open it reads and writes
  its comments; guests and suppliers have none. A new kind is a key there, a loader here and the section on its page.
- **Mentions.** Written as `@Full Name` in the text with the ids alongside (antd `Mentions` on the web); a mention whose
  name is no longer in the text is dropped. The @ list is staff who see the record's project; each person mentioned is
  checked on save by loading the record as them ("… cannot open this purchase order, so cannot be mentioned on it").
- **Notices** (`COMMENT`, For me). Those mentioned are told they were; on a reply, everyone already in the thread (who wrote
  in it or was mentioned in it) is told of the reply; never the writer, never twice (`whoToTell`). An edit tells only those
  newly mentioned. The notice opens the record's page at `#record-comments`.
- **Rules** (`apps/api/src/comments/comment-rules.ts`, tested in `src/scripts/comments-test.ts`, CI runs it). Only the author
  edits; the author or an admin removes (the text is cleared, a first comment stays as "Comment removed" while it has
  replies); anyone who can open the record resolves or reopens a thread, and a reply to a resolved thread opens it again.
  Edits, removals and resolving are audited as `COMMENT`.
- **API.** `GET /comments?kind&entityId`, `GET /comments/people`, `POST /comments` (`parentId` for a reply),
  `PATCH /comments/:id`, `DELETE /comments/:id`, `POST /comments/:id/resolve|reopen`; each answers with the threads.
- **Web.** `components/comments/CommentsSection.tsx`: `RecordFrame` adds it as the last section of every submission's record
  (with the open count), and `CommentsCard` on the meeting and material approval pages.

## Module switches (v6 item 117)

- **What can be off** (`SWITCHABLE_MODULES`, `packages/shared/src/module-switches.ts`): meetings, material approvals, safety
  (with PPE), site imprest, guarantees and licences, tenders (with schedules of rates), subcontract enquiries, books (with
  financial statements), payroll, biometric devices, the RMC plant and machine loans. The core (daily reports, progress,
  requests, orders, bills, stock, documents…) is never switched off. Each module lists its pages (`paths`, web and phone),
  so `moduleOfPath` says which module a page is.
- **Columns.** `Organization.modulesOff` (what the admin turned off) and `moduleTier` (`ESSENTIALS` / `BUSINESS` /
  `ENTERPRISE`, null = every module, set from the console). `modulesOffFor(org)` is both: turned off, or not in
  `MODULE_TIER_MODULES[tier]`. Nothing is deleted when a module is off; turning it on brings everything back.
- **API.** The JWT strategy puts `modulesOff` on the request user (and on the support session); `ModuleSwitchGuard` (an
  app guard) refuses a route marked `@ModuleSwitch('…')` on its controller with 403 "<Module> is turned off for your
  company…". Search leaves the kind out (`module` on its source), Ask leaves the tool or record kind out (`module` on the
  tool and kind; refused with the same words if asked), the comments of a meeting or material approval are refused, My work
  and the module homes leave the module's cards out, and the daily jobs (guarantee expiries, EMIs) skip companies without
  it (`usesModuleWhere`). The device push (`/iclock`) is public and keeps taking punches.
- **Admin.** `GET /module-switches`, `PUT /module-switches/:key { on }` (admins; a module outside the plan cannot be turned
  on; audited as `MODULES`). Staff set the plan with `POST /platform/companies/:id/plan { tier }` (audited as
  `MODULE_PLAN`). Rules in `apps/api/src/module-switches/module-switch-rules.ts`, tested in
  `src/scripts/module-switches-test.ts` (CI runs it).
- **Web.** `AuthUser.modulesOff`: `navFor` drops the pages (and a section left empty), `newEntriesFor` the New entries,
  the app layout shows `ModuleOff` on a page of a module that is off, the project's Safety tab goes, and the make check on
  orders is not asked. Admin > Modules (`/company-modules`) has a switch per module, grouped by sidebar section; the
  console's company drawer has the plan. **Phone:** the Submit tiles and the project's Safety button follow the same list.

## Material reconciliation

- **Table.** `MaterialNorm` (per project: a BOQ item, a store item, `qtyPerUnit` with six decimals, allowed `wastagePct`,
  a note, who set it); one norm per BOQ item and store item. Tenant table with RLS.
- **Arithmetic** (`apps/api/src/reconciliation/reconciliation-rules.ts`, pure, tested in `src/scripts/reconciliation-test.ts`).
  For a period (all time by default): theoretical = Σ approved progress on the BOQ item × norm; allowed = theoretical +
  Σ theoretical × wastage %; consumed = ISSUE rows − RETURN_FROM_SITE rows. Transfers, returns to vendor and adjustments
  are not consumption. Status: OVER when consumed > allowed (or anything consumed with no theoretical), UNDER when more
  than `RECONCILIATION_UNDER_PCT` (5%) below theoretical, else WITHIN; NO_WORK when both are zero. Excess = consumed −
  allowed, valued at the item rate for cost viewers only. Issued items with no norm are listed as unreconciled.
- **Roles.** Seen by `RECONCILIATION_VIEW_ROLES` (QS, approvers, stores, procurement, accounts, site engineer); norms set
  by `MATERIAL_NORM_ROLES` (QS, PM, management, admin). Every change is in the project's audit log.
- **API.** `GET /reconciliation/projects/:id?from&to`, `PUT /reconciliation/projects/:id/norms` (adds or changes by BOQ
  item + store item), `DELETE /reconciliation/projects/:id/norms/:normId`.
- **Web.** Project > Materials > Reconciliation (`components/reconciliation/`), with views under `?sub=`:
  Materials (period picker, the reconciliation with each item's BOQ lines, items without a norm, the norms with
  add/edit/remove, and an Excel export), Structure, Pipe and Kits, Exceptions (below), Subcontractors, Wastage and
  Estimate (below). Pipe and Kits show on water supply and sewerage projects only.

### Stock against the DPR (item 128)

What the store issued, set against what the approved DPR lines (item 127) say was done and used, by component.

- **Norms on activities.** `ActivityMaterialNorm` (per activity and store item: `qtyPerUnit`, `wastagePct`, note; tenant
  table with RLS). An activity's own norms come before its BOQ item's (`normSource`: `a:<activityId>`, else the
  boqItemId); an activity with sub-activities takes none (its sub-activities do). The DPR form fills a line's material
  from the same norms (`DprService` work options). Set by the norm setters, audited.
- **Issues to a place.** `StockEntry.workElementId`: an issue or a return from site names its component (or takes its
  activity's, `StockService.placeOf`). The migration backfills it from the activity.
- **Materials view.** Besides consumed against theoretical: *used per DPR* is the material the approved lines in the
  period report (`ProgressMaterial`) against what those lines needed by the norms (OVER past the wastage allowance), and
  *at the work front* is a position, not a period figure: issued less returned from `USE_ISSUE_DAYS` (7) before the first
  approved DPR that reported material (`frontFrom`), less all the DPR use since (`frontFlag`: issued and never reported,
  used beyond what was issued).
- **Structure** (`StockViewsService.structure`, `structureRows`): per component or sub-component and normed material, the
  design need (planned × norm), the period's need and use, what was issued to it net of returns, what is still there
  (the same front position) and, per activity, the use per unit achieved against the norm. Issues to no component are
  counted.
- **Pipe** (`pipe`, `pipeRow`): per size (`pipeSizeOf` reads `Item.pipeDiameterMm`/`pipeMaterial`, else the item's
  name; fittings are not pipe) with network scope: scope, ordered, received, in store, issued, laid and tested (from the
  pipe network, item 126), cut wastage (DPR use on the lines that laid it, against `PIPE_CUT_WASTAGE_PCT` by
  material), at site not laid, to lay and to buy; the same per zone. Pipe bought by weight becomes metres through
  `Item.kgPerMetre` (`pipeMetres`); one without it is listed as unconverted. Flags: LAID_ABOVE_ISSUED, WASTAGE_ABOVE.
- **Kits** (`kits`, `kitRows`): the activities of house connection components with norms; per component of the kit,
  needed for the connections done, issued, used and the kits it is short.
- **Exceptions** (`exceptions`, `exceptionEvents`, default the last 30 days): a DPR use of a material at a component
  with nothing of it issued there in the 7 days before (only once issues name components); an issue to a component
  with no approved work there in the `ISSUE_WORK_DAYS` (3) after (judged once those days pass); a zone with more pipe
  laid than issued. Each opens its DPR or its issue.
- **API.** `PUT/DELETE /reconciliation/projects/:id/activity-norms[/:normId]`, `GET .../structure`, `.../pipe`,
  `.../kits`, `.../exceptions`. The arithmetic is pure in `reconciliation-rules.ts` and the DTOs and pipe helpers in
  `@erp/shared/stock-against-dpr.ts`; tested in `src/scripts/reconciliation-test.ts`.
- **Demo.** The town scheme (`prisma/seed-stock.ts`) has the norms on the tanks' concrete and steel, the coupler on the
  zone 2 laying and the service kit, and plants one of each case: cement over the mix on the 400 KL tank, HDPE 110 cut
  above 1.5%, DI laid above issued, four connections without a saddle issued, cement issued to a tank with no work,
  and bitumen used on road restoration with none issued.
- **Waits.** A norm library and kit tables of their own, PO quantities by pipe size, the watch list and Ask, and the
  phone's view.

### Stage billing (item 129)

A lump-sum contract is paid by stages of its components' shares, not by measured items. Turned on per project: it is
`LUMP_SUM` or `EPC` (`billsByStages`) and has a billing break-up (`BillingBreakupDto.stageBilling`); every other project
bills as before.

- **Break-up.** `BillingComponent` (code, name, parent for a part, `sharePct` of the lump sum or of its parent, `basis`
  STAGES or UNIT_RATE, the `WorkElement` it reads) and `BillingStage` (name, `pct` of its component, `trigger`, the
  activities, items and scope it reads, the event's date and evidence). Tenant tables with RLS, as are `MilestoneTarget`
  and `SlippageTier`. `Project` gains `lumpSumValue` (else the contract value), `tenderFactor`, and
  `advanceRecoveryFromPct`/`ToPct`. Components and stages are set by `canPrepareBill`; terms, grid and tiers by
  `canEditContract`. Nothing on a bill can be removed; `breakupProblems` names what does not add up to 100%.
- **Standard break-up** (`createStandardBreakup` in `stage-plan.ts`): a component per component of the work breakdown,
  shares from its weights (`sharesFromWeights`), parts for its sub-components; house connections, road restoration and
  the HT feeder (`UNIT_RATE_ELEMENT_TYPES`) are unit-rate; each leaf takes `STAGE_TEMPLATES` for its kind, the
  activities matched by name (`matchStageActivities`) and, for pipe, the pipe items of its sizes with the network's
  length (else the specs) as its scope.
- **Evidence** (`loadStageEvidence`, at a day): EVENT is 100 once its date has come; PROGRESS the approved physical % of
  its activities (`progressRollup`, of the component when it names none); SUPPLY what was received at the project
  against its scope, pipe by weight in metres (`pipeMetres`) and an item named by several stages shared by their scope
  (`shareSupply`); TEST the network's pipe tested (approved TEST metres, or all of a segment once a passed test covers
  it) against its length, else the progress of its activities.
- **On a bill** (`stagePlan`, run by `RaBillsService.recompute` and the certificate): each stage's % is its evidence at
  the measurements date less what earlier bills took (certified, else claimed); the amount is value × up to date less
  value × previous, so the bills add up to the stage to the paisa (`stageLine`). The preparer may claim less by hand, or
  more with a note (`PUT /ra-bills/:id/stages/:stageId`, empty goes back to the evidence). `RaBillStageLine` keeps the
  previous, suggested, this and certified %, the amount and the evidence's words. BOQ items under a stages component
  are in the lump sum and their measurements are not billed; those under a unit-rate component are measured and paid at
  rate × tender factor (`boqBasis`; the bill checks expect that rate). The client can pass less of a stage than claimed.
- **Slippage** (`slippage`): each top-level component's billed % against the grid's cumulative target for the last month
  ended by the bill (`targetAt`); behind by a tier's range of the target withholds its % (default 2.5/5/7.5/10) of the
  value not done. A bill deducts the total less what earlier bills withheld, so catching up releases it
  (`RaBill.slippageWithheld`, `slippageLines`). The grid can be proposed from the schedule (`proposedGrid`).
- **Advance window**: with both ends set, the mobilisation advance is recovered in proportion to the contract executed
  between them, less what was recovered (`windowRecovery`), instead of a % of each bill.
- **Pricing in one place.** `ra-bill-pricing.ts` (`measuredLines`, `billTotals`, `writeBill`) and `stage-plan.ts` take a
  database client and no user, so the bills screen and the demo seed price a bill the same way.
- **Web.** The Contract tab's Billing break-up (components and stages with what each has earned today and billed, the
  standard break-up, terms), Milestone grid (target / billed by month, behind in the error colour) and tiers; the bill's
  Payment stages (claim by hand) and Milestone slippage parts, stage %s in the certificate, and a stage table in the print.
- **Tests.** The rules in `src/scripts/stage-billing-test.ts` (CI); `e2e/tests/stage-billing.spec.ts`.
- **Demo** (`prisma/seed-billing.ts`): the town scheme's terms (80.7% lump sum, tender factor 1.0425, 5% advance
  recovered from 10% to 80%), its road restoration, house connections and HT feeder as measured unit-rate items, pipe
  received over the months, the standard break-up with its design approvals, a grid the treatment plant has fallen
  behind, and RA bills 1 to 4 priced from the evidence at their dates (bill 3 with the 400 KL tank's staging cut by the
  client, 1 to 3 paid). Bill 5 is the QS's to prepare.
- **Waits.** Interest on advances, stage certification in the client portal, and the unit-rate items' total moving the
  contract value.

### EPC (item 130)

An EPC contract's design, its equipment and what the client owes run the job as much as the site does. A project with
`contractModel` EPC gets Plan › Engineering and packages (`canViewEpc`: everyone but guests), and any project can be in
another currency.

- **Deliverables.** `EngineeringDeliverable` (discipline of `ENGINEERING_DISCIPLINES`, code unique per project, title,
  the component it designs, the register document its revisions are filed under, planned submission and approval, the
  latest submission, revision, the client's code A/B/C/D and the approval day). A and B approve (`approvalCodeApproves`),
  C and D send it back (`deliverableStatus`: not submitted, with the client, comments to answer, approved). Late is past
  the planned submission while not submitted, else past the planned approval while not approved (`deliverableLate`).
  Changed by `canManageDeliverables` (document control). One a payment stage reads cannot be removed.
- **Equipment packages.** `ProcurementPackage` (code, name, discipline, component, vendor and its purchase order on the
  project, scope, value in rupees, the day site needs it, vessel, bill of lading, ETA, days from the port to site) and
  `PackageStageDate` (planned and actual per `PACKAGE_STAGES`, enquiry to commissioning; shipped and customs only by
  sea or air). `packageStatus`: the stages with a date, in order; the current stage is the last done, the next the first
  after it not done (overdue once its plan has passed); on site on its delivery day, else the ETA plus the days to site
  (10 when empty), else the planned delivery moved by the slip so far, never before today; late by the days after the
  day needed; actual dates out of order or in the future are problems. Changed by `canManagePackages` (purchase);
  values only for `canViewPurchaseOrders`.
- **Client inputs.** A `Milestone` with `byClient` (land, consents, power for testing). Overdue from the day after it
  was due (`clientInputOverdue`). Record delay makes a DELAY risk through `RisksService.create` (category and party
  CLIENT, from the day after it was due) kept in `Milestone.delayId`; giving the input later ends the delay.
- **Payments.** A stage of the billing break-up (item 129) can read them: EVENT with `deliverableIds` is done on the day
  the last of them was approved, once all are (`deliverablesEvidence`); SUPPLY with `packageIds` takes the share of
  their value (a count when one has none) that reached `packageStage` (default delivered, `reachedOn` counts a later
  stage done) by the day (`packagesEvidence`). `loadStageEvidence` loads both.
- **Currency.** `Project.currency` (ISO, INR by default, `CURRENCIES`) and `exchangeRate` (rupees to one unit, the
  contract rate). Every amount stays in rupees at that rate, so totals across projects, the cost reports and the books
  are right; forms and records show and take the contract currency (`formatMoney`, `inContract`/`outOfContract`,
  `fromRupees`/`toRupees`), and the bill's print says the amount in words in it. The currency and rate cannot change once
  a bill or receipt exists. `Receipt.exchangeRate` is the day's rate: the bank credited `bankCredit` (amount ÷ contract
  rate × day's rate), and posting books the difference to `EXCHANGE_DIFFERENCE` (Indirect Incomes), a gain to the credit
  and a loss to the debit. Purchase orders stay in rupees: a foreign order needs landed costing first.
- **Watch list.** PACKAGE_LATE for `canManagePackages`: a package not yet on site whose forecast falls more than
  `PACKAGE_GRACE_DAYS` (3) after the day needed; the key carries the forecast, so a new ETA warns again.
- **API.** `GET /projects/:id/epc` (summary by discipline, deliverables with the stages they release, packages with
  their status, client inputs), `PUT`/`DELETE .../epc/deliverables`, `.../epc/packages`, `.../epc/client-inputs`, and
  `POST .../epc/client-inputs/:inputId/delay`. Each answers with the whole tab.
- **Web.** The tab (`components/epc/EpcPanel.tsx`): figures, then Engineering (by discipline, the deliverables with
  filters), Equipment packages (stage, needed, on site and how late, each package's stage dates when opened) and
  Client inputs (Record delay); the stage form's deliverable and package pickers; currency on the contract form and
  panel, the bill, its print and the receipt form (with the day's rate).
- **Tests.** The rules in `src/scripts/epc-test.ts` (CI); `e2e/tests/epc.spec.ts`.
- **Demo** (`prisma/seed-epc.ts`): WW-2026-07, an island sewerage scheme let for US$ 6.2 million at ₹ 83.25: a 6 MLD
  SBR plant, its equipment, four phases of sewers, three pumping stations and the outfall; 24 deliverables (two sent
  back, one late), ten packages (the air blowers at sea and late for erection, the centrifuge's inspection overdue),
  five client inputs (the pumping station land a month late and recorded as a delay, the 11 kV supply overdue), the
  break-up with design stages on deliverables and equipment on delivery and erection of its packages, and three
  milestone bills, two paid at the day's rate.
- **Waits.** A phone view of packages, purchase orders in another currency with landed cost, deliverable revisions
  read from the document register, and the client approving deliverables in the portal.

### Operation and maintenance (item 131)

A water scheme is often let with years of running after it is built: the contractor operates the plant and network,
is paid each O&M year a % of the contract value in instalments, and loses money for staff short of the minimum and
for service levels missed. A project with a handover (`ProjectHandover.completedOn`, shown as `ProjectDetail.handedOverOn`)
gets Handover › O&M (`canViewOm`: everyone but guests).

- **Contract.** `OmContract` (one per project): `startOn` (a first of the month after completion), `years`, `yearPcts`
  (one % per year), `instalmentsPerYear` (1, 2, 3, 4, 6 or 12, so each covers whole months), `extensionYears`,
  `population`, `benchmarks` (JSON of `OmBenchmarkSetting`: limit, failures a month allows, penalty each beyond) with
  `OmStaffNorm` (role, minimum, monthly pay) and `OmChemicalNorm` (item, quantity per ML treated). Set by `canManageOm`
  (the approvers); `termsProblem` checks it. Once a period is billed, the start, instalments, years and the billed
  years' % are fixed.
- **Periods.** `omPeriods` splits each year into its instalments ("Year 2, quarter 3"), each worth contract value ×
  the year's % ÷ instalments. A period is FUTURE, RUNNING, DUE (over, not billed) or BILLED.
- **Service levels.** `ServiceLevelDay`, one per day (`canLogServiceLevels`: DPR submitters, QA/QC, approvers): water
  produced and supplied (kl), residual chlorine and pressure at the tail end, complaints received and closed within
  48 hours, pump efficiency, a note. `OM_BENCHMARKS`: supply per person (lpcd = supplied × 1000 ÷ population), chlorine
  and pressure are judged each day (`dayFailures`; a reading not taken misses nothing); water not accounted for,
  complaints closed and pump efficiency once a month on the month's own figure (`monthValue`), only once the month is
  over. A day's reading is due from the day after (today is not over); days with none are listed, never penalised.
- **Months.** `monthFigures` gives each benchmark's failures, those beyond the allowance and their penalty, and the
  staff short (`OmStaffMonth`, recorded by `canRecordOmStaff`: HR or the approvers) at the role's monthly pay; a month
  not recorded deducts nothing and says so.
- **The O&M bill.** An `RaBill` with `omYear` and `omInstalment` (unique per project), so receipts, receivables,
  posting, Tally, GST, the portal and the cash forecast take it unchanged. It shares the bill numbers ("O&M bill 6"),
  is never final and needs no works' final bill; `billProblem` bills a period once, after it ends, in order. Priced
  only in `om-bill.ts` (`omPricing`, as of the day after the period): gross = instalment − staff short; the penalties
  are a deduction (`omPenalty`, "Service level penalties"); no retention, security deposit, labour cess or advance
  recovery (`omPercentages`). `omDetail` keeps the figures behind it (staff lines, penalties, days missing, months with
  no staff). A day or staff month in a billed period is locked. The receipt form fills the penalty as an other deduction.
- **Chemicals.** Each norm × the ML produced in the month against what was issued less returned
  (`ReconciliationService.forPeriod`), over or under beyond `OM_CHEMICAL_TOLERANCE_PCT` (10) (`chemicalRow`).
- **Watch list.** OM_SERVICE for `canManageOm`: the running period losing money to penalties or staff short, three
  days or more with no reading, or a day benchmark at this month's allowance (`omSlip` in `warning-rules.ts`); the key
  carries the figures.
- **API.** `GET /projects/:id/om?month=YYYY-MM` (the terms, every period with its bill or what it deducts so far, the
  month's days with their failures and lock, the months of its period, the chemicals, the can flags), `PUT .../om/contract`,
  `PUT .../om/days`, `DELETE .../om/days/:dayId`, `PUT .../om/staff`; each answers with the tab. An O&M bill is
  `POST /ra-bills` with `omYear` and `omInstalment`.
- **Web.** The tab (`components/om/OmPanel.tsx`): figures, then Service levels (month by month: benchmarks with
  failures and penalty, the daily log, Record a day), Periods and bills (Prepare bill on the first period due), Staff,
  Chemicals and Terms (the drawer with years, benchmarks, staff and chemicals). The bill's record and print show the
  O&M section (`OmBillSection`) instead of the abstract.
- **Tests.** The rules in `src/scripts/om-test.ts` (CI), OM_SERVICE in `warnings-test.ts`; `e2e/tests/om.spec.ts`.
- **Demo** (`prisma/seed-om.ts`): WS-2025-05, a completed town water scheme of ₹21.6 crore in year 2 of five O&M
  years (3% to 4% a year, quarterly, 38,500 people): a reading every day since O&M began but two, pressure short twice
  in September and twice this month and chlorine once last December, staff recorded monthly (a pump operator short in
  August), alum, lime and bleaching powder issued weekly (bleaching powder over the norm this month), and six O&M bills
  priced by the same functions: five paid, the last quarter a draft. Its dates count back from this month.
- **Waits.** Entering the day's readings on the phone, complaints as their own register with closing times, SCADA or
  meter feeds, energy and power factor, the escalation of the O&M rate, and the client certifying O&M bills in the portal.

### Rate analysis and the estimate (v5 item 92)

- **Tables.** `BoqResource` (per BOQ item: `kind` LABOUR with a trade and man-days per unit, or EQUIPMENT with an
  equipment category and machine hours per unit; one per BOQ item, kind and name). Materials stay in `MaterialNorm`, so
  a BOQ item's rate analysis is its norms plus its resources. `Project.estimateOverheadPct` (default 5) and
  `estimateProfitPct` (default 10). Tenant table with RLS.
- **Filling it** (`RateAnalysisService`). By hand in the BOQ item's drawer (BOQ tab, calculator button, or an item in
  the Estimate view); from `RATE_LIBRARY` (`packages/shared/src/reconciliation.ts`: PCC, RCC M20 to M30, steel,
  brickwork, plaster, WBM, GSB, DBM, pipes), whose materials are matched to store items by words in the name and the
  unit (`pickLibraryItem`; a line with no match is reported and left out); from another BOQ item in any project the
  user sees; or from Excel (`POST .../rate-analysis/import`, all or nothing: one bad row and nothing is saved). Set by
  `canSetRateAnalysis` (the norm setters); every change is in the project's audit log.
- **Estimate** (`builtUpRate` in `reconciliation-rules.ts`). Per BOQ unit: materials = quantity × (1 + wastage %) ×
  item rate; labour = man-days × `LabourRate.dailyRate` of the trade (case-insensitive); machines = hours × the average
  hourly rate of the company's active machines of the category (`equipmentHourlyRate`: a day is 8 hours, a month 30
  days). Overheads and profit are % of that cost; built-up rate = cost + both; margin = BOQ rate − built-up rate. A line
  with no rate counts as nothing and is flagged. Values only for `canViewEstimate`; the QS sees the quantities.
- **API.** `GET /reconciliation/projects/:id/estimate`, `PUT .../estimate-terms`, `PUT .../resources`,
  `DELETE .../resources/:resourceId`, `POST .../rate-analysis/copy` (`fromBoqItemId` or `libraryKey`),
  `POST .../rate-analysis/import`.

### A subcontractor's material

- **Arithmetic.** Per approved work order, since the start: allowed = Σ approved measurements on the order × the
  norms with wastage; issued = ISSUE rows to the order − RETURN_FROM_SITE rows from it. Over the allowance by any amount
  is OVER; the excess not yet raised is what can be recovered.
- **Recovery.** `ExcessMaterialRecovery` (work order, item, quantity, rate, amount, the bill it went on). The rate
  starts at the item rate: the issue rate is already recovered on their bills, so this is the penalty on top, as in
  CPWD clause 42. Raised by `canRecoverExcessMaterial` (prepares subcontract bills and sees cost). It goes on the
  order's bill being prepared (DRAFT, CHANGES_REQUESTED or REJECTED, recomputed by `retakeOpenBill`) or on the next
  one: `SubcontractBillsService.recompute` attaches recoveries with no bill and adds their total as `excessRecovery`
  ("Material used over the norm" among the deductions; Tally posts it with the material recovery). It can be removed
  until its bill is submitted.
- **API.** `GET /reconciliation/projects/:id/subcontractors`, `POST .../work-orders/:workOrderId/recoveries`,
  `DELETE .../recoveries/:recoveryId`.

### Wastage and the overuse warning

- **Reasons.** A stock adjustment takes `reason` (`StockAdjustmentReason`: OPENING, WASTAGE, DAMAGE, THEFT,
  COUNT_DIFFERENCE, OTHER) into `StockEntry.adjustmentReason`; a stock count posts COUNT_DIFFERENCE. Older adjustments
  have none ("Not given").
- **Report.** `GET /reconciliation/projects/:id/wastage?from&to`: adjustments by reason and item (`wastageGroups`),
  quantity off and on, valued at item rates for cost viewers; OPENING is left out.
- **Watch list.** `MATERIAL_OVERUSE` (`materialOveruse` in `warning-rules.ts`) when a project's consumed passes its
  allowed by `MATERIAL_OVERUSE_MIN_PCT` (3%) or more, all time; its key moves on in steps of 5%. Shown to the norm
  setters. Ask has a `material_reconciliation` tool (views MATERIALS, SUBCONTRACTORS, WASTAGE) for
  `canViewReconciliation`.

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
- **To the supplier.** Approving a PO emails it to the vendor's email in the master (`PurchaseOrdersService.mailOrder`,
  the body from `poEmail` in `po-supplier-rules.ts`: items, totals, delivery, payment and terms, and the portal's orders
  page when the vendor has a login), after the item rates; a failure never undoes the approval. The order keeps
  `supplierEmailedAt` / `supplierEmailTo` / `supplierEmailError`, and a buyer sends it again with
  `POST /purchase-orders/:id/email`. No PDF is attached: the mail service takes a subject and an HTML body only.
- **Choosing a dearer quote.** When the request has a quotation pricing every line, an order not from the lowest of
  them (`QuotationsService.lowestFor`, as the comparative marks it) carries `selectionReason`, asked by the form and
  checked on every submit (`selectionProblem`). The approver reads it on the order. Both rules are tested in
  `src/scripts/po-supplier-test.ts` (CI runs it).
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

## Payment requests and advances

Releasing money is approved before accounts pays it (v5 item 90).

- **Table.** `PaymentRequest` (tenant table, RLS policy): `requestNo` PR-<year>-0001, project, vendor, `kind`
  (`BILL`, `PO_ADVANCE`, `WO_ADVANCE`) and exactly one target by kind (a CHECK constraint): `vendorBillId` or
  `subcontractBillId`, `purchaseOrderId`, `workOrderId`. Then `amount`, `mode`, `neededBy`, `reason`, attachments
  (proforma, letter), `paidAmount` and `paidDate` kept by its payments, and the six status columns. It is the submission
  type `PAYMENT_REQUEST` in `SubmissionLifecycleService`, with rupee limits on `amount` in the approval matrix (demo:
  project managers up to ₹5 lakh, management any).
- **How much** (`PaymentRequestsService.target`, checked on create, edit, submit and again before approval). A bill must
  be approved: at most its payable less paid, less what its other open requests ask (submitted, or approved and not yet
  paid). An order must be approved and not closed: at most its value (PO total, WO value before GST) less advances asked
  for on its other submitted or approved requests.
- **Paying.** `VendorPayment` gains `paymentRequestId`, `purchaseOrderId` and `workOrderId`; its CHECK now allows one
  bill, or no bill and one order (an advance). `POST /vendor-payments` with `paymentRequestId` draws on an approved request
  and may not settle more than it has left (advisory lock `PAYREQ:<id>`); the bill or order comes from the request. An
  advance is paid only that way. `Organization.paymentsNeedRequest` (off for existing companies, on for new sign-ups,
  switched on Approval rules) refuses a payment on a bill without one. Approving a request tells the project's payers
  (`BILLS_DUE`), except whoever approved or asked for it.
- **Advances on bills.** `VendorBill.advanceAdjusted` takes advance off the invoice total: payable = total less it, and it
  may not exceed what was paid in advance on the PO less what its other bills adjusted. A subcontractor bill's advance
  recovery caps at the advance actually paid on the work order once any advance payment exists, else at the order's
  `advanceAmount` (paid before Nirmaan). Editing or deleting an advance payment may not leave less paid than bills have
  already taken off. Payables totals add `advanceOutstanding` (paid, not yet adjusted or recovered) per vendor and
  project, and every payment of an advance is left out of the bills' paid and deducted.
- **Roles.** Asked for, edited and seen by admin, management, project managers, accounts, procurement and QS in their
  projects (`canRequestPayment`, `canViewPaymentRequests`); approved by the matrix; paid by `canRecordPayment`.
- **API.** `GET|POST /payment-requests` (paged; `projectId`, `vendorId`, `kind`, `status`, `toPay`, `mine`, the four
  target ids, `q`), `GET|PATCH|DELETE /payment-requests/:id`, `POST /payment-requests/:id/submit`; the open bills in
  `GET /payables` carry their latest open `request`. Web: the Payment requests tab in Payables, `/payment-requests/[id]`,
  "Request payment" on approved bills (and in the due list) and "Request advance" on approved orders, Pay against an
  approved request, the approvals pane, Search and Ask. Phone: approve in the Approvals tab (`/payment-request/[id]`).
- **Site fund requests (v6 item 107).** A site asks head office for money as a request of kind `FUND_REQUEST`: no bill or
  order, a `purpose` (`FundPurpose`: wages, local purchase, petty contractor, running costs, other), the site it is for
  (`projectId`, whose approvers decide) and exactly one of `imprestId` (an active imprest at that site) or `vendorId` (a
  party paid on account); `raisedAtProjectId` names the asking site when it asks on behalf of another (the asker must
  work at both). `vendorId` is nullable for this; the CHECK `PaymentRequest_one_target` keeps the other kinds on a vendor
  and a target. Nothing caps the amount; the matrix decides. Anyone who pays site expenses asks (`canRequestFunds`);
  those outside the payment request roles see only fund requests. Into an imprest, accounts release it
  (`POST /payment-requests/:id/release`, `canReleaseFunds`): a paid `ImprestEntry` advance with `paymentRequestId`, up to
  what is left, which raises the holder's cash in hand and notifies them. To a party, `POST /vendor-payments` with the
  request pays on account (the `VendorPayment` CHECK allows a payment with no bill or order when it draws on a request):
  payables count it as paid, the books post it as a payment to the party with an On Account reference, and the supplier
  sees "On account" on their statement. `syncRequestPaid` adds releases to payments. Web: Site imprest → Fund requests
  (`PaymentRequestList fund`, "Request funds", `FundRequestFormModal`, Release on approved ones); the request's page and
  the approvals pane are the payment request's. Phone: approve, and see where the money goes.

## Bills without a PO and debit notes

Hire, workshop and other service bills, and what a vendor owes back (v5 item 91).

- **Kinds.** `VendorBill.kind` (`PO` default, `HIRE`, `SERVICE`, `OTHER`); `purchaseOrderId` and
  `VendorBillLine.purchaseOrderLineId` are nullable (a CHECK keeps a `PO` bill on an order), and a line without a PO line
  has its own `description` and `unit`. `POST /vendor-bills` with a kind other than `PO` takes `projectId` and:
  - `HIRE`: `equipmentId` (a hired machine linked to its hire agency, which is the vendor) and `hireMonth` (YYYY-MM). The
    approved logs of that machine, project and month not on another bill (not rejected) give line 0: hours, days or 1
    month by the machine's `rateUnit`, at its rate, unless `hireQuantity`, `hireRate` or `hireGstRate` say otherwise. With
    `Equipment.hireMinHours` and an hourly rate, line 1 tops the hours up to the minimum. Typed lines (mobilisation,
    transport) start at sort order 10. Diesel in the logs of an owner-fuelled machine is recovered at `fuelRate`
    (`fuelLitres`, `fuelRecovery`). One bill per machine, project and month (advisory lock `HIRE:<machine>:<project>:<month>`,
    409 on a second); the logs point at the bill (`MachineryLog.vendorBillId`).
  - `SERVICE`: `vendorId` and `jobIds`, closed job cards of the project (or the yard) not on another bill
    (`MaintenanceJob.vendorBillId`; a billed job card cannot be deleted).
  - `OTHER`: `vendorId` and `expenseCategory`, the cost head.
  What does not match is an exception for the approver, as on a PO bill: more hours or days than the logs, a rate above
  the machine's, logs of the month not yet approved, diesel not recovered, more than the job cards' labour and parts.
  `GET /vendor-bills/hire-preview` and `/billable-jobs` feed the form; `GET /vendor-bills/:id` adds `sources` (the logs or
  job cards). Bill checks (`otherVendorBillChecks` in `bill-rules.ts`) add a second bill for the machine and month, hours
  against the logs, the rate, diesel and job-card totals. A bill without a PO is due 30 days from the invoice and takes no
  PO advance. Equipment gains the hire terms `hireMinHours`, `hireFuelBy` (`OWNER`, `COMPANY`) and `hireOperator`.
- **Payable** (`src/payables/payable.ts`, used by payments, requests and Payables): a vendor bill's total less advance
  adjusted, diesel recovered and debit notes; a subcontract bill's net payable less debit notes.
- **Debit notes.** `DebitNote` (tenant table, RLS policy): `noteNo` DN-<year>-0001, `reason` (`SHORTAGE`, `EXCESS`,
  `REJECTED`, `RETURNED`, `RATE_DIFFERENCE`, `OTHER`), exactly one approved vendor or subcontract bill (a CHECK), an
  optional GRN or return to the supplier (`stockEntryId`), lines with quantity and rate or a lump sum and GST, totals,
  and `cancelledAt` / `cancelNote`. Not approved separately: raised by `canRaiseDebitNote` (those who record vendor bills)
  under the bill's `PAY:<billId>` lock, at most what is still unpaid (+₹1), and kept on the bill as `debitNoteAmount`. A
  cancelled note stops counting; one in a Tally export cannot be cancelled. `GET|POST /debit-notes`, `GET /debit-notes/:id`,
  `POST /debit-notes/:id/cancel`. Web: Debit notes on approved bill records, "Raise debit note" on a GRN with QA/QC
  rejections or a return to the supplier, the Debit notes tab in Payables and `/debit-notes/[id]`.
- **Elsewhere.** Project cost: an approved hire bill replaces rate × hours for its machine and month (its logs cost
  nothing), a workshop bill goes to a Workshop row, an other bill to expenses under its head, each net of diesel
  recovered, and debit notes come off the matching head. GST: debit notes are negative inward rows (source `DEBIT_NOTE`).
  Tally: hire bills post to Machinery Hire Charges, workshop bills to Repairs to Machinery, other bills to their expense
  ledger, diesel recovered to Diesel Recovered from Hire Agencies, and a debit note is a Debit Note voucher (Dr party
  against the bill, Cr the head and input GST). Phone: the vendor bill screen shows the kind, machine, diesel recovered
  and debit notes.

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
  - Vendor payment: **Payment**. Dr the vendor (paid + deducted), Cr bank or cash, TDS payable, other deductions. An
    advance (no bill) is the same voucher against `Advance <PO or WO number>` (bill type `Advance`), so the bill that
    later adjusts it can be set off in Tally.
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

### Price variation

A contract with `priceVariation` has a formula: `Project.pvBaseDate` and `PriceVariationComponent` rows (name, `sharePct` of
the work value, `baseIndex` on the base date; shares up to 100%, the rest is fixed), replaced as a whole by
`PUT /projects/:id/contract/price-variation` (contract editors). While an RA bill is not approved, the preparer puts in that
month's index per component (`PUT /ra-bills/:id/price-variation`, `indexMonth`, `note`); the components are copied into
`RaBillPvLine` so later formula changes leave the bill alone, and an empty list clears it. Each line is work value × share ×
(current − base) / base, negative when the index fell; the total is `RaBill.pvAmount`. `RaBillsService.totals` recomputes
the lines whenever the work value changes (re-taking measurements, the client's certificate), and GST and every deduction
are on work value + price variation: `netPayable = gross + pv + GST − deductions`. What counts as billed revenue takes it in
(`invoiceOf` for receivables, GSTR-1 taxable value, the Tally sales voucher, unsent bills in the cash-flow forecast, billed
value in cost reports); work-value measures (financial progress, billed against the contract value, approval limits) stay
on the work value alone. Web: a Price variation card on the Contract tab, a section in the bill drawer, the print and the
export; the client portal and the phone app show the amount.

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

### PPE register

- **Tables.** `PpeIssue` (project, named `Worker`, `PpeKind`, size, issued on, replace-by, `PpeIssueStatus` ISSUED /
  RETURNED / REPLACED / LOST, closed on and note, `recoverable` from the contractor, `batchId`) with RLS, and
  `Project.ppeRequired` (the kit every worker must have; helmet, safety shoes and reflective jacket to start with).
- **Rules** (`packages/shared/src/ppe.ts`, tested in `apps/api/src/scripts/ppe-test.ts`). Replace-by = issued on +
  `PPE_LIFE_DAYS[kind]`; due once past it. A worker's holding is their newest open issue of each kind; missing = the
  required kinds they hold none of. Issuing a kind a worker still holds (at any project) marks the old one REPLACED.
  A batch carries the phone's id as `batchId` (unique with worker and kind), so a retried send issues nothing twice.
- **Register** (`PpeService.register`). The project's active workers with holdings and gaps, today's roll call
  (`WorkerAttendance`), totals (fully kitted, on site today without kit, due, lost this financial year), by
  contractor (missing, items to recover) and kit still open with workers who left or moved.
- **Roles.** Read by anyone with project access; issue, return and mark lost by `PPE_ISSUER_ROLES` (safety officer,
  stores, site engineer, team leader, approvers); delete by whoever issued it or a safety manager; the required kit
  by `SAFETY_MANAGER_ROLES`. Every change is in the audit log.
- **API.** `GET /ppe/projects/:id/register`, `PUT /ppe/projects/:id/required`, `GET /ppe/issues` (project, worker,
  status, kind, `due`, `recoverable`), `POST /ppe/issues` (workers × kinds), `POST /ppe/issues/:id/close`,
  `DELETE /ppe/issues/:id`.
- **Clients.** Web: a PPE tab in Safety (`components/safety/PpePanel.tsx`, `PpeForms.tsx`) with the register, issue
  drawer, return or lost, required kit, contractor totals, issue history and Excel export. Site app: Issue PPE from the
  Safety screen (`app/ppe/new.tsx`), offline through the outbox (`PPE_ISSUE`), in Hindi too.

### RFI register

- **Table.** `Rfi` (RFI-<year>-0001 per organisation; project, subject, question, our proposal, location, priority
  NORMAL / URGENT, status OPEN / ANSWERED / CLOSED / WITHDRAWN, addressed to, raised on, answer-by, optional drawing
  and BOQ item, cost and time impact flags, the answer with its date, who answered (a guest user, or a name and
  reference recorded by staff), closing note, and links to a `Variation` and a `Risk`), with RLS; `Attachment.rfiId`
  for photos and marked-up drawings.
- **Rules** (`packages/shared/src/rfi.ts`, tested in `apps/api/src/scripts/rfi-test.ts`). Answer-by defaults to 7 days
  after raising (2 when urgent). Days open run to the answer (or today while open); overdue = open and past the
  answer-by date; ageing buckets by days late. Raising takes the phone's id, so a retried outbox send makes no second RFI.
- **Flow** (`RfisService`). Raised by `RFI_RAISER_ROLES` (site engineer, team leader, QS, QA/QC, approvers); the
  project's guests are told (`PORTAL`, entity `RFI`). The client's engineer or consultant answers in the portal
  (`POST /portal/rfis/:id/answer`; the raiser and PM are told as `DOCUMENT_ISSUED`), or staff record an answer from a
  letter. Whoever raised it or an approver changes, closes (once answered), withdraws or deletes (only while open,
  never once answered). A variation or delay raised from the answer is linked with `PUT /rfis/:id/links`. Every
  change is in the audit log.
- **API.** `GET /rfis` (project, status, priority, drawing, `overdue`), `GET /rfis/summary`, `GET /rfis/:id`,
  `POST /rfis`, `PATCH /rfis/:id`, `POST /rfis/:id/answer`, `/close`, `/withdraw`, `PUT /rfis/:id/links`,
  `DELETE /rfis/:id`; portal `GET /portal/projects/:id/rfis` (no cost, delay or variation fields). Searchable in Ctrl K.
- **Clients.** Web: an RFIs tab in Documents (page and project tab, `components/documents/Rfi*.tsx`) with counts,
  filters, Excel export, the record drawer (record answer, close, withdraw, raise a variation or record a delay from
  the answer) and the form; an RFIs tab in the client portal (`components/portal/PortalRfis.tsx`). Site app: RFIs
  list, detail and Raise RFI with photos (`app/rfis.tsx`, `app/rfi/`), offline through the outbox (`RFI`), in Hindi.

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

## Supplier portal (v6 item 105)

- **Who.** A `SUPPLIER` login is a `User` with `vendorId` (relation `VendorPortalLogins`). It belongs to one vendor in one
  company, holds no project, and sees only that vendor's records. Logins are given from Vendors (the portal action,
  `canManageSupplierLogins`) with an invite link; Users never creates or turns a login into one, and the JWT strategy
  refuses a `SUPPLIER` without a `vendorId`. `GUEST_ROLES` now holds the client guests (`CLIENT_GUEST_ROLES`) and the
  supplier, so the shell's guest rules (no project switcher, no Search, no Ask) apply to both.
- **Deny by default.** `GuestGuard` refuses a supplier everywhere but routes marked `@SupplierAllowed()` and
  `@GuestAllowed()` ones not `@GuestOnly()` (their account, notifications, uploads). `SupplierController`
  (`/api/supplier/*`) is `@SupplierOnly()`, so staff and client guests get 403 there, and a supplier gets 403 on `/portal`.
  Every query in `SupplierService` filters by `organizationId` and the caller's `vendorId` (`ProjectAccessService.supplierVendor`).
- **What they do.** Quote on enquiries sent to their vendor (`EnquiriesService.respondForVendor`, the same answer as the
  public quote link); accept a PO or WO (`supplierAcceptedAt/By`, `supplierNote`; the raiser is told); send a dispatch note
  (`SupplierDispatch` with lines, never more than ordered less received and on the way, `toSend`); send an invoice with its
  file (`SupplierInvoice`, one number per vendor; a returned or withdrawn one is resent in place); read their statement
  (`statement()` in `supplier-rules.ts`: bills as credits after recoveries, payments, TDS and debit notes as debits, from a
  date); and ask for a change to their details (`SupplierChangeRequest`, one waiting at a time).
- **The company's side.** The store picks the dispatch note on a GRN against the PO (`supplierDispatchId`, unique, so a note
  is received once; it must be the PO's and not cancelled). The note's quantities, challan and vehicle fill the GRN, and
  the store corrects them to what arrived. Invoices land in the Supplier inbox (`/supplier-inbox`, `canCheckSupplierInvoices`).
  Accounts record the vendor bill from one, its number and date filled in. A bill with the same vendor and invoice
  number moves the invoice to Billed, then Paid (`invoiceStage`), or they return it with a note. Changes to details are
  approved there or in the vendor's portal drawer (`canApproveSupplierChange`). A bank change needs `PAYMENT_ROLES`;
  the requester cannot approve their own; the approved values are written to the vendor (state code from the GSTIN).
- **Notifications.** Type `SUPPLIER`. To the supplier (`notifyVendor`): an order approved (`PORTAL_PO`/`PORTAL_WO`), an
  enquiry sent, an invoice returned, a change decided, a payment made. To the company: a dispatch note (store, engineers,
  PO raiser), an invoice (`VENDOR_BILL_ROLES`), a change (`PAYMENT_ROLES` or `VENDOR_BANK_ROLES`).
- **Rules.** Pure functions in `apps/api/src/supplier/supplier-rules.ts`, tested in `src/scripts/supplier-test.ts` (CI runs it).
- **Clients.** Web pages under `/supplier` (home, enquiries, orders with dispatch notes, invoices, payments, your
  details). Any other page redirects there. The phone app refuses supplier sign-in.

## Tender bidding (v6 item 110)

- **Tables.** `SorBook` (a schedule of rates: state SOR, CPWD DSR, own rates; name unique per company) with `SorItem` (code
  unique per book, chapter, description, unit, rate). `Tender` (number from `nextDocNo('TND')`, NIT, client from the master
  or typed, dates, `bidType` PERCENTAGE or ITEM_RATE, the SOR book, estimate, `quotedPct`, overheads and profit on cost,
  tender fee, status, result, `projectId` once made a project) with `TenderItem` (the bid BOQ: quantity, SOR item and rate,
  `quotedRate` for an item-rate quote typed by hand), `TenderItemLine` (the rate analysis per unit: material with wastage,
  labour, machinery) and `TenderBid` (others' prices at opening). All six have `tenant_isolation` policies.
- **Pricing.** Pure functions in `apps/api/src/tenders/tender-rules.ts`, tested in `src/scripts/tenders-test.ts` (CI runs
  it). An item's cost is `builtUpRate` from the reconciliation rules over its lines; overheads and profit are percentages of
  cost. A percentage tender quotes every SOR rate with the one percentage; an item-rate tender quotes the typed rate, else
  the built-up one. Totals give the BOQ at SOR rates (or the estimate), the cost, the built-up and quoted values each as a
  percentage on the SOR, and the margin (quote less cost and overheads). `rankBids` puts our quote among the others, lowest
  first, ties sharing a rank. A line without a rate takes the store item's rate, the trade's labour rate or the machines'
  category rate when saved; the starter library (the BOQ analysis library) fills common items.
- **Life.** PREPARING → SUBMITTED (the quote is checked by `submitProblem` and fixed) → WON / LOST, or DROPPED / CANCELLED;
  `moveProblem` allows one step back to correct a mistake, never once a project is made. The EMD is a `ComplianceDoc` of
  kind EMD (`emdDocId`), so it shows and is reminded in Guarantees and licences, and is released from the tender page.
- **Project.** `makeProject` (admin and management) calls `ProjectsService.create`, then in one transaction writes the BOQ
  at the quoted rates, the lines as material norms and resources, the cost budget from the analysis, moves the EMD to the
  project, adds the performance guarantee and links the tender; the project is deleted again if that fails.
- **Who.** `canManageTenders` (admin, management, QS) price and record; project and accounts managers read
  (`canViewTenders`). Search kind `tender`.
- **Clients.** Web: Billing → Tenders (`/tenders`, the register with the year's figures; `/tenders/[id]` with the bid BOQ,
  pricing, bids and details) and Billing → Schedule of rates (`/schedule-of-rates`, books and items, Excel import).

## Subcontract enquiries (v6 item 111)

- **Tables.** `SubcontractEnquiry` (number from `nextDocNo('SCE')`, project, title, scope, last day to quote, status OPEN /
  AWARDED / CANCELLED, the awarded quote, the work order it became, the decision note) with `SubcontractEnquiryItem` (a BOQ
  item of the project at the quantity given out, once per enquiry, or the enquiry's own item with its description and
  unit), `SubcontractQuote` (one per subcontractor asked; `receivedOn` null until their rates are in, GST rate, validity,
  note) and `SubcontractQuoteLine` (their rate per item; an item they did not quote has no line). All four have
  `tenant_isolation` policies.
- **Comparison.** Pure functions in `apps/api/src/subcontracts/comparison-rules.ts`, tested in
  `src/scripts/comparison-test.ts` (CI runs it). A quote's total is its lines rounded to the paisa, GST on the total.
  `compare` gives each item's lowest rate among the quotes received (and whose, several when tied) and the spread from
  lowest to highest; only a received quote pricing every item is ranked, on the total before GST (the company takes the
  credit on a registered subcontractor's bills), ties sharing a rank; and each quote's margin against the client's rates
  of the BOQ items it priced. The client's and budget rates come from the BOQ item.
- **Life.** Items change only while open and before any rates are in (`itemsProblem`). `awardProblem` lets a complete
  received quote be awarded, and one that is not L1 only with a reason. `award` calls `WorkOrdersService.create` for a
  DRAFT work order at the quote's rates and GST, with the BOQ items as BOQ lines (so the measurement book bills them), the
  own items as its own lines and the scope as its terms; if marking the enquiry fails the work order is deleted again. A
  deleted work order leaves the enquiry awarded with no order, to be awarded again or reopened. Cancelling needs a reason.
  Audited as `SC_ENQUIRY`.
- **Who.** `canRunSubcontractEnquiries` (the roles that issue work orders), on the projects they can see. Search kind
  `subcontract_enquiry`.
- **Clients.** Web: Purchases → Subcontract enquiries (`/subcontract-enquiries`, open ones soonest closing with the year's
  figures; `/subcontract-enquiries/[id]` with the comparative statement, the subcontractors asked and their quotes, and
  the award).

## Meetings and action items (v6 item 112)

- **Tables.** `Meeting` (number from `nextDocNo('MOM')`, project, title, kind, day and time held, venue, chair, agenda, next
  meeting, status DRAFT / ISSUED, who issued it and when), `MeetingAttendee` (one of our users, whose name, email and phone
  come from the user master, or an outsider by name with their side, email and phone; present or absent), `MeetingPoint`
  (NOTE or DECISION, in order) and `MeetingAction` (text, owner as a user or a name, due date, status OPEN / DONE / DROPPED
  with the day closed, how or why, and who closed it, and at most one of an RFI, NCR or variation of the same project).
  A CHECK keeps `doneOn` set exactly when the action is not open. All four have `tenant_isolation` policies.
- **Rules.** Pure functions in `apps/api/src/meetings/meeting-rules.ts`, tested in `src/scripts/meetings-test.ts` (CI runs
  it): where an action stands against its date (`actionTiming`: late from the day after it is due), what issuing needs
  (`issueProblem`: someone present, something written, an owner and a date on every action), what closing needs
  (`actionMoveProblem`: done on a day not ahead of today, dropped with a reason), the register's figures and the order to
  take actions up (earliest due first, undated last).
- **Life.** A meeting is recorded as a draft and changes only as a draft, by whoever recorded it or a manager; attendees
  and points are replaced as wholes and actions keep their id. Issuing fixes the minutes, emails them (HTML in the body,
  through `EmailService`) to every attendee with an address, and tells each of our owners once of their open actions
  (`DOCUMENT_ISSUED` with entity `MEETING`, deduped per meeting). A manager can take issued minutes back to draft to
  correct them. Actions live on after the meeting: their owner, whoever recorded the meeting and managers close, drop,
  reopen or move them. A meeting's page shows the actions earlier meetings of the project left open. Audited as `MEETING`.
- **Who.** `canViewMeetings` (everyone but guests) reads the meetings of the projects they can see; `canRecordMeetings`
  records them; `canManageMeetings` (admin, management, project managers) edits anyone's drafts and revises issued minutes;
  `canUpdateMeetingAction` for actions. Search kind `meeting`. My work's `meetingActions` card is the caller's open actions
  (for the roles that record meetings always, for anyone else once they own one).
- **Clients.** Web: Site → Meetings (`/meetings`, a Meetings tab and an Actions tab with Mine; `/meetings/[id]` with the
  minutes, actions, who came, issue, print and WhatsApp). The phone shows the My work card and opens the notice; it has no
  meetings screen yet.

## Material approvals (v6 item 113)

- **Tables.** `MaterialApproval` (number from `nextDocNo('MAR')`, project, kind MATERIAL / SAMPLE, material, optional item
  of the item master, BOQ item and supplier, make, model, where it is used, why this make, to whom, reply-by date, status
  DRAFT / UNDER_REVIEW / APPROVED / APPROVED_AS_NOTED / REVISE_RESUBMIT / REJECTED / WITHDRAWN and the current revision),
  `MaterialApprovalRevision` (R0, R1…: submitted on and by, covering note, then the outcome, day reviewed, reviewer, comments
  and reference; a CHECK keeps the outcome and its day set together) and `ApprovedMake` (project, material, optional item,
  make, model, source CONTRACT or APPROVAL; an APPROVAL row belongs to its request, which a CHECK enforces). Files hang on
  `Attachment.materialApprovalId`. `PurchaseOrderLine.make` is the make ordered. All three tables have `tenant_isolation`.
- **Rules.** Pure functions in `apps/api/src/material-approvals/material-approval-rules.ts`, tested in
  `src/scripts/material-approvals-test.ts` (CI runs it): matching a line's item to a listed material (`sameMaterial`: the
  shorter name's words all in the longer, one-word names only exactly) and its make (`sameMake`: whole words, "Tata" is
  "Tata Tiscon"), the order line check (`makeWarnings`: only materials with listed makes are checked; NO_MAKE or
  NOT_APPROVED, naming a request for that make still under review), what an outcome and a (re)submission need, and the
  days a request waits.
- **Life.** A request is a draft until submitted (R0); while under review only its reply-by date changes. An outcome from
  the reviewer's letter or mail is recorded against the current revision; approved or approved as noted lists the make on
  the project as source APPROVAL (with the note). Revise-and-resubmit and rejected requests are back with us: resubmitting
  opens the next revision and may change the make. Requests in play can be withdrawn (with why, kept in the audit trail);
  only drafts are deleted. A make from the contract is added and removed by hand; one approved on request stays with it.
  `POST /material-approvals/make-check` checks order lines; the PO form (as you type) and the PO record show its warnings,
  and the PO print shows each line's make. Audited as `MATERIAL_APPROVAL` and `APPROVED_MAKE`.
- **Who.** `canViewMaterialApprovals` (everyone but guests) reads them on their projects; `canRaiseMaterialApprovals`
  (managers, engineers, team leaders, QA/QC, QS, procurement) raises, submits and records outcomes;
  `canManageApprovedMakes` (admin, management, project managers, QA/QC) keeps the contract's list. Search kind
  `material_approval`.
- **Clients.** Web: Materials and plant → Material approvals (`/material-approvals`, a Requests tab and an Approved makes
  tab; `/material-approvals/[id]` with the submissions, files and actions). No phone screen yet.

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

## Ask Nirmaan (AI assistant)

- **What it is.** A chat panel on every web page (header button, Alt J or ⌘J on a Mac, or a question typed in Ctrl K) that answers
  questions about the company's own records. `POST /api/ai/ask` streams server-sent events (`thread`, `status`, `text`,
  `done`, `error`; `AiStreamEvent` in `packages/shared/src/ai.ts`); the web reads them with `fetch` in `lib/ai.ts`.
  The panel is `components/ai/AskPanel.tsx` (Ant Design X `Bubble`, `Sender`, `Welcome`, `Prompts`; answers rendered
  with `@ant-design/x-markdown`), loaded with `dynamic()` the first time it opens. On a wide screen it is a 440 px
  column beside the page in `AppShell` (the page narrows; it stays mounted while closed so the conversation survives); on
  a phone it is a full-screen `Drawer`.
- **Tools, not data dumps.** The model only sees what its read-only tools return (`ai/ai-tools.service.ts`). Each tool
  calls the same service as the matching list or page with the asking user (the `SearchService` pattern), so project
  access, role checks and row-level security apply unchanged; tools a role may not use are left out of its definitions
  and refuse if called anyway. `list_records` and `get_record` cover 20 record kinds, each with its page link. A new kind
  is one entry in `kinds`; a new summary is one entry in `tools`. Results are compacted (files, empty values and long
  text dropped, lists cut at 40) and capped at 24,000 characters.
- **Summaries and explanations.** `ai/ai-digest.service.ts` gathers what a question about one project needs in one
  call, from the same list services: `project_week` (work done, against plan, DPRs, labour, machines, materials, bills,
  new risks, what needs a decision; a section the role may not see says so), `explain_activities` (behind or late
  activities with their progress, delay entries and breakdowns) and `ra_bill_changes` (an RA bill against the one
  before it, item by item). The web asks them from the page through `useAsk()` (`lib/ask.tsx`) and `AskButton`:
  Summarise this week on a project, Explain beside a delayed activity, the Gantt's behind count and an over-budget cost
  head, What changed on an RA bill after the first. The buttons show only when Ask Nirmaan is on for the company.
- **Access check.** `src/scripts/ai-access-check.ts` runs every tool as every demo user and fails if a result names a
  project that user cannot open or a refused tool answers. CI runs it after the seed.
- **Grounding.** After the answer, `ai/grounding.ts` keeps Markdown links only to hrefs the tools returned (others become
  plain words; they are the answer's citations) and lists figures that match no number in the tool results or the
  question (₹, lakh, crore and per cent scales; row counts count) as `unverified`, which the panel flags.
- **Model.** `ai/model.ts`: `@anthropic-ai/sdk` (beta Messages, streaming, `effort`; for Claude models also adaptive
  thinking and prompt caching on the fixed instructions and tools). Production runs DeepSeek V4.1 Flash (the OpenRouter default; `AI_MODEL` overrides it),
  picked from the 17 Oct comparison of seven models with `scripts/ai-eval.ts`; OpenRouter translates the
  Messages API for non-Claude models. The same client goes to OpenRouter's Anthropic-compatible
  Messages API when `OPENROUTER_API_KEY` is set (bearer key, `provider.data_collection: deny`, the thread id as
  `session_id` so one conversation stays on one provider and its cache), or to Anthropic direct with server-side
  fallback. `AI_PROVIDER=fake` swaps in a scripted
  stand-in (one tool picked from the question's words, results listed as links) for CI and local work. The instructions
  are `ai/prompt.ts`; who is asking, today and the page (`/projects/<id>` or a record page, plus the header's project)
  go with each question.
- **Storage and limits.** `AiThread` and `AiMessage` (tenant tables with RLS). Each answer stores tokens, model, time and
  its cost in paise: what OpenRouter billed (`usage.cost`), or an estimate at list prices on Anthropic direct (`ai.config.ts`). `Organization.aiEnabled` (off by default, on for DEMO) and
  `aiMonthlyCapInr` (null = `AI_DEFAULT_MONTHLY_CAP_INR`) are set by admins at `/ai-settings` (audited `AI_SETTINGS`);
  each user may ask `AI_DAILY_QUESTIONS` a day. Refusals (off, cap, limit, guests, support sessions) come back as plain
  HTTP errors before the stream starts. History sent to the model is the last 12 questions and answers as text.
- **Usage, roles and pricing (item 77).** Every AI gate goes through `AiService.status(user)`, which answers, in order:
  NOT_CONFIGURED, COMPANY_OFF, ROLE_OFF (`Organization.aiRoles`, empty = all staff; admins always pass, `aiRoleAllowed`
  in shared), READ_ONLY (the company's billing state computed from the organisation row, so the overnight briefs and GET
  routes such as the bill-check summary stop too, not only writes) and CAP_REACHED. `/auth/me`'s `ai` flag also applies
  the roles, which hides the phone's Ask tab. With billing on, AI is included in the price: `aiPlanAllowanceInr`
  (`common/billing.ts`) gives `BILLING_AI_TRIAL_INR` in the trial, `BILLING_AI_INR_PER_UNIT` × the billed units once paid,
  0 when read-only and null for exempt companies; the cap in force is the company's own cap held at or under that
  allowance (exempt companies and servers without billing keep their own cap or the default). `GET /ai/settings?month=`
  gives a month's use by feature and by person (questions, documents read, briefs, answers rated not helpful) and the
  plan. The conversation log (`GET /ai/conversations`, `/:id`, `/export`) is for admins outside support sessions; opening a
  conversation (`AI_CONVERSATION_READ`) and exporting (`AI_CONVERSATIONS_EXPORTED`) are audited, and the panel tells people
  admins can read conversations. Tests: `src/scripts/ai-billing-test.ts` (CI), and the item 77 tests in
  `e2e/tests/ask-nirmaan.spec.ts` and `billing.spec.ts`.
- **Never acts.** No tool writes. The instructions treat record text as data, not instructions.
- **Evaluation.** `apps/api/scripts/ai-eval.ts` asks a deployed API a golden set (expected facts read live from the API)
  and a red-team set as the demo accounts, and prints the share of checks passed, cost per answer and latency. It
  calls the real model, so it is run by hand.

## Bill checks before approval

- **What it is.** AI item 69: a Checks section first on vendor bill, subcontract bill, RA bill and expense records
  (`components/checks/ChecksSection.tsx`, so the Approvals inbox pane shows it too). `GET /checks/:kind/:id`
  (`apps/api/src/checks`) loads the bill through its own service (its access rules apply), gathers what it must agree
  with (PO lines and GRNs, the work order, the BOQ, the measurement book, earlier bills, other bills and expenses of the
  same supplier entered before it) and runs the rules in `checks/bill-rules.ts`: plain functions of numbers, a tick when
  a rule passes, a flag per finding. Flag keys carry their figures, so a changed bill is checked afresh.
- **Accepting.** Someone who may approve the bill (`assertCanApproveSubmission`) accepts a flag with a note while it is
  SUBMITTED (`BillCheckAcceptance`, audited `CHECK_ACCEPTED` / `CHECK_REOPENED`). Nothing blocks approval.
- **Summary line.** With open flags and Ask Nirmaan on, `GET /checks/:kind/:id/summary` asks the model for one sentence
  from the flags alone (no tools, `CHECK_SUMMARY_PROMPT`), kept in `BillCheckSummary` per set of open flags and counted
  in the monthly allowance. A line with a figure not in the flags is replaced by the rules' own line, as is any failure.
- **Tests.** `src/scripts/bill-checks-test.ts` tests each rule passing and failing, then (with a database) checks that
  every seeded anomaly (`seedCheckAnomalies`) is flagged and every other demo bill and expense shows no flag. CI runs it
  after the seed. A new rule is a function in `bill-rules.ts` plus its tests there.

## Reading invoices, challans and drawings

- **What it is.** AI item 70: Fill from invoice on a new vendor bill, Fill from challan on a GRN and Fill from title
  block on a new register entry (`components/ai/ReadDocument.tsx`). The browser turns a photo or the first three pages
  of a PDF into JPEGs (`lib/doc-pages.ts`) and posts them to `POST /ai/read` (`AiReadService`), which needs the same
  right as the form it fills and Ask Nirmaan on for the company. The model returns each value with a confidence, a page
  and a box (thousandths of the page); the form shows where each value came from and marks the unsure ones.
- **Checks in code, not the model.** `normalise` turns figures and dates into numbers and `YYYY-MM-DD`, and marks a value
  low when a GSTIN fails its check character, a line's quantity × rate is not its amount, or the lines, taxes and total
  do not add up. Matching is plain code: the vendor by GSTIN (then by a name with one hit), the order by printed PO
  number or best line match among the vendor's approved orders, and lines with `matchLines` (`@erp/shared` doc-read).
  The vendor bill form runs the bill checks on the draft (`POST /checks/vendor-bill/preview`) before it is saved.
- **Nothing is saved by reading.** The read fills the form and attaches the scan as an upload; the user saves. Each read
  is an `AiDocumentRead` row (cost, time, success) counted in the monthly allowance; the page images are not kept there.
- **Tests.** `src/scripts/doc-read-test.ts` (CI) covers parsing, the checks and matching; `e2e/tests/doc-read.spec.ts`
  runs the three forms with the stand-in model. `scripts/doc-read-pack.ts` renders 31 synthetic invoices, challans and
  drawings (printed, photographed, handwritten, Hindi) and `scripts/doc-read-eval.ts` grades a deployed API on them; it
  calls the real model, so it is run by hand.

## Drafts from a sentence

- **What it is.** AI item 71: in Ask Nirmaan, "Raise an MR for 200 bags of OPC 53 for the highway by Friday", rough
  notes for a DPR, an expense, a progress entry or a letter (an RA bill's covering letter from the bill's figures)
  come back as a draft under the answer. Open form opens the list's own form filled in (`requestNew(kind, navigate,
  draft)` from `lib/new-intent.ts`, so the list on screen or the one navigated to opens it); the user checks it and
  submits it. Nothing is saved by asking.
- **Tools.** `draft_material_request`, `draft_expense`, `draft_progress`, `draft_dpr` and `draft_letter` in
  `AiToolsService` call `AiDraftsService`, which resolves the project (id, code or name, through `ProjectsService`),
  matches items to the item master (`StockService.listItems`, `itemSimilarity`) and units to the unit master, activities
  to the project's schedule, manpower to the DPR's categories, and reads an RA bill through `RaBillsService.get`. Each
  returns the form's values and `flags`, the fields to check and why (an item not in the master, a unit unlike the
  item's, a date passed, a DPR that already exists for the day). They write nothing; the tools' roles are the forms'.
- **Grounding.** A figure in the text the model wrote into a draft (a letter, a DPR's sections) that is neither in the
  question nor in a record a tool read becomes a flag (`groundDrafts`). Drafts are kept on the answer
  (`AiMessage.drafts`) so a conversation from history can still open them.
- **Forms.** A form takes `prefill` from its list and passes it to `FormShell` as `aiDraft`: the shell says the form was
  filled in, lists what to check, counts it as changes (closing asks; the draft is kept on the device) and does not
  bring back an older kept draft over it. Fields to check are amber (`aiFlagItem`, `aiFlagInput` in
  `components/ai/drafts.tsx`) until changed. A new draft kind is a tool, a `NewKind`, its list's `useNewIntent` passing
  the draft on, and the form's `prefill`.
- **Tests.** `src/scripts/ai-drafts-test.ts` (CI) checks that nothing in `src/ai` calls a create, submit, approve or
  delete outside the assistant's own tables, the grounding, and against the demo data the matching, the project
  boundary, and that every draft tool run as every user saves nothing. `e2e/tests/ai-drafts.spec.ts` opens drafted
  forms with the stand-in model. `scripts/draft-eval.ts` asks a deployed API 40 sentences in English, Hindi and
  Hinglish and grades each draft's fields; it calls the real model, so it is run by hand.

## Ask on the phone

- **What it is.** AI item 72: the site app's Ask tab (`apps/mobile/app/(tabs)/ask.tsx`, shown when Ask Nirmaan is on
  for the company). People type or speak through the keyboard's own microphone (no speech module), in Hindi, English or
  Hinglish. The tab sends `language` (the app's language) and `client: 'phone'` with each question; the prompt then
  answers in Hindi with 0-9 figures when the app is in Hindi (a question typed in Hinglish gets Hinglish back), and keeps a
  phone answer to five short lines at most, a long list given as its count, the first three and a link.
- **Answers.** `src/ai/ask.ts` reads the same server-sent events as the web panel through Expo's streaming fetch, with a
  45 s idle timeout. `AnswerText` renders the answer's Markdown; `phoneRoute` (`src/ai/links.ts`) maps a web link to
  the phone's own screen, and a link with no screen stays plain text. Status lines go through `t()`, so their Hindi is
  in `src/i18n/hi/ai.ts`; a draft's flag notes are still English.
- **Dictate today's DPR.** The tile asks for notes and sends them as a request to draft today's DPR for the chosen
  project. A DPR draft opens `/dpr/new?fromAsk=<key>` (the draft is kept in memory, too big for a route) filled in, with
  `AskDraftNotice` listing what to check; the form sends it as any DPR, through the outbox when the signal drops. Other
  draft kinds say to finish them in Ask on the web.
- **Offline.** The tab says it needs a connection and that entries still save on the phone; it does not queue
  questions.
- **Tests.** `scripts/ai-eval.ts` with `AI_EVAL_ONLY=phone` asks a deployed API in Hindi, Hinglish and English as the
  phone does and checks Hindi answers, 0-9 figures, length, the access boundary and a dictated DPR.

## Early warnings (watch list)

- **What it is.** AI item 73, though no model is involved: plain forecasts over the records, shown on `/watch-list`, as
  the Watch list card in My work, and in a weekly notification (`WATCH_LIST`, Reminders tab). Each warning carries its
  figures (`facts`) and links to the records behind it.
- **Rules.** `apps/api/src/warnings/warning-rules.ts` holds pure functions with unit tests:
  - Schedule: the last 28 days' rate puts the finish more than 7 days past the baseline (or planned) end, or the
    activity was due to start 14 days or more ago and has no progress recorded in the last 28 days. A project whose
    activities' latest planned finish is after its completion date with the extensions granted (`planFinishLate`) is a
    SCHEDULE warning of its own, above any one activity's. The project header, Overview and Schedule tab read the same
    rule, `projectScheduleStatus` in `@erp/shared/schedule.ts` (no dated plan, behind, plan ends late, overrun); the
    client portal shows only the frozen baseline's dates.
  - Cash: bills due against expected receipts over the next 8 weeks, cumulative, where each client's receipts are
    expected after its median actual days to pay (at least two paid bills). Overdue amounts fall in week 1.
  - Vendors: over the last 60 days against the 60 before, a rising share of late deliveries (against the PO's
    delivery date) or of GRN rejections. NCRs have no vendor link, so they are not counted.
  - Stock: days of stock left at the last 30 days' issue rate is below the item's lead time (median PO to receipt,
    7 days by default) and nothing is on order.
  - Machines: breakdown hours or idle share up on the month before.
  - DPRs: no DPR on a site for three or more days running, counting back from yesterday.
- **Who sees what.** `watchListKinds(role)` in `packages/shared/src/warnings.ts`: schedule and DPRs for approvers, cash
  for those who see cost, vendors for purchase, stock for stores, machines for maintenance. Projects come from
  `ProjectAccessService.projectWhere`, so a PM sees only their own.
- **The card (item 119).** Each warning leads with `action` (what to do, a few words) and `impact` (what it costs:
  `text`, plus `inr` or `days` to sort by), says how sure it is (`confidence`: CHECKED, a rule over records; LIKELY, a
  forecast; CHECK_THIS, read by the model from a photo, voice note or message; `WARNING_CONFIDENCE_OF` per kind), and
  carries `working`, the rule and its numbers a line each ("58 m³ done × 7.1 bags = 412 bags"), shown under Why with the
  facts. A new kind fills all four; `warnings-test.ts` fails a demo warning without them. My work's card shows the action.
- **Dismissing.** `POST /warnings/dismiss {key, outcome, reason?}` says what became of it: FIXED (acted on), KNOWN (true,
  left for a reason; the note is required) or WRONG. It holds for the whole company (`WarningDismissal`, audited). The key
  carries the warning's figures in coarse form (the slip in 14-day steps, the month, the week), so a dismissed warning
  comes back when things get worse. `POST /warnings/restore` undoes it.
- **Track record and pauses (item 119).** Every outcome is also written to `WarningOutcomeLog`, which a restore leaves
  alone. `WatchListDto.records` gives each kind "right N of the last 10" (FIXED and KNOWN are right) and whether it is
  paused: more than half of at least four outcomes in the last 30 days were WRONG (`pauseState`). A paused kind's warnings
  leave the list, My work, the alerts and the brief until an admin or management resumes it (`POST /warnings/resume
  {kind}`, `WarningKindResume`, audited); outcomes from before the resume stop counting. The page's Track record tab shows it.
- **Notifications.** New warnings go out each day with the digest (`NotificationJobsService.warningAlerts`, also in the
  in-process scheduler): each person is told about open warnings they have not been told about, most rupees first, then
  days, at most `DAILY_WARNING_ALERTS` (5), so WhatsApp alerts are capped too; the rest wait on the list and in the morning
  brief. `WarningAlert` keeps what each person was told; their first run records what is already open and sends nothing.
  `NotificationJobsService.watchList` still sends the Monday round-up, once per week per user.
- **Tests.** `src/scripts/warnings-test.ts` (CI runs it): the forecast unit tests, the track record, pause and alert
  rules, each role's kinds and projects on the demo data, every warning's action and working, dismissals with outcomes,
  a pause and its resume, the alerts' first run and a new warning sent once, and a 60-day backtest over the demo history
  printing the day each warning would first have fired.

## Morning brief and weekly narrative

- **What it is.** AI item 74. Each morning a person who asked for it gets three lines on what needs them today, and each
  project's weekly progress report opens with a paragraph on last week. Both are written once, overnight, and stored in
  `AiBrief` (`kind` MORNING or WEEK, unique `key` per company: `MORNING:<userId>:<date>`, `WEEK:<projectId>:<monday>`).
- **Facts first.** `apps/api/src/briefs/brief-rules.ts` (pure functions) builds the facts and the rules' own draft:
  the brief from the person's My work (`HomeService.myWork`) and approvals queue, so a role sees only what its My work
  shows; the narrative from the progress report's figures, without money. The model gets the facts and the draft through
  `AiService.writeFromFacts` (no tools) and returns picks from the rules' numbered lines (each line keeps its candidate's
  link) or a paragraph. Anything that fails `parsePicks` / `narrativeFits`, or holds a figure the facts do not
  (`unverifiedFigures`), is dropped and the rules' draft is stored instead (`byAssistant` false).
- **Who gets it.** The brief is opt-in per person (`User.morningBrief`, `PUT /briefs/me`; the home card offers it and the
  first brief is written at once). Only in a company with Ask Nirmaan on, for roles that may use it, never for support
  sessions. Narratives are written as the company's first admin for active projects with approved DPRs or progress that week.
- **When.** `NotificationJobsService.writeBriefs` (mornings daily, narratives on Mondays) runs first in the daily digest
  cron, then `approvalDigest` (which carries today's brief in its email) and `morningBrief` (bell, push, WhatsApp
  `MORNING_BRIEF` template, and email only when the digest email did not go). `GET /notifications/jobs/briefs` writes
  them alone. In-process, `MORNING_BRIEF_TIME` (default 06:00) writes them.
- **Shown.** Home `MorningBriefCard`, the `MORNING_BRIEF` notification (For me tab), and the progress report's Summary
  (`ProgressReportDto.narrative`, only on a Monday-to-Sunday report). The cost counts in the company's allowance and
  shows as Briefs in Admin > Ask Nirmaan's "Used for" table.
- **Tests.** `src/scripts/briefs-test.ts` (CI runs it, fake model): the rules, grounding, opt-in, AI off, re-runs and
  sending once, and narratives on the demo projects.

## Ask the contract (filed documents)

- **What it is.** AI item 75. Ask Nirmaan answers from the text of PDFs filed with a document revision (contracts,
  specifications, method statements, reports, drawings) and with letters, quoting the words with the page, and links to
  `/documents/view?file=<attachment>&page=<n>` (web: the browser's PDF viewer at that page plus the page's text; phone:
  `document-page`, with the file opened in the browser).
- **Pages.** `DocumentTextService.readPending` reads a PDF with pdf.js (`document-text.ts`, legacy build, required as an ES
  module on Node 22+) into `DocumentPage`, a row per page with a generated `tsvector` (english) and a GIN index. No vector
  database. `Attachment.textIndexedAt`/`textPages` mark a file read (0 pages for a scan or a file that could not be
  read). Files are read when filed (`DocumentsService` after linking attachments), by the documents search route, and by
  the daily cron (`readAllPending`, a minute, after the digest) or `GET /notifications/jobs/read-documents`.
- **Search.** `GET /documents/search?q=&projectId=`: the question's words plus construction synonyms (`SEARCH_SYNONYMS`:
  LD, PV, DLP, EOT, ROW, land…) OR'd into `to_tsquery`, ranked by `ts_rank_cd`; letters also match on their own subject,
  summary and party. Only pages of a document's current revision, in projects the user can open (`projectWhere`), and
  letters only for `canViewLetters`. Each hit carries an excerpt of the page (`excerpt`, about 2,400 characters).
- **Ask.** The `search_documents` tool calls the same search with `read: false` (tools never write) and says how many files
  are not searchable yet. The prompt asks for exact quotes in double quotes and a page link, and to say when the documents
  do not cover a question. `unverifiedQuotes` flags a quoted passage that is not in the text the tools returned, next to
  unverified figures.
- **Samples and tests.** `src/documents/demo-contracts.ts` holds three sample contracts (one per demo project, filed by the
  seed as CONTRACT documents with a generated text PDF) and 30 questions with the page and words of each answer.
  `src/scripts/contract-search-test.ts` (CI) checks every question finds its page in the first three results (29 first),
  the letters, who sees what and that a superseded revision is not searched. `scripts/ai-eval.ts` has a `contract` set for
  the real model.

## Site photo checks

- **What it is.** AI item 76. Each photo on a DPR, a progress entry, a safety incident or a snag gets a caption and, when
  the model is sure enough, flags: `NO_HELMET`, `NO_HARNESS`, `NO_BARRICADE`, `UNSAFE_SCAFFOLD`, `OTHER_WORK` (the photo
  shows other work than the entry says; DPR and progress only), `UNCLEAR`, `NOT_SITE` (`packages/shared/src/photo-checks.ts`).
  Advisory only: nothing reads a flag to block or change a record.
- **When.** Not on upload: the first time someone who can use Ask Nirmaan opens the record, its page calls
  `POST /photo-checks/:kind/:id/run`, which checks up to four unchecked photos (45 s at most) and returns
  `GET /photo-checks/:kind/:id`; the page asks again while `pending` drops. The record is loaded through its own
  service (`DprService.get`, `ProgressService.get`, `SafetyService.getIncident`, `HandoverService.getDefect`), so who
  sees the checks is who sees the record. One `PhotoCheck` row per attachment (status DONE, SKIPPED for HEIC or files
  over 3.7 MB, FAILED tried again after a day), with every flag and its confidence; the page shows those at or above
  0.75 (`shownFlags`). Counted in the month's AI spend as `PHOTO_CHECKS`.
- **Rules.** `photo-rules.ts` (pure): the prompt, the record's words sent with the photo, `normalisePhotoReply` (known
  flags only, one per key, confidence clamped) and `shownFlags`. The test model reads a photo from words in its file name
  (`fake-photos.ts`, with 50 labelled cases).
- **Switch.** `Project.photoFlagsOff`: the safety officer or an approver (`canManageSafety`) switches flags off for a
  project from any record's photos (`PUT /photo-checks/projects/:id`, audited); captions still show.
- **Snag from a photo.** `POST /photo-checks/snag-draft` drafts a snag's title, details, place and trade from a photo
  the user uploaded (or one already on a snag of the project) for the form (web `DescribeFromPhoto`, phone
  `app/snag/new.tsx`), filling only empty fields. Nothing is saved until the user reports the snag.
- **Tests.** `src/scripts/photo-checks-test.ts` (CI): the reply checks, the 50 labelled cases, and on the demo data the
  run, the bar, skipped files, retries, the switch, the snag draft and who sees what. `scripts/photo-eval.ts` scores the
  real model on a folder of labelled real photos through a deployed API. Web uploads shrink photos over 1.5 MB to
  1600 px JPEG (`src/lib/shrink-photo.ts`), as the phone app does.

## WhatsApp entries

- **What it is.** AI item 120: a site person sends a text, a photo with a caption or a voice note to the company's
  WhatsApp number; Ask Nirmaan drafts the DPR, material request, expense or progress entry it describes and replies with
  the draft and Save / Discard. Nothing is saved until the sender says so, and then it is saved in their name and
  submitted for approval exactly as the form would (the kind's own `create`, its validation and its audit).
- **Who a message is.** `User.captureFrom` holds the normalised number (from the profile's mobile) while the person has
  entries switched on, unique across all companies; a new number on the profile switches them off. The webhook finds
  the user with `withoutTenant`, then sets the tenant and builds the same `RequestUser` the JWT strategy would (billing
  read-only, modules off). A number nobody switched on gets one line back and is not kept.
- **Webhooks** (`apps/api/src/whatsapp`, parsing in `whatsapp-rules.ts`): the Cloud API at `GET/POST /api/whatsapp/inbound`
  (verify token `WHATSAPP_VERIFY_TOKEN`, `X-Hub-Signature-256` over the raw body with `WHATSAPP_APP_SECRET`) and WATI at
  `POST /api/whatsapp/inbound/wati/<WATI_WEBHOOK_SECRET>`. Each message is one `InboundMessage`; the provider's message
  id makes a retried webhook a no-op, so the message is read inline (no background work on Vercel).
- **Reading.** Media is fetched from the provider (`MessagingService.fetchMedia`) and kept as an `Attachment` of the
  sender. A voice note is written down by `transcribe.ts` (`TRANSCRIBE_PROVIDER` fake, openrouter or sarvam; its cost is
  the `VOICE_NOTES` line in the AI spend) and marked Check this wherever it shows. Then `AiService.ask` runs as the
  sender with `client: 'whatsapp'` (one conversation per person per day, their one active project picked if they have
  one); `AiService.status` gates it like any question. The first draft WhatsApp can save (`CAPTURE_SAVE_KINDS`) is kept
  on the message with `captureId`; a letter is only opened in the app.
- **Deciding.** A button `save:<id>` / `discard:<id>`, or a reply that is only a Save or Discard word (`replyIntent`:
  1, haan, हाँ / 2, nahi, नहीं) acts on that draft or the latest one waiting, for `CAPTURE_SAVE_HOURS`. Save turns the
  draft's values into the create body (`createBody`: decimals as strings, the message's `recordClientId` as the client
  id, the photo as an attachment), validates it with the create DTO and calls the kind's service. Opening the draft
  in its form from `/whatsapp-capture` and saving there calls `POST /whatsapp/messages/:id/saved-in-app` (from
  `FormShell`, through `AiDraftDto.captureId`), which counts as Changed.
- **The page.** `/whatsapp-capture` (Site): the person's switch, the server's state, examples, and their messages with
  Save / Open form / Discard; admins see everyone's and the webhook address. The go-live figure is drafts saved as
  drafted out of those decided in 30 days, against `CAPTURE_GO_LIVE_SHARE` (70%).
- **Tests.** `src/scripts/whatsapp-capture-test.ts` (CI flows): the providers' payloads, replies and bodies, then the
  demo company end to end. `e2e/tests/whatsapp-capture.spec.ts` posts to WATI's webhook address (`WATI_WEBHOOK_SECRET=e2e-wati`).

## Leakage checks

- **What it is.** AI item 121: the month's flags where material, money and fuel may be going missing, each with the
  rupees at risk, its working and links to the records it rests on. Page `/leakage` (Materials › Leakage checks,
  `?month=YYYY-MM`); `GET /api/leakage?month=`. A flag is a reason to look, not proof, and nothing is blocked by one.
- **Sections and who sees them** (`leakageSections` in `@erp/shared/leakage.ts`, built from the existing permission
  helpers): material for the store, the QS, approvers and accounts; rates for purchasers and those who see cost; fuel
  and idle hire for whoever runs the machines, and accounts. Rupees for material and fuel follow stock value
  (`canSeeLeakageStockValue`), for idle hire the hire rates (`canSeeLeakageHireValue`). Projects are the caller's.
- **Material** reads the reconciliation through `ReconciliationService.forPeriod(projectId, from, to)` (norm × the
  month's approved progress × wastage, against issues less returns), so it follows the reconciliation as that changes
  (the DPR work lines and stock reconciliation of items 127 and 128 feed it there). A site's item is flagged over the
  allowance by `MATERIAL_OVERUSE_MIN_PCT`, or `SITE_RATIO_ABOVE_PTS` points above the company median of used ÷ allowed
  over every active site with norms (`companyMedians`, `materialLeak`); the excess is valued at the item rate.
- **Rates.** `rateAboveOthers` (shared, pure) compares a PO line with the lowest approved order of the same item (name and
  unit, ignoring case) another project placed in the `RATE_WINDOW_DAYS` before it, flagged above `RATE_ABOVE_MIN_PCT`.
  The same function runs on the PO form (`GET /purchase-orders/rate-check`, `RateAbove` under the rate), on the order's
  record and approval pane (`PurchaseOrderLineDto.rateCheck`, set by `PurchaseOrdersService.get`), on this page and on
  the watch list. Orders come from `PurchaseOrdersService.quotesFor`, scoped to what the caller may see.
- **Fuel.** Fuel issued into a machine on a day with no log (any not rejected), from `FUEL_NO_LOG_MIN_LITRES` a day
  (`fuelWithoutLog`), valued at the fuel's item rate; and the existing fuel norm check over the month's logs, its extra
  litres priced at what the store charged for the machine's fuel.
- **Idle hire** (`idleHire`): hourly hire with a monthly minimum is flagged while the hours worked are under the minimum
  for the days gone (the hire bill tops them up to it), valued at the hourly rate; monthly hire from `IDLE_MIN_DAYS` idle
  days between its first and last log of the month, each a day's share of the month's rate. Daily hire bills only the
  days worked, so it is never flagged.
- **Watch list.** `RATE_ABOVE` (purchasers), `FUEL_NO_LOG` and `IDLE_HIRE` (machine managers) are built by
  `WarningsService` from `LeakageService.compute` for the month so far, so the page and the list agree; fuel off its
  norm stays `FUEL_NORM` and material over the norm `MATERIAL_OVERUSE`. All are Checked.
- **Tests.** `leakage-rules.ts` is pure; `src/scripts/leakage-test.ts` (CI) tests the rules, then puts one leak of each
  kind into a month four months back on the demo company and must find every one with its rupees, the PO record's rate
  check, the roles' sections, and this month's flags on the watch list. The seed gives the hired grader a 200-hour
  minimum and diesel into the excavator on a day with no log.

## Cash forecast and billing readiness

- **What it is.** AI item 122. Accounts › Cash forecast (`/cash-forecast`, `GET /api/cash-forecast`) is the bank and cash
  ledgers today and 13 weeks from this Monday of money in and out, each week's closing balance as a low, likely and high
  case, why a short week is short, what to chase and what can wait, and how far the forecast of four weeks ago was out.
  Client billing › Billing readiness (`/billing-readiness`, `GET /api/billing-readiness?projectId=`) is, per project,
  approved measurements in no RA bill, approved RA bills not sent and sent bills not paid. The forecast is for whoever
  keeps the books (`canSeeCashForecast`); readiness for whoever sees the contract (`canViewContract`), over their projects.
- **Opening.** `BooksService.accounts` (which posts what is new first): the Bank Accounts and Cash-in-Hand groups.
- **Money in.** Each open client bill (from `ReceivablesService.summary`) at what is still owed, scaled to its net
  payable (after retention, TDS and recoveries), dated its sent date plus the client's days (`payTiming`: the mean of the
  client's paid bills, spread by their standard deviation and at least `MIN_PAY_SPREAD_DAYS`; with fewer than two paid
  bills the contract's days, or 30, spread `CONTRACT_PAY_SPREAD_DAYS`). One past its days is due today, late by the
  spread, and marked overdue. Approved measurements in no RA bill (and no work order) at BOQ rates times the last bill's
  net ÷ gross, in the next RA bill (`nextBillDate`, the last bill's day of the month) plus the client's days; they are
  left out of the low case.
- **Money out.** Open vendor and subcontractor bills (`PayablesService.summary`) on their due dates; approved, open
  purchase orders' unbilled balance their payment days (`DEFAULT_PO_PAYMENT_DAYS`) after delivery; open work orders at
  their last 90 days' pace (`workOrderRunRate`); the latest month's payroll net each month on the day it was paid; unpaid
  EMIs of active machine loans; the Duties & Taxes credit balance on the next 20th (`STATUTORY_DUE_DAY`); approved fund
  requests and PO/WO advances not yet paid on the day needed. MSME bills are marked.
- **Weeks** (`forecastWeeks`, pure): the low case takes money in late and money out early, the high case the reverse; a
  week is short when its likely balance is below zero, at risk when only the low one is. `weekReasons` names the client
  bills that would have closed the gap but come later than the client's days, the MSME bills due and the largest other
  payments. `chaseAndHold`: chase client bills past their days or expected after the first squeezed week; hold vendor,
  subcontractor, PO and WO payments due by then, never MSME, salaries, EMIs, dues or site funds.
- **Last month's error.** The first forecast of each week is stored in `CashForecastSnapshot` (one per organisation and
  Monday, RLS). The page compares the snapshot made `FORECAST_ERROR_WEEKS` weeks back, for the week that ended last
  Sunday, with the books' bank and cash on that Sunday (`forecastError`).
- **Watch list.** For whoever keeps the books the `CASH` warning is the forecast's first short week (its key carries the
  week and the gap in lakhs); other roles keep the earlier receivables-against-payables check.
- **Payment reminder** (`GET /api/billing-readiness/reminder/:billId`): for a sent, unpaid RA bill, an OUT letter as an
  `AiDraftDto` (with `note`, shown on the form's banner): the bill, how long it has waited and the contract's payment
  clause, found with `DocumentTextService.search` and cut to the numbered clause by `paymentClause`. Nothing is saved;
  Draft reminder opens the letter form through `requestNew('letter', …)`.
- **Tests.** `cash-forecast-rules.ts` is pure; `src/scripts/cash-forecast-test.ts` (CI flows) tests the rules, then on
  the demo company checks the opening against the books, the weeks adding up, the snapshot and a four-week-old one
  against the books, the watch list agreeing, readiness and the reminder quoting clause 7.2, and replays the past
  twelve Mondays (with a year of the road client's bills put in and taken out) against what was received and paid.

## Hindrance register to notice

- **What it is.** AI item 123. What a site writes under a DPR's issues is read for hindrances; the project manager
  records each as a delay, adds it to the open delay it belongs to, or dismisses it; and a delay the contractor is not
  answerable for runs a notice clock against the contract until a letter to the client is linked to it.
- **Reading** (`classifyRemark` in `apps/api/src/hindrance/hindrance-rules.ts`, pure): English, Hinglish and Hindi
  keyword rules, narrowest cause first (land not handed over, encroachment, drawings, payments, permissions, utilities,
  client decisions, weather, bandh, safety, labour, material, machines), with the party each implies (client-supplied
  material is the client's, a mining ban a third party's). Material, labour, drawings, permits and utilities also need
  a word saying work was held up. "Nil" and a few hours lost to our own supply or a shower are nothing. A remark that
  says work stopped but not why is UNSURE: with Ask Nirmaan on for the reader (`AiService.status`) the model reads it
  (`singleTurn`, JSON back, at most five a load), else it is kept as cause not clear. `startDateFrom` reads "since 12
  Oct", "3 din se", "kal se", "since Monday". `hindrance-cases.ts` is 100 labelled remarks; the test needs 9 in 10.
- **Kept once** (`HindranceCheck`, one per DPR, RLS): the remark as read, the verdict, cause, party, start, the words
  matched, RULES or MODEL, and the decision (PENDING, RECORDED with its `riskId`, DISMISSED). A changed remark is read
  again while pending. DPRs sent (submitted or approved) in the last `HINDRANCE_LOOKBACK_DAYS` on active projects are
  read when the suggestions or a DPR's page are opened (`GET /api/hindrances/suggestions`, `/hindrances/dpr/:id`), for
  `canReviewHindrances` (approvers who raise delays). Recording (`POST /hindrances/:id/record`) goes through
  `RisksService.create` (or links an open delay on the same project, `riskId`); `POST /hindrances/:id/dismiss`.
- **Notice period.** `Project.noticeDays`, set on the Contract tab; the form suggests the clause found in the filed
  contract (`GET /hindrances/notice-period/:projectId`: `DocumentTextService.search`, then `noticeClause`, which takes a
  clause asking for notice within N days of a hindrance before one asking to apply, and never a claim after it ends).
  Unset, `DEFAULT_NOTICE_DAYS` (14).
- **Clock** (`noticeClock`): due on the delay's start plus the notice days; running while the delay is open, its party
  is in `NOTICE_PARTIES` (client, third party, force majeure) and no OUT letter is linked (`GET /hindrances/notice/:riskId`,
  shown on the delay). The watch list's `NOTICE_DUE` (approvers who raise delays) fires at 7, 3 and 0 days or fewer
  (`NOTICE_STAGES`), keyed `notice:<risk>:<stage>`, from the same rule in `WarningsService.notices`.
- **Draft notice** (`GET /hindrances/notice/:riskId/draft`): an OUT letter as an `AiDraftDto` with `riskId`, written by
  `noticeLetter` from the delay, the DPR remarks recorded into it, its photos and the contract's notice and
  extension-of-time clauses (`eotClause`); it says so when the notice is late. Nothing is saved; the letter form opens
  through `requestNew('letter', …)` with the delay already chosen.
- **Register** (`GET /hindrances/register/:projectId`, printed from Delays and risks): each delay with its dates, days
  lost, party, the notice given (or due), its letters and DPR entries, for an extension-of-time claim.
- **Tests.** `src/scripts/hindrance-test.ts` (CI flows): the 100 remarks, start dates, the demo contracts' clauses, the
  clock and the letter; on the demo company the seeded remarks, record, link, dismiss, the model's path, the notice
  periods, NOTICE_DUE moving with the contract's days and stopping when a letter is linked, Draft notice and the register.

## Attendance cross-check

- **What it is.** AI item 124. What a labour contractor bills in man-days, against what the site recorded over the
  bill's days: the head-count sheet (`AttendanceSheet`), the named roll call (`WorkerAttendance`) and the biometric
  punches (`BiometricPunch` on a device at the site); and each day's records against each other and the DPR's manpower.
  Rules only. A flag is a reason to ask for the muster: nobody's wage is held or cut by it.
- **Bills** (`AttendanceCheckService.billChecks`): a subcontractor bill's lines whose work order unit is a man-day
  (`isManDayUnit`: Man-day, MD, Mandays) cover the days after the bill before it (or from the work order's start) up to
  its "measured up to" (`billSpan`). The crew is the work order's vendor (by id, or by name on the sheet and the
  worker register), the trade is read from the line (`tradeOf`, else the whole crew). What the records support is the
  higher of the head count and the roll call (`supportedOf`; punches are a part of the roll call and never raise it);
  a line is flagged from `MANDAY_TOLERANCE_MIN` (2) man-days and `MANDAY_TOLERANCE_PCT` (5%) above it, or when the site
  kept neither (`billExcess`). The rupees are the excess at the line's rate.
- **Where it shows.** On the bill's checks (`mandays` rule in `bill-rules.ts`, through `forBill`), counts only; on the
  watch list as `MANDAYS_ABOVE` for bills waiting for approval (`canApprove`, key per line's billed and supported
  figures); and on `/attendance-check` (`GET /api/attendance-check?month&projectId`, `canSeeAttendanceCheck`: HR and
  approvers) with every man-day bill of the month.
- **Days.** `NO_PUNCH`: workers on a day's roll call, enrolled on a device, with no punch on a day others of the crew
  punched on the site's device, from `NO_PUNCH_MIN` (2) in a crew, at their daily wages (`unpunched`). `HEADCOUNT_ABOVE`: a crew's head count
  above the heads on its roll call, and `DPR_GAP`: a site's head count above its DPR's manpower, each from
  `HEADCOUNT_GAP_MIN` (3) and `HEADCOUNT_GAP_PCT` (10%) (`headGap`). With a project, the page lists each day's DPR, head
  count, roll call and punches. Workers are named only for `canSeeAttendanceNames` (HR and the project manager).
- **Tests.** `src/scripts/attendance-check-test.ts` (CI flows): the rules, and a backtest on 24 labelled crews (the bar
  is 6 flags in 10 real; it gives 9 of 11, and every padding a record can show); on the demo company Sri Jagannath's
  padded helpers on the page, the bill's checks and the watch list, Maa Tarini's clean bill, the unpunched helpers named
  to the PM and HR only, a planted padded head count, and roles. `bill-checks-test` counts the padded bill as a seeded
  anomaly.

## Management dashboard and reports

- **What it is.** Item 132, asked by Pradeep on 26 Oct 2026 from the end-to-end test report's BI review: one place for
  the MD and management to see every contract project, and the reports they print or send each month. For those who see
  project cost (`canSeeManagement`, which is `canViewCost`: admin, management, accounts, and a project manager for their
  own projects). A store or yard (`STORE`) and an RMC plant (`PLANT`) have no contract, so they stay out
  (`ManagementService.contractProjects`), except from the stock position.
- **Reads, never its own rules.** Every figure comes through the modules' own services: projects and their access
  (`ProjectsService.listAll`), progress and measurement at BOQ rates, approved RA bills and their receipts, client bills
  open (`ReceivablesService`), vendor bills (`PayablesService`), cost by head (`CostService.compute`), budget and forecast
  (`BudgetService.forecasts`), the cash forecast (`CashForecastService.forecast`, for `canSeeCashForecast` only), stock
  (`StockService`) and approvals waiting (`SubmissionLifecycleService.submitted`). The arithmetic is pure in
  `apps/api/src/management/management-rules.ts`, tested in `src/scripts/management-test.ts` (CI flows).
- **Work done.** Each BOQ item at the larger of its approved progress and its approved measurement, at the BOQ rate
  (`workDoneValue`). A lump-sum or EPC contract is worth the larger of that and its physical progress times the lump sum
  (`contractWorkDone`), since its BOQ rarely carries the whole price. In a period (the MIS's month and year) a lump-sum or
  EPC project's work done is left blank: it is valued by its stages.
- **Health.** `healthOf` gives each project On course, Watch or Act now with the reasons in words: finishing late (Act
  past 30 days), behind plan by `BEHIND_BY` (10) points, cost above work done or a forecast loss (Act), a margin under
  `THIN_MARGIN_PCT` (5%), work done and not billed for `UNBILLED_WATCH_DAYS` (45, Act from 90) when it matters
  (`unbilledMatters`: from ₹1 lakh or 0.5% of the contract), client money over 90 days (Act), approvals older than
  `APPROVAL_OLD_DAYS` (7, Act past 14) and high risks (score 15 or more). The schedule is `scheduleOf` over the leaf
  activities' planned progress, the completion date plus extensions granted.
- **API.** `GET /api/management/portfolio` (`PortfolioDto`: totals, every project's row, approvals by age, 12 months of
  billed, received and cost, the cash forecast's headline, and every reason worst first); `GET
  /api/management/projects/:id` (`PortfolioProjectDetailDto`: cost by head against budget and forecast, months with work
  done, client bills open, entries waiting, risks and open orders); `GET /api/management/reports/:key?month|from&to&projectId`
  (`ManagementReportDto`: figures, sections of typed columns with totals and row links, and notes). The keys are
  `MANAGEMENT_REPORT_KEYS` in `packages/shared/src/management.ts`: Monthly MIS (a month), Project profit and loss,
  Procurement spend and Labour and attendance (a range, the financial year by default), and Work in progress,
  Receivables ageing, Payables ageing, Stock position and Approvals waiting (as of today).
- **Web.** `/management` (the figure strip, the money pipeline from contract to paid, Needs action, the projects table
  with a done-against-plan bullet, the monthly trend through `ChartCard`, approvals by age and the reports),
  `/management/projects/[id]` (the same for one project, cost heads as budget tracks and the open items in tabs) and
  `/management/reports/[key]` (period and project in the address, `useProjectScope`; Print opens the brand's A4 page from
  `components/management/reportOutput.ts`, Excel writes a summary sheet and a sheet per section with numbers kept as
  numbers). A wide section reads its money in lakhs and crores on the screen; print and Excel keep rupees. The trend's
  colours are `BRAND.colors.trend…`, checked for colour-blind separation in both themes. A new report is a key and an
  entry in `MANAGEMENT_REPORTS`, a builder in `ManagementReportsService`, and a node under Reports in the navigation tree.
- **Not yet.** The phone, a scheduled email of the MIS, and a budget for the company as a whole.

## Money and quantities

Decimal columns everywhere (`Decimal(18,2)` for money, `Decimal(18,3)` for quantities) and strings
over the wire. No floating point for contract values.

## Attachments

Uploaded first (`POST /api/uploads`), then linked to the entry by id. This keeps mobile forms simple
and lets a photo be taken before the form is finished. Local disk now, object storage later; only
`storagePath` changes. With Vercel Blob storage, a web file over 4 MB goes straight to Blob: `POST /uploads/direct`
gives a client token for a path under the organisation's prefix, and `POST /uploads/direct/complete` checks the blob
and creates the Attachment (up to 100 MB).

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

## Saved list views

`SavedView` is a named set of a list's filters, sort and columns (`state`, JSON, cleaned to string filters and column
keys and capped at `SAVED_VIEW_MAX_STATE` characters), owned by one user, for one of `SAVED_VIEW_LISTS`. A `shared`
view shows for everyone in the organisation; only its owner or an admin (`canManageSharedViews`) can change or delete
it. The project is never saved: it follows the header's project switcher. Views are a convenience over the list
endpoints' own filters (`status`, `mine`, `from`/`to`…), so they never widen what a user can see.

## Languages (mobile)

The site app first opens in the phone's own language when it has it (Hindi or English, from `expo-localization`), and a
user switches on the intro, the sign-in screen (`LanguageSwitch`) or under Profile > Language; the choice stays on the
phone in the kv-store, read before the first frame (`LanguageProvider`, `src/i18n/LanguageContext.tsx`). Screens call
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
  online; when offline, or when the request fails to reach the server or takes over 25 seconds
  (`REQUEST_TIMEOUT_MS` in `src/api/client.ts`), it saves the entry to the outbox. The form makes one
  UUID up front and sends it both ways, so a request that timed out but arrived is not made twice. Picked photos are copied into the app's documents folder because the
  image picker's cache can be purged.
- **Sync.** `OfflineProvider` flushes the outbox in creation order when the network comes back
  (expo-network), when the app returns to the foreground and after sign-in. For each entry it uploads
  any photo without an attachment id (remembering ids as it goes), then posts the entry with its
  client id. Network errors and 5xx stop the run and keep the entry pending; a 4xx (for example a DPR
  for a day that already has one) marks it failed, and the Outbox screen offers Fix and send (the form reopens
  the entry by `?outboxId=`, `OUTBOX_FIX_PATH`), Send again or Discard. A run that sent or refused entries
  says so in the snackbar, and the outbox shows when an entry last reached the server.
- **Drafts.** A new DPR, progress entry, measurement or attendance sheet is kept in the kv-store as it is typed
  (`useFormDraft`, one per form and user) and reopened on the form's first frame; leaving with unsent work asks
  whether to keep the draft. A photo taken while Android closed the app comes back through
  `ImagePicker.getPendingResultAsync` to the next photo field opened.
- **Read cache.** `useFetch(..., { cacheKey })` stores the last good response per user, so projects,
  activities, the home screen and My Submissions open offline with the last loaded data.
- Edits and resubmits, reviews and approvals still need a connection: they act on server state that
  may have changed since the phone last saw it.
- Web (Expo web export) uses a localStorage-backed store instead of SQLite.
