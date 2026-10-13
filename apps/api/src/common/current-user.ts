import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RoleKey } from '@erp/shared';

/** Shape attached to req.user by the JWT strategy. */
export interface RequestUser {
  id: string;
  organizationId: string;
  roleKey: RoleKey;
  email: string;
  fullName: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  return ctx.switchToHttp().getRequest().user as RequestUser;
});
