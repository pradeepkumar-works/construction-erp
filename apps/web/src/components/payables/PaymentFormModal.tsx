'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, DatePicker, Form, Input, Select, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PayableBillDto, PayableBillType, PaymentMode, VendorPaymentDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, RECEIPT_MODES, RECEIPT_MODE_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { usePayables } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

/** The bill a payment is for, when the modal is opened from the bill itself. */
export interface PayTarget {
  billType: PayableBillType;
  billId: string;
  billLabel: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  payable: string;
  outstanding: string;
}

interface FormValues {
  billKey?: string;
  paymentDate: dayjs.Dayjs;
  amount: number | null;
  mode: PaymentMode;
  reference?: string;
  tdsAmount?: number | null;
  otherDeduction?: number | null;
  otherDeductionNote?: string;
  remarks?: string;
}

const keyOf = (b: { billType: PayableBillType; billId: string }) => `${b.billType}:${b.billId}`;

/** Every query a payment changes: the due list, the bills, the cost view and the dashboard. */
export const PAYMENT_QUERY_KEYS = ['vendor-payments', 'payables', 'vendor-bills', 'subcontract-bills', 'purchase-orders', 'work-orders', 'cost', 'dashboard'];

/**
 * Pay a vendor or subcontractor against an approved bill (from the due list, or the bill given in `bill`), or correct a
 * payment (`payment`). TDS at payment is for vendor bills only: a subcontractor bill already deducts its TDS.
 */
export function PaymentFormModal({ open, onClose, bill, payment }: { open: boolean; onClose: () => void; bill?: PayTarget | null; payment?: VendorPaymentDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const editing = !!payment;
  const { data: payables } = usePayables({}, open && !bill && !editing);
  const openBills: PayableBillDto[] = useMemo(() => payables?.openBills ?? [], [payables]);
  const billKey = Form.useWatch('billKey', form) as string | undefined;
  const chosen = openBills.find((b) => keyOf(b) === billKey);
  const target: PayTarget | undefined = bill ?? chosen;
  const billType: PayableBillType | undefined = payment?.billType ?? target?.billType;
  const values = Form.useWatch([], form) as FormValues | undefined;
  const settles = toNumber(values?.amount ?? 0) + toNumber(values?.tdsAmount ?? 0) + toNumber(values?.otherDeduction ?? 0);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (payment)
      form.setFieldsValue({
        paymentDate: dayjs(payment.paymentDate),
        amount: toNumber(payment.amount),
        mode: payment.mode,
        reference: payment.reference ?? undefined,
        tdsAmount: toNumber(payment.tdsAmount) || null,
        otherDeduction: toNumber(payment.otherDeduction) || null,
        otherDeductionNote: payment.otherDeductionNote ?? undefined,
        remarks: payment.remarks ?? undefined,
      });
    else form.setFieldsValue({ billKey: bill ? keyOf(bill) : undefined, paymentDate: dayjs(), mode: 'BANK' });
  }, [open, bill, payment, form]);

  // A new payment starts at what is outstanding on the bill.
  useEffect(() => {
    if (!open || editing || !target) return;
    form.setFieldsValue({ amount: toNumber(target.outstanding) });
  }, [open, editing, target, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        paymentDate: v.paymentDate.format('YYYY-MM-DD'),
        amount: String(v.amount ?? 0),
        mode: v.mode,
        reference: v.reference?.trim() || null,
        tdsAmount: String(billType === 'VENDOR_BILL' ? (v.tdsAmount ?? 0) : 0),
        otherDeduction: String(v.otherDeduction ?? 0),
        otherDeductionNote: v.otherDeductionNote?.trim() || null,
        remarks: v.remarks?.trim() || null,
      };
      if (payment) return (await api.patch<VendorPaymentDto>(`/vendor-payments/${payment.id}`, body)).data;
      const t = target!;
      return (await api.post<VendorPaymentDto>('/vendor-payments', { ...body, id: crypto.randomUUID(), ...(t.billType === 'VENDOR_BILL' ? { vendorBillId: t.billId } : { subcontractBillId: t.billId }) })).data;
    },
    onSuccess: (p) => {
      message.success(`${formatINR(p.amount, true)} ${editing ? 'updated' : 'paid'} against ${p.billLabel}`);
      for (const k of PAYMENT_QUERY_KEYS) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const over = target && !editing ? settles - toNumber(target.outstanding) : 0;

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      title={editing ? `Correct payment · ${payment.billLabel}` : bill ? `Pay ${bill.vendorName} · ${bill.billLabel}` : 'Record a payment'}
      okText={editing ? 'Save' : 'Record payment'}
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        {!bill && !editing && (
          <Form.Item name="billKey" label="Bill" rules={[{ required: true, message: 'Choose the bill' }]}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Approved bills with something to pay"
              options={openBills.map((b) => ({ value: keyOf(b), label: `${b.billLabel} · ${b.vendorName} · ${formatINR(b.outstanding)} due ${formatDate(b.dueDate)}` }))}
              notFoundContent="Nothing is waiting to be paid"
            />
          </Form.Item>
        )}
        {target && !editing && (
          <Typography.Paragraph type="secondary">
            {target.billLabel} of {formatDate(target.billDate)}, due {formatDate(target.dueDate)}: payable {formatINR(target.payable, true)}, outstanding <strong>{formatINR(target.outstanding, true)}</strong>.
            {chosen?.vendorMsme && (chosen.vendorMsme === 'MICRO' || chosen.vendorMsme === 'SMALL') ? (
              <Tag color="orange" style={{ marginLeft: 8 }}>
                {MSME_CATEGORY_LABELS[chosen.vendorMsme]}: 45 days at most
              </Tag>
            ) : null}
          </Typography.Paragraph>
        )}
        <FormGrid cols={3}>
          <Form.Item name="paymentDate" label="Paid on" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="amount" label="Amount paid" rules={[{ required: true, message: 'Enter the amount' }]}>
            <MoneyInput />
          </Form.Item>
          <Form.Item name="mode" label="Mode">
            <Select options={RECEIPT_MODES.map((m) => ({ value: m, label: RECEIPT_MODE_LABELS[m] }))} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="reference" label="UTR / cheque / voucher no.">
          <Input maxLength={100} placeholder="e.g. HDFCN26287512345" />
        </Form.Item>
        <FormGrid cols={3}>
          {billType !== 'SUBCONTRACT_BILL' && (
            <Form.Item name="tdsAmount" label="TDS deducted" tooltip="Section 194Q on purchases or 194C on contracts, deducted when paying">
              <MoneyInput />
            </Form.Item>
          )}
          <Form.Item name="otherDeduction" label="Other deduction">
            <MoneyInput />
          </Form.Item>
          <Form.Item name="otherDeductionNote" label="Deducted for">
            <Input maxLength={200} placeholder="Short supply debit note" />
          </Form.Item>
        </FormGrid>
        {billType === 'SUBCONTRACT_BILL' && <Typography.Paragraph type="secondary">Their TDS, retention and recoveries are already deducted in the bill&apos;s net payable.</Typography.Paragraph>}
        <Typography.Paragraph>
          This settles <strong>{formatINR(settles, true)}</strong> of the bill (paid plus deducted).
        </Typography.Paragraph>
        {over > 1 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={`That is ${formatINR(over, true)} more than the bill has outstanding.`} />}
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
