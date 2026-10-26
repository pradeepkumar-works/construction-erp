import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { blockMessage, LOGIN_WINDOW_MINUTES, loginBlock, resetAllowed } from './login-guard-rules';

const LOGIN_FAILED = 'LOGIN_FAILED';
const RESET_REQUESTED = 'RESET_REQUESTED';

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

  private async times(kind: string, where: { email?: string; ip?: string }, minutes: number): Promise<Date[]> {
    const rows = await this.prisma.authAttempt.findMany({ where: { kind, ...where, createdAt: { gt: this.since(minutes) } }, select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 });
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
