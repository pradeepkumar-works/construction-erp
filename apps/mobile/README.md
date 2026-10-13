# Site App (mobile)

Expo / React Native app for site staff: daily progress entries, daily progress reports (DPR), material requests, and approvals for project managers. Built with Expo SDK 57, expo-router and React Native core components (no UI kit).

## Run with Expo Go

1. Start the API (from the repo root): `pnpm dev:api` — it listens on `http://localhost:4000/api`.
2. Find your machine's LAN IP (e.g. `192.168.1.20`). The phone must be on the same Wi-Fi.
3. Start Expo with the API URL pointing at that IP:

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api npx expo start
   ```

   On Windows PowerShell: `$env:EXPO_PUBLIC_API_URL="http://192.168.1.20:4000/api"; npx expo start`

4. Open Expo Go on the phone and scan the QR code. The Profile tab shows which API URL the app is using.

If `EXPO_PUBLIC_API_URL` is not set the app falls back to `http://localhost:4000/api`, which only works in a simulator/emulator on the same machine (Android emulator: use `http://10.0.2.2:4000/api`).

Alternatively create `apps/mobile/.env.local` with `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api` (ignored by git).

## Push notifications

The app registers its Expo push token with the API after sign-in (`POST /notifications/push-tokens`)
and forgets it on sign-out. Remote push needs an EAS project id in `app.json`
(`npx eas-cli@latest init` writes `extra.eas.projectId`) and a development build
(`npx expo run:android` or `eas build --profile development`); Expo Go on Android cannot receive
push since SDK 53. The Profile tab shows whether push is on for the device and why not otherwise.
Tapping a push opens the submission it is about; the bell on Home opens the full list
(`app/notifications.tsx`), which also works in Expo Go.

## Demo logins (password `password123`)

| Email | Role | Notes |
| --- | --- | --- |
| engineer@demo.com | Site Engineer | member of two projects; submits progress / DPR / material requests |
| tl@demo.com | Team Leader | site submissions and attendance (Jajpur has no sheet for today, to try it) |
| pm@demo.com | Project Manager | sees the Approvals tab and can approve / request changes / reject |
| store@demo.com | Store Manager | stock: receive against approved requests, issue at site (Diesel is below its minimum on two projects) |

The login screen lists these; tapping one fills the form.

## What is in the app

- `app/login.tsx` — sign in, error state, demo accounts.
- `app/(tabs)/` — Home (today's DPR status per project, pending counts, recent submissions, quick actions), Projects, Submit hub, Approvals (approver roles only), Profile.
- `app/project/[id].tsx` — project summary, activities with planned / executed / % and delayed flag, "add progress" per activity.
- `app/progress/new.tsx`, `app/dpr/new.tsx`, `app/material-request/new.tsx` — submission forms with photo capture (camera + library), validation, success state.
- `app/progress/[id].tsx`, `app/dpr/[id].tsx`, `app/material-request/[id].tsx` — detail screens with photos, status, reviewer note and approve / request changes / reject for approvers.
- `app/attendance.tsx` — the day's attendance by contractor and trade (team leaders, site engineers, approvers). Opens the existing sheet for the chosen day so it can be corrected; locked once that day's DPR is approved. The DPR form fills its manpower from it.
- `app/stock/` — stock on hand per project (low items flagged, latest entries), `receive.tsx` (GRN against an approved material request, each line defaults to what is pending, challan photo) and `issue.tsx` (items in stock only, issued to a contractor or gang, optional activity). Store manager, site engineers and approvers; online only, since pending and on-hand quantities are checked on the server.
- `app/submissions.tsx` — my submissions, segmented by type.
- `app/outbox.tsx` and `src/offline/` — offline entry: new submissions and attendance sheets made without a connection are saved in a SQLite outbox (photos copied to the documents folder) and sent automatically on reconnect; failed ones can be retried or discarded. `useFetch(..., { cacheKey })` keeps the last loaded lists on the phone.
- `src/theme.ts`, `src/components/` — small design system (Screen, Card, Button, Input, Select, DatePicker, Chips, StatusBadge, PhotoPicker, states).
- `src/api/` — fetch client with bearer token (401 signs the user out), `useApi` / `useFetch` hooks.
- `src/auth/AuthContext.tsx` — token in `expo-secure-store` (localStorage on web).

## Checks

```bash
npx tsc --noEmit                       # type check
npx expo export --platform android     # Metro bundle (catches module/import errors)
npx expo export --platform web         # optional second signal
```
