'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Badge, Button, Card, Descriptions, Drawer, Flex, Form, Input, Radio, Segmented, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { AppTabs } from '@/components/common/AppTabs';
import { CalculatorOutlined, DownOutlined, EyeInvisibleOutlined, PlayCircleOutlined, UndoOutlined, UpOutlined } from '@/components/common/icons';
import {
  WARNING_CONFIDENCE_HELP,
  WARNING_CONFIDENCE_LABELS,
  WARNING_DISMISS_MIN,
  WARNING_KIND_LABELS,
  WARNING_KINDS,
  WARNING_OUTCOME_HELP,
  WARNING_OUTCOME_LABELS,
  WARNING_OUTCOMES,
  canSeeWatchList,
  trackRecordText,
  type WarningDto,
  type WarningKind,
  type WarningOutcome,
  type WarningRecordDto,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useDismissWarning, useInsights, useResumeWarningKind, useWatchList } from '@/lib/queries';
import { OtherChecks } from '@/components/watch-list/OtherChecks';
import { formatDate, formatDateTime, formatINRCompact, NO_VALUE, plural } from '@/lib/format';
import { useProjectScope } from '@/lib/project-scope';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { NoAccess } from '@/components/common/NoAccess';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import type { ListColumn } from '@/components/list/DataTable';
import { MoreActions } from '@/components/record/MoreActions';
import type { RecordMenuAction } from '@/components/record/RecordFrame';
import { tk } from '@/ds';

type DismissForm = { outcome: WarningOutcome; reason?: string };

/** A kind of warning with how many are open (said as "3 open"), or that its check is paused. */
function KindOption({ label, count, paused }: { label: string; count: number; paused?: boolean }) {
  return (
    <Flex align="center" gap={6}>
      {label}
      {paused ? <Typography.Text type="secondary">paused</Typography.Text> : count > 0 && <Badge count={count} overflowCount={Infinity} size="small" aria-label={`${count} open`} />}
    </Flex>
  );
}

type WarningRow = WarningDto & { id: string };

/** The rupees a warning puts at risk, whichever way its rule signs them. */
const atRisk = (w: WarningDto) => (w.impact?.inr ? Math.abs(w.impact.inr) : null);

/** "296 open · ₹4.20 Cr at risk · 12 projects", over the warnings shown. */
function OpenSummary({ rows }: { rows: WarningDto[] }) {
  const inr = rows.reduce((n, w) => n + (atRisk(w) ?? 0), 0);
  const projects = new Set(rows.map((w) => w.projectId).filter(Boolean)).size;
  const parts = [`${rows.length} open`, inr ? `${formatINRCompact(inr)} at risk` : null, projects ? plural(projects, 'project') : null].filter(Boolean);
  return (
    <p translate="no" style={{ ...tk.type.strong, margin: 0, padding: `${tk.space[2]} 0` }}>
      {parts.join(' · ')}
    </p>
  );
}

