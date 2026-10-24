'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, DatePicker, Form, Input, InputNumber, Segmented, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContractCurrency, OpenBillDto, PaymentMode, RaBillDto, ReceiptDto, ReceiptKind } from '@erp/shared';
import { RECEIPT_KIND_LABELS, RECEIPT_MODES, RECEIPT_MODE_LABELS, isForeign } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useBill, useProjects, useReceivables } from '@/lib/queries';
import { formatDate, formatINR, formatMoney, inContract, moneyPrefix, outOfContract, toNumber } from '@/lib/format';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

const DEDUCTIONS = [
  ['tdsAmount', 'TDS (income tax)', 'tds'],
  ['gstTdsAmount', 'GST TDS', 'gstTds'],
  ['retentionAmount', 'Retention', 'retention'],
  ['securityDepositAmount', 'Security deposit', 'securityDeposit'],
  ['advanceRecoveryAmount', 'Advance recovery', 'advanceRecovery'],
  ['labourCessAmount', 'Labour welfare cess', 'labourCess'],
  ['otherDeduction', 'Other deduction', 'other'],
] as const;
type DeductionField = (typeof DEDUCTIONS)[number][0];

interface FormValues extends Partial<Record<DeductionField, number | null>> {
  kind: ReceiptKind;
  billId?: string;
  projectId?: string;
  receiptDate: dayjs.Dayjs;
  amount: number | null;
  mode: PaymentMode;
  reference?: string;
  otherDeductionNote?: string;
  remarks?: string;
  exchangeRate?: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Record money received from a client: a payment against a bill (with what the client deducted), or retention / security
 * deposit released. With `bill`, the payment is for that bill; with `receipt`, an existing receipt is corrected.
 */
export function ReceiptFormModal({ open, onClose, bill, receipt }: { open: boolean; onClose: () => void; bill?: RaBillDto | null; receipt?: ReceiptDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const { data: receivables } = useReceivables(undefined, open && !bill && !receipt);
  const watchedKind = Form.useWatch('kind', form) as ReceiptKind | undefined;
  // The kind switch is only shown for a new receipt without a bill; the submitted values leave out fields that are not shown.
  const kind: ReceiptKind = receipt ? receipt.kind : bill ? 'BILL' : (watchedKind ?? 'BILL');
  const billId = Form.useWatch('billId', form) as string | undefined;
  const { data: chosen } = useBill(open && !bill && billId ? billId : undefined);
  const target = bill ?? chosen;
  // On a project in another currency the amounts are typed in it and kept in rupees at the contract rate (item 130).
  const cur: ContractCurrency | null = receipt ? { currency: receipt.currency, exchangeRate: receipt.contractRate } : (target ?? null);
  const foreign = isForeign(cur);
  const fm = (v: string | number) => formatMoney(v, cur, true);
  const inC = (rupees: number) => r2(inContract(rupees, cur) ?? 0);
  const values = Form.useWatch([], form) as FormValues | undefined;
  const deducted = DEDUCTIONS.reduce((s, [k]) => s + toNumber(values?.[k] ?? 0), 0);
  const settles = toNumber(values?.amount ?? 0) + deducted;
  const editing = !!receipt;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (receipt) {
      form.setFieldsValue({
        kind: receipt.kind,
        billId: receipt.billId ?? undefined,
        projectId: receipt.projectId,
        receiptDate: dayjs(receipt.receiptDate),
        amount: r2(inContract(toNumber(receipt.amount), { currency: receipt.currency, exchangeRate: receipt.contractRate }) ?? 0),
        exchangeRate: receipt.exchangeRate ? Number(receipt.exchangeRate) : null,
        mode: receipt.mode,
        reference: receipt.reference ?? undefined,
        otherDeductionNote: receipt.otherDeductionNote ?? undefined,
        remarks: receipt.remarks ?? undefined,
        ...Object.fromEntries(DEDUCTIONS.map(([k]) => [k, r2(inContract(toNumber(receipt[k]), { currency: receipt.currency, exchangeRate: receipt.contractRate }) ?? 0) || null])),
      });
    } else form.setFieldsValue({ kind: 'BILL', billId: bill?.id, receiptDate: dayjs(), mode: 'BANK' });
  }, [open, bill, receipt, form]);

  // A first payment usually carries the bill's own deductions; a later one is the balance.
  useEffect(() => {
    if (!open || editing || !target || kind !== 'BILL') return;
    const first = toNumber(target.settledAmount) === 0;
    const of = (key: string) => toNumber(target.deductions.find((d) => d.key === key)?.amount ?? 0);
    // An O&M bill's service level penalties (item 131) are taken by the client as an other deduction.
    const penalty = of('omPenalty');
    const fill: Partial<FormValues> = Object.fromEntries(DEDUCTIONS.map(([k, , key]) => [k, first ? inC(of(key) + (key === 'other' ? penalty : 0)) || null : null]));
    if (first) fill.otherDeductionNote = target.otherDeductionNote ?? (penalty ? 'Service level penalties' : undefined);
    fill.amount = inC(first ? toNumber(target.netPayable) : toNumber(target.outstanding));
    form.setFieldsValue(fill);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inC reads target's currency, already a dependency
  }, [open, editing, target, kind, form]);

