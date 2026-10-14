# Testing

## What runs where

| Check | Where | What it covers |
|-------|-------|----------------|
| `pnpm typecheck`, `next build`, mobile `tsc` and `expo export` | before every commit (see CLAUDE.md) | types and builds |
| `.github/workflows/e2e.yml` | every pull request | the API and web app on a fresh Postgres with the demo seed, the API connected as `erp_runtime` (row-level security enforced), then the Playwright browser tests in `e2e/` |
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
