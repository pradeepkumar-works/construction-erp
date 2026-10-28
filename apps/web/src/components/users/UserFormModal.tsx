'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Form, Input, Radio, Select, Switch } from 'antd';
import { MIN_PASSWORD_LENGTH, ROLE_LABELS, isCompanyWide, type CreateUserResultDto, type RoleKey, type UserSummary } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FAIL_NOTICE } from '@/lib/notify';
import { useRoles } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { ProjectMultiSelect } from '@/components/common/ProjectSelect';
import { EMAIL_INPUT, PHONE_INPUT, emailRule, phoneRule } from '@/components/form/inputs';

interface FormValues {
  email: string;
  fullName: string;
  phone?: string;
  roleKey: RoleKey;
  password?: string;
  isActive?: boolean;
  how?: 'invite' | 'password';
  /** The project teams they join as they are created (finding 17 of the October review) */
  projectIds?: string[];
}

export function UserFormModal({ open, onClose, user, onInvited }: { open: boolean; onClose: () => void; user?: UserSummary | null; onInvited?: (created: CreateUserResultDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: roles } = useRoles();
  const isEdit = !!user;
  const [resetPwd, setResetPwd] = useState(false);
  const how = Form.useWatch('how', form);
  const roleKey = Form.useWatch('roleKey', form);
  // A company-wide role sees every project, so there is nothing to pick; the rest see only the projects they are on.
  const inGroup = !!useAuth().user?.group;
  const perProject = !!roleKey && roleKey !== 'SUPPLIER' && !isCompanyWide(roleKey);

  useEffect(() => {
    if (!open) return;
    setResetPwd(false);
    if (user) {
      form.setFieldsValue({ email: user.email, fullName: user.fullName, phone: user.phone ?? undefined, roleKey: user.roleKey, isActive: user.isActive, password: undefined });
    } else {
      form.resetFields();
      form.setFieldsValue({ roleKey: 'SITE_ENGINEER', isActive: true, how: 'invite' });
    }
  }, [open, user, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      if (isEdit && user) {
        const body: Record<string, unknown> = { email: v.email.trim(), fullName: v.fullName.trim(), phone: v.phone || undefined, roleKey: v.roleKey, isActive: v.isActive };
        if (resetPwd && v.password) body.password = v.password;
        return (await api.patch(`/users/${user.id}`, body)).data;
      }
      return (
        await api.post<CreateUserResultDto>('/users', {
          email: v.email.trim(),
          fullName: v.fullName.trim(),
          phone: v.phone || undefined,
          roleKey: v.roleKey,
          password: v.how === 'password' ? v.password : undefined,
          // The teams they join as they are made (finding 17 of the October review).
          projectIds: perProject && v.projectIds?.length ? v.projectIds : undefined,
        })
      ).data;
    },
    onSuccess: (data, v) => {
      const created = data as CreateUserResultDto;
      const teams = !isEdit && perProject && v.projectIds?.length ? `, on ${v.projectIds.length} project${v.projectIds.length === 1 ? '' : 's'}` : '';
      // Someone who already signs in to a sister company keeps that sign-in: no invite, their own password.
      const sister = !isEdit && created.alsoIn?.length ? `; they sign in as they do for ${created.alsoIn.join(', ')}` : '';
      message.success(isEdit ? 'User updated' : sister ? `User added${teams}${sister}` : created.invite ? `User invited${teams}` : `User created${teams}`);
      if (!isEdit && created.invite) onInvited?.(created);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={520} title={isEdit ? `Edit ${user?.fullName}` : 'New user'} okText={isEdit ? 'Save' : how === 'password' ? 'Create user' : 'Invite user'} onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="fullName" label="Full name" rules={[{ required: true, whitespace: true, message: 'Enter their full name' }]}>
          <Input />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="email" label="Email" rules={[{ required: true, whitespace: true, message: 'Enter their email address' }, emailRule]}>
            {/* Someone else's address: the browser should not fill in the admin's own. */}
            <Input {...EMAIL_INPUT} autoComplete="off" />
          </Form.Item>
          <Form.Item name="phone" label="Phone" rules={[phoneRule]}>
            <Input {...PHONE_INPUT} autoComplete="off" />
          </Form.Item>
        </FormGrid>
        {user?.roleKey === 'SUPPLIER' ? (
          <Form.Item name="roleKey" label="Role" extra="A supplier's login stays one: give or switch off supplier logins from the vendor in Vendors.">
            <Select disabled options={[{ value: 'SUPPLIER', label: ROLE_LABELS.SUPPLIER }]} />
          </Form.Item>
        ) : (
          <Form.Item name="roleKey" label="Role" rules={[{ required: true, message: 'Choose the role' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={(roles ?? []).map((r) => ({ value: r.key, label: r.name }))} />
          </Form.Item>
        )}
        {!isEdit && perProject && (
          <Form.Item name="projectIds" label="Projects" extra="They see only the projects they are on. Add or remove them later from the project's team.">
            <ProjectMultiSelect />
          </Form.Item>
        )}
        {isEdit && (
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
        {!isEdit && (
          <Form.Item name="how" label="How will they sign in?" extra={inGroup ? 'Someone who already signs in to a company of your group keeps that sign-in and password.' : undefined}>
            <Radio.Group
              options={[
                { value: 'invite', label: 'Send an invite link (they choose a password)' },
                { value: 'password', label: 'Set a password now' },
              ]}
            />
          </Form.Item>
        )}
        {isEdit && !resetPwd ? (
          <Button type="link" onClick={() => setResetPwd(true)} style={{ padding: 0 }}>
            Set a new password
          </Button>
        ) : isEdit || how === 'password' ? (
          <Form.Item name="password" label={isEdit ? 'New password' : 'Password'} rules={[{ required: true, message: 'Enter a password' }, { min: MIN_PASSWORD_LENGTH, message: `At least ${MIN_PASSWORD_LENGTH} characters` }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        ) : null}
      </Form>
    </FormShell>
  );
}
