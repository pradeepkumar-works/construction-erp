'use client';

import React from 'react';
import Link from 'next/link';
import { Tooltip, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { WarningOutlined } from '@/components/common/icons';
import type { ExpenseDto, ExpenseSortField } from '@erp/shared';
import { EXPENSE_CATEGORY_LABELS, PAYMENT_MODE_LABELS } from '@erp/shared';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import type { ListColumn } from '@/components/list/DataTable';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';

const sumMoney = (values: string[]) => formatINR(values.reduce((n, v) => n + toNumber(v), 0), true);

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** The site expense list's columns; keys of sortable ones are the API's sort fields. */
export function expenseColumns({
  showProject,
  onOpen,
  onEdit,
  sortOrderFor,
}: {
  showProject?: boolean;
  onOpen: (id: string) => void;
  onEdit?: (row: ExpenseDto) => void;
  sortOrderFor: (key: ExpenseSortField) => 'ascend' | 'descend' | null;
}): ListColumn<ExpenseDto>[] {
  const sort = (key: ExpenseSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { card: 'date', title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    { title: 'No.', dataIndex: 'expenseNo', width: 130, className: 'mono', ...sort('expenseNo') },
    ...(showProject
      ? [{ card: 'meta' as const, cardText: (r: ExpenseDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 180, ellipsis: true, render: (v: string, r: ExpenseDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      card: 'title',
      cardText: (r) => r.description,
      key: 'description',
      title: 'Expense',
      locked: true,
      render: (_, r) => (
        <div>
          <RecordLink href={`/expenses/${r.id}`} onOpen={() => onOpen(r.id)}>{r.description}</RecordLink>
          <Sub>{[r.vendor, r.billNo ? `Bill ${r.billNo}` : null].filter(Boolean).join(' · ') || ' '}</Sub>
        </div>
      ),
    },
    { defaultFrom: 1400, card: 'meta', title: 'Category', dataIndex: 'category', width: 170, ...sort('category'), render: (c) => <AppTag style={{ margin: 0 }}>{EXPENSE_CATEGORY_LABELS[c as ExpenseDto['category']]}</AppTag> },
    {
      card: 'amount',
      cardText: (r) => formatINR(r.totalAmount, true),
      title: 'Amount',
      width: 140,
      align: 'right',
      ...sort('totalAmount'),
      render: (_, r) => (
        <div className="mono" translate="no">
          {formatINR(r.totalAmount, true)}
          {toNumber(r.gstAmount) > 0 ? <Sub>incl. GST {formatINR(r.gstAmount, true)}</Sub> : null}
        </div>
      ),
      total: (rows) => sumMoney(rows.map((r) => r.totalAmount)),
    },
    { defaultFrom: 1600, key: 'paymentMode', title: 'Paid by', dataIndex: 'paymentMode', width: 110, render: (m) => PAYMENT_MODE_LABELS[m as ExpenseDto['paymentMode']] },
    {
      defaultFrom: 1600,
      key: 'attachments',
      title: 'Bill',
      label: 'Bill photo',
      dataIndex: 'attachments',
      width: 110,
      render: (a: ExpenseDto['attachments']) =>
        a.length ? (
          <PhotoThumbs attachments={a} />
        ) : (
          <Tooltip title="No bill photo attached">
            <AppTag tone="pending" icon={<WarningOutlined />} style={{ margin: 0 }}>
              None
            </AppTag>
          </Tooltip>
        ),
    },
    { defaultFrom: 1600, title: 'Submitted by', dataIndex: 'submittedByName', width: 140, ...sort('submittedBy') },
    { title: 'Submitted on', dataIndex: 'submittedAt', width: 130, defaultHidden: true, render: (v) => formatDate(v), ...sort('submittedAt') },
    { card: 'status', title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 140, render: (s) => <StatusTag status={s} />, ...sort('status') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="expense" row={r} href={`/expenses/${r.id}`} amount={r.totalAmount} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}
