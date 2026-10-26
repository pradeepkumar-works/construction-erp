'use client';

import React from 'react';
import { Flex, Skeleton, theme } from 'antd';

/**
 * A titled part of something that already has a surface, such as a project tab or a record (UX item 82: no cards inside
 * cards). It has no box of its own: a hairline above, the title with its actions, then the content.
 */
export function Section({
  title,
  extra,
  loading,
  children,
  style,
  className,
  id,
}: {
  className?: string;
  /** An anchor, for links to the section (`#team`) */
  id?: string;
  title?: React.ReactNode;
  extra?: React.ReactNode;
  loading?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const { token } = theme.useToken();
  return (
    <section id={id} className={className} style={{ borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, paddingTop: token.paddingSM, ...style }}>
      {title || extra ? (
        <Flex align="center" justify="space-between" gap={token.marginSM} wrap style={{ minHeight: token.controlHeight, marginBottom: token.marginXS }}>
          {title ? (
            <span role="heading" aria-level={2} style={{ fontSize: token.fontSizeLG, fontWeight: token.fontWeightStrong, color: token.colorTextHeading }}>
              {title}
            </span>
          ) : (
            <span />
          )}
          {extra}
        </Flex>
      ) : null}
      {loading ? <Skeleton active title={false} paragraph={{ rows: 3 }} /> : children}
    </section>
  );
}

/** One figure among others on a surface: a hairline above it instead of a card around it (UX item 82). */
export function FigureBlock({ loading, children }: { loading?: boolean; children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <div style={{ height: '100%', borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, paddingTop: token.paddingSM }}>
      {loading ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : children}
    </div>
  );
}

/** Sections one under another on a surface whose body has no padding of its own (a project tab): its inset and the gap. */
export function SectionStack({ children, gap }: { children: React.ReactNode; gap?: number }) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={gap ?? token.margin} style={{ padding: `0 ${token.paddingSM}px ${token.paddingSM}px` }}>
      {children}
    </Flex>
  );
}
