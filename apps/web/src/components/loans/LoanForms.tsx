'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Form, Input, InputNumber, Radio, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EquipmentLoanDetailDto, LoanDisbursal, PaymentMode } from '@erp/shared';
import { LOAN_DISBURSALS, LOAN_DISBURSAL_HELP, LOAN_DISBURSAL_LABELS, LOAN_MAX_MONTHS, LOAN_MAX_RATE, RECEIPT_MODES, RECEIPT_MODE_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useLoanPreview } from '@/lib/queries';
import { useDebounced } from '@/lib/debounce';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { EquipmentSelect, VendorSelect } from '@/components/common/SearchSelect';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : undefined);
const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['machine-loans'] });
  qc.invalidateQueries({ queryKey: ['machinery'] });
  qc.invalidateQueries({ queryKey: ['books'] });
};

interface LoanValues {
  equipmentId?: string;
  lenderName?: string;
  vendorId?: string | null;
  loanNo?: string;
  sanctionDate?: dayjs.Dayjs;
  amount?: number | null;
  ratePct?: number | null;
  tenureMonths?: number | null;
  emi?: number | null;
  firstEmiDate?: dayjs.Dayjs;
  disbursal: LoanDisbursal;
  note?: string;
}

/**
 * Record a loan on a financed machine, or change one: the EMI and its schedule are worked out from the
 * terms as they are typed (the lender's EMI, when given, is used instead). The terms are fixed once an EMI is paid.
 */
