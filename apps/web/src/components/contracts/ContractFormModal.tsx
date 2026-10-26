'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Checkbox, Form, Input, InputNumber, Select } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContractPercentField, LdPeriod, ProjectContractDto } from '@erp/shared';
import { CONTRACT_PERCENT_FIELDS, CONTRACT_PERCENT_LABELS, CURRENCIES, LD_PERIODS, LD_PERIOD_LABELS, MAX_GST_RATE, MEASURE_TOLERANCE_PCT } from '@erp/shared';
import { inContract, moneyPrefix, outOfContract } from '@/lib/format';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useNoticePeriod } from '@/lib/queries';
import { ClientSelect } from '@/components/common/SearchSelect';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

type FormValues = {
  clientId?: string | null;
  workOrderNo?: string;
  agreementNo?: string;
  agreementDate?: dayjs.Dayjs | null;
  contractValue?: number | null;
  currency?: string;
  exchangeRate?: number | null;
  dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  mobilisationAdvance?: number | null;
  defectLiabilityMonths?: number | null;
  clientPaymentDays?: number | null;
  noticeDays?: number | null;
  measureTolerancePct?: number | null;
  priceVariation?: boolean;
  ldRatePct?: number | null;
  ldPeriod?: LdPeriod;
  ldCapPct?: number | null;
} & Partial<Record<ContractPercentField, number | null>>;

const PCT_HELP: Record<ContractPercentField, string> = {
  retentionPct: 'Held from each bill, released after the defect liability period',
  securityDepositPct: 'Deducted from each bill',
  advanceRecoveryPct: 'Of each bill, until the advance is recovered',
  tdsPct: 'Section 194C, usually 1% or 2%',
  gstTdsPct: 'Government clients deduct 2%',
  labourCessPct: 'BOCW cess, usually 1%',
  gstRate: 'Charged on the work value',
};

