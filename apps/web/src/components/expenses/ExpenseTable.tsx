'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Tag, Tooltip, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import type { ExpenseDto, ExpenseSortField } from '@erp/shared';
import { EXPENSE_CATEGORY_LABELS, PAYMENT_MODE_LABELS } from '@erp/shared';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';

export function ExpenseTable({
  data,
  loading,
  showProject,
  onOpen,
  onEdit,
  table,
  sortOrderFor,
}: {
  data: ExpenseDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (id: string) => void;
  onEdit?: (row: ExpenseDto) => void;
  table: Pick<TableProps<ExpenseDto>, 'pagination' | 'onChange'>;
  sortOrderFor: (key: ExpenseSortField) => 'ascend' | 'descend' | null;
}) {
  const sort = (key: ExpenseSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<ExpenseDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    { title: 'No.', dataIndex: 'expenseNo', width: 130, className: 'mono', ...sort('expenseNo') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: ExpenseDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      title: 'Expense',
      dataIndex: 'description',
      render: (v, r) => (
        <div>
          <Typography.Link onClick={() => onOpen(r.id)}>{v}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[r.vendor, r.billNo ? `Bill ${r.billNo}` : null].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>
      ),
    },
    { title: 'Category', dataIndex: 'category', width: 170, ...sort('category'), render: (c) => <Tag style={{ margin: 0 }}>{EXPENSE_CATEGORY_LABELS[c as ExpenseDto['category']]}</Tag> },
    {
      title: 'Amount',
      width: 140,
      align: 'right',
      ...sort('totalAmount'),
      render: (_, r) => (
        <div className="mono">
          {formatINR(r.totalAmount, true)}
          {toNumber(r.gstAmount) > 0 ? (
            <div className="text-muted" style={{ fontSize: 11 }}>
              incl. GST {formatINR(r.gstAmount, true)}
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Paid by', dataIndex: 'paymentMode', width: 110, render: (m) => PAYMENT_MODE_LABELS[m as ExpenseDto['paymentMode']].replace(/ \(.*\)$/, '') },
    {
      title: 'Bill',
      dataIndex: 'attachments',
      width: 110,
      render: (a: ExpenseDto['attachments']) =>
        a.length ? (
          <PhotoThumbs attachments={a} />
        ) : (
          <Tooltip title="No bill photo attached">
            <Tag color="warning" icon={<WarningOutlined />} style={{ margin: 0 }}>
              None
            </Tag>
          </Tooltip>
        ),
    },
    { title: 'Submitted by', dataIndex: 'submittedByName', width: 140, ...sort('submittedBy') },
    { title: 'Status', dataIndex: 'status', width: 140, render: (s) => <StatusTag status={s} />, ...sort('status') },
    {
      title: '',
      key: 'actions',
      width: 190,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" onClick={() => onOpen(r.id)}>
            View
          </Button>
          <ReviewActions type="expense" id={r.id} status={r.status} amount={r.totalAmount} size="small" compact />
          <EditResubmitButton entry={r} onEdit={onEdit} size="small" compact />
        </div>
      ),
    },
  ];
  return <Table<ExpenseDto> rowKey="id" loading={loading} columns={columns} dataSource={data} size="middle" {...table} scroll={{ x: showProject ? 1550 : 1350 }} />;
}
