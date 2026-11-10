'use client';

import React, { useEffect, useMemo } from 'react';
import { Checkbox, Form, Input, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TDS_RETURN_FORM_LABELS,
  TDS_SECTIONS,
  challanInterest,
  challanSectionProblem,
  isTdsSection,
  type TdsCertificateDto,
  type TdsChallanDetailDto,
  type TdsDeductionDto,
  type TdsQuarterDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { formatDate, formatINR, toNumber, todayDate } from '@/lib/format';
import { VendorSelect } from '@/components/common/SearchSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, MoneyInput } from '@/components/form/inputs';
import { invalidateTds, sectionOptions } from './tdsUi';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : '');
const sumOf = (xs: { tdsAmount: string }[]) => xs.reduce((n, d) => n + toNumber(d.tdsAmount), 0);

interface ChallanValues {
  depositedOn?: dayjs.Dayjs;
  bsrCode?: string;
  challanSerial?: string;
  deductionIds: string[];
  interest?: number | null;
  fee?: number | null;
  inBooks?: boolean;
}

/**
 * Record a challan (ITNS 281) as the bank stamped it: its BSR code, date and serial, and the deductions of the quarter it
 * paid. Its tax is their sum, never typed; the interest under 201(1A) is worked out from the dates unless typed.
 */
