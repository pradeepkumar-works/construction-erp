'use client';

import React from 'react';
import { Flex, Skeleton } from 'antd';
import { tk } from '@/ds';
import { Help } from '@/components/common/Help';

/**
 * A titled part of something that already has a surface, such as a project tab or a record (no cards inside
 * cards). It has no box of its own: a hairline above, the title with its actions, then the content.
 */
export function Section({
  title,
  help,
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
  /** How the section's figures are counted, behind an ⓘ beside its title rather than a paragraph above its content. */
  help?: React.ReactNode;
  extra?: React.ReactNode;
  loading?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section id={id} className={className} style={{ borderTop: tk.line('hairline'), paddingTop: tk.space[3], ...style }}>
      {title || extra ? (
        <Flex align="center" justify="space-between" gap={tk.space[3]} wrap style={{ minHeight: tk.control.md, marginBottom: tk.space[2] }}>
          {title ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: tk.space[1] }}>
              <span role="heading" aria-level={2} style={{ ...tk.type.title, color: tk.color.text.strong }}>
                {title}
              </span>
              {help && <Help>{help}</Help>}
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

/** One figure among others on a surface: a hairline above it instead of a card around it. */
export function FigureBlock({ loading, children }: { loading?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', borderTop: tk.line('hairline'), paddingTop: tk.space[3] }}>
      {loading ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : children}
    </div>
  );
}

/** Sections one under another on a surface whose body has no padding of its own (a project tab): its inset and the gap. */
export function SectionStack({ children, gap }: { children: React.ReactNode; gap?: number | string }) {
  return (
    <Flex vertical gap={gap ?? tk.space[4]} style={{ padding: `0 ${tk.space[3]} ${tk.space[3]}` }}>
      {children}
    </Flex>
  );
}
