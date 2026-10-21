'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Popover, Table, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { LAST_RATES_COUNT, type LastRateDto } from '@erp/shared';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';

/**
 * An item's last approved orders (v5 item 95) under a rate: the latest rate and vendor at a glance, the last five in a
 * popover (date, vendor, project, quantity, rate). Nothing when the item was never ordered.
 */
export function LastRates({ itemName, rates, loading }: { itemName: string; rates: LastRateDto[] | undefined; loading?: boolean }) {
  if (loading || !rates) return null;
  if (!rates.length)
    return (
      <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        No earlier orders
      </Typography.Text>
    );
  const last = rates[0];
  return (
    <Popover
      trigger="click"
      title={`Last ${Math.min(rates.length, LAST_RATES_COUNT)} orders of ${itemName}`}
      content={
        <Table<LastRateDto>
          size="small"
          rowKey="purchaseOrderId"
          pagination={false}
          dataSource={rates}
          style={{ maxWidth: 560 }}
          scroll={{ x: 520 }}
          columns={[
            { title: 'Order', dataIndex: 'poNo', width: 130, render: (v, r) => <Link href={`/purchase-orders/${r.purchaseOrderId}`} className="mono">{v}</Link> },
            { title: 'Date', dataIndex: 'poDate', width: 100, render: (v) => formatDate(v) },
            { title: 'Vendor', dataIndex: 'vendorName', render: (v, r) => <div translate="no">{v}<div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{r.projectName} · {formatQty(r.quantity)}</div></div> },
            { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v, r) => <span className="mono" translate="no">{formatINR(v, true)}<div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>+{r.gstRate}%</div></span> },
          ]}
        />
      }
    >
      <Button type="link" size="small" icon={<HistoryOutlined />} style={{ padding: 0, height: 'auto', minHeight: 24, fontSize: themeFontSize('fontSizeSM') }}>
        Last order <span translate="no">{formatINR(last.rate, true)} · {last.vendorName}</span>
      </Button>
    </Popover>
  );
}
