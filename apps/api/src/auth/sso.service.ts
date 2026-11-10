import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type OrganizationSso } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, timingSafeEqual } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import {
  SSO_PROBLEMS,
  canManageSso,
  normaliseDomain,
  ssoSettingsProblem,
  type LoginResponse,
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
import { integrationKey, providerBases, ssoCallbackUrl, ssoServerProblem } from './sso-config';
import {
  CODE_SECONDS,
  STATE_MINUTES,
  authorizeUrl,
  claimsProblem,
  discoveryUrl,
  flowSecrets,
  identityOf,
  issuersOf,
  matchLogin,
  sha256,
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

/** A refusal that ends a sign-in: the problem the sign-in page reads, and who to count it against. */
class SsoRefused extends Error {
  constructor(
    readonly problem: SsoProblem,
    readonly who: string | null = null,
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
    if (!Object.values(doc).every((v) => typeof v === 'string' && /^https?:\/\//.test(v)) || !issuersOf(setup, bases).includes(String(body.issuer)))
      throw new Error('discovery document is not this issuer');
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
   * `GET /auth/sso/:orgCode/start`: a STATE ticket (its hash only) and the provider's sign-in page. The state also goes
   * in a cookie, so the callback finishes only in the browser that started.
   */
  async start(code: string, ip: string | null): Promise<{ location: string; state?: string }> {
    try {
      try {
        await this.guard.assertMayTry(`sso:${code.trim().toLowerCase()}`, ip);
      } catch (e) {
        if (e instanceof HttpException) throw new SsoRefused('TOO_MANY');
        throw e;
      }
      const org = await this.companyByCode(code);
      if (ssoServerProblem() || !org?.sso) throw new SsoRefused('NOT_SET_UP');
      if (org.suspendedAt) throw new SsoRefused('SUSPENDED');
      const doc = await this.discovery(org.sso).catch((e: Error) => {
        this.log.warn(`SSO discovery for ${org.code}: ${e.message}`);
        throw new SsoRefused('PROVIDER', `sso:${org.code.toLowerCase()}`);
      });
      const state = randomBytes(32).toString('base64url');
      const { nonce, challenge } = flowSecrets(state, jwtSecret());
      const now = Date.now();
      await withoutTenant(async () => {
        await this.prisma.ssoTicket.create({ data: { organizationId: org.id, kind: 'STATE', hash: sha256(state), expiresAt: new Date(now + STATE_MINUTES * 60_000) } });
        // Keeps the table small: nothing older than a day is ever read.
        await this.prisma.ssoTicket.deleteMany({ where: { createdAt: { lt: new Date(now - 86_400_000) } } });
      });
      return { location: authorizeUrl(doc.authorization_endpoint, org.sso, { redirectUri: ssoCallbackUrl()!, state, nonce, challenge }), state };
    } catch (e) {
      return { location: await this.refused(e, ip) };
    }
  }

  /** A failed step: counted under the login guard (unless nothing was tried) and sent to the sign-in page in words. */
  private async refused(e: unknown, ip: string | null): Promise<string> {
    if (!(e instanceof SsoRefused)) throw e;
    if (e.who) await this.guard.ssoFailed(e.who, ip);
    return configuredWebUrl() ? this.webUrl(`error=${e.problem}`) : '/';
  }

  /** Uses a ticket once: the conditional update succeeds for one caller only, before its expiry. */
  private async useTicket(kind: 'STATE' | 'CODE', secret: string) {
    return withoutTenant(async () => {
      const t = await this.prisma.ssoTicket.findUnique({ where: { hash: sha256(secret) }, select: { id: true, kind: true, organizationId: true, userId: true } });
      if (!t || t.kind !== kind) return null;
      const now = new Date();
      const used = await this.prisma.ssoTicket.updateMany({ where: { id: t.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      return used.count === 1 ? t : null;
    });
  }

  /**
   * `GET /auth/sso/callback`: the provider's answer. Uses the state once, checks the browser, redeems the code with the
   * PKCE verifier and the sealed secret, checks the ID token, finds the person, and sends the web a one-time code.
   */
  async callback(q: { state?: string; code?: string; error?: string }, cookie: string | null, ip: string | null): Promise<string> {
    try {
      const state = typeof q.state === 'string' ? q.state : '';
      const ticket = state ? await this.useTicket('STATE', state) : null;
      if (!ticket) throw new SsoRefused('EXPIRED', 'sso:callback');
      const sso = await withoutTenant(async () => await this.prisma.organizationSso.findUnique({ where: { organizationId: ticket.organizationId }, include: { organization: { select: { code: true } } } }));
      if (!sso) throw new SsoRefused('NOT_SET_UP');
      const who = `sso:${sso.organization.code.toLowerCase()}`;
      if (!cookie || !sameText(cookie, state)) throw new SsoRefused('BROWSER', who);
      if (q.error || typeof q.code !== 'string' || !q.code) throw new SsoRefused('PROVIDER', who);
      const { verifier, nonce } = flowSecrets(state, jwtSecret());
      const claims = await this.idToken(sso, q.code, verifier).catch((e: Error) => {
        this.log.warn(`SSO token for ${sso.organization.code}: ${e.message}`);
        throw new SsoRefused('TOKEN', who);
      });
      const problem = claimsProblem(sso, claims, { nonce, bases: providerBases() });
      if (problem) throw new SsoRefused(problem, typeof claims.email === 'string' ? claims.email : who);
      const identity = identityOf(sso, claims);
      const userId = await this.signInAs(ticket.organizationId, sso, identity);
      const code = randomBytes(32).toString('base64url');
      await withoutTenant(async () => {
        await this.prisma.ssoTicket.create({ data: { organizationId: ticket.organizationId, kind: 'CODE', hash: sha256(code), userId, expiresAt: new Date(Date.now() + CODE_SECONDS * 1000) } });
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
    const { payload } = await jwtVerify(body.id_token, this.keys(doc.jwks_uri), { audience: sso.clientId, algorithms: ['RS256'], clockTolerance: 60 });
    return payload as Claims;
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
      const login = identity.email ? await this.prisma.login.findUnique({ where: { email: identity.email }, select: { id: true } }) : null;
      if (!login) return null;
      const [at, other] = await Promise.all([this.placeOf(organizationId, login.id), this.prisma.ssoIdentity.findFirst({ where: { organizationId, loginId: login.id, issuer: identity.issuer }, select: { id: true } })]);
      return { loginId: login.id, at, issuerLinked: !!other };
    });
    const match = matchLogin({
      setup: sso,
      identity,
      linked: found && 'linked' in found ? { place: found.at.place } : null,
      byEmail: found && 'loginId' in found ? { place: found.at.place, issuerLinked: found.issuerLinked } : null,
    });
    const who = identity.email ?? `sso:${identity.subject}`;
    try {
      switch (match.kind) {
        case 'REFUSE':
          throw new SsoRefused(match.problem, who);
        case 'LINKED':
          if (!found || !('linked' in found)) throw new Error('a linked match without its link');
          await withoutTenant(async () => await this.prisma.ssoIdentity.update({ where: { id: found.linked.id }, data: { lastUsedAt: new Date() } }));
          return found.at.userId!;
        case 'LINK':
          if (!found || !('loginId' in found)) throw new Error('an email match without its login');
          await withoutTenant(async () => await this.prisma.ssoIdentity.create({ data: { ...key, loginId: found.loginId, email: identity.email } }));
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
      if (!role) throw new SsoRefused('NO_PLACE', email);
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

  /** `POST /auth/sso/exchange`: the one-time code for a session, used once within a minute. */
  async exchange(code: string, ip: string | null): Promise<LoginResponse> {
    const t = await this.useTicket('CODE', code);
    if (!t?.userId) {
      await this.guard.ssoFailed('sso:exchange', ip);
      throw new BadRequestException(SSO_PROBLEMS.EXPIRED);
    }
    return this.auth.issue(t.userId, { kind: 'SSO', organizationId: t.organizationId });
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
    };
  }

  async save(user: RequestUser, dto: SaveSsoSettingsDto): Promise<SsoSettingsDto> {
    this.assertAdmin(user);
    const server = ssoServerProblem();
    if (server) throw new BadRequestException(server);
    const existing = await this.prisma.organizationSso.findUnique({ where: { organizationId: user.organizationId }, select: { id: true } });
    const problem = ssoSettingsProblem(dto, !!existing);
    if (problem) throw new BadRequestException(problem);
    // Requiring single sign-on before it has worked once could shut every admin out.
    if (dto.enforce && user.ssoOrg !== user.organizationId && !isPlatformAdmin(user.email))
      throw new BadRequestException('Sign in with single sign-on once, then require it. Sign out, choose "Sign in with single sign-on" and come back here.');
    const allowedDomains = [...new Set(dto.allowedDomains.map((d) => normaliseDomain(d)!))];
    const secret = dto.clientSecret?.trim();
    const data = {
      provider: dto.provider,
      tenantId: dto.provider === 'ENTRA' ? dto.tenantId!.trim().toLowerCase() : null,
      clientId: dto.clientId.trim(),
      allowedDomains,
      enforce: dto.enforce,
      addNewPeople: dto.addNewPeople,
      newPersonRole: dto.addNewPeople ? dto.newPersonRole! : null,
      updatedById: user.id,
      ...(secret ? { clientSecretEnc: sealSecret(secret, integrationKey()!), secretLast4: last4(secret) } : {}),
    };
    if (existing) await this.prisma.organizationSso.update({ where: { id: existing.id }, data });
    else await this.prisma.organizationSso.create({ data: { ...data, organizationId: user.organizationId, clientSecretEnc: data.clientSecretEnc!, secretLast4: data.secretLast4! } });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'SSO_CHANGED', `${dto.provider === 'ENTRA' ? 'Microsoft Entra ID' : 'Google Workspace'} for ${allowedDomains.join(', ')}${dto.enforce ? ', required' : ''}${secret ? ', new secret' : ''}`);
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
