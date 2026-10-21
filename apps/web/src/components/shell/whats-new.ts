/** Release notes for Help > What's new, newest first. Add an entry when a change people will notice ships. */
export interface WhatsNew {
  /** Stable id; the newest one unseen puts a dot on the Help button. */
  id: string;
  date: string;
  title: string;
  points: string[];
}

export const WHATS_NEW: WhatsNew[] = [
  {
    id: '2026-10-bills-without-po',
    date: '2026-10-28',
    title: 'Hire, workshop and service bills, and debit notes',
    points: [
      "Record vendor bill now offers bills without a purchase order: a hired machine's month, filled in from its approved logs at the agreed rate, with any minimum hours and the diesel we issued recovered; a workshop's bill for closed job cards; and other services such as transport or testing, booked to a cost head.",
      'What does not match the logs or job cards is flagged for the approver, a machine and month can be billed only once, and billed logs and job cards show the bill they are on.',
      'Raise a debit note on an approved vendor or subcontractor bill for short supply, excess billing, a rate difference or material rejected or returned (also from the GRN). It comes off what is payable, reverses the input GST and goes to Tally as a debit note. Payables has a Debit notes tab.',
      "Machines have hire terms (minimum hours, who fuels it, operator), and the cost view takes a machine's hire bill in place of its logged hours.",
    ],
  },
  {
    id: '2026-10-payment-requests',
    date: '2026-10-27',
    title: 'Payment requests and advances',
    points: [
      'Ask for a bill to be paid, or an advance released on a purchase order or work order, with Request payment on the bill or order. The request goes to approval like any other entry, with rupee limits in Approval rules.',
      'Accounts pays against the approved request from Payables, which has a Payment requests tab, and is told as soon as one is approved. An admin can make every payment need an approved request.',
      "A vendor bill takes the advance paid on its PO off what is payable, and a subcontractor bill recovers what was actually paid on the work order. Payables shows each vendor's advance not yet adjusted.",
      'Advances go to Tally as payment vouchers against the party, and approvers can decide requests from the phone.',
    ],
  },
  {
    id: '2026-10-rfi-register',
    date: '2026-10-26',
    title: 'RFI register',
    points: [
      'Documents has an RFIs tab: questions to the client or consultant about a drawing or the work, with the date the answer is needed and how late it is.',
      "The client's engineer or consultant sees the project's RFIs in their portal and answers them there; you are told when they do. An answer that came by letter can be recorded too.",
      'When an answer changes the work, raise a variation or record a delay from the RFI, and it stays linked.',
      'Raise an RFI from the phone with a photo of what you found, even without signal, in English or Hindi.',
    ],
  },
  {
    id: '2026-10-ppe-register',
    date: '2026-10-25',
    title: 'PPE register',
    points: [
      'Safety has a PPE tab: every worker at a project against the kit it requires, with who is on site today without it at the top.',
      'Issue a helmet, shoes, jacket or any other item to one worker or a whole gang at once. Each item gets a replace-by date, and issuing it again replaces the old one.',
      'Record kit handed back or lost; lost items are marked to recover from the labour contractor, with totals per contractor.',
      'Site staff can issue PPE from the phone, even without signal, in English or Hindi.',
    ],
  },
  {
    id: '2026-10-material-reconciliation',
    date: '2026-10-24',
    title: 'Material reconciliation',
    points: [
      'A project\'s Materials now has Reconciliation: how much cement, steel or any other item the approved work should have used, against what the store issued to site less what came back.',
      'The QS sets the norms, such as 8.2 bags of cement per cum of M25, with the wastage allowed. Items used beyond the allowance or well below theoretical are flagged, and approvers see the excess in rupees.',
      'Pick any period, open an item to see which BOQ items it went into, and export the whole reconciliation to Excel.',
    ],
  },
  {
    id: '2026-10-ai-controls',
    date: '2026-10-23',
    title: 'Ask Nirmaan: who uses it and what it costs',
    points: [
      'Admin > Ask Nirmaan shows each month by person (questions, documents read, briefs) and by feature, and you can look back over the last year.',
      'Admins can choose which roles may use Ask Nirmaan. Admins always can.',
      'A conversation log lets admins read any conversation and export them to Excel. Opening or exporting one is recorded in the audit log, and Ask Nirmaan tells people admins can read conversations.',
      'Ask Nirmaan is included in the price: an allowance in the free trial, then an amount per active project each month, shown under Admin > Subscription. If the trial or subscription ends, Ask Nirmaan pauses with the rest of the changes.',
    ],
  },
  {
    id: '2026-10-navigation',
    date: '2026-10-22',
    title: 'A shorter sidebar, in plain words',
    points: [
      'The sidebar shows the pages your role works with. A section you close stays closed for you, and the section of the page you are on opens by itself.',
      'Recent pages and records are in Search: press Ctrl K (⌘K on a Mac) and the ones you opened last come first, before you type.',
      'Each page has one name, the same in the sidebar, its heading, the browser tab and Search, such as Daily reports, Staff and leave and Payroll inputs. The first link is Home, and the subscription page under Admin is Subscription.',
      "A page's own New button is the one to press; New in the header starts an entry from any page. Buttons say New for a record you make, and Record, Report or Request for something that happened or that you ask for.",
    ],
  },
  {
    id: '2026-10-undo',
    date: '2026-10-22',
    title: 'Undo, and clearer messages',
    points: [
      'Deleting asks once, naming what goes, with a red Delete. It waits until it is done and says so there if it could not be deleted.',
      'After deleting a holiday, unit, client, vendor, worker, item, quotation, milestone, driver, checklist, close-out line or saved view, Undo brings it back for ten seconds. Ctrl Z (⌘Z on a Mac) does the same. Taking someone off a project team can be undone too.',
      'Saving a new entry says what was made, with View to open it.',
      'Approving shows the entry as approved straight away, one or many at once. If it does not go through, it goes back to waiting and the message says why.',
      'When you are offline or something goes wrong on our side, the message says so in plain words, with Retry. What you typed in a form stays there, with Try again.',
    ],
  },
  {
    id: '2026-10-photo-checks',
    date: '2026-10-22',
    title: 'Ask Nirmaan looks at site photos',
    points: [
      'Photos on a DPR, a progress entry, a safety incident or a snag get a short caption from Ask Nirmaan, under the photos.',
      'It flags what it is sure of: workers without helmets or harnesses, an open edge without a barricade, a scaffold that looks unsafe, or a photo of other work than the entry says. Flags are advice and never hold up a submission.',
      "The project's safety officer can switch the flags off for a project; captions still show.",
      'Reporting a snag, Describe from photo fills in what is wrong, the details, where and the trade from its photo. Check it, then save.',
    ],
  },
  {
    id: '2026-10-phone-lists',
    date: '2026-10-21',
    title: 'Lists that fit a phone',
    points: [
      'On a phone each list shows a card per entry with its name, status, amount and date. Tap a card to open it.',
      'Filters sit behind a Filters button that says how many are on, and open from the bottom of the screen.',
      'On a phone Approve, Submit and the other actions of an entry stay at the bottom of the screen while you read it. Help and Ask are in your account menu.',
      'Daily reports and the other main lists fit a laptop screen without scrolling sideways. Add any column back under Columns.',
      'Payables, receivables, GST and Tally lists page, choose columns and show as cards on a phone like every other list. Their search, filters and open tab stay in the address bar, as do the tabs inside Quality, Safety, Stock and the rest, and the Approvals search.',
    ],
  },
  {
    id: '2026-10-home-five-seconds',
    date: '2026-10-21',
    title: 'Home and project overview at a glance',
    points: [
      'My work puts what waits longest first: payments overdue, deliveries late, approvals waiting longest. Cards with nothing in them fold into one line.',
      'The approvals count shows once, in My work and the sidebar; its home tile now shows progress against plan.',
      'Figures read against their plan: done against planned, billed against the contract, cost against the work done.',
      'A month with nothing in it yet says so in words, such as "No bills raised in Oct yet", instead of a red 100% fall, and an empty chart says what will appear there.',
      'A project\'s overview opens with whether it is on track or behind, and why. Removing someone from the team is in the More menu by their name, and asks first.',
    ],
  },
  {
    id: '2026-10-ask-the-contract',
    date: '2026-10-21',
    title: 'Ask the contract',
    points: [
      'Ask Nirmaan now reads the PDFs you file in Documents (contracts, specifications, method statements, reports) and your letters in and out. Ask "What is the LD cap?", "Which clause allows price variation?" or "Did we notify the client about the land delay?".',
      'Answers quote the contract\'s own words with the document and page. The link opens the PDF at that page, with the page\'s text under it to copy.',
      'Only the current revision is searched, and you see only the projects and letters your role can see. A quote that is not in the document is flagged for you to check.',
    ],
  },
  {
    id: '2026-10-speed',
    date: '2026-10-20',
    title: 'Faster pages',
    points: [
      'Lists open faster: the server reads only what a list shows, and the browser asks once before calling it instead of before every call.',
      'Resting the pointer on a record or a sidebar link fetches it ahead, so it opens at once. The next page of a list keeps the current rows on screen until it arrives.',
      'Choosing a person, vendor, client, machine or item now searches as you type, instead of loading the whole list first.',
      'Home draws in one go without pushing things down, its charts load as you scroll to them, and every page shows its outline while it loads.',
    ],
  },
  {
    id: '2026-10-targets-type',
    date: '2026-10-20',
    title: 'Easier to hit, easier to read',
    points: [
      'Every button, field and tab is at least 24 px tall, also in compact, and grows to 44 px on a touch screen.',
      'Text follows one scale with 12 px as the smallest, so compact no longer shrinks it.',
      'Figures are plain text unless something needs a look: red or amber now only marks what is late, over budget, rejected or falling.',
    ],
  },
  {
    id: '2026-10-morning-brief',
    date: '2026-10-20',
    title: 'A morning brief, and a weekly summary for the client',
    points: [
      'Ask for a morning brief on your home page: three lines on what needs you today, such as approvals waiting more than two days, a warning from your watch list or payments due this week. Each line opens the page behind it.',
      'The brief also comes by email (inside the approvals digest when you get one) and, once your alerts are on, on WhatsApp. Turn it off from the brief whenever you like.',
      'The weekly progress report now opens with a short summary of the week, written from the report\'s own figures, and the client sees it in the portal too.',
      'Admin > Ask Nirmaan shows what this month\'s spend went on: questions, bill checks, documents read, and briefs and summaries.',
    ],
  },
  {
    id: '2026-10-watch-list',
    date: '2026-10-19',
    title: 'Watch list: early warnings',
    points: [
      'A Watch list card in My work, and its own page, warns ahead of trouble: an activity whose current rate puts its finish past the baseline, a cash gap in the next eight weeks (using how long each client actually takes to pay), stock that runs out before an order could arrive, vendors late or rejected more often, machines idle or breaking down more than the month before, and sites with no DPR three days running.',
      'Each warning shows its figures and links to the records behind it. Dismiss one with a reason and it stays dismissed for everyone until its figures move on.',
      'On Mondays a notification lists what is on your watch list.',
    ],
  },
  {
    id: '2026-10-phone-ask',
    date: '2026-10-19',
    title: 'Ask Nirmaan on the phone, in Hindi',
    points: [
      'The site app has an Ask tab: type, or tap the microphone on your keyboard and speak, in Hindi, English or Hinglish. With the app in Hindi, answers come in Hindi, and their links open the record on the phone.',
      'Dictate today\'s DPR: say the work done, manpower, machines and problems, and the DPR form opens filled in to check and send, through the outbox if the signal drops.',
    ],
  },
  {
    id: '2026-10-ask-drafts',
    date: '2026-10-18',
    title: 'Ask Nirmaan fills in forms',
    points: [
      'Write "Raise an MR for 200 bags of OPC 53 for the highway by Friday", in English, Hindi or Hinglish, and Ask Nirmaan drafts the material request with items from your item master. Open form to check it and submit.',
      'The same works for a site expense, a progress entry, a DPR from rough notes, and a letter, including the covering letter for an RA bill from the bill\'s own figures.',
      'Anything to check is marked amber, such as an item not in the master or a figure not found in your records. Nothing is saved until you submit.',
    ],
  },
  {
    id: '2026-10-keyboard',
    date: '2026-10-17',
    title: 'Every page named, and the keyboard reaches everything',
    points: [
      'Browser tabs and history show each page\'s name, and a record\'s own number on its page ("PO-2026-0012 · Tata Steel · Nirmaan").',
      'In any list, Tab to the rows, move with ↑ ↓ (or J K), press Enter to open one and X to tick it. Every record opens from the keyboard.',
      'Ask Nirmaan is now Alt J (⌘J on a Mac), since Ctrl J opens the browser\'s downloads. Single-key shortcuts such as J, K and ? can be turned off in Help > Keyboard shortcuts.',
      'Home charts say what they show in a line of words and switch to a table. Dark mode no longer flashes white on load, and animations stop when your device asks for less motion.',
    ],
  },
  {
    id: '2026-10-read-documents',
    date: '2026-10-17',
    title: 'Fill a form from a photo',
    points: [
      'With Ask Nirmaan on, Fill from invoice on a new vendor bill reads a photo or PDF of the invoice: number, date, lines, taxes and the order it belongs to. The bill\'s checks run before you save.',
      'Fill from challan on a GRN reads the challan and vehicle numbers and the quantities, and Fill from title block fills a new drawing\'s number, title and revision.',
      'Each value shows where on the page it came from, anything hard to read is marked Check this, and nothing is saved until you press Save. The scan is attached to the entry.',
    ],
  },
  {
    id: '2026-10-phone-field',
    date: '2026-10-17',
    title: 'The phone app, ready for site',
    points: [
      'A new DPR, progress entry, measurement or attendance sheet is kept on the phone as you type, through a call, the camera or the phone closing the app, and leaving asks whether to keep it.',
      'A failed submit scrolls up to a list of what to fix, reads it out and buzzes; approving or sending confirms the same way.',
      'On weak signal a submit gives up after 25 seconds and goes to the outbox instead of spinning. An entry the server refused opens again with Fix and send, and the outbox shows when it last sent.',
      'The app starts in the phone\'s language (Hindi or English, switchable on the first screens), dates and times use the phone\'s own pickers, fields have stronger outlines for sunlight, and dark mode switches at once.',
    ],
  },
  {
    id: '2026-10-forms',
    date: '2026-10-17',
    title: 'Forms that keep your work',
    points: [
      'Every form now warns before throwing away changes, whether you press Esc, the browser\'s Back, Ctrl K or a link. New entries keep a draft on this device.',
      'A failed save lists what needs fixing and says how ("Choose the project"); errors from the server show on the field they belong to.',
      'Amounts show in lakhs and crores with ₹, quantities show their unit, and phones open the number keypad for them.',
      'A new DPR starts from the previous report\'s manpower and machinery, says so, and Clear empties them.',
    ],
  },
  {
    id: '2026-10-bill-checks',
    date: '2026-10-17',
    title: 'Checks before you approve a bill',
    points: [
      'Vendor bills, subcontract bills, RA bills and site expenses open with a Checks section, also in the Approvals inbox: a tick for each check that passes, and a flag for what needs a look.',
      'Flags include a rate above the PO or work order, more billed than received or measured, a BOQ item past its contract quantity, an invoice billed twice, GST that does not add up, a mistyped GSTIN and cash above ₹10,000.',
      'With Ask Nirmaan on, the line on top is written for you from the flags. Whoever approves the bill can accept a flag with a note; the bill\'s activity keeps it.',
    ],
  },
  {
    id: '2026-10-ask-summaries',
    date: '2026-10-17',
    title: 'Ask Nirmaan summarises and explains',
    points: [
      'Summarise this week on a project page: work done against plan, DPRs, labour, machines, materials, bills, new risks and what waits for a decision, with a link to every record.',
      'Explain beside a delayed activity, the Gantt\'s behind count or a cost head over budget asks why, from progress, delay entries, breakdowns, orders and bills.',
      'What changed on an RA bill after the first compares it with the one before, item by item.',
    ],
  },
  {
    id: '2026-10-ux-fixes',
    date: '2026-10-17',
    title: 'Small things, fixed',
    points: [
      'Every entry\'s Activity shows who sent it and who reviewed it, including entries made before the full history was kept.',
      'The sign-in form starts empty and offers the email keyboard on phones; demo accounts show only on the demo site.',
      'A long project name stays on one line in the header, and green status tags and team initials read clearly in both themes.',
    ],
  },
  {
    id: '2026-10-ask-nirmaan',
    date: '2026-10-17',
    title: 'Ask Nirmaan',
    points: [
      'Ask a question about your company\'s records in plain words, in English or Hindi: the Ask button in the header, Ctrl J, or type a question in Ctrl K.',
      'The answer panel opens beside the page, which narrows to make room, so you can keep working with the answer in view.',
      'Answers come only from what your role can already see, with a link to every record used. A figure the assistant could not find in those records is flagged for you to check.',
      'It only reads: it cannot create, approve, pay or delete anything. Admins switch it on or off and set a monthly allowance under Admin > Ask Nirmaan.',
    ],
  },
  {
    id: '2026-10-phone-app',
    date: '2026-10-17',
    title: 'The phone app, polished',
    points: [
      'The phone app opens on My work, the same cards as the web home: what waits for your approval, DPRs not yet sent, entries sent back to you.',
      'Dark mode under Profile > Appearance (or the same as the phone), and text that grows with the phone\'s text size without breaking the layout.',
      'On the Approvals tab, swipe a row left to approve it after a confirm, with an optional note. Lists show their outline while they load, and record actions open in a sheet from the bottom.',
    ],
  },
  {
    id: '2026-10-accessibility',
    date: '2026-10-17',
    title: 'Easier to read and to use from the keyboard',
    points: [
      'Quieter text, status tags, badges and figures are a shade darker in light mode and a shade brighter in dark mode, so they read clearly on every background.',
      'The first Tab on any page offers Skip to content, and whatever has keyboard focus now always shows a ring.',
      'Filters, search boxes and progress bars say what they are to screen readers. Help > Keyboard shortcuts lists every shortcut.',
    ],
  },
  {
    id: '2026-10-page-states',
    date: '2026-10-17',
    title: 'Clearer loading, empty and error pages',
    points: [
      'Pages and lists show their outline while they load instead of a spinner, so nothing jumps when the data arrives.',
      'An empty list says what goes there and offers the button to add the first one; a list filtered down to nothing offers Clear filters.',
      'A page you may not open, an entry that is not there, and losing the connection each get their own page with a way back, and a page that fails shows a code to quote to support.',
    ],
  },
  {
    id: '2026-10-notifications-centre',
    date: '2026-10-17',
    title: 'A notifications centre',
    points: [
      'The bell opens a panel with three tabs: For me (your entries approved or sent back, drawings issued, risks, snags), Approvals (what waits on your decision) and Reminders (missing DPRs, tests, stock, payments and papers falling due), each with its own unread count.',
      'Notifications are grouped by day, and Mark all read clears just the tab you are on.',
      'A notification about an entry opens it right there, over the page you are on, so you do not lose your place.',
      'Notices about the company, such as a read-only account, a scheduled deletion or being offline, now share one bar at the top of the page instead of stacking up.',
    ],
  },
  {
    id: '2026-10-search-everything',
    date: '2026-10-17',
    title: 'Search finds records, not just pages',
    points: [
      'Ctrl K (or the search box at the top) now finds material requests, purchase orders, bills, MB sheets, expenses, inspections, risks, documents, vendors, clients, items and people by number or name, showing only what your lists would show you.',
      'Before you type, it lists the records you opened lately.',
      'Type an action to start it: “new DPR”, “prepare RA bill”, or “new DPR for Jajpur” to open the form on that project.',
    ],
  },
  {
    id: '2026-10-lists-registers',
    date: '2026-10-17',
    title: 'Registers, stores, staff and machinery lists',
    points: [
      'The delay and risk register and the variations list have views across the top (Delays, Overdue, Not sent, With the client…) that can be saved and shared, and their filters go in the address bar.',
      'Quality tests, NCRs, safety incidents, permits, toolbox talks, documents, letters, transmittals, stock, the stock register, staff, leave, attendance, workers, the machine list, job cards, papers and drivers now work like the other lists: chips for the filters, columns you pick, a click on the row to open it, and page totals.',
      'Where a list could already be exported, you can now tick rows and export just those.',
    ],
  },
  {
    id: '2026-10-lists-masters',
    date: '2026-10-16',
    title: 'Projects, clients, vendors and users lists',
    points: [
      'Projects, clients, vendors and users have views across the top (Active projects, Subcontractors, Inactive users…) that can be saved and shared, and their filters go in the address bar as chips.',
      'Pick the columns you want, tick rows to export them, and click a row to open the project or edit the vendor, client or user.',
      'The payments list in Payables and the receipts list in Receivables add up the page, and a bill there opens its own page with Ctrl or Cmd click.',
    ],
  },
  {
    id: '2026-10-records-all-types',
    date: '2026-10-16',
    title: 'Every entry has its own page',
    points: [
      'Vendor bills, work orders, subcontractor bills, site expenses, measurements, machinery logs and inspections open as a page of their own, with the stage bar, sections and activity, at an address you can bookmark or send.',
      'In Approvals, these entries now show whole beside the queue, as daily reports and bills already did.',
      'In a list, Ctrl or Cmd click on an entry opens its page in a new tab; a plain click still opens the quick look.',
    ],
  },
  {
    id: '2026-10-lists-approvals',
    date: '2026-10-16',
    title: 'Every approval list works the same way',
    points: [
      'Vendor bills, work orders, subcontractor bills, site expenses, the measurement book, machinery logs and inspections now have views across the top (Waiting for me, Mine, Sent back, This week) and can be saved and shared.',
      'Their filters go in the address bar, so a filtered list can be bookmarked or sent, and show as chips you can take off one by one.',
      'Pick the columns you want, click a row to open it, tick rows to approve or export them together, and see the page total under the figures.',
      'Vendor bills, work orders and subcontractor bills can now be filtered by date and by who entered them.',
    ],
  },
  {
    id: '2026-10-forms-v2',
    date: '2026-10-16',
    title: 'Roomier forms that keep what you type',
    points: [
      'Daily reports, material requests, purchase orders, work orders, risks and vendors open in a large panel with sections; the buttons stay at the bottom.',
      'A new entry is kept on this device as you type, so a refresh or a closed tab does not lose it. Start over clears it.',
      'Closing a form with changes asks first, and a failed submit lists what still needs filling, with a link to each field.',
      'Ctrl Enter submits. In line tables (manpower, machinery, items) Enter moves down a line and adds one at the end.',
    ],
  },
  {
    id: '2026-10-home-by-role',
    date: '2026-10-16',
    title: 'A home page made for your job',
    points: [
      'My work, at the top, lists what waits for you: approvals, daily reports not filed today, entries sent back, bills awaiting payment, payments due, expiring guarantees, late deliveries and low stock.',
      'Directors, project managers, accounts, stores, quantity surveyors and site staff each see the figures and charts they use most, first.',
      'Figures show this month against last with a six-month trend line.',
      'New charts: planned against actual progress, cash in and out, billed against contract, and cost by head.',
    ],
  },
  {
    id: '2026-10-approvals-inbox',
    date: '2026-10-16',
    title: 'Approvals is now an inbox',
    points: [
      'What waits for you is on the left, grouped by type; the entry you pick opens beside it with Approve, Request changes and Reject underneath.',
      'Decide and the next entry opens by itself. J and K move through the queue, A approves, C asks for changes and R rejects.',
      'Tick entries of one type, or a whole group, and approve them together. Each is approved as if one by one, so its submitter hears and its history shows it.',
      'Approved today, at the top, lists what you approved, rejected or sent back since midnight.',
    ],
  },
  {
    id: '2026-10-record-pages',
    date: '2026-10-16',
    title: 'Every report, request, order and bill has its own page',
    points: [
      'Daily reports, progress entries, material requests, purchase orders and RA bills open on their own page, with a link you can copy and send.',
      'A bar across the top shows where it stands: drafted, submitted, approved, and for bills sent, certified and paid.',
      'Jump to a section from the bar above them; who did what and when is beside them, and the actions stay at the bottom of the screen.',
      'Clicking a row still opens the quick look; Open full page is at its top and in the row menu, and Ctrl click opens the page in a new tab.',
    ],
  },
  {
    id: '2026-10-project-workspace',
    date: '2026-10-16',
    title: 'A tidier project page',
    points: [
      'A project\'s 25 tabs are now six groups: Overview, Plan, Site, Materials, Money and Handover, with the tabs of each group underneath.',
      'The header shows how the project is doing: activities running late, cost against work done, and how much of that work is billed.',
      'Scroll down and the groups stay at the top with the project\'s name, and table headers stay under them.',
      'A project opens on the tab you last used on it, and each group on its last tab.',
    ],
  },
  {
    id: '2026-10-lists',
    date: '2026-10-16',
    title: 'Better lists',
    points: [
      'Daily reports, progress, material requests, purchase orders and RA bills have views across the top: Waiting for me, Mine, Sent back, This week.',
      'Save your own filters as a view, and share it with the company if it helps others.',
      'Filter by dates, hide the columns you do not need, and click anywhere on a row to open it.',
      'Tick rows to approve or export several at once. Money lists show a total for the page.',
      'The filters are in the address bar, so a filtered list can be bookmarked or sent to someone.',
    ],
  },
  {
    id: '2026-10-shell',
    date: '2026-10-16',
    title: 'A new header',
    points: [
      'Pick a project at the top left and every list shows that project only, until you switch back to All projects.',
      '+ New starts a daily report, progress entry, material request and more from any page.',
      'Star a page or a project to keep it under Favourites in the sidebar; Recent has the last few you opened.',
      'Help has the keyboard shortcuts (press ?), these notes and the tour.',
    ],
  },
  {
    id: '2026-10-appearance',
    date: '2026-10-16',
    title: 'Dark mode and compact density',
    points: ['Your name at the top right > Appearance: Light, Dark or the same as your device.', 'Density: Compact fits more rows on a screen.'],
  },
  {
    id: '2026-10-review',
    date: '2026-10-16',
    title: 'Tidier pages',
    points: ['The header says where you are.', 'Stock tables show item names in full.', 'Approvals say how long ago each entry was sent.'],
  },
];
