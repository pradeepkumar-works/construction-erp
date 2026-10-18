/**
 * The sidebar's sections and links, filtered to what the signed-in user may open. The sidebar, its collapsed rail
 * and the quick-jump search all read from here, so a new module is one line in the right section.
 */
import type React from 'react';
import {
  MoneyCollectOutlined,
  AccountBookOutlined,
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BuildOutlined,
  CalculatorOutlined,
  CarryOutOutlined,
  CheckSquareOutlined,
  CloudServerOutlined,
  ContainerOutlined,
  CreditCardOutlined,
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
import type { AuthUser } from '@erp/shared';
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import {
  PRODUCT_NAME,
  approvalRightsOf,
  canEditContract,
  canEditProjects,
  canEditVendors,
  canExportTally,
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
}

const when = (ok: boolean, ...items: NavItem[]): NavItem[] => (ok ? items : []);

export function navFor(user: AuthUser): NavSection[] {
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
      title: 'Purchases',
      icon: ShoppingCartOutlined,
      items: [
        ...when(canViewPurchaseOrders(role), { href: '/purchase-orders', label: 'Purchase orders', icon: ContainerOutlined, keywords: 'po' }),
        ...when(canViewVendorBills(role), { href: '/vendor-bills', label: 'Vendor bills', icon: ReconciliationOutlined, keywords: 'supplier invoice' }),
        ...when(canViewWorkOrders(role), { href: '/work-orders', label: 'Work orders', icon: SolutionOutlined, keywords: 'wo subcontract' }),
        ...when(canPrepareSubcontractBill(role) || approves('SUBCONTRACT_BILL'), { href: '/subcontract-bills', label: 'Subcontractor bills', icon: ProfileOutlined, keywords: 'petty contractor' }),
        ...when(canViewPayables(role), { href: '/payables', label: 'Payables', icon: PayCircleOutlined, keywords: 'payments due msme' }),
        ...when(canEditVendors(role) || canSeeVendorBank(role), { href: '/vendors', label: 'Vendors', icon: ShopOutlined, keywords: 'suppliers' }),
      ],
    },
    {
      key: 'billing',
      title: 'Billing',
      icon: FileDoneOutlined,
      items: [
        ...when(canPrepareBill(role) || approves('BILL'), { href: '/bills', label: 'RA bills', icon: FileDoneOutlined, keywords: 'running account invoice client bill' }),
        ...when(canViewVariations(role), { href: '/variations', label: 'Variations', icon: DiffOutlined, keywords: 'extra items deviation' }),
        ...when(canViewContract(role), { href: '/receivables', label: 'Receivables', icon: AccountBookOutlined, keywords: 'collections retention' }),
        ...when(canViewContract(role) || canEditContract(role), { href: '/clients', label: 'Clients', icon: BankOutlined, keywords: 'customers' }),
        ...when(canViewCompliance(role), { href: '/compliance', label: 'Guarantees and licences', icon: AuditOutlined, keywords: 'bank guarantee bg insurance car policy licence labour expiry' }),
        ...when(canViewGstRegisters(role), { href: '/gst', label: 'GST registers', icon: PercentageOutlined, keywords: 'tax gstr' }),
        ...when(canExportTally(role), { href: '/tally', label: 'Tally export', icon: ExportOutlined, keywords: 'accounts vouchers' }),
      ],
    },
    {
      key: 'people',
      title: 'People',
      icon: TeamOutlined,
      items: [
        { href: '/staff', label: 'Staff and leave', icon: IdcardOutlined, keywords: 'employees hr' },
        ...when(canViewPayroll(role) || canViewLabourSummary(role), { href: '/payroll', label: 'Payroll inputs', icon: CarryOutOutlined, keywords: 'salary wages' }),
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
  return sections.filter((s) => s.items.length > 0);
}

/** The nav link a path belongs to: "/" only for the dashboard, otherwise the link whose path is the first segment. */
export function activeHref(pathname: string): string {
  if (pathname === '/') return '/';
  return '/' + pathname.split('/')[1];
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
