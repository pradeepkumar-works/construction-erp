import type { RoleKey } from './enums';

/** Roles that see every project in the organisation without being a project member. */
export const COMPANY_WIDE_ROLES: RoleKey[] = [
  'ADMIN',
  'MANAGEMENT',
  'PROCUREMENT_MANAGER',
  'ACCOUNTS_MANAGER',
  'HR_MANAGER',
];

/** Roles allowed to approve / reject site submissions (within their accessible projects). */
export const APPROVER_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles allowed to create and edit projects, BOQ and activities. */
export const PROJECT_EDITOR_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'];

/** Roles allowed to manage users. */
export const USER_ADMIN_ROLES: RoleKey[] = ['ADMIN'];

export const isCompanyWide = (role: RoleKey) => COMPANY_WIDE_ROLES.includes(role);
export const canApprove = (role: RoleKey) => APPROVER_ROLES.includes(role);
export const canEditProjects = (role: RoleKey) => PROJECT_EDITOR_ROLES.includes(role);
export const canManageUsers = (role: RoleKey) => USER_ADMIN_ROLES.includes(role);
