/** Copy for the product page (/welcome). Every claim here is something the app does today; check docs/ROADMAP.md before adding one. */

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
    shot: { src: '/landing/web-approvals.webp', alt: 'The approvals queue with progress, machinery and measurement entries waiting for review' },
    features: [
      { title: 'DPR and progress', text: 'Quantities against BOQ activities, manpower from attendance, photos and the day\'s issues.' },
      { title: 'Measurement book', text: 'Nos × L × B × D by BOQ item and location, with executed and measured quantity side by side.' },
      { title: 'Material and stock', text: 'Requests, receipts, issue to site, and an alert when an item falls below its minimum.' },
      { title: 'Machinery log', text: 'Hours worked, idle and breakdown, diesel and hire rates for owned and hired equipment.' },
      { title: 'Site expenses with GST', text: 'Bill photo, vendor GSTIN, taxable value and GST, approved before it counts as cost.' },
      { title: 'Delays and risks', text: 'Hindrances with days lost and who caused them, extensions granted, and a 5 × 5 risk register.' },
    ],
  },
  {
    key: 'billing',
    tab: 'Get paid',
    title: 'RA bills straight from the measurement book',
    lead: 'What site measured and the project manager approved becomes the next running bill, with the contract\'s deductions already applied.',
    shot: { src: '/landing/web-ra-bill.webp', alt: 'An RA bill from approval to payment, with its checks passed: quantities within the BOQ, rates as in the BOQ, deductions that add up' },
    features: [
      { title: 'Clients and contracts', text: 'Client GSTIN and billing address; per project the agreement, value, dates, retention, security deposit, advance and TDS rates.' },
      { title: 'RA bills', text: 'Previous, this bill and up to date per BOQ item, extra items flagged, GST and deductions, printed with the measurement annex.' },
      { title: 'Client certification', text: 'Enter the quantity the client certified; cuts re-price the bill and come back in the next one.' },
      { title: 'Receivables', text: 'Part payments with what the client actually deducted, ageing by client and project, retention held and when it is due back.' },
    ],
  },
  {
    key: 'buy',
    tab: 'Buy and pay',
    title: 'From material request to vendor payment',
    lead: 'Quotes, purchase orders, receipts at site and the vendor\'s bill are checked against each other before anyone pays.',
    shot: { src: '/landing/web-po.webp', alt: 'A purchase order through its stages, with the share received at site, its GRNs and vendor bills' },
    features: [
      { title: 'Vendor master', text: 'Suppliers, hire agencies and subcontractors with GSTIN, PAN, bank details and MSME number.' },
      { title: 'Quotes and purchase orders', text: 'A comparative with the lowest landed rate marked, and a PO approved within each role\'s limit.' },
      { title: 'Three-way match', text: 'GRN at site against the PO lines, and the vendor\'s bill checked against what was received and the PO rate.' },
      { title: 'Subcontractors', text: 'Work orders at agreed rates; their bills from the measurement book recover retention, advance, material issued and TDS.' },
      { title: 'Payables', text: 'A due list by days past due, part payments with TDS, and micro and small enterprise bills flagged before 45 days.' },
    ],
  },
  {
    key: 'quality',
    tab: 'Quality',
    title: 'Inspections, tests and NCRs on record',
    lead: 'Site asks for an inspection from the phone, QA/QC passes or fails it against a checklist, and failed work is tracked to closure.',
    shot: { src: '/landing/web-quality.webp', alt: 'The quality register with inspections requested, passed and sent for re-inspection' },
    features: [
      { title: 'Inspections from site', text: 'An activity at a location, with photos; each checklist point marked OK, not OK or not applicable.' },
      { title: 'Hold points', text: 'Progress on a hold-point activity is approved only after a passed inspection at that location.' },
      { title: 'Tests against specification', text: 'Concrete cubes with 7 and 28-day reminders, compaction and other tests, passed or failed on the result.' },
      { title: 'NCRs to closure', text: 'Raised from a failed test or inspection, cause and corrective action from site, closed by QA/QC.' },
    ],
  },
  {
    key: 'accounts',
    tab: 'Accounts',
    title: 'Cost, cash and the books, project by project',
    lead: 'Management sees what each project has done, what it cost, what was billed and what came in, without waiting for month end.',
    shot: { src: '/landing/web-cost.webp', alt: 'Project cost against the value executed, with margin, billed value, cash in and cash out for each project' },
    features: [
      { title: 'Cost against work done', text: 'Expenses, material, machinery, labour and subcontractors against BOQ value executed, with billed value and cash in and out.' },
      { title: 'Tally export', text: 'TallyPrime vouchers for bills, receipts, payments and expenses, projects as cost centres, each voucher sent once.' },
      { title: 'GST registers', text: 'Outward supplies in the GSTR-1 layout and input tax in the GSTR-2B layout, in one Excel workbook.' },
      { title: 'Approval rules', text: 'Who approves what, with rupee limits per role for each kind of entry, bill and order.' },
      { title: 'Progress reports', text: 'Weekly and monthly reports built from approved data, ready to print or save as PDF for the client.' },
    ],
  },
];

