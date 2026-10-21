'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, DatePicker, Flex, Form, Input, Select, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, PurchaseOrderLineDto, VendorBillDto } from '@erp/shared';
import { GST_RATES, readNumber, readText } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { uploadFile, usePurchaseOrder, usePurchaseOrders } from '@/lib/queries';
import { formatINR, formatQty, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { ReadDocumentButton, ReadPreview, ReadSource, readFieldProps, type ReadState } from '@/components/ai/ReadDocument';
import { DraftBillChecks } from './DraftBillChecks';
import { themeFontSize } from '@/lib/theme';
import { recordPage } from '@/components/approvals/queue';

interface FormValues {
  purchaseOrderId: string;
  invoiceNo: string;
  invoiceDate: dayjs.Dayjs;
  freight?: number | null;
  advanceAdjusted?: number | null;
  remarks?: string;
  docs?: AttachmentDto[];
}

interface LineValue {
  quantity: number | null;
  rate: number | null;
  gstRate: number;
}

const amountOf = (l: LineValue | undefined) => Math.round(toNumber(l?.quantity) * toNumber(l?.rate) * 100) / 100;

/**
 * Record (or correct) a vendor's invoice against an approved purchase order. Each PO line starts at what was received and
 * not yet billed, at the PO rate; anything that does not match is flagged here and recorded on the bill for the approver.
 */
export function VendorBillFormModal({
  open,
  bill,
  purchaseOrderId,
  onClose,
  onSaved,
}: {
  open: boolean;
  bill?: VendorBillDto | null;
  purchaseOrderId?: string;
  onClose: () => void;
  onSaved?: (b: VendorBillDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const notify = useNotify();
  const watchedPo = Form.useWatch('purchaseOrderId', form);
  const freight = Form.useWatch('freight', form);
  const advance = Form.useWatch('advanceAdjusted', form) as number | null | undefined;
  const invoiceNo = Form.useWatch('invoiceNo', form) as string | undefined;
  const poId = bill?.purchaseOrderId ?? purchaseOrderId ?? watchedPo;
  const orders = usePurchaseOrders({ status: 'APPROVED', pageSize: 100, sortBy: 'poDate', sortOrder: 'desc' }, open && !bill && !purchaseOrderId);
  const { data: po, isLoading: poLoading } = usePurchaseOrder(open ? poId : undefined);
  // Advance paid on the PO and not yet taken off its other bills (v5 item 90): this bill may adjust up to that.
  const advanceAvailable = bill ? toNumber(bill.poAdvanceAvailable) : po ? Math.max(toNumber(po.advancePaid) - toNumber(po.advanceAdjusted), 0) : 0;
  const [lines, setLines] = useState<Record<string, LineValue>>({});
  // A scanned invoice read to fill the form (AI item 70): what came back, the line values waiting for its PO to load,
  // and the field whose place on the page is shown.
  const [readState, setReadState] = useState<ReadState | null>(null);
  const [activeRead, setActiveRead] = useState<string | null>(null);
  const pendingLines = useRef<{ poId: string; lines: Record<string, LineValue> } | null>(null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (bill)
      form.setFieldsValue({
        purchaseOrderId: bill.purchaseOrderId,
        invoiceNo: bill.invoiceNo,
        invoiceDate: dayjs(bill.invoiceDate),
        freight: toNumber(bill.freight),
        advanceAdjusted: toNumber(bill.advanceAdjusted) || null,
        remarks: bill.remarks ?? undefined,
        docs: bill.attachments,
      });
    else form.setFieldsValue({ purchaseOrderId, invoiceDate: dayjs() });
    setLines({});
    setReadState(null);
    pendingLines.current = null;
  }, [open, bill, purchaseOrderId, form]);

  /** Billed on other bills of this PO (not rejected): the PO's figure less this bill's own lines when editing. */
  const billedElsewhere = useMemo(() => {
    const own = new Map((bill?.lines ?? []).map((l) => [l.purchaseOrderLineId, toNumber(l.quantity)]));
    return (l: PurchaseOrderLineDto) => Math.max(0, toNumber(l.billedQty) - (own.get(l.id) ?? 0));
  }, [bill]);

  // Start each line from the bill being edited, or at what is received and not yet billed, at the PO rate.
  useEffect(() => {
    if (!po || Object.keys(lines).length) return;
    if (bill) {
      setLines(Object.fromEntries(po.lines.map((l) => {
        const b = bill.lines.find((x) => x.purchaseOrderLineId === l.id);
        return [l.id, b ? { quantity: toNumber(b.quantity), rate: toNumber(b.rate), gstRate: toNumber(b.gstRate) } : { quantity: null, rate: toNumber(l.rate), gstRate: toNumber(l.gstRate) }];
      })));
      return;
    }
    const read = pendingLines.current?.poId === po.id ? pendingLines.current.lines : null;
    pendingLines.current = null;
    if (read) {
      // A rate the invoice did not show stays at the PO's.
      setLines(Object.fromEntries(po.lines.map((l) => [l.id, read[l.id] ? { ...read[l.id], rate: read[l.id].rate ?? toNumber(l.rate) } : { quantity: null, rate: toNumber(l.rate), gstRate: toNumber(l.gstRate) }])));
      return;
    }
    setLines(Object.fromEntries(po.lines.map((l) => {
      const open = toNumber(l.receivedQty) - toNumber(l.billedQty);
      return [l.id, { quantity: open > 0 ? Math.round(open * 1000) / 1000 : null, rate: toNumber(l.rate), gstRate: toNumber(l.gstRate) }];
    })));
    if (form.getFieldValue('freight') === undefined) form.setFieldValue('freight', toNumber(po.freight));
  }, [po, bill, lines, form]);

  const issues = useMemo(() => {
    const out: string[] = [];
    for (const l of po?.lines ?? []) {
      const v = lines[l.id];
      if (!v || !toNumber(v.quantity)) continue;
      const open = toNumber(l.receivedQty) - billedElsewhere(l);
      if (toNumber(v.quantity) > open + 1e-9) out.push(`${l.itemName}: ${formatQty(v.quantity)} ${l.unit} billed, ${formatQty(Math.max(0, open))} received and not yet billed`);
      if (toNumber(v.rate) > toNumber(l.rate)) out.push(`${l.itemName}: rate above the PO's ${formatINR(l.rate, true)}`);
      if (toNumber(v.gstRate) !== toNumber(l.gstRate)) out.push(`${l.itemName}: GST ${v.gstRate}% where the PO has ${l.gstRate}%`);
    }
    return out;
  }, [po, lines, billedElsewhere]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    for (const v of Object.values(lines)) {
      const a = amountOf(v);
      subtotal += a;
      gst += Math.round(a * toNumber(v.gstRate)) / 100;
    }
    return { subtotal, gst, total: subtotal + gst + toNumber(freight) };
  }, [lines, freight]);

  /** Fills the form from a read invoice: the PO it matched, invoice number, date and freight, and each matched line. */
  const applyRead = (s: ReadState) => {
    const { result } = s;
    setReadState(s);
    setActiveRead(null);
    const f = result.fields;
    const date = readText(f.invoiceDate);
    form.setFieldsValue({
      invoiceNo: readText(f.invoiceNo) ?? form.getFieldValue('invoiceNo'),
      ...(date && !dayjs(date).isAfter(dayjs(), 'day') ? { invoiceDate: dayjs(date) } : {}),
      freight: readNumber(f.freight) ?? 0,
    });
    const target = result.match?.purchaseOrder?.id;
    if (target) {
      const read: Record<string, LineValue> = {};
      result.match!.lines.forEach((m, i) => {
        if (!m) return;
        const l = result.lines[i];
        read[m.purchaseOrderLineId] = { quantity: readNumber(l.quantity), rate: readNumber(l.rate), gstRate: readNumber(l.gstRate) ?? 18 };
      });
      pendingLines.current = { poId: target, lines: read };
      if (!bill && !purchaseOrderId && target !== form.getFieldValue('purchaseOrderId')) form.setFieldValue('purchaseOrderId', target);
      setLines({});
    }
    // The scan itself goes on the bill, as if attached by hand.
    uploadFile(s.file)
      .then((att) => form.setFieldValue('docs', [...((form.getFieldValue('docs') as AttachmentDto[] | undefined) ?? []), att]))
      .catch((e) => message.warning(`The form is filled, but the scan could not be attached: ${errorMessage(e)}`));
  };

  /** Which read line went into a PO line, for its "From the invoice" link and warnings. */
  const readLineOf = (poLineId: string) => {
    const i = readState?.result.match?.lines.findIndex((m) => m?.purchaseOrderLineId === poLineId) ?? -1;
    return i >= 0 && readState?.result.match?.purchaseOrder?.id === po?.id ? i : -1;
  };
  const lowOn = (poLineId: string, key: string) => {
    const i = readLineOf(poLineId);
    return i >= 0 && readState!.result.lines[i][key]?.confidence === 'low';
  };
  const unmatched = readState ? readState.result.lines.filter((_, i) => !readState.result.match?.lines[i]) : [];
  const printedTotal = readState ? readNumber(readState.result.fields.total) : null;

  const save = useMutation({
    mutationFn: async ({ v, submit }: { v: FormValues; submit: boolean }) => {
      const billLines = Object.entries(lines)
        .filter(([, l]) => toNumber(l.quantity) > 0)
        .map(([purchaseOrderLineId, l]) => ({ purchaseOrderLineId, quantity: String(l.quantity), rate: String(l.rate ?? 0), gstRate: String(l.gstRate) }));
      if (!billLines.length) throw new Error('Enter the quantity billed on at least one line.');
      const body = {
        invoiceNo: v.invoiceNo.trim(),
        invoiceDate: v.invoiceDate.format('YYYY-MM-DD'),
        freight: String(v.freight ?? 0),
        advanceAdjusted: String(v.advanceAdjusted ?? 0),
        remarks: v.remarks?.trim() || null,
        attachmentIds: (v.docs ?? []).map((d) => d.id),
        lines: billLines,
        submit,
      };
      if (bill) return (await api.patch<VendorBillDto>(`/vendor-bills/${bill.id}`, body)).data;
      return (await api.post<VendorBillDto>('/vendor-bills', { ...body, id: crypto.randomUUID(), purchaseOrderId: v.purchaseOrderId })).data;
    },
    onSuccess: (b, { submit }) => {
      notify.saved(`${b.billNo} ${submit ? 'submitted for approval' : 'saved as a draft'}${b.matched ? '' : ', with exceptions for the approver'}`, recordPage('VENDOR_BILL', b.id));
      qc.invalidateQueries({ queryKey: ['vendor-bills'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      onSaved?.(b);
    },
    meta: FAIL_NOTICE,
  });

  const setLine = (id: string, patch: Partial<LineValue>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={1040}
      allValues
      title={bill ? `Edit ${bill.billNo}` : 'Record vendor bill'}
      okText="Save and submit"
      secondaryText="Save draft"
      okDisabled={!po}
      onSubmit={(v, secondary) => save.mutateAsync({ v, submit: !secondary })}
    >
      <Form form={form} layout="vertical">
        {!bill && !readState ? (
          <Flex justify="flex-end" style={{ marginBottom: 8 }}>
            <ReadDocumentButton kind="invoice" label="Fill from invoice" purchaseOrderId={purchaseOrderId} onRead={applyRead} />
          </Flex>
        ) : null}
        {readState ? (
          <ReadPreview state={readState} active={activeRead} onClear={() => setReadState(null)}>
            {readState.result.match?.vendor ? (
              <div style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 4 }}>
                Vendor {readState.result.match.vendor.name}
                {readState.result.match.purchaseOrder ? `, order ${readState.result.match.purchaseOrder.poNo}` : ''}. {readState.result.match.note ?? ''}
              </div>
            ) : readState.result.match?.note ? (
              <Typography.Text type="warning" style={{ fontSize: themeFontSize('fontSizeSM'), display: 'block', marginTop: 4 }}>
                {readState.result.match.note}
              </Typography.Text>
            ) : null}
            {unmatched.length ? (
              <Typography.Text type="warning" style={{ fontSize: themeFontSize('fontSizeSM'), display: 'block' }}>
                Not on the order, so not filled: {unmatched.map((l) => readText(l.description)).join('; ')}.
              </Typography.Text>
            ) : null}
          </ReadPreview>
        ) : null}
        <FormSection title="Invoice">
          <FormGrid cols={4}>
            <Form.Item name="purchaseOrderId" label="Purchase order" rules={[{ required: true, message: 'Pick the PO this invoice is for' }]}>
              {bill || purchaseOrderId ? (
                <Select disabled options={po ? [{ value: po.id, label: `${po.poNo} · ${po.vendorName}` }] : []} />
              ) : (
                <Select
                  showSearch={{ optionFilterProp: 'label' }}
                  loading={orders.isLoading}
                  placeholder="Approved purchase order"
                  onChange={() => setLines({})}
                  options={(orders.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.poNo} · ${o.vendorName} · ${o.projectName}` }))}
                />
              )}
            </Form.Item>
            <Form.Item name="invoiceNo" label="Vendor's invoice no." rules={[{ required: true, whitespace: true, message: 'Enter the invoice number' }]} {...readFieldProps(readState, 'invoiceNo', setActiveRead)}>
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item name="invoiceDate" label="Invoice date" rules={[{ required: true, message: 'Pick the invoice date' }]} {...readFieldProps(readState, 'invoiceDate', setActiveRead)}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="freight" label="Freight" extra={po && toNumber(po.freight) > 0 ? `PO freight ${formatINR(po.freight, true)}` : undefined} {...readFieldProps(readState, 'freight', setActiveRead)}>
              <MoneyInput />
            </Form.Item>
          </FormGrid>
          {advanceAvailable > 0 || toNumber(advance) > 0 ? (
            <Form.Item
              name="advanceAdjusted"
              label="Advance adjusted"
              extra={`Advance paid on ${po?.poNo ?? 'the PO'} and not yet adjusted: ${formatINR(advanceAvailable, true)}`}
              rules={[{ validator: async (_, v) => (toNumber(v ?? 0) <= advanceAvailable + 1 ? undefined : Promise.reject(new Error(`Adjust at most ${formatINR(advanceAvailable, true)}, the advance not yet taken off other bills`))) }]}
            >
              <MoneyInput style={{ maxWidth: 240 }} />
            </Form.Item>
          ) : null}
        </FormSection>
        <FormSection title="Lines">
          {po ? (
            <Table<PurchaseOrderLineDto>
              size="small"
              rowKey="id"
              pagination={false}
              loading={poLoading}
              dataSource={po.lines}
              style={{ marginBottom: 12 }}
              columns={[
                {
                  title: 'Item',
                  dataIndex: 'itemName',
                  render: (v, l) => {
                    const i = readLineOf(l.id);
                    return i < 0 ? (
                      v
                    ) : (
                      <div>
                        {v}
                        <div>
                          <ReadSource kind="invoice" page={readState!.result.lines[i].description?.page ?? null} onActive={(on) => setActiveRead(on ? `line-${i}-description` : null)} />
                        </div>
                      </div>
                    );
                  },
                },
                { title: 'Ordered', dataIndex: 'quantity', width: 100, align: 'right', render: (v, l) => `${formatQty(v)} ${l.unit}` },
                { title: 'Received', dataIndex: 'receivedQty', width: 90, align: 'right', render: (v) => formatQty(v) },
                { title: 'Billed before', key: 'billed', width: 100, align: 'right', render: (_, l) => formatQty(billedElsewhere(l)) },
                {
                  title: 'Billed now',
                  key: 'qty',
                  width: 140,
                  render: (_, l) => (
                    <QuantityInput
                      unit={l.unit}
                      value={lines[l.id]?.quantity ?? null}
                      onChange={(v) => setLine(l.id, { quantity: v })}
                      status={toNumber(lines[l.id]?.quantity) > toNumber(l.receivedQty) - billedElsewhere(l) + 1e-9 || lowOn(l.id, 'quantity') ? 'warning' : undefined}
                      aria-label={`Quantity billed of ${l.itemName}`}
                    />
                  ),
                },
                {
                  title: 'Rate',
                  key: 'rate',
                  width: 130,
                  render: (_, l) => (
                    <MoneyInput
                      value={lines[l.id]?.rate ?? null}
                      onChange={(v) => setLine(l.id, { rate: v })}
                      status={toNumber(lines[l.id]?.rate) > toNumber(l.rate) || lowOn(l.id, 'rate') ? 'warning' : undefined}
                      aria-label={`Rate of ${l.itemName}`}
                    />
                  ),
                },
                {
                  title: 'GST',
                  key: 'gst',
                  width: 90,
                  render: (_, l) => (
                    <Select
                      value={lines[l.id]?.gstRate}
                      onChange={(v) => setLine(l.id, { gstRate: v })}
                      status={lines[l.id] && toNumber(lines[l.id].gstRate) !== toNumber(l.gstRate) ? 'warning' : undefined}
                      options={[...new Set([...GST_RATES, toNumber(l.gstRate)])].map((r) => ({ value: r, label: `${r}%` }))}
                      style={{ width: '100%' }}
                    />
                  ),
                },
                { title: 'Amount', key: 'amt', width: 120, align: 'right', render: (_, l) => <span className="mono" translate="no">{formatINR(amountOf(lines[l.id]), true)}</span> },
              ]}
            />
          ) : (
            <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Pick the purchase order; its lines fill in with what was received and not yet billed, at the PO rates." />
          )}
        </FormSection>
        {po && (
          <FormGrid cols={2}>
            <div>
              {issues.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  title="Does not match the PO and what was received"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  }
                />
              )}
              <Form.Item name="remarks" label="Remarks">
                <Input.TextArea rows={2} maxLength={1000} placeholder={issues.length ? 'Why the bill differs, for the approver' : undefined} />
              </Form.Item>
              <Form.Item name="docs" label="Invoice scan">
                <PhotoUpload max={4} />
              </Form.Item>
              {readState && po ? (
                <DraftBillChecks
                  draft={{
                    purchaseOrderId: po.id,
                    invoiceNo: invoiceNo?.trim() ?? '',
                    freight: toNumber(freight),
                    invoiceTotal: printedTotal,
                    lines: Object.entries(lines)
                      .filter(([, v]) => toNumber(v.quantity) > 0)
                      .map(([purchaseOrderLineId, v]) => ({ purchaseOrderLineId, quantity: toNumber(v.quantity), rate: toNumber(v.rate), gstRate: toNumber(v.gstRate) })),
                  }}
                />
              ) : null}
            </div>
            <Alert
              type="info"
              title={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
                  <span>Items</span>
                  <span className="mono" translate="no">{formatINR(totals.subtotal, true)}</span>
                  <span>GST</span>
                  <span className="mono" translate="no">{formatINR(totals.gst, true)}</span>
                  <span>Freight</span>
                  <span className="mono" translate="no">{formatINR(toNumber(freight), true)}</span>
                  <strong>Invoice total</strong>
                  <strong className="mono" translate="no">{formatINR(totals.total, true)}</strong>
                  {toNumber(advance) > 0 ? (
                    <>
                      <span>Less advance adjusted</span>
                      <span className="mono" translate="no">{formatINR(-toNumber(advance), true)}</span>
                      <strong>Payable</strong>
                      <strong className="mono" translate="no">{formatINR(totals.total - toNumber(advance), true)}</strong>
                    </>
                  ) : null}
                  {printedTotal !== null ? (
                    <>
                      <span>Printed on the invoice</span>
                      <span className="mono" translate="no">{formatINR(printedTotal, true)}</span>
                    </>
                  ) : null}
                </div>
              }
              description={
                <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  Due {po.paymentDays ?? 30} days from the invoice{po.vendorMsme === 'MICRO' || po.vendorMsme === 'SMALL' ? ' (45 at most, MSME)' : ''}.
                </Typography.Text>
              }
            />
          </FormGrid>
        )}
      </Form>
    </FormShell>
  );
}
