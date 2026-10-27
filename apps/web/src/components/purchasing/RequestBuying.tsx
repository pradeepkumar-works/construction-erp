'use client';

import React from 'react';
import { Space, Table, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { TrophyOutlined } from '@/components/common/icons';
import { AppTag } from '@/components/common/AppTag';
import type { ComparativeStatementDto, MaterialRequestDto, QuotationDto } from '@erp/shared';
import { lastRateKey, rankLabel, rankQuotations } from '@erp/shared';
import { useLastRates, usePurchaseOrders } from '@/lib/queries';
import { formatDate, formatINR, formatQty, toNumber } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { StatusTag } from '@/components/common/StatusTag';
import { RecordLink } from '@/components/record/RecordLink';
import { LastRates } from './LastRates';
import { PoStateTag } from './PurchaseOrderDrawer';
import type { PoStart } from './PurchaseOrderFormModal';

type Line = ComparativeStatementDto['lines'][number];

/** What is still to order on each line of a request, as the ranking and the award read it. */
export const toOrderOfRequest = (request: Pick<MaterialRequestDto, 'items'>) => Object.fromEntries(request.items.map((i) => [i.id, i.toOrderQty]));

/** L1, L2… of each quotation for what the request still needs (`rankQuotations`, as the API ranks them). */
export const ranksFor = (request: MaterialRequestDto | undefined, cs: ComparativeStatementDto | undefined) => (request && cs ? rankQuotations(cs.quotations, toOrderOfRequest(request)) : []);

/**
 * A purchase order for what is still to be ordered: at the quotation's rates, or blank rates without one. The reason
 * purchase gave when it finalised a quotation other than L1 goes on the order as why this vendor.
 */
export function poStartFrom(request: MaterialRequestDto, q: QuotationDto | null, selectionReason?: string | null): PoStart {
  const toOrder = new Map(request.items.map((i) => [i.id, toNumber(i.toOrderQty)]));
  return {
    projectId: request.projectId,
    materialRequestId: request.id,
    requestNo: request.requestNo,
    quotationId: q?.id,
    vendorId: q?.vendorId,
    freight: q ? toNumber(q.freight) : 0,
    paymentTerms: q?.paymentTerms,
    deliveryBy: q?.deliveryDays != null ? dayjs().add(q.deliveryDays, 'day').format('YYYY-MM-DD') : null,
    selectionReason: selectionReason ?? null,
    lines: request.items
      .filter((i) => (toOrder.get(i.id) ?? 0) > 0 && (!q || q.lines.some((l) => l.materialRequestItemId === i.id)))
      .map((i) => {
        const l = q?.lines.find((x) => x.materialRequestItemId === i.id);
        return { materialRequestItemId: i.id, itemName: i.itemName, specification: i.specification, unit: i.unit, quantity: toOrder.get(i.id), rate: l ? toNumber(l.rate) : null, gstRate: l ? toNumber(l.gstRate) : 18 };
      }),
  };
}

/**
 * The comparative statement: every line of the request with each vendor's rate, the lowest landed rate per item marked,
 * the last orders of each item under its name, and each quotation's L rank for what is still to order. `actions` draws
 * under each quotation's total.
 */
export function ComparativeTable({ request, data, loading, actions }: { request: MaterialRequestDto; data: ComparativeStatementDto; loading?: boolean; actions?: (q: QuotationDto) => React.ReactNode }) {
  const last = useLastRates(request.items);
  const quotes = data.quotations;
  const ranks = new Map(rankQuotations(quotes, toOrderOfRequest(request)).map((r) => [r.quotationId, r.rank]));
  const best = (l: Line, q: QuotationDto) => l.lowestQuotationId === q.id && quotes.length > 1;
  return (
    <Table<Line>
      size="small"
      rowKey="materialRequestItemId"
      pagination={false}
      loading={loading}
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
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {formatQty(l.quantity)} {l.unit}
                {toNumber(l.orderedQty) > 0 ? ` · ${formatQty(l.orderedQty)} ordered` : ''}
              </div>
              <LastRates itemName={l.itemName} rates={last.data?.[lastRateKey(l.itemName, l.unit)]} loading={last.isLoading} />
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
                    <TrophyOutlined style={{ color: themeColor('gold7'), marginRight: 4 }} />
                  </Tooltip>
                )}
                {q.vendorName}
              </div>
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM'), fontWeight: 400 }}>
                {[q.quoteRef, formatDate(q.quoteDate), q.deliveryDays != null ? `${q.deliveryDays} days` : null].filter(Boolean).join(' · ')}
              </div>
              <Space size={4} wrap style={{ justifyContent: 'flex-end' }}>
                {ranks.get(q.id) ? (
                  <AppTag tone={ranks.get(q.id) === 1 ? 'success' : 'neutral'} style={{ margin: 0, fontWeight: 400 }}>
                    {rankLabel(ranks.get(q.id))}
                  </AppTag>
                ) : null}
                {q.fromSupplier && (
                  <Tooltip title="Typed by the supplier on the enquiry link">
                    <AppTag tone="info" style={{ margin: 0, fontWeight: 400 }}>
                      From supplier
                    </AppTag>
                  </Tooltip>
                )}
              </Space>
            </div>
          ),
          render: (_: unknown, l: Line) => {
            const r = l.rates[q.id];
            if (!r) return <span className="text-muted">Not quoted</span>;
            return (
              <div style={best(l, q) ? { background: themeColor('colorSuccessBg'), borderRadius: 4, padding: '0 4px' } : undefined}>
                <span className="mono" translate="no">{formatINR(r.rate, true)}</span> <span className="text-muted">+{r.gstRate}%</span>
                <div className="text-muted mono" translate="no" style={{ fontSize: themeFontSize('fontSizeSM') }}>
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
                <strong className="mono" translate="no">{formatINR(q.total, true)}</strong>
                {q.missingLines > 0 && <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{q.missingLines} item{q.missingLines === 1 ? '' : 's'} not quoted</div>}
                {toNumber(q.freight) > 0 && <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>freight {formatINR(q.freight)}</div>}
                {actions ? <div style={{ marginTop: 4 }}>{actions(q)}</div> : null}
              </Table.Summary.Cell>
            ))}
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  );
}

/** The purchase orders raised on a request, each opening its record. */
export function RequestOrders({ requestId, onOpen, style }: { requestId: string; onOpen: (id: string) => void; style?: React.CSSProperties }) {
  const orders = usePurchaseOrders({ materialRequestId: requestId, pageSize: 50 });
  const rows = orders.data?.items ?? [];
  if (!rows.length) return null;
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      style={style}
      dataSource={rows}
      scroll={{ x: 560 }}
      columns={[
        { title: 'Purchase order', dataIndex: 'poNo', width: 150, render: (v, o) => <RecordLink href={`/purchase-orders/${o.id}`} onOpen={() => onOpen(o.id)} className="mono">{v}</RecordLink> },
        { title: 'Vendor', dataIndex: 'vendorName' },
        { title: 'Total', dataIndex: 'total', width: 140, align: 'right', render: (v) => <span className="mono" translate="no">{formatINR(v, true)}</span> },
        { title: 'Status', key: 'status', width: 190, render: (_, o) => <Space size={4}><StatusTag status={o.status} /><PoStateTag order={o} /></Space> },
      ]}
    />
  );
}

/** Whether a request has any orders, for the step that shows them. */
export const useRequestOrderCount = (requestId: string | undefined) => usePurchaseOrders({ materialRequestId: requestId, pageSize: 50 }, !!requestId).data?.items.length ?? 0;
