'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import type { ConnectionHealth, FeedAuth, FeedPollResultDto, IntegrationConnectionDto, IntegrationKind, IntegrationSecretDto } from '@erp/shared';
import { CONNECTION_HEALTH_LABELS, FEED_AUTHS, FEED_AUTH_LABELS, INTEGRATION_KINDS, INTEGRATION_KIND_INFO } from '@erp/shared';
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
  /** A maker's feed (item 146) */
  url?: string;
  auth?: FeedAuth;
  tokenUrl?: string;
  clientId?: string;
  scope?: string;
}

const CREDENTIAL_LABEL: Record<FeedAuth, string> = { BEARER: 'API key', BASIC: 'User name and password, as user:password', OAUTH: 'Client secret' };
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** What a connection's messages carry, for its web address. */
const HOOK_BODY: Partial<Record<IntegrationKind, string>> = {
  GPS_TRACKER: "JSON for each reading: deviceId (or imei), time, latitude and longitude, ignition, and engineHours where the tracker reads the hour meter. Traccar's event forwarding works as it is.",
};

function ConnectionForm({ open, onClose, connection, onCreated }: { open: boolean; onClose: () => void; connection: IntegrationConnectionDto | null; onCreated: (r: IntegrationSecretDto) => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const act = useIntegrationAction<IntegrationSecretDto | IntegrationConnectionDto>();
  const agents = useConnectorAgents();
  const kind = Form.useWatch('kind', form) ?? connection?.kind;
  const viaConnector = kind ? INTEGRATION_KIND_INFO[kind].transport === 'CONNECTOR' : false;
  const polled = kind ? INTEGRATION_KIND_INFO[kind].transport === 'POLL' : false;
  const auth = (Form.useWatch('auth', form) ?? str(connection?.config.auth) ?? 'BEARER') as FeedAuth;
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
        const config = polled ? { url: v.url?.trim(), auth: v.auth ?? 'BEARER', ...(v.auth === 'OAUTH' ? { tokenUrl: v.tokenUrl?.trim(), clientId: v.clientId?.trim(), scope: v.scope?.trim() || undefined } : {}) } : undefined;
        if (connection) {
          await act.mutateAsync({
            method: 'patch',
            path: `/integrations/connections/${connection.id}`,
            body: { name: v.name, projectId: v.projectId ?? null, agentId: viaConnector ? v.agentId : undefined, credential, config },
          });
          message.success(`${v.name} saved`);
        } else {
          const r = (await act.mutateAsync({ path: '/integrations/connections', body: { kind: v.kind, name: v.name, projectId: v.projectId ?? null, agentId: viaConnector ? v.agentId : null, credential, config } })) as IntegrationSecretDto;
          message.success(`${r.connection.name} connected`);
          onCreated(r);
        }
      }}
    >
      <Form form={form} layout="vertical" initialValues={
          connection
            ? {
                kind: connection.kind,
                name: connection.name,
                projectId: connection.projectId,
                agentId: connection.agentId,
                url: str(connection.config.url),
                auth: (str(connection.config.auth) ?? 'BEARER') as FeedAuth,
                tokenUrl: str(connection.config.tokenUrl),
                clientId: str(connection.config.clientId),
                scope: str(connection.config.scope),
              }
            : { kind: 'GENERIC_WEBHOOK', auth: 'BEARER' }
        }
      >
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
        {polled && (
          <>
            <Form.Item
              name="url"
              label="Feed address"
              extra="The fleet snapshot's address from the maker's portal (AEMP 2.0, ISO 15143-3), starting https://"
              rules={[{ required: true, whitespace: true, message: "Enter the feed's address from the maker's portal" }]}
            >
              <Input maxLength={2000} placeholder="https://api.maker.example/aemp/Fleet/1" translate="no" />
            </Form.Item>
            <Form.Item name="auth" label="How Nirmaan signs in">
              <Select options={FEED_AUTHS.map((a) => ({ value: a, label: FEED_AUTH_LABELS[a] }))} />
            </Form.Item>
            {auth === 'OAUTH' && (
              <>
                <Form.Item name="tokenUrl" label="Token address" rules={[{ required: true, whitespace: true, message: 'Enter the token address the maker gave you' }]}>
                  <Input maxLength={2000} placeholder="https://login.maker.example/oauth/token" translate="no" />
                </Form.Item>
                <FormGrid cols={2}>
                  <Form.Item name="clientId" label="Client id" rules={[{ required: true, whitespace: true, message: 'Enter the client id the maker gave you' }]}>
                    <Input maxLength={200} translate="no" />
                  </Form.Item>
                  <Form.Item name="scope" label="Scope (if the maker asks for one)">
                    <Input maxLength={200} translate="no" />
                  </Form.Item>
                </FormGrid>
              </>
            )}
          </>
        )}
        <Form.Item
          name="credential"
          label={
            polled
              ? `${CREDENTIAL_LABEL[auth]}${connection?.secretLast4 ? ` (saved, ends ${connection.secretLast4})` : ''}`
              : connection?.secretLast4
                ? `Key or password (saved, ends ${connection.secretLast4})`
                : 'Key or password (optional)'
          }
          extra={polled ? 'Saved sealed and shown only as its last four characters.' : 'For a service that asks for one. It is saved sealed and shown only as its last four characters.'}
          rules={polled && !connection?.secretLast4 ? [{ required: true, whitespace: true, message: `Enter the ${CREDENTIAL_LABEL[auth].toLowerCase()} the maker gave you` }] : undefined}
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
          <Descriptions.Item label="Body">{(shown && HOOK_BODY[shown.connection.kind]) ?? 'JSON. A deviceId (or imei or serial) in it lists the device under Devices.'}</Descriptions.Item>
          <Descriptions.Item label="Sent twice">Send an id in the body or an X-Event-Id header and a repeat is counted once.</Descriptions.Item>
        </Descriptions>
      </Space>
    </Modal>
  );
}

