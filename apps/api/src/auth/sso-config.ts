import { configuredWebUrl } from '../common/web-url';
import { REAL_BASES, type ProviderBases } from './sso-rules';

/** Single sign-on's server settings (docs/DEPLOY.md "Single sign-on"). */

/** The API's own callback, registered with the provider as the redirect URI: https://<api>/api/auth/sso/callback */
export const ssoCallbackUrl = (): string | null => process.env.SSO_CALLBACK_URL?.trim() || null;

export const integrationKey = (): string | null => process.env.INTEGRATION_KEY || null;

/** Why this server cannot sign anyone in with SSO, in words for the admin, or null when it can. */
export function ssoServerProblem(): string | null {
  if (!ssoCallbackUrl()) return 'Single sign-on cannot be set up until SSO_CALLBACK_URL is set on the server (see DEPLOY.md).';
  if (!configuredWebUrl()) return 'Single sign-on cannot be set up until WEB_URL is set on the server (see DEPLOY.md).';
  if (!integrationKey()) return 'Single sign-on cannot be set up until INTEGRATION_KEY is set on the server (see DEPLOY.md).';
  return null;
}

/** The real providers, unless a test points them at its stand-in. */
export const providerBases = (): ProviderBases => ({
  entraAuthority: process.env.SSO_ENTRA_AUTHORITY?.trim() || REAL_BASES.entraAuthority,
  googleIssuer: process.env.SSO_GOOGLE_ISSUER?.trim() || REAL_BASES.googleIssuer,
});
