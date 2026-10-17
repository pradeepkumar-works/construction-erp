'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, Card, Col, DatePicker, Row, Skeleton, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { GstInwardRowDto, GstOutwardRowDto } from '@erp/shared';
import { canViewGstRegisters } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useGstRegisters } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact, toNumber } from '@/lib/format';
import { CONSTRUCTION_SAC, GST_SOURCE_LABELS, downloadGstWorkbook, hsnSummary, placeOfSupply } from '@/lib/gstExport';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { tabBarWithExtra } from '@/components/common/tabBarWithExtra';
import { rangePresets } from '@/lib/dates';

const money = (v: string | number) => <span className="mono">{formatINR(v)}</span>;
const taxColumns = <T extends { igst: string; cgst: string; sgst: string }>(): NonNullable<TableProps<T>['columns']> => [
  { title: 'IGST', dataIndex: 'igst', width: 120, align: 'right', render: money },
  { title: 'CGST', dataIndex: 'cgst', width: 120, align: 'right', render: money },
  { title: 'SGST', dataIndex: 'sgst', width: 120, align: 'right', render: money },
];

/** `?from=2026-08&to=2026-10` opens those months; this month otherwise. */
const monthParam = (v: string | null) => (v && /^\d{4}-\d{2}$/.test(v) ? dayjs(`${v}-01`) : null);

