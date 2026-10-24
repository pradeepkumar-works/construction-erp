'use client';

import React, { useState } from 'react';
import { App, Button, DatePicker, Form, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { PayrollRunDetailDto, PayrollRunDto } from '@erp/shared';
import { canRunPayroll } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { usePayrollAction, usePayrollRuns } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { FormShell } from '@/components/form/FormShell';
import { RunDrawer } from './RunDrawer';
import { RunStatusTag, Rupees, monthLabel } from './payrollUi';

/** Prepare a month's run: the company's, or one site's. */
function NewRunModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form] = Form.useForm<{ month: dayjs.Dayjs; projectId?: string | null }>();
  const { message } = App.useApp();
  const act = usePayrollAction<PayrollRunDetailDto>();
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title="Prepare a salary run"
      okText="Prepare"
      onSubmit={async (v) => {
        const run = await act.mutateAsync({ path: '/payroll/runs', body: { month: v.month.format('YYYY-MM'), projectId: v.projectId ?? null } });
        message.success(`${run.runNo} prepared: ${run.employees} payslips`);
        onCreated(run.id);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ month: (dayjs().date() <= 15 ? dayjs().subtract(1, 'month') : dayjs()).startOf('month') }}>
        <Form.Item name="month" label="Month" rules={[{ required: true, message: 'Choose the month' }]}>
          <DatePicker picker="month" format="MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'month')} />
        </Form.Item>
        <Form.Item name="projectId" label="Site (optional)" extra="Leave blank for the whole company. Choose a site to pay its staff on their own run.">
          <ProjectSelect placeholder="Whole company" style={{ width: '100%' }} aria-label="Site" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Salary runs, newest month first: HR prepares, management approves, accounts pays. */
export function SalaryRuns() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = usePayrollRuns();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const runs = !!user && canRunPayroll(user.roleKey);

  const columns: TableProps<PayrollRunDto>['columns'] = [
    { title: 'Run', dataIndex: 'runNo', width: 170, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Month', dataIndex: 'month', width: 140, render: (v: string) => monthLabel(v) },
    { title: 'Staff of', dataIndex: 'projectName', ellipsis: true, render: (v: string | null) => v ?? 'Whole company' },
    { title: 'Stage', dataIndex: 'status', width: 170, render: (v: PayrollRunDto['status']) => <RunStatusTag status={v} /> },
    { title: 'Employees', dataIndex: 'employees', width: 100, align: 'right' },
    { title: 'Net pay', dataIndex: 'net', width: 140, align: 'right', render: (v: string) => <Rupees value={v} /> },
    { title: 'Paid on', dataIndex: 'paidOn', width: 120, render: (v: string | null) => (v ? formatDate(v) : '-') },
  ];
  const newButton = runs ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
      Prepare salary run
    </Button>
  ) : null;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 640 }}>
          Each month&apos;s salary from approved attendance and each person&apos;s salary structure. HR prepares and submits it, management approves it, accounts pays it with the bank file.
        </Typography.Paragraph>
        {newButton}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<PayrollRunDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          pagination={false}
          scroll={{ x: 980 }}
          onRow={(r) => ({ onClick: () => setOpen(r.id), style: { cursor: 'pointer' } })}
          locale={{ emptyText: runs ? 'No salary runs yet. Prepare the first one.' : 'No salary runs yet' }}
        />
      )}
      <RunDrawer id={open} onClose={() => setOpen(null)} />
      {runs && <NewRunModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => setOpen(id)} />}
    </div>
  );
}
