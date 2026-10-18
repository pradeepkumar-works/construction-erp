# Testing

## What runs where

| Check | Where | What it covers |
|-------|-------|----------------|
| `pnpm typecheck`, `next build`, mobile `tsc` and `expo export` | before every commit (see CLAUDE.md) | types and builds |
| `.github/workflows/e2e.yml` | every pull request | the API and web app on a fresh Postgres with the demo seed, the API connected as `erp_runtime` (row-level security enforced), then the Playwright browser tests in `e2e/`: the flows (with the API checks, the antd lint and ESLint) and the route walk in two shards, three jobs side by side, then the `e2e` check that passes only when all three do |
| `.github/workflows/smoke.yml` | by hand, against production | the API contract of every module, read-mostly, with the demo accounts |
| Phone checklist below | by hand on a real phone, before a store release | offline entry, photos and sync |

## Browser end-to-end tests (`e2e/`)

Playwright tests of the main web flows:

- `auth.spec.ts`: sign in, a wrong password, a signed-out visit to a protected page.
- `progress-approval.spec.ts`: a site engineer submits a progress entry in the web form; the project manager
  approves it from the Approvals queue; the entry is approved.
- `changes-requested.spec.ts`: an approver sends a material request back (a reason is required); the engineer
  sees the reason, edits and resubmits; the audit trail has both steps.
- `progress-report.spec.ts`: the monthly progress report preview shows the organisation and the Nirmaan footer.

The tests add and approve entries, so run them against a local or CI database, never production.

```bash
# API on :4000 and web on :3000 with the demo seed (see README), then:
cd e2e
npx playwright install chromium        # once
E2E_API_URL=http://localhost:4000/api E2E_WEB_URL=http://localhost:3000 npx playwright test
npx playwright show-report             # after a failure: trace, screenshot, network
```

To test with row-level security enforced locally, run migrations and the seed as the owner and the API as
`erp_runtime`, as the workflow does (`ALTER ROLE erp_runtime LOGIN PASSWORD '...'` once).

## The route walk (`route-walk.spec.ts`, UX item 89)

Every page in the sidebar, for each role whose sidebar differs (`WALK_ROLES` in `e2e/tests/route-walk.ts`: pm, a site
engineer, accounts, admin and the client's engineer), at 1440×900 and at 390×844 on a touch screen, in the light and the
dark theme, plus every tab of a project page (`?tab=` keys) for pm@demo.com. The pages are not listed in the test:
`route-walk.setup.ts` signs each role in once (saved sessions, no login per page) and keeps the links its sidebar draws
from `components/shell/nav.ts`, and the tabs are read from the project page's source. A new module is walked as soon as
it is in `nav.ts`, and the walk fails if no role in `WALK_ROLES` sees a link. On each page:

- axe at WCAG 2.2 AA (every view);
- one `<h1>` and a tab title of its own, not just "Nirmaan" (1440, light);
- every control at least 24 px, 44 px on the touch screen, and no text under 12 px (light views);
- no sideways scroll at 390 px;
- a full-page screenshot, uploaded as the `route-walk-screens-walk-1` and `-walk-2` artifacts
  (`<role>/<width>-<theme>/<page>.jpg`) for reviewers to look through.

There is no pixel-diff gate on the screenshots: baselines would churn with every UI item, and fonts and anti-aliasing
differ between machines, so a diff would fail on noise more often than on a real change. People look at them instead
(the PR template asks for 1440 and 390 in both themes).

Each page waits for the app's own ready signal (no `aria-busy` region, skeleton or spinner left, the `<h1>` drawn,
fonts loaded), never a fixed sleep or network idle. Each role has one test per view that opens the pages of its sidebar
one by one, each in a fresh browser context, and each project tab is a test of its own; every page's findings are a
separate soft check, so a failure names the role, view, page, check and element, and nothing is skipped. Nothing is
excluded from axe either: a finding inside an antd part is fixed in the app, once for every page (on a phone the tab
bar's overflow button is hidden and the bar scrolls by swipe; a scrolling table with nothing focusable becomes a Tab
stop and a table's hidden measure row leaves the Tab order, `apps/web/src/lib/a11y-patches.ts`; touch sizes are in the
`pointer: coarse` block of `globals.css`). The walk only reads, so it runs on two workers, and it never retries: its
checks answer the same each time, and a retry would hide a page that only sometimes breaks. CI splits it into two
shards (`--shard=1/2`, `2/2`) beside the flows job, and a last job named `e2e` (the check branch protection asks for)
passes only when all three did. Screenshots and the HTML report are kept for 7 days.

