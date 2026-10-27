'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, Card, DatePicker, Flex, Form, Input, InputNumber, Select, Table, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import {
  GST_RATES,
  MSME_CATEGORIES,
  MSME_CATEGORY_LABELS,
  SUPPLIER_BANK_FIELDS,
  SUPPLIER_PROFILE_FIELDS,
  SUPPLIER_PROFILE_LABELS,
  type AttachmentDto,
  type PublicQuoteInput,
  type SupplierDispatchDto,
  type SupplierEnquiryDto,
  type SupplierInvoiceDto,
  type SupplierOrderDto,
  type SupplierProfileDto,
  type SupplierProfileField,
} from '@erp/shared';
import { useSupplierAction, useSupplierOrders } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, EMAIL_INPUT, MoneyInput, PHONE_INPUT, emailRule, gstinRule, ifscRule, panRule, phoneRule } from '@/components/form/inputs';
import { PhotoUpload } from '@/components/common/PhotoUpload';

/** A quote on an enquiry: a rate and GST per item, freight, delivery and terms; sent once. */
export function QuoteForm({ enquiry, onClose }: { enquiry: SupplierEnquiryDto | null; onClose: () => void }) {
  const { token } = theme.useToken();
  const [form] = Form.useForm<{
    rates: Record<string, { rate?: number | null; gstRate?: number; remarks?: string }>;
    quoteRef?: string;
    validUntil?: dayjs.Dayjs | null;
    deliveryDays?: number | null;
    paymentTerms?: string;
    freight?: number | null;
    remarks?: string;
  }>();
  const { message } = App.useApp();
  const send = useSupplierAction();
  const e = enquiry;
  return (
    <FormShell
      open={!!e}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={760}
      projectDefault={false}
      title={e ? `Quote for ${e.requestNo}` : 'Quote'}
      okText="Send quote"
      onSubmit={async (v) => {
        if (!e) return;
        const lines = e.lines
          .filter((l) => v.rates?.[l.materialRequestItemId]?.rate != null)
          .map((l) => ({ materialRequestItemId: l.materialRequestItemId, rate: String(v.rates[l.materialRequestItemId].rate), gstRate: String(v.rates[l.materialRequestItemId].gstRate ?? 0), remarks: v.rates[l.materialRequestItemId].remarks?.trim() || undefined }));
        if (!lines.length) throw new Error('Enter your rate for at least one item');
        const body: PublicQuoteInput = {
          lines,
          quoteRef: v.quoteRef?.trim() || undefined,
          validUntil: v.validUntil ? v.validUntil.format('YYYY-MM-DD') : undefined,
          deliveryDays: v.deliveryDays ?? undefined,
          paymentTerms: v.paymentTerms?.trim() || undefined,
          freight: v.freight ? String(v.freight) : undefined,
          remarks: v.remarks?.trim() || undefined,
        };
        await send.mutateAsync({ path: `/supplier/enquiries/${e.id}/quote`, body });
        message.success(`Quote sent for ${e.requestNo}`);
      }}
    >
      {e ? (
        <Form form={form} layout="vertical" initialValues={{ rates: Object.fromEntries(e.lines.map((l) => [l.materialRequestItemId, { gstRate: 18 }])) }}>
          <Typography.Paragraph type="secondary">
            <span translate="no">{e.projectName}</span>, needed by {formatDate(e.requiredDate)}. Quote by {formatDate(e.closesOn)}; leave out any item you do not supply.
          </Typography.Paragraph>
          {e.message ? <Alert type="info" showIcon title={e.message} style={{ marginBottom: token.marginMD }} /> : null}
          <Flex vertical gap={token.marginSM} style={{ marginBottom: token.marginMD }}>
            {e.lines.map((l, i) => (
              <Card key={l.materialRequestItemId} size="small" title={<span style={{ whiteSpace: 'normal' }}>{i + 1}. {l.itemName}</span>} extra={<span translate="no">{formatQty(l.quantity)} {l.unit}</span>}>
                {l.specification ? <Typography.Paragraph type="secondary">{l.specification}</Typography.Paragraph> : null}
                <FormGrid cols={3}>
                  <Form.Item name={['rates', l.materialRequestItemId, 'rate']} label={`Rate per ${l.unit}, before GST`}>
                    <MoneyInput placeholder="Not supplied" />
                  </Form.Item>
                  <Form.Item name={['rates', l.materialRequestItemId, 'gstRate']} label="GST">
                    <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
                  </Form.Item>
                  <Form.Item name={['rates', l.materialRequestItemId, 'remarks']} label="Brand or note">
                    <Input maxLength={300} />
                  </Form.Item>
                </FormGrid>
              </Card>
            ))}
          </Flex>
          <FormSection title="Terms">
            <FormGrid cols={3}>
              <Form.Item name="freight" label="Freight to site">
                <MoneyInput />
              </Form.Item>
              <Form.Item name="deliveryDays" label="Delivery in (days)">
                <InputNumber min={0} max={365} precision={0} inputMode="numeric" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="paymentTerms" label="Payment terms">
                <Input maxLength={200} placeholder="30 days from delivery" />
              </Form.Item>
              <Form.Item name="quoteRef" label="Your quotation no.">
                <Input maxLength={60} {...CODE_INPUT} />
              </Form.Item>
              <Form.Item name="validUntil" label="Rates valid until">
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
              </Form.Item>
            </FormGrid>
            <Form.Item name="remarks" label="Remarks">
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
          </FormSection>
        </Form>
      ) : null}
    </FormShell>
  );
}

