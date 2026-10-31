import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isGuest, isSupplier } from '@erp/shared';
import { GUEST_ALLOWED_KEY, GUEST_ONLY_KEY, IS_PUBLIC_KEY, SUPPLIER_ALLOWED_KEY, SUPPLIER_ONLY_KEY } from './decorators';
import { RequestUser } from './current-user';

/**
 * Deny by default for guests: after sign-in the client's engineer and the consultant reach only routes marked
 * @GuestAllowed(), and a supplier only routes marked @SupplierAllowed() plus the account routes marked
 * @GuestAllowed() that are not the client portal's. Runs after JwtAuthGuard, so the user is known. Staff are kept out
 * of routes marked @GuestOnly() or @SupplierOnly(), and client guests out of @SupplierOnly() ones.
 */
@Injectable()
export class GuestGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const has = (key: string) => !!this.reflector.getAllAndOverride<boolean>(key, targets);
    if (has(IS_PUBLIC_KEY)) return true;
    const user = ctx.switchToHttp().getRequest().user as RequestUser | undefined;
    if (!user) return true;
    if (!isGuest(user.roleKey)) {
      if (has(GUEST_ONLY_KEY)) throw new ForbiddenException('The client portal is for client and consultant accounts');
      if (has(SUPPLIER_ONLY_KEY)) throw new ForbiddenException('The supplier portal is for supplier accounts');
      return true;
    }
    if (isSupplier(user.roleKey)) {
      if (has(SUPPLIER_ALLOWED_KEY) || (has(GUEST_ALLOWED_KEY) && !has(GUEST_ONLY_KEY))) return true;
      throw new ForbiddenException('Supplier accounts can only use the supplier portal');
    }
    if (has(GUEST_ALLOWED_KEY) && !has(SUPPLIER_ONLY_KEY)) return true;
    throw new ForbiddenException('Client and consultant accounts can only use the client portal');
  }
}