```bash
cd e2e
E2E_API_URL=http://localhost:4000/api E2E_WEB_URL=http://localhost:3000 npx playwright test --project=walk --workers=2
ls route-walk/screens                  # the screenshots; the flows alone are --project=chromium
```

## ESLint on the web app

`pnpm --filter @erp/web lint` runs ESLint over `apps/web/src` with typescript-eslint's recommended rules, React hooks,
Next.js (core web vitals) and jsx-a11y; CI runs it in the flows job. jsx-a11y checks DOM elements only, so
`eslint.config.mjs` maps antd's and the app's components to the element they draw (`Button` to `button`, `Input` to
`input`, `Typography.Link`, `Link` and `LinkButton` to `a`, …). Every rule is an error except the ones the config lists as
still warnings, and the script's `--max-warnings` is their count today, so a new warning fails as well; lower it when you
fix one. An `eslint-disable-next-line` names the rule and says why it is wrong for that line (`-- reason`); an unused one
is an error.

## Web Vitals budgets (`speed.spec.ts`)

Home, a list, a record and Approvals are opened fresh and used once (the search palette, a row), and the app's own
reporting (`next/web-vitals` into `reportWebVital`, `POST /api/vitals`) is read against `WEB_VITAL_BUDGETS` in
`apps/web/src/lib/vitals.ts`. LCP and INP may reach `VITALS_SLACK` times their budget (2 unless set): a CI runner
shares a few slow cores between Postgres, the API, the web server and the browser, with no GPU. CLS is not about speed
and keeps its budget. The field reports in the API's log (`/api/vitals`) are the measure for real phones and networks.

## Offline entry on a real phone

Run this on an Android phone with the preview build (`eas build -p android --profile preview`), signed in as
`engineer@demo.com`. Expo Go works for everything except push. Tick each line; anything unexpected goes into
the project thread with the phone model and Android version.

**Setup**
1. With the internet on, open Home, the road project, its activities and My Submissions once, so the phone
   caches them.

**Entering while offline**

2. Turn on airplane mode. The "Offline" banner appears at the top within a few seconds.
3. Add a progress entry with two photos: one from the camera, one from the gallery. Each photo shows a
   cloud-offline mark, and the entry saves with "Saved on this phone".
4. Add today's DPR and a material request the same way. Fill attendance for today.
5. Open Outbox: four entries, all "Waiting to send", oldest first.
6. Force-close the app (swipe it away), reopen it, still offline. The four entries are still in Outbox, and
   the photos still show.

**Coming back online**

7. Turn airplane mode off. Within about ten seconds the banner clears and Outbox empties without a tap.
8. On the web, as `pm@demo.com`, all four show in Approvals once each (no duplicates), and the progress
   entry has both photos. Open a photo: it is sharp enough to read, and the upload was small (about 300 to
   600 KB; earlier builds sent the full camera file).
9. The DPR's manpower matches the attendance entered in step 4.

**Bad network and errors**

10. With weak signal (or Wi-Fi switched off mid-send), add an entry with a photo. If the send is cut off, the
    entry stays in Outbox as waiting, and goes through on its own once the signal is back. It is not sent
    twice.
11. Offline, add a second DPR for the same day, then go online. The server refuses it, Outbox shows it as
    failed with the reason, and Discard removes it. The entries behind it still send.
12. Sign out with an entry waiting, then sign in as `engineer2@demo.com`: the first user's entry is not shown
    and not sent. Sign back in as `engineer@demo.com`: it sends.
13. Leave an entry waiting overnight with the phone offline. Next morning it still sends, with its photos.
