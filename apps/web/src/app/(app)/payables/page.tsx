'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Card, Col, Popconfirm, Row, Select, Skeleton, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PayableBillDto, PayableTotalsDto, ProjectPayableDto, VendorPayableDto, VendorPaymentDto, VendorPaymentSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, MSME_CATEGORY_LABELS, RECEIPT_MODE_LABELS, canRecordPayment } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePayables, useVendorPayments, useVendors } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PAYABLE_BILL_EXPORT, PAYABLE_VENDOR_EXPORT, VENDOR_PAYMENT_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR, formatINRCompact, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { VendorBillDrawer } from '@/components/purchasing/VendorBillDrawer';
import { SubBillDrawer } from '@/components/subcontracts/SubBillDrawer';
import { PAYMENT_QUERY_KEYS, PaymentFormModal, type PayTarget } from '@/components/payables/PaymentFormModal';
import { InTallyTag } from '@/components/tally/InTallyTag';
import { CardToolbar } from '@/components/common/CardToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { RecordLink } from '@/components/record/RecordLink';
import { themeColor } from '@/lib/theme';

const money = (v: string, strong?: boolean) => (strong ? <strong className="mono">{formatINR(v)}</strong> : <span className="mono">{formatINR(v)}</span>);
const late = (v: string) => (toNumber(v) > 0 ? <span className="mono" style={{ color: themeColor('colorErrorText') }}>{formatINR(v)}</span> : <span className="mono text-muted">-</span>);
const isSmall = (m: string | null) => m === 'MICRO' || m === 'SMALL';

/** When a bill falls due, in words: "in 5 days", "today", "12 days late". */
function DueText({ days }: { days: number }) {
  if (days < 0) return <Typography.Text type="danger">{-days} days late</Typography.Text>;
  if (days === 0) return <Typography.Text type="warning">today</Typography.Text>;
  return <Typography.Text type={days <= 7 ? 'warning' : undefined}>in {days} days</Typography.Text>;
}

function ageingColumns<T extends PayableTotalsDto>(): NonNullable<TableProps<T>['columns']> {
  return [
    { title: 'Billed', dataIndex: 'billed', width: 130, align: 'right', render: (v) => money(v) },
    { title: 'Paid', dataIndex: 'paid', width: 130, align: 'right', render: (v) => money(v) },
    { title: 'Outstanding', dataIndex: 'outstanding', width: 130, align: 'right', render: (v) => money(v, true) },
    { title: 'Not due', key: 'a0', width: 110, align: 'right', render: (_, r) => money(r.ageing.notDue) },
    { title: '1-30 late', key: 'a1', width: 110, align: 'right', render: (_, r) => late(r.ageing.days1to30) },
    { title: '31-60', key: 'a2', width: 110, align: 'right', render: (_, r) => late(r.ageing.days31to60) },
    { title: '61-90', key: 'a3', width: 110, align: 'right', render: (_, r) => late(r.ageing.days61to90) },
    { title: 'Over 90', key: 'a4', width: 110, align: 'right', render: (_, r) => late(r.ageing.over90) },
    { title: 'MSME at risk', dataIndex: 'msmeAtRisk', width: 120, align: 'right', render: (v) => late(v) },
    { title: 'Retention held', dataIndex: 'retentionHeld', width: 130, align: 'right', render: (v) => money(v) },
  ];
}

const NO_KEYS: string[] = [];
const billHref = (r: VendorPaymentDto) => (r.billType === 'VENDOR_BILL' ? `/vendor-bills/${r.vendorBillId}` : `/subcontract-bills/${r.subcontractBillId}`);

