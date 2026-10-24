'use client';

import React, { useState } from 'react';
import { Card, Col, DatePicker, Row, Statistic, Table, Tag, Typography, theme } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import dayjs, { type Dayjs } from 'dayjs';
import { PAYMENT_MODE_LABELS, SUBMISSION_STATUS_LABELS, type PaymentMode, SUPPLIER_STATEMENT_KIND_LABELS, type SupplierBillDto, type SupplierPaymentDto, type SupplierStatementRowDto } from '@erp/shared';
import { useSupplierStatement } from '@/lib/queries';
import { formatDate, formatINR, STATUS_COLORS, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { Money } from '@/components/supplier/supplierUi';

/** The supplier's account with the company: bills, payments and what is still owed, from a date they pick. */
export default function SupplierStatementPage() {
  const { token } = theme.useToken();
  const [from, setFrom] = useState<Dayjs | null>(null);
  const { data, isLoading, error, refetch } = useSupplierStatement(from ? from.format('YYYY-MM-DD') : undefined);
  const stat = (title: string, value: string | undefined, note?: string) => (
    <Col xs={12} md={8} xl={4}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={formatINR(value)} styles={{ content: { fontSize: token.fontSizeHeading4 } }} />
        {note ? <Typography.Text type="secondary">{note}</Typography.Text> : null}
      </Card>
    </Col>
  );
  // Only an approved bill is owed; one still with the approvers shows in the list without counting.
  const approved = data?.bills.filter((b) => b.status === 'APPROVED') ?? [];
  const due = approved.reduce((s, b) => s + toNumber(b.due), 0);
  const overdue = approved.filter((b) => b.dueDate < dayjs().format('YYYY-MM-DD')).reduce((s, b) => s + toNumber(b.due), 0);
  return (
    <div className="page-container">
      <PageHeader
        title="Payments"
        subtitle="Your account with us: every approved bill, every payment and deduction, and what is still owed to you."
        extra={
          <DatePicker
            value={from}
            onChange={setFrom}
            placeholder="From the start"
            format="DD MMM YYYY"
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
            aria-label="Statement from"
          />
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} /> : null}
      {data ? (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
            {stat('Billed', data.billed, data.from ? `Since ${formatDate(data.from)}` : 'All time')}
            {stat('Paid to you', data.paid)}
            {stat('Deducted', data.deducted, 'TDS, other deductions, debit notes')}
            {stat('Balance', data.balance, toNumber(data.balance) < 0 ? 'Paid ahead (advance)' : `As on ${formatDate(data.to)}`)}
            {stat('Due on open bills', String(due), overdue > 0 ? `${formatINR(overdue)} past its due date` : 'Nothing past its due date')}
            {stat('Retention held', data.retentionHeld, 'Released at the end of the work')}
          </Row>
          <AppTabs
            items={[
              { key: 'rows', label: 'Statement', children: <Rows rows={data.rows} /> },
              { key: 'bills', label: 'Bills', count: data.bills.length, countLabel: 'bills', children: <Bills bills={data.bills} /> },
              { key: 'payments', label: 'Payments', count: data.payments.length, countLabel: 'payments', children: <Payments payments={data.payments} /> },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}

function Rows({ rows }: { rows: SupplierStatementRowDto[] }) {
  return (
    <Table<SupplierStatementRowDto>
      rowKey={(r, i) => `${r.kind}-${r.ref}-${i}`}
      size="small"
      dataSource={rows}
      locale={{ emptyText: 'No bills or payments in this period' }}
      scroll={{ x: 900 }}
      pagination={{ pageSize: 50, hideOnSinglePage: true }}
      columns={[
        { title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
        { title: 'Type', dataIndex: 'kind', width: 110, render: (k: SupplierStatementRowDto['kind']) => SUPPLIER_STATEMENT_KIND_LABELS[k] },
        { title: 'Reference', dataIndex: 'ref', width: 170, render: (v: string) => <span translate="no">{v}</span> },
        { title: 'Details', dataIndex: 'description', width: 260 },
        { title: 'Billed', dataIndex: 'credit', width: 130, align: 'right', render: (v: string) => (toNumber(v) ? <Money value={v} /> : null) },
        { title: 'Paid or deducted', dataIndex: 'debit', width: 140, align: 'right', render: (v: string) => (toNumber(v) ? <Money value={v} /> : null) },
        { title: 'Balance', dataIndex: 'balance', width: 140, align: 'right', render: (v: string) => <Money value={v} /> },
      ]}
    />
  );
}

function Bills({ bills }: { bills: SupplierBillDto[] }) {
  const today = dayjs().format('YYYY-MM-DD');
  return (
    <Table<SupplierBillDto>
      rowKey="id"
      size="small"
      dataSource={bills}
      locale={{ emptyText: 'No bills yet' }}
      scroll={{ x: 960 }}
      pagination={{ pageSize: 25, hideOnSinglePage: true }}
      columns={[
        { title: 'Bill', dataIndex: 'ref', width: 190, render: (v: string) => <span translate="no">{v}</span> },
        { title: 'Site', dataIndex: 'projectName', render: (v: string) => <span translate="no">{v}</span> },
        { title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
        {
          title: 'Due',
          dataIndex: 'dueDate',
          width: 130,
          render: (v: string, b) => (b.status === 'APPROVED' && toNumber(b.due) > 0 && v < today ? <Tag color="error">{formatDate(v)}</Tag> : formatDate(v)),
        },
        { title: 'Worth', dataIndex: 'payable', width: 130, align: 'right', render: (v: string) => <Money value={v} /> },
        { title: 'Paid', dataIndex: 'paid', width: 130, align: 'right', render: (v: string) => <Money value={v} /> },
        { title: 'Still due', dataIndex: 'due', width: 130, align: 'right', render: (v: string, b) => (b.status === 'APPROVED' ? <Money value={v} /> : <Typography.Text type="secondary">Once approved</Typography.Text>) },
        { title: 'State', dataIndex: 'status', width: 110, render: (s: SupplierBillDto['status']) => <Tag color={STATUS_COLORS[s]}>{SUBMISSION_STATUS_LABELS[s]}</Tag> },
      ]}
    />
  );
}

function Payments({ payments }: { payments: SupplierPaymentDto[] }) {
  return (
    <Table<SupplierPaymentDto>
      rowKey="id"
      size="small"
      dataSource={payments}
      locale={{ emptyText: 'No payments yet' }}
      scroll={{ x: 900 }}
      pagination={{ pageSize: 25, hideOnSinglePage: true }}
      columns={[
        { title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
        { title: 'Against', dataIndex: 'against', render: (v: string) => <span translate="no">{v}</span> },
        { title: 'Mode', dataIndex: 'mode', width: 110, render: (m: string) => PAYMENT_MODE_LABELS[m as PaymentMode] ?? m },
        { title: 'Reference', dataIndex: 'reference', width: 160, render: (v: string | null) => <span translate="no">{v ?? '-'}</span> },
        { title: 'Paid', dataIndex: 'amount', width: 130, align: 'right', render: (v: string) => <Money value={v} /> },
        { title: 'TDS', dataIndex: 'tds', width: 110, align: 'right', render: (v: string) => <Money value={v} /> },
        { title: 'Other deduction', dataIndex: 'otherDeduction', width: 140, align: 'right', render: (v: string) => <Money value={v} /> },
      ]}
    />
  );
}
