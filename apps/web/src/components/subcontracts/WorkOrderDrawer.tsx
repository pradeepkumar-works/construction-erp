'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Form, Input, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import { FileAddOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkOrderAmendmentDto, WorkOrderDto, WorkOrderLineDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, canEditSubmission, canIssueWorkOrder, canPrepareSubcontractBill, canResubmit, canViewPaymentRequests, figure } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useWoAmendments, useWorkOrder } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, formatPct, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { FormShell } from '@/components/form/FormShell';
import { SubBillFormModal } from './SubBillFormModal';
import { openWoPrint } from './subcontractPrint';
import { Section } from '@/components/common/Section';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { TargetRequests, useTargetRequests } from '@/components/payables/TargetRequests';
import { projectContext } from '@/components/record/RecordParts';
import { Money } from '@/components/common/Money';
import { WoAmendmentForm } from './WoAmendmentForm';
import { WoAmendments } from './WoAmendments';


/** Tag for where an approved order stands: open for work and bills, or closed. */
export function WoStateTag({ order }: { order: Pick<WorkOrderDto, 'status' | 'closedAt' | 'open'> }) {
  if (order.status !== 'APPROVED') return null;
  if (order.closedAt) return <AppTag variant="kind" style={{ margin: 0 }}>Closed</AppTag>;
  return <AppTag meaning="waiting" style={{ margin: 0 }}>Open</AppTag>;
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (o: WorkOrderDto) => void;
}

/**
 * A work order: scope with what is measured and billed, its terms, approval, print, and the subcontractor's bills
 * against it. In a drawer from a list or as its own page at `/work-orders/<id>`.
 */
