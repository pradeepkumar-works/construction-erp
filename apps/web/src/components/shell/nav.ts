/**
 * The sidebar's sections and links, filtered to what the signed-in user may open. The sidebar, its collapsed rail
 * and the quick-jump search all read from here, so a new module is one line in the right section.
 */
import type React from 'react';
import {
  ExperimentOutlined,
  MailOutlined,
  ContactsOutlined,
  QuestionCircleOutlined,
  MoneyCollectOutlined,
  AccountBookOutlined,
  BookOutlined,
  PieChartOutlined,
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BuildOutlined,
  CalculatorOutlined,
  CarryOutOutlined,
  ScanOutlined,
  CheckSquareOutlined,
  CloudServerOutlined,
  ContainerOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DiffOutlined,
  EyeOutlined,
  ExportOutlined,
  FileDoneOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FundOutlined,
  IdcardOutlined,
  InboxOutlined,
  LineChartOutlined,
  MedicineBoxOutlined,
  PartitionOutlined,
  PayCircleOutlined,
  PercentageOutlined,
  ProfileOutlined,
  ProjectOutlined,
  ReconciliationOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SolutionOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { AuthUser, ModuleKey } from '@erp/shared';
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import {
  MODULE_LABELS,
  PRODUCT_NAME,
  isModuleKey,
  approvalRightsOf,
  canEditContract,
  canEditProjects,
  canEditVendors,
  canExportTally,
  canViewRmc,
  canKeepBooks,
  canManageBilling,
  canManageCompanyData,
  canManageUsers,
  canPrepareBill,
  canPrepareSubcontractBill,
  canSeeVendorBank,
  canViewContract,
  canViewCost,
  canViewGstRegisters,
  canViewLabourSummary,
  canViewPayables,
  canViewPayroll,
  canManageBiometric,
  canViewPurchaseOrders,
  canViewVariations,
  canViewVendorBills,
  canViewWorkOrders,
  canHoldImprest,
  canManageImprest,
  canApprove,
  canMeasure,
  canPurchase,
  canReportSafety,
  canViewWorkers,
  canViewCompliance,
  canManageAi,
  canSeeWatchList,
  canSubmitExpense,
  isGuest,
  isSupplier,
  canCheckSupplierInvoices,
  canManageSupplierLogins,
  mayApprove,
} from '@erp/shared';

export type NavIcon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Other words people search for (abbreviations, the paper form's name). */
  keywords?: string;
  /** Shows the pending-approvals count. */
  approvals?: boolean;
  /** A module's home page (v6 item 98), drawn first in its section. */
  overview?: boolean;
}

export interface NavSection {
  /** Stable key, used to remember whether the section is open. */
  key: string;
  /** No title: the top links, always shown. */
  title?: string;
  /** The section's icon on the collapsed rail. */
  icon?: NavIcon;
  items: NavItem[];
  /** Links light up on their own page only (Favourites, Recent), not on the pages under them. */
  exact?: boolean;
  /** The module this section is (v6 item 98): it gets a home page at `/modules/<key>`. */
  module?: ModuleKey;
}

/** What each page is for, in a line: the cards on a module's home page (v6 item 98). */
export const NAV_DESCRIPTIONS: Record<string, string> = {
  '/dpr': 'The day at each site: work done, labour, machines, weather and hold-ups.',
  '/attendance': "Labour head count and the named workers' roll call, by site and day.",
  '/progress': 'Quantities done against each activity, for approval.',
  '/measurements': "Measurement book: measured quantities that go on the client's bill.",
  '/inspections': 'Inspections with hold points, material tests and NCRs.',
  '/documents': 'Drawings, revisions, RFIs, transmittals and letters.',
  '/expenses': 'Petty expenses at the sites, with bills and approval.',
  '/imprest': 'Cash floats held at the sites, top-ups and the cash book.',
  '/risks': 'Delays and risks, extensions of time and liquidated damages.',
  '/safety': 'Incidents, permits to work, toolbox talks and PPE.',
  '/material-requests': 'What the sites need, approved and ordered or taken from stock.',
  '/stock': 'Stock at each site: receipts, issues, transfers and counts.',
  '/machinery': 'Machine logs, fuel, use, job cards, papers and drivers.',
  '/purchase-orders': 'Quotations, comparisons, orders and what is still to come.',
  '/vendor-bills': 'Supplier bills checked against orders and receipts.',
  '/work-orders': 'Orders to subcontractors and petty contractors.',
  '/subcontract-bills': "Subcontractors' running bills with recoveries.",
  '/payables': 'What we owe, payment requests, payments and debit notes.',
  '/vendors': 'Suppliers and subcontractors, with GST, MSME and bank details.',
  '/supplier-inbox': 'Invoices suppliers sent on their portal, and the changes to their details they asked for.',
  '/bills': 'Running account bills to clients, from the measurement book.',
  '/variations': 'Extra and changed items sent to the client.',
  '/receivables': 'What clients owe us, receipts and retention.',
  '/clients': 'Clients and their contacts.',
  '/compliance': 'Bank guarantees, EMDs, insurance and licences with renewals.',
  '/books': 'Day book, cash and bank books, ledgers, vouchers and the chart of accounts.',
  '/rmc': 'The plant’s day, quotes and orders, trucks and challans, mix designs and bills for ready-mix concrete.',
  '/statements': 'Trial balance, profit and loss, balance sheet, bank reconciliation and the year’s close.',
  '/gst': 'GST on sales and purchases: GSTR-1 and 2B.',
  '/tally': 'Vouchers for Tally, with projects as cost centres.',
  '/staff': 'Staff records and their service letters, attendance, leave, overtime and holidays.',
  '/biometric': 'Fingerprint and face devices, who is enrolled on them, and their punches marking attendance.',
  '/payroll': "Salary runs with payslips, PF, ESI and TDS, salaries, loans, full and final settlements, and the month's attendance inputs.",
  '/reports': 'Monthly and weekly progress reports as PDF.',
  '/cost': 'Budget, actual cost, cash flow and margin per project.',
};

/** A module's home page link, first in its section when the section has two or more pages. */
export const moduleHref = (key: ModuleKey) => `/modules/${key}`;

const when = (ok: boolean, ...items: NavItem[]): NavItem[] => (ok ? items : []);

export function navFor(user: AuthUser): NavSection[] {
  // A supplier's login has the supplier portal only (v6 item 105).
  if (isSupplier(user.roleKey)) {
    return [
      {
        key: 'top',
        items: [
          { href: '/supplier', label: 'Home', icon: AppstoreOutlined },
          { href: '/supplier/enquiries', label: 'Enquiries', icon: QuestionCircleOutlined, keywords: 'quote rates rfq' },
          { href: '/supplier/orders', label: 'Orders', icon: ContainerOutlined, keywords: 'po work order accept dispatch challan' },
          { href: '/supplier/invoices', label: 'Invoices', icon: FileTextOutlined, keywords: 'bill' },
          { href: '/supplier/statement', label: 'Payments', icon: WalletOutlined, keywords: 'statement ledger due paid tds' },
          { href: '/supplier/profile', label: 'Profile', icon: ContactsOutlined, keywords: 'bank gst details' },
          { href: '/notifications', label: 'Notifications', icon: AuditOutlined },
        ],
      },
    ];
  }
  // The client's engineer and consultant have the portal only.
  if (isGuest(user.roleKey)) {
    return [
      {
        key: 'top',
        items: [
          { href: '/portal', label: 'My projects', icon: ProjectOutlined },
          { href: '/notifications', label: 'Notifications', icon: AuditOutlined },
        ],
      },
    ];
  }
  const role = user.roleKey;
  // The site team and the managers over it: every role that reports from site (safety, delays, defects). Site-only modules
  // (daily reports, progress, quality…) are theirs; an office role such as accounts or HR does not get them.
  const onSite = canReportSafety(role);
  const approves = (type: string) => approvalRightsOf(user).some((r) => r.type === type);
  const sections: NavSection[] = [
    {
      key: 'top',
      items: [
        { href: '/', label: 'Home', icon: AppstoreOutlined, keywords: 'dashboard overview kpi my work' },
        { href: '/projects', label: 'Projects', icon: ProjectOutlined, keywords: 'sites boq contract' },
        ...when(mayApprove(user), { href: '/approvals', label: 'Approvals', icon: CheckSquareOutlined, keywords: 'pending queue approve inbox', approvals: true }),
        ...when(canSeeWatchList(role), { href: '/watch-list', label: 'Watch list', icon: EyeOutlined, keywords: 'early warnings alerts forecast risk slipping cash gap running out' }),
      ],
    },
    {
      key: 'site',
      module: 'site',
      title: 'Site',
      icon: BuildOutlined,
      items: [
        ...when(onSite, { href: '/dpr', label: 'Daily reports', icon: FileTextOutlined, keywords: 'dpr daily progress report diary' }),
        ...when(onSite || canViewWorkers(role), { href: '/attendance', label: 'Attendance', icon: ScheduleOutlined, keywords: 'labour manpower muster workers' }),
        ...when(onSite, { href: '/progress', label: 'Progress entries', icon: LineChartOutlined, keywords: 'work done quantity' }),
        ...when(canMeasure(role), { href: '/measurements', label: 'Measurement book', icon: CalculatorOutlined, keywords: 'mb measurements' }),
        ...when(onSite, { href: '/inspections', label: 'Quality', icon: SafetyOutlined, keywords: 'qa qc inspections tests ncr hold point' }),
        { href: '/documents', label: 'Documents', icon: FolderOpenOutlined, keywords: 'drawings files rfi' },
        ...when(canSubmitExpense(role) || canViewCost(role), { href: '/expenses', label: 'Site expenses', icon: WalletOutlined, keywords: 'petty cash imprest' }),
        ...when(canHoldImprest(role) || canManageImprest(role) || canApprove(role), { href: '/imprest', label: 'Site imprest', icon: MoneyCollectOutlined, keywords: 'petty cash float top-up' }),
        ...when(onSite || canViewContract(role), { href: '/risks', label: 'Delays and risks', icon: AlertOutlined, keywords: 'hindrance issues eot ld' }),
        ...when(onSite, { href: '/safety', label: 'Safety', icon: MedicineBoxOutlined, keywords: 'incident near miss toolbox talk permit to work ppe accident' }),
      ],
    },
    {
      key: 'materials',
      module: 'materials',
      title: 'Materials and plant',
      icon: InboxOutlined,
      items: [
        ...when(onSite || canPurchase(role), { href: '/material-requests', label: 'Material requests', icon: ShoppingCartOutlined, keywords: 'indent mr' }),
        ...when(onSite || canPurchase(role) || canViewCost(role), { href: '/stock', label: 'Stock', icon: InboxOutlined, keywords: 'inventory grn store issue' }),
        ...when(onSite || canPurchase(role), { href: '/machinery', label: 'Machinery', icon: ToolOutlined, keywords: 'plant equipment fuel hours' }),
      ],
    },
    {
      key: 'purchases',
      module: 'purchases',
      title: 'Purchases',
      icon: ShoppingCartOutlined,
      items: [
        ...when(canViewPurchaseOrders(role), { href: '/purchase-orders', label: 'Purchase orders', icon: ContainerOutlined, keywords: 'po' }),
        ...when(canViewVendorBills(role), { href: '/vendor-bills', label: 'Vendor bills', icon: ReconciliationOutlined, keywords: 'supplier invoice' }),
        ...when(canViewWorkOrders(role), { href: '/work-orders', label: 'Work orders', icon: SolutionOutlined, keywords: 'wo subcontract' }),
        ...when(canPrepareSubcontractBill(role) || approves('SUBCONTRACT_BILL'), { href: '/subcontract-bills', label: 'Subcontractor bills', icon: ProfileOutlined, keywords: 'petty contractor' }),
        ...when(canViewPayables(role), { href: '/payables', label: 'Payables', icon: PayCircleOutlined, keywords: 'payments due msme' }),
        ...when(canEditVendors(role) || canSeeVendorBank(role), { href: '/vendors', label: 'Vendors', icon: ShopOutlined, keywords: 'suppliers' }),
        ...when(canCheckSupplierInvoices(role) || canManageSupplierLogins(role), { href: '/supplier-inbox', label: 'Supplier inbox', icon: MailOutlined, keywords: 'supplier portal invoices bank change' }),
      ],
    },
    {
      key: 'billing',
      module: 'billing',
      title: 'Billing',
      icon: FileDoneOutlined,
      items: [
        ...when(canPrepareBill(role) || approves('BILL'), { href: '/bills', label: 'RA bills', icon: FileDoneOutlined, keywords: 'running account invoice client bill' }),
        ...when(canViewVariations(role), { href: '/variations', label: 'Variations', icon: DiffOutlined, keywords: 'extra items deviation' }),
        ...when(canViewContract(role), { href: '/receivables', label: 'Receivables', icon: AccountBookOutlined, keywords: 'collections retention' }),
        ...when(canViewContract(role) || canEditContract(role), { href: '/clients', label: 'Clients', icon: BankOutlined, keywords: 'customers' }),
        ...when(canViewCompliance(role), { href: '/compliance', label: 'Guarantees and licences', icon: AuditOutlined, keywords: 'bank guarantee bg insurance car policy licence labour expiry' }),
      ],
    },
    {
      key: 'rmc',
      module: 'rmc',
      title: 'RMC',
      icon: ExperimentOutlined,
      items: [...when(canViewRmc(role), { href: '/rmc', label: 'RMC plant', icon: ExperimentOutlined, keywords: 'ready mix concrete batching plant transit mixer challan cube mix design quote order m3' })],
    },
    {
      key: 'accounts',
      module: 'accounts',
      title: 'Accounts',
      icon: FundOutlined,
      items: [
        ...when(canKeepBooks(role), { href: '/books', label: 'Books', icon: BookOutlined, keywords: 'accounts day book cash book bank book ledger journal voucher contra chart of accounts' }),
        ...when(canKeepBooks(role), { href: '/statements', label: 'Financial statements', icon: PieChartOutlined, keywords: 'trial balance profit and loss balance sheet schedule iii bank reconciliation brs opening balances year close lock' }),
        ...when(canViewGstRegisters(role), { href: '/gst', label: 'GST registers', icon: PercentageOutlined, keywords: 'tax gstr' }),
        ...when(canExportTally(role), { href: '/tally', label: 'Tally export', icon: ExportOutlined, keywords: 'accounts vouchers' }),
      ],
    },
    {
      key: 'people',
      module: 'people',
      title: 'People',
      icon: TeamOutlined,
      items: [
        { href: '/staff', label: 'Staff and leave', icon: IdcardOutlined, keywords: 'employees hr letters transfer promotion increment' },
        ...when(canManageBiometric(role), { href: '/biometric', label: 'Biometric devices', icon: ScanOutlined, keywords: 'fingerprint face punch attendance machine zkteco essl adms' }),
        ...when(canViewPayroll(role) || canViewLabourSummary(role), { href: '/payroll', label: 'Payroll', icon: CarryOutOutlined, keywords: 'salary wages payslip pf esi tds loan advance gratuity settlement inputs' }),
      ],
    },
    {
      key: 'reports',
      title: 'Reports',
      icon: BarChartOutlined,
      items: [
        ...when(onSite || canViewContract(role), { href: '/reports', label: 'Progress reports', icon: FilePdfOutlined, keywords: 'pdf mis monthly weekly' }),
        ...when(canViewCost(role), { href: '/cost', label: 'Project cost', icon: FundOutlined, keywords: 'budget cash flow margin' }),
      ],
    },
    {
      key: 'admin',
      title: 'Admin',
      icon: SettingOutlined,
      items: [
        ...when(canEditProjects(role), { href: '/templates', label: 'Activity templates', icon: PartitionOutlined, keywords: 'wbs' }),
        ...when(
          canManageUsers(role),
          { href: '/users', label: 'Users', icon: TeamOutlined, keywords: 'invite roles access' },
          { href: '/approval-rules', label: 'Approval rules', icon: SafetyCertificateOutlined, keywords: 'matrix limits' },
        ),
        ...when(canManageCompanyData(role), { href: '/company-data', label: 'Data and privacy', icon: DatabaseOutlined, keywords: 'export delete' }),
        ...when(canManageAi(role), { href: '/ai-settings', label: `Ask ${PRODUCT_NAME}`, icon: SparkleIcon, keywords: 'ai assistant chat allowance' }),
        ...when(!!user.billing && canManageBilling(role), { href: '/billing', label: 'Subscription', icon: CreditCardOutlined, keywords: 'billing plan invoice pay renew' }),
        ...when(!!user.platformAdmin, { href: '/platform', label: `${PRODUCT_NAME} console`, icon: CloudServerOutlined, keywords: 'platform companies support' }),
      ],
    },
  ];
  // Each module with two or more pages leads with its home page (v6 item 98).
  for (const s of sections) {
    if (s.module && s.items.length >= 2)
      s.items.unshift({ href: moduleHref(s.module), label: `${MODULE_LABELS[s.module]} overview`, icon: DashboardOutlined, keywords: 'module home summary dashboard', overview: true });
  }
  return sections.filter((s) => s.items.length > 0);
}

/** The section a module's home page shows, as this user's sidebar draws it (null when they do not see it). */
export function moduleSection(user: AuthUser, key: string): NavSection | null {
  if (!isModuleKey(key)) return null;
  return navFor(user).find((s) => s.module === key && s.items.some((i) => i.overview)) ?? null;
}

/** The nav link a path belongs to: "/" only for the dashboard, otherwise the link whose path is the first segment. */
export function activeHref(pathname: string): string {
  if (pathname === '/') return '/';
  const [, first, second] = pathname.split('/');
  // A module's home page is /modules/<key>: the link is the whole path.
  if (first === 'modules' && second) return `/modules/${second}`;
  // The supplier portal's pages are each a link of their own (v6 item 105).
  if (first === 'supplier' && second) return `/supplier/${second}`;
  return '/' + first;
}

/** Where a path sits in the sidebar, for the header: the section's title (none for the top links) and the link. */
export function navTrail(sections: NavSection[], pathname: string): { section?: string; item: NavItem } | null {
  const href = activeHref(pathname);
  for (const s of sections) {
    const item = s.items.find((i) => i.href === href);
    if (item) return { section: s.title, item };
  }
  return null;
}
