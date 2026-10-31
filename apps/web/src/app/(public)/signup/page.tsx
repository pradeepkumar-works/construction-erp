'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Form, Input, Skeleton } from 'antd';
import { MIN_PASSWORD_LENGTH, type LoginResponse } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAuthOptions } from '@/lib/queries';
import { AuthCard } from '@/components/auth/AuthCard';
import { BRAND } from '@/lib/brand';

interface Values {
  organizationName: string;
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  confirm: string;
}

/** Create a new organisation and its first admin (only when the server allows sign-up). */
export default function SignupPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { data: options, isLoading } = useAuthOptions();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async ({ confirm: _confirm, ...values }: Values) => {
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/signup', values);
      signIn(data);
      router.replace('/users?welcome=1');
    } catch (err) {
      setError(errorMessage(err, 'Your company was not created. Check the fields and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Create your company" subtitle="You become its admin and can invite your team next." width={440}>
      {isLoading ? <Skeleton active /> : null}
      {options && !options.signup ? (
        <Alert type="info" showIcon title="Sign-up is closed on this server." description={`Ask whoever runs your ${BRAND.name} to create your company, or sign in if you already have an account.`} style={{ marginBottom: 16 }} />
      ) : null}
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      {options?.signup ? (
        <Form<Values> layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="organizationName" label="Company name" rules={[{ required: true, whitespace: true, min: 3, message: 'Enter your company name' }]}>
            <Input placeholder="Sai Ram Constructions Pvt Ltd" size="large" maxLength={120} />
          </Form.Item>
          <Form.Item name="fullName" label="Your name" rules={[{ required: true, whitespace: true, min: 2, message: 'Enter your name' }]}>
            <Input autoComplete="name" size="large" maxLength={80} />
          </Form.Item>
          <Form.Item name="email" label="Work email" rules={[{ required: true, message: 'Enter your email' }, { type: 'email', message: 'Enter an email address, e.g. name@company.com' }]}>
            <Input autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item name="phone" label="Mobile (optional)">
            <Input autoComplete="tel" size="large" maxLength={20} />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: MIN_PASSWORD_LENGTH, message: `At least ${MIN_PASSWORD_LENGTH} characters` }]}>
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
            Create company
          </Button>
        </Form>
      ) : null}
      <p className="auth-alt">
        Already have an account?{' '}
        <Link href="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
