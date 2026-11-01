/** Platform admin: the console for Nirmaan staff. */
import type { BillingStateDto } from './types';
import type { ModuleTier, SwitchableModule } from './module-switches';

/** How long a company admin's consent lets Nirmaan support open the company read-only. */
export const SUPPORT_ACCESS_DAYS = 7;
/** How long one read-only support session lasts. */
export const SUPPORT_SESSION_HOURS = 2;

export interface PlatformCompanyDto {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  activeUsers: number;
  projects: number;
  /** Last thing anyone in the company did (audit log), null if nothing yet */
  lastActivityAt: string | null;
  /** Audit log entries in the last 30 days */
  actions30d: number;
  storageBytes: number;
  files: number;
  suspendedAt: string | null;
  suspendedReason: string | null;
  /** Read-only support access allowed until (company admin's consent), null if not allowed */
  supportAccessUntil: string | null;
  deletionScheduledFor: string | null;
  /** Trial or subscription, only when billing is switched on */
  billing?: BillingStateDto;
  /** The plan's module set; null = every module */
  moduleTier: ModuleTier | null;
  /** The modules off for the company: turned off by its admin or left out of the plan */
  modulesOff: SwitchableModule[];
}

export interface PlatformUserDto {
  id: string;
  fullName: string;
  email: string;
  roleName: string;
  isActive: boolean;
  createdAt: string;
  lastActivityAt: string | null;
}

export interface PlatformCompanyDetailDto extends PlatformCompanyDto {
  users: PlatformUserDto[];
  supportAccessGrantedByName: string | null;
}

/** A company's consent for Nirmaan support, as its admin sees it. */
export interface SupportAccessDto {
  until: string | null;
  grantedByName: string | null;
}

/** A read-only support session: the token to use instead of the staff member's own. */
export interface SupportSessionDto {
  accessToken: string;
  organizationName: string;
  expiresAt: string;
}

/** One entry of the company log: exports, deletion requests, support consent and visits, suspensions. */
export interface CompanyLogEntryDto {
  id: string;
  action: string;
  actorName: string;
  note: string | null;
  createdAt: string;
}
