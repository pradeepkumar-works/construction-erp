'use client';

import React, { useState } from 'react';
import { Button, Empty, Space, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { DeleteOutlined, EditOutlined, MailOutlined, PlusOutlined, ShoppingCartOutlined, TrophyOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EnquiryDto, MaterialRequestDto, QuotationDto } from '@erp/shared';
import { awardLowestPerItem, canPurchase } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useComparative, usePurchaseOrders } from '@/lib/queries';
import { toNumber } from '@/lib/format';
import { LinkButton } from '@/components/common/LinkButton';
import { QuotationFormModal } from './QuotationFormModal';
import { PurchaseOrderFormModal, type PoStart } from './PurchaseOrderFormModal';
import { PurchaseOrderDrawer } from './PurchaseOrderDrawer';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { EnquiriesList, EnquiryFormModal, EnquirySentModal } from './Enquiries';
import { AwardLowestModal } from './AwardLowestModal';
import { ComparativeTable, RequestOrders, poStartFrom } from './RequestBuying';

/**
 * Quotations on an approved material request, side by side (the comparative statement), with the purchase orders raised
 * on it. A purchaser adds quotations and raises a PO on one, for what the request still needs. Purchase works the same
 * request step by step under Purchases › Requests to order (enquiry, quotations, Finalise L1, order); a buyer gets the
 * link to it here.
 */
export function QuotationsPanel({ request }: { request: MaterialRequestDto }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const buyer = !!user && canPurchase(user.roleKey);
  const { data, isLoading } = useComparative(request.id);
  const orders = usePurchaseOrders({ materialRequestId: request.id, pageSize: 50 });
  const [quoting, setQuoting] = useState<QuotationDto | 'new' | null>(null);
  const [start, setStart] = useState<PoStart | null>(null);
  const [openPo, setOpenPo] = useState<string | null>(null);
  const [enquiring, setEnquiring] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [sent, setSent] = useState<EnquiryDto | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/quotations/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
    meta: FAIL_NOTICE,
  });

  const remaining = request.items.some((i) => toNumber(i.toOrderQty) > 0);

  const raise = (q: QuotationDto | null) => setStart(poStartFrom(request, q));

  const quotes = data?.quotations ?? [];
  // Offered only where the split beats one order: more than one vendor wins an item still to be ordered.
  const splitWins = data ? awardLowestPerItem(data, Object.fromEntries(request.items.map((i) => [i.id, i.toOrderQty]))).orders.length : 0;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <Typography.Text type="secondary">
          {quotes.length ? `${quotes.length} quotation${quotes.length === 1 ? '' : 's'}; the lowest landed rate (with GST) per item is marked.` : 'No quotations yet.'}
        </Typography.Text>
        {buyer && (
          <Space wrap>
            {remaining && (
              <LinkButton size="small" href={`/requests-to-order/${request.id}`}>
                Finalise L1 and order
              </LinkButton>
            )}
            {remaining && (
              <Button size="small" icon={<MailOutlined />} onClick={() => setEnquiring(true)}>
                Send enquiry
              </Button>
            )}
            <Button size="small" icon={<PlusOutlined />} onClick={() => setQuoting('new')}>
              Record quotation
            </Button>
            {remaining && splitWins > 1 && data && (
              <Button size="small" icon={<TrophyOutlined />} onClick={() => setAwarding(true)}>
                Award lowest per item
              </Button>
            )}
            {remaining && (
              <Button size="small" icon={<ShoppingCartOutlined />} onClick={() => raise(null)}>
                Raise PO without a quotation
              </Button>
            )}
          </Space>
        )}
      </div>
      <EnquiriesList requestId={request.id} />
      {quotes.length > 0 && data ? (
        <ComparativeTable
          request={request}
          data={data}
          loading={isLoading}
          actions={
            buyer
              ? (q) => (
                  <Space size="small">
                    {remaining && (
                      <Button size="small" type={data.lowestQuotationId === q.id ? 'primary' : 'default'} onClick={() => raise(q)}>
                        Raise PO
                      </Button>
                    )}
                    <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit quotation from ${q.vendorName}`} onClick={() => setQuoting(q)} />
                    <ConfirmDelete what={`the quotation from ${q.vendorName}`} onConfirm={() => remove.mutateAsync(q.id)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete quotation from ${q.vendorName}`} />
                    </ConfirmDelete>
                  </Space>
                )
              : undefined
          }
        />
      ) : null}
      {(orders.data?.items.length ?? 0) > 0 ? (
        <RequestOrders requestId={request.id} onOpen={setOpenPo} style={{ marginTop: 12 }} />
      ) : quotes.length === 0 && !buyer ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quotations or purchase orders yet" />
      ) : null}
      {!remaining && <AppTag tone="success" style={{ marginTop: 8 }}>Everything on this request is ordered or received</AppTag>}
      {data && <AwardLowestModal open={awarding} onClose={() => setAwarding(false)} request={request} comparative={data} onRaised={(o) => setOpenPo(o[0]?.id ?? null)} />}
      <EnquiryFormModal open={enquiring} request={request} onClose={() => setEnquiring(false)} onSent={setSent} />
      <EnquirySentModal enquiry={sent} request={request} onClose={() => setSent(null)} />
      <QuotationFormModal open={!!quoting} request={request} quotation={quoting === 'new' ? null : quoting} onClose={() => setQuoting(null)} />
      <PurchaseOrderFormModal open={!!start} start={start} onClose={() => setStart(null)} onSaved={(o) => setOpenPo(o.id)} />
      <PurchaseOrderDrawer id={openPo} open={!!openPo} onClose={() => setOpenPo(null)} />
    </>
  );
}
