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
  canViewCompliance,
  isGuest,
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
  const approves = (type: string) => approvalRightsOf(user).some((r) => r.type === type);
  const sections: NavSection[] = [
    {
      key: 'top',
      items: [
        { href: '/', label: 'Dashboard', icon: AppstoreOutlined, keywords: 'home overview kpi' },
        { href: '/projects', label: 'Projects', icon: ProjectOutlined, keywords: 'sites boq contract' },
        { href: '/approvals', label: 'Approvals', icon: CheckSquareOutlined, keywords: 'pending queue approve', approvals: true },
      ],
    },
    {
      key: 'site',
      title: 'Site',
      icon: BuildOutlined,
      items: [
        { href: '/dpr', label: 'Daily Reports', icon: FileTextOutlined, keywords: 'dpr daily progress report diary' },
        { href: '/attendance', label: 'Attendance', icon: ScheduleOutlined, keywords: 'labour manpower muster' },
        { href: '/progress', label: 'Progress Entries', icon: LineChartOutlined, keywords: 'work done quantity' },
        { href: '/measurements', label: 'Measurement Book', icon: CalculatorOutlined, keywords: 'mb measurements' },
        { href: '/inspections', label: 'Quality', icon: SafetyOutlined, keywords: 'qa qc inspections tests ncr hold point' },
        { href: '/documents', label: 'Documents', icon: FolderOpenOutlined, keywords: 'drawings files rfi' },
        { href: '/expenses', label: 'Site Expenses', icon: WalletOutlined, keywords: 'petty cash imprest' },
        ...when(canHoldImprest(role) || canManageImprest(role) || canApprove(role), { href: '/imprest', label: 'Site Imprest', icon: MoneyCollectOutlined, keywords: 'petty cash float top-up' }),
        { href: '/risks', label: 'Delays & Risks', icon: AlertOutlined, keywords: 'hindrance issues' },
        { href: '/safety', label: 'Safety', icon: MedicineBoxOutlined, keywords: 'incident near miss toolbox talk permit to work ppe accident' },
      ],
    },
    {
      key: 'materials',
      title: 'Materials & plant',
      icon: InboxOutlined,
      items: [
        { href: '/material-requests', label: 'Material Requests', icon: ShoppingCartOutlined, keywords: 'indent mr' },
        { href: '/stock', label: 'Stock', icon: InboxOutlined, keywords: 'inventory grn store issue' },
        { href: '/machinery', label: 'Machinery', icon: ToolOutlined, keywords: 'plant equipment fuel hours' },
      ],
    },
    {
      key: 'purchases',
      title: 'Purchases',
      icon: ShoppingCartOutlined,
      items: [
        ...when(canViewPurchaseOrders(role), { href: '/purchase-orders', label: 'Purchase Orders', icon: ContainerOutlined, keywords: 'po' }),
        ...when(canViewVendorBills(role), { href: '/vendor-bills', label: 'Vendor Bills', icon: ReconciliationOutlined, keywords: 'supplier invoice' }),
        ...when(canViewWorkOrders(role), { href: '/work-orders', label: 'Work Orders', icon: SolutionOutlined, keywords: 'wo subcontract' }),
        ...when(canPrepareSubcontractBill(role) || approves('SUBCONTRACT_BILL'), { href: '/subcontract-bills', label: 'Subcontractor Bills', icon: ProfileOutlined, keywords: 'petty contractor' }),
        ...when(canViewPayables(role), { href: '/payables', label: 'Payables', icon: PayCircleOutlined, keywords: 'payments due msme' }),
        ...when(canEditVendors(role) || canSeeVendorBank(role), { href: '/vendors', label: 'Vendors', icon: ShopOutlined, keywords: 'suppliers' }),
      ],
    },
    {
      key: 'billing',
      title: 'Billing',
      icon: FileDoneOutlined,
      items: [
        ...when(canPrepareBill(role) || approves('BILL'), { href: '/bills', label: 'RA Bills', icon: FileDoneOutlined, keywords: 'running account invoice client bill' }),
        ...when(canViewVariations(role), { href: '/variations', label: 'Variations', icon: DiffOutlined, keywords: 'extra items deviation' }),
        ...when(canViewContract(role), { href: '/receivables', label: 'Receivables', icon: AccountBookOutlined, keywords: 'collections retention' }),
        ...when(canViewContract(role) || canEditContract(role), { href: '/clients', label: 'Clients', icon: BankOutlined, keywords: 'customers' }),
        ...when(canViewCompliance(role), { href: '/compliance', label: 'Guarantees & Licences', icon: AuditOutlined, keywords: 'bank guarantee bg insurance car policy licence labour expiry' }),
        ...when(canViewGstRegisters(role), { href: '/gst', label: 'GST Registers', icon: PercentageOutlined, keywords: 'tax gstr' }),
        ...when(canExportTally(role), { href: '/tally', label: 'Tally Export', icon: ExportOutlined, keywords: 'accounts vouchers' }),
      ],
    },
    {
      key: 'people',
      title: 'People',
      icon: TeamOutlined,
      items: [
        { href: '/staff', label: 'Staff & Leave', icon: IdcardOutlined, keywords: 'employees hr' },
        ...when(canViewPayroll(role) || canViewLabourSummary(role), { href: '/payroll', label: 'Payroll Inputs', icon: CarryOutOutlined, keywords: 'salary wages' }),
      ],
    },
    {
      key: 'reports',
      title: 'Reports',
      icon: BarChartOutlined,
      items: [
        { href: '/reports', label: 'Progress Reports', icon: FilePdfOutlined, keywords: 'pdf mis monthly' },
        ...when(canViewCost(role), { href: '/cost', label: 'Project Cost', icon: FundOutlined, keywords: 'budget cash flow margin' }),
      ],
    },
    {
      key: 'admin',
      title: 'Admin',
      icon: SettingOutlined,
      items: [
        ...when(canEditProjects(role), { href: '/templates', label: 'Activity Templates', icon: PartitionOutlined, keywords: 'wbs' }),
        ...when(
          canManageUsers(role),
          { href: '/users', label: 'Users', icon: TeamOutlined, keywords: 'invite roles access' },
          { href: '/approval-rules', label: 'Approval Rules', icon: SafetyCertificateOutlined, keywords: 'matrix limits' },
        ),
        ...when(canManageCompanyData(role), { href: '/company-data', label: 'Data & Privacy', icon: DatabaseOutlined, keywords: 'export delete' }),
        ...when(!!user.billing && canManageBilling(role), { href: '/billing', label: 'Billing', icon: CreditCardOutlined, keywords: 'subscription plan invoice' }),
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
