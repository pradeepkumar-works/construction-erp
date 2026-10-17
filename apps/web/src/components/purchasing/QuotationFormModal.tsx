'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Select, Table } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MaterialRequestDto, MaterialRequestItemDto, QuotationDto } from '@erp/shared';
import { GST_RATES } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useVendors } from '@/lib/queries';
import { formatQty, toNumber } from '@/lib/format';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { themeFontSize } from '@/lib/theme';

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
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={860}
      allValues
      title={quotation ? `Quotation from ${quotation.vendorName}` : `Add quotation for ${request.requestNo}`}
      okText={quotation ? 'Save changes' : 'Add quotation'}
      onSubmit={(v) => save.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Quotation">
          <FormGrid cols={2}>
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
            <Form.Item name="quoteDate" label="Quotation date" rules={[{ required: true, message: 'Pick the quotation date' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="validUntil" label="Valid until">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Rates">
          <Table<MaterialRequestItemDto>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={request.items}
            columns={[
              { title: 'Item', dataIndex: 'itemName', render: (v, i) => <div>{v}{i.specification && <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{i.specification}</div>}</div> },
              { title: 'Quantity', dataIndex: 'quantity', width: 120, align: 'right', render: (v, i) => `${formatQty(v)} ${i.unit}` },
              {
                title: 'Rate (per unit, before GST)',
                key: 'rate',
                width: 200,
                render: (_, i) => (
                  <Form.Item name={['rates', i.id, 'rate']} noStyle>
                    <MoneyInput placeholder="Not quoted" aria-label={`Rate for ${i.itemName}`} />
                  </Form.Item>
                ),
              },
              {
                title: 'GST',
                key: 'gst',
                width: 100,
                render: (_, i) => (
                  <Form.Item name={['rates', i.id, 'gstRate']} noStyle>
                    <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} aria-label={`GST on ${i.itemName}`} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
        <FormSection title="Terms">
          <FormGrid cols={3}>
            <Form.Item name="freight" label="Freight">
              <MoneyInput />
            </Form.Item>
            <Form.Item name="deliveryDays" label="Delivery in (days)">
              <InputNumber min={0} max={365} precision={0} inputMode="numeric" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="paymentTerms" label="Payment terms">
              <Input maxLength={200} placeholder="30 days from delivery" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
