import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Protects the scheduled-job endpoints. The caller must present CRON_SECRET as
 * "Authorization: Bearer <secret>" (what Vercel Cron sends automatically) or "x-cron-secret: <secret>".
 * Without CRON_SECRET configured the endpoints are switched off.
 */
@Injectable()
export class CronGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new ServiceUnavailableException('CRON_SECRET is not configured; scheduled jobs are disabled');
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const bearer = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const custom = req.headers['x-cron-secret'];
    const presented = bearer ?? (Array.isArray(custom) ? custom[0] : custom);
    if (presented !== secret) throw new UnauthorizedException('Invalid cron secret');
    return true;
  }
}
