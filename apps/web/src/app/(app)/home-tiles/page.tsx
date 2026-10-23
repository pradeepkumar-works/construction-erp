'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import { Alert, Button, Card, DatePicker, Empty, Flex, Form, Input, Switch, Tag, Typography, theme } from 'antd';
import {
  ACCESS_REQUEST_STATUS_LABELS,
  LAUNCHER_FLAG_NODES,
  ROLE_LABELS,
  canManageUsers,
  launcherMarks,
  type AccessRequestDto,
  type HomeTilesDto,
  type LauncherFlagDto,
  type NavNode,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNotify } from '@/lib/notify';
import { formatDate, formatDateTime } from '@/lib/format';
import { useDecideAccess, useHomeTiles, useSetHomeTilesSettings, useSetLauncherFlag } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { TreeIcon } from '@/components/shell/nav-icons';

type Decision = { request: AccessRequestDto; status: 'GRANTED' | 'DECLINED' };

/** Grant (after changing the role or turning the module on) or decline, with a line for the person. */
function DecideDialog({ decision, onClose }: { decision: Decision | null; onClose: () => void }) {
  const [form] = Form.useForm<{ reply?: string }>();
  const decide = useDecideAccess();
  const notify = useNotify();
  const r = decision?.request;
  const granting = decision?.status === 'GRANTED';
  return (
    <FormShell
      open={!!decision}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={r ? `${granting ? 'Grant' : 'Decline'} ${r.nodeLabel} for ${r.userName}` : ''}
      okText={granting ? 'Mark granted' : 'Decline'}
      onSubmit={async (v) => {
        if (!decision) return;
        await decide.mutateAsync({ id: decision.request.id, status: decision.status, reply: v.reply });
        notify.saved(`${decision.request.userName} has been told`);
      }}
    >
      <Form form={form} layout="vertical">
        {r && granting && (
          <Typography.Paragraph>
            First give <span translate="no">{r.userName}</span> a role that opens {r.nodeLabel} in <Link href="/users">Users</Link>, or turn the module on in{' '}
            <Link href="/company-modules">Modules</Link>. Then mark the request granted so they know.
          </Typography.Paragraph>
        )}
        <Form.Item
          name="reply"
          label={granting ? 'A line for them' : 'Why not'}
          extra={granting ? 'Optional.' : 'They see this, so say what they can do instead.'}
          rules={granting ? [] : [{ required: true, whitespace: true, message: 'Say why, so they know what to do' }]}
        >
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

function RequestRow({ r, highlighted, onDecide }: { r: AccessRequestDto; highlighted: boolean; onDecide: (status: Decision['status']) => void }) {
  const { token } = theme.useToken();
  return (
    <li
      id={`request-${r.id}`}
      style={{
        listStyle: 'none',
        padding: token.paddingSM,
        borderRadius: token.borderRadiusLG,
        border: `${token.lineWidth}px solid ${highlighted ? token.colorPrimary : token.colorBorderSecondary}`,
      }}
    >
      <Flex justify="space-between" align="flex-start" gap={token.margin} wrap>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <Flex gap={token.marginXS} align="center" wrap>
            <Typography.Text strong translate="no">
              {r.userName}
            </Typography.Text>
            <Typography.Text type="secondary">{ROLE_LABELS[r.roleKey]}</Typography.Text>
            <span aria-hidden>·</span>
            <span>asks to open {r.nodeLabel}</span>
          </Flex>
          {r.note && <Typography.Paragraph style={{ margin: `${token.marginXXS}px 0 0` }}>“{r.note}”</Typography.Paragraph>}
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Asked {formatDateTime(r.createdAt)}
            {r.status !== 'OPEN' && r.decidedAt && (
              <>
                . {ACCESS_REQUEST_STATUS_LABELS[r.status]} by <span translate="no">{r.decidedByName}</span> on {formatDate(r.decidedAt.slice(0, 10))}
                {r.reply ? `: ${r.reply}` : ''}
              </>
            )}
          </Typography.Text>
        </div>
        {r.status === 'OPEN' ? (
          <Flex gap="small">
            <Button onClick={() => onDecide('DECLINED')}>Decline</Button>
            <Button type="primary" onClick={() => onDecide('GRANTED')}>
              Grant…
            </Button>
          </Flex>
        ) : (
          <Tag color={r.status === 'GRANTED' ? 'green' : undefined}>{ACCESS_REQUEST_STATUS_LABELS[r.status]}</Tag>
        )}
      </Flex>
    </li>
  );
}

function Requests({ requests }: { requests: AccessRequestDto[] }) {
  const { token } = theme.useToken();
  const search = useSearchParams();
  const highlight = search.get('request');
  const [decision, setDecision] = useState<Decision | null>(null);
  useEffect(() => {
    if (highlight) document.getElementById(`request-${highlight}`)?.scrollIntoView({ block: 'center' });
  }, [highlight]);
  const waiting = requests.filter((r) => r.status === 'OPEN').length;
  return (
    <Card title={waiting ? `Requests for access (${waiting} waiting)` : 'Requests for access'} size="small">
      {requests.length ? (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: token.marginSM }}>
          {requests.map((r) => (
            <RequestRow key={r.id} r={r} highlighted={r.id === highlight} onDecide={(status) => setDecision({ request: r, status })} />
          ))}
        </ul>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No requests yet. People ask from Discover on their Home when their role does not open a module." />
      )}
      <DecideDialog decision={decision} onClose={() => setDecision(null)} />
    </Card>
  );
}

