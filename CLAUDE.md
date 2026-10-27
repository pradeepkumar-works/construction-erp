# Construction ERP – working notes for Claude Code

Read `README.md` (what it is, how to run), `docs/ARCHITECTURE.md` (data model, access rules,
approval state machine), `docs/DEPLOY.md` (hosting) and `docs/ROADMAP.md` (what to build next).

## Layout

- `apps/api` NestJS 11 + Prisma 6 + PostgreSQL. Global prefix `/api`, Swagger at `/api/docs`.
- `apps/web` Next.js 15 App Router + Ant Design 6 + TanStack Query. Root route group `src/app/(app)`.
- `apps/mobile` Expo SDK 57 + expo-router, plain React Native components (no UI kit).
- `packages/shared` enums, labels, permission helpers and API response types. Built to `dist`;
  run `pnpm --filter @erp/shared build` after changing it.

## Commands

```bash
pnpm install                          # hoisted node_modules (see .npmrc); CI=true for non-interactive
pnpm --filter @erp/shared build
pnpm db:migrate && pnpm db:seed       # apps/api/.env needs DATABASE_URL
pnpm dev:api | pnpm dev:web | pnpm dev:mobile
pnpm typecheck                        # all packages, must pass before committing
cd apps/web && npx next build         # web must build clean
cd apps/web && npx tsx --tsconfig tsconfig.json scripts/nav-check.ts   # navigation tree: routes, icons, access, Concord
pnpm --filter @erp/web lint           # ESLint (typescript-eslint, hooks, Next, jsx-a11y) on the web; 0 errors, CI runs it
cd apps/mobile && npx tsc --noEmit && CI=1 npx expo export --platform android
cd e2e && npx playwright test         # browser tests; needs API + web running (docs/TESTING.md), CI runs them on PRs
cd e2e && npx playwright test --project=walk --workers=2   # just the route walk (every sidebar page, see Accessibility)
```

A pull request fills in `.github/pull_request_template.md`: the checks above, screenshots at 1440 and 390 in both themes,
and the pre-delivery checklist.

## Conventions

- Every tenant table has `organizationId`; every query filters by the caller's org from the JWT. Postgres
  row-level security backs this up: a new tenant table needs a `tenant_isolation` policy in its migration
  (copy one from `20261013211500_tenant_rls`) and a line in `prisma/rls-rollback.sql`. Code in a request that
  must see other organisations uses `withoutTenant` (`src/prisma/tenant-context.ts`).
- Project visibility and approval rights live only in `apps/api/src/common/project-access.service.ts`
  and `packages/shared/src/permissions.ts`. Do not re-implement role checks elsewhere.
- All site submissions share `SubmissionLifecycleService` (DRAFT → SUBMITTED → APPROVED /
  REJECTED / CHANGES_REQUESTED) and write `AuditLog`. A new submission type = a table with the same
  six status columns, registered in that service.
- Money `Decimal(18,2)`, quantities `Decimal(18,3)`, serialised as strings. Dates `YYYY-MM-DD`.
- Schema changes go through Prisma migrations in `apps/api/prisma/migrations`; never edit the
  cloud DB by hand. The Vercel build runs `prisma migrate deploy`.
