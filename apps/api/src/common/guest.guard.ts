import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isGuest } from '@erp/shared';
import { GUEST_ALLOWED_KEY, GUEST_ONLY_KEY, IS_PUBLIC_KEY } from './decorators';
import { RequestUser } from './current-user';

/**
 * Deny by default for guests (the client's engineer, the consultant): after sign-in they reach only routes marked
 * @GuestAllowed(). Runs after JwtAuthGuard, so the user is known. Staff are kept out of routes marked @GuestOnly().
 */
@Injectable()
export class GuestGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const user = ctx.switchToHttp().getRequest().user as RequestUser | undefined;
    if (!user) return true;
    if (!isGuest(user.roleKey)) {
      if (this.reflector.getAllAndOverride<boolean>(GUEST_ONLY_KEY, targets)) throw new ForbiddenException('The client portal is for client and consultant accounts');
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(GUEST_ALLOWED_KEY, targets)) return true;
    throw new ForbiddenException('Client and consultant accounts can only use the client portal');
  }
}
