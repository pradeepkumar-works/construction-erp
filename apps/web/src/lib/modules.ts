'use client';

import { pathIsOff, type SwitchableModule } from '@erp/shared';
import { useAuth } from './auth';

/** Whether the signed-in user's company uses the module (an admin may turn it off). */
export function useModuleOn(key: SwitchableModule): boolean {
  const { user } = useAuth();
  return !user?.modulesOff?.includes(key);
}

/** Whether a page belongs to a module the company has turned off. */
export function usePathOff(path: string): boolean {
  const { user } = useAuth();
  return pathIsOff(path, user?.modulesOff);
}
