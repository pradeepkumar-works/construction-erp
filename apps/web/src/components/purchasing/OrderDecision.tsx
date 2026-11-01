'use client';

import React from 'react';
import { Progress, Table, Typography, theme } from 'antd';
import type { ComparativeStatementDto, PurchaseOrderDto, QuotationDto } from '@erp/shared';
import { useComparative, useProjectBudget } from '@/lib/queries';
import { AppTag } from '@/components/common/AppTag';
import { formatINR, toNumber } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';

/**
 * What an approver needs to decide a purchase order away from their desk (the
 * approval card showed no quotes, no lowest bidder and no budget). Both read what the request and the project already
 * hold, so nothing new is stored.
 */

/** The complete quotation with the lowest total: the one the order is judged against. */
function lowestComplete(cs: ComparativeStatementDto): QuotationDto | null {
  const complete = cs.quotations.filter((q) => q.missingLines === 0);
  return complete.length ? complete.reduce((a, b) => (toNumber(b.total) < toNumber(a.total) ? b : a)) : null;
}

/** The quotations on the order's request, side by side, with the lowest and this order's own marked. */
export function OrderQuotes({ order }: { order: PurchaseOrderDto }) {
  const { data, isLoading } = useComparative(order.materialRequestId ?? undefined);
  const quotes = data?.quotations ?? [];
  const lowest = data ? lowestComplete(data) : null;

  return (
    <>
      <Table<QuotationDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        dataSource={quotes}
        locale={{ emptyText: 'No quotation was recorded on this request.' }}
        columns={[
          {
            title: 'Vendor',
            key: 'vendor',
            render: (_, q) => (
              <div>
                <span translate="no">{q.vendorName}</span>{' '}
                {q.id === lowest?.id ? <AppTag tone="success">Lowest</AppTag> : null}
                {q.id === order.quotationId ? <AppTag tone="info">This order</AppTag> : null}
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {q.deliveryDays !== null ? `Delivers in ${q.deliveryDays} days` : 'Delivery not said'}
                  {q.missingLines ? ` · ${q.missingLines} item${q.missingLines === 1 ? '' : 's'} not quoted` : ''}
                  {toNumber(q.freight) > 0 ? ` · freight ${formatINR(q.freight)}` : ''}
                </div>
              </div>
            ),
          },
          {
            title: 'Quoted',
            dataIndex: 'total',
            width: 160,
            align: 'right',
            render: (v) => (
              <span className="mono" translate="no">
                {formatINR(v, true)}
              </span>
            ),
          },
        ]}
      />
      {lowest && order.quotationId && order.quotationId !== lowest.id ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          The lowest complete quotation is {lowest.vendorName} at {formatINR(lowest.total, true)}. Why this order goes elsewhere is above, under Why this vendor.
        </Typography.Paragraph>
      ) : null}
    </>
  );
}

/** The project's material budget, what it has cost so far, and where this order takes it. */
export function OrderBudget({ order }: { order: PurchaseOrderDto }) {
  const { token } = theme.useToken();
  const { data, isLoading } = useProjectBudget(order.projectId);
  const material = data?.heads.find((h) => h.head === 'material');
  if (isLoading && !data) return <Typography.Text type="secondary">Reading the budget…</Typography.Text>;
  if (!material || material.budget === null)
    return <Typography.Text type="secondary">No material budget is set for this project, so there is nothing to hold this order against.</Typography.Text>;

  const budget = toNumber(material.budget);
  const spent = toNumber(material.actual);
  const thisOrder = toNumber(order.total);
  const after = spent + thisOrder;
  const pct = budget > 0 ? Math.round((after / budget) * 100) : 0;
  const over = after > budget;

  return (
    <>
      <Typography.Paragraph style={{ marginBottom: 8 }}>
        Material budget <span className="mono" translate="no">{formatINR(budget)}</span>, of which{' '}
        <span className="mono" translate="no">{formatINR(spent)}</span> has been spent. This order of{' '}
        <span className="mono" translate="no">{formatINR(order.total, true)}</span> takes it to{' '}
        <span className="mono" translate="no">{formatINR(after)}</span>, {pct}% of the budget.
      </Typography.Paragraph>
      <Progress
        percent={Math.min(pct, 100)}
        status={over ? 'exception' : 'normal'}
        aria-label={`Material budget used after this order, ${pct}%`}
        success={{ percent: budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0 }}
      />
      {over ? (
        <Typography.Text style={{ color: token.colorErrorText }}>
          It would go {formatINR(after - budget)} past the material budget. Check it against the budget before approving.
        </Typography.Text>
      ) : null}
    </>
  );
}
