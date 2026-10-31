'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import type { AgentState, ConnectorAgentDto, ConnectorPairCodeDto } from '@erp/shared';
import { AGENT_STATE_LABELS } from '@erp/shared';
import { API_URL, errorMessage } from '@/lib/api';
import { useConnectorAgents, useIntegrationAction } from '@/lib/queries';
import { formatDateTime, NO_VALUE } from '@/lib/format';
import { DISPLAY_FONT } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { FormGrid, FormShell } from '@/components/form/FormShell';

const STATE_TONE: Record<AgentState, TagTone> = { ONLINE: 'success', OFFLINE: 'pending', WAITING_TO_PAIR: 'info', CODE_EXPIRED: 'pending', REVOKED: 'neutral' };

function AgentForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: ConnectorPairCodeDto) => void }) {
  const [form] = Form.useForm<{ name: string; projectId?: string | null }>();
  const act = useIntegrationAction<ConnectorPairCodeDto>();
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      projectDefault={false}
      title="New Connector"
      okText="Add and get a code"
      onSubmit={async (v) => onCreated(await act.mutateAsync({ path: '/integrations/agents', body: { name: v.name, projectId: v.projectId ?? null } }))}
    >
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the Connector, for example Site office PC' }]}>
            <Input maxLength={80} placeholder="Site office PC" />
          </Form.Item>
          <Form.Item name="projectId" label="Project">
            <ProjectSelect allowClear placeholder="Head office" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

/** The pairing code and what to type on the site computer. */
function PairCode({ shown, onClose }: { shown: ConnectorPairCodeDto | null; onClose: () => void }) {
  return (
    <Modal open={!!shown} onCancel={onClose} title={shown ? `Pair ${shown.agent.name}` : ''} width={640} footer={<Button type="primary" onClick={onClose}>Done</Button>}>
      {shown && (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary">Pairing code, good until {formatDateTime(shown.expiresAt)}</Typography.Text>
            <div>
              <Typography.Text copyable translate="no" style={{ fontFamily: DISPLAY_FONT, fontSize: 32, fontWeight: 600, letterSpacing: 2 }}>
                {shown.code}
              </Typography.Text>
            </div>
          </div>
          <ol style={{ margin: 0, paddingInlineStart: 20 }}>
            <li>On a computer at the site that stays on and can reach the devices, install Node.js 20 or later.</li>
            <li>Copy the Nirmaan Connector folder to it and open a command prompt there.</li>
            <li>
              Pair it:{' '}
              <Typography.Text code copyable translate="no">{`node dist/main.js pair ${API_URL} ${shown.code}`}</Typography.Text>
            </li>
            <li>
              Start it with Windows: run <Typography.Text code translate="no">install.ps1</Typography.Text> as administrator. It then runs in the background and only calls out to Nirmaan.
            </li>
          </ol>
          <Alert type="info" showIcon title="The code works once" description="Once paired, the computer keeps its own key and the code is used up. To move the Connector to another computer, make a new code." />
        </Space>
      )}
    </Modal>
  );
}

/** Connectors: the computers on site that read local devices, and whether each is calling in. */
export function Connectors() {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useConnectorAgents();
  const act = useIntegrationAction<ConnectorPairCodeDto>();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState<ConnectorPairCodeDto | null>(null);
  const fail = (err: unknown) => message.error(errorMessage(err, 'That did not go through. Try again.'));

  const columns: TableProps<ConnectorAgentDto>['columns'] = [
    { title: 'Connector', dataIndex: 'name', width: 200 },
    { title: 'Status', dataIndex: 'state', width: 150, render: (s: AgentState) => <AppTag tone={STATE_TONE[s]}>{AGENT_STATE_LABELS[s]}</AppTag> },
    { title: 'Site', dataIndex: 'projectName', ellipsis: true, render: (v: string | null) => v ?? 'Head office' },
    { title: 'Computer', dataIndex: 'hostname', width: 160, render: (v: string | null) => (v ? <span translate="no">{v}</span> : NO_VALUE) },
    { title: 'Version', dataIndex: 'version', width: 90, render: (v: string | null) => (v ? <span translate="no">{v}</span> : NO_VALUE) },
    { title: 'Last called in', dataIndex: 'lastSeenAt', width: 170, render: (v: string | null) => (v ? formatDateTime(v) : 'Never') },
    { title: 'Reads', dataIndex: 'connections', width: 80, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
    {
      title: '',
      key: 'x',
      width: 220,
      render: (_, a) =>
        a.state === 'REVOKED' ? null : (
          <Space size={4} wrap>
            <Popconfirm
              title="Make a new pairing code?"
              description={a.pairedAt ? 'The computer stops sending until it is paired again with the new code.' : undefined}
              okText="New code"
              onConfirm={() => act.mutateAsync({ path: `/integrations/agents/${a.id}/pair-code` }).then(setCode).catch(fail)}
            >
              <Button size="small" aria-label={`New pairing code for ${a.name}`}>
                New code
              </Button>
            </Popconfirm>
            <Popconfirm
              title={`Remove ${a.name}?`}
              description="It stops sending for good, and what it read waits for another Connector."
              okText="Remove"
              okButtonProps={{ danger: true }}
              onConfirm={() =>
                act
                  .mutateAsync({ method: 'delete', path: `/integrations/agents/${a.id}` })
                  .then(() => message.success(`${a.name} removed`))
                  .catch(fail)
              }
            >
              <Button size="small" danger aria-label={`Remove ${a.name}`}>
                Remove
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 680 }}>
          The Nirmaan Connector runs on a computer at a site or office and reads devices on its network (weighbridges, batching plants, meters). It keeps readings while the internet is down and sends them when it is back. Nothing needs to be opened on the site’s router.
        </Typography.Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          New Connector
        </Button>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<ConnectorAgentDto> rowKey="id" size="small" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} scroll={{ x: 1120 }} locale={{ emptyText: 'No Connectors yet. Add one for a site with devices on its network.' }} />
      )}
      <AgentForm open={adding} onClose={() => setAdding(false)} onCreated={setCode} />
      <PairCode shown={code} onClose={() => setCode(null)} />
    </div>
  );
}
