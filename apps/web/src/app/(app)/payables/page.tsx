'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Col, Row, Space, Statistic, Typography } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import { AppTabs } from '@/components/common/AppTabs';
import { PlusOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PayableBillDto, PayableTotalsDto, ProjectPayableDto, VendorPayableDto, VendorPaymentDto, VendorPaymentSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, MSME_CATEGORY_LABELS, RECEIPT_MODE_LABELS, SUBMISSION_STATUS_LABELS, canRecordPayment, canRequestPayment, canViewDebitNotes, canViewPaymentRequests, canViewPayables } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { api, errorStatus } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { usePayables, useVendorPayments } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { useUrlTab } from '@/lib/url-state';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PAYABLE_BILL_EXPORT, PAYABLE_VENDOR_EXPORT, VENDOR_PAYMENT_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR, formatINRCompact, toNumber, NO_VALUE } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { VendorBillDrawer } from '@/components/purchasing/VendorBillDrawer';
import { SubBillDrawer } from '@/components/subcontracts/SubBillDrawer';
import { PAYMENT_QUERY_KEYS, PaymentFormModal, type PayTarget } from '@/components/payables/PaymentFormModal';
import { PaymentRequestFormModal, type RequestFor } from '@/components/payables/PaymentRequestFormModal';
import { PaymentRequestDrawer } from '@/components/payables/PaymentRequestRecord';
import { PaymentRequestList } from '@/components/payables/PaymentRequestList';
import { DebitNotesTab } from '@/components/payables/DebitNotesTab';
import { InTallyTag } from '@/components/tally/InTallyTag';
import { CardToolbar } from '@/components/common/CardToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import { DueCell } from '@/components/list/DueCell';
import { exportSelected } from '@/components/list/bulk';
import { RecordLink } from '@/components/record/RecordLink';
import { VendorSelect } from '@/components/common/SearchSelect';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { MoreActions } from '@/components/record/MoreActions';

/** An overdue amount: shown in red, and the dash where nothing is late. */
const lateOnly = (v: string) => (toNumber(v) > 0 ? v : null);
const danger = () => 'danger' as const;
const sumMoney = (values: string[]) => formatINR(values.reduce((n, v) => n + toNumber(v), 0));
const isSmall = (m: string | null) => m === 'MICRO' || m === 'SMALL';

/** The ageing columns of the by-vendor and by-project tables (keys are stable: the column chooser keeps them). */
function ageingColumns<T extends PayableTotalsDto>(): ListColumn<T>[] {
  return [
    { key: 'billed', title: 'Billed', dataIndex: 'billed', defaultHidden: true, width: 130, kind: 'money' },
    { key: 'paid', title: 'Paid', dataIndex: 'paid', defaultHidden: true, width: 130, kind: 'money' },
    { key: 'outstanding', card: 'amount', title: 'Outstanding', dataIndex: 'outstanding', width: 130, kind: 'money', strong: true },
    { key: 'a0', title: 'Not due', defaultFrom: 1440, width: 110, kind: 'money', value: (r) => r.ageing.notDue },
    { key: 'a1', title: '1-30 late', width: 110, kind: 'money', value: (r) => lateOnly(r.ageing.days1to30), tone: danger },
    { key: 'a2', title: '31-60', label: '31-60 days late', width: 110, kind: 'money', value: (r) => lateOnly(r.ageing.days31to60), tone: danger },
    { key: 'a3', title: '61-90', label: '61-90 days late', width: 110, kind: 'money', value: (r) => lateOnly(r.ageing.days61to90), tone: danger },
    { key: 'a4', title: 'Over 90', label: 'Over 90 days late', width: 110, kind: 'money', value: (r) => lateOnly(r.ageing.over90), tone: danger },
    { key: 'msmeAtRisk', title: 'MSME at risk', dataIndex: 'msmeAtRisk', width: 120, kind: 'money', value: (r) => lateOnly(r.msmeAtRisk), tone: danger },
    { key: 'retentionHeld', title: 'Retention held', defaultFrom: 1600, dataIndex: 'retentionHeld', width: 130, kind: 'money' },
    { key: 'advanceOutstanding', title: 'Advance not adjusted', label: 'Advance paid, not yet adjusted on bills', dataIndex: 'advanceOutstanding', defaultHidden: true, width: 150, kind: 'money' },
  ];
}

