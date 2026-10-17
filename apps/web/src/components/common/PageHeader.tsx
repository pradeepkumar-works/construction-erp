'use client';

import React from 'react';
import { Breadcrumb, Space, Typography, theme } from 'antd';
import Link from 'next/link';
import { textOf, usePageTitle } from '@/lib/page-title';
import { usePageTrailTail } from '@/components/shell/page-trail';

export interface Crumb {
  title: React.ReactNode;
  href?: string;
}

/**
 * A page's heading: its one `<h1>` (sized as before), the browser tab's title, the page's actions, and its breadcrumb where
 * the header does not already show one (UX item 81).
 */
export function PageHeader({
  title,
  docTitle,
  subtitle,
  extra,
  crumbs,
}: {
  title: React.ReactNode;
  /** The tab title when `title` is not plain text (a name with tags beside it). */
  docTitle?: string;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  crumbs?: Crumb[];
}) {
  const { token } = theme.useToken();
  usePageTitle(docTitle ?? textOf(title));
  const last = crumbs?.[crumbs.length - 1];
  const inHeader = usePageTrailTail(last ? textOf(last.title) : null, !!crumbs?.length);
  return (
    <div style={{ marginBottom: 20 }}>
      {crumbs && crumbs.length > 0 && !inHeader && (
        <Breadcrumb
          style={{ marginBottom: 6 }}
          items={crumbs.map((c) => ({ title: c.href ? <Link href={c.href}>{c.title}</Link> : c.title }))}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={1} id="page-title" tabIndex={-1} style={{ margin: 0, fontSize: token.fontSizeHeading2, lineHeight: token.lineHeightHeading2 }}>
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
