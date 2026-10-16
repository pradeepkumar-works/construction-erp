'use client';

import React, { useState } from 'react';
import { Card, DatePicker, Flex, Progress, Segmented, Select, Statistic, Table, Tag, Typography, theme } from 'antd';
import type { TableProps } from 'antd';
import type { Dayjs } from 'dayjs';
import type { DeliveryState, ProcurementStatusLineDto, ProcurementStatusRowDto } from '@erp/shared';
import { DELIVERY_STATE_LABELS } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useProcurementStatus, useVendors } from '@/lib/queries';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';
import { rangePresets } from '@/lib/dates';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ExportButton } from '@/components/common/ExportButton';

const STATE_COLORS: Record<DeliveryState, string> = { NOT_STARTED: 'default', PARTLY_RECEIVED: 'blue', RECEIVED: 'green', CLOSED: 'purple' };
type Show = 'PENDING' | 'LATE' | 'ALL';

interface ExportRow {
  o: ProcurementStatusRowDto;
  l: ProcurementStatusLineDto;
}
const EXPORT: ExportColumn<ExportRow>[] = [
  { header: 'PO no.', value: (r) => r.o.poNo, width: 16 },
  { header: 'PO date', value: (r) => r.o.poDate, width: 12 },
  { header: 'Project', value: (r) => r.o.projectName, width: 30 },
  { header: 'Vendor', value: (r) => r.o.vendorName, width: 28 },
  { header: 'Delivery by', value: (r) => r.o.deliveryBy, width: 12 },
  { header: 'Days late', value: (r) => r.o.daysLate || null },
  { header: 'Status', value: (r) => DELIVERY_STATE_LABELS[r.o.state], width: 16 },
  { header: 'Item', value: (r) => r.l.itemName, width: 30 },
  { header: 'Unit', value: (r) => r.l.unit },
  { header: 'Ordered', value: (r) => Number(r.l.ordered) },
  { header: 'Received', value: (r) => Number(r.l.received) },
  { header: 'Pending', value: (r) => Number(r.l.pending) },
  { header: 'Pending value (₹)', value: (r) => Number(r.l.pendingValue), width: 16 },
  { header: 'Last receipt', value: (r) => r.o.lastReceiptOn, width: 12 },
];

/**
 * Procurement status (v4 item 48): approved purchase orders with what has arrived and what is still to come, late
 * deliveries first, and the vendors with orders pending.
 */
