'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Table, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { canEditSubmission, canIssueWorkOrder, canResubmit, figure, type WorkOrderAmendmentDto, type WorkOrderAmendmentLineDto } from '@erp/shared';
import { tk } from '@/ds';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useWoAmendment } from '@/lib/queries';
import { formatDate, formatDateTime, formatQty, NO_VALUE } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { StatusTag } from '@/components/common/StatusTag';
import { Money } from '@/components/common/Money';
import { ReviewActions } from '@/components/common/ReviewActions';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { projectContext } from '@/components/record/RecordParts';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { WoAmendmentForm } from './WoAmendmentForm';

/** A line before and after: "1,200 Cum at ₹310.00" to "1,400 Cum at ₹320.00", the part that changes in strong. */
function BeforeAfter({ l }: { l: WorkOrderAmendmentLineDto }) {
  if (l.isNew) return <AppTag meaning="waiting" style={{ margin: 0 }}>New item</AppTag>;
  if (!l.changed) return <Typography.Text type="secondary">No change</Typography.Text>;
  return (
    <span className="mono" translate="no">
      <Typography.Text type="secondary">
        {formatQty(l.qtyBefore)} at <Money value={l.rateBefore} paise />
      </Typography.Text>
      {' to '}
      <strong>
        {formatQty(l.quantity)} at <Money value={l.rate} paise />
      </strong>
    </span>
  );
}

/** The amendment's lines, before and after; `onlyChanged` leaves out the lines it does not touch. */
export function AmendmentLines({ amendment, onlyChanged = false }: { amendment: WorkOrderAmendmentDto; onlyChanged?: boolean }) {
  const rows = onlyChanged ? amendment.lines.filter((l) => l.changed) : amendment.lines;
  return (
    <Table<WorkOrderAmendmentLineDto>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={rows}
      scroll={{ x: 760 }}
      locale={{ emptyText: 'No line changes' }}
      columns={[
        {
          title: 'Item',
          key: 'item',
          render: (_, l) => (
            <div>
              <AppTag variant="kind" style={{ marginInlineEnd: tk.space[2] }}>{l.itemNo ?? 'Own item'}</AppTag>
              {l.description}
              <Typography.Text type="secondary"> · {l.unit}</Typography.Text>
            </div>
          ),
        },
        { title: 'Before and after', key: 'change', width: 300, render: (_, l) => <BeforeAfter l={l} /> },
        { title: 'Amount before', key: 'before', width: 140, align: 'right', render: (_, l) => (l.amountBefore === null ? <span className="text-muted">{NO_VALUE}</span> : <Money value={l.amountBefore} paise />) },
        { title: 'Amount after', key: 'after', width: 140, align: 'right', render: (_, l) => <strong><Money value={l.amount} paise /></strong> },
      ]}
    />
  );
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
}

/**
 * A work order amendment: what changes on the order and why, line by line before and after, its value after (what
 * the approval limit reads) and the change, and its approval. In a drawer, the approvals pane or at
 * `/work-order-amendments/<id>`.
 */
export function WoAmendmentRecord({ id, mode, open, onClose }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useWoAmendment(id ?? undefined);
  const [editing, setEditing] = useState(false);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const issuer = !!user && canIssueWorkOrder(user.roleKey);
  const open_ = !!data && data.status !== 'APPROVED' && data.status !== 'REJECTED';
  const editable = open_ && !!user && issuer && canEditSubmission(user, data);

  const submit = useMutation({
    mutationFn: async () => (await api.post<WorkOrderAmendmentDto>(`/work-order-amendments/${id}/submit`)).data,
    onSuccess: (a) => {
      message.success(`${a.label} sent for approval`);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/work-order-amendments/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      onClose?.();
    },
    meta: FAIL_NOTICE,
  });

  const endMoves = !!data?.endDate && data.endDate !== data.endDateBefore;

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={1000}
      kind="Work order amendment"
      list={{ href: '/work-orders', label: 'Work orders' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/work-order-amendments/${data.id}`,
          title: (
            <span>
              <span translate="no">{data.label}</span> · <span translate="no">{data.vendorName}</span>
            </span>
          ),
          context: projectContext(data),
          headline: [figure('amendedValue', data.valueAfter), figure('amendmentChange', data.change)],
          tags: <StatusTag status={data.status} />,
          notices:
            data.status === 'DRAFT' ? (
              <Typography.Paragraph type="secondary">Draft: change the quantities, rates and items, say why, then send it for approval. The order stays as it is until it is approved.</Typography.Paragraph>
            ) : data.appliedAt ? (
              <Typography.Paragraph type="secondary">In force on the order since {formatDateTime(data.appliedAt)}.</Typography.Paragraph>
            ) : null,
          facts: [
            {
              key: 'wo',
              label: 'Work order',
              span: 2,
              children: (
                <span>
                  <Link href={`/work-orders/${data.workOrderId}`} className="mono" translate="no">
                    {data.woNo}
                  </Link>{' '}
                  {data.woTitle}
                </span>
              ),
            },
            { key: 'reason', label: 'Why', span: 2, children: data.reason ? <span style={{ whiteSpace: 'pre-wrap' }}>{data.reason}</span> : <span className="text-muted">Not said yet</span> },
            { key: 'value', label: 'Order value before GST', children: <span><Money value={data.valueBefore} paise /> to <strong><Money value={data.valueAfter} paise /></strong></span> },
            { key: 'lines', label: 'Lines', children: `${data.changedLines} changed, ${data.addedLines} added` },
            { key: 'end', label: 'End date', children: endMoves ? `${data.endDateBefore ? formatDate(data.endDateBefore) : NO_VALUE} to ${formatDate(data.endDate!)}` : `${data.endDateBefore ? formatDate(data.endDateBefore) : NO_VALUE}, unchanged` },
            ...submissionMetaItems(data),
          ],
          details: [{ key: 'vendor', label: 'Subcontractor', children: <span translate="no">{data.vendorName}</span> }],
          lifecycle: submissionLifecycle(data, [{ title: 'In force', done: !!data.appliedAt, content: data.appliedAt ? formatDate(data.appliedAt.slice(0, 10)) : undefined }]),
          sections: [
            { key: 'changes', title: 'What changes', count: data.changedLines + data.addedLines, empty: data.changedLines + data.addedLines === 0, children: <AmendmentLines amendment={data} onlyChanged /> },
            { key: 'all', title: 'Every line after it', count: data.lines.length, children: <AmendmentLines amendment={data} /> },
          ],
          activity: { type: 'wo_amendment', id: data.id, submission: data },
          actions: (size) => (
            <>
              {editable && user && canResubmit(user, data) ? (
                <Button size={size} type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
                  Submit for approval
                </Button>
              ) : null}
              {editable ? (
                <Button size={size} onClick={() => setEditing(true)}>
                  {data.status === 'CHANGES_REQUESTED' ? 'Edit and resubmit' : 'Edit'}
                </Button>
              ) : null}
              <ReviewActions type="wo_amendment" id={data.id} status={data.status} amount={data.valueAfter} size={size} />
            </>
          ),
          more: editable ? [{ key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: data.label, onConfirm: () => remove.mutateAsync() }) }] : [],
        }
      }
    >
      <WoAmendmentForm open={editing} amendment={editing ? (data ?? null) : null} onClose={() => setEditing(false)} />
      {deleteDialog}
    </RecordFrame>
  );
}

export function WoAmendmentDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <WoAmendmentRecord mode="drawer" {...props} />;
}
