'use client';

import React, { useEffect, useMemo } from 'react';
import { App, Checkbox, DatePicker, Form, Input, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { PAYMENT_MODES, PAYMENT_MODE_LABELS, type RmcInvoiceDto, type RmcReceiptDto } from '@erp/shared';
import { useRmcAction, useRmcBatches, useRmcInvoices, useRmcOrders } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { ClientSelect } from '@/components/common/SearchSelect';
import { m3 } from './rmcUi';

/** A GST bill for an order's delivered challans not yet billed. */
export function InvoiceForm({ open, orderId, onClose }: { open: boolean; orderId?: string | null; onClose: () => void }) {
  const [form] = Form.useForm<{ orderId: string; date: dayjs.Dayjs; batchIds: string[] }>();
  const { message } = App.useApp();
  const save = useRmcAction<RmcInvoiceDto>();
  const { data: orders } = useRmcOrders({ pageSize: 100 }, open);
  const billable = (orders?.items ?? []).filter((o) => o.clientId && Number(o.unbilled) > 0);
  const chosen = Form.useWatch('orderId', form);
  const { data: batches } = useRmcBatches({ orderId: chosen, status: 'DELIVERED', pageSize: 100 }, open && !!chosen);
  const unbilled = useMemo(() => (batches?.items ?? []).filter((b) => !b.invoiceNo), [batches]);
  useEffect(() => {
    if (open && orderId) form.setFieldsValue({ orderId });
  }, [open, orderId, form]);
  useEffect(() => {
    form.setFieldsValue({ batchIds: unbilled.map((b) => b.id) });
  }, [unbilled, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      projectDefault={false}
      title="Bill delivered challans"
      okText="Make the bill"
      onSubmit={async (v) => {
        const r = await save.mutateAsync({ path: '/rmc/invoices', body: { orderId: v.orderId, date: v.date.format('YYYY-MM-DD'), batchIds: v.batchIds } });
        message.success(`${r.invoiceNo} made for ${formatINR(r.total, true)}`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ date: dayjs() }}>
        <FormGrid cols={2}>
          <Form.Item name="orderId" label="Order" rules={[{ required: true, message: 'Choose the order to bill' }]} extra={billable.length ? null : 'No order has delivered challans waiting for a bill'}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={billable.map((o) => ({ value: o.id, label: `${o.orderNo} · ${o.customer} · ${m3(o.unbilled)} to bill` }))} />
          </Form.Item>
          <Form.Item name="date" label="Bill date" rules={[{ required: true, message: 'Pick the bill date' }]}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        {chosen && (
          <Form.Item name="batchIds" label="Challans" rules={[{ required: true, type: 'array', min: 1, message: 'Tick the challans to bill' }]} extra="Concrete at the order's rate, pumping on the trucks pumped, GST at 18%">
            <Checkbox.Group style={{ display: 'grid', gap: 4 }} options={unbilled.map((b) => ({ value: b.id, label: <span translate="no">{`${b.batchNo} · ${formatDate(b.date)} · ${m3(b.quantity)}${b.pumped ? ' · pumped' : ''}`}</span> }))} />
          </Form.Item>
        )}
      </Form>
    </FormShell>
  );
}

/** Money a customer paid, against a bill or on account. */
export function ReceiptForm({ open, invoice, onClose }: { open: boolean; invoice?: RmcInvoiceDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ clientId: string; invoiceId?: string | null; date: dayjs.Dayjs; amount: number; mode: string; reference?: string }>();
  const { message } = App.useApp();
  const save = useRmcAction<RmcReceiptDto>();
  const clientId = Form.useWatch('clientId', form);
  const { data: bills } = useRmcInvoices({ clientId, due: true, pageSize: 100 });
  useEffect(() => {
    if (open && invoice) form.setFieldsValue({ clientId: invoice.clientId, invoiceId: invoice.id, amount: Number(invoice.due) });
  }, [open, invoice, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      projectDefault={false}
      title="Money received for RMC"
      okText="Record"
      onSubmit={async (v) => {
        const r = await save.mutateAsync({ path: '/rmc/receipts', body: { clientId: v.clientId, invoiceId: v.invoiceId || null, date: v.date.format('YYYY-MM-DD'), amount: v.amount, mode: v.mode, reference: v.reference?.trim() || null } });
        message.success(`${formatINR(r.amount, true)} from ${r.customer} recorded`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ date: dayjs(), mode: 'BANK' }}>
        <FormGrid cols={2}>
          <Form.Item name="clientId" label="Customer" rules={[{ required: true, message: 'Choose the customer' }]}>
            <ClientSelect selected={invoice ? { value: invoice.clientId, label: invoice.customer } : null} onChange={() => form.setFieldsValue({ invoiceId: null })} />
          </Form.Item>
          <Form.Item name="invoiceId" label="Against bill" extra="Leave empty for money on account">
            <Select allowClear disabled={!clientId} options={(bills?.items ?? []).map((b) => ({ value: b.id, label: `${b.invoiceNo} · ${formatINR(b.due, true)} due` }))} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter the amount received' }]}>
            <MoneyInput />
          </Form.Item>
          <Form.Item name="mode" label="How" rules={[{ required: true, message: 'Choose how it was paid' }]}>
            <Select options={PAYMENT_MODES.filter((m) => m !== 'CREDIT').map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="reference" label="Reference" extra="UTR, cheque or receipt number">
          <Input maxLength={100} translate="no" />
        </Form.Item>
        <Typography.Text type="secondary">It goes to the books as a receipt from the customer, and to Tally with the next export.</Typography.Text>
      </Form>
    </FormShell>
  );
}
