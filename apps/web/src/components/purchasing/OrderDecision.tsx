'use client';

import React from 'react';
import { Progress, Table, Typography } from 'antd';
import { tk } from '@/ds';
import type { ComparativeStatementDto, PurchaseOrderDto, QuotationDto } from '@erp/shared';
import { poOverBudget } from '@erp/shared';
import { useComparative } from '@/lib/queries';
import { AppTag } from '@/components/common/AppTag';
import { formatINR, toNumber } from '@/lib/format';
import { Money } from '@/components/common/Money';

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
                {q.id === lowest?.id ? <AppTag meaning="done">Lowest</AppTag> : null}
                {q.id === order.quotationId ? <AppTag variant="kind">This order</AppTag> : null}
                <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
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
              <Money value={v} paise />
            ),
          },
        ]}
      />
      {lowest && order.quotationId && order.quotationId !== lowest.id ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: tk.space[2], marginBottom: 0 }}>
          The lowest complete quotation is {lowest.vendorName} at {formatINR(lowest.total, true)}. Why this order goes elsewhere is above, under Why this vendor.
        </Typography.Paragraph>
      ) : null}
    </>
  );
}

/**
 * The project's material budget, the other approved orders against it and where this order takes it: the same figures
 * as the order's budget check (`PurchaseOrderDto.budgetCheck`, `poBudgetCheck`), all before GST, so the page gives one answer.
 */
export function OrderBudget({ order }: { order: PurchaseOrderDto }) {
  const b = order.budgetCheck;
  if (!b) return <Typography.Text type="secondary">No material budget is set for this project, so there is nothing to hold this order against.</Typography.Text>;

  const budget = toNumber(b.budget);
  const ordered = toNumber(b.ordered);
  const after = ordered + toNumber(b.thisOrder);
  const pct = budget > 0 ? Math.round((after / budget) * 100) : 0;
  const over = poOverBudget(b);

  return (
    <>
      <Typography.Paragraph style={{ marginBottom: tk.space[2] }}>
        Material budget <Money value={budget} />, with <Money value={ordered} /> on other approved orders. This order,{' '}
        <Money value={b.thisOrder} paise /> before GST, takes it to <Money value={after} />, {pct}% of the budget.
      </Typography.Paragraph>
      <Progress
        percent={Math.min(pct, 100)}
        status={over ? 'exception' : 'normal'}
        aria-label={`Material budget ordered after this order, ${pct}%`}
        success={{ percent: budget > 0 ? Math.min(Math.round((ordered / budget) * 100), 100) : 0 }}
      />
      {over ? (
        <Typography.Text style={{ color: tk.color.tone.danger.fg }}>
          It would go {formatINR(-toNumber(b.left))} past the material budget. Check it against the budget before approving.
        </Typography.Text>
      ) : null}
    </>
  );
}
