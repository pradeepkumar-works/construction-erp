'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Form, Input, Typography, Space, Tag } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useAuthOptions } from '@/lib/queries';

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
    <div className="login-bg">
      <Card style={{ width: 420, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <Space orientation="vertical" size={4} style={{ width: '100%', marginBottom: 20 }}>
          <Space align="center">
            <span className="brand-mark">CE</span>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Construction ERP
            </Typography.Title>
          </Space>
          <Typography.Text type="secondary">Sign in to manage projects, site progress and approvals.</Typography.Text>
        </Space>

        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ email: 'pm@demo.com', password: 'password123' }} requiredMark={false}>
          <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Email is required' }, { type: 'email', message: 'Enter a valid email' }]}>
            <Input prefix={<MailOutlined />} placeholder="you@company.com" autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Password is required' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            Sign in
          </Button>
        </Form>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/forgot-password">Forgot password?</Link>
          {options?.signup ? <Link href="/signup">New company? Create an account</Link> : null}
        </div>

        <div style={{ marginTop: 20, background: '#f6f8fb', borderRadius: 8, padding: 12 }}>
          <Typography.Text strong style={{ fontSize: 12 }}>
            Demo accounts (password: <code>password123</code>)
          </Typography.Text>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEMO_ACCOUNTS.map((a) => (
              <div key={a.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Typography.Link onClick={() => form.setFieldsValue({ email: a.email, password: 'password123' })} style={{ fontSize: 12 }}>
                  {a.email}
                </Typography.Link>
                <Tag style={{ margin: 0, fontSize: 11 }}>{a.role}</Tag>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
