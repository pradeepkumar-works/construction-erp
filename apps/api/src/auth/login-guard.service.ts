import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { blockMessage, LOGIN_WINDOW_MINUTES, loginBlock, resetAllowed, ssoBlock } from './login-guard-rules';

const LOGIN_FAILED = 'LOGIN_FAILED';
const RESET_REQUESTED = 'RESET_REQUESTED';
/** A single sign-on step that looked like probing (`sso.service.ts`): counted against the address, for single sign-on only */
const SSO_FAILED = 'SSO_FAILED';
/** A single sign-on started from an address, for its cap */
const SSO_STARTED = 'SSO_STARTED';

/** The caller's address: the first hop Vercel or a proxy recorded, else the socket's. */
export function clientIp(req: IncomingMessage): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || null;
}

/** "3:45 pm" in India, for the refusal. */
const at = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

/**
 * Failed sign-ins and reset requests, counted in `AuthAttempt` (not memory: the API runs as many short-lived
 * instances), and the decisions from `login-guard-rules.ts`. The table belongs to no company, so it is read outside the
 * tenant guard.
 */
@Injectable()
export class LoginGuardService {
  constructor(private prisma: PrismaService) {}

  private since(minutes: number) {
    return new Date(Date.now() - minutes * 60_000);
  }

  private async times(kind: string | string[], where: { email?: string; ip?: string }, minutes: number): Promise<Date[]> {
    const rows = await this.prisma.authAttempt.findMany({ where: { kind: { in: ([] as string[]).concat(kind) }, ...where, createdAt: { gt: this.since(minutes) } }, select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((r) => r.createdAt);
  }

  /** Refuses (429) a sign-in on a locked email or from an address making too many tries. */
  async assertMayTry(email: string, ip: string | null) {
    const now = new Date();
    const [emailFailures, addressFailures] = await withoutTenant(() =>
      Promise.all([this.times(LOGIN_FAILED, { email }, LOGIN_WINDOW_MINUTES), ip ? this.times(LOGIN_FAILED, { ip }, LOGIN_WINDOW_MINUTES) : Promise.resolve([])]),
    );
    const block = loginBlock({ emailFailures, addressFailures, now });
    if (block) throw new HttpException(blockMessage(block, at), HttpStatus.TOO_MANY_REQUESTS);
  }

  async failed(email: string, ip: string | null) {
    await withoutTenant(async () => {
      await this.prisma.authAttempt.create({ data: { kind: LOGIN_FAILED, email, ip } });
      // Keeps the table small: nothing older than a day is ever read.
      await this.prisma.authAttempt.deleteMany({ where: { createdAt: { lt: this.since(24 * 60) } } });
    });
  }

  /**
   * Refuses (429) a single sign-on start from an address over its cap or with too many probing failures, and counts the
   * start. An address the request does not show is not held off (as for passwords).
   */
  async assertMayStartSso(ip: string | null, company: string) {
    if (!ip) return;
    const now = new Date();
    const [addressFailures, addressStarts] = await withoutTenant(() =>
      Promise.all([this.times(SSO_FAILED, { ip }, LOGIN_WINDOW_MINUTES), this.times(SSO_STARTED, { ip }, LOGIN_WINDOW_MINUTES)]),
    );
    const block = ssoBlock({ addressFailures, addressStarts, now });
    if (block) throw new HttpException(blockMessage(block, at), HttpStatus.TOO_MANY_REQUESTS);
    await withoutTenant(async () => {
      await this.prisma.authAttempt.create({ data: { kind: SSO_STARTED, email: `sso:${company.toLowerCase()}`, ip } });
      await this.prisma.authAttempt.deleteMany({ where: { createdAt: { lt: this.since(24 * 60) } } });
    });
  }

  /** A single sign-on step that looked like probing: `what` says which (`sso:callback`, `sso:exchange`, `sso:<company>`). */
  async ssoProbed(what: string, ip: string | null) {
    if (!ip) return;
    await withoutTenant(async () => {
      await this.prisma.authAttempt.create({ data: { kind: SSO_FAILED, email: what.toLowerCase(), ip } });
    });
  }

  /** A good password clears the email's failures, so a later slip starts from none. */
  async succeeded(email: string) {
    await withoutTenant(() => this.prisma.authAttempt.deleteMany({ where: { kind: LOGIN_FAILED, email } }));
  }

  /** Whether a reset link may be sent now; the request is counted either way. */
  async mayRequestReset(email: string, ip: string | null): Promise<boolean> {
    return withoutTenant(async () => {
      const [emailRequests, addressRequests] = await Promise.all([this.times(RESET_REQUESTED, { email }, 60), ip ? this.times(RESET_REQUESTED, { ip }, 60) : Promise.resolve([])]);
      await this.prisma.authAttempt.create({ data: { kind: RESET_REQUESTED, email, ip } });
      return resetAllowed({ emailRequests, addressRequests, now: new Date() });
    });
  }
}
