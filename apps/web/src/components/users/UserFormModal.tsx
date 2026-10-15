'use client';

import React, { useEffect, useState } from 'react';
import { App, Form, Input, Modal, Radio, Select, Switch, Typography } from 'antd';
import { MIN_PASSWORD_LENGTH, type CreateUserResultDto, type RoleKey, type UserSummary } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useRoles } from '@/lib/queries';

interface FormValues {
  email: string;
  fullName: string;
  phone?: string;
  roleKey: RoleKey;
  password?: string;
  isActive?: boolean;
  how?: 'invite' | 'password';
}

export function UserFormModal({ open, onClose, user, onInvited }: { open: boolean; onClose: () => void; user?: UserSummary | null; onInvited?: (created: CreateUserResultDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: roles } = useRoles();
  const isEdit = !!user;
  const [resetPwd, setResetPwd] = useState(false);
  const how = Form.useWatch('how', form);

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
      return (await api.post<CreateUserResultDto>('/users', { email: v.email.trim(), fullName: v.fullName.trim(), phone: v.phone || undefined, roleKey: v.roleKey, password: v.how === 'password' ? v.password : undefined })).data;
    },
    onSuccess: (data) => {
      const created = data as CreateUserResultDto;
      message.success(isEdit ? 'User updated' : created.invite ? 'User invited' : 'User created');
      if (!isEdit && created.invite) onInvited?.(created);
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={isEdit ? `Edit ${user?.fullName}` : 'New user'} okText={isEdit ? 'Save' : how === 'password' ? 'Create user' : 'Invite user'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        <Form.Item name="fullName" label="Full name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Required' }, { type: 'email', message: 'Invalid email' }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
        </div>
        <Form.Item name="roleKey" label="Role" rules={[{ required: true, message: 'Required' }]}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={(roles ?? []).map((r) => ({ value: r.key, label: r.name }))} />
        </Form.Item>
        {isEdit && (
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
        {!isEdit && (
          <Form.Item name="how" label="How will they sign in?">
            <Radio.Group
              options={[
                { value: 'invite', label: 'Send an invite link (they choose a password)' },
                { value: 'password', label: 'Set a password now' },
              ]}
            />
          </Form.Item>
        )}
        {isEdit && !resetPwd ? (
          <Typography.Link onClick={() => setResetPwd(true)}>Set a new password</Typography.Link>
        ) : isEdit || how === 'password' ? (
          <Form.Item name="password" label={isEdit ? 'New password' : 'Password'} rules={[{ required: true, message: 'Required' }, { min: MIN_PASSWORD_LENGTH, message: `At least ${MIN_PASSWORD_LENGTH} characters` }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
