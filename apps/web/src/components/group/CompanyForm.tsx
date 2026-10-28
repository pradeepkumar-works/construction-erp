'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, Select } from 'antd';
import { CIN_PATTERN, COMPANY_KINDS, COMPANY_KIND_INFO, COMPANY_KIND_LABELS, type CompanyKind, type GroupCompanyDto } from '@erp/shared';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, gstinRule, panRule, upper } from '@/components/form/inputs';
import { useAuth } from '@/lib/auth';
import { useAddGroupCompany, useUpdateGroupCompany } from '@/lib/queries';

interface Values {
  name: string;
  kind: CompanyKind;
  legalName?: string;
  pan?: string;
  cin?: string;
  gstin?: string;
}

const cinRule = { pattern: CIN_PATTERN, message: 'A CIN is 21 characters, e.g. U45200OR2015PTC012345' };
const blank = (v?: string) => (v?.trim() ? v.trim() : null);

/** A company of the group: new (its kind sets the modules it starts with) or one to change. */
export function CompanyForm({ open, company, onClose }: { open: boolean; company: GroupCompanyDto | null; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { refresh } = useAuth();
  const add = useAddGroupCompany();
  const update = useUpdateGroupCompany();
  const kind = Form.useWatch('kind', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (company)
      form.setFieldsValue({ name: company.name, kind: company.kind, legalName: company.legalName ?? undefined, pan: company.pan ?? undefined, cin: company.cin ?? undefined, gstin: company.gstin ?? undefined });
    else form.setFieldsValue({ kind: 'CONSULTANCY' });
  }, [open, company, form]);

  const submit = async (v: Values) => {
    const body = { name: v.name.trim(), kind: v.kind, legalName: blank(v.legalName), pan: blank(v.pan), cin: blank(v.cin), gstin: blank(v.gstin) };
    if (company) await update.mutateAsync({ id: company.id, ...body });
    else await add.mutateAsync(body);
    // The company switcher reads the person's companies from their sign-in.
    await refresh();
    message.success(company ? `${body.name} saved` : `${body.name} added. You are its admin; switch to it from the header.`);
  };

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      title={company ? `Edit ${company.name}` : 'New company'}
      okText={company ? 'Save' : 'Add company'}
      draftKey={company ? undefined : 'group-company'}
      projectDefault={false}
      onSubmit={submit}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name people know it by' }, { min: 3, message: 'At least 3 characters' }]}>
          <Input maxLength={120} placeholder="Sai Ram Quality Labs" />
        </Form.Item>
        <Form.Item
          name="kind"
          label="Kind"
          rules={[{ required: true, message: 'Choose what the company does' }]}
          extra={kind ? (company ? `${COMPANY_KIND_INFO[kind].description} Changing it leaves the modules as they are.` : `${COMPANY_KIND_INFO[kind].description} Its admin can turn modules on later.`) : undefined}
        >
          <Select showSearch={{ optionFilterProp: 'label' }} options={COMPANY_KINDS.map((k) => ({ value: k, label: COMPANY_KIND_LABELS[k] }))} />
        </Form.Item>
        <Form.Item name="legalName" label="Legal name" extra="As registered, for its documents and bills">
          <Input maxLength={160} placeholder="Sai Ram Quality Labs Private Limited" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="pan" label="PAN" rules={[panRule]} normalize={upper}>
            <Input {...CODE_INPUT} maxLength={10} placeholder="AABCS1234F" />
          </Form.Item>
          <Form.Item name="gstin" label="GSTIN" rules={[gstinRule]} normalize={upper}>
            <Input {...CODE_INPUT} maxLength={15} placeholder="21AABCS1234F1Z5" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="cin" label="CIN" rules={[cinRule]} normalize={upper} extra="Corporate identity number, for a company registered with the MCA">
          <Input {...CODE_INPUT} maxLength={21} placeholder="U45200OR2015PTC012345" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
