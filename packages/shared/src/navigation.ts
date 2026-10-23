import type { ApprovalRightDto } from './approvals';
import { approvalRightsOf, mayApprove } from './approvals';
import { PRODUCT_NAME } from './brand';
import type { RoleKey } from './enums';
import * as P from './permissions';
import { canManageAi } from './ai';
import { canSeeWatchList } from './warnings';
import { canManageModules, pathIsOff } from './module-switches';

/**
 * The navigation tree (launcher, phase 1): one list of every module and every page in it. The sidebar, its rail, quick-jump
 * search and each module's screen (`/modules/<key>`) are drawn from it, so a new page is one entry here.
 *
 * - `parent: null` is a module on Home. One with a `route` (Approvals) is a page and opens straight away; one without has a
 *   module screen with a tile for each of its children.
 * - `access` names a check in `NAV_ACCESS`, which wraps the same `@erp/shared` helper the page itself uses, so a tile or a
 *   link never shows more than the page lets in. A module shows when any of its pages does.
 * - A tile with `projectTab` opens that tab of the header's project (`/projects/<id>?tab=…`); `shortcutOf` draws the tile in a
 *   second module but opens (and is checked as) the other node, so one page is never two places.
 * - Only `live` nodes show. `building` and `planned` ones name the roadmap item that brings them; the item turns the node
 *   live and gives it its route.
 * - The sidebar lists pages, not tabs: a node with a plain route is a link under its label; one whose route has a query (a tab
 *   or a filter of a page) is left out unless `nav` names the page it stands for there ('Quality' for /inspections).
 * - `id`s are kept forever (pins, recents and company flags will hang on them, phase 2); `ModuleKey`s are the module ids.
 */

export type NavFamily = 'work' | 'materials' | 'buying' | 'money' | 'people' | 'business' | 'insight' | 'admin';
export type NavStatus = 'live' | 'building' | 'planned';
/** Counts on tiles (phase 2), each only for a user who may open the list behind it. */
export type NavBadgeKey =
  | 'myWork' | 'approvals' | 'module' | 'dprMissing' | 'mbWaiting' | 'qualityWaiting' | 'ncrsOpen' | 'permitsWaiting'
  | 'lettersDue' | 'rfisOpen' | 'mrWaiting' | 'lowStock' | 'machinesDown' | 'papersDue' | 'poWaiting'
  | 'vendorBillsWaiting' | 'scBillsWaiting' | 'billsWaiting' | 'paymentRequestsWaiting' | 'leaveToDecide'
  | 'overtimeToDecide' | 'watchOpen';

export interface NavNode {
  /** Stable forever. A module's id is its `ModuleKey`; a page's is `<module>.<name>`. */
  id: string;
  parent: string | null;
  label: string;
  /** Lucide icon name (kebab case); the web maps it to its component in `components/shell/nav-icons.tsx`. */
  icon: string;
  route?: string;
  /** Opens this tab of the header's project */
  projectTab?: string;
  /** More query on a `projectTab` link (an inner tab: 'sub=estimate') */
  projectQuery?: string;
  /** Heading the tile sits under on its module screen */
  group?: string;
  /** Modules only: the colour family of the module and its tiles */
  family?: NavFamily;
  /** One line on the tile, and the module screen's subtitle for a module */
  description: string;
  /** A key of `NAV_ACCESS` */
  access: NavAccessKey;
  status: NavStatus;
  /** The roadmap item that brings it (building and planned nodes) */
  roadmap?: number;
  badge?: NavBadgeKey;
  /** Other words people search for (abbreviations, the paper form's name) */
  keywords?: string;
  /** Drawn here too, but opens the other node */
  shortcutOf?: string;
  /** The sidebar link's name where it differs from the tile's, or false to leave a plain route out of the sidebar */
  nav?: string | false;
  /** A sidebar link among the top ones (Home, Approvals) rather than under its module */
  top?: boolean;
  /** Defaults; companies will override them (phase 3) */
  isNew?: boolean;
  featured?: boolean;
  /** Items of the Concord brochure this node covers (`apps/web/scripts/concord-items.ts`, checked in CI) */
  concord?: string[];
}

/** What the checks need of the signed-in user. */
export interface NavUser {
  roleKey: RoleKey;
  approvalRights?: ApprovalRightDto[];
  platformAdmin?: boolean;
  billing?: unknown;
  /** The company's modules turned off (v6 item 117): their pages leave the menu, Home and Search. */
  modulesOff?: readonly string[];
}

const onSite = (u: NavUser) => P.canReportSafety(u.roleKey);
const approves = (u: NavUser, type: string) => approvalRightsOf(u).some((r) => r.type === type);
/** Proposed for planned items until the item adds its own helper. */
const roles = (...keys: RoleKey[]) => (u: NavUser) => keys.includes(u.roleKey);

