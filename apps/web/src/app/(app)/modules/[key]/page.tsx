'use client';

import { useParams } from 'next/navigation';
import { isDepartmentModuleKey, isModuleKey } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNavMenu } from '@/components/shell/menu';
import { ModuleHome } from '@/components/modules/ModuleHome';
import { DepartmentHome } from '@/components/modules/DepartmentHome';

/**
 * A module's home page: /modules/site, /modules/purchases, … and a department's (Menu and names). A key that
 * is both (Correspondence) opens as the company's menu has it: the department with the department menu, else the module.
 */
export default function Page() {
  const { key } = useParams<{ key: string }>();
  const { user } = useAuth();
  const { settings } = useNavMenu(user);
  const department = isDepartmentModuleKey(key) && (settings.moduleSet === 'DEPARTMENTS' || !isModuleKey(key));
  return department ? <DepartmentHome key={key} moduleKey={key} /> : <ModuleHome key={key} moduleKey={key} />;
}