export function WorkOrderRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useWorkOrder(id ?? undefined);
  const [billing, setBilling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeForm] = Form.useForm<{ note: string }>();
  const [amending, setAmending] = useState<WorkOrderAmendmentDto | null>(null);
  const issuer = !!user && canIssueWorkOrder(user.roleKey);
  const billingRole = !!user && canPrepareSubcontractBill(user.roleKey);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['work-orders'] });
  };
  const submit = useMutation({
    mutationFn: async () => (await api.post<WorkOrderDto>(`/work-orders/${id}/submit`)).data,
    onSuccess: (o) => done(`${o.woNo} submitted for approval`),
    meta: FAIL_NOTICE,
  });
  const close = useMutation({
    mutationFn: async (note: string) => (await api.post<WorkOrderDto>(`/work-orders/${id}/close`, { note })).data,
    onSuccess: (o) => done(`${o.woNo} closed`),
    meta: FAIL_NOTICE,
  });
  const amend = useMutation({
    mutationFn: async () => (await api.post<WorkOrderAmendmentDto>(`/work-orders/${id}/amendments`, {})).data,
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      setAmending(a);
    },
    meta: FAIL_NOTICE,
  });
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/work-orders/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      onClose?.();
    },
    meta: FAIL_NOTICE,
  });

  const editable = !!data && !!user && issuer && canEditSubmission(user, data) && data.status !== 'APPROVED';
  const approved = data?.status === 'APPROVED';
  const openBill = data?.bills?.find((b) => b.status !== 'APPROVED' && b.status !== 'REJECTED');
  const finalBilled = data?.bills?.some((b) => b.isFinal && b.status !== 'REJECTED');
  // Once an advance is paid through a payment request, bills recover what was paid, not what the order says.
  const advancePaid = data ? toNumber(data.advancePaid) : 0;
  const advanceLeft = data ? (advancePaid > 0 ? advancePaid : toNumber(data.advanceAmount)) - toNumber(data.advanceRecovered) : 0;
  const requests = approved && !data?.closedAt && !!user && canViewPaymentRequests(user.roleKey);
  const asked = useTargetRequests({ workOrderId: data?.id }, requests);
  const amendments = useWoAmendments(data?.id, !!data && data.amendments.length > 0);
  const finalApproved = !!data?.bills?.some((b) => b.isFinal && b.status === 'APPROVED');
  const mayAmend = !!data?.open && issuer && !data.openAmendment && !finalApproved;
  const openAmendment = amendments.data?.find((a) => a.id === data?.openAmendment?.id) ?? null;
  const mayContinue = !!openAmendment && !!user && issuer && canEditSubmission(user, openAmendment) && canResubmit(user, openAmendment);

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={1000}
      kind="Work order"
      list={{ href: '/work-orders', label: 'Work orders' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/work-orders/${data.id}`,
          title: `${data.woNo} · ${data.vendorName}`,
          context: projectContext(data),
          headline: [figure('workOrderValue', data.value), approved && figure('workOrderBilled', data.billedPct)],
          tags: (
            <>
              <StatusTag status={data.status} /> <WoStateTag order={data} />
            </>
          ),
          print: () => {
            if (!openWoPrint(data, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups to print the order.');
          },
          notices: (
            <>
              {data.status === 'DRAFT' && <Alert type="info" showIcon style={{ marginBottom: tk.space[3] }} title="Draft: check the scope, rates and terms, then submit it for approval. Print it for the contractor to sign once it is approved." />}
              {data.openAmendment && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: tk.space[3] }}
                  title={
                    <span>
                      <Link href={`/work-order-amendments/${data.openAmendment.id}`}>{data.openAmendment.label}</Link> (<StatusTag status={data.openAmendment.status} />) takes the order to <Money value={data.openAmendment.valueAfter} paise />. The order stands as it is until it is approved.
                    </span>
                  }
                />
              )}
              {data.closedAt && <Alert type="warning" showIcon style={{ marginBottom: tk.space[3] }} title={`Closed on ${formatDateTime(data.closedAt)}`} description={data.closeNote ?? undefined} />}
              {openBill && data.open && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: tk.space[3] }}
                  title={
                    <span>
                      {openBill.label} is still open (<StatusTag status={openBill.status} />). The next bill can be prepared once it is approved or rejected.
                    </span>
                  }
                />
              )}
            </>
          ),
          facts: [
            {
              key: 'vendor',
              label: 'Subcontractor',
              span: 2,
              children: (
                <span>
                  {data.vendorName}
                  {data.vendorPan && <span className="text-muted"> · PAN {data.vendorPan}</span>}
                  {data.vendorGstin && <span className="text-muted"> · GSTIN <span translate="no">{data.vendorGstin}</span></span>}
                  {data.vendorMsme && (
                    <AppTag variant="kind" style={{ marginLeft: tk.space[2] }}>
                      {MSME_CATEGORY_LABELS[data.vendorMsme]}
                    </AppTag>
                  )}
                </span>
              ),
            },
            { key: 'date', label: 'WO date', children: formatDate(data.woDate) },
            { key: 'title', label: 'Work', span: 2, children: data.title },
            ...(data.amendmentNo > 0
              ? [{ key: 'amended', label: 'Amended', children: `Amendment ${data.amendmentNo} in force${data.amendments.find((a) => a.amendmentNo === data.amendmentNo)?.reviewedAt ? ` since ${formatDate(data.amendments.find((a) => a.amendmentNo === data.amendmentNo)!.reviewedAt!.slice(0, 10))}` : ''}` }]
              : []),
            { key: 'period', label: 'Period', children: `${data.startDate ? formatDate(data.startDate) : NO_VALUE} to ${data.endDate ? formatDate(data.endDate) : NO_VALUE}` },
            {
              key: 'adv',
              label: 'Advance',
              children:
                toNumber(data.advanceAmount) > 0 || advancePaid > 0 ? (
                  <span>
                    <Money value={data.advanceAmount} paise /> at {formatPct(data.advanceRecoveryPct)} a bill
                    <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                      {advancePaid > 0 ? `${formatINR(advancePaid, true)} paid, ` : ''}
                      {formatINR(data.advanceRecovered, true)} recovered, {formatINR(Math.max(advanceLeft, 0), true)} to go
                    </div>
                  </span>
                ) : (
                  NO_VALUE
                ),
            },
            ...(approved ? [{ key: 'billed', label: 'Billed', children: <Money value={data.billedAmount} paise /> }] : []),
            ...(data.supplierAcceptedAt
              ? [{ key: 'accepted', label: 'Subcontractor accepted', children: `${formatDateTime(data.supplierAcceptedAt)}${data.supplierAcceptedBy ? ` by ${data.supplierAcceptedBy}` : ''}${data.supplierNote ? `: ${data.supplierNote}` : ''}` }]
              : []),
            ...submissionMetaItems(data),
          ],
          details: [
            { key: 'gst', label: 'GST on their bills', children: formatPct(data.gstRate) },
            { key: 'ret', label: 'Retention', children: formatPct(data.retentionPct) },
            { key: 'tds', label: 'TDS (194C)', children: formatPct(data.tdsPct) },
            { key: 'pay', label: 'Payment', children: data.paymentDays !== null ? `${data.paymentDays} days from the bill` : NO_VALUE },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
          ],
          lifecycle: submissionLifecycle(data, [
            data.closedAt
              ? { title: 'Closed', done: true, content: `${formatPct(data.billedPct)} billed` }
              : { title: 'Billed', done: !!finalBilled && !data.open, content: approved ? `${formatPct(data.billedPct)} billed` : undefined },
          ]),
          sections: [
            {
              key: 'scope',
              title: 'Scope',
              count: data.lines.length,
              children: (
                <>
                  <Table<WorkOrderLineDto>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={data.lines}
                    scroll={{ x: 760 }}
                    columns={[
                      {
                        title: 'Item',
                        render: (_, l) => (
                          <div>
                            {l.itemNo ? <AppTag variant="kind" style={{ marginInlineEnd: tk.space[2] }}>{l.itemNo}</AppTag> : <AppTag variant="kind" style={{ marginInlineEnd: tk.space[2] }}>Own item</AppTag>}
                            {l.description}
                          </div>
                        ),
                      },
                      { title: 'Quantity', dataIndex: 'quantity', width: 130, align: 'right', render: (v, l) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                      { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v) => <Money value={v} paise /> },
                      ...(approved
                        ? [
                            {
                              title: 'Measured',
                              dataIndex: 'measuredQty',
                              width: 110,
                              align: 'right' as const,
                              render: (v: string, l: WorkOrderLineDto) =>
                                l.boqItemId ? (
                                  <Typography.Text type={toNumber(v) > toNumber(l.quantity) ? 'danger' : undefined} className="mono">
                                    {formatQty(v)} {l.unit}
                                    {toNumber(v) > toNumber(l.quantity) ? <div><AppTag meaning="failed">Beyond the order</AppTag></div> : null}
                                  </Typography.Text>
                                ) : (
                                  <span className="text-muted">{NO_VALUE}</span>
                                ),
                            },
                            { title: 'Billed', dataIndex: 'billedQty', width: 110, align: 'right' as const, render: (v: string, l: WorkOrderLineDto) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                          ]
                        : []),
                      { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <strong><Money value={v} paise /></strong> },
                    ]}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: tk.space[3] }}>
                    <Section style={{ width: 320 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: tk.type.title.fontWeight }}>
                        <span>Order value before GST</span>
                        <Money value={data.value} paise />
                      </div>
                    </Section>
                  </div>
                </>
              ),
            },
            ...(data.amendments.length
              ? [
                  {
                    key: 'amendments',
                    title: 'Amendments',
                    count: data.amendments.length,
                    children: amendments.data ? <WoAmendments order={data} amendments={amendments.data} /> : <Typography.Text type="secondary">Loading the amendments…</Typography.Text>,
                  },
                ]
              : []),
            ...(data.terms ? [{ key: 'terms', title: 'Terms', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.terms}</div> }] : []),
            ...(approved
              ? [
                  {
                    key: 'bills',
                    title: 'Bills',
                    count: data.bills?.length ?? 0,
                    empty: !data.bills?.length,
                    children: (
                      <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={data.bills ?? []}
                        locale={{ emptyText: 'No bill yet' }}
                        columns={[
                          { title: 'Bill', dataIndex: 'label', render: (v, b) => (billingRole ? <Link href={`/subcontract-bills/${b.id}`}>{v}</Link> : v) },
                          { title: 'Date', dataIndex: 'billDate', width: 120, render: (v) => formatDate(v) },
                          { title: 'Status', dataIndex: 'status', width: 130, render: (s) => <StatusTag status={s} /> },
                          { title: 'Work done', dataIndex: 'grossAmount', width: 150, align: 'right', render: (v) => <Money value={v} paise /> },
                          { title: 'Net payable', dataIndex: 'netPayable', width: 150, align: 'right', render: (v) => <Money value={v} paise /> },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
            ...(requests
              ? [{ key: 'advances', title: 'Advance requests', empty: asked.loaded && asked.rows.length === 0, children: <TargetRequests approved target={{ kind: 'WO_ADVANCE', workOrderId: data.id, label: data.woNo, vendorName: data.vendorName }} base={String(toNumber(data.value) - toNumber(data.advanceRequested))} /> }]
              : []),
            { key: 'documents', title: 'Documents', count: data.attachments.length, empty: data.attachments.length === 0, children: <AttachmentGallery attachments={data.attachments} emptyText="No documents" /> },
          ],
          activity: { type: 'work_order', id: data.id, submission: data },
          actions: (size) => (
            <>
              {editable && data.status === 'DRAFT' && user && canResubmit(user, data) ? (
                <Button size={size} type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
                  Submit for approval
                </Button>
              ) : null}
              {editable && data.status === 'DRAFT' ? (
                <Button size={size} onClick={() => onEdit?.(data)}>
                  Edit
                </Button>
              ) : (
                issuer && <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              )}
              <ReviewActions type="work_order" id={data.id} status={data.status} amount={data.value} size={size} />
              {data.open && billingRole && !openBill && !finalBilled ? (
                <Button size={size} type="primary" icon={<FileAddOutlined />} onClick={() => setBilling(true)}>
                  New subcontractor bill
                </Button>
              ) : null}
              {mayAmend ? (
                <Button size={size} loading={amend.isPending} onClick={() => amend.mutate()}>
                  Amend order
                </Button>
              ) : null}
              {mayContinue ? (
                <Button size={size} onClick={() => setAmending(openAmendment)}>
                  {openAmendment.status === 'CHANGES_REQUESTED' ? 'Edit and resubmit amendment' : 'Continue amendment'}
                </Button>
              ) : null}
              {data.open && issuer ? (
                <Button
                  size={size}
                  onClick={() => {
                    closeForm.resetFields();
                    setClosing(true);
                  }}
                >
                  Close order
                </Button>
              ) : null}
            </>
          ),
          // Delete is a tap from Approve no longer.
          more: editable ? [{ key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: `work order ${data.woNo}`, onConfirm: () => remove.mutateAsync() }) }] : [],
        }
      }
    >
      <FormShell open={closing} onClose={() => setClosing(false)} form={closeForm} layout="modal" title={data ? `Close ${data.woNo}` : 'Close order'} okText="Close order" onSubmit={(v) => close.mutateAsync(v.note)}>
        <Typography.Paragraph type="secondary">No more measurements, material issues or bills can be made against it. Close it once the final bill is settled or the work is withdrawn.</Typography.Paragraph>
        <Form form={closeForm} layout="vertical">
          <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why the order is closed' }]}>
            <Input.TextArea rows={2} maxLength={500} placeholder="Work complete; final bill paid" />
          </Form.Item>
        </Form>
      </FormShell>
      <SubBillFormModal open={billing} workOrderId={data?.id} onClose={() => setBilling(false)} />
      <WoAmendmentForm open={!!amending} amendment={amending} onClose={() => setAmending(null)} />
      {deleteDialog}
    </RecordFrame>
  );
}

export function WorkOrderDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <WorkOrderRecord mode="drawer" {...props} />;
}
