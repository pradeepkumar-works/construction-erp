'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, App, Button, Form, Input, Select, Typography } from 'antd';
import { tk } from '@/ds';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PayableBillDto, PayableBillType, PaymentMode, PaymentRequestDto, VendorPaymentDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, RECEIPT_MODES, RECEIPT_MODE_LABELS, TDS_SECTIONS, isTdsSection } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { usePayables, usePaymentRequests, useTdsSuggest } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { sectionOptions } from '@/components/tds/tdsUi';

/**
 * The bill a payment is for, when the modal is opened from the bill itself, or the approved payment request it draws on
 * (`paymentRequestId`; an advance on an order has no bill, so its `billType` is null).
 */
export interface PayTarget {
  billType: PayableBillType | null;
  billId: string;
  billLabel: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  payable: string;
  outstanding: string;
  paymentRequestId?: string;
  /** The vendor paid, for the TDS section last used and the rate their PAN takes */
  vendorId?: string;
}

/** Paying an approved request: what is left on it, capped at what the bill still has outstanding. */
export function requestPayTarget(r: PaymentRequestDto, billOutstanding?: string): PayTarget {
  const left = billOutstanding === undefined ? toNumber(r.outstanding) : Math.min(toNumber(r.outstanding), toNumber(billOutstanding));
  return {
    billType: r.vendorBillId ? 'VENDOR_BILL' : r.subcontractBillId ? 'SUBCONTRACT_BILL' : null,
    billId: r.vendorBillId ?? r.subcontractBillId ?? r.purchaseOrderId ?? r.workOrderId ?? r.id,
    billLabel: `${r.requestNo} · ${r.targetLabel}`,
    vendorName: r.vendorName ?? '',
    billDate: r.reviewedAt?.slice(0, 10) ?? r.createdAt.slice(0, 10),
    dueDate: r.neededBy ?? r.dueDate ?? r.createdAt.slice(0, 10),
    payable: r.amount,
    outstanding: String(left),
    paymentRequestId: r.id,
    vendorId: r.vendorId ?? undefined,
  };
}

interface FormValues {
  billKey?: string;
  paymentDate: dayjs.Dayjs;
  amount: number | null;
  mode: PaymentMode;
  reference?: string;
  tdsAmount?: number | null;
  tdsSection?: string | null;
  tdsBase?: number | null;
  /** The "TDS on" value the form filled in itself, so it follows the amount; never sent */
  tdsBaseAuto?: number | null;
  otherDeduction?: number | null;
  otherDeductionNote?: string;
  remarks?: string;
}

const keyOf = (b: { billType: PayableBillType | null; billId: string; paymentRequestId?: string }) => (b.paymentRequestId ? `REQUEST:${b.paymentRequestId}` : `${b.billType}:${b.billId}`);

/** Every query a payment changes: the due list, the bills, the cost view and the dashboard. */
export const PAYMENT_QUERY_KEYS = ['vendor-payments', 'tds', 'payables', 'payment-requests', 'vendor-bills', 'subcontract-bills', 'purchase-orders', 'work-orders', 'cost', 'dashboard'];

/**
 * Pay a vendor or subcontractor against an approved bill (from the due list, or the bill given in `bill`), or against an
 * approved payment request (a bill or an advance on an order, or a site's fund request on account),
 * or correct a payment (`payment`). TDS at payment
 * is for vendor bills and advances only: a subcontractor bill already deducts its TDS.
 */
