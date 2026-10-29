# Deployment

Current demo deployment (October 2026):

| Piece | Where | URL / id |
|-------|-------|----------|
| Database | Neon Postgres 16, Singapore (`aws-ap-southeast-1`) | project `construction-erp` (`lucky-wind-88524683`), database `construction_erp` |
| API | Vercel project `construction-erp-api` (NestJS preset, region `sin1`) | https://construction-erp-api-pradeep15.vercel.app/api (docs at `/api/docs`) |
| Web ERP | Vercel project `construction-erp-web` (Next.js) | https://construction-erp-web-pradeep15.vercel.app |
| Mobile | Expo Go / EAS build, pointed at the API URL above | not hosted |
| Photos and drawings | stored in Postgres (`Attachment.data`) because Vercel functions have no disk | switch to Vercel Blob by setting `BLOB_READ_WRITE_TOKEN`. Uploads pass through the API either way, and Vercel caps a request at about 4.5 MB, so a larger drawing PDF must be reduced (or the API hosted elsewhere) |

Railway was the first choice for the API (Dockerfile and `railway.json` are in `apps/api`) but the
Railway account's trial has expired; the API runs on Vercel instead until a Railway plan is chosen.

## Environment variables

API (`apps/api`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string the API runs with (Neon direct, non-pooled host). In production use the `erp_runtime` role so row-level security applies (see "Database roles" below). |
| `MIGRATE_DATABASE_URL` | the owner's connection string; the build runs `prisma migrate deploy` and the seed with it. Unset = `DATABASE_URL` is used for both. |
| `JWT_SECRET` | long random string; rotate to log everyone out |
| `JWT_EXPIRES_IN` | e.g. `7d`. A password change, reset or admin-set password ends the sessions signed in before it. |
| `STORAGE_MODE` | `db` on serverless hosts; unset = local disk; `BLOB_READ_WRITE_TOKEN` set = Vercel Blob |
| `SEED_ON_BUILD` | `true` runs the demo seed during the Vercel build (idempotent: refreshes users, never duplicates projects). Set to `false` once real client data exists. |
| `SEED_TOWN_ON_BUILD` | with `SEED_ON_BUILD` off, `true` adds only the Devgarh demo project (WS-2026-04: work breakdown, DPRs, pipe network) through `prisma/seed-town.ts`, writing nothing outside it; idempotent. Set it for one deploy, then remove it. |
| `SEED_GROUP_ON_BUILD` | with `SEED_ON_BUILD` off, `true` adds only the demo group's companies through `prisma/seed-companies.ts` (`seed-group.ts`): Demo Infra Holdings, Demo Buildcon, Demo Design Consultants and Demo Quality Labs with their people and records, and the sisters' work order and bills in the demo company. Idempotent; existing sign-ins keep their passwords. Set it for one deploy, then set it back to `false`. |
| `CORS_ORIGINS` | optional comma-separated allow-list of browser origins; unset = any origin. Also the only sites that may frame a stored file (the web's document viewer); set it in production. |
| `UPLOAD_DIR` | disk mode only |
| `CRON_SECRET` | long random string; Vercel Cron sends it as `Authorization: Bearer` to the daily notification jobs. Jobs are disabled when unset. |
| `INTEGRATION_KEY` | long random passphrase that seals the keys and passwords saved on Admin › Connections (AES-256-GCM, item 139). Without it a connection that needs one cannot be saved; web addresses and Connectors work either way. Changing it makes the saved keys unreadable, so each has to be entered again. |
| `NOTIFICATION_TIMEZONE` | IANA zone for "today" in the DPR reminder and digest (default `Asia/Kolkata`) |
| `MAIL_API_KEY` | email through the Cogitrex mail service (`POST https://communication.cogitrex.com/mail/send`): approval digest, user invites and password resets, supplier enquiries and approved purchase orders to vendors. The key is the sending mailbox's API key from the portal (Mailboxes → `notifications@cogitrex.com`). `EMAIL_FROM` is then the mailbox address (default `notifications@cogitrex.com`; the display name is set on the mailbox). `MAIL_API_URL` overrides the service URL. `GET /api/health` shows which provider is live in `email`: `mail-api`, `resend`, `log` (no key) or `disabled`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | email through Resend instead, used when `MAIL_API_KEY` is unset. `EMAIL_FROM` must be a verified sender/domain in Resend. With neither key nothing is emailed (the digest is logged; invite links are shown to the admin to share; "Forgot password" tells users to ask their admin). `EMAIL_PROVIDER` (`mail-api`, `resend` or `log`) picks one when both keys are set. |
| `WEB_URL` | web ERP URL used for links in emails (digest, invites, password resets, supplier enquiry links). Password-reset emails need it (or `CORS_ORIGINS`). |
| `TENANT_RLS` | `off` stops the API setting the organisation for Postgres row-level security (kill switch; the policies then allow everything). Unset = on. `GET /api/health` shows `tenantGuard`: `enforced`, `off`, or `bypassed` when the database role has BYPASSRLS or is a superuser (then connect as `erp_runtime`, see "Database roles"). To remove the policies: `psql "$DATABASE_URL" -f apps/api/prisma/rls-rollback.sql`. |
| `ORG_SIGNUP` | `open` lets new companies create an organisation at `/signup`; unset = closed |
| `DEMO_LOGIN` | `false` hides the demo accounts on the web and phone sign-in screens (set it on a customer's own server); unset = shown, as on the demo site |
| `EXPO_ACCESS_TOKEN` | optional; only if push security is enforced on the Expo project |
| `NOTIFICATION_JOBS_INPROCESS`, `DPR_REMINDER_TIME`, `APPROVAL_DIGEST_TIME`, `MORNING_BRIEF_TIME` | run the jobs from a timer inside the API (Docker / Railway) instead of Vercel Cron; times are `HH:mm` in `NOTIFICATION_TIMEZONE` |
| `WATI_API_ENDPOINT`, `WATI_ACCESS_TOKEN` | WhatsApp alerts through WATI, see "WhatsApp and SMS" below: the API endpoint (`https://live-mt-server.wati.io/<account number>`) and access token from WATI's API Docs page. `WATI_CHANNEL_NUMBER` is only needed when the WATI account has more than one WhatsApp number. WATI is used when both it and the Cloud API keys are set. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Alternative to WATI: WhatsApp through Meta's Cloud API directly. `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`), `WHATSAPP_TEMPLATE_PREFIX` (default `nirmaan_`) and `WHATSAPP_API_URL` (default `https://graph.facebook.com/v21.0`) are optional. |
| `WHATSAPP_APPROVED_TEMPLATES` | comma-separated templates Meta has approved that are newer than the first eight, e.g. `MORNING_BRIEF`. Until a template is listed it goes by email and the bell only. |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | WhatsApp entries (AI item 120) through the Cloud API: the verify token you type when adding the webhook `https://<api>/api/whatsapp/inbound` in Meta's app dashboard, and the app's secret (App settings, Basic) that signs each delivery. Subscribe the webhook to `messages`. |
| `WATI_WEBHOOK_SECRET` | WhatsApp entries through WATI: any long random string; in WATI, Webhooks, add `https://<api>/api/whatsapp/inbound/wati/<the secret>` for "Message received". |
| `WHATSAPP_DISPLAY_NUMBER` | The company number shown on the WhatsApp entries page, e.g. `+91 98765 43210`. |
| `TRANSCRIBE_PROVIDER` | Voice notes for WhatsApp entries: `openrouter` (an audio model, `TRANSCRIBE_MODEL`, default `google/gemini-2.5-flash`, with `OPENROUTER_API_KEY`) or `sarvam` (`SARVAM_API_KEY`, model `SARVAM_STT_MODEL`, default `saarika:v2.5`; best for Hindi and Hinglish). Unset: voice notes get a "please type it" reply. |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_IDS` | SMS alerts through MSG91 with DLT-registered templates: `MSG91_TEMPLATE_IDS=APPROVAL_REQUEST=<id>,SENT_BACK=<id>,DPR_REMINDER=<id>,APPROVAL_DIGEST=<id>,TEST_DUE=<id>,BILLS_DUE=<id>,INVITE=<id>,TEST=<id>`. A message without an id is not sent by SMS. `MSG91_API_URL` overrides the service URL. |
| `PUSH_DISABLED`, `EMAIL_DISABLED`, `MESSAGING_DISABLED` | `true` switches a channel off (useful on preview deployments); `MESSAGING_DISABLED` stops WhatsApp and SMS |
| `PLATFORM_ADMIN_EMAILS` | comma-separated emails of staff who get the console at `/platform` (all companies, suspend, read-only support views). Use staff's own accounts, never a demo account: demo passwords are public. Unset = nobody. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `BILLING_PRICE`, `BILLING_SELLER_NAME`, `BILLING_SELLER_GSTIN`, `BILLING_SELLER_ADDRESS` | Plans and billing, see "Billing" below. Billing is off (nobody is charged or restricted) until the key id and secret, the price and the seller's name and GSTIN are all set. |
| `OPENROUTER_API_KEY` | Ask Nirmaan, the AI assistant: an OpenRouter key from openrouter.ai/settings/keys (OpenRouter's Anthropic-compatible Messages API, for Claude and other models, only on providers that do not keep or train on prompts). `ANTHROPIC_API_KEY` (console.anthropic.com) works instead for Claude direct; with both set OpenRouter is used unless `AI_PROVIDER=anthropic`. Without either the assistant is off for everyone (admins see "not set up"). Each company also switches it on under Admin > Ask Nirmaan (the DEMO company is on). Answers stream for up to about 2.5 minutes, so the API's Vercel functions need Fluid compute (the default for new projects, 300 s). |
| `AI_MODEL`, `AI_EFFORT` | the model (default `deepseek/deepseek-v4.1-flash` on OpenRouter, `claude-opus-5-5` on Anthropic direct; on OpenRouter `claude-sonnet-5-5` becomes `anthropic/claude-sonnet-5.5`, and a full OpenRouter slug is used as is; changing it away from or back to DeepSeek means updating the provider named on the privacy page) and how hard it thinks (`low`, `medium` default, `high`) |
| `AI_EVAL_MODELS` | comma-separated models a question may name, only to compare models with `scripts/ai-eval.ts` (`AI_EVAL_MODEL=…`) without redeploying, e.g. `claude-sonnet-5-5,claude-haiku-5-5,google/gemini-3.8-flash`. Leave unset otherwise. |
| `AI_DEFAULT_MONTHLY_CAP_INR`, `AI_DAILY_QUESTIONS`, `AI_USD_INR` | a company's monthly allowance unless its admin sets one (default 5000), questions per person per day (default 60), and the rupee rate for the cost estimate (default 88) |
| `AI_DISABLED`, `AI_PROVIDER` | `AI_DISABLED=true` switches the assistant off everywhere (kill switch). `AI_PROVIDER=fake` uses a scripted stand-in instead of the model: for CI and local work only, never production. `AI_PROVIDER=openrouter` or `anthropic` picks the gateway when both keys are set. |
| `PROTECTED_ORG_CODES` | comma-separated organisation codes that can never be deleted (default `DEMO`, the public demo company) |

Web (`apps/web`): `NEXT_PUBLIC_API_URL`, e.g. `https://construction-erp-api-pradeep15.vercel.app/api`, and
`NEXT_PUBLIC_PRIVACY_EMAIL`, the address the `/privacy` page gives for questions (without it the page sends people to
their company's admin).

Mobile (`apps/mobile`): `EXPO_PUBLIC_API_URL`, same value. For push notifications the app needs an
EAS project id (`eas init` writes `extra.eas.projectId` into `app.json`) and a development or
production build; Expo Go on Android cannot receive remote push.

## WhatsApp and SMS

Users switch alerts on for themselves (Notifications → WhatsApp & SMS on the web, Profile in the site app); nothing
goes to anyone who has not. Approval requests, send-backs (rejected or changes requested), the DPR reminder, the
morning approvals digest, test readings falling due and payments due (admin, management and accounts, when an approved
bill falls due within 3 days) go on WhatsApp first and by SMS when WhatsApp is off, not set up or fails; invites go to
the phone the admin entered. Without the keys below nothing is sent and each message is logged as "Not set up" with
its text (Notifications → WhatsApp & SMS log, for admins and management).

WhatsApp through WATI (the default; WATI bills its plan plus Meta's per-message charge):
1. In WATI, connect the company's WhatsApp Business number (WATI walks through Meta's business verification).
2. Open **API Docs** in WATI's left menu. Copy the **API Endpoint** (`https://live-mt-server.wati.io/<number>`) into
   `WATI_API_ENDPOINT` and the **Access Token** into `WATI_ACCESS_TOKEN` (with or without the leading `Bearer`).
3. Under Broadcast → Template Messages, create these templates, category **Utility**, language **English**, with the
   exact names and bodies below (the variables are WATI's named variables), and submit each for approval. Approval
   by Meta usually takes minutes to a day. The text is `watiTemplateText()` in `packages/shared/src/messaging.ts`.

| Template name | Body |
|---|---|
| `nirmaan_approval_request` | Approval needed: {{item}} on {{project}}, submitted by {{submitted_by}}. Open {{link}} to review it in Nirmaan. |
| `nirmaan_sent_back` | Your {{item}} on {{project}} was {{outcome}} by {{reviewer}}. Note: {{note}}. Open {{link}} to see it in Nirmaan. |
| `nirmaan_dpr_reminder` | Reminder: today's daily progress report for {{project}} has not been submitted. Please submit it at {{link}} before end of day. |
| `nirmaan_approval_digest` | Good morning {{name}}. {{count}} waiting for your approval: {{summary}}. Open {{link}} to review them in Nirmaan. |
| `nirmaan_test_due` | Test reminder: the {{reading}} result of {{test}} at {{project}} is {{due}}. Enter it at {{link}} once tested. |
| `nirmaan_bills_due` | Payments due: {{due_soon}} in the next 3 days, {{overdue}} overdue. See the due list at {{link}} in Nirmaan. |
| `nirmaan_invite` | You have been invited to {{company}} on Nirmaan. Choose a password to sign in: {{link}} The link works once and expires in {{expires_in}}. |
| `nirmaan_test` | Test message from Nirmaan: your alerts on this number are working. |

Until a template is approved, WATI refuses that message and the log shows it as Failed with WATI's reason.

WhatsApp through Meta's Cloud API directly (instead of WATI):
1. Create a Meta Business account and, in Meta for Developers, an app with the WhatsApp product; add and verify the
   business phone number. Copy its **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID`.
2. Create a system user with a permanent access token (`whatsapp_business_messaging` permission) and put it in
   `WHATSAPP_ACCESS_TOKEN`.
3. Submit the same templates in English (`en`) with `{{1}}`, `{{2}}`… in place of the named variables
   (`MESSAGE_TEMPLATE_TEXT`). The test button uses Meta's own `hello_world`.

The morning brief (`MORNING_BRIEF`) is a newer template: submit it the same way, then add it to
`WHATSAPP_APPROVED_TEMPLATES` once Meta approves it.

SMS (India): register the sender ID and the same eight texts on a DLT portal (each parameter as `{#var#}`, at most
30 characters; links whitelisted), add them as MSG91 templates with variables `var1`, `var2`…, then set
`MSG91_AUTH_KEY` and `MSG91_TEMPLATE_IDS`.

Each user's **Send a test** button shows whether a channel works end to end.

## How a deploy works

- **API on Vercel**: root directory `apps/api`; `apps/api/vercel.json` runs `vercel-build.sh`, which
  builds `packages/shared`, runs `prisma generate`, `prisma migrate deploy` (applies any new migration
  in `apps/api/prisma/migrations`), optionally seeds, then `nest build`. Vercel serves `dist/main.js`
  as a function.
- **Scheduled jobs on Vercel**: `apps/api/vercel.json` declares two crons, `03:30 UTC` (09:00 IST)
  for the approvals digest and `11:30 UTC` (17:00 IST) for the DPR reminder. Vercel calls
  `GET /api/notifications/jobs/...` with `Authorization: Bearer $CRON_SECRET`; set `CRON_SECRET` in
  the project's environment variables (Hobby plans allow once-a-day schedules, which these are). The digest run
  also sends the quality test-due reminders and writes and sends the morning briefs (and on Mondays the weekly
  narratives) and reads newly filed PDFs for Ask the contract, so no third cron is needed; `jobs/briefs` writes the
  briefs alone and `jobs/read-documents` reads PDFs alone. Reading PDFs needs Node 22 or later on the API project.
  Approval reminders and escalation (`jobs/approval-escalation`) run inside both daily crons; for hourly reminders
  point an external hourly cron (any uptime or cron service) at that endpoint with the same header, or on a host that
  keeps the API running set `NOTIFICATION_JOBS_INPROCESS=true`, which runs it on the hour.
  Run a job by hand with `curl -H "Authorization: Bearer $CRON_SECRET" $API_URL/notifications/jobs/dpr-reminder`.
- **Web on Vercel**: root directory `apps/web`; build command builds `packages/shared` then `next build`.
- **Git auto-deploy**: both Vercel projects are linked to `pradeepkumar-works/construction-erp`.
  Every push to the production branch (`claude/modest-brown-emrt4b` today; change it in each
  project's Settings → Git when you adopt `main`) builds and deploys automatically. Other branches
  get preview deployments.

## Database

- Schema is managed by Prisma migrations in `apps/api/prisma/migrations`. Never edit the Neon schema
  by hand; add a migration locally (`pnpm db:migrate`) and deploy.
- **Database roles.** The owner role (`erp_app` on Neon, created with `BYPASSRLS`) runs migrations and the
  seed and skips row-level security. The API itself should connect as `erp_runtime`, which migration
  `20261014073000_runtime_role` creates without a login and grants row read/write on every table (and on
  tables later migrations create); it has no `BYPASSRLS` and cannot change the schema. To switch an
  environment over, once:
  1. In the Neon SQL Editor (database `construction_erp`) run
     `ALTER ROLE erp_runtime LOGIN PASSWORD '<a long random password>';`
  2. On the Vercel API project add `MIGRATE_DATABASE_URL` with the current `DATABASE_URL` value, then change
     `DATABASE_URL` to the same string with `erp_app:<owner password>` replaced by `erp_runtime:<new password>`.
  3. Redeploy and check that `GET /api/health` shows `"tenantGuard":"enforced"`. To go back, set
     `DATABASE_URL` to the owner string again (or `TENANT_RLS=off`) and redeploy.
- Neon's free tier scales the compute to zero when idle; the first request after a pause takes a
  second or two. Fine for a demo.
- Take a Neon snapshot or branch before loading real client data.

## Moving the API to Railway later

1. Choose a Railway plan, create a project and a service from the GitHub repo with Dockerfile path
   `apps/api/Dockerfile` (build context is the repo root).
2. Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`; attach a volume at `/app/uploads` or set
   `BLOB_READ_WRITE_TOKEN` / keep `STORAGE_MODE=db`.
3. Generate a domain, then point `NEXT_PUBLIC_API_URL` (Vercel web) and `EXPO_PUBLIC_API_URL`
   (mobile) at it.

## Billing

Companies get a free trial, then pay a month or a year ahead through Razorpay; each payment gets a GST tax invoice
under Admin > Billing. When the trial or paid period ends, the company is read-only until it pays. To switch it on,
set these on the API project and redeploy:

| Variable | Value |
| --- | --- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard > Account & Settings > API Keys (test keys first, `rzp_test_...`) |
| `RAZORPAY_WEBHOOK_SECRET` | Dashboard > Webhooks: add `https://<api host>/api/billing/webhook` with events `payment.captured` and `order.paid`, and the secret you choose there. Records payments whose browser closed before returning. |
| `BILLING_PRICE` | rupees per unit per month before GST, e.g. `1999` |
| `BILLING_UNIT` | `project` (default: projects in Active status, unlimited users) or `user` (active staff, guests free) |
| `BILLING_TRIAL_DAYS` | default `30`; existing companies get a full trial from the day billing is switched on |
| `BILLING_SELLER_NAME`, `BILLING_SELLER_GSTIN`, `BILLING_SELLER_ADDRESS` | the legal name, GSTIN and address printed on invoices; the GSTIN's state decides CGST + SGST or IGST |
| `BILLING_SAC` | SAC code on invoices, default `998314`; confirm with your CA |
| `BILLING_INVOICE_PREFIX` | default `NIR`, giving invoice numbers like `NIR2627-00001` (per financial year) |
| `BILLING_EXEMPT_ORG_CODES` | comma-separated organisation codes never charged, default `DEMO`; add your own company's code |
| `BILLING_AI_TRIAL_INR` | Ask Nirmaan included in the free trial, rupees a month, default `1000` |
| `BILLING_AI_INR_PER_UNIT` | Ask Nirmaan included in the price once paid, rupees a month per billed unit, default `150`; a company's own monthly allowance can be lower, never higher |

Staff can move a company's trial end in the platform console (for a pilot, or to end it).

