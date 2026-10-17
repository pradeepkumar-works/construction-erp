'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Card, DatePicker, Divider, Form, Input, Popconfirm, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RaBillDto, RaBillItemDto, ReceiptDto } from '@erp/shared';
import { GST_STATES, RECEIPT_MODE_LABELS, canEditSubmission, canPrepareBill, canRecordReceipt, canResubmit } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBill } from '@/lib/queries';
import { formatDate, formatINR, formatQty, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { BillStageTag } from './billUi';
import { openBillPrint } from './billPrint';
import { ReceiptFormModal } from '@/components/receivables/ReceiptFormModal';
import { InTallyTag } from '@/components/tally/InTallyTag';
import { BillPriceVariation } from './BillPriceVariation';
import { themeColor } from '@/lib/theme';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { checksSection } from '@/components/checks/ChecksSection';
import { AskButton } from '@/components/ai/AskButton';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';

type StageAction = 'send' | 'certify';
const ACTION_TITLES: Record<StageAction, string> = { send: 'Record as sent to the client', certify: 'Record the client’s certificate' };

const money = (v: string) => <span className="mono">{formatINR(v, true)}</span>;

function Row({ label, value, strong, muted }: { label: React.ReactNode; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontWeight: strong ? 600 : undefined, color: muted ? themeColor('colorTextDescription') : undefined }}>
      <span>{label}</span>
      {money(value)}
    </div>
  );
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (b: RaBillDto) => void;
}