/** A warning's title without the project it opens with, since the row names its project in its own column. */
function withoutProject(w: WarningDto): string {
  const lead = w.projectName ? `${w.projectName}: ` : '';
  if (!lead || !w.title.startsWith(lead)) return w.title;
  const rest = w.title.slice(lead.length);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * One row a warning, in the order the API gives (`rankWaiting`: rupees at stake, then days late, then the kinds' order).
 * A row opens the warning's card in a drawer; its ⋯ menu shows the working, dismisses or restores.
 */
function WarningTable({ list, rows, empty, dismissed, onOpen, actions }: { list: string; rows: WarningDto[]; empty: string; dismissed?: boolean; onOpen: (key: string) => void; actions: (w: WarningDto) => RecordMenuAction[] }) {
  const columns: ListColumn<WarningRow>[] = [
    { key: 'kind', title: 'Kind', width: 220, defaultFrom: 1200, card: 'status', render: (_, w) => <AppTag variant="kind">{WARNING_KIND_LABELS[w.kind]}</AppTag> },
    { key: 'title', title: 'Warning', locked: true, card: 'title', ellipsis: true, render: (_, w) => <span data-warning-row={w.key}>{withoutProject(w)}</span> },
    {
      key: 'project',
      title: 'Project',
      dataIndex: 'projectName',
      width: 200,
      defaultFrom: 1400,
      ellipsis: true,
      card: 'meta',
      render: (v: string | null) => (v ? <span translate="no">{v}</span> : <span className="text-muted">Company-wide</span>),
    },
    { key: 'atRisk', title: 'At risk', kind: 'money', value: atRisk, strong: true, width: 120, card: 'amount' },
    {
      key: 'late',
      title: 'Late by',
      width: 110,
      align: 'right',
      card: 'meta',
      render: (_, w) => (w.impact?.days ? <span className="mono" translate="no">{plural(w.impact.days, 'day')}</span> : <span className="text-muted">{NO_VALUE}</span>),
    },
    { key: 'confidence', title: 'How sure', width: 110, defaultFrom: 1600, card: false, render: (_, w) => WARNING_CONFIDENCE_LABELS[w.confidence] },
    ...(dismissed
      ? [{ key: 'outcome', title: 'Dismissed as', width: 180, card: 'meta' as const, render: (_: unknown, w: WarningRow) => (w.dismissed ? WARNING_OUTCOME_LABELS[w.dismissed.outcome] : NO_VALUE) }]
      : []),
    { key: 'actions', title: '', label: 'Actions', locked: true, width: 56, card: false, render: (_, w) => <MoreActions inRow label={`Actions for ${w.title}`} items={actions(w)} /> },
  ];
  return <LocalDataTable<WarningRow> list={list} columns={columns} rows={rows.map((w) => ({ ...w, id: w.key }))} loading={false} failed={false} onOpen={onOpen} emptyText={empty} />;
}

/**
 * The watch list: early warnings from plain rules over the records, one row each, most at stake first. A warning's card
 * leads with what to do and what it costs, says how sure it is, and keeps its working one tap down under Why. Dismissing
 * says what became of the warning (Fixed, Known and accepted, Wrong); that is each kind's track record, and a kind marked
 * Wrong too often pauses until management resumes it. The header's project narrows the list to that project and the
 * company-wide ones.
 */
export default function Page() {
  const { user } = useAuth();
  const allowed = !!user && canSeeWatchList(user.roleKey);
  const { data, isLoading, error, refetch } = useWatchList(allowed);
  const insights = useInsights(allowed);
  const [projectId] = useProjectScope();
  const [kind, setKind] = useState<WarningKind | 'ALL'>('ALL');
  const [tab, setTab] = useState<'open' | 'dismissed' | 'record'>('open');
  const [dismissing, setDismissing] = useState<WarningDto | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [why, setWhy] = useState<Set<string>>(new Set());
  const [form] = Form.useForm<DismissForm>();
  const outcome = Form.useWatch('outcome', form);
  const act = useDismissWarning();
  const resume = useResumeWarningKind();
  const { message } = App.useApp();

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Watch list" />
        <NoAccess title="The watch list is for managers, stores, purchase and accounts" />
      </div>
    );
  if (isLoading || !user) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const inScope = (w: WarningDto) => !projectId || !w.projectId || w.projectId === projectId;
  const shown = (list: WarningDto[]) => list.filter((w) => inScope(w) && (kind === 'ALL' || w.kind === kind));
  const open = shown(data.open);
  const dismissed = shown(data.dismissed);
  const kinds = WARNING_KINDS.filter((k) => data.kinds.includes(k));
  const recordOf = new Map(data.records.map((r) => [r.kind, r]));
  const paused = data.records.filter((r) => r.paused);
  const opened = openKey ? [...data.open, ...data.dismissed].find((w) => w.key === openKey) : undefined;

  const toggleWhy = (key: string) =>
    setWhy((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const restore = async (w: WarningDto) => {
    try {
      await act.mutateAsync({ key: w.key, restore: true });
      setOpenKey(null);
      message.success('Back on the watch list');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const doResume = async (k: WarningKind) => {
    try {
      await resume.mutateAsync(k);
      message.success(`${WARNING_KIND_LABELS[k]} is back on`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const showWorking = (w: WarningDto) => {
    setWhy((prev) => new Set(prev).add(w.key));
    setOpenKey(w.key);
  };

  const actions = (w: WarningDto): RecordMenuAction[] => [
    { key: 'why', label: 'Show how this was worked out', icon: <CalculatorOutlined />, onSelect: () => showWorking(w) },
    w.dismissed
      ? { key: 'restore', label: 'Restore', icon: <UndoOutlined />, onSelect: () => restore(w) }
      : { key: 'dismiss', label: 'Dismiss', icon: <EyeInvisibleOutlined />, onSelect: () => setDismissing(w) },
  ];

  const card = (w: WarningDto) => {
    const record = recordOf.get(w.kind);
    const recordText = record ? trackRecordText(record) : null;
    return (
      <div data-warning-key={w.key}>
        <Flex justify="space-between" align="flex-start" gap={tk.space[4]} wrap>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <Flex gap={tk.space[2]} wrap align="center" style={{ marginBottom: tk.space[2] }}>
              <Tooltip title={WARNING_CONFIDENCE_HELP[w.confidence]}>
                <AppTag variant="kind">
                  {WARNING_CONFIDENCE_LABELS[w.confidence]}
                </AppTag>
              </Tooltip>
              {w.projectName ? (
                <Typography.Text type="secondary" translate="no">
                  {w.projectName}
                </Typography.Text>
              ) : null}
            </Flex>
            <Typography.Title level={2} style={{ ...tk.type.title, marginTop: 0, marginBottom: tk.space[2] }}>
              {w.title}
            </Typography.Title>
            <Flex gap={tk.space[2]} wrap align="baseline" style={{ marginBottom: tk.space[2] }}>
              <Typography.Text strong>{w.action}</Typography.Text>
              {w.impact ? (
                <Typography.Text translate="no">{w.impact.text}</Typography.Text>
              ) : null}
            </Flex>
            <Typography.Paragraph type="secondary" style={{ marginBottom: tk.space[2] }}>
              {w.detail}
            </Typography.Paragraph>
          </div>
          {w.dismissed ? (
            <Button icon={<UndoOutlined />} onClick={() => restore(w)} loading={act.isPending && act.variables?.key === w.key}>
              Restore
            </Button>
          ) : (
            <Button icon={<EyeInvisibleOutlined />} onClick={() => setDismissing(w)}>
              Dismiss
            </Button>
          )}
        </Flex>
        <Button
          type="link"
          size="small"
          icon={why.has(w.key) ? <UpOutlined /> : <DownOutlined />}
          aria-expanded={why.has(w.key)}
          aria-controls={`why-${w.key}`}
          onClick={() => toggleWhy(w.key)}
          style={{ paddingInline: 0 }}
        >
          Show how this was worked out
        </Button>
        {why.has(w.key) ? (
          <div id={`why-${w.key}`} style={{ marginTop: tk.space[2] }}>
            <ol style={{ margin: 0, paddingInlineStart: tk.space[6] }} translate="no">
              {w.working.map((line, i) => (
                <li key={i}>
                  <Typography.Text>{line}</Typography.Text>
                </li>
              ))}
            </ol>
            <Descriptions style={{ marginTop: tk.space[3] }} size="small" column={{ xs: 1, sm: 2, lg: 4 }} items={w.facts.map((f, i) => ({ key: i, label: f.label, children: f.value }))} />
          </div>
        ) : null}
        <Flex gap={tk.space[4]} wrap align="center" justify="space-between" style={{ marginTop: tk.space[3] }}>
          <Flex gap={tk.space[4]} wrap className="link-row">
            {w.links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </Flex>
          {recordText ? <Typography.Text type="secondary">This check here: {recordText.charAt(0).toLowerCase() + recordText.slice(1)}</Typography.Text> : null}
        </Flex>
        {w.dismissed ? (
          <Alert
            style={{ marginTop: tk.space[3] }}
            type="info"
            showIcon
            title={`${WARNING_OUTCOME_LABELS[w.dismissed.outcome]}: dismissed by ${w.dismissed.byName}, ${formatDateTime(w.dismissed.at)}`}
            description={w.dismissed.reason !== WARNING_OUTCOME_LABELS[w.dismissed.outcome] ? w.dismissed.reason : undefined}
          />
        ) : null}
      </div>
    );
  };

  const recordRow = (r: WarningRecordDto) => (
    <Card key={r.kind} data-record-kind={r.kind} size="small">
      <Flex justify="space-between" align="center" gap={tk.space[4]} wrap>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Flex gap={tk.space[2]} wrap align="center">
            <Typography.Text strong>{WARNING_KIND_LABELS[r.kind]}</Typography.Text>
            {r.paused ? <AppTag meaning="failed">Paused</AppTag> : null}
          </Flex>
          <Typography.Text type="secondary">
            {r.paused
              ? `Marked wrong ${r.paused.wrong} of ${r.paused.of} times in the last 30 days, so this check stopped on ${formatDate(r.paused.since)}.${data.canResume ? ' Resume it once the check or the records are put right.' : ' An admin or management can resume it.'}`
              : (trackRecordText(r) ?? 'Not marked yet: dismiss a warning as Fixed, Known or Wrong and it counts here.')}
          </Typography.Text>
        </div>
        {r.paused && data.canResume ? (
          <Button icon={<PlayCircleOutlined />} onClick={() => doResume(r.kind)} loading={resume.isPending && resume.variables === r.kind}>
            Resume
          </Button>
        ) : null}
      </Flex>
    </Card>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Watch list"
        subtitle={`Early warnings as of ${formatDate(data.asOf)}: what to do, what it costs, and the working behind it. Say what became of one when you dismiss it, so each check keeps its track record.`}
      />
      {insights.data?.checks.length ? (
        <div style={{ marginBottom: tk.space[4] }}>
          <OtherChecks checks={insights.data.checks} />
        </div>
      ) : null}
      {kinds.length > 1 ? (
        <Segmented
          aria-label="Kind of warning"
          style={{ marginBottom: tk.space[4], maxWidth: '100%', overflowX: 'auto' }}
          value={kind}
          onChange={(v) => setKind(v as WarningKind | 'ALL')}
          options={[
            { value: 'ALL', label: <KindOption label="All" count={data.open.filter(inScope).length} /> },
            ...kinds.map((k) => ({ value: k, label: <KindOption label={WARNING_KIND_LABELS[k]} count={data.open.filter((w) => w.kind === k && inScope(w)).length} paused={!!recordOf.get(k)?.paused} /> })),
          ]}
        />
      ) : null}
      <AppTabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'open' | 'dismissed' | 'record')}
        items={[
          {
            key: 'open',
            label: 'Open',
            count: open.length,
            countLabel: 'warnings',
            children: (
              <>
                {open.length ? <OpenSummary rows={open} /> : null}
                <WarningTable list="watch-list" rows={open} empty="Nothing to watch: no rule points to trouble." onOpen={setOpenKey} actions={actions} />
              </>
            ),
          },
          {
            key: 'dismissed',
            label: 'Dismissed',
            count: dismissed.length,
            countLabel: 'warnings',
            children: <WarningTable list="watch-list-dismissed" rows={dismissed} dismissed empty="No warning has been dismissed." onOpen={setOpenKey} actions={actions} />,
          },
          {
            key: 'record',
            label: 'Track record',
            count: paused.length,
            countLabel: 'checks paused',
            attention: true,
            children: (
              <>
                <Typography.Paragraph type="secondary">
                  How each check has done in your company: of its latest ten dismissals, how many were Fixed or Known rather than Wrong. A check marked Wrong more than half the time
                  (four times or more in 30 days) pauses itself.
                </Typography.Paragraph>
                <Flex vertical gap={tk.space[3]}>
                  {data.records.map(recordRow)}
                </Flex>
              </>
            ),
          },
        ]}
      />
      <Drawer open={!!opened} onClose={() => setOpenKey(null)} size="large" title={opened ? WARNING_KIND_LABELS[opened.kind] : 'Warning'}>
        {opened ? card(opened) : null}
      </Drawer>
      <FormShell<DismissForm>
        open={!!dismissing}
        onClose={() => setDismissing(null)}
        layout="modal"
        title="Dismiss this warning"
        okText="Dismiss"
        form={form}
        onSubmit={async (v) => {
          await act.mutateAsync({ key: dismissing!.key, outcome: v.outcome, reason: v.reason?.trim() });
          setOpenKey(null);
          message.success('Dismissed for everyone in the company');
        }}
      >
        <Typography.Paragraph>{dismissing?.title}</Typography.Paragraph>
        {/* A fresh answer for each warning. */}
        <Form form={form} layout="vertical" preserve={false} key={dismissing?.key ?? 'none'}>
          <Form.Item name="outcome" label="What became of it" rules={[{ required: true, message: 'Choose what became of it' }]}>
            <Radio.Group
              vertical
              options={WARNING_OUTCOMES.map((o) => ({
                value: o,
                label: (
                  <span>
                    {WARNING_OUTCOME_LABELS[o]}
                    <Typography.Text type="secondary">{` · ${WARNING_OUTCOME_HELP[o]}`}</Typography.Text>
                  </span>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label={outcome === 'KNOWN' ? 'Why it can be left' : 'Note (optional)'}
            rules={
              outcome === 'KNOWN'
                ? [
                    { required: true, message: 'Say why it can be left as it is' },
                    { min: WARNING_DISMISS_MIN, message: 'Write a few words at least' },
                  ]
                : []
            }
          >
            <Input.TextArea rows={3} maxLength={500} showCount placeholder={outcome === 'WRONG' ? 'The progress for Block C was booked to Block B' : 'Second crew starts Monday; the PM has a recovery plan'} />
          </Form.Item>
        </Form>
      </FormShell>
    </div>
  );
}
