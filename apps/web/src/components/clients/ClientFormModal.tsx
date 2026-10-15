'use client';

import React, { useEffect } from 'react';
import { App, Checkbox, Form, Input, Modal, Select } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClientDto } from '@erp/shared';
import { GST_STATES, GSTIN_PATTERN, PAN_PATTERN, gstStateCode } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';

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
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal open={open} title={client ? `Edit ${client.name}` : 'New client'} okText={client ? 'Save changes' : 'Add client'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 8 }}>
        <Form.Item name="name" label="Client name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Odisha Works Department" />
        </Form.Item>
        <Form.Item name="department" label="Department / division" extra="The office that issues the work orders and certifies bills.">
          <Input placeholder="Roads Division, Khordha" />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="gstin" label="GSTIN" rules={[{ pattern: GSTIN_PATTERN, transform: (v?: string) => v?.trim().toUpperCase(), message: '15 characters, like 21AAAGO1234F1Z5' }]}>
            <Input placeholder="21AAAGO1234F1Z5" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="pan" label="PAN" extra={gstin ? 'Taken from the GSTIN if left empty' : undefined} rules={[{ pattern: PAN_PATTERN, transform: (v?: string) => v?.trim().toUpperCase(), message: '10 characters, like AAAGO1234F' }]}>
            <Input placeholder="AAAGO1234F" style={{ textTransform: 'uppercase' }} />
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
        </div>
        <Form.Item name="billingAddress" label="Billing address">
          <Input.TextArea rows={2} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="contactPerson" label="Contact person">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Not an email address' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
        </div>
        {client ? (
          <Form.Item name="isActive" valuePropName="checked" style={{ marginBottom: 0 }} extra="Inactive clients are hidden when picking a client for a project.">
            <Checkbox>Active</Checkbox>
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
