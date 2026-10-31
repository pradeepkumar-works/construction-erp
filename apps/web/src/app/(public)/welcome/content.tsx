/**
 * Copy for the product page (/welcome). Every claim here is something the app does today, and every figure is the demo
 * company's own (apps/api/prisma/seed.ts, read from its watch list, approvals and bills); check docs/ROADMAP.md before
 * adding a claim, and the client-names blocklist before adding a name.
 */

/** A record an answer or a finding rests on, opened in the demo after sign-in. */
export type Source = { label: string; next: string };

/** One of the questions the page's Ask Nirmaan answers, with the answer as the demo company's records give it. */
export type AskTurn = {
  key: string;
  q: string;
  /** What it read, said the way the panel says it while it works. */
  read: string;
  lead: string;
  points: string[];
  sources: Source[];
};

export const ASK: AskTurn[] = [
  {
    key: 'today',
    q: 'What needs me today?',
    read: 'Read the watch list, vendor payments, machine hours and stock',
    lead: 'Three things, the most money first:',
    points: [
      '₹13.3 L went to Kalinga Bitumen & Aggregates three days after its bank details changed. Confirm the new account on a number you already had.',
      'The GRD-01 motor grader has worked 35 of the 200 hours a month you pay for. ₹3.5 L is at risk: put it to work or off-hire it.',
      'Fly ash bricks at BL-2026-02 are 53% over what the approved work allows, ₹2.2 L at the item rate. Count the stack this week.',
    ],
    sources: [
      { label: 'Payment to Kalinga Bitumen', next: '/watch-list' },
      { label: 'GRD-01 hire', next: '/leakage' },
      { label: 'BL-2026-02 bricks', next: '/leakage' },
    ],
  },
  {
    key: 'diesel',
    q: 'Where is diesel going on the highway?',
    read: 'Read 5 machinery logs and the fuel issues for October',
    lead: 'One machine, two signs:',
    points: [
      'EXC-01, the Tata Hitachi excavator, ran at 14 litres an hour over its last five logs against a norm of 11: 109.5 litres more than its work needed.',
      'On 22 Oct the store issued it 60 litres, and it has no log for that day. That is ₹5,550 of fuel with no work to show.',
    ],
    sources: [
      { label: 'EXC-01 fuel position', next: '/leakage' },
      { label: 'Machinery logs', next: '/machinery?tab=logs' },
    ],
  },
  {
    key: 'labour',
    q: 'Can I pass Sri Jagannath’s labour bill?',
    read: 'Read the bill, the head count, the roll call and the punches',
    lead: 'Not all of it.',
    points: [
      'WO-2026-0003 bill 1 charges 84 man-days for 25 to 29 Oct. The head count and roll call for those days support 75.',
      'Hold 9 man-days, ₹4,950, until Sri Jagannath Constructions shows the muster. The rest matches the records.',
    ],
    sources: [
      { label: 'WO-2026-0003 bill 1', next: '/attendance-check' },
      { label: 'Head count', next: '/attendance' },
    ],
  },
  {
    key: 'notice',
    q: 'Which delay notices are due?',
    read: 'Read the delay register and the contracts’ notice periods',
    lead: 'One is late:',
    points: [
      'RISK-2026-0008 on the Jajpur water scheme: railway crossing permission for the raw water main has held work since 5 Oct.',
      'The contract gives 14 days for notice, so it was due on 19 Oct, and no letter to the client is linked. 26 days of extension depend on it. I can draft the notice for you to check and send.',
    ],
    sources: [
      { label: 'RISK-2026-0008', next: '/risks' },
      { label: 'Draft the notice', next: '/risks' },
    ],
  },
];

/** The site's day, one entry in three states (the approvals queue's own row). */
export const ENTRY = {
  title: 'WMM laying: 296 Cum on 30 Oct 2026',
  project: 'Bhubaneswar - Puri Highway Widening',
  where: 'Ch. 14+200 to 14+650',
  by: 'Priya Mohanty',
  crew: '18 workers · motor grader, vibratory roller, 2 tippers',
  value: 636400,
  rate: 2150,
  qty: 296,
  approver: 'Suresh Nair',
  sent: '17:45',
  approved: '18:40',
};

/** The watch list's checks, each with what it found in the demo company this month. */
export type Check = { key: string; says: string; found: string; tone: 'work' | 'materials' | 'buying' | 'money' | 'business' | 'admin' };

