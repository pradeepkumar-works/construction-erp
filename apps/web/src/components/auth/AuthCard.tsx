'use client';

import React from 'react';
import { Card, Space, Typography } from 'antd';
import { BRAND } from '@/lib/brand';
import { BrandMark } from '@/components/shell/BrandMark';

/** The centred card used by the sign-in, sign-up and password pages. */
export function AuthCard({ subtitle, children, width = 420 }: { subtitle: React.ReactNode; children: React.ReactNode; width?: number }) {
  return (
    <div className="login-bg">
      <Card style={{ width, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <Space orientation="vertical" size={4} style={{ width: '100%', marginBottom: 20 }}>
          <Space align="center">
            <BrandMark />
            <Typography.Title level={4} style={{ margin: 0 }}>
              {BRAND.name}
            </Typography.Title>
          </Space>
          <Typography.Text type="secondary">{subtitle}</Typography.Text>
        </Space>
        {children}
      </Card>
    </div>
  );
}
