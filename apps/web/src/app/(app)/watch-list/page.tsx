'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Badge, Button, Card, Descriptions, Empty, Flex, Form, Input, Radio, Result, Segmented, Tooltip, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { AppTabs } from '@/components/common/AppTabs';
import { DownOutlined, EyeInvisibleOutlined, PlayCircleOutlined, UndoOutlined, UpOutlined } from '@/components/common/icons';
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
  type WarningConfidence,
  type WarningDto,
  type WarningKind,
  type WarningOutcome,
  type WarningRecordDto,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useDismissWarning, useInsights, useResumeWarningKind, useWatchList } from '@/lib/queries';
import { OtherChecks } from '@/components/watch-list/OtherChecks';
import { formatDate, formatDateTime } from '@/lib/format';
import { useProjectScope } from '@/lib/project-scope';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { ResultMark } from '@/components/common/ResultMark';

const KIND_COLOR: Record<WarningKind, string> = { SCHEDULE: 'orange', CASH: 'red', VENDOR: 'purple', STOCK: 'gold', MACHINE: 'blue', DPR: 'cyan', MATERIAL_OVERUSE: 'magenta', FUEL_NORM: 'volcano', LOAN_EMI: 'geekblue', RATE_ABOVE: 'purple', FUEL_NO_LOG: 'volcano', IDLE_HIRE: 'blue', NOTICE_DUE: 'red', MANDAYS_ABOVE: 'volcano', PACKAGE_LATE: 'orange', OM_SERVICE: 'cyan', BOQ_OFF_CONTRACT: 'gold', TESTS_SHORT: 'cyan', CALIBRATION_DUE: 'volcano', LAB_REPORT_LATE: 'blue', DRAWING_LATE: 'orange', DESIGN_REVIEW_LATE: 'gold', COPY_RECALL_LATE: 'red', MARGIN_FADE: 'magenta', CUBE_7DAY_LOW: 'red', PURCHASE_CONTROL: 'geekblue', FUEL_TANK: 'volcano', WEIGH_SHORT: 'gold' };
const CONFIDENCE_COLOR: Record<WarningConfidence, string> = { CHECKED: 'green', LIKELY: 'blue', CHECK_THIS: 'orange' };

type DismissForm = { outcome: WarningOutcome; reason?: string };

/**
 * The watch list: early warnings from plain rules over the records. Each card leads with what to
 * do and what it costs, says how sure it is, and keeps its working one tap down under Why. Dismissing says what became
 * of the warning (Fixed, Known and accepted, Wrong); that is each kind's track record, and a kind marked Wrong too often
 * pauses until management resumes it. The header's project narrows the list to that project and the company-wide ones.
 */
/** A kind of warning with how many are open (said as "3 open"), or that its check is paused. */
function KindOption({ label, count, paused }: { label: string; count: number; paused?: boolean }) {
  return (
    <Flex align="center" gap={6}>
      {label}
      {paused ? <Typography.Text type="secondary">paused</Typography.Text> : count > 0 && <Badge count={count} size="small" aria-label={`${count} open`} />}
    </Flex>
  );
}

