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
- Lists: a submission list page uses `useListFrame` (`components/list/useListFrame.tsx`: filters in the URL via
  `useListPage`, views, chips, chosen columns) and `DataTable` (`ListColumn` with a stable `key`, row click, `RowActions`
  menu, bulk bar, page totals). A list with saved views is a key in `SAVED_VIEW_LISTS` (`packages/shared/src/views.ts`).
- Records: a submission's drawer and its own page (`/dpr/[id]`, `/bills/[id]`, …) are one `XRecord` component on
  `RecordFrame` (`components/record/`: facts, `submissionLifecycle` stage bar, sections, activity, actions); the drawer
  export is `<XRecord mode="drawer">`. List links to it use `RecordLink` and `RowActions href`.
- Approvals inbox (`app/(app)/approvals`): the picked entry shows as `<XRecord mode="pane">` (no actions; the inbox has the
  decision bar). A type gets the whole record there once it has a page: one line in `RECORD_PAGES` and one in `ApprovalPane`
  (`components/approvals/`); until then it shows a summary with Open details.
- Project page: a new project tab is one entry in `app/(app)/projects/[id]/page.tsx` with a `group` from `WORKSPACE_GROUPS`
  (`components/projects/ProjectWorkspace.tsx`); its `key` is the `?tab=` value, so never rename one. Anything sticky
  inside a page reads its top offset from `useStickyTop()` (`src/lib/sticky.tsx`), not a fixed 56.
- Mobile: screens in `app/`, shared UI in `src/components`, API in `src/api`, no new native deps
  without checking `node_modules/expo/bundledNativeModules.json` for the SDK-pinned version.
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