export const CHECKS: Check[] = [
  {
    key: 'material',
    says: 'Flag material used over the norm',
    found: 'Fly ash bricks at BL-2026-02: 74,800 used where the approved work allows 48,925. ₹2.2 L at risk.',
    tone: 'materials',
  },
  {
    key: 'fuel',
    says: 'Find diesel with no work to show',
    found: 'EXC-01: 60 litres issued on 22 Oct with no log that day, and 14 litres an hour against a norm of 11.',
    tone: 'buying',
  },
  {
    key: 'labour',
    says: 'Check labour bills against punches',
    found: 'Sri Jagannath Constructions billed 84 man-days; the head count and roll call support 75. Hold ₹4,950.',
    tone: 'work',
  },
  {
    key: 'notice',
    says: 'Warn before a delay notice lapses',
    found: 'Railway crossing permission at Jajpur: the notice was due on 19 Oct, and 26 days of extension depend on it.',
    tone: 'business',
  },
  {
    key: 'bank',
    says: 'Question a payment to a new account',
    found: 'Kalinga Bitumen & Aggregates: ₹13.3 L paid three days after its bank details changed.',
    tone: 'money',
  },
  {
    key: 'weigh',
    says: 'Weigh every truck against its challan',
    found: 'Kalinga Bitumen & Aggregates: 2 of 3 loads short at the weighbridge, 0.87 t in all.',
    tone: 'admin',
  },
];

/** Checks the watch list also runs, said after the switches. */
export const MORE_CHECKS =
  'It also warns when stock will run out, a cube is weak at 7 days, a drawing is late, a hired machine stands idle, an EMI is unpaid, a test is owed or a margin starts to fade.';

/** One entry's road from site to Tally, the four stops of the slider. */
export const STAGES = [
  { key: 'site', name: 'Site', clause: 'First, entered on site' },
  { key: 'approve', name: 'Approval', clause: 'Then approved on the phone' },
  { key: 'bill', name: 'RA bill', clause: 'Then measured and billed' },
  { key: 'tally', name: 'Tally', clause: 'Last, posted to Tally once' },
] as const;

/**
 * The demo highway contract's terms (apps/api/prisma/seed.ts, CONTRACTS.ROAD), as the RA bill applies them to the value of
 * work measured: GST is added, each deduction is a share of the same value (ra-bill-pricing.ts `billTotals`).
 */
export const DEMO_TERMS = {
  gstPct: 18,
  deductions: [
    { label: 'Retention', short: 'retention', pct: 5 },
    { label: 'Mobilisation advance recovered', short: 'advance recovered', pct: 10 },
    { label: 'Income tax TDS', short: 'income tax TDS', pct: 2 },
    { label: 'GST TDS', short: 'GST TDS', pct: 2 },
    { label: 'Labour welfare cess', short: 'labour cess', pct: 1 },
  ],
};

/** The second running bill on the demo highway: the two layers approved on 30 Oct. */
export const BILL_LINES: { item: string; unit: string; qty: number; rate: number }[] = [
  { item: 'Wet mix macadam, Ch. 14+200 to 14+650', unit: 'Cum', qty: 296, rate: 2150 },
  { item: 'Granular sub-base, Ch. 14+200 to 14+650', unit: 'Cum', qty: 392, rate: 1650 },
];

/** Documents it writes, the names of the output index. */
export const OUTPUTS = [
  { key: 'brief', name: 'Morning brief' },
  { key: 'bill', name: 'RA bill' },
  { key: 'notice', name: 'Delay notice' },
] as const;

/** The management brief for 30 Oct, as Ask Nirmaan writes it from the records. */
export const BRIEF = {
  to: 'Rajesh Patnaik',
  date: 'Friday 30 October',
  lines: [
    '48 entries wait for your approval, the oldest for 4 days.',
    '₹14.2 L of vendor payments fall due this week; Kalinga Bitumen’s ₹12.8 L is the largest and is 10 days late.',
    'The hospital’s forecast margin has fallen from 70% to 66.5% since September, with material issued ₹25 L over its budget.',
  ],
};

/** What the page shows of each module: the screen, the lead and what is in it. */
export type Feature = { title: string; text: string };

export type Module = {
  key: string;
  tab: string;
  title: string;
  lead: string;
  shot: { src: string; alt: string };
  features: Feature[];
};