export default function Page() {
  const { user } = useAuth();
  const allowed = !!user && canSeeWatchList(user.roleKey);
  const { data, isLoading, error, refetch } = useWatchList(allowed);
  const insights = useInsights(allowed);
  const [projectId] = useProjectScope();
  const [kind, setKind] = useState<WarningKind | 'ALL'>('ALL');
  const [tab, setTab] = useState<'open' | 'dismissed' | 'record'>('open');
  const [dismissing, setDismissing] = useState<WarningDto | null>(null);
  const [why, setWhy] = useState<Set<string>>(new Set());
  const [form] = Form.useForm<DismissForm>();
  const outcome = Form.useWatch('outcome', form);
  const act = useDismissWarning();
  const resume = useResumeWarningKind();
  const { message } = App.useApp();
  const { token } = theme.useToken();

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Watch list" />
        <Result icon={<ResultMark kind="no-access" />} title="The watch list is for managers, stores, purchase and accounts" />
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

  const card = (w: WarningDto) => {
    const record = recordOf.get(w.kind);
    const recordText = record ? trackRecordText(record) : null;
    return (
      <Card key={w.key} data-warning-key={w.key} size="small" style={{ marginBottom: token.margin }}>
        <Flex justify="space-between" align="flex-start" gap={token.margin} wrap>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <Flex gap={token.marginXS} wrap align="center" style={{ marginBottom: token.marginXS }}>
              <AppTag color={KIND_COLOR[w.kind]}>{WARNING_KIND_LABELS[w.kind]}</AppTag>
              <Tooltip title={WARNING_CONFIDENCE_HELP[w.confidence]}>
                <AppTag color={CONFIDENCE_COLOR[w.confidence]} variant="outlined" dot={false}>
                  {WARNING_CONFIDENCE_LABELS[w.confidence]}
                </AppTag>
              </Tooltip>
              {w.projectName ? (
                <Typography.Text type="secondary" translate="no">
                  {w.projectName}
                </Typography.Text>
              ) : null}
            </Flex>
            <Typography.Title level={5} style={{ marginTop: 0, marginBottom: token.marginXS }}>
              {w.title}
            </Typography.Title>
            <Flex gap={token.marginXS} wrap align="baseline" style={{ marginBottom: token.marginXS }}>
              <Typography.Text strong>{w.action}</Typography.Text>
              {w.impact ? (
                <AppTag color={w.impact.inr ? 'red' : 'default'} translate="no">
                  {w.impact.text}
                </AppTag>
              ) : null}
            </Flex>
            <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginXS }}>
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
          <div id={`why-${w.key}`} style={{ marginTop: token.marginXS }}>
            <ol style={{ margin: 0, paddingInlineStart: token.paddingLG }} translate="no">
              {w.working.map((line, i) => (
                <li key={i}>
                  <Typography.Text>{line}</Typography.Text>
                </li>
              ))}
            </ol>
            <Descriptions style={{ marginTop: token.marginSM }} size="small" column={{ xs: 1, sm: 2, lg: 4 }} items={w.facts.map((f, i) => ({ key: i, label: f.label, children: f.value }))} />
          </div>
        ) : null}
        <Flex gap={token.margin} wrap align="center" justify="space-between" style={{ marginTop: token.marginSM }}>
          <Flex gap={token.margin} wrap className="link-row">
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
            style={{ marginTop: token.marginSM }}
            type="info"
            showIcon
            title={`${WARNING_OUTCOME_LABELS[w.dismissed.outcome]}: dismissed by ${w.dismissed.byName}, ${formatDateTime(w.dismissed.at)}`}
            description={w.dismissed.reason !== WARNING_OUTCOME_LABELS[w.dismissed.outcome] ? w.dismissed.reason : undefined}
          />
        ) : null}
      </Card>
    );
  };

  const list = (items: WarningDto[], none: string) => (items.length ? items.map(card) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={none} />);

  const recordRow = (r: WarningRecordDto) => (
    <Card key={r.kind} data-record-kind={r.kind} size="small">
      <Flex justify="space-between" align="center" gap={token.margin} wrap>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Flex gap={token.marginXS} wrap align="center">
            <Typography.Text strong>{WARNING_KIND_LABELS[r.kind]}</Typography.Text>
            {r.paused ? <AppTag tone="danger">Paused</AppTag> : null}
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
        <div style={{ marginBottom: token.margin }}>
          <OtherChecks checks={insights.data.checks} />
        </div>
      ) : null}
      {kinds.length > 1 ? (
        <Segmented
          aria-label="Kind of warning"
          style={{ marginBottom: token.margin, maxWidth: '100%', overflowX: 'auto' }}
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
          { key: 'open', label: 'Open', count: open.length, countLabel: 'warnings', children: list(open, 'Nothing to watch: no rule points to trouble.') },
          { key: 'dismissed', label: 'Dismissed', count: dismissed.length, countLabel: 'warnings', children: list(dismissed, 'No warning has been dismissed.') },
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
                <Flex vertical gap={token.marginSM}>
                  {data.records.map(recordRow)}
                </Flex>
              </>
            ),
          },
        ]}
      />
      <FormShell<DismissForm>
        open={!!dismissing}
        onClose={() => setDismissing(null)}
        layout="modal"
        title="Dismiss this warning"
        okText="Dismiss"
        form={form}
        onSubmit={async (v) => {
          await act.mutateAsync({ key: dismissing!.key, outcome: v.outcome, reason: v.reason?.trim() });
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
