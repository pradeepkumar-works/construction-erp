'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Card, Descriptions, Empty, Flex, Form, Input, Result, Segmented, Tabs, Tag, Typography, theme } from 'antd';
import { EyeInvisibleOutlined, UndoOutlined } from '@ant-design/icons';
import { WARNING_DISMISS_MIN, WARNING_KIND_LABELS, WARNING_KINDS, canSeeWatchList, type WarningDto, type WarningKind } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useDismissWarning, useWatchList } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { useProjectScope } from '@/lib/project-scope';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';

const KIND_COLOR: Record<WarningKind, string> = { SCHEDULE: 'orange', CASH: 'red', VENDOR: 'purple', STOCK: 'gold', MACHINE: 'blue', DPR: 'cyan', MATERIAL_OVERUSE: 'magenta', FUEL_NORM: 'volcano', LOAN_EMI: 'geekblue' };

/**
 * The watch list (AI item 73): early warnings from plain forecasts over the records, each with its figures and links.
 * A warning can be dismissed with a reason, for the whole company, until its figures move on; the header's project
 * narrows it to that project and the company-wide ones.
 */
export default function Page() {
  const { user } = useAuth();
  const allowed = !!user && canSeeWatchList(user.roleKey);
  const { data, isLoading, error, refetch } = useWatchList(allowed);
  const [projectId] = useProjectScope();
  const [kind, setKind] = useState<WarningKind | 'ALL'>('ALL');
  const [tab, setTab] = useState<'open' | 'dismissed'>('open');
  const [dismissing, setDismissing] = useState<WarningDto | null>(null);
  const [form] = Form.useForm<{ reason: string }>();
  const act = useDismissWarning();
  const { message } = App.useApp();
  const { token } = theme.useToken();

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Watch list" />
        <Result status="403" title="The watch list is for managers, stores, purchase and accounts" />
      </div>
    );
  if (isLoading || !user) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const inScope = (w: WarningDto) => !projectId || !w.projectId || w.projectId === projectId;
  const shown = (list: WarningDto[]) => list.filter((w) => inScope(w) && (kind === 'ALL' || w.kind === kind));
  const open = shown(data.open);
  const dismissed = shown(data.dismissed);
  const kinds = WARNING_KINDS.filter((k) => data.kinds.includes(k));

  const restore = async (w: WarningDto) => {
    try {
      await act.mutateAsync({ key: w.key, restore: true });
      message.success('Back on the watch list');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const card = (w: WarningDto) => (
    <Card key={w.key} data-warning-key={w.key} size="small" style={{ marginBottom: token.margin }}>
      <Flex justify="space-between" align="flex-start" gap={token.margin} wrap>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Flex gap={token.marginXS} wrap align="center" style={{ marginBottom: token.marginXS }}>
            <Tag color={KIND_COLOR[w.kind]}>{WARNING_KIND_LABELS[w.kind]}</Tag>
            {w.projectName ? <Typography.Text type="secondary">{w.projectName}</Typography.Text> : null}
          </Flex>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {w.title}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginSM }}>
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
      <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }} items={w.facts.map((f, i) => ({ key: i, label: f.label, children: f.value }))} />
      <Flex gap={token.margin} wrap style={{ marginTop: token.marginXS }}>
        {w.links.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </Flex>
      {w.dismissed ? (
        <Alert
          style={{ marginTop: token.marginSM }}
          type="info"
          showIcon
          title={`Dismissed by ${w.dismissed.byName}, ${formatDateTime(w.dismissed.at)}`}
          description={w.dismissed.reason}
        />
      ) : null}
    </Card>
  );

  const list = (items: WarningDto[], none: string) => (items.length ? items.map(card) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={none} />);

  return (
    <div className="page-container">
      <PageHeader
        title="Watch list"
        subtitle={`Early warnings as of ${formatDate(data.asOf)}: plain forecasts from your records, each with its figures. Dismiss one with a reason and it stays dismissed until its figures move on.`}
      />
      {kinds.length > 1 ? (
        <Segmented
          aria-label="Kind of warning"
          style={{ marginBottom: token.margin, maxWidth: '100%', overflowX: 'auto' }}
          value={kind}
          onChange={(v) => setKind(v as WarningKind | 'ALL')}
          options={[
            { value: 'ALL', label: `All (${data.open.filter(inScope).length})` },
            ...kinds.map((k) => ({ value: k, label: `${WARNING_KIND_LABELS[k]} (${data.open.filter((w) => w.kind === k && inScope(w)).length})` })),
          ]}
        />
      ) : null}
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'open' | 'dismissed')}
        items={[
          { key: 'open', label: `Open (${open.length})`, children: list(open, 'Nothing to watch: no forecast points to trouble.') },
          { key: 'dismissed', label: `Dismissed (${dismissed.length})`, children: list(dismissed, 'No warning has been dismissed.') },
        ]}
      />
      <FormShell<{ reason: string }>
        open={!!dismissing}
        onClose={() => setDismissing(null)}
        layout="modal"
        title="Dismiss this warning"
        okText="Dismiss"
        form={form}
        onSubmit={async (v) => {
          await act.mutateAsync({ key: dismissing!.key, reason: v.reason });
          message.success('Dismissed for everyone in the company');
        }}
      >
        <Typography.Paragraph>{dismissing?.title}</Typography.Paragraph>
        {/* A fresh reason for each warning. */}
        <Form form={form} layout="vertical" preserve={false} key={dismissing?.key ?? 'none'}>
          <Form.Item
            name="reason"
            label="Why it can be dismissed"
            rules={[
              { required: true, message: 'Say why, so others know' },
              { min: WARNING_DISMISS_MIN, message: 'Write a few words at least' },
            ]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="Second crew starts Monday; the PM has a recovery plan" />
          </Form.Item>
        </Form>
      </FormShell>
    </div>
  );
}
