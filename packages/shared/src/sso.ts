import { SSO_PROVIDERS, type RoleKey, type SsoProvider } from './enums';

/** Single sign-on (item 195, ARCHITECTURE "Single sign-on"): who signs a company's people in, and in what words. */

/** The name on the button and in messages ("Sign in with Microsoft") and the provider's own name in settings. */
export const SSO_PROVIDER_INFO: Record<SsoProvider, { button: string; name: string }> = {
  ENTRA: { button: 'Microsoft', name: 'Microsoft Entra ID' },
  GOOGLE: { button: 'Google', name: 'Google Workspace' },
};

/** Roles a person added on first sign-in may get: staff only, never an admin, a supplier or a client's guest. */
export const SSO_NEW_PERSON_ROLES = [
  'SITE_ENGINEER',
  'TEAM_LEADER',
  'PROJECT_MANAGER',
  'STORE_MANAGER',
  'QUANTITY_SURVEYOR',
  'PROCUREMENT_MANAGER',
  'QA_QC_ENGINEER',
  'SAFETY_OFFICER',
  'DOCUMENT_CONTROLLER',
  'ACCOUNTS_MANAGER',
  'HR_MANAGER',
  'MANAGEMENT',
] as const satisfies readonly RoleKey[];
export type SsoNewPersonRole = (typeof SSO_NEW_PERSON_ROLES)[number];

/**
 * Why a single sign-on did not finish, as the sign-in page says it. The API redirects to `/login/sso#error=<key>`; each
 * line says what to do next.
 */
export const SSO_PROBLEMS = {
  NOT_SET_UP: 'This company does not sign in with single sign-on. Check the company code, or sign in with your email and password.',
  EXPIRED: 'This sign-in took too long or was already used. Start again from the sign-in page.',
  BROWSER: 'Finish signing in in the browser you started in. Start again from the sign-in page.',
  PROVIDER: 'Your company’s sign-in service did not let you in. Try again, or ask your admin to check the single sign-on settings.',
  TOKEN: 'The answer from your company’s sign-in service could not be checked. Try again, or ask your admin to check the client ID and secret.',
  TENANT: 'That account belongs to another organisation’s directory. Sign in with your work account for this company.',
  UNVERIFIED: 'Your company’s sign-in service does not vouch for your account’s email. Ask your admin to check it (see Company settings › Sign-in), then sign in again.',
  GUEST: 'A guest account of your company’s directory cannot sign in here. Sign in with your own work account.',
  PLATFORM: 'This account signs in with its email and password. Choose Sign in with your email and password.',
  DOMAIN: 'Your email’s domain is not one this company signs in with. Sign in with your work account, or ask your admin to add the domain.',
  NO_PLACE: 'You have no place in this company yet. Ask your admin to add you, then sign in again.',
  SWITCHED_OFF: 'Your place in this company is switched off. Ask your admin to switch it on.',
  LINKED_ELSEWHERE: 'Your Nirmaan sign-in is already linked to another account at this provider. Sign in with that account, or ask your admin.',
  SUSPENDED: 'This company is suspended on Nirmaan. Ask your admin to contact Nirmaan support.',
  TOO_MANY: 'Too many sign-in attempts from this network. Wait 15 minutes, then start again.',
} as const;
export type SsoProblem = keyof typeof SSO_PROBLEMS;

export const isSsoProblem = (key: string): key is SsoProblem => Object.prototype.hasOwnProperty.call(SSO_PROBLEMS, key);

/** A domain as typed ("@Company.com ", "company.com"): lower case, no @, or null when it cannot be one. */
export function normaliseDomain(typed: string): string | null {
  const d = typed.trim().toLowerCase().replace(/^@/, '');
  return /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : null;
}

/** The domain of an email, lower case, or null. */
export function emailDomain(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf('@') ?? -1;
  return email && at > 0 ? email.slice(at + 1).trim().toLowerCase() : null;
}

/** Whether an email is in one of the company's domains (exactly; a subdomain is its own entry). */
export function domainAllowed(email: string | null | undefined, allowedDomains: readonly string[]): boolean {
  const d = emailDomain(email);
  return !!d && allowedDomains.includes(d);
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SsoSettingsInput {
  provider: SsoProvider;
  tenantId?: string | null;
  clientId: string;
  /** Blank keeps the saved secret */
  clientSecret?: string | null;
  allowedDomains: string[];
  enforce: boolean;
  addNewPeople: boolean;
  newPersonRole?: string | null;
}

/** What is wrong with the settings as given, in words for the form, or null. `hasSecret`: a secret is already saved. */
export function ssoSettingsProblem(s: SsoSettingsInput, hasSecret: boolean): string | null {
  if (!(SSO_PROVIDERS as readonly string[]).includes(s.provider)) return 'Choose Microsoft Entra ID or Google Workspace';
  if (s.provider === 'ENTRA' && !GUID.test((s.tenantId ?? '').trim())) return 'Enter the directory (tenant) ID, the GUID on the app’s Overview in Entra';
  if (!s.clientId.trim()) return 'Enter the client ID the provider gave the app';
  if (!hasSecret && !s.clientSecret?.trim()) return 'Enter the client secret';
  if (!s.allowedDomains.length) return 'Add at least one email domain, such as company.com';
  const bad = s.allowedDomains.find((d) => !normaliseDomain(d));
  if (bad) return `"${bad}" is not a domain. Enter it as company.com`;
  if (s.addNewPeople && !(SSO_NEW_PERSON_ROLES as readonly string[]).includes(s.newPersonRole ?? '')) return 'Choose the role new people get';
  return null;
}

/** Company settings › Sign-in. The secret itself never leaves the API. */
export interface SsoSettingsDto {
  settings: {
    provider: SsoProvider;
    tenantId: string | null;
    clientId: string;
    secretLast4: string;
    allowedDomains: string[];
    enforce: boolean;
    addNewPeople: boolean;
    newPersonRole: SsoNewPersonRole | null;
    updatedAt: string;
    /** People linked to an account at the provider */
    linked: number;
  } | null;
  companyCode: string;
  /** The address to register with the provider as the redirect URI; null until SSO_CALLBACK_URL is set */
  callbackUrl: string | null;
  /** Why settings cannot be saved on this server (no INTEGRATION_KEY, SSO_CALLBACK_URL or WEB_URL), or null */
  serverProblem: string | null;
  /** This session was signed in through the company's single sign-on (needed before requiring it) */
  signedInWithSso: boolean;
  /** This session may turn on Require single sign-on: it came through the company's own single sign-on, or it is a platform admin's */
  mayRequire: boolean;
}

/** `GET /auth/sso/:orgCode`: which button the sign-in page shows. */
export interface SsoCompanyDto {
  provider: SsoProvider;
  companyCode: string;
}