/** Who may open each node: the helper each page checks (the same rules the sidebar used before the tree). */
export const NAV_ACCESS = {
  internal: (u: NavUser) => !P.isGuest(u.roleKey),
  approvals: (u: NavUser) => mayApprove(u),
  watchList: (u: NavUser) => canSeeWatchList(u.roleKey),
  onSite,
  attendance: (u: NavUser) => onSite(u) || P.canViewWorkers(u.roleKey),
  measure: (u: NavUser) => P.canMeasure(u.roleKey),
  risks: (u: NavUser) => onSite(u) || P.canViewContract(u.roleKey),
  expenses: (u: NavUser) => P.canSubmitExpense(u.roleKey) || P.canViewCost(u.roleKey),
  imprest: (u: NavUser) => P.canHoldImprest(u.roleKey) || P.canManageImprest(u.roleKey) || P.canApprove(u.roleKey),
  checklists: (u: NavUser) => P.canManageChecklists(u.roleKey),
  letters: (u: NavUser) => P.canViewLetters(u.roleKey),
  materialRequests: (u: NavUser) => onSite(u) || P.canPurchase(u.roleKey),
  stock: (u: NavUser) => onSite(u) || P.canPurchase(u.roleKey) || P.canViewCost(u.roleKey),
  stockValue: (u: NavUser) => P.canManageStore(u.roleKey) || P.canViewCost(u.roleKey),
  reconciliation: (u: NavUser) => P.canViewReconciliation(u.roleKey),
  machinery: (u: NavUser) => onSite(u) || P.canPurchase(u.roleKey),
  purchaseOrders: (u: NavUser) => P.canViewPurchaseOrders(u.roleKey),
  vendorBills: (u: NavUser) => P.canViewVendorBills(u.roleKey),
  vendors: (u: NavUser) => P.canEditVendors(u.roleKey) || P.canSeeVendorBank(u.roleKey),
  workOrders: (u: NavUser) => P.canViewWorkOrders(u.roleKey),
  subcontractBills: (u: NavUser) => P.canPrepareSubcontractBill(u.roleKey) || approves(u, 'SUBCONTRACT_BILL'),
  bills: (u: NavUser) => P.canPrepareBill(u.roleKey) || approves(u, 'BILL'),
  variations: (u: NavUser) => P.canViewVariations(u.roleKey),
  contract: (u: NavUser) => P.canViewContract(u.roleKey),
  clients: (u: NavUser) => P.canViewContract(u.roleKey) || P.canEditContract(u.roleKey),
  compliance: (u: NavUser) => P.canViewCompliance(u.roleKey),
  payables: (u: NavUser) => P.canViewPayables(u.roleKey),
  paymentRequests: (u: NavUser) => P.canViewPaymentRequests(u.roleKey),
  debitNotes: (u: NavUser) => P.canViewDebitNotes(u.roleKey),
  gst: (u: NavUser) => P.canViewGstRegisters(u.roleKey),
  tally: (u: NavUser) => P.canExportTally(u.roleKey),
  markStaff: (u: NavUser) => P.canMarkStaff(u.roleKey),
  staffAdmin: (u: NavUser) => P.canManageStaff(u.roleKey),
  biometric: (u: NavUser) => P.canManageBiometric(u.roleKey),
  hrRecords: (u: NavUser) => P.canManageStaff(u.roleKey) || P.canViewEmployeePrivate(u.roleKey),
  labourSummary: (u: NavUser) => P.canViewLabourSummary(u.roleKey),
  payroll: (u: NavUser) => P.canViewPayroll(u.roleKey),
  reports: (u: NavUser) => onSite(u) || P.canViewContract(u.roleKey),
  cost: (u: NavUser) => P.canViewCost(u.roleKey),
  templates: (u: NavUser) => P.canEditProjects(u.roleKey),
  users: (u: NavUser) => P.canManageUsers(u.roleKey),
  companyData: (u: NavUser) => P.canManageCompanyData(u.roleKey),
  ai: (u: NavUser) => canManageAi(u.roleKey),
  subscription: (u: NavUser) => !!u.billing && P.canManageBilling(u.roleKey),
  platform: (u: NavUser) => !!u.platformAdmin,
  books: (u: NavUser) => P.canKeepBooks(u.roleKey),
  machineFinance: (u: NavUser) => P.canManageMachineLoans(u.roleKey),
  supplierPortal: (u: NavUser) => P.canCheckSupplierInvoices(u.roleKey) || P.canManageSupplierLogins(u.roleKey),
  tenders: (u: NavUser) => P.canViewTenders(u.roleKey),
  meetings: (u: NavUser) => onSite(u) || P.canRecordMeetings(u.roleKey),
  materialApprovals: (u: NavUser) => P.canRaiseMaterialApprovals(u.roleKey),
  stores: (u: NavUser) => P.canSeeStores(u.roleKey),
  enquiries: (u: NavUser) => P.canRunSubcontractEnquiries(u.roleKey),
  funds: (u: NavUser) => P.canRequestFunds(u.roleKey) || P.canViewPaymentRequests(u.roleKey),
  modules: (u: NavUser) => canManageModules(u.roleKey),
  rmc: (u: NavUser) => P.canViewRmc(u.roleKey),
  rmcBills: (u: NavUser) => P.canSellRmc(u.roleKey) || P.canBillRmc(u.roleKey),
} satisfies Record<string, (u: NavUser) => boolean>;
export type NavAccessKey = keyof typeof NAV_ACCESS;