/** An RA bill: abstract, deductions, the measurements it bills, approval and where it is with the client; in a drawer or at `/bills/<id>`. */
export function BillRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, dataUpdatedAt } = useBill(id ?? undefined);
  const [action, setAction] = useState<StageAction | null>(null);
  const [form] = Form.useForm<{ date: dayjs.Dayjs; certificateNo?: string; qty: Record<string, number | null> }>();
  const preparer = !!user && canPrepareBill(user.roleKey);
  const accounts = !!user && canRecordReceipt(user.roleKey);
  const [paying, setPaying] = useState(false);
  const [correcting, setCorrecting] = useState<ReceiptDto | null>(null);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['bills'] });
    qc.invalidateQueries({ queryKey: ['measurements'] });
  };
  const stage = useMutation({
    mutationFn: async ({ act, body }: { act: StageAction; body: object }) => (await api.post<RaBillDto>(`/ra-bills/${id}/${act}`, body)).data,
    onSuccess: (b, { act }) => {
      done(act === 'send' ? `${b.billLabel} recorded as sent` : `${b.billLabel} certified for ${formatINR(b.netPayable, true)} net`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const submit = useMutation({
    mutationFn: async () => (await api.post<RaBillDto>(`/ra-bills/${id}/submit`)).data,
    onSuccess: (b) => done(`${b.billLabel} submitted for approval`),
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/ra-bills/${id}`)).data,
    onSuccess: () => {
      done('Bill deleted. Its measurements can be billed again.');
      onClose?.();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const openAction = (act: StageAction, b: RaBillDto) => {
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(),
      certificateNo: b.certificateNo ?? undefined,
      qty: Object.fromEntries(b.items.map((i) => [i.boqItemId, toNumber(i.certifiedQty ?? i.thisQty)])),
    });
    setAction(act);
  };
  const confirmAction = async (v: { date: dayjs.Dayjs; certificateNo?: string; qty: Record<string, number | null> }) => {
    if (!action || !data) return;
    const date = v.date.format('YYYY-MM-DD');
    if (action !== 'certify') return stage.mutateAsync({ act: action, body: { date } });
    const items = data.items
      .filter((i) => v.qty?.[i.boqItemId] !== undefined && v.qty[i.boqItemId] !== null && v.qty[i.boqItemId] !== toNumber(i.thisQty))
      .map((i) => ({ boqItemId: i.boqItemId, certifiedQty: String(v.qty[i.boqItemId]) }));
    return stage.mutateAsync({ act: 'certify', body: { date, certificateNo: v.certificateNo?.trim() || null, items } });
  };

  const editable = !!data && !!user && preparer && canEditSubmission(user, data);
  const approved = data?.status === 'APPROVED';
  const certified = !!data?.items.some((i) => i.certifiedQty !== null);
  const stageAt = data ? (['NOT_SENT', 'SENT', 'CERTIFIED', 'PAID'] as const).indexOf(data.stage) : 0;

  const dateItem = (
    <Form.Item name="date" label={action === 'send' ? 'Date sent' : 'Certificate date'} rules={[{ required: true, message: 'Pick the date' }]}>
      <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
    </Form.Item>
  );

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={1000}
      kind="RA bill"
      list={{ href: '/bills', label: 'RA Bills' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/bills/${data.id}`,
          title: data.billLabel,
          tags: (
            <>
              <StatusTag status={data.status} /> {approved && <BillStageTag stage={data.stage} />}
              {data.billNo > 1 && mode !== 'pane' ? <AskButton size="small" label="What changed" question={`What changed on ${data.billLabel} of ${data.projectName} from the last bill, and why?`} /> : null}
            </>
          ),
          print: () => {
            if (!openBillPrint(data, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups to print the bill.');
          },
          notices: (
            <>
              {data.status === 'DRAFT' && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  title="Draft: check the abstract, then submit it for approval. Measurements approved in the meantime are added when it is submitted."
                />
              )}
              {data.heldExtraItems?.length ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  title={`Left out until the client approves a variation: ${data.heldExtraItems.map((i) => `${i.itemNo} ${i.description} (${formatQty(i.qty)} ${i.unit} measured)`).join('; ')}`}
                  description={<Link href={`/projects/${data.projectId}?tab=variations`}>Open the project&apos;s variations</Link>}
                />
              ) : null}
            </>
          ),
          facts: [
            { key: 'net', label: 'Net payable', children: <strong>{money(data.netPayable)}</strong> },
            { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}?tab=bills`}>{data.projectName}</Link>, span: 2 },
            { key: 'billDate', label: 'Bill date', children: formatDate(data.billDate) },
            {
              key: 'client',
              label: 'Client',
              span: 2,
              children: data.client ? (
                <span>
                  {data.client.name}
                  {data.client.gstin && <span className="text-muted"> · GSTIN {data.client.gstin}{data.client.stateCode ? ` (${GST_STATES[data.client.stateCode] ?? data.client.stateCode})` : ''}</span>}
                </span>
              ) : (
                data.clientName ?? '-'
              ),
            },
            { key: 'upto', label: 'Measurements up to', children: formatDate(data.measuredUpTo) },
            { key: 'agreement', label: 'Agreement', children: data.agreementNo ? `${data.agreementNo}${data.agreementDate ? `, ${formatDate(data.agreementDate)}` : ''}` : '-' },
            { key: 'wo', label: 'Work order', children: data.workOrderNo ?? '-' },
            { key: 'sheets', label: 'Measurement sheets', children: data.measurementCount },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks, span: 3 }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status' && i.key !== 'project'),
          ],
          lifecycle: submissionLifecycle(data, [
            { title: 'Sent', done: stageAt >= 1, content: data.sentDate ? formatDate(data.sentDate) : undefined },
            { title: 'Certified', done: stageAt >= 2, content: data.certifiedDate ? `${formatDate(data.certifiedDate)}${data.certificateNo ? `, ${data.certificateNo}` : ''}` : undefined },
            { title: 'Paid', done: stageAt >= 3, content: data.paidDate ? formatDate(data.paidDate) : approved && stageAt >= 1 ? `${formatINR(data.outstanding, true)} outstanding` : undefined },
          ]),
          sections: [
            checksSection('ra-bill', data.id, dataUpdatedAt),
            {
              key: 'abstract',
              title: 'Abstract of cost',
              count: data.items.length,
              children: (
                <>
                  <Table<RaBillItemDto>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={data.items}
                    scroll={{ x: 1100 }}
                    columns={[
                      {
                        title: 'Item',
                        render: (_, i) => (
                          <div>
                            <span className="mono">{i.itemNo}</span> {i.description}
                            {i.extraItem ? <Tag color="orange" style={{ marginLeft: 6 }}>Extra item</Tag> : toNumber(i.excessQty) > 0 ? <Tag color="red" style={{ marginLeft: 6 }}>Excess {formatQty(i.excessQty)} {i.unit}</Tag> : null}
                          </div>
                        ),
                      },
                      { title: 'BOQ qty', dataIndex: 'boqQty', width: 100, align: 'right', render: (v, i) => <span className="mono">{formatQty(v)} {i.unit}</span> },
                      { title: 'Rate', dataIndex: 'rate', width: 100, align: 'right', render: (v) => <span className="mono">{formatINR(v, true)}</span> },
                      { title: 'Previous', dataIndex: 'prevQty', width: 90, align: 'right', render: (v) => <span className="mono">{formatQty(v)}</span> },
                      { title: 'This bill', dataIndex: 'thisQty', width: 90, align: 'right', render: (v) => <strong className="mono">{formatQty(v)}</strong> },
                      ...(certified
                        ? [{ title: 'Certified', dataIndex: 'certifiedQty', width: 90, align: 'right' as const, render: (v: string | null, i: RaBillItemDto) => <span className="mono" style={v !== null && v !== i.thisQty ? { color: themeColor('colorErrorText') } : undefined}>{formatQty(v)}</span> }]
                        : []),
                      { title: 'Up to date', dataIndex: 'uptoQty', width: 100, align: 'right', render: (v) => <span className="mono">{formatQty(v)}</span> },
                      { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong className="mono">{formatINR(v, true)}</strong> },
                    ]}
                  />
                  <BillPriceVariation bill={data} editable={editable} />
                </>
              ),
            },
            {
              key: 'amounts',
              title: 'Amount and deductions',
              children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
                  <Card size="small" title="Bill amount">
                    <Row label="Work up to the previous bill" value={data.grossPrevious} muted />
                    <Row label="Work in this bill" value={data.grossAmount} strong />
                    <Row label="Work up to date" value={data.grossUpto} muted />
                    {data.pvLines.length ? <Row label="Price variation" value={data.pvAmount} strong /> : null}
                    <Divider style={{ margin: '6px 0' }} />
                    <Row label={`GST @ ${data.gstRate}%`} value={data.gstAmount} />
                    <Row label="Less deductions" value={data.totalDeductions} />
                    <Divider style={{ margin: '6px 0' }} />
                    <Row label={<span style={{ fontSize: 15 }}>Net payable</span>} value={data.netPayable} strong />
                    {approved && data.stage !== 'NOT_SENT' && (
                      <>
                        <Divider style={{ margin: '6px 0' }} />
                        <Row label="Received in the bank" value={data.receivedAmount} />
                        <Row label="Settled (received + deducted)" value={data.settledAmount} muted />
                        <Row label="Outstanding" value={data.outstanding} strong />
                      </>
                    )}
                    {data.claimedNet !== null && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Claimed {formatINR(data.claimedGross, true)} of work, {formatINR(data.claimedNet, true)} net. The client passed {formatINR(toNumber(data.claimedNet) - toNumber(data.netPayable), true)} less; the quantities it cut come back in the next bill.
                      </Typography.Text>
                    )}
                  </Card>
                  <Card size="small" title="Deductions">
                    {data.deductions.length === 0 && <Typography.Text type="secondary">None</Typography.Text>}
                    {data.deductions.map((d) => (
                      <Row key={d.key} label={d.pct !== null ? `${d.label} @ ${d.pct}%` : d.label} value={d.amount} />
                    ))}
                    {data.deductions.length > 0 && (
                      <>
                        <Divider style={{ margin: '6px 0' }} />
                        <Row label="Total" value={data.totalDeductions} strong />
                      </>
                    )}
                  </Card>
                </div>
              ),
            },
            ...(approved && data.receipts && data.stage !== 'NOT_SENT'
              ? [
                  {
                    key: 'payments',
                    title: 'Payments received',
                    count: data.receipts.length,
                    children: (
                      <Table<ReceiptDto>
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={data.receipts}
                        locale={{ emptyText: 'No payment recorded yet' }}
                        columns={[
                          { title: 'Date', dataIndex: 'receiptDate', width: 110, render: (v) => formatDate(v) },
                          { title: 'Mode', dataIndex: 'mode', width: 80, render: (v: ReceiptDto['mode']) => RECEIPT_MODE_LABELS[v] },
                          { title: 'Reference', dataIndex: 'reference', render: (v) => (v ? <span className="mono">{v}</span> : '-') },
                          { title: 'Received', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong className="mono">{formatINR(v, true)}</strong> },
                          { title: 'Deducted', dataIndex: 'deductedAmount', width: 130, align: 'right', render: (v) => <span className="mono">{formatINR(v, true)}</span> },
                          { title: 'By', dataIndex: 'createdByName', width: 140 },
                          ...(accounts
                            ? [{ title: '', key: 'edit', width: 70, render: (_: unknown, r: ReceiptDto) => (r.exportedToTally ? <InTallyTag /> : <Button size="small" type="link" onClick={() => setCorrecting(r)}>Edit</Button>) }]
                            : []),
                        ]}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'measurements',
              title: 'Measurements billed',
              count: data.measurements?.length ?? 0,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={data.measurements ?? []}
                  columns={[
                    { title: 'MB no.', dataIndex: 'mbNo', width: 130, className: 'mono' },
                    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
                    { title: 'Item', dataIndex: 'boqItemNo', width: 80, className: 'mono' },
                    { title: 'Location', dataIndex: 'location' },
                    { title: 'Quantity', dataIndex: 'totalQty', width: 130, align: 'right', render: (v, m) => <span className="mono">{formatQty(v)} {m.unit}</span> },
                  ]}
                />
              ),
            },
            { key: 'documents', title: 'Documents', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> },
          ],
          activity: { type: 'bill', id: data.id, submission: data },
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
              <ReviewActions type="bill" id={data.id} status={data.status} amount={data.grossAmount} size={size} />
              {approved && preparer && (data.stage === 'NOT_SENT' || data.stage === 'SENT') ? (
                <Button size={size} type={data.stage === 'NOT_SENT' ? 'primary' : 'default'} onClick={() => openAction('send', data)}>
                  {data.stage === 'NOT_SENT' ? 'Mark sent' : 'Change date sent'}
                </Button>
              ) : null}
              {approved && preparer && !data.exportedToTally && (data.stage === 'SENT' || data.stage === 'CERTIFIED') ? (
                <Button size={size} type={data.stage === 'SENT' ? 'primary' : 'default'} onClick={() => openAction('certify', data)}>
                  {data.stage === 'SENT' ? 'Record certificate' : 'Correct certificate'}
                </Button>
              ) : null}
              {approved && accounts && (data.stage === 'SENT' || data.stage === 'CERTIFIED') ? (
                <Button size={size} onClick={() => setPaying(true)}>
                  Record payment
                </Button>
              ) : null}
              {editable ? (
                <Popconfirm title="Delete this bill?" description="Its measurements become billable again." onConfirm={() => remove.mutate()}>
                  <Button size={size} danger loading={remove.isPending}>
                    Delete
                  </Button>
                </Popconfirm>
              ) : null}
            </>
          ),
        }
      }
    >
      <FormShell open={!!action} onClose={() => setAction(null)} form={form} layout="modal" title={action ? ACTION_TITLES[action] : ''} okText="Save" width={action === 'certify' ? 760 : 420} onSubmit={confirmAction}>
        <Form form={form} layout="vertical">
          {action === 'certify' ? (
            <FormGrid cols={2}>
              {dateItem}
              <Form.Item name="certificateNo" label="Certificate / MB check reference">
                <Input maxLength={100} placeholder="e.g. EE/RD/2026/114" />
              </Form.Item>
            </FormGrid>
          ) : (
            dateItem
          )}
          {action === 'certify' && data && (
            <>
              <Typography.Paragraph type="secondary">Change only the quantities the client cut. The bill is re-priced on what it passed and the claim is kept for reference.</Typography.Paragraph>
              <Table<RaBillItemDto>
                rowKey="boqItemId"
                size="small"
                pagination={false}
                dataSource={data.items.filter((i) => toNumber(i.thisQty) > 0)}
                onRow={(i) => ({ 'data-line-label': `Certified quantity of ${i.itemNo}` }) as React.HTMLAttributes<HTMLElement>}
                columns={[
                  { title: 'Item', render: (_, i) => <span><span className="mono">{i.itemNo}</span> {i.description}</span> },
                  { title: 'Claimed', dataIndex: 'thisQty', width: 120, align: 'right', render: (v, i) => <span className="mono">{formatQty(v)} {i.unit}</span> },
                  {
                    title: 'Certified',
                    width: 150,
                    render: (_, i) => (
                      <Form.Item name={['qty', i.boqItemId]} noStyle rules={[{ required: true }]}>
                        <QuantityInput unit={i.unit} max={toNumber(i.thisQty)} aria-label={`Certified quantity of ${i.itemNo}`} />
                      </Form.Item>
                    ),
                  },
                ]}
              />
            </>
          )}
        </Form>
      </FormShell>
      <ReceiptFormModal open={paying || !!correcting} bill={correcting ? null : data} receipt={correcting} onClose={() => { setPaying(false); setCorrecting(null); }} />
    </RecordFrame>
  );
}

export function BillDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <BillRecord mode="drawer" {...props} />;
}
