import { SetMetadata } from '@nestjs/common';
import type { RoleKey, SwitchableModule } from '@erp/shared';

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
/** Routes a supplier-portal login may call besides its own account ones: the supplier portal and uploading a file. */
export const SUPPLIER_ALLOWED_KEY = 'supplierAllowed';
export const SupplierAllowed = () => SetMetadata(SUPPLIER_ALLOWED_KEY, true);
/** Only supplier-portal logins: the supplier portal, which acts for the login's vendor. */
export const SUPPLIER_ONLY_KEY = 'supplierOnly';
export const SupplierOnly = () => SetMetadata(SUPPLIER_ONLY_KEY, true);
/** The routes of a module a company may turn off (v6 item 117): refused while it is off (ModuleSwitchGuard). */
export const MODULE_SWITCH_KEY = 'moduleSwitch';
export const ModuleSwitch = (key: SwitchableModule) => SetMetadata(MODULE_SWITCH_KEY, key);
