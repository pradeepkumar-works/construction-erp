import { SetMetadata } from '@nestjs/common';
import type { RoleKey } from '@erp/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);

/** Routes a client or consultant guest may call (the client portal, their own account and notifications). Every other route refuses them. */
export const GUEST_ALLOWED_KEY = 'guestAllowed';
export const GuestAllowed = () => SetMetadata(GUEST_ALLOWED_KEY, true);
/** Only guests: the client portal, whose views are cut down for the client. Staff have the full screens. */
export const GUEST_ONLY_KEY = 'guestOnly';
export const GuestOnly = () => SetMetadata(GUEST_ONLY_KEY, true);
