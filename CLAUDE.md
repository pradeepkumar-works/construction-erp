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
cd apps/mobile && npx tsc --noEmit && CI=1 npx expo export --platform android
cd e2e && npx playwright test         # browser tests; needs API + web running (docs/TESTING.md), CI runs them on PRs
```

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
  `src/lib/queries.ts`, formatting in `src/lib/format.ts`. Sidebar links (and quick-jump search) come from
  `src/components/shell/nav.ts`: a new module is one line in its section, gated by the same `@erp/shared` permission helper as its page. The product name (Nirmaan) is `PRODUCT_NAME` in
  `packages/shared/src/brand.ts`; web brand colours live only in `src/lib/brand.ts` (plus `BrandMark` and
  `app/icon.svg`), mobile ones in `src/theme.ts`. Use `BRAND.colors` instead of hex literals.
  Check antd 6 typings in node_modules before using a prop you are unsure of.
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
- Accessibility (WCAG 2.2 AA, `e2e/tests/accessibility.spec.ts` runs axe on the main pages in both themes): text colours come
  from tokens, never antd's raw `colorWarning`/`colorSuccess` for text (use the `…Text` token); a filter or search control outside a
  labelled `Form.Item` gets an `aria-label` (`ListToolbar` takes `searchLabel`), a `Progress` gets one too; buttons beside a
  tab bar go through `renderTabBar={tabBarWithExtra(…)}` (`components/common/tabBarWithExtra.tsx`), not `tabBarExtraContent`.
- Records: a submission's drawer and its own page (`/dpr/[id]`, `/bills/[id]`, …) are one `XRecord` component on
  `RecordFrame` (`components/record/`: facts, `submissionLifecycle` stage bar, sections, activity, actions); the drawer
  export is `<XRecord mode="drawer">`. List links to it use `RecordLink` and `RowActions href`.
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
- Home (`app/(app)/page.tsx`): what each role leads with is `homeLayout(role)` in `components/home/layout.ts` (order only;
  the API's `GET /dashboard/my-work` and `/dashboard/trends` in `HomeService` leave out what a role may not see). A new My work
  card is a key on `MyWorkDto`, a block in `HomeService.myWork` and a line in `MyWorkPanel`'s `CARDS`. Charts use
  `@ant-design/plots` from `components/home/charts.tsx`, loaded with `dynamic(..., { ssr: false })`.
- Project page: a new project tab is one entry in `app/(app)/projects/[id]/page.tsx` with a `group` from `WORKSPACE_GROUPS`
  (`components/projects/ProjectWorkspace.tsx`); its `key` is the `?tab=` value, so never rename one. Anything sticky
  inside a page reads its top offset from `useStickyTop()` (`src/lib/sticky.tsx`), not a fixed 56.
- Ask Nirmaan (AI, `apps/api/src/ai`, ARCHITECTURE "Ask Nirmaan"): the model reads only through `AiToolsService`, whose tools call
  the list services with the user, never Prisma directly; a new tool or record kind must pass `src/scripts/ai-access-check.ts`
  (CI runs it). Tools never write. Local work and CI use `AI_PROVIDER=fake`; don't call the real model from tests.
  Drafts (item 71) are `draft_*` tools in `AiDraftsService` that return form values; the list's `useNewIntent` passes the
  draft to its form's `prefill`, which hands it to `FormShell` as `aiDraft`. `src/scripts/ai-drafts-test.ts` fails on any
  write call in `src/ai`.
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
