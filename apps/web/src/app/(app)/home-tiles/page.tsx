'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import { Button, Card, Empty, Flex, Form, Input, Select, Switch, Typography } from 'antd';
import { tk } from '@/ds';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import {
  ACCESS_REQUEST_STATUS_LABELS,
  LAUNCHER_FLAG_NODES,
  ROLE_LABELS,
  accessGrantProblem,
  canManageUsers,
  launcherMarks,
  type AccessRequestDto,
  type HomeTilesDto,
  type LauncherFlagDto,
  type NavNode,
  type RoleKey,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNotify } from '@/lib/notify';
import { formatDate, formatDateTime, todayDate } from '@/lib/format';
import { useChangeRoleForRequest, useDecideAccess, useHomeTiles, useSetHomeTilesSettings, useSetLauncherFlag } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { NoAccess } from '@/components/common/NoAccess';
import { TreeIcon } from '@/components/shell/nav-icons';

type Decision = { request: AccessRequestDto; status: 'GRANTED' | 'DECLINED' };

/**
 * What stands between the person and the module, read live from the request: their role (changed here, to one that opens
 * it) and the company's modules (turned on in Modules). Grant waits until both let them in, so "You can open it now" is true.
 */
function GrantCheck({ r }: { r: AccessRequestDto }) {
  const change = useChangeRoleForRequest();
  const notify = useNotify();
  const g = r.grant;
  const [role, setRole] = useState<RoleKey | undefined>(g?.rolesThatOpen[0]);
  if (!g) return null;
  if (g.openNow)
    return (
      <Typography.Paragraph>
        <span translate="no">{r.userName}</span>&apos;s role, {ROLE_LABELS[r.roleKey]}, opens {r.nodeLabel} now. Mark the request granted so they know.
      </Typography.Paragraph>
    );
  return (
    <Flex vertical gap={tk.space[3]} style={{ marginBottom: tk.space[4] }}>
      {g.moduleOff && (
        <p style={{ margin: 0 }}>
          {r.nodeLabel} is turned off for the company. Turn it on in <Link href="/company-modules">Modules</Link> first.
        </p>
      )}
      {g.roleBlocks && (
        <p style={{ margin: 0 }}>
          <span translate="no">{r.userName}</span>&apos;s role, {ROLE_LABELS[r.roleKey]}, does not open {r.nodeLabel}.{' '}
          {g.rolesThatOpen.length ? 'Give them one that does:' : <>Change their role in <Link href="/users">Users</Link>.</>}
        </p>
      )}
      {g.roleBlocks && g.rolesThatOpen.length > 0 && (
        <Flex gap={tk.space[2]} wrap align="center">
          <Select<RoleKey>
            aria-label={`New role for ${r.userName}`}
            value={role}
            onChange={setRole}
            options={g.rolesThatOpen.map((k) => ({ value: k, label: ROLE_LABELS[k] }))}
            style={{ minWidth: 220 }}
          />
          <Button
            disabled={!role}
            loading={change.isPending}
            onClick={() =>
              role &&
              change.mutate(
                { userId: r.userId, roleKey: role },
                { onSuccess: () => notify.saved(`${r.userName} is ${ROLE_LABELS[role]} now`), onError: (e) => notify.failed(e) },
              )
            }
          >
            Change role
          </Button>
        </Flex>
      )}
      {!g.moduleOff && !g.roleBlocks && <Typography.Paragraph style={{ margin: 0 }}>{accessGrantProblem(g, r.userName, r.roleKey, r.nodeLabel)}</Typography.Paragraph>}
      <Typography.Text type="secondary">Mark it granted once they can open it, so what they are told is true.</Typography.Text>
    </Flex>
  );
}

/** Grant (once their role and the company's modules let them in) or decline, with a line for the person. */
function DecideDialog({ decision, requests, onClose }: { decision: Decision | null; requests: AccessRequestDto[]; onClose: () => void }) {
  const [form] = Form.useForm<{ reply?: string }>();
  const decide = useDecideAccess();
  const notify = useNotify();
  // The row as it is now: changing their role here refetches the requests with a fresh check.
  const r = decision ? (requests.find((x) => x.id === decision.request.id) ?? decision.request) : undefined;
  const granting = decision?.status === 'GRANTED';
  return (
    <FormShell
      open={!!decision}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={r ? (granting ? `Grant ${r.nodeLabel} to ${r.userName}` : `Decline ${r.nodeLabel} for ${r.userName}`) : ''}
      okText={granting ? 'Mark granted' : 'Decline'}
      okDisabled={granting && !!r?.grant && !r.grant.openNow}
      onSubmit={async (v) => {
        if (!decision) return;
        await decide.mutateAsync({ id: decision.request.id, status: decision.status, reply: v.reply });
        notify.saved(`${decision.request.userName} has been told`);
      }}
    >
      <Form form={form} layout="vertical">
        {r && granting && <GrantCheck key={r.id} r={r} />}
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
  return (
    <li
      id={`request-${r.id}`}
      style={{
        listStyle: 'none',
        padding: tk.space[3],
        borderRadius: tk.radius.lg,
        border: `1px solid ${highlighted ? tk.color.accent.solid : tk.color.line.hairline}`,
      }}
    >
      <Flex justify="space-between" align="flex-start" gap={tk.space[4]} wrap>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <Flex gap={tk.space[2]} align="center" wrap>
            <Typography.Text strong translate="no">
              {r.userName}
            </Typography.Text>
            <Typography.Text type="secondary">{ROLE_LABELS[r.roleKey]}</Typography.Text>
            <span aria-hidden>·</span>
            <span>asks to open {r.nodeLabel}</span>
          </Flex>
          {r.note && <Typography.Paragraph style={{ margin: `${tk.space[1]} 0 0` }}>“{r.note}”</Typography.Paragraph>}
          <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
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
          <AppTag kind="accessRequest" status={r.status}>{ACCESS_REQUEST_STATUS_LABELS[r.status]}</AppTag>
        )}
      </Flex>
    </li>
  );
}

