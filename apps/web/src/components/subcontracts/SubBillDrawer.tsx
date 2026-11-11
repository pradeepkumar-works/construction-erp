'use client';

import React from 'react';
import Link from 'next/link';
import { Alert, App, Button, Divider, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubcontractBillDto, SubcontractBillLineDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, canEditSubmission, figure, canPrepareSubcontractBill, canResubmit, canViewPaymentRequests, canViewPayables, unitLabel } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useSubcontractBill } from '@/lib/queries';
import { formatDate, formatINR, formatPct, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { overdueDays } from '@/components/purchasing/VendorBillDrawer';
import { BillPayments, PaidTag } from '@/components/payables/BillPayments';
import { TargetRequests } from '@/components/payables/TargetRequests';
import { BillDebitNotes, showsDebitNotes } from '@/components/payables/BillDebitNotes';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { checksSection, useChecksFigure } from '@/components/checks/ChecksSection';
import { projectContext } from '@/components/record/RecordParts';
import { useTargetRequests } from '@/components/payables/TargetRequests';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { openSubBillPrint } from './subcontractPrint';
import { Section } from '@/components/common/Section';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { Money } from '@/components/common/Money';


interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (b: SubcontractBillDto) => void;
}

/**
 * A subcontractor's bill: abstract of the work measured, material recovered, the deductions and the net payable. In a
 * drawer from a list or as its own page at `/subcontract-bills/<id>`.
 */