export function ProcurementStatusPanel() {
  const { token } = theme.useToken();
  const [show, setShow] = useState<Show>('PENDING');
  const [projectId, setProjectId] = useProjectScope();
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const vendors = useVendors();
  const { data, isLoading, isFetching, error, refetch } = useProcurementStatus({ show, projectId, vendorId, from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD') });
  const t = data?.totals;

  const exportRows = async () => {
    const rows = (data?.rows ?? []).flatMap((o) => o.lines.map((l) => ({ o, l })));
    downloadXlsx(exportFileName('procurement-status'), 'status', EXPORT, rows);
    return rows.length;
  };

  const columns: TableProps<ProcurementStatusRowDto>['columns'] = [
    {
      title: 'PO',
      key: 'po',
      width: 150,
      render: (_, r) => (
        <div>
          <Typography.Link href={`/purchase-orders/${r.purchaseOrderId}`}>{r.poNo}</Typography.Link>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatDate(r.poDate)}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Vendor and project',
      key: 'who',
      render: (_, r) => (
        <div>
          {r.vendorName}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.projectName}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Delivery by',
      key: 'due',
      width: 140,
      render: (_, r) => (
        <div>
          {r.deliveryBy ? formatDate(r.deliveryBy) : <Typography.Text type="secondary">Not set</Typography.Text>}
          {r.daysLate ? (
            <div>
              <Typography.Text type="danger" style={{ fontSize: 12 }}>
                {r.daysLate} day{r.daysLate === 1 ? '' : 's'} late
              </Typography.Text>
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Received', key: 'pct', width: 150, render: (_, r) => <Progress percent={r.receivedPct} size="small" /> },
    { title: 'Still to come', dataIndex: 'pendingValue', width: 140, align: 'right', render: (v: string) => (Number(v) ? formatINR(v) : '-') },
    {
      title: '',
      key: 'state',
      width: 170,
      render: (_, r) => (
        <Flex vertical gap={2} align="flex-start">
          <Tag color={STATE_COLORS[r.state]} style={{ margin: 0 }}>
            {DELIVERY_STATE_LABELS[r.state]}
          </Tag>
          {r.awaitingQc ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              {r.awaitingQc} GRN{r.awaitingQc === 1 ? '' : 's'} awaiting QA/QC
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={12} className="procurement-status">
      {error ? <QueryError error={error} onRetry={refetch} /> : null}
      {t ? (
        <Flex gap={32} wrap className="procurement-summary" style={{ padding: `${token.paddingXS}px ${token.padding}px` }}>
          <Statistic title="Approved orders" value={t.orders} />
          <Statistic title="With deliveries pending" value={t.pending} />
          <Statistic title="Late" value={t.late} styles={{ content: t.late ? { color: token.colorError } : undefined }} />
          <Statistic title="Value still to come" value={formatINR(t.pendingValue)} />
        </Flex>
      ) : null}
      <Flex gap={8} wrap align="center" style={{ padding: `0 ${token.paddingSM}px` }}>
        <Segmented<Show>
          value={show}
          onChange={setShow}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'LATE', label: 'Late' },
            { value: 'ALL', label: 'All' },
          ]}
        />
        <ProjectSelect value={projectId} onChange={setProjectId} placeholder="All projects" style={{ width: 220 }} />
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="All vendors"
          value={vendorId}
          onChange={setVendorId}
          style={{ width: 220 }}
          aria-label="Vendor"
          options={(vendors.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
        />
        <DatePicker.RangePicker presets={rangePresets()} value={range} onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)} format="DD MMM YYYY" allowEmpty={[true, true]} placeholder={['Orders from', 'to']} />
        <span style={{ flex: 1 }} />
        <ExportButton onExport={exportRows} />
      </Flex>
      <Table<ProcurementStatusRowDto>
        className="procurement-table"
        size="middle"
        rowKey="purchaseOrderId"
        loading={isLoading || isFetching}
        dataSource={data?.rows ?? []}
        columns={columns}
        scroll={{ x: 960 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        expandable={{
          expandedRowRender: (r) => (
            <Table<ProcurementStatusLineDto>
              size="small"
              rowKey="purchaseOrderLineId"
              pagination={false}
              dataSource={r.lines}
              columns={[
                { title: 'Item', dataIndex: 'itemName' },
                { title: 'Ordered', dataIndex: 'ordered', align: 'right', width: 120, render: (v: string, l) => `${formatQty(v)} ${l.unit}` },
                { title: 'Received', dataIndex: 'received', align: 'right', width: 120, render: (v: string) => formatQty(v) },
                { title: 'Pending', dataIndex: 'pending', align: 'right', width: 120, render: (v: string) => (Number(v) > 0 ? <Typography.Text type="warning">{formatQty(v)}</Typography.Text> : '-') },
                { title: 'Pending value', dataIndex: 'pendingValue', align: 'right', width: 140, render: (v: string) => (Number(v) ? formatINR(v) : '-') },
              ]}
            />
          ),
        }}
        locale={{ emptyText: show === 'ALL' ? 'No approved orders' : show === 'LATE' ? 'Nothing late' : 'Nothing pending: every approved order has been received' }}
      />
      {data && data.byVendor.length ? (
        <Card size="small" title="Vendors with deliveries pending" className="procurement-vendors">
          <Table
            size="small"
            rowKey="vendorId"
            pagination={false}
            dataSource={data.byVendor}
            columns={[
              { title: 'Vendor', dataIndex: 'vendorName' },
              { title: 'Orders', dataIndex: 'orders', align: 'right', width: 90 },
              { title: 'Pending', dataIndex: 'pending', align: 'right', width: 90 },
              { title: 'Late', dataIndex: 'late', align: 'right', width: 90, render: (v: number) => (v ? <Typography.Text type="danger">{v}</Typography.Text> : 0) },
              { title: 'Still to come', dataIndex: 'pendingValue', align: 'right', width: 150, render: (v: string) => formatINR(v) },
            ]}
          />
        </Card>
      ) : null}
    </Flex>
  );
}
