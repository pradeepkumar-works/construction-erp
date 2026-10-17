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
    id: '2026-10-speed',
    date: '2026-10-18',
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
    date: '2026-10-18',
    title: 'Easier to hit, easier to read',
    points: [
      'Every button, field and tab is at least 24 px tall, also in compact, and grows to 44 px on a touch screen.',
      'Text follows one scale with 12 px as the smallest, so compact no longer shrinks it.',
      'Figures are plain text unless something needs a look: red or amber now only marks what is late, over budget, rejected or falling.',
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
