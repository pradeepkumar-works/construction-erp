'use client';

import React from 'react';
import { App, Button, Form, Input, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { BiometricCommandDto, BiometricCommandStatus, BiometricUserDto } from '@erp/shared';
import { BIOMETRIC_COMMAND_KIND_LABELS, BIOMETRIC_COMMAND_STATUS_LABELS, DEVICE_NAME_MAX } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useBiometricAction, useBiometricCommands, useBiometricDevices } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import { Section } from '@/components/common/Section';
import { QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';

const STATUS_TONE: Record<BiometricCommandStatus, TagTone> = { QUEUED: 'pending', SENT: 'info', DONE: 'success', FAILED: 'danger', CANCELLED: 'neutral' };

/** Who a user number is, in a few words, for a title. */
export const personOf = (u: BiometricUserDto) => u.employeeName ?? u.workerName ?? `user number ${u.pin}`;

/** The ADMS devices switched on, for a command's devices (all of them when none are chosen). */
function useAdmsDevices(open: boolean) {
  const { data } = useBiometricDevices(open);
  return (data ?? []).filter((d) => d.protocol === 'ADMS' && d.isActive);
}

/**
 * Put a user number on the ADMS devices with the name they show, so the person can enrol a finger or face
 * under it there; or take it off, so someone who has left can no longer punch. The devices take it when they next call.
 */
export function DeviceUserForm({ user, removing, onClose }: { user: BiometricUserDto | null; removing: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ name?: string; deviceIds?: string[] }>();
  const { message } = App.useApp();
  const act = useBiometricAction<{ devices: number; queued: number }>();
  const devices = useAdmsDevices(!!user);
  return (
    <FormShell
      open={!!user}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title={user ? (removing ? `Take ${personOf(user)} off the devices` : `Put ${personOf(user)} on the devices`) : 'Devices'}
      okText={removing ? 'Take off the devices' : 'Put on the devices'}
      onSubmit={async (v) => {
        const r = await act.mutateAsync({
          path: `/biometric/users/${encodeURIComponent(user!.pin)}/${removing ? 'remove-from-devices' : 'add-to-devices'}`,
          body: removing ? { deviceIds: v.deviceIds } : { name: v.name?.trim() || null, deviceIds: v.deviceIds },
        });
        const where = r.devices === 1 ? '1 device when it next calls' : `${r.devices} devices when they next call`;
        message.success(`User number ${user!.pin} goes ${removing ? 'off' : 'on'} ${where}`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ name: user ? (user.employeeName ?? user.workerName ?? '').slice(0, DEVICE_NAME_MAX) : undefined }}>
        <Typography.Paragraph type="secondary">
          {removing
            ? `User number ${user?.pin ?? ''} and the fingers or face enrolled under it are taken off, so it can no longer punch there. Its punches already in stay.`
            : `User number ${user?.pin ?? ''} goes on the devices with this name; then enrol the person's finger or face under it on each device.`}
        </Typography.Paragraph>
        {!removing && (
          <Form.Item name="name" label="Name on the device" extra={`Up to ${DEVICE_NAME_MAX} letters; the devices show no Hindi or accents.`} rules={[{ required: true, whitespace: true, message: 'Type the name the device shows' }]}>
            <Input maxLength={DEVICE_NAME_MAX} translate="no" />
          </Form.Item>
        )}
        <Form.Item name="deviceIds" label="Devices" extra={devices.length ? 'Leave empty for every device that sends by itself.' : 'No device that sends by itself (ADMS) is switched on.'}>
          <Select mode="multiple" allowClear placeholder={`All ${devices.length} ADMS ${devices.length === 1 ? 'device' : 'devices'}`} options={devices.map((d) => ({ value: d.id, label: d.name }))} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Where a user number stands on the devices, as a tag (nothing when no command was ever sent for it). */
export function OnDevicesTag({ u }: { u: BiometricUserDto }) {
  if (u.commandsWaiting) return <AppTag tone="pending">{`Waiting for ${u.commandsWaiting} ${u.commandsWaiting === 1 ? 'device' : 'devices'}`}</AppTag>;
  if (u.commandsFailed) return <AppTag tone="danger">{`Failed on ${u.commandsFailed} ${u.commandsFailed === 1 ? 'device' : 'devices'}`}</AppTag>;
  if (u.onDevices) return <AppTag tone="success">{`On ${u.onDevices} ${u.onDevices === 1 ? 'device' : 'devices'}`}</AppTag>;
  return <span className="text-muted">-</span>;
}

/** What the ADMS devices were asked to do and whether they did it; one not handed over yet can be taken back. */
export function DeviceCommands() {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useBiometricCommands();
  const act = useBiometricAction();
  const columns: TableProps<BiometricCommandDto>['columns'] = [
    { title: 'Asked', dataIndex: 'createdAt', width: 170, render: (v: string, c) => <span>{formatDateTime(v)}<div className="text-muted">{c.createdByName}</div></span> },
    { title: 'Device', dataIndex: 'deviceName', width: 170 },
    {
      title: 'Command',
      key: 'what',
      render: (_, c) => (
        <span translate="no">
          {BIOMETRIC_COMMAND_KIND_LABELS[c.kind]}
          {c.pin ? `: user number ${c.pin}` : ''}
          {c.name ? `, ${c.name}` : ''}
        </span>
      ),
    },
    {
      title: 'State',
      key: 'state',
      width: 300,
      render: (_, c) => (
        <div>
          <AppTag tone={STATUS_TONE[c.status]}>{BIOMETRIC_COMMAND_STATUS_LABELS[c.status]}</AppTag>
          {c.doneAt ? <span className="text-muted">{formatDateTime(c.doneAt)}</span> : c.sentAt ? <span className="text-muted">{`Sent ${formatDateTime(c.sentAt)}`}</span> : null}
          {c.note && c.status !== 'DONE' ? <div className="text-muted">{c.note}</div> : null}
        </div>
      ),
    },
    {
      title: '',
      key: 'x',
      width: 90,
      render: (_, c) =>
        c.status === 'QUEUED' ? (
          <Button
            size="small"
            aria-label={`Cancel ${BIOMETRIC_COMMAND_KIND_LABELS[c.kind].toLowerCase()} on ${c.deviceName}`}
            onClick={() =>
              act
                .mutateAsync({ path: `/biometric/commands/${c.id}/cancel` })
                .then(() => message.success('Command taken back'))
                .catch((err) => message.error(errorMessage(err, 'Could not take it back. Try again.')))
            }
          >
            Cancel
          </Button>
        ) : null,
    },
  ];
  return (
    <Section style={{ marginTop: 16 }} title="Commands to the devices">
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<BiometricCommandDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'No commands yet. Put people on the devices from People on devices, or set a device’s clock here.' }}
        />
      )}
    </Section>
  );
}
