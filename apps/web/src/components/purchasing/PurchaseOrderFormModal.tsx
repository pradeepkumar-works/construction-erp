'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, PurchaseOrderDto } from '@erp/shared';
import { GST_RATES, MSME_CATEGORY_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useProjects, useVendors } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';

export interface PoLineValue {
  materialRequestItemId?: string | null;
  itemName?: string;
  specification?: string | null;
  unit?: string;
  quantity?: number | null;
  rate?: number | null;
  gstRate?: number;
}

/** What a new order starts from: a request, the quotation chosen on its comparative statement, or nothing. */
export interface PoStart {
  projectId?: string;
  materialRequestId?: string;
  requestNo?: string;
  quotationId?: string;
  vendorId?: string;
  freight?: number;
  paymentTerms?: string | null;
  deliveryBy?: string | null;
  lines?: PoLineValue[];
}

interface FormValues {
  projectId: string;
  vendorId: string;
  poDate: dayjs.Dayjs;
  deliveryBy?: dayjs.Dayjs | null;
  deliveryAddress?: string;
  paymentTerms?: string;
  paymentDays?: number | null;
  freight?: number | null;
  remarks?: string;
  lines: PoLineValue[];
  docs?: AttachmentDto[];
}

const lineAmount = (l: PoLineValue | undefined) => Math.round(toNumber(l?.quantity) * toNumber(l?.rate) * 100) / 100;
const lineGst = (l: PoLineValue | undefined) => Math.round(lineAmount(l) * toNumber(l?.gstRate)) / 100;

