'use client';

import React, { useState } from 'react';
import { useSiteOrders } from '@/lib/queries';
import { SiteOrderBook } from './SiteOrderBook';

/** The project's Site orders tab (item 172): the engineer's orders and the site's compliance replies. `?order=` opens one. */
export function SiteOrdersTab({ projectId, initialOrderId }: { projectId: string; initialOrderId?: string }) {
  const orders = useSiteOrders(projectId);
  const [openId, setOpenId] = useState<string | null>(initialOrderId ?? null);
  return <SiteOrderBook projectId={projectId} orders={orders} portal={false} openId={openId} onOpen={setOpenId} />;
}
