'use client';

import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Row, Select, Statistic, Table, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { PlusOutlined } from '@ant-design/icons';
import { EQUIPMENT_LOAN_STATUS_LABELS, canManageMachineLoans, type EquipmentLoanDto, type EquipmentLoanStatus, type LenderOutstandingDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMachineLoans } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { EmiStageTag } from '@/components/loans/EmiStageTag';
import { LoanFormModal } from '@/components/loans/LoanForms';

const KEYS = ['status'] as const;
const STATUS_OPTIONS: { value: EquipmentLoanStatus | 'ALL'; label: string }[] = [
  { value: 'ACTIVE', label: 'Running' },
  { value: 'CLOSED', label: 'Repaid' },
  { value: 'ALL', label: 'All loans' },
];

/**
 * Machine loans (v6 item 108): loans on financed machines, what each has repaid and still owes, the next EMI and any
 * overdue, and the running loans by lender. Kept by admin, management and accounts.
 */
function MachineLoansPage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const router = useRouter();
  const canManage = !!user && canManageMachineLoans(user.roleKey);
  const [adding, setAdding] = useState(false);
  useNewIntent('machine-loan', canManage, () => setAdding(true));
  const page = useListPage<'sanctionDate'>({ keys: KEYS, sortBy: 'sanctionDate', sortOrder: 'desc' });
  const status = (page.filters.status as EquipmentLoanStatus | 'ALL' | undefined) ?? 'ACTIVE';
  const { data, isLoading, isFetching, error, refetch } = useMachineLoans({ status: status === 'ALL' ? undefined : status, q: page.params.q }, canManage);
  const open = (id: string) => router.push(`/machine-loans/${id}`);

  const columns: ListColumn<EquipmentLoanDto>[] = [
    {
      key: 'loan',
      title: 'Loan',
      locked: true,
      render: (_, r) => (
        <div>
          <RecordLink href={`/machine-loans/${r.id}`} onOpen={() => open(r.id)} strong>
            {r.lenderName}
          </RecordLink>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
            {r.loanNo}
          </Typography.Text>
        </div>
      ),
    },
    {
      key: 'machine',
      title: 'Machine',
      render: (_, r) => (
        <div translate="no">
          {r.equipmentCode} {r.equipmentName}
          {r.projectName ? (
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
              {r.projectName}
            </Typography.Text>
          ) : null}
        </div>
      ),
    },
    { key: 'amount', title: 'Amount', align: 'right', width: 130, render: (_, r) => <span translate="no">{formatINR(r.amount)}</span> },
    { key: 'emi', title: 'EMI', align: 'right', width: 150, render: (_, r) => <span translate="no">{`${formatINR(r.emi)} at ${toNumber(r.ratePct)}%`}</span>, defaultFrom: 1280 },
    { key: 'paid', title: 'EMIs paid', align: 'right', width: 110, render: (_, r) => `${r.emisPaid} of ${r.emiCount}` },
    { key: 'outstanding', title: 'Owed', align: 'right', width: 130, render: (_, r) => <span translate="no">{formatINR(r.outstanding)}</span> },
    {
      key: 'next',
      title: 'Next EMI',
      width: 190,
      render: (_, r) =>
        r.status === 'CLOSED' ? (
          <AppTag>{`${EQUIPMENT_LOAN_STATUS_LABELS.CLOSED} ${formatDate(r.closedOn)}`}</AppTag>
        ) : r.nextDue ? (
          <div>
            <span translate="no">{formatDate(r.nextDue.dueDate)}</span> <EmiStageTag stage={r.nextDue.stage} />
            {r.overdueCount > 1 ? (
              <Typography.Text type="danger" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                {`${r.overdueCount} EMIs overdue, ${formatINR(r.overdueAmount)}`}
              </Typography.Text>
            ) : null}
          </div>
        ) : (
          '-'
        ),
    },
  ];
  const choice = useColumnChoice('machine-loans', columns);
  const rows = data?.items ?? [];
  const s = data?.summary;

  const newButton = canManage ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      Record machine loan
    </Button>
  ) : null;
  const stat = (title: string, value: React.ReactNode, note?: React.ReactNode) => (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontSize: token.fontSizeHeading4 } }} />
        {note ? <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div> : null}
      </Card>
    </Col>
  );

  return (
    <div className="page-container">
      <PageHeader title="Machine loans" subtitle="Loans on financed machines: what is owed to each lender, the EMIs due and any overdue." extra={newButton} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} shape="list" /> : null}
      {s ? (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
            {stat('Owed on running loans', <span translate="no">{formatINR(s.outstanding)}</span>, `${s.loans} loan${s.loans === 1 ? '' : 's'}`)}
            {stat(
              'Overdue',
              s.overdueCount ? (
                <Typography.Text type="danger" translate="no">
                  {formatINR(s.overdueAmount)}
                </Typography.Text>
              ) : (
                'None'
              ),
              s.overdueCount ? `${s.overdueCount} EMI${s.overdueCount === 1 ? '' : 's'} past their date` : 'Every EMI paid on time',
            )}
            {stat('Due in the next 30 days', <span translate="no">{formatINR(s.dueIn30)}</span>)}
            {stat('Interest this year', <span translate="no">{formatINR(s.interestThisYear)}</span>, 'Paid since 1 April, a finance cost')}
          </Row>
          {s.lenders.length ? (
            <Card size="small" title={<Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>Owed by lender</Typography.Title>} style={{ marginBottom: token.marginMD }}>
              <Table<LenderOutstandingDto>
                size="small"
                rowKey="lenderName"
                pagination={false}
                dataSource={s.lenders}
                scroll={{ x: 560 }}
                columns={[
                  { key: 'lender', title: 'Lender', render: (_, l) => <span translate="no">{l.lenderName}</span> },
                  { key: 'loans', title: 'Loans', dataIndex: 'loans', align: 'right', width: 80 },
                  { key: 'owed', title: 'Owed', align: 'right', render: (_, l) => <span translate="no">{formatINR(l.outstanding)}</span> },
                  { key: 'overdue', title: 'Overdue', align: 'right', render: (_, l) => (toNumber(l.overdueAmount) ? <Typography.Text type="danger">{formatINR(l.overdueAmount)}</Typography.Text> : '-') },
                  { key: 'due', title: 'Due in 30 days', align: 'right', render: (_, l) => <span translate="no">{formatINR(l.dueIn30)}</span> },
                ]}
              />
            </Card>
          ) : null}
        </>
      ) : null}
      <Card size="small">
        <ListToolbar onProject={() => undefined} hideProject search={page.search} onSearch={page.setSearch} searchPlaceholder="Search lender, loan no. or machine" searchLabel="Search machine loans">
          <Select
            aria-label="Loans to show"
            style={{ width: 150 }}
            value={status}
            onChange={(v) => page.setFilter('status', v === 'ACTIVE' ? undefined : v)}
            options={STATUS_OPTIONS}
          />
        </ListToolbar>
        <DataTable<EquipmentLoanDto>
          columns={columns}
          visible={choice.visible}
          onChooseColumns={choice.setChosen}
          chosenIsDefault={choice.isDefault}
          rows={rows}
          loading={isLoading || isFetching}
          table={{ pagination: false }}
          onOpen={open}
          empty={{ filtered: !!page.params.q || status !== 'ACTIVE', clear: () => page.clear() }}
          failed={!!error}
          scrollX={1000}
          emptyText={<EmptyArt art="entries" title={page.params.q ? 'No loan matches the search' : status === 'ACTIVE' ? 'No running machine loan' : 'No machine loan yet'} />}
          emptyAction={newButton}
        />
      </Card>
      <LoanFormModal open={adding} onClose={() => setAdding(false)} onSaved={(id) => router.push(`/machine-loans/${id}`)} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MachineLoansPage />
    </Suspense>
  );
}
