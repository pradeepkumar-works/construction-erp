'use client';

import React from 'react';
import { Breadcrumb, Space, Typography } from 'antd';
import Link from 'next/link';
import { textOf, usePageTitle } from '@/lib/page-title';
import { tk } from '@/ds';
import { Help } from '@/components/common/Help';
import { usePageTrailTail } from '@/components/shell/page-trail';

export interface Crumb {
  title: React.ReactNode;
  href?: string;
}

/**
 * A page's heading: its one `<h1>` (24 px Semibold, `.page-title` in globals.css),
 * the browser tab's title, the page's actions, and its breadcrumb where the header does not already show one.
 */
export function PageHeader({
  title,
  docTitle,
  subtitle,
  help,
  extra,
  crumbs,
}: {
  title: React.ReactNode;
  /** The tab title when `title` is not plain text (a name with tags beside it). */
  docTitle?: string;
  /** A fact the title needs to be read right (a record's project, a standard's name), never a sentence about the page. */
  subtitle?: React.ReactNode;
  /** What the page is for and how its figures are counted: behind an ⓘ beside the title, off the screen until asked. */
  help?: React.ReactNode;
  extra?: React.ReactNode;
  crumbs?: Crumb[];
}) {
  usePageTitle(docTitle ?? textOf(title));
  const last = crumbs?.[crumbs.length - 1];
  const inHeader = usePageTrailTail(last ? textOf(last.title) : null, !!crumbs?.length);
  return (
    <div style={{ marginBottom: tk.space[6] }}>
      {crumbs && crumbs.length > 0 && !inHeader && (
        <Breadcrumb
          style={{ marginBottom: tk.space[2] }}
          items={crumbs.map((c) => ({ title: c.href ? <Link href={c.href}>{c.title}</Link> : c.title }))}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: tk.space[4], flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: tk.space[1] }}>
            <Typography.Title level={1} id="page-title" className="page-title" tabIndex={-1} style={{ margin: 0 }}>
              {title}
            </Typography.Title>
            {help && <Help label="About this page">{help}</Help>}
          </div>
          {subtitle && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: tk.space[1], maxWidth: '72ch' }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
        {extra && <Space wrap>{extra}</Space>}
      </div>
    </div>
  );
}
