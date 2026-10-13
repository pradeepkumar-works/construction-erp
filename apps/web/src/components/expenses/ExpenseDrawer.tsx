'use client';

import React from 'react';
import { Descriptions, Divider, Drawer, Skeleton, Space, Typography } from 'antd';
import type { ExpenseDto } from '@erp/shared';
import { EXPENSE_CATEGORY_LABELS, PAYMENT_MODE_LABELS } from '@erp/shared';
import { useExpense } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';

export function ExpenseDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (x: ExpenseDto) => void }) {
  const { data, isLoading, error, refetch } = useExpense(id ?? undefined);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      title={
        data ? (
          <span>
            {data.expenseNo} <StatusTag status={data.status} />
          </span>
        ) : (
          'Site expense'
        )
      }
      extra={
        data ? (
          <Space wrap>
            <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
            <ReviewActions type="expense" id={data.id} status={data.status} amount={data.totalAmount} size="small" />
          </Space>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'desc', label: 'Expense', children: data.description, span: 2 },
              { key: 'date', label: 'Date', children: formatDate(data.date) },
              { key: 'cat', label: 'Category', children: EXPENSE_CATEGORY_LABELS[data.category] },
              { key: 'vendor', label: 'Vendor', children: data.vendor ?? '-' },
              { key: 'gstin', label: 'Vendor GSTIN', children: data.vendorGstin ?? '-' },
              { key: 'bill', label: 'Bill no.', children: data.billNo ?? '-' },
              { key: 'mode', label: 'Paid by', children: PAYMENT_MODE_LABELS[data.paymentMode] },
              { key: 'amount', label: 'Taxable value', children: formatINR(data.amount, true) },
              { key: 'gst', label: `GST (${Number(data.gstRate)}%)`, children: formatINR(data.gstAmount, true) },
              { key: 'total', label: 'Total', children: <strong>{formatINR(data.totalAmount, true)}</strong>, span: 2 },
              { key: 'activity', label: 'Activity', children: data.activityName ?? '-', span: 2 },
              { key: 'remarks', label: 'Remarks', children: data.remarks ?? '-', span: 2 },
              ...submissionMetaItems(data).filter((i) => i.key !== 'status').map((i) => ({ ...i, span: 2 })),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Bill photos ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            Audit trail
          </Divider>
          <AuditTrail type="expense" id={data.id} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Expense ID: {data.id}
          </Typography.Text>
        </>
      )}
    </Drawer>
  );
}