- Add new enums to both `schema.prisma` and `packages/shared/src/enums.ts` (+ labels).
- Web: `'use client'` components, `App.useApp()` for message/modal, data via hooks in
  `src/lib/queries.ts`, formatting in `src/lib/format.ts`. Sidebar links, quick-jump search and module screens come from the
  navigation tree, `NAV_TREE` in `packages/shared/src/navigation.ts` (ARCHITECTURE "Navigation tree"): a new page is one node
  in its module, with its `access` key (a check in `NAV_ACCESS` wrapping the page's own `@erp/shared` helper), a Lucide icon
  (add it to `components/shell/nav-icons.tsx`) and a one-line description; a planned node turns `live` when its item ships.
  A module (`parent: null`, no route) has a screen at `/modules/<key>` (a key in `MODULE_KEYS`, figures in `ModuleHomeService`).
  `apps/web/scripts/nav-check.ts` (CI) checks routes, icons, access keys and the Concord items. The product name (Nirmaan) is `PRODUCT_NAME` in
  `packages/shared/src/brand.ts`; web brand colours live only in `src/lib/brand.ts` (plus `BrandMark` and
  `app/icon.svg`), mobile ones in `src/theme.ts`. Use `BRAND.colors` instead of hex literals. A component's look is its
  tokens in `makeTheme` and `componentConfig` (`src/lib/theme.ts`, both modes), never CSS of a page's own: titles and big
  figures are the display face (`DISPLAY_FONT`), fields have the blue ring, tables the canvas header.
  Check antd 6 typings in node_modules before using a prop you are unsure of.
- Taste: `.claude/skills/design-taste-frontend` (tasteskill, from leonxlnx/taste-skill) is the design guideline for the website
  (`/welcome`, the page run) and app screens (`references/app-screens.md`); its inspector checks the website
  (`node .claude/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:3000/welcome`, 0 FAIL). The rules in this
  file win where they differ (the navy sidebar, the canvas table header, the Nirmaan blue primary, the launcher's tiles).
  On the website: no eyebrows, index numbers, rules, boxes, shadows or gradients; screens shown as they are, no browser frame.
- antd reference: the `antd` MCP server in `.mcp.json` (`@ant-design/cli mcp`: component docs, props, tokens for the
  installed version), and https://ant.design/llms.txt (index) or https://ant.design/llms-full.txt (every component with
  examples). Use antd components and theme tokens before custom CSS, and the antd 6 props (Select
  `showSearch={{ optionFilterProp }}`, Alert `title`, Drawer `size`, Space `orientation`, Spin `description`, Statistic
  `styles.content`). Run `npx @ant-design/cli lint apps/web/src/<folder>` on the folders you changed before committing.
- Product tour: `src/components/shell/ProductTour.tsx` (antd `Tour`) steps over shell elements marked `data-tour="…"`;
  it starts once per user per browser and again from Help. Test browsers (`navigator.webdriver`) never
  get it by themselves.
- Shell: a list's project filter is `useProjectScope()` (`src/lib/project-scope.tsx`), shared with the header's project
  switcher and remembered; never a local `useState`. A list with a New button calls `useNewIntent(kind, allowed, open)`
  (`src/lib/new-intent.ts`) and gets a line in `components/shell/NewMenu.tsx`. Release notes for Help > What's new
  are in `components/shell/whats-new.ts`.
- Search (Ctrl K, `components/shell/CommandPalette.tsx`): records come from `GET /search` (`apps/api/src/search`), which calls each
  kind's own list service with `q`, so the list's access rules apply; a new searchable kind is one entry in `SearchService`'s
  sources plus its key in `SEARCH_KINDS` (`packages/shared/src/search.ts`). Actions are the `NewMenu` entries (`newEntriesFor`).
- Notifications: the bell opens the drawer in `components/notifications/NotificationBell.tsx`; a new `NOTIFICATION_TYPES` entry
  needs its tab in `NOTIFICATION_TAB_OF` (`packages/shared/src/notifications.ts`) and its link in `notificationTarget.ts`.
  Page-level notices (read-only, deletion, support, offline) are entries in `useShellMessages` (`components/shell/MessageBar.tsx`),
  never a separate `Alert` above the page.
- Lists: a submission list page uses `useListFrame` (`components/list/useListFrame.tsx`: filters in the URL via
  `useListPage`, views, chips, chosen columns) and `DataTable` (`ListColumn` with a stable `key`, row click, `RowActions`
  menu, bulk bar, page totals). A list with saved views is a key in `SAVED_VIEW_LISTS` (`packages/shared/src/views.ts`).
  A register or master (projects, vendors…) uses it without `type` (All plus its own `moreViews`, `projectScoped: false` when
  company-wide); a list inside a page's tab uses `useListPage({ url: false })` + `useColumnChoice` + `DataTable`.
- States: a page loading shows `PageSkeleton` (`components/common/QueryState.tsx`, shapes list/record/home/workspace), a failed
  query `QueryError` (403, 404 and offline get their own Result). `DataTable` draws its own first-load skeleton and empty state:
  pass `empty={frame.empty}` (Clear filters when filtered) and `emptyAction={newButton}`, the same button as the toolbar's.
- Pages: every page has one `<h1>` and a tab title of its own. `PageHeader` is the page's one `<h1>` and sets the tab
  title ("Bills · Nirmaan"; pass `docTitle` when the title is not plain text); a page without it calls `usePageTitle`
  (`src/lib/page-title.ts`) and draws its own `<h1>`. Its `crumbs` join
  the header's breadcrumb, so a page never draws a second one. A link styled as a button is `LinkButton`
  (`components/common/LinkButton.tsx`), never a `Button` inside a `Link`. Single-key shortcuts check `singleKeysOn()`
  (`src/lib/shortcuts.ts`, off from Help > Keyboard shortcuts); Ask is Alt J (⌘J on a Mac), never Ctrl J.
- Words: follow `docs/WRITING.md` (sentence case, one name per module in nav, page title and Search, New / Record / Report /
  Request for create, errors that say what to do, `…`, money through `format.ts`, `translate="no"` on numbers and names).
- Accessibility (WCAG 2.2 AA, `e2e/tests/accessibility.spec.ts` runs axe on the main pages in both themes; `pnpm --filter @erp/web lint`
  (jsx-a11y, antd components mapped to their elements in `apps/web/eslint.config.mjs`) must pass): text colours come
  from tokens, never antd's raw `colorWarning`/`colorSuccess` for text (use the `…Text` token); a filter or search control outside a
  labelled `Form.Item` gets an `aria-label` (`ListToolbar` takes `searchLabel`), a `Progress` gets one too; buttons beside a
  tab bar are `AppTabs`' `extra`, never `tabBarExtraContent` (antd puts it inside the tablist).
  The route walk (`e2e/tests/route-walk.spec.ts`) opens every sidebar link (the navigation tree) for each role in `WALK_ROLES` and every project
  tab, at 1440 and 390 (touch) in both themes: axe, one `<h1>`, own tab title, targets 24 px (44 touch), text 12 px, no
  sideways scroll at 390. A new page is in it with no test edit and must pass it; a link no listed role sees needs a role.
  Nothing is excluded from it. Shared fixes live in one place: a scrolling table or `data-scroll-region` box with nothing
  focusable inside becomes a Tab stop, and a table's hidden measure row leaves the Tab order (`src/lib/a11y-patches.ts`,
  mounted in `Providers`); on a phone a tab bar scrolls
  by swipe with antd's overflow button hidden, and the touch sizes (Segmented, CheckableTag, checkbox, tab) are in the
  `pointer: coarse` block of `globals.css`. Running text with links is a `<p>`; a row that opens something is 44 px high.