function Requests({ requests }: { requests: AccessRequestDto[] }) {
  const search = useSearchParams();
  const highlight = search.get('request');
  const [decision, setDecision] = useState<Decision | null>(null);
  useEffect(() => {
    if (highlight) document.getElementById(`request-${highlight}`)?.scrollIntoView({ block: 'center' });
  }, [highlight]);
  const waiting = requests.filter((r) => r.status === 'OPEN').length;
  return (
    <Card title="Access requests" extra={waiting ? `${waiting} waiting` : undefined} size="small">
      {requests.length ? (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tk.space[3] }}>
          {requests.map((r) => (
            <RequestRow key={r.id} r={r} highlighted={r.id === highlight} onDecide={(status) => setDecision({ request: r, status })} />
          ))}
        </ul>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No requests yet. People ask from Discover on their Home when their role does not open a module." />
      )}
      <DecideDialog decision={decision} requests={requests} onClose={() => setDecision(null)} />
    </Card>
  );
}

/** One of Home's tiles: New (until a day) and Featured, each the company's own or as shipped. */
function FlagRow({ node, flag }: { node: NavNode; flag: LauncherFlagDto | undefined }) {
  const set = useSetLauncherFlag();
  const notify = useNotify();
  const today = todayDate();
  const marks = launcherMarks(node, flag, today);
  const newUntil = flag && flag.isNew !== null ? flag.newUntil : (node.newUntil ?? null);
  const save = (next: Partial<LauncherFlagDto>) => {
    const value: LauncherFlagDto = { nodeId: node.id, isNew: marks.isNew, newUntil: marks.isNew ? newUntil : null, featured: marks.featured, ...next };
    set.mutate(value, { onError: (e) => notify.failed(e, () => save(next)) });
  };
  const id = `flag-${node.id}`;
  return (
    <Flex gap={tk.space[4]} align="center" wrap style={{ minHeight: 44, paddingBlock: tk.space[2], borderTop: `1px solid ${tk.color.line.hairline}` }}>
      <Flex gap={tk.space[3]} align="center" style={{ flex: '1 1 260px', minWidth: 0 }}>
        <span aria-hidden style={{ fontSize: tk.type.lead.fontSize, color: tk.color.text.muted, display: 'inline-flex' }}>
          <TreeIcon name={node.icon} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div id={id} style={{ fontWeight: tk.type.title.fontWeight }}>
            {node.label}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
            {node.description}
          </Typography.Text>
        </div>
      </Flex>
      <Flex gap={tk.space[3]} align="center" wrap>
        <Flex gap={tk.space[2]} align="center">
          <Switch checked={marks.isNew} loading={set.isPending} onChange={(on) => save({ isNew: on, newUntil: on ? newUntil : null })} aria-labelledby={`${id} ${id}-new`} />
          <span id={`${id}-new`}>New</span>
        </Flex>
        {marks.isNew && (
          <DatePicker
            aria-label={`${node.label}: New until`}
            placeholder="Until turned off"
           
            value={newUntil ? dayjs(newUntil) : null}
            disabledDate={(d) => d.isBefore(dayjs(), 'day')}
            onChange={(d) => save({ isNew: true, newUntil: d ? d.format('YYYY-MM-DD') : null })}
            style={{ width: 160 }}
          />
        )}
        <Flex gap={tk.space[2]} align="center">
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
  const settings = useSetHomeTilesSettings();
  const notify = useNotify();
  const flags = new Map(data.flags.map((f) => [f.nodeId, f]));
  const setLocked = (on: boolean) => settings.mutate({ discoverLocked: on }, { onError: (e) => notify.failed(e, () => setLocked(on)) });
  return (
    <Flex vertical gap={tk.space[4]}>
      <Requests requests={data.requests} />
      <Card title="Discover" size="small">
        <Flex gap={tk.space[4]} align="flex-start" style={{ minHeight: 44 }}>
          <Switch id="discover-locked" checked={data.discoverLocked} loading={settings.isPending} onChange={setLocked} aria-describedby="discover-locked-help" />
          <div>
            <label htmlFor="discover-locked" style={{ fontWeight: tk.type.title.fontWeight }}>
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
 * Admin › Home tiles: answer requests for access from Discover, choose whether Discover shows modules a
 * role cannot open, and mark Home's tiles New or Featured for the whole company.
 */
export default function HomeTilesPage() {
  const { user } = useAuth();
  const allowed = !!user && canManageUsers(user.roleKey);
  const { data, isLoading, error, refetch } = useHomeTiles(allowed);
  if (!user) return null;
  return (
    <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
      <PageHeader title="Discover and access requests" subtitle="Answer requests for access, and choose what Discover on everyone’s Home leads with." />
      {!allowed ? (
        <NoAccess title="Only an admin can manage Home tiles" />
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
