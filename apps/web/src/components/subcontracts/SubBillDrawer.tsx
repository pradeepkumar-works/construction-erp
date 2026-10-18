'use client';

import React from 'react';
import Link from 'next/link';
import { Alert, App, Button, Divider, Popconfirm, Table, Tag, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubcontractBillDto, SubcontractBillLineDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, canEditSubmission, canPrepareSubcontractBill, canResubmit, canViewPayables } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSubcontractBill } from '@/lib/queries';
import { formatDate, formatINR, formatPct, formatQty, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { overdueDays } from '@/components/purchasing/VendorBillDrawer';
import { BillPayments, PaidTag } from '@/components/payables/BillPayments';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { checksSection } from '@/components/checks/ChecksSection';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { openSubBillPrint } from './subcontractPrint';
import { Section } from '@/components/common/Section';

const money = (v: string | number) => <span className="mono">{formatINR(v, true)}</span>;

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
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/subcontract-bills/${id}`)).data,
    onSuccess: () => {
      done('Bill deleted');
      onClose?.();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const editable = !!data && !!user && preparer && canEditSubmission(user, data) && data.status !== 'APPROVED';
  const late = data ? overdueDays(data) : null;
  const excess = data?.lines.filter((l) => toNumber(l.excessQty) > 0) ?? [];

  const payments = data?.status === 'APPROVED' && !!user && canViewPayables(user.roleKey);

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={1040}
      kind="Subcontractor bill"
      list={{ href: '/subcontract-bills', label: 'Subcontractor Bills' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/subcontract-bills/${data.id}`,
          title: `${data.label} · ${data.vendorName}`,
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
              {data.status === 'DRAFT' && (
                <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Draft: the quantities come from approved measurements and the recoveries from material issued to them. Saving again picks up anything approved since." />
              )}
              {excess.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  title="Billed beyond the work order"
                  description={excess.map((l) => `${l.itemNo ?? l.description}: ${formatQty(l.uptoQty)} against ${formatQty(l.woQty)} ${l.unit} ordered`).join(' · ')}
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
                    <Tag color={data.vendorMsme === 'MEDIUM' ? 'default' : 'orange'} style={{ marginLeft: 8 }}>
                      {MSME_CATEGORY_LABELS[data.vendorMsme]}
                    </Tag>
                  )}
                </span>
              ),
            },
            { key: 'wo', label: 'Work order', children: <Link href={`/work-orders/${data.workOrderId}`}>{data.woNo}</Link> },
            { key: 'work', label: 'Work', span: 2, children: data.woTitle },
            { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}`}>{data.projectName}</Link> },
            { key: 'date', label: 'Bill date', children: formatDate(data.billDate) },
            { key: 'upto', label: 'Measured up to', children: formatDate(data.measuredUpTo) },
            { key: 'inv', label: 'Their invoice', children: data.invoiceNo ?? '-' },
            {
              key: 'due',
              label: 'Payment due',
              children: (
                <span>
                  {formatDate(data.dueDate)}
                  {late && (
                    <Tag color="red" style={{ marginLeft: 8 }}>
                      {late} days overdue
                    </Tag>
                  )}
                </span>
              ),
            },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
            { key: 'net', label: 'Net payable', children: <strong>{money(data.netPayable)}</strong> },
            ...submissionMetaItems(data).filter((i) => i.key !== 'status' && i.key !== 'project'),
          ],
          lifecycle: submissionLifecycle(data, [
            { title: 'Paid', done: !!data.paidDate, content: data.status !== 'APPROVED' ? undefined : data.paidDate ? formatDate(data.paidDate) : `${formatINR(data.outstanding, true)} to pay` },
          ]),
          sections: [
            checksSection('subcontract-bill', data.id, dataUpdatedAt),
            {
              key: 'abstract',
              title: 'Abstract',
              count: data.lines.length,
              children: (
                <>
                  <Table<SubcontractBillLineDto>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={data.lines}
                    scroll={{ x: 1000 }}
                    columns={[
                      {
                        title: 'Item',
                        render: (_, l) => (
                          <div>
                            {l.itemNo ? <Tag style={{ marginRight: 6 }}>{l.itemNo}</Tag> : <Tag color="purple" style={{ marginRight: 6 }}>Own item</Tag>}
                            {l.description}
                          </div>
                        ),
                      },
                      { title: 'Rate', dataIndex: 'rate', width: 150, align: 'right', render: (v, l) => <span className="mono" style={{ whiteSpace: 'nowrap' }}>{formatINR(v, true)}/{l.unit}</span> },
                      { title: 'Previous', dataIndex: 'prevQty', width: 100, align: 'right', render: (v) => <span className="mono">{formatQty(v)}</span> },
                      { title: 'This bill', dataIndex: 'thisQty', width: 100, align: 'right', render: (v) => <strong className="mono">{formatQty(v)}</strong> },
                      {
                        title: 'Up to date',
                        dataIndex: 'uptoQty',
                        width: 110,
                        align: 'right',
                        render: (v, l) => (
                          <Typography.Text type={toNumber(l.excessQty) > 0 ? 'danger' : undefined} className="mono">
                            {formatQty(v)}
                          </Typography.Text>
                        ),
                      },
                      { title: 'This bill (₹)', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <strong>{money(v)}</strong> },
                      { title: 'Up to date (₹)', dataIndex: 'uptoAmount', width: 140, align: 'right', render: (v) => money(v) },
                    ]}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <Section style={{ width: 380 }}>
                      {[
                        ['Work in this bill', data.grossAmount],
                        [`GST ${formatPct(data.gstRate)}`, data.gstAmount],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>{k}</span>
                          {money(v)}
                        </div>
                      ))}
                      {data.deductions
                        .filter((d) => toNumber(d.amount) > 0)
                        .map((d) => (
                          <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span>
                              Less {d.label}
                              {d.pct ? ` @ ${formatPct(d.pct)}` : ''}
                              {d.key === 'other' && data.otherDeductionNote ? <span className="text-muted"> ({data.otherDeductionNote})</span> : null}
                            </span>
                            <span className="mono">({formatINR(d.amount, true)})</span>
                          </div>
                        ))}
                      <Divider style={{ margin: '6px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>Net payable</span>
                        {money(data.netPayable)}
                      </div>
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
                            { title: 'Quantity', dataIndex: 'quantity', width: 130, align: 'right', render: (v, m) => <span className="mono">{formatQty(v)} {m.unit}</span> },
                            { title: 'Rate', dataIndex: 'rate', width: 120, align: 'right', render: (v) => money(v) },
                            { title: 'Recovered', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <strong>{money(v)}</strong> },
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
                          payable: data.netPayable,
                          outstanding: data.outstanding,
                          paidAmount: data.paidAmount,
                        }}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'measurements',
              title: 'Measurements',
              count: data.measurementCount,
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
                    { title: 'Quantity', dataIndex: 'totalQty', width: 130, align: 'right', render: (v, m) => <span className="mono">{formatQty(v)} {m.unit}</span> },
                  ]}
                />
              ),
            },
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
            { key: 'documents', title: 'Documents', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> },
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
              {editable ? (
                <Popconfirm title={`Delete ${data.label}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate()}>
                  <Button size={size} danger loading={remove.isPending}>
                    Delete
                  </Button>
                </Popconfirm>
              ) : null}
            </>
          ),
        }
      }
    />
  );
}

export function SubBillDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <SubBillRecord mode="drawer" {...props} />;
}
