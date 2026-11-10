'use client';

import React, { useState } from 'react';
import { HelpLink } from '@/components/common/Help';
import Link from 'next/link';
import { Button, Typography } from 'antd';
import { tk } from '@/ds';
import type { ProcurementStatusRowDto, RoleKey } from '@erp/shared';
import { canKeepStock, canViewPurchaseOrders } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProcurementStatus } from '@/lib/queries';
import { formatDate, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import { type ListColumn } from '@/components/list/DataTable';
import { ReceiptModal } from './ReceiptModal';

type Row = ProcurementStatusRowDto & { id: string };

/** Whether the user sees what is coming to the store: a stock keeper who may see the orders. */
export const seesDeliveries = (role?: RoleKey) => !!role && canKeepStock(role) && canViewPurchaseOrders(role);

/** Approved orders with something still to come, for the store's tab and its count. */
export function useDeliveriesExpected(projectId?: string, enabled = true) {
  const { data, isLoading, error } = useProcurementStatus({ projectId, show: 'PENDING' }, enabled);
  return { rows: enabled ? (data?.rows ?? []).map((r) => ({ ...r, id: r.purchaseOrderId })) : [], isLoading: enabled && isLoading, failed: !!error };
}

/**
 * Stock › Deliveries expected: the approved orders on the store's projects with something still to come, late first,
 * with Receive on each, so the store keeper books the GRN against the order from the store's own page instead of
 * looking for it under Purchase orders.
 */
export function DeliveriesExpected({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const keeper = !!user && canKeepStock(user.roleKey);
  const { rows, isLoading, failed } = useDeliveriesExpected(projectId);
  const [receiving, setReceiving] = useState<Row | null>(null);
  const columns: ListColumn<Row>[] = [
    {
      key: 'po',
      card: 'title',
      cardText: (r) => r.poNo,
      title: 'Order',
      locked: true,
      width: 160,
      render: (_, r) => (
        <div>
          <Link href={`/purchase-orders/${r.purchaseOrderId}`} className="mono" style={{ fontWeight: tk.type.title.fontWeight }}>
            {r.poNo}
          </Link>
          <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
            {formatDate(r.poDate)}
          </div>
        </div>
      ),
    },
    ...(projectId ? [] : [{ key: 'project', card: 'meta' as const, cardText: (r: Row) => r.projectName, title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true }]),
    { key: 'vendor', card: 'meta', cardText: (r) => r.vendorName, title: 'Vendor', dataIndex: 'vendorName', width: 200, render: (v: string) => <span translate="no">{v}</span> },
    {
      key: 'due',
      card: 'date',
      cardText: (r) => (r.deliveryBy ? formatDate(r.deliveryBy) : NO_VALUE),
      title: 'Due by',
      width: 140,
      render: (_, r) => (
        <div>
          {r.deliveryBy ? formatDate(r.deliveryBy) : <span className="text-muted">Not set</span>}
          {r.daysLate > 0 ? (
            <div style={{ fontSize: tk.type.caption.fontSize }}>
              <Typography.Text type="danger" style={{ fontSize: 'inherit' }}>
                {r.daysLate} day{r.daysLate === 1 ? '' : 's'} late
              </Typography.Text>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'pending',
      title: 'Still to come',
      render: (_, r) => {
        const left = r.lines.filter((l) => toNumber(l.pending) > 0);
        return (
          <span>
            {left.slice(0, 3).map((l, i) => (
              <span key={l.purchaseOrderLineId}>
                {i > 0 ? ', ' : ''}
                {l.itemName} <span translate="no">{formatQty(l.pending)} {l.unit}</span>
              </span>
            ))}
            {left.length > 3 ? <Typography.Text type="secondary">{` and ${left.length - 3} more`}</Typography.Text> : null}
            {r.receivedPct > 0 ? <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>{r.receivedPct}% received</div> : null}
          </span>
        );
      },
    },
    ...(keeper
      ? [
          {
            key: 'act',
            title: '',
            label: 'Action',
            locked: true,
            width: 120,
            render: (_: unknown, r: Row) => (
              <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); setReceiving(r); }}>
                Receive
              </Button>
            ),
          },
        ]
      : []),
  ];
  return (
    <>
      <HelpLink style={{ marginBottom: tk.space[2] }}>Approved orders with something still to come, late first. Receive books the goods received note against the order, so the bill and QA/QC follow it.</HelpLink>
      <LocalDataTable<Row>
        list="stock-deliveries"
        columns={columns}
        rows={rows}
        loading={isLoading}
        failed={failed}
        emptyText="Nothing on order. Approved purchase orders show here until everything on them is received."
      />
      {receiving ? <ReceiptModal open={!!receiving} onClose={() => setReceiving(null)} projectId={receiving.projectId} purchaseOrderId={receiving.purchaseOrderId} /> : null}
    </>
  );
}
