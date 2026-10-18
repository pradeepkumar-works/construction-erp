'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Descriptions, Drawer, Flex, Input, InputNumber, Progress, Radio, Select, Space, Spin, Switch, Table, Tag, Typography, theme } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import XMarkdown from '@ant-design/x-markdown';
import dayjs from 'dayjs';
import type { AiConversationDto, AiConversationExportRowDto, AiFeature, AiSettingsDto, AiUserUsageDto, RoleKey } from '@erp/shared';
import { AI_EXPORT_MAX_ROWS, AI_FEATURE_LABELS, AI_ROLE_CHOICES, BILLING_STATUS_LABELS, BILLING_UNIT_LABELS, PRODUCT_NAME, ROLE_LABELS, canManageAi } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useNotify } from '@/lib/notify';
import { formatDateTime, formatINR, formatMonth } from '@/lib/format';
import { downloadXlsx } from '@/lib/exportExcel';
import { useAiConversation, useAiConversations, useAiSettings, useUpdateAiSettings } from '@/lib/queries';
import { askShortcutLabel } from '@/lib/shortcuts';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';

function SettingsCard({ data }: { data: AiSettingsDto }) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const update = useUpdateAiSettings();
  const notify = useNotify();
  const [cap, setCap] = useState<number | null>(data.monthlyCapInr);
  useEffect(() => setCap(data.monthlyCapInr), [data.monthlyCapInr]);
  const [limited, setLimited] = useState(data.roles.length > 0);
  const [roles, setRoles] = useState<RoleKey[]>(data.roles);
  useEffect(() => {
    setLimited(data.roles.length > 0);
    setRoles(data.roles);
  }, [data.roles]);
  const rolesChanged = limited ? roles.length !== data.roles.length || roles.some((r) => !data.roles.includes(r)) : data.roles.length > 0;

  const save = (change: { enabled?: boolean; monthlyCapInr?: number | null; roles?: RoleKey[] }, done: string) =>
    update.mutate(change, { onSuccess: () => message.success(done), onError: (e) => notify.failed(e, () => save(change, done)) });
  const plan = data.plan;
  const unit = plan ? BILLING_UNIT_LABELS[plan.unit] : null;

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
              On for the company
            </label>
            <Typography.Paragraph id="ai-enabled-help" type="secondary" style={{ margin: 0 }}>
              Staff get the Ask button in the header ({askShortcutLabel()}). Each person&apos;s answers come only from what their own role can see in {PRODUCT_NAME}. The client&apos;s
              engineer and the consultant never see it.
            </Typography.Paragraph>
          </div>
        </Flex>
        <div role="group" aria-labelledby="ai-roles-label">
          <div id="ai-roles-label" style={{ fontWeight: 600, marginBottom: token.marginXXS }}>
            Who can use it
          </div>
          <Radio.Group
            value={limited ? 'some' : 'all'}
            onChange={(e) => setLimited(e.target.value === 'some')}
            options={[
              { value: 'all', label: 'All staff' },
              { value: 'some', label: 'Only the roles I choose' },
            ]}
          />
          {limited && (
            <Checkbox.Group
              aria-label="Roles that can use it"
              value={roles}
              onChange={(v) => setRoles(v as RoleKey[])}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: token.marginXS, marginTop: token.marginSM }}
              options={AI_ROLE_CHOICES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            />
          )}
          <Flex gap={token.marginSM} align="center" wrap style={{ marginTop: token.marginSM }}>
            <Button
              type="primary"
              disabled={!rolesChanged || (limited && !roles.length)}
              loading={update.isPending && update.variables?.roles !== undefined}
              onClick={() => save({ roles: limited ? roles : [] }, limited ? 'Roles saved' : 'Open to all staff')}
            >
              Save roles
            </Button>
            <Typography.Text type="secondary">{limited && !roles.length ? 'Choose at least one role, or pick All staff.' : 'Admins can always use it.'}</Typography.Text>
          </Flex>
        </div>
        <div>
          <label htmlFor="ai-cap" style={{ fontWeight: 600, display: 'block', marginBottom: token.marginXXS }}>
            Monthly allowance
          </label>
          <Space wrap>
            <InputNumber
              id="ai-cap"
              prefix="₹"
              min={0}
              max={plan ? plan.allowanceInr : 10_000_000}
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
            {data.monthlyCapInr !== null && <Button onClick={() => save({ monthlyCapInr: null }, plan ? "Allowance back to the plan's" : 'Allowance back to the default')}>{plan ? "Use the plan's" : 'Use the default'}</Button>}
          </Space>
          <Typography.Paragraph type="secondary" style={{ margin: `${token.marginXXS}px 0 0` }}>
            Ask {PRODUCT_NAME} stops for the rest of the month once the company has used this much.{' '}
            {plan
              ? `Your plan includes ${formatINR(plan.allowanceInr)} a month${
                  plan.status === 'TRIAL' ? ' in the free trial' : plan.status === 'ACTIVE' && unit ? ` (${plan.units} ${plan.units === 1 ? unit.one : unit.many} at ${formatINR(plan.perUnitInr)} each)` : ''
                }; you can set a lower allowance, not a higher one.`
              : data.monthlyCapInr === null
                ? `This is the default of ${formatINR(data.effectiveCapInr)}.`
                : ''}{' '}
            Each person can also ask a limited number of questions a day.
          </Typography.Paragraph>
          {plan?.status === 'READ_ONLY' && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: token.marginSM }}
              title={`Paused: ${BILLING_STATUS_LABELS.READ_ONLY}`}
              description={`The trial or subscription has ended, so Ask ${PRODUCT_NAME} is paused with the rest of the company's changes. Renew under Billing to use it again.`}
            />
          )}
        </div>
      </Flex>
    </Card>
  );
}

