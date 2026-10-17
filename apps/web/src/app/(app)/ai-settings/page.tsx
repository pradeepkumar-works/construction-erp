'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Flex, InputNumber, Progress, Space, Switch, Table, Typography, theme } from 'antd';
import type { AiFeature, AiSettingsDto } from '@erp/shared';
import { AI_FEATURE_LABELS, PRODUCT_NAME, canManageAi } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { useAiSettings, useUpdateAiSettings } from '@/lib/queries';
import { askShortcutLabel } from '@/lib/shortcuts';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';

function SettingsCard({ data }: { data: AiSettingsDto }) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const update = useUpdateAiSettings();
  const [cap, setCap] = useState<number | null>(data.monthlyCapInr);
  useEffect(() => setCap(data.monthlyCapInr), [data.monthlyCapInr]);

  const save = (change: { enabled?: boolean; monthlyCapInr?: number | null }, done: string) =>
    update.mutate(change, { onSuccess: () => message.success(done), onError: (e) => message.error(errorMessage(e)) });

  return (
    <Card title="Settings" style={{ marginBottom: token.margin }}>
      {!data.configured && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: token.margin }}
          title="Not set up on this server yet"
          description="The server needs an AI key before anyone can ask. Whoever runs your server adds OPENROUTER_API_KEY (or ANTHROPIC_API_KEY) to its settings; your choices here are kept until then."
        />
      )}
      <Flex vertical gap={token.marginLG}>
        <Flex gap={token.margin} align="flex-start">
          <Switch
            id="ai-enabled"
            checked={data.enabled}
            loading={update.isPending && update.variables?.enabled !== undefined}
            onChange={(on) => save({ enabled: on }, on ? `Ask ${PRODUCT_NAME} is on` : `Ask ${PRODUCT_NAME} is off`)}
            aria-describedby="ai-enabled-help"
          />
          <div>
            <label htmlFor="ai-enabled" style={{ fontWeight: 600 }}>
              On for everyone in the company
            </label>
            <Typography.Paragraph id="ai-enabled-help" type="secondary" style={{ margin: 0 }}>
              Staff get the Ask button in the header ({askShortcutLabel()}). Each person&apos;s answers come only from what their own role can see in {PRODUCT_NAME}. The client&apos;s
              engineer and the consultant never see it.
            </Typography.Paragraph>
          </div>
        </Flex>
        <div>
          <label htmlFor="ai-cap" style={{ fontWeight: 600, display: 'block', marginBottom: token.marginXXS }}>
            Monthly allowance
          </label>
          <Space wrap>
            <InputNumber
              id="ai-cap"
              prefix="₹"
              min={0}
              max={10_000_000}
              step={500}
              precision={0}
              value={cap}
              placeholder={String(data.monthlyCapInr === null ? data.effectiveCapInr : '')}
              onChange={(v) => setCap(v === null ? null : Number(v))}
              style={{ width: 180 }}
            />
            <Button type="primary" disabled={cap === data.monthlyCapInr} loading={update.isPending && update.variables?.monthlyCapInr !== undefined} onClick={() => save({ monthlyCapInr: cap }, 'Allowance saved')}>
              Save
            </Button>
            {data.monthlyCapInr !== null && <Button onClick={() => save({ monthlyCapInr: null }, 'Allowance back to the default')}>Use the default</Button>}
          </Space>
          <Typography.Paragraph type="secondary" style={{ margin: `${token.marginXXS}px 0 0` }}>
            Questions stop for the rest of the month once the company has used this much. {data.monthlyCapInr === null ? `This is the default of ${formatINR(data.effectiveCapInr)}.` : ''} Each
            person can also ask a limited number of questions a day.
          </Typography.Paragraph>
        </div>
      </Flex>
    </Card>
  );
}

function UsageCard({ data }: { data: AiSettingsDto }) {
  const { token } = theme.useToken();
  const pct = data.effectiveCapInr > 0 ? Math.min(100, Math.round((data.spentThisMonthInr / data.effectiveCapInr) * 100)) : 100;
  return (
    <Card title="This month" style={{ marginBottom: token.margin }}>
      <Descriptions
        column={{ xs: 1, sm: 3 }}
        items={[
          { key: 'spent', label: 'Used', children: `${formatINR(data.spentThisMonthInr)} of ${formatINR(data.effectiveCapInr)}` },
          { key: 'questions', label: 'Questions', children: data.questionsThisMonth.toLocaleString('en-IN') },
          { key: 'model', label: 'Model', children: data.model },
        ]}
      />
      <Progress percent={pct} status={pct >= 100 ? 'exception' : 'normal'} aria-label={`${pct}% of the monthly allowance used`} style={{ maxWidth: 480 }} />
      <Typography.Paragraph type="secondary" style={{ marginTop: token.marginXS }}>
        What the AI provider charged for each answer, in rupees at the server&apos;s exchange rate; the provider&apos;s own invoice is the final figure.
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="feature"
        pagination={false}
        dataSource={data.byFeature}
        style={{ marginBottom: token.margin }}
        columns={[
          { key: 'feature', title: 'Used for', dataIndex: 'feature', render: (f: AiFeature) => AI_FEATURE_LABELS[f] },
          { key: 'count', title: 'How many', dataIndex: 'count', align: 'right', render: (n: number) => n.toLocaleString('en-IN') },
          { key: 'spent', title: 'Used', dataIndex: 'spentInr', align: 'right', render: (v: number) => formatINR(v) },
        ]}
      />
      <Table
        size="small"
        rowKey="userId"
        pagination={false}
        dataSource={data.byUser}
        locale={{ emptyText: 'No questions asked this month' }}
        columns={[
          { key: 'name', title: 'Person', dataIndex: 'fullName' },
          { key: 'questions', title: 'Questions', dataIndex: 'questions', align: 'right' },
          { key: 'spent', title: 'Used', dataIndex: 'spentInr', align: 'right', render: (v: number) => formatINR(v) },
        ]}
      />
    </Card>
  );
}

function DataCard() {
  return (
    <Card title="Where the data goes">
      <Typography.Paragraph>
        To answer, {PRODUCT_NAME} sends the question and the records needed for it to the AI model named under This month, through the OpenRouter gateway,
        which writes the answer. Requests go only to providers that do not keep or train on them. Conversations are kept in {PRODUCT_NAME} for the person who asked, who can delete them.
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Ask {PRODUCT_NAME} only reads. It cannot create, approve, pay or delete anything, and every answer links to the records it used so people can check them.
      </Typography.Paragraph>
    </Card>
  );
}

export default function AiSettingsPage() {
  const { user } = useAuth();
  const allowed = !!user && canManageAi(user.roleKey);
  const { data, isLoading, error, refetch } = useAiSettings(allowed);
  if (!user) return null;
  if (!allowed)
    return (
      <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
        <PageHeader title={`Ask ${PRODUCT_NAME}`} />
        <Alert type="info" title={`Only an admin can change Ask ${PRODUCT_NAME} settings.`} />
      </div>
    );
  return (
    <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
      <PageHeader title={`Ask ${PRODUCT_NAME}`} subtitle="An assistant that answers questions about your company's records, with links to each record it used." />
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : isLoading || !data ? <PageSkeleton shape="record" header={false} /> : (
        <>
          <SettingsCard data={data} />
          <UsageCard data={data} />
          <DataCard />
        </>
      )}
    </div>
  );
}
