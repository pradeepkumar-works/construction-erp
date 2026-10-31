'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Form, Input, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import type { TableProps } from 'antd';
import { PrinterOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { FinalSettlementDto } from '@erp/shared';
import { canRunPayroll } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePayrollAction, useSettlements, useSettlementsDue } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { Rupees, SettlementStatusTag } from './payrollUi';
import { openSettlement } from './payslipPrint';

interface PrepareValues {
  otherEarnings?: number;
  otherDeductions?: number;
  note?: string;
}

/** Work out (or again) someone's full and final settlement, with anything else owed either way. */
function PrepareModal({ who, onClose }: { who: { employeeId: string; name: string; from?: FinalSettlementDto } | null; onClose: () => void }) {
  const [form] = Form.useForm<PrepareValues>();
  const { message } = App.useApp();
  const act = usePayrollAction<FinalSettlementDto>();
  const from = who?.from;
  return (
    <FormShell
      open={!!who}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      projectDefault={false}
      title={`Full and final settlement for ${who?.name ?? ''}`}
      okText={from ? 'Prepare again' : 'Prepare settlement'}
      onSubmit={async (v) => {
        const s = await act.mutateAsync({ path: '/payroll/settlements', body: { employeeId: who!.employeeId, otherEarnings: v.otherEarnings ?? 0, otherDeductions: v.otherDeductions ?? 0, note: v.note?.trim() || null } });
        message.success(`${s.settlementNo} worked out: ${Number(s.net) >= 0 ? 'net payable' : 'they owe'} ${formatINR(Math.abs(Number(s.net)))}`);
      }}
    >
      <Form
        key={who?.employeeId}
        form={form}
        layout="vertical"
        initialValues={from ? { otherEarnings: Number(from.otherEarnings), otherDeductions: Number(from.otherDeductions), note: from.note ?? undefined } : undefined}
      >
        <Typography.Paragraph type="secondary">
          The last month&apos;s salary, earned leave not taken, gratuity after five years (four years and nine months is enough), notice not served and loans still owed are worked out from their records.
        </Typography.Paragraph>
        <FormGrid cols={2}>
          <Form.Item name="otherEarnings" label="Anything else owed to them" extra="Bonus, reimbursements">
            <MoneyInput />
          </Form.Item>
          <Form.Item name="otherDeductions" label="Anything else they owe" extra="Equipment not returned">
            <MoneyInput />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

function PayModal({ s, onClose }: { s: FinalSettlementDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ paidOn: dayjs.Dayjs; paymentRef?: string }>();
  const { message } = App.useApp();
  const act = usePayrollAction();
  return (
    <FormShell
      open={!!s}
      onClose={onClose}
      form={form}
      layout="modal"
      width={480}
      projectDefault={false}
      title={`Mark ${s?.settlementNo ?? ''} paid`}
      okText="Mark paid"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/payroll/settlements/${s!.id}/pay`, body: { paidOn: v.paidOn.format('YYYY-MM-DD'), paymentRef: v.paymentRef?.trim() || null } });
        message.success(`${s!.settlementNo} marked paid`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ paidOn: dayjs() }}>
        <Form.Item name="paidOn" label={s && Number(s.net) < 0 ? 'Received on' : 'Paid on'} rules={[{ required: true, message: 'Choose the day it was settled' }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="paymentRef" label="Bank reference">
          <Input maxLength={80} placeholder="UTR or cheque number" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** One settlement: each part, the net either way, and the step the caller may take. */
function SettlementModal({ s, onClose, onRedo, onPay }: { s: FinalSettlementDto | null; onClose: () => void; onRedo: () => void; onPay: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const act = usePayrollAction();
  if (!s) return null;
  const net = Number(s.net);
  const run = (path: string, done: string, method: 'post' | 'delete' = 'post') =>
    act
      .mutateAsync({ method, path })
      .then(() => {
        message.success(done);
        if (method === 'delete') onClose();
      })
      .catch((err) => message.error(errorMessage(err, 'That did not go through. Try again.')));
  return (
    <Modal
      open
      onCancel={onClose}
      width={720}
      title={`${s.settlementNo}: ${s.employeeName}`}
      footer={
        <Space wrap>
          {s.can.edit && (
            <Popconfirm title="Delete this settlement?" okText="Delete" onConfirm={() => run(`/payroll/settlements/${s.id}`, 'Settlement deleted', 'delete')}>
              <Button danger>Delete</Button>
            </Popconfirm>
          )}
          {s.can.edit && <Button onClick={onRedo}>Prepare again</Button>}
          <Button icon={<PrinterOutlined />} onClick={() => openSettlement(s, user?.organizationName ?? '')}>
            Print
          </Button>
          {s.can.approve && (
            <Button type="primary" loading={act.isPending} onClick={() => run(`/payroll/settlements/${s.id}/approve`, `${s.settlementNo} approved`)}>
              Approve
            </Button>
          )}
          {s.can.pay && (
            <Button type="primary" onClick={onPay}>
              Mark paid
            </Button>
          )}
          {!s.can.approve && !s.can.pay && (
            <Button type="primary" onClick={onClose}>
              Close
            </Button>
          )}
        </Space>
      }
    >
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label="Status">
            <SettlementStatusTag status={s.status} />
          </Descriptions.Item>
          <Descriptions.Item label="Designation">{s.designation}</Descriptions.Item>
          <Descriptions.Item label="Joined on">{s.joinedOn ? formatDate(s.joinedOn) : '-'}</Descriptions.Item>
          <Descriptions.Item label="Last working day">{formatDate(s.lastWorkingDay)}</Descriptions.Item>
        </Descriptions>
        <Descriptions size="small" column={1} bordered title="Owed to them">
          <Descriptions.Item label={`Salary, ${s.salaryDays} days`}>
            <Rupees value={s.salary} />
          </Descriptions.Item>
          <Descriptions.Item label={`Leave encashment, ${s.leaveDays} days`}>
            <Rupees value={s.leaveEncashment} />
          </Descriptions.Item>
          <Descriptions.Item label={`Gratuity, ${s.serviceYears} years`}>{Number(s.gratuity) ? <Rupees value={s.gratuity} /> : 'Not yet due (under five years)'}</Descriptions.Item>
          <Descriptions.Item label="Other earnings">
            <Rupees value={s.otherEarnings} />
          </Descriptions.Item>
        </Descriptions>
        <Descriptions size="small" column={1} bordered title="Recovered from them">
          <Descriptions.Item label={`Notice short by ${s.noticeShortDays} days`}>
            <Rupees value={s.noticeRecovery} />
          </Descriptions.Item>
          <Descriptions.Item label="Loans and advances">
            <Rupees value={s.loanRecovery} />
          </Descriptions.Item>
          <Descriptions.Item label="Other deductions">
            <Rupees value={s.otherDeductions} />
          </Descriptions.Item>
        </Descriptions>
        <Alert
          type={net >= 0 ? 'info' : 'warning'}
          showIcon
          title={
            <span>
              {net >= 0 ? 'Net payable to them ' : 'Net they owe the company '}
              <strong>
                <Rupees value={Math.abs(net)} />
              </strong>
            </span>
          }
          description={[
            `Prepared by ${s.preparedByName}`,
            s.approvedByName ? `approved by ${s.approvedByName}` : null,
            s.paidOn ? `settled on ${formatDate(s.paidOn)}${s.paymentRef ? ` (${s.paymentRef})` : ''}` : null,
          ]
            .filter(Boolean)
            .join(', ')}
        />
        {s.note && <Typography.Paragraph style={{ margin: 0 }}>{s.note}</Typography.Paragraph>}
      </Space>
    </Modal>
  );
}

/** Full and final settlements: those who have left and still need one, then every settlement. */
export function Settlements() {
  const { user } = useAuth();
  const hr = !!user && canRunPayroll(user.roleKey);
  const { data, isLoading, error, refetch } = useSettlements();
  const { data: due } = useSettlementsDue(hr);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<{ employeeId: string; name: string; from?: FinalSettlementDto } | null>(null);
  const [paying, setPaying] = useState<FinalSettlementDto | null>(null);
  const shown = data?.find((s) => s.id === openId) ?? null;

  const columns: TableProps<FinalSettlementDto>['columns'] = [
    { title: 'Settlement', dataIndex: 'settlementNo', width: 140, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Employee', key: 'e', width: 220, render: (_, s) => <span translate="no">{`${s.employeeName} (${s.employeeCode})`}</span> },
    { title: 'Last day', dataIndex: 'lastWorkingDay', width: 120, render: (v: string) => formatDate(v) },
    { title: 'Status', dataIndex: 'status', width: 150, render: (v: FinalSettlementDto['status']) => <SettlementStatusTag status={v} /> },
    { title: 'Gratuity', dataIndex: 'gratuity', width: 120, align: 'right', render: (v: string) => (Number(v) ? <Rupees value={v} /> : '-') },
    {
      title: 'Net',
      dataIndex: 'net',
      width: 150,
      align: 'right',
      render: (v: string) => (Number(v) >= 0 ? <Rupees value={v} /> : <span>owes <Rupees value={Math.abs(Number(v))} /></span>),
    },
    { title: 'Settled on', dataIndex: 'paidOn', width: 120, render: (v: string | null) => (v ? formatDate(v) : '-') },
  ];

  return (
    <div style={{ padding: 16 }}>
      {hr && (due?.length ?? 0) > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={`${due!.length} ${due!.length === 1 ? 'person has' : 'people have'} left with no settlement yet`}
          description={
            <Space orientation="vertical" size={4} style={{ width: '100%' }}>
              {due!.map((d) => (
                <div key={d.employeeId} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', minHeight: 32 }}>
                  <span translate="no">
                    {d.fullName} ({d.employeeCode})
                  </span>
                  <Typography.Text type="secondary">
                    {d.designation}
                    {d.leftOn ? `, left ${formatDate(d.leftOn)}` : ''}
                  </Typography.Text>
                  <Button size="small" onClick={() => setPreparing({ employeeId: d.employeeId, name: d.fullName })} aria-label={`Work out ${d.fullName}'s settlement`}>
                    Prepare settlement
                  </Button>
                </div>
              ))}
            </Space>
          }
        />
      )}
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<FinalSettlementDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          pagination={false}
          scroll={{ x: 1020 }}
          onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No settlements yet. When someone leaves, record their exit on the staff record and work it out here.' }}
        />
      )}
      <SettlementModal
        s={shown}
        onClose={() => setOpenId(null)}
        onRedo={() => shown && setPreparing({ employeeId: shown.employeeId, name: shown.employeeName, from: shown })}
        onPay={() => setPaying(shown)}
      />
      {hr && <PrepareModal who={preparing} onClose={() => setPreparing(null)} />}
      <PayModal s={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
