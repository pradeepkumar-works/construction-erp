'use client';

import React, { useState } from 'react';
import { Empty, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { MaterialRequestDto } from '@erp/shared';
import { canPurchase } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useComparative, usePurchaseOrders } from '@/lib/queries';
import { toNumber } from '@/lib/format';
import { LinkButton } from '@/components/common/LinkButton';
import { PurchaseOrderDrawer } from './PurchaseOrderDrawer';
import { EnquiriesList } from './Enquiries';
import { ComparativeTable, RequestOrders } from './RequestBuying';

/**
 * Quotations on an approved indent, side by side (the comparative statement), with the purchase orders raised on it.
 * The buying itself (enquiry, quotations, Finalise L1, order) is done only under Purchases › Requests to order, so the
 * L1 step and its reason are never skipped; a buyer gets the link to it here.
 */
export function QuotationsPanel({ request }: { request: MaterialRequestDto }) {
  const { user } = useAuth();
  const buyer = !!user && canPurchase(user.roleKey);
  const { data, isLoading } = useComparative(request.id);
  const orders = usePurchaseOrders({ materialRequestId: request.id, pageSize: 50 });
  const [openPo, setOpenPo] = useState<string | null>(null);
  const remaining = request.items.some((i) => toNumber(i.toOrderQty) > 0);
  const quotes = data?.quotations ?? [];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <Typography.Text type="secondary">
          {quotes.length ? `${quotes.length} quotation${quotes.length === 1 ? '' : 's'}; the lowest landed rate (with GST) per item is marked.` : 'No quotations yet.'}
        </Typography.Text>
        {buyer && remaining && (
          <LinkButton size="small" href={`/requests-to-order/${request.id}`}>
            Open in requests to order
          </LinkButton>
        )}
      </div>
      <EnquiriesList requestId={request.id} />
      {quotes.length > 0 && data ? <ComparativeTable request={request} data={data} loading={isLoading} /> : null}
      {(orders.data?.items.length ?? 0) > 0 ? (
        <RequestOrders requestId={request.id} onOpen={setOpenPo} style={{ marginTop: 12 }} />
      ) : quotes.length === 0 && !buyer ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quotations or purchase orders yet" />
      ) : null}
      {!remaining && <AppTag tone="success" style={{ marginTop: 8 }}>Everything on this indent is ordered or received</AppTag>}
      <PurchaseOrderDrawer id={openPo} open={!!openPo} onClose={() => setOpenPo(null)} />
    </>
  );
}
