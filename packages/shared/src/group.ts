import type { CompanyKind, RoleKey } from './enums';
import { canMakeGroup, isGuest } from './permissions';
import type { SwitchableModule } from './module-switches';

/**
 * Group companies (ARCHITECTURE "Group companies"). A parent company's group holds companies that each stay a
 * full company (own data, roles, books and menu). A person signs in once and moves between the companies they have a
 * place in with the company switcher; the group's admins make companies and give people places in them.
 */

export interface CompanyKindInfo {
  description: string;
  /** The switchable modules a new company of this kind starts with turned off. Its admin can turn them on. */
  modulesOff: readonly SwitchableModule[];
}

export const COMPANY_KIND_INFO: Record<CompanyKind, CompanyKindInfo> = {
  CONSTRUCTION: { description: 'Builds projects: every module.', modulesOff: [] },
  CONSULTANCY: {
    description: 'Design, supervision or project management: no plant, RMC or subcontract enquiries.',
    modulesOff: ['rmc', 'machine_loans', 'subcontract_enquiries', 'biometric'],
  },
  QUALITY_LAB: {
    description: 'Tests and inspections for its own and sister projects: no plant, RMC, tenders or site cash.',
    modulesOff: ['rmc', 'machine_loans', 'subcontract_enquiries', 'tenders', 'imprest', 'biometric'],
  },
  PLANT: { description: 'A plant, RMC unit or yard: no tenders or subcontract enquiries.', modulesOff: ['tenders', 'subcontract_enquiries', 'material_approvals'] },
  HOLDING: {
    description: 'Owns the other companies: books, payroll and guarantees only.',
    modulesOff: ['meetings', 'material_approvals', 'safety', 'imprest', 'tenders', 'subcontract_enquiries', 'biometric', 'rmc', 'machine_loans'],
  },
};

/** A company the signed-in person can switch to (`AuthUser.companies`, only when they have more than one). */
export interface CompanyChoiceDto {
  id: string;
  name: string;
  kind: CompanyKind;
  /** Their role there */
  roleName: string;
  /** The company of this session */
  current: boolean;
}

/** The group the signed-in person's company belongs to (`AuthUser.group`) */
export interface AuthGroupDto {
  id: string;
  name: string;
  /** They run the group: make companies and give people places */
  admin: boolean;
}

/** Who may open Group companies: the group's admins, and a company's admin before it has a group (to make one). */
export const canSeeGroupCompanies = (u: { roleKey: RoleKey; group?: AuthGroupDto }) => (u.group ? u.group.admin : canMakeGroup(u.roleKey));

/** Roles a person can be given in a sister company from Group companies: staff roles. Guests and suppliers are invited from the company's own pages. */
export const isGroupPlaceRole = (role: RoleKey) => !isGuest(role);

export interface GroupCompanyDto {
  id: string;
  name: string;
  kind: CompanyKind;
  legalName: string | null;
  pan: string | null;
  cin: string | null;
  gstin: string | null;
  /** Active people in it */
  people: number;
  /** The company of this session */
  current: boolean;
  /** The caller's role there, or null when they have no place in it */
  yourRole: string | null;
}

export interface GroupPlaceDto {
  organizationId: string;
  companyName: string;
  roleKey: RoleKey;
  roleName: string;
  isActive: boolean;
}

export interface GroupPersonDto {
  loginId: string;
  fullName: string;
  email: string;
  /** Runs the group */
  admin: boolean;
  /** Their place in each company of the group, by company name */
  places: GroupPlaceDto[];
}

export interface GroupDto {
  id: string;
  name: string;
  companies: GroupCompanyDto[];
  people: GroupPersonDto[];
}

/** `GET /group`: the company's group, or null with whether the caller may make one. */
export interface GroupStateDto {
  group: GroupDto | null;
  canMakeGroup: boolean;
}

export interface GroupCompanyInput {
  name: string;
  kind: CompanyKind;
  legalName?: string | null;
  pan?: string | null;
  cin?: string | null;
  gstin?: string | null;
}

/** A company's corporate identity number: L or U, the industry code, state, year, type and number (21 characters). */
export const CIN_PATTERN = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
