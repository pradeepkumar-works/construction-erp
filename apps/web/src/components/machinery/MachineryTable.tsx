'use client';

import React from 'react';
import Link from 'next/link';
import { theme } from 'antd';
import type { MachineryLogDto, MachineryLogSortField } from '@erp/shared';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import type { ListColumn } from '@/components/list/DataTable';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';
import { HoursCell, OwnershipTag } from './hours';

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

const sum = (values: (string | null)[]) => values.reduce((n, v) => n + toNumber(v ?? 0), 0);

/** The machinery log list's columns; keys of sortable ones are the API's sort fields. */
export function machineryColumns({
  showProject,
  onOpen,
  onEdit,
  sortOrderFor,
}: {
  showProject?: boolean;
  onOpen: (id: string) => void;
  onEdit?: (row: MachineryLogDto) => void;
  sortOrderFor: (key: MachineryLogSortField) => 'ascend' | 'descend' | null;
}): ListColumn<MachineryLogDto>[] {
  const sort = (key: MachineryLogSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { card: 'date', title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    ...(showProject
      ? [{ card: 'meta' as const, cardText: (r: MachineryLogDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: MachineryLogDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      card: 'title',
      cardText: (r) => `${r.equipmentCode} ${r.equipmentName}`,
      title: 'Equipment',
      locked: true,
      ...sort('equipment'),
      render: (_, r) => (
        <div>
          <RecordLink href={`/machinery/${r.id}`} onOpen={() => onOpen(r.id)}>
            <span className="mono" translate="no">{r.equipmentCode}</span> {r.equipmentName}
          </RecordLink>
          <Sub>{[r.operatorName, r.activityName ?? r.workDone].filter(Boolean).join(' · ') || ' '}</Sub>
        </div>
      ),
    },
    { key: 'ownership', title: 'Owned or hired', dataIndex: 'ownership', width: 130, defaultFrom: 1600, render: (o) => <OwnershipTag ownership={o} /> },
    { card: 'amount', cardText: (r) => `${formatQty(r.hoursWorked)} h`, title: 'Hours', width: 150, ...sort('hoursWorked'), render: (_, r) => <HoursCell log={r} />, total: (rows) => `${formatQty(sum(rows.map((r) => r.hoursWorked)))} h` },
    {
      key: 'diesel',
      title: 'Fuel',
      dataIndex: 'dieselLitres',
      width: 100,
      align: 'right',
      className: 'mono',
      render: (v) => (v === null ? '-' : `${formatQty(v)} L`),
      total: (rows) => `${formatQty(sum(rows.map((r) => r.dieselLitres)))} L`,
    },
    { title: 'Submitted by', dataIndex: 'submittedByName', width: 140, defaultFrom: 1400, ...sort('submittedBy') },
    { title: 'Submitted on', dataIndex: 'submittedAt', width: 130, defaultHidden: true, render: (v) => formatDate(v), ...sort('submittedAt') },
    { card: 'status', title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 140, render: (s) => <StatusTag status={s} />, ...sort('status') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="machinery" row={r} href={`/machinery/${r.id}`} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}
