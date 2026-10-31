'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { AuthUser, RiskDto, RiskSortField } from '@erp/shared';
import { DELAY_PARTY_LABELS, RISK_CATEGORY_LABELS, canEditRisk } from '@erp/shared';
import { formatDate } from '@/lib/format';
import type { ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { KindTag, RiskStatusTag, ScoreTag } from './riskUi';

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** The delay and risk register's columns; keys of sortable ones are the API's sort fields. */
export function riskColumns({
  user,
  showProject,
  onOpen,
  onEdit,
  sortOrderFor,
}: {
  user: AuthUser | null;
  showProject?: boolean;
  onOpen: (id: string) => void;
  onEdit: (row: RiskDto) => void;
  sortOrderFor: (key: RiskSortField) => 'ascend' | 'descend' | null;
}): ListColumn<RiskDto>[] {
  const sort = (key: RiskSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { title: 'No.', dataIndex: 'riskNo', width: 135, className: 'mono', ...sort('riskNo') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: RiskDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> } satisfies ListColumn<RiskDto>]
      : []),
    { title: 'Type', dataIndex: 'kind', width: 80, ...sort('kind'), render: (k) => <KindTag kind={k} /> },
    {
      title: 'Delay / risk',
      label: 'Delay or risk',
      key: 'title',
      dataIndex: 'title',
      locked: true,
      render: (v, r) => (
        <div>
          <RecordLink onOpen={() => onOpen(r.id)}>{v}</RecordLink>
          <Sub>{[RISK_CATEGORY_LABELS[r.category], r.activityName].filter(Boolean).join(' · ')}</Sub>
        </div>
      ),
    },
    { title: 'Score', dataIndex: 'score', width: 80, align: 'center', ...sort('score'), render: (_, r) => <ScoreTag r={r} /> },
    {
      title: 'Days lost',
      key: 'days',
      width: 150,
      render: (_, r) =>
        r.kind === 'DELAY' ? (
          <div>
            <strong>{r.daysLost ?? 0}</strong>
            {!r.delayEnd && r.status !== 'CLOSED' ? (
              <AppTag tone="danger" style={{ marginLeft: 6 }}>
                ongoing
              </AppTag>
            ) : null}
            <Sub>{[r.responsibleParty ? DELAY_PARTY_LABELS[r.responsibleParty] : null, r.eotClaimed ? 'EOT claimed' : null].filter(Boolean).join(' · ')}</Sub>
          </div>
        ) : (
          <Sub>-</Sub>
        ),
      total: (rows) => rows.reduce((n, r) => n + (r.kind === 'DELAY' ? (r.daysLost ?? 0) : 0), 0),
    },
    { title: 'Category', dataIndex: 'category', width: 170, defaultHidden: true, ...sort('category'), render: (v: RiskDto['category']) => RISK_CATEGORY_LABELS[v] },
    { title: 'Owner', dataIndex: 'ownerName', width: 150, ...sort('owner'), render: (v) => v ?? <Sub>-</Sub> },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      width: 120,
      ...sort('dueDate'),
      render: (v, r) =>
        v ? (
          <Typography.Text type={r.overdue ? 'danger' : undefined} strong={r.overdue}>
            {formatDate(v)}
            {r.overdue ? ' (overdue)' : ''}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    { title: 'Updated', width: 110, defaultHidden: true, ...sort('updatedAt'), render: (_, r) => formatDate(r.updatedAt) },
    { title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 110, ...sort('status'), render: (s) => <RiskStatusTag status={s} /> },
    {
      title: '',
      key: 'actions',
      label: 'Actions',
      locked: true,
      fixed: 'right' as const,
      width: 90,
      render: (_, r) =>
        user && canEditRisk(user, r) ? (
          <Button size="small" onClick={() => onEdit(r)}>
            Edit
          </Button>
        ) : null,
    },
  ];
}