export function LoanFormModal({ open, onClose, loan, equipmentId, onSaved }: { open: boolean; onClose: () => void; loan?: EquipmentLoanDetailDto | null; equipmentId?: string; onSaved?: (id: string) => void }) {
  const [form] = Form.useForm<LoanValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const editing = !!loan;
  const fixedTerms = !!loan && loan.emisPaid > 0;
  const watch = Form.useWatch([], form) as LoanValues | undefined;
  // As a string, so a pause in typing settles on one value (a fresh object each render would never settle).
  const termsKey = useDebounced(
    JSON.stringify({
      amount: watch?.amount ?? null,
      ratePct: watch?.ratePct ?? null,
      tenureMonths: watch?.tenureMonths ?? null,
      emi: watch?.emi ?? null,
      firstEmiDate: ymd(watch?.firstEmiDate),
      sanctionDate: ymd(watch?.sanctionDate),
    }),
    300,
  );
  const terms = useMemo(() => JSON.parse(termsKey) as Parameters<typeof useLoanPreview>[0], [termsKey]);
  const { data: preview } = useLoanPreview(terms, open && !fixedTerms);
  const disbursal = watch?.disbursal ?? 'MACHINE_COST';

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (loan)
      form.setFieldsValue({
        equipmentId: loan.equipmentId,
        lenderName: loan.lenderName,
        vendorId: loan.vendorId,
        loanNo: loan.loanNo,
        sanctionDate: dayjs(loan.sanctionDate),
        amount: toNumber(loan.amount),
        ratePct: toNumber(loan.ratePct),
        tenureMonths: loan.tenureMonths,
        emi: toNumber(loan.emi),
        firstEmiDate: dayjs(loan.firstEmiDate),
        disbursal: loan.disbursal,
        note: loan.note ?? undefined,
      });
    else form.setFieldsValue({ equipmentId, disbursal: 'MACHINE_COST' });
  }, [open, loan, equipmentId, form]);

  // The saved loan, handed to `onSaved` once the form has closed (e.g. to open it).
  const saved = useRef<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (v: LoanValues) => {
      const head = { lenderName: v.lenderName, vendorId: v.vendorId ?? null, loanNo: v.loanNo, note: v.note?.trim() || null };
      const body = fixedTerms
        ? head
        : {
            ...head,
            equipmentId: v.equipmentId,
            sanctionDate: ymd(v.sanctionDate),
            amount: v.amount,
            ratePct: v.ratePct,
            tenureMonths: v.tenureMonths,
            emi: v.emi ?? null,
            firstEmiDate: ymd(v.firstEmiDate),
            disbursal: v.disbursal,
          };
      return loan ? (await api.patch<EquipmentLoanDetailDto>(`/machine-loans/${loan.id}`, body)).data : (await api.post<EquipmentLoanDetailDto>('/machine-loans', body)).data;
    },
    onSuccess: (l) => {
      notify.saved(`Loan ${l.loanNo} ${editing ? 'saved' : 'recorded'}: ${l.tenureMonths} EMIs of ${formatINR(l.emi, true)}`, `/machine-loans/${l.id}`);
      invalidate(qc);
      saved.current = l.id;
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={() => {
        onClose();
        const id = saved.current;
        saved.current = null;
        if (id && onSaved) afterFormLeaves(() => onSaved(id));
      }}
      form={form}
      layout="drawer"
      title={loan ? `Edit loan · ${loan.loanNo}` : 'Record machine loan'}
      okText={loan ? 'Save' : 'Record loan'}
      projectDefault={false}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing ? undefined : 'machine-loan'}
    >
      <Form form={form} layout="vertical">
        {fixedTerms ? <Alert type="info" showIcon style={{ marginBottom: 16 }} title="EMIs are paid on this loan, so its terms stay as they are. Who it was paid out to, the account number and the note can change." /> : null}
        <FormSection title="Loan">
          <Form.Item name="equipmentId" label="Machine" rules={[{ required: true, message: 'Choose the machine the loan is on' }]} extra="Owned machines only.">
            <EquipmentSelect aria-label="Machine" params={{ ownership: 'OWNED' }} disabled={fixedTerms} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="lenderName" label="Lender" rules={[{ required: true, whitespace: true, message: 'Enter the bank or finance company, e.g. HDFC Bank' }]}>
              <Input maxLength={120} placeholder="HDFC Bank, Tata Capital, SREI…" />
            </Form.Item>
            <Form.Item name="loanNo" label="Loan account no." rules={[{ required: true, whitespace: true, message: "Enter the lender's loan account number" }]}>
              <Input maxLength={60} placeholder="CEL-55102938" translate="no" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="vendorId" label="Lender in the vendor master" extra="Optional: link it when the lender is a vendor too.">
            <VendorSelect aria-label="Lender in the vendor master" allowClear />
          </Form.Item>
        </FormSection>
        <FormSection title="Terms">
          <FormGrid cols={3}>
            <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter the amount of the loan' }]}>
              <MoneyInput disabled={fixedTerms} />
            </Form.Item>
            <Form.Item name="ratePct" label="Rate a year" rules={[{ required: true, message: 'Enter the yearly rate, e.g. 9.25' }]}>
              <QuantityInput unit="%" precision={2} max={LOAN_MAX_RATE} disabled={fixedTerms} />
            </Form.Item>
            <Form.Item name="tenureMonths" label="Tenure" rules={[{ required: true, message: `Enter the months, 1 to ${LOAN_MAX_MONTHS}` }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={LOAN_MAX_MONTHS} precision={0} inputMode="numeric" suffix="months" disabled={fixedTerms} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={3}>
            <Form.Item name="sanctionDate" label="Sanctioned on" rules={[{ required: true, message: 'Choose the sanction date' }]}>
              <DatePicker style={{ width: '100%' }} disabled={fixedTerms} />
            </Form.Item>
            <Form.Item name="firstEmiDate" label="First EMI on" rules={[{ required: true, message: 'Choose the date of the first EMI' }]}>
              <DatePicker style={{ width: '100%' }} disabled={fixedTerms} />
            </Form.Item>
            <Form.Item name="emi" label="EMI" extra={fixedTerms ? undefined : preview && !watch?.emi ? `Works out to ${formatINR(preview.emi, true)}` : "Leave blank to work it out, or enter the lender's"}>
              <MoneyInput disabled={fixedTerms} placeholder={preview ? String(toNumber(preview.emi)) : undefined} />
            </Form.Item>
          </FormGrid>
          {!fixedTerms && preview ? (
            preview.problem ? (
              <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={preview.problem} />
            ) : (
              <Typography.Paragraph type="secondary">
                {preview.rows.length} EMIs from {formatDate(preview.rows[0]?.dueDate)} to {formatDate(preview.rows[preview.rows.length - 1]?.dueDate)}, interest {formatINR(preview.totalInterest, true)} in all.
              </Typography.Paragraph>
            )
          ) : null}
          <Form.Item name="disbursal" label="Paid out to" extra={LOAN_DISBURSAL_HELP[disbursal]}>
            <Radio.Group disabled={fixedTerms} options={LOAN_DISBURSALS.map((d) => ({ value: d, label: LOAN_DISBURSAL_LABELS[d] }))} />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea rows={2} maxLength={500} placeholder="Hypothecated to the lender; NACH on the 5th from the current account" />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}

interface PayValues {
  paidOn: dayjs.Dayjs;
  mode: PaymentMode;
  reference?: string;
  interest?: number | null;
}

/**
 * Record the next EMI paid, or (`close`) close the loan early: the next EMI then repays all that is owed with the
 * interest the lender charges.
 */
export function PayEmiModal({ loan, close, onClose }: { loan: EquipmentLoanDetailDto | null; close?: boolean; onClose: () => void }) {
  const [form] = Form.useForm<PayValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const next = loan?.emis.find((e) => !e.paidOn) ?? null;
  useEffect(() => {
    if (!loan) return;
    form.resetFields();
    const due = next ? dayjs(next.dueDate) : dayjs();
    form.setFieldsValue({ paidOn: due.isAfter(dayjs(), 'day') ? dayjs() : due, mode: 'BANK', interest: close && next ? toNumber(next.interest) : null });
  }, [loan, next, close, form]);
  const interest = Form.useWatch('interest', form) as number | null | undefined;
  const mutation = useMutation({
    mutationFn: async (v: PayValues) => {
      const body = { no: next?.no, paidOn: v.paidOn.format('YYYY-MM-DD'), mode: v.mode, reference: v.reference?.trim() || null, ...(close ? { interest: v.interest ?? null } : {}) };
      return (await api.post<EquipmentLoanDetailDto>(`/machine-loans/${loan!.id}/${close ? 'foreclose' : 'pay'}`, body)).data;
    },
    onSuccess: (l) => {
      notify.saved(close ? `Loan ${l.loanNo} closed` : `EMI ${next?.no} of loan ${l.loanNo} recorded paid${l.status === 'CLOSED' ? '; the loan is repaid' : ''}`);
      invalidate(qc);
    },
    meta: FAIL_NOTICE,
  });
  const owed = next ? toNumber(next.opening) : 0;
  return (
    <FormShell
      open={!!loan}
      onClose={onClose}
      form={form}
      layout="modal"
      title={loan && next ? (close ? `Close early · ${loan.loanNo}` : `Pay EMI ${next.no} · ${loan.loanNo}`) : 'Pay EMI'}
      okText={close ? 'Close the loan' : 'Record payment'}
      projectDefault={false}
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      {loan && next ? (
        <p className="text-muted" style={{ marginTop: 0 }}>
          {close ? (
            <>
              Repays the {formatINR(owed, true)} still owed to <span translate="no">{loan.lenderName}</span>
              {interest ? ` with ${formatINR(interest, true)} interest: ${formatINR(owed + interest, true)} in all` : ''}. The later EMIs go.
            </>
          ) : (
            <>
              {formatINR(next.emi, true)} due {formatDate(next.dueDate)}: principal {formatINR(next.principal, true)}, interest {formatINR(next.interest, true)}.
            </>
          )}
        </p>
      ) : null}
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="paidOn" label="Paid on" rules={[{ required: true, message: 'Choose the day it was paid' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="mode" label="Paid by">
            <Select options={RECEIPT_MODES.map((m) => ({ value: m, label: RECEIPT_MODE_LABELS[m] }))} />
          </Form.Item>
        </FormGrid>
        {close ? (
          <FormGrid cols={2}>
            <Form.Item name="reference" label="Reference">
              <Input placeholder="NACH, UTR or cheque no." maxLength={100} />
            </Form.Item>
            <Form.Item name="interest" label="Interest charged" extra="The lender's figure, with any closing charge">
              <MoneyInput />
            </Form.Item>
          </FormGrid>
        ) : (
          <Form.Item name="reference" label="Reference">
            <Input placeholder="NACH, UTR or cheque no." maxLength={100} />
          </Form.Item>
        )}
      </Form>
    </FormShell>
  );
}
