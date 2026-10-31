'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Descriptions, Form, Input, Modal, Select, Space, Table, Typography } from 'antd';
import { PrinterOutlined } from '@/components/common/icons';
import type { ManualPayslipCode, PayslipDto, PayslipLineDto } from '@erp/shared';
import { MANUAL_PAYSLIP_CODES, PAYSLIP_CODES } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { formatINR } from '@/lib/format';
import { usePayrollAction } from '@/lib/queries';
import { FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput } from '@/components/form/inputs';
import { Rupees, monthLabel } from './payrollUi';
import { openPayslips } from './payslipPrint';

interface AdjustValues {
  lines: { code: ManualPayslipCode; label?: string; amount: number }[];
}

/** Arrears, bonus and other earnings or deductions HR adds to a draft payslip by hand. */
function AdjustModal({ open, onClose, slip }: { open: boolean; onClose: () => void; slip: PayslipDto }) {
  const [form] = Form.useForm<AdjustValues>();
  const { message } = App.useApp();
  const save = usePayrollAction<PayslipDto>();
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ lines: slip.lines.filter((l) => l.manual).map((l) => ({ code: l.code as ManualPayslipCode, label: l.label, amount: Number(l.amount) })) });
  }, [open, slip, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={680}
      projectDefault={false}
      title={`Add to ${slip.employeeName}'s payslip`}
      okText="Save and recalculate"
      onSubmit={async (v) => {
        const p = await save.mutateAsync({ method: 'put', path: `/payroll/payslips/${slip.id}/adjustments`, body: { lines: (v.lines ?? []).map((l) => ({ ...l, label: l.label?.trim() || undefined })) } });
        message.success(`Payslip worked out again: net pay ${formatINR(p.net)}`);
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">PF, ESI, professional tax and TDS are worked out again with these lines.</Typography.Paragraph>
        <LineTable
          name="lines"
          label="Payslip"
          addText="Add a line"
          columns={[
            {
              key: 'code',
              title: 'Line type',
              width: 190,
              render: (field) => (
                <Form.Item name={[field.name, 'code']} rules={[{ required: true, message: 'Choose what it is' }]} noStyle>
                  <Select aria-label="What" options={MANUAL_PAYSLIP_CODES.map((c) => ({ value: c, label: PAYSLIP_CODES[c].label }))} style={{ width: '100%' }} />
                </Form.Item>
              ),
            },
            {
              key: 'label',
              title: 'Name on the payslip',
              render: (field) => (
                <Form.Item name={[field.name, 'label']} noStyle>
                  <Input aria-label="Name on the payslip" maxLength={60} placeholder="For example Diwali bonus" />
                </Form.Item>
              ),
            },
            {
              key: 'amount',
              title: 'Amount',
              width: 150,
              align: 'right',
              render: (field) => (
                <Form.Item name={[field.name, 'amount']} rules={[{ required: true, message: 'Enter the amount' }]} noStyle>
                  <MoneyInput aria-label="Amount" min={1} />
                </Form.Item>
              ),
            },
          ]}
          newLine={() => ({ code: 'ARREARS' })}
        />
      </Form>
    </FormShell>
  );
}

const lineCols = [
  { title: 'Line', dataIndex: 'label', render: (v: string, l: PayslipLineDto) => (l.manual ? `${v} (added)` : v) },
  { title: 'Amount', dataIndex: 'amount', align: 'right' as const, width: 130, render: (v: string) => <Rupees value={v} /> },
];

/** One payslip: who, the days paid, earnings and deductions side by side, what the company pays besides, and Print. */
export function PayslipModal({ slip, open, onClose, editable }: { slip: PayslipDto | null; open: boolean; onClose: () => void; editable?: boolean }) {
  const { user } = useAuth();
  const [adjusting, setAdjusting] = useState(false);
  // After a change the run is fetched again and passes the new payslip in.
  const shown = slip;
  if (!shown) return null;
  const of = (kind: PayslipLineDto['kind']) => shown.lines.filter((l) => l.kind === kind);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={760}
      title={`${shown.employeeName}: payslip for ${monthLabel(shown.month)}`}
      footer={
        <Space wrap>
          {editable && <Button onClick={() => setAdjusting(true)}>Add arrears or deductions</Button>}
          <Button icon={<PrinterOutlined />} onClick={() => openPayslips([shown], user?.organizationName ?? '')}>
            Print
          </Button>
          <Button type="primary" onClick={onClose}>
            Close
          </Button>
        </Space>
      }
    >
      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Employee">
          <span translate="no">
            {shown.employeeName} ({shown.employeeCode})
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Designation">{shown.designation}</Descriptions.Item>
        <Descriptions.Item label="Days paid">
          {shown.paidDays} of {shown.monthDays}
          {Number(shown.lopDays) ? `, loss of pay ${shown.lopDays}` : ''}
        </Descriptions.Item>
        <Descriptions.Item label="Overtime">{Number(shown.overtimeHours) ? `${shown.overtimeHours} h` : '-'}</Descriptions.Item>
        <Descriptions.Item label="Gross">
          <Rupees value={shown.gross} />
        </Descriptions.Item>
        <Descriptions.Item label="Net pay">
          <strong>
            <Rupees value={shown.net} />
          </strong>
        </Descriptions.Item>
      </Descriptions>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <Table<PayslipLineDto> rowKey="id" size="small" pagination={false} dataSource={of('EARNING')} columns={[{ ...lineCols[0], title: 'Earnings' }, lineCols[1]]} />
        <Table<PayslipLineDto> rowKey="id" size="small" pagination={false} dataSource={of('DEDUCTION')} columns={[{ ...lineCols[0], title: 'Deductions' }, lineCols[1]]} locale={{ emptyText: 'None' }} />
      </div>
      {of('EMPLOYER').length > 0 && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          The company pays besides:{' '}
          {of('EMPLOYER')
            .map((l) => `${l.label} ${formatINR(l.amount)}`)
            .join(', ')}
          .
        </Typography.Paragraph>
      )}
      {editable && <AdjustModal open={adjusting} onClose={() => setAdjusting(false)} slip={shown} />}
    </Modal>
  );
}