export const NAV_TREE: NavNode[] = [
  // ── Home tiles ────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'my-work', parent: null, label: 'My work', icon: 'list-todo', route: '/', family: 'work', nav: 'Home', access: 'internal', status: 'live', badge: 'myWork', description: 'Your day: what waits for you, your projects and their figures, in the order your role needs.', keywords: 'dashboard overview kpi my work today', concord: ['p4-dash'] },
  { id: 'approvals', parent: null, label: 'Approvals', icon: 'inbox', route: '/approvals', family: 'work', access: 'approvals', status: 'live', badge: 'approvals', description: 'Everything waiting for your decision, oldest first.', keywords: 'pending queue approve inbox', concord: ['p7-workflow'] },
  { id: 'projects', parent: null, label: 'Projects', icon: 'folder-kanban', family: 'work', access: 'internal', status: 'live', description: 'Your projects, their schedule, BOQ, budget and handover.', keywords: 'sites boq contract', concord: ['p3-pm', 'p4-pm', 'p5-projects'] },
  { id: 'site', parent: null, label: 'Site', icon: 'hard-hat', family: 'work', access: 'internal', status: 'live', badge: 'module', description: 'Daily reports, labour, progress, measurements and site cash.', concord: ['p5-exec'] },
  { id: 'quality', parent: null, label: 'Quality and safety', icon: 'shield-check', family: 'work', access: 'internal', status: 'live', badge: 'module', description: 'Inspections, tests, NCRs, incidents, permits and toolbox talks.', concord: ['p5-safety'] },
  { id: 'documents', parent: null, label: 'Documents', icon: 'folder-open', family: 'work', access: 'internal', status: 'live', description: 'Drawings, revisions, transmittals, letters and RFIs.', keywords: 'drawings files', concord: ['p7-attach'] },
  { id: 'materials', parent: null, label: 'Materials', icon: 'package', family: 'materials', access: 'internal', status: 'live', badge: 'module', description: 'Material requests, stock at each site, and reconciliation.', keywords: 'store inventory', concord: ['p3-mat', 'p4-stores', 'p5-mat'] },
  { id: 'plant', parent: null, label: 'Plant and machinery', icon: 'tractor', family: 'materials', access: 'internal', status: 'live', badge: 'module', description: 'Machine logs, fuel, use, maintenance, papers and drivers.', keywords: 'equipment vehicles fleet asset', concord: ['p3-asset', 'p4-pnm', 'p5-pnm'] },
  { id: 'purchases', parent: null, label: 'Purchases', icon: 'shopping-cart', family: 'buying', access: 'internal', status: 'live', badge: 'module', description: 'Purchase orders, deliveries, supplier bills and suppliers.', keywords: 'procurement buying', concord: ['p4-proc'] },
  { id: 'subcontracts', parent: null, label: 'Subcontracts', icon: 'handshake', family: 'buying', access: 'internal', status: 'live', description: 'Work orders, subcontractor bills and labour contractors.', concord: ['p5-sub'] },
  { id: 'billing', parent: null, label: 'Client billing', icon: 'receipt-indian-rupee', family: 'money', access: 'internal', status: 'live', badge: 'module', description: 'RA bills, variations, what clients owe, guarantees.', concord: ['p5-billing', 'p4-bm'] },
  { id: 'accounts', parent: null, label: 'Accounts', icon: 'landmark', family: 'money', access: 'internal', status: 'live', description: 'Payables and payments, books, statements, GST and Tally.', keywords: 'finance', concord: ['p3-fa', 'p4-fa', 'p5-fa'] },
  { id: 'people', parent: null, label: 'People', icon: 'users', family: 'people', access: 'internal', status: 'live', badge: 'module', description: 'Your attendance and leave, staff records, holidays.', keywords: 'hr staff employees', concord: ['p3-hr', 'p5-hrms'] },
  { id: 'payroll', parent: null, label: 'Payroll', icon: 'banknote', family: 'people', access: 'internal', status: 'live', description: 'Salary runs, payslips, PF, ESI, PT and TDS, loans.', keywords: 'salary wages', concord: ['p4-payroll'] },
  { id: 'tenders', parent: null, label: 'Tenders', icon: 'gavel', family: 'business', access: 'tenders', status: 'live', description: 'Tenders being priced and bid, and the schedules of rates they are priced from.', keywords: 'bid boq sor', concord: ['p3-tender', 'p4-tendering'] },
  { id: 'rmc', parent: null, label: 'RMC plant', icon: 'factory', family: 'business', access: 'rmc', status: 'live', description: 'Ready-mix concrete: quotes and orders, the plant\'s day, trucks and challans, cubes and bills.', keywords: 'ready mix batching plant concrete', concord: ['p4-plantperf'] },
  { id: 'reports', parent: null, label: 'Reports', icon: 'chart-column', family: 'insight', access: 'internal', status: 'live', description: 'Progress reports, project cost, cash flow and more.', keywords: 'mis dashboard', concord: ['p7-finrep'] },
  { id: 'watch', parent: null, label: 'Watch list', icon: 'eye', route: '/watch-list', family: 'insight', access: 'watchList', status: 'live', badge: 'watchOpen', description: 'Early warnings: slipping work, cash gaps, stock running out.', keywords: 'early warnings alerts forecast risk slipping cash gap running out' },
  { id: 'admin', parent: null, label: 'Admin', icon: 'settings', family: 'admin', access: 'internal', status: 'live', description: 'Users, approval rules, modules and the subscription.', keywords: 'settings' },

  // ── Projects ──────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'projects.all', parent: 'projects', label: 'All projects', icon: 'folder-kanban', route: '/projects', nav: 'Projects', top: true, access: 'internal', status: 'live', description: 'Every project you work on, by stage.', keywords: 'sites boq contract', concord: ['p5-projects', 'p11-projdash'] },
  { id: 'projects.schedule', parent: 'projects', label: 'Schedule', icon: 'chart-gantt', projectTab: 'schedule', access: 'internal', status: 'live', description: 'Gantt chart with the baseline and milestones.', keywords: 'gantt plan critical path look-ahead', concord: ['p4-pce'] },
  { id: 'projects.lookahead', parent: 'projects', label: 'Look-ahead', icon: 'calendar-range', projectTab: 'lookahead', access: 'internal', status: 'live', description: 'The next three weeks: what is ready to start and what still waits.', keywords: 'three week lookahead critical path float' },
  { id: 'projects.boq', parent: 'projects', label: 'BOQ and activities', icon: 'list-checks', projectTab: 'boq', access: 'internal', status: 'live', description: 'Bill of quantities and the activities under it.', keywords: 'boq items', concord: ['p4-pce'] },
  { id: 'projects.budget', parent: 'projects', label: 'Budget and cash flow', icon: 'calculator', projectTab: 'budget', access: 'cost', status: 'live', description: 'Budget per cost head and the planned cash flow.', concord: ['p5-plan'] },
  { id: 'projects.earned', parent: 'projects', label: 'Earned value', icon: 'gauge', projectTab: 'earned-value', access: 'cost', status: 'live', description: 'Planned, earned and actual value; SPI, CPI, the forecast finish and the S-curve.', keywords: 'evm spi cpi eac s-curve' },
  { id: 'projects.handover', parent: 'projects', label: 'Handover and closure', icon: 'file-check', projectTab: 'handover', access: 'internal', status: 'live', description: 'Snags, completion, defect liability and close-out.', keywords: 'closure snags dlp', concord: ['p5-closure'] },
  { id: 'projects.templates', parent: 'projects', label: 'Activity templates', icon: 'layers', route: '/templates', access: 'templates', status: 'live', description: 'Standard activities per project type.', keywords: 'wbs' },

  // ── Site ──────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'site.dpr', parent: 'site', label: 'Daily reports', icon: 'clipboard-list', route: '/dpr', access: 'onSite', status: 'live', badge: 'dprMissing', description: 'The day at each site: work, labour, machines, weather, hold-ups.', keywords: 'dpr daily progress report diary', concord: ['p5-exec'] },
  { id: 'site.attendance', parent: 'site', label: 'Labour attendance', icon: 'users-round', route: '/attendance', nav: 'Attendance', access: 'attendance', status: 'live', description: 'Head count, roll call, workers and the monthly muster.', keywords: 'labour manpower muster workers', concord: ['p5-labour'] },
  { id: 'site.progress', parent: 'site', label: 'Progress entries', icon: 'trending-up', route: '/progress', access: 'onSite', status: 'live', description: 'Quantities done against each activity.', keywords: 'work done quantity', concord: ['p5-exec', 'p4-bm'] },
  { id: 'site.mb', parent: 'site', label: 'Measurement book', icon: 'ruler', route: '/measurements', access: 'measure', status: 'live', badge: 'mbWaiting', description: "Measured quantities for the client's bill.", keywords: 'mb measurements', concord: ['p5-progress'] },
  { id: 'site.risks', parent: 'site', label: 'Delays and risks', icon: 'triangle-alert', route: '/risks', access: 'risks', status: 'live', description: 'Hindrances, extensions of time and liquidated damages.', keywords: 'hindrance issues eot ld' },
  { id: 'site.expenses', parent: 'site', label: 'Site expenses', icon: 'wallet', route: '/expenses', access: 'expenses', status: 'live', description: 'Petty expenses with bills and approval.', keywords: 'petty cash imprest' },
  { id: 'site.imprest', parent: 'site', label: 'Site imprest', icon: 'hand-coins', route: '/imprest', access: 'imprest', status: 'live', description: 'Cash floats at the sites, top-ups and the cash book.', keywords: 'petty cash float top-up' },
  { id: 'site.meetings', parent: 'site', label: 'Meetings', icon: 'calendar-check', route: '/meetings', access: 'meetings', status: 'live', description: "Minutes of each project's meetings, and the actions they gave out until each is done.", keywords: 'mom minutes of meeting action items progress review client meeting decisions' },
  { id: 'site.funds', parent: 'site', label: 'Site fund requests', icon: 'piggy-bank', route: '/imprest?tab=funds', access: 'funds', status: 'live', description: 'A site asks head office for money for wages, a local purchase or running costs.', keywords: 'fund request money wages advance' },

  // ── Quality and safety (split out of Site) ────────────────────────────────────────────────────────────────────
  { id: 'quality.inspections', parent: 'quality', label: 'Inspections', icon: 'clipboard-check', route: '/inspections?tab=inspections', nav: 'Quality', access: 'onSite', status: 'live', badge: 'qualityWaiting', description: 'Inspection requests with hold points.', keywords: 'qa qc inspections tests ncr hold point', concord: ['p5-safety'] },
  { id: 'quality.tests', parent: 'quality', label: 'Material tests', icon: 'flask-conical', route: '/inspections?tab=tests', access: 'onSite', status: 'live', description: 'Cube, slump and other tests with results due.', concord: ['p5-safety'] },
  { id: 'quality.ncrs', parent: 'quality', label: 'NCRs', icon: 'shield-alert', route: '/inspections?tab=ncrs', access: 'onSite', status: 'live', badge: 'ncrsOpen', description: 'Non-conformance reports until closed.', concord: ['p5-safety'] },
  { id: 'quality.checklists', parent: 'quality', label: 'Checklists', icon: 'list-checks', route: '/inspections?tab=checklists', access: 'checklists', status: 'live', description: "The company's inspection checklists." },
  { id: 'quality.incidents', parent: 'quality', label: 'Incidents', icon: 'siren', route: '/safety?tab=incidents', nav: 'Safety', access: 'onSite', status: 'live', description: 'Incidents and near misses.', keywords: 'incident near miss toolbox talk permit to work ppe accident', concord: ['p5-safety'] },
  { id: 'quality.permits', parent: 'quality', label: 'Permits to work', icon: 'file-pen-line', route: '/safety?tab=permits', access: 'onSite', status: 'live', badge: 'permitsWaiting', description: 'Permits for height, hot and confined work.', concord: ['p5-safety'] },
  { id: 'quality.talks', parent: 'quality', label: 'Toolbox talks', icon: 'message-square-text', route: '/safety?tab=talks', access: 'onSite', status: 'live', description: 'Talks held at the sites and who attended.', concord: ['p5-safety'] },
  { id: 'quality.ppe', parent: 'quality', label: 'PPE', icon: 'shield', route: '/safety?tab=ppe', access: 'onSite', status: 'live', description: 'Safety gear issued to workers.', concord: ['p5-safety'] },

  // ── Documents (out of Site) ───────────────────────────────────────────────────────────────────────────────────
  { id: 'documents.register', parent: 'documents', label: 'Drawings and documents', icon: 'file-stack', route: '/documents?tab=register', nav: 'Documents', access: 'internal', status: 'live', description: 'Drawings and their revisions, GFC status and the drawing viewer.', keywords: 'drawings files rfi', concord: ['p7-attach'] },
  { id: 'documents.transmittals', parent: 'documents', label: 'Transmittals', icon: 'send', route: '/documents?tab=transmittals', access: 'internal', status: 'live', description: 'Documents sent and acknowledged.' },
  { id: 'documents.letters', parent: 'documents', label: 'Letters', icon: 'scroll-text', route: '/documents?tab=letters', access: 'letters', status: 'live', badge: 'lettersDue', description: 'Numbered letters in and out, replies due.' },
  { id: 'documents.rfis', parent: 'documents', label: 'RFIs', icon: 'circle-help', route: '/documents?tab=rfis', access: 'internal', status: 'live', badge: 'rfisOpen', description: 'Questions to the designer, waiting for answers.' },

  // ── Materials ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'materials.requests', parent: 'materials', label: 'Material requests', icon: 'shopping-basket', route: '/material-requests', access: 'materialRequests', status: 'live', badge: 'mrWaiting', description: 'What the sites need, approved and ordered or issued.', keywords: 'indent mr', concord: ['p5-mat', 'p3-mat'] },
  { id: 'materials.approvals', parent: 'materials', label: 'Material approvals', icon: 'award', route: '/material-approvals', access: 'materialApprovals', status: 'live', description: 'Makes and samples sent to the client or consultant for approval, and the makes each project may buy.', keywords: 'mar make approval sample submittal approved makes brand list' },
  { id: 'materials.stock', parent: 'materials', label: 'Stock on hand', icon: 'boxes', route: '/stock', nav: 'Stock', access: 'stock', status: 'live', badge: 'lowStock', description: 'What each site holds, with low-stock alerts.', keywords: 'inventory grn store issue', concord: ['p4-stores'] },
  { id: 'materials.register', parent: 'materials', label: 'Receipts and issues', icon: 'arrow-left-right', route: '/stock?sub=register', access: 'stock', status: 'live', description: 'GRNs, issues, transfers, returns and counts.', keywords: 'grn issue transfer', concord: ['p4-stores'] },
  { id: 'materials.value', parent: 'materials', label: 'Value and ageing', icon: 'hourglass', route: '/stock?sub=valuation', access: 'stockValue', status: 'live', description: 'Stock value and idle material by age.', concord: ['p9-stockage', 'p9-notused'] },
  { id: 'materials.reconciliation', parent: 'materials', label: 'Material reconciliation', icon: 'scale', projectTab: 'reconciliation', access: 'reconciliation', status: 'live', description: 'Material used against the work done, wastage by reason.', keywords: 'wastage consumption theoretical', concord: ['p9-notused'] },
  { id: 'materials.store', parent: 'materials', label: 'Central stores', icon: 'warehouse', route: '/stores', access: 'stores', status: 'live', description: 'The company stores and yards: what each holds, its value and age, and what is on the road to the sites.', keywords: 'yard warehouse godown central store transfer' },
  { id: 'materials.items', parent: 'materials', label: 'Item master', icon: 'package', route: '/stock?sub=items', access: 'stock', status: 'live', description: 'Materials, units and minimum levels.' },

  // ── Plant and machinery ───────────────────────────────────────────────────────────────────────────────────────
  { id: 'plant.logs', parent: 'plant', label: 'Daily logs', icon: 'notebook-pen', route: '/machinery?tab=logs', nav: 'Machinery', access: 'machinery', status: 'live', description: 'Hours, idle time, breakdowns and diesel per machine.', keywords: 'plant equipment fuel hours', concord: ['p5-pnm', 'p4-pnm'] },
  { id: 'plant.fuel', parent: 'plant', label: 'Fuel', icon: 'fuel', route: '/machinery?tab=fuel', access: 'machinery', status: 'live', description: 'Diesel issued, daily position and efficiency against norms.', concord: ['p9-fuel'] },
  { id: 'plant.utilisation', parent: 'plant', label: 'Utilisation', icon: 'gauge', route: '/machinery?tab=utilisation', access: 'machinery', status: 'live', description: 'Availability against use across the fleet.', concord: ['p9-avail'] },
  { id: 'plant.maintenance', parent: 'plant', label: 'Maintenance', icon: 'wrench', route: '/machinery?tab=maintenance', access: 'machinery', status: 'live', badge: 'machinesDown', description: 'Job cards, services due and breakdowns.', keywords: 'job card service breakdown' },
  { id: 'plant.papers', parent: 'plant', label: 'Papers and drivers', icon: 'id-card', route: '/machinery?tab=papers', access: 'machinery', status: 'live', badge: 'papersDue', description: 'Insurance, fitness, permits and licences due.' },
  { id: 'plant.equipment', parent: 'plant', label: 'Equipment register', icon: 'construction', route: '/machinery?tab=equipment', access: 'machinery', status: 'live', description: 'Own and hired machines, tyres and batteries.', concord: ['p3-asset'] },
  { id: 'plant.finance', parent: 'plant', label: 'Machine loans', icon: 'badge-indian-rupee', shortcutOf: 'accounts.machineLoans', access: 'machineFinance', status: 'live', description: 'Loans on financed machines, EMIs paid and due.' },

  // ── Purchases ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'purchases.orders', parent: 'purchases', label: 'Purchase orders', icon: 'file-text', route: '/purchase-orders', access: 'purchaseOrders', status: 'live', badge: 'poWaiting', description: 'Quotations, comparison and orders.', keywords: 'po', concord: ['p4-proc'] },
  { id: 'purchases.delivery', parent: 'purchases', label: 'Delivery status', icon: 'truck', route: '/purchase-orders?tab=status', access: 'purchaseOrders', status: 'live', description: 'What is still to come on each order.' },
  { id: 'purchases.bills', parent: 'purchases', label: 'Vendor bills', icon: 'receipt', route: '/vendor-bills', access: 'vendorBills', status: 'live', badge: 'vendorBillsWaiting', description: 'Supplier, hire and service bills checked against orders.', keywords: 'supplier invoice' },
  { id: 'purchases.suppliers', parent: 'purchases', label: 'Suppliers', icon: 'contact', route: '/vendors?kind=SUPPLIER', nav: 'Vendors', access: 'vendors', status: 'live', description: 'Suppliers with GST, MSME and bank details.', keywords: 'suppliers' },
  { id: 'purchases.portal', parent: 'purchases', label: 'Supplier inbox', icon: 'mail', route: '/supplier-inbox', access: 'supplierPortal', status: 'live', description: 'Invoices suppliers sent on their portal, and the changes to their details they asked for.', keywords: 'supplier portal invoices bank change logins', concord: ['p7-portals'] },

  // ── Subcontracts (out of Purchases) ───────────────────────────────────────────────────────────────────────────
  { id: 'subcontracts.orders', parent: 'subcontracts', label: 'Work orders', icon: 'hammer', route: '/work-orders', access: 'workOrders', status: 'live', description: 'Orders to subcontractors and petty contractors.', keywords: 'wo subcontract', concord: ['p5-sub'] },
  { id: 'subcontracts.bills', parent: 'subcontracts', label: 'Subcontractor bills', icon: 'receipt-text', route: '/subcontract-bills', access: 'subcontractBills', status: 'live', badge: 'scBillsWaiting', description: 'Running bills with retention and recoveries.', keywords: 'petty contractor', concord: ['p5-sub'] },
  { id: 'subcontracts.enquiries', parent: 'subcontracts', label: 'Subcontract enquiries', icon: 'scale', route: '/subcontract-enquiries', access: 'enquiries', status: 'live', description: 'Work sent to subcontractors to quote, their rates compared item by item, and the chosen quote made a work order.', keywords: 'quote quotation comparative statement cs rfq l1 subcontractor rates award' },
  { id: 'subcontracts.vendors', parent: 'subcontracts', label: 'Subcontractors', icon: 'contact', route: '/vendors?kind=SUBCONTRACTOR', access: 'vendors', status: 'live', description: 'Subcontractors with GST and bank details.' },
  { id: 'subcontracts.labour', parent: 'subcontracts', label: 'Labour contractors', icon: 'pickaxe', shortcutOf: 'payroll.contractors', access: 'labourSummary', status: 'live', description: "Labour contractors' man-days each month.", concord: ['p5-labour'] },

  // ── Client billing ────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'billing.bills', parent: 'billing', label: 'RA bills', icon: 'receipt-indian-rupee', route: '/bills', access: 'bills', status: 'live', badge: 'billsWaiting', description: 'Running account bills from the measurement book.', keywords: 'running account invoice client bill', concord: ['p5-billing', 'p4-bm'] },
  { id: 'billing.variations', parent: 'billing', label: 'Variations', icon: 'diff', route: '/variations', access: 'variations', status: 'live', description: 'Extra and changed items sent to the client.', keywords: 'extra items deviation', concord: ['p5-progress'] },
  { id: 'billing.receivables', parent: 'billing', label: 'Receivables', icon: 'coins', route: '/receivables', access: 'contract', status: 'live', description: 'What clients owe, by age.', keywords: 'collections retention' },
  { id: 'billing.receipts', parent: 'billing', label: 'Money received', icon: 'indian-rupee', route: '/receivables?tab=receipts', access: 'contract', status: 'live', description: 'Receipts from clients and retention released.' },
  { id: 'billing.clients', parent: 'billing', label: 'Clients', icon: 'building-2', route: '/clients', access: 'clients', status: 'live', description: 'Clients and their contacts.', keywords: 'customers', concord: ['p4-crm'] },
  { id: 'billing.guarantees', parent: 'billing', label: 'Guarantees and licences', icon: 'file-badge', route: '/compliance', access: 'compliance', status: 'live', description: 'Bank guarantees, EMDs, insurance and licences with renewals.', keywords: 'bank guarantee bg insurance car policy licence labour expiry', concord: ['p4-bglc'] },

  // ── Accounts (Payables out of Purchases, plus items 102 and 103) ──────────────────────────────────────────────
  { id: 'accounts.payables', parent: 'accounts', group: 'Payments', label: 'Payables', icon: 'wallet-cards', route: '/payables', access: 'payables', status: 'live', description: 'What we owe, by age and MSME due date.', keywords: 'payments due msme' },
  { id: 'accounts.requests', parent: 'accounts', group: 'Payments', label: 'Payment requests', icon: 'send', route: '/payables?tab=requests', access: 'paymentRequests', status: 'live', badge: 'paymentRequestsWaiting', description: 'Requests to release money, and advances.', keywords: 'advance' },
  { id: 'accounts.payments', parent: 'accounts', group: 'Payments', label: 'Payments', icon: 'banknote', route: '/payables?tab=payments', access: 'payables', status: 'live', description: 'Money paid out, with TDS and deductions.' },
  { id: 'accounts.debitNotes', parent: 'accounts', group: 'Payments', label: 'Debit notes', icon: 'file-minus', route: '/payables?tab=debit-notes', access: 'debitNotes', status: 'live', description: 'Shortage, excess and returns that reduce what we owe.' },
  { id: 'accounts.vouchers', parent: 'accounts', group: 'Books', label: 'Vouchers', icon: 'notebook-tabs', route: '/books?tab=vouchers', access: 'books', status: 'live', description: 'Payment, receipt, contra and journal vouchers, with approval.', keywords: 'jv contra journal' },
  { id: 'accounts.daybooks', parent: 'accounts', group: 'Books', label: 'Day book', icon: 'book-open', route: '/books?tab=day', nav: 'Books', access: 'books', status: 'live', description: 'Every entry in the books, day by day.', keywords: 'accounts day book journal' },
  { id: 'accounts.cashbooks', parent: 'accounts', group: 'Books', label: 'Cash and bank books', icon: 'wallet', route: '/books?tab=cash', access: 'books', status: 'live', description: 'Cash in hand and each bank account, entry by entry.', keywords: 'cash book bank book' },
  { id: 'accounts.ledgers', parent: 'accounts', group: 'Books', label: 'Ledgers', icon: 'book-text', route: '/books?tab=ledgers', access: 'books', status: 'live', description: 'Ledger accounts with projects as cost centres.', keywords: 'ledger' },
  { id: 'accounts.chart', parent: 'accounts', group: 'Books', label: 'Chart of accounts', icon: 'network', route: '/books?tab=accounts', access: 'books', status: 'live', description: 'Groups and ledgers.', keywords: 'coa groups' },
  { id: 'accounts.trialBalance', parent: 'accounts', group: 'Statements', label: 'Trial balance', icon: 'scale', route: '/statements?tab=trial', nav: 'Financial statements', access: 'books', status: 'live', description: 'Every account in a period, by group or by project.', keywords: 'tb site-wise', concord: ['p9-tb', 'p7-finrep'] },
  { id: 'accounts.pl', parent: 'accounts', group: 'Statements', label: 'Profit and loss', icon: 'chart-line', route: '/statements?tab=pl', access: 'books', status: 'live', description: 'Income and expense for the period.', concord: ['p9-pl', 'p7-finrep'] },
  { id: 'accounts.balanceSheet', parent: 'accounts', group: 'Statements', label: 'Balance sheet', icon: 'columns-2', route: '/statements?tab=bs', access: 'books', status: 'live', description: 'Assets and liabilities at a date, in Schedule III order.', keywords: 'schedule iii', concord: ['p7-finrep'] },
  { id: 'accounts.bankReco', parent: 'accounts', group: 'Statements', label: 'Bank reconciliation', icon: 'check-check', route: '/statements?tab=bank', access: 'books', status: 'live', description: 'Bank statement matched to the bank book.', keywords: 'brs' },
  { id: 'accounts.yearClose', parent: 'accounts', group: 'Statements', label: 'Opening and year close', icon: 'lock', route: '/statements?tab=year', access: 'books', status: 'live', description: 'Opening balances, locking a period and closing a financial year.', keywords: 'opening balance lock year end' },
  { id: 'accounts.gst', parent: 'accounts', group: 'Tax and Tally', label: 'GST registers', icon: 'percent', route: '/gst', access: 'gst', status: 'live', description: 'GSTR-1 and 2B.', keywords: 'tax gstr' },
  { id: 'accounts.tally', parent: 'accounts', group: 'Tax and Tally', label: 'Tally export', icon: 'file-spreadsheet', route: '/tally', access: 'tally', status: 'live', description: 'Vouchers for Tally with projects as cost centres.', keywords: 'accounts vouchers', concord: ['p7-legacy'] },
  { id: 'accounts.machineLoans', parent: 'accounts', label: 'Machine loans', icon: 'badge-indian-rupee', route: '/machine-loans', access: 'machineFinance', status: 'live', description: 'Loans on financed machines: EMI schedules, EMIs paid and due, and what is owed to each lender.', keywords: 'equipment finance emi hypothecation lender bank nbfc loan schedule interest' },

  // ── People ────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'people.me', parent: 'people', label: 'My attendance and leave', icon: 'calendar-days', route: '/staff', nav: 'Staff and leave', access: 'internal', status: 'live', description: 'Check in, apply for leave, see your balance.', keywords: 'employees hr' },
  { id: 'people.payslips', parent: 'people', label: 'My payslips', icon: 'receipt-text', route: '/staff?tab=payslips', access: 'internal', status: 'live', description: 'Your payslips by month, once the month is approved.', keywords: 'salary slip' },
  { id: 'people.leave', parent: 'people', label: 'Leave to decide', icon: 'calendar-check', route: '/staff?tab=leave', access: 'markStaff', status: 'live', badge: 'leaveToDecide', description: 'Leave and on-duty requests waiting on you.' },
  { id: 'people.overtime', parent: 'people', label: 'Overtime', icon: 'clock', route: '/staff?tab=overtime', access: 'markStaff', status: 'live', badge: 'overtimeToDecide', description: 'Overtime to approve.' },
  { id: 'people.register', parent: 'people', label: 'Staff register', icon: 'clipboard-list', route: '/staff?tab=register', access: 'markStaff', status: 'live', description: "Today's staff attendance at your sites." },
  { id: 'people.employees', parent: 'people', label: 'Employees', icon: 'id-card', route: '/staff?tab=staff', access: 'markStaff', status: 'live', description: 'Employee records, from joining to exit.', keywords: 'staff master', concord: ['p3-hr', 'p5-hrms'] },
  { id: 'people.letters', parent: 'people', label: 'Service records', icon: 'scroll-text', route: '/staff?tab=service', access: 'hrRecords', status: 'live', description: 'Confirmations, transfers, promotions, increments and exits, with their letters.', keywords: 'hr letters transfer promotion increment warning exit' },
  { id: 'people.holidays', parent: 'people', label: 'Holidays', icon: 'calendar', route: '/staff?tab=holidays', access: 'internal', status: 'live', description: 'Holidays by site.' },
  { id: 'people.biometric', parent: 'people', label: 'Biometric devices', icon: 'fingerprint-pattern', route: '/biometric', access: 'biometric', status: 'live', description: 'Fingerprint and face devices, who is enrolled on them, and their punches marking attendance.', keywords: 'fingerprint face punch attendance machine zkteco essl adms', concord: ['p7-bio'] },

  // ── Payroll ───────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'payroll.runs', parent: 'payroll', label: 'Salary runs', icon: 'banknote', route: '/payroll?tab=runs', nav: 'Payroll', access: 'payroll', status: 'live', description: 'Prepare, approve and pay a month, with payslips, the bank file and the PF and ESI files.', keywords: 'salary wages payslip pf esi tds bank file', concord: ['p4-payroll'] },
  { id: 'payroll.structures', parent: 'payroll', label: 'Salaries', icon: 'layers', route: '/payroll?tab=salaries', access: 'payroll', status: 'live', description: "Each person's salary from a date, with PF, ESI, PT and TDS and the CTC.", keywords: 'salary structure ctc' },
  { id: 'payroll.loans', parent: 'payroll', label: 'Loans and advances', icon: 'hand-coins', route: '/payroll?tab=loans', access: 'payroll', status: 'live', description: 'Staff loans and advances recovered from salary.', keywords: 'advance recovery' },
  { id: 'payroll.settlement', parent: 'payroll', label: 'Full and final', icon: 'user-minus', route: '/payroll?tab=settlements', access: 'payroll', status: 'live', description: 'Settlement when someone leaves: last salary, leave encashment, gratuity.', keywords: 'gratuity settlement exit' },
  { id: 'payroll.inputs', parent: 'payroll', label: 'Staff inputs', icon: 'clipboard-list', route: '/payroll?tab=staff', access: 'payroll', status: 'live', description: 'Days, leave and overtime per person each month.', keywords: 'attendance inputs' },
  { id: 'payroll.contractors', parent: 'payroll', label: 'Labour contractors', icon: 'hard-hat', route: '/payroll?tab=contractors', nav: 'Payroll', access: 'labourSummary', status: 'live', description: "Labour contractors' man-days each month.", keywords: 'labour man-days wages' },
  { id: 'payroll.settings', parent: 'payroll', label: 'Payroll settings', icon: 'settings', route: '/payroll?tab=settings', access: 'payroll', status: 'live', description: 'PF and ESI rates, professional tax state, paid days and overtime.', keywords: 'pf esi pt rates' },
  { id: 'payroll.statutory', parent: 'payroll', label: 'TDS returns', icon: 'landmark', access: 'payroll', status: 'planned', description: 'TDS returns (24Q) and Form 16; the PF and ESI files come with each salary run.' },

  // ── Tenders (item 110) ────────────────────────────────────────────────────────────────────────────────────────
  { id: 'tenders.register', parent: 'tenders', label: 'Tenders', icon: 'gavel', route: '/tenders', access: 'tenders', status: 'live', description: 'Tenders being priced and bid: the bid BOQ from rate analysis, the quote on the SOR, bids at opening and the result.', keywords: 'bid bidding nit emd l1 quote estimate rate analysis results', concord: ['p4-tendering', 'p3-tender', 'p5-bd'] },
  { id: 'tenders.sor', parent: 'tenders', label: 'Schedule of rates', icon: 'library', route: '/schedule-of-rates', access: 'tenders', status: 'live', description: 'State SORs, the CPWD DSR and own rates that bids are priced against, imported from Excel.', keywords: 'sor dsr cpwd pwd rates book item code analysis' },

  // ── RMC plant (item 104) ──────────────────────────────────────────────────────────────────────────────────────
  { id: 'rmc.schedule', parent: 'rmc', label: 'The day at the plant', icon: 'calendar-clock', route: '/rmc?tab=day', nav: 'RMC plant', access: 'rmc', status: 'live', description: 'Pours planned for the day, trucks out and the plant\'s stock.', keywords: 'production schedule batching', concord: ['p4-plantperf'] },
  { id: 'rmc.orders', parent: 'rmc', label: 'Quotes and orders', icon: 'file-text', route: '/rmc?tab=orders', access: 'rmc', status: 'live', description: 'Customer quotes and sales orders for concrete.', keywords: 'quotation sales order customer grade m3' },
  { id: 'rmc.batches', parent: 'rmc', label: 'Trucks and challans', icon: 'truck', route: '/rmc?tab=batches', access: 'rmc', status: 'live', description: 'Batches sent out with their challans, the stock they drew and their cube results.', keywords: 'batch report delivery challan transit mixer pump cube test', concord: ['p4-plantperf'] },
  { id: 'rmc.mixes', parent: 'rmc', label: 'Mix designs', icon: 'flask-round', route: '/rmc?tab=designs', access: 'rmc', status: 'live', description: 'What goes into a cubic metre of each grade, its cost, and quality\'s approval.', keywords: 'mix design grade recipe' },
  { id: 'rmc.sales', parent: 'rmc', label: 'Bills and money received', icon: 'receipt-indian-rupee', route: '/rmc?tab=bills', access: 'rmcBills', status: 'live', description: 'Concrete bills with GST and the money received.', keywords: 'sales invoice receipt gst' },

  // ── Reports ───────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'reports.progress', parent: 'reports', label: 'Progress reports', icon: 'file-text', route: '/reports', access: 'reports', status: 'live', description: 'Monthly and weekly progress reports as PDF.', keywords: 'pdf mis monthly weekly', concord: ['p9-status', 'p11-projdash'] },
  { id: 'reports.cost', parent: 'reports', label: 'Project cost', icon: 'chart-pie', route: '/cost', access: 'cost', status: 'live', description: 'Budget against actual by cost head, margin per BOQ item.', keywords: 'budget cash flow margin job cost', concord: ['p9-budget', 'p9-jobcost', 'p9-cumbudget', 'p9-clientsub'] },
  { id: 'reports.cashflow', parent: 'reports', label: 'Cash flow', icon: 'chart-line', route: '/cost?tab=cash-flow', access: 'cost', status: 'live', description: 'Money in and out by month, planned and actual.' },
  { id: 'reports.estimate', parent: 'reports', label: 'Cost estimate', icon: 'calculator', projectTab: 'reconciliation', projectQuery: 'sub=estimate', access: 'reconciliation', status: 'live', description: 'Cost of a BOQ from the rate analysis.', keywords: 'rate analysis estimation', concord: ['p9-estimate'] },
  { id: 'reports.stockAge', parent: 'reports', label: 'Stock ageing', icon: 'hourglass', shortcutOf: 'materials.value', access: 'stockValue', status: 'live', description: 'Idle stock by age.', concord: ['p9-stockage'] },
  { id: 'reports.utilisation', parent: 'reports', label: 'Machine utilisation', icon: 'gauge', shortcutOf: 'plant.utilisation', access: 'machinery', status: 'live', description: 'Availability against use.', concord: ['p9-avail'] },
  { id: 'reports.fuel', parent: 'reports', label: 'Fuel efficiency', icon: 'fuel', shortcutOf: 'plant.fuel', access: 'machinery', status: 'live', description: 'Litres per hour against each machine\'s norm.', concord: ['p9-fuel'] },
  { id: 'reports.pl', parent: 'reports', label: 'Profit and loss', icon: 'chart-line', shortcutOf: 'accounts.pl', access: 'books', status: 'live', description: 'Income and expense for the period.', concord: ['p9-pl'] },
  { id: 'reports.tb', parent: 'reports', label: 'Site-wise trial balance', icon: 'scale', shortcutOf: 'accounts.trialBalance', access: 'books', status: 'live', description: 'Trial balance with a column per site.', concord: ['p9-tb'] },

  // ── Admin ─────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'admin.users', parent: 'admin', label: 'Users', icon: 'user-cog', route: '/users', access: 'users', status: 'live', description: 'Invite people and set their role.', keywords: 'invite roles access' },
  { id: 'admin.rules', parent: 'admin', label: 'Approval rules', icon: 'git-branch', route: '/approval-rules', access: 'users', status: 'live', description: 'Who approves what, levels, limits and escalation.', keywords: 'matrix limits', concord: ['p7-workflow'] },
  { id: 'admin.modules', parent: 'admin', label: 'Modules', icon: 'toggle-right', route: '/company-modules', access: 'modules', status: 'live', description: 'Turn off the modules the company does not use; their data is kept.', keywords: 'switch on off turn features plan hide' },
  { id: 'admin.home', parent: 'admin', label: 'Home tiles', icon: 'layout-grid', route: '/admin/home-tiles', access: 'users', status: 'planned', description: 'Mark modules as new or featured; see access requests.' },
  { id: 'admin.data', parent: 'admin', label: 'Data and privacy', icon: 'database', route: '/company-data', access: 'companyData', status: 'live', description: 'Export or delete company data.', keywords: 'export delete' },
  { id: 'admin.ai', parent: 'admin', label: `Ask ${PRODUCT_NAME}`, icon: 'sparkles', route: '/ai-settings', access: 'ai', status: 'live', description: 'Who may ask, allowance and the conversation log.', keywords: 'ai assistant chat allowance' },
  { id: 'admin.billing', parent: 'admin', label: 'Subscription', icon: 'credit-card', route: '/billing', access: 'subscription', status: 'live', description: 'Plan, invoices and renewal.', keywords: 'billing plan invoice pay renew' },
  { id: 'admin.platform', parent: 'admin', label: `${PRODUCT_NAME} console`, icon: 'server', route: '/platform', access: 'platform', status: 'live', description: `Companies and support sessions, for ${PRODUCT_NAME} staff.`, keywords: 'platform companies support' },
];