export const MODULES: Module[] = [
  {
    key: 'site',
    tab: 'Site',
    title: 'Everything a site sends to the office',
    lead: 'The site engineer enters the day on the phone. The project manager approves it, and only then does it count.',
    shot: { src: 'web-approvals', alt: 'The approvals queue: progress entries, daily reports and indents waiting, with the WMM entry open beside them' },
    features: [
      { title: 'DPR and progress', text: 'Quantities against BOQ activities, manpower from attendance, photos and the day’s hindrances.' },
      { title: 'Measurement book', text: 'Nos × L × B × D by BOQ item and location, started from the approved progress still to measure.' },
      { title: 'Material and stock', text: 'Requests, receipts at the weighbridge, issues to site, and a warning before an item runs out.' },
      { title: 'Machinery', text: 'Hours, idle and breakdown, fuel against the norm, and engine hours from the tracker.' },
    ],
  },
  {
    key: 'billing',
    tab: 'Get paid',
    title: 'RA bills straight from the measurement book',
    lead: 'What site measured and the project manager approved becomes the next running bill, with the contract’s deductions applied.',
    shot: { src: 'web-ra-bill', alt: 'RA bill 1 from draft to paid, with all five checks passed and the abstract of cost' },
    features: [
      { title: 'Five checks on every bill', text: 'Quantities within the BOQ and the book, rates as agreed, previous bills and deductions that add up.' },
      { title: 'Client certification', text: 'Enter what the client certified; cuts re-price the bill and come back in the next one.' },
      { title: 'Stage and lump-sum billing', text: 'Payment stages with their evidence, for EPC and lump-sum contracts.' },
      { title: 'Receivables', text: 'Part payments with what the client really deducted, and retention held until it is due back.' },
    ],
  },
  {
    key: 'buy',
    tab: 'Buy and pay',
    title: 'From indent to vendor payment',
    lead: 'Quotes, purchase orders, receipts at site and the vendor’s bill are checked against each other before anyone pays.',
    shot: { src: 'web-po', alt: 'The purchase order register by stage, with what has been received at site' },
    features: [
      { title: 'Lowest rate per item', text: 'A comparative splits the request between the vendors who quoted lowest, as draft orders.' },
      { title: 'Three-way match', text: 'GRN at site against the PO lines, and the vendor’s bill against what was received.' },
      { title: 'Subcontractors', text: 'Work orders at agreed rates; their bills recover retention, advance, material issued and TDS.' },
      { title: 'Payables', text: 'A due list by days past due, and micro and small enterprise bills flagged before 45 days.' },
    ],
  },
  {
    key: 'quality',
    tab: 'Quality',
    title: 'Tests owed, cubes and NCRs on record',
    lead: 'The quality plan works out which tests the approved work owes, and the cubes pass or fail by IS 456.',
    shot: { src: 'web-quality', alt: 'The quality plan with the tests each line owes against those recorded' },
    features: [
      { title: 'Tests owed', text: 'From approved DPR lines and receipts, by the plan’s frequency and IS 456 sampling.' },
      { title: 'Cubes', text: '7 and 28-day results with a warning when a 7-day result points to a failure.' },
      { title: 'Labs and calibration', text: 'Reports chased when late, and results from an uncalibrated instrument marked.' },
      { title: 'NCRs to closure', text: 'Raised from a failed test, inspection or audit finding, closed by QA/QC.' },
    ],
  },
  {
    key: 'accounts',
    tab: 'Accounts',
    title: 'Cash for thirteen weeks, project by project',
    lead: 'Every bill, order, salary and EMI on record becomes a week of cash in or out, so a short week shows a quarter ahead.',
    shot: { src: 'web-cash', alt: 'The cash forecast: the balance at each week’s end over 13 weeks, and the receipts to chase' },
    features: [
      { title: 'Cash forecast', text: 'Thirteen weeks from the books, with the clients to chase and the payments that can wait.' },
      { title: 'Tally export', text: 'TallyPrime vouchers for bills, receipts and payments, projects as cost centres, each sent once.' },
      { title: 'GST registers', text: 'Outward supplies in the GSTR-1 layout and input tax in the GSTR-2B layout.' },
      { title: 'Payroll', text: 'Wages from the roll call and the punches, with PF, ESI and professional tax by state.' },
    ],
  },
  {
    key: 'management',
    tab: 'Management',
    title: 'Every project on one page',
    lead: 'Progress against plan, money from work done to paid, cost, approvals and what needs action, the same day.',
    shot: { src: 'web-management', alt: 'The management dashboard: contract value, work done, billed, certified and paid, and the projects that need action' },
    features: [
      { title: 'From contract to cash', text: 'Work done, billed, certified and paid on each project, with what is not billed yet.' },
      { title: 'Health by project', text: 'Physical progress against plan and margin to date, with the reason a project needs action.' },
      { title: 'Reports', text: 'MIS, profit and loss, work in progress, receivables and stock, to print or open in Excel.' },
      { title: 'Group companies', text: 'One login across your companies, each with its own books.' },
    ],
  },
];

