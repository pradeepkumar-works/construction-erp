'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Descriptions, Form, Input, Result, Skeleton } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { MIN_PASSWORD_LENGTH, type LoginResponse, type PasswordTokenInfoDto } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthCard } from '@/components/auth/AuthCard';
import { formatDateTime } from '@/lib/format';

/** Landing page of an invite or reset link: choose a password, then go straight in. */
export default function SetPasswordPage() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const info = useQuery({
    queryKey: ['password-token', token],
    queryFn: async () => (await api.get<PasswordTokenInfoDto>(`/auth/password-token/${encodeURIComponent(token)}`)).data,
    enabled: !!token,
    retry: false,
  });

  const onFinish = async ({ password }: { password: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/set-password', { token, password });
      signIn(data);
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const invite = info.data?.purpose === 'INVITE';
  return (
    <AuthCard title={invite ? 'Set up your account' : 'Choose a new password'} subtitle={invite ? 'Welcome! Choose a password to finish setting up your account.' : 'Pick a new password, then you are signed in.'}>
      {!token || info.error ? (
        <Result
          status="warning"
          title="This link cannot be used"
          subTitle={token ? errorMessage(info.error) : 'The link is incomplete. Open it again from your email.'}
          extra={
            <>
              <Link href="/forgot-password">Get a new reset link</Link> · <Link href="/login">Sign in</Link>
            </>
          }
        />
      ) : info.isLoading ? (
        <Skeleton active />
      ) : info.data ? (
        <>
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Company">{info.data.organizationName}</Descriptions.Item>
            <Descriptions.Item label="Name">{info.data.fullName}</Descriptions.Item>
            <Descriptions.Item label="Email">{info.data.email}</Descriptions.Item>
            <Descriptions.Item label="Link valid until">{formatDateTime(info.data.expiresAt)}</Descriptions.Item>
          </Descriptions>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <input type="email" name="username" autoComplete="username" value={info.data.email} readOnly hidden />
            <Form.Item name="password" label="New password" rules={[{ required: true, min: MIN_PASSWORD_LENGTH, message: `At least ${MIN_PASSWORD_LENGTH} characters` }]}>
              <Input.Password autoComplete="new-password" size="large" />
            </Form.Item>
            <Form.Item
              name="confirm"
              label="Confirm password"
              dependencies={['password']}
              rules={[{ required: true, message: 'Type the password again' }, ({ getFieldValue }) => ({ validator: (_, v) => (!v || v === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('The passwords do not match'))) })]}
            >
              <Input.Password autoComplete="new-password" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
              {invite ? 'Set password and sign in' : 'Save new password and sign in'}
            </Button>
          </Form>
        </>
      ) : null}
    </AuthCard>
  );
}
