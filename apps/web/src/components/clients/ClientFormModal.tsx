'use client';

import React, { useEffect } from 'react';
import { App, Checkbox, Form, Input, Select } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientDto } from '@erp/shared';
import { GST_STATES, GSTIN_PATTERN, PAN_PATTERN, gstStateCode } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
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
}

/** Add or edit a client in the client master. `onSaved` gets the saved client (e.g. to pick it in a form). */
export function ClientFormModal({ open, client, onClose, onSaved }: { open: boolean; client?: ClientDto | null; onClose: () => void; onSaved?: (c: ClientDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const gstin = Form.useWatch('gstin', form);
  const fromGstin = gstStateCode(gstin && GSTIN_PATTERN.test(gstin.toUpperCase()) ? gstin : null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
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
      });
  }, [open, client, form]);

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
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" title={client ? `Edit ${client.name}` : 'New client'} okText={client ? 'Save changes' : 'Add client'} onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
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
        {client ? (
          <Form.Item name="isActive" valuePropName="checked" style={{ marginBottom: 0 }} extra="Inactive clients are hidden when picking a client for a project.">
            <Checkbox>Active</Checkbox>
          </Form.Item>
        ) : null}
      </Form>
    </FormShell>
  );
}