/** The current month and the eleven before it, newest first. */
const recentMonths = () => Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, 'month').format('YYYY-MM'));

function UsageCard({ data, month, onMonth }: { data: AiSettingsDto; month: string; onMonth: (m: string) => void }) {
  const { token } = theme.useToken();
  const current = data.month === dayjs().format('YYYY-MM');
  const pct = data.effectiveCapInr > 0 ? Math.min(100, Math.round((data.spentThisMonthInr / data.effectiveCapInr) * 100)) : 100;
  return (
    <Card
      title="Use"
      style={{ marginBottom: token.margin }}
      extra={<Select aria-label="Month" value={month} onChange={onMonth} style={{ width: 140 }} options={recentMonths().map((m) => ({ value: m, label: formatMonth(m) }))} />}
    >
      <Descriptions
        column={{ xs: 1, sm: 3 }}
        items={[
          { key: 'spent', label: 'Used', children: current ? `${formatINR(data.spentThisMonthInr)} of ${formatINR(data.effectiveCapInr)}` : formatINR(data.spentThisMonthInr) },
          { key: 'questions', label: 'Questions', children: data.questionsThisMonth.toLocaleString('en-IN') },
          { key: 'model', label: 'Model', children: data.model },
        ]}
      />
      {current && <Progress percent={pct} status={pct >= 100 ? 'exception' : 'normal'} aria-label={`${pct}% of the monthly allowance used`} style={{ maxWidth: 480 }} />}
      <Typography.Paragraph type="secondary" style={{ marginTop: token.marginXS }}>
        What the AI provider charged for each answer, in rupees at the server&apos;s exchange rate; the provider&apos;s own invoice is the final figure.
      </Typography.Paragraph>
      <Typography.Title level={2} style={{ fontSize: token.fontSizeLG }}>
        By feature
      </Typography.Title>
      <Table
        size="small"
        rowKey="feature"
        pagination={false}
        dataSource={data.byFeature}
        style={{ marginBottom: token.marginLG }}
        columns={[
          { key: 'feature', title: 'Used for', dataIndex: 'feature', render: (f: AiFeature) => AI_FEATURE_LABELS[f] },
          { key: 'count', title: 'How many', dataIndex: 'count', align: 'right', render: (n: number) => n.toLocaleString('en-IN') },
          { key: 'spent', title: 'Used', dataIndex: 'spentInr', align: 'right', render: (v: number) => formatINR(v) },
        ]}
      />
      <Typography.Title level={2} style={{ fontSize: token.fontSizeLG }}>
        By person
      </Typography.Title>
      <Table<AiUserUsageDto>
        size="small"
        rowKey="userId"
        pagination={data.byUser.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        dataSource={data.byUser}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: `Nobody used Ask ${PRODUCT_NAME} in ${formatMonth(data.month)}` }}
        columns={[
          { key: 'name', title: 'Person', dataIndex: 'fullName' },
          { key: 'role', title: 'Role', dataIndex: 'roleKey', render: (r: RoleKey) => ROLE_LABELS[r] },
          { key: 'questions', title: 'Questions', dataIndex: 'questions', align: 'right' },
          { key: 'reads', title: 'Documents read', dataIndex: 'reads', align: 'right' },
          { key: 'briefs', title: 'Briefs', dataIndex: 'briefs', align: 'right' },
          { key: 'notHelpful', title: 'Rated not helpful', dataIndex: 'notHelpful', align: 'right' },
          { key: 'spent', title: 'Used', dataIndex: 'spentInr', align: 'right', render: (v: number) => formatINR(v) },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ margin: `${token.marginXS}px 0 0` }}>
        Bill check summaries, photo checks and weekly project summaries run for the company, so they count under By feature only.
      </Typography.Paragraph>
    </Card>
  );
}

