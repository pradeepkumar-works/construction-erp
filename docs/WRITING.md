# Writing for Nirmaan

How the web app and the phone app word things. Short on purpose: when in doubt, write what a site engineer would say.

## Names and case

- **Sentence case** for everything: page titles, sidebar links, tabs, buttons, column heads, form labels, menu items
  ("Staff and leave", "Payroll inputs", "New purchase order"). Capitals only for names and abbreviations (GST, RA bill,
  DPR, Tally, Odisha). Write "and", not "&".
- **One name per module**, the same in the sidebar (the navigation tree, `packages/shared/src/navigation.ts`), the page's `PageHeader` title (and so the
  browser tab), the breadcrumb and Search. Pick the shorter one that is still clear: "Daily reports", not "Daily progress
  reports". A record's own heading names the record ("PO-2026-0012 · Tata Steel"), and its kind sits in the breadcrumb.
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
