'use client';

import React from 'react';
import { Alert, App, Grid, Modal, Table, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AwardLine, AwardPlan, ComparativeStatementDto, MaterialRequestDto, PurchaseOrderDto } from '@erp/shared';
import { awardLowestPerItem } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { formatINR, formatQty } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';

type Row = AwardLine & { vendorName: string; quotationId: string };

/**
 * Award the lowest rate per item (finding 12 of the October review): the comparative statement marks the cheapest
 * rate for each line, but an order goes to one vendor, so a split used to be raised by hand. This shows the split
 * the rules work out, what it saves against the cheapest single quotation, and raises a draft order per winner.
 */
/** The item with what is still to order of it. */
function itemCell(r: Row) {
  return (
    <div>
      {r.itemName}
      <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        <span translate="no">
          {formatQty(r.quantity)} {r.unit}
        </span>
      </div>
    </div>
  );
}

/** The rate it is awarded at, with its GST. */
function rateCell(r: Row) {
  return (
    <span>
      <span className="mono" translate="no">
        {formatINR(r.rate, true)}
      </span>{' '}
      <span className="text-muted">+{r.gstRate}%</span>
    </span>
  );
}

export function AwardLowestModal({
  open,
  onClose,
  request,
  comparative,
  onRaised,
}: {
  open: boolean;
  onClose: () => void;
  request: MaterialRequestDto;
  comparative: ComparativeStatementDto;
  onRaised?: (orders: PurchaseOrderDto[]) => void;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  // On a phone each row is one block instead of four columns, so the table never scrolls sideways.
  const wide = Grid.useBreakpoint().md !== false;
  const plan: AwardPlan = awardLowestPerItem(comparative, Object.fromEntries(request.items.map((i) => [i.id, i.toOrderQty])));
  const rows: Row[] = plan.orders.flatMap((o) => o.lines.map((l) => ({ ...l, vendorName: o.vendorName, quotationId: o.quotationId })));

  const award = useMutation({
    mutationFn: async () => (await api.post<PurchaseOrderDto[]>(`/material-requests/${request.id}/award-lowest`, {})).data,
    onSuccess: (orders) => {
      message.success(`${orders.length} draft order${orders.length === 1 ? '' : 's'} raised: ${orders.map((o) => o.poNo).join(', ')}`);
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['material-requests'] });
      qc.invalidateQueries({ queryKey: ['comparative', request.id] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      onRaised?.(orders);
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Award the lowest rate per item on ${request.requestNo}`}
      okText={plan.orders.length === 1 ? 'Raise 1 draft order' : `Raise ${plan.orders.length} draft orders`}
      okButtonProps={{ disabled: !plan.orders.length }}
      confirmLoading={award.isPending}
      onOk={() => award.mutate()}
      width={820}
      destroyOnHidden
    >
      {plan.orders.length ? (
        <>
          <Typography.Paragraph type="secondary">
            Each item goes to the vendor who quoted the lowest rate with GST for it. The orders are drafts: check and send them for approval as usual.
          </Typography.Paragraph>
          <Table<Row>
            rowKey="materialRequestItemId"
            size="small"
            pagination={false}
            dataSource={rows}
            scroll={{ y: 320 }}
            columns={
              wide
                ? [
                    { title: 'Item', key: 'item', render: (_, r) => itemCell(r) },
                    { title: 'To', dataIndex: 'vendorName', width: '28%', render: (v) => <span translate="no">{v}</span> },
                    { title: 'Rate', key: 'rate', width: 150, align: 'right', render: (_, r) => rateCell(r) },
                    { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', className: 'mono', render: (v) => <span translate="no">{formatINR(v, true)}</span> },
                  ]
                : [
                    {
                      title: 'Item and vendor',
                      key: 'both',
                      render: (_, r) => (
                        <div>
                          {itemCell(r)}
                          <div translate="no">{r.vendorName}</div>
                          <div>
                            {rateCell(r)} · <span className="mono" translate="no">{formatINR(r.amount, true)}</span>
                          </div>
                        </div>
                      ),
                    },
                  ]
            }
          />
          <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
            {plan.orders.map((o) => (
              <div key={o.quotationId}>
                <span translate="no">{o.vendorName}</span>:{' '}
                <span className="mono" translate="no">
                  {formatINR(o.total, true)}
                </span>
                <span className="text-muted">
                  {' '}
                  ({o.lines.length} item{o.lines.length === 1 ? '' : 's'}
                  {o.freight > 0 ? `, freight ${formatINR(o.freight)}` : ''})
                </span>
              </div>
            ))}
            <strong>
              Together <span className="mono" translate="no">{formatINR(plan.total, true)}</span>
            </strong>
          </Typography.Paragraph>
          {plan.singleVendor && plan.saving != null ? (
            <Alert
              style={{ marginTop: 12 }}
              type={plan.saving > 0 ? 'success' : 'warning'}
              showIcon
              title={
                plan.saving > 0
                  ? `${formatINR(plan.saving, true)} less than ordering it all from ${plan.singleVendor.vendorName}`
                  : `${formatINR(Math.abs(plan.saving), true)} more than ordering it all from ${plan.singleVendor.vendorName}`
              }
              description={
                plan.saving > 0
                  ? `The whole lot from ${plan.singleVendor.vendorName} comes to ${formatINR(plan.singleVendor.total, true)}.`
                  : `The whole lot from ${plan.singleVendor.vendorName} comes to ${formatINR(plan.singleVendor.total, true)}: the split pays freight to each vendor. Raise that one order instead if it suits you.`
              }
            />
          ) : null}
          {plan.leftOut.some((l) => l.reason === 'not quoted') ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              Not quoted by anyone, so left out: {plan.leftOut.filter((l) => l.reason === 'not quoted').map((l) => l.itemName).join(', ')}.
            </Typography.Paragraph>
          ) : null}
        </>
      ) : (
        <Alert
          type="info"
          showIcon
          title="Nothing to award"
          description="Everything on this request is ordered, or no quotation prices what is left. Record a quotation, or raise the order by hand."
        />
      )}
    </Modal>
  );
}
