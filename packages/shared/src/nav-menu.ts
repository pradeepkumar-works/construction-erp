import type { NavLayout, NavLook, NavModuleSet } from './enums';
import { NAV_LOOKS, NAV_MODULE_SETS, NAV_LAYOUTS } from './enums';
import type { NavFamily, NavNode, NavUser } from './navigation';
import { NAV_TREE, canSeeNav, navNode, navNodeAt } from './navigation';
import type { SubmissionType } from './enums';
import { submissionListHref } from './links';

/**
 * Menu and names (ARCHITECTURE "Menu and names"): each company chooses where its menu sits (a sidebar, or a top bar with
 * the modules on Home and each module's sub-modules across the top), how the top bar looks, how the pages are grouped into
 * modules, and what each module is called. The pages, their access and their routes stay the navigation tree's
 * (`NAV_TREE`); a module set only groups its nodes, so a page is never two things.
 *
 * - `AREAS` is the tree's own modules (Projects, Site, Purchases…), each node a sub-module (Accounts by its groups).
 * - `DEPARTMENTS` is the fifteen modules contractors' departments run (Project management, Purchase management…), each with its
 *   sub-modules naming the tree's nodes. A node may sit in two modules (Project cost is planning's and the reports').
 * - A module's name is the company's when it gave one (`names`, by module key), else the set's.
 */

export interface NavSettingsDto {
  layout: NavLayout;
  look: NavLook;
  moduleSet: NavModuleSet;
  /** The company's names for modules, by module key (either set's); a key left out keeps the set's name */
  names: Record<string, string>;
  /** People may choose their own look in Profile › Appearance */
  personalLook: boolean;
}

/** A company that has not chosen keeps the sidebar it had; the top bar starts in the navy look. */
export const DEFAULT_NAV_SETTINGS: NavSettingsDto = { layout: 'SIDEBAR', look: 'NAVY', moduleSet: 'AREAS', names: {}, personalLook: false };

export const NAV_NAME_MAX = 40;

/** What the signed-in user's menu is: the company's settings with their own look, when the company lets them choose. */
export function navSettingsOf(user: { navigation?: NavSettingsDto; ownLook?: NavLook | null }): NavSettingsDto {
  const company = user.navigation ?? DEFAULT_NAV_SETTINGS;
  return company.personalLook && user.ownLook ? { ...company, look: user.ownLook } : company;
}

/** A sub-module: a heading in a module's menu and the tree nodes under it. */
export interface NavSubDef {
  key: string;
  label: string;
  nodes: string[];
}

/** A module of a set: its key (`/modules/<key>`), name, icon, colour family, the line on its tile, and its sub-modules. */
export interface NavModuleDef {
  key: string;
  label: string;
  icon: string;
  family: NavFamily;
  description: string;
  subs: NavSubDef[];
}

const sub = (key: string, label: string, ...nodes: string[]): NavSubDef => ({ key, label, nodes });

/** The ten modules of a contractor's brochure, QA/QC, Design and drawings and Correspondence (item 135), plus Reports and MIS and
 *  Administration. Keys are kept forever (names hang on them). Each module's Masters names the pages that are its masters
 *  (`mastersByDepartment`). */