export function SubBillRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, dataUpdatedAt } = useSubcontractBill(id ?? undefined);
  const preparer = !!user && canPrepareSubcontractBill(user.roleKey);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['subcontract-bills'] });
    qc.invalidateQueries({ queryKey: ['work-orders'] });
  };
  const submit = useMutation({
    mutationFn: async () => (await api.post<SubcontractBillDto>(`/subcontract-bills/${id}/submit`)).data,
    onSuccess: (b) => done(`${b.label} submitted for approval`),
    meta: FAIL_NOTICE,
  });
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/subcontract-bills/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcontract-bills'] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      onClose?.();
    },
    meta: FAIL_NOTICE,
  });

  const editable = !!data && !!user && preparer && canEditSubmission(user, data) && data.status !== 'APPROVED';
  const late = data ? overdueDays(data) : null;
  const debited = data ? toNumber(data.debitNoteAmount) : 0;
  const payable = data ? Math.round((toNumber(data.netPayable) - debited) * 100) / 100 : 0;
  const excess = data?.lines.filter((l) => toNumber(l.excessQty) > 0) ?? [];

  const payments = data?.status === 'APPROVED' && !!user && canViewPayables(user.roleKey);
  const requests = data?.status === 'APPROVED' && !!user && canViewPaymentRequests(user.roleKey);
  const asked = useTargetRequests({ subcontractBillId: data?.id }, !!requests);
  const checks = useChecksFigure('subcontract-bill', id ?? undefined, dataUpdatedAt);

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={1040}
      kind="Subcontractor bill"
      list={{ href: '/subcontract-bills', label: 'Subcontractor bills' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/subcontract-bills/${data.id}`,
          title: `${data.label} · ${data.vendorName}`,
          context: projectContext(data),
          headline: [figure('netPayable', payable), data.status === 'APPROVED' && figure('stillToPay', data.outstanding), checks],
          tags: (
            <>
              <StatusTag status={data.status} /> <PaidTag bill={data} />
            </>
          ),
          print: () => {
            if (!openSubBillPrint(data, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups to print the bill.');
          },
          notices: (
            <>
              {data.status === 'DRAFT' && !data.isRelease && (
                <Alert type="info" showIcon style={{ marginBottom: tk.space[3] }} title="Draft: the quantities come from approved measurements and the recoveries from material issued to them. Saving again picks up anything approved since." />
              )}
              {excess.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: tk.space[3] }}
                  title="Billed beyond the work order"
                  description={excess.map((l) => `${l.itemNo ?? l.description}: ${formatQty(l.uptoQty)} against ${formatQty(l.woQty)} ${unitLabel(l.unit)} ordered`).join(' · ')}
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
                  {data.vendorMsme && (
                    <AppTag variant="kind" style={{ marginLeft: tk.space[2] }}>
                      {MSME_CATEGORY_LABELS[data.vendorMsme]}
                    </AppTag>
                  )}
                </span>
              ),
            },
            { key: 'work', label: 'Work', span: 2, children: data.woTitle },
            { key: 'date', label: 'Bill date', children: formatDate(data.billDate) },
            ...(data.isRelease ? [] : [{ key: 'upto', label: 'Measured up to', children: formatDate(data.measuredUpTo) }]),
            {
              key: 'due',
              label: 'Payment due',
              children: (
                <span>
                  {formatDate(data.dueDate)}
                  {late && (
                    <AppTag meaning="failed" style={{ marginLeft: tk.space[2] }}>
                      {late} days overdue
                    </AppTag>
                  )}
                </span>
              ),
            },
            ...submissionMetaItems(data),
          ],
          details: [
            { key: 'wo', label: 'Work order', children: <Link href={`/work-orders/${data.workOrderId}`}>{data.woNo}</Link> },
            { key: 'inv', label: 'Their invoice', children: data.invoiceNo ?? NO_VALUE },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
          ],
          lifecycle: submissionLifecycle(data, [
            { title: 'Paid', done: !!data.paidDate, content: data.status !== 'APPROVED' ? undefined : data.paidDate ? formatDate(data.paidDate) : `${formatINR(data.outstanding, true)} to pay` },
          ]),
          sections: [
            checksSection('subcontract-bill', data.id, dataUpdatedAt),
            {
              key: 'abstract',
              title: data.isRelease ? 'Amounts' : 'Abstract',
              count: data.isRelease ? undefined : data.lines.length,
              children: (
                <>
                  {data.isRelease ? null : <Table<SubcontractBillLineDto>
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
                      { title: 'Rate', dataIndex: 'rate', width: 150, align: 'right', render: (v, l) => <span className="mono" translate="no" style={{ whiteSpace: 'nowrap' }}>{formatINR(v, true)}/{l.unit}</span> },
                      { title: 'Previous', dataIndex: 'prevQty', width: 100, align: 'right', render: (v, l) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                      { title: 'This bill', dataIndex: 'thisQty', width: 100, align: 'right', render: (v, l) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                      {
                        title: 'Up to date',
                        dataIndex: 'uptoQty',
                        width: 110,
                        align: 'right',
                        render: (v, l) => (
                          <Typography.Text type={toNumber(l.excessQty) > 0 ? 'danger' : undefined} className="mono">
                            {formatQty(v)} {l.unit}
                            {toNumber(l.excessQty) > 0 ? <div><AppTag meaning="failed">Beyond the order</AppTag></div> : null}
                          </Typography.Text>
                        ),
                      },
                      { title: 'Up to date (₹)', dataIndex: 'uptoAmount', width: 140, align: 'right', render: (v) => <Money value={v} paise /> },
                      { title: 'This bill (₹)', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <strong><Money value={v} paise /></strong> },
                    ]}
                  />}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: data.isRelease ? 0 : tk.space[3] }}>
                    <Section style={{ width: 380 }}>
                      {(data.isRelease
                        ? []
                        : [
                            ['Work in this bill', data.grossAmount],
                            [`GST ${formatPct(data.gstRate)}`, data.gstAmount],
                          ]
                      ).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: `${tk.space.half} 0` }}>
                          <span>{k}</span>
                          <Money value={v} paise />
                        </div>
                      ))}
                      {data.deductions
                        .filter((d) => toNumber(d.amount) > 0)
                        .map((d, i) => (
                          <div key={`${d.key}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: tk.space[3], padding: `${tk.space.half} 0` }}>
                            <span>
                              Less {d.key === 'backCharge' ? `back-charge, ${d.label}` : d.label}
                              {d.pct ? ` @ ${formatPct(d.pct)}` : ''}
                            </span>
                            <span className="mono" translate="no">({formatINR(d.amount, true)})</span>
                          </div>
                        ))}
                      {toNumber(data.retentionReleased) > 0 ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: `${tk.space.half} 0` }}>
                          <span>Add retention paid back</span>
                          <Money value={data.retentionReleased} paise />
                        </div>
                      ) : null}
                      <Divider style={{ margin: `${tk.space[2]} 0` }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: tk.type.title.fontWeight }}>
                        <span>Bill net</span>
                        <Money value={data.netPayable} paise />
                      </div>
                      {debited > 0 ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: `${tk.space.half} 0` }}>
                            <span>Less debit notes</span>
                            <span className="mono" translate="no">({formatINR(debited, true)})</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: tk.type.title.fontWeight }}>
                            <span>Payable</span>
                            <Money value={payable} paise />
                          </div>
                        </>
                      ) : null}
                    </Section>
                  </div>
                </>
              ),
            },
            ...(data.materials.length > 0
              ? [
                  {
                    key: 'materials',
                    title: `Material issued to them (${data.issueCount} issue${data.issueCount === 1 ? '' : 's'})`,
                    children: (
                        <Table
                          rowKey="itemId"
                          size="small"
                          pagination={false}
                          dataSource={data.materials}
                          columns={[
                            { title: 'Item', dataIndex: 'itemName' },
                            { title: 'Quantity', dataIndex: 'quantity', width: 130, align: 'right', render: (v, m) => <span className="mono" translate="no">{formatQty(v)} {m.unit}</span> },
                            { title: 'Rate', dataIndex: 'rate', width: 120, align: 'right', render: (v) => <Money value={v} paise /> },
                            { title: 'Recovered', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <strong><Money value={v} paise /></strong> },
                          ]}
                        />
                    ),
                  },
                ]
              : []),
            ...(payments
              ? [
                  {
                    key: 'payments',
                    title: 'Payments',
                    children: (
                      <BillPayments
                        approved
                        heading={false}
                        target={{
                          billType: 'SUBCONTRACT_BILL',
                          billId: data.id,
                          billLabel: data.label,
                          vendorName: data.vendorName,
                          billDate: data.billDate,
                          dueDate: data.dueDate,
                          payable: String(payable),
                          outstanding: data.outstanding,
                          paidAmount: data.paidAmount,
                        }}
                      />
                    ),
                  },
                ]
              : []),
            ...(requests ? [{ key: 'requests', title: 'Payment requests', empty: asked.loaded && asked.rows.length === 0, children: <TargetRequests approved target={{ kind: 'BILL', subcontractBillId: data.id, label: data.label, vendorName: data.vendorName }} base={data.outstanding} /> }] : []),
            ...(showsDebitNotes(user?.roleKey, data.status)
              ? [
                  {
                    key: 'debit-notes',
                    title: 'Debit notes',
                    empty: debited === 0,
                    children: <BillDebitNotes bill={{ billType: 'SUBCONTRACT_BILL', billId: data.id, label: data.label, vendorName: data.vendorName, billDate: data.billDate, outstanding: data.outstanding }} />,
                  },
                ]
              : []),
            ...(data.isRelease
              ? []
              : [
            {
              key: 'measurements',
              title: 'Measurements',
              count: data.measurementCount,
              empty: data.measurementCount === 0,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={data.measurements ?? []}
                  locale={{ emptyText: 'No measurement in this bill' }}
                  columns={[
                    { title: 'MB', dataIndex: 'mbNo', width: 160, className: 'mono' },
                    { title: 'Date', dataIndex: 'date', width: 120, render: (v) => formatDate(v) },
                    { title: 'Item', dataIndex: 'boqItemNo', width: 90 },
                    { title: 'Location', dataIndex: 'location' },
                    { title: 'Quantity', dataIndex: 'totalQty', width: 130, align: 'right', render: (v, m) => <span className="mono" translate="no">{formatQty(v)} {m.unit}</span> },
                  ]}
                />
              ),
            },
                ]),
            ...((data.issues?.length ?? 0) > 0
              ? [
                  {
                    key: 'issues',
                    title: 'Issues recovered',
                    children: (
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={data.issues ?? []}
                          columns={[
                            { title: 'Issue', dataIndex: 'entryNo', width: 180, className: 'mono' },
                            { title: 'Date', dataIndex: 'date', width: 120, render: (v) => formatDate(v) },
                            { title: 'Lines', dataIndex: 'lines' },
                          ]}
                        />
                    ),
                  },
                ]
              : []),
            { key: 'documents', title: 'Documents', count: data.attachments.length, empty: data.attachments.length === 0, children: <AttachmentGallery attachments={data.attachments} emptyText="No documents" /> },
          ],
          activity: { type: 'subcontract_bill', id: data.id, submission: data },
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
                preparer && <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              )}
              <ReviewActions type="subcontract_bill" id={data.id} status={data.status} amount={data.grossAmount} size={size} />
            </>
          ),
          // Delete is a tap from Approve no longer.
          more: editable ? [{ key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: data.label, onConfirm: () => remove.mutateAsync() }) }] : [],
        }
      }
    >
      {deleteDialog}
    </RecordFrame>
  );
}

export function SubBillDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <SubBillRecord mode="drawer" {...props} />;
}