function SetUp({ c, onClose, onAddress }: { c: IntegrationConnectionDto | null; onClose: () => void; onAddress: (r: IntegrationSecretDto) => void }) {
  const { message } = App.useApp();
  const act = useIntegrationAction<IntegrationSecretDto>();
  const poll = useIntegrationAction<FeedPollResultDto>();
  const transport = c ? INTEGRATION_KIND_INFO[c.kind].transport : null;
  const viaConnector = transport === 'CONNECTOR';
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
            {transport === 'POLL' && (
              <Button
                loading={poll.isPending}
                disabled={!c.isActive}
                onClick={() =>
                  poll
                    .mutateAsync({ path: `/integrations/connections/${c.id}/poll` })
                    .then((r) =>
                      r.problem
                        ? message.error(r.problem)
                        : message.success(`${r.machines} machine${r.machines === 1 ? '' : 's'} read, ${r.taken} new reading${r.taken === 1 ? '' : 's'}${r.failed ? `, ${r.failed} could not be read (see the log)` : ''}`),
                    )
                    .catch(fail)
                }
              >
                Read now
              </Button>
            )}
            {transport === 'HOOK' && (
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
            ) : transport === 'POLL' ? (
              <Descriptions.Item label="Feed address">
                <span translate="no" style={{ wordBreak: 'break-all' }}>
                  {str(c.config.url) ?? '-'}
                </span>
                <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                  Nirmaan reads it every hour. Match each machine it reports on under Devices.
                </Typography.Paragraph>
              </Descriptions.Item>
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
    { title: 'Comes in by', key: 'by', width: 180, render: (_, c) => {
        const t = INTEGRATION_KIND_INFO[c.kind].transport;
        return t === 'CONNECTOR' ? (c.agentName ?? 'No Connector') : t === 'POLL' ? 'Read every hour' : 'Its web address';
      },
    },
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
          A service in the cloud (a GPS tracker’s, a sensor’s) posts to its connection’s own web address, and a machine maker’s feed is read by Nirmaan every hour. A device on a site’s network is read by a Connector on a computer there, which only calls out.
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