export const DEPARTMENT_MODULES: NavModuleDef[] = [
  {
    key: 'project-management',
    label: 'Project management',
    icon: 'folder-kanban',
    family: 'work',
    description: 'Projects, schedule, site work, safety and client billing.',
    subs: [
      sub('projects', 'Projects', 'projects.all', 'projects.handover', 'projects.templates'),
      sub('schedule', 'Schedule', 'projects.schedule', 'projects.lookahead', 'projects.earned'),
      sub('site', 'Site execution', 'site.dpr', 'site.progress', 'site.mb', 'site.risks', 'site.meetings', 'site.whatsapp'),
      sub('safety', 'Safety', 'quality.incidents', 'quality.permits', 'quality.talks', 'quality.ppe'),
      sub('billing', 'Client billing', 'billing.bills', 'billing.variations', 'billing.readiness', 'billing.clients'),
      sub('reports', 'Reports', 'reports.progress', 'reports.cashflow'),
      sub('masters', 'Masters', 'billing.clients', 'projects.templates'),
    ],
  },
  {
    key: 'quality-control',
    label: 'Quality (QA/QC)',
    icon: 'shield-check',
    family: 'work',
    description: 'Inspections and hold points, material tests, NCRs and material checked on arrival.',
    subs: [
      sub('inspections', 'Inspections', 'quality.inspections'),
      sub('tests', 'Tests', 'quality.tests'),
      sub('material', 'Material', 'quality.grns', 'materials.approvals'),
      sub('ncrs', 'NCRs', 'quality.ncrs'),
      sub('masters', 'Masters', 'quality.checklists'),
    ],
  },
  {
    key: 'design-drawings',
    label: 'Design and drawings',
    icon: 'drafting-compass',
    family: 'work',
    description: 'Drawings and documents with their revisions, the drawing viewer, transmittals and RFIs.',
    subs: [
      sub('register', 'Drawings and documents', 'documents.register'),
      sub('transmittals', 'Transmittals', 'documents.transmittals'),
      sub('rfis', 'RFIs', 'documents.rfis'),
    ],
  },
  {
    key: 'correspondence',
    label: 'Correspondence',
    icon: 'mail',
    family: 'work',
    description: 'Letters in and out, numbered, with the replies due.',
    subs: [sub('letters', 'Letters', 'documents.letters')],
  },
  {
    key: 'planning-estimation',
    label: 'Planning and estimation',
    icon: 'calculator',
    family: 'business',
    description: 'Tenders and rates, estimates from the BOQ, budgets and what each project earns.',
    subs: [
      sub('tenders', 'Tenders', 'tenders.register', 'tenders.sor'),
      sub('estimates', 'Estimates', 'projects.boq', 'reports.estimate'),
      sub('budgets', 'Budgets', 'projects.budget'),
      sub('analysis', 'Analysis', 'reports.cost', 'reports.profitLoss'),
      sub('masters', 'Masters', 'tenders.sor', 'projects.templates'),
    ],
  },
  {
    key: 'purchase-management',
    label: 'Purchase management',
    icon: 'shopping-cart',
    family: 'buying',
    description: 'Indents, quotes, orders, goods receipt and vendor bills.',
    subs: [
      sub('indents', 'Indents', 'materials.requests', 'materials.approvals'),
      sub('quotes', 'RFQ and quotes', 'purchases.toOrder'),
      sub('orders', 'Orders', 'purchases.orders', 'purchases.delivery'),
      sub('receipt', 'Goods receipt', 'materials.register', 'quality.grns'),
      sub('bills', 'Vendor bills', 'purchases.bills', 'purchases.toBill', 'accounts.debitNotes'),
      sub('vendors', 'Vendors', 'purchases.suppliers', 'purchases.portal'),
      sub('reports', 'Reports', 'reports.procurementSpend'),
      sub('masters', 'Masters', 'purchases.suppliers', 'materials.items', 'materials.units'),
    ],
  },
  {
    key: 'store-inventory',
    label: 'Store and inventory',
    icon: 'warehouse',
    family: 'materials',
    description: 'Stock at each site and store, movements, and material control.',
    subs: [
      sub('stock', 'Stock', 'materials.stock', 'materials.items'),
      sub('movements', 'Movements', 'materials.register'),
      sub('stores', 'Central stores', 'materials.store'),
      sub('control', 'Control', 'materials.reconciliation', 'materials.value', 'materials.leakage'),
      sub('reports', 'Reports', 'reports.stockPosition'),
      sub('masters', 'Masters', 'materials.items', 'materials.units', 'materials.itemCategories'),
    ],
  },
  {
    key: 'contractor-management',
    label: 'Contractor management',
    icon: 'handshake',
    family: 'buying',
    description: 'Subcontractors, their enquiries, work orders and bills, and labour contractors.',
    subs: [
      sub('contractors', 'Contractors', 'subcontracts.vendors'),
      sub('enquiries', 'Enquiries', 'subcontracts.enquiries'),
      sub('orders', 'Work orders', 'subcontracts.orders'),
      sub('bills', 'Contractor bills', 'subcontracts.bills'),
      sub('labour', 'Labour contractors', 'payroll.contractors'),
      sub('masters', 'Masters', 'subcontracts.vendors', 'site.trades'),
    ],
  },
  {
    key: 'machinery-vehicles',
    label: 'Machinery and vehicles',
    icon: 'tractor',
    family: 'materials',
    description: 'Own and hired machines, daily logs, fuel, maintenance and papers.',
    subs: [
      sub('equipment', 'Equipment', 'plant.equipment', 'accounts.machineLoans'),
      sub('logs', 'Daily logs', 'plant.logs'),
      sub('fuel', 'Fuel', 'plant.fuel'),
      sub('maintenance', 'Maintenance', 'plant.maintenance'),
      sub('papers', 'Papers and drivers', 'plant.papers'),
      sub('reports', 'Reports', 'plant.utilisation'),
      sub('masters', 'Masters', 'plant.equipment', 'plant.equipmentCategories'),
    ],
  },
  {
    key: 'plant-production',
    label: 'Plant and production',
    icon: 'factory',
    family: 'business',
    description: 'Ready-mix concrete: orders, the plant’s day, mix designs and sales.',
    subs: [
      sub('orders', 'Orders', 'rmc.orders'),
      sub('production', 'Production', 'rmc.schedule', 'rmc.batches'),
      sub('mixes', 'Mix designs', 'rmc.mixes'),
      sub('sales', 'Sales', 'rmc.sales'),
      sub('masters', 'Masters', 'rmc.mixes'),
    ],
  },
  {
    key: 'accounts-finance',
    label: 'Accounts and finance',
    icon: 'landmark',
    family: 'money',
    description: 'Payables, receivables, cash, the books, statements, GST and Tally.',
    subs: [
      sub('payables', 'Payables', 'accounts.payables', 'accounts.requests', 'accounts.payments', 'accounts.debitNotes'),
      sub('receivables', 'Receivables', 'billing.receivables', 'billing.receipts'),
      sub('cash', 'Cash', 'accounts.cashForecast', 'site.imprest', 'site.funds', 'site.expenses'),
      sub('books', 'Books', 'accounts.vouchers', 'accounts.daybooks', 'accounts.cashbooks', 'accounts.ledgers', 'accounts.chart'),
      sub('statements', 'Statements', 'accounts.trialBalance', 'accounts.pl', 'accounts.balanceSheet', 'accounts.bankReco', 'accounts.yearClose'),
      sub('tax', 'Tax and compliance', 'accounts.gst', 'accounts.tally', 'billing.guarantees'),
      sub('reports', 'Reports', 'reports.receivablesAgeing', 'reports.payablesAgeing', 'reports.wip'),
      sub('masters', 'Masters', 'accounts.chart'),
    ],
  },
  {
    key: 'labour-management',
    label: 'Labour management',
    icon: 'users',
    family: 'people',
    description: 'Attendance at the sites, the man-days cross-check and biometric devices.',
    subs: [
      sub('attendance', 'Attendance', 'site.attendance'),
      sub('check', 'Cross-check', 'site.attendanceCheck'),
      sub('biometric', 'Biometric', 'people.biometric'),
      sub('reports', 'Reports', 'reports.labour'),
      sub('masters', 'Masters', 'site.trades'),
    ],
  },
  {
    key: 'hr-payroll',
    label: 'HR and payroll',
    icon: 'id-card',
    family: 'people',
    description: 'Your own attendance and payslips, leave, employees and salary runs.',
    subs: [
      sub('self', 'Self-service', 'people.me', 'people.payslips'),
      sub('leave', 'Leave and overtime', 'people.leave', 'people.overtime'),
      sub('employees', 'Employees', 'people.employees', 'people.register', 'people.letters', 'people.holidays'),
      sub('payroll', 'Payroll', 'payroll.runs', 'payroll.structures', 'payroll.inputs', 'payroll.settings'),
      sub('loans', 'Loans and exits', 'payroll.loans', 'payroll.settlement'),
      sub('masters', 'Masters', 'people.departments', 'people.designations', 'people.holidays', 'payroll.structures'),
    ],
  },
  {
    key: 'reports-mis',
    label: 'Reports and MIS',
    icon: 'chart-column',
    family: 'insight',
    description: 'The management dashboard, the watch list, the monthly MIS and every report.',
    subs: [
      sub('dashboards', 'Dashboards', 'reports.management', 'watch'),
      sub('monthly', 'Monthly', 'reports.mis', 'reports.profitLoss', 'reports.wip'),
      sub('projects', 'Projects', 'reports.progress', 'reports.cost', 'reports.cashflow', 'reports.estimate'),
      sub('operations', 'Operations', 'reports.procurementSpend', 'reports.labour', 'reports.stockPosition', 'reports.approvalsWaiting'),
      sub('finance', 'Finance', 'reports.receivablesAgeing', 'reports.payablesAgeing', 'reports.pl', 'reports.tb'),
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: 'settings',
    family: 'admin',
    description: 'Users, approval rules, modules, the menu and the subscription.',
    subs: [
      sub('users', 'Users', 'admin.users'),
      sub('group', 'Group companies', 'admin.group'),
      sub('rules', 'Approval rules', 'admin.rules'),
      sub('modules', 'Modules and menu', 'admin.modules', 'admin.menu', 'admin.home'),
      sub('masters', 'Masters', 'admin.masters'),
      sub('data', 'Data and privacy', 'admin.data'),
      sub('ai', 'Ask', 'admin.ai'),
      sub('billing', 'Subscription', 'admin.billing'),
      sub('console', 'Console', 'admin.platform'),
    ],
  },
];

/** The tree's own modules as a set: each node its own sub-module, except a module whose nodes have groups (Accounts),
 *  which keeps them. The watch list, a page at the top of the tree, joins Reports. */
function areaModules(): NavModuleDef[] {
  return NAV_TREE.filter((n) => n.parent === null && !n.route).map((m) => {
    const kids = NAV_TREE.filter((n) => n.parent === m.id && n.tile !== false);
    const subs: NavSubDef[] = [];
    for (const k of kids) {
      if (k.group) {
        const at = subs.find((s) => s.label === k.group);
        if (at) at.nodes.push(k.id);
        else subs.push(sub(k.group.toLowerCase().replace(/\W+/g, '-'), k.group, k.id));
      } else subs.push(sub(k.id, k.label, k.id));
    }
    if (m.id === 'reports') subs.unshift(sub('watch', 'Watch list', 'watch'));
    return { key: m.id, label: m.label, icon: m.icon, family: m.family ?? 'work', description: m.description, subs };
  });
}

export const AREA_MODULES: NavModuleDef[] = areaModules();

export const navModuleDefs = (set: NavModuleSet): NavModuleDef[] => (set === 'DEPARTMENTS' ? DEPARTMENT_MODULES : AREA_MODULES);

/** Every module key either set has, for the names a company may give. */
export const NAV_MODULE_NAME_KEYS: string[] = [...new Set([...AREA_MODULES, ...DEPARTMENT_MODULES].map((m) => m.key))];

export const isDepartmentModuleKey = (key: string) => DEPARTMENT_MODULES.some((m) => m.key === key);

/** A sub-module the user sees: its pages (the nodes they may open, a shortcut kept as itself so it opens its target). */
export interface NavMenuSub {
  key: string;
  label: string;
  nodes: NavNode[];
}

export interface NavMenuModule {
  key: string;
  /** The company's name for it, or the set's */
  label: string;
  /** The set's own name (Admin › Menu and names shows it beside the company's) */
  defaultLabel: string;
  icon: string;
  family: NavFamily;
  description: string;
  subs: NavMenuSub[];
}

/** The modules this user sees in the company's set, under the company's names, each with the sub-modules and pages they
 *  may open (a sub-module with none, and a module with none, are left out). */
export function navMenuFor(user: NavUser, settings: Pick<NavSettingsDto, 'moduleSet' | 'names'>): NavMenuModule[] {
  const out: NavMenuModule[] = [];
  for (const def of navModuleDefs(settings.moduleSet)) {
    const subs: NavMenuSub[] = [];
    for (const s of def.subs) {
      const nodes = s.nodes.map((id) => navNode(id)).filter((n): n is NavNode => !!n && canSeeNav(user, n));
      if (nodes.length) subs.push({ key: s.key, label: s.label, nodes });
    }
    if (subs.length) out.push({ key: def.key, label: settings.names[def.key]?.trim() || def.label, defaultLabel: def.label, icon: def.icon, family: def.family, description: def.description, subs });
  }
  return out;
}

/** The one-bar look's Home puts the modules in three groups: sites, materials and machines, then money, people and control. */
export const NAV_MENU_GROUPS = ['Sites and projects', 'Materials and machines', 'Money, people and control'] as const;
export type NavMenuGroup = (typeof NAV_MENU_GROUPS)[number];
const GROUP_OF_FAMILY: Record<NavFamily, NavMenuGroup> = {
  work: 'Sites and projects',
  business: 'Sites and projects',
  buying: 'Materials and machines',
  materials: 'Materials and machines',
  money: 'Money, people and control',
  people: 'Money, people and control',
  insight: 'Money, people and control',
  admin: 'Money, people and control',
};
const GROUP_OF_MODULE: Record<string, NavMenuGroup> = {
  'contractor-management': 'Sites and projects',
  'labour-management': 'Sites and projects',
  'plant-production': 'Materials and machines',
  subcontracts: 'Sites and projects',
  rmc: 'Materials and machines',
};

export const navMenuGroup = (m: Pick<NavMenuModule, 'key' | 'family'>): NavMenuGroup => GROUP_OF_MODULE[m.key] ?? GROUP_OF_FAMILY[m.family];

/** Where a node is in the menu: its module and sub-module, the one named by `prefer` first (the module the user came
 *  from, when a page sits in two). */
export function navMenuPlace(menu: NavMenuModule[], nodeId: string, prefer?: string | null): { module: NavMenuModule; sub: NavMenuSub } | null {
  const ordered = prefer ? [...menu.filter((m) => m.key === prefer), ...menu.filter((m) => m.key !== prefer)] : menu;
  for (const module of ordered) {
    const s = module.subs.find((x) => x.nodes.some((n) => n.id === nodeId || n.shortcutOf === nodeId));
    if (s) return { module, sub: s };
  }
  return null;
}

/**
 * The node an address is, for the menu: the tree's page (`navNodeAt`), a project's tab (`/projects/<id>?tab=…`), else
 * the page the address sits under (`/dpr/<id>` is Daily reports). `/modules/<key>` is that module and has no node.
 */
export function navNodeForPath(pathname: string, search = '', allowed: (n: NavNode) => boolean = () => true): NavNode | undefined {
  if (pathname === '/' || pathname.startsWith('/modules/')) return undefined;
  const tab = /^\/projects\/[\w-]+$/.test(pathname) ? new URLSearchParams(search).get('tab') : null;
  if (tab) {
    const n = NAV_TREE.find((x) => x.status === 'live' && x.projectTab === tab && !x.shortcutOf && allowed(x));
    if (n) return n;
  }
  const segs = pathname.split('/').filter(Boolean);
  for (let i = segs.length; i > 0; i--) {
    const n = navNodeAt(`/${segs.slice(0, i).join('/')}`, i === segs.length ? search : '', allowed);
    if (n) return n;
  }
  return undefined;
}

/**
 * What waits on the user in each module of their menu: their approvals whose list is one of its pages (`count` of each
 * submission type), and the queues counted on its pages (`nodeBadges`, by node id: requests to order, material to
 * check…). A module's count is what waits in it, so an entry in two modules counts in both. The web's module bar and
 * Home and the phone's menu read it.
 */
export function menuWaiting(menu: NavMenuModule[], approvals: { type: SubmissionType; count: number }[] | undefined, nodeBadges: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const listNode = new Map<SubmissionType, string | undefined>();
  for (const a of approvals ?? []) {
    if (!listNode.has(a.type)) {
      const [path, query = ''] = submissionListHref(a.type).split('?');
      listNode.set(a.type, navNodeForPath(path, query)?.id);
    }
  }
  for (const m of menu) {
    const ids = new Set(m.subs.flatMap((x) => x.nodes.map((n) => n.shortcutOf ?? n.id)));
    let n = 0;
    for (const a of approvals ?? []) if (ids.has(listNode.get(a.type) ?? '')) n += a.count;
    for (const [id, count] of Object.entries(nodeBadges ?? {})) if (id.includes('.') && ids.has(id)) n += count;
    if (n > 0) out[m.key] = n;
  }
  return out;
}

/** What is wrong with names an admin gives, or null: only known modules, and each at most `NAV_NAME_MAX` characters. */
export function navNamesProblem(names: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(names)) {
    if (!NAV_MODULE_NAME_KEYS.includes(key)) return `There is no module “${key}”. Reload the page and try again.`;
    if (typeof value !== 'string') return 'Write each name as text.';
    if (value.trim().length > NAV_NAME_MAX) return `Keep each name to ${NAV_NAME_MAX} characters or fewer.`;
  }
  return null;
}

