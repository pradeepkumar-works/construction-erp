import { createHash, createHmac, hkdfSync } from 'crypto';
import { PRODUCT_NAME, SSO_PROVIDER_INFO, domainAllowed, isGuest, type RoleKey, type SsoProblem, type SsoProvider } from '@erp/shared';

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

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
const localUrl = (u: string | undefined): string | null => {
  try {
    const x = new URL(u?.trim() ?? '');
    return /^https?:$/.test(x.protocol) && LOCAL_HOSTS.includes(x.hostname) ? x.toString().replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
};

/**
 * Where the providers live for this server: the real ones, unless a local run points one at a stand-in on this machine
 * (SSO_ENTRA_AUTHORITY, SSO_GOOGLE_ISSUER at http://localhost or 127.0.0.1). A deployed API never takes the override.
 */
export function providerBasesFrom(env: { entra?: string; google?: string }, deployed: boolean): ProviderBases {
  return {
    entraAuthority: (!deployed && localUrl(env.entra)) || REAL_BASES.entraAuthority,
    googleIssuer: (!deployed && localUrl(env.google)) || REAL_BASES.googleIssuer,
  };
}

/** Whether a provider's endpoint (from its discovery document) may be called: https, or the local stand-in's own address. */
export function endpointAllowed(url: unknown, bases: ProviderBases): boolean {
  if (typeof url !== 'string') return false;
  try {
    const x = new URL(url);
    if (x.protocol === 'https:') return true;
    const standIn = bases.entraAuthority !== REAL_BASES.entraAuthority || bases.googleIssuer !== REAL_BASES.googleIssuer;
    return standIn && x.protocol === 'http:' && LOCAL_HOSTS.includes(x.hostname);
  } catch {
    return false;
  }
}

export type Claims = Record<string, unknown>;

/** Who the provider says signed in: the key an identity is linked by, and the email to match a first sign-in by. */
export interface ProvedIdentity {
  issuer: string;
  subject: string;
  /** An email the provider vouches for, the only one a first sign-in is matched or added by */
  email: string | null;
  /** The person's name, for someone added at their first sign-in */
  name: string | null;
  /** Why this account may not be linked at a first sign-in (a guest, an email nobody verified), or null */
  linkProblem: SsoProblem | null;
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
    // oid is the person in the directory. Entra's email claim is anything a user or admin typed, so a first sign-in is
    // matched only by an email the directory verified (the optional claim xms_edov) or a member's sign-in name, whose
    // domain the directory owns (acct 0, no #EXT#). Guests of the directory are never linked.
    identity: (s, c) => {
      const upn = str(c.preferred_username);
      const guest = c.acct === 1 || c.acct === '1' || /#ext#/i.test(upn ?? '');
      const member = c.acct === 0 || c.acct === '0';
      const email = guest ? null : c.xms_edov === true && str(c.email)?.includes('@') ? str(c.email) : member && upn?.includes('@') ? upn : null;
      return {
        issuer: `entra:${str(c.tid)!.toLowerCase()}`,
        subject: str(c.oid)!,
        email: email?.toLowerCase() ?? null,
        name: str(c.name),
        linkProblem: guest ? 'GUEST' : email ? null : 'UNVERIFIED',
      };
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
    // `check` has already refused an email Google has not verified.
    identity: (_s, c) => ({ issuer: 'google', subject: str(c.sub)!, email: str(c.email)?.toLowerCase() ?? null, name: str(c.name), linkProblem: null }),
  },
};

export const issuersOf = (s: SsoSetup, b: ProviderBases) => PROVIDERS[s.provider].issuers(s, b);
export const discoveryUrl = (s: SsoSetup, b: ProviderBases) => `${issuersOf(s, b)[0]}/.well-known/openid-configuration`;

/** What `jose` checks of an ID token: the key's algorithm, the audience, the issuer and the claims a sign-in needs. */
export const verifyOptions = (s: SsoSetup, b: ProviderBases) => ({
  audience: s.clientId,
  issuer: issuersOf(s, b),
  algorithms: ['RS256'],
  requiredClaims: ['exp', 'iat', 'nonce'],
  clockTolerance: 60,
});

/**
 * What is wrong with an ID token whose signature, audience and expiry `jose` has checked, or null. The tenant comes
 * first so a token from another directory says so, whatever else is off.
 */
export function claimsProblem(s: SsoSetup, c: Claims, expect: { nonce: string; bases: ProviderBases }): SsoProblem | null {
  const rule = PROVIDERS[s.provider];
  if (s.provider === 'ENTRA' && str(c.tid)?.toLowerCase() !== (s.tenantId ?? '').toLowerCase()) return 'TENANT';
  if (!rule.issuers(s, expect.bases).includes(str(c.iss) ?? '')) return 'TOKEN';
  if (str(c.nonce) !== expect.nonce) return 'TOKEN';
  // A token for several audiences must say it was issued to this app (OpenID Connect Core 3.1.3.7).
  if ((Array.isArray(c.aud) && c.aud.length > 1 && str(c.azp) !== s.clientId) || (c.azp !== undefined && str(c.azp) !== s.clientId)) return 'TOKEN';
  return rule.check(s, c);
}

/** The person a token proves, once `claimsProblem` is null. */
export const identityOf = (s: SsoSetup, c: Claims): ProvedIdentity => PROVIDERS[s.provider].identity(s, c);

/** A person's place in the company that is signing them in. */
export type Place = 'ACTIVE' | 'OFF' | 'NONE';

export interface MatchFacts {
  setup: SsoSetup;
  identity: ProvedIdentity;
  /** The identity's email is a platform admin's (PLATFORM_ADMIN_EMAILS): never linked or added by single sign-on */
  platformEmail: boolean;
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
  if (f.identity.linkProblem) return refuse(f.identity.linkProblem);
  // Nirmaan staff sign in with their password only: a company's directory never speaks for them.
  if (f.platformEmail) return refuse('PLATFORM');
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

export interface Person {
  platformAdmin: boolean;
  roleKey: string;
}

/**
 * Whether the company requires single sign-on of this person: it requires it, and they are no platform admin and no
 * guest (a client's engineer, a consultant or a supplier login keeps a password, being from outside the company).
 */
export function ssoEnforced(s: Pick<SsoSetup, 'enforce'> | null | undefined, person: Person): boolean {
  return !!s?.enforce && !person.platformAdmin && !isGuest(person.roleKey as RoleKey);
}

/** Where a password is typed: the website, or the phone app (which sends `client: 'phone'`). */
export type SignInClient = 'web' | 'phone';

/**
 * The phone app has no single sign-on yet, so a company that requires it still takes a password there (PHONE in the
 * design note): Require single sign-on is a rule for the website until then. Refusing on the phone too is this false.
 */
export const phoneMayUsePassword = true;

/** Whether this company refuses this person's password typed on this client. */
export function passwordRefused(s: Pick<SsoSetup, 'enforce'> | null | undefined, person: Person, client: SignInClient): boolean {
  return ssoEnforced(s, person) && !(client === 'phone' && phoneMayUsePassword);
}

/** How a session was proved: a password on the website (or a link that set one), a password on the phone, or a company's single sign-on. */
export type SessionProof = { kind: 'PASSWORD' } | { kind: 'PHONE' } | { kind: 'SSO'; organizationId: string };

/** What a session token says of its proof: `sso` (the proving company) or `ph`; a website password says nothing. */
export const proofClaims = (p: SessionProof): { sso?: string; ph?: 1 } => (p.kind === 'SSO' ? { sso: p.organizationId } : p.kind === 'PHONE' ? { ph: 1 } : {});

export const proofOfClaims = (t: { sso?: unknown; ph?: unknown }): SessionProof =>
  typeof t.sso === 'string' && t.sso ? { kind: 'SSO', organizationId: t.sso } : t.ph === 1 ? { kind: 'PHONE' } : { kind: 'PASSWORD' };

/**
 * Whether a session already open still stands in its company on each request: a company that has come to require single
 * sign-on ends the website password sessions of the people it requires it of (`jwt.strategy.ts`).
 */
export function sessionStands(s: Pick<SsoSetup, 'enforce'> | null | undefined, person: Person, proof: SessionProof): boolean {
  return proof.kind === 'SSO' || !passwordRefused(s, person, proof.kind === 'PHONE' ? 'phone' : 'web');
}

/**
 * Whether an SSO proved by one company's settings stands for another's: the same Entra directory, or Google domains
 * the other company takes all of (the proved `hd` was one of the first's).
 */
export function sameSignIn(proved: SsoSetup, target: SsoSetup): boolean {
  if (proved.provider !== target.provider) return false;
  if (proved.provider === 'ENTRA') return !!proved.tenantId && proved.tenantId.toLowerCase() === (target.tenantId ?? '').toLowerCase();
  return proved.allowedDomains.length > 0 && proved.allowedDomains.every((d) => target.allowedDomains.includes(d));
}

/**
 * Whether a company takes a session for this person proved this way. `provedBy` is the settings of the proof's company.
 * Another company's single sign-on stands only for the same sign-in (`sameSignIn`), whether or not this company
 * requires it: a sister's admin, who runs that directory, never speaks for someone here.
 */
export function proofAccepted(target: { organizationId: string; setup: SsoSetup | null }, person: Person, proof: SessionProof, provedBy: SsoSetup | null): boolean {
  if (proof.kind === 'SSO') return proof.organizationId === target.organizationId || (!!provedBy && !!target.setup && sameSignIn(provedBy, target.setup));
  return !passwordRefused(target.setup, person, proof.kind === 'PHONE' ? 'phone' : 'web');
}

/** The refusal where a company requires SSO, to someone who already holds a session or a link: how to sign in instead. */
export const ssoRequiredMessage = (company: { name: string; code: string }, provider: SsoProvider) =>
  `${company.name} signs in with ${SSO_PROVIDER_INFO[provider].button}. Choose "Use single sign-on" and enter the company code ${company.code}.`;

/** The refusal of another company's single sign-on (a company switch): sign in to this one on its own. */
export const ownSignInMessage = (company: { name: string; code: string }, provider: SsoProvider | null) =>
  provider
    ? `${company.name} takes its own sign-in. Sign out, then choose "Use single sign-on" and enter the company code ${company.code}.`
    : `${company.name} takes its own sign-in. Sign out, then sign in with your email and password.`;

/**
 * The one refusal of a password on the sign-in page, a wrong one or one the company does not take, so the answer does
 * not say whether the email has an account or which company it belongs to.
 */
export const PASSWORD_REFUSED = `Invalid email or password. If your company uses single sign-on, choose Use single sign-on on the ${PRODUCT_NAME} website.`;

/** The settings fields that decide who the provider is; changing any of them while SSO is required could shut everyone out. */
export function providerChanged(before: Pick<SsoSetup, 'provider' | 'tenantId' | 'clientId'>, after: Pick<SsoSetup, 'provider' | 'tenantId' | 'clientId'>, newSecret: boolean): boolean {
  return newSecret || before.provider !== after.provider || (before.tenantId ?? '') !== (after.tenantId ?? '') || before.clientId !== after.clientId;
}

/**
 * What stops a save of the settings, or null. `mayRequire`: this session was proved by the company's own single sign-on
 * (or is a platform admin's). Requiring it is checked only when it changes something: turning it on, or a new provider
 * under it.
 */
export function ssoSaveProblem(
  before: (Pick<SsoSetup, 'provider' | 'tenantId' | 'clientId' | 'enforce'>) | null,
  after: Pick<SsoSetup, 'provider' | 'tenantId' | 'clientId' | 'enforce'>,
  f: { newSecret: boolean; mayRequire: boolean },
): string | null {
  if (!after.enforce) return null;
  const changed = !before || providerChanged(before, after, f.newSecret);
  if (before?.enforce && changed) return 'Turn off Require single sign-on, change the settings, sign in through it again, then require it.';
  if (!before?.enforce && !f.mayRequire) return 'Use single sign-on once, then require it. Sign out, choose "Use single sign-on" and come back here.';
  if (!before?.enforce && changed && before) return 'Save the new settings first, sign in through them, then require single sign-on.';
  return null;
}

export const STATE_MINUTES = 10;
export const CODE_SECONDS = 60;

const b64url = (b: Buffer) => b.toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * The PKCE verifier and the nonce of a sign-in, derived from its state with the server's key, so neither is stored and
 * the state seen in a URL gives neither away. The challenge is S256 of the verifier.
 */
/** The key the flow's secrets are derived with: HKDF of the server's signing key, for single sign-on only. */
export const flowKey = (serverSecret: string): Buffer => Buffer.from(hkdfSync('sha256', serverSecret, '', 'sso', 32));

export function flowSecrets(state: string, key: string | Buffer): { verifier: string; nonce: string; challenge: string } {
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

/**
 * The browser a sign-in started in: the sign-in page makes a random value, keeps it in the tab's sessionStorage and
 * sends it to /start, which keeps its hash with the state; the one-time code is exchanged only with the same value.
 * (The web and the API may be on different sites, so no cookie can carry it.)
 */
export const BINDING = /^[A-Za-z0-9_-]{32,128}$/;
export const bindingHash = (b: string) => sha256(`binding:${b}`);

/** A cookie value from a Cookie header. */
export function cookieOf(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