- Records: a submission's drawer and its own page (`/dpr/[id]`, `/bills/[id]`, …) are one `XRecord` component on
  `RecordFrame` (`components/record/`: facts, `submissionLifecycle` stage bar, sections, activity, actions); the drawer
  export is `<XRecord mode="drawer">`. List links to it use `RecordLink` and `RowActions href`. Only the deciding buttons
  go in `actions`; a delete or anything else that cannot be taken back is a `RecordMenuAction` in `more` (the ⋯ menu,
  through `useConfirmDelete`), never a tap from Approve.
- Approvals inbox (`app/(app)/approvals`): the picked entry shows as `<XRecord mode="pane">` (no actions; the inbox has the
  decision bar). Every submission type has a page; a new type adds one line in `RECORD_PAGES` and one in `ApprovalPane`
  (`components/approvals/`), or the pane falls back to a summary with Open details.
- Forms: a create/edit form sits in `FormShell` (`components/form/`): `layout="drawer"` for long ones (with `FormSection`,
  `FormGrid`), `"modal"` for short; pass `onSubmit={(v) => mutation.mutateAsync(v)}` (the shell closes on success, so
  `onSuccess` does not call `onClose`), and `draftKey` for new entries only. Lines are a `LineTable` over `Form.List`.
  Every create/edit form uses it (it guards Back, Ctrl K and links, and fills an empty `projectId` from the header's project).
  Fields side by side go in `FormGrid`; amounts are `MoneyInput`, quantities `QuantityInput unit=…`, phones/emails/GSTINs use
  `PHONE_INPUT`/`EMAIL_INPUT`/`CODE_INPUT` and their rules (`components/form/inputs.tsx`). Error messages say how to fix
  ("Choose the project"), never just "Required".
- Home (`app/(app)/page.tsx`) is the launcher (`components/launcher/HomeLauncher.tsx`, ARCHITECTURE "Launcher Home"): search over
  the navigation tree, Pinned, Recent and the module tiles. Pins and visits are the user's (`apps/api/src/launcher`, `NavPin`,
  `NavVisit`), never localStorage; a tile's menu comes from `usePins(user).tileMenu`, and a tile badge is a key of
  `LauncherBadgesDto.nodes` built from `HomeService.myWork`. A record page records its visit through `RecordFrame`.
  Discover (ARCHITECTURE "Discover and access requests") is `discoverFor` in `@erp/shared/launcher.ts` (keep
  `src/scripts/launcher-test.ts` passing); a node is New by default with `newUntil`, and admins override it in Admin › Home tiles.