/** The names to keep: trimmed, with a box left empty or the same as the set's own name dropped. */
export function cleanNavNames(names: Record<string, string>): Record<string, string> {
  const own = new Map([...AREA_MODULES, ...DEPARTMENT_MODULES].map((m) => [m.key, m.label]));
  const out: Record<string, string> = {};
  for (const key of NAV_MODULE_NAME_KEYS) {
    const v = names[key]?.trim().replace(/\s+/g, ' ');
    if (v && v !== own.get(key)) out[key] = v;
  }
  return out;
}

/** Settings read from the database, with anything unknown (an older value) back to the default. */
export function navSettingsFrom(row: { navLayout?: string | null; navLook?: string | null; navModuleSet?: string | null; navNames?: unknown; navPersonalLook?: boolean | null }): NavSettingsDto {
  const d = DEFAULT_NAV_SETTINGS;
  const names = row.navNames && typeof row.navNames === 'object' && !Array.isArray(row.navNames) ? (row.navNames as Record<string, unknown>) : {};
  return {
    layout: (NAV_LAYOUTS as readonly string[]).includes(row.navLayout ?? '') ? (row.navLayout as NavLayout) : d.layout,
    look: (NAV_LOOKS as readonly string[]).includes(row.navLook ?? '') ? (row.navLook as NavLook) : d.look,
    moduleSet: (NAV_MODULE_SETS as readonly string[]).includes(row.navModuleSet ?? '') ? (row.navModuleSet as NavModuleSet) : d.moduleSet,
    names: cleanNavNames(Object.fromEntries(Object.entries(names).filter((e): e is [string, string] => typeof e[1] === 'string'))),
    personalLook: !!row.navPersonalLook,
  };
}

/** Whether a company's choice is the default (so the sign-in leaves it out). */
export const isDefaultNav = (s: NavSettingsDto) =>
  s.layout === DEFAULT_NAV_SETTINGS.layout && s.look === DEFAULT_NAV_SETTINGS.look && s.moduleSet === DEFAULT_NAV_SETTINGS.moduleSet && !s.personalLook && Object.keys(s.names).length === 0;

/** Administration › Masters (item 135): each department's Masters sub-module, with only the pages this user may open. */
export function mastersByDepartment(user: NavUser): { module: NavModuleDef; nodes: NavNode[] }[] {
  return DEPARTMENT_MODULES.filter((m) => m.key !== 'administration')
    .map((m) => ({
      module: m,
      nodes: (m.subs.find((s) => s.key === 'masters')?.nodes ?? []).map((id) => navNode(id)).filter((n): n is NavNode => !!n && canSeeNav(user, n)),
    }))
    .filter((d) => d.nodes.length > 0);
}