/** Raise or edit a purchase order. Lines from a material request keep its item; other lines are typed in. */
export function PurchaseOrderFormModal({
  open,
  order,
  start,
  onClose,
  onSaved,
}: {
  open: boolean;
  order?: PurchaseOrderDto | null;
  start?: PoStart | null;
  onClose: () => void;
  onSaved?: (o: PurchaseOrderDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const { data: vendors } = useVendors(open);
  // preserve: lines from a request keep their item and unit without a field for them
  const lines = Form.useWatch('lines', { form, preserve: true }) as PoLineValue[] | undefined;
  const freight = Form.useWatch('freight', form);
  const vendorId = Form.useWatch('vendorId', form);
  const vendor = vendors?.find((v) => v.id === vendorId);
  const msme = vendor?.msmeCategory === 'MICRO' || vendor?.msmeCategory === 'SMALL';
  const fromRequest = order ? order.requestNo : start?.requestNo;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (order)
      form.setFieldsValue({
        projectId: order.projectId,
        vendorId: order.vendorId,
        poDate: dayjs(order.poDate),
        deliveryBy: order.deliveryBy ? dayjs(order.deliveryBy) : null,
        deliveryAddress: order.deliveryAddress ?? undefined,
        paymentTerms: order.paymentTerms ?? undefined,
        paymentDays: order.paymentDays,
        freight: toNumber(order.freight),
        remarks: order.remarks ?? undefined,
        docs: order.attachments,
        lines: order.lines.map((l) => ({
          materialRequestItemId: l.materialRequestItemId,
          itemName: l.itemName,
          specification: l.specification,
          unit: l.unit,
          quantity: toNumber(l.quantity),
          rate: toNumber(l.rate),
          gstRate: toNumber(l.gstRate),
        })),
      });
    else
      form.setFieldsValue({
        projectId: start?.projectId,
        vendorId: start?.vendorId,
        poDate: dayjs(),
        deliveryBy: start?.deliveryBy ? dayjs(start.deliveryBy) : null,
        paymentTerms: start?.paymentTerms ?? undefined,
        freight: start?.freight ?? 0,
        lines: start?.lines?.length ? start.lines : [{ gstRate: 18 }],
      });
  }, [open, order, start, form]);

  const totals = useMemo(() => {
    const subtotal = (lines ?? []).reduce((s, l) => s + lineAmount(l), 0);
    const gst = (lines ?? []).reduce((s, l) => s + lineGst(l), 0);
    return { subtotal, gst, total: subtotal + gst + toNumber(freight) };
  }, [lines, freight]);

  const save = useMutation({
    mutationFn: async ({ v, submit }: { v: FormValues; submit: boolean }) => {
      const body = {
        vendorId: v.vendorId,
        poDate: v.poDate.format('YYYY-MM-DD'),
        deliveryBy: v.deliveryBy ? v.deliveryBy.format('YYYY-MM-DD') : null,
        deliveryAddress: v.deliveryAddress?.trim() || null,
        paymentTerms: v.paymentTerms?.trim() || null,
        paymentDays: v.paymentDays ?? null,
        freight: String(v.freight ?? 0),
        remarks: v.remarks?.trim() || null,
        attachmentIds: (v.docs ?? []).map((d) => d.id),
        submit,
        lines: v.lines.map((l) =>
          l.materialRequestItemId
            ? { materialRequestItemId: l.materialRequestItemId, quantity: String(l.quantity), rate: String(l.rate), gstRate: String(l.gstRate ?? 0) }
            : { itemName: l.itemName?.trim(), specification: l.specification?.trim() || null, unit: l.unit?.trim(), quantity: String(l.quantity), rate: String(l.rate), gstRate: String(l.gstRate ?? 0) },
        ),
      };
      if (order) return (await api.patch<PurchaseOrderDto>(`/purchase-orders/${order.id}`, body)).data;
      return (
        await api.post<PurchaseOrderDto>('/purchase-orders', {
          ...body,
          id: crypto.randomUUID(),
          projectId: v.projectId,
          materialRequestId: start?.materialRequestId,
          quotationId: v.vendorId === start?.vendorId ? start?.quotationId : undefined,
        })
      ).data;
    },
    onSuccess: (o, { submit }) => {
      message.success(submit ? `${o.poNo} submitted for approval` : `${o.poNo} saved as a draft`);
      for (const k of ['purchase-orders', 'material-requests', 'quotations']) qc.invalidateQueries({ queryKey: [k] });
      onSaved?.(o);
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const run = async (submit: boolean) => {
    try {
      await form.validateFields();
      // All values, not just the rendered fields: request lines carry their item without an input for it.
      save.mutate({ v: form.getFieldsValue(true) as FormValues, submit });
    } catch {
      /* the form shows what is missing */
    }
  };

  const vendorOptions = (vendors ?? []).filter((v) => v.isActive || v.id === order?.vendorId).map((v) => ({ value: v.id, label: v.name }));
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0 16px' } as const;

  return (
    <Modal
      open={open}
      title={order ? `Edit ${order.poNo}` : fromRequest ? `Purchase order for ${fromRequest}` : 'New purchase order'}
      onCancel={onClose}
      width={1040}
      destroyOnHidden
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 } }}
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => run(false)} loading={save.isPending && !save.variables?.submit}>
            Save draft
          </Button>
          <Button type="primary" onClick={() => run(true)} loading={save.isPending && !!save.variables?.submit}>
            Save and submit
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <div style={grid}>
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} disabled={!!order || !!start?.projectId} options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
          </Form.Item>
          <Form.Item
            name="vendorId"
            label="Vendor"
            rules={[{ required: true, message: 'Pick the vendor from the master' }]}
            extra={vendor ? [vendor.gstin ? `GSTIN ${vendor.gstin}` : 'No GSTIN', vendor.msmeCategory ? MSME_CATEGORY_LABELS[vendor.msmeCategory] : null].filter(Boolean).join(' · ') : undefined}
          >
            <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Vendor master" options={vendorOptions} />
          </Form.Item>
          <Form.Item name="poDate" label="PO date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="deliveryBy" label="Deliver by">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </div>

        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <>
              <Table
                size="small"
                pagination={false}
                rowKey="key"
                dataSource={fields}
                style={{ marginBottom: 8 }}
                columns={[
                  {
                    title: 'Item',
                    key: 'item',
                    render: (_, f) =>
                      lines?.[f.name]?.materialRequestItemId ? (
                        <div>
                          <Typography.Text strong>{lines[f.name].itemName}</Typography.Text>
                          {lines[f.name].specification && <div className="text-muted" style={{ fontSize: 12 }}>{lines[f.name].specification}</div>}
                        </div>
                      ) : (
                        <>
                          <Form.Item name={[f.name, 'itemName']} noStyle rules={[{ required: true, whitespace: true, message: 'Item' }]}>
                            <Input placeholder="Item" aria-label={`Item of line ${f.name + 1}`} maxLength={200} />
                          </Form.Item>
                          <Form.Item name={[f.name, 'specification']} noStyle>
                            <Input placeholder="Specification" maxLength={300} style={{ marginTop: 4 }} />
                          </Form.Item>
                        </>
                      ),
                  },
                  {
                    title: 'Unit',
                    key: 'unit',
                    width: 90,
                    render: (_, f) =>
                      lines?.[f.name]?.materialRequestItemId ? (
                        lines[f.name].unit
                      ) : (
                        <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, whitespace: true, message: 'Unit' }]}>
                          <Input placeholder="Unit" aria-label={`Unit of line ${f.name + 1}`} maxLength={30} />
                        </Form.Item>
                      ),
                  },
                  {
                    title: 'Quantity',
                    key: 'qty',
                    width: 120,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Qty' }]}>
                        <InputNumber min={0.001} precision={3} style={{ width: '100%' }} aria-label={`Quantity of line ${f.name + 1}`} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: 'Rate (₹)',
                    key: 'rate',
                    width: 130,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'rate']} noStyle rules={[{ required: true, message: 'Rate' }]}>
                        <InputNumber min={0} precision={2} style={{ width: '100%' }} aria-label={`Rate of line ${f.name + 1}`} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: 'GST',
                    key: 'gst',
                    width: 90,
                    render: (_, f) => (
                      <Form.Item name={[f.name, 'gstRate']} noStyle initialValue={18}>
                        <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} aria-label={`GST of line ${f.name + 1}`} />
                      </Form.Item>
                    ),
                  },
                  { title: 'Amount', key: 'amount', width: 130, align: 'right', render: (_, f) => <span className="mono">{formatINR(lineAmount(lines?.[f.name]), true)}</span> },
                  {
                    title: '',
                    key: 'x',
                    width: 40,
                    render: (_, f) => (fields.length > 1 ? <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} aria-label={`Remove line ${f.name + 1}`} /> : null),
                  },
                ]}
              />
              <Button size="small" icon={<PlusOutlined />} onClick={() => add({ gstRate: 18 })} style={{ marginBottom: 16 }}>
                Add item
              </Button>
            </>
          )}
        </Form.List>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24 }}>
          <div>
            <div style={grid}>
              <Form.Item name="freight" label="Freight (₹)">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="paymentDays"
                label="Payment days"
                extra={msme ? `${vendor?.name} is a ${vendor?.msmeCategory?.toLowerCase()} enterprise: at most 45 days.` : 'From the invoice; 30 when left empty.'}
                rules={[{ type: 'number', max: msme ? 45 : 365, message: msme ? 'At most 45 days for a micro or small enterprise' : 'At most 365 days' }]}
              >
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Form.Item name="paymentTerms" label="Payment terms">
              <Input maxLength={300} placeholder="30 days from receipt of material and invoice" />
            </Form.Item>
            <Form.Item name="deliveryAddress" label="Delivery address">
              <Input maxLength={500} placeholder="Site store" />
            </Form.Item>
            <Form.Item name="remarks" label="Remarks (printed under the terms)">
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
            <Form.Item name="docs" label="Quotation or other documents">
              <PhotoUpload max={4} />
            </Form.Item>
          </div>
          <div>
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
                  <strong>Order total</strong>
                  <strong className="mono">{formatINR(totals.total, true)}</strong>
                </div>
              }
            />
          </div>
        </div>
      </Form>
    </Modal>
  );
}
