'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Flex, InputNumber, Popconfirm, Select, Skeleton, Space, Switch, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApprovalEscalationDto, ApprovalMatrixDto, ApprovalRuleDto, ApproverKey, SubmissionType } from '@erp/shared';
import { APPROVAL_AMOUNT_BASIS, MAX_APPROVAL_LEVELS, SUBMISSION_TYPES, SUBMISSION_TYPE_LABELS, approverOf, canManageUsers, positionApprover, roleApprover, ruleApprover } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useApprovalMatrix } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { NoAccess } from '@/components/common/NoAccess';

/** One cell: may approve, and the limit (null = no limit). */
type Cell = { on: boolean; max: number | null };
/** Cells by approver key ("role:PROJECT_MANAGER", "position:site-in-charge"). */
type Grid = Record<string, Record<SubmissionType, Cell>>;
/** One row of the first-approval grid: a role, or a position of the company's list. */
type Row = { key: string; name: string; note: string };

const keyOf = (r: ApprovalRuleDto) => ruleApprover({ roleKey: r.roleKey, positionCode: r.positionCode ?? null }) as string;

const rowsOf = (m: ApprovalMatrixDto): Row[] => [
  ...m.roles.filter((r) => r.roleKey !== 'ADMIN').map((r) => ({ key: roleApprover(r.roleKey) as string, name: r.roleName, note: `${r.users} active user${r.users === 1 ? '' : 's'}` })),
  ...m.positions.map((p) => ({ key: positionApprover(p.code) as string, name: p.name, note: `Position · ${p.holders} holder${p.holders === 1 ? '' : 's'}` })),
];

const toGrid = (m: ApprovalMatrixDto): Grid => {
  const g: Grid = {};
  for (const r of rowsOf(m)) g[r.key] = Object.fromEntries(SUBMISSION_TYPES.map((t) => [t, { on: false, max: null }])) as Record<SubmissionType, Cell>;
  for (const r of m.rules) if (g[keyOf(r)] && (r.level ?? 1) === 1) g[keyOf(r)][r.type] = { on: true, max: r.maxAmount === null ? null : Number(r.maxAmount) };
  return g;
};

