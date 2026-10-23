'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Flex, InputNumber, Popconfirm, Select, Skeleton, Space, Switch, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApprovalEscalationDto, ApprovalMatrixDto, ApprovalRuleDto, RoleKey, SubmissionType } from '@erp/shared';
import { APPROVAL_AMOUNT_BASIS, SUBMISSION_TYPES, SUBMISSION_TYPE_LABELS, canManageUsers } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useApprovalMatrix } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { themeFontSize } from '@/lib/theme';

/** One cell: may approve, and the limit (null = no limit). */
type Cell = { on: boolean; max: number | null };
type Grid = Record<string, Record<SubmissionType, Cell>>;

const toGrid = (m: ApprovalMatrixDto): Grid => {
  const g: Grid = {};
  for (const r of m.roles) {
    g[r.roleKey] = Object.fromEntries(SUBMISSION_TYPES.map((t) => [t, { on: false, max: null }])) as Record<SubmissionType, Cell>;
  }
  for (const r of m.rules) if (g[r.roleKey] && (r.level ?? 1) === 1) g[r.roleKey][r.type] = { on: true, max: r.maxAmount === null ? null : Number(r.maxAmount) };
  return g;
};

/** A higher approval level of one type (v5 item 94): the roles that approve it, from what amount (null = always). */
type Level = { roles: RoleKey[]; from: number | null };
type Higher = Record<SubmissionType, { 2: Level; 3: Level; remind: number | null; escalate: number | null }>;

const toHigher = (m: ApprovalMatrixDto): Higher =>
  Object.fromEntries(
    SUBMISSION_TYPES.map((t) => {
      const level = (l: number): Level => {
        const rules = m.rules.filter((r) => r.type === t && r.level === l);
        return { roles: rules.map((r) => r.roleKey), from: rules[0]?.minAmount ? Number(rules[0].minAmount) : null };
      };
      const e = m.escalations.find((x) => x.type === t);
      return [t, { 2: level(2), 3: level(3), remind: e?.remindAfterHours ?? null, escalate: e?.escalateAfterHours ?? null }];
    }),
  ) as Higher;

const toRules = (g: Grid, h: Higher): ApprovalRuleDto[] => [
  ...Object.entries(g).flatMap(([roleKey, cells]) =>
    SUBMISSION_TYPES.filter((t) => cells[t].on).map((t) => ({ roleKey: roleKey as RoleKey, type: t, level: 1, maxAmount: APPROVAL_AMOUNT_BASIS[t] && cells[t].max !== null ? String(cells[t].max) : null })),
  ),
  ...SUBMISSION_TYPES.flatMap((t) =>
    ([2, 3] as const).flatMap((level) =>
      h[t][level].roles.map((roleKey) => ({ roleKey, type: t, level, maxAmount: null, minAmount: APPROVAL_AMOUNT_BASIS[t] && h[t][level].from !== null ? String(h[t][level].from) : null })),
    ),
  ),
];

const toEscalations = (h: Higher): ApprovalEscalationDto[] =>
  SUBMISSION_TYPES.filter((t) => h[t].remind || h[t].escalate).map((t) => ({ type: t, remindAfterHours: h[t].remind, escalateAfterHours: h[t].escalate }));

