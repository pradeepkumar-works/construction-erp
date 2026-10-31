'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Drawer, Dropdown, Form, Input, Popconfirm, Space, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import type { TableProps } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { PayrollRunDetailDto, PayslipDto } from '@erp/shared';
import { PAYSLIP_CODES } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePayrollAction, usePayrollRun, type PayrollFileDto } from '@/lib/queries';
import { downloadXlsx } from '@/lib/exportExcel';
import { formatDate, formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { PayslipModal } from './PayslipModal';
import { RunStatusTag, Rupees, monthLabel, saveText } from './payrollUi';
import { openPayslips } from './payslipPrint';

const amount = (p: PayslipDto, code: string) => Number(p.lines.find((l) => l.code === code)?.amount ?? 0);

/** Send back with a note, or mark paid with the date and the bank's reference. */
function StepModal({ run, step, onClose }: { run: PayrollRunDetailDto; step: 'send-back' | 'pay' | null; onClose: () => void }) {
  const [form] = Form.useForm<{ note?: string; paidOn?: dayjs.Dayjs; paymentRef?: string }>();
  const { message } = App.useApp();
  const act = usePayrollAction();
  return (
    <FormShell
      open={!!step}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title={step === 'pay' ? `Mark ${run.runNo} paid` : `Send ${run.runNo} back to HR`}
      okText={step === 'pay' ? 'Mark paid' : 'Send back'}
      onSubmit={async (v) => {
        if (step === 'pay') await act.mutateAsync({ path: `/payroll/runs/${run.id}/pay`, body: { paidOn: v.paidOn!.format('YYYY-MM-DD'), paymentRef: v.paymentRef?.trim() || null } });
        else await act.mutateAsync({ path: `/payroll/runs/${run.id}/send-back`, body: { note: v.note?.trim() } });
        message.success(step === 'pay' ? `${run.runNo} marked paid` : `${run.runNo} sent back to HR`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ paidOn: dayjs() }}>
        {step === 'pay' ? (
          <>
            <Form.Item name="paidOn" label="Paid on" rules={[{ required: true, message: 'Choose the day the bank paid it' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="paymentRef" label="Bank reference (optional)">
              <Input maxLength={80} placeholder="NEFT batch or UTR" />
            </Form.Item>
          </>
        ) : (
          <Form.Item name="note" label="What needs changing" rules={[{ required: true, whitespace: true, message: 'Say what needs changing' }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        )}
      </Form>
    </FormShell>
  );
}

/**
 * A salary run (v6 item 100): its totals and stage, the actions for the caller's role, the files for the bank, PF and
 * ESI, the salary register, and every payslip.
 */
export function RunDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { data: run, error, refetch } = usePayrollRun(id);
  const act = usePayrollAction();
  const [slipFor, setSlipFor] = useState<string | null>(null);
  const [step, setStep] = useState<'send-back' | 'pay' | null>(null);
  const slip = run?.payslips.find((p) => p.employeeId === slipFor) ?? null;
  const company = user?.organizationName ?? '';

  const run_ = (path: string, done: string) =>
    act
      .mutateAsync({ path })
      .then(() => message.success(done))
      .catch((err) => message.error(errorMessage(err, 'That did not go through. Try again.')));

  const file = async (kind: 'bank-file' | 'ecr' | 'esi') => {
    try {
      const f = (await api.get<PayrollFileDto>(`/payroll/runs/${id}/${kind}`)).data;
      saveText(f.fileName, f.mimeType, f.content);
      if (f.missing.length) message.warning(`Left out for missing details: ${f.missing.join(', ')}. Add them on the staff record.`);
    } catch (err) {
      message.error(errorMessage(err, 'Could not make the file. Try again.'));
    }
  };

  const register = () =>
    run &&
    downloadXlsx(`${run.runNo}-register.xlsx`, 'Salary register', [
      { header: 'Code', value: (p: PayslipDto) => p.employeeCode, width: 10 },
      { header: 'Name', value: (p) => p.employeeName, width: 24 },
      { header: 'Designation', value: (p) => p.designation, width: 20 },
      { header: 'Posted at', value: (p) => p.projectName ?? 'Head office', width: 28 },
      { header: 'Days paid', value: (p) => Number(p.paidDays) },
      { header: 'Loss of pay', value: (p) => Number(p.lopDays) },
      ...(['BASIC', 'DA', 'HRA', 'CONVEYANCE', 'SPECIAL', 'OTHER', 'OVERTIME', 'ARREARS', 'BONUS', 'OTHER_EARNING'] as const).map((c) => ({ header: c === 'DA' || c === 'HRA' ? c : PAYSLIP_CODES[c].label, value: (p: PayslipDto) => amount(p, c) })),
      { header: 'Gross', value: (p) => Number(p.gross) },
      ...(['PF', 'ESI', 'PT', 'TDS', 'LOAN', 'ADVANCE', 'OTHER_DEDUCTION'] as const).map((c) => ({ header: c === 'OTHER_DEDUCTION' ? 'Other deduction' : c === 'LOAN' ? 'Loan' : c === 'ADVANCE' ? 'Advance' : c, value: (p: PayslipDto) => amount(p, c) })),
      { header: 'Deductions', value: (p) => Number(p.deductions) },
      { header: 'Net pay', value: (p) => Number(p.net) },
      { header: 'Employer PF', value: (p) => amount(p, 'PF_EMPLOYER') + amount(p, 'EPS_EMPLOYER') },
      { header: 'Employer ESI', value: (p) => amount(p, 'ESI_EMPLOYER') },
      { header: 'Bank account', value: (p) => p.bankAccountNo, width: 18 },
      { header: 'IFSC', value: (p) => p.bankIfsc, width: 12 },
      { header: 'UAN', value: (p) => p.uan, width: 14 },
    ], run.payslips);

  const columns: TableProps<PayslipDto>['columns'] = [
    { title: 'Code', dataIndex: 'employeeCode', width: 96, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Name', dataIndex: 'employeeName', width: 180, ellipsis: true, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Days paid', dataIndex: 'paidDays', width: 90, align: 'right', render: (v: string, p) => `${v}${Number(p.lopDays) ? ` (−${p.lopDays})` : ''}` },
    { title: 'Gross', dataIndex: 'gross', width: 120, align: 'right', render: (v: string) => <Rupees value={v} /> },
    { title: 'Deductions', dataIndex: 'deductions', width: 120, align: 'right', render: (v: string) => <Rupees value={v} /> },
    { title: 'Net pay', dataIndex: 'net', width: 120, align: 'right', render: (v: string) => <strong><Rupees value={v} /></strong> },
  ];
  const monthOpen = run ? dayjs(`${run.month}-01`).endOf('month').isAfter(dayjs(), 'day') : false;

  return (
    <Drawer open={!!id} onClose={onClose} size={880} title={run ? `${run.runNo}: ${monthLabel(run.month)}${run.projectName ? `, ${run.projectName}` : ''}` : 'Salary run'}>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {run && (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {run.reviewNote && run.status === 'DRAFT' && <Alert type="warning" showIcon title="Sent back" description={run.reviewNote} />}
          {run.status === 'DRAFT' && monthOpen && <Alert type="info" showIcon title={`${monthLabel(run.month)} is not over yet. Days still to come are paid in full; work the run out again after the month ends.`} />}
          {run.skipped.length > 0 && (
            <Alert
              type="warning"
              showIcon
              title={`${run.skipped.length} on the rolls left out: no salary structure`}
              description={run.skipped.map((s) => `${s.fullName} (${s.employeeCode})`).join(', ') + '. Set their salary under Salaries, then work the run out again.'}
            />
          )}
          <Descriptions size="small" bordered column={{ xs: 1, sm: 2, lg: 3 }}>
            <Descriptions.Item label="Stage">
              <RunStatusTag status={run.status} />
            </Descriptions.Item>
            <Descriptions.Item label="Employees">{run.employees}</Descriptions.Item>
            <Descriptions.Item label="Net pay">
              <strong>
                <Rupees value={run.net} />
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label="Gross">
              <Rupees value={run.gross} />
            </Descriptions.Item>
            <Descriptions.Item label="Deductions">
              <Rupees value={run.deductions} />
            </Descriptions.Item>
            <Descriptions.Item label="Cost to company">
              <Rupees value={run.employerCost} />
            </Descriptions.Item>
            <Descriptions.Item label="Prepared by">{run.preparedByName}</Descriptions.Item>
            <Descriptions.Item label="Approved by">{run.approvedByName ? `${run.approvedByName}, ${formatDateTime(run.approvedAt)}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="Paid">{run.paidOn ? `${formatDate(run.paidOn)}${run.paymentRef ? `, ${run.paymentRef}` : ''}` : '-'}</Descriptions.Item>
          </Descriptions>
          <Space wrap>
            {run.can.edit && (
              <Button loading={act.isPending} onClick={() => run_(`/payroll/runs/${run.id}/recompute`, 'Worked out again from attendance and salaries')}>
                Recalculate
              </Button>
            )}
            {run.can.submit && (
              <Button type="primary" loading={act.isPending} onClick={() => run_(`/payroll/runs/${run.id}/submit`, `${run.runNo} submitted for approval`)}>
                Submit for approval
              </Button>
            )}
            {run.can.approve && (
              <Button type="primary" loading={act.isPending} onClick={() => run_(`/payroll/runs/${run.id}/approve`, `${run.runNo} approved`)}>
                Approve
              </Button>
            )}
            {(run.can.approve || run.can.pay) && <Button onClick={() => setStep('send-back')}>Send back</Button>}
            {run.can.pay && (
              <Button type="primary" onClick={() => setStep('pay')}>
                Mark paid
              </Button>
            )}
            {run.can.remove && (
              <Popconfirm
                title={`Delete ${run.runNo}?`}
                description="Its payslips go with it. Loans are not touched."
                okText="Delete"
                onConfirm={() =>
                  act
                    .mutateAsync({ method: 'delete', path: `/payroll/runs/${run.id}` })
                    .then(() => {
                      message.success(`${run.runNo} deleted`);
                      onClose();
                    })
                    .catch((err) => message.error(errorMessage(err, 'Could not delete it. Try again.')))
                }
              >
                <Button danger>Delete</Button>
              </Popconfirm>
            )}
            <Dropdown
              menu={{
                items: [
                  { key: 'register', label: 'Salary register (Excel)', onClick: () => register() },
                  { key: 'bank', label: 'Bank transfer file (CSV)', disabled: run.status !== 'APPROVED' && run.status !== 'PAID', onClick: () => file('bank-file') },
                  { key: 'ecr', label: 'PF return (ECR)', onClick: () => file('ecr') },
                  { key: 'esi', label: 'ESI contributions (CSV)', onClick: () => file('esi') },
                ],
              }}
            >
              <Button icon={<DownloadOutlined />}>Download files</Button>
            </Dropdown>
            <Button icon={<PrinterOutlined />} disabled={!run.payslips.length} onClick={() => openPayslips(run.payslips, company)}>
              Print payslips
            </Button>
          </Space>
          <Table<PayslipDto>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={run.payslips}
            pagination={false}
            scroll={{ x: 726, y: 480 }}
            onRow={(p) => ({ onClick: () => setSlipFor(p.employeeId), style: { cursor: 'pointer' } })}
            locale={{ emptyText: 'No payslips: set salaries first' }}
          />
          <Typography.Text type="secondary">Open a payslip to see its lines{run.can.edit ? ' or add arrears, a bonus or a deduction' : ''}.</Typography.Text>
        </Space>
      )}
      <PayslipModal slip={slip} open={!!slip} onClose={() => setSlipFor(null)} editable={run?.can.edit} />
      {run && <StepModal run={run} step={step} onClose={() => setStep(null)} />}
    </Drawer>
  );
}
