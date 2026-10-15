'use client';

import React from 'react';
import { Card, Space, Typography } from 'antd';
import { BRAND } from '@/lib/brand';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';

/** The centred card used by the sign-in, sign-up and password pages. */
export function AuthCard({ subtitle, children, width = 420 }: { subtitle: React.ReactNode; children: React.ReactNode; width?: number }) {
  return (
    <div className="login-bg">
      <Card style={{ width, maxWidth: '100%', boxShadow: '0 18px 50px rgba(6,19,40,0.45)', zIndex: 1 }}>
        <Space orientation="vertical" size={4} style={{ width: '100%', marginBottom: 20 }}>
          <Space align="center">
            <BrandMark size={40} />
            <Wordmark color={BRAND.colors.ink} size={26} />
          </Space>
          <Typography.Text type="secondary">{subtitle}</Typography.Text>
        </Space>
        {children}
      </Card>
    </div>
  );
}