/** Rows of a list worked out in the browser, with the `id` the list template keys them by. */
type Keyed<T> = T & { id: string };
const PAGE_KEYS = ['vendorId'] as const;
const TAB_KEYS = ['due', 'requests', 'vendors', 'projects', 'payments', 'debit-notes'] as const;
type PayablesTab = (typeof TAB_KEYS)[number];

const NO_KEYS: string[] = [];
const billHref = (r: VendorPaymentDto) => {
  if (r.billType === 'VENDOR_BILL') return `/vendor-bills/${r.vendorBillId}`;
  if (r.billType === 'SUBCONTRACT_BILL') return `/subcontract-bills/${r.subcontractBillId}`;
  // An advance has no bill: it leads to the request it was paid on.
  return r.paymentRequestId ? `/payment-requests/${r.paymentRequestId}` : r.purchaseOrderId ? `/purchase-orders/${r.purchaseOrderId}` : `/work-orders/${r.workOrderId}`;
};

function PaymentsTab({ projectId, vendorId, onBill }: { projectId?: string; vendorId?: string; onBill: (b: { billType: PayableBillDto['billType']; billId: string }) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const page = useListPage<VendorPaymentSortField>({ keys: NO_KEYS, sortBy: 'paymentDate', sortOrder: 'desc', sortFields: LIST_SORT_FIELDS.vendorPayments, url: false, scope: `${projectId}:${vendorId}` });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorPaymentDto | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const [request, setRequest] = useState<string | null>(null);
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId, vendorId };
  const { data, isLoading, isFetching, error, refetch } = useVendorPayments(filters);
  const rows = data?.items ?? [];
  const accounts = !!user && canRecordPayment(user.roleKey);
  const sort = (key: VendorPaymentSortField) => ({ key, sorter: true, sortOrder: page.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/vendor-payments/${id}`)).data,
    onSuccess: () => {
      for (const k of PAYMENT_QUERY_KEYS) qc.invalidateQueries({ queryKey: [k] });
    },
    meta: FAIL_NOTICE,
  });
  const exportRows = async () => {
    const all = await fetchAllPages<VendorPaymentDto>('/vendor-payments', { ...filters });
    await downloadXlsx(exportFileName('payments'), 'Payments', VENDOR_PAYMENT_EXPORT, all);
    return all.length;
  };
  const openBill = (r: VendorPaymentDto) => (r.billType ? onBill({ billType: r.billType, billId: (r.vendorBillId ?? r.subcontractBillId)! }) : r.paymentRequestId ? setRequest(r.paymentRequestId) : undefined);

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
    { title: 'Paid', dataIndex: 'amount', width: 140, kind: 'money', strong: true, ...sort('amount'), total: (all) => formatINR(all.reduce((n, r) => n + toNumber(r.amount), 0)) },
    {
      title: 'Deducted',
      key: 'ded',
      width: 120,
      kind: 'money',
      value: (r) => toNumber(r.tdsAmount) + toNumber(r.otherDeduction),
      total: (all) => formatINR(all.reduce((n, r) => n + toNumber(r.tdsAmount) + toNumber(r.otherDeduction), 0)),
    },
    {
      title: 'TDS',
      label: 'TDS section and challan',
      key: 'tds',
      width: 200,
      defaultFrom: 1440,
      render: (_, r) =>
        r.tds ? (
          <span>
            <span translate="no">{r.tds.sectionName}</span>
            {r.tds.rate ? <span className="text-muted"> at {Number(r.tds.rate)}%</span> : null}
            <span className="text-muted" style={{ display: 'block', fontSize: tk.type.caption.fontSize }}>
              {r.tds.challanId ? (
                <Link href={`/tds/challans/${r.tds.challanId}`} className="mono" translate="no">
                  {r.tds.challanLabel}
                </Link>
              ) : (
                'Not deposited'
              )}
            </span>
          </span>
        ) : (
          NO_VALUE
        ),
    },
    {
      title: 'Mode / reference',
      label: 'Mode and reference',
      key: 'ref',
      width: 240,
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
            width: 100,
            render: (_: unknown, r: VendorPaymentDto) =>
              r.exportedToTally ? (
                <InTallyTag />
              ) : (
                <MoreActions inRow
                  label={`Actions for the payment of ${formatINR(r.amount)} to ${r.vendorName}`}
                  items={[
                    { key: 'edit', label: 'Edit', onSelect: () => setEditing(r) },
                    {
                      key: 'delete',
                      label: 'Delete',
                      danger: true,
                      onSelect: () =>
                        askDelete({ what: `the payment of ${formatINR(r.amount)} to ${r.vendorName}`, notice: 'Payment deleted', description: 'The bill goes back to outstanding.', onConfirm: () => remove.mutateAsync(r.id) }),
                    },
                  ]}
                />
              ),
          } satisfies ListColumn<VendorPaymentDto>,
        ]
      : []),
  ];
  const choice = useColumnChoice('payables-payments', columns);

  const newButton = accounts ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Record payment
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
        searchPlaceholder="Search reference, vendor, bill, project"
        searchLabel="Search payments"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
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
        emptyText={<EmptyArt art="entries" title={page.params.q ? 'No payment matches this search' : 'No payments recorded yet'} />}
        emptyAction={newButton}
      />
      {deleteDialog}
      <PaymentFormModal
        open={formOpen || !!editing}
        payment={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <PaymentRequestDrawer id={request} open={!!request} onClose={() => setRequest(null)} />
    </>
  );
}

export default function PayablesPage() {
  const { user } = useAuth();
  const [projectId, setProjectId] = useProjectScope();
  // The due list is the page's own list: its search and the vendor go in the address bar, as does the tab.
  const page = useListPage<'dueDate'>({ keys: PAGE_KEYS, sortBy: 'dueDate', sortOrder: 'asc', sortFields: [], scope: projectId });
  const vendorId = page.filters.vendorId;
  // The menu sends quantity surveyors and purchase to Payment requests and Debit notes, who may not see what is owed:
  // they get only the tabs their role opens, and the payables themselves are not asked for.
  const role = user?.roleKey;
  const seesPayables = !!role && canViewPayables(role);
  const shown = TAB_KEYS.filter((k) => (k === 'requests' ? !!role && canViewPaymentRequests(role) : k === 'debit-notes' ? !!role && canViewDebitNotes(role) : seesPayables));
  const [tab, setTab] = useUrlTab<PayablesTab>(shown, shown[0] ?? 'due', { param: 'tab' });
  const [bill, setBill] = useState<{ billType: PayableBillDto['billType']; billId: string } | null>(null);
  const [paying, setPaying] = useState<PayTarget | null>(null);
  const [asking, setAsking] = useState<RequestFor | null>(null);
  const [request, setRequest] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = usePayables({ projectId, vendorId }, seesPayables);
  const accounts = !!user && canRecordPayment(user.roleKey);
  const requester = !!user && canRequestPayment(user.roleKey);
  const needRequest = !!data?.paymentsNeedRequest;
  const t = data?.totals;
  const q = page.params.q?.toLowerCase();
  const openBills = useMemo<Keyed<PayableBillDto>[]>(
    () =>
      (data?.openBills ?? [])
        .filter((r) => !q || `${r.billLabel} ${r.vendorName} ${r.projectCode} ${r.projectName}`.toLowerCase().includes(q))
        .map((r) => ({ ...r, id: `${r.billType}-${r.billId}` })),
    [data, q],
  );
  const vendors = useMemo<Keyed<VendorPayableDto>[]>(() => (data?.vendors ?? []).map((r) => ({ ...r, id: r.vendorId })), [data]);
  const projects = useMemo<Keyed<ProjectPayableDto>[]>(() => (data?.projects ?? []).map((r) => ({ ...r, id: r.projectId })), [data]);
  const failed = !!error;

  const openColumns: ListColumn<Keyed<PayableBillDto>>[] = [
    {
      key: 'bill',
      title: 'Bill',
      locked: true,
      card: 'title',
      cardText: (r) => r.billLabel,
      width: 190,
      render: (_, r) => (
        <div>
          <RecordLink href={r.billType === 'VENDOR_BILL' ? `/vendor-bills/${r.billId}` : `/subcontract-bills/${r.billId}`} onOpen={() => setBill(r)} strong className="mono">
            {r.billLabel}
          </RecordLink>
          <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
            {r.billType === 'VENDOR_BILL' ? 'Vendor bill' : 'Subcontractor bill'} · {formatDate(r.billDate)}
          </div>
        </div>
      ),
    },
    {
      key: 'vendor',
      title: 'Vendor',
      width: 260,
      card: 'meta',
      cardText: (r) => `${r.vendorName} · ${r.projectCode} · ${r.projectName}`,
      render: (_, r) => (
        <div>
          {r.vendorName}
          {isSmall(r.vendorMsme) && (
            <AppTag {...(r.msmeFlag ? { meaning: 'failed' as const } : { variant: 'kind' as const })} style={{ marginInlineStart: tk.space[2] }}>
              {MSME_CATEGORY_LABELS[r.vendorMsme!]}
            </AppTag>
          )}
          <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
            {r.projectCode} · {r.projectName}
          </div>
        </div>
      ),
    },
    { key: 'outstanding', card: 'amount', title: 'Outstanding', dataIndex: 'outstanding', width: 140, kind: 'money', strong: true, total: (rows) => sumMoney(rows.map((r) => r.outstanding)) },
    {
      key: 'dueDate',
      title: 'Due',
      card: 'date',
      cardText: (r) => (r.daysToDue < 0 ? `Due ${formatDate(r.dueDate)}, ${-r.daysToDue} days late` : r.daysToDue === 0 ? `Due today` : `Due ${formatDate(r.dueDate)}, in ${r.daysToDue} days`),
      dataIndex: 'dueDate',
      width: 140,
      render: (v) => <DueCell date={v} />,
    },
    {
      key: 'request',
      title: 'Payment request',
      width: 170,
      card: false,
      render: (_, r) =>
        r.request ? (
          <div>
            <RecordLink href={`/payment-requests/${r.request.id}`} onOpen={() => setRequest(r.request!.id)} className="mono">
              {r.request.requestNo}
            </RecordLink>
            <div style={{ fontSize: tk.type.caption.fontSize }}>{r.request.status === 'APPROVED' ? `Approved, ${formatINR(r.request.unpaid)} to pay` : SUBMISSION_STATUS_LABELS[r.request.status]}</div>
          </div>
        ) : (
          <span className="text-muted">{NO_VALUE}</span>
        ),
    },
    { key: 'payable', title: 'Payable', dataIndex: 'payable', width: 130, defaultFrom: 1600, kind: 'money', total: (rows) => sumMoney(rows.map((r) => r.payable)) },
    { key: 'paid', title: 'Paid', dataIndex: 'paid', width: 120, defaultFrom: 1600, kind: 'money', total: (rows) => sumMoney(rows.map((r) => r.paid)) },
    ...(accounts || requester
      ? [
          {
            key: 'pay',
            title: '',
            label: 'Pay',
            locked: true,
            card: false,
            fixed: 'right' as const,
            width: 150,
            render: (_: unknown, r: PayableBillDto) => {
              const req = r.request;
              // Pay against an approved request; pay directly only when the company does not ask for one; else ask.
              if (accounts && req?.status === 'APPROVED' && toNumber(req.unpaid) > 0)
                return (
                  <Button size="small" onClick={() => setPaying({ ...r, payable: req.amount, outstanding: String(Math.min(toNumber(req.unpaid), toNumber(r.outstanding))), billLabel: `${req.requestNo} · ${r.billLabel}`, paymentRequestId: req.id })}>
                    Pay
                  </Button>
                );
              if (accounts && !needRequest)
                return (
                  <Button size="small" onClick={() => setPaying(r)}>
                    Pay
                  </Button>
                );
              if (requester && !req)
                return (
                  <Button size="small" onClick={() => setAsking({ kind: 'BILL', ...(r.billType === 'VENDOR_BILL' ? { vendorBillId: r.billId } : { subcontractBillId: r.billId }), label: r.billLabel, vendorName: r.vendorName, open: r.outstanding })}>
                    Request payment
                  </Button>
                );
              return null;
            },
          } satisfies ListColumn<Keyed<PayableBillDto>>,
        ]
      : []),
  ];
  const openChoice = useColumnChoice('payables-due', openColumns);

  const vendorColumns: ListColumn<Keyed<VendorPayableDto>>[] = [
    {
      key: 'vendorName',
      title: 'Vendor',
      dataIndex: 'vendorName',
      locked: true,
      card: 'title',
      fixed: 'left',
      width: 240,
      ellipsis: true,
      render: (v: string, r) => (
        <span>
          {v}
          {isSmall(r.vendorMsme) && (
            <AppTag meaning="waiting" style={{ marginInlineStart: tk.space[2] }}>
              {MSME_CATEGORY_LABELS[r.vendorMsme!]}
            </AppTag>
          )}
        </span>
      ),
    },
    { key: 'openBills', title: 'Open bills', dataIndex: 'openBills', width: 100, align: 'right', card: 'meta', cardText: (r) => `${r.openBills} open bill${r.openBills === 1 ? '' : 's'}` },
    ...ageingColumns<Keyed<VendorPayableDto>>(),
  ];
  const projectColumns: ListColumn<Keyed<ProjectPayableDto>>[] = [
    { key: 'projectName', title: 'Project', dataIndex: 'projectName', locked: true, card: 'title', fixed: 'left', width: 240, ellipsis: true, render: (v: string, r) => <Link href={`/projects/${r.projectId}`}>{v}</Link> },
    ...ageingColumns<Keyed<ProjectPayableDto>>(),
  ];

  const toolbar = (onExport: () => Promise<number>) => (
    <CardToolbar justify="flex-end">
      <ExportButton onExport={onExport} />
    </CardToolbar>
  );

  // A role that may not see this gets the reason alone, not empty tabs under it.
  if (errorStatus(error) === 403) {
    return (
      <div className="page-container">
        <PageHeader title="Payables" />
        <QueryError error={error} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Payables"
        help="What is owed to vendors and subcontractors on their approved bills, by due date, with micro and small enterprises flagged before their 45 days run out."
        extra={
          <Space wrap>
            <VendorSelect allowClear placeholder="Any vendor" aria-label="Vendor" style={{ width: 220 }} value={vendorId} onChange={(v) => page.setFilter('vendorId', v)} />
            <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} />
          </Space>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <PageSkeleton shape="workspace" header={false} />}
      {t && (
        <Row gutter={[12, 12]} style={{ marginBottom: tk.space[4] }}>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Outstanding" value={formatINRCompact(t.outstanding)} />
              <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                {data.openBills.length} open bill{data.openBills.length === 1 ? '' : 's'} · paid so far {formatINR(t.paid)}
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Overdue" value={formatINRCompact(t.overdue)} styles={{ content: { color: toNumber(t.overdue) > 0 ? tk.color.tone.danger.fg : undefined } }} />
              <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                Due in the next 7 days: {formatINR(t.dueSoon)}
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="MSME at risk" value={formatINRCompact(t.msmeAtRisk)} styles={{ content: { color: toNumber(t.msmeAtRisk) > 0 ? tk.color.tone.danger.fg : undefined } }} />
              <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                Micro and small enterprises due within 7 days or late
              </Typography.Text>
            </Card>
          </Col>
          <Col flex="1 1 180px">
            <Card style={{ height: '100%' }}>
              <Statistic title="Retention held" value={formatINRCompact(t.retentionHeld)} />
              <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                TDS deducted {formatINR(t.tdsDeducted)}
              </Typography.Text>
            </Card>
          </Col>
        </Row>
      )}
      {isLoading ? null : (
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => setTab(k as PayablesTab)}
          variant="page"
          items={[
            {
              key: 'due',
              label: 'Due list',
              count: data?.openBills.length,
              countLabel: 'bills due',
              children: (
                <>
                  <ListToolbar
                    projectId={projectId}
                    onProject={setProjectId}
                    hideProject
                    search={page.search}
                    onSearch={page.setSearch}
                    searchPlaceholder="Search bill, vendor, project"
                    searchLabel="Search the due list"
                    extra={
                      <ExportButton
                        onExport={async () => {
                          await downloadXlsx(exportFileName('due-list'), 'Due list', PAYABLE_BILL_EXPORT, openBills);
                          return openBills.length;
                        }}
                      />
                    }
                  />
                  <DataTable<Keyed<PayableBillDto>>
                    columns={openColumns}
                    visible={openChoice.visible}
                    onChooseColumns={openChoice.setChosen}
                    chosenIsDefault={openChoice.isDefault}
                    rows={openBills}
                    loading={isLoading}
                    failed={failed}
                    table={page.tableProps<Keyed<PayableBillDto>>(openBills.length)}
                    onOpen={(id) => {
                      const r = openBills.find((x) => x.id === id);
                      if (r) setBill(r);
                    }}
                    bulk={[exportSelected<Keyed<PayableBillDto>, PayableBillDto>('due-list', 'Due list', PAYABLE_BILL_EXPORT)]}
                    empty={{ filtered: !!page.params.q || !!vendorId, clear: () => page.clear() }}
                    emptyText={<EmptyArt art="entries" title={page.params.q || vendorId ? 'No open bill matches these filters' : 'Every approved bill is paid'} />}
                  />
                </>
              ),
            },
            { key: 'requests', label: 'Payment requests', children: <PaymentRequestList projectId={projectId} vendorId={vendorId} /> },
            {
              key: 'vendors',
              label: 'By vendor',
              children: (
                <>
                  {toolbar(async () => {
                    await downloadXlsx(exportFileName('payables-by-vendor'), 'Payables by vendor', PAYABLE_VENDOR_EXPORT, data?.vendors ?? []);
                    return data?.vendors.length ?? 0;
                  })}
                  <LocalDataTable<Keyed<VendorPayableDto>>
                    list="payables-vendors"
                    columns={vendorColumns}
                    rows={vendors}
                    loading={isLoading}
                    failed={failed}
                    bulk={[exportSelected<Keyed<VendorPayableDto>, VendorPayableDto>('payables-by-vendor', 'Payables by vendor', PAYABLE_VENDOR_EXPORT)]}
                    emptyText="Nothing owed to any vendor"
                  />
                </>
              ),
            },
            {
              key: 'projects',
              label: 'By project',
              children: <LocalDataTable<Keyed<ProjectPayableDto>> list="payables-projects" columns={projectColumns} rows={projects} loading={isLoading} failed={failed} emptyText="Nothing owed on any project" />,
            },
            { key: 'payments', label: 'Payments', children: <PaymentsTab projectId={projectId} vendorId={vendorId} onBill={setBill} /> },
            { key: 'debit-notes', label: 'Debit notes', children: <DebitNotesTab projectId={projectId} vendorId={vendorId} /> },
          ].filter((i) => shown.includes(i.key as PayablesTab))}
        />
      </Card>
      )}
      <VendorBillDrawer id={bill?.billType === 'VENDOR_BILL' ? bill.billId : null} open={bill?.billType === 'VENDOR_BILL'} onClose={() => setBill(null)} />
      <SubBillDrawer id={bill?.billType === 'SUBCONTRACT_BILL' ? bill.billId : null} open={bill?.billType === 'SUBCONTRACT_BILL'} onClose={() => setBill(null)} />
      <PaymentFormModal open={!!paying} bill={paying} onClose={() => setPaying(null)} />
      <PaymentRequestFormModal open={!!asking} target={asking} onClose={() => setAsking(null)} />
      <PaymentRequestDrawer id={request} open={!!request} onClose={() => setRequest(null)} />
    </div>
  );
}
