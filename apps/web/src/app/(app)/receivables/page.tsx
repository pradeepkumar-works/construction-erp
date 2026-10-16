'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Card, Col, Popconfirm, Row, Select, Skeleton, Space, Statistic, Table, Tabs, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientReceivableDto, OpenBillDto, ProjectReceivableDto, ReceiptDto, ReceiptKind, ReceiptSortField } from '@erp/shared';
import { RECEIPT_KINDS, RECEIPT_KIND_LABELS, RECEIPT_MODE_LABELS, canRecordReceipt } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useReceipts, useReceivables } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { OPEN_BILL_EXPORT, RECEIPT_EXPORT, RECEIVABLE_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR, formatINRCompact, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { BillStageTag } from '@/components/bills/billUi';
import { BillDrawer } from '@/components/bills/BillDrawer';
import { ReceiptFormModal } from '@/components/receivables/ReceiptFormModal';
import { InTallyTag } from '@/components/tally/InTallyTag';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor } from '@/lib/theme';

const money = (v: string, strong?: boolean) => (strong ? <strong className="mono">{formatINR(v)}</strong> : <span className="mono">{formatINR(v)}</span>);
const late = (v: string) => (toNumber(v) > 0 ? <span className="mono" style={{ color: themeColor('colorErrorText') }}>{formatINR(v)}</span> : <span className="mono text-muted">-</span>);

/** Ageing columns shared by the project and client tables. */
function ageingColumns<T extends ProjectReceivableDto | ClientReceivableDto>(): NonNullable<TableProps<T>['columns']> {
  return [
    { title: 'Billed', dataIndex: 'billed', width: 130, align: 'right', render: (v) => money(v) },
    { title: 'Received', dataIndex: 'received', width: 130, align: 'right', render: (v) => money(v) },
    { title: 'Deducted', dataIndex: 'deducted', width: 120, align: 'right', render: (v) => money(v) },
    { title: 'Outstanding', dataIndex: 'outstanding', width: 130, align: 'right', render: (v) => money(v, true) },
    { title: '0-30 days', key: 'a0', width: 110, align: 'right', render: (_, r) => money(r.ageing.current) },
    { title: '31-60', key: 'a1', width: 110, align: 'right', render: (_, r) => money(r.ageing.days31to60) },
    { title: '61-90', key: 'a2', width: 110, align: 'right', render: (_, r) => late(r.ageing.days61to90) },
    { title: 'Over 90', key: 'a3', width: 110, align: 'right', render: (_, r) => late(r.ageing.over90) },
    { title: 'Not sent yet', dataIndex: 'notSent', width: 120, align: 'right', render: (v) => money(v) },
    { title: 'Retention held', dataIndex: 'retentionHeld', width: 130, align: 'right', render: (v) => money(v) },
    { title: 'Deposit held', dataIndex: 'depositHeld', width: 120, align: 'right', render: (v) => money(v) },
  ];
}

