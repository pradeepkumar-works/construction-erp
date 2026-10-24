'use client';

import React, { useState } from 'react';
import { App, Button, Checkbox, Descriptions, Form, Input, InputNumber, Select, Typography } from 'antd';
import { EditOutlined } from '@/components/common/icons';
import type { PaidDaysBasis, PayrollSettingsDto } from '@erp/shared';
import { GST_STATES, PAID_DAYS_BASES, PAID_DAYS_BASIS_LABELS, PT_RULES, canRunPayroll } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { usePayrollAction, usePayrollSettings } from '@/lib/queries';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { Rupees } from './payrollUi';

type Values = Omit<PayrollSettingsDto, 'pfEmployeePct' | 'pfEmployerPct' | 'epsPct' | 'pfWageCeiling' | 'esiEmployeePct' | 'esiEmployerPct' | 'esiGrossCeiling' | 'overtimeMultiplier'> & {
  pfEmployeePct: number;
  pfEmployerPct: number;
  epsPct: number;
  pfWageCeiling: number;
  esiEmployeePct: number;
  esiEmployerPct: number;
  esiGrossCeiling: number;
  overtimeMultiplier: number;
};

const PT_STATE_OPTIONS = [{ value: '', label: 'None' }, ...Object.keys(PT_RULES).map((c) => ({ value: c, label: GST_STATES[c] ?? c }))];
const pct = (v: string) => `${Number(v)}%`;

function SettingsForm({ open, onClose, s }: { open: boolean; onClose: () => void; s: PayrollSettingsDto }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = usePayrollAction<PayrollSettingsDto>();
  const pctInput = (label: string) => <InputNumber min={0} max={100} step={0.01} suffix="%" style={{ width: '100%' }} aria-label={label} />;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={640}
      projectDefault={false}
      title="Payroll settings"
      okText="Save settings"
      onSubmit={async (v) => {
        await save.mutateAsync({ method: 'put', path: '/payroll/settings', body: { ...v, ptState: v.ptState || null, debitAccountNo: v.debitAccountNo?.trim() || null, debitBankName: v.debitBankName?.trim() || null } });
        message.success('Payroll settings saved. Runs prepared from now use them.');
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          ...s,
          ptState: s.ptState ?? '',
          pfEmployeePct: Number(s.pfEmployeePct),
          pfEmployerPct: Number(s.pfEmployerPct),
          epsPct: Number(s.epsPct),
          pfWageCeiling: Number(s.pfWageCeiling),
          esiEmployeePct: Number(s.esiEmployeePct),
          esiEmployerPct: Number(s.esiEmployerPct),
          esiGrossCeiling: Number(s.esiGrossCeiling),
          overtimeMultiplier: Number(s.overtimeMultiplier),
        }}
      >
        <FormSection title="Provident fund">
          <FormGrid cols={3}>
            <Form.Item name="pfEmployeePct" label="Employee share">
              {pctInput('Employee share of PF')}
            </Form.Item>
            <Form.Item name="pfEmployerPct" label="Company share">
              {pctInput('Company share of PF')}
            </Form.Item>
            <Form.Item name="epsPct" label="Of which pension (EPS)">
              {pctInput('Pension share')}
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="pfWageCeiling" label="Wage ceiling a month">
              <MoneyInput />
            </Form.Item>
            <Form.Item name="pfCapAtCeiling" valuePropName="checked" label="Above the ceiling">
              <Checkbox>Take PF on the ceiling only</Checkbox>
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="ESI">
          <FormGrid cols={3}>
            <Form.Item name="esiEmployeePct" label="Employee share">
              {pctInput('Employee share of ESI')}
            </Form.Item>
            <Form.Item name="esiEmployerPct" label="Company share">
              {pctInput('Company share of ESI')}
            </Form.Item>
            <Form.Item name="esiGrossCeiling" label="Gross up to">
              <MoneyInput />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Pay and tax">
          <FormGrid cols={2}>
            <Form.Item name="ptState" label="Professional tax state">
              <Select showSearch={{ optionFilterProp: 'label' }} options={PT_STATE_OPTIONS} />
            </Form.Item>
            <Form.Item name="paidDaysBasis" label="A day's pay is the month divided by">
              <Select options={PAID_DAYS_BASES.map((b) => ({ value: b, label: PAID_DAYS_BASIS_LABELS[b] }))} />
            </Form.Item>
            <Form.Item name="overtimeMultiplier" label="Overtime pays" extra="Times the hourly rate; the Factories Act says 2">
              <InputNumber min={1} max={4} step={0.25} suffix="×" style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Bank file">
          <FormGrid cols={2}>
            <Form.Item name="debitAccountNo" label="Salary paid from account" rules={[{ pattern: /^\d{6,18}$/, message: 'Enter the 6 to 18 digit account number' }]}>
              <Input inputMode="numeric" maxLength={18} translate="no" />
            </Form.Item>
            <Form.Item name="debitBankName" label="Bank">
              <Input maxLength={80} />
            </Form.Item>
          </FormGrid>
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** The company's PF, ESI, professional tax and pay rules, and the account salaries go from. */
export function PayrollSettings() {
  const { user } = useAuth();
  const admin = !!user && canRunPayroll(user.roleKey);
  const { data: s, isLoading, error, refetch } = usePayrollSettings();
  const [editing, setEditing] = useState(false);
  if (isLoading) return <PageSkeleton shape="record" />;
  if (error || !s) return <QueryError error={error} onRetry={() => refetch()} />;
  return (
    <div style={{ padding: 16, maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 640 }}>
          Every run uses these when it is prepared or worked out again. Runs already approved keep what they paid.
        </Typography.Paragraph>
        {admin && (
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
            Change settings
          </Button>
        )}
      </div>
      <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label="PF">
          {pct(s.pfEmployeePct)} employee, {pct(s.pfEmployerPct)} company ({pct(s.epsPct)} to pension)
        </Descriptions.Item>
        <Descriptions.Item label="PF wages">
          {s.pfCapAtCeiling ? 'Up to ' : 'All, ceiling '}
          <Rupees value={s.pfWageCeiling} />
        </Descriptions.Item>
        <Descriptions.Item label="ESI">
          {pct(s.esiEmployeePct)} employee, {pct(s.esiEmployerPct)} company
        </Descriptions.Item>
        <Descriptions.Item label="ESI for gross up to">
          <Rupees value={s.esiGrossCeiling} />
        </Descriptions.Item>
        <Descriptions.Item label="Professional tax">{s.ptState ? (GST_STATES[s.ptState] ?? s.ptState) : 'None'}</Descriptions.Item>
        <Descriptions.Item label="A day's pay">Month divided by {PAID_DAYS_BASIS_LABELS[s.paidDaysBasis as PaidDaysBasis].toLowerCase()}</Descriptions.Item>
        <Descriptions.Item label="Overtime">{Number(s.overtimeMultiplier)} times the hourly rate</Descriptions.Item>
        <Descriptions.Item label="Salary paid from">
          <span translate="no">{s.debitAccountNo ? `${s.debitBankName ?? 'Account'} ${s.debitAccountNo}` : 'Not set: the bank file needs it'}</span>
        </Descriptions.Item>
      </Descriptions>
      {admin && <SettingsForm open={editing} onClose={() => setEditing(false)} s={s} />}
    </div>
  );
}
