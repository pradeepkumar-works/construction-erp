'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { PaymentRequestDto, PaymentRequestKind, PaymentRequestSortField, SubmissionStatus } from '@erp/shared';
import { LIST_SORT_FIELDS, PAYMENT_REQUEST_KINDS, PAYMENT_REQUEST_KIND_LABELS, canRecordPayment, canRequestPayment } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { usePaymentRequests } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { useNewIntent } from '@/lib/new-intent';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PAYMENT_REQUEST_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { StatusTag } from '@/components/common/StatusTag';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { RecordLink } from '@/components/record/RecordLink';
import { PaymentRequestDrawer, PayRequestModal, RequestPaidTag, requestTargetHref } from './PaymentRequestRecord';
import { PaymentRequestFormModal } from './PaymentRequestFormModal';

const NO_KEYS: string[] = [];
const money = (v: string, strong?: boolean) =>
  strong ? (
    <strong className="mono" translate="no">
      {formatINR(v)}
    </strong>
  ) : (
    <span className="mono" translate="no">
      {formatINR(v)}
    </span>
  );

/**
 * Payment requests (v5 item 90) in the Payables page's tab: bills to pay and advances to release, waiting for approval
 * or for accounts to pay them.
 */
export function PaymentRequestList({ projectId, vendorId }: { projectId?: string; vendorId?: string }) {
  const { user } = useAuth();
  const page = useListPage<PaymentRequestSortField>({
    keys: NO_KEYS,
    sortBy: 'requestNo',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.paymentRequests,
    url: false,
    scope: `${projectId}:${vendorId}`,
  });
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [kind, setKind] = useState<PaymentRequestKind | undefined>();
  const [opened, setOpened] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRequestDto | null>(null);
  const [paying, setPaying] = useState<PaymentRequestDto | null>(null);
  const filters = {
    page: page.params.page,
    pageSize: page.params.pageSize,
    q: page.params.q,
    sortBy: page.params.sortBy,
    sortOrder: page.params.sortOrder,
    projectId,
    vendorId,
    status,
    kind,
  };
  const { data, isLoading, isFetching, error, refetch } = usePaymentRequests(filters);
  const rows = data?.items ?? [];
  const accounts = !!user && canRecordPayment(user.roleKey);
  const requester = !!user && canRequestPayment(user.roleKey);
  useNewIntent('payment-request', requester, () => setFormOpen(true));
  const sort = (key: PaymentRequestSortField) => ({
    key,
    sorter: true,
    sortOrder: page.sortOrderFor(key),
    sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[],
  });
  const exportRows = async () => {
    const all = await fetchAllPages<PaymentRequestDto>('/payment-requests', {
      ...filters,
    });
    await downloadXlsx(exportFileName('payment-requests'), 'Payment requests', PAYMENT_REQUEST_EXPORT, all);
    return all.length;
  };

  const columns: ListColumn<PaymentRequestDto>[] = [
    {
      title: 'Request',
      locked: true,
      card: 'title',
      cardText: (r) => r.requestNo,
      width: 170,
      ...sort('requestNo'),
      render: (_, r) => (
        <div>
          <RecordLink href={`/payment-requests/${r.id}`} onOpen={() => setOpened(r.id)} strong className="mono">
            {r.requestNo}
          </RecordLink>
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {formatDate(r.createdAt.slice(0, 10))}
          </div>
        </div>
      ),
    },
    {
      key: 'target',
      title: 'For',
      width: 200,
      card: 'meta',
      cardText: (r) => `${r.vendorName} · ${PAYMENT_REQUEST_KIND_LABELS[r.kind]} · ${r.targetLabel}`,
      render: (_, r) => (
        <div>
          <Link href={requestTargetHref(r)} className="mono" translate="no">
            {r.targetLabel}
          </Link>
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {PAYMENT_REQUEST_KIND_LABELS[r.kind]}
          </div>
        </div>
      ),
    },
    {
      title: 'Pay to',
      width: 280,
      ...sort('vendor'),
      render: (_, r) => (
        <div>
          {r.vendorName}
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.projectCode} · {r.projectName}
          </div>
        </div>
      ),
    },
    {
      card: 'amount',
      title: 'Amount',
      dataIndex: 'amount',
      width: 140,
      align: 'right',
      ...sort('amount'),
      render: (v) => money(v, true),
      total: (all) => formatINR(all.reduce((n, r) => n + toNumber(r.amount), 0)),
    },
    {
      key: 'paid',
      title: 'Paid',
      dataIndex: 'paidAmount',
      width: 130,
      align: 'right',
      render: (v) => money(v),
      total: (all) => formatINR(all.reduce((n, r) => n + toNumber(r.paidAmount), 0)),
    },
    {
      title: 'Needed by',
      dataIndex: 'neededBy',
      card: 'date',
      cardText: (r) => (r.neededBy ? `Needed by ${formatDate(r.neededBy)}` : ''),
      width: 120,
      ...sort('neededBy'),
      render: (v: string | null) => (v ? formatDate(v) : '-'),
    },
    {
      title: 'Status',
      width: 170,
      ...sort('status'),
      render: (_, r) => (
        <Space size={4} wrap>
          <StatusTag status={r.status} />
          <RequestPaidTag request={r} />
        </Space>
      ),
    },
    ...(accounts
      ? [
          {
            key: 'pay',
            title: '',
            label: 'Pay',
            locked: true,
            card: false,
            fixed: 'right' as const,
            width: 90,
            render: (_: unknown, r: PaymentRequestDto) =>
              r.status === 'APPROVED' && toNumber(r.outstanding) > 0 ? (
                <Button size="small" type="primary" onClick={() => setPaying(r)}>
                  Pay
                </Button>
              ) : null,
          } satisfies ListColumn<PaymentRequestDto>,
        ]
      : []),
  ];
  const choice = useColumnChoice('payables-requests', columns);

  const newButton = requester ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Request payment
    </Button>
  ) : null;
  const filtered = !!page.params.q || !!status || !!kind;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectId}
        onProject={() => undefined}
        hideProject
        status={status}
        onStatus={setStatus}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search request, bill, order, vendor"
        searchLabel="Search payment requests"
        filters={{
          count: (status ? 1 : 0) + (kind ? 1 : 0),
          clear: () => (setStatus(undefined), setKind(undefined)),
        }}
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <Select
          allowClear
          placeholder="Any kind"
          aria-label="Kind"
          value={kind}
          onChange={(v) => setKind(v)}
          style={{ width: 220 }}
          options={PAYMENT_REQUEST_KINDS.map((k) => ({
            value: k,
            label: PAYMENT_REQUEST_KIND_LABELS[k],
          }))}
        />
      </ListToolbar>
      <DataTable<PaymentRequestDto>
        columns={columns}
        visible={choice.visible}
        onChooseColumns={choice.setChosen}
        chosenIsDefault={choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<PaymentRequestDto>(data?.total)}
        onOpen={(id) => setOpened(id)}
        bulk={[exportSelected<PaymentRequestDto>('payment-requests', 'Payment requests', PAYMENT_REQUEST_EXPORT)]}
        scrollX={1400}
        empty={{
          filtered,
          clear: () => (page.clear(), setStatus(undefined), setKind(undefined)),
        }}
        emptyText={<EmptyArt art="entries" title={filtered ? 'No payment request matches these filters' : 'No payment requests yet'} />}
        emptyAction={newButton}
      />
      <PaymentRequestDrawer id={opened} open={!!opened} onClose={() => setOpened(null)} onEdit={setEditing} />
      <PaymentRequestFormModal open={formOpen || !!editing} request={editing} onClose={() => (setFormOpen(false), setEditing(null))} />
      <PayRequestModal request={paying} onClose={() => setPaying(null)} />
    </>
  );
}
