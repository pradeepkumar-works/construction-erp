import { createHash, createHmac } from 'crypto';
import { SSO_PROVIDER_INFO, domainAllowed, type SsoProblem, type SsoProvider } from '@erp/shared';

/**
 * Single sign-on's rules (ARCHITECTURE "Single sign-on"), with no database or network: where each provider lives, what
 * an ID token must say, who it is, whether a company refuses passwords and which sessions it accepts. Tested in
 * `src/scripts/sso-test.ts`.
 */

/** A company's settings as the rules read them (`OrganizationSso` without its secret). */
export interface SsoSetup {
  provider: SsoProvider;
  tenantId: string | null;
  clientId: string;
  allowedDomains: string[];
  enforce: boolean;
  addNewPeople: boolean;
  newPersonRole: string | null;
}

/** Where the providers live. Only tests point these elsewhere (SSO_ENTRA_AUTHORITY, SSO_GOOGLE_ISSUER), at a stand-in. */
export interface ProviderBases {
  entraAuthority: string;
  googleIssuer: string;
}

export const REAL_BASES: ProviderBases = { entraAuthority: 'https://login.microsoftonline.com', googleIssuer: 'https://accounts.google.com' };

export type Claims = Record<string, unknown>;

/** Who the provider says signed in: the key an identity is linked by, and the email to match a first sign-in by. */
export interface ProvedIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  /** The person's name, for someone added at their first sign-in */
  name: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const trimSlash = (u: string) => u.replace(/\/+$/, '');

interface ProviderRule {
  /** Issuers a token may name; the first is where discovery is read */
  issuers(s: SsoSetup, b: ProviderBases): string[];
  /** What else the token must say, after signature, audience, expiry, issuer and nonce */
  check(s: SsoSetup, c: Claims): SsoProblem | null;
  identity(s: SsoSetup, c: Claims): ProvedIdentity;
}

const PROVIDERS: Record<SsoProvider, ProviderRule> = {
  ENTRA: {
    issuers: (s, b) => [`${trimSlash(b.entraAuthority)}/${(s.tenantId ?? '').toLowerCase()}/v2.0`],
    // The directory is the company's own, so an account of any other directory is someone else's.
    check: (s, c) => (str(c.tid)?.toLowerCase() !== (s.tenantId ?? '').toLowerCase() ? 'TENANT' : !str(c.oid) ? 'TOKEN' : null),
    // oid is the person in the directory; email is mutable in Entra, so it only finds a first sign-in.
    identity: (s, c) => {
      const email = str(c.email) ?? (str(c.preferred_username)?.includes('@') ? str(c.preferred_username) : null);
      return { issuer: `entra:${str(c.tid)!.toLowerCase()}`, subject: str(c.oid)!, email: email?.toLowerCase() ?? null, name: str(c.name) };
    },
  },
  GOOGLE: {
    issuers: (_s, b) => {
      const iss = trimSlash(b.googleIssuer);
      return iss === REAL_BASES.googleIssuer ? [iss, 'accounts.google.com'] : [iss];
    },
    check: (s, c) => {
      if (!str(c.sub)) return 'TOKEN';
      if (c.email_verified !== true) return 'UNVERIFIED';
      // hd names the Workspace domain; a personal Gmail account has none.
      const hd = str(c.hd)?.toLowerCase();
      return hd && s.allowedDomains.includes(hd) ? null : 'DOMAIN';
    },
    identity: (_s, c) => ({ issuer: 'google', subject: str(c.sub)!, email: str(c.email)?.toLowerCase() ?? null, name: str(c.name) }),
  },
};

export const issuersOf = (s: SsoSetup, b: ProviderBases) => PROVIDERS[s.provider].issuers(s, b);
export const discoveryUrl = (s: SsoSetup, b: ProviderBases) => `${issuersOf(s, b)[0]}/.well-known/openid-configuration`;

/**
 * What is wrong with an ID token whose signature, audience and expiry `jose` has checked, or null. The tenant comes
 * first so a token from another directory says so, whatever else is off.
 */
export function claimsProblem(s: SsoSetup, c: Claims, expect: { nonce: string; bases: ProviderBases }): SsoProblem | null {
  const rule = PROVIDERS[s.provider];
  if (s.provider === 'ENTRA' && str(c.tid)?.toLowerCase() !== (s.tenantId ?? '').toLowerCase()) return 'TENANT';
  if (!rule.issuers(s, expect.bases).includes(str(c.iss) ?? '')) return 'TOKEN';
  if (str(c.nonce) !== expect.nonce) return 'TOKEN';
  return rule.check(s, c);
}

/** The person a token proves, once `claimsProblem` is null. */
export const identityOf = (s: SsoSetup, c: Claims): ProvedIdentity => PROVIDERS[s.provider].identity(s, c);

/** A person's place in the company that is signing them in. */
export type Place = 'ACTIVE' | 'OFF' | 'NONE';