function PaymentsTab({ projectId, vendorId, onBill }: { projectId?: string; vendorId?: string; onBill: (b: { billType: PayableBillDto['billType']; billId: string }) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const page = useListPage<VendorPaymentSortField>({ keys: NO_KEYS, sortBy: 'paymentDate', sortOrder: 'desc', sortFields: LIST_SORT_FIELDS.vendorPayments, url: false, scope: `${projectId}:${vendorId}` });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorPaymentDto | null>(null);
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId, vendorId };
  const { data, isLoading, isFetching, error, refetch } = useVendorPayments(filters);
  const rows = data?.items ?? [];
  const accounts = !!user && canRecordPayment(user.roleKey);
  const sort = (key: VendorPaymentSortField) => ({ key, sorter: true, sortOrder: page.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/vendor-payments/${id}`)).data,
    onSuccess: () => {
      message.success('Payment deleted');
      for (const k of PAYMENT_QUERY_KEYS) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const exportRows = async () => {
    const all = await fetchAllPages<VendorPaymentDto>('/vendor-payments', { ...filters });
    downloadXlsx(exportFileName('payments'), 'Payments', VENDOR_PAYMENT_EXPORT, all);
    return all.length;
  };
  const openBill = (r: VendorPaymentDto) => onBill({ billType: r.billType, billId: (r.vendorBillId ?? r.subcontractBillId)! });

  const columns: ListColumn<VendorPaymentDto>[] = [
    { title: 'Date', dataIndex: 'paymentDate', width: 110, ...sort('paymentDate'), render: (v) => formatDate(v) },
    {
      title: 'Paid to',
      locked: true,
      ...sort('vendor'),
      render: (_, r) => (
        <div>
          {r.vendorName}
          <div>
            <RecordLink href={billHref(r)} onOpen={() => openBill(r)} className="mono">
              {r.billLabel}
            </RecordLink>
          </div>
        </div>
      ),
    },
    { title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r) => <Link href={`/projects/${r.projectId}`}>{v}</Link> },
    { title: 'Paid', dataIndex: 'amount', width: 140, align: 'right', ...sort('amount'), render: (v) => money(v, true), total: (all) => formatINR(all.reduce((n, r) => n + toNumber(r.amount), 0)) },
    {
      title: 'Deducted',
      key: 'ded',
      width: 120,
      align: 'right',
      render: (_, r) => money(String(toNumber(r.tdsAmount) + toNumber(r.otherDeduction))),
      total: (all) => formatINR(all.reduce((n, r) => n + toNumber(r.tdsAmount) + toNumber(r.otherDeduction), 0)),
    },
    {
      title: 'Mode / reference',
      label: 'Mode and reference',
      key: 'ref',
      width: 240,
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
            render: (_: unknown, r: VendorPaymentDto) =>
              r.exportedToTally ? (
                <InTallyTag />
              ) : (
                <Space size={4}>
                  <Button size="small" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                  <Popconfirm title="Delete this payment?" description="The bill goes back to outstanding." onConfirm={() => remove.mutate(r.id)}>
                    <Button size="small" danger>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              ),
          } satisfies ListColumn<VendorPaymentDto>,
        ]
      : []),
  ];
  const choice = useColumnChoice('payables-payments', columns);

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectId}
        onProject={() => undefined}
        hideProject
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search reference, vendor, bill, project"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {accounts ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Record a payment
              </Button>
            ) : null}
          </>
        }
      />
      <DataTable<VendorPaymentDto>
        columns={columns}
        visible={choice.visible}
        onChooseColumns={choice.setChosen}
        chosenIsDefault={choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<VendorPaymentDto>(data?.total)}
        onOpen={(id) => {
          const r = rows.find((x) => x.id === id);
          if (r) openBill(r);
        }}
        bulk={[exportSelected<VendorPaymentDto>('payments', 'Payments', VENDOR_PAYMENT_EXPORT)]}
        scrollX={1100}
        emptyText={<EmptyArt art="entries" title={page.params.q ? 'No payment matches this search' : 'No payments recorded yet'} />}
      />
      <PaymentFormModal
        open={formOpen || !!editing}
        payment={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}

export default function PayablesPage() {
  const { user } = useAuth();
  const [projectId, setProjectId] = useProjectScope();
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [bill, setBill] = useState<{ billType: PayableBillDto['billType']; billId: string } | null>(null);
  const [paying, setPaying] = useState<PayTarget | null>(null);
  const { data, isLoading, error, refetch } = usePayables({ projectId, vendorId });
  const { data: vendors } = useVendors();
  const accounts = !!user && canRecordPayment(user.roleKey);
  const t = data?.totals;

  const openColumns: TableProps<PayableBillDto>['columns'] = [
    {
      title: 'Bill',
      key: 'bill',
      width: 190,
      render: (_, r) => (
        <div>
          <Typography.Link strong onClick={() => setBill(r)} className="mono">
            {r.billLabel}
          </Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.billType === 'VENDOR_BILL' ? 'Vendor bill' : 'Subcontractor bill'} · {formatDate(r.billDate)}
          </div>
        </div>
      ),
    },
    {
      title: 'Vendor',
      key: 'vendor',
      render: (_, r) => (
        <div>
          {r.vendorName}
          {isSmall(r.vendorMsme) && (
            <Tag color={r.msmeFlag ? 'red' : 'orange'} style={{ marginLeft: 6 }}>
              {MSME_CATEGORY_LABELS[r.vendorMsme!]}
            </Tag>
          )}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.projectCode} · {r.projectName}
          </div>
        </div>
      ),
    },
    { title: 'Payable', dataIndex: 'payable', width: 130, align: 'right', render: (v) => money(v) },
    { title: 'Paid', dataIndex: 'paid', width: 120, align: 'right', render: (v) => money(v) },
    { title: 'Outstanding', dataIndex: 'outstanding', width: 140, align: 'right', render: (v) => money(v, true) },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      width: 140,
      render: (v, r) => (
        <div>
          {formatDate(v)}
          <div style={{ fontSize: 12 }}>
            <DueText days={r.daysToDue} />
          </div>
        </div>
      ),
    },
    ...(accounts
      ? [
          {
            title: '',
            key: 'pay',
            fixed: 'right' as const,
            width: 90,
            render: (_: unknown, r: PayableBillDto) => (
              <Button size="small" type={r.daysToDue <= 7 ? 'primary' : 'default'} onClick={() => setPaying(r)}>
                Pay
              </Button>
            ),
          },
        ]
      : []),
  ];

  const vendorColumns: TableProps<VendorPayableDto>['columns'] = [
    {
      title: 'Vendor',
      dataIndex: 'vendorName',
      fixed: 'left',
      width: 240,
      ellipsis: true,
      render: (v: string, r) => (
        <span>
          {v}
          {isSmall(r.vendorMsme) && (
            <Tag color="orange" style={{ marginLeft: 6 }}>
              {MSME_CATEGORY_LABELS[r.vendorMsme!]}
            </Tag>
          )}
        </span>
      ),
    },
    { title: 'Open bills', dataIndex: 'openBills', width: 100, align: 'right' },
    ...ageingColumns<VendorPayableDto>(),
  ];
  const projectColumns: TableProps<ProjectPayableDto>['columns'] = [
    { title: 'Project', dataIndex: 'projectName', fixed: 'left', width: 240, ellipsis: true, render: (v: string, r) => <Link href={`/projects/${r.projectId}`}>{v}</Link> },
    ...ageingColumns<ProjectPayableDto>(),
  ];

  const toolbar = (onExport: () => Promise<number>) => (
    <CardToolbar justify="flex-end">
      <ExportButton onExport={onExport} />
    </CardToolbar>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Payables"
        subtitle="What is owed to vendors and subcontractors on their approved bills, by due date, with micro and small enterprises flagged before their 45 days run out."
        extra={
          <Space wrap>
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Any vendor"
              style={{ width: 220 }}
              value={vendorId}
              onChange={setVendorId}
              options={(vendors ?? []).map((v) => ({ value: v.id, label: v.name }))}
            />
            <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} />
          </Space>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {t && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Outstanding" value={formatINRCompact(t.outstanding)} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {data.openBills.length} open bill{data.openBills.length === 1 ? '' : 's'} · paid so far {formatINR(t.paid)}
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Overdue" value={formatINRCompact(t.overdue)} styles={{ content: { color: toNumber(t.overdue) > 0 ? themeColor('colorErrorText') : undefined } }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Due in the next 7 days: {formatINR(t.dueSoon)}
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="MSME at risk" value={formatINRCompact(t.msmeAtRisk)} styles={{ content: { color: toNumber(t.msmeAtRisk) > 0 ? themeColor('colorErrorText') : undefined } }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Micro and small enterprises due within 7 days or late
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Retention held" value={formatINRCompact(t.retentionHeld)} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                TDS deducted {formatINR(t.tdsDeducted)}
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
              key: 'due',
              label: `Due list${data ? ` (${data.openBills.length})` : ''}`,
              children: (
                <>
                  {toolbar(async () => {
                    downloadXlsx(exportFileName('due-list'), 'Due list', PAYABLE_BILL_EXPORT, data?.openBills ?? []);
                    return data?.openBills.length ?? 0;
                  })}
                  <Table<PayableBillDto>
                    rowKey={(r) => `${r.billType}-${r.billId}`}
                    size="middle"
                    loading={isLoading}
                    columns={openColumns}
                    dataSource={data?.openBills ?? []}
                    pagination={{ pageSize: 50, hideOnSinglePage: true }}
                    scroll={{ x: 1050 }}
                    locale={{ emptyText: 'Every approved bill is paid' }}
                  />
                </>
              ),
            },
            {
              key: 'vendors',
              label: 'By vendor',
              children: (
                <>
                  {toolbar(async () => {
                    downloadXlsx(exportFileName('payables-by-vendor'), 'Payables by vendor', PAYABLE_VENDOR_EXPORT, data?.vendors ?? []);
                    return data?.vendors.length ?? 0;
                  })}
                  <Table<VendorPayableDto> rowKey="vendorId" size="middle" loading={isLoading} columns={vendorColumns} dataSource={data?.vendors ?? []} pagination={false} scroll={{ x: 1650 }} />
                </>
              ),
            },
            {
              key: 'projects',
              label: 'By project',
              children: <Table<ProjectPayableDto> rowKey="projectId" size="middle" loading={isLoading} columns={projectColumns} dataSource={data?.projects ?? []} pagination={false} scroll={{ x: 1550 }} />,
            },
            { key: 'payments', label: 'Payments', children: <PaymentsTab projectId={projectId} vendorId={vendorId} onBill={setBill} /> },
          ]}
        />
      </Card>
      <VendorBillDrawer id={bill?.billType === 'VENDOR_BILL' ? bill.billId : null} open={bill?.billType === 'VENDOR_BILL'} onClose={() => setBill(null)} />
      <SubBillDrawer id={bill?.billType === 'SUBCONTRACT_BILL' ? bill.billId : null} open={bill?.billType === 'SUBCONTRACT_BILL'} onClose={() => setBill(null)} />
      <PaymentFormModal open={!!paying} bill={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