const BY_ID = new Map(NAV_TREE.map((n) => [n.id, n]));

export const navNode = (id: string): NavNode | undefined => BY_ID.get(id);

/** The node a tile opens: itself, or the one it is a shortcut of. */
export const navTarget = (node: NavNode): NavNode => (node.shortcutOf ? (BY_ID.get(node.shortcutOf) ?? node) : node);

/** Whether this user sees the node: live, allowed, and (a module) with a page they see. */
export function canSeeNav(user: NavUser, node: NavNode): boolean {
  if (node.status !== 'live' || !NAV_ACCESS[node.access](user)) return false;
  if (node.route && pathIsOff(node.route, user.modulesOff)) return false;
  if (node.shortcutOf) {
    const target = BY_ID.get(node.shortcutOf);
    return !!target && target !== node && canSeeNav(user, target);
  }
  if (node.route || node.projectTab) return true;
  return NAV_TREE.some((c) => c.parent === node.id && canSeeNav(user, c));
}

/** The tiles under a module (or Home's modules, for `null`) this user sees, in the tree's order. */
export const navTilesFor = (user: NavUser, parent: string | null): NavNode[] => NAV_TREE.filter((n) => n.parent === parent && canSeeNav(user, n));

/** Where a tile goes: a page, or a tab of the header's project. */
export type NavDestination = { kind: 'page'; href: string } | { kind: 'project'; tab: string; query?: string };