function ReceiptsTab({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const list = useListState<ReceiptSortField>({ sortBy: 'receiptDate', sortOrder: 'desc' });
  const [kind, setKind] = useState<ReceiptKind | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReceiptDto | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const filters = { ...list.params, projectId, kind };
  const { data, isLoading, isFetching, error, refetch } = useReceipts(filters);
  const accounts = !!user && canRecordReceipt(user.roleKey);
  const sort = (key: ReceiptSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/receipts/${id}`)).data,
    onSuccess: () => {
      message.success('Receipt deleted');
      for (const k of ['receipts', 'receivables', 'bills', 'dashboard', 'cost']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const exportRows = async () => {
    const rows = await fetchAllPages<ReceiptDto>('/receipts', { ...filters });
    downloadXlsx(exportFileName('receipts'), 'Receipts', RECEIPT_EXPORT, rows);
    return rows.length;
  };

  const columns: TableProps<ReceiptDto>['columns'] = [
    { title: 'Date', dataIndex: 'receiptDate', width: 110, ...sort('receiptDate'), render: (v) => formatDate(v) },
    {
      title: 'For',
      ...sort('kind'),
      width: 170,
      render: (_, r) =>
        r.billId ? (
          <Typography.Link onClick={() => setBillId(r.billId)}>{r.billLabel}</Typography.Link>
        ) : (
          <span>{RECEIPT_KIND_LABELS[r.kind]}</span>
        ),
    },
    {
      title: 'Project',
      dataIndex: 'projectName',
      ...sort('project'),
      ellipsis: true,
      render: (v: string, r) => (
        <div>
          <Link href={`/projects/${r.projectId}?tab=bills`}>{v}</Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.clientName ?? ''}
          </div>
        </div>
      ),
    },
    { title: 'Received', dataIndex: 'amount', width: 140, align: 'right', ...sort('amount'), render: (v) => money(v, true) },
    { title: 'Deducted', dataIndex: 'deductedAmount', width: 130, align: 'right', render: (v) => money(v) },
    {
      title: 'Mode / reference',
      key: 'ref',
      width: 260,
      render: (_, r) => (
        <span>
          {RECEIPT_MODE_LABELS[r.mode]}
          {r.reference ? <span className="mono text-muted"> · {r.reference}</span> : null}
        </span>
      ),
    },
    ...(accounts
      ? [
          {
            title: '',
            key: 'actions',
            fixed: 'right' as const,
            width: 140,
            render: (_: unknown, r: ReceiptDto) =>
              r.exportedToTally ? (
                <InTallyTag />
              ) : (
                <Space size={4}>
                  <Button size="small" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                  <Popconfirm title="Delete this receipt?" description={r.billId ? 'The bill goes back to outstanding.' : undefined} onConfirm={() => remove.mutate(r.id)}>
                    <Button size="small" danger>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectId}
        onProject={() => undefined}
        hideProject
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search reference, project, client"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {accounts ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Record money received
              </Button>
            ) : null}
          </>
        }
      >
        <Select<ReceiptKind>
          allowClear
          placeholder="All receipts"
          style={{ width: 200 }}
          value={kind}
          onChange={(v) => {
            setKind(v);
            list.resetPage();
          }}
          options={RECEIPT_KINDS.map((k) => ({ value: k, label: RECEIPT_KIND_LABELS[k] }))}
        />
      </ListToolbar>
      <Table<ReceiptDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<ReceiptDto>(data?.total)}
        scroll={{ x: 1100 }}
        locale={{ emptyText: 'No money received recorded yet' }}
      />
      <ReceiptFormModal
        open={formOpen || !!editing}
        receipt={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <BillDrawer id={billId} open={!!billId} onClose={() => setBillId(null)} />
    </>
  );
}

export default function ReceivablesPage() {
  const [projectId, setProjectId] = useState<string | undefined>();
  const [billId, setBillId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useReceivables(projectId);
  const t = data?.totals;

  const exportProjects = async () => {
    downloadXlsx(exportFileName('receivables'), 'Receivables', RECEIVABLE_EXPORT, data?.projects ?? []);
    return data?.projects.length ?? 0;
  };
  const exportOpen = async () => {
    downloadXlsx(exportFileName('open-bills'), 'Open bills', OPEN_BILL_EXPORT, data?.openBills ?? []);
    return data?.openBills.length ?? 0;
  };

  const openColumns: TableProps<OpenBillDto>['columns'] = [
    {
      title: 'Bill',
      key: 'bill',
      width: 140,
      render: (_, r) => (
        <Typography.Link strong onClick={() => setBillId(r.billId)}>
          {r.billLabel}
        </Typography.Link>
      ),
    },
    {
      title: 'Project',
      dataIndex: 'projectName',
      ellipsis: true,
      render: (v: string, r) => (
        <div>
          <Link href={`/projects/${r.projectId}?tab=bills`}>{v}</Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.clientName ?? ''}
          </div>
        </div>
      ),
    },
    { title: 'Sent', dataIndex: 'sentDate', width: 110, render: (v) => formatDate(v) },
    { title: 'With client', dataIndex: 'stage', width: 120, render: (s) => <BillStageTag stage={s} /> },
    { title: 'Work + GST', dataIndex: 'invoiceAmount', width: 140, align: 'right', render: (v) => money(v) },
    { title: 'Settled', dataIndex: 'settledAmount', width: 130, align: 'right', render: (v) => money(v) },
    { title: 'Outstanding', dataIndex: 'outstanding', width: 140, align: 'right', render: (v) => money(v, true) },
    {
      title: 'Days',
      dataIndex: 'daysOutstanding',
      width: 80,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.daysOutstanding - b.daysOutstanding,
      render: (v: number) => <span style={{ color: v > 90 ? themeColor('colorErrorText') : v > 60 ? themeColor('orange7') : undefined }}>{v}</span>,
    },
  ];

  const projectColumns: TableProps<ProjectReceivableDto>['columns'] = [
    {
      title: 'Project',
      dataIndex: 'projectName',
      fixed: 'left',
      width: 240,
      ellipsis: true,
      render: (v: string, r) => (
        <div>
          <Link href={`/projects/${r.projectId}?tab=bills`}>{v}</Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.clientName ?? ''}
          </div>
        </div>
      ),
    },
    ...ageingColumns<ProjectReceivableDto>(),
    { title: 'Retention due', dataIndex: 'retentionReleaseDate', width: 120, render: (v) => (v ? formatDate(v) : '-') },
  ];
  const clientColumns: TableProps<ClientReceivableDto>['columns'] = [
    { title: 'Client', dataIndex: 'clientName', fixed: 'left', width: 220, ellipsis: true },
    { title: 'Projects', dataIndex: 'projectCount', width: 90, align: 'right' },
    ...ageingColumns<ClientReceivableDto>(),
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Receivables"
        subtitle="What clients owe on the bills sent to them, by age, with the money received, what they deducted, and the retention and deposit they hold."
        extra={<ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} />}
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {t && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Outstanding" value={formatINRCompact(t.outstanding)} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {data.openBills.length} open bill{data.openBills.length === 1 ? '' : 's'} · {formatINR(t.notSent)} approved, not sent
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Over 90 days" value={formatINRCompact(t.ageing.over90)} styles={{ content: { color: toNumber(t.ageing.over90) > 0 ? themeColor('colorErrorText') : undefined } }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                61-90 days: {formatINR(t.ageing.days61to90)}
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Retention + deposit held" value={formatINRCompact(toNumber(t.retentionHeld) + toNumber(t.depositHeld))} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Retention {formatINR(t.retentionHeld)} · deposit {formatINR(t.depositHeld)}
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="TDS deducted" value={formatINRCompact(toNumber(t.tdsDeducted) + toNumber(t.gstTdsDeducted))} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Income tax {formatINR(t.tdsDeducted)} · GST {formatINR(t.gstTdsDeducted)}
              </Typography.Text>
            </Card>
          </Col>
        </Row>
      )}
      <Card size="small">
        <Tabs
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          items={[
            {
              key: 'open',
              label: `Open bills${data ? ` (${data.openBills.length})` : ''}`,
              children: (
                <>
                  <CardToolbar justify="flex-end">
                    <ExportButton onExport={exportOpen} />
                  </CardToolbar>
                  <Table<OpenBillDto> rowKey="billId" size="middle" loading={isLoading} columns={openColumns} dataSource={data?.openBills ?? []} pagination={false} scroll={{ x: 1000 }} locale={{ emptyText: 'Every bill sent has been settled' }} />
                </>
              ),
            },
            {
              key: 'projects',
              label: 'By project',
              children: (
                <>
                  <CardToolbar justify="flex-end">
                    <ExportButton onExport={exportProjects} />
                  </CardToolbar>
                  <Table<ProjectReceivableDto> rowKey="projectId" size="middle" loading={isLoading} columns={projectColumns} dataSource={data?.projects ?? []} pagination={false} scroll={{ x: 1700 }} />
                </>
              ),
            },
            {
              key: 'clients',
              label: 'By client',
              children: <Table<ClientReceivableDto> rowKey="clientName" size="middle" loading={isLoading} columns={clientColumns} dataSource={data?.clients ?? []} pagination={false} scroll={{ x: 1650 }} />,
            },
            { key: 'receipts', label: 'Money received', children: <ReceiptsTab projectId={projectId} /> },
          ]}
        />
      </Card>
      <BillDrawer id={billId} open={!!billId} onClose={() => setBillId(null)} />
    </div>
  );
}
