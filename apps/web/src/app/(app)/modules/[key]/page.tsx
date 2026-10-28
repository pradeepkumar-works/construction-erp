'use client';

import { useParams } from 'next/navigation';
import { isDepartmentModuleKey } from '@erp/shared';
import { ModuleHome } from '@/components/modules/ModuleHome';
import { DepartmentHome } from '@/components/modules/DepartmentHome';

/** A module's home page (v6 item 98): /modules/site, /modules/purchases, … and a department's (Menu and names). */
export default function Page() {
  const { key } = useParams<{ key: string }>();
  return isDepartmentModuleKey(key) ? <DepartmentHome key={key} moduleKey={key} /> : <ModuleHome key={key} moduleKey={key} />;
}
