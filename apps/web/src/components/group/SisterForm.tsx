'use client';

import React, { useEffect } from 'react';
import { App, Form, Select } from 'antd';
import type { SisterLinksDto } from '@erp/shared';
import { FormShell } from '@/components/form/FormShell';
import { useSetSister } from '@/lib/queries';

interface Values {
  /** `V:<vendorId>` or `C:<clientId>` */
  party: string;
  sisterId: string;
}

/** Name a vendor or client in this company's books as a sister company of the group. */
export function SisterForm({ open, data, onClose }: { open: boolean; data: SisterLinksDto | undefined; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const set = useSetSister();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const submit = async (v: Values) => {
    const [kind, id] = [v.party.slice(0, 1), v.party.slice(2)];
    await set.mutateAsync(kind === 'V' ? { vendorId: id, sisterId: v.sisterId } : { clientId: id, sisterId: v.sisterId });
    message.success('Sister company named');
  };

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={520} title="Name a sister company" okText="Save" projectDefault={false} onSubmit={submit}>
      <Form form={form} layout="vertical">
        <Form.Item name="party" label="Vendor or client" rules={[{ required: true, message: 'Choose the vendor or client that is a sister company' }]}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            options={[
              { label: 'Vendors', title: 'Vendors', options: (data?.vendors ?? []).map((v) => ({ value: `V:${v.id}`, label: v.name })) },
              { label: 'Clients', title: 'Clients', options: (data?.clients ?? []).map((c) => ({ value: `C:${c.id}`, label: c.name })) },
            ]}
          />
        </Form.Item>
        <Form.Item name="sisterId" label="Sister company" rules={[{ required: true, message: 'Choose the company of the group it is' }]}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={(data?.sisters ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
