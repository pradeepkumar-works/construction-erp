'use client';

import React from 'react';
import { Typography } from 'antd';
import type { ExpenseDto } from '@erp/shared';
import { EXPENSE_CATEGORY_LABELS, PAYMENT_MODE_LABELS } from '@erp/shared';
import { useExpense } from '@/lib/queries';
import { formatDate, formatINR, formatPct } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { checksSection } from '@/components/checks/ChecksSection';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { themeFontSize } from '@/lib/theme';

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (entry: ExpenseDto) => void;
}

/** A site expense, in a drawer from a list or as its own page at `/expenses/<id>`. */
export function ExpenseRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useExpense(id ?? undefined);
  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={640}
      kind="Site expense"
      list={{ href: '/expenses', label: 'Site expenses' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/expenses/${data.id}`,
          title: `${data.expenseNo} · ${data.description}`,
          tags: <StatusTag status={data.status} />,
          facts: [
            { key: 'desc', label: 'Expense', children: data.description },
            { key: 'date', label: 'Date', children: formatDate(data.date) },
            { key: 'cat', label: 'Category', children: EXPENSE_CATEGORY_LABELS[data.category] },
            { key: 'vendor', label: 'Vendor', children: data.vendor ?? '-' },
            { key: 'gstin', label: 'Vendor GSTIN', children: data.vendorGstin ? <span translate="no">{data.vendorGstin}</span> : '-' },
            { key: 'bill', label: 'Bill no.', children: data.billNo ?? '-' },
            { key: 'mode', label: 'Paid by', children: PAYMENT_MODE_LABELS[data.paymentMode] },
            { key: 'amount', label: 'Taxable value', children: <span className="mono" translate="no">{formatINR(data.amount, true)}</span> },
            { key: 'gst', label: `GST (${formatPct(data.gstRate)})`, children: <span className="mono" translate="no">{formatINR(data.gstAmount, true)}</span> },
            { key: 'total', label: 'Total', children: <strong className="mono" translate="no">{formatINR(data.totalAmount, true)}</strong> },
            { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
            ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
          ],
          lifecycle: submissionLifecycle(data),
          sections: [
            checksSection('expense', data.id, dataUpdatedAt),
            ...(data.remarks ? [{ key: 'remarks', title: 'Remarks', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</div> }] : []),
            {
              key: 'photos',
              title: 'Bill photos',
              count: data.attachments.length,
              children: (
                <>
                  <AttachmentGallery attachments={data.attachments} />
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: themeFontSize('fontSizeSM') }}>
                    Expense ID: {data.id}
                  </Typography.Text>
                </>
              ),
            },
          ],
          activity: { type: 'expense', id: data.id, submission: data },
          actions: (size) => (
            <>
              <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              <ReviewActions type="expense" id={data.id} status={data.status} amount={data.totalAmount} size={size} />
            </>
          ),
        }
      }
    />
  );
}

export function ExpenseDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <ExpenseRecord mode="drawer" {...props} />;
}
