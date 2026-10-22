import {
  MODULE_TIER_LABELS,
  SWITCHABLE_MODULES,
  SWITCHABLE_MODULE_INFO,
  inTier,
  type ModuleSwitchesDto,
  type ModuleTier,
  type SwitchableModule,
} from '@erp/shared';

/**
 * Module switches (v6 item 117) as pure functions, tested in `src/scripts/module-switches-test.ts`. Which modules are off
 * (`modulesOffFor`) and which page belongs to which (`moduleOfPath`) are in `@erp/shared`, where the web reads them too.
 */
export interface SwitchOrg {
  modulesOff: readonly string[];
  moduleTier: ModuleTier | null;
}

/** The admin's page: every switchable module, whether the plan has it and whether it is in use. */
export function switchesOf(org: SwitchOrg): ModuleSwitchesDto {
  return {
    tier: org.moduleTier,
    modules: SWITCHABLE_MODULES.map((key) => {
      const inPlan = inTier(org.moduleTier, key);
      const { label, description } = SWITCHABLE_MODULE_INFO[key];
      return { key, label, description, inPlan, on: inPlan && !org.modulesOff.includes(key) };
    }),
  };
}

/** Why a module cannot be turned on: the plan leaves it out. Turning one off is always allowed. */
export function switchProblem(org: SwitchOrg, key: SwitchableModule, on: boolean): string | null {
  if (on && !inTier(org.moduleTier, key))
    return `${SWITCHABLE_MODULE_INFO[key].label} is not in your ${MODULE_TIER_LABELS[org.moduleTier!]} plan. Ask us to move you to a plan that has it.`;
  return null;
}

/** The company's list of modules turned off after the switch, in `SWITCHABLE_MODULES` order; keys no longer known drop out. */
export function nextModulesOff(current: readonly string[], key: SwitchableModule, on: boolean): SwitchableModule[] {
  return SWITCHABLE_MODULES.filter((k) => (k === key ? !on : current.includes(k)));
}

/** The audit note for a switch. */
export const switchNote = (key: SwitchableModule, on: boolean) => `${SWITCHABLE_MODULE_INFO[key].label} turned ${on ? 'on' : 'off'}`;

/** The audit note for a plan change from the console. */
export const tierNote = (from: ModuleTier | null, to: ModuleTier | null) =>
  `Module plan ${from ? MODULE_TIER_LABELS[from] : 'every module'} → ${to ? MODULE_TIER_LABELS[to] : 'every module'}`;
