import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestUser } from './current-user';

/** A Nirmaan support session (platform admin, with the company's consent) can only read. Runs after JwtAuthGuard. */
@Injectable()
export class SupportReadOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ method: string; user?: RequestUser }>();
    if (req.user?.support && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) throw new ForbiddenException('Support access is read-only');
    return true;
  }
}
