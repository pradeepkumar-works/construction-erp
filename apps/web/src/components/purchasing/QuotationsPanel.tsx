'use client';

import React, { useState } from 'react';
import { App, Button, Empty, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ShoppingCartOutlined, TrophyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ComparativeStatementDto, MaterialRequestDto, QuotationDto } from '@erp/shared';
import { canPurchase } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useComparative, usePurchaseOrders } from '@/lib/queries';
import { formatDate, formatINR, formatQty, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { QuotationFormModal } from './QuotationFormModal';
import { PurchaseOrderFormModal, type PoStart } from './PurchaseOrderFormModal';
import { PoStateTag, PurchaseOrderDrawer } from './PurchaseOrderDrawer';

type Line = ComparativeStatementDto['lines'][number];

/**
 * Quotations on an approved material request, side by side (the comparative statement), with the purchase orders raised
 * on it. A purchaser adds quotations and raises a PO on one, for what the request still needs.
 */
export function QuotationsPanel({ request }: { request: MaterialRequestDto }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const buyer = !!user && canPurchase(user.roleKey);
  const { data, isLoading } = useComparative(request.id);
  const orders = usePurchaseOrders({ materialRequestId: request.id, pageSize: 50 });
  const [quoting, setQuoting] = useState<QuotationDto | 'new' | null>(null);
  const [start, setStart] = useState<PoStart | null>(null);
  const [openPo, setOpenPo] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/quotations/${id}`)).data,
    onSuccess: () => {
      message.success('Quotation deleted');
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const toOrder = new Map(request.items.map((i) => [i.id, toNumber(i.toOrderQty)]));
  const remaining = request.items.some((i) => toNumber(i.toOrderQty) > 0);

  /** A PO for what is still to be ordered: at the quotation's rates, or blank rates without one. */
  const raise = (q: QuotationDto | null) =>
    setStart({
      projectId: request.projectId,
      materialRequestId: request.id,
      requestNo: request.requestNo,
      quotationId: q?.id,
      vendorId: q?.vendorId,
      freight: q ? toNumber(q.freight) : 0,
      paymentTerms: q?.paymentTerms,
      deliveryBy: q?.deliveryDays != null ? dayjs().add(q.deliveryDays, 'day').format('YYYY-MM-DD') : null,
      lines: request.items
        .filter((i) => (toOrder.get(i.id) ?? 0) > 0 && (!q || q.lines.some((l) => l.materialRequestItemId === i.id)))
        .map((i) => {
          const l = q?.lines.find((x) => x.materialRequestItemId === i.id);
          return { materialRequestItemId: i.id, itemName: i.itemName, specification: i.specification, unit: i.unit, quantity: toOrder.get(i.id), rate: l ? toNumber(l.rate) : null, gstRate: l ? toNumber(l.gstRate) : 18 };
        }),
    });

  const quotes = data?.quotations ?? [];
  const best = (l: Line, q: QuotationDto) => l.lowestQuotationId === q.id && quotes.length > 1;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <Typography.Text type="secondary">
          {quotes.length ? `${quotes.length} quotation${quotes.length === 1 ? '' : 's'}; the lowest landed rate (with GST) per item is marked.` : 'No quotations yet.'}
        </Typography.Text>
        {buyer && (
          <Space wrap>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setQuoting('new')}>
              Add quotation
            </Button>
            {remaining && (
              <Button size="small" icon={<ShoppingCartOutlined />} onClick={() => raise(null)}>
                Raise PO without a quotation
              </Button>
            )}
          </Space>
        )}
      </div>
      {quotes.length > 0 && data ? (
        <Table<Line>
          size="small"
          rowKey="materialRequestItemId"
          pagination={false}
          loading={isLoading}
          dataSource={data.lines}
          scroll={{ x: 300 + quotes.length * 190 }}
          columns={[
            {
              title: 'Item',
              fixed: 'left',
              width: 200,
              render: (_, l) => (
                <div>
                  {l.itemName}
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {formatQty(l.quantity)} {l.unit}
                    {toNumber(l.orderedQty) > 0 ? ` · ${formatQty(l.orderedQty)} ordered` : ''}
                  </div>
                </div>
              ),
            },
            ...quotes.map((q) => ({
              key: q.id,
              width: 190,
              align: 'right' as const,
              title: (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ whiteSpace: 'normal' }}>
                    {data.lowestQuotationId === q.id && quotes.length > 1 && (
                      <Tooltip title="Lowest total among quotations for every item">
                        <TrophyOutlined style={{ color: '#d48806', marginRight: 4 }} />
                      </Tooltip>
                    )}
                    {q.vendorName}
                  </div>
                  <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>
                    {[q.quoteRef, formatDate(q.quoteDate), q.deliveryDays != null ? `${q.deliveryDays} days` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ),
              render: (_: unknown, l: Line) => {
                const r = l.rates[q.id];
                if (!r) return <span className="text-muted">Not quoted</span>;
                return (
                  <div style={best(l, q) ? { background: '#f6ffed', borderRadius: 4, padding: '0 4px' } : undefined}>
                    <span className="mono">{formatINR(r.rate, true)}</span> <span className="text-muted">+{r.gstRate}%</span>
                    <div className="text-muted mono" style={{ fontSize: 11 }}>
                      {formatINR(r.amount, true)}
                    </div>
                  </div>
                );
              },
            })),
          ]}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <strong>Total with GST and freight</strong>
                </Table.Summary.Cell>
                {quotes.map((q, i) => (
                  <Table.Summary.Cell key={q.id} index={i + 1} align="right">
                    <strong className="mono">{formatINR(q.total, true)}</strong>
                    {q.missingLines > 0 && <div className="text-muted" style={{ fontSize: 11 }}>{q.missingLines} item{q.missingLines === 1 ? '' : 's'} not quoted</div>}
                    {toNumber(q.freight) > 0 && <div className="text-muted" style={{ fontSize: 11 }}>freight {formatINR(q.freight)}</div>}
                    {buyer && (
                      <Space size={2} style={{ marginTop: 4 }}>
                        {remaining && (
                          <Button size="small" type={data.lowestQuotationId === q.id ? 'primary' : 'default'} onClick={() => raise(q)}>
                            Raise PO
                          </Button>
                        )}
                        <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit quotation from ${q.vendorName}`} onClick={() => setQuoting(q)} />
                        <Popconfirm title={`Delete the quotation from ${q.vendorName}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(q.id)}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete quotation from ${q.vendorName}`} />
                        </Popconfirm>
                      </Space>
                    )}
                  </Table.Summary.Cell>
                ))}
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : null}
      {(orders.data?.items.length ?? 0) > 0 ? (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          style={{ marginTop: 12 }}
          dataSource={orders.data?.items ?? []}
          columns={[
            { title: 'Purchase order', dataIndex: 'poNo', width: 150, render: (v, o) => <Typography.Link className="mono" onClick={() => setOpenPo(o.id)}>{v}</Typography.Link> },
            { title: 'Vendor', dataIndex: 'vendorName' },
            { title: 'Total', dataIndex: 'total', width: 140, align: 'right', render: (v) => <span className="mono">{formatINR(v, true)}</span> },
            { title: 'Status', key: 'status', width: 190, render: (_, o) => <Space size={4}><StatusTag status={o.status} /><PoStateTag order={o} /></Space> },
          ]}
        />
      ) : quotes.length === 0 && !buyer ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quotations or purchase orders yet" />
      ) : null}
      {!remaining && <Tag color="green" style={{ marginTop: 8 }}>Everything on this request is ordered or received</Tag>}
      <QuotationFormModal open={!!quoting} request={request} quotation={quoting === 'new' ? null : quoting} onClose={() => setQuoting(null)} />
      <PurchaseOrderFormModal open={!!start} start={start} onClose={() => setStart(null)} onSaved={(o) => setOpenPo(o.id)} />
      <PurchaseOrderDrawer id={openPo} open={!!openPo} onClose={() => setOpenPo(null)} />
    </>
  );
}
