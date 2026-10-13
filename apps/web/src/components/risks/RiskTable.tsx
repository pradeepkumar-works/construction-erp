'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { RiskDto, RiskSortField } from '@erp/shared';
import { DELAY_PARTY_LABELS, RISK_CATEGORY_LABELS, canEditRisk } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { KindTag, RiskStatusTag, ScoreTag } from './riskUi';

export function RiskTable({
  data,
  loading,
  showProject,
  onOpen,
  onEdit,
  table,
  sortOrderFor,
}: {
  data: RiskDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (id: string) => void;
  onEdit: (row: RiskDto) => void;
  table: Pick<TableProps<RiskDto>, 'pagination' | 'onChange'>;
  sortOrderFor: (key: RiskSortField) => 'ascend' | 'descend' | null;
}) {
  const { user } = useAuth();
  const sort = (key: RiskSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<RiskDto>['columns'] = [
    { title: 'No.', dataIndex: 'riskNo', width: 135, className: 'mono', ...sort('riskNo') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: RiskDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    { title: 'Type', dataIndex: 'kind', width: 80, ...sort('kind'), render: (k) => <KindTag kind={k} /> },
    {
      title: 'Delay / risk',
      dataIndex: 'title',
      render: (v, r) => (
        <div>
          <Typography.Link onClick={() => onOpen(r.id)}>{v}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[RISK_CATEGORY_LABELS[r.category], r.activityName].filter(Boolean).join(' · ')}
          </div>
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
              <Tag color="red" style={{ marginLeft: 6 }}>
                ongoing
              </Tag>
            ) : null}
            <div className="text-muted" style={{ fontSize: 11 }}>
              {[r.responsibleParty ? DELAY_PARTY_LABELS[r.responsibleParty] : null, r.eotClaimed ? 'EOT claimed' : null].filter(Boolean).join(' · ')}
            </div>
          </div>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    { title: 'Owner', dataIndex: 'ownerName', width: 150, ...sort('owner'), render: (v) => v ?? <span className="text-muted">-</span> },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      width: 120,
      ...sort('dueDate'),
      render: (v, r) => (v ? <span style={r.overdue ? { color: '#cf1322', fontWeight: 600 } : undefined}>{formatDate(v)}{r.overdue ? ' (overdue)' : ''}</span> : '-'),
    },
    { title: 'Status', dataIndex: 'status', width: 110, ...sort('status'), render: (s) => <RiskStatusTag status={s} /> },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={() => onOpen(r.id)}>
            View
          </Button>
          {user && canEditRisk(user, r) ? (
            <Button size="small" onClick={() => onEdit(r)}>
              Update
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
  return <Table<RiskDto> rowKey="id" loading={loading} columns={columns} dataSource={data} size="middle" {...table} scroll={{ x: showProject ? 1400 : 1200 }} />;
}
