'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Checkbox, Form, Input, Popconfirm, Select, Space, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { SalaryStructureDto, TaxRegime } from '@erp/shared';
import { TAX_REGIMES, TAX_REGIME_LABELS, canRunPayroll } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployees, usePayrollAction, useSalaryStructures } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { Rupees } from './payrollUi';

interface Values {
  employeeId: string;
  effectiveFrom: dayjs.Dayjs;
  basic: number;
  da?: number;
  hra?: number;
  conveyance?: number;
  special?: number;
  otherEarnings?: number;
  pf: boolean;
  esi: boolean;
  pt: boolean;
  taxRegime: TaxRegime;
  declaredDeductions?: number;
  otherIncome?: number;
  note?: string;
}

const EARNINGS = [
  ['basic', 'Basic'],
  ['da', 'Dearness allowance'],
  ['hra', 'House rent allowance'],
  ['conveyance', 'Conveyance'],
  ['special', 'Special allowance'],
  ['otherEarnings', 'Other allowances'],
] as const;

/** Set an employee's salary from a date: earnings a month, what is deducted, and their tax regime. */
export function StructureForm({ open, onClose, from }: { open: boolean; onClose: () => void; from?: SalaryStructureDto | null }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { data: staff } = useEmployees({ pageSize: 500, sortBy: 'fullName' }, open);
  const save = usePayrollAction<SalaryStructureDto>();
  const values = Form.useWatch([], form) as Partial<Values> | undefined;
  const gross = EARNINGS.reduce((t, [k]) => t + Number(values?.[k] ?? 0), 0);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    const start = dayjs().add(1, 'month').startOf('month');
    form.setFieldsValue(
      from
        ? {
            employeeId: from.employeeId,
            effectiveFrom: start,
            ...Object.fromEntries(EARNINGS.map(([k]) => [k, Number(from[k])])),
            pf: from.pf,
            esi: from.esi,
            pt: from.pt,
            taxRegime: from.taxRegime,
            declaredDeductions: Number(from.declaredDeductions),
            otherIncome: Number(from.otherIncome),
          }
        : { effectiveFrom: start, pf: true, esi: true, pt: true, taxRegime: 'NEW' },
    );
  }, [open, from, form]);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={640}
      projectDefault={false}
      title={from ? `New salary for ${from.employeeName}` : 'New salary'}
      okText="Save salary"
      onSubmit={async (v) => {
        const s = await save.mutateAsync({ path: '/payroll/structures', body: { ...v, effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'), note: v.note?.trim() || null } });
        message.success(`${s.employeeName}: ${formatINR(s.gross)} a month from ${formatDate(s.effectiveFrom)}, CTC ${formatINR(s.ctcAnnual)} a year`);
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Who and from when">
          <FormGrid cols={2}>
            <Form.Item name="employeeId" label="Employee" rules={[{ required: true, message: 'Choose the employee' }]}>
              <Select disabled={!!from} showSearch={{ optionFilterProp: 'label' }} options={(staff?.items ?? []).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))} />
            </Form.Item>
            <Form.Item name="effectiveFrom" label="From" rules={[{ required: true, message: 'Choose the first day it applies' }]} extra="Usually the 1st of a month">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Earnings a month">
          <FormGrid cols={2}>
            {EARNINGS.map(([k, label]) => (
              <Form.Item key={k} name={k} label={label} rules={k === 'basic' ? [{ required: true, message: 'Enter the basic pay' }] : []}>
                <MoneyInput />
              </Form.Item>
            ))}
          </FormGrid>
          <Typography.Text>
            Gross a month <strong translate="no">{formatINR(gross)}</strong>, a year <span translate="no">{formatINR(gross * 12)}</span>
          </Typography.Text>
        </FormSection>
        <FormSection title="Deductions and tax">
          <Space wrap size="large" style={{ marginBottom: 12 }}>
            <Form.Item name="pf" valuePropName="checked" noStyle>
              <Checkbox>Provident fund</Checkbox>
            </Form.Item>
            <Form.Item name="esi" valuePropName="checked" noStyle>
              <Checkbox>ESI (while gross is within the limit)</Checkbox>
            </Form.Item>
            <Form.Item name="pt" valuePropName="checked" noStyle>
              <Checkbox>Professional tax</Checkbox>
            </Form.Item>
          </Space>
          <FormGrid cols={2}>
            <Form.Item name="taxRegime" label="Income tax regime">
              <Select options={TAX_REGIMES.map((t) => ({ value: t, label: TAX_REGIME_LABELS[t] }))} />
            </Form.Item>
            <Form.Item name="otherIncome" label="Other income this year (optional)" extra="Salary from an earlier employer, for TDS">
              <MoneyInput />
            </Form.Item>
            {values?.taxRegime === 'OLD' && (
              <Form.Item name="declaredDeductions" label="Deductions declared for the year" extra="80C beyond PF, 80D, home loan interest: what is allowed">
                <MoneyInput />
              </Form.Item>
            )}
          </FormGrid>
          <Form.Item name="note" label="Note (optional)">
            <Input maxLength={300} placeholder="For example, after the April increment" />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** One employee's salaries over time. */
function History({ employeeId, admin }: { employeeId: string; admin: boolean }) {
  const { message } = App.useApp();
  const { data } = useSalaryStructures(employeeId);
  const act = usePayrollAction();
  return (
    <Table<SalaryStructureDto>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={data ?? []}
      columns={[
        { title: 'From', dataIndex: 'effectiveFrom', width: 120, render: (v: string) => formatDate(v) },
        { title: 'Basic', dataIndex: 'basic', align: 'right', render: (v: string) => <Rupees value={v} /> },
        { title: 'Gross a month', dataIndex: 'gross', align: 'right', render: (v: string) => <Rupees value={v} /> },
        { title: 'CTC a year', dataIndex: 'ctcAnnual', align: 'right', render: (v: string) => <Rupees value={v} /> },
        { title: 'Note', dataIndex: 'note', ellipsis: true },
        {
          title: '',
          key: 'x',
          width: 90,
          render: (_, s) =>
            admin ? (
              <Popconfirm
                title="Remove this salary?"
                okText="Remove"
                onConfirm={() =>
                  act
                    .mutateAsync({ method: 'delete', path: `/payroll/structures/${s.id}` })
                    .then(() => message.success('Salary removed'))
                    .catch((err) => message.error(errorMessage(err, 'Could not remove it. Try again.')))
                }
              >
                <Button size="small" danger aria-label={`Remove the salary from ${formatDate(s.effectiveFrom)}`}>
                  Remove
                </Button>
              </Popconfirm>
            ) : null,
        },
      ]}
    />
  );
}

/** Each employee's salary in force today, with PF, ESI and TDS a month and the CTC; a row opens its history. */
export function Salaries() {
  const { user } = useAuth();
  const admin = !!user && canRunPayroll(user.roleKey);
  const { data, isLoading, error, refetch } = useSalaryStructures();
  const [editing, setEditing] = useState<{ from: SalaryStructureDto | null } | null>(null);

  const columns: TableProps<SalaryStructureDto>['columns'] = [
    { title: 'Code', dataIndex: 'employeeCode', width: 96, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Name', dataIndex: 'employeeName', width: 180, ellipsis: true, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'From', dataIndex: 'effectiveFrom', width: 120, render: (v: string) => formatDate(v) },
    { title: 'Gross a month', dataIndex: 'gross', width: 130, align: 'right', render: (v: string) => <Rupees value={v} /> },
    { title: 'PF', dataIndex: 'employeePf', width: 90, align: 'right', render: (v: string) => <Rupees value={v} /> },
    { title: 'ESI', dataIndex: 'employeeEsi', width: 80, align: 'right', render: (v: string) => (Number(v) ? <Rupees value={v} /> : '-') },
    { title: 'TDS a month', dataIndex: 'monthlyTds', width: 120, align: 'right', render: (v: string) => (Number(v) ? <Rupees value={v} /> : '-') },
    { title: 'Regime', dataIndex: 'taxRegime', width: 110, render: (v: TaxRegime) => TAX_REGIME_LABELS[v] },
    { title: 'CTC a year', dataIndex: 'ctcAnnual', width: 140, align: 'right', render: (v: string) => <Rupees value={v} /> },
    ...(admin
      ? [
          {
            title: '',
            key: 'raise',
            width: 120,
            render: (_: unknown, s: SalaryStructureDto) => (
              <Button size="small" onClick={() => setEditing({ from: s })} aria-label={`New salary for ${s.employeeName}`}>
                New salary
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 640 }}>
          Salaries in force today. A raise is a new salary from a date, so earlier months keep what they paid. Expand a row for its history.
        </Typography.Paragraph>
        {admin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ from: null })}>
            New salary
          </Button>
        )}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<SalaryStructureDto>
          rowKey="employeeId"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          pagination={false}
          scroll={{ x: 1200 }}
          expandable={{ expandedRowRender: (s) => <History employeeId={s.employeeId} admin={admin} /> }}
          locale={{ emptyText: 'No salaries yet' }}
        />
      )}
      {admin && <StructureForm open={!!editing} onClose={() => setEditing(null)} from={editing?.from} />}
    </div>
  );
}