export function navDestination(node: NavNode): NavDestination | null {
  const target = navTarget(node);
  if (target.route) return { kind: 'page', href: target.route };
  if (target.projectTab) return { kind: 'project', tab: target.projectTab, query: target.projectQuery };
  return null;
}

/** A project tab's address. */
export const projectTabHref = (projectId: string, tab: string, query?: string) => `/projects/${projectId}?tab=${tab}${query ? `&${query}` : ''}`;

/** A sidebar link: a page of its own (no query), under its own name or its `nav` name. */
export interface NavPageLink {
  href: string;
  label: string;
  node: NavNode;
}

export function navPageLink(node: NavNode): NavPageLink | null {
  if (node.nav === false || !node.route || node.shortcutOf) return null;
  const [path, query] = node.route.split('?');
  if (query && typeof node.nav !== 'string') return null;
  return { href: path, label: typeof node.nav === 'string' ? node.nav : node.label, node };
}

/** The modules on Home, as module keys (every module without a route of its own). */
export const NAV_MODULE_IDS = NAV_TREE.filter((n) => n.parent === null && !n.route).map((n) => n.id);

/** A sidebar link: a page, or a module's screen (`overview`). */
export interface NavSidebarLink {
  href: string;
  label: string;
  node: NavNode;
  overview?: boolean;
}

