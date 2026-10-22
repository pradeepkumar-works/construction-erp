import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RoleKey } from '@erp/shared';

/** Shape attached to req.user by the JWT strategy. */
export interface RequestUser {
  id: string;
  organizationId: string;
  roleKey: RoleKey;
  email: string;
  fullName: string;
  /** A read-only Nirmaan support session: `id` is the staff member, acting as an admin of `organizationId` */
  support?: { staffName: string; expiresAt: string };
  /** The company's trial or subscription has ended: reads only (BillingReadOnlyGuard) */
  billingReadOnly?: boolean;
  /** A supplier-portal login (role SUPPLIER): the vendor it acts for */
  vendorId?: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  return ctx.switchToHttp().getRequest().user as RequestUser;
});
