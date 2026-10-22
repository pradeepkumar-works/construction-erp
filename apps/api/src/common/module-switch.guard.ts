import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { MODULE_TIERS, MODULE_TIER_MODULES, SWITCHABLE_MODULE_INFO, type SwitchableModule } from '@erp/shared';
import { MODULE_SWITCH_KEY } from './decorators';
import { RequestUser } from './current-user';

/**
 * Module switches (v6 item 117): a route marked @ModuleSwitch('…') is refused while the caller's company has that module
 * off (turned off by an admin, or not in its plan). Nothing is deleted. Runs after JwtAuthGuard, so the user is known.
 */
@Injectable()
export class ModuleSwitchGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const key = this.reflector.getAllAndOverride<SwitchableModule | undefined>(MODULE_SWITCH_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!key) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    if (user?.modulesOff?.includes(key)) throw new ForbiddenException(moduleOffMessage(key));
    return true;
  }
}

/** What a refused call says: the module by name, and who can turn it on. */
export const moduleOffMessage = (key: SwitchableModule) =>
  `${SWITCHABLE_MODULE_INFO[key].label} is turned off for your company. An admin can turn it on under Admin, Modules.`;

/** Whether the module is on for the caller (always, outside a request). */
export const moduleOn = (user: Pick<RequestUser, 'modulesOff'> | undefined, key: SwitchableModule) => !user?.modulesOff?.includes(key);

/** Companies that use the module, for the daily jobs that run outside a request: not turned off, and in their plan. */
export const usesModuleWhere = (key: SwitchableModule): Prisma.OrganizationWhereInput => ({
  NOT: { modulesOff: { has: key } },
  OR: [{ moduleTier: null }, { moduleTier: { in: MODULE_TIERS.filter((t) => MODULE_TIER_MODULES[t].includes(key)) } }],
});