/** The three money flows, each ending in a Tally voucher. */
export const FLOWS: { name: string; steps: string[] }[] = [
  { name: 'Get paid', steps: ['Measurement', 'RA bill', 'Client certifies', 'Receipt'] },
  { name: 'Buy material', steps: ['Material request', 'Quotes', 'Purchase order', 'GRN at site', 'Vendor bill', 'Payment'] },
  { name: 'Pay subcontractors', steps: ['Work order', 'Their measurements', 'Subcontractor bill', 'Payment'] },
];

/** The Indian contract and tax details the app handles without a spreadsheet on the side: what, and where it shows. */
export const LOCAL: { what: string; where: string }[] = [
  { what: 'GST on bills and purchases', where: 'GSTR-1 and GSTR-2B registers' },
  { what: 'Income tax TDS, GST TDS and labour cess', where: 'Every RA bill' },
  { what: 'Retention and security deposit', where: 'Held, with the date due back' },
  { what: 'Mobilisation advance', where: 'Recovered bill by bill, never beyond what is owed' },
  { what: 'Micro and small enterprise bills', where: 'Flagged before 45 days' },
  { what: 'TDS on subcontractor bills', where: '1% or 2%, from the PAN' },
  { what: 'Amounts in lakh and crore', where: 'Everywhere, as clients read them' },
  { what: 'Extension of time', where: 'Backed by the hindrance register' },
];

/**
 * The demo highway contract's terms (apps/api/prisma/seed.ts, CONTRACTS.ROAD), as the RA bill applies them to the value of
 * work measured: GST is added, each deduction is a share of the same value (ra-bill-pricing.ts `billTotals`).
 */
export const DEMO_TERMS = {
  gstPct: 18,
  deductions: [
    { label: 'Retention', pct: 5 },
    { label: 'Mobilisation advance recovered', pct: 10 },
    { label: 'Income tax TDS', pct: 2 },
    { label: 'GST TDS', pct: 2 },
    { label: 'Labour welfare cess', pct: 1 },
  ],
};

/** Values of work to try in the bill, from the demo's own entries (the approvals queue). */
export const BILL_EXAMPLES: { value: number; label: string }[] = [
  { value: 636400, label: 'WMM laying, 296 cum' },
  { value: 646800, label: 'GSB laying, 392 cum' },
  { value: 2500000, label: 'A month on the highway' },
];

/** What the demo company already holds, said as one sentence (each part lights in turn). */
export const DEMO_HOLDS: string[] = [
  'a highway widening',
  'a hospital block',
  'a rural water scheme',
  'their RA bills',
  'purchase orders',
  'cube tests',
  'and the Tally vouchers they ended as',
];

export const ROLES: { who: string; what: string }[] = [
  { who: 'Site engineer', what: 'Progress, DPR, attendance, measurements, material requests and inspection requests, from the phone.' },
  { who: 'Store keeper', what: 'Receives material against the PO, issues it to site and keeps stock.' },
  { who: 'QA/QC engineer', what: 'Passes or fails inspections, records test results and raises NCRs.' },
  { who: 'Project manager', what: 'Approves from the phone or the desk within their limit, and sends back with a reason.' },
  { who: 'Quantity surveyor', what: 'Keeps the measurement book and prepares the RA bill.' },
  { who: 'Procurement', what: 'Quotes, comparatives, purchase orders and subcontract work orders.' },
  { who: 'Accounts', what: 'Vendor bills, payments, receipts, the Tally export and the GST registers.' },
  { who: 'Management', what: 'Every project\'s progress, cost, cash and pending approvals the same day.' },
  { who: 'Client\'s engineer and PMC', what: 'Their own login to see approved progress, certify RA bills and record that they attended an inspection.' },
];

