import type { RoleKey } from './enums';

/**
 * Menu by role (ARCHITECTURE "Menu by role"): the modules a role's menu shows, by module key of both sets (the tree's own
 * areas and the department modules). A role may open far more than it works in (a site engineer could open 116 pages, the
 * RMC plant and the masters among them), so its menu keeps to its own work on day one. What it leaves out is not refused:
 * those pages still open from Home's modules, Search and links. A role not listed (admin, management, the project manager,
 * accounts, who span the company) gets every module it may open.
 */
const SITE: readonly string[] = [
  'project-management', 'quality-control', 'design-drawings', 'store-inventory', 'machinery-vehicles', 'labour-management', 'hr-payroll',
  'projects', 'site', 'quality', 'safety', 'documents', 'materials', 'plant', 'people',
];

export const ROLE_MENU: Partial<Record<RoleKey, readonly string[]>> = {
  SITE_ENGINEER: SITE,
  TEAM_LEADER: SITE,
  STORE_MANAGER: [
    'store-inventory', 'purchase-management', 'machinery-vehicles', 'plant-production', 'project-management', 'quality-control', 'contractor-management',
    'materials', 'purchases', 'plant', 'rmc', 'projects', 'site', 'quality', 'subcontracts',
  ],
  PROCUREMENT_MANAGER: [
    'purchase-management', 'store-inventory', 'contractor-management', 'machinery-vehicles', 'project-management', 'accounts-finance',
    'purchases', 'materials', 'subcontracts', 'plant', 'projects', 'accounts',
  ],
  QUANTITY_SURVEYOR: [
    'project-management', 'planning-estimation', 'contractor-management', 'design-drawings', 'correspondence', 'store-inventory', 'quality-control', 'reports-mis',
    'projects', 'site', 'billing', 'tenders', 'subcontracts', 'documents', 'correspondence', 'materials', 'quality', 'reports',
  ],
  QA_QC_ENGINEER: [
    'quality-control', 'project-management', 'design-drawings', 'store-inventory', 'plant-production',
    'quality', 'safety', 'site', 'projects', 'documents', 'materials', 'rmc',
  ],
  SAFETY_OFFICER: [
    'project-management', 'quality-control', 'labour-management', 'machinery-vehicles', 'hr-payroll',
    'safety', 'site', 'projects', 'quality', 'people', 'plant',
  ],
  HR_MANAGER: ['hr-payroll', 'labour-management', 'contractor-management', 'reports-mis', 'people', 'payroll', 'subcontracts', 'reports'],
  DOCUMENT_CONTROLLER: ['design-drawings', 'correspondence', 'project-management', 'documents', 'projects'],
};

/** Whether a module (either set's key) is in the role's menu. Pages directly under the top (Home, Approvals) always are. */
export const inRoleMenu = (role: RoleKey, moduleKey: string): boolean => {
  const keep = ROLE_MENU[role];
  return !keep || keep.includes(moduleKey);
};

/** Site roles keep no Masters in their menu: the company's lists are kept by the office (HR's, quality's and the store's
 *  own masters stay with them), and every list is still in Admin › Masters for whoever may open it. */
const NO_MASTERS: ReadonlySet<RoleKey> = new Set(['SITE_ENGINEER', 'TEAM_LEADER', 'SAFETY_OFFICER', 'DOCUMENT_CONTROLLER']);
export const roleMenuHasMasters = (role: RoleKey): boolean => !NO_MASTERS.has(role);
