'use client';

import React from 'react';
import { Breadcrumb, Space, Typography } from 'antd';
import Link from 'next/link';

export interface Crumb {
  title: React.ReactNode;
  href?: string;
}

export function PageHeader({
  title,
  subtitle,
  extra,
  crumbs,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  crumbs?: Crumb[];
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: 6 }}
          items={crumbs.map((c) => ({ title: c.href ? <Link href={c.href}>{c.title}</Link> : c.title }))}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
        {extra && <Space wrap>{extra}</Space>}
      </div>
    </div>
  );
}