const PAGE_SIZE = 20;

function ConversationsCard({ month, people }: { month: string; people: AiUserUsageDto[] }) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const notify = useNotify();
  const [userId, setUserId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => setPage(1), [month, userId, q]);
  const filters = useMemo(() => ({ month, userId, q: q || undefined, page, pageSize: PAGE_SIZE }), [month, userId, q, page]);
  const list = useAiConversations(filters, true);

  const exportLog = async () => {
    setExporting(true);
    try {
      const { data: rows } = await api.get<AiConversationExportRowDto[]>('/ai/conversations/export', { params: { month, userId, q: q || undefined } });
      if (!rows.length) {
        message.info('No conversations to export');
        return;
      }
      await downloadXlsx(`ask-${PRODUCT_NAME.toLowerCase()}-${month}`, 'Conversations', [
        { header: 'When', value: (r) => formatDateTime(r.at), width: 18 },
        { header: 'Person', value: (r) => r.fullName, width: 22 },
        { header: 'Conversation', value: (r) => r.title, width: 40 },
        { header: 'Question or answer', value: (r) => r.role, width: 12 },
        { header: 'Text', value: (r) => r.text, width: 80 },
        { header: 'Rating', value: (r) => r.rating ?? '' },
        { header: 'Model', value: (r) => r.model ?? '', width: 24 },
        { header: 'Cost (₹)', value: (r) => r.costInr },
      ], rows);
      if (rows.length >= AI_EXPORT_MAX_ROWS) message.warning(`Only the first ${AI_EXPORT_MAX_ROWS.toLocaleString('en-IN')} questions and answers were exported; narrow the search for the rest.`);
    } catch (e) {
      notify.failed(e, () => void exportLog());
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card
      title="Conversation log"
      style={{ marginBottom: token.margin }}
      extra={
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportLog()}>
          Export
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        Every question asked in {formatMonth(month)} and its answer. People are told in Ask {PRODUCT_NAME} that admins can read them; opening or exporting one is recorded in the audit log.
      </Typography.Paragraph>
      <Flex gap={token.marginSM} wrap style={{ marginBottom: token.marginSM }}>
        <Select
          allowClear
          aria-label="Person"
          placeholder="Everyone"
          value={userId}
          onChange={setUserId}
          style={{ width: 220 }}
          showSearch={{ optionFilterProp: 'label' }}
          options={people.map((p) => ({ value: p.userId, label: p.fullName }))}
        />
        <Input.Search aria-label="Search the conversations" placeholder="Search questions and answers" allowClear value={search} onChange={(e) => setSearch(e.target.value)} onSearch={(v) => setQ(v.trim())} style={{ width: 280 }} />
      </Flex>
      {list.error ? (
        <QueryError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <Table<AiConversationDto>
          size="small"
          rowKey="id"
          loading={list.isFetching}
          dataSource={list.data?.items ?? []}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: q || userId ? 'No conversations match' : `No conversations in ${formatMonth(month)}` }}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, showSizeChanger: false, onChange: setPage, hideOnSinglePage: true }}
          onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
          columns={[
            { key: 'updatedAt', title: 'Last asked', dataIndex: 'updatedAt', render: (v: string) => formatDateTime(v) },
            { key: 'person', title: 'Person', dataIndex: 'fullName' },
            {
              key: 'title',
              title: 'Conversation',
              dataIndex: 'title',
              render: (v: string, r) => (
                <Button type="link" size="small" style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'start' }} onClick={() => setOpenId(r.id)}>
                  {v}
                </Button>
              ),
            },
            { key: 'questions', title: 'Questions', dataIndex: 'questions', align: 'right' },
            { key: 'notHelpful', title: 'Not helpful', dataIndex: 'notHelpful', align: 'right', render: (n: number) => (n ? <Tag color="warning">{n}</Tag> : 0) },
            { key: 'spent', title: 'Used', dataIndex: 'spentInr', align: 'right', render: (v: number) => formatINR(v) },
          ]}
        />
      )}
      <ConversationDrawer id={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function ConversationDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { token } = theme.useToken();
  const { data, isLoading, error, refetch } = useAiConversation(id);
  return (
    <Drawer open={!!id} onClose={onClose} size="large" title={data ? data.title : 'Conversation'} destroyOnHidden>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Flex justify="center" style={{ padding: token.paddingLG }}>
          <Spin description="Loading" />
        </Flex>
      ) : (
        <Flex vertical gap={token.marginSM}>
          <Typography.Text type="secondary">
            {data.fullName} · {data.questions} question{data.questions === 1 ? '' : 's'} · {formatINR(data.spentInr)}
          </Typography.Text>
          {data.messages.map((m) => (
            <div
              key={m.id}
              style={{
                padding: token.paddingSM,
                borderRadius: token.borderRadius,
                background: m.role === 'user' ? token.colorFillQuaternary : undefined,
                border: m.role === 'user' ? undefined : `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM, display: 'block' }}>
                {m.role === 'user' ? 'Question' : 'Answer'} · {formatDateTime(m.createdAt)}
                {m.role === 'assistant' && m.model ? ` · ${m.model} · ${formatINR(m.costInr)}` : ''}
              </Typography.Text>
              {m.role === 'assistant' && m.text ? (
                <div style={{ marginTop: token.marginXXS }}>
                  <XMarkdown content={m.text} escapeRawHtml />
                </div>
              ) : (
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: `${token.marginXXS}px 0 0` }}>{m.text || '(no text)'}</Typography.Paragraph>
              )}
              {m.role === 'assistant' && (m.tools.length || m.feedback || m.unverified.length) ? (
                <Flex gap={token.marginXXS} wrap>
                  {m.feedback === 1 && <Tag color="success">Helpful</Tag>}
                  {m.feedback === -1 && <Tag color="warning">Not helpful</Tag>}
                  {m.unverified.length ? <Tag color="warning">Figures not found in records: {m.unverified.join(', ')}</Tag> : null}
                  {m.tools.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </Flex>
              ) : null}
            </div>
          ))}
        </Flex>
      )}
    </Drawer>
  );
}

function DataCard() {
  return (
    <Card title="Where the data goes">
      <Typography.Paragraph>
        To answer, {PRODUCT_NAME} sends the question and the records needed for it to the AI model named under Use, through the OpenRouter gateway, which writes the answer. Requests go
        only to providers that do not keep or train on them. Conversations are kept in {PRODUCT_NAME} for the person who asked, who can delete them, and the company&apos;s admins can read
        them in the conversation log.
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
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const { data, isLoading, error, refetch } = useAiSettings(allowed, month);
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
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <PageSkeleton shape="record" header={false} />
      ) : (
        <>
          <SettingsCard data={data} />
          <UsageCard data={data} month={month} onMonth={setMonth} />
          {!user.support && <ConversationsCard month={month} people={data.byUser} />}
          <DataCard />
        </>
      )}
    </div>
  );
}
