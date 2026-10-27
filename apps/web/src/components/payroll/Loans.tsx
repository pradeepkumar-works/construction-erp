'use client';

import React, { useState } from 'react';
import { App, Button, DatePicker, Form, Input, Popconfirm, Select, Switch, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { StaffLoanDto, StaffLoanKind } from '@erp/shared';
import { STAFF_LOAN_KINDS, STAFF_LOAN_KIND_LABELS, canRunPayroll } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployees, usePayrollAction, useStaffLoans } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { Rupees, monthLabel } from './payrollUi';

interface Values {
  employeeId: string;
  kind: StaffLoanKind;
  issuedOn: dayjs.Dayjs;
  amount: number;
  emi: number;
  startMonth: dayjs.Dayjs;
  note?: string;
}

function LoanForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { data: staff } = useEmployees({ pageSize: 500, sortBy: 'fullName' }, open);
  const save = usePayrollAction<StaffLoanDto>();
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      projectDefault={false}
      title="Record a loan or advance"
      okText="Record"
      onSubmit={async (v) => {
        const l = await save.mutateAsync({ path: '/payroll/loans', body: { ...v, issuedOn: v.issuedOn.format('YYYY-MM-DD'), startMonth: v.startMonth.format('YYYY-MM'), note: v.note?.trim() || null } });
        message.success(`${STAFF_LOAN_KIND_LABELS[l.kind]} for ${l.employeeName} recorded`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ kind: 'ADVANCE', issuedOn: dayjs(), startMonth: dayjs().startOf('month') }}>
        <Form.Item name="employeeId" label="Employee" rules={[{ required: true, message: 'Choose the employee' }]}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={(staff?.items ?? []).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="kind" label="What">
            <Select options={STAFF_LOAN_KINDS.map((k) => ({ value: k, label: STAFF_LOAN_KIND_LABELS[k] }))} />
          </Form.Item>
          <Form.Item name="issuedOn" label="Given on" rules={[{ required: true, message: 'Pick the day it was given' }]}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter the amount given' }]}>
            <MoneyInput min={1} />
          </Form.Item>
          <Form.Item name="emi" label="Recovered each month" rules={[{ required: true, message: 'Enter how much to take from each salary' }]}>
            <MoneyInput min={1} />
          </Form.Item>
          <Form.Item name="startMonth" label="First recovered in" rules={[{ required: true, message: 'Choose the first month' }]}>
            <DatePicker picker="month" format="MMM YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note (optional)">
          <Input maxLength={300} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Loans and salary advances, recovered from salary each month until nothing is left. */
export function Loans() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const admin = !!user && canRunPayroll(user.roleKey);
  const [open, setOpen] = useState(true);
  const { data, isLoading, error, refetch } = useStaffLoans({ open: open || undefined });
  const [creating, setCreating] = useState(false);
  const act = usePayrollAction();

  const columns: TableProps<StaffLoanDto>['columns'] = [
    { title: 'Employee', key: 'e', width: 200, render: (_, l) => <span translate="no">{`${l.employeeName} (${l.employeeCode})`}</span> },
    { title: 'What', dataIndex: 'kind', width: 130, render: (v: StaffLoanKind) => STAFF_LOAN_KIND_LABELS[v] },
    { title: 'Given on', dataIndex: 'issuedOn', width: 120, render: (v: string) => formatDate(v) },
    { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right', render: (v: string) => <Rupees value={v} /> },
    { title: 'A month', dataIndex: 'emi', width: 110, align: 'right', render: (v: string) => <Rupees value={v} /> },
    { title: 'From', dataIndex: 'startMonth', width: 140, render: (v: string) => monthLabel(v) },
    { title: 'Recovered', dataIndex: 'recovered', width: 120, align: 'right', render: (v: string) => <Rupees value={v} /> },
    { title: 'Left', dataIndex: 'balance', width: 120, align: 'right', render: (v: string) => <strong><Rupees value={v} /></strong> },
    {
      title: '',
      key: 'x',
      width: 100,
      render: (_, l) =>
        admin && Number(l.recovered) === 0 ? (
          <Popconfirm
            title="Delete this entry?"
            okText="Delete"
            onConfirm={() =>
              act
                .mutateAsync({ method: 'delete', path: `/payroll/loans/${l.id}` })
                .then(() => message.success('Deleted'))
                .catch((err) => message.error(errorMessage(err, 'Could not delete it. Try again.')))
            }
          >
            <Button size="small" danger aria-label={`Delete ${l.employeeName}'s ${STAFF_LOAN_KIND_LABELS[l.kind].toLowerCase()}`}>
              Delete
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Switch checked={open} onChange={setOpen} aria-labelledby="loans-open-only" />
          <Typography.Text id="loans-open-only">Only those with something left</Typography.Text>
        </span>
        {admin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Record a loan or advance
          </Button>
        )}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<StaffLoanDto> rowKey="id" size="small" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} scroll={{ x: 1160 }} locale={{ emptyText: 'No loans or advances' }} />
      )}
      {admin && <LoanForm open={creating} onClose={() => setCreating(false)} />}
    </div>
  );
}