/** Accept an order, with a remark the buyer reads (a delivery plan, a question). */
export function AcceptForm({ order, onClose }: { order: SupplierOrderDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ note?: string }>();
  const { message } = App.useApp();
  const send = useSupplierAction<SupplierOrderDto>();
  return (
    <FormShell
      open={!!order}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title={order ? `Accept ${order.number}` : 'Accept the order'}
      okText="Accept"
      onSubmit={async (v) => {
        if (!order) return;
        await send.mutateAsync({ path: `/supplier/orders/${order.kind.toLowerCase()}/${order.id}/accept`, body: { note: v.note?.trim() || null } });
        message.success(`${order.number} accepted`);
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph>By accepting you agree to the order's items, rates and terms. Whoever raised it is told.</Typography.Paragraph>
        <Form.Item name="note" label="Remark (optional)">
          <Input.TextArea rows={3} maxLength={500} placeholder="Will deliver in two lots, the first on the 25th" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface DispatchValues {
  purchaseOrderId: string;
  dispatchNo: string;
  date: dayjs.Dayjs;
  vehicleNo?: string;
  lrNo?: string;
  transporter?: string;
  remarks?: string;
  qty: Record<string, number | null>;
}

/** A dispatch note: what is on the truck against one purchase order. The site's GRN is filled from it. */
export function DispatchForm({ open, orderId, onClose }: { open: boolean; orderId?: string | null; onClose: () => void }) {
  const [form] = Form.useForm<DispatchValues>();
  const { message } = App.useApp();
  const send = useSupplierAction<SupplierDispatchDto>();
  const { data: orders } = useSupplierOrders();
  const sendable = useMemo(() => (orders ?? []).filter((o) => o.kind === 'PO' && !o.closed && o.lines.some((l) => Number(l.toSend) > 0)), [orders]);
  const chosen = Form.useWatch('purchaseOrderId', form);
  const order = sendable.find((o) => o.id === chosen);
  useEffect(() => {
    if (open) form.setFieldsValue({ purchaseOrderId: orderId ?? undefined, date: dayjs(), qty: {} });
  }, [open, orderId, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={760}
      projectDefault={false}
      title="Send a dispatch note"
      okText="Send dispatch note"
      onSubmit={async (v) => {
        const lines = Object.entries(v.qty ?? {})
          .filter(([, q]) => q && q > 0)
          .map(([purchaseOrderLineId, quantity]) => ({ purchaseOrderLineId, quantity }));
        if (!lines.length) throw new Error('Enter the quantity sent on at least one line');
        const d = await send.mutateAsync({
          path: '/supplier/dispatches',
          body: {
            purchaseOrderId: v.purchaseOrderId,
            dispatchNo: v.dispatchNo.trim(),
            date: v.date.format('YYYY-MM-DD'),
            vehicleNo: v.vehicleNo?.trim() || null,
            lrNo: v.lrNo?.trim() || null,
            transporter: v.transporter?.trim() || null,
            remarks: v.remarks?.trim() || null,
            lines,
          },
        });
        message.success(`Dispatch note ${d.dispatchNo} sent for ${d.poNo}`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="purchaseOrderId" label="Purchase order" rules={[{ required: true, message: 'Choose the purchase order this is against' }]} extra={sendable.length ? null : 'No purchase order has anything left to send'}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={sendable.map((o) => ({ value: o.id, label: `${o.number} · ${o.projectName}` }))} onChange={() => form.setFieldValue('qty', {})} />
        </Form.Item>
        {order ? (
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={order.lines}
            scroll={{ x: 560 }}
            columns={[
              { title: 'Item', dataIndex: 'itemName' },
              { title: 'Ordered', dataIndex: 'quantity', align: 'right', width: 110, render: (v: string, l) => <span translate="no">{`${formatQty(v)} ${l.unit}`}</span> },
              { title: 'Left to send', dataIndex: 'toSend', align: 'right', width: 110, render: (v: string) => <span translate="no">{formatQty(v)}</span> },
              {
                title: 'Sending now',
                key: 'now',
                width: 170,
                render: (_, l) =>
                  Number(l.toSend) > 0 ? (
                    <Form.Item name={['qty', l.id]} noStyle>
                      <InputNumber min={0} max={Number(l.toSend)} aria-label={`Quantity of ${l.itemName} sent`} suffix={l.unit} style={{ width: '100%' }} />
                    </Form.Item>
                  ) : (
                    <Typography.Text type="secondary">Nothing left</Typography.Text>
                  ),
              },
            ]}
          />
        ) : null}
        <FormGrid cols={2}>
          <Form.Item name="dispatchNo" label="Your challan no." rules={[{ required: true, whitespace: true, message: 'Enter your challan number' }]}>
            <Input maxLength={40} {...CODE_INPUT} />
          </Form.Item>
          <Form.Item name="date" label="Sent on" rules={[{ required: true, message: 'Choose the date sent' }]}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="vehicleNo" label="Vehicle no.">
            <Input maxLength={20} {...CODE_INPUT} placeholder="OD02AB1234" />
          </Form.Item>
          <Form.Item name="lrNo" label="LR no.">
            <Input maxLength={40} {...CODE_INPUT} />
          </Form.Item>
          <Form.Item name="transporter" label="Transporter">
            <Input maxLength={120} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface InvoiceValues {
  order?: string;
  invoiceNo: string;
  invoiceDate: dayjs.Dayjs;
  amount: number;
  gstAmount?: number | null;
  notes?: string;
  files: AttachmentDto[];
}

/** Send an invoice: the file, its number, date and amount, and the order it is for. A returned one is sent again here. */
export function InvoiceForm({ open, again, onClose }: { open: boolean; again?: SupplierInvoiceDto | null; onClose: () => void }) {
  const [form] = Form.useForm<InvoiceValues>();
  const { message } = App.useApp();
  const send = useSupplierAction<SupplierInvoiceDto>();
  const { data: orders } = useSupplierOrders();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (again)
      form.setFieldsValue({
        order: again.purchaseOrderId ? `PO:${again.purchaseOrderId}` : again.workOrderId ? `WO:${again.workOrderId}` : undefined,
        invoiceNo: again.invoiceNo,
        invoiceDate: dayjs(again.invoiceDate),
        amount: Number(again.amount),
        gstAmount: again.gstAmount ? Number(again.gstAmount) : null,
        notes: again.notes ?? undefined,
        files: [],
      });
    else form.setFieldsValue({ invoiceDate: dayjs(), files: [] });
  }, [open, again, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      projectDefault={false}
      title={again ? `Send ${again.invoiceNo} again` : 'Send an invoice'}
      okText="Send to accounts"
      onSubmit={async (v) => {
        const [kind, id] = (v.order ?? '').split(':');
        const r = await send.mutateAsync({
          path: '/supplier/invoices',
          body: {
            purchaseOrderId: kind === 'PO' ? id : null,
            workOrderId: kind === 'WO' ? id : null,
            invoiceNo: v.invoiceNo.trim(),
            invoiceDate: v.invoiceDate.format('YYYY-MM-DD'),
            amount: v.amount,
            gstAmount: v.gstAmount ?? null,
            notes: v.notes?.trim() || null,
            attachmentIds: (v.files ?? []).map((f) => f.id),
          },
        });
        message.success(`Invoice ${r.invoiceNo} sent to accounts`);
      }}
    >
      <Form form={form} layout="vertical">
        {again?.returnNote ? <Alert type="warning" showIcon title={`Returned: ${again.returnNote}`} style={{ marginBottom: 16 }} /> : null}
        <Form.Item name="order" label="Against" extra="Leave empty for a service with no order">
          <Select
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Choose the order"
            options={(orders ?? []).map((o) => ({ value: `${o.kind}:${o.id}`, label: `${o.number} · ${o.projectName}` }))}
          />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="invoiceNo" label="Invoice no." rules={[{ required: true, whitespace: true, message: 'Enter the invoice number' }]}>
            <Input maxLength={60} {...CODE_INPUT} disabled={!!again} />
          </Form.Item>
          <Form.Item name="invoiceDate" label="Invoice date" rules={[{ required: true, message: 'Choose the invoice date' }]}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="amount" label="Amount with GST" rules={[{ required: true, message: 'Enter the invoice amount' }]}>
            <MoneyInput />
          </Form.Item>
          <Form.Item name="gstAmount" label="Of which GST">
            <MoneyInput />
          </Form.Item>
        </FormGrid>
        <Form.Item name="files" label="The invoice (PDF or photo)" rules={[{ required: true, type: 'array', min: 1, message: 'Attach the invoice' }]}>
          <PhotoUpload max={5} />
        </Form.Item>
        <Form.Item name="notes" label="Note for accounts">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

const FIELD_INPUT: Partial<Record<SupplierProfileField, Record<string, unknown>>> = {
  email: EMAIL_INPUT,
  phone: PHONE_INPUT,
  gstin: CODE_INPUT,
  pan: CODE_INPUT,
  udyamNo: CODE_INPUT,
  bankAccountNo: { ...CODE_INPUT, inputMode: 'numeric' },
  bankIfsc: CODE_INPUT,
};
const FIELD_RULES: Partial<Record<SupplierProfileField, object[]>> = { email: [emailRule], phone: [phoneRule], gstin: [gstinRule], pan: [panRule], bankIfsc: [ifscRule] };

/** Ask for the vendor's details to change; the company approves before anything changes. */
export function ChangeForm({ open, profile, onClose }: { open: boolean; profile: SupplierProfileDto | null; onClose: () => void }) {
  const [form] = Form.useForm<Record<SupplierProfileField | 'note', string | null>>();
  const { message } = App.useApp();
  const send = useSupplierAction();
  useEffect(() => {
    if (open && profile) form.setFieldsValue({ ...profile.values, note: null });
  }, [open, profile, form]);
  const field = (f: SupplierProfileField) => (
    <Form.Item key={f} name={f} label={SUPPLIER_PROFILE_LABELS[f]} rules={FIELD_RULES[f] as never}>
      {f === 'msmeCategory' ? <Select allowClear options={MSME_CATEGORIES.map((c) => ({ value: c, label: MSME_CATEGORY_LABELS[c] }))} /> : f === 'address' ? <Input.TextArea rows={2} maxLength={500} /> : <Input maxLength={200} {...FIELD_INPUT[f]} />}
    </Form.Item>
  );
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={720}
      projectDefault={false}
      title="Change your details"
      okText="Send for approval"
      onSubmit={async (v) => {
        if (!profile) return;
        const body: Record<string, string | null> = {};
        for (const f of SUPPLIER_PROFILE_FIELDS) if ((v[f] ?? null) !== (profile.values[f] ?? null)) body[f] = v[f] || null;
        if (!Object.keys(body).length) throw new Error('Change at least one detail');
        await send.mutateAsync({ path: '/supplier/profile/changes', body: { ...body, note: v.note?.trim() || null } });
        message.success('Sent for approval. Nothing changes until the company approves it.');
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Contact and tax">
          <FormGrid cols={2}>{SUPPLIER_PROFILE_FIELDS.filter((f) => !SUPPLIER_BANK_FIELDS.includes(f)).map(field)}</FormGrid>
        </FormSection>
        <FormSection title="Bank account">
          <Typography.Paragraph type="secondary">A new bank account is checked by accounts before any payment goes to it. Type the whole account number to change it.</Typography.Paragraph>
          <FormGrid cols={2}>{SUPPLIER_BANK_FIELDS.map(field)}</FormGrid>
        </FormSection>
        <Form.Item name="note" label="Note for whoever approves it">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
