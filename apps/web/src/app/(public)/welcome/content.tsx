import React from 'react';
import {
  AccountBookOutlined,
  AlertOutlined,
  AuditOutlined,
  BankOutlined,
  CalculatorOutlined,
  CheckSquareOutlined,
  ContainerOutlined,
  ExperimentOutlined,
  ExportOutlined,
  FileDoneOutlined,
  FilePdfOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FundOutlined,
  InboxOutlined,
  IssuesCloseOutlined,
  PayCircleOutlined,
  PercentageOutlined,
  ReconciliationOutlined,
  SafetyOutlined,
  ShopOutlined,
  SolutionOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';

/** Copy for the product page (/welcome). Every claim here is something the app does today; check docs/ROADMAP.md before adding one. */

export type Feature = { icon: React.ReactNode; title: string; text: string };

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
      { icon: <FileTextOutlined />, title: 'DPR and progress', text: 'Quantities against BOQ activities, manpower from attendance, photos and the day\'s issues.' },
      { icon: <CalculatorOutlined />, title: 'Measurement book', text: 'Nos × L × B × D by BOQ item and location, with executed and measured quantity side by side.' },
      { icon: <InboxOutlined />, title: 'Material and stock', text: 'Requests, receipts, issue to site, and an alert when an item falls below its minimum.' },
      { icon: <ToolOutlined />, title: 'Machinery log', text: 'Hours worked, idle and breakdown, diesel and hire rates for owned and hired equipment.' },
      { icon: <WalletOutlined />, title: 'Site expenses with GST', text: 'Bill photo, vendor GSTIN, taxable value and GST, approved before it counts as cost.' },
      { icon: <AlertOutlined />, title: 'Delays and risks', text: 'Hindrances with days lost and who caused them, extensions granted, and a 5 × 5 risk register.' },
    ],
  },
  {
    key: 'billing',
    tab: 'Get paid',
    title: 'RA bills straight from the measurement book',
    lead: 'What site measured and the project manager approved becomes the next running bill, with the contract\'s deductions already applied.',
    shot: { src: '/landing/web-ra-bill.webp', alt: 'An RA bill with the abstract of cost, GST and the retention, advance recovery, TDS and labour cess deductions' },
    features: [
      { icon: <BankOutlined />, title: 'Clients and contracts', text: 'Client GSTIN and billing address; per project the agreement, value, dates, retention, security deposit, advance and TDS rates.' },
      { icon: <FileDoneOutlined />, title: 'RA bills', text: 'Previous, this bill and up to date per BOQ item, extra items flagged, GST and deductions, printed with the measurement annex.' },
      { icon: <AuditOutlined />, title: 'Client certification', text: 'Enter the quantity the client certified; cuts re-price the bill and come back in the next one.' },
      { icon: <AccountBookOutlined />, title: 'Receivables', text: 'Part payments with what the client actually deducted, ageing by client and project, retention held and when it is due back.' },
    ],
  },
  {
    key: 'buy',
    tab: 'Buy and pay',
    title: 'From material request to vendor payment',
    lead: 'Quotes, purchase orders, receipts at site and the vendor\'s bill are checked against each other before anyone pays.',
    shot: { src: '/landing/web-po.webp', alt: 'A purchase order with items, GST, the share received at site and its GRN' },
    features: [
      { icon: <ShopOutlined />, title: 'Vendor master', text: 'Suppliers, hire agencies and subcontractors with GSTIN, PAN, bank details and MSME number.' },
      { icon: <ContainerOutlined />, title: 'Quotes and purchase orders', text: 'A comparative with the lowest landed rate marked, and a PO approved within each role\'s limit.' },
      { icon: <ReconciliationOutlined />, title: 'Three-way match', text: 'GRN at site against the PO lines, and the vendor\'s bill checked against what was received and the PO rate.' },
      { icon: <SolutionOutlined />, title: 'Subcontractors', text: 'Work orders at agreed rates; their bills from the measurement book recover retention, advance, material issued and TDS.' },
      { icon: <PayCircleOutlined />, title: 'Payables', text: 'A due list by days past due, part payments with TDS, and micro and small enterprise bills flagged before 45 days.' },
    ],
  },
  {
    key: 'quality',
    tab: 'Quality',
    title: 'Inspections, tests and NCRs on record',
    lead: 'Site asks for an inspection from the phone, QA/QC passes or fails it against a checklist, and failed work is tracked to closure.',
    shot: { src: '/landing/web-quality.webp', alt: 'The quality register with inspections requested, passed and sent for re-inspection' },
    features: [
      { icon: <SafetyOutlined />, title: 'Inspections from site', text: 'An activity at a location, with photos; each checklist point marked OK, not OK or not applicable.' },
      { icon: <CheckSquareOutlined />, title: 'Hold points', text: 'Progress on a hold-point activity is approved only after a passed inspection at that location.' },
      { icon: <ExperimentOutlined />, title: 'Tests against specification', text: 'Concrete cubes with 7 and 28-day reminders, compaction and other tests, passed or failed on the result.' },
      { icon: <IssuesCloseOutlined />, title: 'NCRs to closure', text: 'Raised from a failed test or inspection, cause and corrective action from site, closed by QA/QC.' },
    ],
  },
  {
    key: 'accounts',
    tab: 'Accounts',
    title: 'Cost, cash and the books, project by project',
    lead: 'Management sees what each project has done, what it cost, what was billed and what came in, without waiting for month end.',
    shot: { src: '/landing/web-cost.webp', alt: 'Project cost against executed value, with billed value, cash in and cash out' },
    features: [
      { icon: <FundOutlined />, title: 'Cost against work done', text: 'Expenses, material, machinery, labour and subcontractors against BOQ value executed, with billed value and cash in and out.' },
      { icon: <ExportOutlined />, title: 'Tally export', text: 'TallyPrime vouchers for bills, receipts, payments and expenses, projects as cost centres, each voucher sent once.' },
      { icon: <PercentageOutlined />, title: 'GST registers', text: 'Outward supplies in the GSTR-1 layout and input tax in the GSTR-2B layout, in one Excel workbook.' },
      { icon: <FileProtectOutlined />, title: 'Approval rules', text: 'Who approves what, with rupee limits per role for each kind of entry, bill and order.' },
      { icon: <FilePdfOutlined />, title: 'Progress reports', text: 'Weekly and monthly reports built from approved data, ready to print or save as PDF for the client.' },
    ],
  },
];

/** The three money flows, each ending in a Tally voucher. */
export const FLOWS: { name: string; steps: string[] }[] = [
  { name: 'Get paid', steps: ['Measurement', 'RA bill', 'Client certifies', 'Receipt'] },
  { name: 'Buy material', steps: ['Material request', 'Quotes', 'Purchase order', 'GRN at site', 'Vendor bill', 'Payment'] },
  { name: 'Pay subcontractors', steps: ['Work order', 'Their measurements', 'Subcontractor bill', 'Payment'] },
];

/** The Indian contract and tax details the app handles without a spreadsheet on the side. */
export const LOCAL: string[] = [
  'GST on bills and purchases, with GSTR-1 and GSTR-2B registers',
  'Income tax TDS, GST TDS and labour welfare cess on RA bills',
  'Retention and security deposit held, with the date they are due back',
  'Mobilisation advance recovered bill by bill, never beyond what is outstanding',
  'Micro and small enterprise bills flagged before the 45-day limit',
  'TDS on subcontractor bills from the PAN (1% or 2%)',
  'Amounts in lakh and crore, the way your clients read them',
  'Extension of time backed by the hindrance register',
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
