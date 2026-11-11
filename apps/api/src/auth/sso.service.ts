import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type OrganizationSso } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, timingSafeEqual } from 'crypto';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import {
  SSO_PROBLEMS,
  SSO_PROVIDER_INFO,
  canManageSso,
  normaliseDomain,
  ssoSettingsProblem,
  type LoginResponse,
  type RoleKey,
  type SsoCompanyDto,
  type SsoProblem,
  type SsoSettingsDto,
  type SsoNewPersonRole,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { isPlatformAdmin } from '../common/platform-admin';
import { configuredWebUrl } from '../common/web-url';
import { jwtSecret } from '../common/jwt-secret';
import { last4, openSecret, sealSecret } from '../integrations/integration-rules';
import { AuthService } from './auth.service';
import { LoginGuardService } from './login-guard.service';
import { integrationKey, providerBases, ssoCallbackUrl, ssoServerMissing, ssoServerProblem } from './sso-config';
import {
  BINDING,
  CODE_SECONDS,
  STATE_MINUTES,
  authorizeUrl,
  bindingHash,
  claimsProblem,
  discoveryUrl,
  endpointAllowed,
  flowKey,
  flowSecrets,
  identityOf,
  issuersOf,
  matchLogin,
  sha256,
  ssoSaveProblem,
  verifyOptions,
  type Claims,
  type Place,
  type ProvedIdentity,
  type SsoSetup,
} from './sso-rules';
import type { SaveSsoSettingsDto } from './sso.dto';

/** The provider's endpoints, from its discovery document. */
interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const DISCOVERY_HOURS = 1;
const TIMEOUT_MS = 10_000;
export const SSO_COOKIE = 'nirmaan_sso';

/**
 * A refusal that ends a sign-in: the problem the sign-in page reads, and, for a step that looks like probing (a browser
 * that did not start the sign-in, a state no one issued), what to count against the address. A provider's refusal or a
 * company's rule is no one guessing and counts nothing.
 */
class SsoRefused extends Error {
  constructor(
    readonly problem: SsoProblem,
    readonly probed: string | null = null,
  ) {
    super(problem);
  }
}

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Single sign-on (item 195, ARCHITECTURE "Single sign-on"): the authorization code flow with PKCE run by the API, the
 * ID token checked by `jose` and `sso-rules.ts`, the person found or linked by `matchLogin`, and the session handed to
 * the web by a one-time code. Before anyone is signed in nothing has a company, so the sign-in reads outside the tenant.
 */
@Injectable()
export class SsoService {
  private readonly log = new Logger(SsoService.name);
  private readonly discoveries = new Map<string, { at: number; doc: Discovery }>();
  private readonly keySets = new Map<string, JWTVerifyGetKey>();

  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private guard: LoginGuardService,
    private audit: AuditService,
  ) {}

  private webUrl(fragment: string) {
    return `${configuredWebUrl()}/login/sso#${fragment}`;
  }

  private async companyByCode(codeIn: string) {
    const code = codeIn.trim().toUpperCase();
    return withoutTenant(async () => await this.prisma.organization.findUnique({ where: { code }, select: { id: true, code: true, suspendedAt: true, sso: true } }));
  }

  /** Which button the sign-in page shows for a company code. */
  async company(code: string): Promise<SsoCompanyDto> {
    const org = await this.companyByCode(code);
    if (ssoServerProblem() || !org?.sso) throw new NotFoundException(SSO_PROBLEMS.NOT_SET_UP);
    return { provider: org.sso.provider, companyCode: org.code };
  }

  /** The provider's endpoints, read once an hour. Its issuer must be the one the company's tokens will name. */
  private async discovery(setup: SsoSetup): Promise<Discovery> {
    const bases = providerBases();
    const url = discoveryUrl(setup, bases);
    const hit = this.discoveries.get(url);
    if (hit && Date.now() - hit.at < DISCOVERY_HOURS * 3_600_000) return hit.doc;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`discovery ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    const doc = { authorization_endpoint: body.authorization_endpoint, token_endpoint: body.token_endpoint, jwks_uri: body.jwks_uri };
    // https only, but for a local run's stand-in on this machine (`endpointAllowed`).
    if (!Object.values(doc).every((v) => endpointAllowed(v, bases)) || !issuersOf(setup, bases).includes(String(body.issuer)))
      throw new Error('discovery document is not this issuer, or names an endpoint that is not https');
    this.discoveries.set(url, { at: Date.now(), doc: doc as Discovery });
    return doc as Discovery;
  }

  private keys(uri: string): JWTVerifyGetKey {
    let set = this.keySets.get(uri);
    if (!set) {
      set = createRemoteJWKSet(new URL(uri), { timeoutDuration: TIMEOUT_MS });
      this.keySets.set(uri, set);
    }
    return set;
  }

  /**
   * `GET /auth/sso/:orgCode/start?b=…`: a STATE ticket (its hash only, with the hash of the starting tab's value `b`)
   * and the provider's sign-in page. The state also goes in a cookie, so the callback finishes only in the browser that
   * started, and the code it makes is exchanged only with `b`.
   */
  async start(code: string, binding: string | undefined, ip: string | null): Promise<{ location: string; state?: string }> {
    try {
      // The sign-in page always sends one: a start without it was not made by the page.
      if (typeof binding !== 'string' || !BINDING.test(binding)) throw new SsoRefused('BROWSER');
      try {
        await this.guard.assertMayStartSso(ip, code.trim().slice(0, 40));
      } catch (e) {
        if (e instanceof HttpException) throw new SsoRefused('TOO_MANY');
        throw e;
      }
      const org = await this.companyByCode(code);
      if (ssoServerProblem() || !org?.sso) {
        if (ssoServerProblem()) this.log.warn(`SSO is not set up on this server: ${ssoServerMissing().join(', ')}`);
        throw new SsoRefused('NOT_SET_UP');
      }
      if (org.suspendedAt) throw new SsoRefused('SUSPENDED');
      const doc = await this.discovery(org.sso).catch((e: Error) => {
        this.log.warn(`SSO discovery for ${org.code}: ${e.message}`);
        throw new SsoRefused('PROVIDER');
      });
      const state = randomBytes(32).toString('base64url');
      const { nonce, challenge } = flowSecrets(state, flowKey(jwtSecret()));
      const now = Date.now();
      await withoutTenant(async () => {
        await this.prisma.ssoTicket.create({ data: { organizationId: org.id, kind: 'STATE', hash: sha256(state), binding: bindingHash(binding), expiresAt: new Date(now + STATE_MINUTES * 60_000) } });
        // Keeps the table small: nothing older than a day is ever read.
        await this.prisma.ssoTicket.deleteMany({ where: { createdAt: { lt: new Date(now - 86_400_000) } } });
      });
      return { location: authorizeUrl(doc.authorization_endpoint, org.sso, { redirectUri: ssoCallbackUrl()!, state, nonce, challenge }), state };
    } catch (e) {
      return { location: await this.refused(e, ip) };
    }
  }

  /** A failed step: counted under the login guard when it looks like probing, and sent to the sign-in page in words. */
  private async refused(e: unknown, ip: string | null): Promise<string> {
    if (!(e instanceof SsoRefused)) throw e;
    if (e.probed) await this.guard.ssoProbed(e.probed, ip);
    return configuredWebUrl() ? this.webUrl(`error=${e.problem}`) : '/';
  }

  /**
   * Uses a ticket once: the conditional update succeeds for one caller only, before its expiry. `known` says whether
   * the secret was ever issued (an unknown one is someone guessing). `accept` may refuse the ticket before it is used.
   */
  private async useTicket(kind: 'STATE' | 'CODE', secret: string, accept: (t: { binding: string | null }) => boolean = () => true) {
    return withoutTenant(async () => {
      const t = await this.prisma.ssoTicket.findUnique({ where: { hash: sha256(secret) }, select: { id: true, kind: true, organizationId: true, userId: true, binding: true } });
      if (!t || t.kind !== kind) return { ticket: null, known: false, accepted: false };
      if (!accept(t)) return { ticket: null, known: true, accepted: false };
      const now = new Date();
      const used = await this.prisma.ssoTicket.updateMany({ where: { id: t.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      return { ticket: used.count === 1 ? t : null, known: true, accepted: true };
    });
  }

  /**
   * `GET /auth/sso/callback`: the provider's answer. Uses the state once, checks the browser, redeems the code with the
   * PKCE verifier and the sealed secret, checks the ID token, finds the person, and sends the web a one-time code.
   */
  async callback(q: { state?: string; code?: string; error?: string }, cookie: string | null, ip: string | null): Promise<string> {
    try {
      const state = typeof q.state === 'string' ? q.state.slice(0, 200) : '';
      const used = state ? await this.useTicket('STATE', state) : { ticket: null, known: false };
      const ticket = used.ticket;
      if (!ticket) throw new SsoRefused('EXPIRED', used.known ? null : 'sso:callback');
      const sso = await withoutTenant(async () => await this.prisma.organizationSso.findUnique({ where: { organizationId: ticket.organizationId }, include: { organization: { select: { code: true } } } }));
      if (!sso) throw new SsoRefused('NOT_SET_UP');
      if (!cookie || !sameText(cookie, state)) throw new SsoRefused('BROWSER', `sso:${sso.organization.code}`);
      if (q.error || typeof q.code !== 'string' || !q.code) throw new SsoRefused('PROVIDER');
      const { verifier, nonce } = flowSecrets(state, flowKey(jwtSecret()));
      const claims = await this.idToken(sso, q.code, verifier).catch((e: Error) => {
        this.log.warn(`SSO token for ${sso.organization.code}: ${e.message}`);
        throw new SsoRefused('TOKEN');
      });
      const problem = claimsProblem(sso, claims, { nonce, bases: providerBases() });
      if (problem) throw new SsoRefused(problem);
      const identity = identityOf(sso, claims);
      const userId = await this.signInAs(ticket.organizationId, sso, identity);
      const code = randomBytes(32).toString('base64url');
      await withoutTenant(async () => {
        await this.prisma.ssoTicket.create({ data: { organizationId: ticket.organizationId, kind: 'CODE', hash: sha256(code), userId, binding: ticket.binding, expiresAt: new Date(Date.now() + CODE_SECONDS * 1000) } });
      });
      return this.webUrl(`code=${code}`);
    } catch (e) {
      return this.refused(e, ip);
    }
  }

  /** Redeems the code at the token endpoint and verifies the ID token's signature, audience and times. */
  private async idToken(sso: OrganizationSso, code: string, verifier: string): Promise<Claims> {
    const secret = openSecret(sso.clientSecretEnc, integrationKey() ?? '');
    if (!secret) throw new Error('the client secret does not open under this INTEGRATION_KEY');
    const doc = await this.discovery(sso);
    const res = await fetch(doc.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: ssoCallbackUrl()!, client_id: sso.clientId, client_secret: secret, code_verifier: verifier }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof body.id_token !== 'string') throw new Error(`token endpoint ${res.status} ${typeof body.error === 'string' ? body.error : ''}`);
    try {
      const { payload } = await jwtVerify(body.id_token, this.keys(doc.jwks_uri), verifyOptions(sso, providerBases()));
      return payload as Claims;
    } catch (e) {
      // The signature held (jose checks it first) but the issuer is not the company's: `claimsProblem` refuses it too,
      // and says why (a token of another directory reads TENANT).
      if (e instanceof errors.JWTClaimValidationFailed && e.claim === 'iss') return e.payload as Claims;
      throw e;
    }
  }

  private async placeOf(organizationId: string, loginId: string): Promise<{ place: Place; userId: string | null }> {
    const u = await this.prisma.user.findFirst({ where: { loginId, organizationId }, select: { id: true, isActive: true } });
    return { place: !u ? 'NONE' : u.isActive ? 'ACTIVE' : 'OFF', userId: u?.id ?? null };
  }

  /** The user this identity signs in as, linking or adding them as `matchLogin` says. */
  private async signInAs(organizationId: string, sso: OrganizationSso, identity: ProvedIdentity, retry = true): Promise<string> {
    const key = { organizationId, issuer: identity.issuer, subject: identity.subject };
    type Found = { linked: { id: string; loginId: string }; at: Awaited<ReturnType<SsoService['placeOf']>> } | { loginId: string; at: Awaited<ReturnType<SsoService['placeOf']>>; issuerLinked: boolean } | null;
    const found: Found = await withoutTenant(async () => {
      const linked = await this.prisma.ssoIdentity.findUnique({ where: { organizationId_issuer_subject: key }, select: { id: true, loginId: true } });
      if (linked) return { linked, at: await this.placeOf(organizationId, linked.loginId) };
      // An account that may not be linked (a guest, an email nobody vouches for) finds no one by its email.
      const login = identity.email && !identity.linkProblem ? await this.prisma.login.findUnique({ where: { email: identity.email }, select: { id: true } }) : null;
      if (!login) return null;
      const [at, other] = await Promise.all([this.placeOf(organizationId, login.id), this.prisma.ssoIdentity.findFirst({ where: { organizationId, loginId: login.id, issuer: identity.issuer }, select: { id: true } })]);
      return { loginId: login.id, at, issuerLinked: !!other };
    });
    const match = matchLogin({
      setup: sso,
      identity,
      platformEmail: !!identity.email && isPlatformAdmin(identity.email),
      linked: found && 'linked' in found ? { place: found.at.place } : null,
      byEmail: found && 'loginId' in found ? { place: found.at.place, issuerLinked: found.issuerLinked } : null,
    });
    try {
      switch (match.kind) {
        case 'REFUSE':
          throw new SsoRefused(match.problem);
        case 'LINKED':
          if (!found || !('linked' in found)) throw new Error('a linked match without its link');
          await withoutTenant(async () => await this.prisma.ssoIdentity.update({ where: { id: found.linked.id }, data: { lastUsedAt: new Date() } }));
          return found.at.userId!;
        case 'LINK':
          if (!found || !('loginId' in found)) throw new Error('an email match without its login');
          await withoutTenant(async () => await this.prisma.ssoIdentity.create({ data: { ...key, loginId: found.loginId, email: identity.email } }));
          await this.auditLinked(organizationId, found.at.userId!, identity);
          return found.at.userId!;
        case 'ADD':
          return await this.addPerson(organizationId, sso.newPersonRole as SsoNewPersonRole, identity);
      }
    } catch (e) {
      // Two first sign-ins at once: the second finds what the first made.
      if (retry && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.signInAs(organizationId, sso, identity, false);
      throw e;
    }
  }

  /** Someone new from an allowed domain: a Login whose password no one knows, a place in the chosen role, and the link. */
  private async addPerson(organizationId: string, roleKey: SsoNewPersonRole, identity: ProvedIdentity): Promise<string> {
    const email = identity.email!;
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    return withoutTenant(async () => {
      const role = await this.prisma.role.findUnique({ where: { organizationId_key: { organizationId, key: roleKey } }, select: { id: true } });
      if (!role) throw new SsoRefused('NO_PLACE');
      const user = await this.prisma.$transaction(async (tx) => {
        const login = await tx.login.create({ data: { email, passwordHash, lastOrganizationId: organizationId } });
        const u = await tx.user.create({ data: { organizationId, roleId: role.id, loginId: login.id, email, fullName: identity.name ?? email.split('@')[0] }, select: { id: true, email: true, fullName: true } });
        await tx.ssoIdentity.create({ data: { organizationId, loginId: login.id, issuer: identity.issuer, subject: identity.subject, email } });
        return u;
      });
      await this.audit.log({ id: user.id, organizationId, roleKey, email: user.email, fullName: user.fullName }, 'COMPANY', organizationId, 'SSO_PERSON_ADDED', `${user.fullName} (${email}) added as ${roleKey}`);
      return user.id;
    });
  }

  /** A first sign-in that linked someone already in the company, in its log. */
  private async auditLinked(organizationId: string, userId: string, identity: ProvedIdentity) {
    const u = await withoutTenant(async () => await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, fullName: true, role: { select: { key: true } } } }));
    await this.audit.log({ id: u.id, organizationId, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName }, 'COMPANY', organizationId, 'SSO_LINKED', `${u.fullName} (${u.email}) linked to ${identity.email ?? identity.subject}`);
  }

  /**
   * `POST /auth/sso/exchange`: the one-time code for a session, used once within a minute, and only with the value the
   * tab that started the sign-in kept (`b`), so a code made in someone else's browser signs no one in here. A wrong `b`
   * leaves the code unused.
   */
  async exchange(code: string, binding: string, ip: string | null): Promise<LoginResponse> {
    const want = Buffer.from(bindingHash(binding ?? ''));
    const used = await this.useTicket('CODE', code, (t) => !!t.binding && t.binding.length === want.length && timingSafeEqual(Buffer.from(t.binding), want));
    if (!used.ticket?.userId) {
      if (!used.known) await this.guard.ssoProbed('sso:exchange', ip);
      throw new BadRequestException(used.known && !used.accepted ? SSO_PROBLEMS.BROWSER : SSO_PROBLEMS.EXPIRED);
    }
    return this.auth.issue(used.ticket.userId, { kind: 'SSO', organizationId: used.ticket.organizationId });
  }

  private assertAdmin(user: RequestUser) {
    if (!canManageSso(user.roleKey)) throw new ForbiddenException('Only an admin can change how the company signs in');
  }

  /** Company settings › Sign-in. The secret stays sealed here; the page sees its last four characters. */
  async settings(user: RequestUser): Promise<SsoSettingsDto> {
    this.assertAdmin(user);
    const [org, row, linked] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { code: true } }),
      this.prisma.organizationSso.findUnique({ where: { organizationId: user.organizationId } }),
      this.prisma.ssoIdentity.count({ where: { organizationId: user.organizationId } }),
    ]);
    return {
      settings: row
        ? {
            provider: row.provider,
            tenantId: row.tenantId,
            clientId: row.clientId,
            secretLast4: row.secretLast4,
            allowedDomains: row.allowedDomains,
            enforce: row.enforce,
            addNewPeople: row.addNewPeople,
            newPersonRole: row.newPersonRole as SsoNewPersonRole | null,
            updatedAt: row.updatedAt.toISOString(),
            linked,
          }
        : null,
      companyCode: org.code,
      callbackUrl: ssoCallbackUrl(),
      serverProblem: ssoServerProblem(),
      signedInWithSso: user.ssoOrg === user.organizationId,
      mayRequire: this.mayRequire(user),
    };
  }

  /** Whether this session may turn on Require single sign-on: proved by the company's own, or a platform admin's. */
  private mayRequire(user: RequestUser) {
    return user.ssoOrg === user.organizationId || isPlatformAdmin(user.email);
  }

  async save(user: RequestUser, dto: SaveSsoSettingsDto): Promise<SsoSettingsDto> {
    this.assertAdmin(user);
    const server = ssoServerProblem();
    if (server) throw new BadRequestException(server);
    const existing = await this.prisma.organizationSso.findUnique({ where: { organizationId: user.organizationId } });
    const problem = ssoSettingsProblem(dto, !!existing);
    if (problem) throw new BadRequestException(problem);
    const allowedDomains = [...new Set(dto.allowedDomains.map((d) => normaliseDomain(d)!))];
    const secret = dto.clientSecret?.trim();
    const next = { provider: dto.provider, tenantId: dto.provider === 'ENTRA' ? dto.tenantId!.trim().toLowerCase() : null, clientId: dto.clientId.trim(), enforce: dto.enforce };
    // Requiring single sign-on before it has worked once, or moving it to another provider under the requirement, could shut every admin out.
    const refused = ssoSaveProblem(existing, next, { newSecret: !!secret, mayRequire: this.mayRequire(user) });
    if (refused) throw new BadRequestException(refused);
    const data = {
      provider: next.provider,
      tenantId: next.tenantId,
      clientId: next.clientId,
      allowedDomains,
      enforce: dto.enforce,
      addNewPeople: dto.addNewPeople,
      newPersonRole: dto.addNewPeople ? dto.newPersonRole! : null,
      updatedById: user.id,
      ...(secret ? { clientSecretEnc: sealSecret(secret, integrationKey()!), secretLast4: last4(secret) } : {}),
    };
    if (existing) await this.prisma.organizationSso.update({ where: { id: existing.id }, data });
    else await this.prisma.organizationSso.create({ data: { ...data, organizationId: user.organizationId, clientSecretEnc: data.clientSecretEnc!, secretLast4: data.secretLast4! } });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'SSO_CHANGED', ssoChangeNote(existing, { ...next, allowedDomains }, !!secret));
    return this.settings(user);
  }

  /** Back to passwords: the settings go; linked identities stay, for if the same provider is set up again. */
  async remove(user: RequestUser): Promise<SsoSettingsDto> {
    this.assertAdmin(user);
    const gone = await this.prisma.organizationSso.deleteMany({ where: { organizationId: user.organizationId } });
    if (gone.count) await this.audit.log(user, 'COMPANY', user.organizationId, 'SSO_REMOVED', 'Back to passwords');
    return this.settings(user);
  }
}

/** The company log's line for a save: the provider and domains, whether it is required, and what moved. */
function ssoChangeNote(before: OrganizationSso | null, after: { provider: OrganizationSso['provider']; tenantId: string | null; clientId: string; enforce: boolean; allowedDomains: string[] }, newSecret: boolean): string {
  const parts = [`${SSO_PROVIDER_INFO[after.provider].name} for ${after.allowedDomains.join(', ')}`, after.enforce ? 'required' : 'not required'];
  if (before && before.enforce !== after.enforce) parts.push(after.enforce ? 'Require single sign-on turned on' : 'Require single sign-on turned off');
  if (before && before.provider !== after.provider) parts.push(`provider was ${SSO_PROVIDER_INFO[before.provider].name}`);
  if (before && (before.tenantId ?? '') !== (after.tenantId ?? '')) parts.push(`directory (tenant) ID was ${before.tenantId ?? 'none'}`);
  if (before && before.clientId !== after.clientId) parts.push(`client ID was ${before.clientId}`);
  if (newSecret) parts.push('new secret');
  return parts.join(', ');
}