  const openBills: OpenBillDto[] = useMemo(() => receivables?.openBills ?? [], [receivables]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        receiptDate: v.receiptDate.format('YYYY-MM-DD'),
        amount: String(outOfContract(v.amount ?? 0, cur)),
        exchangeRate: foreign && v.exchangeRate ? String(v.exchangeRate) : null,
        mode: v.mode,
        reference: v.reference?.trim() || null,
        remarks: v.remarks?.trim() || null,
        otherDeductionNote: v.otherDeductionNote?.trim() || null,
        ...(kind === 'BILL' ? Object.fromEntries(DEDUCTIONS.map(([k]) => [k, String(outOfContract(v[k] ?? 0, cur))])) : {}),
      };
      if (receipt) return (await api.patch<ReceiptDto>(`/receipts/${receipt.id}`, body)).data;
      return (await api.post<ReceiptDto>('/receipts', { ...body, kind, ...(kind === 'BILL' ? { billId: bill?.id ?? v.billId } : { projectId: v.projectId }) })).data;
    },
    onSuccess: (r) => {
      message.success(`${formatMoney(r.amount, cur, true)} ${editing ? 'updated' : 'recorded'}${r.billLabel ? ` against ${r.billLabel}` : ''}`);
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cost'] });
    },
    meta: FAIL_NOTICE,
  });

  const over = kind === 'BILL' && target && !editing ? outOfContract(settles, cur)! - toNumber(target.outstanding) : 0;

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={editing ? 'Correct receipt' : bill ? `Payment received · ${bill.billLabel}` : 'Record money received'}
      okText={editing ? 'Save' : 'Record'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      width={680}
    >
      <Form form={form} layout="vertical">
        {!bill && !editing && (
          <Form.Item name="kind">
            <Segmented options={(['BILL', 'RETENTION_RELEASE', 'DEPOSIT_RELEASE'] as ReceiptKind[]).map((k) => ({ value: k, label: RECEIPT_KIND_LABELS[k] }))} />
          </Form.Item>
        )}
        <FormSection title="Payment">
          {kind === 'BILL' ? (
            <Form.Item name="billId" label="Bill" rules={[{ required: true, message: 'Choose the bill' }]} hidden={!!bill || editing}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Bills sent and not yet settled"
                options={openBills.map((b) => ({ value: b.billId, label: `${b.projectCode} · ${b.billLabel} · ${formatINR(b.outstanding)} outstanding` }))}
                notFoundContent="No bill is waiting for payment"
              />
            </Form.Item>
          ) : (
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={editing}>
              <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
            </Form.Item>
          )}
          {kind === 'BILL' && target && !editing && (
            <Typography.Paragraph type="secondary">
              {target.billLabel} of {formatDate(target.billDate)}: work + GST {fm(target.invoiceAmount)}, settled so far {fm(target.settledAmount)}, outstanding{' '}
              <strong>{fm(target.outstanding)}</strong>.
            </Typography.Paragraph>
          )}
          <FormGrid cols={3}>
            <Form.Item name="receiptDate" label="Received on" rules={[{ required: true, message: 'Pick the date' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="amount" label="Amount received" rules={[{ required: true, message: 'Enter the amount received' }]}>
              <MoneyInput prefix={moneyPrefix(cur)} />
            </Form.Item>
            <Form.Item name="mode" label="Mode">
              <Select options={RECEIPT_MODES.map((m) => ({ value: m, label: RECEIPT_MODE_LABELS[m] }))} />
            </Form.Item>
          </FormGrid>
          {foreign ? (
            <Form.Item
              name="exchangeRate"
              label={`Day's rate (₹ to 1 ${cur!.currency})`}
              extra={`The bank's rate on the day. The contract is kept at ₹ ${cur!.exchangeRate}; the difference is booked to exchange difference. Empty takes the contract rate.`}
            >
              <InputNumber<number> style={{ width: '100%' }} min={0.000001} precision={6} controls={false} inputMode="decimal" placeholder={cur!.exchangeRate ?? undefined} />
            </Form.Item>
          ) : null}
          <Form.Item name="reference" label="UTR / cheque / advice no.">
            <Input maxLength={100} placeholder="e.g. SBIN526291234567" />
          </Form.Item>
        </FormSection>
        {kind === 'BILL' && (
          <FormSection title="Deducted by the client" extra={<Typography.Text strong>{fm(outOfContract(deducted, cur)!)}</Typography.Text>}>
            <FormGrid cols={3}>
              {DEDUCTIONS.map(([k, label]) => (
                <Form.Item key={k} name={k} label={label}>
                  <MoneyInput prefix={moneyPrefix(cur)} />
                </Form.Item>
              ))}
              <Form.Item name="otherDeductionNote" label="Other deduction for">
                <Input maxLength={200} />
              </Form.Item>
            </FormGrid>
            <Typography.Paragraph>
              This settles <strong>{fm(outOfContract(settles, cur)!)}</strong> of the bill (received plus deducted).
            </Typography.Paragraph>
            {over > 1 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={`That is ${fm(over)} more than the bill has outstanding.`} />}
          </FormSection>
        )}
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
