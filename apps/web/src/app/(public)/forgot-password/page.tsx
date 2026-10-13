'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Form, Input, Result } from 'antd';
import { MailOutlined } from '@ant-design/icons';
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
    <AuthCard subtitle="Reset your password">
      {sentTo ? (
        <Result
          status="success"
          title="Check your email"
          subTitle={`If ${sentTo} has an account, a link to choose a new password is on its way. It works once and expires in 2 hours.`}
          extra={<Link href="/login">Back to sign in</Link>}
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
            <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Email is required' }, { type: 'email', message: 'Enter a valid email' }]}>
              <Input prefix={<MailOutlined />} autoComplete="username" size="large" placeholder="you@company.com" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
              Email me a reset link
            </Button>
          </Form>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href="/login">Back to sign in</Link>
          </div>
        </>
      )}
    </AuthCard>
  );
}
