'use client';

import React, { useEffect } from 'react';
import { App, Checkbox, Form, Input, InputNumber, Select } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientDto, ClientTermPercent } from '@erp/shared';
import { CLIENT_TERM_PERCENTS, CONTRACT_PERCENT_LABELS, GST_STATES, GSTIN_PATTERN, MAX_GST_RATE, PAN_PATTERN, STANDARD_TERMS, gstStateCode } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, EMAIL_INPUT, PHONE_INPUT, emailRule, phoneRule, upper } from '@/components/form/inputs';

interface FormValues {
  name: string;
  department?: string;
  gstin?: string;
  pan?: string;
  stateCode?: string;
  billingAddress?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  /** The client's usual terms; empty takes the standard */
  retentionPct?: number | null;
  securityDepositPct?: number | null;
  tdsPct?: number | null;
  gstTdsPct?: number | null;
  labourCessPct?: number | null;
  gstRate?: number | null;
  defectLiabilityMonths?: number | null;
  clientPaymentDays?: number | null;
}

const asNumber = (v: string | null) => (v === null ? null : Number(v));

/**
 * Add or edit a client in the client master. `onSaved` gets the saved client (e.g. to pick it in a form); `initialName`
 * starts a new one with a name already read, e.g. off a work order.
 */
export function ClientFormModal({ open, client, initialName, onClose, onSaved }: { open: boolean; client?: ClientDto | null; initialName?: string; onClose: () => void; onSaved?: (c: ClientDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const gstin = Form.useWatch('gstin', form);
  const fromGstin = gstStateCode(gstin && GSTIN_PATTERN.test(gstin.toUpperCase()) ? gstin : null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (!client && initialName) form.setFieldsValue({ name: initialName });
    if (client)
      form.setFieldsValue({
        name: client.name,
        department: client.department ?? undefined,
        gstin: client.gstin ?? undefined,
        pan: client.pan ?? undefined,
        stateCode: client.stateCode ?? undefined,
        billingAddress: client.billingAddress ?? undefined,
        contactPerson: client.contactPerson ?? undefined,
        email: client.email ?? undefined,
        phone: client.phone ?? undefined,
        isActive: client.isActive,
        ...Object.fromEntries(CLIENT_TERM_PERCENTS.map((k) => [k, asNumber(client[k])])),
        defectLiabilityMonths: client.defectLiabilityMonths,
        clientPaymentDays: client.clientPaymentDays,
      });
  }, [open, client, initialName, form]);

  useEffect(() => {
    if (fromGstin) form.setFieldValue('stateCode', fromGstin);
  }, [fromGstin, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        name: v.name.trim(),
        department: v.department?.trim() || null,
        gstin: v.gstin?.trim().toUpperCase() || null,
        pan: v.pan?.trim().toUpperCase() || null,
        stateCode: v.stateCode || null,
        billingAddress: v.billingAddress?.trim() || null,
        contactPerson: v.contactPerson?.trim() || null,
        email: v.email?.trim() || null,
        phone: v.phone?.trim() || null,
        ...(client ? { isActive: v.isActive ?? true } : {}),
        ...Object.fromEntries(CLIENT_TERM_PERCENTS.map((k: ClientTermPercent) => [k, v[k] === null || v[k] === undefined ? null : String(v[k])])),
        defectLiabilityMonths: v.defectLiabilityMonths ?? null,
        clientPaymentDays: v.clientPaymentDays ?? null,
      };
      return client ? (await api.patch<ClientDto>(`/clients/${client.id}`, body)).data : (await api.post<ClientDto>('/clients', body)).data;
    },
    onSuccess: (c) => {
      message.success(client ? 'Client updated' : 'Client added');
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['contract'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onSaved?.(c);
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" title={client ? `Edit ${client.name}` : 'New client'} okText={client ? 'Save changes' : 'Save client'} onSubmit={(v) => save.mutateAsync(v)}>
      {/* Named, so its ids stay its own when it opens over another form (New project's Add client). */}
      <Form form={form} name="client" layout="vertical">
        <FormSection title="Client">
          <Form.Item name="name" label="Client name" rules={[{ required: true, whitespace: true, message: 'Enter the client name' }]}>
            <Input placeholder="Odisha Works Department" />
          </Form.Item>
          <Form.Item name="department" label="Department / division" extra="The office that issues the work orders and certifies bills.">
            <Input placeholder="Roads Division, Khordha" />
          </Form.Item>
          <Form.Item name="billingAddress" label="Billing address">
            <Input.TextArea rows={2} />
          </Form.Item>
        </FormSection>
        <FormSection title="Tax">
          <FormGrid cols={3}>
            <Form.Item name="gstin" label="GSTIN" normalize={upper} rules={[{ pattern: GSTIN_PATTERN, transform: (v?: string) => v?.trim().toUpperCase(), message: '15 characters, like 21AAAGO1234F1Z5' }]}>
              <Input {...CODE_INPUT} placeholder="21AAAGO1234F1Z5" />
            </Form.Item>
            <Form.Item name="pan" label="PAN" normalize={upper} extra={gstin ? 'Taken from the GSTIN if left empty' : undefined} rules={[{ pattern: PAN_PATTERN, transform: (v?: string) => v?.trim().toUpperCase(), message: '10 characters, like AAAGO1234F' }]}>
              <Input {...CODE_INPUT} placeholder="AAAGO1234F" />
            </Form.Item>
            <Form.Item name="stateCode" label="State (GST)">
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                disabled={!!fromGstin}
                placeholder="Select"
                options={Object.entries(GST_STATES).map(([code, name]) => ({ value: code, label: `${code} ${name}` }))}
              />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Contact">
          <FormGrid cols={3}>
            <Form.Item name="contactPerson" label="Contact person">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[emailRule]}>
              <Input {...EMAIL_INPUT} />
            </Form.Item>
            <Form.Item name="phone" label="Phone" rules={[phoneRule]}>
              <Input {...PHONE_INPUT} />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Usual contract terms">
          <p style={{ margin: '0 0 12px' }}>A new project for this client starts with these. Left empty, a term takes the standard figure shown.</p>
          <FormGrid cols={3}>
            {CLIENT_TERM_PERCENTS.map((k) => (
              <Form.Item key={k} name={k} label={`${CONTRACT_PERCENT_LABELS[k]} %`}>
                <InputNumber<number> style={{ width: '100%' }} min={0} max={k === 'gstRate' ? MAX_GST_RATE : 100} placeholder={STANDARD_TERMS[k]} inputMode="decimal" />
              </Form.Item>
            ))}
            <Form.Item name="defectLiabilityMonths" label="Defect liability (months)">
              <InputNumber<number> style={{ width: '100%' }} min={0} max={120} precision={0} placeholder="Not set" inputMode="numeric" />
            </Form.Item>
            <Form.Item name="clientPaymentDays" label="Days to pay a bill">
              <InputNumber<number> style={{ width: '100%' }} min={0} max={365} precision={0} placeholder="30" inputMode="numeric" />
            </Form.Item>
          </FormGrid>
        </FormSection>
        {client ? (
          <Form.Item name="isActive" valuePropName="checked" style={{ marginBottom: 0 }} extra="Inactive clients are hidden when picking a client for a project.">
            <Checkbox>Active</Checkbox>
          </Form.Item>
        ) : null}
      </Form>
    </FormShell>
  );
}
