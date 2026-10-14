'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Card, Descriptions, Divider, Drawer, Form, Input, Modal, Popconfirm, Progress, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { FileAddOutlined, PrinterOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkOrderDto, WorkOrderLineDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, canEditSubmission, canIssueWorkOrder, canPrepareSubcontractBill, canResubmit } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWorkOrder } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, formatQty, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { SubBillFormModal } from './SubBillFormModal';
import { openWoPrint } from './subcontractPrint';

const money = (v: string | number) => <span className="mono">{formatINR(v, true)}</span>;

/** Tag for where an approved order stands: open for work and bills, or closed. */
export function WoStateTag({ order }: { order: Pick<WorkOrderDto, 'status' | 'closedAt' | 'open'> }) {
  if (order.status !== 'APPROVED') return null;
  if (order.closedAt) return <Tag style={{ margin: 0 }}>Closed</Tag>;
  return <Tag color="blue" style={{ margin: 0 }}>Open</Tag>;
}

/** A work order: scope with what is measured and billed, its terms, approval, print, and the subcontractor's bills against it. */
export function WorkOrderDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (o: WorkOrderDto) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useWorkOrder(id ?? undefined);
  const [billing, setBilling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeForm] = Form.useForm<{ note: string }>();
  const issuer = !!user && canIssueWorkOrder(user.roleKey);
  const billingRole = !!user && canPrepareSubcontractBill(user.roleKey);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['work-orders'] });
  };
  const submit = useMutation({
    mutationFn: async () => (await api.post<WorkOrderDto>(`/work-orders/${id}/submit`)).data,
    onSuccess: (o) => done(`${o.woNo} submitted for approval`),
    onError: (e) => message.error(errorMessage(e)),
  });
  const close = useMutation({
    mutationFn: async (note: string) => (await api.post<WorkOrderDto>(`/work-orders/${id}/close`, { note })).data,
    onSuccess: (o) => {
      done(`${o.woNo} closed`);
      setClosing(false);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/work-orders/${id}`)).data,
    onSuccess: () => {
      done('Work order deleted');
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const editable = !!data && !!user && issuer && canEditSubmission(user, data) && data.status !== 'APPROVED';
  const approved = data?.status === 'APPROVED';
  const openBill = data?.bills?.find((b) => b.status !== 'APPROVED' && b.status !== 'REJECTED');
  const finalBilled = data?.bills?.some((b) => b.isFinal && b.status !== 'REJECTED');
  const advanceLeft = data ? toNumber(data.advanceAmount) - toNumber(data.advanceRecovered) : 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1000}
      title={
        data ? (
          <Space wrap>
            {data.woNo} · {data.vendorName} <StatusTag status={data.status} /> <WoStateTag order={data} />
          </Space>
        ) : (
          'Work order'
        )
      }
      extra={
        data ? (
          <Space wrap>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => !openWoPrint(data, user?.organizationName ?? '') && message.warning('Pop-up blocked. Allow pop-ups to print the order.')}>
              Print
            </Button>
            {editable && data.status === 'DRAFT' && user && canResubmit(user, data) ? (
              <Button size="small" type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
                Submit for approval
              </Button>
            ) : null}
            {editable && data.status === 'DRAFT' ? (
              <Button size="small" onClick={() => onEdit?.(data)}>
                Edit
              </Button>
            ) : (
              issuer && <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
            )}
            <ReviewActions type="work_order" id={data.id} status={data.status} amount={data.value} size="small" />
            {data.open && billingRole && !openBill && !finalBilled ? (
              <Button size="small" type="primary" icon={<FileAddOutlined />} onClick={() => setBilling(true)}>
                Prepare bill
              </Button>
            ) : null}
            {data.open && issuer ? (
              <Button
                size="small"
                onClick={() => {
                  closeForm.resetFields();
                  setClosing(true);
                }}
              >
                Close order
              </Button>
            ) : null}
            {editable ? (
              <Popconfirm title={`Delete ${data.woNo}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate()}>
                <Button size="small" danger loading={remove.isPending}>
                  Delete
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          {data.status === 'DRAFT' && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Draft: check the scope, rates and terms, then submit it for approval. Print it for the contractor to sign once it is approved." />}
          {data.closedAt && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={`Closed on ${formatDateTime(data.closedAt)}`} description={data.closeNote ?? undefined} />}
          {openBill && data.open && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              title={
                <span>
                  {openBill.label} is still open (<StatusTag status={openBill.status} />). The next bill can be prepared once it is approved or rejected.
                </span>
              }
            />
          )}
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 3 }}
            bordered
            items={[
              {
                key: 'vendor',
                label: 'Subcontractor',
                span: 2,
                children: (
                  <span>
                    {data.vendorName}
                    {data.vendorPan && <span className="text-muted"> · PAN {data.vendorPan}</span>}
                    {data.vendorGstin && <span className="text-muted"> · GSTIN {data.vendorGstin}</span>}
                    {data.vendorMsme && (
                      <Tag color={data.vendorMsme === 'MEDIUM' ? 'default' : 'orange'} style={{ marginLeft: 8 }}>
                        {MSME_CATEGORY_LABELS[data.vendorMsme]}
                      </Tag>
                    )}
                  </span>
                ),
              },
              { key: 'date', label: 'WO date', children: formatDate(data.woDate) },
              { key: 'title', label: 'Work', span: 2, children: data.title },
              { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}`}>{data.projectName}</Link> },
              { key: 'period', label: 'Period', children: `${data.startDate ? formatDate(data.startDate) : '-'} to ${data.endDate ? formatDate(data.endDate) : '-'}` },
              { key: 'gst', label: 'GST on their bills', children: `${data.gstRate}%` },
              { key: 'ret', label: 'Retention', children: `${data.retentionPct}%` },
              { key: 'tds', label: 'TDS (194C)', children: `${data.tdsPct}%` },
              {
                key: 'adv',
                label: 'Advance',
                children:
                  toNumber(data.advanceAmount) > 0 ? (
                    <span>
                      {money(data.advanceAmount)} at {data.advanceRecoveryPct}% a bill
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {formatINR(data.advanceRecovered, true)} recovered, {formatINR(Math.max(advanceLeft, 0), true)} to go
                      </div>
                    </span>
                  ) : (
                    '-'
                  ),
              },
              { key: 'pay', label: 'Payment', children: data.paymentDays !== null ? `${data.paymentDays} days from the bill` : '-' },
              ...(approved ? [{ key: 'billed', label: 'Billed', span: 3, children: <Progress percent={data.billedPct} size="small" style={{ maxWidth: 320, margin: 0 }} format={(p) => `${p}% · ${formatINR(data.billedAmount, true)}`} /> }] : []),
              ...(data.terms ? [{ key: 'terms', label: 'Terms', span: 3, children: <span style={{ whiteSpace: 'pre-wrap' }}>{data.terms}</span> }] : []),
              ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks, span: 3 }] : []),
              ...submissionMetaItems(data).filter((i) => i.key !== 'status' && i.key !== 'project'),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Scope
          </Divider>
          <Table<WorkOrderLineDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.lines}
            scroll={{ x: 900 }}
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
              { title: 'Quantity', dataIndex: 'quantity', width: 130, align: 'right', render: (v, l) => <span className="mono">{formatQty(v)} {l.unit}</span> },
              { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v) => money(v) },
              { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <strong>{money(v)}</strong> },
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
                            {formatQty(v)}
                          </Typography.Text>
                        ) : (
                          <span className="text-muted">-</span>
                        ),
                    },
                    { title: 'Billed', dataIndex: 'billedQty', width: 100, align: 'right' as const, render: (v: string) => <span className="mono">{formatQty(v)}</span> },
                  ]
                : []),
            ]}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Card size="small" style={{ width: 320 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>Order value before GST</span>
                {money(data.value)}
              </div>
            </Card>
          </div>
          {approved && (
            <>
              <Divider titlePlacement="start" plain>
                Bills ({data.bills?.length ?? 0})
              </Divider>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={data.bills ?? []}
                locale={{ emptyText: 'No bill yet' }}
                columns={[
                  { title: 'Bill', dataIndex: 'label', render: (v, b) => (billingRole ? <Link href={`/subcontract-bills?id=${b.id}`}>{v}</Link> : v) },
                  { title: 'Date', dataIndex: 'billDate', width: 120, render: (v) => formatDate(v) },
                  { title: 'Work value', dataIndex: 'grossAmount', width: 150, align: 'right', render: (v) => money(v) },
                  { title: 'Net payable', dataIndex: 'netPayable', width: 150, align: 'right', render: (v) => money(v) },
                  { title: 'Status', dataIndex: 'status', width: 130, render: (s) => <StatusTag status={s} /> },
                ]}
              />
            </>
          )}
          <Divider titlePlacement="start" plain>
            Documents ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            Audit trail
          </Divider>
          <AuditTrail type="work_order" id={data.id} />
        </>
      )}
      <Modal
        open={closing}
        title={data ? `Close ${data.woNo}` : 'Close order'}
        okText="Close order"
        onCancel={() => setClosing(false)}
        onOk={async () => close.mutate((await closeForm.validateFields()).note)}
        confirmLoading={close.isPending}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">No more measurements, material issues or bills can be made against it. Close it once the final bill is settled or the work is withdrawn.</Typography.Paragraph>
        <Form form={closeForm} layout="vertical">
          <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why the order is closed' }]}>
            <Input.TextArea rows={2} maxLength={500} placeholder="Work complete; final bill paid" />
          </Form.Item>
        </Form>
      </Modal>
      <SubBillFormModal open={billing} workOrderId={data?.id} onClose={() => setBilling(false)} />
    </Drawer>
  );
}
