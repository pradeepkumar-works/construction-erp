'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Card, Col, Popconfirm, Row, Select, Skeleton, Space, Statistic, Table, Tabs, Typography, theme } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientReceivableDto, OpenBillDto, ProjectReceivableDto, ReceiptDto, ReceiptKind, ReceiptSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, RECEIPT_KINDS, RECEIPT_KIND_LABELS, RECEIPT_MODE_LABELS, canRecordReceipt } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { api, errorMessage, errorStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useReceipts, useReceivables } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
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
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { RecordLink } from '@/components/record/RecordLink';
import { themeColor, themeFontSize } from '@/lib/theme';

const money = (v: string, strong?: boolean) => (strong ? <strong className="mono">{formatINR(v)}</strong> : <span className="mono">{formatINR(v)}</span>);
function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}
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

const RECEIPT_KEYS = ['kind'] as const;

function ReceiptsTab({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const page = useListPage<ReceiptSortField>({ keys: RECEIPT_KEYS, sortBy: 'receiptDate', sortOrder: 'desc', sortFields: LIST_SORT_FIELDS.receipts, url: false, scope: projectId });
  const kind = page.filters.kind as ReceiptKind | undefined;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReceiptDto | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId, kind };
  const { data, isLoading, isFetching, error, refetch } = useReceipts(filters);
  const rows = data?.items ?? [];
  const accounts = !!user && canRecordReceipt(user.roleKey);
  const sort = (key: ReceiptSortField) => ({ key, sorter: true, sortOrder: page.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/receipts/${id}`)).data,
    onSuccess: () => {
      message.success('Receipt deleted');
      for (const k of ['receipts', 'receivables', 'bills', 'dashboard', 'cost']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const exportRows = async () => {
    const all = await fetchAllPages<ReceiptDto>('/receipts', { ...filters });
    await downloadXlsx(exportFileName('receipts'), 'Receipts', RECEIPT_EXPORT, all);
    return all.length;
  };

  const columns: ListColumn<ReceiptDto>[] = [
    { title: 'Date', dataIndex: 'receiptDate', width: 110, ...sort('receiptDate'), render: (v) => formatDate(v) },
    {
      title: 'For',
      locked: true,
      ...sort('kind'),
      width: 170,
      render: (_, r) =>
        r.billId ? (
          <RecordLink href={`/bills/${r.billId}`} onOpen={() => setBillId(r.billId)}>
            {r.billLabel}
          </RecordLink>
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
          <Sub>{r.clientName ?? ''}</Sub>
        </div>
      ),
    },
    { title: 'Received', dataIndex: 'amount', width: 140, align: 'right', ...sort('amount'), render: (v) => money(v, true), total: (all) => formatINR(all.reduce((n, r) => n + toNumber(r.amount), 0)) },
    { key: 'deductedAmount', title: 'Deducted', dataIndex: 'deductedAmount', width: 130, align: 'right', render: (v) => money(v), total: (all) => formatINR(all.reduce((n, r) => n + toNumber(r.deductedAmount), 0)) },
    {
      title: 'Mode / reference',
      label: 'Mode and reference',
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
            label: 'Actions',
            locked: true,
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
          } satisfies ListColumn<ReceiptDto>,
        ]
      : []),
  ];
  const choice = useColumnChoice('receivables-receipts', columns);

  const newButton = accounts ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Record money received
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectId}
        onProject={() => undefined}
        hideProject
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search reference, project, client"
        searchLabel="Search receipts"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <Select<ReceiptKind>
          allowClear
          placeholder="All receipts"
          aria-label="Receipt for"
          style={{ width: 200 }}
          value={kind}
          onChange={(v) => page.setFilter('kind', v)}
          options={RECEIPT_KINDS.map((k) => ({ value: k, label: RECEIPT_KIND_LABELS[k] }))}
        />
      </ListToolbar>
      <DataTable<ReceiptDto>
        columns={columns}
        visible={choice.visible}
        onChooseColumns={choice.setChosen}
        chosenIsDefault={choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<ReceiptDto>(data?.total)}
        onOpen={(id) => {
          const r = rows.find((x) => x.id === id);
          if (r?.billId) setBillId(r.billId);
          else if (r && accounts && !r.exportedToTally) setEditing(r);
        }}
        bulk={[exportSelected<ReceiptDto>('receipts', 'Receipts', RECEIPT_EXPORT)]}
        scrollX={1100}
        emptyText={<EmptyArt art="entries" title={kind || page.params.q ? 'No receipt matches these filters' : 'No money received recorded yet'} />}
        emptyAction={newButton}
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
  const [projectId, setProjectId] = useProjectScope();
  const [billId, setBillId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useReceivables(projectId);
  const t = data?.totals;

  const exportProjects = async () => {
    await downloadXlsx(exportFileName('receivables'), 'Receivables', RECEIVABLE_EXPORT, data?.projects ?? []);
    return data?.projects.length ?? 0;
  };
  const exportOpen = async () => {
    await downloadXlsx(exportFileName('open-bills'), 'Open bills', OPEN_BILL_EXPORT, data?.openBills ?? []);
    return data?.openBills.length ?? 0;
  };

  const openColumns: TableProps<OpenBillDto>['columns'] = [
    {
      title: 'Bill',
      key: 'bill',
      width: 140,
      render: (_, r) => (
        <RecordLink href={`/bills/${r.billId}`} onOpen={() => setBillId(r.billId)} strong>
          {r.billLabel}
        </RecordLink>
      ),
    },
    {
      title: 'Project',
      dataIndex: 'projectName',
      ellipsis: true,
      render: (v: string, r) => (
        <div>
          <Link href={`/projects/${r.projectId}?tab=bills`}>{v}</Link>
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
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
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
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

  // A role that may not see this gets the reason alone, not empty tabs under it.
  if (errorStatus(error) === 403) {
    return (
      <div className="page-container">
        <PageHeader title="Receivables" />
        <QueryError error={error} />
      </div>
    );
  }

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
              <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {data.openBills.length} open bill{data.openBills.length === 1 ? '' : 's'} · {formatINR(t.notSent)} approved, not sent
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Over 90 days" value={formatINRCompact(t.ageing.over90)} styles={{ content: { color: toNumber(t.ageing.over90) > 0 ? themeColor('colorErrorText') : undefined } }} />
              <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                61-90 days: {formatINR(t.ageing.days61to90)}
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Retention + deposit held" value={formatINRCompact(toNumber(t.retentionHeld) + toNumber(t.depositHeld))} />
              <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                Retention {formatINR(t.retentionHeld)} · deposit {formatINR(t.depositHeld)}
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="TDS deducted" value={formatINRCompact(toNumber(t.tdsDeducted) + toNumber(t.gstTdsDeducted))} />
              <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
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
