'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Divider, Form, Input, InputNumber, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContractCurrency, RaBillDto, RaBillItemDto, RaBillStageLineDto, ReceiptDto } from '@erp/shared';
import { GST_STATES, RECEIPT_MODE_LABELS, canEditSubmission, canPrepareBill, canRecordReceipt, canResubmit, isForeign } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useBill } from '@/lib/queries';
import { formatDate, formatINR, formatMoney, formatPct, formatQty, toNumber } from '@/lib/format';
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
import { BillStages, SlippageNotes } from './BillStages';
import { ObligationRecoveryNotes } from './BillRecoveries';
import { themeColor, themeFontSize } from '@/lib/theme';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { checksSection } from '@/components/checks/ChecksSection';
import { AskButton } from '@/components/ai/AskButton';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { Section } from '@/components/common/Section';
import { OmBillSection } from '@/components/om/OmBillSection';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';

type StageAction = 'send' | 'certify';
type CertifyValues = { date: dayjs.Dayjs; certificateNo?: string; qty: Record<string, number | null>; stagePct?: Record<string, number | null> };
const ACTION_TITLES: Record<StageAction, string> = { send: 'Record as sent to the client', certify: 'Record the client’s certificate' };

const money = (v: string, c: ContractCurrency) => <span className="mono" translate="no">{formatMoney(v, c, true)}</span>;