/** A sidebar section: the top links (no `module`), or one module and its pages. */
export interface NavSidebarSection {
  key: string;
  /** The module's node; none for the top links */
  module?: NavNode;
  links: NavSidebarLink[];
}

/** A module's screen. */
export const moduleScreenHref = (key: string) => `/modules/${key}`;

/**
 * The sidebar this user gets: the top links (Home, Approvals, Projects, Watch list), then each module they see with its
 * pages, led by the module's screen when it has two or more tiles (with one, that page opens straight away). A page is one
 * link, under the first node that names it. The web adds the icons (`components/shell/nav.ts`); the route walk reads it to
 * know every link a role can be shown.
 */
export function navSidebar(user: NavUser): NavSidebarSection[] {
  if (P.isGuest(user.roleKey)) return [];
  const top: NavSidebarLink[] = [];
  const sections: NavSidebarSection[] = [];
  const seen = new Set<string>();
  const add = (list: NavSidebarLink[], node: NavNode) => {
    const link = navPageLink(node);
    if (!link || seen.has(link.href)) return;
    seen.add(link.href);
    list.push(link);
  };
  for (const mod of navTilesFor(user, null)) {
    if (mod.route) {
      add(top, mod);
      continue;
    }
    const tiles = navTilesFor(user, mod.id);
    const links: NavSidebarLink[] = [];
    for (const tile of tiles) add(tile.top ? top : links, tile);
    if (tiles.length >= 2) links.unshift({ href: moduleScreenHref(mod.id), label: `${mod.label} overview`, node: mod, overview: true });
    if (links.length) sections.push({ key: mod.id, module: mod, links });
  }
  return [{ key: 'top', links: top }, ...sections].filter((s) => s.links.length > 0);
}
