'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Select, Space } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { PaymentRequestDto, PaymentRequestKind, PaymentRequestSortField, SubmissionStatus } from '@erp/shared';
import { FUND_PURPOSE_LABELS, LIST_SORT_FIELDS, PAYMENT_REQUEST_KINDS, PAYMENT_REQUEST_KIND_LABELS, canRecordPayment, canReleaseFunds, canRequestFunds, canRequestPayment } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { usePaymentRequests } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { useNewIntent } from '@/lib/new-intent';
import { useProjectScope } from '@/lib/project-scope';
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
import { PaymentRequestDrawer, PayRequestModal, RequestPaidTag, requestPayee, requestReleases, requestTargetHref } from './PaymentRequestRecord';
import { PaymentRequestFormModal } from './PaymentRequestFormModal';
import { FundRequestFormModal } from './FundRequestFormModal';

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

/** What a request is for, in the list: the bill or order, or a fund request's purpose. */
const forLabel = (r: PaymentRequestDto) => (r.kind === 'FUND_REQUEST' && r.purpose ? FUND_PURPOSE_LABELS[r.purpose] : r.targetLabel);

/**
 * Payment requests in the Payables page's tab: bills to pay and advances to release, waiting for approval
 * or for accounts to pay them. With `fund`, a site's fund requests on the Site imprest page: asked for by
 * the site, released into its imprest or paid to a party.
 */
export function PaymentRequestList({ projectId: given, vendorId, fund }: { projectId?: string; vendorId?: string; fund?: boolean }) {
  const { user } = useAuth();
  // On Site imprest the list follows the header's project, with its own picker.
  const [scope, setScope] = useProjectScope();
  const projectId = fund ? scope : given;
  const page = useListPage<PaymentRequestSortField>({
    keys: NO_KEYS,
    sortBy: 'requestNo',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.paymentRequests,
    url: false,
    scope: `${projectId}:${vendorId}:${fund ? 'fund' : ''}`,
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
    kind: fund ? ('FUND_REQUEST' as const) : kind,
  };
  const { data, isLoading, isFetching, error, refetch } = usePaymentRequests(filters);
  const rows = data?.items ?? [];
  const pays = !!user && canRecordPayment(user.roleKey);
  const releases = !!user && canReleaseFunds(user.roleKey);
  const accounts = pays || releases;
  const requester = !!user && (fund ? canRequestFunds(user.roleKey) : canRequestPayment(user.roleKey));
  useNewIntent(fund ? 'fund-request' : 'payment-request', requester, () => setFormOpen(true));
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
    await downloadXlsx(exportFileName(fund ? 'fund-requests' : 'payment-requests'), fund ? 'Fund requests' : 'Payment requests', PAYMENT_REQUEST_EXPORT, all);
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
      cardText: (r) => `${requestPayee(r)} · ${PAYMENT_REQUEST_KIND_LABELS[r.kind]} · ${forLabel(r)}`,
      render: (_, r) => {
        const href = r.kind === 'FUND_REQUEST' ? null : requestTargetHref(r);
        return (
          <div>
            {href ? (
              <Link href={href} className="mono" translate="no">
                {r.targetLabel}
              </Link>
            ) : (
              forLabel(r)
            )}
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              {PAYMENT_REQUEST_KIND_LABELS[r.kind]}
            </div>
          </div>
        );
      },
    },
    {
      title: fund ? 'Goes to' : 'Pay to',
      width: 280,
      ...sort('vendor'),
      render: (_, r) => (
        <div>
          {requestPayee(r)}
          {r.kind === 'FUND_REQUEST' && r.vendorId ? <span className="text-muted"> · on account</span> : null}
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.projectCode} · {r.projectName}
            {r.raisedAtProjectName ? `, asked from ${r.raisedAtProjectName}` : ''}
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
              r.status === 'APPROVED' && toNumber(r.outstanding) > 0 && (requestReleases(r) ? releases : pays) ? (
                <Button size="small" type="primary" onClick={() => setPaying(r)}>
                  {requestReleases(r) ? 'Release' : 'Pay'}
                </Button>
              ) : null,
          } satisfies ListColumn<PaymentRequestDto>,
        ]
      : []),
  ];
  const choice = useColumnChoice(fund ? 'fund-requests' : 'payables-requests', columns);

  const newButton = requester ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      {fund ? 'Request funds' : 'Request payment'}
    </Button>
  ) : null;
  const filtered = !!page.params.q || !!status || !!kind;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectId}
        onProject={setScope}
        hideProject={!fund}
        status={status}
        onStatus={setStatus}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder={fund ? 'Search request, site, holder, party' : 'Search request, bill, order, vendor'}
        searchLabel={fund ? 'Search fund requests' : 'Search payment requests'}
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
        {fund ? null : (
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
        )}
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
        bulk={[exportSelected<PaymentRequestDto>(fund ? 'fund-requests' : 'payment-requests', fund ? 'Fund requests' : 'Payment requests', PAYMENT_REQUEST_EXPORT)]}
        scrollX={1400}
        empty={{
          filtered,
          clear: () => (page.clear(), setStatus(undefined), setKind(undefined)),
        }}
        emptyText={<EmptyArt art="entries" title={filtered ? `No ${fund ? 'fund' : 'payment'} request matches these filters` : fund ? 'No fund requests yet' : 'No payment requests yet'} />}
        emptyAction={newButton}
      />
      <PaymentRequestDrawer id={opened} open={!!opened} onClose={() => setOpened(null)} onEdit={setEditing} />
      {fund ? (
        <FundRequestFormModal open={formOpen} projectId={projectId} onClose={() => setFormOpen(false)} />
      ) : null}
      <PaymentRequestFormModal open={(!fund && formOpen) || !!editing} request={editing} onClose={() => (setFormOpen(false), setEditing(null))} />
      <PayRequestModal request={paying} onClose={() => setPaying(null)} />
    </>
  );
}
