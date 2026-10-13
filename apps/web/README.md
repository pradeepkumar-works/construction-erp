# Construction ERP - Web

Next.js 15 (App Router) + Ant Design 6 front end for the Construction ERP API.

## Run

```bash
# from the repo root (API must be running on http://localhost:4000)
pnpm --filter @erp/web dev        # http://localhost:3000
pnpm --filter @erp/web build && pnpm --filter @erp/web start
```

Or from `apps/web`: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm typecheck`.

## Environment

| Variable              | Default                      | Description                                   |
| --------------------- | ---------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api`  | Base URL of the API. Upload URLs use its origin. |

Copy `.env.example` to `.env.local` to override.

## Demo logins

All passwords are `password123`: `admin@demo.com` (Admin), `md@demo.com` (Management), `pm@demo.com` (Project Manager), `engineer@demo.com` (Site Engineer), `qs@demo.com` (Quantity Surveyor).

## Structure

- `src/lib/api.ts` - axios instance (bearer token, 401 redirect), `src/lib/auth.tsx` - auth context, `src/lib/queries.ts` - TanStack Query hooks, `src/lib/format.ts` - INR / date helpers.
- `src/app/login` - login page; `src/app/(app)` - authenticated shell (dashboard, projects, approvals, DPR, progress, material requests, users).
- `src/components/*` - feature components (BOQ import from Excel, DPR print view, review actions, drawers, forms).
- `src/middleware.ts` - cookie-based redirect to `/login` for unauthenticated requests.

## Note on React in this workspace

React and react-dom are pinned to the same exact version as `apps/mobile` (Expo pins React), so the hoisted pnpm workspace keeps a single React copy.
