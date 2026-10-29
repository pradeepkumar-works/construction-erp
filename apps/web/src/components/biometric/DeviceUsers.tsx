'use client';

import React, { useState } from 'react';
import { App, Button, Dropdown, Form, Input, Segmented, Select, Space, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import type { BiometricUserDto } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useBiometricAction, useBiometricUsers, useEmployees, useWorkers } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { MoreOutlined } from '@/components/common/icons';
import { DeviceUserForm, OnDevicesTag } from './DeviceCommands';

interface Values {
  pin: string;
  kind: 'employee' | 'worker';
  employeeId?: string;
  workerId?: string;
}

/** Match a user number to an employee or a worker; its punches of the last two months then mark attendance. */
function MatchModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: BiometricUserDto | null }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const act = useBiometricAction<{ pin: string; marked: number }>();
  const kind = Form.useWatch('kind', form) ?? (user?.workerId ? 'worker' : 'employee');
  const { data: staff } = useEmployees({ pageSize: 500, sortBy: 'fullName' }, open);
  const { data: workers } = useWorkers({ pageSize: 500, active: true });
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title={user ? `Who is user number ${user.pin}?` : 'Match a user number'}
      okText="Match"
      onSubmit={async (v) => {
        const r = await act.mutateAsync({ method: 'put', path: `/biometric/users/${encodeURIComponent(v.pin.trim())}`, body: v.kind === 'employee' ? { employeeId: v.employeeId, workerId: null } : { workerId: v.workerId, employeeId: null } });
        message.success(r.marked ? `User number ${r.pin} matched; ${r.marked} ${r.marked === 1 ? 'day' : 'days'} of punches marked` : `User number ${r.pin} matched`);
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ pin: user?.pin, kind: user?.workerId ? 'worker' : 'employee', employeeId: user?.employeeId ?? undefined, workerId: user?.workerId ?? undefined }}
      >
        <Form.Item name="pin" label="User number on the device" rules={[{ required: true, whitespace: true, message: 'Enter the user number the person is enrolled under' }]}>
          <Input disabled={!!user} maxLength={20} translate="no" />
        </Form.Item>
        <Form.Item name="kind" label="They are">
          <Segmented options={[{ value: 'employee', label: 'An employee' }, { value: 'worker', label: 'A worker' }]} />
        </Form.Item>
        {kind === 'employee' ? (
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true, message: 'Choose the employee' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={(staff?.items ?? []).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))} />
          </Form.Item>
        ) : (
          <Form.Item name="workerId" label="Worker" rules={[{ required: true, message: 'Choose the worker' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={(workers?.items ?? []).map((w) => ({ value: w.id, label: `${w.name} (${w.workerNo}, ${w.contractor})` }))} />
          </Form.Item>
        )}
      </Form>
    </FormShell>
  );
}

/** User numbers on the devices: who each is, or that nobody is matched yet, with their recent punches. */
export function DeviceUsers() {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useBiometricUsers();
  const act = useBiometricAction<{ matched: number; marked: number }>();
  const [matching, setMatching] = useState<{ user: BiometricUserDto | null } | null>(null);
  const [onDevices, setOnDevices] = useState<{ user: BiometricUserDto; removing: boolean } | null>(null);
  const open = (data ?? []).filter((u) => !u.employeeId && !u.workerId).length;
  const leftOn = (data ?? []).filter((u) => u.left && (u.onDevices > 0 || u.punches > 0)).length;
  const digits = (u: BiometricUserDto) => /^\d{1,9}$/.test(u.pin);

  const columns: TableProps<BiometricUserDto>['columns'] = [
    { title: 'User number', dataIndex: 'pin', width: 120, render: (v: string) => <span translate="no">{v}</span> },
    {
      title: 'Who',
      key: 'who',
      render: (_, u) =>
        u.employeeName ? (
          <span translate="no">{`${u.employeeName} (${u.employeeCode})`}</span>
        ) : u.workerName ? (
          <span translate="no">{`${u.workerName} (${u.workerNo}, worker)`}</span>
        ) : (
          <AppTag tone="pending">Not matched</AppTag>
        ),
    },
    {
      title: 'On the devices',
      key: 'on',
      width: 200,
      render: (_, u) => (
        <Space size={4} wrap>
          {u.left ? <AppTag tone="danger">Has left</AppTag> : null}
          <OnDevicesTag u={u} />
        </Space>
      ),
    },
    { title: 'Punches, 30 days', dataIndex: 'punches', width: 140, align: 'right' },
    { title: 'Waiting to mark', dataIndex: 'unmatched', width: 140, align: 'right', render: (v: number) => (v ? <strong>{v}</strong> : '-') },
    { title: 'Last punch', dataIndex: 'lastPunchAt', width: 170, render: (v: string | null) => (v ? formatDateTime(v) : '-') },
    {
      title: '',
      key: 'x',
      width: 140,
      render: (_, u) => (
        <Space size={4}>
          <Button size="small" type={u.employeeId || u.workerId ? 'default' : 'primary'} onClick={() => setMatching({ user: u })} aria-label={`${u.employeeId || u.workerId ? 'Change' : 'Match'} user number ${u.pin}`}>
            {u.employeeId || u.workerId ? 'Change' : 'Match'}
          </Button>
          {digits(u) ? (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  ...(u.left ? [] : [{ key: 'add', label: 'Put on the devices' }]),
                  { key: 'remove', label: 'Take off the devices', danger: true },
                ],
                onClick: ({ key }) => setOnDevices({ user: u, removing: key === 'remove' }),
              }}
            >
              <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`More for user number ${u.pin}`} />
            </Dropdown>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 640 }}>
          {open ? `${open} user ${open === 1 ? 'number is' : 'numbers are'} not matched yet; their punches are kept and marked once matched.` : 'Every user number seen on the devices is matched.'} Enrolling people under their code number (14 for EMP-014) lets Match by code do it in one go.
          {leftOn ? ` ${leftOn} ${leftOn === 1 ? 'person who has' : 'people who have'} left may still be on the devices: take them off from their row’s menu.` : ''}
        </Typography.Paragraph>
        <Space wrap>
          <Button
            loading={act.isPending}
            onClick={() =>
              act
                .mutateAsync({ path: '/biometric/users/match-by-code' })
                .then((r) => message.success(r.matched ? `${r.matched} matched by code; ${r.marked} days of punches marked` : 'No unmatched number reads as an employee code or worker number'))
                .catch((err) => message.error(errorMessage(err, 'Could not match them. Try again.')))
            }
          >
            Match by code
          </Button>
          <Button onClick={() => setMatching({ user: null })}>Match a number</Button>
        </Space>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<BiometricUserDto> rowKey="pin" size="small" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} scroll={{ x: 1050 }} locale={{ emptyText: 'No user numbers yet. They show here once a device sends punches.' }} />
      )}
      <MatchModal key={matching?.user?.pin ?? 'new'} open={!!matching} onClose={() => setMatching(null)} user={matching?.user ?? null} />
      <DeviceUserForm key={onDevices ? `${onDevices.user.pin}-${onDevices.removing}` : 'none'} user={onDevices?.user ?? null} removing={!!onDevices?.removing} onClose={() => setOnDevices(null)} />
    </div>
  );
}