/** One of Home's tiles: New (until a day) and Featured, each the company's own or as shipped. */
function FlagRow({ node, flag }: { node: NavNode; flag: LauncherFlagDto | undefined }) {
  const { token } = theme.useToken();
  const set = useSetLauncherFlag();
  const notify = useNotify();
  const today = dayjs().format('YYYY-MM-DD');
  const marks = launcherMarks(node, flag, today);
  const newUntil = flag && flag.isNew !== null ? flag.newUntil : (node.newUntil ?? null);
  const save = (next: Partial<LauncherFlagDto>) => {
    const value: LauncherFlagDto = { nodeId: node.id, isNew: marks.isNew, newUntil: marks.isNew ? newUntil : null, featured: marks.featured, ...next };
    set.mutate(value, { onError: (e) => notify.failed(e, () => save(next)) });
  };
  const id = `flag-${node.id}`;
  return (
    <Flex gap={token.margin} align="center" wrap style={{ minHeight: 44, paddingBlock: token.paddingXS, borderTop: `${token.lineWidth}px solid ${token.colorSplit}` }}>
      <Flex gap={token.marginSM} align="center" style={{ flex: '1 1 260px', minWidth: 0 }}>
        <span aria-hidden style={{ fontSize: 18, color: token.colorTextSecondary, display: 'inline-flex' }}>
          <TreeIcon name={node.icon} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div id={id} style={{ fontWeight: 600 }}>
            {node.label}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {node.description}
          </Typography.Text>
        </div>
      </Flex>
      <Flex gap={token.marginSM} align="center" wrap>
        <Flex gap={token.marginXS} align="center">
          <Switch checked={marks.isNew} loading={set.isPending} onChange={(on) => save({ isNew: on, newUntil: on ? newUntil : null })} aria-labelledby={`${id} ${id}-new`} />
          <span id={`${id}-new`}>New</span>
        </Flex>
        {marks.isNew && (
          <DatePicker
            aria-label={`${node.label}: New until`}
            placeholder="Until turned off"
            format="DD MMM YYYY"
            value={newUntil ? dayjs(newUntil) : null}
            disabledDate={(d) => d.isBefore(dayjs(), 'day')}
            onChange={(d) => save({ isNew: true, newUntil: d ? d.format('YYYY-MM-DD') : null })}
            style={{ width: 160 }}
          />
        )}
        <Flex gap={token.marginXS} align="center">
          <Switch checked={marks.featured} loading={set.isPending} onChange={(on) => save({ featured: on })} aria-labelledby={`${id} ${id}-featured`} />
          <span id={`${id}-featured`}>Featured</span>
        </Flex>
        {flag && (flag.isNew !== null || flag.featured !== null) && (
          <Button type="link" onClick={() => save({ isNew: null, newUntil: null, featured: null })}>
            As shipped
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

function HomeTiles({ data }: { data: HomeTilesDto }) {
  const { token } = theme.useToken();
  const settings = useSetHomeTilesSettings();
  const notify = useNotify();
  const flags = new Map(data.flags.map((f) => [f.nodeId, f]));
  const setLocked = (on: boolean) => settings.mutate({ discoverLocked: on }, { onError: (e) => notify.failed(e, () => setLocked(on)) });
  return (
    <Flex vertical gap={token.margin}>
      <Requests requests={data.requests} />
      <Card title="Discover" size="small">
        <Flex gap={token.margin} align="flex-start" style={{ minHeight: 44 }}>
          <Switch id="discover-locked" checked={data.discoverLocked} loading={settings.isPending} onChange={setLocked} aria-describedby="discover-locked-help" />
          <div>
            <label htmlFor="discover-locked" style={{ fontWeight: 600 }}>
              Show modules a person’s role cannot open
            </label>
            <Typography.Paragraph id="discover-locked-help" type="secondary" style={{ margin: 0 }}>
              They show greyed in Discover on Home, with Request access, which comes to you here. Modules the company turned off never show.
            </Typography.Paragraph>
          </div>
        </Flex>
      </Card>
      <Card title="New and featured" size="small">
        <Typography.Paragraph type="secondary">
          Discover on everyone’s Home leads with these. New shows until the person opens the module, or until the day you choose.
        </Typography.Paragraph>
        {LAUNCHER_FLAG_NODES.map((n) => (
          <FlagRow key={n.id} node={n} flag={flags.get(n.id)} />
        ))}
      </Card>
    </Flex>
  );
}

/**
 * Admin › Home tiles (launcher phase 3): answer requests for access from Discover, choose whether Discover shows modules a
 * role cannot open, and mark Home's tiles New or Featured for the whole company.
 */
export default function HomeTilesPage() {
  const { user } = useAuth();
  const allowed = !!user && canManageUsers(user.roleKey);
  const { data, isLoading, error, refetch } = useHomeTiles(allowed);
  if (!user) return null;
  return (
    <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
      <PageHeader title="Home tiles" subtitle="Answer requests for access, and choose what Discover on everyone’s Home leads with." />
      {!allowed ? (
        <Alert type="info" title="Only an admin can manage Home tiles." />
      ) : isLoading ? (
        <PageSkeleton shape="record" header={false} />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : data ? (
        <Suspense fallback={null}>
          <HomeTiles data={data} />
        </Suspense>
      ) : null}
    </div>
  );
}