/** The levels after the first, 2 to 6. */
const HIGHER = Array.from({ length: MAX_APPROVAL_LEVELS - 1 }, (_, i) => i + 2);
const ORDINAL: Record<number, string> = { 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth', 6: 'Sixth' };

/** A higher approval level of one type: the roles and positions that approve it, from what amount (null = always). */
type Level = { approvers: string[]; from: number | null };
type Higher = Record<SubmissionType, { levels: Record<number, Level>; remind: number | null; escalate: number | null }>;

const toHigher = (m: ApprovalMatrixDto): Higher =>
  Object.fromEntries(
    SUBMISSION_TYPES.map((t) => {
      const level = (l: number): Level => {
        const rules = m.rules.filter((r) => r.type === t && r.level === l);
        return { approvers: rules.map(keyOf), from: rules[0]?.minAmount ? Number(rules[0].minAmount) : null };
      };
      const e = m.escalations.find((x) => x.type === t);
      return [t, { levels: Object.fromEntries(HIGHER.map((l) => [l, level(l)])), remind: e?.remindAfterHours ?? null, escalate: e?.escalateAfterHours ?? null }];
    }),
  ) as Higher;

const approverFields = (key: string) => approverOf(key as ApproverKey);

const toRules = (g: Grid, h: Higher): ApprovalRuleDto[] => [
  ...Object.entries(g).flatMap(([key, cells]) =>
    SUBMISSION_TYPES.filter((t) => cells[t].on).map((t) => ({ ...approverFields(key), type: t, level: 1, maxAmount: APPROVAL_AMOUNT_BASIS[t] && cells[t].max !== null ? String(cells[t].max) : null })),
  ),
  ...SUBMISSION_TYPES.flatMap((t) =>
    HIGHER.flatMap((level) =>
      h[t].levels[level].approvers.map((key) => ({ ...approverFields(key), type: t, level, maxAmount: null, minAmount: APPROVAL_AMOUNT_BASIS[t] && h[t].levels[level].from !== null ? String(h[t].levels[level].from) : null })),
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

  // Payments only against an approved payment request: a company switch beside the matrix.
  const payRule = useMutation({
    mutationFn: async (paymentsNeedRequest: boolean) => (await api.put<ApprovalMatrixDto>('/approval-rules', { paymentsNeedRequest })).data,
    onSuccess: (m) => {
      qc.setQueryData(['approval-rules'], (old: ApprovalMatrixDto | undefined) => (old ? { ...old, paymentsNeedRequest: m.paymentsNeedRequest } : m));
      void qc.invalidateQueries({ queryKey: ['payables'] });
      message.success(m.paymentsNeedRequest ? 'Payments now need an approved payment request' : 'Accounts can pay approved bills directly');
    },
    meta: FAIL_NOTICE,
  });

  // Orders only on an approved supplier choice: Finalise L1 goes to an approver before the purchase order.
  const choiceRule = useMutation({
    mutationFn: async (ordersNeedApprovedChoice: boolean) => (await api.put<ApprovalMatrixDto>('/approval-rules', { ordersNeedApprovedChoice })).data,
    onSuccess: (m) => {
      qc.setQueryData(['approval-rules'], (old: ApprovalMatrixDto | undefined) => (old ? { ...old, ordersNeedApprovedChoice: m.ordersNeedApprovedChoice } : m));
      void qc.invalidateQueries({ queryKey: ['quotations'] });
      message.success(m.ordersNeedApprovedChoice ? 'Orders now wait for an approved supplier choice' : 'Purchase can order as soon as L1 is finalised');
    },
    meta: FAIL_NOTICE,
  });

  // Progress from the DPR only: progress is recorded as the DPR's work lines.
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
  const setLevel = (t: SubmissionType, level: number, patch: Partial<Level>) => {
    setHigher((h) => (h ? { ...h, [t]: { ...h[t], levels: { ...h[t].levels, [level]: { ...h[t].levels[level], ...patch } } } } : h));
    setDirty(true);
  };
  const setTimes = (t: SubmissionType, patch: { remind?: number | null; escalate?: number | null }) => {
    setHigher((h) => (h ? { ...h, [t]: { ...h[t], ...patch } } : h));
    setEscDirty(true);
  };

  const rows = useMemo(() => (data ? rowsOf(data) : []), [data]);
  const noApprover = SUBMISSION_TYPES.filter((t) => !rows.some((r) => grid[r.key]?.[t]?.on));

  const columns: TableProps<Row>['columns'] = [
    {
      title: 'Role or position',
      dataIndex: 'name',
      fixed: 'left',
      width: 190,
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: tk.type.title.fontWeight }}>{v}</div>
          <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
            {r.note}
          </div>
        </div>
      ),
    },
    ...SUBMISSION_TYPES.map((t) => ({
      title: (
        <div>
          <div>{SUBMISSION_TYPE_LABELS[t]}</div>
          {APPROVAL_AMOUNT_BASIS[t] ? <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize, fontWeight: tk.type.body.fontWeight }}>limit on {APPROVAL_AMOUNT_BASIS[t]}</div> : null}
        </div>
      ),
      key: t,
      width: 170,
      render: (_: unknown, r: Row) => {
        const c = grid[r.key]?.[t];
        if (!c) return null;
        return (
          <Space orientation="vertical" size={4}>
            <Checkbox checked={c.on} onChange={(e) => set(r.key, t, { on: e.target.checked })} aria-label={`${r.name} approves ${SUBMISSION_TYPE_LABELS[t]}`}>
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
                onChange={(v) => set(r.key, t, { max: v ?? null })}
                style={{ width: 140 }}
                aria-label={`${r.name} ${SUBMISSION_TYPE_LABELS[t]} limit`}
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
        <NoAccess title="Only an admin can see and change the approval rules" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Approval rules"
        subtitle="Which roles and positions approve which submissions, in up to six levels, and up to what amount. Anything above a limit goes to an approver with a higher (or no) limit. Admin can always approve everything."
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
        <Alert type="info" showIcon style={{ marginBottom: tk.space[4] }} title="Using the standard rule: admin, management and project managers approve everything with no limit. Change a cell and save to set your own." />
      ) : null}
      {noApprover.length > 0 && data ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: tk.space[4] }}
          title={`Only admin can approve: ${noApprover.map((t) => SUBMISSION_TYPE_LABELS[t]).join(', ')}.`}
        />
      ) : null}
      <Card size="small">
        {isLoading ? <Skeleton active style={{ padding: tk.space[4] }} /> : null}
        {data ? (
          <Table
            rowKey="key"
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="middle"
            scroll={{ x: 190 + 170 * SUBMISSION_TYPES.length }}
            footer={() => (
              <Typography.Text type="secondary">
                <AppTag variant="kind" style={{ marginRight: tk.space[2] }}>Admin</AppTag>approves everything with no limit and is always notified. A position counts on the project its holder has it on, or everywhere when held at head office; set them on Users. Approvers still only see projects they have access to.
              </Typography.Text>
            )}
          />
        ) : null}
      </Card>
      {data && higher ? <HigherLevels rows={rows} higher={higher} setLevel={setLevel} setTimes={setTimes} /> : null}
      {data ? (
        <Card size="small" style={{ marginTop: tk.space[4] }}>
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
        <Card size="small" style={{ marginTop: tk.space[4] }}>
          <Flex gap={12} align="flex-start">
            <Switch checked={data.ordersNeedApprovedChoice} loading={choiceRule.isPending} onChange={(v) => choiceRule.mutate(v)} aria-labelledby="choice-rule" aria-describedby="choice-rule-note" />
            <div>
              <Typography.Text strong id="choice-rule">
                Orders wait for an approved supplier choice
              </Typography.Text>
              <Typography.Paragraph type="secondary" id="choice-rule-note" style={{ margin: 0 }}>
                When purchase finalises L1 (or chooses another supplier, with a reason) under Requests to order, the choice goes for approval under the {SUBMISSION_TYPE_LABELS.SUPPLIER_CHOICE} column above, and the order on a material request can be raised only on the approved supplier. Off, purchase orders as soon as it finalises.
              </Typography.Paragraph>
            </div>
          </Flex>
        </Card>
      ) : null}
      {data ? (
        <Card size="small" style={{ marginTop: tk.space[4] }}>
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
 * Approvals two to six above an amount, and reminders and escalation, per submission type. An entry that needs a higher
 * level stays waiting after the level before approves it; the same person never approves two levels.
 */
function HigherLevels({
  rows,
  higher,
  setLevel,
  setTimes,
}: {
  rows: Row[];
  higher: Higher;
  setLevel: (t: SubmissionType, level: number, patch: Partial<Level>) => void;
  setTimes: (t: SubmissionType, patch: { remind?: number | null; escalate?: number | null }) => void;
}) {
  const options = [
    { label: 'Roles', options: rows.filter((r) => r.key.startsWith('role:')).map((r) => ({ value: r.key, label: r.name })) },
    { label: 'Positions', options: rows.filter((r) => r.key.startsWith('position:')).map((r) => ({ value: r.key, label: r.name })) },
  ].filter((g) => g.options.length);
  const level = (l: number) => ({
    title: `${ORDINAL[l]} approval`,
    key: `level${l}`,
    width: 280,
    render: (_: unknown, t: SubmissionType) => {
      const v = higher[t].levels[l];
      const off = l > 2 && !higher[t].levels[l - 1].approvers.length;
      return (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <Select
            mode="multiple"
            size="small"
            allowClear
            disabled={off && !v.approvers.length}
            placeholder={off ? `Set a ${ORDINAL[l - 1].toLowerCase()} approval first` : 'Nobody'}
            options={options}
            value={v.approvers}
            onChange={(approvers: string[]) => setLevel(t, l, { approvers })}
            showSearch={{ optionFilterProp: 'label' }}
            style={{ width: '100%' }}
            aria-label={`${SUBMISSION_TYPE_LABELS[t]} ${ORDINAL[l].toLowerCase()} approval roles and positions`}
          />
          {v.approvers.length && APPROVAL_AMOUNT_BASIS[t] ? (
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
              aria-label={`${SUBMISSION_TYPE_LABELS[t]} ${ORDINAL[l].toLowerCase()} approval from amount`}
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
    hours('remind'),
    hours('escalate'),
    ...HIGHER.map(level),
  ];
  return (
    <Card size="small" title="Higher approval levels and escalation" style={{ marginTop: tk.space[4] }}>
      <Typography.Paragraph type="secondary">
        From the amount you set, an entry needs further approvals after the first, in order, up to six: it stays waiting until the last level approves, and nobody approves two levels of one entry. A level can name roles and
        positions, so a chain can follow the site (site in-charge, team leader, project manager) and head office (accounts, then the general manager or the managing director, each with their own limit on the first
        approval&apos;s grid). Reminders go to whoever it waits with; once it has waited past the escalation time, the next level&apos;s approvers (management above the last level) can decide it too and are told. Both are
        checked every hour.
      </Typography.Paragraph>
      <Table rowKey={(t) => t} columns={columns} dataSource={[...SUBMISSION_TYPES]} pagination={false} size="small" scroll={{ x: 170 + 150 * 2 + 280 * HIGHER.length }} />
    </Card>
  );
}
