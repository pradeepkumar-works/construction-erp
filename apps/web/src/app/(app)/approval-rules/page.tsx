'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, InputNumber, Popconfirm, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApprovalMatrixDto, ApprovalRuleDto, RoleKey, SubmissionType } from '@erp/shared';
import { APPROVAL_AMOUNT_BASIS, SUBMISSION_TYPES, SUBMISSION_TYPE_LABELS, canManageUsers } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
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
  for (const r of m.rules) if (g[r.roleKey]) g[r.roleKey][r.type] = { on: true, max: r.maxAmount === null ? null : Number(r.maxAmount) };
  return g;
};

const toRules = (g: Grid): ApprovalRuleDto[] =>
  Object.entries(g).flatMap(([roleKey, cells]) =>
    SUBMISSION_TYPES.filter((t) => cells[t].on).map((t) => ({ roleKey: roleKey as RoleKey, type: t, maxAmount: APPROVAL_AMOUNT_BASIS[t] && cells[t].max !== null ? String(cells[t].max) : null })),
  );

export default function ApprovalRulesPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const admin = !!user && canManageUsers(user.roleKey);
  const { data, isLoading, error, refetch } = useApprovalMatrix(admin);
  const [grid, setGrid] = useState<Grid>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (data) {
      setGrid(toGrid(data));
      setDirty(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (rules: ApprovalRuleDto[]) => (await api.put<ApprovalMatrixDto>('/approval-rules', { rules })).data,
    onSuccess: (m) => {
      qc.setQueryData(['approval-rules'], m);
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      message.success(m.custom ? 'Approval rules saved' : 'Back to the standard rule');
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const set = (role: string, t: SubmissionType, patch: Partial<Cell>) => {
    setGrid((g) => ({ ...g, [role]: { ...g[role], [t]: { ...g[role][t], ...patch } } }));
    setDirty(true);
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
        <PageHeader title="Approval Rules" />
        <Alert type="info" showIcon title="Only an admin can see and change the approval rules." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Approval Rules"
        subtitle="Which roles approve which submissions, and up to what amount. Anything above a limit goes to a role with a higher (or no) limit. Admin can always approve everything."
        extra={
          <Space wrap>
            {data?.custom ? (
              <Popconfirm title="Go back to the standard rule?" description="Admin, management and project managers approve everything, with no limit." onConfirm={() => save.mutate([])}>
                <Button disabled={save.isPending}>Use standard rule</Button>
              </Popconfirm>
            ) : null}
            <Button
              disabled={!dirty}
              onClick={() => {
                if (data) setGrid(toGrid(data));
                setDirty(false);
              }}
            >
              Undo changes
            </Button>
            <Button type="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(toRules(grid))}>
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
    </div>
  );
}