/** One working day in the demo company, as the product records it. Places, items and figures follow the demo data (seed.ts) and the screenshots. */
export const DAY: { time: string; what: string; where: string; detail: string }[] = [
  // The stages bar sizes each moment by the time until the next one, so keep these in order.
  { time: '07:50', what: 'Attendance marked', where: 'Jajpur water supply scheme', detail: 'Masons, helpers and fitters by labour contractor, from the site in-charge\'s phone.' },
  { time: '11:30', what: 'Cube test due', where: 'District Hospital Block B, Cuttack', detail: 'The 28-day result for the M25 ground floor slab is due, and QA/QC has already been reminded.' },
  { time: '17:45', what: 'Progress sent without signal', where: 'Ch. 14+300, Bhubaneswar to Puri highway', detail: 'WMM laying, 296 cum, with photos. It waits on the phone and sends itself when the network is back.' },
  { time: '18:40', what: 'Approved on the phone', where: 'Project manager, on the way home', detail: '₹6,36,400 of work done now counts in the project\'s progress and in its cost against work done.' },
];

/** The demo company's three works, as seeded (apps/api/prisma/seed.ts). */
export const DEMO_PROJECTS: { type: string; code: string; name: string; client: string; place: string }[] = [
  { type: 'Road', code: 'RD-2026-01', name: 'Bhubaneswar to Puri highway widening, Km 12 to Km 28', client: 'Odisha Works Department', place: 'Khordha' },
  { type: 'Building', code: 'BL-2026-02', name: 'District Hospital Block B, G+3', client: 'Dept. of Health & Family Welfare', place: 'Cuttack' },
  { type: 'Water supply', code: 'WS-2026-03', name: 'Jajpur rural piped water supply scheme', client: 'RWSS Odisha, Jal Jeevan Mission', place: 'Jajpur' },
];

/** What a company can check for itself, rather than take on trust. */
export const TRUST: { title: string; text: string }[] = [
  { title: 'Every approval on record', text: 'Who entered it, who approved or sent it back, when, and the reason, in the audit trail.' },
  { title: 'Your company kept apart', text: 'Each company\'s records are separated down to the database, and site staff see only their own projects.' },
  { title: 'Take everything out, any day', text: 'One zip with an Excel file for every register and every photo and document you stored.' },
  { title: 'Tally stays your books', text: 'Vouchers go to TallyPrime once each, with projects as cost centres. Nothing is entered twice.' },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Does Nirmaan replace Tally?',
    a: 'No. Tally stays your books. Each month Nirmaan gives you a TallyPrime file of the RA bills, receipts, vendor and subcontractor bills, payments and site expenses, with projects as cost centres. Each voucher goes once, so nothing is entered twice.',
  },
  {
    q: 'Does the site app work without network?',
    a: 'Yes. Entries and photos are saved on the phone when there is no signal and send themselves when the network is back. Photos are made smaller before sending so they go through on a weak connection.',
  },
  {
    q: 'What kind of projects is it for?',
    a: 'Contractors on road, building and water supply works start with a standard activity list for each. Any project can import its BOQ from Excel.',
  },
  {
    q: 'Can approvals and reminders come on WhatsApp?',
    a: 'Yes. Approval requests, send-backs, the DPR reminder and the morning approvals digest can go on WhatsApp, with SMS when WhatsApp does not go through. Each person switches it on for their own number.',
  },
  {
    q: 'Can our client see progress?',
    a: 'Yes, if you invite them. The client\'s engineer and the consultant or PMC get their own login for your projects with them. They see only approved progress, DPRs and reports, certify the RA bills you send, and record that they attended an inspection.',
  },
  {
    q: 'Can we set our own approval limits?',
    a: 'Yes. Approval rules say which role approves each kind of entry, bill and order, up to what amount. Every approval, rejection and send-back is kept in the audit trail with the reason.',
  },
  {
    q: 'Who can see our data?',
    a: 'Only your company. Every company\'s records are kept apart down to the database, and site staff see only the projects they work on. Bank details of vendors are shown only to admin, management, procurement and accounts.',
  },
  {
    q: 'How do we try it?',
    a: 'Open the demo with the accounts listed on the sign-in page: it has a road, a building and a water supply project with bills, orders and inspections already in it.',
  },
];
