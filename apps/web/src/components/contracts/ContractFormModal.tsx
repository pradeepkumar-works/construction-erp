'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContractPercentField, LdPeriod, ProjectContractDto } from '@erp/shared';
import { CONTRACT_PERCENT_FIELDS, CONTRACT_PERCENT_LABELS, LD_PERIODS, LD_PERIOD_LABELS, MAX_GST_RATE } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useClients } from '@/lib/queries';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

type FormValues = {
  clientId?: string | null;
  workOrderNo?: string;
  agreementNo?: string;
  agreementDate?: dayjs.Dayjs | null;
  contractValue?: number | null;
  dates?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  mobilisationAdvance?: number | null;
  defectLiabilityMonths?: number | null;
  clientPaymentDays?: number | null;
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
  const { data: clients } = useClients(open);
  const [newClient, setNewClient] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      clientId: contract.client?.id ?? null,
      workOrderNo: contract.workOrderNo ?? undefined,
      agreementNo: contract.agreementNo ?? undefined,
      agreementDate: contract.agreementDate ? dayjs(contract.agreementDate) : null,
      contractValue: contract.contractValue ? Number(contract.contractValue) : null,
      dates: [contract.startDate ? dayjs(contract.startDate) : null, contract.endDate ? dayjs(contract.endDate) : null],
      mobilisationAdvance: Number(contract.mobilisationAdvance),
      defectLiabilityMonths: contract.defectLiabilityMonths,
      clientPaymentDays: contract.clientPaymentDays,
      priceVariation: contract.priceVariation,
      ldRatePct: Number(contract.ldRatePct),
      ldPeriod: contract.ldPeriod,
      ldCapPct: Number(contract.ldCapPct),
      ...Object.fromEntries(CONTRACT_PERCENT_FIELDS.map((k) => [k, Number(contract[k])])),
    });
  }, [open, contract, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        clientId: v.clientId ?? null,
        workOrderNo: v.workOrderNo?.trim() || null,
        agreementNo: v.agreementNo?.trim() || null,
        agreementDate: v.agreementDate ? v.agreementDate.format('YYYY-MM-DD') : null,
        contractValue: v.contractValue === null || v.contractValue === undefined ? null : String(v.contractValue),
        startDate: v.dates?.[0] ? v.dates[0].format('YYYY-MM-DD') : null,
        endDate: v.dates?.[1] ? v.dates[1].format('YYYY-MM-DD') : null,
        mobilisationAdvance: String(v.mobilisationAdvance ?? 0),
        defectLiabilityMonths: v.defectLiabilityMonths ?? null,
        clientPaymentDays: v.clientPaymentDays ?? null,
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
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <>
      <FormShell open={open} onClose={onClose} form={form} layout="drawer" title={`Contract: ${contract.projectCode}`} okText="Save contract" onSubmit={(v) => save.mutateAsync(v)}>
        <Form form={form} layout="vertical">
          <FormSection title="Client and agreement">
            <Form.Item label="Client" required={false} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Form.Item name="clientId" noStyle>
                  <Select
                    allowClear
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder={contract.clientName ? `${contract.clientName} (not in the client master)` : 'Select a client'}
                    style={{ flex: 1 }}
                    options={(clients ?? []).map((c) => ({ value: c.id, label: c.department ? `${c.name} · ${c.department}` : c.name }))}
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
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
            </FormGrid>
            <FormGrid cols={2}>
              <Form.Item name="contractValue" label="Contract value">
                <MoneyInput />
              </Form.Item>
              <Form.Item name="dates" label="Start / completion date (as agreed)" extra="Extensions of time come from the delay register.">
                <DatePicker.RangePicker style={{ width: '100%' }} format="DD MMM YYYY" allowEmpty={[true, true]} />
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
                <MoneyInput />
              </Form.Item>
              <Form.Item name="defectLiabilityMonths" label="Defect liability (months)">
                <InputNumber<number> style={{ width: '100%' }} min={0} max={120} precision={0} inputMode="numeric" />
              </Form.Item>
              <Form.Item name="clientPaymentDays" label="Client pays within (days)" tooltip="Days the client takes to pay a bill once it is sent. The cash-flow forecast assumes 30 when left empty.">
                <InputNumber<number> style={{ width: '100%' }} min={0} max={365} precision={0} inputMode="numeric" placeholder="30" />
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
