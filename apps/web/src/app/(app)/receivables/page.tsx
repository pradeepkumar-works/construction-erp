'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Col, Row, Select, Space, Statistic, Typography, theme } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { PlusOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientReceivableDto, OpenBillDto, ProjectReceivableDto, ReceiptDto, ReceiptKind, ReceiptSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, RECEIPT_KINDS, RECEIPT_KIND_LABELS, RECEIPT_MODE_LABELS, canRecordReceipt } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { api, errorStatus } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useReceipts, useReceivables } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { useUrlTab } from '@/lib/url-state';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { OPEN_BILL_EXPORT, RECEIPT_EXPORT, RECEIVABLE_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR, formatINRCompact, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
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
import { LocalDataTable } from '@/components/list/LocalDataTable';
import { exportSelected } from '@/components/list/bulk';
import { RecordLink } from '@/components/record/RecordLink';
import { themeColor, themeFontSize } from '@/lib/theme';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

const money = (v: string, strong?: boolean) => (strong ? <strong className="mono" translate="no">{formatINR(v)}</strong> : <span className="mono" translate="no">{formatINR(v)}</span>);
function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}
const late = (v: string) => (toNumber(v) > 0 ? <span className="mono" translate="no" style={{ color: themeColor('colorErrorText') }}>{formatINR(v)}</span> : <span className="mono text-muted" translate="no">-</span>);

/** Ageing columns shared by the project and client tables (keys are stable: the column chooser keeps them). */
function ageingColumns<T extends ProjectReceivableDto | ClientReceivableDto>(): ListColumn<T>[] {
  return [
    { key: 'billed', title: 'Billed', dataIndex: 'billed', width: 130, align: 'right', render: (v) => money(v) },
    { key: 'received', title: 'Received', dataIndex: 'received', width: 130, align: 'right', render: (v) => money(v) },
    { key: 'deducted', title: 'Deducted', dataIndex: 'deducted', width: 120, align: 'right', render: (v) => money(v) },
    { key: 'outstanding', card: 'amount', title: 'Outstanding', dataIndex: 'outstanding', width: 130, align: 'right', render: (v) => money(v, true) },
    { key: 'a0', title: '0-30 days', width: 110, align: 'right', render: (_, r) => money(r.ageing.current) },
    { key: 'a1', title: '31-60', label: '31-60 days', width: 110, align: 'right', render: (_, r) => money(r.ageing.days31to60) },
    { key: 'a2', title: '61-90', label: '61-90 days', width: 110, align: 'right', render: (_, r) => late(r.ageing.days61to90) },
    { key: 'a3', title: 'Over 90', label: 'Over 90 days', width: 110, align: 'right', render: (_, r) => late(r.ageing.over90) },
    { key: 'notSent', title: 'Not sent yet', dataIndex: 'notSent', width: 120, align: 'right', render: (v) => money(v) },
    { key: 'retentionHeld', title: 'Retention held', dataIndex: 'retentionHeld', width: 130, align: 'right', render: (v) => money(v) },
    { key: 'depositHeld', title: 'Deposit held', dataIndex: 'depositHeld', width: 120, align: 'right', render: (v) => money(v) },
  ];
}

/** Rows of a list worked out in the browser, with the `id` the list template keys them by. */
type Keyed<T> = T & { id: string };
const NO_KEYS: string[] = [];
const TAB_KEYS = ['open', 'projects', 'clients', 'receipts'] as const;
type ReceivablesTab = (typeof TAB_KEYS)[number];
const sumMoney = (values: string[]) => formatINR(values.reduce((n, v) => n + toNumber(v), 0));

const RECEIPT_KEYS = ['kind'] as const;

