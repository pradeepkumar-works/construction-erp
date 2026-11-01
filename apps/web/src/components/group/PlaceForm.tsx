'use client';

import React, { useEffect } from 'react';
import { App, Form, Select } from 'antd';
import { ROLE_KEYS, ROLE_LABELS, isGroupPlaceRole, type GroupCompanyDto, type GroupPersonDto, type RoleKey } from '@erp/shared';
import { FormShell } from '@/components/form/FormShell';
import { useAuth } from '@/lib/auth';
import { useGivePlace } from '@/lib/queries';

interface Values {
  organizationId: string;
  roleKey: RoleKey;
}

/** Gives someone of the group a place in another of its companies, on the sign-in they already have (no invite). */
export function PlaceForm({ person, companies, onClose }: { person: GroupPersonDto | null; companies: GroupCompanyDto[]; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { user, refresh } = useAuth();
  const give = useGivePlace();
  // A company where they had a place that was switched off can have it back.
  const open = (c: GroupCompanyDto) => !person?.places.some((p) => p.organizationId === c.id && p.isActive);
  const choices = companies.filter(open);

  useEffect(() => {
    if (!person) return;
    form.resetFields();
    if (choices.length === 1) form.setFieldValue('organizationId', choices[0].id);
    // Only on opening for a person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, form]);

  const submit = async (v: Values) => {
    if (!person) return;
    await give.mutateAsync({ loginId: person.loginId, ...v });
    const company = companies.find((c) => c.id === v.organizationId)?.name ?? 'the company';
    // Their own new place shows in the company switcher at once.
    if (user?.email === person.email) await refresh();
    message.success(`${person.fullName} can now work in ${company} as ${ROLE_LABELS[v.roleKey]}`);
  };

  return (
    <FormShell open={!!person} onClose={onClose} form={form} layout="modal" width={480} title={person ? `Add ${person.fullName} to a company` : 'Add to company'} okText="Add to company" projectDefault={false} onSubmit={submit}>
      <Form form={form} layout="vertical">
        <Form.Item name="organizationId" label="Company" rules={[{ required: true, message: 'Choose the company' }]} extra={choices.length ? undefined : 'They already work in every company of the group.'}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={choices.map((c) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        <Form.Item name="roleKey" label="Role there" rules={[{ required: true, message: 'Choose their role in that company' }]} extra="They sign in as they do now and pick the company from the header. Add them to projects there from each project's team.">
          <Select showSearch={{ optionFilterProp: 'label' }} options={ROLE_KEYS.filter(isGroupPlaceRole).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
