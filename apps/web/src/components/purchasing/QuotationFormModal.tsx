'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select, Table } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MaterialRequestDto, MaterialRequestItemDto, QuotationDto } from '@erp/shared';
import { GST_RATES } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useVendors } from '@/lib/queries';
import { formatQty, toNumber } from '@/lib/format';

interface FormValues {
  vendorId: string;
  quoteRef?: string;
  quoteDate: dayjs.Dayjs;
  validUntil?: dayjs.Dayjs | null;
  deliveryDays?: number | null;
  paymentTerms?: string;
  freight?: number | null;
  remarks?: string;
  rates: Record<string, { rate?: number | null; gstRate?: number }>;
}

/** Enter or correct a vendor's quotation on an approved material request. Lines left without a rate are not quoted. */
export function QuotationFormModal({ open, request, quotation, onClose }: { open: boolean; request: MaterialRequestDto; quotation?: QuotationDto | null; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: vendors } = useVendors(open);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    const rates = Object.fromEntries(
      request.items.map((i) => {
        const l = quotation?.lines.find((x) => x.materialRequestItemId === i.id);
        return [i.id, { rate: l ? toNumber(l.rate) : null, gstRate: l ? toNumber(l.gstRate) : 18 }];
      }),
    );
    form.setFieldsValue(
      quotation
        ? {
            vendorId: quotation.vendorId,
            quoteRef: quotation.quoteRef ?? undefined,
            quoteDate: dayjs(quotation.quoteDate),
            validUntil: quotation.validUntil ? dayjs(quotation.validUntil) : null,
            deliveryDays: quotation.deliveryDays,
            paymentTerms: quotation.paymentTerms ?? undefined,
            freight: toNumber(quotation.freight),
            remarks: quotation.remarks ?? undefined,
            rates,
          }
        : { quoteDate: dayjs(), freight: 0, rates },
    );
  }, [open, request, quotation, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const lines = request.items
        .filter((i) => v.rates?.[i.id]?.rate !== null && v.rates?.[i.id]?.rate !== undefined)
        .map((i) => ({ materialRequestItemId: i.id, rate: String(v.rates[i.id].rate), gstRate: String(v.rates[i.id].gstRate ?? 0) }));
      if (!lines.length) throw new Error('Enter the rate for at least one item.');
      const body = {
        quoteRef: v.quoteRef?.trim() || null,
        quoteDate: v.quoteDate.format('YYYY-MM-DD'),
        validUntil: v.validUntil ? v.validUntil.format('YYYY-MM-DD') : null,
        deliveryDays: v.deliveryDays ?? null,
        paymentTerms: v.paymentTerms?.trim() || null,
        freight: String(v.freight ?? 0),
        remarks: v.remarks?.trim() || null,
        lines,
      };
      if (quotation) return (await api.patch<QuotationDto>(`/quotations/${quotation.id}`, body)).data;
      return (await api.post<QuotationDto>('/quotations', { ...body, materialRequestId: request.id, vendorId: v.vendorId })).data;
    },
    onSuccess: (q) => {
      message.success(`Quotation from ${q.vendorName} ${quotation ? 'updated' : 'added'}`);
      qc.invalidateQueries({ queryKey: ['quotations'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0 16px' } as const;

  return (
    <Modal
      open={open}
      title={quotation ? `Quotation from ${quotation.vendorName}` : `Add quotation for ${request.requestNo}`}
      okText={quotation ? 'Save changes' : 'Add quotation'}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={save.isPending}
      width={860}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={() => save.mutate(form.getFieldsValue(true) as FormValues)} style={{ marginTop: 8 }}>
        <div style={grid}>
          <Form.Item name="vendorId" label="Vendor" rules={[{ required: true, message: 'Pick the vendor' }]}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              disabled={!!quotation}
              placeholder="Vendor master"
              options={(vendors ?? []).filter((v) => v.isActive).map((v) => ({ value: v.id, label: v.name }))}
            />
          </Form.Item>
          <Form.Item name="quoteRef" label="Their quotation no.">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="quoteDate" label="Quotation date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="validUntil" label="Valid until">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </div>
        <Table<MaterialRequestItemDto>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={request.items}
          style={{ marginBottom: 16 }}
          columns={[
            { title: 'Item', dataIndex: 'itemName', render: (v, i) => <div>{v}{i.specification && <div className="text-muted" style={{ fontSize: 12 }}>{i.specification}</div>}</div> },
            { title: 'Quantity', dataIndex: 'quantity', width: 120, align: 'right', render: (v, i) => `${formatQty(v)} ${i.unit}` },
            {
              title: 'Rate (₹ per unit, before GST)',
              key: 'rate',
              width: 200,
              render: (_, i) => (
                <Form.Item name={['rates', i.id, 'rate']} noStyle>
                  <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="Not quoted" aria-label={`Rate for ${i.itemName}`} />
                </Form.Item>
              ),
            },
            {
              title: 'GST',
              key: 'gst',
              width: 100,
              render: (_, i) => (
                <Form.Item name={['rates', i.id, 'gstRate']} noStyle>
                  <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
                </Form.Item>
              ),
            },
          ]}
        />
        <div style={grid}>
          <Form.Item name="freight" label="Freight (₹)">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="deliveryDays" label="Delivery in (days)">
            <InputNumber min={0} max={365} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="paymentTerms" label="Payment terms">
            <Input maxLength={200} placeholder="30 days from delivery" />
          </Form.Item>
        </div>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
