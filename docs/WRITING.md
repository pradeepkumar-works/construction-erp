# Writing for Nirmaan

How the web app and the phone app word things. Short on purpose: when in doubt, write what a site engineer would say.

## Names and case

- **Sentence case** for everything: page titles, sidebar links, tabs, buttons, column heads, form labels, menu items
  ("Staff and leave", "Payroll inputs", "New purchase order"). Capitals only for names and abbreviations (GST, RA bill,
  DPR, Tally, Odisha). Write "and", not "&".
- **Capitals** stay on abbreviations, which are written all in capitals (BOQ, DPR, GRN, GST, LD, MB, NCR, PO, RA bill,
  RFI, TDS, WO, QA/QC, O&M), and on these names: Aadhaar, Connector, Excel, Meta Cloud API, MS Project, Nirmaan, Odisha, Tally,
  WhatsApp, ZKTeco, eSSL.
- **One name per module**, the same in the sidebar (the navigation tree, `packages/shared/src/navigation.ts`), the page's `PageHeader` title (and so the
  browser tab), the breadcrumb and Search. Pick the shorter one that is still clear: "Daily reports", not "Daily progress
  reports". A record's own heading names the record ("PO-2026-0012 · Tata Steel"), and its kind sits in the breadcrumb.
  The names to use are in [Words we use](#words-we-use).

## Words we use

One name for each thing, in the menu, page titles, tabs, buttons, column heads, Search, the phone and its Hindi. The
last column's words stay out of every label; an old name may stay as a Search keyword. `apps/web/scripts/copy-check.ts`
(CI) holds the shared labels and the menu to this table and to the rules above.

| Thing | Name | Not |
| --- | --- | --- |
| The site's ask for material | Indent, Indents (button "New indent") | Material request |
| The day's site report | Daily report, Daily reports (DPR in tight columns) | Daily progress report, Site diary |
| Quantity done on one activity | Progress entry, Progress entries | Daily progress |
| One measurement sheet, the module | Measurement, Measurement book | Measurement (MB) |
| An entry sent for approval | Waiting for approval | Pending approval, Awaiting approval |
| An entry sent back by the reviewer | Changes requested (button "Request changes") | Sent back for changes |
| An entry refused | Rejected | Turned down |
| The party you buy from | Vendor, Vendors ("supplier" only in the supplier portal) | Suppliers, Return to supplier |
| A vendor's priced reply | Quotation; choosing the lowest is "Finalise L1" | – |
| A machine's daily record | Machinery log, Machinery logs | Daily logs, Machine logs, Log machinery |
| The machines module | Machinery | Plant and machinery |
| Delays and risks | Delays and risks; one entry is a "Delay or risk" | Delay / risk, Hindrances |
| Staff records | Staff | Employees |
| The tenant | Company | Organisation, Organization |
| The quality module | Quality | Quality (QA/QC) |
| The drawings register | Drawings and documents (module "Design and drawings") | – |
| Deduction on each RA bill | Security deposit (retention only where the contract keeps it apart) | – |
| Money from the client | Money received (button "Record money received") | Receipts from clients |
| Money to a vendor | Payment (button "Record payment") | – |
| Contract completion | Completion date | End date |
| Past due | Overdue | – |
| A record's history card | History | – |
| Retry | Try again | Retry |
| The launcher | Home | All modules |
| No value in a cell | – (`NO_VALUE` in `format.ts`) | – |
| A menu path in help text | › ("Accounts › Tally export") | – |
- **Status words come from `@erp/shared`** (`SUBMISSION_STATUS_LABELS` and the other `…_LABELS`), so the web and the phone
  say the same thing. Never type a status word into a page; if a label reads wrong, change it in `packages/shared` for both
  apps (and its Hindi in `apps/mobile/src/i18n/hi/`).

## Buttons

- **New {thing}** for a record you make: New purchase order, New RA bill, New worker, New daily report.
- **Record {thing}** for something that already happened elsewhere: Record payment, Record money received, Record vendor
  bill, Record letter, Record test, Record delay. **Report** for incidents, near misses, breakdowns and defects.
  **Request** or **Apply for** for an ask: Request inspection, Request permit, Apply for leave.
- **Add** only for a line inside a form (Add line, Add item), never for a whole record.
- A page has one primary button, its own New. The header's New is secondary.
- A form's title repeats its button ("New worker"); its submit button says Save, or the step it takes (Submit, Approve).

## Messages

- **Errors say what to do**: "Choose the project", "Enter the quantity passed", "A GSTIN is 15 characters, e.g.
  27ABCDE1234F1Z5". Never only "Required" or "Invalid".
- Empty lists say what will appear and how to add the first one, naming the button: "No work orders yet. Give work to a
  subcontractor with New work order."
- **No internal IDs** in front of people: show the record's number (PO-2026-0012) or name, never a database id, an enum
  key (`CHANGES_REQUESTED`) or a field name.
- Use the ellipsis character `…`, never three dots `...`.

## Numbers, money and dates

- Format through `apps/web/src/lib/format.ts` (`formatINR`, `formatINRCompact`, `formatQty`, `formatPct`, `formatDate`),
  never `toLocaleString` or a dayjs format in a component. Indian grouping (₹ 18,65,00,000; ₹ 1.87 Cr; ₹ 12.50 L), dates
  as 21 Oct 2026.
- `₹` stays with its figure: `formatINR` puts a no-break space after it (`RUPEE`). Don't type "₹ " by hand.

## Translation and language

- The page is `<html lang="en-IN">`.
- Mark text a browser's translation must not touch with `translate="no"`: record numbers, codes and GSTINs (the `mono`
  class carries it), people's and companies' names, and the brand name. `RecordLink` and record headers already do.
- Printed documents (tax invoice, DPR and progress report print-outs) and file formats with a fixed layout (the GSTR
  export columns) keep the headings their form requires.