export interface MatchFacts {
  setup: SsoSetup;
  identity: ProvedIdentity;
  /** The Login this identity is already linked to in the company, and its place there */
  linked: { place: Place } | null;
  /** The Login with the identity's email, its place in the company, and whether it already has an identity of this issuer there */
  byEmail: { place: Place; issuerLinked: boolean } | null;
}

/** Who signs in: the linked person, a person linked now by email, a new person, or a refusal. */
export type Match = { kind: 'LINKED' } | { kind: 'LINK' } | { kind: 'ADD' } | { kind: 'REFUSE'; problem: SsoProblem };

const refuse = (problem: SsoProblem): Match => ({ kind: 'REFUSE', problem });
const placeProblem = (p: Place): SsoProblem | null => (p === 'ACTIVE' ? null : p === 'OFF' ? 'SWITCHED_OFF' : 'NO_PLACE');

export function matchLogin(f: MatchFacts): Match {
  if (f.linked) {
    const p = placeProblem(f.linked.place);
    return p ? refuse(p) : { kind: 'LINKED' };
  }
  if (!domainAllowed(f.identity.email, f.setup.allowedDomains)) return refuse('DOMAIN');
  if (f.byEmail) {
    const p = placeProblem(f.byEmail.place);
    if (p) return refuse(p);
    // Linked once: another account of the same provider never takes the place over by its email.
    return f.byEmail.issuerLinked ? refuse('LINKED_ELSEWHERE') : { kind: 'LINK' };
  }
  // A Login only another company has stays that company's: this one's admin adds the person by hand.
  return f.setup.addNewPeople && f.setup.newPersonRole ? { kind: 'ADD' } : refuse('NO_PLACE');
}

/** Whether the company refuses this person's password: it requires SSO, and they are no platform admin or supplier login. */
export function ssoEnforced(s: Pick<SsoSetup, 'enforce'> | null, person: { platformAdmin: boolean; roleKey: string }): boolean {
  return !!s?.enforce && !person.platformAdmin && person.roleKey !== 'SUPPLIER';
}

/** How a session was proved: a password (or a link that set one), or a company's single sign-on. */
export type SessionProof = { kind: 'PASSWORD' } | { kind: 'SSO'; organizationId: string };

/**
 * Whether an SSO proved by one company's settings stands for another's: the same Entra directory, or Google domains
 * the other company takes all of (the proved `hd` was one of the first's).
 */
export function sameSignIn(proved: SsoSetup, target: SsoSetup): boolean {
  if (proved.provider !== target.provider) return false;
  if (proved.provider === 'ENTRA') return !!proved.tenantId && proved.tenantId.toLowerCase() === (target.tenantId ?? '').toLowerCase();
  return proved.allowedDomains.length > 0 && proved.allowedDomains.every((d) => target.allowedDomains.includes(d));
}

/** Whether a company takes a session for this person proved this way. `provedBy` is the settings of the proof's company. */
export function proofAccepted(
  target: { organizationId: string; setup: SsoSetup | null },
  person: { platformAdmin: boolean; roleKey: string },
  proof: SessionProof,
  provedBy: SsoSetup | null,
): boolean {
  if (!ssoEnforced(target.setup, person)) return true;
  if (proof.kind !== 'SSO') return false;
  return proof.organizationId === target.organizationId || (!!provedBy && !!target.setup && sameSignIn(provedBy, target.setup));
}

/** The refusal of a password (or a switch) where the company requires SSO: how to sign in instead. */
export const ssoRequiredMessage = (company: { name: string; code: string }, provider: SsoProvider) =>
  `${company.name} signs in with ${SSO_PROVIDER_INFO[provider].button}. Choose "Use single sign-on" and enter the company code ${company.code}.`;

export const STATE_MINUTES = 10;
export const CODE_SECONDS = 60;

const b64url = (b: Buffer) => b.toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * The PKCE verifier and the nonce of a sign-in, derived from its state with the server's key, so neither is stored and
 * the state seen in a URL gives neither away. The challenge is S256 of the verifier.
 */
export function flowSecrets(state: string, key: string): { verifier: string; nonce: string; challenge: string } {
  const verifier = b64url(createHmac('sha256', key).update(`pkce:${state}`).digest());
  const nonce = b64url(createHmac('sha256', key).update(`nonce:${state}`).digest());
  return { verifier, nonce, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

/** The provider's sign-in page for this flow. */
export function authorizeUrl(endpoint: string, s: SsoSetup, f: { redirectUri: string; state: string; nonce: string; challenge: string }): string {
  const u = new URL(endpoint);
  const q: Record<string, string> = {
    client_id: s.clientId,
    response_type: 'code',
    redirect_uri: f.redirectUri,
    scope: 'openid email profile',
    state: f.state,
    nonce: f.nonce,
    code_challenge: f.challenge,
    code_challenge_method: 'S256',
    // Google: offer the company's own accounts first (a hint; `hd` in the token is what counts).
    ...(s.provider === 'GOOGLE' && s.allowedDomains.length === 1 ? { hd: s.allowedDomains[0] } : {}),
  };
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return u.toString();
}

/** A cookie value from a Cookie header. */
export function cookieOf(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
