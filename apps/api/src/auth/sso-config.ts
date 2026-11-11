import { PRODUCT_NAME } from '@erp/shared';
import { configuredWebUrl } from '../common/web-url';
import { isDeployed } from '../common/jwt-secret';
import { providerBasesFrom, type ProviderBases } from './sso-rules';

/** Single sign-on's server settings (docs/DEPLOY.md "Single sign-on"). */

/** The API's own callback, registered with the provider as the redirect URI: https://<api>/api/auth/sso/callback */
export const ssoCallbackUrl = (): string | null => process.env.SSO_CALLBACK_URL?.trim() || null;

export const integrationKey = (): string | null => process.env.INTEGRATION_KEY || null;

/** The settings this server is missing for single sign-on, for the operator's log (DEPLOY.md). */
export function ssoServerMissing(): string[] {
  return [!ssoCallbackUrl() && 'SSO_CALLBACK_URL', !configuredWebUrl() && 'WEB_URL', !integrationKey() && 'INTEGRATION_KEY'].filter((v): v is string => !!v);
}

/** Why this server cannot sign anyone in with SSO, in words for the company's admin, or null when it can. */
export const ssoServerProblem = (): string | null => (ssoServerMissing().length ? `Single sign-on is not available on this server yet. Ask ${PRODUCT_NAME} support.` : null);

/** The real providers, unless a local run points one at a stand-in on this machine (never a deployed API). */
export const providerBases = (): ProviderBases => providerBasesFrom({ entra: process.env.SSO_ENTRA_AUTHORITY, google: process.env.SSO_GOOGLE_ISSUER }, isDeployed());

/** The state cookie's path: the API's single sign-on routes (the callback's folder), so it goes nowhere else. */
export function ssoCookiePath(): string {
  try {
    const p = new URL(ssoCallbackUrl() ?? '').pathname.replace(/\/callback\/?$/, '');
    return p.startsWith('/') && p.length > 1 ? p : '/api/auth/sso';
  } catch {
    return '/api/auth/sso';
  }
}
