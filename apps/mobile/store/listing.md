# Nirmaan site app: store listing

Copy for Google Play and the App Store, written to the stores' length limits (counts in brackets). Images
(feature graphic, 512 px icon, five 1080 × 1920 phone screenshots) are in the project's shared folder under
`growth/store/`; they were rendered from the demo data and can be regenerated from the running app.

Before the first upload, set the final app id in `app.json` (it is still `com.demo.siteapp`, and the store
never lets it change) and point `EXPO_PUBLIC_API_URL` in `eas.json` at the production API.

## Google Play

**App name** (28 / 30)
Nirmaan: Site Progress & DPR

**Short description** (78 / 80)
Daily progress, DPRs, materials and approvals from site. Works without signal.

**Full description** (under 4,000)

Nirmaan is the site app of the Nirmaan construction ERP. Site engineers, team leaders and store keepers
send the day's work from the site, and project managers approve it from wherever they are. The office sees
the same numbers the same day.

WHAT YOU CAN DO ON SITE
• Record progress against the project's activities and BOQ, with location or chainage, manpower and photos
• Send the daily progress report (DPR): weather, work done, manpower from the day's attendance, machinery,
  material received, tests, safety and hindrances
• Mark attendance by contractor and trade
• Raise material requests, receive material against them and issue it to site
• Log machinery hours, idle time, breakdowns and diesel
• Enter site expenses with the bill photo and GST
• Record measurements (nos × L × B × D) for the measurement book
• Raise delays and risks as they happen

WORKS WITHOUT SIGNAL
Entries and photos are saved on the phone when there is no network and are sent on their own when the
connection is back. Nothing has to be entered twice. Photos are resized before sending, so they go through
on a weak connection.

APPROVALS IN YOUR POCKET
Project managers get a notification for each new submission, see the photos and quantities, and approve,
reject or send it back with a note. Every step is kept in the audit trail.

FOR CONTRACTORS
Built for road, building and water supply projects, with standard activity lists for each. Your company's
data is kept separate from every other company's, and each person sees only the projects they work on.

Nirmaan needs an account from your company. Ask your administrator for an invite, or try the demo with the
accounts shown on the sign-in screen.

**Category** Business
**Tags** Construction, Project management, Productivity
**Contact email** (yours)
**Privacy policy URL** required before publishing (see "Still needed" below)

**Data safety answers** (from what the app does today)
- Collected: name and email (account), photos you attach, the entries you submit. Used for app functionality
  only. Not sold, not shared with third parties, no ads.
- Data is encrypted in transit (HTTPS). Users can ask their company administrator to delete their account.
- Camera and photo library: only when you attach a photo. No location, contacts or microphone access.

## App Store

**Name** (12 / 30) Nirmaan Site
**Subtitle** (27 / 30) DPR, progress and approvals
**Keywords** (94 / 100)
construction,site,DPR,BOQ,progress,contractor,ERP,measurement,material,approval,civil,engineer
**Promotional text** (under 170)
Send the day's progress, DPR and material needs from site, even without signal. Your project manager
approves from anywhere.
**Description**: use the Google Play full description above.
**Category** Business (secondary: Productivity)
**Age rating** 4+
**Screenshots**: App Store wants 1290 × 2796 (6.7") or 1320 × 2868 (6.9"). The Play screenshots can be
re-rendered at that size; ask and they will be made.

## Still needed from you
- A Google Play developer account (one-time USD 25) and, for iOS, an Apple Developer account (USD 99 a year).
- A privacy policy page. The landing page can host one at `/privacy` once you confirm the company name and
  contact address it should name.
- A support email address for both listings.
- The final app id (for example `in.nirmaan.site`).