export default function ApprovalRulesPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const admin = !!user && canManageUsers(user.roleKey);
  const { data, isLoading, error, refetch } = useApprovalMatrix(admin);
  const [grid, setGrid] = useState<Grid>({});
  const [higher, setHigher] = useState<Higher | null>(null);
  // Rules and escalation are saved apart, so timing reminders alone leaves a company on the standard rule.
  const [dirty, setDirty] = useState(false);
  const [escDirty, setEscDirty] = useState(false);
  useEffect(() => {
    if (data) {
      setGrid(toGrid(data));
      setHigher(toHigher(data));
      setDirty(false);
      setEscDirty(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (body: { rules?: ApprovalRuleDto[]; escalations?: ApprovalEscalationDto[] }) => (await api.put<ApprovalMatrixDto>('/approval-rules', body)).data,
    onSuccess: (m) => {
      qc.setQueryData(['approval-rules'], m);
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      message.success(m.custom || !dirty ? 'Approval rules saved' : 'Back to the standard rule');
    },
    meta: FAIL_NOTICE,
  });

  // Payments only against an approved payment request (v5 item 90): a company switch beside the matrix.
  const payRule = useMutation({
    mutationFn: async (paymentsNeedRequest: boolean) => (await api.put<ApprovalMatrixDto>('/approval-rules', { paymentsNeedRequest })).data,
    onSuccess: (m) => {
      qc.setQueryData(['approval-rules'], (old: ApprovalMatrixDto | undefined) => (old ? { ...old, paymentsNeedRequest: m.paymentsNeedRequest } : m));
      void qc.invalidateQueries({ queryKey: ['payables'] });
      message.success(m.paymentsNeedRequest ? 'Payments now need an approved payment request' : 'Accounts can pay approved bills directly');
    },
    meta: FAIL_NOTICE,
  });

  // Progress from the DPR only (item 127): progress is recorded as the DPR's work lines.
  const dprRule = useMutation({
    mutationFn: async (progressFromDpr: boolean) => (await api.put<ApprovalMatrixDto>('/approval-rules', { progressFromDpr })).data,
    onSuccess: (m) => {
      qc.setQueryData(['approval-rules'], (old: ApprovalMatrixDto | undefined) => (old ? { ...old, progressFromDpr: m.progressFromDpr } : m));
      void qc.invalidateQueries({ queryKey: ['activities'] });
      message.success(m.progressFromDpr ? 'Progress now comes from the DPR only' : 'Progress can also be recorded on its own');
    },
    meta: FAIL_NOTICE,
  });

  const set = (role: string, t: SubmissionType, patch: Partial<Cell>) => {
    setGrid((g) => ({ ...g, [role]: { ...g[role], [t]: { ...g[role][t], ...patch } } }));
    setDirty(true);
  };
  const setLevel = (t: SubmissionType, level: 2 | 3, patch: Partial<Level>) => {
    setHigher((h) => (h ? { ...h, [t]: { ...h[t], [level]: { ...h[t][level], ...patch } } } : h));
    setDirty(true);
  };
  const setTimes = (t: SubmissionType, patch: { remind?: number | null; escalate?: number | null }) => {
    setHigher((h) => (h ? { ...h, [t]: { ...h[t], ...patch } } : h));
    setEscDirty(true);
  };

  const rows = useMemo(() => (data?.roles ?? []).filter((r) => r.roleKey !== 'ADMIN'), [data]);
  const noApprover = SUBMISSION_TYPES.filter((t) => !rows.some((r) => grid[r.roleKey]?.[t]?.on));

  const columns: TableProps<(typeof rows)[number]>['columns'] = [
    {
      title: 'Role',
      dataIndex: 'roleName',
      fixed: 'left',
      width: 190,
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.users} active user{r.users === 1 ? '' : 's'}
          </div>
        </div>
      ),
    },
    ...SUBMISSION_TYPES.map((t) => ({
      title: (
        <div>
          <div>{SUBMISSION_TYPE_LABELS[t]}</div>
          {APPROVAL_AMOUNT_BASIS[t] ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM'), fontWeight: 400 }}>limit on {APPROVAL_AMOUNT_BASIS[t]}</div> : null}
        </div>
      ),
      key: t,
      width: 170,
      render: (_: unknown, r: (typeof rows)[number]) => {
        const c = grid[r.roleKey]?.[t];
        if (!c) return null;
        return (
          <Space orientation="vertical" size={4}>
            <Checkbox checked={c.on} onChange={(e) => set(r.roleKey, t, { on: e.target.checked })} aria-label={`${r.roleName} approves ${SUBMISSION_TYPE_LABELS[t]}`}>
              Approves
            </Checkbox>
            {c.on && APPROVAL_AMOUNT_BASIS[t] ? (
              <InputNumber<number>
                size="small"
                min={0}
                step={1000}
                precision={0}
                prefix="₹"
                placeholder="No limit"
                value={c.max}
                onChange={(v) => set(r.roleKey, t, { max: v ?? null })}
                style={{ width: 140 }}
                aria-label={`${r.roleName} ${SUBMISSION_TYPE_LABELS[t]} limit`}
              />
            ) : null}
          </Space>
        );
      },
    })),
  ];

  if (!admin) {
    return (
      <div className="page-container">
        <PageHeader title="Approval rules" />
        <Alert type="info" showIcon title="Only an admin can see and change the approval rules." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Approval rules"
        subtitle="Which roles approve which submissions, and up to what amount. Anything above a limit goes to a role with a higher (or no) limit. Admin can always approve everything."
        extra={
          <Space wrap>
            {data?.custom ? (
              <Popconfirm title="Go back to the standard rule?" description="Admin, management and project managers approve everything, with no limit." okText="Go back to standard" okButtonProps={{ danger: true }} onConfirm={() => save.mutate({ rules: [] })}>
                <Button disabled={save.isPending}>Use standard rule</Button>
              </Popconfirm>
            ) : null}
            <Button
              disabled={!dirty}
              onClick={() => {
                if (data) {
                  setGrid(toGrid(data));
                  setHigher(toHigher(data));
                }
                setDirty(false);
                setEscDirty(false);
              }}
            >
              Undo changes
            </Button>
            <Button
              type="primary"
              disabled={!dirty && !escDirty}
              loading={save.isPending}
              onClick={() => higher && save.mutate({ rules: dirty ? toRules(grid, higher) : undefined, escalations: escDirty ? toEscalations(higher) : undefined })}
            >
              Save rules
            </Button>
          </Space>
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && !data.custom && !dirty ? (
        <Alert type="info" showIcon style={{ marginBottom: 16 }} title="Using the standard rule: admin, management and project managers approve everything with no limit. Change a cell and save to set your own." />
      ) : null}
      {noApprover.length > 0 && data ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title={`Only admin can approve: ${noApprover.map((t) => SUBMISSION_TYPE_LABELS[t]).join(', ')}.`}
        />
      ) : null}
      <Card size="small">
        {isLoading ? <Skeleton active style={{ padding: 16 }} /> : null}
        {data ? (
          <Table
            rowKey="roleKey"
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="middle"
            scroll={{ x: 190 + 170 * SUBMISSION_TYPES.length }}
            footer={() => (
              <Typography.Text type="secondary">
                <Tag style={{ marginRight: 8 }}>Admin</Tag>approves everything with no limit and is always notified. Approvers still only see projects they have access to.
              </Typography.Text>
            )}
          />
        ) : null}
      </Card>
      {data && higher ? <HigherLevels roles={rows} higher={higher} setLevel={setLevel} setTimes={setTimes} /> : null}
      {data ? (
        <Card size="small" style={{ marginTop: 16 }}>
          <Flex gap={12} align="flex-start">
            <Switch checked={data.paymentsNeedRequest} loading={payRule.isPending} onChange={(v) => payRule.mutate(v)} aria-labelledby="pay-request-rule" aria-describedby="pay-request-rule-note" />
            <div>
              <Typography.Text strong id="pay-request-rule">
                Payments need an approved payment request
              </Typography.Text>
              <Typography.Paragraph type="secondary" id="pay-request-rule-note" style={{ margin: 0 }}>
                Accounts pays a bill only against a payment request approved under the {SUBMISSION_TYPE_LABELS.PAYMENT_REQUEST} column above. Off, accounts can also pay any approved bill directly. Advances always need a request.
              </Typography.Paragraph>
            </div>
          </Flex>
        </Card>
      ) : null}
      {data ? (
        <Card size="small" style={{ marginTop: 16 }}>
          <Flex gap={12} align="flex-start">
            <Switch checked={data.progressFromDpr} loading={dprRule.isPending} onChange={(v) => dprRule.mutate(v)} aria-labelledby="dpr-progress-rule" aria-describedby="dpr-progress-rule-note" />
            <div>
              <Typography.Text strong id="dpr-progress-rule">
                Progress comes from the DPR only
              </Typography.Text>
              <Typography.Paragraph type="secondary" id="dpr-progress-rule-note" style={{ margin: 0 }}>
                Site staff record the day&apos;s work as the DPR&apos;s work lines, approved with the DPR under the {SUBMISSION_TYPE_LABELS.DPR} column above, so nobody types the work twice. Off, progress can also be recorded on its own. Entries already recorded stay as they are.
              </Typography.Paragraph>
            </div>
          </Flex>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Second and third approvals above an amount, and reminders and escalation, per submission type (v5 item 94). An entry
 * that needs a higher level stays waiting after the level before approves it; the same person never approves two levels.
 */
function HigherLevels({
  roles,
  higher,
  setLevel,
  setTimes,
}: {
  roles: { roleKey: RoleKey; roleName: string }[];
  higher: Higher;
  setLevel: (t: SubmissionType, level: 2 | 3, patch: Partial<Level>) => void;
  setTimes: (t: SubmissionType, patch: { remind?: number | null; escalate?: number | null }) => void;
}) {
  const options = roles.map((r) => ({ value: r.roleKey, label: r.roleName }));
  const level = (l: 2 | 3) => ({
    title: l === 2 ? 'Second approval' : 'Third approval',
    key: `level${l}`,
    width: 300,
    render: (_: unknown, t: SubmissionType) => {
      const v = higher[t][l];
      const off = l === 3 && !higher[t][2].roles.length;
      return (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <Select
            mode="multiple"
            size="small"
            allowClear
            disabled={off && !v.roles.length}
            placeholder={off ? 'Set a second approval first' : 'Nobody'}
            options={options}
            value={v.roles}
            onChange={(roles: RoleKey[]) => setLevel(t, l, { roles })}
            style={{ width: '100%' }}
            aria-label={`${SUBMISSION_TYPE_LABELS[t]} ${l === 2 ? 'second' : 'third'} approval roles`}
          />
          {v.roles.length && APPROVAL_AMOUNT_BASIS[t] ? (
            <InputNumber<number>
              size="small"
              min={0}
              step={10000}
              precision={0}
              prefix="From ₹"
              placeholder="Every amount"
              value={v.from}
              onChange={(from) => setLevel(t, l, { from: from ?? null })}
              style={{ width: 180 }}
              aria-label={`${SUBMISSION_TYPE_LABELS[t]} ${l === 2 ? 'second' : 'third'} approval from amount`}
            />
          ) : null}
        </Space>
      );
    },
  });
  const hours = (k: 'remind' | 'escalate') => ({
    title: k === 'remind' ? 'Remind after' : 'Escalate after',
    key: k,
    width: 150,
    render: (_: unknown, t: SubmissionType) => (
      <InputNumber<number>
        size="small"
        min={1}
        max={720}
        precision={0}
        suffix="hours"
        placeholder="Never"
        value={higher[t][k]}
        onChange={(v) => setTimes(t, { [k]: v ?? null })}
        style={{ width: 130 }}
        aria-label={`${SUBMISSION_TYPE_LABELS[t]} ${k === 'remind' ? 'remind approvers after hours' : 'escalate after hours'}`}
      />
    ),
  });
  const columns: TableProps<SubmissionType>['columns'] = [
    { title: 'Submission', key: 'type', fixed: 'left', width: 170, render: (_: unknown, t: SubmissionType) => <Typography.Text strong>{SUBMISSION_TYPE_LABELS[t]}</Typography.Text> },
    level(2),
    level(3),
    hours('remind'),
    hours('escalate'),
  ];
  return (
    <Card size="small" title="Higher approval levels and escalation" style={{ marginTop: 16 }}>
      <Typography.Paragraph type="secondary">
        From the amount you set, an entry needs a second (and third) approval after the first: it stays waiting until the last level approves, and nobody approves two levels of one entry. Reminders go to whoever it waits with; once it has
        waited past the escalation time, the next level&apos;s roles (management above the last level) can decide it too and are told. Both are checked every hour.
      </Typography.Paragraph>
      <Table rowKey={(t) => t} columns={columns} dataSource={[...SUBMISSION_TYPES]} pagination={false} size="small" scroll={{ x: 170 + 300 * 2 + 150 * 2 }} />
    </Card>
  );
}