function GstRegistersPage() {
  const { user } = useAuth();
  const search = useSearchParams();
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [monthParam(search.get('from')) ?? dayjs().startOf('month'), monthParam(search.get('to')) ?? dayjs()]);
  const params = { from: range[0].startOf('month').format('YYYY-MM-DD'), to: range[1].endOf('month').format('YYYY-MM-DD') };
  const { data, isLoading, isFetching, error, refetch } = useGstRegisters(params);
  if (user && !canViewGstRegisters(user.roleKey))
    return (
      <div className="page-container">
        <PageHeader title="GST Registers" />
        <Alert type="warning" showIcon title="Only admin, management and accounts see the GST registers." />
      </div>
    );

  const outwardColumns: TableProps<GstOutwardRowDto>['columns'] = [
    {
      title: 'Invoice',
      dataIndex: 'invoiceNo',
      width: 190,
      render: (v: string, r) => (
        <div>
          <Link href={`/bills?id=${r.billId}`} className="mono">
            {v}
          </Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {formatDate(r.invoiceDate)}
          </div>
        </div>
      ),
    },
    {
      title: 'Recipient',
      key: 'recipient',
      render: (_, r) => (
        <div>
          {r.recipientName} <Tag style={{ marginLeft: 4 }}>{r.section}</Tag>
          <div className="text-muted mono" style={{ fontSize: 12 }}>
            {r.recipientGstin ?? 'Unregistered'} · {placeOfSupply(r.placeOfSupply) || 'place of supply not known'}
          </div>
        </div>
      ),
    },
    { title: 'Rate', dataIndex: 'rate', width: 70, align: 'right', render: (v) => `${toNumber(v)}%` },
    { title: 'Taxable value', dataIndex: 'taxable', width: 140, align: 'right', render: money },
    ...taxColumns<GstOutwardRowDto>(),
    { title: 'Invoice value', dataIndex: 'invoiceValue', width: 140, align: 'right', render: (v) => <strong className="mono">{formatINR(v)}</strong> },
  ];
  const inwardColumns: TableProps<GstInwardRowDto>['columns'] = [
    {
      title: 'Invoice',
      key: 'invoice',
      width: 190,
      render: (_, r) => (
        <div>
          <span className="mono">{r.invoiceNo ?? <Typography.Text type="warning">no invoice no.</Typography.Text>}</span>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {formatDate(r.invoiceDate)}
          </div>
        </div>
      ),
    },
    {
      title: 'Supplier',
      key: 'supplier',
      render: (_, r) => (
        <div>
          {r.supplierName}
          {!r.itcEligible && (
            <Tag color="red" style={{ marginLeft: 6 }}>
              No GSTIN
            </Tag>
          )}
          <div className="text-muted" style={{ fontSize: 12 }}>
            <span className="mono">{r.supplierGstin ?? '-'}</span> · {GST_SOURCE_LABELS[r.source]} {r.ref} · {r.projectCode}
          </div>
        </div>
      ),
    },
    { title: 'Rate', dataIndex: 'rate', width: 70, align: 'right', render: (v) => `${toNumber(v)}%` },
    { title: 'Taxable value', dataIndex: 'taxable', width: 140, align: 'right', render: money },
    ...taxColumns<GstInwardRowDto>(),
    { title: 'Invoice value', dataIndex: 'invoiceValue', width: 140, align: 'right', render: money },
  ];
  const hsn = data ? hsnSummary(data.outward) : [];
  const net = data ? toNumber(data.outwardTotals.tax) - toNumber(data.inwardTotals.tax) : 0;

  return (
    <div className="page-container">
      <PageHeader
        title="GST Registers"
        subtitle="Outward supplies from approved RA bills in the GSTR-1 layout, and input tax from vendor bills, subcontractor bills and site expenses to reconcile with GSTR-2B."
        extra={
          <DatePicker.RangePicker presets={rangePresets()}
            picker="month"
            value={range}
            allowClear={false}
            format="MMM YYYY"
            disabledDate={(d) => d.isAfter(dayjs(), 'month')}
            onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
            aria-label="Months"
          />
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col flex="1 1 180px">
              <Card style={{ height: '100%' }}>
                <Statistic title="Output tax" value={formatINRCompact(data.outwardTotals.tax)} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  On {formatINR(data.outwardTotals.taxable)} billed, {data.outward.length} invoice{data.outward.length === 1 ? '' : 's'}
                </Typography.Text>
              </Card>
            </Col>
            <Col flex="1 1 180px">
              <Card style={{ height: '100%' }}>
                <Statistic title="Input tax" value={formatINRCompact(data.inwardTotals.tax)} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  On {formatINR(data.inwardTotals.taxable)} bought with a GSTIN
                </Typography.Text>
              </Card>
            </Col>
            <Col flex="1 1 180px">
              <Card style={{ height: '100%' }}>
                <Statistic title={net >= 0 ? 'Net GST to pay' : 'Input tax carried forward'} value={formatINRCompact(Math.abs(net))} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Before TDS credits and the electronic ledgers
                </Typography.Text>
              </Card>
            </Col>
            <Col flex="1 1 180px">
              <Card style={{ height: '100%' }}>
                <Statistic title="Not claimable" value={formatINRCompact(data.ineligibleTax)} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  GST paid where the supplier&apos;s GSTIN is missing
                </Typography.Text>
              </Card>
            </Col>
          </Row>
          {data.warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              title={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              }
            />
          )}
        </>
      )}
      <Card size="small">
        <Tabs
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          renderTabBar={tabBarWithExtra(
            <Button icon={<DownloadOutlined />} disabled={!data} onClick={() => data && downloadGstWorkbook(data)} style={{ marginRight: 12 }}>
              Excel
            </Button>,
          )}
          items={[
            {
              key: 'outward',
              label: `Outward supplies${data ? ` (${data.outward.length})` : ''}`,
              children: (
                <Table<GstOutwardRowDto>
                  rowKey="billId"
                  size="middle"
                  loading={isFetching}
                  columns={outwardColumns}
                  dataSource={data?.outward ?? []}
                  pagination={{ pageSize: 50, hideOnSinglePage: true }}
                  scroll={{ x: 1150 }}
                  locale={{ emptyText: 'No approved RA bill in this period' }}
                />
              ),
            },
            {
              key: 'inward',
              label: `Input tax${data ? ` (${data.inward.length})` : ''}`,
              children: (
                <Table<GstInwardRowDto>
                  rowKey="key"
                  size="middle"
                  loading={isFetching}
                  columns={inwardColumns}
                  dataSource={data?.inward ?? []}
                  pagination={{ pageSize: 50, hideOnSinglePage: true }}
                  scroll={{ x: 1150 }}
                  locale={{ emptyText: 'No purchase with GST in this period' }}
                />
              ),
            },
            {
              key: 'hsn',
              label: 'HSN summary',
              children: (
                <Table
                  rowKey="rate"
                  size="middle"
                  pagination={false}
                  dataSource={hsn}
                  scroll={{ x: 900 }}
                  locale={{ emptyText: 'No outward supply in this period' }}
                  columns={[
                    { title: 'SAC', key: 'sac', width: 90, render: () => <span className="mono">{CONSTRUCTION_SAC}</span> },
                    { title: 'Rate', dataIndex: 'rate', width: 80, align: 'right', render: (v: number) => `${v}%` },
                    { title: 'Total value', dataIndex: 'value', align: 'right', render: money },
                    { title: 'Taxable value', dataIndex: 'taxable', align: 'right', render: money },
                    { title: 'IGST', dataIndex: 'igst', align: 'right', render: money },
                    { title: 'CGST', dataIndex: 'cgst', align: 'right', render: money },
                    { title: 'SGST', dataIndex: 'sgst', align: 'right', render: money },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        RA bills are taken by bill date once approved, invoice number as in the Tally export; works on a site are supplied where it is, so their GST is CGST and SGST.
        Purchases are approved bills and expenses by invoice date, one row per GST rate; IGST when the supplier is registered in another state. E-invoicing is not
        generated here.
      </Typography.Paragraph>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GstRegistersPage />
    </Suspense>
  );
}
