import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleKey } from '@erp/shared';
import { ROLES_KEY } from './decorators';
import { RequestUser } from './current-user';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleKey[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required || required.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user as RequestUser | undefined;
    if (!user || !required.includes(user.roleKey)) {
      throw new ForbiddenException('Your role is not allowed to perform this action');
    }
    return true;
  }
}
