'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { BiometricDeviceDto, BiometricProtocol } from '@erp/shared';
import { BIOMETRIC_PROTOCOLS, BIOMETRIC_PROTOCOL_LABELS } from '@erp/shared';
import { API_ORIGIN, API_URL, errorMessage } from '@/lib/api';
import { useBiometricAction, useBiometricDevices } from '@/lib/queries';
import { formatDateTime, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { DeviceCommands } from './DeviceCommands';

interface Values {
  name: string;
  model?: string;
  protocol: BiometricProtocol;
  serialNo?: string;
  projectId?: string | null;
  utcOffsetMin: number;
}

function DeviceForm({ open, onClose, device, onSaved }: { open: boolean; onClose: () => void; device: BiometricDeviceDto | null; onSaved: (d: BiometricDeviceDto) => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const act = useBiometricAction<BiometricDeviceDto>();
  const protocol = Form.useWatch('protocol', form) ?? device?.protocol;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      projectDefault={false}
      title={device ? `Edit ${device.name}` : 'New device'}
      okText={device ? 'Save' : 'Register'}
      onSubmit={async (v) => {
        const body = { ...v, model: v.model?.trim() || null, serialNo: v.protocol === 'ADMS' ? v.serialNo?.trim() : null, projectId: v.projectId ?? null };
        const d = device
          ? await act.mutateAsync({ method: 'patch', path: `/biometric/devices/${device.id}`, body: { name: body.name, model: body.model, serialNo: device.protocol === 'ADMS' ? body.serialNo : undefined, projectId: body.projectId, utcOffsetMin: body.utcOffsetMin } })
          : await act.mutateAsync({ path: '/biometric/devices', body });
        message.success(device ? `${d.name} saved` : `${d.name} registered`);
        onSaved(d);
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={
          device
            ? { name: device.name, model: device.model ?? undefined, protocol: device.protocol, serialNo: device.serialNo ?? undefined, projectId: device.projectId, utcOffsetMin: device.utcOffsetMin }
            : { protocol: 'ADMS', utcOffsetMin: 330 }
        }
      >
        <FormGrid cols={2}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the device, for example Gate terminal' }]}>
            <Input maxLength={80} placeholder="Gate terminal" />
          </Form.Item>
          <Form.Item name="model" label="Make and model">
            <Input maxLength={80} placeholder="ZKTeco K40, eSSL X990" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="protocol" label="How it sends punches">
          <Select disabled={!!device} options={BIOMETRIC_PROTOCOLS.map((p) => ({ value: p, label: BIOMETRIC_PROTOCOL_LABELS[p] }))} />
        </Form.Item>
        {protocol === 'ADMS' && (
          <Form.Item
            name="serialNo"
            label="Serial number"
            extra="On the device under Menu > System info > Device info, or on the label at the back"
            rules={[{ required: true, whitespace: true, message: 'Enter the serial number shown on the device' }, { pattern: /^[A-Za-z0-9-]{4,40}$/, message: 'Letters and digits as on the device, 4 to 40 of them' }]}
          >
            <Input maxLength={40} translate="no" />
          </Form.Item>
        )}
        <FormGrid cols={2}>
          <Form.Item name="projectId" label="Project" extra="Workers who punch on it are marked at this project. Leave blank for an office.">
            <ProjectSelect placeholder="Head office" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="utcOffsetMin" label="Device clock, minutes ahead of UTC" extra="India is 330">
            <InputNumber min={-720} max={840} step={30} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

/** What to set on the device (or the middleware) so its punches arrive. */
export function SetupSteps({ d }: { d: BiometricDeviceDto }) {
  const host = API_ORIGIN.replace(/^https?:\/\//, '');
  const https = API_ORIGIN.startsWith('https');
  if (d.protocol === 'ADMS')
    return (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="On the device">Menu &gt; Comm. &gt; Cloud server setting (ADMS)</Descriptions.Item>
        <Descriptions.Item label="Server address">
          <Typography.Text copyable translate="no">
            {host.split(':')[0]}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="Server port">
          <span translate="no">{host.split(':')[1] ?? (https ? '443' : '80')}</span>
        </Descriptions.Item>
        <Descriptions.Item label="HTTPS">{https ? 'On (the device firmware must support it)' : 'Off'}</Descriptions.Item>
        <Descriptions.Item label="Serial number it must report">
          <span translate="no">{d.serialNo}</span>
        </Descriptions.Item>
      </Descriptions>
    );
  if (d.protocol === 'WEBHOOK')
    return (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="POST to">
          <Typography.Text copyable translate="no">{`${API_URL}/biometric/webhook`}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="Header X-Device-Key">
          <Typography.Text copyable translate="no">
            {d.apiKey}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="Body (JSON)">
          <Typography.Text code translate="no">
            {'{ "punches": [{ "pin": "14", "time": "2026-10-21T09:02:11" }] }'}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="Time">The device clock, or with Z or +05:30</Descriptions.Item>
      </Descriptions>
    );
  return <Typography.Paragraph style={{ margin: 0 }}>Export the punches from the device or its software as Excel or CSV and import them on the Punches tab. Each line needs the user number and the date and time.</Typography.Paragraph>;
}

const ago = (v: string | null) => (v ? formatDateTime(v) : 'Never');

/** Registered devices: when each was last heard from, its punches today, and how to set it up. */
export function Devices() {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useBiometricDevices();
  const act = useBiometricAction<BiometricDeviceDto>();
  const [editing, setEditing] = useState<{ device: BiometricDeviceDto | null } | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const shown = data?.find((d) => d.id === setup) ?? null;
  const run = (p: Promise<unknown>, done: string) => p.then(() => message.success(done)).catch((err) => message.error(errorMessage(err, 'That did not go through. Try again.')));

  const columns: TableProps<BiometricDeviceDto>['columns'] = [
    { title: 'Device', key: 'name', width: 220, render: (_, d) => <span>{d.name}{d.model ? <Typography.Text type="secondary">{` · ${d.model}`}</Typography.Text> : null}</span> },
    { title: 'Sends', dataIndex: 'protocol', width: 120, render: (v: BiometricProtocol) => ({ ADMS: 'ADMS', WEBHOOK: 'Webhook', FILE: 'Files' })[v] },
    { title: 'Serial number', dataIndex: 'serialNo', width: 160, render: (v: string | null) => (v ? <span translate="no">{v}</span> : NO_VALUE) },
    { title: 'Site', dataIndex: 'projectName', ellipsis: true, render: (v: string | null) => v ?? 'Head office' },
    { title: 'Last heard', dataIndex: 'lastSeenAt', width: 170, render: (v: string | null, d) => (d.protocol === 'FILE' ? NO_VALUE : ago(v)) },
    { title: 'Punches today', dataIndex: 'punchesToday', width: 120, align: 'right' },
    { title: 'Status', dataIndex: 'isActive', width: 90, render: (v: boolean) => (v ? <AppTag tone="success">On</AppTag> : <AppTag>Off</AppTag>) },
    {
      title: 'Commands',
      key: 'commands',
      width: 200,
      render: (_, d) =>
        d.protocol !== 'ADMS' ? (
          NO_VALUE
        ) : (
          <div>
            {d.commandsFailed ? <AppTag tone="danger">{`${d.commandsFailed} failed`}</AppTag> : null}
            {d.commandsWaiting ? <AppTag tone="pending">{`${d.commandsWaiting} waiting`}</AppTag> : null}
            <div className="text-muted">{d.clockSetAt ? `Clock set ${formatDateTime(d.clockSetAt)}` : 'Clock not set yet'}</div>
          </div>
        ),
    },
    {
      title: '',
      key: 'x',
      width: 340,
      render: (_, d) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => setSetup(d.id)} aria-label={`How to set up ${d.name}`}>
            Set up
          </Button>
          <Button size="small" onClick={() => setEditing({ device: d })} aria-label={`Edit ${d.name}`}>
            Edit
          </Button>
          <Button size="small" onClick={() => run(act.mutateAsync({ method: 'patch', path: `/biometric/devices/${d.id}`, body: { isActive: !d.isActive } }), d.isActive ? `${d.name} switched off` : `${d.name} switched on`)} aria-label={`${d.isActive ? 'Switch off' : 'Switch on'} ${d.name}`}>
            {d.isActive ? 'Switch off' : 'Switch on'}
          </Button>
          {d.protocol === 'ADMS' && d.isActive ? (
            <Button size="small" onClick={() => run(act.mutateAsync({ path: `/biometric/devices/${d.id}/set-clock` }), `${d.name}'s clock is set when it next calls`)} aria-label={`Set the clock of ${d.name}`}>
              Set the clock
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 680 }}>
          Fingerprint and face devices at sites and offices. A device that sends by itself (ADMS, as on ZKTeco and eSSL) or to a web address marks attendance as people punch; with any other device, import its punch file.
        </Typography.Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ device: null })}>
          New device
        </Button>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<BiometricDeviceDto> rowKey="id" size="small" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} scroll={{ x: 1600 }} locale={{ emptyText: 'No devices yet. Register the first one.' }} />
      )}
      {data?.some((d) => d.protocol === 'ADMS') ? <DeviceCommands /> : null}
      <DeviceForm open={!!editing} onClose={() => setEditing(null)} device={editing?.device ?? null} onSaved={(d) => !editing?.device && d.protocol !== 'FILE' && setSetup(d.id)} />
      <Modal
        open={!!shown}
        onCancel={() => setSetup(null)}
        title={shown ? `Set up ${shown.name}` : ''}
        width={640}
        footer={
          <Space wrap>
            {shown?.protocol === 'WEBHOOK' && (
              <Popconfirm title="Make a new key?" description="The old key stops working at once." okText="New key" onConfirm={() => run(act.mutateAsync({ path: `/biometric/devices/${shown.id}/new-key` }), 'New key made. Put it on the device or middleware.')}>
                <Button>New key</Button>
              </Popconfirm>
            )}
            {shown && shown.punchesToday === 0 && !shown.lastPunchAt && (
              <Popconfirm title={`Delete ${shown.name}?`} okText="Delete" onConfirm={() => run(act.mutateAsync({ method: 'delete', path: `/biometric/devices/${shown.id}` }).then(() => setSetup(null)), 'Device deleted')}>
                <Button danger>Delete</Button>
              </Popconfirm>
            )}
            <Button type="primary" onClick={() => setSetup(null)}>
              Done
            </Button>
          </Space>
        }
      >
        {shown && (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <SetupSteps d={shown} />
            {shown.protocol !== 'FILE' && (
              <Alert
                type={shown.lastSeenAt ? 'success' : 'info'}
                showIcon
                title={shown.lastSeenAt ? `Last heard from ${formatDateTime(shown.lastSeenAt)}` : 'Not heard from yet'}
                description={shown.protocol === 'ADMS' ? 'Put people on the device from the People on devices tab (or enrol them on the device under a user number and match it there), then enrol their finger or face on the device. Punches that arrive before a number is matched are kept and marked once it is.' : 'Enrol each person on the device under a user number, then match the numbers on the People on devices tab. Punches that arrive before a number is matched are kept and marked once it is.'}
              />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