/** What the site already makes, and what Nirmaan makes of it. */
export const READS: { from: string; to: string }[] = [
  { from: 'A WhatsApp message from site', to: 'A draft progress entry, expense or request, saved by the person who sent it' },
  { from: 'A vendor’s invoice or a challan', to: 'A filled vendor bill or receipt, with its date and GSTIN checked' },
  { from: 'A BOQ or a work order', to: 'BOQ items and the contract’s terms, read page by page' },
  { from: 'A photo from site', to: 'A check for helmets, harnesses, barricades and scaffolds' },
  { from: 'The weighbridge', to: 'A GRN at the weighed quantity, and short loads flagged' },
  { from: 'A tracker or fuel sensor', to: 'Engine hours against the log sheet, refills and drains' },
  { from: 'The biometric device', to: 'The day’s attendance and the month’s payroll' },
  { from: 'The batching plant', to: 'One delivery challan for each batch' },
];

/** How the AI is kept in its place. */
export const AI_RULES: { title: string; text: string }[] = [
  { title: 'It reads through your permissions', text: 'Ask Nirmaan sees a record only if the person asking could open it.' },
  { title: 'It never saves anything', text: 'It drafts a form or a letter; a person checks it and saves it.' },
  { title: 'Every answer shows its records', text: 'Each line links the record behind it, to open before you act.' },
  { title: 'You decide who uses it', text: 'Switch it on for the company, choose the roles, and set a monthly cap.' },
  { title: 'Every approval on record', text: 'Who entered it, who approved or sent it back, when, and the reason.' },
  { title: 'Your company kept apart', text: 'Each company’s records are separated down to the database.' },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'What does the AI do, exactly?',
    a: 'Ask Nirmaan answers questions from your records and links each record it used. Every morning it checks the work, stock, fuel, labour, bills and payments for things that need someone and puts them on the watch list with the working. It reads invoices, challans, BOQs and site photos, turns WhatsApp messages into draft entries, and drafts letters and forms for a person to check.',
  },
  {
    q: 'Can the AI change our records?',
    a: 'No. It only reads, and only what the person asking is allowed to see. A draft becomes a record when a person saves it in the form, with the same checks and approvals as one they typed.',
  },
  {
    q: 'Does Nirmaan replace Tally?',
    a: 'No. Tally stays your books. Nirmaan gives you TallyPrime vouchers for the RA bills, receipts, vendor and subcontractor bills, payments and site expenses, with projects as cost centres. Each voucher goes once, so nothing is entered twice.',
  },
  {
    q: 'Does the site app work without network?',
    a: 'Yes. Entries and photos are saved on the phone when there is no signal and send themselves when the network is back, in English or Hindi.',
  },
  {
    q: 'What kind of projects is it for?',
    a: 'Roads, buildings, water supply and pipelines, EPC and lump-sum contracts, operation and maintenance, RMC plants and central stores. Each project type brings its own activities and DPR form, and any project can import its BOQ from Excel.',
  },
  {
    q: 'Can our client see progress?',
    a: 'Yes, if you invite them. The client’s engineer and the PMC get their own login for your projects with them, see approved progress and reports, and certify the RA bills you send.',
  },
  {
    q: 'Can we switch the AI off?',
    a: 'Yes. An admin switches it on or off for the company, chooses the roles that may use it and sets a monthly cap. Everything else in Nirmaan works the same without it.',
  },
  {
    q: 'How do we try it?',
    a: 'Open the demo company: it has roads, a hospital, water schemes, a plant and a store, with their bills, orders, tests and watch list already in it.',
  },
];

/** The demo accounts the closing sentence can open (the sign-in page lists the same ones). */
export const DEMO_ROLES: { key: string; label: string }[] = [
  { key: 'md', label: 'the managing director' },
  { key: 'pm', label: 'a project manager' },
  { key: 'engineer', label: 'a site engineer' },
  { key: 'qs', label: 'a quantity surveyor' },
  { key: 'admin', label: 'the admin' },
];

/** The pictures of the site's world on the page, with their credits (assets/credits.json in the taste skill's run). */
export const PHOTO_CREDITS: { title: string; by: string; licence: string; licenceUrl: string; page: string }[] = [
  {
    title: 'Road Construction IIT Mandi',
    by: 'Timothy A. Gonsalves',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Road_Construction_IIT_Mandi_Mar26_A7CR_10574.jpg',
  },
  {
    title: 'Road construction vehicle, Bangalore (2025)',
    by: 'Gpkp',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Road_construction_vehicle,_Bangalore_(2025).jpg',
  },
];
