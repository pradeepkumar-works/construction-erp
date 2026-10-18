'use client';

import React from 'react';
import Link from 'next/link';
import { theme } from 'antd';
import type { MaterialRequestDto, MaterialRequestSortField } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { PriorityTag, StatusTag } from '@/components/common/StatusTag';
import type { ListColumn } from '@/components/list/DataTable';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';

function ItemsCell({ row }: { row: MaterialRequestDto }) {
  const { token } = theme.useToken();
  const muted = { color: token.colorTextSecondary };
  return (
    <div>
      {row.items.slice(0, 3).map((i) => (
        <div key={i.id}>
          {i.itemName} <span style={muted}>· {i.quantity} {i.unit}</span>
        </div>
      ))}
      {row.items.length > 3 && <span style={muted}>+{row.items.length - 3} more</span>}
    </div>
  );
}

/** The material request list's columns; keys of sortable ones are the API's sort fields. */
export function mrColumns({
  showProject,
  onOpen,
  onEdit,
  sortOrderFor,
}: {
  showProject?: boolean;
  onOpen: (id: string) => void;
  /** Opens the form in edit & resubmit mode; offered only for entries the user may resubmit. */
  onEdit?: (row: MaterialRequestDto) => void;
  sortOrderFor: (key: MaterialRequestSortField) => 'ascend' | 'descend' | null;
}): ListColumn<MaterialRequestDto>[] {
  const sort = (key: MaterialRequestSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { card: 'title', title: 'Request no.', dataIndex: 'requestNo', width: 150, locked: true, ...sort('requestNo'), render: (v, r) => <RecordLink href={`/material-requests/${r.id}`} onOpen={() => onOpen(r.id)}>{v}</RecordLink> },
    ...(showProject
      ? [{ card: 'meta' as const, cardText: (r: MaterialRequestDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 220, ellipsis: true, render: (v: string, r: MaterialRequestDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    { card: 'meta', cardText: (r) => r.items.map((i) => `${i.itemName} ${i.quantity} ${i.unit}`).join(', '), key: 'items', title: 'Items', render: (_, r) => <ItemsCell row={r} /> },
    { defaultFrom: 1600, title: 'Priority', dataIndex: 'priority', width: 110, render: (p) => <PriorityTag priority={p} />, ...sort('priority') },
    { card: 'date', title: 'Required by', dataIndex: 'requiredDate', width: 130, render: (v) => formatDate(v), ...sort('requiredDate') },
    { defaultFrom: 1600, title: 'Raised on', dataIndex: 'createdAt', width: 130, render: (v) => formatDate(v), ...sort('createdAt') },
    { defaultFrom: 1400, title: 'Requested by', dataIndex: 'submittedByName', width: 150, ellipsis: true, ...sort('submittedBy') },
    { card: 'status', title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 150, render: (s) => <StatusTag status={s} />, ...sort('status') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="material_request" row={r} href={`/material-requests/${r.id}`} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}