function Row({ label, value, strong, muted, c }: { label: React.ReactNode; value: string; strong?: boolean; muted?: boolean; c: ContractCurrency }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontWeight: strong ? 600 : undefined, color: muted ? themeColor('colorTextDescription') : undefined }}>
      <span>{label}</span>
      {money(value, c)}
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
  const [form] = Form.useForm<CertifyValues>();
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
      done(act === 'send' ? `${b.billLabel} recorded as sent` : `${b.billLabel} certified for ${formatMoney(b.netPayable, b, true)} net`);
    },
    meta: FAIL_NOTICE,
  });
  const submit = useMutation({
    mutationFn: async () => (await api.post<RaBillDto>(`/ra-bills/${id}/submit`)).data,
    onSuccess: (b) => done(`${b.billLabel} submitted for approval`),
    meta: FAIL_NOTICE,
  });
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/ra-bills/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['measurements'] });
      onClose?.();
    },
    meta: FAIL_NOTICE,
  });

  const openAction = (act: StageAction, b: RaBillDto) => {
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(),
      certificateNo: b.certificateNo ?? undefined,
      qty: Object.fromEntries(b.items.map((i) => [i.boqItemId, toNumber(i.certifiedQty ?? i.thisQty)])),
      stagePct: Object.fromEntries(b.stageLines.map((l) => [l.stageId, toNumber(l.certifiedPct ?? l.thisPct)])),
    });
    setAction(act);
  };
  const confirmAction = async (v: CertifyValues) => {
    if (!action || !data) return;
    const date = v.date.format('YYYY-MM-DD');
    if (action !== 'certify') return stage.mutateAsync({ act: action, body: { date } });
    const items = data.items
      .filter((i) => v.qty?.[i.boqItemId] !== undefined && v.qty[i.boqItemId] !== null && v.qty[i.boqItemId] !== toNumber(i.thisQty))
      .map((i) => ({ boqItemId: i.boqItemId, certifiedQty: String(v.qty[i.boqItemId]) }));
    const stages = data.stageLines
      .filter((l) => v.stagePct?.[l.stageId] !== undefined && v.stagePct[l.stageId] !== null && v.stagePct[l.stageId] !== toNumber(l.thisPct))
      .map((l) => ({ stageId: l.stageId, certifiedPct: String(v.stagePct![l.stageId]) }));
    return stage.mutateAsync({ act: 'certify', body: { date, certificateNo: v.certificateNo?.trim() || null, items, stages } });
  };

  const editable = !!data && !!user && preparer && canEditSubmission(user, data);
  const approved = data?.status === 'APPROVED';
  const certified = !!data?.items.some((i) => i.certifiedQty !== null);
  const stageClaims = data?.stageLines.filter((l) => toNumber(l.thisPct) > 0) ?? [];
  const stageAt = data ? (['NOT_SENT', 'SENT', 'CERTIFIED', 'PAID'] as const).indexOf(data.stage) : 0;

  const dateItem = (
    <Form.Item name="date" label={action === 'send' ? 'Date sent' : 'Certificate date'} rules={[{ required: true, message: 'Pick the date' }]}>
      <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
    </Form.Item>
  );

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={1000}
      kind="RA bill"
      list={{ href: '/bills', label: 'RA bills' }}
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
                  title={
                    data.om
                      ? 'Draft: check the period’s staff and penalties, then submit it for approval.'
                      : 'Draft: check the abstract, then submit it for approval. Measurements approved in the meantime are added when it is submitted.'
                  }
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
            { key: 'net', label: 'Net payable', children: <strong>{money(data.netPayable, data)}</strong> },
            ...(isForeign(data) ? [{ key: 'fx', label: 'Contract rate', children: <span className="mono" translate="no">{`₹ ${data.exchangeRate} to 1 ${data.currency}; ${formatINR(data.netPayable, true)} net`}</span> }] : []),
            { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}?tab=bills`}>{data.projectName}</Link>, span: 2 },
            { key: 'billDate', label: 'Bill date', children: formatDate(data.billDate) },
            {
              key: 'client',
              label: 'Client',
              span: 2,
              children: data.client ? (
                <span>
                  {data.client.name}
                  {data.client.gstin && <span className="text-muted"> · GSTIN <span translate="no">{data.client.gstin}</span>{data.client.stateCode ? ` (${GST_STATES[data.client.stateCode] ?? data.client.stateCode})` : ''}</span>}
                </span>
              ) : (
                data.clientName ?? '-'
              ),
            },
            data.om
              ? { key: 'upto', label: 'O&M period', children: `${data.om.label}, to ${formatDate(data.om.to)}` }
              : { key: 'upto', label: 'Measurements up to', children: formatDate(data.measuredUpTo) },
            { key: 'agreement', label: 'Agreement', children: data.agreementNo ? `${data.agreementNo}${data.agreementDate ? `, ${formatDate(data.agreementDate)}` : ''}` : '-' },
            { key: 'wo', label: 'Work order', children: data.workOrderNo ?? '-' },
            ...(data.om ? [] : [{ key: 'sheets', label: 'Measurement sheets', children: data.measurementCount }]),
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks, span: 3 }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status' && i.key !== 'project'),
          ],
          lifecycle: submissionLifecycle(data, [
            { title: 'Sent', done: stageAt >= 1, content: data.sentDate ? formatDate(data.sentDate) : undefined },
            { title: 'Certified', done: stageAt >= 2, content: data.certifiedDate ? `${formatDate(data.certifiedDate)}${data.certificateNo ? `, ${data.certificateNo}` : ''}` : undefined },
            { title: 'Paid', done: stageAt >= 3, content: data.paidDate ? formatDate(data.paidDate) : approved && stageAt >= 1 ? `${formatMoney(data.outstanding, data, true)} outstanding` : undefined },
          ]),
          sections: [
            checksSection('ra-bill', data.id, dataUpdatedAt),
            ...(data.om ? [{ key: 'om', title: 'Operation and maintenance', children: <OmBillSection om={data.om} /> }] : []),
            ...(data.stageLines.length
              ? [{ key: 'stages', title: 'Payment stages', count: data.stageLines.filter((l) => toNumber(l.thisPct) > 0).length, children: <BillStages bill={data} editable={editable} /> }]
              : []),
            ...(data.slippageLines.length || toNumber(data.slippageWithheld) !== 0
              ? [{ key: 'slippage', title: 'Milestone slippage', children: <SlippageNotes lines={data.slippageLines} withheld={data.slippageWithheld} c={data} /> }]
              : []),
            ...(data.obligationLines.length
              ? [{ key: 'obligations', title: 'Contract recoveries', count: data.obligationLines.length, children: <ObligationRecoveryNotes lines={data.obligationLines} total={data.obligationRecovery} c={data} projectId={data.projectId} /> }]
              : []),
            {
              key: 'abstract',
              title: data.stageLines.length ? 'Measured items' : 'Abstract of cost',
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
                            <span className="mono" translate="no">{i.itemNo}</span> {i.description}
                            {i.extraItem ? <AppTag tone="pending" style={{ marginLeft: 6 }}>Extra item</AppTag> : toNumber(i.excessQty) > 0 ? <AppTag tone="danger" style={{ marginLeft: 6 }}>Excess {formatQty(i.excessQty)} {i.unit}</AppTag> : null}
                          </div>
                        ),
                      },
                      { title: 'BOQ qty', dataIndex: 'boqQty', width: 100, align: 'right', render: (v, i) => <span className="mono" translate="no">{formatQty(v)} {i.unit}</span> },
                      { title: 'Rate', dataIndex: 'rate', width: 100, align: 'right', render: (v) => <span className="mono" translate="no">{formatMoney(v, data, true)}</span> },
                      { title: 'Previous', dataIndex: 'prevQty', width: 90, align: 'right', render: (v) => <span className="mono" translate="no">{formatQty(v)}</span> },
                      { title: 'This bill', dataIndex: 'thisQty', width: 90, align: 'right', render: (v) => <strong className="mono" translate="no">{formatQty(v)}</strong> },
                      ...(certified
                        ? [{ title: 'Certified', dataIndex: 'certifiedQty', width: 90, align: 'right' as const, render: (v: string | null, i: RaBillItemDto) => <span className="mono" translate="no" style={v !== null && v !== i.thisQty ? { color: themeColor('colorErrorText') } : undefined}>{formatQty(v)}</span> }]
                        : []),
                      { title: 'Up to date', dataIndex: 'uptoQty', width: 100, align: 'right', render: (v) => <span className="mono" translate="no">{formatQty(v)}</span> },
                      { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong className="mono" translate="no">{formatMoney(v, data, true)}</strong> },
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
                  <Section title="Bill amount">
                    <Row c={data} label="Work up to the previous bill" value={data.grossPrevious} muted />
                    <Row c={data} label="Work in this bill" value={data.grossAmount} strong />
                    <Row c={data} label="Work up to date" value={data.grossUpto} muted />
                    {data.pvLines.length ? <Row c={data} label="Price variation" value={data.pvAmount} strong /> : null}
                    <Divider style={{ margin: '6px 0' }} />
                    <Row c={data} label={`GST @ ${formatPct(data.gstRate)}`} value={data.gstAmount} />
                    <Row c={data} label="Less deductions" value={data.totalDeductions} />
                    <Divider style={{ margin: '6px 0' }} />
                    <Row c={data} label={<span style={{ fontSize: themeFontSize('fontSizeLG') }}>Net payable</span>} value={data.netPayable} strong />
                    {approved && data.stage !== 'NOT_SENT' && (
                      <>
                        <Divider style={{ margin: '6px 0' }} />
                        <Row c={data} label="Received in the bank" value={data.receivedAmount} />
                        <Row c={data} label="Settled (received + deducted)" value={data.settledAmount} muted />
                        <Row c={data} label="Outstanding" value={data.outstanding} strong />
                      </>
                    )}
                    {data.claimedNet !== null && (
                      <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                        Claimed {formatMoney(data.claimedGross, data, true)} of work, {formatMoney(data.claimedNet, data, true)} net. The client passed {formatMoney(toNumber(data.claimedNet) - toNumber(data.netPayable), data, true)} less; the quantities it cut come back in the next bill.
                      </Typography.Text>
                    )}
                  </Section>
                  <Section title="Deductions">
                    {data.deductions.length === 0 && <Typography.Text type="secondary">None</Typography.Text>}
                    {data.deductions.map((d) => (
                      <Row c={data} key={d.key} label={d.pct !== null ? `${d.label} @ ${formatPct(d.pct)}` : d.label} value={d.amount} />
                    ))}
                    {data.deductions.length > 0 && (
                      <>
                        <Divider style={{ margin: '6px 0' }} />
                        <Row c={data} label="Total" value={data.totalDeductions} strong />
                      </>
                    )}
                  </Section>
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
                          { title: 'Reference', dataIndex: 'reference', render: (v) => (v ? <span className="mono" translate="no">{v}</span> : '-') },
                          { title: 'Received', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong className="mono" translate="no">{formatMoney(v, data, true)}</strong> },
                          { title: 'Deducted', dataIndex: 'deductedAmount', width: 130, align: 'right', render: (v) => <span className="mono" translate="no">{formatMoney(v, data, true)}</span> },
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
                    { title: 'Quantity', dataIndex: 'totalQty', width: 130, align: 'right', render: (v, m) => <span className="mono" translate="no">{formatQty(v)} {m.unit}</span> },
                  ]}
                />
              ),
            },
            { key: 'documents', title: 'Documents', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> },
          ].filter((s) => !data.om || (s.key !== 'abstract' && s.key !== 'measurements')),
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
            </>
          ),
          // Delete is a tap from Approve no longer (finding 15 of the October review).
          more: editable ? [{ key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: data.billLabel, description: 'Its measurements become billable again.', onConfirm: () => remove.mutateAsync() }) }] : [],
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
              <Typography.Paragraph type="secondary">Change only the quantities and stages the client cut. The bill is re-priced on what it passed and the claim is kept for reference.</Typography.Paragraph>
              <Table<RaBillItemDto>
                rowKey="boqItemId"
                size="small"
                pagination={false}
                dataSource={data.items.filter((i) => toNumber(i.thisQty) > 0)}
                onRow={(i) => ({ 'data-line-label': `Certified quantity of ${i.itemNo}` }) as React.HTMLAttributes<HTMLElement>}
                columns={[
                  { title: 'Item', render: (_, i) => <span><span className="mono" translate="no">{i.itemNo}</span> {i.description}</span> },
                  { title: 'Claimed', dataIndex: 'thisQty', width: 120, align: 'right', render: (v, i) => <span className="mono" translate="no">{formatQty(v)} {i.unit}</span> },
                  {
                    title: 'Certified',
                    width: 150,
                    render: (_, i) => (
                      <Form.Item name={['qty', i.boqItemId]} noStyle rules={[{ required: true, message: 'Enter the quantity passed' }]}>
                        <QuantityInput unit={i.unit} max={toNumber(i.thisQty)} aria-label={`Certified quantity of ${i.itemNo}`} />
                      </Form.Item>
                    ),
                  },
                ]}
              />
              {stageClaims.length ? (
                <Table<RaBillStageLineDto>
                  rowKey="stageId"
                  size="small"
                  pagination={false}
                  style={{ marginTop: 12 }}
                  dataSource={stageClaims}
                  columns={[
                    { title: 'Stage', render: (_, l) => <span><span className="mono" translate="no">{l.componentCode}</span> {l.stageName}</span> },
                    { title: 'Claimed', dataIndex: 'thisPct', width: 120, align: 'right', render: (v) => <span className="mono" translate="no">{formatPct(v, { digits: 2 })}</span> },
                    {
                      title: 'Passed (%)',
                      width: 150,
                      render: (_, l) => (
                        <Form.Item name={['stagePct', l.stageId]} noStyle rules={[{ required: true, message: 'Enter the % passed' }]}>
                          <InputNumber min={0} max={toNumber(l.thisPct)} style={{ width: '100%' }} aria-label={`% of ${l.componentCode} ${l.stageName} passed`} />
                        </Form.Item>
                      ),
                    },
                  ]}
                />
              ) : null}
            </>
          )}
        </Form>
      </FormShell>
      <ReceiptFormModal open={paying || !!correcting} bill={correcting ? null : data} receipt={correcting} onClose={() => { setPaying(false); setCorrecting(null); }} />
      {deleteDialog}
    </RecordFrame>
  );
}

export function BillDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <BillRecord mode="drawer" {...props} />;
}
