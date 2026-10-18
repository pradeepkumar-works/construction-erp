'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Form, Input } from 'antd';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useAuthOptions } from '@/lib/queries';
import { AuthCard } from '@/components/auth/AuthCard';

const DEMO_PASSWORD = 'password123';
const DEMO_ACCOUNTS: { email: string; role: string }[] = [
  { email: 'admin@demo.com', role: 'Admin' },
  { email: 'md@demo.com', role: 'Management' },
  { email: 'pm@demo.com', role: 'Project Manager' },
  { email: 'engineer@demo.com', role: 'Site Engineer' },
  { email: 'qs@demo.com', role: 'Quantity Surveyor' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [form] = Form.useForm<{ email: string; password: string }>();
  const email = Form.useWatch('email', form);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: options } = useAuthOptions();

  const onFinish = async (values: { email: string; password: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      await login(values.email.trim(), values.password);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
    } catch (err) {
      setError(errorMessage(err, 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Sign in" subtitle="Welcome back. Manage projects, site progress and approvals.">
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 24 }} />}

      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Enter your email' }, { type: 'email', message: 'Enter an email address, e.g. name@company.com' }]}>
          <Input
            type="email"
            inputMode="email"
            placeholder="you@company.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            size="large"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- a page that is this one form: the field the visitor came to fill
            autoFocus
          />
        </Form.Item>
        <div className="auth-field">
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]}>
            <Input.Password placeholder="Your password" autoComplete="current-password" size="large" />
          </Form.Item>
          <Link href="/forgot-password" className="auth-link auth-field-aside">
            Forgot password?
          </Link>
        </div>
        <Button type="primary" htmlType="submit" block size="large" loading={submitting} style={{ marginTop: 8 }}>
          Sign in
        </Button>
      </Form>

      <p className="auth-alt">
        {options?.signup ? (
          <>
            New company?{' '}
            <Link href="/signup" className="auth-link">
              Create an account
            </Link>
          </>
        ) : (
          <>
            New here?{' '}
            <Link href="/welcome" className="auth-link">
              See what Nirmaan does
            </Link>
          </>
        )}
      </p>

      {options?.demoLogin && (
        <>
          <div className="auth-divider">Try a demo account</div>
          <div className="auth-demo" role="group" aria-label="Demo accounts">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                title={a.email}
                aria-pressed={email === a.email}
                onClick={() => {
                  setError(null);
                  form.setFieldsValue({ email: a.email, password: DEMO_PASSWORD });
                }}
              >
                {a.role}
              </button>
            ))}
          </div>
          <p className="auth-demo-note">
            Fills in the form. Every demo account uses the password <code>{DEMO_PASSWORD}</code>.
          </p>
        </>
      )}
    </AuthCard>
  );
}