- My work (`app/(app)/my-work/page.tsx`): what each role leads with is `homeLayout(role)` in `components/home/layout.ts` (order only;
  the API's `GET /dashboard/my-work` and `/dashboard/trends` in `HomeService` leave out what a role may not see). A new My work
  card is a key on `MyWorkDto`, a block in `HomeService.myWork`, a line in `MyWorkPanel`'s `CARDS` and `CLEAR`, its place in
  `homeLayout` and in the phone's `ORDERS`/`CARDS` (`apps/mobile/src/components/MyWork.tsx`, title in Hindi). Home's Waiting
  for you shows the top three of the same cards (`WaitingForYou`). Charts use
  `@ant-design/plots` from `components/home/charts.tsx`, loaded with `dynamic(..., { ssr: false })`.
- Work breakdown (item 125, ARCHITECTURE "Work breakdown"): project progress is `rollUp` in `@erp/shared/wbs.ts` (through
  `physicalProgress` in `src/common/progress.ts`), never a sum of its own; an activity with sub-activities takes no
  progress. A new kind of component is a `WorkElementType` (schema + shared + label + Hindi) and its steps in
  `element-templates.ts`; keep `src/scripts/wbs-rollup-test.ts` passing.
- Purchase (ARCHITECTURE "Small purchase items"): the split of a request between the vendors who quoted lowest per item is
  `awardLowestPerItem` (`@erp/shared/purchase-award.ts`), shared by the preview and `PurchaseOrdersService.awardLowest`,
  which raises each draft order through its own `create`; where an order is delivered with no address of its own is
  `siteDeliveryAddress` over `Project.siteAddress`, and a link sent by hand goes through `whatsAppShareUrl`
  (`@erp/shared/messaging.ts`), never a `wa.me` string of a screen's own. Keep `src/scripts/purchase-award-test.ts` passing.
- Activities and the BOQ (ARCHITECTURE "Linking activities to BOQ items"): which BOQ item an activity is offered is
  `boqLinkSuggestions` over `nameMatch` (`@erp/shared/boq-links.ts`), never a match of a screen's own; the user keeps the
  offers and `PlanningService.linkBoq` sets `boqItemId` (taking the item's unit and quantity only where the activity has
  none). Activities created with no dates are placed by `spreadUndated` (`@erp/shared/templates.ts`) when a start date
  first arrives, through `TemplatesService.spreadUndated`. Keep `src/scripts/boq-links-test.ts` passing.
- Measure from progress (ARCHITECTURE "Measurement book"): what a BOQ item still has to measure comes from
  `MeasurementsService.toMeasure` (`GET /measurements/to-measure`), whose choice of days is pure in `unmeasuredEntries`
  (`@erp/shared/measurement.ts`: the measured quantity walked off the approved entries oldest first); only activities in
  the item's own unit count. A sheet starts from them through `MeasurementPrefill`, never a second set of rules. Keep
  `src/scripts/measure-from-progress-test.ts` passing.
- Structured DPR (item 127, ARCHITECTURE "Structured DPR"): a DPR's work lines are its `ProgressEntry` rows
  (`dailyReportId`), saved only through `DprService` and moved with the DPR by `SubmissionLifecycleService.onStatus`;
  anything that counts or queues progress entries waiting for approval leaves them out (`dailyReportId: null`). Line
  arithmetic is pure in `@erp/shared/dpr-lines.ts`; keep `src/scripts/dpr-lines-test.ts` passing.
- Pipe network (item 126, ARCHITECTURE "Pipe network"): a pipe zone or main's nodes and segments come in only through the
  import (matched by code, previewed, never deleting a pipe or cutting it below its work); a DPR line of a length stage names
  its segment and is held to its length (`segmentCapProblem` over `heldOnSegments`); segment figures, readers and the import
  plan are pure in `@erp/shared/pipe-network.ts`. Keep `src/scripts/pipe-network-test.ts` passing.
- Stock against the DPR (item 128, ARCHITECTURE "Stock against the DPR"): an activity's own norms (`ActivityMaterialNorm`) come
  before its BOQ item's (`normSource`), and the DPR form reads the same; an issue or return names its component
  (`StockEntry.workElementId`, through `StockService.placeOf`). The Structure, Pipe, Kits and Exceptions figures are pure in
  `reconciliation-rules.ts` (`structureRows`, `pipeRow`, `kitRows`, `exceptionEvents`); a pipe's size is `pipeSizeOf`.
  Keep `src/scripts/reconciliation-test.ts` passing.
- Stage billing (item 129, `apps/api/src/stage-billing`, ARCHITECTURE "Stage billing"): a lump-sum bill's stage lines, slippage
  and unit-rate pricing come only from `stagePlan` (`stage-plan.ts`) and its evidence from `loadStageEvidence`; a bill is priced
  only through `ra-bill-pricing.ts` (`measuredLines`, `billTotals`), which the demo seed runs too. A new kind of stage evidence is
  a `StageTrigger` (schema + shared + label) and a branch in `loadStageEvidence`; the arithmetic is pure in
  `stage-billing-rules.ts`. Keep `src/scripts/stage-billing-test.ts` passing.
- EPC (item 130, `apps/api/src/epc`, ARCHITECTURE "EPC"): deliverable, package and client input arithmetic is pure in
  `epc-rules.ts` (`packageStatus` is shared by the tab, the payment stages and the watch list's PACKAGE_LATE). Money on a
  project in another currency stays in rupees at `Project.exchangeRate`; screens convert with `formatMoney`, `inContract`
  and `outOfContract` (`src/lib/format.ts`), never a rate of their own. Keep `src/scripts/epc-test.ts` passing.
- Tabs: every tab set is `AppTabs` (`components/common/AppTabs.tsx`), never antd `Tabs` directly (the project page's
  group bar and a list's saved views are the two exceptions). Its look is the theme's `Tabs` tokens (`lib/theme.ts`, both
  modes) and `componentConfig.tabs`, never `tabBarStyle` or CSS of a page's own. `variant="page"` for the tabs at the top of
  a page's Card (in line with its padding, sticky under the header on a wider screen), the default `section` anywhere else;
  a count is the item's `count` + `countLabel` (said after the count by a screen reader; `attention` for what waits on
  someone), never "Label (3)" or a `Badge` in the label.
- Tags and stages: a tag is `AppTag` (`components/common/AppTag.tsx`) with a `tone` (`neutral`, `info`, `pending`, `success`,
  `danger`, `violet`; a status gets a dot), never antd `Tag`; the colour maps in `format.ts` still pass antd colour names,
  which `toneOf` reads. Where an entry or a wizard stands is `StageBar` (`components/record/StageBar.tsx`), never antd
  `Steps`. ESLint refuses both imports. A form drawer's title carries its module as an `.eyebrow` (FormShell, from the page).
- Icons: Lucide from `components/common/icons.tsx` under the antd names (`PlusOutlined`…), never `@ant-design/icons` (ESLint
  refuses it); a missing one is a line there, an icon of our own drawing goes through `ownIcon`. A full-page 403/404/500 is
  `Result` with `icon={<ResultMark kind=… />}` (no `status`, which draws antd's pictures); an empty list or picker the page gave
  no words falls back to `renderEmpty` (both root `ConfigProvider`s), and `EmptyArt` picks its `-night` art in the dark theme.
- Project page: a new project tab is one entry in `app/(app)/projects/[id]/page.tsx` with a `group` from `WORKSPACE_GROUPS`
  (`components/projects/ProjectWorkspace.tsx`); its `key` is the `?tab=` value, so never rename one. Anything sticky
  inside a page reads its top offset from `useStickyTop()` (`src/lib/sticky.tsx`), not a fixed 56.
- Ask Nirmaan (AI, `apps/api/src/ai`, ARCHITECTURE "Ask Nirmaan"): the model reads only through `AiToolsService`, whose tools call
  the list services with the user, never Prisma directly; a new tool or record kind must pass `src/scripts/ai-access-check.ts`
  (CI runs it). Tools never write. Local work and CI use `AI_PROVIDER=fake`; don't call the real model from tests.
  Drafts (item 71) are `draft_*` tools in `AiDraftsService` that return form values; the list's `useNewIntent` passes the
  draft to its form's `prefill`, which hands it to `FormShell` as `aiDraft`. `src/scripts/ai-drafts-test.ts` fails on any
  write call in `src/ai`.
- Watch list (item 73, `apps/api/src/warnings`, ARCHITECTURE "Early warnings"): each forecast is a pure function in
  `warning-rules.ts` with a test in `src/scripts/warnings-test.ts`; `WarningsService` loads the records and builds the
  warning, whose `key` must change when its figures move on (a dismissal holds per key). Who sees a kind is `watchListKinds(role)`.
- Morning brief and weekly narrative (item 74, `apps/api/src/briefs`, ARCHITECTURE "Morning brief"): facts and the rules'
  draft come from `brief-rules.ts` (pure, tested in `src/scripts/briefs-test.ts`); the model writes through
  `AiService.writeFromFacts` and its text is used only when it passes the fit and figure checks, else the draft is stored.
- Ask the contract (item 75, ARCHITECTURE "Ask the contract"): PDF pages live in `DocumentPage` (read by
  `DocumentTextService`, searched with Postgres full-text search); a new kind of filed PDF is a branch in its `pendingWhere`
  and search join. `search_documents` never reads files itself. Sample contracts and their questions are
  `src/documents/demo-contracts.ts`; keep `src/scripts/contract-search-test.ts` passing when changing search words.
- Reading documents (item 70; work orders and BOQs, finding 10 of the October review; ARCHITECTURE "Reading invoices,
  challans, drawings, work orders and BOQs"): a new kind is a key in `DOC_READ_KINDS` with its fields (`@erp/shared/doc-read.ts`),
  a guide in `docReadPrompt`, a stand-in reading in `FAKE_READS` (`src/ai/model.ts`) and the form's own right in
  `AiReadService.assertMayRead`; the checks are code in `normalise`. A form that reads a file keeps it with
  `useKeepReadFile` (never its own upload call) and takes a read date only through `readDateReason` over the pure
  `readDateProblem`, passing the reason to `readFieldProps` so the field goes amber. Keep `src/scripts/doc-read-test.ts` passing.
- Site photo checks (item 76, `apps/api/src/photo-checks`, ARCHITECTURE "Site photo checks"): a record's photos go to the model
  through `PhotoChecksService`, which loads the record with its own service; flags are advice and never gate a submission.
  A record with photos shows them with `photosSection(kind, id, attachments)` / `PhotosWithChecks`; a new flag is a key in
  `PHOTO_FLAGS` (+ `PHOTO_FLAG_INFO`, the prompt and its Hindi label). Keep `src/scripts/photo-checks-test.ts` passing.
- AI controls (item 77, ARCHITECTURE "Ask Nirmaan", Usage, roles and pricing): every AI call is gated by `AiService.status(user)`
  (company on, `aiRoles`, read-only billing state, the cap held under the plan's allowance from `aiPlanAllowanceInr`); never
  check `aiEnabled` on its own. The admins' conversation log is audited on open and export. Keep `src/scripts/ai-billing-test.ts` passing.
- WhatsApp entries (item 120, `apps/api/src/whatsapp`, ARCHITECTURE "WhatsApp entries"): a message is read as the user whose
  `captureFrom` is its number, drafted by `AiService.ask` (`client: 'whatsapp'`) and saved only on the sender's Save, through
  the kind's own `create` with the create DTO's validation; a new saveable kind is a line in `CAPTURE_SAVE_KINDS` and `create`.
  Parsing and replies are pure in `whatsapp-rules.ts`; keep `src/scripts/whatsapp-capture-test.ts` passing.
- Leakage checks (item 121, `apps/api/src/leakage`, ARCHITECTURE "Leakage checks"): material reads the reconciliation only
  through `ReconciliationService.forPeriod`, rates go through `rateAboveOthers` in `@erp/shared/leakage.ts` (the PO form,
  record, page and watch list share it), and the arithmetic is pure in `leakage-rules.ts`. Who sees a section is
  `leakageSections(role)`; the watch list's RATE_ABOVE, FUEL_NO_LOG and IDLE_HIRE come from `LeakageService.compute`.
  Keep `src/scripts/leakage-test.ts` passing.
- Cash forecast (item 122, `apps/api/src/cash-forecast`, ARCHITECTURE "Cash forecast and billing readiness"): every receipt
  and payment is a `CashFlowItemDto` built in `CashForecastService.items` from the modules' own services and the books; dates,
  weeks, reasons, chase and hold are pure in `cash-forecast-rules.ts`. A new kind of money in or out is a `CASH_FLOW_KINDS`
  key and a block there. The CASH warning reads the forecast for `canSeeCashForecast`. Keep `src/scripts/cash-forecast-test.ts` passing.
- Hindrances (item 123, `apps/api/src/hindrance`, ARCHITECTURE "Hindrance register to notice"): a DPR remark is read by the pure
  `classifyRemark` (the model only for UNSURE ones, gated by `AiService.status`) and kept in `HindranceCheck`; recording goes
  through `RisksService.create`. The notice clock is `noticeClock` over `Project.noticeDays` (else 14), shared by the delay,
  the register and the watch list's NOTICE_DUE. A new cause is a rule in `RULES` plus labelled remarks in `hindrance-cases.ts`;
  keep `src/scripts/hindrance-test.ts` passing (9 in 10).
- Attendance cross-check (item 124, `apps/api/src/attendance-check`, ARCHITECTURE "Attendance cross-check"): a subcontractor
  bill's man-day lines (`isManDayUnit`) are checked over the bill's days against the head count, roll call and punches by
  `AttendanceCheckService`, which the bill's checks (`mandays` in `bill-rules.ts`), the page and the watch list's
  MANDAYS_ABOVE share; the arithmetic is pure in `attendance-check-rules.ts`. Workers are named only for
  `canSeeAttendanceNames` (HR and the PM), never on a bill. Keep `src/scripts/attendance-check-test.ts` passing (6 in 10).
- O&M (item 131, `apps/api/src/om`, ARCHITECTURE "Operation and maintenance"): an O&M bill is an `RaBill` with `omYear` and
  `omInstalment`, priced only through `om-bill.ts` (`omPricing`, instalment less staff short, penalties as `omPenalty`);
  periods, service level failures, staff short and chemicals are pure in `om-rules.ts`. A day or staff month in a billed
  period never changes. Keep `src/scripts/om-test.ts` passing.
- Management dashboard (item 132, `apps/api/src/management`, ARCHITECTURE "Management dashboard and reports"): every figure is
  read through the modules' own services (cost, budget, receivables, payables, stock, cash forecast), never a query of its own
  for money; health, schedule and work done are pure in `management-rules.ts`. A new report is a `MANAGEMENT_REPORTS` key, a
  builder in `ManagementReportsService` and a Reports node; print and Excel come from the same `ManagementReportDto`.
  Keep `src/scripts/management-test.ts` passing.
- Payroll (item 100, `apps/api/src/payroll`, ARCHITECTURE "Payroll"): every figure is a pure function in `payroll-rules.ts`
  with a test in `src/scripts/payroll-test.ts` (CI runs it); a run has its own approval (prepare, approve, pay), not
  `SubmissionLifecycleService`. Professional tax per state is `PT_RULES` in `packages/shared/src/payroll.ts`.
- Biometric (item 101, `apps/api/src/biometric`, ARCHITECTURE "Biometric attendance"): ADMS (`/iclock`, outside `/api`), the
  webhook and punch files all go through `biometric-rules.ts` (tested in `src/scripts/biometric-test.ts`, CI runs it) and
  `BiometricService.ingest`, and a punch reaches attendance only through `applyDay` (a worker never at a site other than the device's).
- Books (item 102, `apps/api/src/books`, ARCHITECTURE "Books of account"): what a module's record becomes in the accounts is
  `PostingService` (`apps/api/src/posting`), shared by the Tally export and the books; a new kind of record that moves money
  is a block there (and its Tally mark), never a second set of rules. Hand-made vouchers go through `voucherProblem` in
  `books-rules.ts` (tested in `src/scripts/books-test.ts`, CI runs it) and need someone other than their maker to approve.
- RMC (item 104, `apps/api/src/rmc`, ARCHITECTURE "RMC plant"): a plant is a project of type `PLANT`; a truck's materials
  leave the plant's store only through `StockService.issue`, and cubes are a quality test through `QualityService`. Its
  figures are pure functions in `rmc-rules.ts` tested in `src/scripts/rmc-test.ts` (CI runs it); bills and receipts post
  through the posting service (`RMC_SALE`, `RMC_RECEIPT`).
- Supplier portal (item 105, `apps/api/src/supplier`, ARCHITECTURE "Supplier portal"): a `SUPPLIER` login has a `vendorId`
  and sees only that vendor; its routes are `@SupplierAllowed()` (`/supplier/*` also `@SupplierOnly()`), and every query
  filters by `supplierVendor(user)`. Logins are given from Vendors, never Users. Its figures are in `supplier-rules.ts`
  (tested in `src/scripts/supplier-test.ts`, CI runs it); web pages under `app/(app)/supplier`, the company's side at `/supplier-inbox`.
- Attendance first (ARCHITECTURE "Attendance"): a day's head count and roll call stay open after its DPR is approved and
  lock only with an approved or paid payroll run for the month (`isAttendanceLocked`, `AttendanceService.lockingRuns`);
  anything that writes attendance calls `assertUnlocked`.
- Project setup (ARCHITECTURE "Setting up a project"): a new project's terms come from `termsFor` / `COPIED_TERMS` in
  `@erp/shared/project-setup.ts` (copied project, else the client's usual terms, else `STANDARD_TERMS`), never zeros; the
  Overview checklist is `setupSteps` over `ProjectSetupService.facts`, so a new step is a key in `SETUP_STEPS`, a fact and
  its words in `ProjectSetup.tsx`. Keep `src/scripts/project-setup-test.ts` passing.
- Security (ARCHITECTURE "Signing in and headers"): sign-in and reset requests go through `LoginGuardService` (rules in
  `auth/login-guard-rules.ts`, keep `src/scripts/login-guard-test.ts` passing); a password change sets `User.tokensValidAfter`.
  The web's CSP is in `next.config.ts`: a page that loads from a new outside service adds it there.
- Input checks (ARCHITECTURE "Measurement book", Other input checks): a quantity field is `@IsQuantity()` (`src/common/quantity.ts`),
  a day's record calls `assertNotAfterToday`, and a web date field is `DatePicker` from `components/common/DatePicker` (it reads
  typed dates in the common formats; ESLint refuses antd's). Keep `src/scripts/validation-test.ts` passing.
- Item names (ARCHITECTURE "Stock", One name per item): a request or order line's item is `ItemPicker` on the web and is saved
  through `asMasterNames` (`apps/api/src/stock/item-master.ts`); anything that finds an item by a typed name uses `masterItemFor`
  (`@erp/shared/items.ts`, aliases included), never a name match of its own. Keep `src/scripts/items-test.ts` passing.
- Central store (item 106, ARCHITECTURE "Stock"): a store or yard is a project of type `STORE`; its stock is the normal
  stock service. Sites see store stock through `ProjectAccessService.stockSourceWhere`, never a role check of their own;
  anything per site that a store has no part in (DPRs, progress) filters `type: { not: 'STORE' }`. Pages at `/stores`.
- Statements (item 103, `apps/api/src/statements`, ARCHITECTURE "Financial statements"): where an account shows is
  `statementLineOf` (`packages/shared/src/statements.ts`), the bank file reader, matching and reconciliation are pure functions in
  `statements-rules.ts` tested in `src/scripts/statements-test.ts` (CI runs it). Vouchers the books make themselves (`OPENING`,
  `YEAR_CLOSE`) are in `BOOK_OWN_SOURCES`, which the posting run leaves alone; nothing posts or changes on or before
  `BooksState.lockedUpTo`, and module records dated before `booksFrom` stay out (the opening balances stand for them).
- Mobile: screens in `app/`, shared UI in `src/components`, API in `src/api`, no new native deps
  without checking `node_modules/expo/bundledNativeModules.json` for the SDK-pinned version.
- Mobile theme: `src/theme.ts` picks the light or dark palette once at start-up (Profile > Appearance, stored in
  expo-sqlite's kv-store, `src/utils/kv.ts`; a new choice reloads the app with `reloadAppAsync`), so use
  `colors`/`statusTone`, never hex; field outlines are `borderStrong`, scrims `scrim`/`scrimDeep`. Text styles
  cap growth with `maxFontSizeMultiplier={maxFontScale}` and rows use `minHeight`. Loading is `Loading` (a `Skeleton`),
  a set of actions is a `BottomSheet` (`SheetActions`), and approving goes through `reviewSubmission()` (`src/api/review.ts`).
  A result (approved, sent, outbox drained) is `useSnackbar().show()` (bar, spoken, haptic) or `confirmResult()`.
- Mobile forms: a new-entry form keeps a draft with `useFormDraft` + `useLeaveGuard` + `DraftNotice` (`src/forms/draft.tsx`,
  `settle()` after anything it fills in by itself), shows `ErrorSummary` with `useErrorSummary` (`src/forms/errors.tsx`),
  and sends one `clientId` both directly and to the outbox; a form in `OUTBOX_FIX_PATH` also opens a refused entry by
  `?outboxId=`. Every `Input` has a `label` or an `accessibilityLabel`; dates and times are `DatePicker`/`TimePicker`
  (the phone's own pickers). `app/dpr/new.tsx` is the reference.
- Mobile Home tab (ARCHITECTURE "The launcher on the phone"): tiles, Pinned and Recent from the navigation tree; a node
  with a phone screen is a line in `PHONE_ROUTES` (`src/launcher/routes.ts`), anything else opens on the web; a new tree icon
  goes in `src/components/NavIcon.tsx` too and a new node's name and description get Hindi in `src/i18n/hi/nav.ts`
  (`nav-check.ts` and `i18n:check` fail otherwise).
- Mobile Ask tab (`app/(tabs)/ask.tsx`, ARCHITECTURE "Ask on the phone"): links in answers open phone screens through
  `phoneRoute` (`src/ai/links.ts`), so a new record screen adds its line there; a server status line needs its Hindi in `src/i18n/hi/ai.ts`.
- Mobile text: wrap everything a screen shows in `t()` from `useT()` (English is the key, `{placeholders}` for values)
  and add its Hindi to `src/i18n/hi/` (see ARCHITECTURE, Languages); `npm run i18n:check` in `apps/mobile` must pass.

## Gotchas

- `react` and `react-dom` are pinned to the exact version Expo bundles (19.2.3) in both web and
  mobile so the hoisted workspace keeps one React copy. Do not bump one without the other.
- pnpm 10 blocks postinstall scripts unless listed in root `package.json` `pnpm.onlyBuiltDependencies`.
- `SEED_ON_BUILD=true` on the Vercel API project re-runs the demo seed on every deploy (idempotent).
  Set it to `false` once real data exists.
- Uploads: `STORAGE_MODE=db` on Vercel (bytes in `Attachment.data`, served by
  `GET /api/uploads/:id/content`), `BLOB_READ_WRITE_TOKEN` switches to Vercel Blob, local disk otherwise.
- Demo accounts: see README (all `password123`).
