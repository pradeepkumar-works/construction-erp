'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Form, Input, Result } from 'antd';
import { api, errorMessage } from '@/lib/api';
import { useAuthOptions } from '@/lib/queries';
import { AuthCard } from '@/components/auth/AuthCard';

export default function ForgotPasswordPage() {
  const { data: options } = useAuthOptions();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async ({ email }: { email: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSentTo(email.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Reset your password" subtitle="Enter the email you sign in with and we will send you a link to choose a new password.">
      {sentTo ? (
        <Result
          status="success"
          title="Check your email"
          subTitle={`If ${sentTo} has an account, a link to choose a new password is on its way. It works once and expires in 2 hours.`}
          extra={<Link href="/login" className="text-link">Back to sign in</Link>}
        />
      ) : (
        <>
          {options && !options.resetByEmail ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              title="Password emails are not set up on this server."
              description="Ask your admin: they can send you a new password link from the Users page."
            />
          ) : null}
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Enter your email' }, { type: 'email', message: 'Enter an email address, e.g. name@company.com' }]}>
              <Input autoComplete="username" size="large" placeholder="you@company.com" autoFocus />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
              Email me a reset link
            </Button>
          </Form>
          <p className="auth-alt">
            <Link href="/login" className="auth-link">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
