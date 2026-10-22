'use client';

import { useParams } from 'next/navigation';
import { ModuleHome } from '@/components/modules/ModuleHome';

/** A module's home page (v6 item 98): /modules/site, /modules/purchases, … */
export default function Page() {
  const { key } = useParams<{ key: string }>();
  return <ModuleHome key={key} moduleKey={key} />;
}
