'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import type { ConnectionHealth, IntegrationConnectionDto, IntegrationKind, IntegrationSecretDto } from '@erp/shared';
import { CONNECTION_HEALTH_LABELS, INTEGRATION_KINDS, INTEGRATION_KIND_INFO } from '@erp/shared';
import { API_URL, errorMessage } from '@/lib/api';
import { useConnectorAgents, useIntegrationAction, useIntegrationConnections } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { FormGrid, FormShell } from '@/components/form/FormShell';

export const HEALTH_TONE: Record<ConnectionHealth, TagTone> = { LIVE: 'success', FAILING: 'danger', QUIET: 'pending', NOT_SET_UP: 'info', OFF: 'neutral' };

interface Values {
  kind: IntegrationKind;
  name: string;
  projectId?: string | null;
  agentId?: string | null;
  credential?: string;
}

function ConnectionForm({ open, onClose, connection, onCreated }: { open: boolean; onClose: () => void; connection: IntegrationConnectionDto | null; onCreated: (r: IntegrationSecretDto) => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const act = useIntegrationAction<IntegrationSecretDto | IntegrationConnectionDto>();
  const agents = useConnectorAgents();
  const kind = Form.useWatch('kind', form) ?? connection?.kind;
  const viaConnector = kind ? INTEGRATION_KIND_INFO[kind].transport === 'CONNECTOR' : false;
  const liveAgents = (agents.data ?? []).filter((a) => a.state !== 'REVOKED');
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      projectDefault={false}
      title={connection ? `Edit ${connection.name}` : 'New connection'}
      okText={connection ? 'Save' : 'Connect'}
      onSubmit={async (v) => {
        const credential = v.credential?.trim() || undefined;
        if (connection) {
          await act.mutateAsync({
            method: 'patch',
            path: `/integrations/connections/${connection.id}`,
            body: { name: v.name, projectId: v.projectId ?? null, agentId: viaConnector ? v.agentId : undefined, credential },
          });
          message.success(`${v.name} saved`);
        } else {
          const r = (await act.mutateAsync({ path: '/integrations/connections', body: { kind: v.kind, name: v.name, projectId: v.projectId ?? null, agentId: viaConnector ? v.agentId : null, credential } })) as IntegrationSecretDto;
          message.success(`${r.connection.name} connected`);
          onCreated(r);
        }
      }}
    >
      <Form form={form} layout="vertical" initialValues={connection ? { kind: connection.kind, name: connection.name, projectId: connection.projectId, agentId: connection.agentId } : { kind: 'GENERIC_WEBHOOK' }}>
        <Form.Item name="kind" label="What it connects to" extra={kind ? INTEGRATION_KIND_INFO[kind].description : undefined}>
          <Select disabled={!!connection} options={INTEGRATION_KINDS.map((k) => ({ value: k, label: INTEGRATION_KIND_INFO[k].label }))} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the connection, for example Fleet trackers' }]}>
            <Input maxLength={80} placeholder="Fleet trackers" />
          </Form.Item>
          <Form.Item name="projectId" label="Site (optional)" extra="Where its readings belong when they do not say">
            <ProjectSelect allowClear placeholder="Any site" style={{ width: '100%' }} aria-label="Site" />
          </Form.Item>
        </FormGrid>
        {viaConnector && (
          <Form.Item
            name="agentId"
            label="Read by the Connector"
            extra={liveAgents.length ? 'The Connector on the computer that can reach the device' : 'Add a Connector on the Connectors tab first'}
            rules={[{ required: true, message: 'Choose the Connector that reads it' }]}
          >
            <Select loading={agents.isLoading} options={liveAgents.map((a) => ({ value: a.id, label: a.hostname ? `${a.name} (${a.hostname})` : a.name }))} placeholder="Choose a Connector" />
          </Form.Item>
        )}
        <Form.Item
          name="credential"
          label={connection?.secretLast4 ? `Key or password (saved, ends ${connection.secretLast4})` : 'Key or password (optional)'}
          extra="For a service that asks for one. It is saved sealed and shown only as its last four characters."
        >
          <Input.Password maxLength={2000} autoComplete="new-password" placeholder={connection?.secretLast4 ? 'Leave blank to keep it' : undefined} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The whole web address, shown once after it is made. */
function AddressShown({ shown, onClose }: { shown: IntegrationSecretDto | null; onClose: () => void }) {
  const url = shown?.hookPath ? `${API_URL}${shown.hookPath}` : '';
  return (
    <Modal open={!!shown?.hookPath} onCancel={onClose} title={shown ? `Web address for ${shown.connection.name}` : ''} width={680} footer={<Button type="primary" onClick={onClose}>Done</Button>}>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Alert type="warning" showIcon title="Copy it now: it is shown only this once" description="Anyone with the address can send to this connection. If it is lost or shared by mistake, make a new one and the old one stops working." />
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="POST to">
            <Typography.Text copyable translate="no" style={{ wordBreak: 'break-all' }}>
              {url}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Body">JSON. A deviceId (or imei or serial) in it lists the device under Devices.</Descriptions.Item>
          <Descriptions.Item label="Sent twice">Send an id in the body or an X-Event-Id header and a repeat is counted once.</Descriptions.Item>
        </Descriptions>
      </Space>
    </Modal>
  );
}

function SetUp({ c, onClose, onAddress }: { c: IntegrationConnectionDto | null; onClose: () => void; onAddress: (r: IntegrationSecretDto) => void }) {
  const { message } = App.useApp();
  const act = useIntegrationAction<IntegrationSecretDto>();
  const viaConnector = c ? INTEGRATION_KIND_INFO[c.kind].transport === 'CONNECTOR' : false;
  const fail = (err: unknown) => message.error(errorMessage(err, 'That did not go through. Try again.'));
  return (
    <Modal
      open={!!c}
      onCancel={onClose}
      title={c ? `Set up ${c.name}` : ''}
      width={640}
      footer={
        c && (
          <Space wrap>
            {!viaConnector && (
              <Popconfirm
                title="Make a new web address?"
                description="The old one stops working at once."
                okText="New address"
                onConfirm={() =>
                  act
                    .mutateAsync({ path: `/integrations/connections/${c.id}/new-address` })
                    .then((r) => {
                      onClose();
                      onAddress(r);
                    })
                    .catch(fail)
                }
              >
                <Button>New web address</Button>
              </Popconfirm>
            )}
            <Popconfirm
              title={`Delete ${c.name}?`}
              description="Its log and devices go with it. Records already made from its messages stay."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() =>
                act
                  .mutateAsync({ method: 'delete', path: `/integrations/connections/${c.id}` })
                  .then(() => {
                    message.success(`${c.name} deleted`);
                    onClose();
                  })
                  .catch(fail)
              }
            >
              <Button danger>Delete</Button>
            </Popconfirm>
            <Button type="primary" onClick={onClose}>
              Done
            </Button>
          </Space>
        )
      }
    >
      {c && (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Paragraph style={{ margin: 0 }}>{INTEGRATION_KIND_INFO[c.kind].description}</Typography.Paragraph>
          <Descriptions size="small" column={1} bordered>
            {viaConnector ? (
              <Descriptions.Item label="Read by">{c.agentName ?? 'No Connector: choose one with Edit'}</Descriptions.Item>
            ) : (
              <Descriptions.Item label="Web address">
                <span translate="no">{c.hookPathHint ? `${API_URL}${c.hookPathHint}` : '-'}</span>
                <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                  Only its last four characters are kept here. Lost it? Make a new one.
                </Typography.Paragraph>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Last message">{c.lastEventAt ? formatDateTime(c.lastEventAt) : 'None yet'}</Descriptions.Item>
            {c.lastError && <Descriptions.Item label="Last failure">{`${formatDateTime(c.lastErrorAt)}: ${c.lastError}`}</Descriptions.Item>}
          </Descriptions>
        </Space>
      )}
    </Modal>
  );
}

/** Connections: each outside system, how it is doing, and how to set it up. */
export function Connections() {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useIntegrationConnections();
  const act = useIntegrationAction();
  const [editing, setEditing] = useState<{ c: IntegrationConnectionDto | null } | null>(null);
  const [setupId, setSetupId] = useState<string | null>(null);
  const [address, setAddress] = useState<IntegrationSecretDto | null>(null);
  const setup = data?.find((c) => c.id === setupId) ?? null;

  const columns: TableProps<IntegrationConnectionDto>['columns'] = [
    {
      title: 'Connection',
      key: 'name',
      width: 260,
      render: (_, c) => (
        <span>
          {c.name}
          <Typography.Text type="secondary">{` · ${INTEGRATION_KIND_INFO[c.kind].label}`}</Typography.Text>
        </span>
      ),
    },
    { title: 'State', dataIndex: 'health', width: 200, render: (h: ConnectionHealth) => <AppTag tone={HEALTH_TONE[h]}>{CONNECTION_HEALTH_LABELS[h]}</AppTag> },
    { title: 'Site', dataIndex: 'projectName', ellipsis: true, render: (v: string | null) => v ?? 'Any site' },
    { title: 'Comes in by', key: 'by', width: 180, render: (_, c) => (INTEGRATION_KIND_INFO[c.kind].transport === 'CONNECTOR' ? (c.agentName ?? 'No Connector') : 'Its web address') },
    { title: 'Last message', dataIndex: 'lastEventAt', width: 170, render: (v: string | null) => (v ? formatDateTime(v) : 'None yet') },
    { title: 'Today', dataIndex: 'eventsToday', width: 80, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
    { title: 'Devices', dataIndex: 'devices', width: 80, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
    {
      title: '',
      key: 'x',
      width: 250,
      render: (_, c) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => setSetupId(c.id)} aria-label={`Set up ${c.name}`}>
            Set up
          </Button>
          <Button size="small" onClick={() => setEditing({ c })} aria-label={`Edit ${c.name}`}>
            Edit
          </Button>
          <Button
            size="small"
            aria-label={`${c.isActive ? 'Switch off' : 'Switch on'} ${c.name}`}
            onClick={() =>
              act
                .mutateAsync({ method: 'patch', path: `/integrations/connections/${c.id}`, body: { isActive: !c.isActive } })
                .then(() => message.success(c.isActive ? `${c.name} switched off` : `${c.name} switched on`))
                .catch((err) => message.error(errorMessage(err, 'That did not go through. Try again.')))
            }
          >
            {c.isActive ? 'Switch off' : 'Switch on'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 680 }}>
          A service in the cloud (a GPS tracker’s, a sensor’s) posts to its connection’s own web address. A device on a site’s network is read by a Connector on a computer there, which only calls out.
        </Typography.Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ c: null })}>
          New connection
        </Button>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<IntegrationConnectionDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          pagination={false}
          scroll={{ x: 1220 }}
          locale={{ emptyText: 'No connections yet. Make the first one.' }}
        />
      )}
      <ConnectionForm open={!!editing} onClose={() => setEditing(null)} connection={editing?.c ?? null} onCreated={(r) => (r.hookPath ? setAddress(r) : setSetupId(r.connection.id))} />
      <SetUp c={setup} onClose={() => setSetupId(null)} onAddress={setAddress} />
      <AddressShown shown={address} onClose={() => setAddress(null)} />
    </div>
  );
}