export function RecordChallanModal({ open, onClose, quarter, chosen }: { open: boolean; onClose: () => void; quarter: TdsQuarterDto; chosen?: string[] }) {
  const [form] = Form.useForm<ChallanValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const waiting = useMemo(() => quarter.deductions.filter((d) => d.state === 'NOT_DEPOSITED'), [quarter]);
  const ids = Form.useWatch('deductionIds', form) as string[] | undefined;
  const on = Form.useWatch('depositedOn', form) as dayjs.Dayjs | undefined;
  const picked = waiting.filter((d) => ids?.includes(d.id));
  const tax = sumOf(picked);
  const later = on ? picked.find((d) => d.paidOn > ymd(on)) : undefined;
  const interest = on && picked.length ? challanInterest(ymd(on), picked) : null;
  const mixed = challanSectionProblem(quarter.form, picked.map((d) => d.section));
  useEffect(() => {
    // A 26Q challan is deposited under one section: unless rows were chosen, those of the first section waiting.
    const first = waiting[0]?.section;
    if (open) form.setFieldsValue({ depositedOn: dayjs(), bsrCode: undefined, challanSerial: undefined, deductionIds: chosen?.length ? chosen : waiting.filter((d) => d.section === first).map((d) => d.id), interest: null, fee: null, inBooks: false });
  }, [open, chosen, waiting, form]);
  const mutation = useMutation({
    mutationFn: async (v: ChallanValues) =>
      (
        await api.post<TdsChallanDetailDto>('/tds/challans', {
          form: quarter.form,
          bsrCode: v.bsrCode?.trim(),
          challanSerial: v.challanSerial?.trim(),
          depositedOn: ymd(v.depositedOn),
          deductionIds: v.deductionIds,
          interest: v.interest === null || v.interest === undefined ? null : v.interest.toFixed(2),
          fee: v.fee ? v.fee.toFixed(2) : null,
          inBooks: !!v.inBooks,
        })
      ).data,
    onSuccess: (c) => {
      notify.saved(`Challan ${c.label} recorded: TDS ${formatINR(c.tax)} for ${c.deductions} ${c.deductions === 1 ? 'deduction' : 'deductions'}`);
      invalidateTds(qc);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" title={`Record challan · ${TDS_RETURN_FORM_LABELS[quarter.form]} ${quarter.quarter.label}`} okText="Record challan" projectDefault={false} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormGrid cols={3}>
          <Form.Item name="depositedOn" label="Deposited on" rules={[{ required: true, message: 'Choose the day the bank took the tax' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="bsrCode" label="BSR code" tooltip="The bank branch's 7 digits, printed on the challan counterfoil" rules={[{ required: true, pattern: /^\d{7}$/, message: 'Enter the 7 digit BSR code from the challan' }]}>
            <Input {...CODE_INPUT} inputMode="numeric" maxLength={7} />
          </Form.Item>
          <Form.Item name="challanSerial" label="Challan serial no." rules={[{ required: true, pattern: /^\d{1,5}$/, message: 'Enter the challan serial number, up to 5 digits' }]}>
            <Input {...CODE_INPUT} inputMode="numeric" maxLength={5} />
          </Form.Item>
        </FormGrid>
        <Form.Item
          name="deductionIds"
          label="Deductions it paid"
          tooltip={quarter.form === 'FORM_26Q' ? 'A 26Q challan pays one section: the deductions of the first section not yet in a challan are chosen; take off the ones this challan did not pay' : 'Every deduction of the quarter not yet in a challan is chosen; take off the ones this challan did not pay'}
          rules={[{ required: true, type: 'array', min: 1, message: 'Choose the deductions this challan paid' }]}
        >
          <Select
            mode="multiple"
            showSearch={{ optionFilterProp: 'label' }}
            maxTagCount="responsive"
            options={waiting.map((d) => ({ value: d.id, label: `${d.deducteeName} · ${d.sectionName} · ${formatDate(d.paidOn)} · ${formatINR(d.tdsAmount)}` }))}
            notFoundContent="Every deduction of the quarter is in a challan"
          />
        </Form.Item>
        <Typography.Paragraph>
          Tax in the challan: <strong translate="no">{formatINR(tax, true)}</strong> for {picked.length} {picked.length === 1 ? 'deduction' : 'deductions'}.
        </Typography.Paragraph>
        {mixed && <Typography.Paragraph type="danger">{mixed}.</Typography.Paragraph>}
        {later && (
          <Typography.Paragraph type="danger">
            {later.deducteeName}&apos;s deduction of {formatDate(later.paidOn)} is after the deposit date: a challan pays only tax already deducted.
          </Typography.Paragraph>
        )}
        <FormGrid cols={2}>
          <Form.Item
            name="interest"
            label="Interest 201(1A)"
            tooltip="1.5% a month or part of a month from the month of deduction, on tax deposited after the 7th of the next month (30 April for March). Left blank, worked out from the dates"
            extra={interest && toNumber(interest.interest) > 0 ? `${formatINR(interest.interest, true)} by the dates, ${interest.months} ${interest.months === 1 ? 'month' : 'months'} at most` : 'None by the dates'}
          >
            <MoneyInput placeholder={interest ? interest.interest : undefined} />
          </Form.Item>
          <Form.Item name="fee" label="Late fee 234E" tooltip="Paid with this challan for a return filed late">
            <MoneyInput />
          </Form.Item>
        </FormGrid>
        <Form.Item
          name="inBooks"
          label="Accounts"
          valuePropName="checked"
          tooltip="For a challan deposited and entered in your accounts or Tally by hand before Nirmaan kept TDS: it goes on the return but posts no voucher, so the payment is not booked twice"
        >
          <Checkbox>Already in the books, booked by hand</Checkbox>
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface FileValues {
  filedOn?: dayjs.Dayjs;
  receiptNo?: string;
}

/** Mark the quarter filed with the 15 digit provisional receipt the utility's upload gave. Locks the quarter. */
export function FileReturnModal({ open, onClose, quarter }: { open: boolean; onClose: () => void; quarter: TdsQuarterDto }) {
  const [form] = Form.useForm<FileValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.setFieldsValue({ filedOn: dayjs(), receiptNo: undefined });
  }, [open, form]);
  const mutation = useMutation({
    mutationFn: async (v: FileValues) => (await api.post<TdsQuarterDto>('/tds/returns', { form: quarter.form, periodFrom: quarter.quarter.from, filedOn: ymd(v.filedOn), receiptNo: v.receiptNo?.trim() })).data,
    onSuccess: (q) => {
      notify.saved(`${TDS_RETURN_FORM_LABELS[q.form]} for ${q.quarter.label} marked filed${q.corrections ? ' again' : ''}`);
      invalidateTds(qc);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`Mark filed · ${TDS_RETURN_FORM_LABELS[quarter.form]} ${quarter.quarter.label}`} okText="Mark filed" projectDefault={false} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">
          Once filed, its deductions and challans cannot change until the quarter is reopened for a correction.
          {quarter.state === 'REOPENED' ? ' Filing again counts a correction.' : ''}
        </Typography.Paragraph>
        <FormGrid cols={2}>
          <Form.Item name="filedOn" label="Filed on" rules={[{ required: true, message: 'Choose the day it was filed' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day') || ymd(d) <= quarter.quarter.to} />
          </Form.Item>
          <Form.Item name="receiptNo" label="Provisional receipt no." rules={[{ required: true, pattern: /^\d{15}$/, message: 'Enter the 15 digit provisional receipt number' }]}>
            <Input {...CODE_INPUT} inputMode="numeric" maxLength={15} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

/** Reopen a filed quarter for a correction statement: say what is being corrected. */
export function ReopenReturnModal({ open, onClose, quarter }: { open: boolean; onClose: () => void; quarter: TdsQuarterDto }) {
  const [form] = Form.useForm<{ note?: string }>();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.setFieldsValue({ note: undefined });
  }, [open, form]);
  const mutation = useMutation({
    mutationFn: async (v: { note?: string }) => (await api.post<TdsQuarterDto>('/tds/returns/reopen', { form: quarter.form, periodFrom: quarter.quarter.from, note: v.note?.trim() })).data,
    onSuccess: (q) => {
      notify.saved(`${TDS_RETURN_FORM_LABELS[q.form]} for ${q.quarter.label} reopened for a correction`);
      invalidateTds(qc);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`Reopen for correction · ${TDS_RETURN_FORM_LABELS[quarter.form]} ${quarter.quarter.label}`} okText="Reopen" projectDefault={false} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">Its deductions and challans open for changes; filing it again counts a correction.</Typography.Paragraph>
        <Form.Item name="note" label="What the correction is for" rules={[{ required: true, whitespace: true, message: 'Say what is being corrected' }]}>
          <Input.TextArea rows={2} maxLength={500} placeholder="e.g. PAN corrected for one deductee" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface ConfirmValues {
  section?: string;
  amountPaid?: number | null;
}

/** Confirm the section of a payment's TDS recorded before sections were kept, and the amount it was worked out on. */
export function ConfirmSectionModal({ deduction, onClose }: { deduction: TdsDeductionDto | null; onClose: () => void }) {
  const [form] = Form.useForm<ConfirmValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (deduction) form.setFieldsValue({ section: isTdsSection(deduction.section) ? deduction.section : undefined, amountPaid: toNumber(deduction.amountPaid) });
  }, [deduction, form]);
  const mutation = useMutation({
    mutationFn: async (v: ConfirmValues) => (await api.patch<TdsDeductionDto>(`/tds/deductions/${deduction!.id}`, { section: v.section, amountPaid: v.amountPaid ? v.amountPaid.toFixed(2) : null })).data,
    onSuccess: (d) => {
      notify.saved(`${d.deducteeName}: ${d.sectionName} at ${d.rate ?? ''}%`);
      invalidateTds(qc);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!deduction} onClose={onClose} form={form} layout="modal" title={deduction ? `TDS section · ${deduction.deducteeName}` : 'TDS section'} okText="Save section" projectDefault={false} onSubmit={(v) => mutation.mutateAsync(v)}>
      {deduction && (
        <Form form={form} layout="vertical">
          <Typography.Paragraph type="secondary">
            {formatINR(deduction.tdsAmount, true)} deducted on {formatDate(deduction.paidOn)}, {deduction.sourceLabel}.
          </Typography.Paragraph>
          <FormGrid cols={2}>
            <Form.Item name="section" label="Section" rules={[{ required: true, message: 'Choose the TDS section' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} options={sectionOptions('FORM_26Q')} />
            </Form.Item>
            <Form.Item name="amountPaid" label="TDS worked out on" tooltip="The value paid before GST" rules={[{ required: true, message: 'Enter the amount TDS was worked out on' }]}>
              <MoneyInput />
            </Form.Item>
          </FormGrid>
        </Form>
      )}
    </FormShell>
  );
}

interface CertificateValues {
  vendorId?: string;
  section?: string;
  certificateNo?: string;
  rate?: number | null;
  validFrom?: dayjs.Dayjs;
  validTo?: dayjs.Dayjs;
  limit?: number | null;
}

/** A lower deduction certificate under section 197 the vendor's assessing officer gave: its rate holds up to its amount. */
export function CertificateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<CertificateValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (open) {
      const fy = todayDate() >= `${todayDate().slice(0, 4)}-04-01` ? Number(todayDate().slice(0, 4)) : Number(todayDate().slice(0, 4)) - 1;
      form.setFieldsValue({ vendorId: undefined, section: '194C', certificateNo: undefined, rate: null, validFrom: dayjs(`${fy}-04-01`), validTo: dayjs(`${fy + 1}-03-31`), limit: null });
    }
  }, [open, form]);
  const mutation = useMutation({
    mutationFn: async (v: CertificateValues) =>
      (
        await api.post<TdsCertificateDto[]>('/tds/certificates', {
          vendorId: v.vendorId,
          section: v.section,
          certificateNo: v.certificateNo?.trim(),
          rate: String(v.rate ?? ''),
          validFrom: ymd(v.validFrom),
          validTo: ymd(v.validTo),
          limit: (v.limit ?? 0).toFixed(2),
        })
      ).data,
    onSuccess: (_, v) => {
      notify.saved(`Certificate ${v.certificateNo?.trim()} recorded for ${isTdsSection(v.section) ? TDS_SECTIONS[v.section].name : ''}`);
      invalidateTds(qc);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={640} title="Record lower deduction certificate" okText="Record certificate" projectDefault={false} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="vendorId" label="Vendor" rules={[{ required: true, message: 'Choose the vendor' }]}>
            <VendorSelect aria-label="Vendor" />
          </Form.Item>
          <Form.Item name="section" label="Section" rules={[{ required: true, message: 'Choose the TDS section' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={sectionOptions('FORM_26Q')} />
          </Form.Item>
          <Form.Item name="certificateNo" label="Certificate no." rules={[{ required: true, whitespace: true, message: 'Enter the certificate number' }]}>
            <Input {...CODE_INPUT} maxLength={40} />
          </Form.Item>
          <Form.Item name="rate" label="Rate" rules={[{ required: true, message: 'Enter the rate in percent, like 0.75' }]}>
            <MoneyInput prefix={null} suffix="%" precision={3} max={100} />
          </Form.Item>
          <Form.Item name="validFrom" label="Valid from" rules={[{ required: true, message: 'Choose the day it starts' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="validTo" label="Valid to" rules={[{ required: true, message: 'Choose the day it ends' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="limit" label="Amount it covers" rules={[{ required: true, message: 'Enter the amount the certificate covers' }]}>
            <MoneyInput />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}