/** Edit a project's contract terms: client, agreement, value and dates, advance and the bill percentages. */
export function ContractFormModal({ open, contract, onClose }: { open: boolean; contract: ProjectContractDto; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [newClient, setNewClient] = useState(false);
  const found = useNoticePeriod(contract.projectId, open).data?.found ?? null;
  const currency = Form.useWatch('currency', form) ?? 'INR';
  const rate = Form.useWatch('exchangeRate', form);
  // Amounts are typed in the contract currency and kept in rupees at the contract rate (item 130).
  const typed = { currency, exchangeRate: rate ? String(rate) : null };

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      clientId: contract.client?.id ?? null,
      workOrderNo: contract.workOrderNo ?? undefined,
      agreementNo: contract.agreementNo ?? undefined,
      agreementDate: contract.agreementDate ? dayjs(contract.agreementDate) : null,
      contractValue: contract.contractValue ? inContract(Number(contract.contractValue), contract) : null,
      currency: contract.currency,
      exchangeRate: contract.exchangeRate ? Number(contract.exchangeRate) : null,
      dates: [contract.startDate ? dayjs(contract.startDate) : null, contract.endDate ? dayjs(contract.endDate) : null],
      mobilisationAdvance: inContract(Number(contract.mobilisationAdvance), contract),
      defectLiabilityMonths: contract.defectLiabilityMonths,
      clientPaymentDays: contract.clientPaymentDays,
      noticeDays: contract.noticeDays,
      measureTolerancePct: contract.measureTolerancePct,
      priceVariation: contract.priceVariation,
      ldRatePct: Number(contract.ldRatePct),
      ldPeriod: contract.ldPeriod,
      ldCapPct: Number(contract.ldCapPct),
      ...Object.fromEntries(CONTRACT_PERCENT_FIELDS.map((k) => [k, Number(contract[k])])),
    });
  }, [open, contract, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const c = { currency: v.currency ?? 'INR', exchangeRate: v.exchangeRate ? String(v.exchangeRate) : null };
      const body = {
        clientId: v.clientId ?? null,
        workOrderNo: v.workOrderNo?.trim() || null,
        agreementNo: v.agreementNo?.trim() || null,
        agreementDate: v.agreementDate ? v.agreementDate.format('YYYY-MM-DD') : null,
        contractValue: v.contractValue === null || v.contractValue === undefined ? null : String(outOfContract(v.contractValue, c)),
        currency: c.currency,
        exchangeRate: c.currency === 'INR' ? null : c.exchangeRate,
        startDate: v.dates?.[0] ? v.dates[0].format('YYYY-MM-DD') : null,
        endDate: v.dates?.[1] ? v.dates[1].format('YYYY-MM-DD') : null,
        mobilisationAdvance: String(outOfContract(v.mobilisationAdvance ?? 0, c)),
        defectLiabilityMonths: v.defectLiabilityMonths ?? null,
        clientPaymentDays: v.clientPaymentDays ?? null,
        noticeDays: v.noticeDays ?? null,
        measureTolerancePct: v.measureTolerancePct ?? null,
        priceVariation: !!v.priceVariation,
        ldRatePct: String(v.ldRatePct ?? 0),
        ldPeriod: v.ldPeriod ?? 'WEEK',
        ldCapPct: String(v.ldCapPct ?? 0),
        ...Object.fromEntries(CONTRACT_PERCENT_FIELDS.map((k) => [k, String(v[k] ?? 0)])),
      };
      return (await api.put<ProjectContractDto>(`/projects/${contract.projectId}/contract`, body)).data;
    },
    onSuccess: () => {
      message.success('Contract terms saved');
      qc.invalidateQueries({ queryKey: ['contract', contract.projectId] });
      qc.invalidateQueries({ queryKey: ['contract', 'notice-period', contract.projectId] });
      qc.invalidateQueries({ queryKey: ['risks'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <>
      <FormShell open={open} onClose={onClose} form={form} layout="drawer" title={`Contract: ${contract.projectCode}`} okText="Save contract" onSubmit={(v) => save.mutateAsync(v)}>
        <Form form={form} layout="vertical">
          <FormSection title="Client and agreement">
            <Form.Item label="Client" required={false} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Form.Item name="clientId" noStyle>
                  <ClientSelect
                    allowClear
                    placeholder={contract.clientName ? `${contract.clientName} (not in the client master)` : 'Type a client\'s name'}
                    style={{ flex: 1 }}
                    selected={contract.client ? { value: contract.client.id, label: contract.client.department ? `${contract.client.name} · ${contract.client.department}` : contract.client.name } : null}
                  />
                </Form.Item>
                <Button icon={<PlusOutlined />} onClick={() => setNewClient(true)}>
                  New client
                </Button>
              </div>
            </Form.Item>
            <FormGrid cols={3}>
              <Form.Item name="workOrderNo" label="Work order no.">
                <Input />
              </Form.Item>
              <Form.Item name="agreementNo" label="Agreement no.">
                <Input placeholder="04/EE/R&B/2025-26" />
              </Form.Item>
              <Form.Item name="agreementDate" label="Agreement date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </FormGrid>
            <FormGrid cols={2}>
              <Form.Item name="currency" label="Contract currency" extra="Bills, receipts and the break-up show in it; the books stay in rupees">
                <Select showSearch={{ optionFilterProp: 'label' }} options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
              </Form.Item>
              {currency !== 'INR' ? (
                <Form.Item
                  name="exchangeRate"
                  label={`Contract rate (₹ to 1 ${currency})`}
                  extra="The rate the contract is kept at. Receipts record the day's rate; the difference goes to exchange difference."
                  rules={[{ required: true, message: `Enter the rupees to 1 ${currency}, e.g. 83.25` }]}
                >
                  <InputNumber<number> style={{ width: '100%' }} min={0.000001} precision={6} controls={false} inputMode="decimal" />
                </Form.Item>
              ) : null}
            </FormGrid>
            <FormGrid cols={2}>
              <Form.Item name="contractValue" label="Contract value">
                <MoneyInput prefix={moneyPrefix(typed)} />
              </Form.Item>
              <Form.Item name="dates" label="Start / completion date (as agreed)" extra="Extensions of time come from the delay register.">
                <DatePicker.RangePicker style={{ width: '100%' }} allowEmpty={[true, true]} />
              </Form.Item>
            </FormGrid>
          </FormSection>
          <FormSection title="Deductions and GST on each bill (% of the work value)">
            <FormGrid cols={4}>
              {CONTRACT_PERCENT_FIELDS.map((k) => (
                <Form.Item key={k} name={k} label={`${CONTRACT_PERCENT_LABELS[k]} %`} tooltip={PCT_HELP[k]}>
                  <InputNumber<number> style={{ width: '100%' }} min={0} max={k === 'gstRate' ? MAX_GST_RATE : 100} />
                </Form.Item>
              ))}
            </FormGrid>
            <FormGrid cols={3}>
              <Form.Item name="mobilisationAdvance" label="Mobilisation advance" tooltip="Advance received from the client; recovered from bills at the advance recovery %">
                <MoneyInput prefix={moneyPrefix(typed)} />
              </Form.Item>
              <Form.Item name="defectLiabilityMonths" label="Defect liability (months)">
                <InputNumber<number> style={{ width: '100%' }} min={0} max={120} precision={0} inputMode="numeric" />
              </Form.Item>
              <Form.Item name="clientPaymentDays" label="Client pays within (days)" tooltip="Days the client takes to pay a bill once it is sent. The cash-flow forecast assumes 30 when left empty.">
                <InputNumber<number> style={{ width: '100%' }} min={0} max={365} precision={0} inputMode="numeric" placeholder="30" />
              </Form.Item>
            </FormGrid>
            <FormGrid cols={3}>
              <Form.Item
                name="noticeDays"
                label="Hindrance notice within (days)"
                tooltip="Days the contract allows to give the client notice of a hindrance. Each delay the contractor is not answerable for runs a notice clock; 14 is assumed when left empty."
                extra={found ? (
                  <span>
                    {`The filed contract says ${found.days} days (clause ${found.clause} of ${found.docNo}, page ${found.page}). `}
                    <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => form.setFieldValue('noticeDays', found.days)}>
                      Use {found.days} days
                    </Button>
                  </span>
                ) : undefined}
              >
                <InputNumber<number> style={{ width: '100%' }} min={1} max={180} precision={0} inputMode="numeric" placeholder="14" />
              </Form.Item>
              <Form.Item
                name="measureTolerancePct"
                label="Measure past the BOQ by up to (%)"
                tooltip="How far the measured quantity of a BOQ item may run past its BOQ quantity before it needs a variation. A sheet beyond it is refused. 25% is assumed when left empty."
              >
                <InputNumber<number> style={{ width: '100%' }} min={0} max={500} precision={0} inputMode="numeric" placeholder={String(MEASURE_TOLERANCE_PCT)} suffix="%" />
              </Form.Item>
            </FormGrid>
          </FormSection>
          <FormSection title="Liquidated damages for late completion">
            <FormGrid cols={3}>
              <Form.Item name="ldRatePct" label="LD rate (% of contract value)" tooltip="Leave at 0 if the contract has no liquidated damages clause">
                <InputNumber<number> style={{ width: '100%' }} min={0} max={100} step={0.05} />
              </Form.Item>
              <Form.Item name="ldPeriod" label="For each">
                <Select<LdPeriod> options={LD_PERIODS.map((p) => ({ value: p, label: LD_PERIOD_LABELS[p].replace('per ', '') }))} />
              </Form.Item>
              <Form.Item name="ldCapPct" label="LD cap (% of contract value)" tooltip="Usually 10%">
                <InputNumber<number> style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </FormGrid>
            <Form.Item name="priceVariation" label="Price variation" valuePropName="checked">
              <Checkbox>Contract has a price variation clause</Checkbox>
            </Form.Item>
          </FormSection>
        </Form>
      </FormShell>
      <ClientFormModal open={newClient} onClose={() => setNewClient(false)} onSaved={(c) => form.setFieldValue('clientId', c.id)} />
    </>
  );
}