function ReceiptsTab({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
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
      for (const k of ['receipts', 'receivables', 'bills', 'dashboard', 'cost']) qc.invalidateQueries({ queryKey: [k] });
    },
    meta: FAIL_NOTICE,
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
          {r.reference ? <span className="mono text-muted" translate="no"> · {r.reference}</span> : null}
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
                  <ConfirmDelete what={`the receipt of ${formatINR(r.amount)}${r.clientName ? ` from ${r.clientName}` : ''}`} notice="Receipt deleted" description={r.billId ? 'The bill goes back to outstanding.' : undefined} onConfirm={() => remove.mutateAsync(r.id)}>
                    <Button size="small" danger>
                      Delete
                    </Button>
                  </ConfirmDelete>
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
  // The open bills are the page's own list: their search goes in the address bar (UX item 84), as does the tab.
  const page = useListPage<'daysOutstanding'>({ keys: NO_KEYS, sortBy: 'daysOutstanding', sortOrder: 'desc', sortFields: ['daysOutstanding'], scope: projectId });
  const [tab, setTab] = useUrlTab<ReceivablesTab>(TAB_KEYS, 'open', { param: 'tab' });
  const [billId, setBillId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useReceivables(projectId);
  const t = data?.totals;
  const q = page.params.q?.toLowerCase();
  // Longest outstanding first, unless the Days arrow says otherwise.
  const longestFirst = page.params.sortOrder === 'desc';
  const openBills = useMemo<Keyed<OpenBillDto>[]>(
    () =>
      (data?.openBills ?? [])
        .filter((r) => !q || `${r.billLabel} ${r.projectName} ${r.clientName ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => (longestFirst ? b.daysOutstanding - a.daysOutstanding : a.daysOutstanding - b.daysOutstanding))
        .map((r) => ({ ...r, id: r.billId })),
    [data, q, longestFirst],
  );
  const projects = useMemo<Keyed<ProjectReceivableDto>[]>(() => (data?.projects ?? []).map((r) => ({ ...r, id: r.projectId })), [data]);
  const clients = useMemo<Keyed<ClientReceivableDto>[]>(() => (data?.clients ?? []).map((r) => ({ ...r, id: r.clientName })), [data]);
  const failed = !!error;

  const exportProjects = async () => {
    await downloadXlsx(exportFileName('receivables'), 'Receivables', RECEIVABLE_EXPORT, data?.projects ?? []);
    return data?.projects.length ?? 0;
  };
  const exportOpen = async () => {
    await downloadXlsx(exportFileName('open-bills'), 'Open bills', OPEN_BILL_EXPORT, openBills);
    return openBills.length;
  };

  const openColumns: ListColumn<Keyed<OpenBillDto>>[] = [
    {
      key: 'bill',
      title: 'Bill',
      locked: true,
      card: 'title',
      cardText: (r) => r.billLabel,
      width: 140,
      render: (_, r) => (
        <RecordLink href={`/bills/${r.billId}`} onOpen={() => setBillId(r.billId)} strong>
          {r.billLabel}
        </RecordLink>
      ),
    },
    {
      key: 'projectName',
      title: 'Project',
      dataIndex: 'projectName',
      card: 'meta',
      cardText: (r) => [r.projectName, r.clientName].filter(Boolean).join(' · '),
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
    { key: 'sentDate', title: 'Sent', dataIndex: 'sentDate', width: 110, card: 'date', render: (v) => formatDate(v) },
    { key: 'stage', title: 'With client', dataIndex: 'stage', width: 120, card: 'status', render: (s) => <BillStageTag stage={s} /> },
    { key: 'invoiceAmount', title: 'Work + GST', dataIndex: 'invoiceAmount', width: 140, align: 'right', render: (v) => money(v), total: (rows) => sumMoney(rows.map((r) => r.invoiceAmount)) },
    { key: 'settledAmount', title: 'Settled', dataIndex: 'settledAmount', width: 130, align: 'right', render: (v) => money(v), total: (rows) => sumMoney(rows.map((r) => r.settledAmount)) },
    { key: 'outstanding', title: 'Outstanding', dataIndex: 'outstanding', width: 140, align: 'right', card: 'amount', render: (v) => money(v, true), total: (rows) => sumMoney(rows.map((r) => r.outstanding)) },
    {
      key: 'daysOutstanding',
      title: 'Days',
      label: 'Days outstanding',
      dataIndex: 'daysOutstanding',
      width: 80,
      align: 'right',
      sorter: true,
      sortOrder: page.sortOrderFor('daysOutstanding'),
      sortDirections: ['descend', 'ascend'],
      render: (v: number) => <span style={{ color: v > 90 ? themeColor('colorErrorText') : v > 60 ? themeColor('orange7') : undefined }}>{v}</span>,
    },
  ];
  const openChoice = useColumnChoice('receivables-open', openColumns);

  const projectColumns: ListColumn<Keyed<ProjectReceivableDto>>[] = [
    {
      key: 'projectName',
      title: 'Project',
      dataIndex: 'projectName',
      locked: true,
      card: 'title',
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
    ...ageingColumns<Keyed<ProjectReceivableDto>>(),
    { key: 'retentionReleaseDate', title: 'Retention due', dataIndex: 'retentionReleaseDate', width: 120, card: 'date', render: (v) => (v ? formatDate(v) : '-') },
  ];
  const clientColumns: ListColumn<Keyed<ClientReceivableDto>>[] = [
    { key: 'clientName', title: 'Client', dataIndex: 'clientName', locked: true, card: 'title', fixed: 'left', width: 220, ellipsis: true },
    { key: 'projectCount', title: 'Projects', dataIndex: 'projectCount', width: 90, align: 'right', card: 'meta', cardText: (r) => `${r.projectCount} project${r.projectCount === 1 ? '' : 's'}` },
    ...ageingColumns<Keyed<ClientReceivableDto>>(),
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
      {isLoading && <PageSkeleton shape="workspace" header={false} />}
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
      {isLoading ? null : (
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => setTab(k as ReceivablesTab)}
          variant="page"
          items={[
            {
              key: 'open',
              label: 'Open bills',
              count: data?.openBills.length,
              countLabel: 'bills',
              children: (
                <>
                  <ListToolbar
                    projectId={projectId}
                    onProject={setProjectId}
                    hideProject
                    search={page.search}
                    onSearch={page.setSearch}
                    searchPlaceholder="Search bill, project, client"
                    searchLabel="Search open bills"
                    extra={<ExportButton onExport={exportOpen} />}
                  />
                  <DataTable<Keyed<OpenBillDto>>
                    columns={openColumns}
                    visible={openChoice.visible}
                    onChooseColumns={openChoice.setChosen}
                    chosenIsDefault={openChoice.isDefault}
                    rows={openBills}
                    loading={isLoading}
                    failed={failed}
                    table={page.tableProps<Keyed<OpenBillDto>>(openBills.length)}
                    onOpen={setBillId}
                    bulk={[exportSelected<Keyed<OpenBillDto>, OpenBillDto>('open-bills', 'Open bills', OPEN_BILL_EXPORT)]}
                    scrollX={1000}
                    empty={{ filtered: !!page.params.q, clear: () => page.clear() }}
                    emptyText={<EmptyArt art="entries" title={page.params.q ? 'No open bill matches this search' : 'Every bill sent has been settled'} />}
                  />
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
                  <LocalDataTable<Keyed<ProjectReceivableDto>>
                    list="receivables-projects"
                    columns={projectColumns}
                    rows={projects}
                    loading={isLoading}
                    failed={failed}
                    bulk={[exportSelected<Keyed<ProjectReceivableDto>, ProjectReceivableDto>('receivables', 'Receivables', RECEIVABLE_EXPORT)]}
                    scrollX={1700}
                    emptyText="No client owes anything on any project"
                  />
                </>
              ),
            },
            {
              key: 'clients',
              label: 'By client',
              children: <LocalDataTable<Keyed<ClientReceivableDto>> list="receivables-clients" columns={clientColumns} rows={clients} loading={isLoading} failed={failed} scrollX={1650} emptyText="No client owes anything" />,
            },
            { key: 'receipts', label: 'Money received', children: <ReceiptsTab projectId={projectId} /> },
          ]}
        />
      </Card>
      )}
      <BillDrawer id={billId} open={!!billId} onClose={() => setBillId(null)} />
    </div>
  );
}