export function PaymentFormModal({ open, onClose, bill, payment }: { open: boolean; onClose: () => void; bill?: PayTarget | null; payment?: VendorPaymentDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const editing = !!payment;
  const choosing = open && !bill && !editing;
  const { data: payables } = usePayables({}, choosing);
  const { data: toPay } = usePaymentRequests({ toPay: true, pageSize: 100, sortBy: 'neededBy', sortOrder: 'asc' }, choosing);
  // With requests required, only approved requests can be paid; otherwise any open bill too.
  const openBills: PayableBillDto[] = useMemo(() => (payables?.paymentsNeedRequest ? [] : (payables?.openBills ?? [])), [payables]);
  // A fund request into an imprest is released from the request, not paid here.
  const requests: PayTarget[] = useMemo(() => (toPay?.items ?? []).filter((r) => r.vendorId).map((r) => requestPayTarget(r)), [toPay]);
  const billKey = Form.useWatch('billKey', form) as string | undefined;
  const chosenBill = openBills.find((b) => keyOf(b) === billKey);
  const chosen: PayTarget | undefined = chosenBill ?? requests.find((r) => keyOf(r) === billKey);
  const target: PayTarget | undefined = bill ?? chosen;
  const billType: PayableBillType | null | undefined = payment ? payment.billType : target?.billType;
  const values = Form.useWatch([], form) as FormValues | undefined;
  const settles = toNumber(values?.amount ?? 0) + toNumber(values?.tdsAmount ?? 0) + toNumber(values?.otherDeduction ?? 0);
  // TDS by section (vendor bills and advances): the section last used for the vendor fills an empty box once, and the rate
  // their PAN and any certificate take is offered on the value before GST, never written in by itself.
  const takesTds = billType !== 'SUBCONTRACT_BILL';
  const vendorId = payment?.vendorId ?? target?.vendorId ?? (chosenBill as { vendorId?: string } | undefined)?.vendorId;
  const vendorBillId = billType === 'VENDOR_BILL' ? (payment?.vendorBillId ?? target?.billId ?? null) : null;
  // "TDS on" left empty is the default (what the payment settles less GST). A value the form put there itself (a catch-up
  // taken, or an edited payment's saved default) is asked for as the default too, so it follows the amount; one typed stays.
  // The value it put there is kept in the form beside the field (`tdsBaseAuto`, never sent).
  const autoBase = Form.useWatch('tdsBaseAuto', { form, preserve: true }) as number | null | undefined;
  const savedBase = useRef<number | null>(null);
  const baseIsAuto = autoBase !== null && autoBase !== undefined && toNumber(values?.tdsBase ?? 0) === autoBase && !form.isFieldTouched('tdsBase');
  const suggestion = useTdsSuggest(
    { vendorId, section: values?.tdsSection ?? null, amount: settles, base: baseIsAuto ? null : (values?.tdsBase ?? null), on: values?.paymentDate?.format?.('YYYY-MM-DD'), vendorBillId, paymentId: payment?.id ?? null },
    open && takesTds,
  ).data;
  const filledSection = useRef(false);
  useEffect(() => {
    if (!open) filledSection.current = false;
    else if (suggestion?.lastUsed && !filledSection.current && !form.getFieldValue('tdsSection') && !form.isFieldTouched('tdsSection')) {
      filledSection.current = true;
      form.setFieldsValue({ tdsSection: suggestion.section });
    }
  }, [open, suggestion, form]);
  const offer = suggestion && !suggestion.lastUsed && toNumber(suggestion.tds) !== toNumber(values?.tdsAmount ?? 0) ? suggestion : null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    savedBase.current = payment?.tds ? toNumber(payment.tds.base) : null;
    form.setFieldsValue({ tdsBaseAuto: savedBase.current });
    if (payment)
      form.setFieldsValue({
        paymentDate: dayjs(payment.paymentDate),
        amount: toNumber(payment.amount),
        mode: payment.mode,
        reference: payment.reference ?? undefined,
        tdsAmount: toNumber(payment.tdsAmount) || null,
        tdsSection: payment.tds?.section ?? null,
        tdsBase: payment.tds ? toNumber(payment.tds.base) : null,
        otherDeduction: toNumber(payment.otherDeduction) || null,
        otherDeductionNote: payment.otherDeductionNote ?? undefined,
        remarks: payment.remarks ?? undefined,
      });
    else form.setFieldsValue({ billKey: bill ? keyOf(bill) : undefined, paymentDate: dayjs(), mode: 'BANK' });
  }, [open, bill, payment, form]);

  useEffect(() => {
    if (!open || !suggestion || form.isFieldTouched('tdsBase')) return;
    const now = toNumber(form.getFieldValue('tdsBase') ?? 0);
    if (savedBase.current !== null) {
      // An edited payment's first suggestion says whether its saved base was the default: then it follows the amount.
      const saved = savedBase.current;
      savedBase.current = null;
      if (saved === toNumber(suggestion.base)) form.setFieldsValue({ tdsBase: null, tdsBaseAuto: null });
      else if (saved !== toNumber(suggestion.taxedOn)) form.setFieldsValue({ tdsBaseAuto: null });
      return;
    }
    const auto = form.getFieldValue('tdsBaseAuto') as number | null | undefined;
    if (auto === null || auto === undefined || now !== auto) return;
    const fill = toNumber(suggestion.taxedOn) > toNumber(suggestion.base) ? toNumber(suggestion.taxedOn) : null;
    if (fill !== now) form.setFieldsValue({ tdsBase: fill, tdsBaseAuto: fill });
  }, [open, suggestion, form]);

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
        tdsAmount: String(billType !== 'SUBCONTRACT_BILL' ? (v.tdsAmount ?? 0) : 0),
        ...(billType !== 'SUBCONTRACT_BILL' && (v.tdsAmount ?? 0) > 0 ? { tdsSection: v.tdsSection ?? null, tdsBase: v.tdsBase ? v.tdsBase.toFixed(2) : null } : {}),
        otherDeduction: String(v.otherDeduction ?? 0),
        otherDeductionNote: v.otherDeductionNote?.trim() || null,
        remarks: v.remarks?.trim() || null,
      };
      if (payment) return (await api.patch<VendorPaymentDto>(`/vendor-payments/${payment.id}`, body)).data;
      const t = target!;
      const on = t.paymentRequestId ? { paymentRequestId: t.paymentRequestId } : t.billType === 'VENDOR_BILL' ? { vendorBillId: t.billId } : { subcontractBillId: t.billId };
      return (await api.post<VendorPaymentDto>('/vendor-payments', { ...body, id: crypto.randomUUID(), ...on })).data;
    },
    onSuccess: (p) => {
      message.success(`${formatINR(p.amount, true)} ${editing ? 'updated' : 'paid'} against ${p.billLabel}`);
      for (const k of PAYMENT_QUERY_KEYS) qc.invalidateQueries({ queryKey: [k] });
    },
    meta: FAIL_NOTICE,
  });

  const over = target && !editing ? settles - toNumber(target.outstanding) : 0;

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      title={editing ? `Correct payment · ${payment.billLabel}` : bill ? `Pay ${bill.vendorName} · ${bill.billLabel}` : 'Record payment'}
      okText={editing ? 'Save' : 'Record payment'}
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        {!bill && !editing && (
          <Form.Item name="billKey" label={requests.length > 0 ? 'Bill or payment request' : 'Bill'} rules={[{ required: true, message: 'Choose what to pay' }]}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={payables?.paymentsNeedRequest ? 'Approved payment requests with something to pay' : 'Approved bills and payment requests with something to pay'}
              options={[
                ...(requests.length > 0 ? [{ label: 'Approved payment requests', options: requests.map((r) => ({ value: keyOf(r), label: `${r.billLabel} · ${r.vendorName} · ${formatINR(r.outstanding)}` })) }] : []),
                ...(openBills.length > 0 ? [{ label: 'Approved bills', options: openBills.map((b) => ({ value: keyOf(b), label: `${b.billLabel} · ${b.vendorName} · ${formatINR(b.outstanding)} due ${formatDate(b.dueDate)}` })) }] : []),
              ]}
              notFoundContent="Nothing is waiting to be paid"
            />
          </Form.Item>
        )}
        {target && !editing && (
          <Typography.Paragraph type="secondary">
            {target.paymentRequestId ? (
              <>
                {target.billLabel}: approved {formatINR(target.payable, true)}, left to pay <strong>{formatINR(target.outstanding, true)}</strong>.
              </>
            ) : (
              <>
                {target.billLabel} of {formatDate(target.billDate)}, due {formatDate(target.dueDate)}: payable {formatINR(target.payable, true)}, outstanding <strong>{formatINR(target.outstanding, true)}</strong>.
              </>
            )}
            {chosenBill?.vendorMsme && (chosenBill.vendorMsme === 'MICRO' || chosenBill.vendorMsme === 'SMALL') ? (
              <AppTag meaning="waiting" style={{ marginLeft: tk.space[2] }}>
                {MSME_CATEGORY_LABELS[chosenBill.vendorMsme]}: 45 days at most
              </AppTag>
            ) : null}
          </Typography.Paragraph>
        )}
        <FormGrid cols={3}>
          <Form.Item name="paymentDate" label="Paid on" rules={[{ required: true, message: 'Choose the date' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
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
        {takesTds && (
          <>
            <FormGrid cols={3}>
              <Form.Item name="tdsSection" label="TDS section" tooltip="The section the TDS goes under in the quarter's 26Q; the vendor's last one is filled in">
                <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="No TDS" options={sectionOptions('FORM_26Q')} />
              </Form.Item>
              <Form.Item name="tdsBase" label="TDS on" tooltip="The value TDS is worked out on: by default what the payment settles less the bill's GST">
                <MoneyInput placeholder={suggestion ? suggestion.base : undefined} />
              </Form.Item>
              <Form.Item
                name="tdsAmount"
                label="TDS deducted"
                dependencies={['tdsSection']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, v) => (toNumber(v ?? 0) > 0 && !getFieldValue('tdsSection') ? Promise.reject(new Error('Choose the TDS section for the TDS deducted')) : Promise.resolve()),
                  }),
                ]}
              >
                <MoneyInput />
              </Form.Item>
            </FormGrid>
            {suggestion && isTdsSection(suggestion.section) && (
              <Typography.Paragraph type="secondary">
                {TDS_SECTIONS[suggestion.section].name} at {suggestion.rate}% on {formatINR(suggestion.taxedOn, true)}: <strong translate="no">{formatINR(suggestion.tds, true)}</strong>.{' '}
                {toNumber(suggestion.taxedOn) > toNumber(suggestion.base)
                  ? `${suggestion.threshold.why}.${suggestion.reason ? ` ${suggestion.why}.` : ''}`
                  : suggestion.threshold.due
                    ? (suggestion.reason ? `${suggestion.why}.` : '')
                    : `${suggestion.threshold.why}.`}
                {offer && (
                  <Button size="small" type="link" onClick={() => {
                      // What the payment settles stays put: the TDS comes out of the amount paid. A catch-up goes on this
                      // payment's row, so the base takes it too.
                      const tds = toNumber(offer.tds);
                      const paid = toNumber(values?.amount ?? 0) - (tds - toNumber(values?.tdsAmount ?? 0));
                      const catchUp = toNumber(offer.taxedOn) > toNumber(offer.base);
                      form.setFieldsValue({ tdsAmount: tds || null, ...(catchUp ? { tdsBase: toNumber(offer.taxedOn), tdsBaseAuto: toNumber(offer.taxedOn) } : {}), ...(paid >= 0 ? { amount: Math.round(paid * 100) / 100 } : {}) });
                    }}>
                    {toNumber(offer.tds) ? `Deduct ${formatINR(offer.tds, true)}` : 'Deduct nothing'}
                  </Button>
                )}
              </Typography.Paragraph>
            )}
          </>
        )}
        <FormGrid cols={2}>
          <Form.Item name="otherDeduction" label="Other deduction">
            <MoneyInput />
          </Form.Item>
          <Form.Item name="otherDeductionNote" label="Deducted for">
            <Input maxLength={200} placeholder="e.g. Short supply debit note" />
          </Form.Item>
        </FormGrid>
        {billType === 'SUBCONTRACT_BILL' && <Typography.Paragraph type="secondary">Their TDS, retention and recoveries are already deducted in the bill&apos;s net payable.</Typography.Paragraph>}
        <Typography.Paragraph>
          This settles <strong>{formatINR(settles, true)}</strong> of the {billType === null ? 'advance' : 'bill'} (paid plus deducted).
        </Typography.Paragraph>
        {over > 1 && <Alert type="warning" showIcon style={{ marginBottom: tk.space[3] }} title={`That is ${formatINR(over, true)} more than ${target?.paymentRequestId ? 'the request has left to pay' : 'the bill has outstanding'}.`} />}
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
