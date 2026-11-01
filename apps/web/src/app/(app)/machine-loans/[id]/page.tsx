'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App, Button, Card, Col, Descriptions, Dropdown, Flex, Row, Space, Statistic, Table, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { MenuProps } from 'antd';
import { DeleteOutlined, EditOutlined, MoreOutlined, RollbackOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EQUIPMENT_LOAN_STATUS_LABELS, LOAN_DISBURSAL_LABELS, PAYMENT_MODE_LABELS, type LoanEmiDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useMachineLoan } from '@/lib/queries';
import { formatDate, formatINR, toNumber, formatQty } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { EmiStageTag } from '@/components/loans/EmiStageTag';
import { LoanFormModal, PayEmiModal } from '@/components/loans/LoanForms';

/**
 * One machine loan: what it has repaid and still owes, the next EMI, the machine's cost of finance (the
 * interest over the hours it has worked), and the EMI schedule with each EMI paid or due. Accounts record EMIs paid in
 * order, close the loan early, or undo the last EMI recorded.
 */
export default function MachineLoanPage() {
  const { token } = theme.useToken();
  const { modal } = App.useApp();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: loan, isLoading, error, refetch } = useMachineLoan(params?.id);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState<'pay' | 'close' | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const undo = useMutation({
    mutationFn: async () => (await api.post(`/machine-loans/${loan!.id}/undo-pay`)).data,
    onSuccess: () => {
      notify.saved('The last EMI is back to unpaid');
      qc.invalidateQueries({ queryKey: ['machine-loans'] });
    },
    meta: FAIL_NOTICE,
  });

  if (isLoading)
    return (
      <div className="page-container">
        <PageSkeleton shape="record" />
      </div>
    );
  if (error || !loan)
    return (
      <div className="page-container">
        <QueryError error={error ?? new Error('Loan not found')} onRetry={() => refetch()} />
      </div>
    );

  const running = loan.status === 'ACTIVE';
  const next = loan.emis.find((e) => !e.paidOn) ?? null;
  const lastPaid = [...loan.emis].reverse().find((e) => e.paidOn) ?? null;
  const more: MenuProps['items'] = [
    ...(lastPaid
      ? [
          {
            key: 'undo',
            icon: <RollbackOutlined />,
            label: `Undo EMI ${lastPaid.no} paid`,
            onClick: () =>
              modal.confirm({
                title: `Undo EMI ${lastPaid.no} paid on ${formatDate(lastPaid.paidOn)}?`,
                content: 'It goes back to unpaid and its payment leaves the books. Use it for an EMI recorded by mistake.',
                okText: 'Undo payment',
                onOk: () => undo.mutateAsync(),
              }),
          },
        ]
      : []),
    ...(loan.emisPaid === 0
      ? [
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            danger: true,
            label: 'Delete loan',
            onClick: () =>
              askDelete({
                what: `loan ${loan.loanNo}`,
                description: 'Its EMI schedule goes with it. Use it for a loan entered by mistake.',
                onConfirm: () => api.delete(`/machine-loans/${loan.id}`),
                onDone: () => {
                  qc.invalidateQueries({ queryKey: ['machine-loans'] });
                  router.push('/machine-loans');
                },
              }),
          },
        ]
      : []),
  ];

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
      <PageHeader
        title={<span translate="no">{`${loan.lenderName} · ${loan.loanNo}`}</span>}
        docTitle={`Loan ${loan.loanNo}`}
        crumbs={[{ title: 'Machine loans', href: '/machine-loans' }, { title: loan.loanNo }]}
        subtitle={
          <span>
            <AppTag color={running ? 'processing' : undefined}>{running ? EQUIPMENT_LOAN_STATUS_LABELS.ACTIVE : `${EQUIPMENT_LOAN_STATUS_LABELS.CLOSED} ${formatDate(loan.closedOn)}`}</AppTag>
            <span translate="no">{`${loan.equipmentCode} ${loan.equipmentName}`}</span>
            {loan.projectName ? <span>{` at ${loan.projectName}`}</span> : null}
          </span>
        }
        extra={
          <Space wrap>
            {running && next ? (
              <Button type="primary" onClick={() => setPaying('pay')}>
                {`Pay EMI ${next.no}`}
              </Button>
            ) : null}
            {running && next ? <Button onClick={() => setPaying('close')}>Close early</Button> : null}
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {more.length ? (
              <Dropdown menu={{ items: more }} trigger={['click']}>
                <Button icon={<MoreOutlined />} aria-label="More actions" />
              </Dropdown>
            ) : null}
          </Space>
        }
      />
      <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
        {stat('Owed', <span translate="no">{formatINR(loan.outstanding)}</span>, `of ${formatINR(loan.amount)} borrowed`)}
        {stat('EMIs paid', `${loan.emisPaid} of ${loan.emiCount}`, `${formatINR(loan.principalRepaid)} repaid`)}
        {stat(
          'Next EMI',
          next ? <span translate="no">{formatINR(next.emi)}</span> : 'None',
          next ? (
            <span>
              {formatDate(next.dueDate)} <EmiStageTag stage={next.stage} />
            </span>
          ) : (
            'The loan is repaid'
          ),
        )}
        {stat(
          'Overdue',
          loan.overdueCount ? (
            <Typography.Text type="danger" translate="no">
              {formatINR(loan.overdueAmount)}
            </Typography.Text>
          ) : (
            'None'
          ),
          loan.overdueCount ? `${loan.overdueCount} EMI${loan.overdueCount === 1 ? '' : 's'} past their date` : 'Every EMI paid on time',
        )}
      </Row>
      <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
        <Col xs={24} lg={14}>
          <Card size="small" title={<Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>Terms</Typography.Title>} style={{ height: '100%' }}>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: 'amount', label: 'Amount', children: <span translate="no">{formatINR(loan.amount, true)}</span> },
                { key: 'rate', label: 'Rate', children: `${toNumber(loan.ratePct)}% a year` },
                { key: 'tenure', label: 'Tenure', children: `${loan.tenureMonths} months` },
                { key: 'emi', label: 'EMI', children: <span translate="no">{formatINR(loan.emi, true)}</span> },
                { key: 'sanction', label: 'Sanctioned on', children: formatDate(loan.sanctionDate) },
                { key: 'first', label: 'First EMI', children: formatDate(loan.firstEmiDate) },
                { key: 'disbursal', label: 'Paid out to', children: LOAN_DISBURSAL_LABELS[loan.disbursal] },
                { key: 'by', label: 'Recorded by', children: loan.createdByName },
                ...(loan.note ? [{ key: 'note', label: 'Note', span: 2, children: loan.note }] : []),
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={<Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>The machine’s cost of finance</Typography.Title>} style={{ height: '100%' }}>
            <Descriptions
              size="small"
              column={1}
              items={[
                { key: 'paid', label: 'Interest paid', children: <span translate="no">{formatINR(loan.interestPaid, true)}</span> },
                { key: 'hours', label: 'Hours worked since the loan', children: `${formatQty(loan.hoursWorked)} h` },
                { key: 'perHour', label: 'Interest a working hour', children: loan.interestPerHour ? <span translate="no">{formatINR(loan.interestPerHour, true)}</span> : 'No hours logged yet' },
                { key: 'toCome', label: 'Interest still to come', children: <span translate="no">{formatINR(loan.interestToCome, true)}</span> },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Card size="small" title={<Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>EMI schedule</Typography.Title>}>
        <Table<LoanEmiDto>
          size="small"
          rowKey="id"
          dataSource={loan.emis}
          pagination={loan.emis.length > 24 ? { pageSize: 24, showSizeChanger: false, defaultCurrent: Math.floor(((next?.no ?? loan.emis.length) - 1) / 24) + 1 } : false}
          scroll={{ x: 900 }}
          columns={[
            { key: 'no', title: 'No.', dataIndex: 'no', width: 60, align: 'right' },
            { key: 'due', title: 'Due', width: 120, render: (_, e) => formatDate(e.dueDate) },
            { key: 'opening', title: 'Owed before', align: 'right', render: (_, e) => <span translate="no">{formatINR(e.opening, true)}</span> },
            { key: 'principal', title: 'Principal', align: 'right', render: (_, e) => <span translate="no">{formatINR(e.principal, true)}</span> },
            { key: 'interest', title: 'Interest', align: 'right', render: (_, e) => <span translate="no">{formatINR(e.interest, true)}</span> },
            { key: 'emi', title: 'EMI', align: 'right', render: (_, e) => <span translate="no">{formatINR(e.emi, true)}</span> },
            { key: 'closing', title: 'Owed after', align: 'right', render: (_, e) => <span translate="no">{formatINR(e.closing, true)}</span> },
            {
              key: 'stage',
              title: 'Paid',
              width: 240,
              render: (_, e) =>
                e.paidOn ? (
                  <Flex vertical gap={0}>
                    <span>
                      <EmiStageTag stage="PAID" /> {formatDate(e.paidOn)}
                    </span>
                    <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {[e.mode ? PAYMENT_MODE_LABELS[e.mode] : null, e.reference].filter(Boolean).join(' · ')}
                    </Typography.Text>
                  </Flex>
                ) : (
                  <EmiStageTag stage={e.stage} />
                ),
            },
          ]}
        />
      </Card>
      <LoanFormModal open={editing} loan={loan} onClose={() => setEditing(false)} />
      <PayEmiModal loan={paying ? loan : null} close={paying === 'close'} onClose={() => setPaying(null)} />
      {deleteDialog}
    </div>
  );
}
