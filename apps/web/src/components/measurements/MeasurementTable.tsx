'use client';

import React from 'react';
import Link from 'next/link';
import { theme } from 'antd';
import type { MeasurementSheetDto, MeasurementSortField } from '@erp/shared';
import { formatDate, formatINR, formatQty, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import type { ListColumn } from '@/components/list/DataTable';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** The measurement book's columns; keys of sortable ones are the API's sort fields. */
export function measurementColumns({
  showProject,
  onOpen,
  onEdit,
  sortOrderFor,
}: {
  showProject?: boolean;
  onOpen: (id: string) => void;
  onEdit?: (row: MeasurementSheetDto) => void;
  sortOrderFor: (key: MeasurementSortField) => 'ascend' | 'descend' | null;
}): ListColumn<MeasurementSheetDto>[] {
  const sort = (key: MeasurementSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { card: 'date', title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    { card: 'meta', title: 'MB no.', dataIndex: 'mbNo', width: 130, defaultFrom: 1600, className: 'mono', ...sort('mbNo') },
    ...(showProject
      ? [{ card: 'meta' as const, cardText: (r: MeasurementSheetDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 180, ellipsis: true, render: (v: string, r: MeasurementSheetDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      card: 'title',
      cardText: (r) => `${r.boqItemNo} ${r.boqDescription}`,
      title: 'BOQ item',
      locked: true,
      ...sort('boqItem'),
      render: (_, r) => (
        <div>
          <RecordLink href={`/measurements/${r.id}`} onOpen={() => onOpen(r.id)}>
            <span className="mono">{r.boqItemNo}</span> {r.boqDescription}
          </RecordLink>
          <Sub>{r.location}</Sub>
        </div>
      ),
    },
    { title: 'Lines', key: 'lines', width: 70, align: 'right', defaultHidden: true, render: (_, r) => r.lines.length },
    {
      title: 'Quantity',
      dataIndex: 'totalQty',
      width: 130,
      align: 'right',
      ...sort('totalQty'),
      render: (v, r) => (
        <span className="mono">
          {formatQty(v)} {r.unit}
        </span>
      ),
    },
    {
      card: 'amount',
      key: 'amount',
      title: 'Value',
      dataIndex: 'amount',
      width: 140,
      align: 'right',
      render: (v) => <span className="mono">{formatINR(v)}</span>,
      total: (rows) => formatINR(rows.reduce((n, r) => n + toNumber(r.amount), 0)),
    },
    { title: 'Submitted by', dataIndex: 'submittedByName', width: 140, defaultFrom: 1400, ...sort('submittedBy') },
    { title: 'Submitted on', dataIndex: 'submittedAt', width: 130, defaultHidden: true, render: (v) => formatDate(v), ...sort('submittedAt') },
    {
      card: 'status',
      title: 'Status',
      fixed: 'right' as const,
      dataIndex: 'status',
      width: 150,
      ...sort('status'),
      render: (s, r) => (
        <div>
          <StatusTag status={s} />
          {r.raBillNo !== null && <Sub>in RA bill {r.raBillNo}</Sub>}
        </div>
      ),
    },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="measurement" row={r} href={`/measurements/${r.id}`} amount={r.amount} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}
