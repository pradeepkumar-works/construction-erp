'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, PurchaseOrderLineDto, VendorBillDto } from '@erp/shared';
import { GST_RATES } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { usePurchaseOrder, usePurchaseOrders } from '@/lib/queries';
import { formatINR, formatQty, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';

interface FormValues {
  purchaseOrderId: string;
  invoiceNo: string;
  invoiceDate: dayjs.Dayjs;
  freight?: number | null;
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
  const watchedPo = Form.useWatch('purchaseOrderId', form);
  const freight = Form.useWatch('freight', form);
  const poId = bill?.purchaseOrderId ?? purchaseOrderId ?? watchedPo;
  const orders = usePurchaseOrders({ status: 'APPROVED', pageSize: 100, sortBy: 'poDate', sortOrder: 'desc' }, open && !bill && !purchaseOrderId);
  const { data: po, isLoading: poLoading } = usePurchaseOrder(open ? poId : undefined);
  const [lines, setLines] = useState<Record<string, LineValue>>({});

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (bill)
      form.setFieldsValue({
        purchaseOrderId: bill.purchaseOrderId,
        invoiceNo: bill.invoiceNo,
        invoiceDate: dayjs(bill.invoiceDate),
        freight: toNumber(bill.freight),
        remarks: bill.remarks ?? undefined,
        docs: bill.attachments,
      });
    else form.setFieldsValue({ purchaseOrderId, invoiceDate: dayjs() });
    setLines({});
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
        remarks: v.remarks?.trim() || null,
        attachmentIds: (v.docs ?? []).map((d) => d.id),
        lines: billLines,
        submit,
      };
      if (bill) return (await api.patch<VendorBillDto>(`/vendor-bills/${bill.id}`, body)).data;
      return (await api.post<VendorBillDto>('/vendor-bills', { ...body, id: crypto.randomUUID(), purchaseOrderId: v.purchaseOrderId })).data;
    },
    onSuccess: (b, { submit }) => {
      message.success(`${b.billNo} ${submit ? 'submitted for approval' : 'saved as a draft'}${b.matched ? '' : ', with exceptions for the approver'}`);
      qc.invalidateQueries({ queryKey: ['vendor-bills'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      onSaved?.(b);
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const run = async (submit: boolean) => {
    try {
      await form.validateFields();
      save.mutate({ v: form.getFieldsValue(true) as FormValues, submit });
    } catch {
      /* the form shows what is missing */
    }
  };
  const setLine = (id: string, patch: Partial<LineValue>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));

  return (
    <Modal
      open={open}
      title={bill ? `Edit ${bill.billNo}` : 'Record vendor bill'}
      onCancel={onClose}
      width={1040}
      destroyOnHidden
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 } }}
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => run(false)} loading={save.isPending && !save.variables?.submit} disabled={!po}>
            Save draft
          </Button>
          <Button type="primary" onClick={() => run(true)} loading={save.isPending && !!save.variables?.submit} disabled={!po}>
            Save and submit
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
          <Form.Item name="purchaseOrderId" label="Purchase order" rules={[{ required: true, message: 'Pick the PO this invoice is for' }]}>
            {bill || purchaseOrderId ? (
              <Select disabled options={po ? [{ value: po.id, label: `${po.poNo} · ${po.vendorName}` }] : []} />
            ) : (
              <Select
                showSearch
                optionFilterProp="label"
                loading={orders.isLoading}
                placeholder="Approved purchase order"
                onChange={() => setLines({})}
                options={(orders.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.poNo} · ${o.vendorName} · ${o.projectName}` }))}
              />
            )}
          </Form.Item>
          <Form.Item name="invoiceNo" label="Vendor's invoice no." rules={[{ required: true, whitespace: true, message: 'Required' }]}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="invoiceDate" label="Invoice date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="freight" label="Freight (₹)" extra={po && toNumber(po.freight) > 0 ? `PO freight ${formatINR(po.freight, true)}` : undefined}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        {po ? (
          <Table<PurchaseOrderLineDto>
            size="small"
            rowKey="id"
            pagination={false}
            loading={poLoading}
            dataSource={po.lines}
            style={{ marginBottom: 12 }}
            columns={[
              { title: 'Item', dataIndex: 'itemName' },
              { title: 'Ordered', dataIndex: 'quantity', width: 100, align: 'right', render: (v, l) => `${formatQty(v)} ${l.unit}` },
              { title: 'Received', dataIndex: 'receivedQty', width: 90, align: 'right', render: (v) => formatQty(v) },
              { title: 'Billed before', key: 'billed', width: 100, align: 'right', render: (_, l) => formatQty(billedElsewhere(l)) },
              {
                title: 'Billed now',
                key: 'qty',
                width: 120,
                render: (_, l) => (
                  <InputNumber
                    min={0}
                    precision={3}
                    value={lines[l.id]?.quantity ?? null}
                    onChange={(v) => setLine(l.id, { quantity: v })}
                    status={toNumber(lines[l.id]?.quantity) > toNumber(l.receivedQty) - billedElsewhere(l) + 1e-9 ? 'warning' : undefined}
                    style={{ width: '100%' }}
                    aria-label={`Quantity billed of ${l.itemName}`}
                  />
                ),
              },
              {
                title: 'Rate (₹)',
                key: 'rate',
                width: 130,
                render: (_, l) => (
                  <InputNumber
                    min={0}
                    precision={2}
                    value={lines[l.id]?.rate ?? null}
                    onChange={(v) => setLine(l.id, { rate: v })}
                    status={toNumber(lines[l.id]?.rate) > toNumber(l.rate) ? 'warning' : undefined}
                    style={{ width: '100%' }}
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
              { title: 'Amount', key: 'amt', width: 120, align: 'right', render: (_, l) => <span className="mono">{formatINR(amountOf(lines[l.id]), true)}</span> },
            ]}
          />
        ) : (
          <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Pick the purchase order; its lines fill in with what was received and not yet billed, at the PO rates." />
        )}
        {po && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24 }}>
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
            </div>
            <Alert
              type="info"
              title={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
                  <span>Items</span>
                  <span className="mono">{formatINR(totals.subtotal, true)}</span>
                  <span>GST</span>
                  <span className="mono">{formatINR(totals.gst, true)}</span>
                  <span>Freight</span>
                  <span className="mono">{formatINR(toNumber(freight), true)}</span>
                  <strong>Invoice total</strong>
                  <strong className="mono">{formatINR(totals.total, true)}</strong>
                </div>
              }
              description={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Due {po.paymentDays ?? 30} days from the invoice{po.vendorMsme === 'MICRO' || po.vendorMsme === 'SMALL' ? ' (45 at most, MSME)' : ''}.
                </Typography.Text>
              }
            />
          </div>
        )}
      </Form>
    </Modal>
  );
}
