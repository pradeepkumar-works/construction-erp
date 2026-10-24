'use client';

import React from 'react';
import Link from 'next/link';
import { AppTag } from '@/components/common/AppTag';
import type { DailyReportDto, DprSortField } from '@erp/shared';
import { WEATHER_LABELS } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import type { ListColumn } from '@/components/list/DataTable';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';

/** The daily report list's columns; keys of sortable ones are the API's sort fields. */
export function dprColumns({
  showProject,
  onOpen,
  onEdit,
  sortOrderFor,
}: {
  showProject?: boolean;
  onOpen: (id: string) => void;
  /** Opens the form in edit & resubmit mode; offered only for entries the user may resubmit. */
  onEdit?: (row: DailyReportDto) => void;
  sortOrderFor: (key: DprSortField) => 'ascend' | 'descend' | null;
}): ListColumn<DailyReportDto>[] {
  const sort = (key: DprSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { card: 'title', title: 'Date', dataIndex: 'date', width: 120, locked: true, render: (v, r) => <RecordLink href={`/dpr/${r.id}`} onOpen={() => onOpen(r.id)}>{formatDate(v)}</RecordLink>, ...sort('date') },
    ...(showProject
      ? [{ card: 'meta' as const, cardText: (r: DailyReportDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: DailyReportDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    { defaultFrom: 1600, key: 'weather', title: 'Weather', dataIndex: 'weather', width: 100, render: (w) => (w ? <AppTag style={{ margin: 0 }}>{WEATHER_LABELS[w as keyof typeof WEATHER_LABELS] ?? w}</AppTag> : '-') },
    { card: 'meta', key: 'workExecuted', title: 'Work executed', dataIndex: 'workExecuted', width: 260, ellipsis: true },
    { card: 'amount', cardText: (r) => `Manpower ${r.totalManpower ?? 0}`, key: 'manpower', title: 'Manpower', dataIndex: 'totalManpower', width: 110, align: 'right', total: (rows) => rows.reduce((n, r) => n + (r.totalManpower ?? 0), 0) },
    { defaultFrom: 1600, key: 'machinery', title: 'Machinery', width: 100, align: 'right', render: (_, r) => r.machinery.length, total: (rows) => rows.reduce((n, r) => n + r.machinery.length, 0) },
    { defaultHidden: true, key: 'photos', title: 'Photos', dataIndex: 'attachments', width: 140, render: (a) => <PhotoThumbs attachments={a} /> },
    { defaultFrom: 1400, title: 'Submitted by', dataIndex: 'submittedByName', width: 150, ellipsis: true, ...sort('submittedBy') },
    { card: 'status', title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 150, render: (s) => <StatusTag status={s} />, ...sort('status') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="dpr" row={r} href={`/dpr/${r.id}`} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}
